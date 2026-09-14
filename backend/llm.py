"""
minimax-m3 客户端（OpenAI 兼容协议）
单条失败不抛异常，返回 None 让上层 skip
"""
import json
import logging
import time
from typing import Optional

from openai import OpenAI, APIError, APITimeoutError, RateLimitError

from .config import MINIMAX_BASE_URL, MINIMAX_API_KEY, MINIMAX_MODEL

log = logging.getLogger("llm")

_client: Optional[OpenAI] = None


def _strip_think(content: str) -> str:
    """去除 minimax-m3 等模型输出开头的 <think>...</think> 推理块和 markdown 代码块包裹"""
    import re
    # 1) 整段 <think>...</think> 在最前面
    m = re.match(r"^\s*<think>.*?</think>\s*(.*)$", content, re.DOTALL)
    if m:
        content = m.group(1).strip()
    # 2) 兼容：多个 think 块交错出现
    cleaned = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    content = cleaned.strip()
    # 3) 去掉 ```json ... ``` 或 ``` ... ``` 包裹
    m2 = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", content, re.DOTALL)
    if m2:
        content = m2.group(1).strip()
    return content


def client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            base_url=MINIMAX_BASE_URL,
            api_key=MINIMAX_API_KEY,
            timeout=90.0,
        )
    return _client


def chat_json(
    system: str,
    user: str,
    *,
    model: str = None,
    temperature: float = 0.3,
    max_retries: int = 3,
) -> Optional[dict | list | str]:
    """
    调 LLM，期望返回 JSON。失败返回 None。
    """
    model = model or MINIMAX_MODEL
    last_err = None
    for attempt in range(max_retries):
        try:
            resp = client().chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=temperature,
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content
            if not content:
                return None
            content = _strip_think(content)
            return json.loads(content)
        except (APIError, APITimeoutError, RateLimitError) as e:
            last_err = e
            log.warning(f"LLM 调用失败 (attempt {attempt+1}/{max_retries}): {e}")
            time.sleep(2 ** attempt)
        except json.JSONDecodeError as e:
            last_err = e
            log.warning(f"LLM 返回非 JSON (attempt {attempt+1}): {e}")
            time.sleep(1)
        except Exception as e:
            last_err = e
            log.exception(f"LLM 未知错误: {e}")
            time.sleep(1)
    log.error(f"LLM 永久失败: {last_err}")
    return None


def chat_text(
    system: str,
    user: str,
    *,
    model: str = None,
    temperature: float = 0.4,
    max_retries: int = 3,
) -> Optional[str]:
    """自由文本返回"""
    model = model or MINIMAX_MODEL
    last_err = None
    for attempt in range(max_retries):
        try:
            resp = client().chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=temperature,
            )
            content = resp.choices[0].message.content
            if not content:
                return None
            return _strip_think(content)
        except (APIError, APITimeoutError, RateLimitError) as e:
            last_err = e
            log.warning(f"LLM 调用失败 (attempt {attempt+1}): {e}")
            time.sleep(2 ** attempt)
        except Exception as e:
            last_err = e
            log.exception(f"LLM 未知错误: {e}")
            time.sleep(1)
    log.error(f"LLM 永久失败: {last_err}")
    return None
