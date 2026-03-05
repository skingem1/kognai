// generate-wallets.js — Generate Solana devnet wallets for seller and buyer agents
import { Keypair } from "@solana/web3.js";
import { writeFileSync } from "fs";

console.log("=== Invoica x402 Wallet Generator ===\n");

// Generate seller wallet (receives payments)
const seller = Keypair.generate();
console.log("Seller Agent (SellerBot-3):");
console.log(`  Public Key:  ${seller.publicKey.toBase58()}`);
writeFileSync("seller-keypair.json", JSON.stringify(Array.from(seller.secretKey)));

// Generate buyer wallet (makes payments)
const buyer = Keypair.generate();
console.log(`\nBuyer Agent (BuyerBot-7):`);
console.log(`  Public Key:  ${buyer.publicKey.toBase58()}`);
writeFileSync("buyer-keypair.json", JSON.stringify(Array.from(buyer.secretKey)));

// Write .env file
const envContent = `# Invoica x402 Test Configuration
SELLER_PUBLIC_KEY=${seller.publicKey.toBase58()}
BUYER_PUBLIC_KEY=${buyer.publicKey.toBase58()}
SOLANA_NETWORK=devnet
SOLANA_RPC=https://api.devnet.solana.com
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
FACILITATOR_URL=https://facilitator.payai.network
INVOICA_API=https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/api
SERVER_PORT=4402
`;
writeFileSync(".env", envContent);

console.log("\n.env file written with wallet addresses");
console.log("\n=== NEXT STEPS ===");
console.log("1. Fund buyer wallet with devnet SOL:");
console.log(`   solana airdrop 2 ${buyer.publicKey.toBase58()} --url devnet`);
console.log("2. Fund buyer wallet with devnet USDC (use faucet):");
console.log(`   https://faucet.circle.com/ (select Solana Devnet, paste: ${buyer.publicKey.toBase58()})`);
console.log("3. Fund seller wallet with devnet SOL (for token account creation):");
console.log(`   solana airdrop 2 ${seller.publicKey.toBase58()} --url devnet`);
console.log("4. Run: npm run test");
