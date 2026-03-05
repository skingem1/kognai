// e2e-test.js — End-to-end x402 on Base Mainnet (EIP-3009 USDC)
import { spawn } from "child_process";
import { config } from "dotenv";

config();

console.log(`\n${"=".repeat(60)}`);
console.log(`  INVOICA x402 END-TO-END TEST (Base Mainnet)`);
console.log(`  Network: Base Mainnet (EVM, Chain ID: 8453)`);
console.log(`  Token: USDC (EIP-3009 TransferWithAuthorization)`);
console.log(`  Protocol: HTTP 402 → EIP-712 Signature → 200 OK`);
console.log(`${"=".repeat(60)}\n`);

const PORT = process.env.SERVER_PORT || 4403;

const seller = spawn("node", ["seller-agent.js"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});

seller.stdout.on("data", (data) => process.stdout.write(`[SELLER] ${data}`));
seller.stderr.on("data", (data) => process.stderr.write(`[SELLER ERR] ${data}`));

async function waitForSeller() {
  console.log("⏳ Waiting for seller server...");
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok) { console.log("✅ Seller ready!\n"); return true; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log("❌ Seller failed to start");
  return false;
}

async function runTest() {
  const ready = await waitForSeller();
  if (!ready) { seller.kill(); process.exit(1); }

  console.log("🚀 Starting BuyerBot-7...\n");
  const buyer = spawn("node", ["buyer-agent.js"], {
    stdio: "inherit",
    env: { ...process.env },
  });

  buyer.on("exit", (code) => {
    console.log(`\nBuyerBot-7 exited with code ${code}`);
    setTimeout(() => {
      seller.kill();
      console.log("✅ Test complete.");
      process.exit(code || 0);
    }, 3000);
  });
}

runTest();
