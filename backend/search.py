"""
抓取工具：RSS / arxiv API / 通用 HTTP / DuckDuckGo HTML 搜索（无 key）
"""
import hashlib
import logging
import re
from typing import Optional
from urllib.parse import quote_plus, urlparse

import feedparser
import httpx
import requests
from bs4 import BeautifulSoup

log = logging.getLogger("search")

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def http_get(url: str, *, timeout: int = 20, headers: dict = None, allow_redirects: bool = True) -> Optional[str]:
    """同步 GET，返回 HTML 文本"""
    try:
        r = requests.get(
            url,
            timeout=timeout,
            headers={**DEFAULT_HEADERS, **(headers or {})},
            allow_redirects=allow_redirects,
        )
        r.raise_for_status()
        r.encoding = r.apparent_encoding or "utf-8"
        return r.text
    except Exception as e:
        log.warning(f"HTTP GET 失败 {url}: {e}")
        return None


async def http_get_async(url: str, *, timeout: int = 20, headers: dict = None) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as cli:
            r = await cli.get(url, headers={**DEFAULT_HEADERS, **(headers or {})})
            r.raise_for_status()
            return r.text
    except Exception as e:
        log.warning(f"HTTP GET (async) 失败 {url}: {e}")
        return None


def fetch_rss(url: str, *, max_items: int = 50) -> list[dict]:
    """
    拉 RSS，返回 [{title, url, summary, published, source}, ...]
    """
    try:
        feed = feedparser.parse(url)
        items = []
        for entry in feed.entries[:max_items]:
            items.append({
                "title": getattr(entry, "title", ""),
                "url": getattr(entry, "link", ""),
                "summary": getattr(entry, "summary", "") or getattr(entry, "description", ""),
                "published": getattr(entry, "published", "") or getattr(entry, "updated", ""),
                "source": urlparse(url).netloc,
            })
        return items
    except Exception as e:
        log.warning(f"RSS 拉取失败 {url}: {e}")
        return []


def bing_search(query: str, *, max_results: int = 10) -> list[dict]:
    """
    Bing HTML 搜索（无 key）。
    返回 [{title, url, snippet}, ...]
    """
    url = f"https://www.bing.com/search?q={quote_plus(query)}"
    html = http_get(url, timeout=15)
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    results = []
    # Bing 结果在 <li class="b_algo"> 里
    for item in soup.select("li.b_algo")[:max_results]:
        a = item.select_one("h2 a")
        snippet_el = item.select_one(".b_caption p")
        if not a:
            continue
        href = a.get("href", "")
        if not href or href.startswith("javascript:"):
            continue
        results.append({
            "title": a.get_text(strip=True),
            "url": href,
            "snippet": (snippet_el.get_text(strip=True) if snippet_el else ""),
        })
    return results


def ddg_search(query: str, *, max_results: int = 10) -> list[dict]:
    """
    DuckDuckGo HTML 搜索（无 key）。如失败兜底到 Bing。
    """
    try:
        url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        html = http_get(url, timeout=10)
        if html:
            soup = BeautifulSoup(html, "lxml")
            results = []
            for item in soup.select("div.result")[:max_results]:
                a = item.select_one("a.result__a")
                snippet_el = item.select_one("a.result__snippet") or item.select_one(".result__snippet")
                if not a:
                    continue
                href = a.get("href", "")
                if "uddg=" in href:
                    from urllib.parse import parse_qs
                    qs = parse_qs(urlparse(href).query)
                    real = qs.get("uddg", [href])[0]
                    href = real
                results.append({
                    "title": a.get_text(strip=True),
                    "url": href,
                    "snippet": (snippet_el.get_text(strip=True) if snippet_el else ""),
                })
            if results:
                return results
    except Exception:
        pass
    # 兜底到 Bing
    log.info(f"DDG 失败，兜底到 Bing: {query[:30]}")
    return bing_search(query, max_results=max_results)


def ddg_news_search(query: str, *, max_results: int = 10) -> list[dict]:
    """DuckDuckGo 新闻搜索"""
    url = f"https://duckduckgo.com/html/?q={quote_plus(query)}&iar=news&ia=news"
    return ddg_search_url(url, max_results=max_results)


def ddg_search_url(url: str, *, max_results: int = 10) -> list[dict]:
    html = http_get(url, timeout=15)
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    results = []
    for item in soup.select("div.result")[:max_results]:
        a = item.select_one("a.result__a")
        snippet_el = item.select_one("a.result__snippet") or item.select_one(".result__snippet")
        if not a:
            continue
        href = a.get("href", "")
        if "uddg=" in href:
            from urllib.parse import parse_qs
            qs = parse_qs(urlparse(href).query)
            href = qs.get("uddg", [href])[0]
        results.append({
            "title": a.get_text(strip=True),
            "url": href,
            "snippet": (snippet_el.get_text(strip=True) if snippet_el else ""),
        })
    return results


def url_hash(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def url_fingerprint(url: str) -> str:
    """
    比 url_hash 更宽容的去重键：忽略 www./m./尾部斜杠/query 中常见 utm 参数
    """
    from urllib.parse import urlparse, parse_qs, urlencode
    u = urlparse(url.lower().strip())
    host = u.netloc.lstrip("www.").lstrip("m.")
    # 去掉常见 utm
    qs = parse_qs(u.query)
    qs = {k: v for k, v in qs.items() if not k.startswith("utm_")}
    new_q = urlencode(qs, doseq=True)
    path = u.path.rstrip("/")
    return f"{host}{path}?{new_q}".rstrip("?")


def clean_html_to_text(html: str, *, max_len: int = 8000) -> str:
    """HTML → 纯文本（用于塞给 LLM）"""
    if not html:
        return ""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    text = re.sub(r"\n\s*\n", "\n\n", text)
    return text[:max_len]


def extract_main_text(url: str, *, max_len: int = 8000) -> str:
    """抓取 URL 并提取正文文本"""
    html = http_get(url)
    if not html:
        return ""
    return clean_html_to_text(html, max_len=max_len)
