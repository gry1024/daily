"""
去重工具
"""
from .search import url_fingerprint


def fp(url: str) -> str:
    return url_fingerprint(url)
