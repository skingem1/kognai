import { SolanaSettlementDetector } from './solana-detector';
import { Connection, PublicKey } from '@solana/web3.js';

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getSignaturesForAddress: jest.fn(),
    getTransaction: jest.fn(),
  })),
  PublicKey: jest.fn().mockImplementation((addr: string) => ({ toString: () => addr })),
}));

describe('SolanaSettlementDetector', () => {
  const mockChain = { rpcUrl: 'https://api.mainnet-beta.solana.com', chainId: 'mainnet', chainType: 'solana' as const };
  let detector: SolanaSettlementDetector;

  beforeEach(() => {
    detector = new SolanaSettlementDetector(mockChain);
  });

  describe('getRecentUsdcTransfers', () => {
    it('returns parsed USDC transfers from signatures', async () => {
      const mockConnection = (detector as any).connection;
      mockConnection.getSignaturesForAddress.mockResolvedValueOnce([{ signature: 'sig1', blockTime: 1000 }]);
      mockConnection.getTransaction.mockResolvedValueOnce({
        meta: { preTokenBalances: [], postTokenBalances: [], err: null },
        transaction: { message: { instructions: [{
          program: 'spl-token',
          parsed: { type: 'transfer', info: { source: 'from', destination: 'to', amount: '1000000' } }
        }]}},
      });

      const result = await detector.getRecentUsdcTransfers('wallet');
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(1);
      expect(result[0].txSignature).toBe('sig1');
    });

    it('returns empty array on RPC error', async () => {
      const mockConnection = (detector as any).connection;
      mockConnection.getSignaturesForAddress.mockRejectedValueOnce(new Error('RPC error'));

      const result = await detector.getRecentUsdcTransfers('wallet');
      expect(result).toEqual([]);
    });
  });

  describe('verifyTransfer', () => {
    it('returns true for valid USDC transfer to recipient', async () => {
      const mockConnection = (detector as any).connection;
      mockConnection.getTransaction.mockResolvedValueOnce({
        meta: { postTokenBalances: [{ mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', owner: 'recipient' }], err: null },
        transaction: { message: { instructions: [{
          program: 'spl-token',
          parsed: { type: 'transfer', info: { destination: 'recipient', amount: '5000000' } }
        }]}},
      });

      const result = await detector.verifyTransfer('sig', 'recipient', 3);
      expect(result).toBe(true);
    });

    it('returns false for wrong recipient', async () => {
      const mockConnection = (detector as any).connection;
      mockConnection.getTransaction.mockResolvedValueOnce({
        meta: { postTokenBalances: [{ mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', owner: 'other' }], err: null },
        transaction: { message: { instructions: [{ program: 'spl-token', parsed: { type: 'transfer', info: { destination: 'other', amount: '5000000' } } }]}},
      });

      const result = await detector.verifyTransfer('sig', 'recipient', 3);
      expect(result).toBe(false);
    });
  });

  describe('extractMemo', () => {
    it('returns memo string when present', async () => {
      const mockConnection = (detector as any).connection;
      mockConnection.getTransaction.mockResolvedValueOnce({
        transaction: { message: { instructions: [{ program: 'memo', parsed: 'test-memo' }]}},
      });

      const result = await detector.extractMemo('sig');
      expect(result).toBe('test-memo');
    });

    it('returns null when no memo', async () => {
      const mockConnection = (detector as any).connection;
      mockConnection.getTransaction.mockResolvedValueOnce({
        transaction: { message: { instructions: [{ program: 'other' }]}},
      });

      const result = await detector.extractMemo('sig');
      expect(result).toBeNull();
    });
  });
});