// Load .env so PM2 env blocks can reference process.env values (e.g. secrets)
// Wrapped in try-catch: dotenv may not be installed in CI or other environments
try { require('dotenv').config({ path: __dirname + '/.env' }); } catch (e) {}

module.exports = {
  apps: [
    {
      name: "backend",
      script: "/home/invoica/apps/Invoica/backend-wrapper.sh",
      interpreter: "bash",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        // x402 seller wallet — receives USDC from agent inference payments
        X402_SELLER_WALLET: "0x3e127c918C83714616CF2416f8A620F1340C19f1",
      },
      error_file: "/home/invoica/apps/Invoica/logs/backend-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "openclaw-gateway",
      script: "/opt/oc/gateway-wrapper.sh",
      interpreter: "bash",
      cwd: "/opt/oc",
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      error_file: "/home/invoica/apps/Invoica/logs/gateway-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/gateway-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "cto-email-support",
      script: "./scripts/run-cto-email-support.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "*/5 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json"
      },
      error_file: "/home/invoica/apps/Invoica/logs/email-support-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/email-support-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "cto-daily-scan",
      script: "./scripts/run-cto-techwatch.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 9 * * *",
      args: "full-scan",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json"
      },
      error_file: "/home/invoica/apps/Invoica/logs/cto-scan-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/cto-scan-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "heartbeat",
      script: "./scripts/heartbeat-daemon.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json",
        HEALTHCHECK_PING_URL: "https://hc-ping.com/0f88f15e-5f06-43fa-ba26-a32719bb3682"
      },
      error_file: "/home/invoica/apps/Invoica/logs/heartbeat-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/heartbeat-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "x-admin-post",
      script: "./scripts/run-x-admin.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "*/30 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json"
      },
      error_file: "/home/invoica/apps/Invoica/logs/x-admin-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/x-admin-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "cmo-daily-watch",
      script: "./scripts/run-cmo-fixed.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 8 * * *",
      args: "market-watch",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json"
      },
      error_file: "/home/invoica/apps/Invoica/logs/cmo-watch-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/cmo-watch-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Every Sunday at 06:00 UTC — CMO generates full week of X posts
      // CTO reviews technical accuracy → CEO approves → X agent executes Mon-Sun
      name: "cmo-weekly-content-plan",
      script: "./scripts/run-cmo-weekly-plan.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 6 * * 0",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: "/home/invoica/apps/Invoica/logs/cmo-weekly-plan-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/cmo-weekly-plan-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "tax-watchdog-us",
      script: "./scripts/tax-watchdog-us.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 7 * * 1",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json"
      },
      error_file: "/home/invoica/apps/Invoica/logs/tax-us-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/tax-us-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "tax-watchdog-eu-japan",
      script: "./scripts/tax-watchdog-eu-japan.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 8 * * 1",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json"
      },
      error_file: "/home/invoica/apps/Invoica/logs/tax-eu-japan-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/tax-eu-japan-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "ceo-review",
      script: "./scripts/run-ceo-review.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 */2 * * *",
      args: "--source=cron",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json"
      },
      error_file: "/home/invoica/apps/Invoica/logs/ceo-review-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/ceo-review-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "cfo-weekly",
      script: "./scripts/run-cfo.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 7 * * 1",
      args: "weekly-report",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json"
      },
      error_file: "/home/invoica/apps/Invoica/logs/cfo-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/cfo-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // CEO AI Bot — standalone process (isolated from backend API)
      // Previously ran inside backend/src/server.ts causing 4827 API crashes
      // (ceoBot watchdog calls process.exit(1) → now only kills this process)
      name: "ceo-ai-bot",
      script: "./scripts/run-ceo-bot.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: "/home/invoica/apps/Invoica/logs/ceo-ai-bot-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/ceo-ai-bot-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "git-autodeploy",
      script: "./scripts/git-autodeploy.sh",
      interpreter: "bash",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "*/5 * * * *",
      error_file: "/home/invoica/apps/Invoica/logs/autodeploy-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/autodeploy-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "bizdev-weekly",
      script: "./scripts/run-bizdev.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 6 * * 0",
      args: "opportunity-scan",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json"
      },
      error_file: "/home/invoica/apps/Invoica/logs/bizdev-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/bizdev-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // sprint-runner: checks every 30 min for pending sprint tasks
      // Rate-limited: 30 min cooldown between runs + 20 sprint/day hard cap
      // Protects the Claude Code 5h rolling token budget
      name: "sprint-runner",
      script: "./scripts/sprint-runner.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "*/30 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.json",
        SPRINT_COOLDOWN_MINUTES: "30",
        DAILY_SPRINT_CAP: "100",
        ROLLING_SPRINT_CAP: "50",
        ROLLING_WINDOW_HOURS: "3",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
        // T2.5-LOCAL thinking mode tier (TICKET-007-CLAWROUTER-THINK)
        THINKING_MODE_LOCAL_ENABLED: "true",
        THINKING_MODE_THRESHOLD: "0.85",
      },
      error_file: __dirname + "/logs/sprint-runner-error.log",
      out_file: __dirname + "/logs/sprint-runner-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Memory Agent — "black box" observer of the entire company
      // Runs hourly. Writes to /home/invoica/memory/ (OUTSIDE app dir — survives git clean/wipes)
      // Also mirrors to memory/ in repo so agents can read via file system
      // Generates: daily-log-YYYY-MM-DD.md | daily-continuity.md | long-term-memory.md
      name: "memory-agent",
      script: "./scripts/memory-agent.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json",
        // External memory dir — persists independently of the app
        MEMORY_DIR: "/home/invoica/memory",
      },
      error_file: "/home/invoica/apps/Invoica/logs/memory-agent-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/memory-agent-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Mission Control — self-hosted AI agent ops dashboard (builderz-labs/mission-control)
      // Next.js + SQLite. No external deps. Runs permanently on port 3010.
      // Access: ssh -L 3005:localhost:3005 invoica@<server> then open http://localhost:3005
      // Setup (first time only): bash scripts/setup-mission-control.sh
      name: "mission-control",
      script: "./scripts/run-mission-control.sh",
      interpreter: "bash",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      error_file: "/home/invoica/apps/Invoica/logs/mission-control-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/mission-control-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Docs Generator — runs daily at 04:00 UTC
      // Scans git log + backend routes → writes changelog.json + api-reference.json
      // → rewrites frontend pages → git push → Vercel auto-redeploys live docs
      // Also triggered by memory-agent after each daily continuity brief
      name: "docs-generator",
      script: "./scripts/generate-docs.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "0 4 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json",
        MEMORY_DIR: "/home/invoica/memory",
      },
      error_file: "/home/invoica/apps/Invoica/logs/docs-generator-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/docs-generator-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // kognai-router: REMOVED FROM PM2 — managed by launchd (ai.kognai.router.plist)
    // ~/Library/LaunchAgents/ai.kognai.router.plist — KeepAlive=true, port 11435
    // DO NOT add back to PM2 — it will conflict with the launchd service
    // To restart: launchctl kickstart -k gui/$(id -u)/ai.kognai.router
    {
      // pending-local-drain: cron every 5 min — drains pending-local queue when vault reachable
      // Picks up tasks queued while vault (Tailscale) was offline and reruns them
      name: "pending-local-drain",
      script: "scripts/drain-local-queue.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "*/5 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        VAULT_OLLAMA_URL: process.env.VAULT_OLLAMA_URL || "http://vault:11434",
      },
      error_file: __dirname + "/logs/drain-error.log",
      out_file: __dirname + "/logs/drain-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Telegram Bot — long-polling daemon for subscriber interaction
      // Commands: /start, /help, /preview, /schedule, /status, /stats, /subscribe
      // Requires: TELEGRAM_BOT_TOKEN + OWNER_TELEGRAM_CHAT_ID in .env
      name: "telegram-bot",
      script: "scripts/telegram-bot.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M", // Sprint 1387: was 128M — bot uses 234MB+ with ts-node + 10 imported modules
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/telegram-bot-error.log",
      out_file: __dirname + "/logs/telegram-bot-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Stripe Webhook Server — Sprint 149. Listens on STRIPE_WEBHOOK_PORT (default 3001).
      // Handles subscription lifecycle events: subscription.created, subscription.deleted, payment_failed.
      // Requires: STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in .env
      // Forward events in dev: stripe listen --forward-to localhost:3001/webhook
      name: "kognai-stripe-webhook",
      script: "agents/stripe/server.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      min_uptime: "10s",
      max_restarts: 10,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
        STRIPE_WEBHOOK_PORT: process.env.STRIPE_WEBHOOK_PORT || "3001",
      },
      error_file: __dirname + "/logs/stripe-webhook-error.log",
      out_file: __dirname + "/logs/stripe-webhook-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 402: Checkout landing page + Stripe redirect server
      // Serves landing page at / and redirects /checkout/growth, /checkout/premium to Stripe.
      // For TikTok bio link. To start: pm2 start ecosystem.config.js --only kognai-checkout
      name: "kognai-checkout",
      script: "scripts/scs001/checkout-server.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: "64M",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        CHECKOUT_PORT: process.env.CHECKOUT_PORT || "3002",
      },
      error_file: __dirname + "/logs/checkout-error.log",
      out_file: __dirname + "/logs/checkout-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Smoke Test Cron — Sprint 530: runs full system smoke test every 6h
      // Writes reports/smoke-test-latest.json + sends Telegram alert on failure.
      name: "kognai-smoke-test",
      script: "scripts/smoke-test-cron.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 */6 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/smoke-test-error.log",
      out_file: __dirname + "/logs/smoke-test-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Pipeline Auto-Run — Sprint 532. Runs pipeline + auto-deliver + metrics 4x/day.
      // Produces 3 videos per run, delivers to Telegram, logs metrics.
      name: "kognai-pipeline-auto",
      script: "scripts/scs001/pipeline-cron.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      args: "--limit 3",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 6,10,14,18 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/pipeline-auto-error.log",
      out_file: __dirname + "/logs/pipeline-auto-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "512M"
    },
    {
      // Pipeline Watchdog — Sprint 141. Checks publish-ledger.jsonl freshness every 30 min.
      // Sends Telegram alert if ledger hasn't been updated in >4h (pipeline stuck/failed).
      // Silent when pipeline is healthy. Set WATCHDOG_DRY_RUN=1 to test without sending.
      name: "kognai-pipeline-watchdog",
      script: "scripts/pipeline-watchdog.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "*/30 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/pipeline-watchdog-error.log",
      out_file: __dirname + "/logs/pipeline-watchdog-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Daily Digest — pushes morning gate-progress summary to operator via Telegram
      // Fires 07:00 daily (before AM block). Shows: posts/views gate, pipeline stats,
      // days until Phase 1.5 gate (Apr 7) + Achiri alpha (Apr 25).
      // Requires: CEO_TELEGRAM_BOT_TOKEN + OWNER_TELEGRAM_CHAT_ID in .env
      name: "kognai-daily-digest",
      script: "scripts/daily-digest.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 7 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/daily-digest-error.log",
      out_file: __dirname + "/logs/daily-digest-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1288: Daily backup — 03:00, tarballs key data files, writes workspace/backup-status.json
      // To start: pm2 start ecosystem.config.js --only kognai-daily-backup
      name: "kognai-daily-backup",
      script: "scripts/backup-data.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 3 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/backup-error.log",
      out_file: __dirname + "/logs/backup-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 283: Weekly Report — Sunday 20:00, gate progress + streak + pipeline recap
      // To start: pm2 start ecosystem.config.js --only kognai-weekly-report
      name: "kognai-weekly-report",
      script: "scripts/weekly-report.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 20 * * 0",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/weekly-report-error.log",
      out_file: __dirname + "/logs/weekly-report-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Gate Regen — regenerates workspace/gates/phase1-5-gate.json every 2 hours
      // Sprint 1045: increased from daily 06:55 to every 2h — gate was going stale during the day
      // To start: pm2 start ecosystem.config.js --only kognai-gate-regen
      name: "kognai-gate-regen",
      script: "scripts/scs001/generate-phase1-5-gate.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 */2 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/gate-regen-error.log",
      out_file: __dirname + "/logs/gate-regen-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1307: Gate check cron — runs 08:00 daily, reads phase1-5-gate.json, pushes status to Telegram
      // Operator morning briefing: posts/views/days-remaining/recommendation
      // To start: pm2 start ecosystem.config.js --only scs001-gate-check
      name: "scs001-gate-check",
      script: "scripts/scs001/gate-check-cron.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 8 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/gate-check-error.log",
      out_file: __dirname + "/logs/gate-check-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1446: Phase 2A gate regen — runs daily at 06:56 UTC
      // Regenerates workspace/gates/phase1-phase2a-gate.json (after phase1-5 regen, before tracker-update at 07:08)
      // To start: pm2 start ecosystem.config.js --only kognai-phase2a-gate-regen
      name: "kognai-phase2a-gate-regen",
      script: "scripts/generate-phase2a-gate.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "56 6 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/phase2a-gate-regen-error.log",
      out_file: __dirname + "/logs/phase2a-gate-regen-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 169: Gate tracker auto-update — runs 07:08 UTC daily (after gate-regen at 06:55)
      // Rewrites docs/gate-tracker.md with accurate Phase 0→1 PASS + Phase 1.5 progress.
      // Keeps gate-tracker current so Claude Code sessions start with correct context.
      name: "kognai-gate-tracker-update",
      script: "scripts/update-gate-tracker.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "8 7 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/gate-tracker-update-error.log",
      out_file: __dirname + "/logs/gate-tracker-update-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 157: Brief regeneration — runs 06:45 UTC daily (before digest at 07:00)
      // Regenerates workspace/sprint-brief.md so every Claude Code session starts with
      // a fresh, accurate brief — no need to read raw MEMORY.md or progress.md.
      // Note: generate-daily-brief.py takes ~5 min (uses local Ollama). 06:45 gives
      // 15 min buffer before daily-digest fires at 07:00.
      name: "kognai-brief-regen",
      script: "scripts/generate-daily-brief.py",
      interpreter: "python3",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "45 6 * * *",
      env: {
        VAULT_OLLAMA_URL: process.env.VAULT_OLLAMA_URL || "http://vault:11434",
        VAULT_MODEL: process.env.VAULT_LOCAL_MODEL_POWER || "qwen3:14b",
      },
      error_file: __dirname + "/logs/brief-regen-error.log",
      out_file: __dirname + "/logs/brief-regen-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 194: Content calendar regen — daily at 06:50 (before brief regen at 06:45... actually after gate-regen at 06:55)
      // Regenerates workspace/scs001/content-calendar.json with viral-score-sorted videos.
      // To start: pm2 start ecosystem.config.js --only kognai-calendar-regen
      name: "kognai-calendar-regen",
      script: "scripts/scs001/generate-content-calendar.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "50 6 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/calendar-regen-error.log",
      out_file: __dirname + "/logs/calendar-regen-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 832: Posting schedule regen — daily at 06:52 (after calendar regen at 06:50)
      // Regenerates reports/posting-schedule.json with 2/day slots through gate deadline.
      // To start: pm2 start ecosystem.config.js --only kognai-schedule-regen
      name: "kognai-schedule-regen",
      script: "scripts/scs001/posting-schedule.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "52 6 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/schedule-regen-error.log",
      out_file: __dirname + "/logs/schedule-regen-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 353: Content leaderboard regen — daily at 06:54 (after schedule regen)
      // Regenerates reports/content-leaderboard.json with speaker rankings.
      // To start: pm2 start ecosystem.config.js --only kognai-leaderboard-regen
      name: "kognai-leaderboard-regen",
      script: "scripts/scs001/content-leaderboard.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "54 6 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/leaderboard-regen-error.log",
      out_file: __dirname + "/logs/leaderboard-regen-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 832: Posting time reminder — noon (12:00)
      // Schedule-aware: reads posting-schedule.json, sends video + caption 30 min before slot.
      // To start: pm2 start ecosystem.config.js --only kognai-post-noon
      name: "kognai-post-noon",
      script: "scripts/scs001/posting-reminder.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 12 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/post-noon-error.log",
      out_file: __dirname + "/logs/post-noon-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 832: Posting time reminder — evening (18:00)
      // Schedule-aware: reads posting-schedule.json, sends video + caption 30 min before slot.
      // To start: pm2 start ecosystem.config.js --only kognai-post-evening
      name: "kognai-post-evening",
      script: "scripts/scs001/posting-reminder.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 18 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/post-evening-error.log",
      out_file: __dirname + "/logs/post-evening-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // SCS-001 Pipeline — 1 video per pipeline per day (P1 + P2 + P3 = 3 total)
      // Runs once daily at 09:00 UTC via batch-produce --pipeline all --runs 3
      // Round-robins: educational → code-demo → entertainment (1 each)
      name: "scs001-pipeline",
      script: "scripts/scs001/batch-produce.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 9 * * *",
      args: "--pipeline all --runs 3 --mode live",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        OLLAMA_HOST: "http://127.0.0.1:11434",
        SCS_MODE: "live",
        SCS_CLIPS_DIR: __dirname + "/clips",
        SCS_EDITING_MODE: "production",
        LLM_REWRITE: "1",
        ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || "",
        YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || "",
        HEYGEN_API_KEY: process.env.HEYGEN_API_KEY || "",
      },
      error_file: __dirname + "/logs/scs001-pipeline-error.log",
      out_file: __dirname + "/logs/scs001-pipeline-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1333: Midday code-demo production — 1 free video at 13:00 daily
      // Cost: $0.00 (all local: Ollama + Pillow + FFmpeg). No API spend.
      // Resilient: Sprint 1327 templates + Sprint 1330 per-step isolation.
      name: "scs001-pipeline-codedemo",
      script: "scripts/scs001/batch-produce.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 13 * * *",
      args: "--pipeline code-demo --runs 1 --mode live",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        OLLAMA_HOST: "http://127.0.0.1:11434",
        SCS_MODE: "live",
        SCS_EDITING_MODE: "production",
      },
      error_file: __dirname + "/logs/scs001-pipeline-error.log",
      out_file: __dirname + "/logs/scs001-pipeline-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Vault Dashboard — FastAPI on port 11436 (localhost only)
      // 13-panel monitoring: sprints, tasks, costs, agents, routing, chain,
      // security, assets, pipeline runs, amendments, revenue, blockers
      name: "vault-dashboard",
      script: "python3",
      args: "-m uvicorn server:app --host 127.0.0.1 --port 11436",
      interpreter: "none",
      cwd: __dirname + "/dashboard",
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      error_file: __dirname + "/logs/dashboard-error.log",
      out_file: __dirname + "/logs/dashboard-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // SCS-001 Live Pipeline — Phase 1 live TikTok posting
      // Activated after Phase 0→Phase 1 gate PASS (Mar 16, Sprint 096)
      // Requires: TIKTOK_ACCESS_TOKEN set in .env
      // To start: pm2 start ecosystem.config.js --only scs001-live
      name: "scs001-live",
      script: "agents/scs001-orchestrator/run-pipeline.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 7,12,18,21 * * *",
      args: "live",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        OLLAMA_HOST: "http://127.0.0.1:11434",
        SCS_MODE: "live",
        SCS_CLIPS_DIR: __dirname + "/clips",
        SCS_EDITING_MODE: "production",
        ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || "",
        TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN || "",
        YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || "",
        LLM_REWRITE: "1",
        PIPELINE_QUEUE_THRESHOLD: "999",
      },
      error_file: __dirname + "/logs/scs001-live-error.log",
      out_file: __dirname + "/logs/scs001-live-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Achiri HTTP API — Phase 2A REST interface for conversation handler
      // Activated: Sprint 115 (2026-03-16)
      // Routes: POST /chat, DELETE /memory/:userId, GET /stats, GET /health
      // Dry-run: set ACHIRI_DRY_RUN=1 (skips LLM call)
      // To start: pm2 start ecosystem.config.js --only achiri-api
      name: "achiri-api",
      script: "npx",
      args: "ts-node agents/achiri/server.ts",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        ACHIRI_PORT: "3420",
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        OLLAMA_URL: "http://127.0.0.1:11434",
      },
      error_file: __dirname + "/logs/achiri-api-error.log",
      out_file: __dirname + "/logs/achiri-api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Achiri Telegram Bot — Sprint 352: user-facing chat interface for alpha
      // Bridges Telegram messages → AchiriConversationHandler → reply
      // Env: ACHIRI_TELEGRAM_BOT_TOKEN (required), ACHIRI_ALLOWED_CHAT_IDS (optional CSV whitelist)
      // To start: pm2 start ecosystem.config.js --only achiri-telegram
      name: "achiri-telegram",
      script: "npx",
      args: "ts-node --transpile-only agents/achiri/telegram-bot.ts",
      cwd: __dirname,
      autorestart: false,  // Sprint 1331: manually-gated process; crashes when token not set
      watch: false,
      env: {
        NODE_ENV: "production",
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        OLLAMA_URL: "http://127.0.0.1:11434",
        ACHIRI_TELEGRAM_BOT_TOKEN: process.env.ACHIRI_TELEGRAM_BOT_TOKEN || "",
      },
      error_file: __dirname + "/logs/achiri-telegram-error.log",
      out_file: __dirname + "/logs/achiri-telegram-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── SPRINT-171-PUB: Auto-send video to owner via Telegram (07:30 + 17:30 UTC) ──
    {
      name: "kognai-auto-send-video",
      script: "scripts/auto-send-video.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      cron_restart: "30 7,17 * * *",
      autorestart: false,
      watch: false,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/auto-send-video-error.log",
      out_file: __dirname + "/logs/auto-send-video-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── Sprint 233: Auto-Post Daemon — posts top video to TikTok 2x/day ──────
    {
      name: "kognai-auto-post",
      script: "scripts/scs001/auto-post.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      cron_restart: "0 8,19 * * *",
      autorestart: false,
      watch: false,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/auto-post-error.log",
      out_file: __dirname + "/logs/auto-post-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── Sprint 802: Browser auto-post — 2x/day at 12:00 + 19:00 ─────────────
    {
      name: "kognai-auto-post-browser",
      script: "scripts/scs001/auto-post-browser.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      cron_restart: "0 12,19 * * *",
      autorestart: false,
      watch: false,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/auto-post-browser-error.log",
      out_file: __dirname + "/logs/auto-post-browser-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── SPRINT-508-BROWSER-01: Direct browser poster — 2x/day at 12:00 + 19:00 ─
    // WARMUP-01 gate: AUTO_POST_DRY_RUN=1 until 2026-03-29. Change to 0 after warmup complete.
    {
      name: "kognai-tiktok-browser-poster",
      script: "scripts/scs001/tiktok-browser-poster.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      cron_restart: "0 12,19 * * *",
      autorestart: false,
      watch: false,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        // AUTO_POST_DRY_RUN removed (Sprint 1454): warmup-status.json controls activation.
        // When verified=true (after /warmup-complete), cron posts live automatically.
      },
      error_file: __dirname + "/logs/tiktok-browser-poster-error.log",
      out_file: __dirname + "/logs/tiktok-browser-poster-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── Sprint 234: Token auto-refresh — daily at 03:00 ──────────────────────
    {
      name: "kognai-token-refresh",
      script: "scripts/tiktok-refresh-token.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      cron_restart: "0 3 * * *",
      autorestart: false,
      watch: false,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/token-refresh-error.log",
      out_file: __dirname + "/logs/token-refresh-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── Sprint 234: Post verification — 1h after each auto-post ────────────
    {
      name: "kognai-verify-posts",
      script: "scripts/scs001/verify-posts.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      cron_restart: "0 9,20 * * *",
      autorestart: false,
      watch: false,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/verify-posts-error.log",
      out_file: __dirname + "/logs/verify-posts-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── TikTok View Count Tracker (Sprint 266) ─────────────────────────────────
    // Daily at 10:00: fetches oEmbed data for recorded posts, verifies they're live,
    // updates titles, and sends gate milestone alerts when targets are hit.
    {
      name: "kognai-view-tracker",
      script: "scripts/scs001/fetch-tiktok-views.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 10 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/view-tracker-error.log",
      out_file: __dirname + "/logs/view-tracker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── ClawRouter HTTP Gateway (Sprint 173) ─────────────────────────────────
    {
      name: "clawrouter-gateway",
      script: "scripts/services/clawrouter-http-server.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        CLAWROUTER_PORT: "3101",
      },
      error_file: __dirname + "/logs/clawrouter-gateway-error.log",
      out_file: __dirname + "/logs/clawrouter-gateway-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── Production Watchdog (Sprint 270) ─────────────────────────────────────
    // Runs every 6h, checks pipeline health, gate deadline risk, disk usage.
    // Sends proactive Telegram alerts on critical/warning issues.
    // Manual: pm2 start ecosystem.config.js --only kognai-watchdog
    {
      name: "kognai-watchdog",
      script: "scripts/scs001/watchdog.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 */6 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/watchdog-error.log",
      out_file: __dirname + "/logs/watchdog-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 337: Achiri weekly usage digest — Sunday 10:00
      // Sends weekly DAU trend, top users, memory stats, feedback to operator.
      // To start: pm2 start ecosystem.config.js --only achiri-weekly-digest
      name: "achiri-weekly-digest",
      script: "scripts/achiri/weekly-usage-digest.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 10 * * 0",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/achiri-weekly-error.log",
      out_file: __dirname + "/logs/achiri-weekly-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 334: Morning caption push — sends today's scheduled captions at 07:30
      // Operator wakes up to their posting pack (after 07:00 digest).
      // To start: pm2 start ecosystem.config.js --only kognai-caption-push
      name: "kognai-caption-push",
      script: "scripts/scs001/morning-caption-push.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "30 7 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/caption-push-error.log",
      out_file: __dirname + "/logs/caption-push-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 341: Weekend posting blitz — Saturday 09:00, sends 5 top-scored videos
      // Batch delivery for weekend catch-up posting.
      // To start: pm2 start ecosystem.config.js --only kognai-weekend-blitz
      name: "kognai-weekend-blitz",
      script: "scripts/scs001/weekend-blitz.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 9 * * 6",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/weekend-blitz-error.log",
      out_file: __dirname + "/logs/weekend-blitz-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 338: Auto-deliver morning — sends next video + caption at 07:30
      // Replaces text-only nudges with actual video file delivery.
      // To start: pm2 start ecosystem.config.js --only kognai-auto-deliver-morning
      name: "kognai-auto-deliver-morning",
      script: "scripts/scs001/posting-auto-deliver.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "30 7 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/auto-deliver-morning-error.log",
      out_file: __dirname + "/logs/auto-deliver-morning-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 338: Auto-deliver noon — sends next video + caption at 12:00
      // To start: pm2 start ecosystem.config.js --only kognai-auto-deliver-noon
      name: "kognai-auto-deliver-noon",
      script: "scripts/scs001/posting-auto-deliver.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 12 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/auto-deliver-noon-error.log",
      out_file: __dirname + "/logs/auto-deliver-noon-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 338: Auto-deliver evening — sends next video + caption at 18:00
      // To start: pm2 start ecosystem.config.js --only kognai-auto-deliver-evening
      name: "kognai-auto-deliver-evening",
      script: "scripts/scs001/posting-auto-deliver.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 18 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/auto-deliver-evening-error.log",
      out_file: __dirname + "/logs/auto-deliver-evening-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 437: PM2 auto-healer — hourly check + restart of crashed essential crons
      // Restarts errored crons and daemons, sends Telegram alert on action.
      // To start: pm2 start ecosystem.config.js --only kognai-auto-healer
      name: "kognai-auto-healer",
      script: "scripts/pm2-auto-healer.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/auto-healer-error.log",
      out_file: __dirname + "/logs/auto-healer-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 326: Achiri re-engagement — daily at 15:00 (afternoon in Tunisia)
      // Sends check-in messages to alpha users inactive 3+ days.
      // To start: pm2 start ecosystem.config.js --only achiri-reengage
      name: "achiri-reengage",
      script: "scripts/achiri/achiri-reengage.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 15 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
      },
      error_file: __dirname + "/logs/achiri-reengage-error.log",
      out_file: __dirname + "/logs/achiri-reengage-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 398: Achiri daily engagement — morning word + quiz push
      // Sends active users a Darija word of the day + trivia + streak at 8am UTC (9am Tunisia)
      // To start: pm2 start ecosystem.config.js --only achiri-daily-engage
      name: "achiri-daily-engage",
      script: "scripts/achiri/daily-engagement.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 8 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
      },
      error_file: __dirname + "/logs/achiri-daily-engage-error.log",
      out_file: __dirname + "/logs/achiri-daily-engage-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 442: Weekly pipeline cleanup — keep 5 latest runs, remove old
      // To start: pm2 start ecosystem.config.js --only kognai-pipeline-cleanup
      name: "kognai-pipeline-cleanup",
      script: "scripts/scs001/pipeline-cleanup.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 3 * * 0",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/pipeline-cleanup-error.log",
      out_file: __dirname + "/logs/pipeline-cleanup-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 465: GEO monitor — weekly health check + brand mention scan + citability scoring
      // Runs every Monday at 8am. Checks robots.txt, llms.txt, JSON-LD, citable blocks, brand mentions.
      // Sends Telegram alert if GEO score drops >10 points.
      // To start: pm2 start ecosystem.config.js --only kognai-geo-monitor
      name: "kognai-geo-monitor",
      script: "scripts/geo/geo-monitor.py",
      interpreter: "python3",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 8 * * 1",
      env: {
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/geo-monitor-error.log",
      out_file: __dirname + "/logs/geo-monitor-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 704: Daily Report Generator — aggregates git activity, pipeline output,
      // sprint progress into reports/swarm-runs/daily-YYYY-MM-DD.json.
      // Fires 23:55 daily. Only 4 reports ever generated (Mar 7/8/10/19) — this fixes the gap.
      // To start: pm2 start ecosystem.config.js --only kognai-daily-report
      name: "kognai-daily-report",
      script: "scripts/generate-daily-report.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "55 23 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/daily-report-error.log",
      out_file: __dirname + "/logs/daily-report-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 709: Constitution Agent — weekly signal collection + governance report
      // Collects AAR + sprint data, routes through qwen3:14b ($0), writes signal report.
      // Fires Sundays 18:00. Outputs to reports/constitution/YYYY-WW.md.
      // To start: pm2 start ecosystem.config.js --only kognai-constitution-agent
      name: "kognai-constitution-agent",
      script: "scripts/run-constitution-agent.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 18 * * 0",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
      },
      error_file: __dirname + "/logs/constitution-agent-error.log",
      out_file: __dirname + "/logs/constitution-agent-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1061: Morning brief — auto-send /today gate + top pick to Telegram at 07:05
      name: "scs001-morning-brief",
      script: "./scripts/morning-brief.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "5 7 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/morning-brief-error.log",
      out_file: __dirname + "/logs/morning-brief-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1006: Noon posting reminder — gate urgency alert if posts_remaining > 0
      name: "scs001-remind-noon",
      script: "./scripts/remind-post.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 12 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/remind-noon-error.log",
      out_file: __dirname + "/logs/remind-noon-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1006: Evening posting reminder — gate urgency alert at 7pm
      name: "scs001-remind-evening",
      script: "./scripts/remind-post.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 19 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/remind-evening-error.log",
      out_file: __dirname + "/logs/remind-evening-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint TICKET-010-YT-02: YouTube Shorts auto-upload via batch-youtube-upload.ts
      // 2 runs/day: 7:30am + 7:30pm, 3 videos per run = 6 videos/day = 9,600 units (under 10K limit)
      // No-op until YOUTUBE_REFRESH_TOKEN is set in .env. Run: npx ts-node scripts/scs001/youtube-oauth.ts
      // To start: pm2 start ecosystem.config.js --only scs001-youtube-upload
      name: "scs001-youtube-upload",
      script: "./scripts/scs001/batch-youtube-upload.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "30 7,19 * * *",
      args: "--live --max=3",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        YOUTUBE_DRY_RUN: process.env.YOUTUBE_REFRESH_TOKEN ? "0" : "1",
      },
      error_file: __dirname + "/logs/youtube-upload-error.log",
      out_file: __dirname + "/logs/youtube-upload-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint TICKET-013-CMO-03: CMO weekly content plan — Every Sunday 06:00 UTC
      // Generates full week of X posts (Mon–Sun), tone-audited by Sherlock (qwen3:4b local).
      // Output: reports/cmo/weekly-content-plan-YYYY-MM-DD.json
      // To start: pm2 start ecosystem.config.js --only scs001-cmo-weekly
      name: "scs001-cmo-weekly",
      script: "./scripts/run-cmo-weekly-plan.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 6 * * 0",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
      },
      error_file: __dirname + "/logs/cmo-weekly-error.log",
      out_file: __dirname + "/logs/cmo-weekly-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1003: PM2 auto-healer — restarts errored/unstable processes, Telegram alert
      // Detects status=errored or unstable_restarts>=3, restarts, logs to logs/healer-state.json
      // To start: pm2 start ecosystem.config.js --only scs001-healer
      name: "scs001-healer",
      script: "./scripts/scs001/pm2-auto-healer.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "*/5 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        HEALER_UNSTABLE_THRESHOLD: "3",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/healer-error.log",
      out_file: __dirname + "/logs/healer-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1002: Content freshness decay archiver — auto-archives stale pending queue items (7d)
      // Stamps new pending items with created_at, archives expired items to archived-queue.jsonl
      // To start: pm2 start ecosystem.config.js --only scs001-queue-archiver
      name: "scs001-queue-archiver",
      script: "./scripts/scs001/archive-stale-queue.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "5 0 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        STALE_DAYS: "7",
      },
      error_file: __dirname + "/logs/queue-archiver-error.log",
      out_file: __dirname + "/logs/queue-archiver-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1001: Pipeline output validator — runs ffprobe on all produced videos daily at 6am
      // Writes report to reports/pipeline-validator-latest.json, Telegram alert on failures.
      // To start: pm2 start ecosystem.config.js --only scs001-validator
      name: "scs001-validator",
      script: "./scripts/scs001/validate-pipeline-output.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 6 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/scs001-validator-error.log",
      out_file: __dirname + "/logs/scs001-validator-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 985: Weekly Achiri alpha readiness report — sends to Telegram every Monday 9am
      name: "achiri-alpha-weekly",
      script: "./scripts/achiri/alpha-report.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 9 * * 1",
      args: "--telegram",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/achiri-alpha-weekly-error.log",
      out_file: __dirname + "/logs/achiri-alpha-weekly-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "curator-trading",
      script: "./scripts/agents/curator-trading.ts",
      interpreter: "npx",
      interpreter_args: "tsx",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 6 * * *",
      env: {
        NODE_ENV: "production",
      },
      error_file: __dirname + "/logs/curator-trading-error.log",
      out_file: __dirname + "/logs/curator-trading-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "arch001-observers",
      script: "./scripts/arch001/launch-observers.sh",
      interpreter: "bash",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      error_file: __dirname + "/logs/arch001-observers-error.log",
      out_file: __dirname + "/logs/arch001-observers-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "system-health",
      script: "./scripts/system-health.ts",
      interpreter: "npx",
      interpreter_args: "tsx",
      args: "--telegram",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 7 * * *",
      env: {
        NODE_ENV: "production",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: __dirname + "/logs/system-health-error.log",
      out_file: __dirname + "/logs/system-health-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "kognai-video-validator",
      script: "npx",
      args: "tsx scripts/scs001/pipeline-output-validator.ts",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "30 3 * * *",
      env: {
        NODE_ENV: "production",
      },
      error_file: __dirname + "/logs/video-validator-error.log",
      out_file: __dirname + "/logs/video-validator-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      name: "lemon-webhooks",
      script: "npx",
      args: "tsx scripts/payments/lemon-server.ts",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: "128M",
      env: {
        NODE_ENV: "production",
        LEMON_WEBHOOK_PORT: "3090",
        SUPABASE_URL: process.env.SUPABASE_URL || "",
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || "",
        LEMONSQUEEZY_SIGNING_SECRET: process.env.LEMONSQUEEZY_SIGNING_SECRET || "",
      },
      error_file: __dirname + "/logs/lemon-webhooks-error.log",
      out_file: __dirname + "/logs/lemon-webhooks-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 1246: Kognai heartbeat daemon — runs every 6 hours
      // Monitors: MRR, agent health, API status, PM2 cron watchdog
      // Writes state to health.json and tier.json
      name: "kognai-heartbeat",
      script: "npx",
      args: "ts-node scripts/heartbeat-daemon.ts",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 */6 * * *",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
      },
      error_file: __dirname + "/logs/heartbeat-error.log",
      out_file: __dirname + "/logs/heartbeat-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // AMD-23 Cerberus Gateway — Sprint 1269
      // External agent access control: Chamber 2 (Cred Score) + Chamber 4 (SOUL Handshake)
      // POST /cerberus/evaluate  GET /cerberus/health  (port 3419)
      // To start: pm2 start ecosystem.config.js --only cerberus-gateway
      name: "cerberus-gateway",
      script: "scripts/amd23/cerberus-gateway.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: "128M",
      min_uptime: "5s",
      max_restarts: 5,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        CERBERUS_PORT: process.env.CERBERUS_PORT || "3419",
        CERBERUS_SECRET: process.env.CERBERUS_SECRET || "",
        HELIXA_API_KEY: process.env.HELIXA_API_KEY || "",
        HELIXA_API_BASE: process.env.HELIXA_API_BASE || "https://api.helixa.ai",
      },
      error_file: __dirname + "/logs/cerberus-error.log",
      out_file: __dirname + "/logs/cerberus-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── Sprint 1275: SCS-001 Entertainment Producer — manual-start only ─────
    // Requires: FAL_KEY in .env (fal.ai Kling/Wan for scene generation)
    // SCS-001 is PAUSED — do NOT add cron_restart until pipeline is unpaused.
    // To start a single run: pm2 start ecosystem.config.js --only scs001-entertainment
    // Or directly: npx ts-node scripts/scs001/produce-entertainment.ts --topic "AI Topic"
    {
      name: "scs001-entertainment",
      script: "scripts/scs001/produce-entertainment.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      // No cron_restart — operator starts manually when pipeline is unpaused
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: __dirname + "/tsconfig.scripts.json",
        FAL_KEY: process.env.FAL_KEY || "",
        ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || "",
        OLLAMA_HOST: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
        SCS_ENTERTAINMENT_TOPIC: process.env.SCS_ENTERTAINMENT_TOPIC || "",
      },
      error_file: __dirname + "/logs/scs001-entertainment-error.log",
      out_file: __dirname + "/logs/scs001-entertainment-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
  ]
};
