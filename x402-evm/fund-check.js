// fund-check.js — Check wallet balances and provide faucet instructions
import { config } from "dotenv";
import {
  createPublicClient,
  http,
  parseAbi,
  formatUnits,
} from "viem";
import { baseSepolia } from "viem/chains";

config();

const BUYER_ADDRESS = process.env.BUYER_ADDRESS;
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const USDC_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

async function checkBalances() {
  console.log("\n=== Invoica x402 Wallet Balance Check ===\n");
  console.log(`Network: Base Sepolia (Chain ID: 84532)`);
  console.log(`USDC Contract: ${USDC_ADDRESS}\n`);

  // Check seller
  console.log("📊 Seller Agent (SellerBot-3):");
  console.log(`   Address: ${SELLER_ADDRESS}`);
  const sellerEth = await publicClient.getBalance({ address: SELLER_ADDRESS });
  console.log(`   ETH: ${formatUnits(sellerEth, 18)}`);
  try {
    const sellerUsdc = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [SELLER_ADDRESS],
    });
    console.log(`   USDC: ${formatUnits(sellerUsdc, 6)}`);
  } catch (e) {
    console.log(`   USDC: 0 (no token account)`);
  }

  // Check buyer
  console.log("\n📊 Buyer Agent (BuyerBot-7):");
  console.log(`   Address: ${BUYER_ADDRESS}`);
  const buyerEth = await publicClient.getBalance({ address: BUYER_ADDRESS });
  console.log(`   ETH: ${formatUnits(buyerEth, 18)}`);
  try {
    const buyerUsdc = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [BUYER_ADDRESS],
    });
    console.log(`   USDC: ${formatUnits(buyerUsdc, 6)}`);
  } catch (e) {
    console.log(`   USDC: 0 (no token account)`);
  }

  // Readiness check
  console.log("\n=== Readiness Check ===");
  const buyerEthOk = buyerEth > 0n;
  let buyerUsdcOk = false;
  try {
    const buyerUsdc = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [BUYER_ADDRESS],
    });
    buyerUsdcOk = buyerUsdc >= 10000n; // 0.01 USDC minimum
  } catch (e) {}

  if (buyerUsdcOk) {
    console.log("✅ Buyer has enough USDC — ready to test!");
    console.log("\nRun: node e2e-test.js");
  } else {
    console.log("❌ Buyer needs USDC to proceed.");
    console.log("\n=== FUNDING INSTRUCTIONS ===");
    console.log("\nOption 1: Coinbase CDP Faucet (RECOMMENDED — gives ETH + USDC)");
    console.log(`   1. Visit: https://portal.cdp.coinbase.com/products/faucet`);
    console.log(`   2. Select "Base Sepolia" network`);
    console.log(`   3. Paste this address: ${BUYER_ADDRESS}`);
    console.log(`   4. Request ETH and USDC`);
    console.log("\nOption 2: Bware Labs (ETH only, no auth)");
    console.log(`   1. Visit: https://bwarelabs.com/faucets/base-sepolia`);
    console.log(`   2. Paste: ${BUYER_ADDRESS}`);
    console.log("\nOption 3: Superchain Faucet (ETH only)");
    console.log(`   1. Visit: https://app.optimism.io/faucet`);
    console.log(`   2. Select Base Sepolia, paste: ${BUYER_ADDRESS}`);
    console.log("\nAfter funding, run: node fund-check.js");
  }
}

checkBalances().catch((err) => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});
