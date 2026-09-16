"""
SQLite 连接与 schema。
全部表 snake_case 复数；命名占位符防 SQL 注入。
"""
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path

from .config import DB_PATH, DATA_DIR, APP_TZ
import pytz

_tz = pytz.timezone(APP_TZ)
_lock = threading.Lock()

SCHEMA = """
-- ===== 全局 =====
CREATE TABLE IF NOT EXISTS fetch_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT,                  -- 'success' / 'partial' / 'failed'
  items_fetched INTEGER DEFAULT 0,
  items_inserted INTEGER DEFAULT 0,
  items_skipped INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== 模块 1: Quant =====
CREATE TABLE IF NOT EXISTS quant_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,                 -- 'probability' / 'brain_teaser' / 'math' / 'stats' / 'stochastic'
  sub_category TEXT,            -- 'bayes' / 'combinatorics' / 'martingale' / 'random_walk' / 'expectation' ...
  source TEXT,                  -- 'red_book' / 'green_book' / 'web' / 'interview' / 'classic'
  difficulty INTEGER,           -- 1-5 (内部)
  difficulty_label TEXT,        -- 'Easy' / 'Medium' / 'Hard' / 'Very Hard'
  question_en TEXT,
  question_zh TEXT,
  answer TEXT,                  -- 简短答案
  problem_md TEXT,              -- 完整题目（markdown）
  examples_md TEXT,             -- 示例
  constraints_md TEXT,          -- 约束
  hints_md TEXT,                -- 3 个渐进提示，|HINT_N| 分隔
  tags TEXT,                    -- 逗号分隔
  -- 新增：完整学习内容
  model_name TEXT,              -- 背后模型名称（如「Coupon Collector Problem」）
  model_description_md TEXT,    -- 模型简介 + 公式
  variations_md TEXT,           -- 类似题变种列表
  insights_md TEXT,             -- 关键洞察
  -- 统计
  shown_count INTEGER DEFAULT 0,
  solved_count INTEGER DEFAULT 0,
  last_shown_at DATE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_quant (
  date TEXT,
  position INTEGER,              -- 1-5 在当天的位置
  question_id INTEGER REFERENCES quant_questions(id),
  PRIMARY KEY (date, question_id)
);

-- ===== 模块 2: AI News =====
CREATE TABLE IF NOT EXISTS ai_news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publish_date TEXT,
  source TEXT,
  url TEXT UNIQUE,
  title_zh TEXT,
  summary_zh TEXT,
  category TEXT,
  importance INTEGER,
  sentiment TEXT,
  raw_title TEXT,
  raw_content TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== 模块 3: Arxiv =====
CREATE TABLE IF NOT EXISTS arxiv_papers (
  arxiv_id TEXT PRIMARY KEY,
  published TEXT,
  title TEXT,
  authors TEXT,
  abstract TEXT,
  abs_url TEXT,
  pdf_url TEXT,
  category TEXT,
  relevance_score INTEGER,
  one_line_zh TEXT,
  contributions TEXT,
  fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_arxiv_pub ON arxiv_papers(published);

-- ===== 模块 4: School =====
CREATE TABLE IF NOT EXISTS school_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publish_date TEXT,
  event_date TEXT,
  expire_date TEXT,
  title TEXT,
  summary TEXT,
  url TEXT UNIQUE,
  source TEXT,
  event_type TEXT,
  location TEXT,
  relevance INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_school_expire ON school_events(expire_date);

-- ===== 模块 5: LeetCode =====
CREATE TABLE IF NOT EXISTS leetcode_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lc_id INTEGER,
  title_en TEXT,
  title_zh TEXT,
  difficulty TEXT,
  tags TEXT,
  url TEXT,
  description_md TEXT,          -- 完整题目描述（markdown，含示例/约束）
  examples_md TEXT,
  constraints_md TEXT,
  hints_md TEXT,                -- 3 个提示，|HINT_N| 分隔
  solution_md TEXT,             -- 完整题解（markdown）
  complexity TEXT,
  order_in_hot100 INTEGER
);

CREATE TABLE IF NOT EXISTS daily_leetcode (
  date TEXT PRIMARY KEY,
  question_id INTEGER REFERENCES leetcode_questions(id)
);

-- ===== 模块 6: English =====
CREATE TABLE IF NOT EXISTS english_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT UNIQUE,
  phonetic TEXT,
  definition TEXT,
  example TEXT,
  collocations TEXT,
  synonyms_note TEXT,
  difficulty TEXT,
  last_shown_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS english_phrases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phrase TEXT,
  source_sentence TEXT,
  source_url TEXT,
  meaning_zh TEXT,
  meaning_en TEXT,
  alternatives TEXT,
  usage_note TEXT,
  fetched_date TEXT,
  last_shown_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_phrase_fetched ON english_phrases(fetched_date);

CREATE TABLE IF NOT EXISTS daily_english (
  date TEXT PRIMARY KEY,
  word_ids TEXT,
  phrase_ids TEXT
);

-- ===== 模块 7: Finance =====
CREATE TABLE IF NOT EXISTS finance_quotes (
  symbol TEXT,
  date TEXT,
  price REAL,
  change_pct REAL,
  PRIMARY KEY (symbol, date)
);

CREATE TABLE IF NOT EXISTS finance_news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publish_date TEXT,
  source TEXT,
  url TEXT UNIQUE,
  title_zh TEXT,
  summary_zh TEXT,
  affects TEXT,
  importance INTEGER,
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== 模块 8: GitHub Trending =====
CREATE TABLE IF NOT EXISTS github_repos (
  full_name TEXT PRIMARY KEY,
  url TEXT,
  description TEXT,
  language TEXT,
  stars_total INTEGER,
  stars_today INTEGER,
  first_seen_at TEXT,
  last_seen_at TEXT,
  current_rank INTEGER,
  brief_zh TEXT,
  tags TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_github_last ON github_repos(last_seen_at);

-- ===== 模块 9: Deals =====
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publish_date TEXT,
  expire_date TEXT,
  category TEXT,
  title TEXT,
  source TEXT,
  url TEXT UNIQUE,
  requirements TEXT,
  note TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_deals_expire ON deals(expire_date);
CREATE INDEX IF NOT EXISTS idx_deals_category ON deals(category);
"""


def _ensure_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_conn() -> sqlite3.Connection:
    _ensure_dir()
    conn = sqlite3.connect(str(DB_PATH), timeout=30, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_cursor():
    """线程安全的 DB 上下文"""
    with _lock:
        conn = get_conn()
        try:
            yield conn
        finally:
            conn.close()


def init_schema():
    _ensure_dir()
    with db_cursor() as conn:
        conn.executescript(SCHEMA)


def now_str() -> str:
    """本地时间（无时区）— SQLite date() 兼容"""
    return datetime.now(_tz).strftime("%Y-%m-%d %H:%M:%S")


def today_str() -> str:
    return datetime.now(_tz).strftime("%Y-%m-%d")


def now_dt() -> datetime:
    return datetime.now(_tz)


def in_days(n: int) -> str:
    return (datetime.now(_tz) + timedelta(days=n)).strftime("%Y-%m-%d")


if __name__ == "__main__":
    init_schema()
    print(f"schema 初始化完成 → {DB_PATH}")
