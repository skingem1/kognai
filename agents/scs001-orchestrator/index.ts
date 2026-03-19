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
import { scoreAndFilter, ScriptScore } from '../scs001-scorer/index';
import { ScriptValidator } from '../scs001-script-validator/index';
import { ExperimentTracker, ExperimentEntry } from '../scs001-experiment/index';
import { withRetry, withFallback } from './retry';
import { DedupLedger, LedgerEntry } from './dedup-ledger';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join, basename } from 'path';

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
    scripts_scored:             number;
    scripts_filtered:           number;
    scripts_validation_skipped: number;
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
    clips_deduplicated: number;
    // Sprint 248-253 module metrics
    platforms_targeted:   number;  // Blotato: 9 platforms per video
    publish_method:       'blotato' | 'tiktok-direct' | 'none';
  };
}

export class SCS001Orchestrator {
  private mode: 'mock' | 'live';
  private workDir: string;
  private ledger: DedupLedger;
  private validator: ScriptValidator;
  private experiments: ExperimentTracker;

  constructor(mode: 'mock' | 'live' = 'mock', workDir?: string) {
    this.mode = mode;
    this.workDir = workDir ?? 'workspace/scs001/run-' + Date.now();
    this.ledger = new DedupLedger();
    this.validator = new ScriptValidator();
    this.experiments = new ExperimentTracker();
  }

  async run(): Promise<PipelineRunReport> {
    const startedAt = new Date();
    const runId = 'scs001-' + startedAt.toISOString().replace(/[:.]/g, '-');
    const stages: StageResult[] = [];
    let trendBatch: TrendingTopicBatch | null = null;
    let discoveries: DiscoveryOutput[] = [];
    let clips: ClipQualityScore[] = [];
    let briefs: InsightBrief[] = [];
    let bundles: ScriptBundle[] = [];
    let scorerFiltered: ScriptScore[] = [];
    let editedVideos: EditedVideo[] = [];
    let captionedVideos: CaptionedVideo[] = [];
    let gates: QualityControlGate[] = [];
    let published: PublishedVideo[] = [];
    let signals: PerformanceSignal[] = [];
    let flywheelOutputs: FlywheelOutput[] = [];
    let failureEntries: FailureEntry[] = [];

    console.log('[Orchestrator] Starting SCS-001 pipeline (' + this.mode + ' mode)');
    console.log('');

    // Load viral topics from previous run for TrendAgent boost
    const VIRAL_TOPICS_PATH = resolve('workspace/scs001/viral-topics.json');
    let priorityTopics: string[] = [];
    if (existsSync(VIRAL_TOPICS_PATH)) {
      try {
        const vt = JSON.parse(readFileSync(VIRAL_TOPICS_PATH, 'utf8'));
        priorityTopics = Array.isArray(vt.topics) ? vt.topics : [];
        if (priorityTopics.length > 0) {
          console.log('[Orchestrator] Loaded ' + priorityTopics.length + ' viral priority topics from previous run');
        }
      } catch { /* non-fatal */ }
    }

    // --- Stage 1: Trend Agent ---
    stages.push(await this.runStage('1-trend', 'TrendAgent', async () => {
      const agent = new TrendAgent(undefined, this.mode);
      trendBatch = await agent.run(1, priorityTopics);
      return trendBatch.topics.length;
    }));

    // --- Stage 2: Discovery Agent ---
    if (trendBatch && trendBatch.topics.length > 0) {
      stages.push(await this.runStage('2-discovery', 'DiscoveryAgent', async () => {
        const agent = new DiscoveryAgent();
        discoveries = await agent.run(trendBatch!);
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

    // --- Stage 3.5: Deduplication ---
    const qualifiedClipsRaw = clips.filter(c => c.qualified);
    const qualifiedClips = this.ledger.filterNewClips(qualifiedClipsRaw);
    const clipsDeduplicated = qualifiedClipsRaw.length - qualifiedClips.length;

    // --- Stage 4: Insight Agent ---
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

    const transcriptStore = this.loadTranscripts();
    const llmRewriteEnabled = this.shouldUseLLMRewrite(transcriptStore.size);

    // --- Stage 5: Script Agent ---
    if (briefs.length > 0) {
      stages.push(await this.runStage('5-script', 'ScriptAgent', async () => {
        const agent = new ScriptAgent();
        if (llmRewriteEnabled) {
          console.log('[Orchestrator] LLM rewrite enabled (' + transcriptStore.size + ' transcripts)');
          bundles = await agent.runAsync(briefs, transcriptStore);
        } else {
          bundles = agent.run(briefs);
        }
        return bundles.length;
      }));
    }

    // --- Stage 5.5: Content Quality Scorer ---
    if (bundles.length > 0) {
      const totalBeforeScore = bundles.length;
      stages.push(await this.runStage('5.5-score', 'ScriptScorer', async () => {
        const result = scoreAndFilter(bundles);
        scorerFiltered = result.filtered;
        bundles = result.passed;
        for (const f of result.filtered) {
          console.log('[ScriptScorer] Filtered ' + f.script_id + ' (score ' + f.score + '/100): ' + f.hints.join('; '));
        }
        return bundles.length;
      }));
    }

    // --- Stage 6-validate: Script Validator ---
    let validationSkipped = 0;
    if (bundles.length > 0) {
      stages.push(await this.runStage('6-validate', 'ScriptValidator', async () => {
        const { valid, invalid } = this.validator.validateAll(bundles);
        validationSkipped = invalid.length;
        bundles = valid;
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

    // --- Stage 9-experiment: Log QC results to experiment tracker ---
    if (gates.length > 0) {
      stages.push(await this.runStage('9-experiment', 'ExperimentTracker', async () => {
        // Build lookup: video_id (editing stage) → insight_id → bundle
        const editedByVideoId = new Map(editedVideos.map(ev => [ev.video_id, ev]));
        const bundleByInsightId = new Map(bundles.map(b => [b.insight_id, b]));
        let logged = 0;
        for (const gate of gates) {
          const edited = editedByVideoId.get(gate.video_id);
          const bundle = edited ? bundleByInsightId.get(edited.insight_id) : undefined;
          // Cross-reference viral scores from ClipDetectionAgent via clip_id
          const clipId = edited?.clip_id;
          const clip = clipId ? clips.find(c => c.clip_id === clipId) : undefined;
          const entry: ExperimentEntry = {
            clip_id:               gate.video_id,
            hook_formula:          bundle?.hook_formula_used ?? 'unknown',
            speaker:               bundle?.speaker_name ?? 'unknown',
            qc_passed:             gate.overall_pass,
            run_id:                runId,
            timestamp:             new Date().toISOString(),
            scene_density_score:   clip?.scene_density_score,
            audio_excitement:      clip?.audio_excitement,
            clip_topic_alignment:  clip?.clip_topic_alignment,
            partial_viral_score:   clip?.partial_viral_score,
          };
          this.experiments.logExperiment(entry);
          logged++;
        }
        return logged;
      }));
    }

    // --- Stage 9: Publishing Agent (TikTok API-dependent, retryable) ---
    const passedGates = gates.filter(g => g.overall_pass);
    if (passedGates.length > 0) {
      stages.push(await this.runStage('9-publishing', 'PublishingAgent', async () => {
        const agent = new PublishingAgent(this.mode);
        published = await withRetry(
          () => agent.run(gates, captionedVideos, bundles),
          'PublishingAgent',
          { maxRetries: 2, baseDelayMs: 2000 },
        );
        // Record published clips to dedup ledger (with metadata for analysis)
        const editedByVideoId2 = new Map(editedVideos.map(ev => [ev.video_id, ev]));
        const bundleByInsightId2 = new Map(bundles.map(b => [b.insight_id, b]));
        const ledgerEntries: LedgerEntry[] = published.map(p => {
          const edited = editedByVideoId2.get(p.video_id);
          const bundle = edited ? bundleByInsightId2.get(edited.insight_id) : undefined;
          return {
            clip_id:      p.video_id,
            video_id:     p.video_id,
            published_at: p.posted_at,
            run_id:       runId,
            hook_formula: bundle?.hook_formula_used,
            speaker:      bundle?.speaker_name,
            topic:        bundle?.why_does_this_matter?.slice(0, 60),
          };
        });
        this.ledger.recordPublished(ledgerEntries);
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

    // --- Write viral topics for next run's TrendAgent boost ---
    const viralSignals = signals.filter(s => s.viral_status === 'viral');
    if (viralSignals.length > 0) {
      try {
        const viralTopics = [...new Set(
          viralSignals.flatMap(s => s.topic_performance?.topic_tags?.length
            ? s.topic_performance.topic_tags
            : [s.video_id])
        )].slice(0, 10);
        writeFileSync(VIRAL_TOPICS_PATH, JSON.stringify({
          topics: viralTopics,
          updated_at: new Date().toISOString(),
          run_id: runId,
        }, null, 2));
        console.log('[Orchestrator] Saved ' + viralTopics.length + ' viral topics → viral-topics.json');
      } catch { /* non-fatal */ }
    }

    // --- Stage 11: Content Flywheel (flywheel-triggered signals only) ---
    const flywheelSignals = signals.filter(s => s.flywheel_triggered);
    if (flywheelSignals.length > 0) {
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
      run_id:       runId,
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
        scripts_produced:   bundles.length + scorerFiltered.length,
        scripts_scored:             bundles.length + scorerFiltered.length + validationSkipped,
        scripts_filtered:           scorerFiltered.length,
        scripts_validation_skipped: validationSkipped,
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
        clips_deduplicated:   clipsDeduplicated,
        platforms_targeted:   published.length > 0 ? 9 : 0,
        publish_method:       published.length > 0 ? (published[0] as any).publish_method ?? 'tiktok-direct' : 'none',
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

  private loadTranscripts(): Map<string, string> {
    const transcriptsDir = resolve('workspace/scs001/transcripts');
    const transcripts = new Map<string, string>();
    if (!existsSync(transcriptsDir)) return transcripts;

    for (const file of readdirSync(transcriptsDir)) {
      if (!file.endsWith('.json')) continue;
      const filePath = join(transcriptsDir, file);
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf8')) as any;
        const clipId = typeof data.clip_id === 'string' ? data.clip_id : basename(file, '.json');
        if (!clipId) continue;
        const textFromSegments = Array.isArray(data.segments)
          ? data.segments.map((seg: any) => (typeof seg?.text === 'string' ? seg.text : '').trim()).filter(Boolean).join(' ')
          : '';
        const rawText = typeof data.text === 'string' ? data.text.trim() : '';
        const normalized = (rawText || textFromSegments).trim();
        if (!normalized) continue;
        transcripts.set(clipId, normalized);
      } catch (err) {
        console.warn('[Orchestrator] Failed to load transcript ' + filePath + ': ' + (err as Error).message);
      }
    }

    return transcripts;
  }

  private shouldUseLLMRewrite(transcriptCount: number): boolean {
    const envRaw = (process.env.LLM_REWRITE ?? '').toLowerCase();
    if (envRaw === '1' || envRaw === 'true') return true;
    if (envRaw === '0' || envRaw === 'false') return false;
    return transcriptCount > 0;
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
