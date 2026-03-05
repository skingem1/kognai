/**
 * Tax Service Type Definitions
 * 
 * Defines all types for tax calculation, validation, and compliance tracking
 */

import { CountryCode } from 'iso-country-currency';

/**
 * Supported tax jurisdictions
 */
export enum TaxJurisdiction {
  EU = 'EU',
  US = 'US',
  NONE = 'NONE'
}

/**
 * Transaction types
 */
export enum TransactionType {
  B2B = 'B2B',
  B2C = 'B2C'
}

/**
 * VAT validation status
 */
export enum VatValidationStatus {
  VALID = 'VALID',
  INVALID = 'INVALID',
  ERROR = 'ERROR',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Buyer location information
 */
export interface BuyerLocation {
  countryCode: string;
  vatNumber?: string;
  postalCode?: string;
  city?: string;
  ipAddress?: string;
  state?: string; // For US
}

/**
 * VAT validation result from VIES
 */
export interface VatValidationResult {
  isValid: boolean;
  countryCode: string;
  vatNumber: string;
  companyName?: string;
  companyAddress?: string;
  requestDate: Date;
  validFrom?: Date;
  validTo?: Date;
}

/**
 * Cached VAT validation result
 */
export interface CachedVatValidation {
  result: VatValidationResult;
  cachedAt: Date;
  expiresAt: Date;
}

/**
 * Tax rate from database
 */
export interface TaxRate {
  id: string;
  countryCode: string;
  rate: number;
  reducedRate?: number;
  superReducedRate?: number;
  stateCode?: string; // For US
  appliesToDigitalServices: boolean;
  effectiveDate: Date;
  endDate?: Date;
}

/**
 * Tax calculation request
 */
export interface TaxCalculationRequest {
  sellerCountry: string;
  buyerCountry: string;
  buyerVatNumber?: string;
  buyerIpAddress?: string;
  buyerBillingAddress?: {
    countryCode: string;
    postalCode?: string;
    city?: string;
    state?: string;
  };
  transactionType: TransactionType;
  amount: number;
  productType: 'digital' | 'physical' | 'service';
  isDigitalService: boolean;
  timestamp: Date;
}

/**
 * Tax calculation result
 */
export interface TaxCalculationResult {
  success: boolean;
  amount: number;
  taxAmount: number;
  taxRate: number;
  jurisdiction: TaxJurisdiction;
  countryCode: string;
  reverseCharge: boolean;
  invoiceNote?: string;
  validationEvidenceId?: string;
  calculationEvidenceId?: string;
  error?: string;
}

/**
 * Tax evidence for compliance storage
 */
export interface TaxEvidence {
  id: string;
  type: 'VAT_VALIDATION' | 'LOCATION_RESOLUTION' | 'TAX_CALCULATION';
  buyerCountry: string;
  sellerCountry: string;
  buyerVatNumber?: string;
  ipAddress?: string;
  evidence: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * VIES API configuration
 */
export interface ViesConfig {
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * Redis configuration for caching
 */
export interface RedisConfig {
  host: string;
  port: number;
  keyPrefix: string;
  ttlSeconds: number; // 30 days = 2592000
}

/**
 * Tax service configuration
 */
export interface TaxServiceConfig {
  vies: ViesConfig;
  redis: RedisConfig;
  defaultJurisdiction: TaxJurisdiction;
  cacheEnabled: boolean;
}

/**
 * Location resolution result
 */
export interface LocationResolutionResult {
  resolved: boolean;
  countryCode: string;
  state?: string;
  method: 'VAT_NUMBER' | 'BILLING_ADDRESS' | 'IP_GEOLOCATION' | 'DEFAULT';
  vatNumber?: string;
  isValidVat?: boolean;
  confidence: number; // 0-1
}

/**
 * Invoice note templates
 */
export const INVOICE_NOTES = {
  REVERSE_CHARGE: 'Reverse charge - Art. 196 Council Directive 2006/112/EC',
  B2C_VAT: 'VAT charged at standard rate for B2C digital services',
  OUTSIDE_SCOPE: 'Outside scope of VAT - services supplied to non-EU recipient',
  EXEMPT: 'Exempt from VAT per Article 132 of Council Directive 2006/112/EC'
} as const;
