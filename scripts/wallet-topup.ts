/**
 * wallet-topup.ts
 * Executes an approved top-up: CEO wallet sends USDC to target agent wallet.
 * Called by the CEO Telegram bot after owner approval.
 * Uses viem to send an on-chain USDC transfer on Base mainnet.
 */
import dotenv from 'dotenv';
dotenv.config();

// Dynamic viem imports (ESM-compatible wrapper)
export async function executeTopup(requestId: string): Promise<string> {
  const { createPublicClient, createWalletClient, http, parseAbi, parseUnits } = await import('viem') as any;
  const { privateKeyToAccount } = await import('viem/accounts') as any;
  const { base } = await import('viem/chains') as any;
  const { getAgentPrivateKey, getAgentWallets, completeTopupRequest, USDC_ADDRESS, BASE_RPC } = await import('./wallet-service') as any;

  // Get request details
  const { createClient } = await import('@supabase/supabase-js') as any;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: req } = await supabase
    .from('agent_topup_requests')
    .select('*')
    .eq('id', requestId)
    .eq('status', 'approved')
    .single();

  if (!req) throw new Error(`No approved top-up request found: ${requestId}`);

  // Get CEO private key from vault
  const ceoKey = await getAgentPrivateKey('ceo');
  const ceoAccount = privateKeyToAccount(ceoKey);

  // Get target wallet address
  const wallets = await getAgentWallets();
  const target = wallets.find((w: any) => w.agent_name === req.agent_name);
  if (!target) throw new Error(`Agent wallet not found: ${req.agent_name}`);

  // Build viem clients
  const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  const walletClient = createWalletClient({ account: ceoAccount, chain: base, transport: http(BASE_RPC) });

  const usdcAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
  const amount  = parseUnits(req.amount_usdc.toString(), 6); // USDC 6 decimals

  console.log(`[wallet-topup] Sending ${req.amount_usdc} USDC from CEO → ${req.agent_name} (${target.address})`);

  const txHash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: 'transfer',
    args: [target.address, amount],
  });

  console.log(`[wallet-topup] TX submitted: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[wallet-topup] TX confirmed: ${txHash}`);

  await completeTopupRequest(requestId, txHash);
  return txHash;
}
