/**
 * Pipeline 2: Code Demo Style
 *
 * Step-by-step code demo with syntax highlighting, terminal animation,
 * optional voiceover narration, and Kognai outro.
 *
 * Pipeline stages:
 *   1. Parse input (code or prompt)
 *   2. Generate CodeDemoScript via LLM (3-6 steps)
 *   3. Render each step as a typing animation (Pygments + Pillow)
 *   4. Convert frame sequences to MP4 segments
 *   5. Assemble all steps + voiceover + outro
 *   6. Output final 1080x1920 vertical video
 *
 * Cost: $0.00 (all local: Ollama + Pillow + FFmpeg + macOS say)
 *
 * Sprint 900-901
 */

import { mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { PipelineRunner, PipelineInput, PipelineRunResult, PipelineConfig } from '../pipeline-registry';
import { generateCodeDemoScript } from '../code-demo-scriptgen';
import { renderCodeFrames, framesToVideo } from '../code-renderer';
import { assembleCodeDemo } from '../code-demo-compositor';

const ROOT = join(__dirname, '..', '..', '..');
const WORKSPACE = join(ROOT, 'workspace', 'scs001');

export const codeDemoConfig: PipelineConfig = {
  name: 'code-demo',
  displayName: 'Pipeline 2: Code Demo Style',
  description: 'Step-by-step code demo with syntax highlighting and terminal animation',
  costRange: { min: 0.00, max: 0.05 },
  durationRange: { min: 30, max: 60 },
  inputType: 'code',
};

async function produceCodeDemo(input: PipelineInput): Promise<PipelineRunResult> {
  const runId = `demo-${Date.now().toString(36)}`;
  const runDir = join(WORKSPACE, 'code-demo-runs', runId);
  mkdirSync(join(runDir, 'steps'), { recursive: true });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Code Demo Producer — ${runId}`);
  console.log(`Input: ${input.code ? 'code snippet' : input.topic ? 'prompt' : 'none'}`);
  console.log(`${'='.repeat(50)}\n`);

  const startTime = Date.now();

  // 1. Generate code demo script
  console.log('📝 Generating code demo script...');
  const script = await generateCodeDemoScript({
    code: input.code,
    prompt: input.topic, // topic field doubles as prompt for code pipeline
  });
  writeFileSync(join(runDir, 'script.json'), JSON.stringify(script, null, 2));

  // 2. Render each step as typing animation
  console.log(`🖥️  Rendering ${script.steps.length} step animations...`);
  const stepVideos: Array<{ stepId: string; videoPath: string }> = [];

  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    const stepDir = join(runDir, 'steps', step.step_id);
    const videoPath = join(runDir, 'steps', `${step.step_id}.mp4`);

    console.log(`  Step ${i + 1}/${script.steps.length}: "${step.title}" (${step.duration_s}s)`);

    // Sprint 1330: Wrap render + framesToVideo in try/catch so one bad step
    // doesn't abort the entire pipeline — assembleCodeDemo handles partial renders.
    try {
      renderCodeFrames(step, i, script.steps.length, stepDir);
      framesToVideo(stepDir, videoPath);
      stepVideos.push({ stepId: step.step_id, videoPath });
    } catch (stepErr: any) {
      console.warn(`  [code-demo] Step ${i + 1} render failed (skipping): ${stepErr.message?.slice(0, 80)}`);
    }

    // Cleanup frames (keep only MP4)
    try {
      const { execSync } = require('child_process');
      execSync(`rm -rf "${stepDir}"`, { stdio: 'pipe' });
    } catch {}
  }

  // 3. Assemble final video
  const finalPath = join(runDir, `${runId}.mp4`);
  const withVoiceover = input.options?.withVoiceover !== false;
  assembleCodeDemo(script, stepVideos, finalPath, { withVoiceover, withOutro: true });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Code demo complete: ${finalPath}`);
  console.log(`   Duration: ${elapsed}s production time`);
  console.log(`   Title: "${script.title}"`);
  console.log(`   Steps: ${script.steps.length}`);
  console.log(`   Language: ${script.language}`);
  console.log(`${'='.repeat(50)}\n`);

  // Save metadata
  writeFileSync(join(runDir, 'meta.json'), JSON.stringify({
    runId,
    title: script.title,
    language: script.language,
    steps: script.steps.length,
    total_duration_s: script.total_duration_s,
    elapsed_s: parseInt(elapsed),
    produced_at: new Date().toISOString(),
  }, null, 2));

  // Copy to Downloads
  try {
    mkdirSync(`${homedir()}/Downloads/kognai-avatar-test`, { recursive: true });
    require('child_process').execSync(
      `cp "${finalPath}" "${homedir()}/Downloads/kognai-avatar-test/${runId}.mp4"`,
      { stdio: 'pipe' }
    );
  } catch {}

  return {
    pipeline: 'code-demo',
    runId,
    videoPath: finalPath,
    title: script.title,
    duration_s: script.total_duration_s,
    cost_usd: 0.00,
    quality_score: 70,
    metadata: { language: script.language, steps: script.steps.length },
    produced_at: new Date().toISOString(),
  };
}

export const codeDemoRunner: PipelineRunner = {
  config: codeDemoConfig,
  run: produceCodeDemo,
};

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  let code: string | undefined;
  let prompt: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--code' && args[i + 1]) code = args[++i];
    else if (args[i] === '--prompt' && args[i + 1]) prompt = args[++i];
    else if (!args[i].startsWith('--')) prompt = args[i];
  }

  produceCodeDemo({
    pipeline: 'code-demo',
    code,
    topic: prompt,
    options: { withVoiceover: !args.includes('--no-voice') },
  }).then(r => {
    console.log(`Output: ${r.videoPath}`);
    try { require('child_process').execSync(`open "${r.videoPath}"`); } catch {}
  }).catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
