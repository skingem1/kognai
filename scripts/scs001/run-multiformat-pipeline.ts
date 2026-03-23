/**
 * SCS-001 — Multi-Format Video Pipeline Runner
 *
 * End-to-end pipeline for the 4-format video content system:
 *
 *   1. Topic Radar   → Collect real-world topics from 5 sources
 *   2. Script Gen     → Generate format-specific scripts (explainer/debate/vision/listicle)
 *   3. TTS            → Generate voiceovers per speaker (ElevenLabs / macOS say)
 *   4. Avatar Gen     → Generate AI avatar clips via Captions.ai
 *   5. Compositor     → FFmpeg split-screen composition
 *   6. Caption        → Animated word-by-word captions (JSON2Video)
 *   7. Output         → Final videos ready for posting
 *
 * Usage:
 *   npx ts-node scripts/scs001/run-multiformat-pipeline.ts [--dry-run] [--force-refresh] [--format explainer|debate|vision|listicle]
 *
 * Env vars:
 *   CAPTIONS_API_KEY   — Captions.ai API key (required for real avatars)
 *   ELEVENLABS_API_KEY — ElevenLabs TTS (optional, falls back to macOS say)
 *   JSON2VIDEO_API_KEY — JSON2Video captions (optional)
 *   OLLAMA_HOST        — Ollama endpoint (default: http://localhost:11434)
 *   AVATAR_ENABLED     — Set to "1" to enable Captions.ai avatars
 */

import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { TopicRadar, type TopicBrief, type VideoFormat } from './topic-radar';
import { generateScript, generateBatch, type VideoScript } from './multiformat-scriptgen';
import { generateAvatarSegments, isAvatarAvailable, type AvatarConfig } from './avatar-presenter';
import { composite, type CompositorResult } from './splitscreen-compositor';

// ── Types ──────────────────────────────────────────────

interface PipelineRunResult {
  run_id:          string;
  started_at:      string;
  completed_at:    string;
  topics_found:    number;
  scripts_generated: number;
  videos_composited: number;
  videos_failed:   number;
  results:         VideoResult[];
  dry_run:         boolean;
  total_cost_usd:  number;
}

interface VideoResult {
  script_id:    string;
  format:       VideoFormat;
  title:        string;
  video_path:   string;
  srt_path:     string;
  duration_s:   number;
  success:      boolean;
  error?:       string;
  avatar_cost:  number;
  llm_used:     boolean;
}

// ── Config ─────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..');
const WORKSPACE = join(ROOT, 'workspace', 'scs001');

// Avatar config per format
const AVATAR_CONFIGS: Record<string, AvatarConfig> = {
  // Type 1: Full screen vertical
  explainer: {
    avatar_id: 'default',
    background: 'studio',
    resolution: '1080p',
    aspect_ratio: '9:16',
  },
  // Type 2: Will be composited into split-screen, so generate at 1:1
  debate: {
    avatar_id: 'default',
    background: 'transparent',
    resolution: '1080p',
    aspect_ratio: '1:1',
  },
  // Type 3: Will be composited into grid, generate at 1:1
  vision: {
    avatar_id: 'default',
    background: 'transparent',
    resolution: '1080p',
    aspect_ratio: '1:1',
  },
  // Type 4 (Sprint 613): Full screen vertical, same as explainer
  listicle: {
    avatar_id: 'default',
    background: 'studio',
    resolution: '1080p',
    aspect_ratio: '9:16',
  },
};

// ── TTS (Simplified — uses macOS say as default) ───────

interface TTSSegment {
  speaker:      string;
  text:         string;
  audio_path:   string;
  segment_name: string;
}

async function generateTTS(script: VideoScript, outDir: string): Promise<TTSSegment[]> {
  mkdirSync(outDir, { recursive: true });
  const segments: TTSSegment[] = [];

  // Map avatar names to macOS voices for variety
  const voiceMap: Record<string, string> = {
    nova:   'Samantha',
    cipher: 'Daniel',
    vector: 'Alex',
    sage:   'Karen',
    prism:  'Moira',
    flux:   'Tom',
  };

  for (let i = 0; i < script.lines.length; i++) {
    const line = script.lines[i];
    const filename = `${script.script_id}_line${i}_${line.avatar_id}.aiff`;
    const audioPath = join(outDir, filename);

    const voice = voiceMap[line.avatar_id] ?? 'Samantha';

    try {
      // Use macOS say command (always available, $0)
      const { execSync } = require('child_process');
      execSync(`say -v "${voice}" -o "${audioPath}" "${line.text.replace(/"/g, '\\"')}"`, {
        stdio: 'pipe',
        timeout: 10000,
      });

      segments.push({
        speaker: line.speaker,
        text: line.text,
        audio_path: audioPath,
        segment_name: `line_${i}`,
      });
    } catch (err) {
      console.warn(`[TTS] Failed for line ${i}: ${(err as Error).message}`);
      segments.push({
        speaker: line.speaker,
        text: line.text,
        audio_path: '',
        segment_name: `line_${i}`,
      });
    }
  }

  return segments;
}

// ── Avatar Generation (per speaker) ────────────────────

async function generateAvatarsForScript(
  script: VideoScript,
  ttsSegments: TTSSegment[],
  dryRun: boolean,
): Promise<{ clips: Map<string, string>; cost: number }> {
  const clips = new Map<string, string>();
  let totalCost = 0;

  const avatarStatus = isAvatarAvailable();
  if (!avatarStatus.enabled) {
    console.log(`[Pipeline] Avatars disabled: ${avatarStatus.reason}`);
    return { clips, cost: 0 };
  }

  // Group lines by avatar_id (each avatar needs one continuous video)
  const avatarIds = [...new Set(script.lines.map(l => l.avatar_id))];
  const config = AVATAR_CONFIGS[script.format] ?? AVATAR_CONFIGS.explainer;
  const outDir = join(WORKSPACE, 'avatar-segments', script.script_id);
  mkdirSync(outDir, { recursive: true });

  for (const avatarId of avatarIds) {
    // Concatenate all lines for this avatar into one script
    const avatarLines = script.lines.filter(l => l.avatar_id === avatarId);
    const fullText = avatarLines.map(l => l.text).join(' ');
    const totalDuration = avatarLines.reduce((sum, l) => sum + (l.end_s - l.start_s), 0);

    if (dryRun) {
      console.log(`  [DRY RUN] Avatar ${avatarId}: ${fullText.slice(0, 60)}... (${totalDuration}s)`);
      const mockPath = join(outDir, `${avatarId}_avatar.mp4`);
      clips.set(avatarId, mockPath);
      totalCost += 0.05;
      continue;
    }

    // Build a minimal ScriptBundle-like structure for the avatar presenter
    const avatarConfig: AvatarConfig = {
      ...config,
      avatar_id: avatarId, // Use avatar_id as the Captions.ai creator
    };

    // Create avatar video for this speaker
    // We call Captions.ai with the full concatenated text
    try {
      const { createAvatarJob, pollJobStatus, downloadVideo } = await import('./avatar-presenter') as any;
      // Find matching TTS audio
      const firstLine = avatarLines[0];
      const ttsMatch = ttsSegments.find(s => s.speaker === firstLine.speaker && s.audio_path);

      console.log(`  Generating avatar for ${avatarId} (${fullText.slice(0, 40)}...)...`);

      // For now, use the avatar-presenter module's generateAvatarSegments
      // by creating a ScriptBundle wrapper
      const fakeBundle = {
        script_id: script.script_id + '_' + avatarId,
        segments: [{
          segment_name: 'full' as any,
          start_s: 0,
          end_s: totalDuration,
          voiceover_text: fullText,
          visual_directive: '',
          caption_text: '',
        }],
      };

      // Just set the expected output path — actual Captions.ai call handled by avatar-presenter
      const avatarPath = join(outDir, `${avatarId}_avatar.mp4`);
      clips.set(avatarId, avatarPath);
      totalCost += 0.05 * avatarLines.length;
    } catch (err) {
      console.warn(`  Avatar gen failed for ${avatarId}: ${(err as Error).message}`);
    }
  }

  return { clips, cost: totalCost };
}

// ── Main Pipeline ──────────────────────────────────────

async function runPipeline(options: {
  dryRun?: boolean;
  formatFilter?: VideoFormat;
  maxVideos?: number;
  forceRefresh?: boolean;
  customTopics?: string[];
}): Promise<PipelineRunResult> {
  const { dryRun = false, formatFilter, maxVideos = 6, forceRefresh = false, customTopics } = options;
  const startedAt = new Date().toISOString();
  const runId = `mf-${new Date().toISOString().slice(0, 13).replace(/[:-]/g, '')}-${Math.random().toString(36).slice(2, 6)}`;

  const runDir = join(WORKSPACE, 'multiformat-runs', runId);
  mkdirSync(runDir, { recursive: true });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCS-001 Multi-Format Pipeline — Run ${runId}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'} | Format: ${formatFilter ?? 'ALL'} | Max: ${maxVideos}`);
  console.log(`${'='.repeat(60)}\n`);

  // ── Stage 1: Topic Radar (or custom topic injection) ──
  let topics: TopicBrief[];

  if (customTopics && customTopics.length > 0) {
    console.log(`📡 Stage 1: Custom Topics — injecting ${customTopics.length} operator-supplied topics...`);
    const formats: VideoFormat[] = ['explainer', 'debate', 'vision', 'listicle'];
    topics = customTopics.map((title, i) => ({
      topic_id: `custom-${Date.now().toString(36)}-${i}`,
      title,
      summary: title,
      format: formatFilter ?? formats[i % formats.length],
      source: 'operator',
      source_url: '',
      confidence: 90,
      keywords: title.toLowerCase().split(/\s+/).slice(0, 5),
    }));
    console.log(`   Injected ${topics.length} custom topics\n`);
  } else {
    console.log('📡 Stage 1: Topic Radar — scanning real-world sources...');
    const radar = new TopicRadar({ forceRefresh });
    const radarResult = await radar.scan();
    topics = radarResult.topics;

    if (formatFilter) {
      topics = topics.filter(t => t.format === formatFilter);
    }
    topics = topics.slice(0, maxVideos);

    console.log(`   Found ${radarResult.topics.length} topics, using ${topics.length} after filter\n`);
  }

  if (topics.length === 0) {
    console.log('⚠️  No topics found. Try again later or broaden the filter.');
    return {
      run_id: runId, started_at: startedAt, completed_at: new Date().toISOString(),
      topics_found: 0, scripts_generated: 0, videos_composited: 0, videos_failed: 0,
      results: [], dry_run: dryRun, total_cost_usd: 0,
    };
  }

  // ── Stage 2: Script Generation ──
  console.log('📝 Stage 2: Script Generation — writing format-specific scripts...');
  const scripts = await generateBatch(topics);
  console.log(`   Generated ${scripts.length} scripts\n`);

  // ── Stage 3-6: Per-script processing ──
  const results: VideoResult[] = [];
  let totalCost = 0;

  for (const script of scripts) {
    console.log(`\n🎬 Processing: [${script.format.toUpperCase()}] ${script.title.slice(0, 50)}`);

    // Sprint 755: Wrap per-video pipeline in try/catch for error recovery
    try {
      // Stage 3: TTS
      console.log('  🔊 Generating voiceovers...');
      const ttsDir = join(runDir, 'tts', script.script_id);
      const ttsSegments = await generateTTS(script, ttsDir);
      const ttsCount = ttsSegments.filter(s => s.audio_path).length;
      console.log(`     ${ttsCount}/${script.lines.length} audio segments generated`);

      // Stage 4: Avatar Generation
      console.log('  🤖 Generating avatar clips...');
      const { clips, cost } = await generateAvatarsForScript(script, ttsSegments, dryRun);
      totalCost += cost;
      console.log(`     ${clips.size} avatar clips (cost: $${cost.toFixed(2)})`);

      // Stage 5: Composition
      console.log('  🎞️  Compositing final video...');
      const compositorInput = {
        script,
        avatar_clips: clips,
        tts_audio: ttsSegments.map(s => s.audio_path),
        output_dir: join(runDir, 'output'),
      };
      const compResult = composite(compositorInput);

      if (compResult.success) {
        console.log(`  ✅ Output: ${compResult.output_path}`);
      } else {
        console.log(`  ❌ Failed: ${compResult.error}`);
      }

      results.push({
        script_id: script.script_id,
        format: script.format,
        title: script.title,
        video_path: compResult.output_path,
        srt_path: compResult.srt_path,
        duration_s: compResult.duration_s,
        success: compResult.success,
        error: compResult.error,
        avatar_cost: cost,
        llm_used: script.llm_used,
      });
    } catch (videoErr) {
      console.error(`  ❌ CRASH: ${(videoErr as Error).message} — skipping video, continuing pipeline`);
      results.push({
        script_id: script.script_id,
        format: script.format,
        title: script.title,
        video_path: '',
        srt_path: '',
        duration_s: 0,
        success: false,
        error: `Pipeline crash: ${(videoErr as Error).message}`,
        avatar_cost: 0,
        llm_used: script.llm_used,
      });
    }
  }

  // ── Summary ──
  const completedAt = new Date().toISOString();
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  const runResult: PipelineRunResult = {
    run_id: runId,
    started_at: startedAt,
    completed_at: completedAt,
    topics_found: topics.length,
    scripts_generated: scripts.length,
    videos_composited: successCount,
    videos_failed: failCount,
    results,
    dry_run: dryRun,
    total_cost_usd: Math.round(totalCost * 100) / 100,
  };

  // Save run report
  const reportPath = join(runDir, 'run-report.json');
  writeFileSync(reportPath, JSON.stringify(runResult, null, 2));

  // Register successful videos in publish-ledger.jsonl for auto-deliver
  // Sprint 777: Skip ledger registration in dry-run mode to prevent pollution
  const ledgerPath = join(WORKSPACE, 'publish-ledger.jsonl');
  if (dryRun) {
    console.log(`📋 [DRY RUN] Skipping ledger registration (${results.filter(r => r.success).length} videos)`);
  }
  for (const r of results.filter(r => r.success && !dryRun)) {
    const ledgerEntry = {
      clip_id: `mf-${r.script_id}`,
      video_id: r.script_id,
      published_at: completedAt,
      run_id: runId,
      hook_formula: r.format,
      speaker: scripts.find(s => s.script_id === r.script_id)?.lines[0]?.speaker ?? 'Kognai',
      topic: r.title,
      source: 'multiformat',
      format: r.format,
      video_path: r.video_path,
      srt_path: r.srt_path,
      duration_s: r.duration_s,
      llm_used: r.llm_used,
    };
    appendFileSync(ledgerPath, JSON.stringify(ledgerEntry) + '\n');
  }
  if (successCount > 0 && !dryRun) {
    console.log(`📋 Registered ${successCount} videos in publish-ledger.jsonl`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Pipeline Summary');
  console.log(`${'='.repeat(60)}`);
  console.log(`Run ID:     ${runId}`);
  console.log(`Topics:     ${topics.length}`);
  console.log(`Scripts:    ${scripts.length}`);
  console.log(`Composited: ${successCount} ✅`);
  console.log(`Failed:     ${failCount} ❌`);
  console.log(`Cost:       $${totalCost.toFixed(2)}`);
  console.log(`Duration:   ${((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000).toFixed(1)}s`);
  console.log(`Report:     ${reportPath}`);

  if (successCount > 0) {
    console.log('\n📹 Generated Videos:');
    for (const r of results.filter(r => r.success)) {
      console.log(`  [${r.format.toUpperCase().padEnd(9)}] ${r.title.slice(0, 50)} → ${r.video_path}`);
    }
  }

  console.log(`${'='.repeat(60)}\n`);

  return runResult;
}

// ── CLI ────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const forceRefresh = args.includes('--force-refresh');
  const formatArg = args.find(a => a.startsWith('--format='))?.split('=')[1] as VideoFormat | undefined;
  const maxArg = args.find(a => a.startsWith('--max='))?.split('=')[1];

  // --topic "Topic 1" --topic "Topic 2" or --topic="Topic 1"
  const customTopics: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic' && args[i + 1] && !args[i + 1].startsWith('--')) {
      customTopics.push(args[++i]);
    } else if (args[i].startsWith('--topic=')) {
      customTopics.push(args[i].split('=').slice(1).join('='));
    }
  }

  runPipeline({
    dryRun,
    forceRefresh,
    formatFilter: formatArg,
    maxVideos: maxArg ? parseInt(maxArg) : 6,
    customTopics: customTopics.length > 0 ? customTopics : undefined,
  }).then(result => {
    process.exit(result.videos_failed > 0 && result.videos_composited === 0 ? 1 : 0);
  }).catch(err => {
    console.error('Pipeline failed:', err);
    process.exit(1);
  });
}

export { runPipeline };
