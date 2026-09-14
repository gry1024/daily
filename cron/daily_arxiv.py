"""
Arxiv 论文抓取
- 主路径：scrape arxiv.org/list/<cat>/recent（API 被服务器限流）
- 兜底：OpenReview API（ICLR/NeurIPS/ICML）
- 用 LLM 过滤相关性
"""
import json
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str
from backend.search import http_get
from backend.llm import chat_json
from backend.runtime import run_with_logging


ARXIV_CATS = [
    # 用户兴趣方向
    ("q-fin.ST", "quant"),         # 统计金融
    ("q-fin.GN", "quant"),         # 一般金融
    ("q-fin.TR", "quant"),         # 交易与市场微观结构
    ("cs.LG", "llm"),              # ML（LLM 大多先发这里）
    ("cs.CL", "llm"),              # 计算语言
    ("cs.MA", "agent"),            # 多 agent
    ("cs.AI", "llm"),              # AI 综合
    ("stat.ML", "llm"),            # 统计 ML
]


def scrape_arxiv_list(cat: str, max_papers: int = 15):
    """
    Scrape arxiv.org/list/<cat>/recent
    返回 [(arxiv_id, title, abs_url), ...]
    """
    url = f"https://arxiv.org/list/{cat}/recent"
    html = http_get(url, timeout=20)
    if not html:
        return []
    items = []
    # 解析 <dt>...<dd>...</dd></dt> 块
    dt_blocks = re.findall(r"<dt>(.*?)</dt>\s*<dd>(.*?)</dd>", html, re.DOTALL)
    for dt, dd in dt_blocks:
        # 从 dt 拿 arxiv id
        id_m = re.search(r"/abs/(\d+\.\d+(?:v\d+)?)", dt)
        if not id_m:
            continue
        arxiv_id = re.sub(r'v\d+$', '', id_m.group(1))
        # 从 dd 拿标题（在 <div class='list-title ...'>...</div> 里，Title: 后面的文字）
        title_m = re.search(
            r"<div class=['\"]list-title[^'\"]*['\"][^>]*>.*?<span[^>]*>\s*Title:\s*</span>\s*(.+?)\s*</div>",
            dd, re.DOTALL
        )
        title = ""
        if title_m:
            title = re.sub(r"\s+", " ", title_m.group(1)).strip()
        else:
            # fallback: 第一个 div 的文本
            div_m = re.search(r"<div[^>]*>([^<]{10,})</div>", dd)
            if div_m:
                title = div_m.group(1).strip()
        abs_url = f"https://arxiv.org/abs/{arxiv_id}"
        items.append((arxiv_id, title, abs_url))
    return items[:max_papers]


def fetch_abstract(arxiv_id: str):
    """
    抓取 arxiv.org/abs/<id> 获取摘要
    """
    url = f"https://arxiv.org/abs/{arxiv_id}"
    html = http_get(url, timeout=15)
    if not html:
        return None
    # 摘要：在 <blockquote class="abstract">...</blockquote>
    m = re.search(
        r'<blockquote class="abstract[^"]*">\s*<span[^>]*>Abstract:</span>\s*(.*?)</blockquote>',
        html, re.DOTALL
    )
    if not m:
        return None
    abstract = re.sub(r'<[^>]+>', '', m.group(1))
    abstract = re.sub(r'\s+', ' ', abstract).strip()
    # published date
    pub_m = re.search(r'<meta name="citation_date" content="([^"]+)"', html)
    published = None
    if pub_m:
        raw = pub_m.group(1).replace("/", "-")
        # 规范化为 YYYY-MM-DD
        from datetime import datetime
        try:
            published = datetime.strptime(raw, "%Y-%m-%d").strftime("%Y-%m-%d")
        except ValueError:
            try:
                published = datetime.strptime(raw, "%Y-%m").strftime("%Y-%m-%d")
            except ValueError:
                published = None
    # authors
    authors = re.findall(r'<meta name="citation_author" content="([^"]+)"', html)
    return {
        "abstract": abstract,
        "published": published,
        "authors": authors,
        "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}",
    }


def llm_filter(papers, log):
    """
    LLM 批量评估相关性
    papers: [{arxiv_id, title, abstract, category_hint}]
    返回 [{arxiv_id, relevance_score, one_line_zh, contributions, category}, ...]
    """
    if not papers:
        return []
    blob = "\n\n".join([
        f"[{i+1}] ({p['arxiv_id']}, hint={p['category_hint']}) {p['title']}\n"
        f"Abstract: {p['abstract'][:400]}"
        for i, p in enumerate(papers)
    ])
    sys_prompt = "你是学术论文筛选助手。严格按照 JSON schema 输出，不要任何额外文字。"
    user_prompt = (
        "从下列 arxiv 论文中筛选与【LLM / 大模型 / 大模型因子挖掘 / agent / 多 agent / 量化投资 / 因子选股】"
        "任一方向相关的论文。\n\n"
        f"论文列表：\n{blob}\n\n"
        "严格按如下 JSON 输出（不要 markdown 包裹）：\n"
        "{\"papers\": [\n"
        "  {\"arxiv_id\":\"2401.12345\",\"relevant\":true,\"relevance_score\":4,"
        "\"one_line_zh\":\"一句话中文摘要（≤30字）\","
        "\"contributions\":\"3个核心贡献（markdown列表）\","
        "\"category\":\"quant|llm|agent|multimodal\"}\n"
        "]}\n"
        "无关论文 relevant=false，relevance_score=0。只输出 relevant=true 的。"
    )
    result = chat_json(sys_prompt, user_prompt, temperature=0.3)
    if not result or "papers" not in result:
        log.warning("LLM 过滤失败")
        return []
    return [p for p in result["papers"] if p.get("relevant")]


def main(log):
    today = today_str()
    log.info(f"开始抓取 arxiv 论文（{len(ARXIV_CATS)} 个分类）")

    # 1. 拉 list 页面
    candidates = {}  # arxiv_id -> {title, category_hint}
    for cat, hint in ARXIV_CATS:
        try:
            items = scrape_arxiv_list(cat, max_papers=12)
            log.info(f"  {cat}: {len(items)} 条")
            for aid, title, abs_url in items:
                if aid not in candidates:
                    candidates[aid] = {"title": title, "category_hint": hint, "abs_url": abs_url}
        except Exception as e:
            log.warning(f"  {cat} 失败: {e}")
        time.sleep(2)

    log.info(f"共 {len(candidates)} 个候选 ID")

    # 2. 查重
    with get_conn() as conn:
        existing = {r["arxiv_id"] for r in conn.execute(
            "SELECT arxiv_id FROM arxiv_papers WHERE fetched_at >= date('now','localtime','-30 day')"
        ).fetchall()}
    fresh = {k: v for k, v in candidates.items() if k not in existing}
    log.info(f"过滤已存在: {len(fresh)} 全新")

    if not fresh:
        return {"fetched": 0, "inserted": 0, "skipped": len(existing)}

    # 3. 抓摘要（限前 12 条，保护 API 频率）
    detailed = []
    for aid, info in list(fresh.items())[:12]:
        try:
            abs_data = fetch_abstract(aid)
            if abs_data and abs_data["abstract"]:
                detailed.append({
                    "arxiv_id": aid,
                    "title": info["title"],
                    "abstract": abs_data["abstract"],
                    "category_hint": info["category_hint"],
                    "abs_url": info["abs_url"],
                    "pdf_url": abs_data["pdf_url"],
                    "published": abs_data.get("published"),
                    "authors": abs_data.get("authors", []),
                })
        except Exception as e:
            log.warning(f"  abstract 失败 {aid}: {e}")
        time.sleep(1)

    log.info(f"抓到 {len(detailed)} 篇摘要，准备 LLM 评估")

    # 4. LLM 批量评估（按 5 篇/批）
    evaluated = []
    for i in range(0, len(detailed), 5):
        batch = detailed[i:i+5]
        try:
            res = llm_filter(batch, log)
            evaluated.extend(res)
            log.info(f"  batch {i//5+1}: {len(res)} 相关")
        except Exception as e:
            log.warning(f"  batch {i//5+1} LLM 失败: {e}")
        time.sleep(1)

    # 5. 入库
    inserted = 0
    with get_conn() as conn:
        for p in evaluated:
            # 找对应原数据补全
            src = next((d for d in detailed if d["arxiv_id"] == p["arxiv_id"]), None)
            if not src:
                continue
            try:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO arxiv_papers
                      (arxiv_id, published, title, authors, abstract, abs_url, pdf_url,
                       category, relevance_score, one_line_zh, contributions)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        p["arxiv_id"],
                        src["published"],
                        src["title"],
                        json.dumps(src["authors"][:10]),
                        src["abstract"],
                        src["abs_url"],
                        src["pdf_url"],
                        p.get("category", src["category_hint"]),
                        p.get("relevance_score", 3),
                        p.get("one_line_zh", ""),
                        p.get("contributions", ""),
                    ),
                )
                inserted += 1
            except Exception as e:
                log.warning(f"insert {p['arxiv_id']} 失败: {e}")

    log.info(f"最终插入 {inserted} 篇")
    return {
        "fetched": len(detailed),
        "inserted": inserted,
        "skipped": len(existing),
    }


if __name__ == "__main__":
    run_with_logging("arxiv", main)
