/**
 * Prepare Founding Charter for EAS (Ethereum Attestation Service) on Base
 *
 * Produces:
 * 1. SHA-256 digest of the charter text
 * 2. EAS schema definition (charter version, digest, article count)
 * 3. Attestation payload JSON ready for submission
 *
 * Usage: npx ts-node scripts/charter/prepare-eas-attestation.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const CHARTER_PATH = path.resolve(__dirname, '../../workspace/shared-context/FOUNDING_CHARTER.md');
const OUTPUT_DIR = path.resolve(__dirname, '../../workspace/charter-attestation');

// Read charter
const charterText = fs.readFileSync(CHARTER_PATH, 'utf-8');

// Compute SHA-256 digest
const digest = crypto.createHash('sha256').update(charterText, 'utf-8').digest('hex');

// Extract metadata
const versionMatch = charterText.match(/\| v([\d.]+) \|/);
const version = versionMatch ? versionMatch[1] : '1.0';

const articleCount = (charterText.match(/^## Article/gm) || []).length;
const lawCount = (charterText.match(/^### Law/gm) || []).length;
const dateMatch = charterText.match(/Updated: (\d{4}-\d{2}-\d{2})/);
const updatedDate = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

// EAS Schema — defines the attestation structure on Base
const easSchema = {
  name: 'KognaiFoundingCharter',
  description: 'Immutable Founding Charter for the Kognai sovereign AI runtime',
  schema: 'string version, bytes32 charterDigest, uint8 articleCount, uint8 lawCount, string updatedDate',
  revocable: false, // Charter attestation is permanent
};

// Attestation payload
const attestationPayload = {
  schema: easSchema.schema,
  data: {
    version,
    charterDigest: `0x${digest}`,
    articleCount,
    lawCount,
    updatedDate,
  },
  recipient: '0x0000000000000000000000000000000000000000', // self-attestation
  expirationTime: 0, // never expires
  revocable: false,
  refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

// Write outputs
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

fs.writeFileSync(
  path.join(OUTPUT_DIR, 'charter-digest.json'),
  JSON.stringify(
    {
      charter_path: 'workspace/shared-context/FOUNDING_CHARTER.md',
      sha256: digest,
      version,
      article_count: articleCount,
      law_count: lawCount,
      updated: updatedDate,
      computed_at: new Date().toISOString(),
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(OUTPUT_DIR, 'eas-schema.json'),
  JSON.stringify(easSchema, null, 2)
);

fs.writeFileSync(
  path.join(OUTPUT_DIR, 'attestation-payload.json'),
  JSON.stringify(attestationPayload, null, 2)
);

console.log('=== Kognai Founding Charter — EAS Attestation Prep ===');
console.log(`Charter version:  v${version}`);
console.log(`SHA-256 digest:   ${digest}`);
console.log(`Articles:         ${articleCount}`);
console.log(`Immutable Laws:   ${lawCount}`);
console.log(`Last updated:     ${updatedDate}`);
console.log(`\nOutputs written to: ${OUTPUT_DIR}/`);
console.log('  - charter-digest.json');
console.log('  - eas-schema.json');
console.log('  - attestation-payload.json');
console.log('\nNext step: submit attestation-payload.json to EAS on Base at Genesis Ceremony.');
