#!/usr/bin/env npx ts-node
/**
 * Skill Bank Validator — Sprint 489
 * Validates all skill records against schema, reports stats
 */

import * as fs from 'fs';
import * as path from 'path';

const SKILL_DIR = path.join(__dirname, '..', 'skill-bank', 'kognai-owned');
const SCHEMA_PATH = path.join(__dirname, '..', 'skill-bank', 'schema.json');

const REQUIRED_FIELDS = ['skill_id', 'type', 'name', 'description', 'definition', 'optimal_settings', 'score_history', 'execution_count', 'access_tier', 'created_at', 'updated_at'];

interface ValidationResult {
  file: string;
  valid: boolean;
  errors: string[];
  skill_id?: string;
  name?: string;
  category?: string;
}

function categorize(skillId: string, name: string): string {
  const lower = (skillId + ' ' + name).toLowerCase();
  if (lower.includes('trend') || lower.includes('discovery') || lower.includes('scraper') || lower.includes('archive'))
    return 'signal-pipeline';
  if (lower.includes('insight') || lower.includes('script') || lower.includes('caption') || lower.includes('hook'))
    return 'content-intelligence';
  if (lower.includes('clip') || lower.includes('edit') || lower.includes('video') || lower.includes('vision'))
    return 'production';
  if (lower.includes('publish') || lower.includes('posting') || lower.includes('tiktok') || lower.includes('flywheel'))
    return 'distribution';
  if (lower.includes('aar') || lower.includes('event-bus') || lower.includes('gate') || lower.includes('routing'))
    return 'infrastructure';
  if (lower.includes('soul') || lower.includes('constitution') || lower.includes('cfo'))
    return 'governance';
  return 'general';
}

function validateRecord(filePath: string): ValidationResult {
  const file = path.basename(filePath);
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const errors: string[] = [];

    for (const field of REQUIRED_FIELDS) {
      if (!(field in content)) errors.push(`missing required field: ${field}`);
    }

    if (content.type && !['kognai-owned', 'user-uploaded'].includes(content.type))
      errors.push(`invalid type: ${content.type}`);
    if (content.access_tier && !['internal', 'free', 'rental', 'sale'].includes(content.access_tier))
      errors.push(`invalid access_tier: ${content.access_tier}`);
    if (content.execution_count !== undefined && typeof content.execution_count !== 'number')
      errors.push(`execution_count must be number`);

    return {
      file,
      valid: errors.length === 0,
      errors,
      skill_id: content.skill_id,
      name: content.name,
      category: categorize(content.skill_id || '', content.name || '')
    };
  } catch (e: any) {
    return { file, valid: false, errors: [`parse error: ${e.message}`] };
  }
}

// Scan all JSON files
const files = fs.readdirSync(SKILL_DIR).filter(f => f.endsWith('.json'));
const results: ValidationResult[] = files.map(f => validateRecord(path.join(SKILL_DIR, f)));

// Report
const valid = results.filter(r => r.valid);
const invalid = results.filter(r => !r.valid);
const categories: Record<string, number> = {};

for (const r of valid) {
  const cat = r.category || 'uncategorized';
  categories[cat] = (categories[cat] || 0) + 1;
}

console.log(`\n=== Skill Bank Validation Report ===`);
console.log(`Total records: ${results.length}`);
console.log(`Valid: ${valid.length}`);
console.log(`Invalid: ${invalid.length}`);
console.log(`\n--- Categories ---`);
for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}

if (invalid.length > 0) {
  console.log(`\n--- Invalid Records ---`);
  for (const r of invalid) {
    console.log(`  ${r.file}: ${r.errors.join(', ')}`);
  }
}

// Write index
const index = {
  generated_at: new Date().toISOString(),
  total_records: results.length,
  valid_records: valid.length,
  invalid_records: invalid.length,
  categories,
  skills: valid.map(r => ({
    skill_id: r.skill_id,
    name: r.name,
    category: r.category,
    file: r.file
  }))
};

const indexPath = path.join(__dirname, '..', 'skill-bank', 'index.json');
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
console.log(`\nIndex written to: skill-bank/index.json`);
console.log(`\n✅ VALIDATION COMPLETE`);
