"""
LLM 批量补全 LeetCode 题目
- 已有 solution_md 长度 > 200 的跳过
- 每题只生成 solution_md + hints_md（用简化 prompt）
- max_retries=1 + 6s timeout 避免卡死
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import init_schema, get_conn
from backend.llm import chat_json

init_schema()


PROMPT = """你是 LeetCode 题解编辑。给定一道 LeetCode 题目（已知标题、难度、标签、原始 solution_md 草稿），请生成完整题解。

输出严格按 JSON：
{
  "solution_md": "## 思路\\n...（1-2 句核心思路）\\n\\n## 代码\\n```python\\nclass Solution:\\n    def method(self, ...):\\n        ...\\n```\\n\\n## 复杂度\\n- 时间：O(...)\\n- 空间：O(...)",
  "hints_md": "|HINT_1|...（最模糊的提示）|HINT_2|...（更具体）|HINT_3|...（接近答案方向）"
}

要求：
- solution_md 必须含代码（python），格式正确
- 复杂度必须含时间和空间
- hints_md 用 |HINT_N| 分隔三段，从模糊到具体"""


def main(log=None):
    if log is None:
        import logging
        logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
        log = logging.getLogger('expand')

    with get_conn() as c:
        rows = c.execute(
            """SELECT id, lc_id, title_en, title_zh, difficulty, tags
               FROM leetcode_questions
               WHERE length(COALESCE(solution_md, '')) < 200
                  OR hints_md IS NULL
                  OR length(COALESCE(hints_md, '')) < 30
               ORDER BY lc_id"""
        ).fetchall()

    log.info(f"待补 {len(rows)} 道题")
    for i, row in enumerate(rows):
        user = f"#{row['lc_id']} {row['title_zh']}（{row['title_en']}）\n难度：{row['difficulty']}\n标签：{row['tags']}"
        try:
            r = chat_json(PROMPT, user, temperature=0.3, max_retries=1)
            if r and r.get('solution_md'):
                with get_conn() as c:
                    c.execute(
                        "UPDATE leetcode_questions SET solution_md=?, hints_md=? WHERE id=?",
                        (r['solution_md'], r.get('hints_md', ''), row['id']),
                    )
                if (i+1) % 20 == 0: log.info(f"  [{i+1}/{len(rows)}]")
            else:
                log.warning(f"  [{i+1}] #{row['lc_id']}: LLM 失败")
        except Exception as e:
            log.warning(f"  [{i+1}] #{row['lc_id']}: {e}")
        time.sleep(0.5)

    log.info(f"✓ 完成 {len(rows)} 题")


if __name__ == "__main__":
    main()
