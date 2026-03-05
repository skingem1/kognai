/**
 * wallet-monitor.ts
 * Checks USDC balances for all agent wallets on Base mainnet.
 * Sends Telegram alert to CEO when any wallet falls below threshold.
 * Run via PM2 cron or standalone: ts-node scripts/wallet-monitor.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import { getAgentWallets, updateBalance, createTopupRequest } from './wallet-service';

const TELEGRAM_BOT_TOKEN = process.env.CEO_TELEGRAM_BOT_TOKEN!;
const OWNER_CHAT_ID      = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID;
const USDC_ABI_BALANCE   = '0x70a08231'; // balanceOf(address) selector
const BASE_RPC           = 'https://base.gateway.tenderly.co';
const USDC_ADDRESS       = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

async function getUsdcBalance(address: string): Promise<number> {
  const paddedAddr = address.slice(2).padStart(64, '0');
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: USDC_ADDRESS, data: USDC_ABI_BALANCE + paddedAddr }, 'latest']
    })
  });
  const json = await res.json() as { result: string };
  const raw = BigInt(json.result || '0x0');
  return Number(raw) / 1_000_000; // USDC has 6 decimals
}

async function sendTelegramAlert(topupId: string, agentName: string, balance: number, needed: number) {
  if (!TELEGRAM_BOT_TOKEN || !OWNER_CHAT_ID) {
    console.warn('[wallet-monitor] No Telegram config — skipping alert');
    return;
  }
  const msg = [
    `💰 *Agent Wallet Low Balance Alert*`,
    ``,
    `Agent: \`${agentName}\``,
    `Current balance: \`$${balance.toFixed(2)} USDC\``,
    `Top-up needed: \`$${needed.toFixed(2)} USDC\``,
    ``,
    `Reply with:`,
    `/approve_topup ${topupId}  — send USDC now`,
    `/reject_topup ${topupId}   — skip this time`,
  ].join('\n');

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: OWNER_CHAT_ID, text: msg, parse_mode: 'Markdown' })
  });
  console.log(`[wallet-monitor] Alert sent for ${agentName}`);
}

async function main() {
  console.log('[wallet-monitor] Checking agent wallet balances...');
  const wallets = await getAgentWallets();

  for (const w of wallets!) {
    try {
      const balance = await getUsdcBalance(w.address);
      await updateBalance(w.agent_name, balance);
      console.log(`  ${w.agent_name}: $${balance.toFixed(4)} USDC (threshold: $${w.low_balance_threshold})`);

      if (balance < Number(w.low_balance_threshold)) {
        console.log(`  ⚠️  ${w.agent_name} is below threshold — creating top-up request`);
        const req = await createTopupRequest(
          w.agent_name,
          Number(w.top_up_amount),
          `Balance $${balance.toFixed(2)} fell below $${w.low_balance_threshold} threshold`
        );
        await sendTelegramAlert(req.id, w.agent_name, balance, Number(w.top_up_amount));
      }
    } catch (err: any) {
      console.error(`  ✗ ${w.agent_name}: ${err.message}`);
    }
  }
  console.log('[wallet-monitor] Done.');
}

main().catch(console.error);
