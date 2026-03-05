/**
 * wallet-service.ts
 * Retrieves agent private keys from Supabase Vault and performs x402 USDC payments
 * on Base mainnet using EIP-3009 TransferWithAuthorization.
 * Keys NEVER touch the filesystem — fetched from vault at runtime only.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_RPC     = 'https://mainnet.base.org';
export const CHAIN_ID     = 8453;

/** Fetch a decrypted private key from Supabase Vault by agent name */
export async function getAgentPrivateKey(agentName: string): Promise<string> {
  const { data, error } = await supabase
    .rpc('vault_secret_by_name', { secret_name: `agent_wallet_pk_${agentName}` });
  if (error || !data) throw new Error(`Vault key not found for agent: ${agentName}`);
  return data as string;
}

/** Get all agent wallet addresses from DB (no private keys) */
export async function getAgentWallets() {
  const { data, error } = await supabase
    .from('agent_wallets')
    .select('agent_name, address, usdc_balance, low_balance_threshold, top_up_amount, is_treasury, last_balance_check')
    .order('agent_name');
  if (error) throw error;
  return data;
}

/** Update cached USDC balance in DB */
export async function updateBalance(agentName: string, balanceUsdc: number) {
  await supabase
    .from('agent_wallets')
    .update({ usdc_balance: balanceUsdc, last_balance_check: new Date().toISOString() })
    .eq('agent_name', agentName);
}

/** Create a top-up request */
export async function createTopupRequest(agentName: string, amountUsdc: number, reason: string) {
  const { data, error } = await supabase
    .from('agent_topup_requests')
    .insert({ agent_name: agentName, amount_usdc: amountUsdc, reason, status: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Approve a top-up request */
export async function approveTopupRequest(requestId: string) {
  await supabase
    .from('agent_topup_requests')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', requestId);
}

/** Mark top-up completed with tx hash */
export async function completeTopupRequest(requestId: string, txHash: string) {
  await supabase
    .from('agent_topup_requests')
    .update({ status: 'completed', completed_at: new Date().toISOString(), tx_hash: txHash })
    .eq('id', requestId);
  // Update last_top_up on wallet
  const { data: req } = await supabase
    .from('agent_topup_requests')
    .select('agent_name')
    .eq('id', requestId)
    .single();
  if (req) {
    await supabase
      .from('agent_wallets')
      .update({ last_top_up: new Date().toISOString() })
      .eq('agent_name', req.agent_name);
  }
}

/** Get pending top-up requests */
export async function getPendingTopups() {
  const { data } = await supabase
    .from('agent_topup_requests')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at');
  return data || [];
}
