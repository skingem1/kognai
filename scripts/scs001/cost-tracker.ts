#!/usr/bin/env npx ts-node
/**
 * cost-tracker.ts — Pipeline cost tracking for SCS-001
 * Sprint 661: Tracks LLM, TTS, storage, and API costs.
 *
 * Cost model:
 * - Local LLM (qwen3, deepseek via Ollama): $0.00
 * - Cloud LLM (Claude Haiku): $0.25/1M input, $1.25/1M output
 * - Cloud LLM (Claude Sonnet): $3/1M input, $15/1M output
 * - ElevenLabs TTS: ~$0.15 per video (30s avg)
 * - Supabase Storage: free tier (1GB)
 * - Pexels/Pixabay API: free
 * - YouTube Data API: free (10K quota/day)
 *
 * Usage:
 *   npx ts-node scripts/scs001/cost-tracker.ts           # Full report
 *   npx ts-node scripts/scs001/cost-tracker.ts --today    # Today only
 *   npx ts-node scripts/scs001/cost-tracker.ts --telegram # Telegram-formatted output
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const LEDGER_PATH = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const DELIVERED_PATH = path.join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
const EXPERIMENTS_PATH = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
const COST_LOG_PATH = path.join(ROOT, 'workspace', 'scs001', 'cost-log.json');

// Cost constants
const COSTS = {
  elevenlabs_tts_per_video: 0.15,     // ~30s audio at $0.30/1000 chars
  local_llm_per_call: 0.00,           // Ollama (qwen3, deepseek)
  cloud_haiku_per_1k_tokens: 0.00125, // Input: $0.25/1M, Output: $1.25/1M (avg)
  supabase_storage_gb: 0.00,          // Free tier
  pexels_api: 0.00,                   // Free
  pixabay_api: 0.00,                  // Free
  youtube_api: 0.00,                  // Free quota
};

interface CostEntry {
  date: string;
  videos_generated: number;
  videos_delivered: number;
  tts_cost: number;
  llm_local_calls: number;
  llm_cloud_calls: number;
  llm_cloud_cost: number;
  storage_cost: number;
  total_cost: number;
}

function readJSONL(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function getDateFromEntry(entry: any): string {
  const ts = entry.published_at || entry.delivered_at || entry.timestamp || '';
  return ts.slice(0, 10);
}

function computeDailyCosts(): Map<string, CostEntry> {
  const ledger = readJSONL(LEDGER_PATH);
  const delivered = readJSONL(DELIVERED_PATH);
  const experiments = readJSONL(EXPERIMENTS_PATH);

  const dailyCosts = new Map<string, CostEntry>();

  const getOrCreate = (date: string): CostEntry => {
    if (!dailyCosts.has(date)) {
      dailyCosts.set(date, {
        date,
        videos_generated: 0,
        videos_delivered: 0,
        tts_cost: 0,
        llm_local_calls: 0,
        llm_cloud_calls: 0,
        llm_cloud_cost: 0,
        storage_cost: 0,
        total_cost: 0,
      });
    }
    return dailyCosts.get(date)!;
  };

  // Count generated videos (from ledger)
  for (const entry of ledger) {
    const date = getDateFromEntry(entry);
    if (!date) continue;
    const day = getOrCreate(date);
    day.videos_generated++;
    // Each video uses TTS (ElevenLabs)
    day.tts_cost += COSTS.elevenlabs_tts_per_video;
  }

  // Count delivered videos
  for (const entry of delivered) {
    const date = getDateFromEntry(entry);
    if (!date) continue;
    const day = getOrCreate(date);
    day.videos_delivered++;
  }

  // Count LLM calls from experiments (all local via Ollama)
  for (const entry of experiments) {
    const date = getDateFromEntry(entry);
    if (!date) continue;
    const day = getOrCreate(date);
    // Each experiment = ~3 LLM calls (scriptgen + rewrite + QC)
    day.llm_local_calls += 3;
  }

  // Compute totals
  for (const [, day] of dailyCosts) {
    day.total_cost = day.tts_cost + day.llm_cloud_cost + day.storage_cost;
  }

  return dailyCosts;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function main(): void {
  const args = process.argv.slice(2);
  const todayOnly = args.includes('--today');
  const telegramFormat = args.includes('--telegram');

  const dailyCosts = computeDailyCosts();
  const sorted = Array.from(dailyCosts.values()).sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    console.log('No cost data available.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const display = todayOnly ? sorted.filter(d => d.date === today) : sorted;

  // Monthly aggregates
  const monthlyData = sorted.filter(d => d.date.startsWith(thisMonth));
  const monthTotal = monthlyData.reduce((s, d) => s + d.total_cost, 0);
  const monthVideos = monthlyData.reduce((s, d) => s + d.videos_generated, 0);
  const monthDelivered = monthlyData.reduce((s, d) => s + d.videos_delivered, 0);
  const monthTTS = monthlyData.reduce((s, d) => s + d.tts_cost, 0);
  const monthLocalCalls = monthlyData.reduce((s, d) => s + d.llm_local_calls, 0);
  const monthCloudCalls = monthlyData.reduce((s, d) => s + d.llm_cloud_calls, 0);
  const monthCloudCost = monthlyData.reduce((s, d) => s + d.llm_cloud_cost, 0);

  // All-time totals
  const allTimeTotal = sorted.reduce((s, d) => s + d.total_cost, 0);
  const allTimeVideos = sorted.reduce((s, d) => s + d.videos_generated, 0);
  const costPerVideo = allTimeVideos > 0 ? allTimeTotal / allTimeVideos : 0;

  if (telegramFormat) {
    // Telegram-friendly output
    const lines = [
      `💰 *Pipeline Costs — ${thisMonth}*`,
      '',
      `Videos generated: ${monthVideos}`,
      `Videos delivered: ${monthDelivered}`,
      '',
      `*Cost Breakdown:*`,
      `  TTS (ElevenLabs): ${formatCurrency(monthTTS)}`,
      `  LLM local calls: ${monthLocalCalls} ($0.00)`,
      `  LLM cloud calls: ${monthCloudCalls} (${formatCurrency(monthCloudCost)})`,
      `  Storage: $0.00 (free tier)`,
      '',
      `*Monthly total: ${formatCurrency(monthTotal)}*`,
      `Cost/video: ${formatCurrency(costPerVideo)}`,
      '',
      `All-time: ${allTimeVideos} videos, ${formatCurrency(allTimeTotal)}`,
    ];
    console.log(lines.join('\n'));
  } else {
    console.log('=== SCS-001 Pipeline Cost Report ===\n');

    console.log(`Month: ${thisMonth}`);
    console.log(`Videos generated: ${monthVideos}`);
    console.log(`Videos delivered: ${monthDelivered}`);
    console.log('');
    console.log('Cost Breakdown:');
    console.log(`  TTS (ElevenLabs):  ${formatCurrency(monthTTS)}`);
    console.log(`  LLM local calls:   ${monthLocalCalls} ($0.00)`);
    console.log(`  LLM cloud calls:   ${monthCloudCalls} (${formatCurrency(monthCloudCost)})`);
    console.log(`  Storage:           $0.00 (free tier)`);
    console.log(`  Monthly total:     ${formatCurrency(monthTotal)}`);
    console.log('');
    console.log('All-Time:');
    console.log(`  Total videos:      ${allTimeVideos}`);
    console.log(`  Total cost:        ${formatCurrency(allTimeTotal)}`);
    console.log(`  Cost per video:    ${formatCurrency(costPerVideo)}`);
    console.log('');

    if (!todayOnly) {
      console.log('Daily Breakdown:');
      console.log('Date       | Videos | Delivered | TTS     | LLM(L) | Total');
      console.log('-----------|--------|-----------|---------|--------|------');
      for (const d of display.slice(-14)) { // Last 14 days
        console.log(
          `${d.date} | ${String(d.videos_generated).padStart(6)} | ${String(d.videos_delivered).padStart(9)} | ${formatCurrency(d.tts_cost).padStart(7)} | ${String(d.llm_local_calls).padStart(6)} | ${formatCurrency(d.total_cost)}`
        );
      }
    }
  }

  // Save cost log
  const costLog = {
    generated_at: new Date().toISOString(),
    month: thisMonth,
    monthly_summary: {
      videos_generated: monthVideos,
      videos_delivered: monthDelivered,
      tts_cost: monthTTS,
      llm_local_calls: monthLocalCalls,
      llm_cloud_cost: monthCloudCost,
      total_cost: monthTotal,
    },
    all_time: {
      total_videos: allTimeVideos,
      total_cost: allTimeTotal,
      cost_per_video: costPerVideo,
    },
    daily: sorted,
  };
  fs.writeFileSync(COST_LOG_PATH, JSON.stringify(costLog, null, 2));

  console.log(`\n✅ PASS — Cost report saved to ${COST_LOG_PATH}`);
}

main();
