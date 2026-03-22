/**
 * SCS-001 — Multi-Format Script Generator
 *
 * Generates scripts for 4 video format types:
 *
 *   Type 1 (EXPLAINER) — Mono avatar, ~25s
 *     Single presenter explains a new tech/protocol/tool.
 *     Structure: Hook (3s) → Context (3s) → Explain (5s) → Detail (4s) → Impact (4s) → Takeaway (3s) → CTA (3s)
 *
 *   Type 2 (DEBATE) — 2 avatars split-screen, <30s
 *     Two agents defend competing technologies.
 *     Structure: Host intro (3s) → Side A (8s) → Side B (8s) → Clash (6s) → Verdict (5s)
 *
 *   Type 3 (VISION) — 3 avatars roundtable, AI video complement
 *     Three agents discuss the future of AI.
 *     Structure: Moderator intro (4s) → Agent A (8s) → Agent B (8s) → Agent C (8s) →
 *                Moderator synthesis (6s) → Vision clip cue (6s)
 *
 *   Type 4 (LISTICLE) — Mono avatar, ~20s countdown (Sprint 613)
 *     Single presenter counts down "Top 3" in a category.
 *     Structure: Hook (3s) → #3 (4s) → #2 (4s) → #1 (5s) → CTA (4s)
 *
 * Uses qwen3:14b via Ollama for creative script generation ($0 cost).
 * Falls back to deterministic templates when Ollama unavailable.
 */

import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { TopicBrief, VideoFormat } from './topic-radar';

// ── Types ──────────────────────────────────────────────

export interface DialogueLine {
  speaker:    string;
  avatar_id:  string;
  text:       string;
  start_s:    number;
  end_s:      number;
  emotion:    'neutral' | 'excited' | 'skeptical' | 'passionate' | 'thoughtful';
}

export interface VideoScript {
  script_id:        string;
  topic_id:         string;
  format:           VideoFormat;
  title:            string;
  lines:            DialogueLine[];
  total_duration_s: number;
  caption_text:     string;      // Bottom caption/subtitle summary
  hashtags:         string[];
  video_cue?:       string;      // For Type 3: AI video generation prompt
  generated_at:     string;
  llm_used:         boolean;
}

// ── Avatar Roster ──────────────────────────────────────

// Named AI personas — each gets a consistent avatar_id for visual identity
const AVATARS = {
  // Type 1: Solo presenter
  NOVA:    { id: 'nova',    name: 'Nova',    role: 'Tech Analyst',     voice: 'alloy' },
  // Type 2: Debate duo
  CIPHER:  { id: 'cipher',  name: 'Cipher',  role: 'Protocol Advocate', voice: 'echo' },
  VECTOR:  { id: 'vector',  name: 'Vector',  role: 'Tech Challenger',   voice: 'fable' },
  // Type 3: Roundtable trio
  SAGE:    { id: 'sage',    name: 'Sage',    role: 'AI Futurist',       voice: 'onyx' },
  PRISM:   { id: 'prism',   name: 'Prism',   role: 'Ethics Scholar',    voice: 'shimmer' },
  FLUX:    { id: 'flux',    name: 'Flux',    role: 'Builder/Engineer',  voice: 'nova' },
} as const;

// ── Config ─────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'workspace', 'scs001', 'scripts');
// Load .env if dotenv available
try { require('dotenv').config({ path: join(__dirname, '..', '..', '.env') }); } catch {}

const rawHost = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const OLLAMA_HOST = rawHost.startsWith('http') ? rawHost : `http://${rawHost}`;
const LLM_MODEL = process.env.LLM_SCRIPT_MODEL ?? 'qwen3:14b';

// ── LLM Script Generation ─────────────────────────────

async function callOllama(prompt: string, maxTokens: number = 800): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        options: { num_predict: maxTokens, temperature: 0.8 },
        think: false,
      }),
      signal: AbortSignal.timeout(180000),
    });

    if (!res.ok) return null;
    const data = await res.json() as { response: string };
    // Strip any <think> tags that qwen3 might emit
    return data.response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } catch (err) {
    console.warn(`[ScriptGen] Ollama call failed: ${(err as Error).message}`);
    return null;
  }
}

// ── Format 1: Explainer (Mono Avatar, ~25s) ───────────
// Sprint 605: Extended from 12s to 25s for better TikTok performance

async function generateExplainerScript(topic: TopicBrief): Promise<VideoScript> {
  const avatar = AVATARS.NOVA;

  // Try LLM first
  const prompt = `You are ${avatar.name}, an AI tech analyst creating a 25-second TikTok video.
Topic: ${topic.title}
Context: ${topic.summary}

Write a punchy 7-line script (each line is one shot):
1. HOOK (3 sec): Attention-grabbing opener — make them stop scrolling
2. CONTEXT (3 sec): Why this matters RIGHT NOW
3. EXPLAIN (5 sec): What it is — one clear, specific sentence
4. DETAIL (4 sec): The most interesting technical detail or feature
5. IMPACT (4 sec): Who this affects and how — be specific
6. TAKEAWAY (3 sec): The key insight they should remember
7. CTA (3 sec): End with a question or call to follow

Rules:
- Total speaking time: 25 seconds max
- Each line must be under 25 words
- Be direct, conversational, no jargon
- Sound like a knowledgeable friend, not a lecturer
- No emojis in the script text
- Reference specific names, numbers, or features when possible

Output ONLY the 7 lines, one per line, no labels or numbers.`;

  const llmOutput = await callOllama(prompt, 500);
  let lines: DialogueLine[];
  let llmUsed = false;

  if (llmOutput && llmOutput.split('\n').filter(l => l.trim()).length >= 5) {
    const rawLines = llmOutput.split('\n').filter(l => l.trim()).slice(0, 7);
    const timings = [
      { start_s: 0, end_s: 3, emotion: 'excited' as const },
      { start_s: 3, end_s: 6, emotion: 'neutral' as const },
      { start_s: 6, end_s: 11, emotion: 'neutral' as const },
      { start_s: 11, end_s: 15, emotion: 'thoughtful' as const },
      { start_s: 15, end_s: 19, emotion: 'passionate' as const },
      { start_s: 19, end_s: 22, emotion: 'thoughtful' as const },
      { start_s: 22, end_s: 25, emotion: 'passionate' as const },
    ];

    lines = rawLines.map((text, i) => ({
      speaker: avatar.name,
      avatar_id: avatar.id,
      text: text.replace(/^\d+[.)]\s*/, '').replace(/^(HOOK|CONTEXT|EXPLAIN|DETAIL|IMPACT|TAKEAWAY|CTA)[:\s]*/i, '').trim(),
      ...(timings[i] ?? { start_s: i * 3, end_s: (i + 1) * 3, emotion: 'neutral' as const }),
    }));
    llmUsed = true;
  } else {
    // Deterministic fallback
    const topicShort = topic.title.slice(0, 50);
    const summaryShort = topic.summary.slice(0, 80);
    lines = [
      { speaker: avatar.name, avatar_id: avatar.id, text: `Stop. You need to hear about ${topicShort}.`, start_s: 0, end_s: 3, emotion: 'excited' },
      { speaker: avatar.name, avatar_id: avatar.id, text: `This just dropped and it changes everything.`, start_s: 3, end_s: 6, emotion: 'neutral' },
      { speaker: avatar.name, avatar_id: avatar.id, text: `${summaryShort}.`, start_s: 6, end_s: 11, emotion: 'neutral' },
      { speaker: avatar.name, avatar_id: avatar.id, text: `The key feature here is the speed and efficiency.`, start_s: 11, end_s: 15, emotion: 'thoughtful' },
      { speaker: avatar.name, avatar_id: avatar.id, text: `If you build anything with AI, this affects you directly.`, start_s: 15, end_s: 19, emotion: 'passionate' },
      { speaker: avatar.name, avatar_id: avatar.id, text: `Remember this name. It will be everywhere soon.`, start_s: 19, end_s: 22, emotion: 'thoughtful' },
      { speaker: avatar.name, avatar_id: avatar.id, text: `Follow for more AI insights every single day.`, start_s: 22, end_s: 25, emotion: 'passionate' },
    ];
  }

  return {
    script_id: 'exp-' + randomUUID().slice(0, 8),
    topic_id: topic.topic_id,
    format: 'explainer',
    title: topic.title,
    lines,
    total_duration_s: 25,
    caption_text: topic.title,
    hashtags: ['#AI', '#Tech', '#Innovation', ...topic.keywords.slice(0, 3).map(k => '#' + k)],
    generated_at: new Date().toISOString(),
    llm_used: llmUsed,
  };
}

// ── Format 2: Debate (2 Avatars, <30s) ────────────────

async function generateDebateScript(topic: TopicBrief): Promise<VideoScript> {
  const sideA = AVATARS.CIPHER;
  const sideB = AVATARS.VECTOR;

  const debateSides = topic.debate_sides ?? {
    side_a: topic.keywords[0] ?? 'approach A',
    side_b: topic.keywords[1] ?? 'approach B',
  };

  const prompt = `You are writing a 25-second split-screen debate between two AI agents.

TOPIC: ${topic.title}
SIDE A (${sideA.name}, ${sideA.role}): Defends "${debateSides.side_a}"
SIDE B (${sideB.name}, ${sideB.role}): Defends "${debateSides.side_b}"

Write exactly 5 dialogue lines:
1. ${sideA.name} opens with a bold claim for their side (3 sec)
2. ${sideB.name} counters with their strongest argument (5 sec)
3. ${sideA.name} fires back with data or a specific advantage (5 sec)
4. ${sideB.name} delivers their knockout point (5 sec)
5. ${sideA.name} or ${sideB.name} gives a final one-liner verdict (4 sec)

Rules:
- Each line under 25 words
- Be opinionated and direct — this is a debate, not a lecture
- Reference real features, protocols, or technical details
- The debate should be genuinely informative
- No emojis. No "Well," or "Look," openers.

Format: SPEAKER: dialogue text (one per line)`;

  const llmOutput = await callOllama(prompt, 400);
  let lines: DialogueLine[];
  let llmUsed = false;

  const timings = [
    { start_s: 0, end_s: 4 },
    { start_s: 4, end_s: 10 },
    { start_s: 10, end_s: 16 },
    { start_s: 16, end_s: 22 },
    { start_s: 22, end_s: 27 },
  ];

  const emotions: Array<DialogueLine['emotion']> = ['excited', 'skeptical', 'passionate', 'passionate', 'thoughtful'];
  const speakers = [sideA, sideB, sideA, sideB, sideA];

  if (llmOutput) {
    const rawLines = llmOutput.split('\n').filter(l => l.trim()).slice(0, 5);
    if (rawLines.length >= 4) {
      lines = rawLines.map((raw, i) => {
        // Parse "SPEAKER: text" format
        const colonIdx = raw.indexOf(':');
        let text = colonIdx > 0 ? raw.slice(colonIdx + 1).trim() : raw.trim();
        text = text.replace(/^\d+[.)]\s*/, '').trim();

        const speaker = speakers[i] ?? sideA;
        return {
          speaker: speaker.name,
          avatar_id: speaker.id,
          text,
          start_s: timings[i]?.start_s ?? i * 5,
          end_s: timings[i]?.end_s ?? (i + 1) * 5,
          emotion: emotions[i] ?? 'neutral',
        };
      });
      llmUsed = true;
    } else {
      lines = buildFallbackDebate(topic, debateSides, sideA, sideB, timings, emotions);
    }
  } else {
    lines = buildFallbackDebate(topic, debateSides, sideA, sideB, timings, emotions);
  }

  return {
    script_id: 'dbt-' + randomUUID().slice(0, 8),
    topic_id: topic.topic_id,
    format: 'debate',
    title: topic.title,
    lines,
    total_duration_s: 27,
    caption_text: `${debateSides.side_a} vs ${debateSides.side_b}`,
    hashtags: ['#AIDebate', '#Tech', '#Versus', ...topic.keywords.slice(0, 3).map(k => '#' + k)],
    generated_at: new Date().toISOString(),
    llm_used: llmUsed,
  };
}

function buildFallbackDebate(
  topic: TopicBrief,
  sides: { side_a: string; side_b: string },
  sideA: typeof AVATARS.CIPHER,
  sideB: typeof AVATARS.VECTOR,
  timings: Array<{ start_s: number; end_s: number }>,
  emotions: Array<DialogueLine['emotion']>,
): DialogueLine[] {
  const texts = [
    `${sides.side_a} is clearly the better approach here. Let me tell you why.`,
    `Hold on. ${sides.side_b} solves this problem in a fundamentally better way.`,
    `But ${sides.side_a} has proven scalability and a massive ecosystem.`,
    `Scalability means nothing if the architecture is wrong. ${sides.side_b} gets this right.`,
    `The market will decide. But my money's on ${sides.side_a}.`,
  ];
  const speakers = [sideA, sideB, sideA, sideB, sideA];

  return texts.map((text, i) => ({
    speaker: speakers[i].name,
    avatar_id: speakers[i].id,
    text,
    start_s: timings[i].start_s,
    end_s: timings[i].end_s,
    emotion: emotions[i],
  }));
}

// ── Format 3: Vision Roundtable (3 Avatars) ───────────

async function generateVisionScript(topic: TopicBrief): Promise<VideoScript> {
  const mod = AVATARS.SAGE;
  const ethicist = AVATARS.PRISM;
  const builder = AVATARS.FLUX;

  const prompt = `You are writing a 35-second roundtable discussion between three AI agents about the future.

TOPIC: ${topic.title}
Context: ${topic.summary}

SPEAKERS:
- ${mod.name} (${mod.role}): Moderator, opens and synthesizes
- ${ethicist.name} (${ethicist.role}): Ethical/societal perspective
- ${builder.name} (${builder.role}): Practical engineering perspective

Write exactly 6 dialogue lines:
1. ${mod.name} sets the scene with a thought-provoking question (4 sec)
2. ${builder.name} gives the technical reality — what's possible now (6 sec)
3. ${ethicist.name} raises the ethical or societal concern (6 sec)
4. ${builder.name} responds with how builders are addressing it (5 sec)
5. ${ethicist.name} paints the optimistic future scenario (5 sec)
6. ${mod.name} synthesizes with a forward-looking statement (4 sec)

Rules:
- Each line under 25 words
- Be genuinely insightful — not generic "AI will change everything"
- Reference specific technologies, risks, or developments
- The discussion should feel like experts having a real conversation
- No emojis

Format: SPEAKER: dialogue text (one per line)

Also, at the end, write one line starting with "VIDEO_CUE:" describing a 5-second AI-generated video that would complement this discussion (e.g., "Futuristic city with autonomous drones delivering packages").`;

  const llmOutput = await callOllama(prompt, 500);
  let lines: DialogueLine[];
  let videoCue: string | undefined;
  let llmUsed = false;

  const timings = [
    { start_s: 0, end_s: 4 },
    { start_s: 4, end_s: 10 },
    { start_s: 10, end_s: 16 },
    { start_s: 16, end_s: 22 },
    { start_s: 22, end_s: 28 },
    { start_s: 28, end_s: 33 },
  ];

  const emotions: Array<DialogueLine['emotion']> = [
    'thoughtful', 'excited', 'skeptical', 'passionate', 'thoughtful', 'passionate',
  ];
  const speakers = [mod, builder, ethicist, builder, ethicist, mod];

  if (llmOutput) {
    const allLines = llmOutput.split('\n').filter(l => l.trim());

    // Extract video cue if present
    const cueIdx = allLines.findIndex(l => l.toLowerCase().startsWith('video_cue:'));
    if (cueIdx >= 0) {
      videoCue = allLines[cueIdx].replace(/^VIDEO_CUE:\s*/i, '').trim();
      allLines.splice(cueIdx, 1);
    }

    const dialogueLines = allLines.filter(l => !l.toLowerCase().startsWith('video_cue:')).slice(0, 6);

    if (dialogueLines.length >= 5) {
      lines = dialogueLines.map((raw, i) => {
        const colonIdx = raw.indexOf(':');
        let text = colonIdx > 0 ? raw.slice(colonIdx + 1).trim() : raw.trim();
        text = text.replace(/^\d+[.)]\s*/, '').trim();

        const speaker = speakers[i] ?? mod;
        return {
          speaker: speaker.name,
          avatar_id: speaker.id,
          text,
          start_s: timings[i]?.start_s ?? i * 5,
          end_s: timings[i]?.end_s ?? (i + 1) * 5,
          emotion: emotions[i] ?? 'neutral',
        };
      });
      llmUsed = true;
    } else {
      lines = buildFallbackVision(topic, mod, ethicist, builder, timings, emotions);
    }
  } else {
    lines = buildFallbackVision(topic, mod, ethicist, builder, timings, emotions);
  }

  if (!videoCue) {
    videoCue = `Futuristic visualization of ${topic.title.slice(0, 40)} — abstract digital landscape with flowing data streams`;
  }

  return {
    script_id: 'vis-' + randomUUID().slice(0, 8),
    topic_id: topic.topic_id,
    format: 'vision',
    title: topic.title,
    lines,
    total_duration_s: 33,
    caption_text: `The Future of ${topic.keywords[0] ?? 'AI'}`,
    hashtags: ['#AIFuture', '#Vision', '#Roundtable', ...topic.keywords.slice(0, 3).map(k => '#' + k)],
    video_cue: videoCue,
    generated_at: new Date().toISOString(),
    llm_used: llmUsed,
  };
}

function buildFallbackVision(
  topic: TopicBrief,
  mod: typeof AVATARS.SAGE,
  ethicist: typeof AVATARS.PRISM,
  builder: typeof AVATARS.FLUX,
  timings: Array<{ start_s: number; end_s: number }>,
  emotions: Array<DialogueLine['emotion']>,
): DialogueLine[] {
  const topicShort = topic.title.slice(0, 40);
  const texts = [
    `What does ${topicShort} mean for the next decade of technology?`,
    `The infrastructure is already being built. We're closer than most people think.`,
    `But who benefits? We need to ask hard questions about access and power.`,
    `Fair point. The open source movement is making this available to everyone.`,
    `If we get the governance right, this could be the most democratizing technology in history.`,
    `The future is being written now. And we all get to shape it.`,
  ];
  const speakers = [mod, builder, ethicist, builder, ethicist, mod];

  return texts.map((text, i) => ({
    speaker: speakers[i].name,
    avatar_id: speakers[i].id,
    text,
    start_s: timings[i].start_s,
    end_s: timings[i].end_s,
    emotion: emotions[i],
  }));
}

// ── Format 4: Listicle (Solo Presenter, ~20s countdown) ── Sprint 613

async function generateListicleScript(topic: TopicBrief): Promise<VideoScript> {
  const avatar = AVATARS.NOVA;
  const items = topic.listicle_items ?? topic.keywords.slice(0, 3).map(k => k.charAt(0).toUpperCase() + k.slice(1));
  const item3 = items[2] ?? 'a surprising newcomer';
  const item2 = items[1] ?? 'the rising contender';
  const item1 = items[0] ?? 'the undisputed leader';

  const prompt = `You are ${avatar.name}, an AI tech analyst creating a 20-second "Top 3" TikTok video.
Topic: ${topic.title}
Items to rank (3rd to 1st): ${item3}, ${item2}, ${item1}

Write a punchy 5-line countdown script:
1. HOOK (3 sec): "Top 3..." teaser that makes viewers stay to see #1
2. NUMBER 3 (4 sec): Present ${item3} — one killer fact or feature
3. NUMBER 2 (4 sec): Present ${item2} — why it beats #3
4. NUMBER 1 (5 sec): Present ${item1} — the undeniable winner and why
5. CTA (4 sec): Surprising insight or "follow for more" closer

Rules:
- Total: 20 seconds max
- Each line under 20 words
- Build suspense — save the best for #1
- Be specific, cite real features or numbers
- No emojis in script text

Output ONLY the 5 lines, one per line, no labels or numbers.`;

  const llmOutput = await callOllama(prompt, 400);
  let lines: DialogueLine[];
  let llmUsed = false;

  const timings = [
    { start_s: 0, end_s: 3, emotion: 'excited' as const },
    { start_s: 3, end_s: 7, emotion: 'neutral' as const },
    { start_s: 7, end_s: 11, emotion: 'thoughtful' as const },
    { start_s: 11, end_s: 16, emotion: 'passionate' as const },
    { start_s: 16, end_s: 20, emotion: 'excited' as const },
  ];

  if (llmOutput && llmOutput.split('\n').filter(l => l.trim()).length >= 4) {
    const rawLines = llmOutput.split('\n').filter(l => l.trim()).slice(0, 5);
    lines = rawLines.map((text, i) => ({
      speaker: avatar.name,
      avatar_id: avatar.id,
      text: text.replace(/^\d+[.)]\s*/, '').replace(/^(HOOK|NUMBER|CTA|#\d)[:\s]*/i, '').trim(),
      ...(timings[i] ?? { start_s: i * 4, end_s: (i + 1) * 4, emotion: 'neutral' as const }),
    }));
    llmUsed = true;
  } else {
    // Deterministic fallback
    const topicShort = topic.title.slice(0, 40);
    lines = [
      { speaker: avatar.name, avatar_id: avatar.id, text: `Top 3 ${topicShort} you need to know about right now.`, start_s: 0, end_s: 3, emotion: 'excited' },
      { speaker: avatar.name, avatar_id: avatar.id, text: `Number 3: ${item3}. Solid choice, but wait.`, start_s: 3, end_s: 7, emotion: 'neutral' },
      { speaker: avatar.name, avatar_id: avatar.id, text: `Number 2: ${item2}. This one surprised everyone.`, start_s: 7, end_s: 11, emotion: 'thoughtful' },
      { speaker: avatar.name, avatar_id: avatar.id, text: `Number 1: ${item1}. And it's not even close.`, start_s: 11, end_s: 16, emotion: 'passionate' },
      { speaker: avatar.name, avatar_id: avatar.id, text: `Follow for daily tech rankings that actually matter.`, start_s: 16, end_s: 20, emotion: 'excited' },
    ];
  }

  return {
    script_id: 'lst-' + randomUUID().slice(0, 8),
    topic_id: topic.topic_id,
    format: 'listicle',
    title: topic.title,
    lines,
    total_duration_s: 20,
    caption_text: `Top 3: ${topic.title.slice(0, 50)}`,
    hashtags: ['#Top3', '#Tech', '#Ranking', ...topic.keywords.slice(0, 3).map(k => '#' + k)],
    generated_at: new Date().toISOString(),
    llm_used: llmUsed,
  };
}

// ── Public API ─────────────────────────────────────────

export async function generateScript(topic: TopicBrief): Promise<VideoScript> {
  mkdirSync(OUT_DIR, { recursive: true });

  let script: VideoScript;

  switch (topic.format) {
    case 'explainer':
      script = await generateExplainerScript(topic);
      break;
    case 'debate':
      script = await generateDebateScript(topic);
      break;
    case 'vision':
      script = await generateVisionScript(topic);
      break;
    case 'listicle':
      script = await generateListicleScript(topic);
      break;
    default:
      script = await generateExplainerScript(topic);
  }

  // Save script
  const outPath = join(OUT_DIR, `${script.script_id}.json`);
  writeFileSync(outPath, JSON.stringify(script, null, 2));
  console.log(`[ScriptGen] Generated ${script.format} script: ${script.script_id} (LLM: ${script.llm_used})`);

  return script;
}

export async function generateBatch(topics: TopicBrief[]): Promise<VideoScript[]> {
  const scripts: VideoScript[] = [];
  for (const topic of topics) {
    try {
      const script = await generateScript(topic);
      scripts.push(script);
    } catch (err) {
      console.error(`[ScriptGen] Failed for ${topic.topic_id}: ${(err as Error).message}`);
    }
  }
  return scripts;
}

// ── CLI Runner ─────────────────────────────────────────

if (require.main === module) {
  // Test with a sample topic
  const testTopic: TopicBrief = {
    topic_id: 'test-001',
    title: 'Claude 4 vs GPT-5: The Next Frontier of AI Reasoning',
    summary: 'Anthropic and OpenAI race to ship next-gen models with advanced reasoning capabilities',
    format: 'debate',
    source: 'test',
    source_url: 'https://example.com',
    confidence: 90,
    keywords: ['claude', 'gpt', 'reasoning', 'ai'],
    debate_sides: { side_a: 'Claude 4 (Anthropic)', side_b: 'GPT-5 (OpenAI)' },
    collected_at: new Date().toISOString(),
  };

  generateScript(testTopic).then(script => {
    console.log('\n=== Generated Script ===');
    console.log(`Format: ${script.format} | Duration: ${script.total_duration_s}s | LLM: ${script.llm_used}`);
    for (const line of script.lines) {
      console.log(`  [${line.start_s}-${line.end_s}s] ${line.speaker}: ${line.text}`);
    }
    if (script.video_cue) console.log(`  VIDEO CUE: ${script.video_cue}`);
  }).catch(console.error);
}
