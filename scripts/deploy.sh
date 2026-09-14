#!/usr/bin/env bash
# AutoTreehole Daily · 一键部署
# 用法：在服务器上执行 bash scripts/deploy.sh
set -e

cd /home/groy/daily

echo "=== [1/6] git pull ==="
git pull origin main

echo "=== [2/6] install deps ==="
source venv/bin/activate || python3 -m venv venv && source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo "=== [3/6] init schema (idempotent) ==="
python3 scripts/init_db.py

echo "=== [4/6] restart pm2 ==="
pm2 restart daily-api --update-env || pm2 start ecosystem.config.js
pm2 save

echo "=== [5/6] setup cron ==="
# 安装 crontab（如果还没装）
CRON_LINE="0 5 * * * /home/groy/daily/cron/run_all.sh > /dev/null 2>&1
30 6 * * * /home/groy/daily/scripts/backup.sh > /home/groy/daily/logs/backup.log 2>&1
0 8 * * * /home/groy/daily/venv/bin/python3 /home/groy/daily/scripts/email_digest.py > /home/groy/daily/logs/email.log 2>&1
"
# 写入 crontab（保留其它 cron）
( crontab -l 2>/dev/null | grep -v "daily/cron/run_all.sh" | grep -v "daily/scripts/backup" | grep -v "daily/scripts/email_digest"; echo "$CRON_LINE" ) | crontab -
echo "Cron installed:"
crontab -l | grep daily

echo "=== [6/6] verify ==="
sleep 2
curl -s http://127.0.0.1:8001/api/health
echo ""
echo "=== nginx hint ==="
echo "记得手动把 nginx/daily.conf.snippet 插入到 /etc/nginx/sites-enabled/treehole"
echo "然后: sudo nginx -t && sudo systemctl reload nginx"

echo "=== deploy done at $(date '+%F %T') ==="
