import { Logger } from '@nestjs/common';
import { AxiosInstance, AxiosError } from 'axios';
import { PrismaClient, Invoice, InvoiceStatus } from '@prisma/client';
import Bull from 'bull';

// Mock dependencies
jest.mock('axios');
jest.mock('@prisma/client');
jest.mock('bull');
jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  Logger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Types for mocks
interface MockQueue {
  add: jest.Mock;
}

interface MockPrisma {
  invoice: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  $disconnect: jest.Mock;
}

describe('SettlementPollerService', () => {
  let service: any;
  let mockHttpClient: jest.Mocked<AxiosInstance>;
  let mockPrisma: MockPrisma;
  let mockQueue: MockQueue;
  let mockLogger: any;

  // Test data
  const mockSettlements = [
    {
      id: 'settle-001',
      transaction_id: 'txn-123',
      amount: 10000,
      currency: 'USD',
      status: 'settled' as const,
      settled_at: '2024-01-15T10:00:00Z',
      created_at: '2024-01-15T09:00:00Z',
    },
    {
      id: 'settle-002',
      transaction_id: 'txn-456',
      amount: 25000,
      currency: 'USD',
      status: 'settled' as const,
      settled_at: '2024-01-15T11:00:00Z',
      created_at: '2024-01-15T10:00:00Z',
    },
  ];

  const mockPendingInvoice: Invoice = {
    id: 'inv-001',
    invoiceNumber: 'INV-2024-0001',
    merchantId: 'merchant-001',
    amount: 10000,
    currency: 'USD',
    status: 'pending' as InvoiceStatus,
    transactionId: 'txn-123',
    description: 'Test invoice',
    customerEmail: 'test@example.com',
    createdAt: new Date('2024-01-14T10:00:00Z'),
    updatedAt: new Date('2024-01-14T10:00:00Z'),
    settledAt: null,
    paidAt: null,
  };

  const mockProcessedInvoice: Invoice = {
    ...mockPendingInvoice,
    id: 'inv-002',
    transactionId: 'txn-789',
    status: 'completed' as InvoiceStatus,
  };

  const config = {
    payaiBaseUrl: 'https://api.payai.test.com',
    payaiApiKey: 'test-api-key',
    pollIntervalMs: 30000,
    redisUrl: 'redis://localhost:6379',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock HTTP client
    mockHttpClient = {
      get: jest.fn(),
    } as any;

    // Setup mock Prisma client
    mockPrisma = {
      invoice: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $disconnect: jest.fn(),
    };

    // Setup mock Queue
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-001' }),
    };

    // Setup mock Logger
    mockLogger = {
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Import service after mocks are set up
    const { SettlementPollerService } = require('../../src/services/settlement-poller');
    
    service = new SettlementPollerService(
      config,
      mockPrisma as any,
      mockHttpClient,
      mockQueue as any
    );
    
    // Replace logger with mock
    service.logger = mockLogger;
  });

  afterEach(async () => {
    if (service?.stop) {
      await service.stop();
    }
  });

  describe('constructor', () => {
    it('should create service with provided config', () => {
      expect(service).toBeDefined();
      expect(service.config).toEqual(config);
    });

    it('should initialize with empty processedTransactionIds set', () => {
      expect(service.processedTransactionIds).toBeInstanceOf(Set);
      expect(service.processedTransactionIds.size).toBe(0);
    });

    it('should set isPolling to false initially', () => {
      expect(service.isPolling).toBe(false);
    });
  });

  describe('start', () => {
    it('should start the poller and set up interval', () => {
      service.start();
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Starting settlement poller')
      );
      expect(service.pollTimer).not.toBeNull();
    });

    it('should warn if already running', () => {
      service.start();
      service.start();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Settlement poller is already running'
      );
    });

    it('should perform initial poll on start', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { settlements: [] },
      });
      
      service.start();
      
      // Wait for initial poll to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockHttpClient.get).toHaveBeenCalledWith('/list');
    });
  });

  describe('stop', () => {
    it('should stop the poller and clear interval', async () => {
      service.start();
      await service.stop();
      
      expect(service.pollTimer).toBeNull();
      expect(mockLogger.log).toHaveBeenCalledWith('Settlement poller stopped');
    });

    it('should disconnect from database', async () => {
      service.start();
      await service.stop();
      
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });

  describe('pollSettlements', () => {
    it('should fetch settlements from PayAI API', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { settlements: mockSettlements },
      });

      await service.pollSettlements();

      expect(mockHttpClient.get).toHaveBeenCalledWith('/list');
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Poll completed')
      );
    });

    it('should skip poll if already in progress', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { settlements: [] },
      });

      // Set isPolling to true to simulate ongoing poll
      service.isPolling = true;
      
      await service.pollSettlements();

      expect(mockHttpClient.get).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Skipping poll - previous poll still in progress'
      );
    });

    it('should throw SettlementPollerError on API error', async () => {
      const axiosError = new AxiosError('Network Error', '500', undefined, {}, {
        status: 500,
        data: { message: 'Internal Server Error' },
      } as any);
      
      mockHttpClient.get.mockRejectedValueOnce(axiosError);

      await expect(service.pollSettlements()).rejects.toThrow('SettlementPollerError');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('PayAI API error'),
        expect.any(String)
      );
    });

    it('should process each settlement', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { settlements: mockSettlements },
      });
      
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(null) // First settlement - no match
        .mockResolvedValueOnce(mockPendingInvoice); // Second settlement - match found

      await service.pollSettlements();

      expect(mockPrisma.invoice.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('processSettlement', () => {
    it('should skip settlement already processed in memory', async () => {
      service.processedTransactionIds.add('txn-123');

      await service.processSettlement(mockSettlements[0]);

      expect(mockPrisma.invoice.findFirst).not.toHaveBeenCalled();
    });

    it('should skip settlement already processed in database', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(mockProcessedInvoice);

      await service.processSettlement(mockSettlements[0]);

      expect(mockPrisma.invoice.findFirst).toHaveBeenCalledWith({
        where: {
          transactionId: 'txn-123',
          status: {
            in: ['processing', 'completed'],
          },
        },
      });
      expect(service.processedTransactionIds.has('txn-123')).toBe(true);
    });

    it('should skip settlement with no matching pending invoice', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(null) // Check if processed
        .mockResolvedValueOnce(null); // Check for pending

      await service.processSettlement(mockSettlements[0]);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No pending invoice found')
      );
    });

    it('should match settlement to pending invoice and queue for PDF generation', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(null) // Not already processed
        .mockResolvedValueOnce(mockPendingInvoice); // Found pending invoice

      await service.processSettlement(mockSettlements[0]);

      // Verify invoice update
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: mockPendingInvoice.id },
        data: {
          status: 'processing',
          settledAt: new Date(mockSettlements[0].settled_at),
          updatedAt: expect.any(Date),
        },
      });

      // Verify queue add
      expect(mockQueue.add).toHaveBeenCalledWith(
        {
          invoiceId: mockPendingInvoice.id,
          transactionId: 'txn-123',
          settledAt: mockSettlements[0].settled_at,
        },
        expect.objectContaining({
          jobId: `invoice-${mockPendingInvoice.id}-txn-123`,
          attempts: 3,
        })
      );

      // Verify in-memory tracking
      expect(service.processedTransactionIds.has('txn-123')).toBe(true);
    });
  });

  describe('idempotency', () => {
    it('should not process same transaction twice in same session', async () => {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockPendingInvoice);

      // First processing
      await service.processSettlement(mockSettlements[0]);
      
      // Second processing attempt
      await service.processSettlement(mockSettlements[0]);

      // Should only call update once
      expect(mockPrisma.invoice.update).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should not process already completed invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(mockProcessedInvoice);

      await service.processSettlement(mockSettlements[0]);

      expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return correct status', () => {
      service.start();
      
      const status = service.getStatus();

      expect(status).toEqual({
        isRunning: true,
        isPolling: false,
        processedCount: 0,
        pollInterval: 30000,
      });
    });

    it('should reflect isPolling state', async () => {
      mockHttpClient.get.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ data: { settlements: [] } }), 100))
      );
      
      const pollPromise = service.pollSettlements();
      
      // Give it a moment to start polling
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const status = service.getStatus();
      expect(status.isPolling).toBe(true);
      
      await pollPromise;
      
      const statusAfter = service.getStatus();
      expect(statusAfter.isPolling).toBe(false);
    });
  });

  describe('clearProcessedCache', () => {
    it('should clear the processed transaction IDs set', () => {
      service.processedTransactionIds.add('txn-123');
      service.processedTransactionIds.add('txn-456');

      service.clearProcessedCache();

      expect(service.processedTransactionIds.size).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cleared processed transaction cache'
      );
    });
  });

  describe('createSettlementPollerService', () => {
    it('should create service with default config', () => {
      const { createSettlementPollerService } = require('../../src/services/settlement-poller');
      
      const testConfig = {
        payaiBaseUrl: 'https://api.test.com',
        payaiApiKey: 'test-key',
        pollIntervalMs: 5000,
        redisUrl: 'redis://test:6379',
      };
      
      const createdService = createSettlementPollerService(testConfig);
      
      expect(createdService).toBeInstanceOf(require('../../src/services/settlement-poller').SettlementPollerService);
    });

    it('should throw error if API key not provided', () => {
      const { createSettlementPollerService } = require('../../src/services/settlement-poller');
      
      expect(() => createSettlementPollerService({
        payaiBaseUrl: 'https://api.test.com',
        payaiApiKey: '',
        pollIntervalMs: 5000,
        redisUrl: 'redis://test:6379',
      })).toThrow('PAYAI_API_KEY is required');
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { settlements: mockSettlements },
      });
      
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Database connection error'));

      await expect(service.pollSettlements()).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process settlement match'),
        expect.any(Error)
      );
    });

    it('should handle queue errors gracefully', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { settlements: mockSettlements },
      });
      
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockPendingInvoice);
      
      mockQueue.add.mockRejectedValueOnce(new Error('Queue connection error'));

      await expect(service.pollSettlements()).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process settlement match'),
        expect.any(Error)
      );
    });
  });

  describe('pagination support', () => {
    it('should handle paginated responses', async () => {
      const paginatedResponse = {
        settlements: mockSettlements,
        pagination: {
          page: 1,
          limit: 10,
          total: 100,
        },
      };
      
      mockHttpClient.get.mockResolvedValueOnce({ data: paginatedResponse });
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await service.pollSettlements();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Poll completed')
      );
    });
  });

  describe('SettlementPollerError', () => {
    it('should create error with correct properties', () => {
      const { SettlementPollerError } = require('../../src/services/settlement-poller');
      
      const originalError = new Error('Original error');
      const error = new SettlementPollerError(
        'Test error message',
        'TEST_ERROR_CODE',
        originalError
      );

      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR_CODE');
      expect(error.cause).toBe(originalError);
      expect(error.name).toBe('SettlementPollerError');
    });
  });
});
