"""Quant 每日一题 API"""
from fastapi import APIRouter, Request
from ..db import get_conn

router = APIRouter()


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


@router.get("/random")
def random_one(request: Request):
    """手动换一题"""
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, source, difficulty, question_en, question_zh, tags
            FROM quant_questions
            ORDER BY RANDOM() LIMIT 1
            """
        ).fetchone()
        if not row:
            return {"question": None}
        return {"question": dict(row)}
