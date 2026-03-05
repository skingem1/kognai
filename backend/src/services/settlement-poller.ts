import { setInterval, clearInterval } from 'timers';
import { Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { PrismaClient, Invoice, InvoiceStatus } from '@prisma/client';
import Bull, { Queue } from 'bull';

export interface PayAISettlement {
  id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  status: 'settled' | 'pending' | 'failed';
  settled_at: string;
  created_at: string;
}

export interface PayAIListResponse {
  settlements: PayAISettlement[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface SettlementPollerConfig {
  payaiBaseUrl: string;
  payaiApiKey: string;
  pollIntervalMs: number;
  redisUrl: string;
}

export interface InvoiceSettlementMatch {
  invoice: Invoice;
  settlement: PayAISettlement;
}

/**
 * Custom error class for settlement poller errors
 */
export class SettlementPollerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SettlementPollerError';
    Error.captureStackTrace(this, SettlementPollerError);
  }
}

/**
 * Service that polls PayAI facilitator for settlements and matches them to pending invoices
 */
export class SettlementPollerService {
  private readonly logger: Logger;
  private readonly prisma: PrismaClient;
  private readonly httpClient: AxiosInstance;
  private readonly queue: Bull.Queue;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private processedTransactionIds: Set<string> = new Set();

  constructor(
    private readonly config: SettlementPollerConfig,
    prismaClient?: PrismaClient,
    httpClient?: AxiosInstance,
    queue?: Bull.Queue
  ) {
    this.logger = new Logger(SettlementPollerService.name);
    this.prisma = prismaClient || new PrismaClient();
    
    this.httpClient = httpClient || axios.create({
      baseURL: config.payaiBaseUrl,
      headers: {
        'Authorization': `Bearer ${config.payaiApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    this.queue = queue || new Bull('invoice-pdf-generation', config.redisUrl);
  }

  /**
   * Start the settlement poller
   * @returns void
   */
  start(): void {
    if (this.pollTimer) {
      this.logger.warn('Settlement poller is already running');
      return;
    }

    this.logger.log(
      `Starting settlement poller with interval: ${this.config.pollIntervalMs}ms`
    );

    // Perform initial poll
    this.pollSettlements().catch((error) => {
      this.logger.error('Initial settlement poll failed', error);
    });

    // Set up interval for subsequent polls
    this.pollTimer = setInterval(() => {
      this.pollSettlements().catch((error) => {
        this.logger.error('Scheduled settlement poll failed', error);
      });
    }, this.config.pollIntervalMs);

    this.logger.log('Settlement poller started successfully');
  }

  /**
   * Stop the settlement poller
   * @returns Promise<void>
   */
  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.logger.log('Settlement poller stopped');
    }

    // Wait for any ongoing poll to complete
    while (this.isPolling) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await this.prisma.$disconnect();
    this.logger.log('Settlement poller resources cleaned up');
  }

  /**
   * Poll PayAI facilitator for settlements
   * @returns Promise<void>
   */
  async pollSettlements(): Promise<void> {
    if (this.isPolling) {
      this.logger.debug('Skipping poll - previous poll still in progress');
      return;
    }

    this.isPolling = true;
    const startTime = Date.now();

    try {
      this.logger.debug('Polling PayAI settlements...');

      const response = await this.httpClient.get<PayAIListResponse>('/list');
      const { settlements } = response.data;

      this.logger.debug(`Received ${settlements.length} settlements from PayAI`);

      // Process each settlement
      for (const settlement of settlements) {
        await this.processSettlement(settlement);
      }

      const duration = Date.now() - startTime;
      this.logger.log(`Poll completed in ${duration}ms, processed ${settlements.length} settlements`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const message = error.message;
        
        this.logger.error(
          `PayAI API error: ${statusCode} - ${message}`,
          error.stack
        );

        throw new SettlementPollerError(
          `PayAI API error: ${statusCode}`,
          'PAYA_API_ERROR',
          error
        );
      }

      this.logger.error('Unexpected error during settlement polling', error);
      throw new SettlementPollerError(
        'Unexpected error during settlement polling',
        'UNKNOWN_ERROR',
        error instanceof Error ? error : undefined
      );
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Process a single settlement - match to invoice and queue for PDF generation
   * @param settlement - The settlement from PayAI
   * @returns Promise<void>
   */
  async processSettlement(settlement: PayAISettlement): Promise<void> {
    const { transaction_id } = settlement;

    // Skip if already processed in memory
    if (this.processedTransactionIds.has(transaction_id)) {
      this.logger.debug(`Settlement ${transaction_id} already processed in this session`);
      return;
    }

    // Check if already processed in database (idempotency)
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: {
        transactionId: transaction_id,
        status: {
          in: ['processing', 'completed'],
        },
      },
    });

    if (existingInvoice) {
      this.logger.debug(
        `Settlement ${transaction_id} already processed (invoice: ${existingInvoice.id})`
      );
      this.processedTransactionIds.add(transaction_id);
      return;
    }

    // Find pending invoice by transaction_id
    const pendingInvoice = await this.prisma.invoice.findFirst({
      where: {
        transactionId: transaction_id,
        status: 'pending',
      },
    });

    if (!pendingInvoice) {
      this.logger.warn(
        `No pending invoice found for transaction: ${transaction_id}`
      );
      return;
    }

    // Match found - update invoice and queue for PDF generation
    await this.handleSettlementMatch(pendingInvoice, settlement);
  }

  /**
   * Handle a matched settlement-invoice pair
   * @param invoice - The matched invoice
   * @param settlement - The matched settlement
   * @returns Promise<void>
   */
  private async handleSettlementMatch(
    invoice: Invoice,
    settlement: PayAISettlement
  ): Promise<void> {
    const { transaction_id, settled_at } = settlement;

    this.logger.log(
      `Matched settlement ${transaction_id} to invoice ${invoice.id}`
    );

    try {
      // Update invoice status to processing
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'processing',
          settledAt: new Date(settled_at),
          updatedAt: new Date(),
        },
      });

      // Queue for PDF generation
      await this.queue.add(
        {
          invoiceId: invoice.id,
          transactionId: transaction_id,
          settledAt: settled_at,
        },
        {
          jobId: `invoice-${invoice.id}-${transaction_id}`,
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        }
      );

      // Mark as processed in memory
      this.processedTransactionIds.add(transaction_id);

      this.logger.log(
        `Queued invoice ${invoice.id} for PDF generation (transaction: ${transaction_id})`
      );
    } catch (error) {
      this.logger.error(
        `Failed to process settlement match for invoice ${invoice.id}`,
        error
      );
      throw error;
    }
  }

  /**
   * Get current polling status
   * @returns Polling status object
   */
  getStatus(): {
    isRunning: boolean;
    isPolling: boolean;
    processedCount: number;
    pollInterval: number;
  } {
    return {
      isRunning: this.pollTimer !== null,
      isPolling: this.isPolling,
      processedCount: this.processedTransactionIds.size,
      pollInterval: this.config.pollIntervalMs,
    };
  }

  /**
   * Clear the in-memory processed transaction IDs set
   * Useful for testing
   * @returns void
   */
  clearProcessedCache(): void {
    this.processedTransactionIds.clear();
    this.logger.debug('Cleared processed transaction cache');
  }
}

/**
 * Factory function to create a SettlementPollerService with configuration from environment
 * @param config - Optional config overrides
 * @returns SettlementPollerService instance
 */
export function createSettlementPollerService(
  config?: Partial<SettlementPollerConfig>
): SettlementPollerService {
  const fullConfig: SettlementPollerConfig = {
    payaiBaseUrl: config?.payaiBaseUrl || process.env.PAYAI_BASE_URL || 'https://api.payai.example.com',
    payaiApiKey: config?.payaiApiKey || process.env.PAYAI_API_KEY || '',
    pollIntervalMs: config?.pollIntervalMs || 30000,
    redisUrl: config?.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
  };

  if (!fullConfig.payaiApiKey) {
    throw new Error('PAYAI_API_KEY is required');
  }

  return new SettlementPollerService(fullConfig);
}

export default SettlementPollerService;
