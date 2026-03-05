import { SolanaSettlementDetector, SOLANA_USDC_MINT, SOLANA_TOKEN_PROGRAM } from '../solana-detector';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SolanaSettlementDetector', () => {
  const mockChainConfig = {
    chainId: 'solana:mainnet',
    name: 'Solana Mainnet',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
    },
  };

  let detector: SolanaSettlementDetector;

  beforeEach(() => {
    detector = new SolanaSettlementDetector(mockChainConfig);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw error if RPC URL is missing', () => {
      expect(() => new SolanaSettlementDetector({ ...mockChainConfig, rpcUrl: '' })).toThrow(
        'RPC URL is required for Solana settlement detection'
      );
    });

    it('should create instance with valid config', () => {
      expect(detector).toBeInstanceOf(SolanaSettlementDetector);
    });
  });

  describe('getRecentUsdcTransfers', () => {
    const validWalletAddress = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

    it('should throw error for invalid wallet address', async () => {
      await expect(detector.getRecentUsdcTransfers('invalid-address')).rejects.toThrow(
        'Invalid Solana address'
      );
    });

    it('should throw error for invalid limit', async () => {
      await expect(detector.getRecentUsdcTransfers(validWalletAddress, 0)).rejects.toThrow(
        'Limit must be between 1 and 100'
      );
      await expect(detector.getRecentUsdcTransfers(validWalletAddress, 101)).rejects.toThrow(
        'Limit must be between 1 and 100'
      );
    });

    it('should return empty array when no transactions found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: [],
        }),
      });

      const result = await detector.getRecentUsdcTransfers(validWalletAddress);
      expect(result).toEqual([]);
    });

    it('should return settlement matches for valid USDC transfers', async () => {
      const mockSignature = '5wTgL6kChzzs5hGxzKxXKxVJsY3M4j7QVNxW8P9Yv2XKzL6R3mN8pQ1wE4rT7uY';
      
      // Mock getSignaturesForAddress response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: [
            {
              signature: mockSignature,
              slot: 123456789,
              blockTime: 1640000000,
              confirmationStatus: 'confirmed',
            },
          ],
        }),
      });

      // Mock getTransaction response with USDC transfer
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 2,
          result: {
            slot: 123456789,
            blockTime: 1640000000,
            transaction: {
              message: {
                accountKeys: [
                  { pubkey: 'sender123', signer: true, writable: true },
                  { pubkey: validWalletAddress, signer: false, writable: true },
                  { pubkey: SOLANA_USDC_MINT, signer: false, writable: false },
                ],
                instructions: [
                  {
                    program: 'spl-token',
                    programId: SOLANA_TOKEN_PROGRAM,
                    type: 'transferChecked',
                    accounts: [
                      { pubkey: 'sender123', isSigner: true, isWritable: true },
                      { pubkey: SOLANA_USDC_MINT, isSigner: false, isWritable: false },
                      { pubkey: validWalletAddress, isSigner: false, isWritable: true },
                      { pubkey: 'authority', isSigner: true, isWritable: false },
                    ],
                    data: 'test',
                  },
                ],
              },
              signatures: [mockSignature],
            },
            meta: {
              fee: 5000,
              preBalances: [1000000000, 0],
              postBalances: [999950000, 0],
              preTokenBalances: [],
              postTokenBalances: [
                {
                  mint: SOLANA_USDC_MINT,
                  owner: validWalletAddress,
                  amount: '1000000', // 1 USDC (6 decimals)
                  decimals: 6,
                },
              ],
              logMessages: [],
              err: null,
              status: { Ok: null },
            },
          },
        }),
      });

      const result = await detector.getRecentUsdcTransfers(validWalletAddress);

      expect(result).toHaveLength(1);
      expect(result[0].txHash).toBe(mockSignature);
      expect(result[0].to).toBe(validWalletAddress);
      expect(result[0].amount).toBe('1000000');
      expect(result[0].token).toBe(SOLANA_USDC_MINT);
      expect(result[0].confirmed).toBe(true);
    });

    it('should extract memo from transaction when present', async () => {
      const mockSignature = 'mock-signature-123';
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: [{ signature: mockSignature, slot: 1, blockTime: 1, confirmationStatus: 'confirmed' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 2,
            result: {
              slot: 1,
              blockTime: 1,
              transaction: {
                message: {
                  accountKeys: [
                    { pubkey: 'sender', signer: true, writable: true },
                    { pubkey: validWalletAddress, signer: false, writable: true },
                  ],
                  instructions: [
                    {
                      program: 'spl-token',
                      programId: SOLANA_TOKEN_PROGRAM,
                      type: 'transfer',
                      accounts: [
                        { pubkey: 'sender', isSigner: true, isWritable: true },
                        { pubkey: validWalletAddress, isSigner: false, isWritable: true },
                      ],
                      data: '',
                    },
                    {
                      program: 'memo',
                      programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
                      data: 'aW52b2ljZTpURVNULTEyMw==', // base64 for "invoice:TEST-123"
                    },
                  ],
                },
                signatures: [mockSignature],
              },
              meta: {
                fee: 5000,
                preBalances: [],
                postBalances: [],
                preTokenBalances: [],
                postTokenBalances: [
                  { mint: SOLANA_USDC_MINT, owner: validWalletAddress, amount: '100', decimals: 6 },
                ],
                logMessages: [],
                err: null,
                status: { Ok: null },
              },
            },
          }),
        });

      const result = await detector.getRecentUsdcTransfers(validWalletAddress);

      expect(result).toHaveLength(1);
      expect(result[0].memo).toBe('invoice:TEST-123');
      expect(result[0].invoiceId).toBe('TEST-123');
    });
  });

  describe('verifyTransfer', () => {
    const validRecipient = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

    it('should throw error for invalid recipient address', async () => {
      await expect(detector.verifyTransfer('sig123', 'invalid', 100)).rejects.toThrow(
        'Invalid recipient address'
      );
    });

    it('should throw error for invalid signature format', async () => {
      await expect(detector.verifyTransfer('short', validRecipient, 100)).rejects.toThrow(
        'Invalid transaction signature format'
      );
    });

    it('should return false for non-existent transaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: null,
        }),
      });

      const result = await detector.verifyTransfer(
        '5wTgL6kChzzs5hGxzKxXKxVJsY3M4j7QVNxW8P9Yv2XKzL6R3mN8pQ1wE4rT7uY',
        validRecipient,
        1000000
      );

      expect(result).toBe(false);
    });

    it('should return false for failed transaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            slot: 1,
            meta: {
              err: { Err: { InstructionError: 0 } },
            },
          },
        }),
      });

      const result = await detector.verifyTransfer(
        '5wTgL6kChzzs5hGxzKxXKxVJsY3M4j7QVNxW8P9Yv2XKzL6R3mN8pQ1wE4rT7uY',
        validRecipient,
        1000000
      );

      expect(result).toBe(false);
    });

    it('should return true for matching USDC transfer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            slot: 1,
            transaction: {
              message: {
                accountKeys: [
                  { pubkey: 'sender', signer: true, writable: true },
                  { pubkey: validRecipient, signer: false, writable: true },
                ],
                instructions: [
                  {
                    program: 'spl-token',
                    programId: SOLANA_TOKEN_PROGRAM,
                    type: 'transferChecked',
                    accounts: [
                      { pubkey: 'sender', isSigner: true, isWritable: true },
                      { pubkey: SOLANA_USDC_MINT, isSigner: false, isWritable: false },
                      { pubkey: validRecipient, isSigner: false, isWritable: true },
                    ],
                    data: '',
                  },
                ],
              },
              signatures: ['sig'],
            },
            meta: {
              err: null,
              preTokenBalances: [],
              postTokenBalances: [
                { mint: SOLANA_USDC_MINT, owner: validRecipient, amount: '1000000', decimals: 6 },
              ],
            },
          },
        }),
      });

      const result = await detector.verifyTransfer(
        '5wTgL6kChzzs5hGxzKxXKxVJsY3M4j7QVNxW8P9Yv2XKzL6R3mN8pQ1wE4rT7uY',
        validRecipient,
        1000000
      );

      expect(result).toBe(true);
    });

    it('should return true when transfer amount exceeds expected', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            slot: 1,
            transaction: {
              message: {
                accountKeys: [],
                instructions: [
                  {
                    program: 'spl-token',
                    programId: SOLANA_TOKEN_PROGRAM,
                    type: 'transfer',
                    accounts: [],
                    data: '',
                  },
                ],
              },
              signatures: ['sig'],
            },
            meta: {
              err: null,
              preTokenBalances: [],
              postTokenBalances: [
                { mint: SOLANA_USDC_MINT, owner: validRecipient, amount: '2000000', decimals: 6 },
              ],
            },
          },
        }),
      });

      const result = await detector.verifyTransfer(
        '5wTgL6kChzzs5hGxzKxXKxVJsY3M4j7QVNxW8P9Yv2XKzL6R3mN8pQ1wE4rT7uY',
        validRecipient,
        1000000
      );

      expect(result).toBe(true);
    });
  });

  describe('extractMemo', () => {
    it('should throw error for invalid signature format', async () => {
      await expect(detector.extractMemo('short')).rejects.toThrow(
        'Invalid transaction signature format'
      );
    });

    it('should return null for non-existent transaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: null,
        }),
      });

      const result = await detector.extractMemo('5wTgL6kChzzs5hGxzKxXKxVJsY3M4j7QVNxW8P9Yv2XKzL6R3mN8pQ1wE4rT7uY');

      expect(result).toBeNull();
    });

    it('should return memo when present in transaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            transaction: {
              message: {
                instructions: [
                  {
                    program: 'memo',
                    programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
                    data: 'dGVzdA==', // base64 for "test"
                  },
                ],
              },
            },
          },
        }),
      });

      const result = await detector.extractMemo('5wTgL6kChzzs5hGxzKxXKxVJsY3M4j7QVNxW8P9Yv2XKzL6R3mN8pQ1wE4rT7uY');

      expect(result).toBe('test');
    });

    it('should return null when no memo in transaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            transaction: {
              message: {
                instructions: [
                  {
                    program: 'spl-token',
                    programId: SOLANA_TOKEN_PROGRAM,
                    type: 'transfer',
                    accounts: [],
                    data: '',
                  },
                ],
              },
            },
          },
        }),
      });

      const result = await detector.extractMemo('5wTgL6kChzzs5hGxzKxXKxVJsY3M4j7QVNxW8P9Yv2XKzL6R3mN8pQ1wE4rT7uY');

      expect(result).toBeNull();
    });
  });

  describe('constants', () => {
    it('should have correct USDC mint address', () => {
      expect(SOLANA_USDC_MINT).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    });

    it('should have correct token program address', () => {
      expect(SOLANA_TOKEN_PROGRAM).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    });
  });
});
