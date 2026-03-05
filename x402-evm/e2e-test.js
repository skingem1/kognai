// e2e-test.js — End-to-end x402 transaction test on Base Sepolia
// Starts seller server, waits for it, then runs buyer agent
import { spawn } from "child_process";
import { config } from "dotenv";

config();

console.log(`\n${"=".repeat(60)}`);
console.log(`  INVOICA x402 END-TO-END TEST (Base Sepolia)`);
console.log(`  Network: Base Sepolia (EVM, Chain ID: 84532)`);
console.log(`  Facilitator: x402.org (Coinbase)`);
console.log(`  Protocol: HTTP 402 → EIP-712 USDC Authorization → 200 OK`);
console.log(`${"=".repeat(60)}\n`);

const PORT = process.env.SERVER_PORT || 4402;

// Start seller server
console.log("🚀 Starting SellerBot-3 server...");
const seller = spawn("node", ["seller-agent.js"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});

let sellerOutput = "";
seller.stdout.on("data", (data) => {
  const text = data.toString();
  sellerOutput += text;
  process.stdout.write(`[SELLER] ${text}`);
});
seller.stderr.on("data", (data) => {
  process.stderr.write(`[SELLER ERR] ${data.toString()}`);
});

// Wait for seller to be ready, then run buyer
async function waitForSeller() {
  console.log("\n⏳ Waiting for seller server to start...");
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok) {
        console.log("✅ Seller server is ready!\n");
        return true;
      }
    } catch (e) {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log("❌ Seller server failed to start within 30s");
  return false;
}

async function runTest() {
  const ready = await waitForSeller();
  if (!ready) {
    seller.kill();
    process.exit(1);
  }

  // Run buyer agent
  console.log("🚀 Starting BuyerBot-7 agent...\n");
  const buyer = spawn("node", ["buyer-agent.js"], {
    stdio: "inherit",
    env: { ...process.env },
  });

  buyer.on("exit", (code) => {
    console.log(`\nBuyerBot-7 exited with code ${code}`);

    // Give seller a moment to log the transaction
    setTimeout(() => {
      seller.kill();
      console.log("\n✅ Test complete. SellerBot-3 stopped.");
      process.exit(code || 0);
    }, 3000);
  });
}

runTest();
