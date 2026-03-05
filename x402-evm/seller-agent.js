// seller-agent.js — SellerBot-3: x402-enabled API server on Ethereum Sepolia
// Implements HTTP 402 Payment Required flow with signed ETH transactions
// Flow: Client requests → 402 with payment requirements → Client signs & sends ETH tx →
//       Client retries with X-Payment header (containing tx hash) → Server verifies on-chain → 200 OK
import express from "express";
import { config } from "dotenv";
import {
  createPublicClient,
  http,
  formatEther,
  parseEther,
} from "viem";
import { sepolia } from "viem/chains";

config();

const PORT = parseInt(process.env.SERVER_PORT || "4402");
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const INVOICA_API = process.env.INVOICA_API || "https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/api";

// Price: 0.001 ETH (affordable for testnet)
const PRICE_WEI = parseEther("0.001");
const PRICE_DISPLAY = "0.001 ETH";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const app = express();
app.use(express.json());

console.log(`\n🤖 SellerBot-3 Starting (Ethereum Sepolia)...`);
console.log(`   Wallet: ${SELLER_ADDRESS}`);
console.log(`   Network: Ethereum Sepolia (Chain ID: 11155111)`);
console.log(`   Price: ${PRICE_DISPLAY} per API call`);

// Track processed payments to prevent double-spend
const processedTxHashes = new Set();

// === x402 Payment-gated endpoint: /v1/ai/inference ===
app.get("/v1/ai/inference", async (req, res) => {
  const paymentHeader = req.header("X-Payment");

  if (!paymentHeader) {
    // Return 402 Payment Required with payment requirements
    console.log(`\n📋 [402] Payment required for inference request`);

    const paymentRequirements = {
      x402Version: 1,
      scheme: "exact",
      network: "ethereum-sepolia",
      payment: {
        recipient: SELLER_ADDRESS,
        token: "ETH",
        amount: PRICE_WEI.toString(),
        amountETH: 0.001,
        chainId: 11155111,
        description: "GPT-4 API inference via Invoica x402 (Sepolia testnet)",
      },
      facilitator: "self-verified",
    };

    return res.status(402).json(paymentRequirements);
  }

  // Verify payment from X-Payment header
  try {
    console.log(`\n💰 [PAYMENT] Received X-Payment header, verifying...`);

    const paymentData = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf-8")
    );

    const { txHash, from, value } = paymentData.payload;

    console.log(`   From: ${from}`);
    console.log(`   Tx Hash: ${txHash}`);
    console.log(`   Claimed Value: ${formatEther(BigInt(value))} ETH`);

    // Verify 1: Check for replay attacks
    if (processedTxHashes.has(txHash.toLowerCase())) {
      console.log(`   ❌ Transaction already used (replay attack)`);
      return res.status(402).json({ error: "Transaction already used" });
    }

    // Verify 2: Fetch the transaction from the blockchain
    console.log(`   🔍 Fetching transaction from Sepolia...`);
    let tx;
    try {
      tx = await publicClient.getTransaction({ hash: txHash });
    } catch (e) {
      // Transaction might be pending, wait and retry
      console.log(`   ⏳ Transaction not found yet, waiting...`);
      await new Promise(r => setTimeout(r, 5000));
      try {
        tx = await publicClient.getTransaction({ hash: txHash });
      } catch (e2) {
        console.log(`   ❌ Transaction not found on-chain: ${txHash}`);
        return res.status(402).json({ error: "Transaction not found on-chain" });
      }
    }

    if (!tx) {
      console.log(`   ❌ Transaction not found`);
      return res.status(402).json({ error: "Transaction not found" });
    }

    // Verify 3: Check recipient matches our wallet
    if (tx.to?.toLowerCase() !== SELLER_ADDRESS.toLowerCase()) {
      console.log(`   ❌ Wrong recipient: ${tx.to} != ${SELLER_ADDRESS}`);
      return res.status(402).json({ error: "Invalid recipient" });
    }
    console.log(`   ✅ Recipient verified: ${tx.to}`);

    // Verify 4: Check amount is sufficient
    if (tx.value < PRICE_WEI) {
      console.log(`   ❌ Insufficient payment: ${formatEther(tx.value)} < ${formatEther(PRICE_WEI)}`);
      return res.status(402).json({ error: "Insufficient payment" });
    }
    console.log(`   ✅ Amount verified: ${formatEther(tx.value)} ETH`);

    // Verify 5: Wait for confirmation
    console.log(`   ⏳ Waiting for transaction confirmation...`);
    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });
    } catch (e) {
      console.log(`   ❌ Transaction not confirmed within timeout`);
      return res.status(402).json({ error: "Transaction not confirmed" });
    }

    if (receipt.status !== "success") {
      console.log(`   ❌ Transaction reverted`);
      return res.status(402).json({ error: "Transaction reverted" });
    }
    console.log(`   ✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Mark as processed
    processedTxHashes.add(txHash.toLowerCase());

    // Record the payment in Invoica
    let invoiceData = null;
    try {
      const invoiceRes = await fetch(`${INVOICA_API}/v1/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(formatEther(tx.value)),
          currency: "ETH",
          customerName: `Agent ${from.substring(0, 10)}...`,
          customerEmail: `${from.substring(0, 10)}@agents.sepolia`,
          paymentDetails: {
            x402Protocol: true,
            network: "ethereum-sepolia",
            chainId: 11155111,
            txHash: txHash,
            payerWallet: from,
            sellerWallet: SELLER_ADDRESS,
            facilitator: "self-verified",
            blockNumber: Number(receipt.blockNumber),
            gasUsed: Number(receipt.gasUsed),
          },
        }),
      });
      const invoiceJson = await invoiceRes.json();

      if (invoiceJson.data?.id) {
        const payRes = await fetch(`${INVOICA_API}/v1/invoices/${invoiceJson.data.id}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payerAgent: from,
            payerWallet: from,
          }),
        });
        invoiceData = await payRes.json();
        console.log(`   📄 Invoica invoice created & settled: ${invoiceJson.data.id}`);
      }
    } catch (e) {
      console.log(`   ⚠️ Failed to record in Invoica (non-critical): ${e.message}`);
    }

    // Return the paid resource
    const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
    console.log(`\n   ✅ PAYMENT VERIFIED & SETTLED`);
    console.log(`   🔗 ${explorerUrl}`);

    return res.json({
      success: true,
      data: {
        result: "GPT-4 inference result: The meaning of life is 42, computed via x402 payment protocol on Ethereum Sepolia.",
        model: "gpt-4-simulated",
        tokens_used: 150,
      },
      payment: {
        verified: true,
        txHash,
        amount: `${formatEther(tx.value)} ETH`,
        network: "ethereum-sepolia",
        chainId: 11155111,
        blockNumber: Number(receipt.blockNumber),
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

// Health check
app.get("/health", (req, res) => {
  res.json({
    agent: "SellerBot-3",
    status: "ok",
    wallet: SELLER_ADDRESS,
    network: "ethereum-sepolia",
    chainId: 11155111,
    price: PRICE_DISPLAY,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 SellerBot-3 listening on http://localhost:${PORT}`);
  console.log(`   Payment endpoint: GET /v1/ai/inference`);
  console.log(`   Health: GET /health\n`);
});
