"""English API"""
from fastapi import APIRouter, Request
from ..db import get_conn

router = APIRouter()


@router.get("/today")
def today(request: Request):
    import json
    with get_conn() as conn:
        row = conn.execute(
            "SELECT word_ids, phrase_ids FROM daily_english WHERE date=?",
            ("today",),
        ).fetchone()
        # 实际查询：用 date('now','localtime')
        row = conn.execute(
            "SELECT word_ids, phrase_ids FROM daily_english WHERE date = date('now','localtime')"
        ).fetchone()
        if not row:
            return {"date": None, "words": [], "phrases": []}
        try:
            word_ids = json.loads(row["word_ids"])
        except Exception:
            word_ids = []
        try:
            phrase_ids = json.loads(row["phrase_ids"])
        except Exception:
            phrase_ids = []
        words = []
        if word_ids:
            ph = ",".join("?" * len(word_ids))
            words = [dict(r) for r in conn.execute(
                f"SELECT * FROM english_words WHERE id IN ({ph})", word_ids
            ).fetchall()]
        phrases = []
        if phrase_ids:
            ph = ",".join("?" * len(phrase_ids))
            phrases = [dict(r) for r in conn.execute(
                f"SELECT * FROM english_phrases WHERE id IN ({ph})", phrase_ids
            ).fetchall()]
        return {"words": words, "phrases": phrases}
