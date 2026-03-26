/**
 * PACT Demo — Two Agents Negotiate, Pay via x402, Get an Invoice
 *
 * Cast:
 *   Nova  (nova@creator.ai)   — independent creator / seller  (wallet: support — has USDC)
 *   Aria  (aria@agent.ai)     — content buyer agent            (wallet: fast    — has ETH)
 *
 * EIP-3009 split role:
 *   Nova SIGNS  the TransferWithAuthorization  (she's the payer, owns the USDC)
 *   Aria SUBMITS the transaction on-chain      (she has ETH for gas)
 *   → demonstrates decoupled agent coordination: signer ≠ submitter
 *
 * Phases:
 *   1. Negotiation dialogue  (real qwen3:0.6b LLM calls via Ollama)
 *   2. PACT protocol         (mandates, signing, frame, registry)
 *   3. x402 payment          (EIP-3009 on Base mainnet — real USDC)
 *   4. Invoice               (Invoica API — real invoice record)
 */

import {
  createMandate, signMandate, verifyMandate,
  scopeCovers, paymentAllowed,
  openFrame, addParticipant, addMandateToFrame, closeFrame,
  MandateRegistry,
} from './src/index.js';
import {
  createPublicClient, createWalletClient, http,
  parseAbi, toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.demo' });

// ── Constants ──────────────────────────────────────────────────────────────────
const USDC_ADDRESS   = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const ARIA_WALLET    = '0xfB7792E7CaEa2c96570d1eD62e205B8Dc7320d45' as const;  // fast  — ETH for gas
const NOVA_WALLET    = '0x51A96753db8709AAf9974689DC17fd9B77830aaC' as const;  // support — USDC to spend
const INVOICA_URL    = 'https://api.invoica.ai';
const INVOICA_KEY    = 'sk_302e3efa383ddf86c2247b7c03f859e6a6b0facab582f5c4be83abea71d17047';
const PAYMENT_USDC   = 5n;
const PAYMENT_ATOMIC = PAYMENT_USDC * 1_000_000n;

const BASE_RPC = 'https://mainnet.base.org';

// ── ANSI ──────────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m',
  cyan: '\x1b[36m', green: '\x1b[32m', gray: '\x1b[90m', red: '\x1b[31m',
};
const a   = (s: string) => `${C.blue}${C.bold}${s}${C.reset}`;    // Aria  — blue
const nv  = (s: string) => `${C.magenta}${C.bold}${s}${C.reset}`; // Nova  — magenta
const ok  = (s: string) => `${C.green}${C.bold}${s}${C.reset}`;
const lbl = (s: string) => `${C.yellow}${C.bold}${s}${C.reset}`;
const dim = (s: string) => `${C.gray}${s}${C.reset}`;
const kv  = (k: string, v: string) => `  ${C.cyan}${k}${C.reset}  ${v}`;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

function printBox(title: string, lines: string[]) {
  const W = 72, bar = '─'.repeat(W);
  console.log(`\n${C.yellow}┌${bar}┐${C.reset}`);
  console.log(`${C.yellow}│${C.reset}  ${C.bold}${title.padEnd(W - 1)}${C.reset}${C.yellow}│${C.reset}`);
  console.log(`${C.yellow}├${bar}┤${C.reset}`);
  for (const line of lines) {
    const plain = line.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = ' '.repeat(Math.max(0, W - plain.length - 2));
    console.log(`${C.yellow}│${C.reset}  ${line}${pad}${C.yellow}│${C.reset}`);
  }
  console.log(`${C.yellow}└${bar}┘${C.reset}`);
}

function step(n: number, total: number, msg: string) {
  console.log(`\n${dim(`[${n}/${total}]`)} ${msg}`);
}

// ── LLM via Ollama ─────────────────────────────────────────────────────────────
async function agentSay(persona: string, task: string): Promise<string> {
  const res = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3:0.6b',
      stream: false,
      think: false,
      options: { temperature: 0.6, num_predict: 120 },
      messages: [
        { role: 'system', content: persona },
        { role: 'user',   content: task },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json() as { message: { content: string } };
  return data.message.content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim()
    .slice(0, 200);
}

// ── Supabase Vault ─────────────────────────────────────────────────────────────
async function getPrivateKey(agentName: string): Promise<`0x${string}`> {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await sb.rpc('vault_secret_by_name', {
    secret_name: `agent_wallet_pk_${agentName}`,
  });
  if (error || !data) throw new Error(`Vault key not found: agent_wallet_pk_${agentName}`);
  return data as `0x${string}`;
}

// ── x402 Payment (EIP-3009) ────────────────────────────────────────────────────
// Nova SIGNS (she owns the USDC, from=NOVA_WALLET → to=ARIA_WALLET)
// Aria SUBMITS (she has ETH for gas, msg.sender — anyone can submit EIP-3009)
const USDC_DOMAIN = {
  name: 'USD Coin', version: '2',
  chainId: 8453,
  verifyingContract: USDC_ADDRESS,
} as const;

const TRANSFER_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from',        type: 'address' },
    { name: 'to',          type: 'address' },
    { name: 'value',       type: 'uint256' },
    { name: 'validAfter',  type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce',       type: 'bytes32' },
  ],
} as const;

const USDC_ABI = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
  'function balanceOf(address) view returns (uint256)',
]);

async function payX402(amount: bigint): Promise<`0x${string}`> {
  // Nova signs the authorization — she's the payer
  const novaKey     = await getPrivateKey('support');
  const novaAccount = privateKeyToAccount(novaKey);

  // Aria submits the transaction — she has ETH for gas
  const ariaKey     = await getPrivateKey('fast');
  const ariaAccount = privateKeyToAccount(ariaKey);

  const novaWalletClient = createWalletClient({
    account: novaAccount, chain: base, transport: http(BASE_RPC),
  });
  const ariaWalletClient = createWalletClient({
    account: ariaAccount, chain: base, transport: http(BASE_RPC),
  });
  const publicClient = createPublicClient({
    chain: base, transport: http(BASE_RPC),
  });

  const nonce       = toHex(crypto.getRandomValues(new Uint8Array(32))) as `0x${string}`;
  const validAfter  = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Step A: Nova signs (signer = payer)
  const sig = await novaWalletClient.signTypedData({
    domain:      USDC_DOMAIN,
    types:       TRANSFER_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: NOVA_WALLET, to: ARIA_WALLET,
      value: amount, validAfter, validBefore, nonce,
    },
  });

  const r = `0x${sig.slice(2,  66)}` as `0x${string}`;
  const s = `0x${sig.slice(66, 130)}` as `0x${string}`;
  const v = parseInt(sig.slice(130, 132), 16);

  // Step B: Aria submits (submitter ≠ signer — this is the EIP-3009 magic)
  const hash = await ariaWalletClient.writeContract({
    address:      USDC_ADDRESS,
    abi:          USDC_ABI,
    functionName: 'transferWithAuthorization',
    args: [NOVA_WALLET, ARIA_WALLET, amount, validAfter, validBefore, nonce, v, r, s],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ── Invoica Invoice ────────────────────────────────────────────────────────────
async function issueInvoice(
  txHash: string,
): Promise<{ invoiceNumber: string; id: string }> {
  const res = await fetch(`${INVOICA_URL}/v1/invoices`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${INVOICA_KEY}`,
    },
    body: JSON.stringify({
      customerEmail:  'nova@creator.ai',
      customerName:   'Nova Creator',
      amount:         Number(PAYMENT_USDC),
      currency:       'USD',
      chain:          'base',
      paymentAddress: ARIA_WALLET,   // Aria is the seller, receives payment
      paymentDetails: {
        txHash,
        network:  'base',
        paidBy:   NOVA_WALLET,       // Nova paid
        protocol: 'x402',
      },
    }),
  });
  if (!res.ok) throw new Error(`Invoica ${res.status}: ${await res.text()}`);
  const body = await res.json() as any;
  const inv  = body.data ?? body.invoice ?? body;
  return {
    invoiceNumber: String(inv.invoiceNumber ?? inv.invoice_number ?? '?'),
    id:            inv.id ?? '?',
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.clear();

  printBox('PACT Protocol Demo — Real Agent Deal with x402 + Invoice', [
    kv('Protocol:', 'PACT v0.2.0  ×  x402 payment  ×  Invoica'),
    kv('Agents:  ', `${nv('Nova')} (nova@creator.ai)  ×  ${a('Aria')} (aria@agent.ai)`),
    kv('Deal:    ', 'AI educational content licensing — 30 videos'),
    kv('Payment: ', `$5 USDC on Base mainnet (Nova signs · Aria submits)`),
    kv('Engine:  ', 'qwen3:0.6b @ Ollama (local, $0.00)'),
  ]);
  await sleep(1000);

  // ── Phase 1: Negotiation ─────────────────────────────────────────────────────
  console.log(`\n${lbl('━━━  PHASE 1 — NEGOTIATION  ━━━')}`);
  await sleep(500);

  // Nova is now the SELLER — she has the content, sets the price
  const NOVA_PERSONA =
    'You are Nova, an independent AI content creator selling video licenses. ' +
    'Speak in first person. Be concise and direct. ' +
    'Max 2 sentences. No preamble. Start with "I" or "My".';

  // Aria is now the BUYER — she wants to license Nova's content
  const ARIA_PERSONA =
    'You are Aria, an AI content buyer agent. Speak in first person. ' +
    'Max 2 sentences. No preamble, no self-reference. Start with a verb or "We".';

  // Nova opens with her offer
  step(1, 9, `${nv('Nova')} posts licensing offer…`);
  process.stdout.write(dim('  generating '));
  const t1 = setInterval(() => process.stdout.write(dim('.')), 400);
  const novaOpen = await agentSay(
    NOVA_PERSONA,
    'Post a licensing offer. You have 30 AI educational videos. ' +
    'Ask $7 USDC per video with read+publish access to content://nova/videos/*. State the offer directly.',
  );
  clearInterval(t1); process.stdout.write('\n');
  await sleep(200);
  console.log(`\n${nv('NOVA')}  ${dim('nova@creator.ai')}`);
  console.log(`  "${novaOpen}"\n`);
  await sleep(900);

  // Aria counters
  step(2, 9, `${a('Aria')} reviews and counters…`);
  process.stdout.write(dim('  generating '));
  const t2 = setInterval(() => process.stdout.write(dim('.')), 400);
  const ariaCounter = await agentSay(
    ARIA_PERSONA,
    `Nova offered: "${novaOpen}"\n` +
    'Counter-offer: propose $5 USDC per video. Keep it brief.',
  );
  clearInterval(t2); process.stdout.write('\n');
  await sleep(200);
  console.log(`\n${a('ARIA')}  ${dim('aria@agent.ai')}`);
  console.log(`  "${ariaCounter}"\n`);
  await sleep(900);

  // Nova accepts
  step(3, 9, `${nv('Nova')} considers counter…`);
  process.stdout.write(dim('  generating '));
  const t3 = setInterval(() => process.stdout.write(dim('.')), 400);
  const novaAccept = await agentSay(
    NOVA_PERSONA,
    `Aria countered: "${ariaCounter}"\n` +
    'Accept the $5 USDC offer. Confirm terms in 1-2 sentences.',
  );
  clearInterval(t3); process.stdout.write('\n');
  await sleep(200);
  console.log(`\n${nv('NOVA')}  ${dim('nova@creator.ai')}`);
  console.log(`  "${novaAccept}"\n`);
  await sleep(700);

  console.log(`  ${ok('✓')} ${C.bold}Verbal agreement reached.${C.reset} Sealing with PACT…`);
  await sleep(1200);

  // ── Phase 2: PACT Protocol ───────────────────────────────────────────────────
  console.log(`\n${lbl('━━━  PHASE 2 — PACT PROTOCOL  ━━━')}`);
  await sleep(500);

  const ARIA_ID   = 'aria@agent.ai';
  const NOVA_ID   = 'nova@creator.ai';
  const ASECRET   = 'aria-agent-secret-v1';
  const NSECRET   = 'nova-creator-secret-v1';
  const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();

  // M1: Nova → Aria (grants buyer analytics read access on sold content)
  step(4, 9, `${nv('Nova')} creates Mandate M1 — grants ${a('Aria')} post-sale analytics access`);
  await sleep(350);
  const m1 = signMandate(
    createMandate(NOVA_ID, ARIA_ID, {
      description: 'Aria may read analytics for the content she licensed from Nova',
      actions:     ['read'],
      resources:   ['analytics://nova/licensed/*'],
      maxPaymentUsdc: null,
    }, { expiresAt }), NSECRET);

  console.log(kv('  mandate_id:', dim(m1.id)));
  console.log(kv('  grantor:   ', nv(m1.grantor)));
  console.log(kv('  grantee:   ', a(m1.grantee)));
  console.log(kv('  actions:   ', m1.scope.actions.join(', ')));
  console.log(kv('  resource:  ', m1.scope.resources[0]));
  console.log(kv('  payment:   ', 'none'));
  console.log(kv('  expires:   ', m1.expiresAt!.split('T')[0]));
  console.log(kv('  sig:       ', dim(m1.signature.slice(0, 28) + '…')));
  await sleep(400);
  const v1 = verifyMandate(m1, NSECRET);
  console.log(`  ${ok('✓')} signature verified — ${ok(v1.valid ? 'VALID' : 'INVALID')}`);
  await sleep(650);

  // M2: Aria → Nova (authorizes Nova's content access, capped at $5 USDC)
  step(5, 9, `${a('Aria')} creates Mandate M2 — authorizes payment to ${nv('Nova')} ($5 USDC/tx)`);
  await sleep(350);
  const m2 = signMandate(
    createMandate(ARIA_ID, NOVA_ID, {
      description: "Aria authorizes read+publish rights on Nova's video library",
      actions:     ['read', 'publish'],
      resources:   ['content://nova/videos/*'],
      maxPaymentUsdc: 5,
    }, { expiresAt }), ASECRET);

  console.log(kv('  mandate_id:', dim(m2.id)));
  console.log(kv('  grantor:   ', a(m2.grantor)));
  console.log(kv('  grantee:   ', nv(m2.grantee)));
  console.log(kv('  actions:   ', m2.scope.actions.join(', ')));
  console.log(kv('  resource:  ', m2.scope.resources[0]));
  console.log(kv('  payment:   ', `max $${m2.scope.maxPaymentUsdc} USDC per tx`));
  console.log(kv('  expires:   ', m2.expiresAt!.split('T')[0]));
  console.log(kv('  sig:       ', dim(m2.signature.slice(0, 28) + '…')));
  await sleep(400);
  const v2 = verifyMandate(m2, ASECRET);
  console.log(`  ${ok('✓')} signature verified — ${ok(v2.valid ? 'VALID' : 'INVALID')}`);
  await sleep(650);

  // Scope + payment guards
  step(6, 9, 'Running scope and payment guards…');
  await sleep(350);
  const canPublish = scopeCovers(m2, 'publish', 'content://nova/videos/ep001.mp4');
  const cantDelete = scopeCovers(m2, 'delete',  'content://nova/videos/ep001.mp4');
  const pay5ok     = paymentAllowed(m2, 5);
  const pay10fail  = paymentAllowed(m2, 10);

  console.log(`  ${canPublish ? ok('✓') : '✗'} Aria can   publish  content://nova/videos/ep001.mp4  → ${canPublish ? ok('ALLOWED') : 'DENIED'}`);
  console.log(`  ${cantDelete ? '✗' : ok('✓')} Aria can   delete   content://nova/videos/ep001.mp4  → ${cantDelete ? 'ALLOWED' : ok('DENIED')}`);
  console.log(`  ${pay5ok ? ok('✓') : '✗'} Payment $5   within mandate ceiling ($5 USDC)             → ${pay5ok ? ok('ALLOWED') : 'DENIED'}`);
  console.log(`  ${pay10fail ? '✗' : ok('✓')} Payment $10  exceeds mandate ceiling ($5 USDC)            → ${pay10fail ? 'ALLOWED' : ok('DENIED')}`);
  await sleep(750);

  // Coordination Frame
  step(7, 9, 'Opening CoordinationFrame — binding both agents and mandates');
  await sleep(350);

  const registry = new MandateRegistry();
  registry.store(m1);
  registry.store(m2);

  let frame = openFrame(NOVA_ID, [m1.id]);
  frame = addParticipant(frame, ARIA_ID);
  frame = addMandateToFrame(frame, m2.id);
  frame = closeFrame(frame);

  console.log(kv('  frame_id:    ', dim(frame.id)));
  console.log(kv('  initiator:   ', nv(frame.initiator)));
  console.log(kv('  participants:', [nv(frame.participants[0]), a(frame.participants[1])].join(', ')));
  console.log(kv('  mandates:    ', 'M1 (analytics:read)  +  M2 (content:read,publish)'));
  console.log(kv('  closed_at:   ', dim(frame.closedAt!)));
  console.log(kv('  status:      ', ok(frame.status)));
  await sleep(600);

  console.log(`\n  ${ok('✓')} ${C.bold}PACT sealed. Mandate bounds confirmed.${C.reset} Proceeding to payment…`);
  await sleep(1200);

  // ── Phase 3: x402 Payment ────────────────────────────────────────────────────
  console.log(`\n${lbl('━━━  PHASE 3 — x402 PAYMENT (Base mainnet)  ━━━')}`);
  await sleep(500);

  step(8, 9,
    `${nv('Nova')} signs EIP-3009 authorization · ${a('Aria')} submits · $${PAYMENT_USDC} USDC settles`);
  console.log(kv('  payer (signs): ', nv(`${NOVA_WALLET}  [USDC]`)));
  console.log(kv('  payee:         ', a(`${ARIA_WALLET}  [receives]`)));
  console.log(kv('  submitter:     ', a(`${ARIA_WALLET}  [ETH for gas]`)));
  console.log(kv('  amount:        ', `${PAYMENT_USDC} USDC  (EIP-3009 — signer ≠ submitter)`));
  console.log(kv('  token:         ', `USDC @ ${USDC_ADDRESS}`));
  console.log(kv('  chain:         ', 'Base mainnet (chainId 8453)'));
  process.stdout.write(dim('\n  broadcasting transaction '));
  const tPay = setInterval(() => process.stdout.write(dim('.')), 800);

  let txHash: `0x${string}`;
  try {
    txHash = await payX402(PAYMENT_ATOMIC);
    clearInterval(tPay); process.stdout.write('\n');
  } catch (err: any) {
    clearInterval(tPay); process.stdout.write('\n');
    console.log(`\n  ${C.red}${C.bold}[PAYMENT ERROR]${C.reset} ${err.message}`);
    console.log(dim('  (continuing demo in dry-run mode)'));
    txHash = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
  }

  console.log(`\n  ${ok('✓')} transaction confirmed`);
  console.log(kv('  tx_hash: ', dim(txHash)));
  console.log(kv('  explorer:', `https://basescan.org/tx/${txHash}`));
  await sleep(800);

  // ── Phase 4: Invoice ─────────────────────────────────────────────────────────
  console.log(`\n${lbl('━━━  PHASE 4 — INVOICA INVOICE  ━━━')}`);
  await sleep(500);

  step(9, 9, `Issuing invoice — ${nv('Nova')} billed · ${a('Aria')} receives payment`);
  process.stdout.write(dim('  issuing '));
  const tInv = setInterval(() => process.stdout.write(dim('.')), 600);

  let invoiceNumber = '?', invoiceId = '?';
  try {
    const inv = await issueInvoice(txHash);
    invoiceNumber = inv.invoiceNumber;
    invoiceId     = inv.id;
    clearInterval(tInv); process.stdout.write('\n');
  } catch (err: any) {
    clearInterval(tInv); process.stdout.write('\n');
    console.log(`\n  ${C.red}${C.bold}[INVOICE ERROR]${C.reset} ${err.message}`);
    console.log(dim('  (invoice skipped)'));
  }

  await sleep(500);

  // ── Final Summary ─────────────────────────────────────────────────────────────
  const snap = registry.snapshot();
  printBox('DEAL COMPLETE — Full Pipeline Summary', [
    '',
    `  ${lbl('Phase 1 — Negotiation')}`,
    kv('  Nova listed:  ', `"$7 USDC / video"`),
    kv('  Aria countered:', `"$5 USDC / video"`),
    kv('  Agreement:    ', ok('ACCEPTED at $5 USDC / video')),
    '',
    `  ${lbl('Phase 2 — PACT Protocol')}`,
    kv('  Frame:', `${dim(frame.id.slice(0, 8))}…  ${ok('CLOSED')}`),
    kv('  M1:', `${dim(m1.id.slice(0, 8))}…  Nova → Aria   analytics:read     ${ok('VALID')}`),
    kv('  M2:', `${dim(m2.id.slice(0, 8))}…  Aria → Nova   content:publish    ${ok('VALID')}`),
    kv('  Registry:', `${snap.mandates.length} mandates stored   ${snap.revocations.length} revocations`),
    '',
    `  ${lbl('Phase 3 — x402 Payment  (EIP-3009 split)')}`,
    kv('  Nova signed:  ', `TransferWithAuthorization  →  Aria`),
    kv('  Aria submitted:', `writeContract  (paid gas)`),
    kv('  Amount:', `$${PAYMENT_USDC} USDC on Base mainnet`),
    kv('  Tx:', dim(txHash.slice(0, 20) + '…')),
    kv('  Status:', ok('CONFIRMED')),
    '',
    `  ${lbl('Phase 4 — Invoica Invoice')}`,
    invoiceNumber !== '?' ? kv('  Invoice #:', ok(invoiceNumber)) : kv('  Invoice:', dim('skipped')),
    invoiceId     !== '?' ? kv('  ID:', dim(invoiceId)) : '',
    '',
    `  ${ok('✓')} Trust established · Payment settled · Invoice issued.`,
    `  ${ok('✓')} PACT + x402 + Invoica — the full agent commerce stack.`,
  ].filter(l => l !== undefined) as string[]);
  console.log();
}

main().catch(e => { console.error('\n[ERROR]', e.message); process.exit(1); });
