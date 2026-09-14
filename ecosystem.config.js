// PM2 配置（管 FastAPI 后端进程）
module.exports = {
  apps: [
    {
      name: 'daily-api',
      cwd: '/home/groy/daily',
      script: 'venv/bin/uvicorn',
      args: 'backend.app:app --host 127.0.0.1 --port 8001 --workers 1',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      max_memory_restart: '300M',
      autorestart: true,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
