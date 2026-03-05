import { Request, Response, NextFunction } from 'express';
import { createPublicClient, http, parseAbi, verifyTypedData } from 'viem';
import { base } from 'viem/chains';

/**
 * x402 Payment Verification Middleware
 * Implements HTTP 402 Payment Required with EIP-3009 TransferWithAuthorization on Base mainnet
 */

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// Seller wallet receives payment — must be set via X402_SELLER_WALLET in .env
// Never hardcode the address in source (public repo).
const SELLER_WALLET = (process.env.X402_SELLER_WALLET || process.env.SELLER_WALLET || '') as `0x${string}`;
if (!SELLER_WALLET) console.error('[x402] WARNING: X402_SELLER_WALLET not set in .env — all payment verifications will fail');

// Price per inference call (default: 0.001 USDC = 1000 atomic units)
const PRICE_ATOMIC = BigInt(process.env.X402_PRICE_ATOMIC || '1000');
const PRICE_DISPLAY = `${Number(PRICE_ATOMIC) / 1_000_000} USDC`;

// EIP-712 domain for USDC on Base mainnet
const USDC_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 8453,
  verifyingContract: USDC_ADDRESS,
} as const;

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

const USDC_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
]);

const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC),
});

// In-memory nonce cache to prevent double-spend within same process lifetime
const usedNonces = new Set<string>();

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      x402Payment?: {
        from: string;
        to: string;
        value: bigint;
        nonce: string;
        signature: string;
        validBefore: bigint;
      };
    }
  }
}

/**
 * Returns the 402 Payment Required response body
 */
export function get402Response() {
  return {
    x402Version: 1,
    scheme: 'exact',
    network: 'base',
    payment: {
      recipient: SELLER_WALLET,
      token: USDC_ADDRESS,
      amount: PRICE_ATOMIC.toString(),
      amountUSDC: Number(PRICE_ATOMIC) / 1_000_000,
      chainId: 8453,
      description: `Invoica AI Inference - ${PRICE_DISPLAY} per call`,
    },
    facilitator: 'self-verified',
  };
}

/**
 * Express middleware: verifies X-Payment header containing EIP-3009 authorization
 * If missing -> 402. If present and valid -> next(). If invalid -> 402 with error.
 */
export async function requireX402Payment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const paymentHeader = req.header('X-Payment');

  if (!paymentHeader) {
    res.status(402).json(get402Response());
    return;
  }

  try {
    // Decode base64 payment proof
    const paymentData = JSON.parse(
      Buffer.from(paymentHeader, 'base64').toString('utf-8')
    );
    const { authorization, signature } = paymentData.payload;

    const from = authorization.from as `0x${string}`;
    const to = authorization.to as `0x${string}`;
    const value = BigInt(authorization.value);
    const validAfter = BigInt(authorization.validAfter);
    const validBefore = BigInt(authorization.validBefore);
    const nonce = authorization.nonce as `0x${string}`;

    // 1. Verify recipient
    if (to.toLowerCase() !== SELLER_WALLET.toLowerCase()) {
      res.status(402).json({ error: 'Invalid recipient', expected: SELLER_WALLET });
      return;
    }

    // 2. Verify amount
    if (value < PRICE_ATOMIC) {
      res.status(402).json({ error: 'Insufficient payment', required: PRICE_ATOMIC.toString(), provided: value.toString() });
      return;
    }

    // 3. Verify time validity
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (validBefore < now) {
      res.status(402).json({ error: 'Authorization expired' });
      return;
    }
    if (validAfter > now) {
      res.status(402).json({ error: 'Authorization not yet valid' });
      return;
    }

    // 4. Check nonce not used (in-memory fast check)
    const nonceKey = `${from.toLowerCase()}:${nonce}`;
    if (usedNonces.has(nonceKey)) {
      res.status(402).json({ error: 'Nonce already used (replay prevented)' });
      return;
    }

    // 5. Verify EIP-712 signature
    const isValid = await verifyTypedData({
      address: from,
      domain: USDC_DOMAIN,
      types: TRANSFER_WITH_AUTH_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: { from, to, value, validAfter, validBefore, nonce },
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      res.status(402).json({ error: 'Invalid EIP-712 signature' });
      return;
    }

    // 6. Check on-chain nonce freshness (authorizationState)
    try {
      const nonceUsed = await (publicClient as any).readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'authorizationState',
        args: [from, nonce],
      });
      if (nonceUsed) {
        res.status(402).json({ error: 'Nonce already used on-chain' });
        return;
      }
    } catch (rpcErr) {
      // RPC error -- log but don't block (signature verification already done)
      console.warn('[x402] authorizationState RPC check failed:', (rpcErr as Error).message);
    }

    // Mark nonce as used in memory
    usedNonces.add(nonceKey);

    // Attach payment proof to request
    req.x402Payment = { from, to, value, nonce, signature, validBefore };

    console.log(`[x402] Payment verified: ${Number(value) / 1_000_000} USDC from ${from.slice(0, 10)}...`);
    next();
  } catch (err) {
    console.error('[x402] Payment verification error:', (err as Error).message);
    res.status(402).json({ error: 'Payment verification failed', message: (err as Error).message });
  }
}
