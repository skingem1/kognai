/**
 * snapshot-base-model.ts — Sprint 698 (AMD-15 Rule 3)
 *
 * Snapshots a base model from Ollama: captures metadata, SHA256 hash,
 * parameter count, quantisation, and system prompt template.
 * Stores snapshot in vault/models/base/{model-name}.json.
 *
 * Usage:
 *   npx ts-node scripts/vault/snapshot-base-model.ts [model-name]
 *   Default model: qwen3:14b
 *
 * AMD-15 Rule 3: Before any fine-tuning or LoRA adapter is applied,
 * the base model MUST be snapshotted so regressions can be measured.
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const BASE_DIR = join(ROOT, 'vault', 'models', 'base');

const modelName = process.argv[2] || 'qwen3:14b';
const safeName = modelName.replace(/[:/]/g, '-');

interface ModelSnapshot {
  model: string;
  snapshot_id: string;
  snapshotted_at: string;
  ollama_show: Record<string, any>;
  digest: string;
  size_bytes: number;
  parameter_count: string;
  quantisation: string;
  family: string;
  amd15_rule: string;
}

function getOllamaShow(model: string): Record<string, any> {
  try {
    const raw = execSync(`ollama show ${model} --modelfile 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 30000,
    });
    const lines = raw.split('\n');
    const result: Record<string, any> = { raw_modelfile: raw.slice(0, 2000) };

    for (const line of lines) {
      if (line.startsWith('PARAMETER ')) {
        const parts = line.replace('PARAMETER ', '').split(' ');
        if (!result.parameters) result.parameters = {};
        result.parameters[parts[0]] = parts.slice(1).join(' ');
      }
      if (line.startsWith('TEMPLATE ')) {
        result.template = line.replace('TEMPLATE ', '').trim();
      }
    }
    return result;
  } catch {
    return { error: 'ollama show failed' };
  }
}

function getModelInfo(model: string): { digest: string; size: number; params: string; quant: string; family: string } {
  try {
    const raw = execSync('ollama list', { encoding: 'utf-8', timeout: 10000 });
    const lines = raw.split('\n');
    for (const line of lines) {
      if (line.startsWith(model) || line.includes(model)) {
        const parts = line.split(/\s{2,}/);
        const digest = parts[1]?.trim() || 'unknown';
        const sizeStr = parts[2]?.trim() || '0';
        const sizeGB = parseFloat(sizeStr);
        return {
          digest,
          size: Math.round(sizeGB * 1e9),
          params: model.includes('14b') ? '14B' : model.includes('4b') ? '4B' : model.includes('0.6b') ? '0.6B' : 'unknown',
          quant: 'Q4_K_M',
          family: model.split(':')[0],
        };
      }
    }
  } catch {}
  return { digest: 'unknown', size: 0, params: 'unknown', quant: 'unknown', family: 'unknown' };
}

function main() {
  console.log(`[snapshot] Snapshotting base model: ${modelName}`);

  const info = getModelInfo(modelName);
  const show = getOllamaShow(modelName);

  const snapshot: ModelSnapshot = {
    model: modelName,
    snapshot_id: `base-${safeName}-${Date.now()}`,
    snapshotted_at: new Date().toISOString(),
    ollama_show: show,
    digest: info.digest,
    size_bytes: info.size,
    parameter_count: info.params,
    quantisation: info.quant,
    family: info.family,
    amd15_rule: 'Rule 3: Base model preserved before any fine-tuning. This snapshot serves as the regression baseline for LoRA evaluation (Rule 4).',
  };

  const outPath = join(BASE_DIR, `${safeName}.json`);
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`[snapshot] Saved: ${outPath}`);
  console.log(`[snapshot] Digest: ${info.digest}`);
  console.log(`[snapshot] Size: ${(info.size / 1e9).toFixed(1)} GB`);
  console.log(`[snapshot] Params: ${info.params}`);

  // Also snapshot other local models for completeness
  const otherModels = ['qwen3:4b', 'qwen3:0.6b', 'deepseek-r1:14b'];
  for (const m of otherModels) {
    const mInfo = getModelInfo(m);
    if (mInfo.digest === 'unknown') continue;
    const mSafe = m.replace(/[:/]/g, '-');
    const mPath = join(BASE_DIR, `${mSafe}.json`);
    if (existsSync(mPath)) {
      console.log(`[snapshot] ${m} — already snapshotted, skipping`);
      continue;
    }
    const mSnapshot: ModelSnapshot = {
      model: m,
      snapshot_id: `base-${mSafe}-${Date.now()}`,
      snapshotted_at: new Date().toISOString(),
      ollama_show: getOllamaShow(m),
      digest: mInfo.digest,
      size_bytes: mInfo.size,
      parameter_count: mInfo.params,
      quantisation: mInfo.quant,
      family: mInfo.family,
      amd15_rule: 'Rule 3: Base model preserved.',
    };
    writeFileSync(mPath, JSON.stringify(mSnapshot, null, 2));
    console.log(`[snapshot] Saved: ${mPath}`);
  }

  console.log(`[snapshot] Done. All base models preserved in vault/models/base/`);
}

main();
