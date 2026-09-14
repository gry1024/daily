"""School Info API"""
from fastapi import APIRouter, Request, Body
from ..db import get_conn

router = APIRouter()


@router.get("")
def list_events(
    request: Request,
    days: int = 60,
    event_type: str = None,
    relevant_only: bool = False,
    limit: int = 100,
):
    with get_conn() as conn:
        sql = """
          SELECT id, publish_date, event_date, expire_date, title, summary,
                 url, source, event_type, location, relevance
          FROM school_events
          WHERE (event_date IS NULL AND date(publish_date) >= date('now','localtime', ?))
             OR (event_date IS NOT NULL AND date(event_date) >= date('now','localtime', '-7 day'))
        """
        params = [f"-{days} day"]
        if event_type:
            sql += " AND event_type = ?"
            params.append(event_type)
        if relevant_only:
            sql += " AND relevance >= 2"
        sql += " ORDER BY event_date IS NULL, datetime(event_date) ASC, relevance DESC LIMIT ?"
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


@router.post("")
def add_event(
    request: Request,
    payload: dict = Body(...),
):
    """用户自添加活动"""
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")
    title = (payload.get("title") or "").strip()
    if not title:
        return {"error": "title 不能为空"}
    event_date = payload.get("event_date") or today
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO school_events
                (publish_date, event_date, title, summary, url, source,
                 event_type, location, relevance, expire_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                today,
                event_date,
                title[:300],
                (payload.get("summary") or "")[:500],
                (payload.get("url") or "")[:500],
                "user_added",
                payload.get("event_type") or "notice",
                (payload.get("location") or "")[:200],
                payload.get("relevance") or 2,
                event_date,
            ),
        )
        return {"ok": True, "id": cur.lastrowid}
