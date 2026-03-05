import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '/home/invoica/apps/Invoica/.env' });

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ABI = [
  { name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_WALLETS = {
  cfo:     '0x7B5BE6D949bC3FcD5BBc62fc6cB03a406e187571',
  cto:     '0x3e127c918C83714616CF2416f8A620F1340C19f1',
  cmo:     '0xEDc68bBC5dF3f0873d33d6654921594Fe42dcbc0',
  bizdev:  '0xfd9CF7e2F1C7e5E937F740a0D8398cef7C44a546',
  fast:    '0xfB7792E7CaEa2c96570d1eD62e205B8Dc7320d45',
  code:    '0xB6C18ec7b13649756436913856eA9F82c13c5c25',
  support: '0x51A96753db8709AAf9974689DC17fd9B77830aaC'
};

const AMOUNT_PER_AGENT = '10.0'; // $10 USDC each

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getPrivateKey(agentName) {
  const { data, error } = await supabase.rpc('vault_secret_by_name', { secret_name: `agent_wallet_pk_${agentName}` });
  if (error) throw new Error(`Vault error for ${agentName}: ${error.message}`);
  if (!data) throw new Error(`No key found for ${agentName}`);
  return data;
}

async function main() {
  console.log('Fetching CEO private key from Supabase Vault...');
  const ceoPk = await getPrivateKey('ceo');
  const ceoAccount = privateKeyToAccount(ceoPk);
  console.log('CEO address:', ceoAccount.address);

  const rpcs = [
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://base-rpc.publicnode.com'
  ];

  let rpcIndex = 0;
  const getClients = () => {
    const rpc = rpcs[rpcIndex % rpcs.length];
    return {
      public: createPublicClient({ chain: base, transport: http(rpc) }),
      wallet: createWalletClient({ account: ceoAccount, chain: base, transport: http(rpc) }),
      rpc
    };
  };

  let { public: publicClient } = getClients();
  const ceoBalance = await publicClient.readContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: [ceoAccount.address]
  });
  console.log(`CEO USDC balance: $${formatUnits(ceoBalance, 6)}`);

  const totalNeeded = parseUnits(AMOUNT_PER_AGENT, 6) * BigInt(Object.keys(AGENT_WALLETS).length);
  console.log(`Total to distribute: $${formatUnits(totalNeeded, 6)} to ${Object.keys(AGENT_WALLETS).length} agents`);

  if (ceoBalance < totalNeeded) {
    console.error('Insufficient balance!');
    process.exit(1);
  }

  const results = [];
  const agentEntries = Object.entries(AGENT_WALLETS);

  for (let i = 0; i < agentEntries.length; i++) {
    const [agentName, toAddress] = agentEntries[i];
    console.log(`\nSending $${AMOUNT_PER_AGENT} USDC to ${agentName} (${toAddress})...`);

    let success = false;
    let attempts = 0;

    while (attempts < 3 && !success) {
      attempts++;
      if (attempts > 1) { rpcIndex++; await sleep(4000); }
      try {
        const { wallet: walletClient } = getClients();
        const hash = await walletClient.writeContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'transfer',
          args: [toAddress, parseUnits(AMOUNT_PER_AGENT, 6)]
        });
        console.log(`  TX: ${hash}`);
        console.log(`  https://basescan.org/tx/${hash}`);

        await supabase.from('agent_wallets').upsert({
          agent_name: agentName,
          address: toAddress,
          usdc_balance: 10.0,
          last_balance_check: new Date().toISOString(),
          last_top_up: new Date().toISOString()
        }, { onConflict: 'agent_name' });

        results.push({ agent: agentName, hash, status: 'sent' });
        success = true;
      } catch (err) {
        console.error(`  Attempt ${attempts} failed:`, err.shortMessage || err.message?.slice(0, 120));
        if (attempts >= 3) results.push({ agent: agentName, hash: null, status: 'failed', error: err.message?.slice(0, 100) });
      }
    }

    if (i < agentEntries.length - 1) {
      console.log('  Waiting 5s...');
      await sleep(5000);
    }
  }

  console.log('\n=== DISTRIBUTION SUMMARY ===');
  for (const r of results) {
    if (r.status === 'sent') {
      console.log(`OK  ${r.agent}: https://basescan.org/tx/${r.hash}`);
    } else {
      console.log(`ERR ${r.agent}: ${r.error}`);
    }
  }
}

main().catch(console.error);
