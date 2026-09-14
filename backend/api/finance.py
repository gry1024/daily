"""Finance Daily API"""
from fastapi import APIRouter, Request
from ..db import get_conn

router = APIRouter()


@router.get("/quotes")
def quotes(request: Request):
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT symbol, date, price, change_pct
            FROM finance_quotes
            WHERE date = date('now','localtime')
            ORDER BY symbol
            """
        ).fetchall()
        return {"items": [dict(r) for r in rows]}


@router.get("/news")
def news(request: Request, days: int = 3, limit: int = 50):
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, publish_date, source, url, title_zh, summary_zh,
                   affects, importance
            FROM finance_news
            WHERE date(publish_date) >= date('now','localtime', ?)
              AND (expires_at IS NULL OR date(expires_at) >= date('now','localtime'))
            ORDER BY importance DESC, datetime(publish_date) DESC
            LIMIT ?
            """,
            (f"-{days} day", limit),
        ).fetchall()
        return {"items": [dict(r) for r in rows], "count": len(rows)}
