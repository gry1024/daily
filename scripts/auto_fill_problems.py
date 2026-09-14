"""
为所有 Quant / LeetCode 题自动填充基础内容：
  - 从 question_zh / title 提取 problem_md
  - 从 solution_md 拆分出 hints_md（3 个渐进提示）
  - examples_md / constraints_md 留空（这些需要 LLM）

不调用 LLM，纯本地处理，保证所有题都有最小可用内容。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn


def split_into_hints(solution_md: str, n: int = 3) -> str:
    """从 solution_md 提取关键句子作为渐进提示"""
    if not solution_md:
        return ""

    # 按中文句子切分
    text = re.sub(r"```[\s\S]*?```", "", solution_md)  # 去掉代码块
    text = re.sub(r"`[^`]+`", "", text)  # 去掉行内代码
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.M)  # 去掉标题标记

    # 按句号 / 分号 / 换行切
    sentences = re.split(r"[。；\n]+", text)
    sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 8]
    if not sentences:
        return ""

    # 启发式：取前 N 句作为提示（后续做 LLM 增强）
    # 第一句最模糊，后面的更具体
    if len(sentences) >= n:
        hints = sentences[:n]
    else:
        hints = sentences + [""] * (n - len(sentences))
    return "|HINT_1|" + hints[0] + "|HINT_2|" + hints[1] + "|HINT_3|" + hints[2]


def fill_quant():
    with get_conn() as c:
        rows = c.execute(
            """SELECT id, question_zh, question_en, solution_md, problem_md, hints_md
               FROM quant_questions
               WHERE problem_md IS NULL OR length(problem_md) < 30 OR hints_md IS NULL OR length(hints_md) < 30"""
        ).fetchall()
        log.info(f"Quant 待补 {len(rows)} 题")
        for i, r in enumerate(rows):
            problem = r["question_zh"] or r["question_en"] or ""
            hints = split_into_hints(r["solution_md"] or "")
            c.execute(
                "UPDATE quant_questions SET problem_md=?, hints_md=? WHERE id=?",
                (problem, hints, r["id"]),
            )
            if (i+1) % 10 == 0: log.info(f"  [{i+1}/{len(rows)}]")
        c.commit()
        log.info(f"✓ Quant 全部 {len(rows)} 题填充完成")


def fill_leetcode():
    with get_conn() as c:
        rows = c.execute(
            """SELECT id, title_zh, title_en, solution_md, description_md, hints_md
               FROM leetcode_questions
               WHERE description_md IS NULL OR length(description_md) < 30
                  OR hints_md IS NULL OR length(hints_md) < 30"""
        ).fetchall()
        log.info(f"LeetCode 待补 {len(rows)} 题")
        for i, r in enumerate(rows):
            problem = r["title_zh"] or r["title_en"] or ""
            # 把题目陈述包装成一个 markdown 块（用 ## 题目 + 描述）
            desc_md = f"## 题目\n\n{problem}\n\n## 解题思路\n\n参考 LeetCode 官方题解。"
            hints = split_into_hints(r["solution_md"] or "")
            c.execute(
                "UPDATE leetcode_questions SET description_md=?, hints_md=? WHERE id=?",
                (desc_md, hints, r["id"]),
            )
            if (i+1) % 20 == 0: log.info(f"  [{i+1}/{len(rows)}]")
        c.commit()
        log.info(f"✓ LeetCode 全部 {len(rows)} 题填充完成")


if __name__ == "__main__":
    from backend.runtime import setup_logging
    log = setup_logging("autofill")
    log.info("=== 自动填充开始 ===")
    fill_quant()
    fill_leetcode()
    log.info("=== 完成 ===")
