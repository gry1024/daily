"""LeetCode Hot 100 API"""
from fastapi import APIRouter, Request, Query
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


@router.get("/stats")
def stats(request: Request):
    with get_conn() as conn:
        by_difficulty = conn.execute(
            """
            SELECT difficulty, COUNT(*) AS n
            FROM leetcode_questions GROUP BY difficulty
            """
        ).fetchall()
        all_tags_rows = conn.execute(
            "SELECT tags FROM leetcode_questions WHERE tags IS NOT NULL AND tags != ''"
        ).fetchall()
        tag_count = {}
        for r in all_tags_rows:
            for t in (r["tags"] or "").split(","):
                t = t.strip()
                if t: tag_count[t] = tag_count.get(t, 0) + 1
        top_tags = sorted(tag_count.items(), key=lambda x: -x[1])[:20]
        total = conn.execute("SELECT COUNT(*) FROM leetcode_questions").fetchone()[0]
        return {
            "total": total,
            "by_difficulty": [dict(r) for r in by_difficulty],
            "top_tags": [{"tag": t, "n": n} for t, n in top_tags],
        }


@router.get("/list")
def list_questions(
    request: Request,
    difficulty: str = Query(None),
    tag: str = Query(None),
    limit: int = Query(100, le=200),
):
    sql = "SELECT id, lc_id, title_en, title_zh, difficulty, tags, url, order_in_hot100, complexity FROM leetcode_questions WHERE 1=1"
    params = []
    if difficulty:
        sql += " AND difficulty = ?"
        params.append(difficulty)
    if tag:
        sql += " AND tags LIKE ?"
        params.append(f"%{tag}%")
    sql += " ORDER BY order_in_hot100 LIMIT ?"
    params.append(limit)
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        return {"items": [dict(r) for r in rows], "count": len(rows)}


@router.get("/random")
def random_one(
    request: Request,
    exclude: int = Query(None),
    difficulty: str = Query(None),
    tag: str = Query(None),
):
    sql = "SELECT id, lc_id, title_en, title_zh, difficulty, tags, url, order_in_hot100 FROM leetcode_questions WHERE 1=1"
    params = []
    if exclude:
        sql += " AND id != ?"
        params.append(exclude)
    if difficulty:
        sql += " AND difficulty = ?"
        params.append(difficulty)
    if tag:
        sql += " AND tags LIKE ?"
        params.append(f"%{tag}%")
    sql += " ORDER BY RANDOM() LIMIT 1"
    with get_conn() as conn:
        row = conn.execute(sql, params).fetchone()
        if not row:
            return {"question": None}
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

