// buyer-agent.js — BuyerBot-7: Autonomous x402 client on Ethereum Sepolia
// Flow: request resource → get 402 → send ETH payment on-chain → retry with X-Payment header (tx hash)
import { config } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

config();

const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const SELLER_URL = `http://localhost:${process.env.SERVER_PORT || 4402}`;

const account = privateKeyToAccount(BUYER_PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(RPC_URL),
});

console.log(`\n🤖 BuyerBot-7 Starting (Ethereum Sepolia)...`);
console.log(`   Wallet: ${account.address}`);
console.log(`   Network: Ethereum Sepolia (Chain ID: 11155111)`);
console.log(`   Target: ${SELLER_URL}/v1/ai/inference`);

async function runBuyerAgent() {
  // Step 1: Check buyer's ETH balance
  console.log(`\n📊 Step 1: Checking ETH balance...`);

  const balance = await publicClient.getBalance({ address: account.address });
  const balanceFormatted = formatEther(balance);
  console.log(`   Balance: ${balanceFormatted} ETH`);

  if (balance < parseEther("0.002")) {
    console.log(`   ❌ Insufficient ETH balance. Need at least 0.002 ETH (0.001 payment + gas).`);
    console.log(`   Get testnet ETH from: https://cloud.google.com/application/web3/faucet/ethereum/sepolia`);
    console.log(`   Wallet: ${account.address}`);
    process.exit(1);
  }

  // Step 2: Request the resource (expect 402)
  console.log(`\n🌐 Step 2: Requesting /v1/ai/inference (expecting 402)...`);
  const initialResponse = await fetch(`${SELLER_URL}/v1/ai/inference`);

  if (initialResponse.status !== 402) {
    console.log(`   Unexpected status: ${initialResponse.status}`);
    const body = await initialResponse.json();
    console.log(`   Response:`, body);
    return;
  }

  const paymentRequirements = await initialResponse.json();
  console.log(`   ✅ Got 402 Payment Required`);
  console.log(`   Price: ${paymentRequirements.payment.amountETH} ETH`);
  console.log(`   Recipient: ${paymentRequirements.payment.recipient}`);
  console.log(`   Network: ${paymentRequirements.network}`);

  // Step 3: Send ETH payment on-chain
  console.log(`\n💸 Step 3: Sending ${paymentRequirements.payment.amountETH} ETH to seller on-chain...`);

  const recipient = paymentRequirements.payment.recipient;
  const amount = BigInt(paymentRequirements.payment.amount);

  console.log(`   From: ${account.address}`);
  console.log(`   To: ${recipient}`);
  console.log(`   Amount: ${formatEther(amount)} ETH`);

  const txHash = await walletClient.sendTransaction({
    to: recipient,
    value: amount,
  });

  console.log(`   ✅ Transaction sent!`);
  console.log(`   Tx Hash: ${txHash}`);
  console.log(`   Explorer: https://sepolia.etherscan.io/tx/${txHash}`);

  // Step 4: Wait for confirmation
  console.log(`\n⏳ Step 4: Waiting for transaction confirmation...`);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 120_000,
  });

  console.log(`   ✅ Confirmed in block ${receipt.blockNumber}!`);
  console.log(`   Gas used: ${receipt.gasUsed}`);

  // Step 5: Encode X-Payment header with tx proof
  console.log(`\n📦 Step 5: Encoding X-Payment header with on-chain proof...`);

  const paymentProof = {
    x402Version: 1,
    scheme: "exact",
    network: "ethereum-sepolia",
    payload: {
      txHash,
      from: account.address,
      to: recipient,
      value: amount.toString(),
      blockNumber: Number(receipt.blockNumber),
    },
  };

  const xPaymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString("base64");
  console.log(`   ✅ Payment proof encoded (${xPaymentHeader.length} chars)`);

  // Step 6: Retry request with payment proof
  console.log(`\n🔄 Step 6: Retrying request with X-Payment header...`);

  const paidResponse = await fetch(`${SELLER_URL}/v1/ai/inference`, {
    headers: {
      "X-Payment": xPaymentHeader,
    },
  });

  const result = await paidResponse.json();

  if (paidResponse.status === 200 && result.success) {
    console.log(`\n✅ ============================================`);
    console.log(`   REAL x402 TRANSACTION COMPLETE!`);
    console.log(`   ============================================`);
    console.log(`   Status: ${paidResponse.status} OK`);
    console.log(`   AI Result: ${result.data?.result}`);
    console.log(`   Tokens Used: ${result.data?.tokens_used}`);
    console.log(`\n   On-Chain Payment Details:`);
    console.log(`   Tx Hash: ${result.payment?.txHash}`);
    console.log(`   Amount: ${result.payment?.amount}`);
    console.log(`   Network: ${result.payment?.network}`);
    console.log(`   Chain ID: ${result.payment?.chainId}`);
    console.log(`   Block: ${result.payment?.blockNumber}`);
    console.log(`   Settlement: ${result.payment?.settlementMethod}`);
    console.log(`   Explorer: ${result.payment?.explorer}`);
    if (result.payment?.invoica) {
      console.log(`\n   Invoica Settlement:`);
      console.log(`   Invoice ID: ${result.payment.invoica.invoiceId || result.payment.invoica.id}`);
      console.log(`   Status: ${result.payment.invoica.status}`);
    }
    console.log(`   ============================================\n`);
  } else {
    console.log(`\n❌ Payment failed: ${paidResponse.status}`);
    console.log(`   Response:`, JSON.stringify(result, null, 2));
  }

  // Check updated balance
  const newBalance = await publicClient.getBalance({ address: account.address });
  console.log(`📊 Updated ETH balance: ${formatEther(newBalance)} ETH`);
  console.log(`   Spent: ${formatEther(balance - newBalance)} ETH (includes gas)`);
}

runBuyerAgent().catch((err) => {
  console.error(`\n❌ BuyerBot-7 error: ${err.message}`);
  process.exit(1);
});
