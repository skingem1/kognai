// Video Quality Gate v2 — Quality Metrics Collector
// Collects stage timings, output counts, quality scores from pipeline run
// Used by validate-video-quality-gate.ts for VIDEO-QUALITY block sign-off

import type { PipelineRunReport, StageResult } from '../../agents/scs001-orchestrator/index';

export interface QualityMetrics {
  run_id: string;
  mode: 'mock' | 'live';
  timestamp: string;

  // Pipeline coverage
  total_stages: number;
  stages_ok: number;
  stages_error: number;
  stages_empty: number;

  // Stage timings (ms)
  stage_timings: Record<string, number>;
  total_elapsed_ms: number;
  slowest_stage: { name: string; ms: number };

  // Output funnel
  funnel: {
    topics: number;
    clips: number;
    qualified: number;
    insights: number;
    scripts: number;
    scripts_filtered: number;
    videos: number;
    captioned: number;
    qc_passed: number;
    qc_failed: number;
    published: number;
  };

  // Quality ratios
  ratios: {
    clip_qualification_rate: number;  // qualified / clips
    qc_pass_rate: number;            // passed / (passed + failed)
    script_survival_rate: number;    // scripts / (scripts + filtered)
    funnel_efficiency: number;       // published / topics
  };

  // New modules (Sprint 248-253)
  new_modules: {
    transcription_available: boolean;
    llm_rewrite_available: boolean;
    tts_available: boolean;
    avatar_available: boolean;
    caption_overlay_available: boolean;
    blotato_available: boolean;
    platforms_count: number;
  };

  // Gate verdict
  gate_pass: boolean;
  gate_reasons: string[];
}

export function collectMetrics(report: PipelineRunReport): QualityMetrics {
  const stageTimings: Record<string, number> = {};
  for (const stage of report.stages) {
    stageTimings[stage.stage] = stage.elapsed_ms;
  }

  const slowest = report.stages.reduce(
    (max, s) => s.elapsed_ms > max.ms ? { name: s.stage, ms: s.elapsed_ms } : max,
    { name: 'none', ms: 0 },
  );

  const s = report.summary;

  const clipQualRate = s.clips_discovered > 0 ? s.clips_qualified / s.clips_discovered : 0;
  const qcPassRate = (s.qc_passed + s.qc_failed) > 0 ? s.qc_passed / (s.qc_passed + s.qc_failed) : 0;
  const scriptSurvival = (s.scripts_produced) > 0 ? (s.scripts_produced - s.scripts_filtered) / s.scripts_produced : 0;
  const funnelEfficiency = s.topics_found > 0 ? s.published / s.topics_found : 0;

  // Check new module availability
  const newModules = {
    transcription_available: moduleExists('../../scripts/scs001/transcribe-audio'),
    llm_rewrite_available: moduleExists('../../scripts/scs001/llm-script-rewriter'),
    tts_available: moduleExists('../../scripts/scs001/tts-voiceover'),
    avatar_available: moduleExists('../../scripts/scs001/avatar-presenter'),
    caption_overlay_available: moduleExists('../../scripts/scs001/caption-overlay'),
    blotato_available: moduleExists('../../scripts/scs001/blotato-client'),
    platforms_count: s.published > 0 ? 9 : 0, // Blotato publishes to 9 platforms
  };

  // Gate criteria
  const gateReasons: string[] = [];
  let gatePass = true;

  if (report.stages.length < 8) {
    gatePass = false;
    gateReasons.push('Fewer than 8 stages executed: ' + report.stages.length);
  }
  if (s.qc_passed < 1) {
    gatePass = false;
    gateReasons.push('No videos passed QC');
  }
  if (qcPassRate < 0.5) {
    gatePass = false;
    gateReasons.push('QC pass rate below 50%: ' + (qcPassRate * 100).toFixed(0) + '%');
  }
  if (report.stages.some(st => st.status === 'error')) {
    gatePass = false;
    gateReasons.push('Stage errors: ' + report.stages.filter(st => st.status === 'error').map(st => st.stage).join(', '));
  }
  if (s.published < 1) {
    gatePass = false;
    gateReasons.push('No videos published');
  }

  if (gatePass) {
    gateReasons.push('All gate criteria met');
  }

  return {
    run_id: report.run_id,
    mode: report.mode,
    timestamp: new Date().toISOString(),
    total_stages: report.stages.length,
    stages_ok: report.stages.filter(st => st.status === 'ok').length,
    stages_error: report.stages.filter(st => st.status === 'error').length,
    stages_empty: report.stages.filter(st => st.status === 'empty').length,
    stage_timings: stageTimings,
    total_elapsed_ms: report.total_elapsed_ms,
    slowest_stage: slowest,
    funnel: {
      topics: s.topics_found,
      clips: s.clips_discovered,
      qualified: s.clips_qualified,
      insights: s.insights_generated,
      scripts: s.scripts_produced,
      scripts_filtered: s.scripts_filtered,
      videos: s.videos_edited,
      captioned: s.videos_captioned,
      qc_passed: s.qc_passed,
      qc_failed: s.qc_failed,
      published: s.published,
    },
    ratios: {
      clip_qualification_rate: Math.round(clipQualRate * 100) / 100,
      qc_pass_rate: Math.round(qcPassRate * 100) / 100,
      script_survival_rate: Math.round(scriptSurvival * 100) / 100,
      funnel_efficiency: Math.round(funnelEfficiency * 100) / 100,
    },
    new_modules: newModules,
    gate_pass: gatePass,
    gate_reasons: gateReasons,
  };
}

function moduleExists(path: string): boolean {
  try {
    require.resolve(path);
    return true;
  } catch {
    return false;
  }
}

export function printMetrics(metrics: QualityMetrics): void {
  console.log('');
  console.log('📊 Video Quality Gate v2 — Metrics Report');
  console.log('Run: ' + metrics.run_id + ' (' + metrics.mode + ')');
  console.log('');

  console.log('Pipeline Coverage:');
  console.log('  Stages: ' + metrics.total_stages + ' (' + metrics.stages_ok + ' ok, ' + metrics.stages_error + ' error, ' + metrics.stages_empty + ' empty)');
  console.log('  Total time: ' + (metrics.total_elapsed_ms / 1000).toFixed(1) + 's');
  console.log('  Slowest: ' + metrics.slowest_stage.name + ' (' + metrics.slowest_stage.ms + 'ms)');
  console.log('');

  const f = metrics.funnel;
  console.log('Output Funnel:');
  console.log('  ' + f.topics + ' topics → ' + f.clips + ' clips → ' + f.qualified + ' qualified → ' + f.insights + ' insights');
  console.log('  → ' + f.scripts + ' scripts → ' + f.videos + ' videos → ' + f.captioned + ' captioned');
  console.log('  → ' + f.qc_passed + ' QC pass → ' + f.published + ' published');
  console.log('');

  const r = metrics.ratios;
  console.log('Quality Ratios:');
  console.log('  Clip qualification: ' + (r.clip_qualification_rate * 100).toFixed(0) + '%');
  console.log('  QC pass rate: ' + (r.qc_pass_rate * 100).toFixed(0) + '%');
  console.log('  Script survival: ' + (r.script_survival_rate * 100).toFixed(0) + '%');
  console.log('  Funnel efficiency: ' + (r.funnel_efficiency * 100).toFixed(0) + '%');
  console.log('');

  const m = metrics.new_modules;
  console.log('New Modules (Sprint 248-253):');
  console.log('  Transcription: ' + (m.transcription_available ? '✓' : '✗'));
  console.log('  LLM Rewrite: ' + (m.llm_rewrite_available ? '✓' : '✗'));
  console.log('  TTS Voiceover: ' + (m.tts_available ? '✓' : '✗'));
  console.log('  Avatar Presenter: ' + (m.avatar_available ? '✓' : '✗'));
  console.log('  Caption Overlay: ' + (m.caption_overlay_available ? '✓' : '✗'));
  console.log('  Blotato Publishing: ' + (m.blotato_available ? '✓' : '✗'));
  console.log('');

  console.log('Gate Verdict: ' + (metrics.gate_pass ? '✅ PASS' : '❌ FAIL'));
  for (const reason of metrics.gate_reasons) {
    console.log('  ' + (metrics.gate_pass ? '✓' : '✗') + ' ' + reason);
  }
}
