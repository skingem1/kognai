/**
 * Settlement router — dispatches USDC detection to the correct chain detector.
 * Thin routing layer: no business logic, just chain-type dispatch.
 * @module settlement-router
 */
import { getChain, isEvmChain } from '../../lib/chain-registry';
import { EvmSettlementDetector, SettlementMatch } from './evm-detector';
import { SolanaSettlementDetector } from './solana-detector';

/**
 * Check for USDC payments to a recipient on any supported chain.
 * Routes to EvmSettlementDetector (Base, Polygon) or SolanaSettlementDetector.
 *
 * @param chainId        - Chain ID from registry ('base' | 'polygon' | 'solana')
 * @param recipientAddress - Address/pubkey to scan for incoming payments
 * @param options        - fromBlock (EVM), limit (Solana), expectedAmountUsdc
 */
export async function checkSettlement(
  chainId: string,
  recipientAddress: string,
  options?: {
    expectedAmountUsdc?: number;
    fromBlock?: number;
    limit?: number;
  }
): Promise<SettlementMatch[]> {
  const chain = getChain(chainId);

  if (isEvmChain(chainId)) {
    const detector = new EvmSettlementDetector(chain);
    const fromBlock = options?.fromBlock ?? 'latest';
    return detector.scanTransfersToAddress(recipientAddress, fromBlock, 'latest');
  }

  const detector = new SolanaSettlementDetector(chain);
  return detector.getRecentUsdcTransfers(recipientAddress, options?.limit ?? 20);
}

/**
 * Verify a specific transaction is a valid USDC payment.
 *
 * @param chainId            - Chain identifier
 * @param txId               - Transaction hash (EVM) or signature (Solana)
 * @param recipientAddress   - Expected recipient address/pubkey
 * @param expectedAmountUsdc - Minimum USDC amount required
 */
export async function verifyPayment(
  chainId: string,
  txId: string,
  recipientAddress: string,
  expectedAmountUsdc: number
): Promise<boolean> {
  const chain = getChain(chainId);

  if (isEvmChain(chainId)) {
    const detector = new EvmSettlementDetector(chain);
    return detector.verifyTransfer(txId, recipientAddress, expectedAmountUsdc);
  }

  const detector = new SolanaSettlementDetector(chain);
  return detector.verifyTransfer(txId, recipientAddress, expectedAmountUsdc);
}
