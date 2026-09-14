"""羊毛 Deals API"""
from fastapi import APIRouter, Request
from ..db import get_conn

router = APIRouter()


@router.get("")
def list_deals(
    request: Request,
    category: str = None,
    active_only: bool = True,
    days_ahead: int = 0,
    limit: int = 100,
):
    with get_conn() as conn:
        sql = """
          SELECT id, publish_date, expire_date, category, title, source,
                 url, requirements, note, is_active
          FROM deals
          WHERE 1=1
        """
        params = []
        if active_only:
            sql += " AND is_active = 1"
        if category:
            sql += " AND category = ?"
            params.append(category)
        if days_ahead > 0:
            sql += " AND date(expire_date) <= date('now','localtime', ?)"
            params.append(f"+{days_ahead} day")
        sql += " ORDER BY date(expire_date) ASC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return {"items": [dict(r) for r in rows], "count": len(rows)}
