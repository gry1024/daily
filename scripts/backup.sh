#!/usr/bin/env bash
# 数据库每日备份，保留 30 天
set -e
BACKUP_DIR=/home/groy/daily/backups
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y-%m-%d_%H%M%S)
DB=/home/groy/daily/data/daily.db

# SQLite 在线备份
sqlite3 "$DB" ".backup '$BACKUP_DIR/daily_${TS}.db'"

# 删除 30 天前的
find "$BACKUP_DIR" -name "daily_*.db" -mtime +30 -delete

echo "[$(date '+%F %T')] backup done: daily_${TS}.db"
