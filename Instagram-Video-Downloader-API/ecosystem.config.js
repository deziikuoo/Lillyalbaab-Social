module.exports = {
  apps: [
    {
      name: 'instagram-service',
      script: 'index.js',
      cwd: './Instagram-Video-Downloader-API',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/instagram-error.log',
      out_file: './logs/instagram-out.log',
      log_file: './logs/instagram-combined.log',
      time: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000
    },
    {
      name: 'snapchat-service',
      script: 'venv/Scripts/python.exe',
      args: '-m uvicorn server.main:app --reload --port 8000',
      cwd: './Snapchat-Service',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        PYTHONPATH: './Snapchat-Service'
      },
      error_file: './logs/snapchat-error.log',
      out_file: './logs/snapchat-out.log',
      log_file: './logs/snapchat-combined.log',
      time: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000
    }
  ]
};
