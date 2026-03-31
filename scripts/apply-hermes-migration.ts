#!/usr/bin/env ts-node
/**
 * apply-hermes-migration.ts
 * TICKET-032-A — Apply Hermes Protocol DB migration to Supabase
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=yourpassword npx ts-node scripts/apply-hermes-migration.ts
 *
 * If SUPABASE_DB_PASSWORD is not set, prints the SQL to stdout for manual
 * application via the Supabase Dashboard SQL Editor:
 *   https://supabase.com/dashboard/project/hroblewzdsosomytdvwe/sql/new
 *
 * Tables created:
 *   - sherlock_channel  (Hermes Protocol message store)
 *   - acp_scores        (ACP trust score Supabase mirror)
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const PROJECT_REF = 'hroblewzdsosomytdvwe';
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

const MIGRATION_FILES = [
  '20260330_hermes_tables.sql',
  '20260331_hermes_protocol.sql',
];

async function main() {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;

  if (!dbPassword) {
    console.log('SUPABASE_DB_PASSWORD not set — printing migration SQL for manual application.\n');
    console.log('Apply via Supabase Dashboard:');
    console.log(`  https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new\n`);
    console.log('='.repeat(70));

    for (const file of MIGRATION_FILES) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      console.log(`\n-- ${file}`);
      console.log(sql);
    }

    console.log('='.repeat(70));
    console.log('\nTo apply automatically:');
    console.log('  SUPABASE_DB_PASSWORD=<password> npx ts-node scripts/apply-hermes-migration.ts');
    return;
  }

  // Apply via psql using the Supabase direct connection URL
  const connectionUrl = `postgresql://postgres.${PROJECT_REF}:${dbPassword}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;

  for (const file of MIGRATION_FILES) {
    const sqlPath = join(MIGRATIONS_DIR, file);
    console.log(`Applying ${file}...`);
    try {
      execSync(`psql "${connectionUrl}" -f "${sqlPath}"`, { stdio: 'inherit' });
      console.log(`  ✓ ${file} applied`);
    } catch (err: any) {
      console.error(`  ✗ ${file} failed:`, err.message);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
