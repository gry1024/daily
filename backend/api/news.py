"""AI News API"""
from fastapi import APIRouter, Request
from ..db import get_conn

router = APIRouter()


@router.get("")
def list_news(
    request: Request,
    days: int = 3,
    category: str = None,
    min_importance: int = 1,
    limit: int = 50,
):
    with get_conn() as conn:
        sql = """
          SELECT id, publish_date, source, url, title_zh, summary_zh,
                 category, importance, sentiment, created_at
          FROM ai_news
          WHERE date(publish_date) >= date('now','localtime', ?)
            AND importance >= ?
            AND (expires_at IS NULL OR date(expires_at) >= date('now','localtime'))
        """
        params = [f"-{days} day", min_importance]
        if category:
            sql += " AND category = ?"
            params.append(category)
        sql += " ORDER BY importance DESC, datetime(publish_date) DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return {"items": [dict(r) for r in rows], "count": len(rows)}


@router.get("/{nid}")
def news_detail(nid: int, request: Request):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM ai_news WHERE id=?", (nid,)).fetchone()
        if not row:
            return {"error": "not found"}
        return dict(row)
