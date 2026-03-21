#!/usr/bin/env npx ts-node
/**
 * Sprint 733 — MiMo-V2-TTS vs macOS say comparison
 * Tests 3 voiceover scripts through both engines, writes comparison JSON.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';

// Load .env
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const MIMO_API_KEY = process.env.MIMO_API_KEY || '';
const MIMO_API_URL = process.env.MIMO_API_URL || 'https://api.xiaomimimo.com/v1';
const OUT_DIR = path.join(__dirname, '../../workspace/scs001');
const SCRIPTS_DIR = path.join(OUT_DIR, 'scripts');
const TMP_DIR = path.join(OUT_DIR, 'tts-test-tmp');

interface TestResult {
  script_id: string;
  text: string;
  mimo: { success: boolean; latency_ms: number; file_size_bytes: number; error?: string };
  say:  { success: boolean; latency_ms: number; file_size_bytes: number; error?: string };
}

function pickScripts(n: number): { id: string; text: string }[] {
  const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.json'));
  const formats = ['exp', 'lst', 'dbt'];
  const picked: { id: string; text: string }[] = [];

  for (const prefix of formats) {
    if (picked.length >= n) break;
    const match = files.find(f => f.startsWith(prefix) && !picked.some(p => p.id === f.replace('.json', '')));
    if (!match) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, match), 'utf8'));
      const lines: string[] = (data.lines || data.segments || [])
        .map((l: any) => l.text || l.voiceover_text || '')
        .filter((t: string) => t.length > 10);
      if (lines.length > 0) {
        picked.push({ id: data.script_id || match.replace('.json', ''), text: lines.slice(0, 3).join(' ') });
      }
    } catch { /* skip bad files */ }
  }
  return picked;
}

function testMacOSSay(text: string, outFile: string): { success: boolean; latency_ms: number; file_size_bytes: number; error?: string } {
  const start = Date.now();
  try {
    execSync(`say -o "${outFile}" "${text.replace(/"/g, '\\"').replace(/[^\x20-\x7E]/g, '')}"`, { timeout: 15000 });
    const latency_ms = Date.now() - start;
    const stat = fs.statSync(outFile);
    return { success: true, latency_ms, file_size_bytes: stat.size };
  } catch (e: any) {
    return { success: false, latency_ms: Date.now() - start, file_size_bytes: 0, error: e.message?.slice(0, 200) };
  }
}

function testMiMoTTS(text: string, outFile: string): Promise<{ success: boolean; latency_ms: number; file_size_bytes: number; error?: string }> {
  return new Promise((resolve) => {
    if (!MIMO_API_KEY) {
      resolve({ success: false, latency_ms: 0, file_size_bytes: 0, error: 'MIMO_API_KEY not set' });
      return;
    }
    const start = Date.now();
    const body = JSON.stringify({ text, voice: process.env.MIMO_TTS_VOICE || 'default', emotion: process.env.MIMO_TTS_EMOTION || 'neutral' });
    const url = new URL(`${MIMO_API_URL}/tts`);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MIMO_API_KEY}`, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const latency_ms = Date.now() - start;
        const data = Buffer.concat(chunks);
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300 && data.length > 1000) {
          fs.writeFileSync(outFile, data);
          resolve({ success: true, latency_ms, file_size_bytes: data.length });
        } else {
          const errBody = data.toString('utf8').slice(0, 300);
          resolve({ success: false, latency_ms, file_size_bytes: 0, error: `HTTP ${res.statusCode}: ${errBody}` });
        }
      });
    });
    req.on('error', (e) => resolve({ success: false, latency_ms: Date.now() - start, file_size_bytes: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, latency_ms: Date.now() - start, file_size_bytes: 0, error: 'timeout 30s' }); });
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const scripts = pickScripts(3);
  if (scripts.length === 0) { console.error('No scripts found'); process.exit(1); }

  console.log(`Testing ${scripts.length} scripts...`);
  const results: TestResult[] = [];

  for (const s of scripts) {
    console.log(`\n--- ${s.id} ---`);
    console.log(`Text: ${s.text.slice(0, 80)}...`);

    const sayFile = path.join(TMP_DIR, `${s.id}-say.aiff`);
    const mimoFile = path.join(TMP_DIR, `${s.id}-mimo.wav`);

    const sayResult = testMacOSSay(s.text, sayFile);
    console.log(`  macOS say: ${sayResult.success ? 'OK' : 'FAIL'} (${sayResult.latency_ms}ms, ${sayResult.file_size_bytes}b)`);

    const mimoResult = await testMiMoTTS(s.text, mimoFile);
    console.log(`  MiMo TTS:  ${mimoResult.success ? 'OK' : 'FAIL'} (${mimoResult.latency_ms}ms, ${mimoResult.file_size_bytes}b)`);

    results.push({ script_id: s.id, text: s.text, mimo: mimoResult, say: sayResult });
  }

  // Score: MiMo gets 10 if success + fast + bigger file (better quality proxy), else 0-3
  const mimoSuccesses = results.filter(r => r.mimo.success).length;
  const mimoAvgLatency = mimoSuccesses > 0
    ? results.filter(r => r.mimo.success).reduce((a, r) => a + r.mimo.latency_ms, 0) / mimoSuccesses : 0;
  const saySuccesses = results.filter(r => r.say.success).length;
  const sayAvgLatency = saySuccesses > 0
    ? results.filter(r => r.say.success).reduce((a, r) => a + r.say.latency_ms, 0) / saySuccesses : 0;

  // Score 0-10: success rate (0-4) + latency comparison (0-3) + file size (0-3)
  let mimoScore = 0;
  mimoScore += Math.round((mimoSuccesses / results.length) * 4);
  if (mimoAvgLatency > 0 && mimoAvgLatency < 10000) mimoScore += 3; // under 10s is good
  else if (mimoAvgLatency > 0 && mimoAvgLatency < 20000) mimoScore += 1;
  const mimoAvgSize = mimoSuccesses > 0
    ? results.filter(r => r.mimo.success).reduce((a, r) => a + r.mimo.file_size_bytes, 0) / mimoSuccesses : 0;
  if (mimoAvgSize > 50000) mimoScore += 3; // decent audio file
  else if (mimoAvgSize > 10000) mimoScore += 1;

  const comparison = {
    test_date: new Date().toISOString(),
    sprint: 'sprint-733',
    scripts_tested: results.length,
    results,
    summary: {
      mimo: { successes: mimoSuccesses, avg_latency_ms: Math.round(mimoAvgLatency), score: mimoScore },
      say: { successes: saySuccesses, avg_latency_ms: Math.round(sayAvgLatency), score: 7 }, // macOS say baseline: reliable but robotic
      winner: mimoScore >= 7 ? 'mimo-v2-tts' : 'macos-say',
      recommendation: mimoScore >= 7
        ? 'Promote MiMo-V2-TTS as default TTS (quality:emotional)'
        : 'Keep macOS say as primary — MiMo did not meet quality threshold',
    },
  };

  const outPath = path.join(OUT_DIR, 'mimo-tts-comparison.json');
  fs.writeFileSync(outPath, JSON.stringify(comparison, null, 2));
  console.log(`\n✓ Comparison written to ${outPath}`);
  console.log(`  MiMo score: ${mimoScore}/10, Winner: ${comparison.summary.winner}`);

  // Cleanup tmp
  try { fs.rmSync(TMP_DIR, { recursive: true }); } catch {}
}

main().catch(e => { console.error(e); process.exit(1); });
