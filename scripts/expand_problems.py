"""
为所有 Quant / LeetCode 题目补全：
  - problem_md / description_md: 完整题目描述
  - examples_md: 示例（输入输出）
  - constraints_md: 约束
  - hints_md: 3 个渐进提示（|HINT_N| 分隔）

用 minimax-m3 一次性生成。
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import init_schema, get_conn
from backend.llm import chat_json
from backend.runtime import setup_logging


QUANT_PROMPT = """你是量化面试题编辑。给定一道简短的概率/统计/脑筋急转弯题，扩写为完整题目格式。

输出 JSON 字段：
- problem_md：1-2 句话讲清题意的 markdown
- examples_md：1-3 个具体示例，markdown 格式（如无留空字符串）
- constraints_md：数据范围 / 假设条件（如无留空字符串）
- hints_md：3 个渐进提示，用 |HINT_1|xxx|HINT_2|yyy|HINT_3|zzz 串起来

要求：hints 是引导思维而不是给答案，逐步具体。用中文。"""


LEETCODE_PROMPT = """你是 LeetCode 题库编辑。给定一道 LeetCode Hot 100 题目（已知英文标题和中文标题），生成完整题目页内容。

输出 JSON 字段：
- description_md：用 2-4 段讲清题目，包含问题描述和数据范围说明
- examples_md：2-3 个 LeetCode 风格示例，每个含「输入 / 输出 / 解释」三段
- constraints_md：markdown 列表形式（- 1 <= n <= 10^4）
- hints_md：3 个渐进提示，用 |HINT_1|xxx|HINT_2|yyy|HINT_3|zzz 串起来

要求：示例格式如 LeetCode 原版，hints 引导思维不要给完整算法。中文输出。"""


def backfill_quant(log):
    """Quant 全部 30 题"""
    log.info("=== Quant backfill ===")
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT id, question_zh, answer, solution_md, problem_md, examples_md, constraints_md, hints_md
               FROM quant_questions
               WHERE problem_md IS NULL OR length(problem_md) < 50"""
        ).fetchall()
        log.info(f"待补 {len(rows)} 题")
        for i, row in enumerate(rows):
            user_prompt = f"题目：{row['question_zh']}\n已知答案：{row['answer'] or ''}\n"
            if row["solution_md"]:
                user_prompt += f"参考解答：\n{row['solution_md'][:800]}\n"
            try:
                r = chat_json(QUANT_PROMPT, user_prompt, temperature=0.3, max_retries=1)
                if r:
                    conn.execute(
                        """UPDATE quant_questions SET
                            problem_md=?, examples_md=?, constraints_md=?, hints_md=?
                           WHERE id=?""",
                        (
                            r.get("problem_md") or "",
                            r.get("examples_md") or "",
                            r.get("constraints_md") or "",
                            r.get("hints_md") or "",
                            row["id"],
                        ),
                    )
                    log.info(f"  [{i+1}/{len(rows)}] q#{row['id']}: ✓")
                else:
                    log.warning(f"  [{i+1}/{len(rows)}] q#{row['id']}: LLM 返回 None")
            except Exception as e:
                log.warning(f"  [{i+1}/{len(rows)}] q#{row['id']}: {e}")
            time.sleep(0.5)


def backfill_leetcode(log, limit=None):
    """LeetCode 全部 100 题（默认今日题 + 即将要出的题优先）"""
    log.info("=== LeetCode backfill ===")
    with get_conn() as conn:
        sql = """
            SELECT id, lc_id, title_en, title_zh, tags, difficulty,
                   description_md, examples_md, constraints_md, hints_md, solution_md
            FROM leetcode_questions
            WHERE description_md IS NULL OR length(description_md) < 50
            ORDER BY id ASC
        """
        if limit:
            sql += f" LIMIT {limit}"
        rows = conn.execute(sql).fetchall()
        log.info(f"待补 {len(rows)} 题")
        for i, row in enumerate(rows):
            user_prompt = f"""题目 #{row['lc_id']}
英文：{row['title_en']}
中文：{row['title_zh']}
难度：{row['difficulty']}
标签：{row['tags'] or ''}"""
            if row["solution_md"] and len(row["solution_md"]) > 30:
                user_prompt += f"\n参考解答思路：\n{row['solution_md'][:600]}"
            try:
                r = chat_json(LEETCODE_PROMPT, user_prompt, temperature=0.3, max_retries=1)
                if r:
                    conn.execute(
                        """UPDATE leetcode_questions SET
                            description_md=?, examples_md=?, constraints_md=?, hints_md=?
                           WHERE id=?""",
                        (
                            r.get("description_md") or "",
                            r.get("examples_md") or "",
                            r.get("constraints_md") or "",
                            r.get("hints_md") or "",
                            row["id"],
                        ),
                    )
                    log.info(f"  [{i+1}/{len(rows)}] lc#{row['lc_id']}: ✓")
                else:
                    log.warning(f"  [{i+1}/{len(rows)}] lc#{row['lc_id']}: LLM None")
            except Exception as e:
                log.warning(f"  [{i+1}/{len(rows)}] lc#{row['lc_id']}: {e}")
            time.sleep(0.5)


if __name__ == "__main__":
    import sys
    log = setup_logging("expand")
    what = sys.argv[1] if len(sys.argv) > 1 else "today"
    if what == "quant":
        backfill_quant(log)
    elif what == "leetcode":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else None
        backfill_leetcode(log, limit=limit)
    elif what == "today":
        # 今天的两题
        from backend.db import get_conn
        with get_conn() as conn:
            today_q = conn.execute('SELECT question_id FROM daily_quant').fetchone()
            today_l = conn.execute('SELECT question_id FROM daily_leetcode').fetchone()
        # 调用通用
        backfill_quant(log)
        backfill_leetcode(log, limit=2)
    else:
        print(f"用法: {sys.argv[0]} [quant|leetcode|today]")
