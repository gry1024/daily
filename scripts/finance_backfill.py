"""
历史行情回填：用腾讯的 K 线接口取过去 60 天
- hf_XAU: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=hf_XAU,day,,,60,qfq
- sh000001: https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=sh000001,day,,,60,qfq
- usINX: https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get?param=us.INX,day,,,60,qfq
"""
import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn


# (symbol, kline url)
KLINE_ENDPOINTS = [
    ("XAUUSD", "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=hf_XAU,day,,,90,qfq"),
    ("上证", "https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=sh000001,day,,,90,qfq"),
    ("纳指", "https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get?param=us.INX,day,,,90,qfq"),
]


def backfill():
    inserted = 0
    for symbol, url in KLINE_ENDPOINTS:
        try:
            r = requests.get(url, timeout=15, headers={"User-Agent":"Mozilla/5.0"})
            if r.status_code != 200:
                print(f"  {symbol}: HTTP {r.status_code}")
                continue
            data = r.json()
            # 不同接口数据路径不同
            qfq = data.get("data", {}).get("qfqday") or data.get("data", {}).get("day") or []
            if isinstance(qfq, str):
                # 分号分隔
                qfq = [line.split(",") for line in qfq.strip().split(";") if line]
            # 格式：[date, open, close, high, low, volume]
            print(f"  {symbol}: {len(qfq)} rows")
            with get_conn() as conn:
                for row in qfq:
                    try:
                        d, o, c, h, l, *rest = row
                        # 算涨跌幅（相对于前一日）
                        prev = rest[0] if rest and len(rest) > 0 else None
                        # 写入
                        conn.execute(
                            "INSERT OR IGNORE INTO finance_quotes (symbol, date, price, change_pct) VALUES (?, ?, ?, ?)",
                            (symbol, d, float(c), 0),
                        )
                        inserted += 1
                    except (ValueError, IndexError):
                        continue
        except Exception as e:
            print(f"  {symbol}: {e}")
    print(f"插入 {inserted} 条历史")


def update_change_pct():
    """每天凌晨第一次抓时用：用前一天数据计算 change_pct"""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT symbol, date, price FROM finance_quotes ORDER BY symbol, date"""
        ).fetchall()
        prev = {}  # (symbol) -> price
        for r in rows:
            sym = r["symbol"]
            cur_price = r["price"]
            if sym in prev and prev[sym]:
                pct = (cur_price - prev[sym]) / prev[sym] * 100
                conn.execute(
                    "UPDATE finance_quotes SET change_pct=? WHERE symbol=? AND date=?",
                    (pct, sym, r["date"]),
                )
            prev[sym] = cur_price
        print("change_pct 已更新")


if __name__ == "__main__":
    backfill()
    update_change_pct()
