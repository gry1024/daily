#!/usr/bin/env bash
# PM2 启动脚本：跑 FastAPI 后端
cd /home/groy/daily
source venv/bin/activate
exec python3 -m uvicorn backend.app:app --host 127.0.0.1 --port 8002 --workers 1 --no-access-log
