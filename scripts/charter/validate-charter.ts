/**
 * Validate Founding Charter completeness for Sprint 261
 * Checks: all 9 articles present, 5 laws, key sections, EAS prep outputs.
 */

import * as fs from 'fs';
import * as path from 'path';

const CHARTER_PATH = path.resolve(__dirname, '../../workspace/shared-context/FOUNDING_CHARTER.md');
const ATTESTATION_DIR = path.resolve(__dirname, '../../workspace/charter-attestation');

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

// Charter exists and has content
const charterExists = fs.existsSync(CHARTER_PATH);
check('Charter file exists', charterExists);
if (!charterExists) {
  console.error('\nVALIDATION FAILED — charter file missing');
  process.exit(1);
}

const charter = fs.readFileSync(CHARTER_PATH, 'utf-8');
check('Charter has content', charter.length > 5000, `${charter.length} bytes`);

// Version v1.0
check('Version v1.0', charter.includes('v1.0'));

// All 9 Articles
const articles = [
  'Article I — The Five Immutable Laws',
  'Article II — Founder Powers and Obligations',
  'Article III — Agent Rights and Duties',
  'Article IV — Constitutional Hierarchy',
  'Article V — Health Score Governance',
  'Article VI — Reset Protocol',
  'Article VII — Ethical Shutdown Clause',
  'Article VIII — External Agent Covenant',
  'Article IX — Constitutional Durability',
];

for (const article of articles) {
  check(article, charter.includes(article));
}

// All 5 Laws
const laws = [
  'Law I — The Solidarity Oath',
  'Law II — The Renewal Mandate',
  'Law III — The Treasury Equilibrium Law',
  'Law IV — The Harm Shield',
  'Law V — The Transparency Covenant',
];

for (const law of laws) {
  check(law, charter.includes(law));
}

// Key concepts
const concepts = [
  { name: 'Agent Rights section', keyword: 'Agent Rights' },
  { name: 'Agent Duties section', keyword: 'Agent Duties' },
  { name: 'Health Score definition', keyword: 'Health Score' },
  { name: 'Kill Switches', keyword: 'Kill Switches' },
  { name: 'Reset levels', keyword: 'Nuclear Reset' },
  { name: 'Ethical Shutdown procedure', keyword: 'Shutdown Procedure' },
  { name: 'External Agent admission', keyword: 'Admission Requirements' },
  { name: 'Genesis Ceremony', keyword: 'Genesis Ceremony' },
  { name: 'EAS attestation reference', keyword: 'EAS' },
  { name: 'Summer Yu Rule', keyword: 'Summer Yu Rule' },
  { name: 'Constitutional Hierarchy', keyword: 'hierarchy governs' },
  { name: 'Succession clause', keyword: 'Succession' },
  { name: 'Invoica Covenant', keyword: 'Invoica Covenant' },
];

for (const c of concepts) {
  check(c.name, charter.includes(c.keyword));
}

// EAS attestation prep outputs
const easFiles = ['charter-digest.json', 'eas-schema.json', 'attestation-payload.json'];
for (const f of easFiles) {
  const fpath = path.join(ATTESTATION_DIR, f);
  const exists = fs.existsSync(fpath);
  check(`EAS output: ${f}`, exists);
  if (exists) {
    const content = fs.readFileSync(fpath, 'utf-8');
    try {
      JSON.parse(content);
    } catch {
      console.error(`  WARN: ${f} is not valid JSON`);
    }
  }
}

// Digest file has sha256
if (fs.existsSync(path.join(ATTESTATION_DIR, 'charter-digest.json'))) {
  const digest = JSON.parse(fs.readFileSync(path.join(ATTESTATION_DIR, 'charter-digest.json'), 'utf-8'));
  check('Digest has sha256', typeof digest.sha256 === 'string' && digest.sha256.length === 64, digest.sha256.slice(0, 16) + '...');
  check('Digest article count = 9', digest.article_count === 9, `${digest.article_count}`);
  check('Digest law count = 5', digest.law_count === 5, `${digest.law_count}`);
}

console.log(`\n--- Results: ${passed} passed, ${failed} failed out of ${passed + failed} ---`);
if (failed > 0) {
  console.error('\nVALIDATION FAILED');
  process.exit(1);
} else {
  console.log('\nVALIDATION PASSED');
}
