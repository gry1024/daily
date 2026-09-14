"""
GitHub Trending 抓取
- 主路径：scrape github.com/trending
- LLM 给 top 5 生成中文 brief
"""
import json
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str
from backend.search import http_get
from backend.llm import chat_json
from backend.runtime import run_with_logging


def fetch_trending(log, period: str = "daily"):
    """scrape github.com/trending"""
    url = f"https://github.com/trending?since={period}"
    html = http_get(url, timeout=20)
    if not html:
        return []

    items = []
    # 用 lxml 解析更稳
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")

    for article in soup.select("article.Box-row"):
        try:
            full_name = article.select_one("h2 a")
            if not full_name:
                continue
            full_name = full_name.get("href", "").strip("/")
            if not full_name:
                continue

            url = f"https://github.com/{full_name}"
            desc_el = article.select_one("p.col-9")
            description = desc_el.get_text(strip=True) if desc_el else ""

            lang_el = article.select_one("[itemprop='programmingLanguage']")
            language = lang_el.get_text(strip=True) if lang_el else ""

            # stars today
            stars_today = 0
            star_text_el = article.select_one(".d-inline-block.float-sm-right, span.float-sm-right")
            if star_text_el:
                m = re.search(r"([\d,]+)", star_text_el.get_text())
                if m:
                    stars_today = int(m.group(1).replace(",", ""))

            # total stars
            total_el = article.select_one("a[href$='/stargazers']")
            stars_total = 0
            if total_el:
                m = re.search(r"([\d,]+)", total_el.get_text())
                if m:
                    stars_total = int(m.group(1).replace(",", ""))

            items.append({
                "full_name": full_name,
                "url": url,
                "description": description,
                "language": language,
                "stars_today": stars_today,
                "stars_total": stars_total,
            })
        except Exception as e:
            log.warning(f"parse article failed: {e}")
            continue

    return items


def llm_brief_top5(repos, log):
    """对 top 5 生成中文 brief"""
    if not repos:
        return {}
    blob = "\n\n".join([
        f"[{i+1}] {r['full_name']} ({r['language']}, +{r['stars_today']} stars today)\n"
        f"Description: {r['description']}"
        for i, r in enumerate(repos[:5])
    ])
    sys_prompt = "你是 GitHub 项目精选编辑。严格按 JSON schema 输出。"
    user_prompt = (
        "为下列 GitHub 项目写一句中文简介（≤30 字），说明为什么值得一个做【AI / LLM / 量化 / agent / 工具】"
        "方向的研究生关注。\n\n"
        f"项目：\n{blob}\n\n"
        "输出 JSON（无 markdown 包裹）：\n"
        "{\"briefs\": [{\"idx\":1,\"brief_zh\":\"...\",\"tags\":\"comma,separated\"}]}"
    )
    result = chat_json(sys_prompt, user_prompt, temperature=0.3)
    if not result or "briefs" not in result:
        return {}
    return {b["idx"] - 1: b for b in result["briefs"] if b.get("idx")}


def main(log):
    today = today_str()

    repos = fetch_trending(log, period="daily")
    log.info(f"GitHub trending daily: {len(repos)} 条")

    if not repos:
        return {"fetched": 0, "inserted": 0, "skipped": 0}

    briefs = llm_brief_top5(repos, log)

    inserted = 0
    with get_conn() as conn:
        for rank, r in enumerate(repos, 1):
            brief_data = briefs.get(rank - 1, {})
            try:
                # upsert: 更新 last_seen_at 和 current_rank
                existing = conn.execute(
                    "SELECT full_name FROM github_repos WHERE full_name=?",
                    (r["full_name"],),
                ).fetchone()

                if existing:
                    conn.execute(
                        """
                        UPDATE github_repos SET
                          last_seen_at=?, current_rank=?, stars_today=?, stars_total=?
                        WHERE full_name=?
                        """,
                        (today, rank, r["stars_today"], r["stars_total"], r["full_name"]),
                    )
                else:
                    brief = brief_data.get("brief_zh", "")
                    tags = brief_data.get("tags", "")
                    conn.execute(
                        """
                        INSERT INTO github_repos
                          (full_name, url, description, language, stars_total, stars_today,
                           first_seen_at, last_seen_at, current_rank, brief_zh, tags)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            r["full_name"], r["url"], r["description"], r["language"],
                            r["stars_total"], r["stars_today"],
                            today, today, rank, brief, tags,
                        ),
                    )
                    inserted += 1
            except Exception as e:
                log.warning(f"insert {r['full_name']} 失败: {e}")

    log.info(f"新增 {inserted} 条（其余 {len(repos)-inserted} 更新排名）")
    return {"fetched": len(repos), "inserted": inserted, "skipped": 0}


if __name__ == "__main__":
    run_with_logging("github", main)
