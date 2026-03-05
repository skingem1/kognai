/**
 * Invoica TypeScript Types
 * Comprehensive type definitions for the Invoica SDK
 */

/**
 * Invoice status enumeration
 * Represents the lifecycle states of an invoice
 */
export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

/**
 * Supported blockchain networks for settlements
 */
export type Chain = 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base';

/**
 * Supported fiat currencies
 */
export type Currency = 'USD' | 'EUR' | 'GBP';

/**
 * Invoice interface
 * Represents a complete invoice record in the Invoica system
 */
export interface Invoice {
  /** Unique identifier for the invoice */
  id: string;
  /** Human-readable invoice number (e.g., INV-2024-0001) */
  number: string;
  /** Invoice amount in minor units (cents for USD) */
  amount: number;
  /** Currency code (USD, EUR, GBP) */
  currency: Currency;
  /** Current status of the invoice */
  status: InvoiceStatus;
  /** Customer identifier */
  customerId: string;
  /** Due date for payment (ISO 8601) */
  dueDate: string;
  /** Blockchain network for settlement */
  chain: Chain;
  /** Timestamp when the invoice was created */
  createdAt: string;
  /** Timestamp when the invoice was last updated */
  updatedAt: string;
  /** Optional metadata for custom fields */
  metadata?: Record<string, unknown>;
}

/**
 * Request interface for creating a new invoice
 */
export interface CreateInvoiceRequest {
  /** Invoice amount in minor units (required) */
  amount: number;
  /** Currency code (required) */
  currency: Currency;
  /** Customer identifier (required) */
  customerId: string;
  /** Due date for payment in ISO 8601 format (required) */
  dueDate: string;
  /** Blockchain network for settlement (required) */
  chain: Chain;
  /** Optional description or memo */
  description?: string;
  /** Optional metadata for custom fields */
  metadata?: Record<string, unknown>;
}

/**
 * Settlement interface
 * Represents a blockchain settlement/ payment for an invoice
 */
export interface Settlement {
  /** Unique identifier for the settlement */
  id: string;
  /** Associated invoice ID */
  invoiceId: string;
  /** Blockchain transaction hash */
  txHash: string;
  /** Blockchain network */
  chain: Chain;
  /** Settlement amount in minor units */
  amount: number;
  /** Settlement currency */
  currency: Currency;
  /** Settlement status */
  status: 'pending' | 'confirmed' | 'failed';
  /** Timestamp when the settlement was confirmed */
  confirmedAt?: string;
}

/**
 * Parameters for listing invoices with filtering and pagination
 */
export interface ListInvoicesParams {
  /** Filter by invoice status */
  status?: InvoiceStatus;
  /** Filter by customer ID */
  customerId?: string;
  /** Page number for pagination (1-indexed) */
  page?: number;
  /** Number of items per page */
  limit?: number;
  /** Filter by blockchain network */
  chain?: Chain;
}

/**
 * Paginated invoice list response
 */
export interface InvoiceListResponse {
  /** Array of invoices */
  invoices: Invoice[];
  /** Total number of invoices matching the query */
  total: number;
  /** Current page number */
  page: number;
}

/**
 * Configuration interface for InvoicaClient
 */
export interface InvoicaConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for the Invoica API (optional, defaults to production) */
  baseUrl?: string;
}
