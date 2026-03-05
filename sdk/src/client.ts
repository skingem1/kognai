/**
 * Invoica Client SDK
 * Main client for interacting with the Invoica API
 */

import type {
  Invoice,
  CreateInvoiceRequest,
  Settlement,
  InvoiceStatus,
  ListInvoicesParams,
  InvoicaConfig,
  InvoiceListResponse,
} from './types';

/**
 * Custom error class for Invoica API errors
 */
export class InvoicaError extends Error {
  /** HTTP status code */
  public statusCode: number;
  /** Error code from the API */
  public code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'InvoicaError';
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Invoica API Client
 * Provides methods for interacting with the Invoica API
 * to manage invoices and track settlements
 */
export class InvoicaClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  /**
   * Creates a new InvoicaClient instance
   * @param config - Configuration object containing API key and optional base URL
   * @example
   *
