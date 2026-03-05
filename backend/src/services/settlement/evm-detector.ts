import { ChainConfig } from '../../lib/chain-registry';

const USDC_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface SettlementMatch {
  invoiceId: string;
  txHash: string;
  amount: number;
  from: string;
  to: string;
  blockNumber: number;
  timestamp: number;
  chain: string;
}

export class EvmSettlementDetector {
  constructor(private chain: ChainConfig) {}

  private async rpc(method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(this.chain.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  async getLatestBlock(): Promise<number> {
    const block = await this.rpc('eth_blockNumber', []) as string;
    return parseInt(block, 16);
  }

  async scanTransfersToAddress(
    recipientAddress: string,
    fromBlock: string | number = 'latest',
    toBlock: string | number = 'latest'
  ): Promise<SettlementMatch[]> {
    const addrPadded = recipientAddress.toLowerCase().replace('0x', '').padStart(64, '0');
    const logs = await this.rpc('eth_getLogs', [{
      address: this.chain.usdcAddress,
      fromBlock: typeof fromBlock === 'number' ? `0x${fromBlock.toString(16)}` : fromBlock,
      toBlock: typeof toBlock === 'number' ? `0x${toBlock.toString(16)}` : toBlock,
      topics: [USDC_TRANSFER_TOPIC, null, `0x${addrPadded}`]
    }]) as Array<{ blockNumber: string; transactionHash: string; topics: string[]; data: string }>;

    const matches: SettlementMatch[] = [];
    for (const log of logs) {
      const block = await this.rpc('eth_getBlockByNumber', [log.blockNumber, false]) as { timestamp: string } | null;
      matches.push({
        invoiceId: '',
        txHash: log.transactionHash,
        amount: Number(BigInt(log.data)) / 1e6,
        from: `0x${log.topics[1].slice(-40)}`,
        to: `0x${log.topics[2].slice(-40)}`,
        blockNumber: parseInt(log.blockNumber, 16),
        timestamp: block ? parseInt(block.timestamp, 16) : 0,
        chain: this.chain.name
      });
    }
    return matches;
  }

  async verifyTransfer(txHash: string, expectedRecipient: string, expectedAmount: number): Promise<boolean> {
    const receipt = await this.rpc('eth_getTransactionReceipt', [txHash]) as {
      logs: Array<{ address: string; topics: string[]; data: string }>;
    } | null;
    if (!receipt) return false;
    for (const log of receipt.logs) {
      if (log.topics[0] !== USDC_TRANSFER_TOPIC) continue;
      const to = `0x${log.topics[2].slice(-40)}`.toLowerCase();
      const amount = Number(BigInt(log.data)) / 1e6;
      if (to === expectedRecipient.toLowerCase() && amount === expectedAmount) return true;
    }
    return false;
  }
}