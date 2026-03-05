#!/usr/bin/env node
/**
 * sign-payment.js — EIP-3009 TransferWithAuthorization signer for x402 demos
 *
 * Usage (Mac terminal):
 *   PRIVATE_KEY=0xYOUR_PRIVATE_KEY node sign-payment.js
 *
 * Or create a .env file with PRIVATE_KEY= and run:
 *   node -e "require('dotenv').config(); require('./sign-payment.js')"
 *
 * Prerequisites (run once):
 *   npm install viem
 *   # optional: npm install dotenv
 *
 * Output: base64-encoded X-Payment header value to paste into curl call
 */

const { privateKeyToAccount } = require('viem/accounts');
const { createWalletClient, http } = require('viem');
const { base } = require('viem/chains');

// ---------------------------------------------------------------------------
// Config — edit these or set via env vars
// ---------------------------------------------------------------------------
const PRIVATE_KEY   = process.env.PRIVATE_KEY;               // your wallet pk
const SELLER_WALLET = process.env.SELLER_WALLET
  || '0x3e127c918C83714616CF2416f8A620F1340C19f1';          // CTO wallet
const USDC_ADDRESS  = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AMOUNT        = BigInt(3000);                           // 0.003 USDC
const VALID_DURATION = 60 * 5;                               // 5 min window

// ---------------------------------------------------------------------------

if (!PRIVATE_KEY) {
  console.error('\nERROR: Set PRIVATE_KEY env var\n');
  console.error('  PRIVATE_KEY=0x... node sign-payment.js\n');
  process.exit(1);
}

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const validAfter  = BigInt(0);
  const validBefore = now + BigInt(VALID_DURATION);

  // Random nonce (32 bytes) — must be unique per authorization
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = '0x' + Buffer.from(nonceBytes).toString('hex');

  const domain = {
    name: 'USD Coin',
    version: '2',
    chainId: 8453,
    verifyingContract: USDC_ADDRESS,
  };

  const types = {
    TransferWithAuthorization: [
      { name: 'from',        type: 'address' },
      { name: 'to',          type: 'address' },
      { name: 'value',       type: 'uint256' },
      { name: 'validAfter',  type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce',       type: 'bytes32' },
    ],
  };

  const message = {
    from:        account.address,
    to:          SELLER_WALLET,
    value:       AMOUNT,
    validAfter,
    validBefore,
    nonce,
  };

  console.log('\nSigning EIP-3009 TransferWithAuthorization...');
  console.log('  from:  ', account.address);
  console.log('  to:    ', SELLER_WALLET);
  console.log('  amount:', Number(AMOUNT) / 1_000_000, 'USDC');
  console.log('  nonce: ', nonce.slice(0, 14) + '...');

  const signature = await walletClient.signTypedData({ domain, types, primaryType: 'TransferWithAuthorization', message });

  const payload = {
    payload: {
      authorization: {
        from:        message.from,
        to:          message.to,
        value:       message.value.toString(),
        validAfter:  message.validAfter.toString(),
        validBefore: message.validBefore.toString(),
        nonce:       message.nonce,
      },
      signature,
    },
  };

  const xPayment = Buffer.from(JSON.stringify(payload)).toString('base64');

  console.log('\n✅ X-Payment header generated!\n');
  console.log('─'.repeat(60));
  console.log(xPayment);
  console.log('─'.repeat(60));
  console.log('\nRun this curl command:\n');
  console.log(`curl -X POST https://app.invoica.ai/v1/ai/inference \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "X-Payment: ${xPayment}" \\`);
  console.log(`  -d '{"prompt":"What is x402 protocol?","model":"MiniMax-M2.5"}'`);
  console.log('');
}

main().catch(e => { console.error(e.message); process.exit(1); });
