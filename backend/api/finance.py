"""Finance Daily API"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote_plus

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import APIRouter, Request, Query
from ..db import get_conn

router = APIRouter()


# —— 多源行情抓取（带 fallback） ——
def _fetch_tencent(symbol: str, timeout: int = 10):
    """Tencent 行情 API（黄金/上证/美股指数）"""
    try:
        r = requests.get(f"https://qt.gtimg.cn/q={symbol}", timeout=timeout, headers={"User-Agent":"Mozilla/5.0"})
        if r.status_code != 200:
            return None
        m = re.search(r'"([^"]+)"', r.text)
        if not m or "none_match" in r.text:
            return None
        raw = m.group(1)
        # 期货用 , 分隔；股票指数用 ~ 分隔
        if "~" in raw:
            parts = raw.split("~")
        else:
            parts = raw.split(",")
        if len(parts) < 4:
            return None
        # 期货 (hf_*)：[0]current [1]change_pct [3]prev_close（用 , 分隔）
        # 指数 (us/sh/sz)：[3]current [32]change_pct（用 ~ 分隔）
        if symbol.startswith("hf_"):
            cur = float(parts[0]) if parts[0] else None
            pct = float(parts[1]) if parts[1] else 0
            return {"price": cur, "change_pct": pct}
        elif symbol.startswith(("sh", "sz", "us")):
            cur = float(parts[3]) if parts[3] else None
            pct = float(parts[32]) if len(parts) > 32 and parts[32] else 0
            return {"price": cur, "change_pct": pct}
        return None
    except (ValueError, IndexError):
        return None


def _fetch_bing_search(query: str, expected_range=(100, 10_000_000), timeout: int = 5):
    """Bing 搜索结果中提取价格（fallback for BTC/USDCNH）"""
    try:
        r = requests.get(
            f"https://www.bing.com/search?q={quote_plus(query)}",
            timeout=timeout,
            headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"},
        )
        if r.status_code != 200:
            return None
        html = r.text

        # 优先找 "1美元=" / "1 BTC = $X" 这种上下文明确的格式
        for ctx_pat in [
            r'1\s*美元\s*[=:≈]\s*(\d+\.?\d*)',
            r'1\s*BTC\s*[=:≈]\s*\$?\s*([\d,]+(?:\.\d+)?)',
            r'(\d+\.\d+)\s*人民币',  # "6.7106 人民币"
        ]:
            for m in re.finditer(ctx_pat, html):
                try:
                    price = float(m.group(1).replace(",", ""))
                    if expected_range[0] < price < expected_range[1]:
                        return {"price": price, "change_pct": 0}
                except (ValueError, IndexError):
                    continue

        # Fallback: 找第一个美元符号后的数字
        for pat in [
            r'data-pf="(\d+(?:,\d{3})*(?:\.\d+)?)"',
            r'\$(\d{1,3}(?:,\d{3})+(?:\.\d+)?)',
            r'\$(\d+\.\d+)',
        ]:
            for m in re.finditer(pat, html):
                try:
                    price = float(m.group(1).replace(",", ""))
                    if expected_range[0] < price < expected_range[1]:
                        return {"price": price, "change_pct": 0}
                except (ValueError, IndexError):
                    continue
        return None
    except Exception:
        return None


def _fetch_coinmarketcap_search(timeout: int = 5):
    """CoinMarketCap 价格页 scrape"""
    try:
        r = requests.get(
            "https://coinmarketcap.com/currencies/bitcoin/",
            timeout=timeout,
            headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64)"},
        )
        if r.status_code != 200:
            return None
        m = re.search(r'data-test="text-cdp-price-display"[^>]*>\$?([\d,]+\.?\d*)', r.text)
        if m:
            price = float(m.group(1).replace(",", ""))
            if 100 < price < 10_000_000:
                return {"price": price, "change_pct": 0}
        return None
    except Exception:
        return None


def _fetch_btc():
    """BTC 价格：BTC 应该 > 1000 USD"""
    for fn in [_fetch_coinmarketcap_search, _fetch_bing_search]:
        try:
            r = fn("bitcoin price USD", expected_range=(1000, 10_000_000))
            if r:
                return r
        except Exception:
            pass
    return None


def _fetch_usdcnh():
    """USD/CNH 汇率：约 7.0-7.5"""
    return _fetch_bing_search("美元 人民币 汇率", expected_range=(6.5, 8.5))


# 行情配置：每条行情对应 fetch 函数 + 备用
QUOTE_FETCHERS = [
    ("XAUUSD", lambda: _fetch_tencent("hf_XAU")),
    ("BTCUSD", _fetch_btc),
    ("USDCNH", _fetch_usdcnh),
    ("上证", lambda: _fetch_tencent("sh000001")),
    ("纳指", lambda: _fetch_tencent("usINX")),
]


def fetch_all_quotes():
    """抓取所有行情，返回 [{symbol, price, change_pct}]"""
    results = []
    for symbol, fetcher in QUOTE_FETCHERS:
        try:
            data = fetcher()
            if data and data.get("price") is not None:
                results.append({
                    "symbol": symbol,
                    "price": data["price"],
                    "change_pct": data.get("change_pct", 0),
                })
            else:
                results.append({"symbol": symbol, "price": None, "change_pct": None})
        except Exception:
            results.append({"symbol": symbol, "price": None, "change_pct": None})
    return results


@router.get("/quotes")
def quotes(request: Request):
    """抓实时行情（不写库，仅展示）"""
    items = fetch_all_quotes()
    return {"items": items, "fetched_at": datetime_now_iso()}


def datetime_now_iso():
    from datetime import datetime
    return datetime.now().isoformat()


@router.get("/quotes/persist")
def quotes_persist(request: Request):
    """抓实时行情并写入 DB（每天 cron 调用）"""
    items = fetch_all_quotes()
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")
    inserted = 0
    with get_conn() as conn:
        for it in items:
            if it.get("price") is None:
                continue
            conn.execute(
                "INSERT OR REPLACE INTO finance_quotes (symbol, date, price, change_pct) VALUES (?, ?, ?, ?)",
                (it["symbol"], today, it["price"], it["change_pct"]),
            )
            inserted += 1
    return {"items": items, "persisted": inserted}


@router.get("/history")
def history(request: Request, days: int = Query(30, le=120)):
    """过去 N 天所有行情（用于 sparkline）"""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT symbol, date, price, change_pct
            FROM finance_quotes
            WHERE date >= date('now','localtime', ?)
            ORDER BY symbol, date
            """,
            (f"-{days} day",),
        ).fetchall()
    by_symbol = {}
    for r in rows:
        by_symbol.setdefault(r["symbol"], []).append({
            "date": r["date"],
            "price": r["price"],
            "change_pct": r["change_pct"],
        })
    return {"by_symbol": by_symbol}


@router.get("/quote/{symbol}")
def quote_detail(symbol: str, request: Request, days: int = Query(30)):
    """单品种详情：实时 + 历史"""
    today = datetime_now_iso()
    # 实时
    real_time = None
    for s, fetcher in QUOTE_FETCHERS:
        if s == symbol:
            try: real_time = fetcher()
            except: real_time = None
            break
    # 历史
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT date, price, change_pct FROM finance_quotes
            WHERE symbol = ? AND date >= date('now','localtime', ?)
            ORDER BY date
            """,
            (symbol, f"-{days} day"),
        ).fetchall()
    return {
        "symbol": symbol,
        "real_time": real_time,
        "history": [dict(r) for r in rows],
    }


@router.get("/news")
def news(request: Request, days: int = 3, limit: int = 50):
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, publish_date, source, url, title_zh, summary_zh,
                   affects, importance
            FROM finance_news
            WHERE date(publish_date) >= date('now','localtime', ?)
              AND (expires_at IS NULL OR date(expires_at) >= date('now','localtime'))
            ORDER BY importance DESC, datetime(publish_date) DESC
            LIMIT ?
            """,
            (f"-{days} day", limit),
        ).fetchall()
        return {"items": [dict(r) for r in rows], "count": len(rows)}
