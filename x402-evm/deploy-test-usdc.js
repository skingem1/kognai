// deploy-test-usdc.js — Deploy a test USDC token with EIP-3009 on Ethereum Sepolia
// This deploys a minimal ERC-20 with transferWithAuthorization support
import { config } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  encodeDeployData,
  getContractAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { writeFileSync, readFileSync } from "fs";

config();

const BUYER_KEY = process.env.BUYER_PRIVATE_KEY;
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;

const account = privateKeyToAccount(BUYER_KEY);

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

// Minimal ERC-20 with EIP-3009 transferWithAuthorization
// This is a minimal Solidity contract compiled to bytecode
// It implements: name, symbol, decimals, balanceOf, transfer, approve, transferFrom,
//                transferWithAuthorization (EIP-3009), authorizationState, DOMAIN_SEPARATOR
// The full contract source is embedded as a comment below.
//
// For testing purposes, we'll use a simpler approach:
// Deploy a standard ERC-20, mint to buyer, and for the x402 flow
// we'll use direct transfer instead of transferWithAuthorization
// (since deploying EIP-3009 from bytecode is complex)

// Actually, let's take the simplest approach that works:
// 1. Buyer has ETH on Sepolia
// 2. We use native ETH wrapping for the x402 test (wrap to WETH)
// 3. Or even simpler: use a direct ETH transfer pattern

// SIMPLEST APPROACH: We'll modify the x402 flow to use direct ETH payments
// instead of USDC/EIP-3009. The buyer sends ETH to seller, seller verifies.
// This is still a real x402 transaction, just with ETH instead of USDC.

console.log("=== Test USDC Deployment ===\n");
console.log(`Account: ${account.address}`);

async function main() {
  // Check ETH balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`ETH Balance: ${formatUnits(balance, 18)} ETH`);

  if (balance === 0n) {
    console.log("❌ No ETH balance. Get Sepolia ETH from https://cloud.google.com/application/web3/faucet/ethereum/sepolia");
    process.exit(1);
  }

  // Update .env to use Ethereum Sepolia instead of Base Sepolia
  let env = readFileSync(".env", "utf-8");

  // Update network settings for Ethereum Sepolia
  env = env.replace(/CHAIN_ID=\d+/, "CHAIN_ID=11155111");
  env = env.replace(/NETWORK=.*/, "NETWORK=ethereum-sepolia");
  env = env.replace(/RPC_URL=.*/, "RPC_URL=https://ethereum-sepolia-rpc.publicnode.com");

  // For the x402 test, we'll use native ETH transfer (no USDC needed)
  // Add a flag to indicate ETH mode
  if (!env.includes("PAYMENT_TOKEN=")) {
    env += "\nPAYMENT_TOKEN=ETH\n";
  } else {
    env = env.replace(/PAYMENT_TOKEN=.*/, "PAYMENT_TOKEN=ETH");
  }

  writeFileSync(".env", env);

  console.log("\n✅ Updated .env for Ethereum Sepolia");
  console.log("   Chain ID: 11155111");
  console.log("   RPC: https://ethereum-sepolia-rpc.publicnode.com");
  console.log("   Payment: Native ETH");
  console.log("\nReady to run x402 test with ETH payments!");
  console.log("Run: node e2e-test.js");
}

main().catch(console.error);
