// Viral Scorer — TypeScript wrapper for viral-scorer.py
// Spawns Python subprocess, sends JSON on stdin, reads JSON from stdout.
// Uses only Node.js stdlib. Never throws — returns fallback scores on error.

import { spawn } from 'child_process';
import { join } from 'path';

export interface ViralScoreResult {
  scene_density_score: number;
  audio_excitement: number;
  clip_topic_alignment: number;
  partial_viral_score: number;
  error?: string;
}

const FALLBACK: ViralScoreResult = {
  scene_density_score: 0.5,
  audio_excitement: 0.5,
  clip_topic_alignment: 0.5,
  partial_viral_score: 0.5,
};

const PYTHON_SCRIPT = join(__dirname, 'viral-scorer.py');
const TIMEOUT_MS = 30000;

export class ViralScorer {
  async score(videoPath: string, topics: string[]): Promise<ViralScoreResult> {
    return new Promise((resolve) => {
      const proc = spawn('python3', [PYTHON_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: TIMEOUT_MS,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('error', (err) => {
        console.warn(`[ViralScorer] spawn error: ${err.message}`);
        resolve({ ...FALLBACK, error: err.message });
      });

      proc.on('close', (code) => {
        if (stderr) console.warn(`[ViralScorer] stderr: ${stderr.trim()}`);
        try {
          const parsed = JSON.parse(stdout) as ViralScoreResult;
          resolve({
            scene_density_score: parsed.scene_density_score ?? 0.5,
            audio_excitement: parsed.audio_excitement ?? 0.5,
            clip_topic_alignment: parsed.clip_topic_alignment ?? 0.5,
            partial_viral_score: parsed.partial_viral_score ?? 0.5,
          });
        } catch (err) {
          console.warn(`[ViralScorer] parse error (code=${code}): ${(err as Error).message}`);
          resolve({ ...FALLBACK, error: `parse_error: ${stdout.substring(0, 100)}` });
        }
      });

      // Send input and close stdin
      const input = JSON.stringify({ video_path: videoPath, topics });
      proc.stdin.write(input);
      proc.stdin.end();
    });
  }
}

export const viralScorer = new ViralScorer();
