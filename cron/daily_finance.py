"""
Finance cron：抓实时行情（每小时写入历史）+ 抓财经要闻
run_all.sh 在凌晨 5:00 调用一次
也可单独跑：python3 cron/daily_finance.py
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.api.finance import fetch_all_quotes
from backend.db import get_conn, today_str, in_days
from backend.config import TTL_FINANCE_NEWS
from backend.search import ddg_search
from backend.llm import chat_json
from backend.runtime import run_with_logging, setup_logging


# 多类别搜索，避免单一 BTC 倾向
DDG_QUERIES = [
    ("今日 A股 行情 收盘", "zh", "equity"),
    ("上证指数 沪深300 最新", "zh", "equity"),
    ("黄金 金价 今日 国际", "zh", "gold"),
    ("比特币 BTC 价格 最新", "zh", "btc"),
    ("美元 人民币 汇率 走势", "zh", "fx"),
    ("纳指 道琼斯 标普 今日", "zh", "us-equity"),
    ("S&P 500 NASDAQ today", "en", "us-equity"),
    ("gold price XAU market", "en", "gold"),
    ("bitcoin market news today", "en", "btc"),
]


def fetch_quotes(log):
    today = today_str()
    log.info(f"抓取 {today} 行情")
    items = fetch_all_quotes()
    inserted = 0
    failed = []
    with get_conn() as conn:
        for it in items:
            if it.get("price") is None:
                failed.append(it["symbol"])
                continue
            conn.execute(
                "INSERT OR REPLACE INTO finance_quotes (symbol, date, price, change_pct) VALUES (?, ?, ?, ?)",
                (it["symbol"], today, it["price"], it.get("change_pct", 0)),
            )
            inserted += 1
    log.info(f"行情：插入 {inserted} 条；失败 {failed}")
    return inserted


def fetch_news(log):
    today = today_str()
    expire = in_days(TTL_FINANCE_NEWS)
    log.info(f"抓取财经要闻（{len(DDG_QUERIES)} 个查询）")
    candidates = []
    for q, lang, affects in DDG_QUERIES:
        try:
            results = ddg_search(q, max_results=8)
            for r in results:
                if not r.get("url"): continue
                r["source"] = f"ddg:{lang}"
                r["affects"] = affects
                candidates.append(r)
            log.info(f"  ddg '{q[:30]}': {len(results)}")
        except Exception as e:
            log.warning(f"  ddg '{q[:30]}' 失败: {e}")
        time.sleep(1)

    # 去重 + 查重
    seen = set()
    fresh = []
    for c in candidates:
        fp = c.get("url", "").split("?")[0].rstrip("/")
        if fp and fp not in seen:
            seen.add(fp)
            fresh.append(c)
    with get_conn() as conn:
        existing = {r["url"] for r in conn.execute(
            "SELECT url FROM finance_news WHERE created_at >= date('now','localtime','-30 day')"
        ).fetchall()}
    fresh = [c for c in fresh if c.get("url", "") not in existing][:30]
    log.info(f"全新 {len(fresh)} 条")

    if not fresh:
        return 0

    # LLM 摘要
    blob = "\n\n".join([
        f"[{i+1}] {c['title']}\nURL: {c['url']}\n摘要: {c.get('snippet','')[:200]}\n分类: {c.get('affects')}"
        for i, c in enumerate(fresh)
    ])
    sys_prompt = "你是财经新闻编辑。严格按 JSON schema 输出。"
    user_prompt = (
        "从下列条目中筛出真正有新闻价值的财经资讯（剔除广告/榜单/百科/营销）。\n\n"
        f"列表：\n{blob}\n\n"
        "严格输出 JSON：{\"news\":[{\"idx\":1,\"keep\":true,\"title_zh\":\"中文标题\","
        "\"summary_zh\":\"50-80字中文摘要\",\"affects\":\"gold/btc/fx/equity/null\","
        "\"importance\":1-3}]}"
    )
    result = chat_json(sys_prompt, user_prompt, temperature=0.3)
    summarized = [n for n in (result or {}).get("news", []) if n.get("keep")] if result else []
    log.info(f"LLM 保留 {len(summarized)} 条")

    with get_conn() as conn:
        for n in summarized:
            idx = n.get("idx", 0) - 1
            if not (0 <= idx < len(fresh)):
                continue
            src = fresh[idx]
            try:
                conn.execute(
                    """INSERT OR IGNORE INTO finance_news
                        (publish_date, source, url, title_zh, summary_zh,
                         affects, importance, expires_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        today, src.get("source", "")[:50], src.get("url", "")[:500],
                        n.get("title_zh", "")[:300], n.get("summary_zh", "")[:1000],
                        n.get("affects", "null") or "null",
                        n.get("importance", 1), expire,
                    ),
                )
            except Exception as e:
                log.warning(f"insert finance news 失败: {e}")
    return len(summarized)


def main(log):
    quotes_n = fetch_quotes(log)
    news_n = fetch_news(log)
    return {"quotes": quotes_n, "news": news_n}


if __name__ == "__main__":
    log = setup_logging("finance")
    log.info("=== finance cron start ===")
    r = main(log)
    log.info(f"完成：{r}")
