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
    """每天选 5 题：保证 5 个 category 都有 + 难度均衡"""
    with get_conn() as conn:
        # 先清掉今日
        conn.execute("DELETE FROM daily_quant WHERE date = ?", (date,))

        # 策略：先选最缺的 category
        categories = ['probability', 'brain_teaser', 'math', 'stats', 'stochastic']
        difficulties = ['Easy', 'Medium', 'Hard', 'Very Hard']

        selected_ids = []

        for cat in categories:
            # 选这个 category 最近最少出现的
            row = conn.execute(
                """SELECT id FROM quant_questions
                   WHERE category = ?
                     AND id NOT IN (
                       SELECT question_id FROM daily_quant
                       WHERE date >= date(?, '-7 day')
                     )
                   ORDER BY last_shown_at ASC NULLS FIRST, RANDOM()
                   LIMIT 1""",
                (cat, date),
            ).fetchone()
            if row:
                selected_ids.append(row["id"])

        # 兜底：如果某 category 找不到新的，从未出现的题目里随机抽
        while len(selected_ids) < 5:
            row = conn.execute(
                """SELECT id FROM quant_questions
                   WHERE id NOT IN (
                     SELECT question_id FROM daily_quant
                     WHERE date >= date(?, '-1 day')
                   )
                   AND id NOT IN ({})
                   ORDER BY RANDOM() LIMIT 1""".format(
                     ','.join('?' * len(selected_ids))
                   ),
                (date, *selected_ids),
            ).fetchone()
            if not row: break
            selected_ids.append(row["id"])

        # 写入
        for pos, qid in enumerate(selected_ids, 1):
            conn.execute(
                "INSERT INTO daily_quant (date, position, question_id) VALUES (?, ?, ?)",
                (date, pos, qid),
            )
            conn.execute(
                "UPDATE quant_questions SET last_shown_at = ?, shown_count = shown_count + 1 WHERE id = ?",
                (date, qid),
            )

        print(f"✓ {date} 选题: {[i for i in selected_ids]}（{len(selected_ids)} 题）")

        # 显示题目摘要
        rows = conn.execute(
            f"""SELECT q.id, q.category, q.sub_category, q.difficulty_label, q.question_zh
               FROM quant_questions q
               WHERE q.id IN ({','.join('?'*len(selected_ids))})""",
            selected_ids,
        ).fetchall()
        for r in rows:
            print(f"  [{r['id']:2d}] {r['category']:14s}/{r['difficulty_label']:10s} | {r['question_zh'][:50]}")


if __name__ == "__main__":
    import_questions()
    pick_daily(today_str())
