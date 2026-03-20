/**
 * SCS-001 LLM Script Rewriter
 *
 * Takes a deterministic ScriptBundle + optional transcript text,
 * sends to Claude Sonnet (or local qwen3:14b) for creative rewriting.
 * Makes each video UNIQUE instead of formulaic.
 *
 * Model priority:
 *   1. Local qwen3:14b (POWER tier, $0.00) — default
 *   2. Claude Sonnet (CLOUD tier) — if ANTHROPIC_API_KEY set and --cloud flag
 *
 * Fallback: returns original deterministic bundle unchanged.
 */

import type { ScriptBundle, ScriptSegment } from "../../agents/scs001-script/index";

// ── Types ──────────────────────────────────────────────

export interface RewriteContext {
  bundle: ScriptBundle;
  transcript?: string;
  niche?: string;
  target_audience?: string;
}

export interface RewriteResult {
  bundle: ScriptBundle;
  rewritten: boolean;
  model_used: string;
  cost_usd: number;
  latency_ms: number;
}

// ── Config ─────────────────────────────────────────────

const OLLAMA_BASE = (() => { const h = process.env.OLLAMA_HOST ?? "http://localhost:11434"; return h.startsWith("http") ? h : `http://${h}`; })();
const LOCAL_MODEL = process.env.SCRIPT_REWRITE_MODEL ?? "qwen3:14b";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// ── Prompt Builder ─────────────────────────────────────

function buildRewritePrompt(ctx: RewriteContext): string {
  const { bundle, transcript, niche, target_audience } = ctx;

  const segmentText = bundle.segments
    .map((s) => `[${s.segment_name}] ${s.voiceover_text || "(no voiceover)"}`)
    .join("\n");

  return `You are a TikTok content specialist rewriting a video script for maximum engagement.

ORIGINAL SCRIPT (deterministic template — needs human-like creativity):
Speaker: ${bundle.speaker_name}
Hook formula: ${bundle.hook_formula_used}
Why this matters: ${bundle.why_does_this_matter}
${niche ? `Niche: ${niche}` : ""}
${target_audience ? `Target audience: ${target_audience}` : ""}

SEGMENTS:
${segmentText}

${transcript ? `ORIGINAL AUDIO TRANSCRIPT (the actual words from the viral clip):
${transcript}

Use the transcript to inform your rewrite — reference specific phrases, statistics, or claims the speaker actually said. This makes the script authentic.` : ""}

REWRITE RULES:
1. Hook (0-2s): Must grab attention in first 1.5 seconds. Use a pattern interrupt.
2. Context (2-5s): Setup what the viewer is about to see. Build anticipation.
3. Clip segment: Do NOT rewrite — original audio plays.
4. Commentary (12-18s): React to what was just shown. Be specific, not generic.
5. Insight (18-24s): The "so what" — why should the viewer care?
6. Loop (if present): Callback to hook for re-watch.
7. Keep the "why_does_this_matter" content — you may rephrase but NOT remove the core message.
8. Captions must be readable in 2 seconds per line. Short, punchy.
9. Do NOT use emojis in voiceover text. Captions may use 1-2 relevant emojis max.

Respond with a JSON array of segments. Each segment:
{"segment_name":"hook","voiceover_text":"...","caption_text":"...","visual_directive":"..."}

Return ONLY the JSON array, no explanation.`;
}

// ── LLM Backends ───────────────────────────────────────

async function rewriteWithOllama(prompt: string): Promise<{ text: string; model: string }> {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LOCAL_MODEL,
      prompt: `/no_think\n${prompt}`,
      stream: false,
      options: { num_predict: 1000, temperature: 0.7 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = (await res.json()) as { response: string };
  const cleaned = data.response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return { text: cleaned, model: LOCAL_MODEL };
}

async function rewriteWithClaude(prompt: string): Promise<{ text: string; model: string }> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude ${res.status}: ${err}`);
  }
  const data = (await res.json()) as any;
  const text = data.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join(" ");
  return { text, model: CLAUDE_MODEL };
}

// ── Parser ─────────────────────────────────────────────

function parseRewrittenSegments(
  raw: string,
  original: ScriptSegment[]
): ScriptSegment[] {
  // Find JSON array in response
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return original;

  try {
    const parsed = JSON.parse(match[0]) as any[];
    if (!Array.isArray(parsed) || parsed.length === 0) return original;

    // Merge: keep original timing, update text from LLM
    return original.map((seg) => {
      const rewritten = parsed.find((p) => p.segment_name === seg.segment_name);
      if (!rewritten) return seg;

      return {
        ...seg,
        voiceover_text: rewritten.voiceover_text ?? seg.voiceover_text,
        caption_text: rewritten.caption_text ?? seg.caption_text,
        visual_directive: rewritten.visual_directive ?? seg.visual_directive,
      };
    });
  } catch {
    return original;
  }
}

// ── Public API ─────────────────────────────────────────

/**
 * Rewrite a ScriptBundle using LLM.
 * @param ctx - Bundle + optional transcript + niche info
 * @param useCloud - If true, use Claude Sonnet (costs money). Default: local qwen3:14b ($0)
 * @param dryRun - If true, skip LLM call, return original
 */
export async function rewriteScript(
  ctx: RewriteContext,
  useCloud: boolean = false,
  dryRun: boolean = false
): Promise<RewriteResult> {
  const start = Date.now();

  if (dryRun) {
    return {
      bundle: ctx.bundle,
      rewritten: false,
      model_used: "dry-run",
      cost_usd: 0,
      latency_ms: 0,
    };
  }

  const prompt = buildRewritePrompt(ctx);

  try {
    const { text, model } = useCloud
      ? await rewriteWithClaude(prompt)
      : await rewriteWithOllama(prompt);

    const rewrittenSegments = parseRewrittenSegments(text, ctx.bundle.segments);
    const latency = Date.now() - start;

    // Estimate cost: Claude Sonnet ~$0.003/1k tokens, ~2k tokens per call = ~$0.006
    // Local = $0
    const cost = useCloud ? 0.006 : 0;

    return {
      bundle: {
        ...ctx.bundle,
        segments: rewrittenSegments,
      },
      rewritten: true,
      model_used: model,
      cost_usd: cost,
      latency_ms: latency,
    };
  } catch (err: any) {
    console.warn(`[LLMRewriter] Failed (${err.message}) — returning original`);
    return {
      bundle: ctx.bundle,
      rewritten: false,
      model_used: "fallback",
      cost_usd: 0,
      latency_ms: Date.now() - start,
    };
  }
}

/**
 * Batch rewrite multiple ScriptBundles.
 */
export async function rewriteBatch(
  bundles: ScriptBundle[],
  transcripts: Map<string, string> = new Map(),
  useCloud: boolean = false,
  dryRun: boolean = false
): Promise<RewriteResult[]> {
  const results: RewriteResult[] = [];

  for (const bundle of bundles) {
    const transcript = transcripts.get(bundle.clip_id);
    const result = await rewriteScript(
      { bundle, transcript },
      useCloud,
      dryRun
    );
    results.push(result);
    if (result.rewritten) {
      console.log(
        `[LLMRewriter] ✓ ${bundle.script_id} rewritten (${result.model_used}, ${result.latency_ms}ms)`
      );
    }
  }

  return results;
}
