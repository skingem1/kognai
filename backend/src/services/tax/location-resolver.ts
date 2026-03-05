/**
 * Tax Location Resolver Service
 * 
 * Resolves the tax jurisdiction based on buyer location (country and state).
 * Supports EU VAT and US sales tax nexus determination.
 */

import { TaxJurisdiction } from './types';

/**
 * List of US state codes for jurisdiction detection
 */
const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC'
]);

/**
 * EU country codes that support VAT
 */
const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'UK'
]);

export interface LocationInput {
  countryCode: string;
  stateCode?: string;
  vatNumber?: string;
  ipCountry?: string;
}

/**
 * Determines the tax jurisdiction based on buyer location.
 * 
 * @param location - The buyer location containing country code and optional state
 * @returns The applicable TaxJurisdiction
 * 
 * @example
 * // US customer
 * getJurisdiction({ countryCode: 'US', stateCode: 'CA' })
 * // Returns: TaxJurisdiction.US
 * 
 * @example
 * // EU customer with VAT number
 * getJurisdiction({ countryCode: 'DE', vatNumber: 'DE123456789' })
 * // Returns: TaxJurisdiction.EU_VAT
 * 
 * @example
 * // US state not in our list
 * getJurisdiction({ countryCode: 'US', stateCode: 'XX' })
 * // Returns: TaxJurisdiction.NONE
 */
export function getJurisdiction(location: LocationInput): TaxJurisdiction {
  const { countryCode, stateCode, vatNumber } = location;
  
  if (!countryCode) {
    return TaxJurisdiction.NONE;
  }

  const normalizedCountry = countryCode.toUpperCase();

  // BUG-009 FIX: Check for US country code before checking US states
  // The country code 'US' was not matching the usStates set (which contains 2-letter state codes)
  // This caused all US transactions to fall through to TaxJurisdiction.NONE
  if (normalizedCountry === 'US') {
    return TaxJurisdiction.US;
  }

  // Check if it's a known US state code (fallback for edge cases)
  if (stateCode && US_STATES.has(stateCode.toUpperCase())) {
    return TaxJurisdiction.US;
  }

  // Check for EU VAT-eligible country
  if (EU_COUNTRIES.has(normalizedCountry)) {
    // If buyer has valid VAT number, it's B2B reverse charge
    if (vatNumber && vatNumber.length > 0) {
      return TaxJurisdiction.EU_VAT;
    }
    // Otherwise, charge EU VAT
    return TaxJurisdiction.EU_VAT;
  }

  // No tax jurisdiction found
  return TaxJurisdiction.NONE;
}

/**
 * Validates if a country code is a valid EU VAT country
 * 
 * @param countryCode - The country code to validate
 * @returns true if the country is in the EU VAT zone
 */
export function isEUCountry(countryCode: string): boolean {
  return EU_COUNTRIES.has(countryCode.toUpperCase());
}

/**
 * Validates if a state code is a valid US state
 * 
 * @param stateCode - The state code to validate
 * @returns true if the state is a valid US state
 */
export function isUSState(stateCode: string): boolean {
  return US_STATES.has(stateCode.toUpperCase());
}

export default {
  getJurisdiction,
  isEUCountry,
  isUSState
};
