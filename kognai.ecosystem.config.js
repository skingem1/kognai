// Kognai-native PM2 config — separate from ecosystem.config.js (Invoica). Run: pm2 start kognai.ecosystem.config.js

require('dotenv').config();

module.exports = {
  apps: [
    {
      name: 'kognai-router',
      script: 'runtime/router_server.py',
      interpreter: 'python3',
      cwd: '/Users/tarekmnif/kognai/runtime',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/Users/tarekmnif/kognai/logs/kognai-router.log',
      error_file: '/Users/tarekmnif/kognai/logs/kognai-router-error.log',
      env: {
        ROUTER_PORT: '11435',
        PYTHONPATH: '/Users/tarekmnif/kognai/runtime',
        VAULT_OLLAMA_URL: process.env.VAULT_OLLAMA_URL || 'http://localhost:11434',
        VAULT_TAILSCALE_IP: process.env.VAULT_TAILSCALE_IP || '',
      },
    },
    {
      name: 'kognai-dashboard',
      script: '-m uvicorn server:app --host 127.0.0.1 --port 11436',
      interpreter: 'python3',
      cwd: '/Users/tarekmnif/kognai/dashboard',
      autorestart: true,
      max_memory_restart: '128M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/Users/tarekmnif/kognai/logs/kognai-dashboard.log',
      error_file: '/Users/tarekmnif/kognai/logs/kognai-dashboard-error.log',
    },
    {
      name: 'kognai-drain',
      script: 'scripts/drain-local-queue.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      cwd: '/Users/tarekmnif/kognai',
      autorestart: false,
      cron_restart: '*/5 * * * *',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/Users/tarekmnif/kognai/logs/kognai-drain.log',
      error_file: '/Users/tarekmnif/kognai/logs/kognai-drain-error.log',
      env: {
        TS_NODE_TRANSPILE_ONLY: 'true',
        TS_NODE_PROJECT: '/Users/tarekmnif/kognai/tsconfig.scripts.json',
        VAULT_OLLAMA_URL: process.env.VAULT_OLLAMA_URL || 'http://localhost:11434',
      },
    },
    {
      name: 'kognai-heartbeat',
      script: 'scripts/heartbeat-daemon.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      cwd: '/Users/tarekmnif/kognai',
      autorestart: false,
      cron_restart: '0 * * * *',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/Users/tarekmnif/kognai/logs/kognai-heartbeat.log',
      error_file: '/Users/tarekmnif/kognai/logs/kognai-heartbeat-error.log',
      env: {
        TS_NODE_TRANSPILE_ONLY: 'true',
        TS_NODE_PROJECT: '/Users/tarekmnif/kognai/tsconfig.scripts.json',
        VAULT_OLLAMA_URL: process.env.VAULT_OLLAMA_URL || 'http://localhost:11434',
      },
    },
  ],
};