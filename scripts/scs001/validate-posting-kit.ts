/**
 * Validate Posting Kit output — Sprint 262
 */

import * as fs from 'fs';
import * as path from 'path';

const KIT_PATH = path.resolve('workspace/scs001/posting-kit.html');
const SCRIPT_PATH = path.resolve('scripts/scs001/export-posting-kit.ts');

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail: string = '') {
  if (condition) {
    console.log(`PASS [${name}]${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.error(`FAIL [${name}]${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// Script exists
check('Export script exists', fs.existsSync(SCRIPT_PATH));
const script = fs.readFileSync(SCRIPT_PATH, 'utf-8');
check('Script has content', script.length > 2000, `${script.length} bytes`);
check('Script reads publish-ledger', script.includes('publish-ledger.jsonl'));
check('Script reads experiments', script.includes('experiments.jsonl'));
check('Script reads content-calendar', script.includes('content-calendar.json'));
check('Script generates HTML', script.includes('<!DOCTYPE html>'));
check('Script has gate progress', script.includes('gate_date') || script.includes('gateDate'));
check('Script has hashtag bank', script.includes('hashtags'));
check('Script has posting workflow', script.includes('Posting Workflow'));

// HTML output exists (from running the script)
const kitExists = fs.existsSync(KIT_PATH);
check('Posting kit HTML generated', kitExists);

if (kitExists) {
  const html = fs.readFileSync(KIT_PATH, 'utf-8');
  check('HTML has content', html.length > 3000, `${html.length} bytes`);
  check('HTML has stats section', html.includes('Posts Published'));
  check('HTML has days to gate', html.includes('Days to Gate'));
  check('HTML has pace needed', html.includes('Pace Needed'));
  check('HTML has schedule table', html.includes('Full Schedule'));
  check('HTML has hashtag bank', html.includes('Hashtag Bank'));
  check('HTML has posting workflow', html.includes('Posting Workflow'));
  check('HTML is valid markup', html.includes('<!DOCTYPE html>') && html.includes('</html>'));
  check('HTML has dark theme', html.includes('background: #0a0a0a'));
  check('HTML has copy-to-clipboard', html.includes('navigator.clipboard'));
}

console.log(`\n--- Results: ${passed} passed, ${failed} failed out of ${passed + failed} ---`);
if (failed > 0) {
  console.error('\nVALIDATION FAILED');
  process.exit(1);
} else {
  console.log('\nVALIDATION PASSED');
}
