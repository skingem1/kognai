/**
 * Represents a single invoice record.
 */
export interface Invoice {
  /** Unique identifier for the invoice */
  id: string;
  /** Human-readable invoice number */
  invoiceNumber: string;
  /** Alias used by some components */
  number?: string;
  /** Invoice amount in the specified currency */
  amount: number;
  /** ISO 4217 currency code (e.g., USD, EUR) */
  currency: string;
  /** Current status of the invoice */
  status: string;
  /** Timestamp when the invoice was created */
  createdAt: string;
  /** Timestamp when the invoice was paid */
  paidAt?: string | null;
  /** Arbitrary metadata attached to the invoice */
  metadata?: Record<string, unknown>;
  /** Customer/buyer name */
  customerName?: string;
  /** Customer/buyer email */
  customerEmail?: string;
  /** Seller/company name (shown on invoice header) */
  sellerName?: string;
  /** Service description (what the x402 transaction was about) */
  serviceDescription?: string;
  /** Subtotal before tax */
  subtotal?: number;
  /** Tax rate percentage */
  taxRate?: number;
  /** Tax amount */
  taxAmount?: number;
  /** Total including tax */
  total?: number;
  /** Tax type (e.g., VAT) */
  taxType?: string;
  /** Tax jurisdiction country code */
  taxCountry?: string;
  /** Seller VAT number */
  sellerVat?: string;
  /** Buyer VAT number */
  buyerVat?: string;
}

/**
 * Response from the invoices list API endpoint.
 */
export interface InvoiceListResponse {
  /** Array of invoice records */
  invoices: Invoice[];
  /** Current pagination state */
  pagination: {
    /** Total number of invoices matching the query */
    total: number;
    /** Current page number (1-indexed) */
    page: number;
    /** Number of items per page */
    limit: number;
    /** Total number of pages available */
    totalPages: number;
  };
}
