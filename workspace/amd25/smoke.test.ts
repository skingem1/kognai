/**
 * AMD-25 DKA Store — Smoke Test
 * Sprint 997
 */

import { KnowledgeStore } from './dka-store.js';

let pass = 0; let fail = 0;
const ok = (msg: string) => { console.log(`  ✓ ${msg}`); pass++; };
const err = (msg: string, e?: unknown) => { console.error(`  ✗ ${msg}`, e ?? ''); fail++; };

const store = new KnowledgeStore();

// 1. Add entry to research domain
try {
  const id = store.add({
    domain: 'research',
    sourceText: 'Godman Protocols provide trust and coordination primitives for multi-agent AI systems',
    sourceRef: 'docs/godman-overview.md',
    createdBy: 'coder',
    classification: 'public',
    tags: ['godman', 'protocols', 'multi-agent'],
    confidence: 0.95,
  });
  id.length === 16 ? ok('add: returns 16-char id') : err('add: wrong id length', id);
} catch (e) { err('add: threw unexpectedly', e); }

// 2. Add entry to content domain
let contentId = '';
try {
  contentId = store.add({
    domain: 'content',
    sourceText: 'TikTok viral hooks: shock, contrast, cliffhanger, identity, authority',
    sourceRef: 'workspace/scs001/progress.md',
    createdBy: 'scs001-discovery',
    classification: 'internal',
    tags: ['tiktok', 'hooks', 'viral'],
    confidence: 0.85,
  });
  ok('add: content domain entry');
} catch (e) { err('add: content domain threw', e); }

// 3. Size
store.size() === 2 ? ok('size: 2 after two adds') : err(`size: expected 2, got ${store.size()}`);

// 4. getById
try {
  const e = store.getById(contentId);
  e?.domain === 'content' ? ok('getById: returns correct entry') : err('getById: wrong entry', e);
} catch (e) { err('getById: threw', e); }

// 5. getById unknown
store.getById('nonexistent') === undefined ? ok('getById: undefined for missing') : err('getById: should be undefined');

// 6. getByDomain
const contentEntries = store.getByDomain('content');
contentEntries.length === 1 ? ok('getByDomain: 1 content entry') : err(`getByDomain: expected 1, got ${contentEntries.length}`);

// 7. getByDomain empty
store.getByDomain('trading').length === 0 ? ok('getByDomain: 0 for empty domain') : err('getByDomain: should be empty');

// 8. Search — keyword match
const results = store.search({
  queryText: 'multi-agent coordination protocols',
  domains: [],
  agent: 'coder',
  topK: 5,
  minSimilarity: 0.1,
});
results.length >= 1 ? ok(`search: ${results.length} result(s) for 'multi-agent protocols'`) : err('search: no results', results);

// 9. Search — top result is correct domain
results[0]?.vector.domain === 'research' ? ok('search: top result is research domain') : err('search: wrong top domain', results[0]?.vector.domain);

// 10. Search — similarity score in [0,1]
const sim = results[0]?.similarity ?? -1;
(sim >= 0 && sim <= 1) ? ok(`search: similarity ${sim.toFixed(2)} in valid range`) : err('search: similarity out of range', sim);

// 11. Search — domain filter
const contentOnly = store.search({
  queryText: 'viral hooks tiktok',
  domains: ['content'],
  agent: 'cmo',
  topK: 5,
  minSimilarity: 0,
});
contentOnly.every(r => r.vector.domain === 'content') ? ok('search: domain filter works') : err('search: domain filter broken');

// 12. Search — tag filter
const tagged = store.search({
  queryText: 'hooks',
  domains: [],
  agent: 'cmo',
  topK: 5,
  minSimilarity: 0,
  requiredTags: ['tiktok'],
});
tagged.length === 1 && tagged[0]?.vector.tags.includes('tiktok') ? ok('search: tag filter returns 1 result') : err('search: tag filter wrong', tagged.length);

// 13. Search — minSimilarity filter
const highSim = store.search({
  queryText: 'quantum physics blockchain',
  domains: [],
  agent: 'coder',
  topK: 5,
  minSimilarity: 0.9,
});
highSim.length === 0 ? ok('search: minSimilarity 0.9 returns 0 unrelated results') : err(`search: expected 0, got ${highSim.length}`);

// 14. Search — constitutionally approved field present
results[0]?.constitutionallyApproved !== undefined ? ok('search: constitutionallyApproved field present') : err('search: missing constitutionallyApproved');

// 15. Remove
const removed = store.remove(contentId);
removed ? ok('remove: returns true') : err('remove: returned false');
store.size() === 1 ? ok('remove: size is now 1') : err(`remove: expected size 1, got ${store.size()}`);

// --- Summary ---
console.log(`\nDKA Store smoke: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
