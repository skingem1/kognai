#!/usr/bin/env ts-node
/**
 * Sprint 651 Validation — BrainX Episodic Memory Module
 * Checks: module structure, AMD-02 types, embedding integration, schema.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  console.log('\n=== Sprint 651 Validation — BrainX Episodic Memory ===\n');

  // 1. Module files exist
  console.log('--- Files ---');
  const clientPath = join(ROOT, 'scripts', 'lib', 'brainx-client.ts');
  const embedPath = join(ROOT, 'scripts', 'lib', 'brainx-embed.ts');
  const schemaPath = join(ROOT, 'scripts', 'lib', 'brainx-schema.sql');
  assert('brainx-client.ts exists', existsSync(clientPath));
  assert('brainx-embed.ts exists', existsSync(embedPath));
  assert('brainx-schema.sql exists', existsSync(schemaPath));

  // 2. Client module loads
  console.log('\n--- Client Module ---');
  let client: any;
  try {
    client = await import(clientPath);
    assert('brainx-client module loads', true);
  } catch (e: any) {
    assert('brainx-client module loads', false, e.message);
    process.exit(1);
  }

  assert('BrainXClient class exported', typeof client.BrainXClient === 'function');

  // 3. AMD-02 memory types
  console.log('\n--- AMD-02 Memory Types ---');
  const clientSrc = readFileSync(clientPath, 'utf-8');
  assert('MemoryType includes skill_rental_gotcha', clientSrc.includes("'skill_rental_gotcha'"));
  assert('MemoryType includes skill_rental_learning', clientSrc.includes("'skill_rental_learning'"));
  assert('MemoryType includes episode', clientSrc.includes("'episode'"));
  assert('MemoryType includes reflection', clientSrc.includes("'reflection'"));

  // 4. Tier system
  console.log('\n--- Tier System ---');
  assert('MemoryTier includes HOT', clientSrc.includes("'HOT'"));
  assert('MemoryTier includes WARM', clientSrc.includes("'WARM'"));
  assert('MemoryTier includes COLD', clientSrc.includes("'COLD'"));
  assert('MemoryTier includes RENTAL_EXPIRED', clientSrc.includes("'RENTAL_EXPIRED'"));

  // 5. Rental fields
  console.log('\n--- Rental Fields (AMD-02-I) ---');
  assert('BrainXMemory has rental_id', clientSrc.includes('rental_id'));
  assert('BrainXMemory has skill_id', clientSrc.includes('skill_id'));
  assert('BrainXMemory has rental_swarm_id', clientSrc.includes('rental_swarm_id'));
  assert('BrainXMemory has rental_expires_at', clientSrc.includes('rental_expires_at'));
  assert('BrainXMemory has propagated_from', clientSrc.includes('propagated_from'));
  assert('BrainXMemory has is_rental_expired', clientSrc.includes('is_rental_expired'));

  // 6. Core methods
  console.log('\n--- Core Methods ---');
  assert('store() method exists', clientSrc.includes('async store('));
  assert('retrieve() method exists', clientSrc.includes('async retrieve('));
  assert('touch() method exists', clientSrc.includes('async touch('));
  assert('injectContext() method exists', clientSrc.includes('async injectContext('));
  assert('close() method exists', clientSrc.includes('async close('));

  // 7. Embedding module
  console.log('\n--- Embedding Module ---');
  let embedMod: any;
  try {
    embedMod = await import(embedPath);
    assert('brainx-embed module loads', true);
  } catch (e: any) {
    assert('brainx-embed module loads', false, e.message);
  }

  const embedSrc = readFileSync(embedPath, 'utf-8');
  assert('Uses nomic-embed-text model', embedSrc.includes('nomic-embed-text'));
  assert('768-dim vectors', embedSrc.includes('768'));
  assert('embed() exported', typeof embedMod?.embed === 'function');
  assert('cosineSimilarity() exported', typeof embedMod?.cosineSimilarity === 'function');

  // 8. Live embed test (if Ollama available)
  console.log('\n--- Live Embed Test ---');
  try {
    const vec = await embedMod.embed('test memory');
    assert('Live embedding returns 768-dim vector', Array.isArray(vec) && vec.length === 768);
  } catch (e: any) {
    console.log(`  ⚠ Ollama unavailable — skipping live test (${e.message})`);
  }

  // 9. Schema
  console.log('\n--- Schema ---');
  const schemaSrc = readFileSync(schemaPath, 'utf-8');
  assert('Schema has brainx_memories table', schemaSrc.includes('brainx_memories'));
  assert('Schema has pgvector extension', schemaSrc.includes('vector'));
  assert('Schema has memory_type column', schemaSrc.includes('memory_type'));
  assert('Schema has tier column', schemaSrc.includes('tier'));
  assert('Schema has embedding column', schemaSrc.includes('embedding'));
  assert('Schema has rental fields', schemaSrc.includes('rental_id'));

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
