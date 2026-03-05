import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "fs";

const agents = [
  "ceo",
  "cfo",
  "cto",
  "cmo",
  "bizdev",
  "fast",
  "code",
  "support",
];

console.log("=== Invoica Agent Wallet Generation ===\n");
const wallets = {};
for (const agent of agents) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  wallets[agent] = { address: account.address, privateKey };
  console.log(`${agent}:`);
  console.log(`  address:     ${account.address}`);
  console.log(`  private_key: ${privateKey}`);
  console.log();
}

const addresses = Object.fromEntries(
  Object.entries(wallets).map(([k, v]) => [k, { address: v.address }])
);
writeFileSync("/tmp/agent-addresses.json", JSON.stringify(addresses, null, 2));
console.log("Addresses written to /tmp/agent-addresses.json");

writeFileSync("/tmp/agent-wallets-SECRET.json", JSON.stringify(wallets, null, 2));
console.log("Full wallets (with keys) written to /tmp/agent-wallets-SECRET.json");
