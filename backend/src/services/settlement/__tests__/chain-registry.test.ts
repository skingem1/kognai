// backend/src/services/settlement/__tests__/chain-registry.test.ts
import { getChain, isEvmChain, isSolanaChain } from '../../../lib/chain-registry';

describe('chain-registry', () => {
  it('returns config for base', () => {
    const chain = getChain('base');
    expect(chain.chainId).toBe(8453);
    expect(chain.type).toBe('evm');
    expect(chain.usdcAddress).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  });

  it('returns config for polygon', () => {
    const chain = getChain('polygon');
    expect(chain.chainId).toBe(137);
    expect(chain.type).toBe('evm');
  });

  it('returns config for solana', () => {
    const chain = getChain('solana');
    expect(chain.type).toBe('solana');
    expect(chain.usdcAddress).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });

  it('throws for unknown chain', () => {
    expect(() => getChain('arbitrum')).toThrow('Unsupported chain: arbitrum');
  });

  it('correctly identifies EVM chains', () => {
    expect(isEvmChain('base')).toBe(true);
    expect(isEvmChain('polygon')).toBe(true);
    expect(isEvmChain('solana')).toBe(false);
  });

  it('correctly identifies Solana chains', () => {
    expect(isSolanaChain('solana')).toBe(true);
    expect(isSolanaChain('base')).toBe(false);
  });
});