// generate-wallets.js — Generate EVM wallets for seller and buyer agents
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "fs";

console.log("=== Invoica x402 EVM Wallet Generator ===\n");

// Generate seller wallet (receives payments)
const sellerKey = generatePrivateKey();
const sellerAccount = privateKeyToAccount(sellerKey);
console.log("Seller Agent (SellerBot-3):");
console.log(`  Address:     ${sellerAccount.address}`);
console.log(`  Private Key: ${sellerKey}`);

// Generate buyer wallet (makes payments)
const buyerKey = generatePrivateKey();
const buyerAccount = privateKeyToAccount(buyerKey);
console.log(`\nBuyer Agent (BuyerBot-7):`);
console.log(`  Address:     ${buyerAccount.address}`);
console.log(`  Private Key: ${buyerKey}`);

// Write .env file
const envContent = `# Invoica x402 EVM Test Configuration
SELLER_ADDRESS=${sellerAccount.address}
SELLER_PRIVATE_KEY=${sellerKey}
BUYER_ADDRESS=${buyerAccount.address}
BUYER_PRIVATE_KEY=${buyerKey}
CHAIN_ID=84532
NETWORK=base-sepolia
RPC_URL=https://sepolia.base.org
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
FACILITATOR_URL=https://x402.org/facilitator
INVOICA_API=https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/api
SERVER_PORT=4402
`;
writeFileSync(".env", envContent);

console.log("\n.env file written with wallet addresses");
console.log("\n=== NEXT STEPS ===");
console.log("1. Get Base Sepolia ETH for gas:");
console.log(`   Visit https://portal.cdp.coinbase.com/products/faucet`);
console.log(`   Or: https://bwarelabs.com/faucets/base-sepolia`);
console.log(`   Paste buyer address: ${buyerAccount.address}`);
console.log("2. Get Base Sepolia USDC:");
console.log(`   Visit https://portal.cdp.coinbase.com/products/faucet`);
console.log(`   Select USDC on Base Sepolia, paste: ${buyerAccount.address}`);
console.log("3. Run: npm test");
