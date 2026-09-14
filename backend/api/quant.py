"""Quant 每日一题 API"""
from fastapi import APIRouter, Request, Query
from ..db import get_conn

router = APIRouter()


# 静态路径必须放在动态路径 /{qid} 之前，否则会被吞掉
@router.get("/today")
def today(request: Request):
    """今日题（不返回 answer / solution）"""
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT q.id, q.source, q.difficulty, q.question_en, q.question_zh,
                   q.tags, q.last_shown_at
            FROM daily_quant d
            JOIN quant_questions q ON q.id = d.question_id
            WHERE d.date = date('now','localtime')
            """
        ).fetchone()
        if not row:
            return {"today": None, "date": None}
        return {
            "date": row["last_shown_at"],
            "question": {
                "id": row["id"],
                "source": row["source"],
                "difficulty": row["difficulty"],
                "question_en": row["question_en"],
                "question_zh": row["question_zh"],
                "tags": row["tags"],
            },
        }


@router.get("/stats")
def stats(request: Request):
    """题库整体统计（前端"完成率 / 标签分布"用）"""
    with get_conn() as conn:
        by_source = conn.execute(
            """
            SELECT source, COUNT(*) AS n, AVG(difficulty) AS avg_diff
            FROM quant_questions GROUP BY source ORDER BY n DESC
            """
        ).fetchall()
        by_difficulty = conn.execute(
            """
            SELECT difficulty, COUNT(*) AS n
            FROM quant_questions GROUP BY difficulty ORDER BY difficulty
            """
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM quant_questions").fetchone()[0]
        return {
            "total": total,
            "by_source": [dict(r) for r in by_source],
            "by_difficulty": [dict(r) for r in by_difficulty],
        }


@router.get("/history")
def history(request: Request, days: int = Query(30, le=120)):
    """过去 N 天的出题历史"""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT d.date, q.id, q.source, q.difficulty, q.question_zh, q.tags
            FROM daily_quant d
            JOIN quant_questions q ON q.id = d.question_id
            WHERE d.date >= date('now','localtime', ?)
            ORDER BY d.date DESC
            """,
            (f"-{days} day",),
        ).fetchall()
        return {"items": [dict(r) for r in rows], "count": len(rows)}


@router.get("/list")
def list_questions(
    request: Request,
    source: str = Query(None),
    difficulty: int = Query(None),
    tag: str = Query(None),
    limit: int = Query(50, le=200),
):
    """题库列表（用于"浏览全部"）"""
    sql = "SELECT id, source, difficulty, question_zh, question_en, tags, last_shown_at FROM quant_questions WHERE 1=1"
    params = []
    if source:
        sql += " AND source = ?"
        params.append(source)
    if difficulty:
        sql += " AND difficulty = ?"
        params.append(difficulty)
    if tag:
        sql += " AND tags LIKE ?"
        params.append(f"%{tag}%")
    sql += " ORDER BY id LIMIT ?"
    params.append(limit)
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        return {"items": [dict(r) for r in rows], "count": len(rows)}


@router.get("/random")
def random_one(
    request: Request,
    exclude: int = Query(None),
    source: str = Query(None),
    difficulty: int = Query(None, ge=1, le=5),
):
    """手动换一题（可排除已看过的 + 按 source/difficulty 筛选）"""
    sql = "SELECT id, source, difficulty, question_en, question_zh, tags FROM quant_questions WHERE 1=1"
    params = []
    if exclude:
        sql += " AND id != ?"
        params.append(exclude)
    if source:
        sql += " AND source = ?"
        params.append(source)
    if difficulty:
        sql += " AND difficulty = ?"
        params.append(difficulty)
    sql += " ORDER BY RANDOM() LIMIT 1"
    with get_conn() as conn:
        row = conn.execute(sql, params).fetchone()
        if not row:
            return {"question": None}
        return {"question": dict(row)}


@router.get("/{qid}")
def detail(qid: int, request: Request):
    """完整单题详情（含 problem / examples / constraints / hints）"""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT id, source, difficulty, question_en, question_zh, answer, solution_md,
                      problem_md, examples_md, constraints_md, hints_md, tags
               FROM quant_questions WHERE id=?""",
            (qid,),
        ).fetchone()
        if not row:
            return {"error": "not found"}
        return dict(row)


@router.get("/{qid}/reveal")
def reveal(qid: int, request: Request):
    """揭示答案 + 解析"""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT answer, solution_md FROM quant_questions WHERE id=?",
            (qid,),
        ).fetchone()
        if not row:
            return {"error": "not found"}
        return {"id": qid, "answer": row["answer"], "solution": row["solution_md"]}


@router.get("/{qid}/hint/{n}")
def hint(qid: int, n: int, request: Request):
    """获取第 n 个提示（1/2/3）"""
    if n < 1 or n > 3:
        return {"error": "hint n must be 1-3"}
    with get_conn() as conn:
        row = conn.execute(
            "SELECT hints_md FROM quant_questions WHERE id=?",
            (qid,),
        ).fetchone()
        if not row or not row["hints_md"]:
            return {"error": "no hints"}
        parts = row["hints_md"].split("|HINT_")
        # parts[0] 可能是空 / 部分开头，parts[1/2/3] = "1|..."、"2|..."、"3|..."
        for p in parts[1:]:
            if p.startswith(f"{n}|"):
                return {"n": n, "text": p[2:].strip()}
        return {"error": f"hint {n} not found"}


@router.get("/{qid}/related")
def related(qid: int, request: Request, limit: int = 4):
    """相关题（同 tag）"""
    with get_conn() as conn:
        row = conn.execute("SELECT tags FROM quant_questions WHERE id=?", (qid,)).fetchone()
        if not row:
            return {"items": []}
        tags = row["tags"] or ""
        # 取第一个 tag 匹配
        first_tag = tags.split(",")[0].strip() if tags else ""
        rows = conn.execute(
            """SELECT id, source, difficulty, question_zh, tags
               FROM quant_questions
               WHERE id != ? AND tags LIKE ?
               ORDER BY RANDOM() LIMIT ?""",
            (qid, f"%{first_tag}%", limit),
        ).fetchall()
        return {"items": [dict(r) for r in rows], "tag": first_tag}


