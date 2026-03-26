/**
 * Godman Protocols — Pre-publish Validation
 * Sprint 1442
 *
 * Validates all 8 packages are ready for npm publish:
 *   1. dist/ directory exists with files
 *   2. package.json has required fields
 *   3. npm pack --dry-run succeeds
 *
 * Writes reports/godman-prepublish.json
 * Exit 0 on GO, exit 1 on NO_GO
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');
const PROTOCOLS_DIR = join(ROOT, 'workspace', 'godman-protocols');
const REPORTS_DIR = join(ROOT, 'reports');
const PACKAGES = ['pact', 'lax', 'score', 'signal', 'soul', 'amf', 'drs', 'sdk'];
const REQUIRED_FIELDS = ['name', 'version', 'description', 'main', 'license'];

interface PackageResult {
  name: string;
  version: string;
  dist_ok: boolean;
  fields_ok: boolean;
  pack_ok: boolean;
  pack_error?: string;
  status: 'GO' | 'NO_GO';
}

function checkPackage(pkg: string): PackageResult {
  const pkgDir = join(PROTOCOLS_DIR, pkg);
  const distDir = join(pkgDir, 'dist');
  const pkgJsonPath = join(pkgDir, 'package.json');

  // 1. dist/ exists and has files
  const dist_ok = existsSync(distDir) && readdirSync(distDir).length > 0;

  // 2. package.json required fields
  let name = `@godman-protocols/${pkg}`;
  let version = 'unknown';
  let fields_ok = false;
  if (existsSync(pkgJsonPath)) {
    const meta = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    name = meta.name ?? name;
    version = meta.version ?? version;
    fields_ok = REQUIRED_FIELDS.every(f => !!meta[f]);
  }

  // 3. npm pack --dry-run
  let pack_ok = false;
  let pack_error: string | undefined;
  try {
    execSync('npm pack --dry-run', { cwd: pkgDir, stdio: 'pipe' });
    pack_ok = true;
  } catch (err: any) {
    pack_error = String(err.stderr ?? err.message).slice(0, 200);
  }

  const status: 'GO' | 'NO_GO' = (dist_ok && fields_ok && pack_ok) ? 'GO' : 'NO_GO';
  const result: PackageResult = { name, version, dist_ok, fields_ok, pack_ok, status };
  if (pack_error) result.pack_error = pack_error;
  return result;
}

function main() {
  console.log('\n🚀 Godman Protocols — Pre-publish Validation\n');

  const results: PackageResult[] = PACKAGES.map(pkg => {
    process.stdout.write(`  ${pkg.padEnd(8)} ... `);
    const r = checkPackage(pkg);
    console.log(r.status === 'GO' ? '✅ GO' : `❌ NO_GO (dist=${r.dist_ok} fields=${r.fields_ok} pack=${r.pack_ok})`);
    return r;
  });

  const overall = results.every(r => r.status === 'GO') ? 'GO' : 'NO_GO';
  const go_count = results.filter(r => r.status === 'GO').length;

  console.log(`\n  ${go_count}/${PACKAGES.length} packages ready`);
  console.log(`  Overall: ${overall === 'GO' ? '✅ GO — ready to npm publish' : '❌ NO_GO — fix blockers first'}\n`);

  mkdirSync(REPORTS_DIR, { recursive: true });
  const report = { generated_at: new Date().toISOString(), packages: results, overall };
  writeFileSync(join(REPORTS_DIR, 'godman-prepublish.json'), JSON.stringify(report, null, 2));
  console.log(`  Report: reports/godman-prepublish.json\n`);

  process.exit(overall === 'GO' ? 0 : 1);
}

main();
