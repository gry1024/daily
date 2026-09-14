"""
AI News 抓取
- 主路径：机器之心 / 36氪 RSS
- 兜底：duckduckgo 搜索（关键词 "AI 新闻"）
- LLM 摘要 + 分类 + 重要度
"""
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str, now_str, in_days
from backend.config import TTL_NEWS
from backend.search import fetch_rss, ddg_search
from backend.llm import chat_json
from backend.runtime import run_with_logging


NEWS_RSS = [
    # Tier 1 — 一手官方 / 模型实验室
    ("https://openai.com/news/rss.xml", "OpenAI"),
    ("https://blogs.nvidia.com/feed/", "NVIDIA"),
    ("https://qwenlm.github.io/blog/index.xml", "Qwen"),
    ("https://machinelearning.apple.com/rss.xml", "Apple ML"),
    ("https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml", "MIT News"),
    # Tier 2 — 权威科技媒体 / newsletter
    ("https://aws.amazon.com/blogs/machine-learning/feed/", "AWS ML"),
    ("https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "The Verge"),
    ("https://techcrunch.com/category/artificial-intelligence/feed/", "TechCrunch"),
    ("https://arstechnica.com/ai/feed/", "Ars Technica"),
    ("https://www.technologyreview.com/topic/artificial-intelligence/feed", "MIT Tech Review"),
    ("https://www.wired.com/feed/tag/ai/latest/rss", "Wired"),
    ("https://the-decoder.com/feed/", "The Decoder"),
    ("https://www.marktechpost.com/feed/", "MarkTechPost"),
    ("https://semianalysis.com/feed/", "SemiAnalysis"),
    ("https://news.smol.ai/rss.xml", "smol.ai"),
    ("https://simonwillison.net/atom/everything/", "Simon Willison"),
    ("https://lilianweng.github.io/index.xml", "Lilian Weng"),
    ("https://magazine.sebastianraschka.com/feed", "Sebastian Raschka"),
    ("https://thegradient.pub/rss/", "The Gradient"),
    ("https://jack-clark.net/feed/", "Jack Clark"),
    ("https://www.interconnects.ai/feed", "Interconnects"),
    ("https://www.latent.space/feed", "Latent Space"),
    ("https://www.oneusefulthing.org/feed", "One Useful Thing"),
    ("https://www.bensbites.com/feed", "Ben's Bites"),
    # Tier 3 — 中文
    ("https://www.qbitai.com/feed", "量子位"),
    ("https://www.infoq.cn/feed", "InfoQ"),
    ("https://sspai.com/feed", "少数派"),
    ("https://www.ithome.com/rss/", "IT 之家"),
]


DDG_QUERIES = [
    "AI 新闻 2026年9月",
    "大模型 最新 发布 OpenAI Anthropic",
    "LLM agent 突破 论文",
    "人工智能 融资 创业 2026",
]


def fetch_candidates(log):
    items = []
    # RSS 抓取（28 个源，每个最多 8 条以提速）
    for rss_url, source in NEWS_RSS:
        try:
            rss_items = fetch_rss(rss_url, max_items=8)
            for it in rss_items:
                it["source"] = source
                items.append(it)
            log.info(f"  RSS {source}: {len(rss_items)} 条")
        except Exception as e:
            log.warning(f"  RSS 失败 {rss_url}: {e}")
        time.sleep(0.3)

    # DDG 搜索兜底
    for q in DDG_QUERIES:
        try:
            results = ddg_search(q, max_results=8)
            for r in results:
                r["source"] = f"ddg"
                items.append(r)
            log.info(f"  DDG '{q[:30]}': {len(results)} 条")
        except Exception as e:
            log.warning(f"  DDG '{q[:30]}' 失败: {e}")
        time.sleep(1)

    # 去重
    seen = set()
    fresh = []
    for it in items:
        u = it.get("url", "")
        u_clean = u.split("?")[0].rstrip("/")
        if u_clean and u_clean not in seen:
            seen.add(u_clean)
            fresh.append(it)

    log.info(f"共 {len(fresh)} 条去重")
    return fresh


def llm_summarize_batch(items, log):
    """
    LLM 批量摘要。items 数组，每条返回 {idx, title_zh, summary_zh, category, importance, sentiment}
    """
    if not items:
        return []

    # 拼接 prompt（限长）
    blob = "\n\n".join([
        f"[{i+1}] {it.get('title','')}\n摘要原文: {re.sub('<[^>]+>', '', it.get('summary','') or '')[:300]}\nURL: {it.get('url','')}"
        for i, it in enumerate(items)
    ])

    sys_prompt = "你是 AI 行业新闻编辑。严格按 JSON schema 输出，不输出任何额外文字。"
    user_prompt = (
        "从下列 AI 行业新闻中筛出与【人工智能 / 大模型 / LLM / agent / OpenAI / Anthropic / Google DeepMind / 融资 / 重要论文】相关的重要条目，"
        "剔除无关（如：纯娱乐、消费电子评测、社会新闻）。\n\n"
        f"列表：\n{blob}\n\n"
        "严格输出 JSON（无 markdown 包裹）：\n"
        "{\"news\": [\n"
        "  {\"idx\": 1, \"keep\": true, \"title_zh\": \"中文标题\", "
        "\"summary_zh\": \"50-100 字摘要\", "
        "\"category\": \"product/funding/research/opinion\", "
        "\"importance\": 1-3, "
        "\"sentiment\": \"positive/neutral/negative\"}\n"
        "]}\n"
        "硬要求：每条 summary 必须中文，必须基于原摘要内容，不编造。"
    )
    result = chat_json(sys_prompt, user_prompt, temperature=0.3)
    if not result or "news" not in result:
        log.warning("LLM 摘要失败")
        return []
    return [n for n in result["news"] if n.get("keep")]


def main(log):
    today = today_str()
    expire = in_days(TTL_NEWS)

    candidates = fetch_candidates(log)

    # 查重
    with get_conn() as conn:
        existing = {r["url"] for r in conn.execute(
            "SELECT url FROM ai_news WHERE created_at >= date('now','localtime','-30 day')"
        ).fetchall()}

    fresh = [it for it in candidates if it["url"] not in existing]
    log.info(f"过滤已存在: {len(fresh)} 全新 / {len(candidates)-len(fresh)} 重复")

    if not fresh:
        return {"fetched": 0, "inserted": 0, "skipped": len(existing)}

    # 限 20 条喂给 LLM
    fresh = fresh[:20]

    # 批量 LLM（5 条/批）— 限制 LLM 总耗时：8 分钟
    summarized = []
    llm_deadline = time.time() + 480  # 8 分钟截止
    for i in range(0, len(fresh), 5):
        if time.time() > llm_deadline:
            log.warning(f"  LLM 达到 8 分钟时限，剩余 {len(fresh)-i} 条跳过")
            break
        batch = fresh[i:i+5]
        try:
            res = llm_summarize_batch(batch, log)
            for n in res:
                idx = n.get("idx", 0) - 1
                if 0 <= idx < len(batch):
                    summarized.append({**batch[idx], **n})
            log.info(f"  batch {i//5+1}: {len(res)}/{len(batch)} 保留")
        except Exception as e:
            log.warning(f"  batch {i//5+1} 失败: {e}")
        time.sleep(0.5)

    # 入库
    inserted = 0
    with get_conn() as conn:
        for it in summarized:
            try:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO ai_news
                      (publish_date, source, url, title_zh, summary_zh,
                       category, importance, sentiment, raw_title, raw_content, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        today,
                        it.get("source", ""),
                        it.get("url", "")[:500],
                        it.get("title_zh", "")[:300],
                        it.get("summary_zh", "")[:1000],
                        it.get("category", "research"),
                        it.get("importance", 1),
                        it.get("sentiment", "neutral"),
                        it.get("title", "")[:300],
                        (it.get("summary", "") or "")[:5000],
                        expire,
                    ),
                )
                inserted += 1
            except Exception as e:
                log.warning(f"insert 失败: {e}")

    log.info(f"最终插入 {inserted} 条")
    return {"fetched": len(fresh), "inserted": inserted, "skipped": len(existing)}


if __name__ == "__main__":
    run_with_logging("news", main)
