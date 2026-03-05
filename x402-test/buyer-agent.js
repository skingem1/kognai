// buyer-agent.js — BuyerBot-7: Autonomous x402 client on Solana Mainnet
// Flow: request → 402 → send USDC SPL transfer on-chain → retry with X-Payment (signature)
import { config } from "dotenv";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import { readFileSync } from "fs";

config();

const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const SELLER_URL = `http://localhost:${process.env.SERVER_PORT || 4402}`;
const USDC_MINT = new PublicKey(process.env.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// Load buyer keypair
const buyerKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync("buyer-keypair.json", "utf-8")))
);
const BUYER_ADDRESS = buyerKeypair.publicKey.toBase58();

const connection = new Connection(SOLANA_RPC, "confirmed");

console.log(`\n🤖 BuyerBot-7 Starting (Solana Mainnet)...`);
console.log(`   Wallet: ${BUYER_ADDRESS}`);
console.log(`   Network: Solana Mainnet`);
console.log(`   Target: ${SELLER_URL}/v1/ai/inference`);

async function runBuyerAgent() {
  // Step 1: Check balances
  console.log(`\n📊 Step 1: Checking balances...`);

  const solBalance = await connection.getBalance(buyerKeypair.publicKey);
  console.log(`   SOL: ${solBalance / 1e9}`);

  const buyerTokenAccount = await getAssociatedTokenAddress(USDC_MINT, buyerKeypair.publicKey);
  let usdcBalance;
  try {
    const tokenInfo = await getAccount(connection, buyerTokenAccount);
    usdcBalance = tokenInfo.amount;
    console.log(`   USDC: ${Number(usdcBalance) / 1e6}`);
  } catch (e) {
    console.log(`   USDC: 0 (no token account)`);
    process.exit(1);
  }

  if (solBalance < 10000) {
    console.log(`   ❌ Need SOL for transaction fees`);
    process.exit(1);
  }

  if (usdcBalance < 10000n) {
    console.log(`   ❌ Need at least 0.01 USDC`);
    process.exit(1);
  }

  // Step 2: Request resource (expect 402)
  console.log(`\n🌐 Step 2: Requesting /v1/ai/inference (expecting 402)...`);
  const initialResponse = await fetch(`${SELLER_URL}/v1/ai/inference`);

  if (initialResponse.status !== 402) {
    console.log(`   Unexpected status: ${initialResponse.status}`);
    return;
  }

  const paymentReq = await initialResponse.json();
  console.log(`   ✅ Got 402 Payment Required`);
  console.log(`   Price: ${paymentReq.payment.amountUSDC} USDC`);
  console.log(`   Recipient: ${paymentReq.payment.recipient}`);
  console.log(`   Token Account: ${paymentReq.payment.tokenAccount}`);

  // Step 3: Build and send USDC transfer
  console.log(`\n💸 Step 3: Sending ${paymentReq.payment.amountUSDC} USDC to seller on-chain...`);

  const sellerPubkey = new PublicKey(paymentReq.payment.recipient);
  const amount = BigInt(paymentReq.payment.amount);

  // Get or create seller's token account
  let sellerTokenAccount;
  try {
    sellerTokenAccount = await getAssociatedTokenAddress(USDC_MINT, sellerPubkey);
    // Check if it exists
    await getAccount(connection, sellerTokenAccount);
    console.log(`   Seller token account: ${sellerTokenAccount.toBase58()}`);
  } catch (e) {
    // Create it if it doesn't exist
    console.log(`   Creating seller token account...`);
    const result = await getOrCreateAssociatedTokenAccount(
      connection,
      buyerKeypair,
      USDC_MINT,
      sellerPubkey
    );
    sellerTokenAccount = result.address;
    console.log(`   Created: ${sellerTokenAccount.toBase58()}`);
  }

  // Build transfer instruction
  const transferIx = createTransferInstruction(
    buyerTokenAccount,
    sellerTokenAccount,
    buyerKeypair.publicKey,
    amount
  );

  const tx = new Transaction().add(transferIx);

  console.log(`   From: ${BUYER_ADDRESS}`);
  console.log(`   To: ${sellerPubkey.toBase58()}`);
  console.log(`   Amount: ${Number(amount) / 1e6} USDC`);
  console.log(`   Sending transaction...`);

  const signature = await sendAndConfirmTransaction(connection, tx, [buyerKeypair], {
    commitment: "confirmed",
  });

  console.log(`   ✅ Transaction confirmed!`);
  console.log(`   Signature: ${signature}`);
  console.log(`   Explorer: https://solscan.io/tx/${signature}`);

  // Step 4: Encode X-Payment header
  console.log(`\n📦 Step 4: Encoding X-Payment header with on-chain proof...`);

  const paymentProof = {
    x402Version: 1,
    scheme: "exact",
    network: "solana-mainnet",
    payload: {
      signature,
      from: BUYER_ADDRESS,
      to: sellerPubkey.toBase58(),
      amount: amount.toString(),
      mint: USDC_MINT.toBase58(),
    },
  };

  const xPaymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString("base64");
  console.log(`   ✅ Payment proof encoded (${xPaymentHeader.length} chars)`);

  // Step 5: Retry with payment
  console.log(`\n🔄 Step 5: Retrying request with X-Payment header...`);

  const paidResponse = await fetch(`${SELLER_URL}/v1/ai/inference`, {
    headers: { "X-Payment": xPaymentHeader },
  });

  const result = await paidResponse.json();

  if (paidResponse.status === 200 && result.success) {
    console.log(`\n✅ ============================================`);
    console.log(`   REAL x402 SOLANA TRANSACTION COMPLETE!`);
    console.log(`   ============================================`);
    console.log(`   Status: ${paidResponse.status} OK`);
    console.log(`   AI Result: ${result.data?.result}`);
    console.log(`\n   On-Chain Payment Details:`);
    console.log(`   Signature: ${result.payment?.signature}`);
    console.log(`   Amount: ${result.payment?.amount}`);
    console.log(`   Network: ${result.payment?.network}`);
    console.log(`   Slot: ${result.payment?.slot}`);
    console.log(`   Settlement: ${result.payment?.settlementMethod}`);
    console.log(`   Explorer: ${result.payment?.explorer}`);
    if (result.payment?.invoica) {
      console.log(`\n   Invoica Settlement:`);
      console.log(`   Invoice ID: ${result.payment.invoica.invoiceId || result.payment.invoica.id}`);
      console.log(`   Status: ${result.payment.invoica.status}`);
    }
    console.log(`   ============================================\n`);
  } else {
    console.log(`\n❌ Payment failed: ${paidResponse.status}`);
    console.log(`   Response:`, JSON.stringify(result, null, 2));
  }

  // Final balance
  const newUsdcInfo = await getAccount(connection, buyerTokenAccount);
  console.log(`📊 Updated USDC balance: ${Number(newUsdcInfo.amount) / 1e6} USDC`);
}

runBuyerAgent().catch((err) => {
  console.error(`\n❌ BuyerBot-7 error: ${err.message}`);
  process.exit(1);
});
