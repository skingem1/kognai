/**
 * code-demo-scriptgen.ts — LLM-powered code demo script generator
 *
 * Input: code snippet OR a prompt describing what to code
 * Output: CodeDemoScript with 3-6 steps, each has code, explanation, timing
 *
 * Uses qwen3:14b via Ollama (free, local).
 *
 * Sprint 900
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

/** Call Ollama safely — writes payload to temp file to avoid shell escaping issues */
function callOllama(prompt: string, opts?: { maxTokens?: number; temperature?: number }): string {
  let host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  if (!host.startsWith('http')) host = `http://${host}`;
  const payload = JSON.stringify({
    model: 'qwen3:14b',
    prompt,
    stream: false,
    think: false,
    options: { num_predict: opts?.maxTokens || 1000, temperature: opts?.temperature || 0.5 },
  });
  const tmpFile = `/tmp/ollama_payload_${Date.now()}.json`;
  writeFileSync(tmpFile, payload);
  const result = execSync(
    `curl -s --max-time 60 ${host}/api/generate -d @"${tmpFile}"`,
    { encoding: 'utf-8', timeout: 90000 }
  );
  try { execSync(`rm "${tmpFile}"`, { stdio: 'pipe' }); } catch {}
  return JSON.parse(result).response || '';
}

export interface CodeDemoStep {
  step_id: string;
  title: string;
  code_lines: string[];
  language: string;
  explanation: string;
  duration_s: number;
  highlight_lines?: number[];
}

export interface CodeDemoScript {
  demo_id: string;
  title: string;
  language: string;
  total_duration_s: number;
  steps: CodeDemoStep[];
  hashtags: string[];
  intro_hook: string;
}

function detectLanguage(code: string): string {
  if (/^(import |from .+ import |def |class |print\()/.test(code)) return 'python';
  if (/^(const |let |var |function |import .+ from|=>)/.test(code)) return 'typescript';
  if (/^(package |func |import \()/.test(code)) return 'go';
  if (/^(use |fn |let mut |pub )/.test(code)) return 'rust';
  if (/^(#include|int main)/.test(code)) return 'c';
  if (/^\$|^[a-z_]+=|^echo |^if \[/.test(code)) return 'bash';
  return 'python';
}

export async function generateCodeDemoScript(input: { code?: string; prompt?: string }): Promise<CodeDemoScript> {
  const demoId = `demo-${Date.now().toString(36)}`;
  let codeToExplain = input.code || '';
  let language = '';

  // If prompt provided (no code), generate the code first
  if (!codeToExplain && input.prompt) {
    console.log('  Generating code from prompt...');
    const genPrompt = `Write clean, working code for: "${input.prompt}"
Return ONLY the code, no markdown fences, no explanation. Keep it under 30 lines.`;

    codeToExplain = callOllama(genPrompt, { maxTokens: 800, temperature: 0.3 }).trim();
    // Strip markdown fences if present
    codeToExplain = codeToExplain.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
  }

  if (!codeToExplain) throw new Error('No code to explain (provide --code or --prompt)');

  language = detectLanguage(codeToExplain);
  console.log(`  Language detected: ${language}`);
  console.log(`  Code: ${codeToExplain.split('\n').length} lines`);

  // Generate step-by-step explanation
  const scriptPrompt = `Break down this ${language} code into a step-by-step TikTok code demo (30-45 seconds total).

CODE:
${codeToExplain}

Rules:
- Split into 3-6 logical steps
- Each step shows a few lines of code and has a short spoken explanation (1-2 sentences)
- First step should have a catchy hook explanation
- Last step should end with "Try it yourself" or similar CTA
- Each step duration: 5-10 seconds
- Total duration: 30-45 seconds

Return JSON only:
{
  "title": "catchy title under 60 chars",
  "intro_hook": "first 3 seconds narration hook",
  "steps": [
    {
      "step_id": "s1",
      "title": "Step 1: Setup",
      "code_lines": ["import os", "import json"],
      "language": "${language}",
      "explanation": "First we import our dependencies",
      "duration_s": 6,
      "highlight_lines": [1]
    }
  ],
  "hashtags": ["#coding", "#${language}", "#tutorial"]
}`;

  const llmResponse = callOllama(scriptPrompt, { maxTokens: 1500, temperature: 0.5 });
  const first = llmResponse.indexOf('{');
  const last = llmResponse.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('No JSON in LLM response');

  let jsonStr = llmResponse.substring(first, last + 1);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  const parsed = JSON.parse(jsonStr);

  // Validate and normalize
  const steps: CodeDemoStep[] = (parsed.steps || []).map((s: any, i: number) => ({
    step_id: s.step_id || `s${i + 1}`,
    title: s.title || `Step ${i + 1}`,
    code_lines: Array.isArray(s.code_lines) ? s.code_lines : (s.code_lines || '').split('\n'),
    language: s.language || language,
    explanation: s.explanation || '',
    duration_s: Math.max(4, Math.min(s.duration_s || 7, 12)),
    highlight_lines: s.highlight_lines || [],
  }));

  if (steps.length === 0) throw new Error('LLM generated 0 steps');

  const totalDuration = steps.reduce((sum, s) => sum + s.duration_s, 0);

  const script: CodeDemoScript = {
    demo_id: demoId,
    title: parsed.title || 'Code Demo',
    language,
    total_duration_s: totalDuration,
    steps,
    hashtags: parsed.hashtags || ['#coding', `#${language}`, '#tutorial'],
    intro_hook: parsed.intro_hook || steps[0].explanation,
  };

  console.log(`  Script: "${script.title}" — ${steps.length} steps, ${totalDuration}s`);
  return script;
}
