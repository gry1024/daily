"""
羊毛 Deals 抓取
- 6 类 DuckDuckGo 搜索
- LLM 抽取活动信息（标题、过期、领取链接、条件）
"""
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str, in_days
from backend.config import DEALS_DEFAULT_EXPIRE_DAYS
from backend.search import ddg_search, url_fingerprint
from backend.llm import chat_json
from backend.runtime import run_with_logging


DEAL_QUERIES = [
    ("阿里云 腾讯云 华为云 学生 优惠 2026 免费", "cloud"),
    ("ChatGPT Claude Gemini DeepSeek 学生 免费 2026", "ai_api"),
    ("GitHub Copilot JetBrains 学生 免费 2026", "devtool"),
    ("Coursera edX 极客时间 免费 课程 2026", "edu"),
    ("免费 域名 SSL 2026 学生", "hosting"),
    ("互联网 福利 限时 2026 羊毛", "misc"),
]


def main(log):
    today = today_str()
    default_expire = in_days(DEALS_DEFAULT_EXPIRE_DAYS)

    candidates = []
    for q, cat in DEAL_QUERIES:
        try:
            results = ddg_search(q, max_results=10)
            for r in results:
                if not r.get("url"):
                    continue
                r["category"] = cat
                candidates.append(r)
            log.info(f"  [{cat}] ddg '{q[:40]}': {len(results)} 条")
        except Exception as e:
            log.warning(f"  [{cat}] ddg 失败: {e}")
        time.sleep(2)

    # 去重
    seen = set()
    fresh = []
    for c in candidates:
        fp = url_fingerprint(c["url"])
        if fp and fp not in seen:
            seen.add(fp)
            fresh.append(c)
    log.info(f"共 {len(fresh)} 候选")

    # 查重
    with get_conn() as conn:
        existing = {r["url"] for r in conn.execute(
            "SELECT url FROM deals WHERE created_at >= date('now','localtime','-60 day')"
        ).fetchall()}
    fresh = [c for c in fresh if c["url"] not in existing]
    log.info(f"过滤后: {len(fresh)} 全新")

    if not fresh:
        return {"fetched": 0, "inserted": 0, "skipped": len(existing)}

    # 限 20 条
    fresh = fresh[:20]

    # LLM 评估
    blob = "\n\n".join([
        f"[{i+1}] ({c['category']}) {c['title']}\nURL: {c['url']}\n摘要: {c.get('snippet','')[:200]}"
        for i, c in enumerate(fresh)
    ])
    sys_prompt = "你是羊毛信息筛选助手。严格按 JSON schema 输出。"
    user_prompt = (
        "从下列搜索结果中尽可能多地筛出【真实有效、有领取链接（URL）、面向学生/个人开发者/研究者的优惠/免费资源/限时活动】。\n"
        "剔除：纯广告 / 软文 / 资讯文章首页 / 与个人无关的企业级合作。\n\n"
        f"列表：\n{blob}\n\n"
        "只要 URL 是真实的活动页/产品页就 keep=true。\n"
        "输出 JSON（无 markdown）：{\"deals\":[{\"idx\":1,\"keep\":true,"
        "\"title\":\"精炼中文标题\",\"category\":\"cloud/ai_api/devtool/edu/hosting/misc\","
        "\"requirements\":\"领取条件（如 学生认证 / 新用户 / 注册 等，没有写'无特殊要求'）\","
        "\"note\":\"补充说明（≤60字）\","
        "\"expire_days\":剩余天数（数字，没有就"+str(DEALS_DEFAULT_EXPIRE_DAYS)+"）}]}"
    )
    result = chat_json(sys_prompt, user_prompt, temperature=0.3)
    summarized = [d for d in (result or {}).get("deals", []) if d.get("keep")] if result else []
    log.info(f"LLM 评估保留: {len(summarized)}")

    # 入库
    with get_conn() as conn:
        for d in summarized:
            idx = d.get("idx", 0) - 1
            if not (0 <= idx < len(fresh)):
                continue
            src = fresh[idx]
            try:
                expire_days = d.get("expire_days", DEALS_DEFAULT_EXPIRE_DAYS)
                if not isinstance(expire_days, int) or expire_days < 1:
                    expire_days = DEALS_DEFAULT_EXPIRE_DAYS
                expire_date = in_days(expire_days)
                conn.execute(
                    """
                    INSERT OR IGNORE INTO deals
                      (publish_date, expire_date, category, title, source, url,
                       requirements, note, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                    """,
                    (
                        today,
                        expire_date,
                        d.get("category", src.get("category", "misc")),
                        d.get("title", src["title"])[:300],
                        f"ddg:{src.get('category','')}",
                        src["url"][:500],
                        d.get("requirements", "")[:300],
                        d.get("note", "")[:300],
                    ),
                )
            except Exception as e:
                log.warning(f"insert deal 失败: {e}")

    log.info(f"完成")
    return {"fetched": len(fresh), "inserted": len(summarized), "skipped": len(existing)}


if __name__ == "__main__":
    run_with_logging("deals", main)
