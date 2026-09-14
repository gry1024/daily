"""
配置：从 .env 读取所有密钥和开关
"""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def get(name: str, default: str = None, required: bool = False) -> str:
    v = os.getenv(name, default)
    if required and not v:
        raise RuntimeError(f"环境变量 {name} 未设置（.env 是否已填？）")
    return v


def get_bool(name: str, default: bool = False) -> bool:
    return get(name, str(default)).lower() in ("true", "1", "yes", "on")


def get_int(name: str, default: int) -> int:
    try:
        return int(get(name, str(default)))
    except ValueError:
        return default


def get_list(name: str, default: str = "") -> list:
    raw = get(name, default)
    return [x.strip() for x in raw.split(",") if x.strip()]


# —— LLM ——
MINIMAX_BASE_URL = get("MINIMAX_BASE_URL", "https://api.minimaxi.com/v1")
MINIMAX_API_KEY = get("MINIMAX_API_KEY", required=False) or "sk-placeholder"
MINIMAX_MODEL = get("MINIMAX_MODEL", "MiniMax-M3")

# —— 邮件 ——
QQ_EMAIL = get("QQ_EMAIL", "")
QQ_EMAIL_AUTH_CODE = get("QQ_EMAIL_AUTH_CODE", "")
EMAIL_TO = get("EMAIL_TO", QQ_EMAIL)

# —— 应用 ——
APP_HOST = get("APP_HOST", "127.0.0.1")
APP_PORT = get_int("APP_PORT", 8001)
APP_TZ = get("APP_TZ", "Asia/Shanghai")
SITE_BASE_URL = get("SITE_BASE_URL", "https://autotreehole.cn/daily")

# —— 数据保留 ——
TTL_NEWS = get_int("TTL_NEWS", 90)
TTL_FINANCE_NEWS = get_int("TTL_FINANCE_NEWS", 14)
TTL_SCHOOL = get_int("TTL_SCHOOL", 14)
DEALS_DEFAULT_EXPIRE_DAYS = get_int("DEALS_DEFAULT_EXPIRE_DAYS", 14)

# —— 抓取开关 ——
ENABLE = {
    "quant": get_bool("ENABLE_QUANT", True),
    "news": get_bool("ENABLE_NEWS", True),
    "arxiv": get_bool("ENABLE_ARXIV", True),
    "school": get_bool("ENABLE_SCHOOL", True),
    "leetcode": get_bool("ENABLE_LEETCODE", True),
    "english": get_bool("ENABLE_ENGLISH", True),
    "finance": get_bool("ENABLE_FINANCE", True),
    "github": get_bool("ENABLE_GITHUB", True),
    "deals": get_bool("ENABLE_DEALS", True),
}

# —— 关键词 ——
QUANT_KEYWORDS = get_list("QUANT_KEYWORDS", "九坤,幻方,明汯,衍复,锐天,致诚卓远,灵均,Optiver,Jane Street,Two Sigma,Citadel,DE Shaw")

# —— 访问控制 ——
REQUIRE_AUTH = get_bool("REQUIRE_AUTH", False)

# —— 日志 ——
LOG_LEVEL = get("LOG_LEVEL", "INFO")

# —— 路径 ——
DATA_DIR = ROOT / "data"
LOGS_DIR = ROOT / "logs"
DB_PATH = DATA_DIR / "daily.db"
BACKUPS_DIR = ROOT / "backups"
