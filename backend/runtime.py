"""
cron 脚本通用框架
- 写 fetch_logs
- 失败抛异常，由调用方处理
"""
import logging
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db import get_conn, today_str, now_str, in_days  # noqa: E402
from backend.config import LOGS_DIR, DATA_DIR, DEALS_DEFAULT_EXPIRE_DAYS, TTL_NEWS, TTL_FINANCE_NEWS, TTL_SCHOOL  # noqa: E402


def setup_logging(module: str):
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log = logging.getLogger(module)
    log.setLevel(logging.INFO)
    if log.handlers:
        return log
    fh = logging.FileHandler(LOGS_DIR / f"{module}.{today_str()}.log", encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
    log.addHandler(fh)
    log.addHandler(sh)
    return log


def record_fetch(module: str, status: str, items_fetched=0, items_inserted=0, items_skipped=0, error=None, started_at=None):
    """写一条 fetch_logs 记录"""
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO fetch_logs (module, started_at, finished_at, status, items_fetched, items_inserted, items_skipped, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                module,
                started_at or now_str(),
                now_str(),
                status,
                items_fetched,
                items_inserted,
                items_skipped,
                error,
            ),
        )


def run_with_logging(module: str, fn):
    """包装器：自动记录 fetch_logs + 重试 3 次"""
    log = setup_logging(module)
    started_at = now_str()
    last_err = None
    for attempt in range(3):
        try:
            log.info(f"开始抓取 (attempt {attempt+1}/3)")
            stats = fn(log) or {}
            record_fetch(
                module,
                status="success" if attempt == 0 else "partial",
                items_fetched=stats.get("fetched", 0),
                items_inserted=stats.get("inserted", 0),
                items_skipped=stats.get("skipped", 0),
                started_at=started_at,
            )
            log.info(f"完成: fetched={stats.get('fetched',0)} inserted={stats.get('inserted',0)} skipped={stats.get('skipped',0)}")
            return stats
        except Exception as e:
            last_err = e
            log.exception(f"attempt {attempt+1} 失败: {e}")
            time.sleep(5 * (attempt + 1))
    # 全部失败
    record_fetch(module, status="failed", error=str(last_err), started_at=started_at)
    log.error(f"3 次重试全部失败: {last_err}")
    raise last_err
