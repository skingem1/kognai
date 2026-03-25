/**
 * audit-gate-count.ts — Sprint 1008
 * Reconciles all posting data sources to produce a single gate count.
 * Sources: manual-posts.jsonl, publish-ledger.jsonl, gate report
 * Output: reports/gate-audit.json
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../');
const OUT = path.join(ROOT, 'reports', 'gate-audit.json');

function readJsonLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function main() {
  const manualPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const gatePath  = path.join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json');

  // --- manual-posts.jsonl ---
  const manualEntries = readJsonLines(manualPath);
  const dryMethods = ['browser-post-dry', 'batch-browser-dry', 'dry', 'dry-run'];
  const realPosts = manualEntries.filter(e => {
    if (!e.video_id) return false;
    if (e.method && dryMethods.some(d => String(e.method).includes(d))) return false;
    return true;
  });
  const dryPosts = manualEntries.filter(e => {
    if (!e.video_id) return false;
    return e.method && dryMethods.some(d => String(e.method).includes(d));
  });

  // --- publish-ledger.jsonl ---
  const ledgerEntries = readJsonLines(ledgerPath);
  const ledgerPosted = ledgerEntries.filter(e => e.tiktok_post_id || e.posted_at);

  // --- gate report ---
  let gateCount: number | null = null;
  let gateFile: any = null;
  if (fs.existsSync(gatePath)) {
    try {
      gateFile = JSON.parse(fs.readFileSync(gatePath, 'utf-8'));
      gateCount = gateFile?.raw?.posts_count ?? null;
    } catch {}
  }

  // --- Reconcile ---
  const recommendedCount = realPosts.length;
  const discrepancy = gateCount !== null ? (gateCount - recommendedCount) : 0;

  const result = {
    audited_at: new Date().toISOString(),
    sources: {
      manual_posts: {
        total: manualEntries.length,
        real: realPosts.length,
        dry_runs: dryPosts.length,
        real_ids: realPosts.map(e => e.video_id),
        dry_ids: dryPosts.map(e => e.video_id),
      },
      publish_ledger: {
        total: ledgerEntries.length,
        with_post_id: ledgerPosted.length,
      },
      gate_report: {
        file: 'workspace/gates/phase1-5-gate.json',
        gate_count: gateCount,
        date: gateFile?.date ?? null,
        urgency: gateFile?.urgency ?? null,
      },
    },
    reconciled_count: recommendedCount,
    discrepancy,
    discrepancy_note: discrepancy !== 0
      ? `Gate file shows ${gateCount} posts but manual-posts.jsonl has ${recommendedCount} real (non-dry) posts.`
      : 'Sources agree.',
    recommended_count: recommendedCount,
    gate_target: 30,
    gate_remaining: Math.max(0, 30 - recommendedCount),
    readiness: (() => {
      const deadline = new Date('2026-04-07T23:59:59Z');
      const now = new Date();
      const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86400000));
      const remaining = Math.max(0, 30 - recommendedCount);
      const postsPerDay = daysLeft > 0 ? +(remaining / daysLeft).toFixed(2) : remaining > 0 ? Infinity : 0;
      const pace = remaining === 0 ? 'DONE' : postsPerDay <= 1.5 ? 'on-track' : postsPerDay <= 3 ? 'at-risk' : 'critical';
      return { deadline: '2026-04-07', days_left: daysLeft, posts_remaining: remaining, posts_per_day_needed: postsPerDay, pace };
    })(),
  };

  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));

  // Print summary
  console.log('\n=== Gate Count Audit ===');
  console.log(`manual-posts.jsonl : ${manualEntries.length} entries`);
  console.log(`  ✅ Real posts    : ${realPosts.length}`);
  console.log(`  🔧 Dry runs      : ${dryPosts.length}`);
  console.log(`publish-ledger.jsonl: ${ledgerEntries.length} entries (${ledgerPosted.length} with post ID)`);
  console.log(`Gate file count    : ${gateCount ?? 'N/A'}`);
  console.log(`Reconciled count   : ${recommendedCount}/30`);
  if (result.discrepancy_note !== 'Sources agree.') {
    console.log(`⚠️  ${result.discrepancy_note}`);
  }
  const r = result.readiness;
  console.log(`\n--- Phase 1.5 Readiness ---`);
  console.log(`Deadline          : ${r.deadline} (${r.days_left} days left)`);
  console.log(`Posts remaining   : ${r.posts_remaining}`);
  console.log(`Posts/day needed  : ${r.posts_per_day_needed}`);
  console.log(`Pace              : ${r.pace.toUpperCase()}`);
  console.log(`\nReport written to: ${OUT}`);
}

main();
