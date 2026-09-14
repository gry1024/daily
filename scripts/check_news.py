import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from backend.db import get_conn
c = get_conn()
print("ai_news total:", c.execute("SELECT COUNT(*) FROM ai_news").fetchone()[0])
rows = c.execute(
    "SELECT title_zh, importance, source FROM ai_news ORDER BY created_at DESC LIMIT 15"
).fetchall()
for r in rows:
    star = "★" * (r["importance"] or 0)
    print(f'  {star:3s} {r["source"][:18]:18s} | {r["title_zh"][:65]}')
