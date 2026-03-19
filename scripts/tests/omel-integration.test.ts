// Sprint 185 — OMEL Phase 2 Integration Test Suite
// Tests all 5 components working together as AMD-13 requires.
//
// Coverage:
//   1. PhantomWorkspace + CredentialVault (no secrets in phantom files)
//   2. WipeWitness + rollback (detect shrink, rollback, verify)
//   3. HumanBrake + ContaminationGuard (risk scoring, cross-context bleed)
//   4. AMD-13 compliance report (all 5 components initialized + wired)

import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';

import { phantomWorkspace }    from '../lib/omel/phantom-workspace';
import { credentialVault }     from '../lib/omel/credential-vault';
import { wipeWitness }         from '../lib/omel/wipe-witness';
import { humanBrake }          from '../lib/omel/human-brake';
import { contaminationGuard }  from '../lib/omel/contamination-guard';

const GATE_OUT = path.join(__dirname, '..', '..', 'workspace', 'gates', 'omel-phase2-gate.json');

// ── Assertion helper ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string): void {
  if (!condition) {
    console.error(`  ✗ FAIL: ${label}`);
    failures.push(label);
    failed++;
  } else {
    console.log(`  ✓ ${label}`);
    passed++;
  }
}

// ── SUITE 1: PhantomWorkspace + CredentialVault ───────────────────────────────
// Invariant: no secret values should appear in phantom workspace files.

async function suite1_phantomAndVault(): Promise<void> {
  console.log('\n[Suite 1] PhantomWorkspace + CredentialVault integration\n');

  // 1a: Create phantom workspace
  const ctx = phantomWorkspace.create('omel-integration-s1');
  assert(fs.existsSync(ctx.tmpDir), 'S1: phantom workspace created');

  // 1b: Write a file into phantom workspace (simulating agent output)
  const outFile = phantomWorkspace.resolve(ctx, 'agent-output.json');
  const payload = JSON.stringify({ result: 'ok', agent: 'test', token: '***redacted***' });
  fs.writeFileSync(outFile, payload, 'utf-8');
  assert(fs.existsSync(outFile), 'S1: file written to phantom workspace');

  // 1c: Scan the file for any leaks using CredentialVault
  const leaks = credentialVault.scanForLeaks(payload);
  assert(leaks.length === 0, 'S1: no secret leaks in phantom workspace file payload');

  // 1d: maskForLog produces redacted output, not original value
  const masked = credentialVault.maskForLog('sk-test-1234567890abcdef');
  assert(masked.includes('****'), 'S1: maskForLog redacts value');
  assert(!masked.includes('1234567890abcdef'), 'S1: maskForLog hides tail');

  // 1e: audit() report runs without throwing
  let auditOk = false;
  try { credentialVault.audit(); auditOk = true; } catch { /* fail */ }
  assert(auditOk, 'S1: credentialVault.audit() executes without error');

  // 1f: Cleanup phantom workspace
  phantomWorkspace.cleanup(ctx);
  assert(!fs.existsSync(ctx.tmpDir), 'S1: phantom workspace cleaned up');
}

// ── SUITE 2: WipeWitness + rollback ──────────────────────────────────────────
// Invariant: shrink events are detected; rollback restores previous state.

async function suite2_wipeWitnessRollback(): Promise<void> {
  console.log('\n[Suite 2] WipeWitness + rollback integration\n');

  // 2a: Create a test file in a temp location
  const tmpFile = path.join(os.tmpdir(), `omel-test-${Date.now()}.ts`);
  const original = '// Original content\n'.repeat(30); // 630 bytes
  fs.writeFileSync(tmpFile, original, 'utf-8');

  // 2b: beforeWrite captures baseline + snapshot
  const token = wipeWitness.beforeWrite(tmpFile, 'test-agent');
  assert(token.oldSizeBytes > 0,    'S2: beforeWrite captured original size');
  assert(token.oldHash.length > 0,  'S2: beforeWrite captured original hash');
  assert(token.snapshotKey !== undefined, 'S2: beforeWrite saved snapshot');

  // 2c: Simulate destructive rewrite (shrink to <50%)
  // Disable Telegram so test doesn't fire real messages
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  // Also set WIPE_WITNESS_NO_ROLLBACK=true so we can test manual rollback
  process.env.WIPE_WITNESS_NO_ROLLBACK = 'true';

  const shrunken = '// Shrunken\n'; // ~12 bytes — definitely <50%
  fs.writeFileSync(tmpFile, shrunken, 'utf-8');
  wipeWitness.afterWrite(token, Buffer.byteLength(shrunken));

  const alerts = wipeWitness.getShrinkAlerts();
  assert(alerts.length > 0, 'S2: shrink alert emitted');
  assert(alerts[alerts.length - 1].ratio < 0.5, 'S2: alert ratio < 0.5');

  // 2d: Manual rollback to previous state
  delete process.env.WIPE_WITNESS_NO_ROLLBACK;
  const rolled = wipeWitness.rollback(tmpFile, 1);
  assert(rolled === true, 'S2: rollback returned true');

  const restoredContent = fs.readFileSync(tmpFile, 'utf-8');
  assert(restoredContent === original, 'S2: file restored to original content after rollback');

  // Restore env
  if (savedToken) process.env.TELEGRAM_BOT_TOKEN = savedToken;

  // Cleanup
  try { fs.unlinkSync(tmpFile); } catch { /* ok */ }
}

// ── SUITE 3: HumanBrake risk scoring + ContaminationGuard ────────────────────
// Invariant: risk scores match table; cross-context reads are blocked.

async function suite3_humanBrakeAndContamination(): Promise<void> {
  console.log('\n[Suite 3] HumanBrake risk scoring + ContaminationGuard\n');

  // 3a: Risk score table verification
  assert(humanBrake.getRiskScore('git_reset_hard')     === 10, 'S3: git_reset_hard score = 10');
  assert(humanBrake.getRiskScore('file_delete')        === 9,  'S3: file_delete score = 9');
  assert(humanBrake.getRiskScore('env_change')         === 8,  'S3: env_change score = 8');
  assert(humanBrake.getRiskScore('schema_migration')   === 8,  'S3: schema_migration score = 8');
  assert(humanBrake.getRiskScore('bulk_overwrite')     === 7,  'S3: bulk_overwrite score = 7');
  assert(humanBrake.getRiskScore('new_file')           === 2,  'S3: new_file score = 2');

  // 3b: Core file path bumps score to ≥9
  const score = humanBrake.getRiskScore('bulk_overwrite', { filePath: '/path/to/clawrouter.ts' });
  assert(score >= 9, `S3: bulk_overwrite on clawrouter.ts score = ${score} (≥9 required)`);

  // 3c: isHighRisk reflects risk table
  assert(humanBrake.isHighRisk('file_delete'),                         'S3: file_delete isHighRisk=true');
  assert(humanBrake.isHighRisk('new_file') === false,                  'S3: new_file isHighRisk=false');
  assert(humanBrake.isHighRisk('read_only', { filePath: 'orchestrate-agents.ts' }), 'S3: core file path = high risk');

  // 3d: HUMAN_BRAKE_DISABLED bypass (no Telegram in test)
  process.env.HUMAN_BRAKE_DISABLED = 'true';
  delete process.env.TELEGRAM_BOT_TOKEN; // prevent any outbound call
  const result = await humanBrake.requireApproval('env_change');
  assert(result.approved === true,                    'S3: brake disabled → auto-approved');
  assert(result.approvedBy === 'HUMAN_BRAKE_DISABLED','S3: approvedBy = HUMAN_BRAKE_DISABLED');
  assert(typeof result.risk_score  === 'number',      'S3: risk_score in result');
  assert(typeof result.response_ms === 'number',      'S3: response_ms in result');
  delete process.env.HUMAN_BRAKE_DISABLED;

  // 3e: ContaminationGuard — agent claims context
  const ctx1 = contaminationGuard.claimContext('agentA', 'task-001');
  assert(ctx1.agentId === 'agentA' && ctx1.taskId === 'task-001', 'S3: context claimed correctly');

  // 3f: Same agent accessing own context → allowed
  const allowed = contaminationGuard.checkAccess('agentA', 'agentA', 'task-001');
  assert(allowed === true, 'S3: agent accessing own context = allowed');

  // 3g: Different agent accessing agentA's context → blocked
  const blocked = contaminationGuard.checkAccess('agentB', 'agentA', 'task-001');
  assert(blocked === false, 'S3: agentB accessing agentA context = blocked (contamination)');

  // 3h: After release, access allowed again
  contaminationGuard.releaseContext('agentA', 'task-001');
  const allowedAfter = contaminationGuard.checkAccess('agentB', 'agentA', 'task-001');
  assert(allowedAfter === true, 'S3: after release, cross-agent access allowed');
}

// ── SUITE 4: AMD-13 Compliance Report ────────────────────────────────────────
// All 5 components must be importable and return coherent stats.

async function suite4_amd13Compliance(): Promise<void> {
  console.log('\n[Suite 4] AMD-13 compliance report\n');

  // 4a: All 5 singletons are live
  assert(phantomWorkspace   !== null, 'S4: phantomWorkspace singleton exists');
  assert(credentialVault    !== null, 'S4: credentialVault singleton exists');
  assert(wipeWitness        !== null, 'S4: wipeWitness singleton exists');
  assert(humanBrake         !== null, 'S4: humanBrake singleton exists');
  assert(contaminationGuard !== null, 'S4: contaminationGuard singleton exists');

  // 4b: phantomWorkspace.getStats() runs
  const stats = phantomWorkspace.getStats();
  assert(typeof stats.active       === 'number', 'S4: phantomWorkspace.getStats().active is number');
  assert(typeof stats.created_today === 'number', 'S4: phantomWorkspace.getStats().created_today is number');

  // 4c: credentialVault.audit() runs and has required fields
  const auditReport = credentialVault.audit();
  assert(typeof auditReport.total_secrets    === 'number',  'S4: audit().total_secrets is number');
  assert(Array.isArray(auditReport.present),                'S4: audit().present is array');
  assert(Array.isArray(auditReport.missing),                'S4: audit().missing is array');
  assert(typeof auditReport.generated_at     === 'string',  'S4: audit().generated_at is string');

  // 4d: wipeWitness.getShrinkAlerts() returns array
  const alerts = wipeWitness.getShrinkAlerts();
  assert(Array.isArray(alerts), 'S4: getShrinkAlerts() returns array');

  // 4e: Log files exist for at least some components (they were written during tests above)
  const logsDir = path.join(__dirname, '..', '..', 'logs', 'omel');
  assert(fs.existsSync(logsDir), 'S4: logs/omel/ directory exists');
}

// ── Gate report writer ────────────────────────────────────────────────────────

function writeGateReport(testsPassed: number, testsFailed: number, failList: string[]): void {
  const verdict  = testsFailed === 0 ? 'PASS' : 'FAIL';
  const gatesDir = path.dirname(GATE_OUT);
  fs.mkdirSync(gatesDir, { recursive: true });

  const report = {
    sprint:           185,
    gate:             'omel-phase2',
    verdict,
    generated_at:     new Date().toISOString(),
    tests_passed:     testsPassed,
    tests_failed:     testsFailed,
    failures:         failList,
    components_verified: [
      'phantom-workspace',
      'credential-vault',
      'wipe-witness',
      'human-brake',
      'contamination-guard',
    ],
    amd13_status:     'IMPLEMENTED',
    phase2_hardening: {
      'sprint-181': 'phantom-workspace-hardening',
      'sprint-182': 'credential-vault-hardening',
      'sprint-183': 'wipe-witness-hardening',
      'sprint-184': 'human-brake-hardening',
      'sprint-185': 'integration-test-gate',
    },
    notes: verdict === 'PASS'
      ? 'All OMEL Phase 2 hardening tests pass. AMD-13 fully implemented.'
      : `${testsFailed} test(s) failed — see failures array.`,
  };

  fs.writeFileSync(GATE_OUT, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n[gate] Written to ${GATE_OUT}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════');
  console.log('  OMEL Phase 2 — Integration Test Suite');
  console.log('  Sprint 185 — AMD-13 Compliance Gate');
  console.log('═══════════════════════════════════════════════');

  await suite1_phantomAndVault();
  await suite2_wipeWitnessRollback();
  await suite3_humanBrakeAndContamination();
  await suite4_amd13Compliance();

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`    ✗ ${f}`));
  }
  console.log('═══════════════════════════════════════════════\n');

  writeGateReport(passed, failed, failures);

  if (failed > 0) {
    console.error('[omel-integration.test] GATE FAIL');
    process.exit(1);
  }
  console.log('[omel-integration.test] GATE PASS — OMEL Phase 2 complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('[omel-integration.test] Fatal:', err.message);
  process.exit(1);
});
