#!/usr/bin/env npx ts-node
/**
 * prepare-charter-attestation.ts — Founding Charter EAS Attestation Prep
 * Sprint 659: Prepares the charter for on-chain commitment at Genesis Ceremony.
 *
 * What this does:
 * 1. Reads FOUNDING_CHARTER.md
 * 2. Computes SHA-256 hash (the Charter Digest)
 * 3. Generates the EAS attestation data structure
 * 4. Outputs a ready-to-sign attestation JSON
 *
 * This does NOT submit the transaction — that requires the founder's wallet.
 * At Genesis, run this script, review the output, then use the EAS SDK to attest.
 *
 * Usage:
 *   npx ts-node scripts/chain/prepare-charter-attestation.ts
 *   npx ts-node scripts/chain/prepare-charter-attestation.ts --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const ROOT = path.resolve(__dirname, '../..');
const CHARTER_PATH = path.join(ROOT, 'workspace', 'shared-context', 'FOUNDING_CHARTER.md');
const EAS_SCHEMAS_PATH = path.join(ROOT, 'workspace', 'shared-context', 'EAS_SCHEMAS.json');
const OUTPUT_DIR = path.join(ROOT, 'workspace', 'chain');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'charter-attestation-prep.json');

// Base mainnet EAS contract
const BASE_CHAIN_ID = 8453;
const EAS_CONTRACT = '0xC2679fBD37d54388Ce493F1DB75320D236e1815e'; // Base EAS

// Charter attestation schema (to be registered on EAS before Genesis)
const CHARTER_SCHEMA = {
  fields: 'bytes32 charterHash,string charterVersion,uint256 articleCount,uint256 immutableLawCount,uint256 timestamp,string ipfsHash',
  description: 'Kognai Founding Charter — immutable after Genesis Ceremony. charterHash is SHA-256 of the full charter text.',
  revocable: false, // Charter attestations cannot be revoked
};

function main(): void {
  console.log('=== Kognai Founding Charter — Attestation Preparation ===\n');

  // 1. Read charter
  if (!fs.existsSync(CHARTER_PATH)) {
    console.error(`ERROR: Charter not found at ${CHARTER_PATH}`);
    process.exit(1);
  }
  const charterText = fs.readFileSync(CHARTER_PATH, 'utf-8');
  console.log(`Charter loaded: ${charterText.length} chars, ${charterText.split('\n').length} lines`);

  // 2. Compute SHA-256 hash
  const charterHash = crypto.createHash('sha256').update(charterText, 'utf-8').digest('hex');
  const charterHashBytes32 = '0x' + charterHash;
  console.log(`Charter Digest (SHA-256): ${charterHashBytes32}`);

  // 3. Extract charter metadata
  const articleCount = (charterText.match(/^## Article/gm) || []).length;
  const lawCount = (charterText.match(/^### Law/gm) || []).length;
  const versionMatch = charterText.match(/v(\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : '1.0';

  console.log(`Articles: ${articleCount}, Immutable Laws: ${lawCount}, Version: v${version}`);

  // 4. Check charter status
  const isDraft = charterText.includes('DRAFT');
  if (isDraft) {
    console.log('\n⚠️  WARNING: Charter is still in DRAFT status.');
    console.log('   Genesis Ceremony requires FINAL status.');
    console.log('   This preparation is valid but the attestation should wait until the charter is finalised.\n');
  }

  // 5. Read existing EAS schemas
  let easSchemas: any = {};
  if (fs.existsSync(EAS_SCHEMAS_PATH)) {
    easSchemas = JSON.parse(fs.readFileSync(EAS_SCHEMAS_PATH, 'utf-8'));
  }

  // 6. Build attestation data
  const attestationData = {
    schema: CHARTER_SCHEMA,
    values: {
      charterHash: charterHashBytes32,
      charterVersion: `v${version}`,
      articleCount,
      immutableLawCount: lawCount,
      timestamp: Math.floor(Date.now() / 1000),
      ipfsHash: '', // To be filled after IPFS upload of full charter text
    },
    metadata: {
      network: 'base',
      chainId: BASE_CHAIN_ID,
      easContract: EAS_CONTRACT,
      existingSchemas: easSchemas.schemas ? Object.keys(easSchemas.schemas) : [],
      charterPath: 'workspace/shared-context/FOUNDING_CHARTER.md',
      charterLengthChars: charterText.length,
      charterLengthLines: charterText.split('\n').length,
      charterStatus: isDraft ? 'DRAFT' : 'FINAL',
      preparedAt: new Date().toISOString(),
    },
    genesisChecklist: {
      '1_finalise_charter': isDraft ? 'PENDING — change status from DRAFT to FINAL' : 'DONE',
      '2_upload_to_ipfs': 'PENDING — upload full charter text to IPFS, record CID',
      '3_register_eas_schema': 'PENDING — register charter schema on Base EAS',
      '4_create_attestation': 'PENDING — sign attestation with founder wallet',
      '5_record_attestation_uid': 'PENDING — save EAS attestation UID to EAS_SCHEMAS.json',
      '6_commit_to_repo': 'PENDING — commit attestation record to git',
    },
  };

  // 7. Write output
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(attestationData, null, 2));
  console.log(`\nAttestation preparation saved to: ${OUTPUT_PATH}`);

  // 8. Summary
  console.log('\n=== Genesis Ceremony Checklist ===');
  for (const [step, status] of Object.entries(attestationData.genesisChecklist)) {
    const label = step.replace(/_/g, ' ').replace(/^\d /, '');
    console.log(`  ${status === 'DONE' ? '✅' : '⏳'} ${label}: ${status}`);
  }

  console.log('\n=== EAS Attestation Code (for Genesis) ===');
  console.log(`
// Install: npm install @ethereum-attestation-service/eas-sdk ethers
// import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
// import { ethers } from 'ethers';
//
// const eas = new EAS('${EAS_CONTRACT}');
// const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
// const signer = new ethers.Wallet(process.env.X402_WALLET_KEY!, provider);
// eas.connect(signer);
//
// const schemaEncoder = new SchemaEncoder('${CHARTER_SCHEMA.fields}');
// const encodedData = schemaEncoder.encodeData([
//   { name: 'charterHash', value: '${charterHashBytes32}', type: 'bytes32' },
//   { name: 'charterVersion', value: 'v${version}', type: 'string' },
//   { name: 'articleCount', value: ${articleCount}, type: 'uint256' },
//   { name: 'immutableLawCount', value: ${lawCount}, type: 'uint256' },
//   { name: 'timestamp', value: Math.floor(Date.now() / 1000), type: 'uint256' },
//   { name: 'ipfsHash', value: '<IPFS_CID>', type: 'string' },
// ]);
//
// const tx = await eas.attest({
//   schema: '<SCHEMA_UID_AFTER_REGISTRATION>',
//   data: { recipient: '0x0...0', expirationTime: 0n, revocable: false, data: encodedData },
// });
// console.log('Attestation UID:', tx);
`);

  console.log('\n✅ PASS — Charter attestation preparation complete');
}

main();
