// SCS-001 — Orchestrator (Block F — Autonomous Pipeline)
// Wires all 11 agents into a single automated pipeline run.
// Mode: 'mock' (no API calls) or 'live' (ORACLE-6 + Claude API)
// Output: PipelineRunReport with counts, timings, status per stage

import { TrendAgent, TrendingTopicBatch } from '../scs001-trend/index';
import { DiscoveryAgent, DiscoveryOutput } from '../scs001-discovery/index';
import { ClipDetectionAgent, ClipQualityScore } from '../scs001-clip-detection/index';
import { InsightAgent, InsightBrief, getMockInsightBriefs } from '../scs001-insight/index';
import { ScriptAgent, ScriptBundle } from '../scs001-script/index';
import { EditingAgent, EditedVideo } from '../scs001-editing/index';
import { CaptionAgent, CaptionedVideo } from '../scs001-caption/index';
import { QCAgent, QualityControlGate } from '../scs001-qc/index';
import { PublishingAgent, PublishedVideo } from '../scs001-publishing/index';
import { AnalyticsAgent, PerformanceSignal } from '../scs001-analytics/index';
import { ContentFlywheelAgent, FlywheelOutput } from '../scs001-flywheel/index';
import { FailureLibraryAgent, FailureEntry } from '../scs001-failure-library/index';
import { withRetry, withFallback } from './retry';

export interface StageResult {
  stage:    string;
  agent:    string;
  count:    number;
  elapsed_ms: number;
  status:   'ok' | 'partial' | 'empty' | 'error';
  error?:   string;
}

export interface PipelineRunReport {
  run_id:       string;
  mode:         'mock' | 'live';
  started_at:   string;
  completed_at: string;
  total_elapsed_ms: number;
  stages:       StageResult[];
  summary: {
    topics_found:     number;
    clips_discovered: number;
    clips_qualified:  number;
    insights_generated: number;
    scripts_produced: number;
    videos_edited:    number;
    videos_captioned: number;
    qc_passed:        number;
    qc_failed:        number;
    published:        number;
    viral:            number;
    performing:         number;
    failure_library:    number;
    flywheel_derivatives: number;
    failure_entries:    number;
  };
}

export class SCS001Orchestrator {
  private mode: 'mock' | 'live';
  private workDir: string;

  constructor(mode: 'mock' | 'live' = 'mock', workDir?: string) {
    this.mode = mode;
    this.workDir = workDir ?? 'workspace/scs001/run-' + Date.now();
  }

  async run(): Promise<PipelineRunReport> {
    const startedAt = new Date();
    const stages: StageResult[] = [];
    let trendBatch: TrendingTopicBatch | null = null;
    let discoveries: DiscoveryOutput[] = [];
    let clips: ClipQualityScore[] = [];
    let briefs: InsightBrief[] = [];
    let bundles: ScriptBundle[] = [];
    let editedVideos: EditedVideo[] = [];
    let captionedVideos: CaptionedVideo[] = [];
    let gates: QualityControlGate[] = [];
    let published: PublishedVideo[] = [];
    let signals: PerformanceSignal[] = [];
    let flywheelOutputs: FlywheelOutput[] = [];
    let failureEntries: FailureEntry[] = [];

    console.log('[Orchestrator] Starting SCS-001 pipeline (' + this.mode + ' mode)');
    console.log('');

    // --- Stage 1: Trend Agent ---
    stages.push(await this.runStage('1-trend', 'TrendAgent', async () => {
      const agent = new TrendAgent();
      trendBatch = agent.run();
      return trendBatch.topics.length;
    }));

    // --- Stage 2: Discovery Agent ---
    if (trendBatch && trendBatch.topics.length > 0) {
      stages.push(await this.runStage('2-discovery', 'DiscoveryAgent', async () => {
        const agent = new DiscoveryAgent();
        discoveries = agent.run(trendBatch!);
        return discoveries.length;
      }));
    }

    // --- Stage 3: Clip Detection Agent (Ollama-dependent, retryable) ---
    if (discoveries.length > 0) {
      stages.push(await this.runStage('3-clip-detection', 'ClipDetectionAgent', async () => {
        const agent = new ClipDetectionAgent();
        clips = await withRetry(
          () => agent.run(discoveries),
          'ClipDetection',
          { maxRetries: 2, baseDelayMs: 2000 },
        );
        return clips.length;
      }));
    }

    // --- Stage 4: Insight Agent ---
    const qualifiedClips = clips.filter(c => c.qualified);
    if (qualifiedClips.length > 0 && this.mode === 'live') {
      stages.push(await this.runStage('4-insight', 'InsightAgent (live)', async () => {
        const agent = new InsightAgent();
        briefs = await withRetry(
          () => agent.run(clips),
          'InsightAgent-live',
          { maxRetries: 2, baseDelayMs: 3000 },
        );
        return briefs.length;
      }));
    } else if (qualifiedClips.length > 0) {
      // Mock mode: generate InsightBriefs from real qualified clips without API calls
      stages.push(await this.runStage('4-insight', 'InsightAgent (mock-from-clips)', async () => {
        briefs = this.generateMockBriefs(qualifiedClips);
        return briefs.length;
      }));
    } else if (this.mode === 'mock') {
      // Fallback: if no clips qualified (e.g. Ollama down), use static mock briefs
      stages.push(await this.runStage('4-insight', 'InsightAgent (static-fallback)', async () => {
        briefs = getMockInsightBriefs();
        return briefs.length;
      }));
    }

    // --- Stage 5: Script Agent ---
    if (briefs.length > 0) {
      stages.push(await this.runStage('5-script', 'ScriptAgent', async () => {
        const agent = new ScriptAgent();
        bundles = agent.run(briefs);
        return bundles.length;
      }));
    }

    // --- Stage 6: Editing Agent ---
    if (bundles.length > 0) {
      stages.push(await this.runStage('6-editing', 'EditingAgent', async () => {
        const agent = new EditingAgent(this.workDir + '/editing');
        editedVideos = agent.run(bundles);
        return editedVideos.length;
      }));
    }

    // --- Stage 7: Caption Agent ---
    if (editedVideos.length > 0) {
      stages.push(await this.runStage('7-caption', 'CaptionAgent', async () => {
        const agent = new CaptionAgent(this.workDir + '/caption');
        captionedVideos = agent.run(editedVideos, bundles);
        return captionedVideos.length;
      }));
    }

    // --- Stage 8: QC Agent ---
    if (captionedVideos.length > 0) {
      stages.push(await this.runStage('8-qc', 'QCAgent', async () => {
        const agent = new QCAgent();
        gates = agent.run(captionedVideos, bundles, editedVideos);
        return gates.length;
      }));
    }

    // --- Stage 9: Publishing Agent (TikTok API-dependent, retryable) ---
    const passedGates = gates.filter(g => g.overall_pass);
    if (passedGates.length > 0) {
      stages.push(await this.runStage('9-publishing', 'PublishingAgent', async () => {
        const agent = new PublishingAgent();
        published = await withRetry(
          () => agent.run(gates, captionedVideos, bundles),
          'PublishingAgent',
          { maxRetries: 2, baseDelayMs: 2000 },
        );
        return published.length;
      }));
    }

    // --- Stage 10: Analytics Agent ---
    if (published.length > 0) {
      stages.push(await this.runStage('10-analytics', 'AnalyticsAgent', async () => {
        const agent = new AnalyticsAgent();
        signals = agent.run(published);
        return signals.length;
      }));
    }

    // --- Stage 11: Content Flywheel (viral signals only) ---
    const viralSignals = signals.filter(s => s.flywheel_triggered);
    if (viralSignals.length > 0) {
      stages.push(await this.runStage('11-flywheel', 'ContentFlywheelAgent', async () => {
        const agent = new ContentFlywheelAgent();
        flywheelOutputs = agent.run(signals);
        return flywheelOutputs.length * 4; // 4 derivatives per output
      }));
    }

    // --- Stage 12: Failure Library (failure signals only) ---
    const failureSignals = signals.filter(s => s.failure_library_entry);
    if (failureSignals.length > 0) {
      stages.push(await this.runStage('12-failure-library', 'FailureLibraryAgent', async () => {
        const agent = new FailureLibraryAgent();
        failureEntries = agent.run(signals);
        return failureEntries.length;
      }));
    }

    const completedAt = new Date();
    const totalMs = completedAt.getTime() - startedAt.getTime();

    const report: PipelineRunReport = {
      run_id:       'scs001-' + startedAt.toISOString().replace(/[:.]/g, '-'),
      mode:         this.mode,
      started_at:   startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      total_elapsed_ms: totalMs,
      stages,
      summary: {
        topics_found:       trendBatch?.topics.length ?? 0,
        clips_discovered:   discoveries.length,
        clips_qualified:    qualifiedClips.length,
        insights_generated: briefs.length,
        scripts_produced:   bundles.length,
        videos_edited:      editedVideos.length,
        videos_captioned:   captionedVideos.length,
        qc_passed:          passedGates.length,
        qc_failed:          gates.length - passedGates.length,
        published:          published.length,
        viral:              signals.filter(s => s.viral_status === 'viral').length,
        performing:         signals.filter(s => s.viral_status === 'performing').length,
        failure_library:      signals.filter(s => s.failure_library_entry).length,
        flywheel_derivatives: flywheelOutputs.length * 4,
        failure_entries:      failureEntries.length,
      },
    };

    // Print summary
    console.log('');
    console.log('[Orchestrator] Pipeline complete in ' + (totalMs / 1000).toFixed(1) + 's');
    console.log('[Orchestrator] ' + stages.length + ' stages executed');
    const s = report.summary;
    console.log('[Orchestrator] Summary: ' +
      s.topics_found + ' topics → ' +
      s.clips_discovered + ' clips → ' +
      s.clips_qualified + ' qualified → ' +
      s.insights_generated + ' insights → ' +
      s.scripts_produced + ' scripts → ' +
      s.videos_edited + ' videos → ' +
      s.qc_passed + ' passed QC → ' +
      s.published + ' published → ' +
      s.viral + ' viral');

    return report;
  }

  private generateMockBriefs(qualifiedClips: ClipQualityScore[]): InsightBrief[] {
    const HOOK_FORMULAS: Array<InsightBrief['hook']['formula']> = ['curiosity_gap', 'contrarian', 'authority', 'secret'];
    return qualifiedClips.map((clip, idx) => {
      const formula = HOOK_FORMULAS[idx % HOOK_FORMULAS.length];
      const topic = clip.topic_tags[0] ?? 'emerging technology';
      return {
        insight_id:           'insight-auto-' + clip.clip_id,
        clip_id:              clip.clip_id,
        hook:                 { text: 'What ' + clip.speaker + ' just revealed about ' + topic + ' changes everything', formula },
        pre_clip_commentary:  clip.speaker + ' made a statement that challenges the conventional wisdom on ' + topic + '.',
        post_clip_commentary: 'This confirms a trend that insiders have been tracking for months — ' + topic + ' is accelerating faster than projected.',
        insight_statement:    'The implications of ' + topic + ' will reshape how we approach this entire field within 12 months.',
        why_does_this_matter: 'If ' + topic + ' continues at this pace, companies without a strategy face 6-12 month competitive gaps. ' + clip.speaker + ' is signaling a structural shift that affects budgets, hiring, and product roadmaps across the industry.',
        hook_formula_used:    formula,
        speaker_name:         clip.speaker,
        cloud_cost_usd:       0,
      };
    });
  }

  private async runStage(
    stage: string,
    agent: string,
    fn: () => Promise<number>,
  ): Promise<StageResult> {
    const start = Date.now();
    try {
      const count = await fn();
      const elapsed = Date.now() - start;
      const status = count > 0 ? 'ok' : 'empty';
      console.log('[Orchestrator] ' + stage + ' (' + agent + '): ' + count + ' items (' + elapsed + 'ms) [' + status + ']');
      return { stage, agent, count, elapsed_ms: elapsed, status };
    } catch (err) {
      const elapsed = Date.now() - start;
      const msg = (err as Error).message;
      console.error('[Orchestrator] ' + stage + ' (' + agent + '): ERROR — ' + msg);
      return { stage, agent, count: 0, elapsed_ms: elapsed, status: 'error', error: msg };
    }
  }
}
