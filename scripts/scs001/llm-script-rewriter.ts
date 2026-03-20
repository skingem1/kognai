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

  return `You are rewriting a short-form video script. Your job: make every line SPECIFIC, CONVERSATIONAL, and worth watching.

CONTEXT:
Speaker: ${bundle.speaker_name}
Topic: ${bundle.why_does_this_matter}
${niche ? `Niche: ${niche}` : ""}
${target_audience ? `Audience: ${target_audience}` : ""}

CURRENT SCRIPT (template — needs to sound like a real person talking):
${segmentText}

${transcript ? `TRANSCRIPT OF THE ACTUAL CLIP:
${transcript}

IMPORTANT: Use real details from the transcript — names, numbers, specific claims. Viewers can tell when captions match what they hear.` : ""}

REWRITE REQUIREMENTS — READ CAREFULLY:

BANNED PHRASES (instant rejection if you use these):
- "this changes everything"
- "you won't believe"
- "nobody is talking about"
- "here's the truth"
- "most people don't know"
- "you need to know this"
- "prepare to be shocked"
- "you're NOT ready"
- Any variation of generic clickbait filler

WHAT GOOD CONTENT LOOKS LIKE:
- Hook: One bold SPECIFIC claim. "NVIDIA just made their GPUs 3x faster with one firmware update" NOT "What NVIDIA just did will shock you"
- Context: Set up the clip with ONE factual sentence. Say WHO said WHAT.
- Commentary: React to a SPECIFIC moment. "He just admitted the $500 GPU can't run this at 60fps" NOT "This confirms what insiders have been warning about"
- Insight: One concrete takeaway with a real number or consequence. "That means your $2000 gaming PC is obsolete by December" NOT "The implications will reshape the field"
- Caption text: MAX 8 words per line. Punchy. Use 1 emoji per caption max.

SEGMENT RULES:
- hook: 1 sentence, under 15 words. A specific claim or question.
- context: 1 sentence, under 20 words. Who + what they said/did.
- clip: Keep caption_text as "👀 Watch this" — do NOT change.
- commentary: 1-2 sentences reacting to something SPECIFIC.
- insight: 1 sentence with a real consequence (money, time, career impact).
- loop: Keep as-is if present.
- cta: Keep as-is if present.
- voiceover_text: Natural speech. No emojis. Contractions OK.
- caption_text: Short version of voiceover. 1 emoji max per line.

OUTPUT: JSON array only. No markdown, no explanation.
[{"segment_name":"hook","voiceover_text":"...","caption_text":"...","visual_directive":"..."},...]`;
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
