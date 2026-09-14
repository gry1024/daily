"""把精选 school_events 灌入生产数据库"""
import json, sys
sys.path.insert(0, "/home/groy/daily")
from backend.db import get_conn
with get_conn() as conn:
    # 清理旧的"无事件"记录（保留 curated / user_added）
    n = conn.execute(
        "DELETE FROM school_events WHERE event_date IS NULL OR source NOT IN ('curated', 'user_added')"
    ).rowcount
    print(f"cleaned {n} old generic rows")

    items = json.loads(open("/home/groy/daily/data/seeds/school_events.json").read())
    new = 0
    for it in items:
        cur = conn.execute("SELECT id FROM school_events WHERE url = ?", (it["url"],)).fetchone()
        if cur: continue
        conn.execute(
            """INSERT INTO school_events
                (publish_date, event_date, title, summary, url, source,
                 event_type, location, relevance, expire_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                it["event_date"], it["event_date"], it["title"], it["summary"],
                it["url"], it["source"], it["event_type"], it["location"],
                it["relevance"], it["event_date"],
            ),
        )
        new += 1
    print(f"新增 {new} 条精选事件")
    print(f"当前共 {conn.execute('SELECT COUNT(*) FROM school_events').fetchone()[0]} 条")
