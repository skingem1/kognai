// Kognai-native PM2 config — separate from ecosystem.config.js (Invoica). Run: pm2 start kognai.ecosystem.config.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: 'kognai-router',
      script: 'runtime/router_server.py',
      interpreter: 'python3',
      cwd: __dirname + '/runtime',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: __dirname + '/logs/kognai-router.log',
      error_file: __dirname + '/logs/kognai-router-error.log',
      env: {
        ROUTER_PORT: '11435',
        PYTHONPATH: __dirname + '/runtime',
        VAULT_OLLAMA_URL: process.env.VAULT_OLLAMA_URL || 'http://localhost:11434',
        VAULT_TAILSCALE_IP: process.env.VAULT_TAILSCALE_IP || '',
      },
    },
    {
      name: 'kognai-dashboard',
      script: '-m uvicorn server:app --host 127.0.0.1 --port 11436',
      interpreter: 'python3',
      cwd: __dirname + '/dashboard',
      autorestart: true,
      max_memory_restart: '128M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: __dirname + '/logs/kognai-dashboard.log',
      error_file: __dirname + '/logs/kognai-dashboard-error.log',
    },
    {
      name: 'kognai-drain',
      script: 'scripts/drain-local-queue.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      cwd: __dirname,
      autorestart: false,
      cron_restart: '*/5 * * * *',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: __dirname + '/logs/kognai-drain.log',
      error_file: __dirname + '/logs/kognai-drain-error.log',
      env: {
        TS_NODE_TRANSPILE_ONLY: 'true',
        TS_NODE_PROJECT: __dirname + '/tsconfig.scripts.json',
        VAULT_OLLAMA_URL: process.env.VAULT_OLLAMA_URL || 'http://localhost:11434',
      },
    },
    {
      name: 'kognai-heartbeat',
      script: 'scripts/heartbeat-daemon.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      cwd: __dirname,
      autorestart: false,
      cron_restart: '0 * * * *',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: __dirname + '/logs/kognai-heartbeat.log',
      error_file: __dirname + '/logs/kognai-heartbeat-error.log',
      env: {
        TS_NODE_TRANSPILE_ONLY: 'true',
        TS_NODE_PROJECT: __dirname + '/tsconfig.scripts.json',
        VAULT_OLLAMA_URL: process.env.VAULT_OLLAMA_URL || 'http://localhost:11434',
      },
    },
    // SCS-002 — ORACLE-6 Consumer (AMD-05 × Voxight)
    // Fetches Intelligence Signals from Voxight Supabase, writes to Intelligence Memory.
    // Sends Telegram alert for purpose candidates (confidence >= 75).
    // Runs every 6 hours: 00:00, 06:00, 12:00, 18:00 UTC.
    {
      name: 'oracle6-consumer',
      script: 'scripts/oracle6-consumer.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      cwd: __dirname,
      autorestart: false,
      cron_restart: '0 */6 * * *',
      max_memory_restart: '128M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: __dirname + '/logs/oracle6-consumer-out.log',
      error_file: __dirname + '/logs/oracle6-consumer-error.log',
      env: {
        TS_NODE_TRANSPILE_ONLY: 'true',
        TS_NODE_PROJECT: __dirname + '/tsconfig.scripts.json',
        VOXIGHT_SUPABASE_URL: process.env.VOXIGHT_SUPABASE_URL || 'https://ewrpnhzbrmjbffkjxqob.supabase.co',
        VOXIGHT_SUPABASE_KEY: process.env.VOXIGHT_SUPABASE_KEY || '',
        TELEGRAM_BOT_TOKEN:     process.env.TELEGRAM_BOT_TOKEN     || '',
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || '',
      },
    },
  ],
};
