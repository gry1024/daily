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
    """每天选 1 道题（覆盖不同类别 + 难度均衡）"""
    from datetime import date, timedelta
    today = today_str()
    d = date.fromisoformat(today)
    week_ago = (d - timedelta(days=30)).isoformat()

    with get_conn() as conn:
        # 优先选 category 过去 30 天没出现过的题
        for cat in ['probability', 'brain_teaser', 'math', 'stats', 'stochastic']:
            row = conn.execute(
                """
                SELECT q.id FROM quant_questions q
                WHERE q.category = ?
                  AND length(q.problem_md) > 30
                  AND q.id NOT IN (
                    SELECT question_id FROM daily_quant
                    WHERE date >= ?
                  )
                ORDER BY q.last_shown_at ASC NULLS FIRST, RANDOM()
                LIMIT 1
                """,
                (cat, week_ago),
            ).fetchone()
            if row:
                qid = row["id"]
                conn.execute(
                    "INSERT OR REPLACE INTO daily_quant (date, question_id) VALUES (?, ?)",
                    (today, qid),
                )
                conn.execute(
                    "UPDATE quant_questions SET last_shown_at = ? WHERE id = ?",
                    (today, qid),
                )
                log.info(f"今日 quant = id {qid} ({cat})")
                return {"fetched": 0, "inserted": 1, "skipped": 0}

        # 兜底
        row = conn.execute(
            "SELECT id FROM quant_questions ORDER BY RANDOM() LIMIT 1"
        ).fetchone()
        qid = row["id"]
        conn.execute(
            "INSERT OR REPLACE INTO daily_quant (date, question_id) VALUES (?, ?)",
            (today, qid),
        )
        log.info(f"今日 quant (兜底) = id {qid}")
        return {"fetched": 0, "inserted": 1, "skipped": 0}


if __name__ == "__main__":
    run_with_logging("quant", pick_today)
