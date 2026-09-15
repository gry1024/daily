"""
导入 quant_full.json 到 DB + 每天选题 5 题（覆盖不同类型 + 难度）
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str, init_schema

init_schema()

SEED_FILE = ROOT / "data" / "seeds" / "quant_full.json"


def import_questions():
    """把 JSON 导入到 DB"""
    items = json.loads(SEED_FILE.read_text())
    with get_conn() as conn:
        # 清空旧的 daily_quant（避免 FK 错误）
        conn.execute("DELETE FROM daily_quant")
        # 删除旧题（id 重新从 1 开始）
        conn.execute("DELETE FROM quant_questions")
        n = 0
        for p in items:
            conn.execute(
                """INSERT INTO quant_questions
                    (category, sub_category, source, difficulty, difficulty_label,
                     question_en, question_zh, answer,
                     problem_md, examples_md, constraints_md, hints_md, tags,
                     model_name, model_description_md, variations_md, insights_md)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    p.get("category"), p.get("sub_category"), p.get("source"),
                    p.get("difficulty", 3), p.get("difficulty_label", "Medium"),
                    p.get("question_en"), p.get("question_zh"), p.get("answer"),
                    p.get("problem_md"), p.get("examples_md"), p.get("constraints_md"),
                    p.get("hints_md"), p.get("tags"),
                    p.get("model_name"), p.get("model_description_md"),
                    p.get("variations_md"), p.get("insights_md"),
                ),
            )
            n += 1
        # 重建索引（确保 last_shown_at 默认 NULL）
        conn.execute("UPDATE quant_questions SET last_shown_at = NULL")
        print(f"✓ 导入 {n} 道 Quant 题目到 DB")


def pick_daily(date):
    """每天选 1 道题（覆盖不同类别 + 难度均衡，30 天内不重复）"""
    with get_conn() as conn:
        # 先清掉今日
        conn.execute("DELETE FROM daily_quant WHERE date = ?", (date,))

        # 优先选 category 过去 5 天没出现过的题
        categories = ['probability', 'brain_teaser', 'math', 'stats', 'stochastic']
        for cat in categories:
            row = conn.execute(
                """SELECT id FROM quant_questions
                   WHERE category = ?
                     AND id NOT IN (
                       SELECT question_id FROM daily_quant
                       WHERE date >= date(?, '-30 day')
                     )
                   ORDER BY last_shown_at ASC NULLS FIRST, RANDOM()
                   LIMIT 1""",
                (cat, date),
            ).fetchone()
            if row:
                qid = row["id"]
                conn.execute(
                    "INSERT OR REPLACE INTO daily_quant (date, position, question_id) VALUES (?, 1, ?)",
                    (date, qid),
                )
                conn.execute(
                    "UPDATE quant_questions SET last_shown_at = ?, shown_count = shown_count + 1 WHERE id = ?",
                    (date, qid),
                )
                print(f"✓ {date} 今日题: id={qid} cat={cat}")
                # 显示摘要
                row2 = conn.execute(
                    "SELECT question_zh, difficulty_label, model_name FROM quant_questions WHERE id = ?",
                    (qid,),
                ).fetchone()
                print(f"  [{row2['difficulty_label']}] {row2['question_zh'][:50]}")
                print(f"  背后模型: {row2['model_name']}")
                return

        # 兜底
        row = conn.execute(
            """SELECT id FROM quant_questions ORDER BY RANDOM() LIMIT 1"""
        ).fetchone()
        if row:
            conn.execute(
                "INSERT OR REPLACE INTO daily_quant (date, position, question_id) VALUES (?, 1, ?)",
                (date, row["id"]),
            )


if __name__ == "__main__":
    import_questions()
    pick_daily(today_str())
