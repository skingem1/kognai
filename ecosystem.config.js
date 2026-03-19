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
      // sprint-runner: checks every 30 min for pending sprint tasks, runs MiniMax orchestrator
      // This closes the loop: CEO issues → sprint JSON → auto-execution
      // To queue work: write a sprints/week-N.json with status:"pending" tasks
      name: "sprint-runner",
      script: "./scripts/sprint-runner.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/home/invoica/apps/Invoica",
      autorestart: false,
      watch: false,
      cron_restart: "*/30 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/home/invoica/apps/Invoica/tsconfig.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
        // x402 wallet spending: code agent wallet pays 0.001 USDC per LLM call
        // Seller wallet = CTO agent wallet (receives USDC from inference payments)
        X402_SELLER_WALLET: "0x3e127c918C83714616CF2416f8A620F1340C19f1",
        INFERENCE_API_URL: "http://localhost:3001",
      },
      error_file: "/home/invoica/apps/Invoica/logs/sprint-runner-error.log",
      out_file: "/home/invoica/apps/Invoica/logs/sprint-runner-out.log",
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
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "*/5 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        VAULT_OLLAMA_URL: process.env.VAULT_OLLAMA_URL || "http://vault:11434",
      },
      error_file: "/Users/tarekmnif/kognai/logs/drain-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/drain-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Telegram Bot — long-polling daemon for subscriber interaction
      // Commands: /start, /help, /preview, /schedule, /status, /stats, /subscribe
      // Requires: TELEGRAM_BOT_TOKEN + OWNER_TELEGRAM_CHAT_ID in .env
      name: "telegram-bot",
      script: "agents/telegram-bot/index.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      autorestart: true,
      watch: false,
      max_memory_restart: "128M",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || "",
      },
      error_file: "/Users/tarekmnif/kognai/logs/telegram-bot-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/telegram-bot-out.log",
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
      cwd: "/Users/tarekmnif/kognai",
      autorestart: true,
      watch: false,
      max_memory_restart: "64M",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
        STRIPE_WEBHOOK_PORT: process.env.STRIPE_WEBHOOK_PORT || "3001",
      },
      error_file: "/Users/tarekmnif/kognai/logs/stripe-webhook-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/stripe-webhook-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Smoke Test Cron — runs full 15-stage mock pipeline daily at 06:00 UTC
      // Writes reports/smoke-test-latest.json (read by daily digest at 07:00).
      // Ensures digest always has fresh pipeline health data.
      name: "kognai-smoke-test",
      script: "scripts/smoke-test-pipeline.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "0 6 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
      },
      error_file: "/Users/tarekmnif/kognai/logs/smoke-test-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/smoke-test-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Pipeline Watchdog — Sprint 141. Checks publish-ledger.jsonl freshness every 30 min.
      // Sends Telegram alert if ledger hasn't been updated in >4h (pipeline stuck/failed).
      // Silent when pipeline is healthy. Set WATCHDOG_DRY_RUN=1 to test without sending.
      name: "kognai-pipeline-watchdog",
      script: "scripts/pipeline-watchdog.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "*/30 * * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || "",
      },
      error_file: "/Users/tarekmnif/kognai/logs/pipeline-watchdog-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/pipeline-watchdog-out.log",
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
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "0 7 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || "",
      },
      error_file: "/Users/tarekmnif/kognai/logs/daily-digest-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/daily-digest-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Gate Regen — regenerates workspace/gates/phase1-5-gate.json daily at 06:55
      // Runs 5 min before daily digest (07:00) so digest always has fresh gate data.
      // To start: pm2 start ecosystem.config.js --only kognai-gate-regen
      name: "kognai-gate-regen",
      script: "scripts/scs001/generate-phase1-5-gate.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "55 6 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
      },
      error_file: "/Users/tarekmnif/kognai/logs/gate-regen-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/gate-regen-out.log",
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
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "8 7 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
      },
      error_file: "/Users/tarekmnif/kognai/logs/gate-tracker-update-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/gate-tracker-update-out.log",
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
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "45 6 * * *",
      env: {
        VAULT_OLLAMA_URL: process.env.VAULT_OLLAMA_URL || "http://vault:11434",
        VAULT_MODEL: process.env.VAULT_LOCAL_MODEL_POWER || "qwen3:14b",
      },
      error_file: "/Users/tarekmnif/kognai/logs/brief-regen-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/brief-regen-out.log",
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
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "50 6 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
      },
      error_file: "/Users/tarekmnif/kognai/logs/calendar-regen-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/calendar-regen-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 155: Posting time reminder — noon (12:00)
      // Sends owner a Telegram nudge with next video to post + file path + /record shortcut.
      // Silent if gate already met (30 posts). To start: pm2 start ecosystem.config.js --only kognai-post-noon
      name: "kognai-post-noon",
      script: "scripts/posting-reminder.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "0 12 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || "",
      },
      error_file: "/Users/tarekmnif/kognai/logs/post-noon-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/post-noon-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // Sprint 155: Posting time reminder — evening (18:00)
      // Same nudge pattern as noon but fires at 18:00. To start: pm2 start ecosystem.config.js --only kognai-post-evening
      name: "kognai-post-evening",
      script: "scripts/posting-reminder.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "0 18 * * *",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        CEO_TELEGRAM_BOT_TOKEN: process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "",
        OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || "",
      },
      error_file: "/Users/tarekmnif/kognai/logs/post-evening-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/post-evening-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    {
      // SCS-001 Pipeline — runs 4x daily at posting slot times (Charter schedule)
      // Slots: 07:00, 12:00, 18:00, 21:00 UTC
      // Runs full 12-stage pipeline: Trend→Discovery→ClipDetection→Insight→Script→
      // Editing→Caption→QC→Publishing→Analytics→Flywheel→FailureLibrary
      // Default: mock mode (no cloud costs). Set SCS_MODE=live for real API calls.
      name: "scs001-pipeline",
      script: "agents/scs001-orchestrator/run-pipeline.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "0 7,12,18,21 * * *",
      args: process.env.SCS_MODE || "mock",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        OLLAMA_HOST: "http://127.0.0.1:11434",
        SCS_CLIPS_DIR: "/Users/tarekmnif/kognai/clips",
      },
      error_file: "/Users/tarekmnif/kognai/logs/scs001-pipeline-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/scs001-pipeline-out.log",
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
      cwd: "/Users/tarekmnif/kognai/dashboard",
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      error_file: "/Users/tarekmnif/kognai/logs/dashboard-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/dashboard-out.log",
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
      cwd: "/Users/tarekmnif/kognai",
      autorestart: false,
      watch: false,
      cron_restart: "0 7,12,18,21 * * *",
      args: "live",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        OLLAMA_HOST: "http://127.0.0.1:11434",
        SCS_MODE: "live",
        SCS_CLIPS_DIR: "/Users/tarekmnif/kognai/clips",
        TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN || "",
      },
      error_file: "/Users/tarekmnif/kognai/logs/scs001-live-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/scs001-live-out.log",
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
      cwd: "/Users/tarekmnif/kognai",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        ACHIRI_PORT: "3420",
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        OLLAMA_URL: "http://127.0.0.1:11434",
      },
      error_file: "/Users/tarekmnif/kognai/logs/achiri-api-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/achiri-api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── SPRINT-171-PUB: Auto-send video to owner via Telegram (07:30 + 17:30 UTC) ──
    {
      name: "kognai-auto-send-video",
      script: "scripts/auto-send-video.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      cron_restart: "30 7,17 * * *",
      autorestart: false,
      watch: false,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
      },
      error_file: "/Users/tarekmnif/kognai/logs/auto-send-video-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/auto-send-video-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── Sprint 233: Auto-Post Daemon — posts top video to TikTok 2x/day ──────
    {
      name: "kognai-auto-post",
      script: "scripts/scs001/auto-post.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      cron_restart: "0 8,19 * * *",
      autorestart: false,
      watch: false,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
      },
      error_file: "/Users/tarekmnif/kognai/logs/auto-post-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/auto-post-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── Sprint 234: Token auto-refresh — daily at 03:00 ──────────────────────
    {
      name: "kognai-token-refresh",
      script: "scripts/tiktok-refresh-token.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      cron_restart: "0 3 * * *",
      autorestart: false,
      watch: false,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
      },
      error_file: "/Users/tarekmnif/kognai/logs/token-refresh-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/token-refresh-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── Sprint 234: Post verification — 1h after each auto-post ────────────
    {
      name: "kognai-verify-posts",
      script: "scripts/scs001/verify-posts.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      cron_restart: "0 9,20 * * *",
      autorestart: false,
      watch: false,
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
      },
      error_file: "/Users/tarekmnif/kognai/logs/verify-posts-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/verify-posts-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
    // ─── ClawRouter HTTP Gateway (Sprint 173) ─────────────────────────────────
    {
      name: "clawrouter-gateway",
      script: "scripts/services/clawrouter-http-server.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      cwd: "/Users/tarekmnif/kognai",
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_PROJECT: "/Users/tarekmnif/kognai/tsconfig.scripts.json",
        CLAWROUTER_PORT: "3101",
      },
      error_file: "/Users/tarekmnif/kognai/logs/clawrouter-gateway-error.log",
      out_file: "/Users/tarekmnif/kognai/logs/clawrouter-gateway-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    },
  ]
};
