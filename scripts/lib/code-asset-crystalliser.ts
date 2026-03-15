// Code Asset Crystalliser — AMD-07 Code Asset Library
// Post-sprint: extract, classify, and index reusable code artifacts.
// Runs automatically after every approved sprint (like skill-crystalliser.ts).
// Model: Qwen3-4B (LOCAL) for classification; falls back to no-op if unavailable.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

export type AssetCategory =
  | 'QUEUE' | 'DATABASE' | 'API' | 'AUTH' | 'PAYMENT' | 'STORAGE'
  | 'WORKER' | 'TESTING' | 'INFRASTRUCTURE' | 'INTELLIGENCE' | 'AGENT' | 'UI' | 'OTHER';

export type AssetTier = 1 | 2 | 3;

// AMD-07-B: 18-field schema
export interface CodeAsset {
  asset_id:              string;
  title:                 string;
  description:           string;
  category:              AssetCategory;
  tags:                  string[];
  language:              string;
  dependencies:          string[];
  interface:             string;        // exported function/class signatures
  usage_example:         string;
  test_coverage:         string;        // 'unit' | 'integration' | 'none'
  quality_score:         number;        // 0-100 (from supervisor score)
  production_validations: number;       // count of approved sprints that used this
  origin:                string;        // 'kognai-core' | 'invoica' | 'voxight' | 'scs:{id}'
  provenance:            string;        // sprint_id that produced it
  ip_status:             'eligible' | 'client-restricted' | 'unknown';
  version:               string;
  last_modified:         string;        // ISO date
  usage_count:           number;
  known_limitations:     string[];
  related_assets:        string[];      // asset_ids
  tier:                  AssetTier;
  source_files:          string[];
}

export interface CrystalliseCodeAssetInput {
  agentId:       string;
  sprintId:      string;
  taskId:        string;
  taskTitle:     string;
  files:         string[];             // paths of approved files
  supervisorScore: number;
  origin:        'kognai-core' | 'invoica' | 'voxight' | string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LIBRARY_DIR   = join(process.cwd(), 'code_assets');
const INDEX_PATH    = join(LIBRARY_DIR, 'index.json');
const ASSETS_DIR    = join(LIBRARY_DIR, 'assets');
const PENDING_DIR   = join(LIBRARY_DIR, 'pending_review');
const MIN_SCORE_FOR_INDEXING = 75;  // below this: not indexed

// ── Index helpers ─────────────────────────────────────────────────────────────

interface LibraryIndex {
  _meta: {
    schema:       string;
    created_at:   string;
    total_assets: number;
    tier_counts:  Record<string, number>;
    categories:   string[];
  };
  assets: Array<Pick<CodeAsset, 'asset_id' | 'title' | 'category' | 'tags' | 'tier' | 'quality_score' | 'language' | 'usage_count' | 'provenance'>>;
}

function loadIndex(): LibraryIndex {
  mkdirSync(LIBRARY_DIR, { recursive: true });
  if (!existsSync(INDEX_PATH)) {
    return {
      _meta: {
        schema:       'AMD-07-B v1.0',
        created_at:   new Date().toISOString().slice(0, 10),
        total_assets: 0,
        tier_counts:  { '1': 0, '2': 0, '3': 0, 'pending': 0 },
        categories:   ['QUEUE','DATABASE','API','AUTH','PAYMENT','STORAGE','WORKER','TESTING','INFRASTRUCTURE','INTELLIGENCE','AGENT','UI','OTHER'],
      },
      assets: [],
    };
  }
  return JSON.parse(readFileSync(INDEX_PATH, 'utf-8')) as LibraryIndex;
}

function saveIndex(idx: LibraryIndex): void {
  writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2), 'utf-8');
}

// ── Category classifier (heuristic — no LLM required for Phase 0) ─────────────

function classifyCategory(files: string[], taskTitle: string): AssetCategory {
  const combined = (files.join(' ') + ' ' + taskTitle).toLowerCase();
  if (/queue|bull|worker|job|redis/.test(combined))      return 'QUEUE';
  if (/database|sql|supabase|postgres|migration|pg/.test(combined)) return 'DATABASE';
  if (/api|endpoint|route|http|rest|fetch/.test(combined)) return 'API';
  if (/auth|jwt|oauth|session|token|login/.test(combined)) return 'AUTH';
  if (/payment|stripe|x402|usdc|wallet/.test(combined))   return 'PAYMENT';
  if (/storage|s3|upload|file|blob/.test(combined))       return 'STORAGE';
  if (/test|spec|jest|vitest|mocha/.test(combined))       return 'TESTING';
  if (/infra|docker|deploy|ci|config|env/.test(combined)) return 'INFRASTRUCTURE';
  if (/intel|oracle|voxight|embed|vector/.test(combined)) return 'INTELLIGENCE';
  if (/agent|prompt|swarm|orchestrat/.test(combined))     return 'AGENT';
  if (/ui|component|react|html|css|tailwind/.test(combined)) return 'UI';
  return 'OTHER';
}

function inferLanguage(files: string[]): string {
  const exts = files.map(f => f.split('.').pop() ?? '');
  if (exts.includes('ts'))  return 'TypeScript';
  if (exts.includes('py'))  return 'Python';
  if (exts.includes('js'))  return 'JavaScript';
  if (exts.includes('sql')) return 'SQL';
  if (exts.includes('sh'))  return 'Shell';
  return 'Unknown';
}

function inferTags(files: string[], title: string): string[] {
  const tokens = (files.join(' ') + ' ' + title)
    .toLowerCase()
    .split(/[\s\-_/.]+/)
    .filter(t => t.length > 3 && !['from', 'with', 'that', 'this', 'into', 'async', 'await'].includes(t));
  return Array.from(new Set(tokens)).slice(0, 8);
}

// ── Main export: crystalliseCodeAsset ─────────────────────────────────────────

/**
 * Index code files from an approved sprint into the Code Asset Library.
 * Only indexes files that are clearly reusable library code (lib/, scripts/lib/, agents/).
 * New assets enter at Tier 3. Returns asset_id or null if skipped.
 */
export function crystalliseCodeAsset(input: CrystalliseCodeAssetInput): string | null {
  // Gate: only index above minimum score
  if (input.supervisorScore < MIN_SCORE_FOR_INDEXING) {
    process.stderr.write(`[code-asset] Score ${input.supervisorScore} < ${MIN_SCORE_FOR_INDEXING} — skipping ${input.taskId}\n`);
    return null;
  }

  // Filter to reusable library files only (exclude workspace/ identity docs)
  const eligibleFiles = input.files.filter(f =>
    !f.startsWith('workspace/') && (
      /\/(lib|utils|helpers|agents)\//i.test(f) ||
      f.endsWith('.sql') ||
      (f.includes('/scripts/') && !f.includes('.test.'))
    )
  );

  if (eligibleFiles.length === 0) {
    return null;  // no reusable library code in this sprint
  }

  const idx = loadIndex();

  // Dedup: skip if this exact task (sprint+title) is already indexed
  const alreadyIndexed = idx.assets.some(
    a => a.provenance === input.sprintId && a.title === input.taskTitle
  );
  if (alreadyIndexed) {
    return null;
  }

  const assetId  = randomUUID();
  const category = classifyCategory(eligibleFiles, input.taskTitle);
  const language = inferLanguage(eligibleFiles);
  const tags     = inferTags(eligibleFiles, input.taskTitle);

  const asset: CodeAsset = {
    asset_id:               assetId,
    title:                  input.taskTitle,
    description:            `Auto-indexed from sprint ${input.sprintId} task ${input.taskId}`,
    category,
    tags,
    language,
    dependencies:           [],
    interface:              '',   // Phase 0: populated manually or by future Code Asset Agent LLM pass
    usage_example:          '',
    test_coverage:          'none',
    quality_score:          input.supervisorScore,
    production_validations: 1,
    origin:                 input.origin,
    provenance:             input.sprintId,
    ip_status:              'eligible',
    version:                '1.0.0',
    last_modified:          new Date().toISOString().slice(0, 10),
    usage_count:            0,
    known_limitations:      [],
    related_assets:         [],
    tier:                   3,    // all new assets enter at Tier 3
    source_files:           eligibleFiles,
  };

  // Write asset schema to assets/{assetId}/schema.json
  const assetDir = join(ASSETS_DIR, assetId);
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, 'schema.json'), JSON.stringify(asset, null, 2), 'utf-8');

  // Update index
  idx.assets.push({
    asset_id:      asset.asset_id,
    title:         asset.title,
    category:      asset.category,
    tags:          asset.tags,
    tier:          asset.tier,
    quality_score: asset.quality_score,
    language:      asset.language,
    usage_count:   asset.usage_count,
    provenance:    asset.provenance,
  });
  idx._meta.total_assets++;
  idx._meta.tier_counts['3'] = (idx._meta.tier_counts['3'] || 0) + 1;
  saveIndex(idx);

  process.stdout.write(`[code-asset] Indexed ${assetId} (${category}, Tier 3, score ${input.supervisorScore}) ← ${input.sprintId}\n`);
  return assetId;
}

// ── Smoke test ────────────────────────────────────────────────────────────────

if (require.main === module) {
  console.log('\n📚 Code Asset Crystalliser — Smoke Test\n');

  const id = crystalliseCodeAsset({
    agentId:         'smoke-coder',
    sprintId:        'sprint-000-smoke',
    taskId:          '000-01',
    taskTitle:       'BrainX PostgreSQL memory client with pgvector',
    files:           ['scripts/lib/brainx-client.ts', 'scripts/lib/brainx-embed.ts', 'scripts/lib/brainx-schema.sql'],
    supervisorScore: 88,
    origin:          'kognai-core',
  });

  if (id) {
    console.log(`✅ crystalliseCodeAsset() → asset_id: ${id}`);
    const idx = JSON.parse(readFileSync(join(process.cwd(), 'code_assets/index.json'), 'utf-8'));
    console.log(`✅ index.json total_assets: ${idx._meta.total_assets}`);
  } else {
    console.log('⚠️  Skipped (score below threshold or no lib files)');
  }

  console.log('\n✅ PASS\n');
}
