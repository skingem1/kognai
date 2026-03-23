#!/usr/bin/env npx ts-node
/**
 * SCS-001 v2 Pipeline Runner
 * Sprint 789 (SCS-001-V2-004)
 *
 * End-to-end: TrendSignal → Scorsese → ArtDirector → MovieEditor → Output
 *
 * Usage:
 *   npx ts-node scripts/scs001/run-v2-pipeline.ts                         # test mode (default topic)
 *   npx ts-node scripts/scs001/run-v2-pipeline.ts --topic "Topic here"  # custom topic
 *   npx ts-node scripts/scs001/run-v2-pipeline.ts --signal signal.json  # from JSON file
 *   npx ts-node scripts/scs001/run-v2-pipeline.ts --dry-run             # skip video assembly
 *   npx ts-node scripts/scs001/run-v2-pipeline.ts --publish             # assemble + publish via Browser Use
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { ScorseseAgent } from '../../agents/scs001-scorsese/index';
import { ArtDirectorAgent } from '../../agents/scs001-art-director/index';
import { MovieEditorAgent } from '../../agents/scs001-movie-editor/index';
import type { TrendSignal, ScenarioBundle } from '../../contracts/scs-001-v2/scenario-bundle-v1';
import type { ArtDirectorVerdict } from '../../agents/scs001-art-director/index';
import type { AssembledVideo } from '../../agents/scs001-movie-editor/index';

const ROOT = join(__dirname, '..', '..');
const RUNS_DIR = join(ROOT, 'workspace', 'scs001', 'v2-runs');

// ─── CLI Argument Parsing ───────────────────────────────────────────

interface PipelineOptions {
  signalPath?: string;
  topic?: string;
  dryRun: boolean;
  publish: boolean;
  maxRetries: number;
}

function parseArgs(): PipelineOptions {
  const args = process.argv.slice(2);
  const opts: PipelineOptions = {
    dryRun: false,
    publish: false,
    maxRetries: 1,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--signal' && args[i + 1]) {
      opts.signalPath = args[++i];
    } else if (args[i] === '--topic' && args[i + 1]) {
      opts.topic = args[++i];
    } else if (args[i] === '--dry-run') {
      opts.dryRun = true;
    } else if (args[i] === '--publish') {
      opts.publish = true;
    } else if (args[i] === '--retries' && args[i + 1]) {
      opts.maxRetries = parseInt(args[++i], 10) || 1;
    }
  }

  return opts;
}

// ─── Test TrendSignal ───────────────────────────────────────────────

function getTestSignal(): TrendSignal {
  return {
    topic_id: 'test-v2-' + Date.now(),
    topic_name: 'AI Agents Are Replacing Junior Developers',
    confidence_score: 85,
    keyword_cluster: ['AI agents', 'coding', 'developers', 'automation', 'jobs'],
    domain_tags: ['tech', 'AI', 'careers'],
    top_speakers: [
      { name: 'Andrej Karpathy', handle: '@karpathy', authority_score: 95 },
      { name: 'Devin AI', handle: '@cognition_labs', authority_score: 80 },
    ],
    viral_examples: [
      'https://tiktok.com/@techbro/video/viral-ai-agents-example',
    ],
    provenance_source: 'test-pipeline-v2',
  };
}

function loadSignal(path: string): TrendSignal {
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as TrendSignal;
}

function topicToSignal(topic: string): TrendSignal {
  // Extract keywords from the topic string
  const words = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const keywords = words.slice(0, 5);
  const domains = ['tech', 'AI'];

  return {
    topic_id: `custom-v2-${Date.now()}`,
    topic_name: topic,
    confidence_score: 80,
    keyword_cluster: keywords.length > 0 ? keywords : [topic.toLowerCase()],
    domain_tags: domains,
    provenance_source: 'custom-topic-v2',
  };
}

// ─── Pipeline Run ───────────────────────────────────────────────────

interface PipelineResult {
  run_id: string;
  signal: TrendSignal;
  scenario?: ScenarioBundle;
  verdict?: ArtDirectorVerdict;
  video?: AssembledVideo;
  status: 'pass' | 'revise' | 'reject' | 'error';
  error?: string;
  published: boolean;
  dry_run: boolean;
  retries_used: number;
  timestamps: {
    started: string;
    scorsese_done?: string;
    art_director_done?: string;
    movie_editor_done?: string;
    published_at?: string;
    finished: string;
  };
}

async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const runId = `v2-run-${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}`;
  const runDir = join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });

  const result: PipelineResult = {
    run_id: runId,
    signal: opts.signalPath ? loadSignal(opts.signalPath) : opts.topic ? topicToSignal(opts.topic) : getTestSignal(),
    status: 'error',
    published: false,
    dry_run: opts.dryRun,
    retries_used: 0,
    timestamps: {
      started: new Date().toISOString(),
      finished: '',
    },
  };

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  SCS-001 v2 Pipeline — ${runId}`);
  console.log(`  Topic: ${result.signal.topic_name}`);
  console.log(`  Mode: ${opts.dryRun ? 'DRY RUN (no video)' : 'FULL'}`);
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // ── Stage 1: Scorsese (scenario generation) ──────────────────
    console.log('▶ Stage 1: Scorsese — generating scenario...');
    const scorsese = new ScorseseAgent();
    result.scenario = await scorsese.direct(result.signal);
    result.timestamps.scorsese_done = new Date().toISOString();

    writeFileSync(join(runDir, 'scenario.json'), JSON.stringify(result.scenario, null, 2));
    console.log(`  ✓ Scenario: "${result.scenario.title}" (${result.scenario.scenes.length} scenes, ${result.scenario.total_duration_s}s)\n`);

    // ── Stage 2: ArtDirector (quality gate) ──────────────────────
    console.log('▶ Stage 2: ArtDirector — reviewing scenario...');
    const artDirector = new ArtDirectorAgent();
    let currentScenario = result.scenario;
    let verdict: ArtDirectorVerdict;
    let retries = 0;

    while (true) {
      verdict = await artDirector.review(currentScenario);
      result.verdict = verdict;
      result.timestamps.art_director_done = new Date().toISOString();

      writeFileSync(join(runDir, `verdict-${retries}.json`), JSON.stringify(verdict, null, 2));

      if (verdict.verdict === 'PASS') {
        console.log(`  ✓ PASS — message: ${verdict.message_score}/100, scroll-stop: ${verdict.scroll_stop_score}/100\n`);
        break;
      }

      if (verdict.verdict === 'REJECT') {
        console.log(`  ✗ REJECT — ${verdict.message_analysis}`);
        result.status = 'reject';
        result.timestamps.finished = new Date().toISOString();
        writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2));
        return result;
      }

      // REVISE — retry with Scorsese if we have retries left
      retries++;
      result.retries_used = retries;
      if (retries > opts.maxRetries) {
        console.log(`  ⚠ REVISE but max retries reached (${opts.maxRetries}). Proceeding with current scenario.`);
        break;
      }

      console.log(`  ↻ REVISE (attempt ${retries}/${opts.maxRetries}) — fixes: ${verdict.fixes.join('; ')}`);
      // Re-generate with Scorsese (it will produce a fresh take)
      currentScenario = await scorsese.direct(result.signal);
      result.scenario = currentScenario;
      writeFileSync(join(runDir, `scenario-retry-${retries}.json`), JSON.stringify(currentScenario, null, 2));
    }

    // ── Stage 3: MovieEditor (video assembly) ────────────────────
    if (opts.dryRun) {
      console.log('▶ Stage 3: MovieEditor — SKIPPED (dry-run mode)\n');
      result.status = verdict!.verdict === 'PASS' ? 'pass' : 'revise';
    } else {
      console.log('▶ Stage 3: MovieEditor — assembling video...');
      const movieEditor = new MovieEditorAgent();
      result.video = await movieEditor.assemble(currentScenario);
      result.timestamps.movie_editor_done = new Date().toISOString();
      result.status = 'pass';

      console.log(`  ✓ Video: ${result.video.video_id} (${result.video.duration_seconds}s, voiceover: ${result.video.has_voiceover})\n`);

      // ── Stage 4: Publishing via Browser Use (Sprint 790) ──────
      if (opts.publish && result.video && verdict!.verdict === 'PASS') {
        console.log('▶ Stage 4: Publishing — Browser Use TikTok upload...');
        const postScript = join(ROOT, 'scripts', 'scs001', 'post-tiktok.sh');
        const venvPath = join(ROOT, '.venv-browser-use');
        const warmupPath = join(ROOT, 'workspace', 'scs001', 'warmup-status.json');

        if (!existsSync(venvPath)) {
          console.log('  ⚠ Browser Use not installed — run: bash scripts/scs001/install-browser-use.sh');
        } else if (!existsSync(warmupPath)) {
          console.log('  ⚠ Warmup not started — run /warmup-start first');
        } else {
          try {
            const warmup = JSON.parse(readFileSync(warmupPath, 'utf-8'));
            if (!warmup.verified) {
              console.log('  ⚠ Warmup not verified — complete warmup first');
            } else {
              const caption = currentScenario.title + ' ' + currentScenario.hashtags.map((h: string) => '#' + h).join(' ');
              execSync(
                `bash "${postScript}" "${result.video.file_path}" "${caption.replace(/"/g, '\\"')}"`,
                { cwd: ROOT, timeout: 120_000, stdio: 'inherit' }
              );
              result.published = true;
              result.timestamps.published_at = new Date().toISOString();
              console.log('  ✓ Upload prepared via Browser Use. Review in browser and click Post.\n');
            }
          } catch (pubErr) {
            console.warn(`  ⚠ Publishing failed: ${(pubErr as Error).message?.slice(0, 200)}`);
            console.warn(`  Video ready at: ${result.video.file_path}`);
            console.warn(`  Post manually: bash scripts/scs001/post-tiktok.sh "${result.video.file_path}" "caption" --post\n`);
          }
        }
      } else if (opts.publish && !result.video) {
        console.log('▶ Stage 4: Publishing — SKIPPED (no video produced)\n');
      }
    }

  } catch (err) {
    result.status = 'error';
    result.error = (err as Error).message;
    console.error(`\n✗ Pipeline error: ${result.error}`);
  }

  result.timestamps.finished = new Date().toISOString();
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2));

  // ── Summary ────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Result: ${result.status.toUpperCase()}`);
  console.log(`  Run: ${runDir}`);
  if (result.scenario) console.log(`  Scenario: ${result.scenario.title}`);
  if (result.verdict) console.log(`  Verdict: ${result.verdict.verdict} (msg:${result.verdict.message_score}, scroll:${result.verdict.scroll_stop_score})`);
  if (result.video) console.log(`  Video: ${result.video.file_path}`);
  console.log(`  Published: ${result.published}`);
  console.log(`  Retries: ${result.retries_used}`);
  console.log('═══════════════════════════════════════════════════════');

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────

const opts = parseArgs();
runPipeline(opts)
  .then(result => {
    process.exit(result.status === 'pass' ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal:', err);
    process.exit(2);
  });
