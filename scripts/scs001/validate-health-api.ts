/**
 * Validate Health API — Sprint 264
 * Tests the buildHealthReport function directly (no server needed).
 */

import * as fs from 'fs';
import * as path from 'path';

// Import the health report builder
const { buildHealthReport } = require('./health-api');

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

// Build report
const report = buildHealthReport();

// Structure checks
check('Report has service field', report.service === 'scs001-pipeline');
check('Report has timestamp', typeof report.timestamp === 'string' && report.timestamp.includes('T'));

// Gate section
check('Report has gate section', typeof report.gate === 'object');
check('Gate has posted count', typeof report.gate.posted === 'number');
check('Gate has target', report.gate.target === 30);
check('Gate has daysRemaining', typeof report.gate.daysRemaining === 'number');
check('Gate has paceNeeded', typeof report.gate.paceNeeded === 'number');
check('Gate has status', ['ON_TRACK', 'WARNING', 'CRITICAL', 'PASSED'].includes(report.gate.status), report.gate.status);

// Pipeline section
check('Report has pipeline section', typeof report.pipeline === 'object');
check('Pipeline has total_experiments', typeof report.pipeline.total_experiments === 'number');
check('Pipeline has qc_passed', typeof report.pipeline.qc_passed === 'number');
check('Pipeline has qc_rate', typeof report.pipeline.qc_rate === 'number');
check('Pipeline has total_published', typeof report.pipeline.total_published === 'number');
check('Pipeline has latest_run', report.pipeline.latest_run === null || typeof report.pipeline.latest_run === 'string');
check('Pipeline has trend_outputs', typeof report.pipeline.trend_outputs === 'number');
check('Pipeline has editing_outputs', typeof report.pipeline.editing_outputs === 'number');

// Environment section
check('Report has environment section', typeof report.environment === 'object');
check('Env checks ANTHROPIC_API_KEY', typeof report.environment.ANTHROPIC_API_KEY === 'boolean');
check('Env checks TELEGRAM_BOT_TOKEN', typeof report.environment.TELEGRAM_BOT_TOKEN === 'boolean');
check('Env checks STRIPE_SECRET_KEY', typeof report.environment.STRIPE_SECRET_KEY === 'boolean');
check('Env checks SCS_EDITING_MODE', typeof report.environment.SCS_EDITING_MODE === 'boolean');

// Script file checks
const apiPath = path.resolve(__dirname, './health-api.ts');
check('Health API script exists', fs.existsSync(apiPath));
const apiContent = fs.readFileSync(apiPath, 'utf-8');
check('API has CORS header', apiContent.includes('Access-Control-Allow-Origin'));
check('API has /health endpoint', apiContent.includes('/health'));
check('API has /health/gate endpoint', apiContent.includes('/health/gate'));
check('API has /health/env endpoint', apiContent.includes('/health/env'));

// JSON serialization check
try {
  const json = JSON.stringify(report);
  check('Report serializes to valid JSON', json.length > 100, `${json.length} bytes`);
} catch {
  check('Report serializes to valid JSON', false, 'serialization failed');
}

console.log(`\n--- Results: ${passed} passed, ${failed} failed out of ${passed + failed} ---`);
if (failed > 0) {
  console.error('\nVALIDATION FAILED');
  process.exit(1);
} else {
  console.log('\nVALIDATION PASSED');
}
