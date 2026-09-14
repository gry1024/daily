"""Arxiv 论文 API"""
from fastapi import APIRouter, Request, Query
from ..db import get_conn

router = APIRouter()


@router.get("")
def list_papers(
    request: Request,
    days: int = 7,
    category: str = None,
    min_relevance: int = 3,
    limit: int = 50,
):
    with get_conn() as conn:
        sql = """
          SELECT arxiv_id, published, title, authors, category, relevance_score,
                 one_line_zh, contributions, abs_url, pdf_url
          FROM arxiv_papers
          WHERE date(published) >= date('now','localtime', ?)
            AND relevance_score >= ?
        """
        params = [f"-{days} day", min_relevance]
        if category:
            sql += " AND category = ?"
            params.append(category)
        sql += " ORDER BY datetime(published) DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        import json
        items = []
        for r in rows:
            d = dict(r)
            try:
                d["authors"] = json.loads(d["authors"]) if d["authors"] else []
            except Exception:
                pass
            items.append(d)
        return {"items": items, "count": len(items)}


@router.get("/{arxiv_id}")
def paper_detail(arxiv_id: str, request: Request):
    """论文详情（含完整 abstract + contributions）"""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM arxiv_papers WHERE arxiv_id=?", (arxiv_id,)
        ).fetchone()
        if not row:
            return {"error": "not found"}
        d = dict(row)
        import json
        try:
            d["authors"] = json.loads(d["authors"]) if d["authors"] else []
        except Exception:
            pass
        return d


@router.get("/related/{arxiv_id}")
def related(arxiv_id: str, request: Request, limit: int = 5):
    """相关论文（同 category）"""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT category FROM arxiv_papers WHERE arxiv_id=?", (arxiv_id,)
        ).fetchone()
        if not row:
            return {"items": []}
        cat = row["category"]
        rows = conn.execute(
            """
            SELECT arxiv_id, title, one_line_zh, relevance_score, abs_url, published
            FROM arxiv_papers
            WHERE category = ? AND arxiv_id != ?
            ORDER BY relevance_score DESC, datetime(published) DESC LIMIT ?
            """,
            (cat, arxiv_id, limit),
        ).fetchall()
        return {"items": [dict(r) for r in rows], "category": cat}

