/**
 * Chomsky Agent — Prompt Engineer
 * Sprint 792 (CHOMSKY)
 *
 * T1: qwen3:4b (local vault, $0.00)
 * Audits agent prompts for token efficiency, clarity, specificity,
 * output constraints, and safety preservation.
 *
 * Harvey approval gate: every suggested change requires CEO approval.
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const AGENTS_DIR = join(ROOT, 'agents');
const PROMPT_PATH = join(__dirname, 'prompt.md');
const AUDIT_LOG_PATH = join(ROOT, 'workspace', 'agents', 'chomsky-audit-log.jsonl');

// Model config — T1 local vault (qwen3:4b, $0.00)
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = process.env.VAULT_LOCAL_MODEL_POWER || 'qwen3:4b';

// ─── Types ──────────────────────────────────────────────────────────

export interface PromptAuditScores {
  token_efficiency: number;
  clarity: number;
  specificity: number;
  output_constraint: number;
  safety_preservation: number;
}

export interface PromptSuggestion {
  type: 'cut' | 'rewrite' | 'add' | 'restructure';
  target: string;
  reason: string;
  estimated_token_savings: number;
}

export interface PromptAuditResult {
  agent_id: string;
  prompt_file: string;
  token_count_before: number;
  scores: PromptAuditScores;
  overall_score: number;
  suggestions: PromptSuggestion[];
  safety_flags: string[];
  audited_at: string;
  model_used: string;
}

// ─── LLM Call (Local Ollama) ────────────────────────────────────────

interface OllamaResponse {
  content: string;
  model: string;
}

async function callLocal(systemPrompt: string, userPrompt: string): Promise<OllamaResponse> {
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: { temperature: 0.3, num_predict: 2048 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const data = await response.json() as any;
  return {
    content: data.message?.content ?? '',
    model: data.model ?? MODEL,
  };
}

// ─── Token Estimation ───────────────────────────────────────────────

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

// ─── Prompt Discovery ───────────────────────────────────────────────

interface DiscoveredPrompt {
  agent_id: string;
  file_path: string;
  content: string;
  token_estimate: number;
}

function discoverPrompts(): DiscoveredPrompt[] {
  const prompts: DiscoveredPrompt[] = [];

  if (!existsSync(AGENTS_DIR)) return prompts;

  const agentDirs = readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const agentId of agentDirs) {
    const promptFile = join(AGENTS_DIR, agentId, 'prompt.md');
    if (existsSync(promptFile)) {
      const content = readFileSync(promptFile, 'utf-8');
      prompts.push({
        agent_id: agentId,
        file_path: promptFile,
        content,
        token_estimate: estimateTokens(content),
      });
    }
  }

  // Sort by token count descending (highest cost first)
  return prompts.sort((a, b) => b.token_estimate - a.token_estimate);
}

// ─── Parse Audit Result ─────────────────────────────────────────────

function parseAuditResult(raw: string, agentId: string, promptFile: string, tokenCount: number, model: string): PromptAuditResult {
  let json = raw.trim();

  // Extract JSON from markdown fences or surrounding text
  const jsonMatch = json.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    json = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(json);
    return {
      agent_id: agentId,
      prompt_file: promptFile,
      token_count_before: tokenCount,
      scores: {
        token_efficiency: Math.min(100, Math.max(0, parsed.scores?.token_efficiency ?? 50)),
        clarity: Math.min(100, Math.max(0, parsed.scores?.clarity ?? 50)),
        specificity: Math.min(100, Math.max(0, parsed.scores?.specificity ?? 50)),
        output_constraint: Math.min(100, Math.max(0, parsed.scores?.output_constraint ?? 50)),
        safety_preservation: Math.min(100, Math.max(0, parsed.scores?.safety_preservation ?? 50)),
      },
      overall_score: Math.min(100, Math.max(0, parsed.overall_score ?? 50)),
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [],
      safety_flags: Array.isArray(parsed.safety_flags) ? parsed.safety_flags : [],
      audited_at: new Date().toISOString(),
      model_used: model,
    };
  } catch {
    // Fallback: return a basic result if parsing fails
    return {
      agent_id: agentId,
      prompt_file: promptFile,
      token_count_before: tokenCount,
      scores: { token_efficiency: 50, clarity: 50, specificity: 50, output_constraint: 50, safety_preservation: 50 },
      overall_score: 50,
      suggestions: [],
      safety_flags: ['Parse failed — manual review needed'],
      audited_at: new Date().toISOString(),
      model_used: model,
    };
  }
}

// ─── Agent Class ────────────────────────────────────────────────────

export class ChomskyAgent {
  private systemPrompt: string;

  constructor() {
    this.systemPrompt = existsSync(PROMPT_PATH)
      ? readFileSync(PROMPT_PATH, 'utf-8')
      : 'You are a prompt engineer. Analyze the given prompt and suggest optimizations. Return JSON.';
    console.log('[Chomsky] Initialized — T1 local vault (qwen3:4b)');
  }

  async auditPrompt(agentId: string, promptContent: string, promptFile: string): Promise<PromptAuditResult> {
    const tokenCount = estimateTokens(promptContent);
    console.log(`[Chomsky] Auditing: ${agentId} (${tokenCount} est. tokens)`);

    const userPrompt = [
      `Audit this agent prompt for agent "${agentId}":`,
      '',
      '---BEGIN PROMPT---',
      promptContent,
      '---END PROMPT---',
      '',
      `Token count estimate: ${tokenCount}`,
      '',
      'Score on all 5 criteria and suggest optimizations. Return ONLY JSON.',
    ].join('\n');

    try {
      const response = await callLocal(this.systemPrompt, userPrompt);
      const result = parseAuditResult(response.content, agentId, promptFile, tokenCount, response.model);

      console.log(`[Chomsky] ${agentId}: overall ${result.overall_score}/100, ${result.suggestions.length} suggestions, ${result.safety_flags.length} safety flags`);
      return result;
    } catch (err) {
      console.warn(`[Chomsky] Audit failed for ${agentId}: ${(err as Error).message?.slice(0, 100)}`);
      return {
        agent_id: agentId,
        prompt_file: promptFile,
        token_count_before: tokenCount,
        scores: { token_efficiency: 0, clarity: 0, specificity: 0, output_constraint: 0, safety_preservation: 0 },
        overall_score: 0,
        suggestions: [],
        safety_flags: [`Audit error: ${(err as Error).message?.slice(0, 100)}`],
        audited_at: new Date().toISOString(),
        model_used: 'error',
      };
    }
  }

  async auditTopN(n: number = 5): Promise<PromptAuditResult[]> {
    const prompts = discoverPrompts();
    console.log(`[Chomsky] Discovered ${prompts.length} agent prompts. Auditing top ${n} by token count.`);

    const results: PromptAuditResult[] = [];
    const topN = prompts.slice(0, n);

    for (const prompt of topN) {
      const result = await this.auditPrompt(prompt.agent_id, prompt.content, prompt.file_path);
      results.push(result);

      // Log to audit file
      try {
        const logLine = JSON.stringify({
          agent_id: result.agent_id,
          overall_score: result.overall_score,
          token_count: result.token_count_before,
          suggestions_count: result.suggestions.length,
          audited_at: result.audited_at,
        });
        writeFileSync(AUDIT_LOG_PATH, logLine + '\n', { flag: 'a' });
      } catch { /* audit log write failure is non-critical */ }
    }

    // Summary
    const avgScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.overall_score, 0) / results.length)
      : 0;
    const totalSuggestions = results.reduce((sum, r) => sum + r.suggestions.length, 0);
    console.log(`\n[Chomsky] Audit complete: ${results.length} prompts, avg score: ${avgScore}/100, ${totalSuggestions} total suggestions`);

    return results;
  }
}

// ─── CLI ────────────────────────────────────────────────────────────

if (require.main === module) {
  const n = parseInt(process.argv[2] ?? '5', 10);
  console.log(`\n[Chomsky] Starting prompt audit (top ${n} by token count)...\n`);

  const chomsky = new ChomskyAgent();
  chomsky.auditTopN(n)
    .then(results => {
      console.log('\n[Chomsky] Results:');
      for (const r of results) {
        console.log(`  ${r.agent_id}: ${r.overall_score}/100 (${r.token_count_before} tokens, ${r.suggestions.length} suggestions)`);
      }
    })
    .catch(err => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}
