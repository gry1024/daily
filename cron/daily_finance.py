"""
Finance Daily
- 抓 5 个关键行情（XAUUSD / BTCUSD / USDCNH / 上证 / 纳指）
- 抓财经要闻 RSS
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
from backend.config import TTL_FINANCE_NEWS
from backend.search import fetch_rss, http_get, clean_html_to_text
from backend.llm import chat_json
from backend.runtime import run_with_logging


FINANCE_RSS = [
    "https://www.cls.cn/nodeapi/updateTelegraphList",  # 财联社
    "https://wallstreetcn.com/api/articles?limit=20",   # 华尔街见闻 API
]

# 腾讯行情符号（qt.gtimg.cn 可用，无 key 无频率限制）
QUOTES = [
    ("hf_XAU", "XAUUSD"),       # 黄金期货
    ("hf_BTCUSD", "BTCUSD"),    # 比特币
    ("USDCNH", "USDCNH"),       # 美元人民币
    ("sh000001", "上证"),         # 上证指数
    ("usNASDAQ.IXIC", "纳指"),    # 纳斯达克
]


def fetch_tencent_quote(symbol: str):
    """
    拉腾讯行情。返回 {"price": float, "change_pct": float} 或 None
    """
    url = f"https://qt.gtimg.cn/q={symbol}"
    txt = http_get(url, timeout=10)
    if not txt:
        return None
    # 格式：v_SYMBOL="key=value,key=value,..."；
    m = re.search(r'"([^"]+)"', txt)
    if not m:
        return None
    parts = m.group(1).split("~")
    if len(parts) < 4:
        return None

    # 不同类型字段位置不同：
    # 期货 (hf_*)：parts[0]=current, parts[1]=change_abs, parts[3]=prev_close
    # A 股指数 (sh/sz)：parts[3]=current, parts[4]=prev_close 或 open
    # 美股指数 (us*)：parts[1]=name, parts[2]=code, parts[3]=current

    if symbol.startswith("hf_"):
        try:
            price = float(parts[0])
            prev_close = float(parts[3]) if parts[3] else None
            if prev_close and prev_close > 0:
                change_pct = (price - prev_close) / prev_close * 100
            else:
                # 用 change_abs / current 反推（粗略）
                change_abs = float(parts[1]) if parts[1] else 0
                change_pct = (change_abs / price * 100) if price else 0
            return {"price": price, "change_pct": change_pct}
        except (ValueError, IndexError):
            return None

    # 指数（A 股 / 美股）
    try:
        price = float(parts[3])
        prev_close = float(parts[4]) if len(parts) > 4 and parts[4] else None
        if not prev_close or prev_close <= 0:
            return None
        change_pct = (price - prev_close) / prev_close * 100
        return {"price": price, "change_pct": change_pct}
    except (ValueError, IndexError):
        return None


def main(log):
    today = today_str()
    expire = in_days(TTL_FINANCE_NEWS)

    # 1. 行情
    log.info(f"拉取 {len(QUOTES)} 个行情")
    quotes_inserted = 0
    with get_conn() as conn:
        for symbol, label in QUOTES:
            data = fetch_tencent_quote(symbol)
            if data:
                conn.execute(
                    "INSERT OR REPLACE INTO finance_quotes (symbol, date, price, change_pct) VALUES (?, ?, ?, ?)",
                    (label, today, data["price"], data["change_pct"]),
                )
                quotes_inserted += 1
                log.info(f"  {label}: {data['price']:.2f} ({data['change_pct']:+.2f}%)")
            else:
                log.warning(f"  {label} 拉取失败")
            time.sleep(0.5)

    # 2. 财经要闻（暂时仅用 web search；RSS 财联社 API 经常变）
    from backend.search import ddg_search
    queries = [
        ("今日 财经 要闻", "zh"),
        ("gold XAU news today", "en"),
        ("bitcoin BTC news today", "en"),
    ]
    candidates = []
    for q, lang in queries:
        try:
            results = ddg_search(q, max_results=8)
            for r in results:
                r["source"] = f"ddg_{lang}"
                candidates.append(r)
            log.info(f"  ddg '{q}': {len(results)} 条")
        except Exception as e:
            log.warning(f"  ddg '{q}' 失败: {e}")
        time.sleep(1)

    # 去重
    from backend.search import url_fingerprint
    seen = set()
    fresh = []
    for it in candidates:
        fp = url_fingerprint(it.get("url", ""))
        if fp and fp not in seen:
            seen.add(fp)
            fresh.append(it)
    log.info(f"共 {len(fresh)} 财经候选")

    # 查重
    with get_conn() as conn:
        existing = {r["url"] for r in conn.execute(
            "SELECT url FROM finance_news WHERE created_at >= date('now','localtime','-30 day')"
        ).fetchall()}
    fresh = [it for it in fresh if it.get("url", "") not in existing][:15]
    log.info(f"过滤后: {len(fresh)} 条全新")

    # LLM 摘要
    if fresh:
        blob = "\n\n".join([
            f"[{i+1}] {it['title']}\n{it.get('snippet','')[:300]}\nURL: {it.get('url','')}"
            for i, it in enumerate(fresh)
        ])
        sys_prompt = "你是财经新闻编辑。严格按 JSON schema 输出。"
        user_prompt = (
            "从下列财经新闻中筛出与【金价 / 比特币 / 汇率 / A 股大盘 / 纳指 / 重大宏观政策】相关的重要条目。"
            "每条用中文给标题、100 字摘要、影响方向（gold/btc/fx/equity）。\n\n"
            f"列表：\n{blob}\n\n"
            "输出 JSON：{\"news\":[{\"idx\":1,\"keep\":true,\"title_zh\":\"...\",\"summary_zh\":\"...\","
            "\"affects\":\"gold|btc|fx|equity|null\",\"importance\":1-3}]}"
        )
        result = chat_json(sys_prompt, user_prompt, temperature=0.3)
        summarized = [n for n in (result or {}).get("news", []) if n.get("keep")] if result else []
        log.info(f"LLM 摘要保留: {len(summarized)}")

        with get_conn() as conn:
            for n in summarized:
                idx = n.get("idx", 0) - 1
                if not (0 <= idx < len(fresh)):
                    continue
                src = fresh[idx]
                try:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO finance_news
                          (publish_date, source, url, title_zh, summary_zh,
                           affects, importance, expires_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            today,
                            src.get("source", ""),
                            src.get("url", "")[:500],
                            n.get("title_zh", "")[:300],
                            n.get("summary_zh", "")[:1000],
                            n.get("affects", ""),
                            n.get("importance", 1),
                            expire,
                        ),
                    )
                except Exception as e:
                    log.warning(f"insert finance news 失败: {e}")

    log.info(f"完成: quotes={quotes_inserted}")
    return {"fetched": len(fresh), "inserted": len(fresh), "skipped": 0}


if __name__ == "__main__":
    run_with_logging("finance", main)
