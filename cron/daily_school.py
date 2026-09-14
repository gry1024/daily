"""
School Info（PKU）抓取
- 直接抓 PKU 几个主要官网 + DuckDuckGo 搜索
- LLM 抽取活动信息
"""
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str, in_days
from backend.config import TTL_SCHOOL, QUANT_KEYWORDS
from backend.search import http_get, ddg_search, url_fingerprint
from backend.llm import chat_json
from backend.runtime import run_with_logging


PKU_PAGES = [
    ("https://www.pku.edu.cn/", "pku_main", "notice"),
    ("https://eecs.pku.edu.cn/", "pku_eecs", "notice"),
    ("https://www.aidb.pku.edu.cn/", "pku_aidb", "notice"),
    ("https://career.pku.edu.cn/", "pku_career", "notice"),
    ("https://www.iss.pku.edu.cn/", "pku_iss", "exchange"),
]

# 搜索关键词（含量化头部公司）
SEARCH_QUERIES = [
    ("北京大学 通知 公告", "notice", 2),
    ("北京大学 信息科学学院 活动 讲座", "lecture", 2),
    ("北京大学 人工智能研究院 AIIC", "lecture", 2),
    ("北京大学 保研 推免 通知", "admission", 2),
    ("PKU 量化 讲座 " + " ".join(QUANT_KEYWORDS[:5]), "lecture", 1),
    ("清华大学 讲座 通知 2026", "lecture", 1),
    ("Optiver Jane Street 北京 招聘 宣讲", "lecture", 1),
]


def extract_links(html: str, base_url: str):
    """从页面提取站内链接 + 标题"""
    from bs4 import BeautifulSoup
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    base = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"
    items = []
    for a in soup.find_all("a", href=True):
        href = a.get("href", "").strip()
        title = a.get_text(strip=True)
        if not title or len(title) < 4 or len(title) > 100:
            continue
        # 转绝对 URL
        if href.startswith("/"):
            href = base + href
        elif not href.startswith("http"):
            continue
        # 仅保留站内或常见的同源
        if urlparse(href).netloc != urlparse(base).netloc:
            continue
        items.append({"title": title, "url": href})
    # 去重
    seen = set()
    fresh = []
    for it in items:
        fp = url_fingerprint(it["url"])
        if fp not in seen:
            seen.add(fp)
            fresh.append(it)
    return fresh[:25]


def main(log):
    today = today_str()
    expire = in_days(TTL_SCHOOL)

    candidates = []

    # 1. 直抓 PKU 页面
    for url, source, default_type in PKU_PAGES:
        try:
            html = http_get(url, timeout=15)
            if html:
                links = extract_links(html, url)
                for l in links:
                    l["source"] = source
                    l["default_type"] = default_type
                    candidates.append(l)
                log.info(f"  {url}: {len(links)} 条")
            else:
                log.warning(f"  {url}: 空响应")
        except Exception as e:
            log.warning(f"  {url} 失败: {e}")
        time.sleep(1)

    # 2. DuckDuckGo 搜索
    for q, evt_type, _ in SEARCH_QUERIES:
        try:
            results = ddg_search(q, max_results=8)
            for r in results:
                if not r.get("url"):
                    continue
                # 优先保留 pku / tsinghua 来源
                r["source"] = f"ddg:{evt_type}"
                r["default_type"] = evt_type
                candidates.append(r)
            log.info(f"  ddg '{q[:30]}': {len(results)} 条")
        except Exception as e:
            log.warning(f"  ddg '{q[:30]}' 失败: {e}")
        time.sleep(2)  # DDG 限速

    log.info(f"PKU + 搜索共 {len(candidates)} 候选")

    # 3. 去重
    seen = set()
    fresh = []
    for c in candidates:
        fp = url_fingerprint(c["url"])
        if fp and fp not in seen:
            seen.add(fp)
            fresh.append(c)

    # 4. 查重（30 天内已入库）
    with get_conn() as conn:
        existing = {r["url"] for r in conn.execute(
            "SELECT url FROM school_events WHERE created_at >= date('now','localtime','-30 day')"
        ).fetchall()}
    fresh = [c for c in fresh if c["url"] not in existing]
    log.info(f"过滤后: {len(fresh)} 条全新")

    if not fresh:
        return {"fetched": 0, "inserted": 0, "skipped": len(existing)}

    # 5. 限 15 条喂 LLM
    fresh = fresh[:15]

    # 6. LLM 评估
    blob = "\n\n".join([
        f"[{i+1}] {c['title']}\nURL: {c['url']}\n来源: {c.get('source','')}\n默认类型: {c.get('default_type','notice')}"
        for i, c in enumerate(fresh)
    ])
    sys_prompt = "你是北大 / 清华校园活动信息提取助手。严格按 JSON schema 输出。"
    user_prompt = (
        "从下列条目中尽可能多地筛出与【北大 PKU / 清华 THU / 信科 / AIIC / 量化 / 人工智能 / 计算机 / 留学交换 / 保研 推免】"
        "相关或相近的活动、通知、讲座、比赛、招生、奖学金、招聘。\n"
        "剔除：完全无关的政治新闻、娱乐八卦、纯广告页。\n\n"
        f"列表：\n{blob}\n\n"
        "宁可多保留，宁可误判也不要漏掉真实条目（即使来源是公众号或活动页）。\n"
        "输出 JSON：{\"events\":[{\"idx\":1,\"keep\":true,\"title\":\"原标题或精炼中文标题\","
        "\"summary\":\"20-80字中文摘要\",\"event_type\":\"notice/lecture/contest/admission/scholarship/exchange\","
        "\"location\":\"线下地点 / 线上 / 未知\",\"relevance\":0-3}]}"
    )
    result = chat_json(sys_prompt, user_prompt, temperature=0.3)
    summarized = [e for e in (result or {}).get("events", []) if e.get("keep")] if result else []
    log.info(f"LLM 评估保留: {len(summarized)}")

    # 7. 入库
    with get_conn() as conn:
        for ev in summarized:
            idx = ev.get("idx", 0) - 1
            if not (0 <= idx < len(fresh)):
                continue
            src = fresh[idx]
            try:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO school_events
                      (publish_date, title, summary, url, source, event_type, location, relevance, expire_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        today,
                        ev.get("title", src["title"])[:300],
                        ev.get("summary", "")[:500],
                        src["url"][:500],
                        src.get("source", ""),
                        ev.get("event_type", src.get("default_type", "notice")),
                        ev.get("location", "")[:200],
                        ev.get("relevance", 1),
                        expire,
                    ),
                )
            except Exception as e:
                log.warning(f"insert school 失败: {e}")

    log.info(f"完成")
    return {"fetched": len(fresh), "inserted": len(summarized), "skipped": len(existing)}


if __name__ == "__main__":
    run_with_logging("school", main)
