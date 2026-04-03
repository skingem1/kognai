#!/usr/bin/env npx ts-node
/**
 * Batch Hook Generator — SCS001-A Sprint 1505
 * Generates a 100-row content table for Canva Bulk Create.
 * 9 hook formulas × varied topics → CSV + JSON output.
 *
 * Uses ClawRouter → local Ollama qwen3:14b (no direct API calls).
 * Node built-ins only (no extra dependencies).
 *
 * Usage:
 *   npx ts-node scripts/scs001/batch-hook-generator.ts
 *   npx ts-node scripts/scs001/batch-hook-generator.ts --count 50 --output workspace/scs001/batch-out
 */

import * as fs from "fs";
import * as path from "path";
import { routeCall } from "../lib/clawrouter-v2";

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_COUNT = 100;
const DEFAULT_OUTPUT_BASE = path.join(ROOT, "workspace", "scs001", "batch-output");

// ─── Hook Formula Definitions ─────────────────────────────────────────────────

export const HOOK_FORMULAS = [
  { id: "curiosity_gap",   name: "Curiosity Gap",    template: "The secret behind [X] that nobody talks about." },
  { id: "contrarian",      name: "Contrarian",       template: "[Common belief] is completely wrong. Here's why." },
  { id: "specific_number", name: "Specific Number",  template: "[N] things [audience] gets wrong about [topic]." },
  { id: "relatable_pain",  name: "Relatable Pain",   template: "Stop [bad habit]. You're [negative outcome] every time." },
  { id: "reveal_tease",    name: "Reveal Tease",     template: "What happens when [scenario]? The answer will surprise you." },
  { id: "direct_address",  name: "Direct Address",   template: "If you [do X], this is exactly what you're missing." },
  { id: "bold_claim",      name: "Bold Claim",       template: "A [price] company just validated what we built for [low price]." },
  { id: "story_start",     name: "Story Start",      template: "Last [timeframe], [protagonist] tried to [action]. Here's what happened." },
  { id: "challenge",       name: "Challenge",        template: "I bet you can't [challenge] without [condition]. Try it." },
];

// ─── Topics ───────────────────────────────────────────────────────────────────

const TOPICS = [
  "AI agents", "autonomous workflows", "crypto payments", "on-chain identity",
  "sovereign AI", "constitutional AI", "TikTok algorithm", "content creation",
  "x402 payments", "PACT protocol", "agent trust scores", "self-improving AI",
  "AI governance", "multi-agent systems", "Kognai", "swarm intelligence",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HookRow {
  row_id: number;
  hook_formula_id: string;
  hook_formula_name: string;
  topic: string;
  hook_text: string;
  body_copy: string;
  cta: string;
  generated_at: string;
}

// ─── LLM Generation ───────────────────────────────────────────────────────────

async function generateRow(
  rowId: number,
  formula: (typeof HOOK_FORMULAS)[0],
  topic: string
): Promise<HookRow> {
  const prompt = `Generate a short TikTok/Reels content row for the hook formula "${formula.name}".

Topic: ${topic}
Formula template: ${formula.template}

Respond with valid JSON only:
{
  "hook_text": "the actual hook line (max 15 words)",
  "body_copy": "the 2-3 sentence body (grade 7 reading level, no jargon)",
  "cta": "a single call to action (max 8 words)"
}`;

  try {
    const resp = await routeCall({
      task_type: "content_generation",
      tier_class: "text",
      complexity: "standard",
      context_tokens: Math.ceil(prompt.length / 4),
      constitutional_flag: false,
      agent_id: "batch-hook-generator",
      prompt,
      max_tokens: 256,
    });

    const raw = resp.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as {
      hook_text: string;
      body_copy: string;
      cta: string;
    };

    return {
      row_id: rowId,
      hook_formula_id: formula.id,
      hook_formula_name: formula.name,
      topic,
      hook_text: parsed.hook_text ?? "",
      body_copy: parsed.body_copy ?? "",
      cta: parsed.cta ?? "",
      generated_at: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[batch-hook] Row ${rowId} fallback (${msg})`);
    return {
      row_id: rowId,
      hook_formula_id: formula.id,
      hook_formula_name: formula.name,
      topic,
      hook_text: formula.template.replace("[X]", topic),
      body_copy: `Content about ${topic}. More details coming.`,
      cta: "Follow for more.",
      generated_at: new Date().toISOString(),
    };
  }
}

// ─── CSV Utils ────────────────────────────────────────────────────────────────

function toCsv(rows: HookRow[]): string {
  const headers = [
    "row_id", "hook_formula_id", "hook_formula_name", "topic",
    "hook_text", "body_copy", "cta", "generated_at",
  ];
  const escape = (v: string | number) =>
    typeof v === "string" && (v.includes(",") || v.includes('"') || v.includes("\n"))
      ? `"${String(v).replace(/"/g, '""')}"`
      : String(v);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape((r as Record<string, string | number>)[h] ?? "")).join(",")),
  ];
  return lines.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const countIdx = args.indexOf("--count");
  const count = countIdx !== -1 ? parseInt(args[countIdx + 1] ?? String(DEFAULT_COUNT), 10) : DEFAULT_COUNT;
  const outputIdx = args.indexOf("--output");
  const outputBase = outputIdx !== -1 ? path.resolve(args[outputIdx + 1] ?? DEFAULT_OUTPUT_BASE) : DEFAULT_OUTPUT_BASE;

  fs.mkdirSync(path.dirname(outputBase), { recursive: true });

  console.log(`[batch-hook] Generating ${count} rows → ${outputBase}.{csv,json}`);

  const rows: HookRow[] = [];
  for (let i = 0; i < count; i++) {
    const formula = HOOK_FORMULAS[i % HOOK_FORMULAS.length];
    const topic = TOPICS[i % TOPICS.length];
    process.stdout.write(`\r[batch-hook] ${i + 1}/${count}`);
    const row = await generateRow(i + 1, formula, topic);
    rows.push(row);
  }

  console.log("\n[batch-hook] Writing outputs...");
  fs.writeFileSync(outputBase + ".json", JSON.stringify(rows, null, 2));
  fs.writeFileSync(outputBase + ".csv", toCsv(rows));

  console.log(`[batch-hook] Done. ${rows.length} rows written.`);
  console.log(`  JSON: ${outputBase}.json`);
  console.log(`  CSV:  ${outputBase}.csv`);
}

main().catch((err) => {
  console.error("[batch-hook] Fatal:", err);
  process.exit(1);
});
