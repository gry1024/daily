"""
Quant 每日选题
- 按 last_shown_at 升序选最少出现的题
- 同 7 天内不重复
"""
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str
from backend.runtime import run_with_logging


def pick_today(log):
    today = today_str()
    week_ago = (today - timedelta(days=7)).isoformat() if False else None
    # 用字符串比较简化
    from datetime import date, timedelta
    d = date.fromisoformat(today)
    week_ago = (d - timedelta(days=7)).isoformat()

    with get_conn() as conn:
        # 选 last_shown_at 最早 + 7 天内未展示 + 优先有 problem_md 的
        row = conn.execute(
            """
            SELECT q.id FROM quant_questions q
            WHERE q.id NOT IN (
              SELECT question_id FROM daily_quant
              WHERE date >= ?
            )
            AND length(q.problem_md) > 30
            ORDER BY q.last_shown_at ASC NULLS FIRST, RANDOM()
            LIMIT 1
            """,
            (week_ago,),
        ).fetchone()
        if not row:
            # 退而求其次：随便选（但仍然要 problem_md > 30）
            row = conn.execute(
                """SELECT id FROM quant_questions
                   WHERE length(problem_md) > 30
                   ORDER BY RANDOM() LIMIT 1"""
            ).fetchone()
        qid = row["id"]

        # 检查是否已选
        existing = conn.execute(
            "SELECT question_id FROM daily_quant WHERE date = ?", (today,)
        ).fetchone()
        if existing and existing["question_id"] == qid:
            return {"fetched": 0, "inserted": 0, "skipped": 1}

        conn.execute(
            "INSERT OR REPLACE INTO daily_quant (date, question_id) VALUES (?, ?)",
            (today, qid),
        )
        conn.execute(
            "UPDATE quant_questions SET last_shown_at = ? WHERE id = ?",
            (today, qid),
        )
        log.info(f"今日题 = quant id {qid}")
        return {"fetched": 0, "inserted": 1, "skipped": 0}


if __name__ == "__main__":
    run_with_logging("quant", pick_today)
