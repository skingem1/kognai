/**
 * Telegram command: /lora-eval — Sprint 699 (AMD-15 Rule 4)
 *
 * Triggers LoRA evaluation gate for a model adapter.
 * Usage: /lora-eval [adapter-model]
 * Default: evaluates qwen3:14b against itself (baseline test)
 */

import * as path from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';

const ROOT = path.join(__dirname, '..', '..');

export function cmdLoraEval(args?: string): string {
  const adapterModel = args?.trim() || '';

  // If no args, show status of past evaluations
  if (!adapterModel) {
    return getEvalStatus();
  }

  // Trigger eval (async — will take time)
  return `🧪 *LoRA Eval Gate*\n\nAdapter: \`${adapterModel}\`\nBase: \`qwen3:14b\`\n\n⏳ Run manually:\n\`npx ts-node scripts/lib/lora-eval-gate.ts qwen3:14b ${adapterModel}\`\n\n_Results will be saved to vault/models/eval-results/_`;
}

function getEvalStatus(): string {
  const resultsDir = path.join(ROOT, 'vault', 'models', 'eval-results');
  if (!existsSync(resultsDir)) {
    return '🧪 *LoRA Eval Gate*\n\nNo evaluations run yet.\n\nUsage: `/lora-eval <adapter-model>`\nExample: `/lora-eval qwen3:14b-lora-v1`';
  }

  const files = readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 5);
  if (files.length === 0) {
    return '🧪 *LoRA Eval Gate*\n\nNo evaluations run yet.\n\nUsage: `/lora-eval <adapter-model>`';
  }

  const lines = files.map(f => {
    try {
      const data = JSON.parse(readFileSync(path.join(resultsDir, f), 'utf-8'));
      const icon = data.overall_pass ? '✅' : '❌';
      const rec = data.recommendation?.toUpperCase() || '?';
      return `${icon} \`${data.adapter_model}\` — ${data.overall_score}/100 (${rec})`;
    } catch {
      return `❓ ${f}`;
    }
  });

  return `🧪 *LoRA Eval Gate* — Recent Results\n\n${lines.join('\n')}\n\n_Thresholds: Accuracy≥80, Safety≥95, File≥85, Constitutional≥90_`;
}
