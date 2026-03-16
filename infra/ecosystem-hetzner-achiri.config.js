// Achiri PM2 config for Hetzner VPS (Sprint 129)
// Deploy to: /home/invoica/apps/kognai/
// Start: pm2 start infra/ecosystem-hetzner-achiri.config.js
// Logs: /home/invoica/apps/kognai/logs/

module.exports = {
  apps: [
    {
      name: 'achiri-api',
      script: 'npx',
      args: 'ts-node --transpile-only agents/achiri/server.ts',
      cwd: '/home/invoica/apps/kognai',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        ACHIRI_PORT: '3420',
        // Free tier: Ollama on Mac Mini vault via Tailscale
        OLLAMA_URL: 'http://vault:11434',
        // Paid tiers: Anthropic API (set ANTHROPIC_API_KEY in .env on server)
        // Paymee: set PAYMEE_API_KEY + PAYMEE_VENDOR_ID in .env on server
        TS_NODE_TRANSPILE_ONLY: 'true',
        TS_NODE_PROJECT: '/home/invoica/apps/kognai/tsconfig.json',
        // Safety: no dry run in production
        ACHIRI_DRY_RUN: '0',
        ACHIRI_NO_LIMIT: '0',
      },
      error_file: '/home/invoica/apps/kognai/logs/achiri-api-error.log',
      out_file: '/home/invoica/apps/kognai/logs/achiri-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
