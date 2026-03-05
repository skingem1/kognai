/**
 * Solana USDC settlement detector — raw JSON-RPC, no @solana/web3.js
 * @module solana-detector
 */
import { ChainConfig } from '../../lib/chain-registry';
import { SettlementMatch } from './evm-detector';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

/** Fire a Solana JSON-RPC call and unwrap the result. */
async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Solana RPC HTTP ${res.status}`);
  const json = await res.json() as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`Solana RPC: ${json.error.message}`);
  return json.result as T;
}

/** Detects USDC SPL transfers on Solana using raw JSON-RPC (no external SDK). */
export class SolanaSettlementDetector {
  constructor(private readonly chain: Pick<ChainConfig, 'rpcUrl' | 'id'>) {}

  /** Return recent USDC transfers to walletAddress. */
  async getRecentUsdcTransfers(walletAddress: string, limit = 20): Promise<SettlementMatch[]> {
    type SigInfo = { signature: string; blockTime: number | null };
    const sigs = await rpc<SigInfo[]>(this.chain.rpcUrl, 'getSignaturesForAddress', [
      walletAddress,
      { limit },
    ]);
    const results: SettlementMatch[] = [];
    for (const { signature, blockTime } of sigs) {
      const m = await this._parseTx(signature, blockTime ?? 0);
      if (m && m.to.toLowerCase() === walletAddress.toLowerCase()) results.push(m);
    }
    return results;
  }

  /** Verify a tx transferred >= expectedAmountUsdc to expectedRecipient. */
  async verifyTransfer(
    txSig: string,
    expectedRecipient: string,
    expectedAmountUsdc: number
  ): Promise<boolean> {
    const m = await this._parseTx(txSig, 0);
    return (
      !!m &&
      m.to.toLowerCase() === expectedRecipient.toLowerCase() &&
      m.amount >= expectedAmountUsdc
    );
  }

  private async _parseTx(sig: string, blockTime: number): Promise<SettlementMatch | null> {
    type Ix = {
      programId: string;
      parsed?: {
        type: string;
        info: { source: string; destination: string; tokenAmount?: { uiAmount: number }; mint?: string };
      };
      data?: string;
    };
    type TxResult = { transaction: { message: { instructions: Ix[] } } };
    const tx = await rpc<TxResult | null>(this.chain.rpcUrl, 'getTransaction', [
      sig,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx) return null;

    let invoiceId = '';
    let match: SettlementMatch | null = null;

    for (const ix of tx.transaction.message.instructions) {
      if (ix.programId === MEMO_PROGRAM && ix.data) {
        try { invoiceId = Buffer.from(ix.data, 'base64').toString('utf8'); } catch { /* skip */ }
      }
      if (ix.programId === TOKEN_PROGRAM && ix.parsed) {
        const { type, info } = ix.parsed;
        const isTransfer = type === 'transfer' || type === 'transferChecked';
        if (isTransfer && info.mint === USDC_MINT && info.tokenAmount?.uiAmount != null) {
          match = {
            invoiceId,
            txHash: sig,
            amount: info.tokenAmount.uiAmount,
            from: info.source,
            to: info.destination,
            blockNumber: 0,
            timestamp: blockTime,
            chain: this.chain.id,
          };
        }
      }
    }
    if (match) match.invoiceId = invoiceId;
    return match;
  }
}
