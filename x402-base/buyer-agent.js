// buyer-agent.js — BuyerBot-7: x402 client on Base Mainnet with EIP-3009
// Signs EIP-712 TransferWithAuthorization for USDC payment
import { config } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

config();

const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const RPC_URL = "https://mainnet.base.org";
const SELLER_URL = `http://localhost:${process.env.SERVER_PORT || 4403}`;

const account = privateKeyToAccount(BUYER_PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(RPC_URL),
});

const USDC_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

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

console.log(`\n🤖 BuyerBot-7 Starting (Base Mainnet)...`);
console.log(`   Wallet: ${account.address}`);
console.log(`   Network: Base Mainnet (Chain ID: 8453)`);
console.log(`   Target: ${SELLER_URL}/v1/ai/inference`);

async function runBuyerAgent() {
  // Step 1: Check USDC balance
  console.log(`\n📊 Step 1: Checking USDC balance...`);

  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`   USDC: ${formatUnits(balance, 6)}`);

  const ethBalance = await publicClient.getBalance({ address: account.address });
  console.log(`   ETH: ${formatUnits(ethBalance, 18)}`);

  if (balance < 10000n) {
    console.log(`   ❌ Need at least 0.01 USDC`);
    process.exit(1);
  }

  // Step 2: Request resource (expect 402)
  console.log(`\n🌐 Step 2: Requesting /v1/ai/inference (expecting 402)...`);
  const initialResponse = await fetch(`${SELLER_URL}/v1/ai/inference`);

  if (initialResponse.status !== 402) {
    console.log(`   Unexpected: ${initialResponse.status}`);
    return;
  }

  const paymentReq = await initialResponse.json();
  console.log(`   ✅ Got 402 Payment Required`);
  console.log(`   Price: ${paymentReq.payment.amountUSDC} USDC`);
  console.log(`   Recipient: ${paymentReq.payment.recipient}`);

  // Step 3: Sign EIP-712 TransferWithAuthorization
  console.log(`\n🔨 Step 3: Signing EIP-712 TransferWithAuthorization...`);

  const recipient = paymentReq.payment.recipient;
  const amount = paymentReq.payment.amount;
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const message = {
    from: account.address,
    to: recipient,
    value: BigInt(amount),
    validAfter,
    validBefore,
    nonce,
  };

  console.log(`   From: ${account.address}`);
  console.log(`   To: ${recipient}`);
  console.log(`   Value: ${formatUnits(BigInt(amount), 6)} USDC`);
  console.log(`   Nonce: ${nonce.substring(0, 18)}...`);

  const signature = await walletClient.signTypedData({
    domain: USDC_DOMAIN,
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message,
  });

  console.log(`   ✅ EIP-712 signature created`);

  // Step 4: Encode X-Payment header
  console.log(`\n📦 Step 4: Encoding X-Payment header...`);

  const paymentProof = {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: {
      signature,
      authorization: {
        from: account.address,
        to: recipient,
        value: amount.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };

  const xPaymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString("base64");
  console.log(`   ✅ Payment proof encoded (${xPaymentHeader.length} chars)`);

  // Step 5: Retry with payment
  console.log(`\n🔄 Step 5: Retrying with X-Payment header...`);

  const paidResponse = await fetch(`${SELLER_URL}/v1/ai/inference`, {
    headers: { "X-Payment": xPaymentHeader },
  });

  const result = await paidResponse.json();

  if (paidResponse.status === 200 && result.success) {
    console.log(`\n✅ ============================================`);
    console.log(`   REAL x402 BASE MAINNET TRANSACTION COMPLETE!`);
    console.log(`   ============================================`);
    console.log(`   Status: ${paidResponse.status} OK`);
    console.log(`   AI Result: ${result.data?.result}`);
    console.log(`\n   EIP-3009 Payment Details:`);
    console.log(`   Amount: ${result.payment?.amount}`);
    console.log(`   Network: ${result.payment?.network}`);
    console.log(`   Chain ID: ${result.payment?.chainId}`);
    console.log(`   Settlement: ${result.payment?.settlementMethod}`);
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
}

runBuyerAgent().catch((err) => {
  console.error(`\n❌ BuyerBot-7 error: ${err.message}`);
  process.exit(1);
});
