// backend/src/services/settlement/__tests__/settlement-router.test.ts
import { checkSettlement } from '../settlement-router';
import { EvmSettlementDetector } from '../detectors/evm-settlement-detector';
import { SolanaSettlementDetector } from '../detectors/solana-settlement-detector';

jest.mock('../detectors/evm-settlement-detector');
jest.mock('../detectors/solana-settlement-detector');

const mockEvmDetector = EvmSettlementDetector.prototype as jest.Mocked<EvmSettlementDetector>;
const mockSolanaDetector = SolanaSettlementDetector.prototype as jest.Mocked<SolanaSettlementDetector>;

describe('settlement-router', () => {
  const mockAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    jest.clearAllMocks();
    mockEvmDetector.checkSettlement = jest.fn().mockResolvedValue({ found: false });
    mockSolanaDetector.checkSettlement = jest.fn().mockResolvedValue({ found: false });
  });

  it('routes base chain to EvmSettlementDetector', async () => {
    await checkSettlement('base', mockAddress);
    expect(mockEvmDetector.checkSettlement).toHaveBeenCalledWith(mockAddress, 8453);
  });

  it('routes polygon chain to EvmSettlementDetector with polygon chainId', async () => {
    await checkSettlement('polygon', mockAddress);
    expect(mockEvmDetector.checkSettlement).toHaveBeenCalledWith(mockAddress, 137);
  });

  it('routes solana chain to SolanaSettlementDetector', async () => {
    await checkSettlement('solana', mockAddress);
    expect(mockSolanaDetector.checkSettlement).toHaveBeenCalledWith(mockAddress);
  });

  it('throws for unsupported chain', async () => {
    await expect(checkSettlement('arbitrum', mockAddress)).rejects.toThrow('Unsupported chain: arbitrum');
  });
});