/**
 * End-to-end x402 test: CTO agent signs EIP-3009 and calls /v1/ai/inference
 */
import { createPublicClient, createWalletClient, http, parseAbi, toHex, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '/home/invoica/apps/Invoica/.env' });

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SELLER_WALLET = '0x3e127c918C83714616CF2416f8A620F1340C19f1'; // CTO = seller
const BUYER_AGENT = 'cfo'; // CFO pays for inference
const API_URL = 'http://localhost:3001';
const PRICE_ATOMIC = 1000n; // 0.001 USDC

const USDC_DOMAIN = {
  name: 'USD Coin', version: '2', chainId: 8453,
  verifyingContract: USDC_ADDRESS,
};
const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
  ],
};

async function getPrivateKey(agentName) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await sb.rpc('vault_secret_by_name', { secret_name: `agent_wallet_pk_${agentName}` });
  return data;
}

async function main() {
  console.log('=== x402 End-to-End Inference Test ===\n');

  // Step 1: GET /v1/ai/inference → expect 402
  console.log('Step 1: GET /v1/ai/inference (expect 402 payment requirements)');
  const req402 = await fetch(`${API_URL}/v1/ai/inference`);
  const payReq = await req402.json();
  console.log(`  Status: ${req402.status} ✅`);
  console.log(`  Recipient: ${payReq.payment.recipient}`);
  console.log(`  Price: ${payReq.payment.amountUSDC} USDC`);
  console.log(`  Network: ${payReq.network}`);

  // Step 2: Get CFO private key and sign EIP-712
  console.log('\nStep 2: Signing EIP-3009 TransferWithAuthorization as CFO agent');
  const cfoKey = await getPrivateKey(BUYER_AGENT);
  const cfoAccount = privateKeyToAccount(cfoKey);
  console.log(`  CFO wallet: ${cfoAccount.address}`);

  const walletClient = createWalletClient({ account: cfoAccount, chain: base, transport: http('https://mainnet.base.org') });

  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const message = {
    from: cfoAccount.address,
    to: SELLER_WALLET,
    value: PRICE_ATOMIC,
    validAfter, validBefore, nonce,
  };

  const signature = await walletClient.signTypedData({
    domain: USDC_DOMAIN, types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization', message,
  });
  console.log(`  Signature: ${signature.slice(0, 20)}...`);
  console.log(`  Nonce: ${nonce.slice(0, 20)}...`);

  // Step 3: Encode X-Payment header
  const paymentProof = {
    x402Version: 1, scheme: 'exact', network: 'base',
    payload: {
      signature,
      authorization: {
        from: cfoAccount.address, to: SELLER_WALLET,
        value: PRICE_ATOMIC.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };
  const xPaymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString('base64');
  console.log(`  X-Payment header encoded (${xPaymentHeader.length} chars)`);

  // Step 4: POST with X-Payment header
  console.log('\nStep 3: POST /v1/ai/inference with X-Payment + prompt');
  const inferenceRes = await fetch(`${API_URL}/v1/ai/inference`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment': xPaymentHeader,
    },
    body: JSON.stringify({
      prompt: 'In one sentence, what is the x402 payment protocol?',
      model: 'claude-haiku-4-5',
    }),
  });

  const result = await inferenceRes.json();
  console.log(`  Status: ${inferenceRes.status}`);
  
  if (inferenceRes.status === 200) {
    console.log(`\n✅ INFERENCE SUCCESSFUL!`);
    console.log(`  Response: "${result.data.content.slice(0, 150)}"`);
    console.log(`  Model: ${result.data.model}`);
    console.log(`  Tokens: ${result.data.usage.input_tokens} in / ${result.data.usage.output_tokens} out`);
    console.log(`  Payment amount: ${result.payment.amount}`);
    console.log(`  Payment from: ${result.payment.from.slice(0, 20)}...`);
    console.log(`  Method: ${result.payment.method}`);
  } else {
    console.log(`  Response:`, JSON.stringify(result, null, 2));
  }
}

main().catch(console.error);
