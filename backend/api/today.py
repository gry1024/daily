"""今日聚合：最新一轮所有模块的新增内容"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Request
from ..db import get_conn

router = APIRouter()


def _since_iso():
    """最新一轮抓取的起始时间（向前找最近一次 fetch_logs 的 finished_at）"""
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT finished_at FROM fetch_logs
            WHERE status IN ('success','partial') AND finished_at IS NOT NULL
            ORDER BY datetime(finished_at) DESC LIMIT 1
            """
        ).fetchone()
        if row and row["finished_at"]:
            return row["finished_at"]
    # 没找到就退回到过去 18 小时
    return (datetime.utcnow() - timedelta(hours=18)).isoformat()


@router.get("")
def today_aggregated(request: Request, limit_per_module: int = 8):
    """
    返回今日各模块新增条目（以最新一轮抓取为锚点），按模块分组。
    """
    since = _since_iso()
    sections = []

    with get_conn() as conn:
        # Quant: 今日题
        r = conn.execute(
            """
            SELECT q.id, q.source, q.difficulty, q.question_en, q.question_zh, q.tags
            FROM daily_quant d JOIN quant_questions q ON q.id=d.question_id
            WHERE d.date = date('now','localtime')
            """
        ).fetchone()
        if r:
            sections.append({
                "module": "quant", "title": "Quant 每日一题",
                "items": [{**dict(r), "url": f"/daily/#quant/{r['id']}"}],
            })

        # AI News
        rows = conn.execute(
            """
            SELECT id, title_zh, summary_zh, importance, source, url
            FROM ai_news WHERE datetime(created_at) >= datetime(?)
            ORDER BY importance DESC, datetime(created_at) DESC LIMIT ?
            """, (since, limit_per_module),
        ).fetchall()
        if rows:
            sections.append({
                "module": "news", "title": "AI News",
                "items": [dict(r) for r in rows],
            })

        # Arxiv
        rows = conn.execute(
            """
            SELECT arxiv_id, title, one_line_zh, relevance_score, category, abs_url
            FROM arxiv_papers WHERE datetime(fetched_at) >= datetime(?)
            ORDER BY relevance_score DESC, datetime(fetched_at) DESC LIMIT ?
            """, (since, limit_per_module),
        ).fetchall()
        if rows:
            sections.append({
                "module": "arxiv", "title": "Arxiv 论文",
                "items": [dict(r) for r in rows],
            })

        # School
        rows = conn.execute(
            """
            SELECT id, title, summary, source, url, relevance
            FROM school_events WHERE datetime(created_at) >= datetime(?)
            ORDER BY relevance DESC, datetime(created_at) DESC LIMIT ?
            """, (since, limit_per_module),
        ).fetchall()
        if rows:
            sections.append({
                "module": "school", "title": "School Info",
                "items": [dict(r) for r in rows],
            })

        # LeetCode: 今日题
        r = conn.execute(
            """
            SELECT q.id, q.title_zh, q.title_en, q.difficulty, q.url
            FROM daily_leetcode d JOIN leetcode_questions q ON q.id=d.question_id
            WHERE d.date = date('now','localtime')
            """
        ).fetchone()
        if r:
            sections.append({
                "module": "leetcode", "title": "LeetCode Hot 100",
                "items": [dict(r)],
            })

        # English: 今日
        rows = conn.execute(
            "SELECT word_ids, phrase_ids FROM daily_english WHERE date=date('now','localtime')"
        ).fetchone()
        if rows:
            import json
            try:
                wids = json.loads(rows["word_ids"])
            except Exception:
                wids = []
            try:
                pids = json.loads(rows["phrase_ids"])
            except Exception:
                pids = []
            words = []
            if wids:
                ph = ",".join("?" * len(wids))
                words = [dict(r) for r in conn.execute(
                    f"SELECT id, word, definition, difficulty FROM english_words WHERE id IN ({ph})", wids
                ).fetchall()]
            phrases = []
            if pids:
                ph = ",".join("?" * len(pids))
                phrases = [dict(r) for r in conn.execute(
                    f"SELECT id, phrase, meaning_zh FROM english_phrases WHERE id IN ({ph})", pids
                ).fetchall()]
            sections.append({
                "module": "english", "title": "English",
                "items": {"words": words, "phrases": phrases},
            })

        # Finance: 今日行情 + 新闻
        quotes = conn.execute(
            """
            SELECT symbol, price, change_pct FROM finance_quotes
            WHERE date = date('now','localtime') ORDER BY symbol
            """
        ).fetchall()
        news_rows = conn.execute(
            """
            SELECT id, title_zh, summary_zh, affects, source
            FROM finance_news WHERE datetime(created_at) >= datetime(?)
            ORDER BY importance DESC LIMIT ?
            """, (since, limit_per_module),
        ).fetchall()
        if quotes or news_rows:
            sections.append({
                "module": "finance", "title": "Finance Daily",
                "items": {"quotes": [dict(r) for r in quotes], "news": [dict(r) for r in news_rows]},
            })

        # GitHub
        rows = conn.execute(
            """
            SELECT full_name, description, brief_zh, language, stars_today, current_rank, url
            FROM github_repos WHERE datetime(last_seen_at) >= datetime(?)
            ORDER BY current_rank LIMIT ?
            """, (since, limit_per_module),
        ).fetchall()
        if rows:
            sections.append({
                "module": "github", "title": "GitHub Trending",
                "items": [dict(r) for r in rows],
            })

        # Deals
        rows = conn.execute(
            """
            SELECT id, title, category, expire_date, source, url, requirements
            FROM deals WHERE datetime(created_at) >= datetime(?)
              AND is_active = 1
            ORDER BY date(expire_date) ASC LIMIT ?
            """, (since, limit_per_module),
        ).fetchall()
        if rows:
            sections.append({
                "module": "deals", "title": "羊毛 Deals",
                "items": [dict(r) for r in rows],
            })

    return {"since": since, "sections": sections}
