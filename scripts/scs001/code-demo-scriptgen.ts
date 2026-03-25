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
  try {
    const result = execSync(
      `curl -s --max-time 180 ${host}/api/generate -d @"${tmpFile}"`,
      { encoding: 'utf-8', timeout: 200000 }
    );
    try { execSync(`rm "${tmpFile}"`, { stdio: 'pipe' }); } catch {}
    return JSON.parse(result).response || '';
  } catch {
    try { execSync(`rm "${tmpFile}"`, { stdio: 'pipe' }); } catch {}
    return ''; // Ollama unreachable — caller handles empty string
  }
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
  source?: 'kognai' | 'user';  // who initiated the demo
  topic_source?: string;         // e.g., 'hackernews', 'github-trending', 'user-prompt'
}

/**
 * Kognai-initiated topic discovery for code demos.
 * Scans dev community platforms for trending SaaS, SDKs, tools, AI/agentic payments topics.
 * Returns a code-demo-ready prompt.
 */
export async function discoverCodeDemoTopic(): Promise<{ prompt: string; source: string }> {
  console.log('  Discovering trending dev topic...');

  const discoveryPrompt = `You are a tech content scout. Find ONE trending topic from dev communities that would make a great 30-second code demo video.

Focus areas (pick one):
- A new or trending SaaS product API (e.g., Stripe, Supabase, Clerk)
- A popular SDK or library getting buzz (e.g., LangChain, Hono, Drizzle ORM)
- An AI/ML framework update (e.g., OpenAI SDK, Anthropic SDK, HuggingFace)
- An agentic AI or payment protocol (e.g., x402, ERC-8004, AgentPay)
- A dev tool trending on Hacker News or GitHub

Return JSON only:
{
  "topic": "short description of what to demo",
  "prompt": "Write a working example of [specific thing] using [specific SDK/tool]",
  "source": "hackernews|github|devto|producthunt",
  "why_trending": "one sentence why this is relevant now"
}`;

  try {
    const response = callOllama(discoveryPrompt, { maxTokens: 500, temperature: 0.8 });
    const first = response.indexOf('{');
    const last = response.lastIndexOf('}');
    if (first >= 0 && last > first) {
      const parsed = JSON.parse(response.substring(first, last + 1).replace(/,\s*([}\]])/g, '$1'));
      console.log(`  Found: ${parsed.topic || parsed.prompt} (${parsed.source || 'ai'})`);
      return { prompt: parsed.prompt || parsed.topic, source: parsed.source || 'ai-discovery' };
    }
  } catch {}

  // Fallback: rotate through evergreen coding topics
  const fallbacks = [
    'Build a REST API with FastAPI and Pydantic',
    'Create a CLI tool with Python Click',
    'Set up Stripe payment intent with Node.js',
    'Query a Supabase database with TypeScript',
    'Build a LangChain agent with tool use',
    'Create an Anthropic Claude API call with streaming',
  ];
  const pick = fallbacks[Date.now() % fallbacks.length];
  return { prompt: pick, source: 'fallback-rotation' };
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

  // Sprint 1315: Auto-discover topic when neither code nor prompt provided (pipeline automated mode)
  if (!codeToExplain && !input.prompt) {
    const discovered = await discoverCodeDemoTopic();
    console.log(`  Auto-discovered topic: ${discovered.prompt} (${discovered.source})`);
    const genPrompt = `Write clean, working code for: "${discovered.prompt}"
Return ONLY the code, no markdown fences, no explanation. Keep it under 30 lines.`;
    codeToExplain = callOllama(genPrompt, { maxTokens: 800, temperature: 0.3 }).trim();
    codeToExplain = codeToExplain.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
  }

  // Sprint 1322: If LLM is unavailable and all generation paths returned empty,
  // fall back to a generic template so the pipeline doesn't crash.
  if (!codeToExplain) {
    const topicHint = (input.prompt || 'Python automation').replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 50);
    console.warn(`[code-demo] LLM unavailable — using template fallback for "${topicHint}"`);
    codeToExplain = [
      `# ${topicHint} — demo`,
      'def process(items):',
      '    """Process a list of items efficiently."""',
      '    results = []',
      '    for item in items:',
      '        result = str(item).upper().strip()',
      '        results.append(result)',
      '    return results',
      '',
      'if __name__ == "__main__":',
      '    data = ["hello", "world", "ai", "demo"]',
      '    print(process(data))',
    ].join('\n');
    language = 'python';
  }

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

  // Sprint 1327: Pre-built fallback templates — used when Ollama is unavailable or returns invalid JSON
  const SCRIPT_TEMPLATES: CodeDemoScript[] = [
    {
      demo_id: demoId,
      title: 'Build a REST API with FastAPI in 30 seconds',
      language: 'python',
      total_duration_s: 30,
      steps: [
        {
          step_id: 's1',
          title: 'Step 1: Install & Import',
          code_lines: ['from fastapi import FastAPI', 'from pydantic import BaseModel', '', 'app = FastAPI()'],
          language: 'python',
          explanation: 'FastAPI gives you a production-ready REST API with zero boilerplate.',
          duration_s: 7,
          highlight_lines: [1, 2],
        },
        {
          step_id: 's2',
          title: 'Step 2: Define the Model',
          code_lines: ['class Item(BaseModel):', '    name: str', '    price: float', '    in_stock: bool = True'],
          language: 'python',
          explanation: 'Pydantic models auto-validate your request body — no manual parsing needed.',
          duration_s: 8,
          highlight_lines: [1, 2, 3],
        },
        {
          step_id: 's3',
          title: 'Step 3: Add Endpoints',
          code_lines: ['@app.get("/items/{item_id}")', 'def read_item(item_id: int):', '    return {"id": item_id}', '', '@app.post("/items")', 'def create_item(item: Item):', '    return item'],
          language: 'python',
          explanation: 'Type hints in the function signature automatically generate OpenAPI docs.',
          duration_s: 8,
          highlight_lines: [1, 5],
        },
        {
          step_id: 's4',
          title: 'Step 4: Run It',
          code_lines: ['# uvicorn main:app --reload', '# Docs at http://localhost:8000/docs'],
          language: 'python',
          explanation: 'One command and you have live docs, auto-reload, and schema validation. Try it yourself!',
          duration_s: 7,
          highlight_lines: [1],
        },
      ],
      hashtags: ['#python', '#fastapi', '#coding', '#webdev', '#tutorial'],
      intro_hook: 'Build a fully documented REST API in Python with just 10 lines of code.',
    },
    {
      demo_id: demoId,
      title: 'Stripe Checkout in Node.js — 30 seconds',
      language: 'typescript',
      total_duration_s: 32,
      steps: [
        {
          step_id: 's1',
          title: 'Step 1: Init Stripe',
          code_lines: ["import Stripe from 'stripe';", "const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);"],
          language: 'typescript',
          explanation: 'One import and your Stripe client is ready — fully typed with the official SDK.',
          duration_s: 7,
          highlight_lines: [1, 2],
        },
        {
          step_id: 's2',
          title: 'Step 2: Create Session',
          code_lines: ['const session = await stripe.checkout.sessions.create({', "  mode: 'payment',", '  line_items: [{', "    price: 'price_xyz',", '    quantity: 1,', '  }],', "  success_url: 'https://yoursite.com/success',", '});'],
          language: 'typescript',
          explanation: 'Define your product, quantity, and redirect URLs — Stripe handles the rest.',
          duration_s: 9,
          highlight_lines: [1, 2, 3],
        },
        {
          step_id: 's3',
          title: 'Step 3: Redirect User',
          code_lines: ['res.redirect(303, session.url!);', '// User lands on Stripe-hosted payment page'],
          language: 'typescript',
          explanation: 'Redirect to the hosted checkout page — PCI compliant with no extra setup.',
          duration_s: 8,
          highlight_lines: [1],
        },
        {
          step_id: 's4',
          title: 'Step 4: Handle Webhook',
          code_lines: ["stripe.webhooks.constructEvent(payload, sig, secret);", "// Listen for 'checkout.session.completed'"],
          language: 'typescript',
          explanation: 'Verify the webhook signature and fulfill orders automatically. Try it yourself!',
          duration_s: 8,
          highlight_lines: [1],
        },
      ],
      hashtags: ['#stripe', '#nodejs', '#typescript', '#payments', '#coding'],
      intro_hook: 'Accept payments in Node.js in under 10 lines — here\'s how Stripe Checkout works.',
    },
    {
      demo_id: demoId,
      title: 'Call Claude AI API in Python — 30 seconds',
      language: 'python',
      total_duration_s: 30,
      steps: [
        {
          step_id: 's1',
          title: 'Step 1: Install & Import',
          code_lines: ['# pip install anthropic', 'import anthropic', '', 'client = anthropic.Anthropic()'],
          language: 'python',
          explanation: 'The Anthropic SDK is one pip install away — fully async-capable.',
          duration_s: 7,
          highlight_lines: [2, 4],
        },
        {
          step_id: 's2',
          title: 'Step 2: Send a Message',
          code_lines: ['message = client.messages.create(', '    model="claude-opus-4-6",', '    max_tokens=1024,', '    messages=[{"role": "user", "content": "Explain recursion"}]', ')'],
          language: 'python',
          explanation: 'Pass your model, token limit, and messages — same structure as the OpenAI SDK.',
          duration_s: 8,
          highlight_lines: [1, 2, 4],
        },
        {
          step_id: 's3',
          title: 'Step 3: Read the Response',
          code_lines: ['print(message.content[0].text)', '# Stop reason: message.stop_reason', '# Usage: message.usage.input_tokens'],
          language: 'python',
          explanation: 'The response includes the text, stop reason, and token counts for billing.',
          duration_s: 8,
          highlight_lines: [1],
        },
        {
          step_id: 's4',
          title: 'Step 4: Stream It',
          code_lines: ['with client.messages.stream(model="claude-opus-4-6",', '    max_tokens=1024, messages=[...]) as s:', '    for text in s.text_stream:', '        print(text, end="", flush=True)'],
          language: 'python',
          explanation: 'For real-time UX, use the streaming API — token by token output. Try it yourself!',
          duration_s: 7,
          highlight_lines: [1, 3],
        },
      ],
      hashtags: ['#anthropic', '#claude', '#python', '#ai', '#llm', '#coding'],
      intro_hook: 'Here\'s how to call the Claude AI API in Python — it\'s simpler than you think.',
    },
  ];

  let steps: CodeDemoStep[];
  let parsed: any;

  try {
    const llmResponse = callOllama(scriptPrompt, { maxTokens: 1500, temperature: 0.5 });
    const first = llmResponse.indexOf('{');
    const last = llmResponse.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('No JSON in LLM response');

    let jsonStr = llmResponse.substring(first, last + 1);
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

    parsed = JSON.parse(jsonStr);

    // Validate and normalize
    steps = (parsed.steps || []).map((s: any, i: number) => ({
      step_id: s.step_id || `s${i + 1}`,
      title: s.title || `Step ${i + 1}`,
      code_lines: Array.isArray(s.code_lines) ? s.code_lines : (s.code_lines || '').split('\n'),
      language: s.language || language,
      explanation: s.explanation || '',
      duration_s: Math.max(4, Math.min(s.duration_s || 7, 12)),
      highlight_lines: s.highlight_lines || [],
    }));

    if (steps.length === 0) {
      console.warn('[code-demo] LLM script gen failed — using template (0 steps returned)');
      const tmpl = SCRIPT_TEMPLATES[Date.now() % SCRIPT_TEMPLATES.length];
      tmpl.demo_id = demoId;
      tmpl.language = language;
      return tmpl;
    }
  } catch (err: any) {
    console.warn(`[code-demo] LLM script gen failed — using template (${err.message})`);
    const tmpl = SCRIPT_TEMPLATES[Date.now() % SCRIPT_TEMPLATES.length];
    tmpl.demo_id = demoId;
    tmpl.language = language;
    return tmpl;
  }

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
