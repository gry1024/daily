"""
邮件摘要：每天 8:00 发
- 成功：每个模块 top 3
- 失败 / 空数据 / 无 fetch_logs：发警告邮件告知原因
"""
import json
import logging
import smtplib
import sys
import traceback
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str
from backend.config import QQ_EMAIL, QQ_EMAIL_AUTH_CODE, EMAIL_TO, SITE_BASE_URL

log = logging.getLogger("email_digest")
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")


MODULES = [
    ("quant", "Quant 每日一题"),
    ("news", "AI News"),
    ("arxiv", "Arxiv 论文"),
    ("school", "School Info"),
    ("leetcode", "LeetCode Hot 100"),
    ("english", "English"),
    ("finance", "Finance Daily"),
    ("github", "GitHub Trending"),
    ("deals", "羊毛 Deals"),
]


def fetch_today_summary():
    today = today_str()
    sections = []
    failed_modules = []
    empty_modules = []
    with get_conn() as conn:
        for mod, title in MODULES:
            log_row = conn.execute(
                """
                SELECT status, items_fetched, items_inserted, error, finished_at
                FROM fetch_logs WHERE module=? AND date(finished_at)=?
                ORDER BY datetime(finished_at) DESC LIMIT 1
                """,
                (mod, today),
            ).fetchone()

            if not log_row:
                failed_modules.append((mod, title, "无 fetch_logs 记录"))
                continue

            if log_row["status"] == "failed":
                failed_modules.append((mod, title, log_row["error"] or "未知错误"))
                continue

            section = {"module": mod, "title": title, "items": []}

            if mod == "quant":
                r = conn.execute(
                    """
                    SELECT q.question_zh, q.source, q.difficulty, q.tags
                    FROM daily_quant d JOIN quant_questions q ON q.id=d.question_id
                    WHERE d.date=?
                    """, (today,),
                ).fetchone()
                if r:
                    section["items"].append({
                        "kind": "qcard",
                        "title": r["question_zh"][:200],
                        "meta": f"{r['source']} · 难度 {r['difficulty']}/5 · {r['tags'] or ''}",
                    })
            elif mod == "leetcode":
                r = conn.execute(
                    """
                    SELECT q.title_zh, q.title_en, q.difficulty, q.tags, q.url
                    FROM daily_leetcode d JOIN leetcode_questions q ON q.id=d.question_id
                    WHERE d.date=?
                    """, (today,),
                ).fetchone()
                if r:
                    section["items"].append({
                        "kind": "qcard",
                        "title": r["title_zh"] or r["title_en"],
                        "meta": f"{r['difficulty']} · {r['tags'] or ''}",
                        "url": r["url"],
                    })
            elif mod == "news":
                rows = conn.execute(
                    """
                    SELECT title_zh, importance, source FROM ai_news
                    WHERE date(publish_date)=? AND importance >= 2
                    ORDER BY importance DESC, datetime(created_at) DESC LIMIT 5
                    """, (today,),
                ).fetchall()
                for r in rows:
                    section["items"].append({
                        "kind": "list",
                        "title": r["title_zh"][:120],
                        "meta": f"★{r['importance']} · {r['source']}",
                    })
            elif mod == "arxiv":
                rows = conn.execute(
                    """
                    SELECT title, one_line_zh, relevance_score, abs_url
                    FROM arxiv_papers
                    WHERE date(fetched_at)=?
                    ORDER BY relevance_score DESC, datetime(fetched_at) DESC LIMIT 5
                    """, (today,),
                ).fetchall()
                for r in rows:
                    section["items"].append({
                        "kind": "list",
                        "title": f"[{r['relevance_score']}/5] {r['title'][:80]}",
                        "meta": r["one_line_zh"][:120],
                        "url": r["abs_url"],
                    })
            elif mod == "school":
                rows = conn.execute(
                    """
                    SELECT title, summary, event_type, relevance FROM school_events
                    WHERE date(created_at)=? ORDER BY relevance DESC LIMIT 5
                    """, (today,),
                ).fetchall()
                for r in rows:
                    section["items"].append({
                        "kind": "list",
                        "title": r["title"][:120],
                        "meta": f"★{r['relevance']} · {r['event_type']} · {(r['summary'] or '')[:80]}",
                    })
            elif mod == "english":
                row = conn.execute(
                    "SELECT word_ids, phrase_ids FROM daily_english WHERE date=?",
                    (today,),
                ).fetchone()
                if row:
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
                            f"SELECT word, definition FROM english_words WHERE id IN ({ph})", word_ids
                        ).fetchall()]
                    phrases = []
                    if phrase_ids:
                        ph = ",".join("?" * len(phrase_ids))
                        phrases = [dict(r) for r in conn.execute(
                            f"SELECT phrase, meaning_zh FROM english_phrases WHERE id IN ({ph})", phrase_ids
                        ).fetchall()]
                    section["items"].append({
                        "kind": "english",
                        "words": words[:5],
                        "phrases": phrases[:3],
                    })
            elif mod == "finance":
                quotes = [dict(r) for r in conn.execute(
                    "SELECT symbol, price, change_pct FROM finance_quotes WHERE date=?",
                    (today,),
                ).fetchall()]
                news_rows = [dict(r) for r in conn.execute(
                    """
                    SELECT title_zh, affects FROM finance_news
                    WHERE date(publish_date)=? ORDER BY importance DESC LIMIT 3
                    """, (today,),
                ).fetchall()]
                section["items"].append({"kind": "finance", "quotes": quotes, "news": news_rows})
            elif mod == "github":
                rows = conn.execute(
                    """
                    SELECT full_name, brief_zh, stars_today, language, url
                    FROM github_repos WHERE date(last_seen_at)=?
                    ORDER BY current_rank LIMIT 5
                    """, (today,),
                ).fetchall()
                for r in rows:
                    section["items"].append({
                        "kind": "list",
                        "title": f"{r['full_name']} (+{r['stars_today']} ⭐)",
                        "meta": r["brief_zh"][:120] if r["brief_zh"] else (r["language"] or ""),
                        "url": r["url"],
                    })
            elif mod == "deals":
                rows = conn.execute(
                    """
                    SELECT title, category, expire_date, url, requirements
                    FROM deals WHERE date(created_at)=? AND is_active=1
                    ORDER BY date(expire_date) ASC LIMIT 5
                    """, (today,),
                ).fetchall()
                for r in rows:
                    section["items"].append({
                        "kind": "list",
                        "title": r["title"][:120],
                        "meta": f"[{r['category']}] 截止 {r['expire_date']} · {r['requirements'] or ''}",
                        "url": r["url"],
                    })

            if mod not in ("quant", "leetcode"):
                if not section["items"]:
                    empty_modules.append((mod, title))
            elif not section["items"]:
                empty_modules.append((mod, title))

            sections.append(section)

    return sections, failed_modules, empty_modules


def render_html(sections, failed, empty, today):
    """纯 HTML 邮件（兼容主流客户端）"""
    parts = [f'<h1 style="font-family:serif;color:#1D1D1F;font-weight:500">📅 {today} 摘要</h1>']

    parts.append(f'<p style="color:#6E6E73">完整内容请访问 <a href="{SITE_BASE_URL}">{SITE_BASE_URL}</a></p>')

    if failed:
        parts.append('<h2 style="color:#FF3B30;font-size:1.1rem">⚠️ 抓取失败模块</h2><ul>')
        for mod, title, err in failed:
            short = err[:120].replace("<", "&lt;").replace(">", "&gt;")
            parts.append(f'<li><b>{title}</b> ({mod}): <code style="background:#F5F5F7;padding:1px 6px;border-radius:3px">{short}</code></li>')
        parts.append("</ul>")

    if empty:
        parts.append('<h2 style="color:#FF9500;font-size:1.1rem">📭 当日空数据</h2><ul>')
        for mod, title in empty:
            parts.append(f'<li>{title} ({mod})</li>')
        parts.append("</ul>")

    for sec in sections:
        parts.append(f'<h2 style="font-family:serif;font-size:1.2rem;margin-top:24px;border-bottom:1px solid #E8E8ED;padding-bottom:4px">{sec["title"]}</h2>')
        if not sec["items"]:
            parts.append('<p style="color:#86868B">（无内容）</p>')
            continue
        for it in sec["items"]:
            if it.get("kind") == "qcard":
                parts.append(
                    f'<div style="padding:8px 0;border-bottom:1px solid #f0f0f0">'
                    f'<div style="font-weight:500">{it["title"]}</div>'
                    f'<div style="color:#6E6E73;font-size:0.9em">{it.get("meta","")}</div>'
                    f'</div>'
                )
            elif it.get("kind") == "list":
                link_open = f'<a href="{it.get("url", SITE_BASE_URL)}" style="color:#0071E3">' if it.get("url") else ""
                link_close = '</a>' if it.get("url") else ""
                parts.append(
                    f'<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:0.95em">'
                    f'{link_open}<b>{it["title"]}</b>{link_close}'
                    f'<div style="color:#6E6E73;font-size:0.85em">{it.get("meta","")}</div>'
                    f'</div>'
                )
            elif it.get("kind") == "english":
                words_html = " · ".join(f'<code style="background:#F5F5F7;padding:1px 6px;border-radius:3px">{w["word"]}</code>' for w in it.get("words", []))
                phrases_html = "; ".join(f'<b>{p["phrase"]}</b>：{p["meaning_zh"]}' for p in it.get("phrases", []))
                parts.append(f'<div><b>单词：</b> {words_html}<br/><b>短语：</b> {phrases_html}</div>')
            elif it.get("kind") == "finance":
                qs = it.get("quotes", [])
                if qs:
                    q_html = " ".join(
                        f'<code style="background:#F5F5F7;padding:2px 8px;border-radius:3px">'
                        f'<b>{q["symbol"]}</b> {q["price"]:.2f} '
                        f'<span style="color:{"#34C759" if q["change_pct"]>=0 else "#FF3B30"}">{q["change_pct"]:+.2f}%</span>'
                        f'</code>' for q in qs if q.get("price") is not None)
                    parts.append(f'<p>行情：{q_html}</p>')
                for n in it.get("news", []):
                    parts.append(f'<div style="padding:4px 0;font-size:0.9em">· {n["title_zh"][:120]}</div>')

    parts.append('<hr style="border:none;border-top:1px solid #E8E8ED;margin:24px 0"/>')
    parts.append('<p style="color:#86868B;font-size:0.8em">AutoTreehole Daily · 自动生成的每日信息摘要</p>')

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1D1D1F;line-height:1.6">
{"".join(parts)}
</body></html>"""


def send_email(subject: str, html: str):
    if not QQ_EMAIL_AUTH_CODE:
        raise RuntimeError("QQ_EMAIL_AUTH_CODE 未设置")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr(("AutoTreehole Daily", QQ_EMAIL))
    msg["To"] = EMAIL_TO
    msg.attach(MIMEText(html, "html", "utf-8"))

    # QQ 邮箱 SMTP SSL 端口 465
    with smtplib.SMTP_SSL("smtp.qq.com", 465, timeout=30) as s:
        s.login(QQ_EMAIL, QQ_EMAIL_AUTH_CODE)
        s.send_message(msg)


def main():
    today = today_str()
    sections, failed, empty = fetch_today_summary()
    log.info(f"sections={len(sections)} failed={len(failed)} empty={len(empty)}")

    # 主题：有失败则警示
    if failed:
        subject = f"⚠️ AutoTreehole Daily · {today} · {len(failed)} 个模块失败"
    elif not sections or all(not s["items"] for s in sections):
        subject = f"📭 AutoTreehole Daily · {today} · 今日数据全部为空"
    else:
        subject = f"📅 AutoTreehole Daily · {today} 摘要"

    html = render_html(sections, failed, empty, today)
    send_email(subject, html)
    log.info(f"邮件已发送 → {EMAIL_TO}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # 邮件脚本自身的失败也要通知用户
        log.exception(f"email_digest 失败: {e}")
        try:
            send_email(
                f"❌ AutoTreehole Daily · {today_str()} · 邮件脚本异常",
                f"<pre>{traceback.format_exc()}</pre>",
            )
        except Exception:
            log.exception("连失败通知都发不出")
