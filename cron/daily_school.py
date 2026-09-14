"""
School Info（PKU）抓取 — 严格只收"具体活动"
策略：
1. 直接抓 PKU 校内公告页（HTML scrape）拿到站内链接列表
2. 用关键词预筛（必须含日期 + 活动关键词）
3. LLM 二次结构化
"""
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str, in_days
from backend.config import TTL_SCHOOL
from backend.search import http_get, ddg_search, fetch_rss, url_fingerprint
from backend.llm import chat_json
from backend.runtime import run_with_logging


# 直接抓的 PKU 校内页面（站内列表页）
PKU_PAGES = [
    ("https://www.pku.edu.cn/", "pku_main", "notice"),
    ("https://www.ai.pku.edu.cn/", "pku_ai", "lecture"),
    ("https://hub.baai.ac.cn/", "baai", "lecture"),
    ("https://eecs.pku.edu.cn/index/xwdt.htm", "pku_eecs", "notice"),
]

# 特定关键词搜索（不走 site: 操作符，而是用真实短语）
DDG_QUERIES = [
    ("北京大学 2026 讲座 论坛 学术报告", "lecture"),
    ("北京大学 2026 推免 保研 通知", "admission"),
    ("北京大学 奖学金 2026 申报", "scholarship"),
    ("北京大学 交换 留学 2026", "exchange"),
    ("清华大学 2026 讲座", "lecture"),
    ("北大 量化 竞赛 hackathon 2026", "contest"),
    ("九坤 幻方 北大 清华 2026", "lecture"),
    ("Optiver Jane Street 北京 招聘 2026", "lecture"),
]

# 必须有的活动关键词（与日期组合）
EVENT_KEYWORDS = [
    "讲座", "报告", "论坛", "峰会", "宣讲", "招聘", "比赛", "竞赛", "沙龙", "工作坊",
    "研讨会", "seminar", "conference", "symposium", "hackathon",
    "招生", "推免", "保研", "面试", "笔试", "奖学金", "颁奖",
    "开幕", "闭幕", "训练营", "夏令营", "冬令营",
]

# 排除的"通用通知"特征
BLACKLIST = [
    "招生简章", "培养方案", "学位", "教务", "选课", "成绩", "考试安排",
    "报到", "注册", "学费", "教材", "住宿", "图书馆", "成绩单",
]


def scrape_pku_page(url, source_label, default_type):
    """从 PKU 页面提取所有站内链接 + 标题"""
    from bs4 import BeautifulSoup
    html = http_get(url, timeout=20)
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    base_host = urlparse(url).netloc
    items = []
    for a in soup.find_all("a", href=True):
        href = a.get("href", "").strip()
        title = a.get_text(strip=True)
        if not title or len(title) < 6 or len(title) > 120:
            continue
        # 转绝对
        if href.startswith("/"):
            href = f"https://{base_host}{href}"
        elif not href.startswith("http"):
            continue
        # 站内
        if urlparse(href).netloc != base_host:
            continue
        # 过滤非信息页
        if any(p in href for p in ("javascript:", "#", "login", "mailto:")):
            continue
        items.append({"title": title, "url": href, "source": source_label, "default_type": default_type})
    # 去重
    seen = set()
    fresh = []
    for it in items:
        fp = url_fingerprint(it["url"])
        if fp not in seen:
            seen.add(fp)
            fresh.append(it)
    return fresh[:30]


def is_specific_event(item):
    """判断是不是"具体事件"而非"通用通知" — 用更宽容的判定"""
    title = item.get("title", "")
    snippet = item.get("snippet", "")
    text = f"{title} {snippet}"

    # 排除黑名单（短标题 + 黑名单词 = 通用通知）
    for w in BLACKLIST:
        if w in title and len(title) < 30:
            return False

    # 必须有日期 OR 事件关键词
    has_date = bool(re.search(
        r"(20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}|\d{1,2}月\d{1,2}[日号]|\d{1,2}/\d{1,2}|"
        r"今天|明天|后天|今晚|明晚|本周|下周|本月|下月|"
        r"截止|报名|申请|报名截止)",
        text
    ))
    has_event_kw = any(kw in text.lower() for kw in EVENT_KEYWORDS)

    # 站内页：含日期或事件关键词就保留
    if item.get("source", "").startswith(("pku_", "baai")):
        return has_date or has_event_kw

    # DDG 来源：必须两者都有
    return has_date and has_event_kw


def main(log):
    today = today_str()
    expire = in_days(TTL_SCHOOL)

    candidates = []

    # 1. 直接抓 PKU 校内列表页
    for url, source, default_type in PKU_PAGES:
        try:
            items = scrape_pku_page(url, source, default_type)
            for it in items:
                it["snippet"] = it["title"]  # 没有 snippet，用 title 填充
            log.info(f"  PKU {url}: {len(items)} 条")
            candidates.extend(items)
        except Exception as e:
            log.warning(f"  PKU {url} 失败: {e}")
        time.sleep(1)

    # 2. DDG 兜底搜索
    for query, default_type in DDG_QUERIES:
        try:
            results = ddg_search(query, max_results=10)
            for r in results:
                if not r.get("url"):
                    continue
                r["source"] = f"ddg:{default_type}"
                r["default_type"] = default_type
                candidates.append(r)
            log.info(f"  ddg '{query[:30]}': {len(results)} 条")
        except Exception as e:
            log.warning(f"  ddg '{query[:30]}' 失败: {e}")
        time.sleep(2)

    log.info(f"候选 {len(candidates)} 条")

    # 去重
    seen = set()
    fresh = []
    for c in candidates:
        fp = url_fingerprint(c["url"])
        if fp and fp not in seen:
            seen.add(fp)
            fresh.append(c)
    log.info(f"去重 {len(fresh)} 条")

    # 查重（30 天）
    with get_conn() as conn:
        existing = {r["url"] for r in conn.execute(
            "SELECT url FROM school_events WHERE created_at >= date('now','localtime','-30 day')"
        ).fetchall()}
    fresh = [c for c in fresh if c["url"] not in existing]
    log.info(f"全新 {len(fresh)} 条")

    if not fresh:
        return {"fetched": 0, "inserted": 0, "skipped": len(existing)}

    # 预筛
    pre_filtered = [c for c in fresh if is_specific_event(c)]
    log.info(f"预筛（具体事件）: {len(pre_filtered)}/{len(fresh)}")

    if not pre_filtered:
        return {"fetched": 0, "inserted": 0, "skipped": len(existing)}

    pre_filtered = pre_filtered[:20]

    # LLM 结构化
    blob = "\n\n".join([
        f"[{i+1}] {c['title']}\nURL: {c['url']}\n摘要: {c.get('snippet','')[:200]}"
        for i, c in enumerate(pre_filtered)
    ])
    sys_prompt = "你是北大 / 清华校园信息提取助手。严格按 JSON schema 输出。"
    user_prompt = (
        "从下列北大 / 清华 / 信科 / AIIC / 量化相关条目中提取信息。\n"
        "对每条判断 keep 与否：\n"
        "- keep=true：与本硕博学生相关（讲座/比赛/招生/推免/奖学金/交换/招聘宣讲）\n"
        "- keep=false：无关行政（学费、培养方案、教材、住宿）或已过期（<2026-09）\n\n"
        f"列表：\n{blob}\n\n"
        "严格输出 JSON（无 markdown）：{\"events\":[\n"
        "{\"idx\":1,\"keep\":true,\"title\":\"精炼中文标题（≤30字）\",\n"
        "\"summary\":\"20-80字中文摘要\",\n"
        "\"event_date\":\"YYYY-MM-DD（讲座/比赛必填；推免/奖学金截止日期填此处；纯通知可留空字符串）\",\n"
        "\"location\":\"线下地点 / 线上 / 未知\",\n"
        "\"event_type\":\"lecture/contest/admission/scholarship/exchange/notice\",\n"
        "\"relevance\":0-3}]}"
    )
    result = chat_json(sys_prompt, user_prompt, temperature=0.2)
    summarized = [e for e in (result or {}).get("events", []) if e.get("keep")] if result else []
    log.info(f"LLM 二次确认: {len(summarized)}")

    # 入库
    inserted = 0
    with get_conn() as conn:
        for ev in summarized:
            idx = ev.get("idx", 0) - 1
            if not (0 <= idx < len(pre_filtered)):
                continue
            src = pre_filtered[idx]
            ed = ev.get("event_date") or None  # null 表示没有日期
            try:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO school_events
                      (publish_date, event_date, title, summary, url, source,
                       event_type, location, relevance, expire_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        today,
                        ed,
                        ev.get("title", src["title"])[:300],
                        ev.get("summary", "")[:500],
                        src["url"][:500],
                        src.get("source", "")[:50],
                        ev.get("event_type", src.get("default_type", "notice")),
                        (ev.get("location") or "未知")[:200],
                        ev.get("relevance", 1),
                        expire,
                    ),
                )
                inserted += 1
            except Exception as e:
                log.warning(f"insert 失败: {e}")

    log.info(f"插入 {inserted} 条")
    return {"fetched": len(pre_filtered), "inserted": inserted, "skipped": len(existing)}


if __name__ == "__main__":
    run_with_logging("school", main)
