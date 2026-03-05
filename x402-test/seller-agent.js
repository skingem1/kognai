// seller-agent.js — SellerBot-3: x402-enabled API server on Solana Mainnet
// Implements HTTP 402 Payment Required with SPL USDC verification
import express from "express";
import { config } from "dotenv";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import { readFileSync } from "fs";

config();

const PORT = parseInt(process.env.SERVER_PORT || "4402");
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const INVOICA_API = process.env.INVOICA_API || "https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/api";
const USDC_MINT = new PublicKey(process.env.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// Load seller keypair
const sellerKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync("seller-keypair.json", "utf-8")))
);
const SELLER_ADDRESS = sellerKeypair.publicKey.toBase58();

// Price: 0.01 USDC (10000 atomic units, USDC has 6 decimals)
const PRICE_ATOMIC = 10000;
const PRICE_DISPLAY = "0.01 USDC";

const connection = new Connection(SOLANA_RPC, "confirmed");

const app = express();
app.use(express.json());

console.log(`\n🤖 SellerBot-3 Starting (Solana Mainnet)...`);
console.log(`   Wallet: ${SELLER_ADDRESS}`);
console.log(`   Network: Solana Mainnet`);
console.log(`   Price: ${PRICE_DISPLAY} per API call`);
console.log(`   USDC Mint: ${USDC_MINT.toBase58()}`);

// Track processed signatures to prevent replay
const processedSignatures = new Set();

// Get seller's USDC token account
let sellerTokenAccount;
(async () => {
  sellerTokenAccount = await getAssociatedTokenAddress(USDC_MINT, sellerKeypair.publicKey);
  console.log(`   Token Account: ${sellerTokenAccount.toBase58()}`);
})();

// === x402 Payment-gated endpoint ===
app.get("/v1/ai/inference", async (req, res) => {
  const paymentHeader = req.header("X-Payment");

  if (!paymentHeader) {
    console.log(`\n📋 [402] Payment required for inference request`);

    // Ensure seller token account is resolved
    if (!sellerTokenAccount) {
      sellerTokenAccount = await getAssociatedTokenAddress(USDC_MINT, sellerKeypair.publicKey);
    }

    return res.status(402).json({
      x402Version: 1,
      scheme: "exact",
      network: "solana-mainnet",
      payment: {
        recipient: SELLER_ADDRESS,
        tokenAccount: sellerTokenAccount.toBase58(),
        mint: USDC_MINT.toBase58(),
        amount: PRICE_ATOMIC,
        amountUSDC: PRICE_ATOMIC / 1_000_000,
        cluster: "mainnet-beta",
        description: "GPT-4 API inference via Invoica x402 (Solana Mainnet)",
      },
      facilitator: "self-verified",
    });
  }

  // Verify payment
  try {
    console.log(`\n💰 [PAYMENT] Received X-Payment header, verifying...`);

    const paymentData = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf-8")
    );

    const { signature, from } = paymentData.payload;

    console.log(`   From: ${from}`);
    console.log(`   Signature: ${signature}`);

    // Check replay
    if (processedSignatures.has(signature)) {
      console.log(`   ❌ Signature already used (replay attack)`);
      return res.status(402).json({ error: "Signature already used" });
    }

    // Fetch and verify the transaction on-chain
    console.log(`   🔍 Fetching transaction from Solana...`);
    let txInfo;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        txInfo = await connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        if (txInfo) break;
      } catch (e) {
        // retry
      }
      console.log(`   ⏳ Waiting for confirmation (attempt ${attempt + 1})...`);
      await new Promise(r => setTimeout(r, 3000));
    }

    if (!txInfo) {
      console.log(`   ❌ Transaction not found on-chain`);
      return res.status(402).json({ error: "Transaction not found" });
    }

    if (txInfo.meta?.err) {
      console.log(`   ❌ Transaction failed:`, txInfo.meta.err);
      return res.status(402).json({ error: "Transaction failed" });
    }
    console.log(`   ✅ Transaction confirmed in slot ${txInfo.slot}`);

    // Verify: check token balance changes
    const preBalances = txInfo.meta?.preTokenBalances || [];
    const postBalances = txInfo.meta?.postTokenBalances || [];

    // Find seller's token balance change
    let sellerReceived = 0n;
    for (const post of postBalances) {
      if (post.owner === SELLER_ADDRESS && post.mint === USDC_MINT.toBase58()) {
        const pre = preBalances.find(
          p => p.accountIndex === post.accountIndex
        );
        const preAmount = BigInt(pre?.uiTokenAmount?.amount || "0");
        const postAmount = BigInt(post.uiTokenAmount?.amount || "0");
        sellerReceived = postAmount - preAmount;
      }
    }

    if (sellerReceived < BigInt(PRICE_ATOMIC)) {
      console.log(`   ❌ Insufficient USDC received: ${sellerReceived} < ${PRICE_ATOMIC}`);
      return res.status(402).json({ error: "Insufficient payment received" });
    }

    console.log(`   ✅ Seller received ${Number(sellerReceived) / 1_000_000} USDC`);

    // Mark as processed
    processedSignatures.add(signature);

    // Record in Invoica
    let invoiceData = null;
    try {
      const invoiceRes = await fetch(`${INVOICA_API}/v1/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(sellerReceived) / 1_000_000,
          currency: "USDC",
          customerName: `Agent ${from.substring(0, 8)}...`,
          customerEmail: `${from.substring(0, 8)}@agents.solana`,
          paymentDetails: {
            x402Protocol: true,
            network: "solana-mainnet",
            signature,
            payerWallet: from,
            sellerWallet: SELLER_ADDRESS,
            facilitator: "self-verified",
            slot: txInfo.slot,
            usdcMint: USDC_MINT.toBase58(),
          },
        }),
      });
      const invoiceJson = await invoiceRes.json();
      if (invoiceJson.data?.id) {
        const payRes = await fetch(`${INVOICA_API}/v1/invoices/${invoiceJson.data.id}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payerAgent: from, payerWallet: from }),
        });
        invoiceData = await payRes.json();
        console.log(`   📄 Invoica invoice created & settled: ${invoiceJson.data.id}`);
      }
    } catch (e) {
      console.log(`   ⚠️ Invoica recording failed (non-critical): ${e.message}`);
    }

    const explorerUrl = `https://solscan.io/tx/${signature}`;
    console.log(`\n   ✅ PAYMENT VERIFIED & SETTLED`);
    console.log(`   🔗 ${explorerUrl}`);

    return res.json({
      success: true,
      data: {
        result: "GPT-4 inference result: The meaning of life is 42, computed via x402 on Solana Mainnet.",
        model: "gpt-4-simulated",
        tokens_used: 150,
      },
      payment: {
        verified: true,
        signature,
        amount: `${Number(sellerReceived) / 1_000_000} USDC`,
        network: "solana-mainnet",
        slot: txInfo.slot,
        explorer: explorerUrl,
        settlementMethod: "on-chain-verified",
        invoica: invoiceData?.data || null,
      },
    });

  } catch (err) {
    console.log(`   ❌ Payment verification error: ${err.message}`);
    return res.status(402).json({ error: "Payment verification failed", message: err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ agent: "SellerBot-3", status: "ok", wallet: SELLER_ADDRESS, network: "solana-mainnet" });
});

app.listen(PORT, () => {
  console.log(`\n🚀 SellerBot-3 listening on http://localhost:${PORT}`);
  console.log(`   Payment endpoint: GET /v1/ai/inference`);
  console.log(`   Health: GET /health\n`);
});
