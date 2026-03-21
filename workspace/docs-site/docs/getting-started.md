# Getting Started

## Prerequisites

- **Mac Mini M4 Pro** (or any ARM64 macOS machine)
- **Ollama** installed with local models:
  - `qwen3:0.6b` (Nano tier)
  - `qwen3:4b` (Local tier)
  - `qwen3:14b` (Power tier)
  - `deepseek-r1:14b` (Power tier, reasoning)
  - `nomic-embed-text` (embeddings)
- **Node.js** 20+ with TypeScript
- **Python** 3.10+ (for runtime router)
- **PM2** process manager
- **Supabase** account (for event bus and storage)

## Installation

```bash
# Clone the repository
git clone https://github.com/skingem1/kognai.git
cd kognai

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your API keys
```

## Environment Variables

Required variables (see `.env.example` for full list):

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Cloud tier LLM access |
| `OLLAMA_HOST` | Yes | Local Ollama endpoint (default: `http://127.0.0.1:11434`) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot for operator commands |
| `OWNER_TELEGRAM_CHAT_ID` | Yes | Your Telegram chat ID |

## Running the Pipeline

```bash
# Start the SCS-001 pipeline (PM2)
pm2 start ecosystem.config.js

# Or run manually
npx ts-node scripts/scs001/run-pipeline.ts

# Check status
pm2 status
```

## Operator Commands (Telegram)

Once the Telegram bot is running, use these commands:

| Command | Description |
|---------|-------------|
| `/status` | Full pipeline status |
| `/today` | Daily operator cockpit |
| `/review` | Top 3 QC-passed videos |
| `/queue` | Unposted video queue |
| `/post-now` | Manual posting assistant |
| `/caption` | Generate TikTok caption |
| `/metrics` | Pipeline metrics |
| `/revenue` | Revenue tracking |

## Next Steps

- Read the [Architecture Overview](architecture.md) to understand the 9-layer design
- Browse the [Agent Catalog](agent-catalog.md) to see all available agents
- Check the [API Reference](api-reference.md) for integration endpoints
