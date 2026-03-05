// fund-wallets.js — Fund both wallets with devnet SOL + mint custom USDC-like token
// This bypasses the Circle faucet by creating our own SPL token on devnet
import { config } from "dotenv";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync, writeFileSync } from "fs";

config();

const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const connection = new Connection(SOLANA_RPC, "confirmed");

// Load keypairs
const sellerKeyData = JSON.parse(readFileSync("seller-keypair.json", "utf-8"));
const sellerKeypair = Keypair.fromSecretKey(Uint8Array.from(sellerKeyData));

const buyerKeyData = JSON.parse(readFileSync("buyer-keypair.json", "utf-8"));
const buyerKeypair = Keypair.fromSecretKey(Uint8Array.from(buyerKeyData));

async function airdropWithRetry(pubkey, amount, label) {
  const endpoints = [
    "https://api.devnet.solana.com",
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   Trying airdrop from ${endpoint}...`);
      const conn = new Connection(endpoint, "confirmed");
      const sig = await conn.requestAirdrop(pubkey, amount);
      await conn.confirmTransaction(sig, "confirmed");
      console.log(`   ✅ ${label} funded with ${amount / LAMPORTS_PER_SOL} SOL (tx: ${sig.substring(0, 20)}...)`);
      return true;
    } catch (e) {
      console.log(`   ⚠️ Failed from ${endpoint}: ${e.message.substring(0, 60)}`);
    }
  }
  return false;
}

async function main() {
  console.log("\n=== Invoica x402 Wallet Funding ===\n");

  // Step 1: Airdrop SOL to both wallets
  console.log("📦 Step 1: Airdropping devnet SOL...");

  const sellerFunded = await airdropWithRetry(sellerKeypair.publicKey, 2 * LAMPORTS_PER_SOL, "Seller");
  if (!sellerFunded) {
    console.log("\n❌ Could not airdrop SOL to seller. Please use https://faucet.solana.com manually:");
    console.log(`   Wallet: ${sellerKeypair.publicKey.toBase58()}`);
    console.log("   Then re-run this script.\n");
    process.exit(1);
  }

  // Small delay to avoid rate limit
  await new Promise(r => setTimeout(r, 2000));

  const buyerFunded = await airdropWithRetry(buyerKeypair.publicKey, 2 * LAMPORTS_PER_SOL, "Buyer");
  if (!buyerFunded) {
    console.log("\n❌ Could not airdrop SOL to buyer. Please use https://faucet.solana.com manually:");
    console.log(`   Wallet: ${buyerKeypair.publicKey.toBase58()}`);
    console.log("   Then re-run this script.\n");
    process.exit(1);
  }

  // Step 2: Create a custom USDC-like SPL token on devnet
  console.log("\n🪙 Step 2: Creating custom USDC token on devnet...");

  // Seller is the mint authority (they create the token)
  const mint = await createMint(
    connection,
    sellerKeypair,       // payer
    sellerKeypair.publicKey, // mint authority
    null,                // freeze authority (none)
    6,                   // 6 decimals like real USDC
  );

  console.log(`   ✅ Custom USDC Token Mint: ${mint.toBase58()}`);
  console.log(`   Decimals: 6 (same as real USDC)`);

  // Step 3: Create token accounts for both wallets
  console.log("\n📂 Step 3: Creating token accounts...");

  const sellerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    sellerKeypair,
    mint,
    sellerKeypair.publicKey,
  );
  console.log(`   Seller token account: ${sellerTokenAccount.address.toBase58()}`);

  const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    buyerKeypair,
    mint,
    buyerKeypair.publicKey,
  );
  console.log(`   Buyer token account: ${buyerTokenAccount.address.toBase58()}`);

  // Step 4: Mint 100 USDC to the buyer (100 * 10^6 = 100_000_000 atomic units)
  console.log("\n💰 Step 4: Minting 100 USDC to buyer wallet...");

  const mintAmount = 100_000_000; // 100 USDC
  await mintTo(
    connection,
    sellerKeypair,        // payer
    mint,                 // token mint
    buyerTokenAccount.address, // destination
    sellerKeypair.publicKey,   // mint authority
    mintAmount,
  );
  console.log(`   ✅ Minted 100.000000 USDC to buyer`);

  // Step 5: Update .env with the custom token mint
  console.log("\n📝 Step 5: Updating .env with custom token...");

  let envContent = readFileSync(".env", "utf-8");
  envContent = envContent.replace(
    /USDC_MINT=.*/,
    `USDC_MINT=${mint.toBase58()}`
  );
  // Add seller token account for the seller agent to use
  envContent += `\nSELLER_TOKEN_ACCOUNT=${sellerTokenAccount.address.toBase58()}\n`;
  writeFileSync(".env", envContent);

  console.log(`   Updated USDC_MINT to: ${mint.toBase58()}`);

  // Verify balances
  console.log("\n📊 Final Balances:");

  const sellerSol = await connection.getBalance(sellerKeypair.publicKey);
  const buyerSol = await connection.getBalance(buyerKeypair.publicKey);
  const buyerUsdc = await connection.getTokenAccountBalance(buyerTokenAccount.address);

  console.log(`   Seller: ${sellerSol / LAMPORTS_PER_SOL} SOL`);
  console.log(`   Buyer:  ${buyerSol / LAMPORTS_PER_SOL} SOL`);
  console.log(`   Buyer:  ${buyerUsdc.value.uiAmountString} USDC (custom devnet token)`);

  console.log("\n=== All wallets funded! Ready to run: node e2e-test.js ===\n");
}

main().catch((err) => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});
