"""LeetCode Hot 100 API"""
from fastapi import APIRouter, Request
from ..db import get_conn

router = APIRouter()


@router.get("/today")
def today(request: Request):
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT q.id, q.lc_id, q.title_en, q.title_zh, q.difficulty,
                   q.tags, q.url, q.order_in_hot100
            FROM daily_leetcode d
            JOIN leetcode_questions q ON q.id = d.question_id
            WHERE d.date = date('now','localtime')
            """
        ).fetchone()
        if not row:
            return {"today": None}
        return {"question": dict(row)}


@router.get("/{qid}")
def detail(qid: int, request: Request):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM leetcode_questions WHERE id=?",
            (qid,),
        ).fetchone()
        if not row:
            return {"error": "not found"}
        return dict(row)
