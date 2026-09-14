"""GitHub Trending API"""
from fastapi import APIRouter, Request
from ..db import get_conn

router = APIRouter()


@router.get("/trending")
def trending(request: Request, days: int = 3, min_stars_today: int = 0, limit: int = 30):
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT full_name, url, description, language, stars_total, stars_today,
                   first_seen_at, last_seen_at, current_rank, brief_zh, tags
            FROM github_repos
            WHERE date(last_seen_at) >= date('now','localtime', ?)
              AND stars_today >= ?
            ORDER BY current_rank ASC
            LIMIT ?
            """,
            (f"-{days} day", min_stars_today, limit),
        ).fetchall()
        return {"items": [dict(r) for r in rows], "count": len(rows)}
