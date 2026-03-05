import { submitPaymentToChain } from '../../services/payment-executor';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    payment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  })),
}));

jest.mock('ethers', () => ({
  ...jest.requireActual('ethers'),
  JsonRpcProvider: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    provider: {},
  })),
  Contract: jest.fn().mockImplementation(() => ({
    transfer: jest.fn().mockResolvedValue({
      wait: jest.fn().mockResolvedValue({ hash: '0xabc123' }),
    }),
  })),
  parseUnits: jest.fn().mockReturnValue(BigInt(1000000)),
}));

describe('submitPaymentToChain', () => {
  let mockPrisma: ReturnType<typeof jest.fn>;
  const mockPayment = {
    id: 'pay-123',
    amount: 100,
    recipientAddress: '0xRecipient',
    status: 'pending',
    tx_hash: null,
  };

  beforeEach(() => {
    mockPrisma = new PrismaClient();
    process.env.RPC_URL = 'https://mainnet.base.org';
    process.env.TREASURY_PRIVATE_KEY = '0xmockPrivateKey';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should throw error when payment not found', async () => {
    (mockPrisma.payment.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(submitPaymentToChain('invalid-id')).rejects.toThrow(
      'Payment not found: invalid-id'
    );
  });

  it('should throw error when payment already submitted', async () => {
    (mockPrisma.payment.findUnique as jest.Mock).mockResolvedValue({
      ...mockPayment,
      status: 'submitted',
    });

    await expect(submitPaymentToChain('pay-123')).rejects.toThrow(
      'Payment pay-123 already submitted or completed'
    );
  });

  it('should throw error when TREASURY_PRIVATE_KEY not set', async () => {
    delete process.env.TREASURY_PRIVATE_KEY;
    (mockPrisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPayment);

    await expect(submitPaymentToChain('pay-123')).rejects.toThrow(
      'TREASURY_PRIVATE_KEY environment variable not set'
    );
  });

  it('should successfully submit payment and return tx_hash', async () => {
    (mockPrisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPayment);
    (mockPrisma.payment.update as jest.Mock).mockResolvedValue({
      ...mockPayment,
      status: 'submitted',
      tx_hash: '0xabc123',
    });

    const result = await submitPaymentToChain('pay-123');

    expect(result).toEqual({ tx_hash: '0xabc123' });
    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-123' },
      data: { tx_hash: '0xabc123', status: 'submitted' },
    });
  });

  it('should throw error when blockchain transaction fails', async () => {
    (mockPrisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPayment);
    
    const mockContract = {
      transfer: jest.fn().mockRejectedValue(new Error('Insufficient balance')),
    };
    
    (ethers.Contract as jest.Mock).mockImplementation(() => mockContract);

    await expect(submitPaymentToChain('pay-123')).rejects.toThrow('Insufficient balance');
  });
});
