"""School Info API"""
from fastapi import APIRouter, Request
from ..db import get_conn

router = APIRouter()


@router.get("")
def list_events(
    request: Request,
    days: int = 7,
    event_type: str = None,
    relevant_only: bool = False,
    limit: int = 80,
):
    with get_conn() as conn:
        sql = """
          SELECT id, publish_date, event_date, expire_date, title, summary,
                 url, source, event_type, location, relevance
          FROM school_events
          WHERE date(publish_date) >= date('now','localtime', ?)
        """
        params = [f"-{days} day"]
        if event_type:
            sql += " AND event_type = ?"
            params.append(event_type)
        if relevant_only:
            sql += " AND relevance >= 2"
        sql += " ORDER BY relevance DESC, datetime(event_date) DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return {"items": [dict(r) for r in rows], "count": len(rows)}


@router.get("/upcoming")
def upcoming(request: Request, days: int = 7):
    """未来 N 天内的活动（按 event_date 排序）"""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, event_date, expire_date, title, summary, url,
                   source, event_type, location, relevance
            FROM school_events
            WHERE event_date IS NOT NULL
              AND date(event_date) BETWEEN date('now','localtime') AND date('now','localtime', ?)
            ORDER BY datetime(event_date) ASC, relevance DESC
            """,
            (f"+{days} day",),
        ).fetchall()
        return {"items": [dict(r) for r in rows], "count": len(rows)}
