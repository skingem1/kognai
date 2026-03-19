import { SCS001Orchestrator, PipelineRunReport } from '../agents/scs001-orchestrator/index';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('Running SCS-001 pipeline in mock mode...');
  const orch = new SCS001Orchestrator('mock');
  const report: PipelineRunReport = await orch.run();

  const errorStages = report.stages.filter(s => s.status === 'error');
  const stageCount = report.stages.length;
  const s = report.summary;

  const criticalCounters = [
    s.topics_found,
    s.clips_discovered,
    s.insights_generated,
    s.scripts_produced,
    s.videos_edited,
    s.videos_captioned,
    s.qc_passed + s.qc_failed,
  ];
  const zeroCounters = criticalCounters.filter(c => c === 0);

  // Sprint 192: Check viral score fields in clip scores
  const clipStage = report.stages.find(st => st.stage === '3-clip-detection');
  const clipScores = (clipStage as any)?.result ?? [];
  const viralScoredCount = Array.isArray(clipScores)
    ? clipScores.filter((c: any) => c.partial_viral_score != null || c.hook_quality_score != null).length
    : 0;
  const viralWarning = viralScoredCount === 0 && s.clips_discovered > 0;

  const passed = errorStages.length === 0 && stageCount >= 8 && zeroCounters.length === 0;

  const reportsDir = join(process.cwd(), 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  writeFileSync(
    join(reportsDir, 'smoke-test-latest.json'),
    JSON.stringify({
      passed,
      timestamp: new Date().toISOString(),
      stage_count: stageCount,
      error_count: errorStages.length,
      zero_counters: zeroCounters.length,
      viral_scored_count: viralScoredCount,
      viral_warning: viralWarning,
      summary: report.summary,
      errors: errorStages.map(e => e.stage + ': ' + (e.error ?? 'unknown')),
    }, null, 2)
  );

  console.log('');
  console.log(passed ? 'SMOKE TEST PASS' : 'SMOKE TEST FAIL');
  if (errorStages.length > 0) errorStages.forEach(e => console.log('  ERROR: ' + e.stage + ' — ' + (e.error ?? '')));
  if (zeroCounters.length > 0) console.log('  WARNING: ' + zeroCounters.length + ' critical counters are zero');
  if (viralWarning) console.log('  WARNING: 0 clips have viral scores (check viralScorer + hookQualityScore wiring)');
  else if (viralScoredCount > 0) console.log('  Viral: ' + viralScoredCount + ' clips scored');
  console.log('  Stages: ' + stageCount + ' | Errors: ' + errorStages.length + ' | Report: reports/smoke-test-latest.json');

  process.exit(passed ? 0 : 1);
}

main().catch(e => {
  console.error('SMOKE TEST ERROR:', e.message);
  process.exit(1);
});
