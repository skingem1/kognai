#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const configPath = path.join(process.env.HOME || '/home/agent', '.openclaw', 'openclaw.json');
console.log('Reading config from:', configPath);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (!config.models) config.models = {};
if (!config.models.providers) config.models.providers = {};
config.models.providers.minimax = {
  baseUrl: "https://api.minimax.io/v1",
  api: "openai-completions",
  apiKey: "${MINIMAX_API_KEY}",
  models: [{
    id: "MiniMax-M2.5", name: "MiniMax M2.5", api: "openai-completions",
    reasoning: true, input: ["text"],
    cost: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000000, maxTokens: 16384
  }]
};
const p = '/home/agent/agentic-finance-platform';
config.agents = {
  defaults: { model: { primary: "blockrun/auto" }, subagents: { archiveAfterMinutes: 120 } },
  list: [
    { id: "ceo", workspace: p+"/agents/ceo", model: { primary: "blockrun/auto", fallbacks: ["blockrun/anthropic/claude-sonnet-4"] } },
    { id: "supervisor", workspace: p+"/agents/supervisor", model: { primary: "blockrun/auto", fallbacks: ["blockrun/anthropic/claude-sonnet-4"] } },
    { id: "skills", workspace: p+"/agents/skills", model: { primary: "blockrun/auto", fallbacks: ["blockrun/anthropic/claude-sonnet-4"] } },
    { id: "backend-core", workspace: p+"/agents/backend-core", model: { primary: "minimax/MiniMax-M2.5" } },
    { id: "backend-tax", workspace: p+"/agents/backend-tax", model: { primary: "minimax/MiniMax-M2.5" } },
    { id: "backend-ledger", workspace: p+"/agents/backend-ledger", model: { primary: "minimax/MiniMax-M2.5" } },
    { id: "frontend", workspace: p+"/agents/frontend", model: { primary: "minimax/MiniMax-M2.5" } },
    { id: "devops", workspace: p+"/agents/devops", model: { primary: "minimax/MiniMax-M2.5" } },
    { id: "security", workspace: p+"/agents/security", model: { primary: "minimax/MiniMax-M2.5" } }
  ]
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
console.log('Config updated! Agents:', config.agents.list.length);
console.log('  Claude (ClawRouter): ceo, supervisor, skills');
console.log('  MiniMax: backend-core, backend-tax, backend-ledger, frontend, devops, security');
