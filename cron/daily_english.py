"""
English 每日选题
- 从词库选 10 个最少出现的词（按 last_shown_at 升序）
- 从英文新闻 RSS 拉 3 篇科技/商业/金融新闻
  - 用 LLM 提取 5 个短语（含原文上下文 + 中文释义 + 同义表达 + 用法）
- 写 daily_english
"""
import json
import re
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str, now_str
from backend.search import fetch_rss, http_get, clean_html_to_text
from backend.llm import chat_json
from backend.runtime import run_with_logging


EN_NEWS_RSS = [
    "https://hnrss.org/frontpage",
    "https://lobste.rs/rss",
]


def pick_words(log):
    today = today_str()
    half_year_ago = (None,)
    from datetime import date, timedelta
    d = date.fromisoformat(today)
    cutoff = (d - timedelta(days=180)).isoformat()

    with get_conn() as conn:
        # 选 10 个最久没出现的词
        rows = conn.execute(
            """
            SELECT id, word, difficulty FROM english_words
            WHERE last_shown_at IS NULL OR last_shown_at < ?
            ORDER BY last_shown_at ASC NULLS FIRST, RANDOM()
            LIMIT 10
            """,
            (cutoff,),
        ).fetchall()
        if not rows:
            rows = conn.execute(
                "SELECT id, word, difficulty FROM english_words ORDER BY RANDOM() LIMIT 10"
            ).fetchall()

        word_ids = [r["id"] for r in rows]
        # 更新 last_shown_at
        ph = ",".join("?" * len(word_ids))
        conn.execute(
            f"UPDATE english_words SET last_shown_at = ? WHERE id IN ({ph})",
            [today] + word_ids,
        )
        log.info(f"选词: {len(word_ids)} 个")
        return word_ids


def fetch_phrases(log, count: int = 5):
    """拉新闻 + LLM 提取短语"""
    log.info(f"拉取英文新闻 (RSS × {len(EN_NEWS_RSS)})")
    all_items = []
    for rss in EN_NEWS_RSS:
        try:
            items = fetch_rss(rss, max_items=5)
            all_items.extend(items)
        except Exception as e:
            log.warning(f"RSS 失败 {rss}: {e}")

    # 过滤掉太旧的（> 5 天）
    from datetime import datetime, timezone
    fresh = []
    for it in all_items:
        pub = it.get("published", "")
        if not pub:
            fresh.append(it)
            continue
        try:
            dt = datetime.strptime(pub[:25], "%a, %d %b %Y %H:%M:%S").replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - dt).days <= 5:
                fresh.append(it)
        except Exception:
            fresh.append(it)
    fresh = fresh[:15]  # 最多喂 15 条给 LLM

    if not fresh:
        log.warning("无可用新闻")
        return []

    # 拼接成 prompt
    text_blob = "\n\n".join([
        f"[{i+1}] {it['title']}\n{re.sub('<[^>]+>', '', it.get('summary','') or '')[:400]}"
        for i, it in enumerate(fresh)
    ])

    sys_prompt = (
        "你是英语短语词典编辑。严格按照用户给出的 JSON schema 输出，不要任何额外文字、解释、markdown。"
    )
    user_prompt = (
        f"从下列英文新闻中挑 5 个最有学习价值的短语/地道表达（商业/科技/金融场景，雅思~托福难度）。\n\n"
        f"新闻列表：\n{text_blob}\n\n"
        "严格返回如下 JSON（不要 markdown 代码块）：\n"
        "{\"phrases\": ["
        "{\"phrase\":\"短语原文\",\"source_sentence\":\"原文中含该短语的一句≤120字符\","
        "\"source_url\":\"该新闻URL\",\"meaning_zh\":\"中文释义\","
        "\"meaning_en\":\"英文释义20-50词\",\"alternatives\":\"同义表达逗号分隔\","
        "\"usage_note\":\"使用场景说明30-80字\"}]}\n"
        "硬性要求：短语 ≤ 6 个单词，必须是新闻中真实出现过的搭配，不能是单词或生硬造句。"
    )

    result = chat_json(sys_prompt, user_prompt, temperature=0.4)
    if not result or "phrases" not in result:
        log.warning("LLM 提取短语失败")
        return []
    return result["phrases"][:count]


def save_phrases(log, phrases):
    if not phrases:
        return []
    today = today_str()
    ids = []
    with get_conn() as conn:
        for p in phrases:
            cur = conn.execute(
                """
                INSERT INTO english_phrases
                  (phrase, source_sentence, source_url, meaning_zh, meaning_en, alternatives, usage_note, fetched_date, last_shown_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    p.get("phrase", ""),
                    p.get("source_sentence", "")[:300],
                    p.get("source_url", "")[:500],
                    p.get("meaning_zh", ""),
                    p.get("meaning_en", ""),
                    p.get("alternatives", ""),
                    p.get("usage_note", ""),
                    today,
                    today,
                ),
            )
            ids.append(cur.lastrowid)
    log.info(f"短语入库: {len(ids)}")
    return ids


def main(log):
    today = today_str()
    word_ids = pick_words(log)
    phrases = fetch_phrases(log)
    phrase_ids = save_phrases(log, phrases)

    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO daily_english (date, word_ids, phrase_ids) VALUES (?, ?, ?)",
            (today, json.dumps(word_ids), json.dumps(phrase_ids)),
        )
    log.info(f"daily_english 写入: words={len(word_ids)} phrases={len(phrase_ids)}")
    return {"fetched": len(phrases), "inserted": len(word_ids) + len(phrase_ids), "skipped": 0}


if __name__ == "__main__":
    run_with_logging("english", main)
