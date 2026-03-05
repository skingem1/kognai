// seller-agent.js — SellerBot-3: x402-enabled API server on Base Mainnet
// Implements HTTP 402 with EIP-3009 USDC transferWithAuthorization verification
import express from "express";
import { config } from "dotenv";
import {
  createPublicClient,
  http,
  parseAbi,
  verifyTypedData,
  formatUnits,
} from "viem";
import { base } from "viem/chains";

config();

const PORT = parseInt(process.env.SERVER_PORT || "4403");
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base Mainnet
const RPC_URL = "https://mainnet.base.org";
const INVOICA_API = process.env.INVOICA_API || "https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/api";

// Price: 0.01 USDC (10000 atomic units)
const PRICE_ATOMIC = "10000";
const PRICE_DISPLAY = "0.01 USDC";

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

const app = express();
app.use(express.json());

console.log(`\n🤖 SellerBot-3 Starting (Base Mainnet)...`);
console.log(`   Wallet: ${SELLER_ADDRESS}`);
console.log(`   Network: Base Mainnet (Chain ID: 8453)`);
console.log(`   Price: ${PRICE_DISPLAY} per API call`);
console.log(`   USDC: ${USDC_ADDRESS}`);

// EIP-712 domain for USDC on Base Mainnet
const USDC_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: USDC_ADDRESS,
};

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const USDC_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
]);

const processedNonces = new Set();

app.get("/v1/ai/inference", async (req, res) => {
  const paymentHeader = req.header("X-Payment");

  if (!paymentHeader) {
    console.log(`\n📋 [402] Payment required for inference request`);
    return res.status(402).json({
      x402Version: 1,
      scheme: "exact",
      network: "base",
      payment: {
        recipient: SELLER_ADDRESS,
        token: USDC_ADDRESS,
        amount: PRICE_ATOMIC,
        amountUSDC: Number(PRICE_ATOMIC) / 1_000_000,
        chainId: 8453,
        description: "GPT-4 API inference via Invoica x402 (Base Mainnet)",
      },
      facilitator: "self-verified",
    });
  }

  try {
    console.log(`\n💰 [PAYMENT] Received X-Payment header, verifying...`);

    const paymentData = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf-8"));
    const { authorization, signature } = paymentData.payload;

    console.log(`   From: ${authorization.from}`);
    console.log(`   To: ${authorization.to}`);
    console.log(`   Value: ${formatUnits(BigInt(authorization.value), 6)} USDC`);

    // Verify recipient
    if (authorization.to.toLowerCase() !== SELLER_ADDRESS.toLowerCase()) {
      console.log(`   ❌ Wrong recipient`);
      return res.status(402).json({ error: "Invalid recipient" });
    }

    // Verify amount
    if (BigInt(authorization.value) < BigInt(PRICE_ATOMIC)) {
      console.log(`   ❌ Insufficient amount`);
      return res.status(402).json({ error: "Insufficient payment" });
    }

    // Verify time validity
    const now = Math.floor(Date.now() / 1000);
    if (BigInt(authorization.validBefore) < BigInt(now)) {
      console.log(`   ❌ Authorization expired`);
      return res.status(402).json({ error: "Authorization expired" });
    }

    // Verify EIP-712 signature
    const isValid = await verifyTypedData({
      address: authorization.from,
      domain: USDC_DOMAIN,
      types: TRANSFER_WITH_AUTH_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
      signature,
    });

    if (!isValid) {
      console.log(`   ❌ Invalid EIP-712 signature`);
      return res.status(402).json({ error: "Invalid signature" });
    }
    console.log(`   ✅ EIP-712 signature verified`);

    // Check USDC balance
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [authorization.from],
    });

    if (balance < BigInt(authorization.value)) {
      console.log(`   ❌ Insufficient USDC: ${formatUnits(balance, 6)}`);
      return res.status(402).json({ error: "Insufficient USDC balance" });
    }
    console.log(`   ✅ Buyer has ${formatUnits(balance, 6)} USDC`);

    // Check nonce not used
    const nonceUsed = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "authorizationState",
      args: [authorization.from, authorization.nonce],
    });

    if (nonceUsed) {
      console.log(`   ❌ Nonce already used`);
      return res.status(402).json({ error: "Nonce already used" });
    }
    console.log(`   ✅ Nonce is fresh`);

    // For settlement, the facilitator would call transferWithAuthorization on-chain.
    // For this test, the signed authorization IS the proof of payment commitment.
    // In production, we'd submit to a facilitator for on-chain settlement.
    const txHash = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
    console.log(`   ✅ Payment authorization verified (EIP-3009 ready for settlement)`);

    // Record in Invoica
    let invoiceData = null;
    try {
      const invoiceRes = await fetch(`${INVOICA_API}/v1/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(authorization.value) / 1_000_000,
          currency: "USDC",
          customerName: `Agent ${authorization.from.substring(0, 10)}...`,
          customerEmail: `${authorization.from.substring(0, 10)}@agents.base`,
          paymentDetails: {
            x402Protocol: true,
            network: "base-mainnet",
            chainId: 8453,
            payerWallet: authorization.from,
            sellerWallet: SELLER_ADDRESS,
            eip3009Authorization: true,
            facilitator: "self-verified",
            usdcContract: USDC_ADDRESS,
          },
        }),
      });
      const invoiceJson = await invoiceRes.json();
      if (invoiceJson.data?.id) {
        const payRes = await fetch(`${INVOICA_API}/v1/invoices/${invoiceJson.data.id}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payerAgent: authorization.from, payerWallet: authorization.from }),
        });
        invoiceData = await payRes.json();
        console.log(`   📄 Invoica invoice: ${invoiceJson.data.id}`);
      }
    } catch (e) {
      console.log(`   ⚠️ Invoica recording failed: ${e.message}`);
    }

    const explorerUrl = `https://basescan.org/address/${SELLER_ADDRESS}`;
    console.log(`\n   ✅ x402 EIP-3009 PAYMENT VERIFIED`);

    return res.json({
      success: true,
      data: {
        result: "GPT-4 inference result: 42 via x402 EIP-3009 on Base Mainnet.",
        model: "gpt-4-simulated",
        tokens_used: 150,
      },
      payment: {
        verified: true,
        amount: `${formatUnits(BigInt(authorization.value), 6)} USDC`,
        network: "base-mainnet",
        chainId: 8453,
        settlementMethod: "eip-3009-verified",
        explorer: explorerUrl,
        invoica: invoiceData?.data || null,
      },
    });

  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return res.status(402).json({ error: "Payment verification failed", message: err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ agent: "SellerBot-3", status: "ok", wallet: SELLER_ADDRESS, network: "base-mainnet", chainId: 8453, price: PRICE_DISPLAY });
});

app.listen(PORT, () => {
  console.log(`\n🚀 SellerBot-3 listening on http://localhost:${PORT}`);
  console.log(`   Payment endpoint: GET /v1/ai/inference`);
  console.log(`   Health: GET /health\n`);
});
