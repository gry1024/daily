// PM2 配置（管 FastAPI 后端进程）
module.exports = {
  apps: [
    {
      name: 'daily-api',
      cwd: '/home/groy/daily',
      interpreter: 'none',  // 不解释器，直接 exec
      script: './run_api.sh',
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
