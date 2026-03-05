/**
 * Tax Calculator Service
 * 
 * Calculates applicable taxes based on jurisdiction and buyer location.
 * Supports EU VAT (B2B reverse charge and B2C) and US sales tax (nexus-based).
 */

import { TaxJurisdiction, TaxCalculationInput, TaxCalculationResult } from './types';
import { getJurisdiction, LocationInput } from './location-resolver';

/**
 * US Nexus Tax Rates
 * 
 * Maps US state codes to their sales tax rates.
 * These represent states where the business has economic nexus and must collect sales tax.
 * 
 * Rates as of 2024:
 * - CA (California): 7.25%
 * - TX (Texas): 6.25%
 * - NY (New York): 8%
 * - FL (Florida): 6%
 * - WA (Washington): 6.5%
 */
export const US_NEXUS_RATES: Record<string, number> = {
  CA: 0.0725,
  TX: 0.0625,
  NY: 0.08,
  FL: 0.06,
  WA: 0.065
};

/**
 * EU VAT Rates by country code
 * Standard VAT rates for B2C transactions within EU
 */
const EU_VAT_RATES: Record<string, number> = {
  AT: 0.20,  // Austria
  BE: 0.21,  // Belgium
  BG: 0.20,  // Bulgaria
  HR: 0.25,  // Croatia
  CY: 0.19,  // Cyprus
  CZ: 0.21,  // Czech Republic
  DK: 0.25,  // Denmark
  EE: 0.22,  // Estonia
  FI: 0.24,  // Finland
  FR: 0.20,  // France
  DE: 0.19,  // Germany
  GR: 0.24,  // Greece
  HU: 0.27,  // Hungary
  IE: 0.23,  // Ireland
  IT: 0.22,  // Italy
  LV: 0.21,  // Latvia
  LT: 0.21,  // Lithuania
  LU: 0.17,  // Luxembourg
  MT: 0.18,  // Malta
  NL: 0.21,  // Netherlands
  PL: 0.23,  // Poland
  PT: 0.23,  // Portugal
  RO: 0.19,  // Romania
  SK: 0.20,  // Slovakia
  SI: 0.22,  // Slovenia
  ES: 0.21,  // Spain
  SE: 0.25,  // Sweden
  GB: 0.20,  // United Kingdom
  UK: 0.20   // United Kingdom (alternative code)
};

/**
 * Calculates US sales tax based on buyer location
 * 
 * @param buyerLocation - Buyer location with state code
 * @returns Tax rate as decimal (0.0 to 1.0), or 0 if no nexus
 * 
 * @example
 * // California buyer - has nexus
 * calculateUSTax({ countryCode: 'US', stateCode: 'CA' })
 * // Returns: 0.0725
 * 
 * @example
 * // Oregon buyer - no nexus
 * calculateUSTax({ countryCode: 'US', stateCode: 'OR' })
 * // Returns: 0
 * 
 * @example
 * // No state provided
 * calculateUSTax({ countryCode: 'US' })
 * // Returns: 0
 */
export function calculateUSTax(buyerLocation: LocationInput): number {
  const { stateCode } = buyerLocation;

  // Cannot calculate US tax without a state
  if (!stateCode || stateCode.trim() === '') {
    return 0;
  }

  const normalizedState = stateCode.toUpperCase();

  // Check if we have nexus in this state
  if (normalizedState in US_NEXUS_RATES) {
    return US_NEXUS_RATES[normalizedState];
  }

  // No nexus in this state - no tax required
  return 0;
}

/**
 * Calculates EU VAT for B2C transactions
 * 
 * @param buyerLocation - Buyer location with country code
 * @returns VAT rate as decimal, or 0 if not applicable
 */
export function calculateEUVAT(buyerLocation: LocationInput): number {
  const { countryCode } = buyerLocation;

  if (!countryCode) {
    return 0;
  }

  const normalizedCountry = countryCode.toUpperCase();
  return EU_VAT_RATES[normalizedCountry] ?? 0;
}

/**
 * Calculates tax for transactions with no tax obligation
 * 
 * @returns Always returns 0 (no tax)
 */
export function calculateNoTax(): number {
  return 0;
}

/**
 * Main tax calculation function
 * 
 * Determines jurisdiction and applies appropriate tax rate
 * 
 * @param input - Tax calculation input including amount and buyer location
 * @returns Tax calculation result with rate, amount, and jurisdiction
 * 
 * @example
 * // US customer in California
 * calculateTax({
 *   amount: 10000, // $100.00 in cents
 *   buyerLocation: { countryCode: 'US', stateCode: 'CA' }
 * })
 * // Returns: { taxRate: 0.0725, taxAmount: 725, jurisdiction: 'US' }
 * 
 * @example
 * // German customer with VAT number (B2B)
 * calculateTax({
 *   amount: 10000,
 *   buyerLocation: { countryCode: 'DE', vatNumber: 'DE123456789' }
 * })
 * // Returns: { taxRate: 0, taxAmount: 0, jurisdiction: 'EU_VAT', note: 'Reverse charge' }
 */
export function calculateTax(input: TaxCalculationInput): TaxCalculationResult {
  const { amount, buyerLocation } = input;

  if (!amount || amount <= 0) {
    return {
      taxRate: 0,
      taxAmount: 0,
      jurisdiction: TaxJurisdiction.NONE,
      note: 'Invalid amount'
    };
  }

  const jurisdiction = getJurisdiction(buyerLocation);

  switch (jurisdiction) {
    case TaxJurisdiction.US:
      return calculateUSTaxResult(amount, buyerLocation);

    case TaxJurisdiction.EU_VAT:
      return calculateEUVATResult(amount, buyerLocation);

    case TaxJurisdiction.NONE:
    default:
      return {
        taxRate: 0,
        taxAmount: 0,
        jurisdiction: TaxJurisdiction.NONE,
        note: 'No applicable tax jurisdiction'
      };
  }
}

/**
 * Internal function to build US tax result
 */
function calculateUSTaxResult(amount: number, buyerLocation: LocationInput): TaxCalculationResult {
  const taxRate = calculateUSTax(buyerLocation);
  const taxAmount = Math.round(amount * taxRate);

  return {
    taxRate,
    taxAmount,
    jurisdiction: TaxJurisdiction.US,
    note: taxRate > 0 
      ? `Sales tax applied for ${buyerLocation.stateCode}`
      : 'No nexus in this state - no tax required'
  };
}

/**
 * Internal function to build EU VAT result
 */
function calculateEUVATResult(amount: number, buyerLocation: LocationInput): TaxCalculationResult {
  const hasVATNumber = buyerLocation.vatNumber && buyerLocation.vatNumber.length > 0;
  
  // B2B reverse charge - no VAT charged
  if (hasVATNumber) {
    return {
      taxRate: 0,
      taxAmount: 0,
      jurisdiction: TaxJurisdiction.EU_VAT,
      note: 'Reverse charge - Art. 196 Council Directive 2006/112/EC'
    };
  }

  // B2C - charge VAT
  const taxRate = calculateEUVAT(buyerLocation);
  const taxAmount = Math.round(amount * taxRate);

  return {
    taxRate,
    taxAmount,
    jurisdiction: TaxJurisdiction.EU_VAT,
    note: `EU VAT applied at ${(taxRate * 100).toFixed(1)}%`
  };
}

/**
 * Validates if a US state has nexus (for display purposes)
 * 
 * @param stateCode - US state code
 * @returns true if we have nexus in that state
 */
export function hasUSNexus(stateCode: string): boolean {
  return stateCode.toUpperCase() in US_NEXUS_RATES;
}

/**
 * Gets the nexus rate for a US state
 * 
 * @param stateCode - US state code
 * @returns The nexus rate, or undefined if no nexus
 */
export function getUSNexusRate(stateCode: string): number | undefined {
  return US_NEXUS_RATES[stateCode.toUpperCase()];
}

export default {
  calculateTax,
  calculateUSTax,
  calculateEUVAT,
  calculateNoTax,
  hasUSNexus,
  getUSNexusRate,
  US_NEXUS_RATES
};
