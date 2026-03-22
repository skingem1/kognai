#!/usr/bin/env npx ts-node
/**
 * prepare-identity-token.ts — ERC-8004 Identity Token Preparation
 * Sprint 793 (AMD-19)
 *
 * Generates ERC-721 token metadata for the Kognai identity token on Base.
 * Token URI contains:
 *   - Founding Charter SHA-256 hash
 *   - Swarm metadata (agent count, active agents, version)
 *   - Genesis ceremony timestamp
 *   - EAS attestation UID (when available)
 *
 * This script PREPARES the token metadata — actual minting requires
 * the founder's wallet and a deployed contract on Base.
 *
 * Usage:
 *   npx ts-node scripts/chain/prepare-identity-token.ts
 *   npx ts-node scripts/chain/prepare-identity-token.ts --output workspace/chain/identity-token.json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const ROOT = join(__dirname, '..', '..');
const CHARTER_PATH = join(ROOT, 'workspace', 'shared-context', 'FOUNDING_CHARTER.md');
const ATTESTATION_PATH = join(ROOT, 'workspace', 'chain', 'charter-attestation-prep.json');
const AGENTS_DIR = join(ROOT, 'agents');
const OUTPUT_DIR = join(ROOT, 'workspace', 'chain');

// Base network config
const BASE_CHAIN_ID = 8453;
const EAS_CONTRACT = '0xC2679fBD37d54388Ce493F1DB75320D236e1815e';

// ─── Types ──────────────────────────────────────────────────────────

interface ERC721Metadata {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
    display_type?: string;
  }>;
}

interface IdentityTokenPrep {
  token: {
    standard: 'ERC-721';
    name: string;
    symbol: string;
    network: 'base';
    chain_id: number;
  };
  metadata: ERC721Metadata;
  charter: {
    hash: string;
    hash_algorithm: 'SHA-256';
    version: string;
    article_count: number;
    immutable_law_count: number;
    charter_status: string;
  };
  swarm: {
    total_agents: number;
    agent_ids: string[];
    framework_version: string;
    model_tiers: string[];
  };
  eas: {
    contract: string;
    attestation_uid: string;
    schema_fields: string;
  };
  genesis: {
    prepared_at: string;
    ready_to_mint: boolean;
    blockers: string[];
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeCharterHash(): { hash: string; version: string; articleCount: number; immutableLawCount: number; status: string } {
  if (!existsSync(CHARTER_PATH)) {
    return { hash: '0x0', version: 'unknown', articleCount: 0, immutableLawCount: 0, status: 'NOT_FOUND' };
  }

  const charterText = readFileSync(CHARTER_PATH, 'utf-8');
  const hash = '0x' + createHash('sha256').update(charterText).digest('hex');

  // Count articles (## Article lines)
  const articleCount = (charterText.match(/^##\s+Article/gm) || []).length;

  // Count immutable laws (lines marked as immutable)
  const immutableLawCount = (charterText.match(/immutable|non-negotiable|cannot be (changed|modified|removed)/gi) || []).length;

  // Check charter status
  const statusMatch = charterText.match(/Status:\s*(DRAFT|FINAL|RATIFIED)/i);
  const status = statusMatch ? statusMatch[1].toUpperCase() : 'DRAFT';

  return { hash, version: 'v1.0', articleCount, immutableLawCount, status };
}

function discoverAgents(): string[] {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

function loadAttestationPrep(): { uid: string; schemaFields: string } {
  if (!existsSync(ATTESTATION_PATH)) {
    return { uid: '', schemaFields: '' };
  }
  const data = JSON.parse(readFileSync(ATTESTATION_PATH, 'utf-8'));
  return {
    uid: data.attestation_uid || '',
    schemaFields: data.schema?.fields || '',
  };
}

// ─── Main ───────────────────────────────────────────────────────────

function main(): void {
  console.log('=== Kognai ERC-8004 Identity Token — Preparation ===\n');

  // 1. Charter
  const charter = computeCharterHash();
  console.log(`Charter: ${charter.status} (${charter.articleCount} articles, hash: ${charter.hash.slice(0, 18)}...)`);

  // 2. Swarm
  const agents = discoverAgents();
  console.log(`Swarm: ${agents.length} agents`);

  // 3. EAS
  const eas = loadAttestationPrep();
  console.log(`EAS: ${eas.uid ? 'Attested' : 'Not yet attested'}`);

  // 4. Blockers
  const blockers: string[] = [];
  if (charter.status !== 'FINAL' && charter.status !== 'RATIFIED') {
    blockers.push('Charter status must be FINAL or RATIFIED (currently ' + charter.status + ')');
  }
  if (!eas.uid) {
    blockers.push('EAS attestation not yet submitted — run prepare-charter-attestation.ts first');
  }
  if (charter.hash === '0x0') {
    blockers.push('Charter file not found at ' + CHARTER_PATH);
  }

  // 5. Build metadata
  const metadata: ERC721Metadata = {
    name: 'Kognai Identity Token',
    description: 'Sovereign AI runtime identity — ERC-8004. Anchors the Founding Charter and swarm metadata on Base.',
    image: '', // Will be set to IPFS CID of the identity visual
    external_url: '',
    attributes: [
      { trait_type: 'Charter Hash', value: charter.hash },
      { trait_type: 'Charter Version', value: charter.version },
      { trait_type: 'Charter Status', value: charter.status },
      { trait_type: 'Article Count', value: charter.articleCount, display_type: 'number' },
      { trait_type: 'Immutable Laws', value: charter.immutableLawCount, display_type: 'number' },
      { trait_type: 'Swarm Agent Count', value: agents.length, display_type: 'number' },
      { trait_type: 'Network', value: 'Base' },
      { trait_type: 'Chain ID', value: BASE_CHAIN_ID, display_type: 'number' },
      { trait_type: 'Framework', value: 'OpenClaw v2026.3.7' },
      { trait_type: 'Genesis Date', value: new Date().toISOString().split('T')[0] },
    ],
  };

  // 6. Build full prep
  const prep: IdentityTokenPrep = {
    token: {
      standard: 'ERC-721',
      name: 'Kognai Identity Token',
      symbol: 'KOGNAI',
      network: 'base',
      chain_id: BASE_CHAIN_ID,
    },
    metadata,
    charter: {
      hash: charter.hash,
      hash_algorithm: 'SHA-256',
      version: charter.version,
      article_count: charter.articleCount,
      immutable_law_count: charter.immutableLawCount,
      charter_status: charter.status,
    },
    swarm: {
      total_agents: agents.length,
      agent_ids: agents,
      framework_version: 'OpenClaw v2026.3.7',
      model_tiers: ['T1-Nano (qwen3:0.6b)', 'T1-Local (qwen3:4b)', 'T2-Power (qwen3:14b)', 'T3-Cloud (Claude Sonnet)', 'T4-Apex (Claude Opus)'],
    },
    eas: {
      contract: EAS_CONTRACT,
      attestation_uid: eas.uid,
      schema_fields: eas.schemaFields,
    },
    genesis: {
      prepared_at: new Date().toISOString(),
      ready_to_mint: blockers.length === 0,
      blockers,
    },
  };

  // 7. Output
  const outputArg = process.argv.indexOf('--output');
  const outputPath = outputArg >= 0 && process.argv[outputArg + 1]
    ? join(ROOT, process.argv[outputArg + 1])
    : join(OUTPUT_DIR, 'identity-token-prep.json');

  writeFileSync(outputPath, JSON.stringify(prep, null, 2) + '\n');

  console.log(`\nOutput: ${outputPath}`);
  console.log(`Ready to mint: ${prep.genesis.ready_to_mint ? 'YES' : 'NO'}`);
  if (blockers.length > 0) {
    console.log('\nBlockers:');
    blockers.forEach(b => console.log(`  - ${b}`));
  }
  console.log('\nNext steps:');
  console.log('  1. Finalize charter (DRAFT → FINAL)');
  console.log('  2. Upload charter to IPFS');
  console.log('  3. Submit EAS attestation on Base');
  console.log('  4. Deploy ERC-721 contract on Base');
  console.log('  5. Mint identity token with this metadata');
}

main();
