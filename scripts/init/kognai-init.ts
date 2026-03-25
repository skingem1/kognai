#!/usr/bin/env ts-node
/**
 * kognai-init.ts — `npx kognai init` installer
 * Sprint 1266 / AMD24-AGENT-COMPUTER
 *
 * Interactive setup wizard that provisions the Kognai Sovereign Vault
 * runtime on one of two vault paths:
 *
 *   Path A — Local Mac Mini / Hetzner VPS (existing on-prem vault)
 *   Path B — agentcomputer.ai cloud vault ($20/mo, 25 VMs, 0.5s spin-up)
 *
 * INTEL-017: agentcomputer.ai is a viable Path B for operators who have
 * no local Mac Mini or dedicated VPS. The installer detects environment,
 * asks which path the user wants, and writes configuration + API key to
 * the Sovereign Vault (.env + workspace/arch001/amd24-drp-config.json).
 *
 * AMD-24 Distributed Runtime Protocol (DRP):
 *   - Path A: VAULT_HOST=<local-ip>, VAULT_LOCAL_MODEL_POWER=qwen3:4b, etc.
 *   - Path B: VAULT_HOST=agentcomputer.ai, AGENT_COMPUTER_API_KEY=<key>,
 *             VAULT_LOCAL_MODEL_POWER=agentcomputer:qwen3-4b
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../..');
const ENV_FILE = path.join(ROOT, '.env');
const DRP_CONFIG = path.join(ROOT, 'workspace', 'arch001', 'amd24-drp-config.json');
const AGENT_COMPUTER_DOCS = 'https://agentcomputer.ai/docs/api';

const BANNER = `
╔══════════════════════════════════════════════════════╗
║          KOGNAI INIT — Sovereign Vault Setup         ║
║          AMD-24 Distributed Runtime Protocol         ║
╚══════════════════════════════════════════════════════╝
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VaultPath = 'A' | 'B';

export interface PathAConfig {
  path: 'A';
  vaultHost: string;
  vaultPort: number;
  localModelPower: string;
  localModelNano: string;
}

export interface PathBConfig {
  path: 'B';
  agentComputerApiKey: string;
  vmRegion: string;
  /** agentcomputer.ai model alias for power tier */
  cloudModelPower: string;
}

export type VaultConfig = PathAConfig | PathBConfig;

export interface DrpRecord {
  _comment: string;
  _sprint: string;
  version: string;
  selectedPath: VaultPath;
  configuredAt: string;
  pathA: Omit<PathAConfig, 'path'> | null;
  pathB: Omit<PathBConfig, 'path'> | null;
}

// ---------------------------------------------------------------------------
// readline helper
// ---------------------------------------------------------------------------

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function confirm(rl: readline.Interface, question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await ask(rl, `${question} ${hint}: `);
  if (answer === '') return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/** Read existing .env as a key→value map (skips comments). */
function readEnv(envPath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(envPath)) return map;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    map.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
  }
  return map;
}

/** Upsert key=value pairs into an existing .env file (preserves existing lines). */
function upsertEnv(envPath: string, updates: Record<string, string>): void {
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf-8').split('\n')
    : [];

  const written = new Set<string>();
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) {
      out.push(line);
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx < 0) { out.push(line); continue; }
    const key = trimmed.slice(0, idx).trim();
    if (key in updates) {
      out.push(`${key}=${updates[key]}`);
      written.add(key);
    } else {
      out.push(line);
    }
  }

  // append keys that weren't already in the file
  const newKeys = Object.keys(updates).filter((k) => !written.has(k));
  if (newKeys.length > 0) {
    out.push('');
    out.push('# AMD-24 Vault configuration (kognai init)');
    for (const k of newKeys) out.push(`${k}=${updates[k]}`);
  }

  fs.writeFileSync(envPath, out.join('\n') + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Path A wizard
// ---------------------------------------------------------------------------

async function wizardPathA(rl: readline.Interface): Promise<PathAConfig> {
  console.log('\n📦 Path A — Local / On-Prem Vault\n');
  console.log('  This path uses your local Mac Mini or Hetzner VPS as the model vault.');
  console.log('  Ollama must be running and accessible.\n');

  const existingEnv = readEnv(ENV_FILE);

  const defaultHost = existingEnv.get('OLLAMA_HOST') ?? 'http://127.0.0.1:11434';
  const vaultHost = await ask(rl, `  Ollama host [${defaultHost}]: `) || defaultHost;

  const defaultPort = 11434;
  const portStr = await ask(rl, `  Ollama port [${defaultPort}]: `);
  const vaultPort = portStr ? parseInt(portStr, 10) : defaultPort;

  const defaultPower = existingEnv.get('VAULT_LOCAL_MODEL_POWER') ?? 'qwen3:4b';
  const localModelPower = await ask(rl, `  Power model (qwen3:4b / qwen3:14b) [${defaultPower}]: `) || defaultPower;

  const defaultNano = existingEnv.get('VAULT_LOCAL_MODEL_NANO') ?? 'qwen3:0.6b';
  const localModelNano = await ask(rl, `  Nano model [${defaultNano}]: `) || defaultNano;

  return { path: 'A', vaultHost, vaultPort, localModelPower, localModelNano };
}

// ---------------------------------------------------------------------------
// Path B wizard
// ---------------------------------------------------------------------------

async function wizardPathB(rl: readline.Interface): Promise<PathBConfig> {
  console.log('\n☁️  Path B — agentcomputer.ai Cloud Vault\n');
  console.log(`  $20/month · 25 VMs · 0.5s spin-up · Managed by agentcomputer.ai`);
  console.log(`  API key available at: ${AGENT_COMPUTER_DOCS}\n`);

  const existingEnv = readEnv(ENV_FILE);
  const existingKey = existingEnv.get('AGENT_COMPUTER_API_KEY') ?? '';

  let agentComputerApiKey = '';
  if (existingKey && existingKey !== '<your-key>') {
    const useExisting = await confirm(rl, `  Found existing AGENT_COMPUTER_API_KEY. Keep it?`);
    agentComputerApiKey = useExisting ? existingKey : '';
  }
  if (!agentComputerApiKey) {
    agentComputerApiKey = await ask(rl, '  AGENT_COMPUTER_API_KEY: ');
    if (!agentComputerApiKey) {
      agentComputerApiKey = '<your-key>';
      console.log('  ⚠️  No key provided — placeholder written. Update .env before deploying.');
    }
  }

  const regions = ['eu-west', 'us-east', 'us-west', 'ap-southeast'];
  console.log(`\n  Available regions: ${regions.join(', ')}`);
  const vmRegion = await ask(rl, '  VM region [eu-west]: ') || 'eu-west';

  const defaultModel = 'agentcomputer:qwen3-4b';
  const cloudModelPower = await ask(rl, `  Power model alias [${defaultModel}]: `) || defaultModel;

  return { path: 'B', agentComputerApiKey, vmRegion, cloudModelPower };
}

// ---------------------------------------------------------------------------
// Apply configuration
// ---------------------------------------------------------------------------

function applyPathA(cfg: PathAConfig): void {
  upsertEnv(ENV_FILE, {
    OLLAMA_HOST: cfg.vaultHost,
    VAULT_LOCAL_MODEL_POWER: cfg.localModelPower,
    VAULT_LOCAL_MODEL_NANO: cfg.localModelNano,
    AMD24_VAULT_PATH: 'A',
  });
}

function applyPathB(cfg: PathBConfig): void {
  upsertEnv(ENV_FILE, {
    VAULT_HOST: 'https://api.agentcomputer.ai',
    AGENT_COMPUTER_API_KEY: cfg.agentComputerApiKey,
    AGENT_COMPUTER_REGION: cfg.vmRegion,
    VAULT_LOCAL_MODEL_POWER: cfg.cloudModelPower,
    AMD24_VAULT_PATH: 'B',
  });
}

function writeDrpConfig(cfg: VaultConfig): void {
  const record: DrpRecord = {
    _comment: 'AMD-24 Distributed Runtime Protocol — vault path selection (kognai init)',
    _sprint: 'Sprint 1266 (AMD24-AGENT-COMPUTER)',
    version: '1.0',
    selectedPath: cfg.path,
    configuredAt: new Date().toISOString(),
    pathA: cfg.path === 'A'
      ? { vaultHost: cfg.vaultHost, vaultPort: cfg.vaultPort, localModelPower: cfg.localModelPower, localModelNano: cfg.localModelNano }
      : null,
    pathB: cfg.path === 'B'
      ? {
          // never write the actual key to the DRP config — security hygiene
          agentComputerApiKey: cfg.agentComputerApiKey === '<your-key>' ? '<not-set>' : '<redacted>',
          vmRegion: cfg.vmRegion,
          cloudModelPower: cfg.cloudModelPower,
        }
      : null,
  };
  fs.mkdirSync(path.dirname(DRP_CONFIG), { recursive: true });
  fs.writeFileSync(DRP_CONFIG, JSON.stringify(record, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export async function runInit(opts: { dryRun?: boolean } = {}): Promise<VaultConfig | null> {
  console.log(BANNER);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('  Kognai needs a model vault to run local inference.\n');
    console.log('  Path A — Local Mac Mini / Hetzner VPS (you manage the hardware)');
    console.log('  Path B — agentcomputer.ai cloud vault ($20/mo, 25 VMs, 0.5s spin-up)\n');

    const pathInput = await ask(rl, 'Select vault path (A/B) [A]: ');
    const vaultPath: VaultPath = pathInput.toUpperCase() === 'B' ? 'B' : 'A';

    let cfg: VaultConfig;
    if (vaultPath === 'A') {
      cfg = await wizardPathA(rl);
    } else {
      cfg = await wizardPathB(rl);
    }

    console.log('\n  Configuration summary:');
    console.log(`    Vault path:   ${cfg.path === 'A' ? 'A (local)' : 'B (agentcomputer.ai)'}`);
    if (cfg.path === 'A') {
      console.log(`    Ollama host:  ${cfg.vaultHost}`);
      console.log(`    Power model:  ${cfg.localModelPower}`);
      console.log(`    Nano model:   ${cfg.localModelNano}`);
    } else {
      console.log(`    Region:       ${cfg.vmRegion}`);
      console.log(`    Power model:  ${cfg.cloudModelPower}`);
      console.log(`    API key:      ${cfg.agentComputerApiKey === '<your-key>' ? '(not set)' : '••••••••' + cfg.agentComputerApiKey.slice(-4)}`);
    }

    const proceed = await confirm(rl, '\n  Write configuration to .env and amd24-drp-config.json?');
    if (!proceed) {
      console.log('\n  Cancelled. No files were written.\n');
      return null;
    }

    if (!opts.dryRun) {
      if (cfg.path === 'A') applyPathA(cfg);
      else                  applyPathB(cfg);
      writeDrpConfig(cfg);
    } else {
      console.log('  [dry-run] would write:', JSON.stringify(cfg, null, 4));
    }

    console.log('\n  ✅ Vault configured. Next steps:');
    if (cfg.path === 'A') {
      console.log('     1. Ensure Ollama is running: ollama serve');
      console.log('     2. Pull models: ollama pull qwen3:4b && ollama pull qwen3:0.6b');
      console.log('     3. Start Kognai: npm run sprint');
    } else {
      if (cfg.agentComputerApiKey === '<your-key>') {
        console.log(`     1. Set AGENT_COMPUTER_API_KEY in .env (see ${AGENT_COMPUTER_DOCS})`);
        console.log('     2. Start Kognai: npm run sprint');
      } else {
        console.log('     1. Start Kognai: npm run sprint');
        console.log(`     2. Docs: ${AGENT_COMPUTER_DOCS}`);
      }
    }
    console.log('');

    return cfg;
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('[dry-run mode — no files will be written]\n');
  runInit({ dryRun }).then((cfg) => {
    process.exit(cfg !== null ? 0 : 1);
  }).catch((err) => {
    console.error('kognai init failed:', err.message);
    process.exit(1);
  });
}
