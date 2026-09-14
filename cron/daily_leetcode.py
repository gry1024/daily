"""
LeetCode Hot 100 每日选题
- 按 (day_of_year % 100) 选第 N 题
- 同一天永远同一题
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str
from backend.runtime import run_with_logging


def pick_today(log):
    today = today_str()
    doy = int(today.split("-")[-1]) + sum(
        31 if m in (1,3,5,7,8,10,12) else 30 if m in (4,6,9,11) else 28
        for m in range(1, int(today.split("-")[1]))
    )
    order = (doy % 100) + 1
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM leetcode_questions WHERE order_in_hot100 = ?",
            (order,),
        ).fetchone()
        if not row:
            row = conn.execute(
                "SELECT id FROM leetcode_questions ORDER BY order_in_hot100 LIMIT 1"
            ).fetchone()
        qid = row["id"]
        # 检查今日是否已设置
        existing = conn.execute(
            "SELECT question_id FROM daily_leetcode WHERE date = ?", (today,)
        ).fetchone()
        if existing and existing["question_id"] == qid:
            return {"fetched": 0, "inserted": 0, "skipped": 1}
        conn.execute(
            "INSERT OR REPLACE INTO daily_leetcode (date, question_id) VALUES (?, ?)",
            (today, qid),
        )
        log.info(f"今日题 = order_in_hot100 {order} (id={qid})")
        return {"fetched": 0, "inserted": 1, "skipped": 0}


if __name__ == "__main__":
    run_with_logging("leetcode", pick_today)
