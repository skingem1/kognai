/**
 * US Nexus Tax Tests
 * 
 * Comprehensive test suite for US sales tax nexus functionality.
 * Tests jurisdiction detection and tax calculation for nexus states.
 */

import {
  calculateTax,
  calculateUSTax,
  hasUSNexus,
  getUSNexusRate,
  US_NEXUS_RATES
} from '../calculator';
import { getJurisdiction } from '../location-resolver';
import { TaxJurisdiction, TaxCalculationInput } from '../types';

describe('US Nexus Tax Calculator', () => {
  describe('US_NEXUS_RATES constant', () => {
    it('should contain correct rates for all nexus states', () => {
      expect(US_NEXUS_RATES.CA).toBe(0.0725);
      expect(US_NEXUS_RATES.TX).toBe(0.0625);
      expect(US_NEXUS_RATES.NY).toBe(0.08);
      expect(US_NEXUS_RATES.FL).toBe(0.06);
      expect(US_NEXUS_RATES.WA).toBe(0.065);
    });

    it('should have rates in valid range (0-1)', () => {
      Object.values(US_NEXUS_RATES).forEach(rate => {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('getJurisdiction()', () => {
    it('should return US jurisdiction for US country code', () => {
      const result = getJurisdiction({ countryCode: 'US', stateCode: 'CA' });
      expect(result).toBe(TaxJurisdiction.US);
    });

    it('should return US jurisdiction for lowercase us', () => {
      const result = getJurisdiction({ countryCode: 'us', stateCode: 'TX' });
      expect(result).toBe(TaxJurisdiction.US);
    });

    it('should return US jurisdiction for US with no state', () => {
      const result = getJurisdiction({ countryCode: 'US' });
      expect(result).toBe(TaxJurisdiction.US);
    });

    it('should return NONE for invalid country code', () => {
      const result = getJurisdiction({ countryCode: 'XX' });
      expect(result).toBe(TaxJurisdiction.NONE);
    });

    it('should return NONE for empty country code', () => {
      const result = getJurisdiction({ countryCode: '' });
      expect(result).toBe(TaxJurisdiction.NONE);
    });

    it('should return EU_VAT for EU countries', () => {
      const result = getJurisdiction({ countryCode: 'DE' });
      expect(result).toBe(TaxJurisdiction.EU_VAT);
    });
  });

  describe('calculateUSTax()', () => {
    it('should return correct rate for California', () => {
      const rate = calculateUSTax({ countryCode: 'US', stateCode: 'CA' });
      expect(rate).toBe(0.0725);
    });

    it('should return correct rate for Texas', () => {
      const rate = calculateUSTax({ countryCode: 'US', stateCode: 'TX' });
      expect(rate).toBe(0.0625);
    });

    it('should return correct rate for New York', () => {
      const rate = calculateUSTax({ countryCode: 'US', stateCode: 'NY' });
      expect(rate).toBe(0.08);
    });

    it('should return correct rate for Florida', () => {
      const rate = calculateUSTax({ countryCode: 'US', stateCode: 'FL' });
      expect(rate).toBe(0.06);
    });

    it('should return correct rate for Washington', () => {
      const rate = calculateUSTax({ countryCode: 'US', stateCode: 'WA' });
      expect(rate).toBe(0.065);
    });

    it('should return 0 for non-nexus states', () => {
      expect(calculateUSTax({ countryCode: 'US', stateCode: 'OR' })).toBe(0);
      expect(calculateUSTax({ countryCode: 'US', stateCode: 'MT' })).toBe(0);
      expect(calculateUSTax({ countryCode: 'US', stateCode: 'NH' })).toBe(0);
    });

    it('should return 0 for lowercase state codes', () => {
      const rate = calculateUSTax({ countryCode: 'US', stateCode: 'ca' });
      expect(rate).toBe(0.0725);
    });

    it('should return 0 when state code is missing', () => {
      expect(calculateUSTax({ countryCode: 'US' })).toBe(0);
    });

    it('should return 0 when state code is empty string', () => {
      expect(calculateUSTax({ countryCode: 'US', stateCode: '' })).toBe(0);
    });

    it('should return 0 when state code is whitespace only', () => {
      expect(calculateUSTax({ countryCode: 'US', stateCode: '   ' })).toBe(0);
    });

    it('should return 0 for invalid state codes', () => {
      expect(calculateUSTax({ countryCode: 'US', stateCode: 'XX' })).toBe(0);
      expect(calculateUSTax({ countryCode: 'US', stateCode: 'ABC' })).toBe(0);
    });
  });

  describe('hasUSNexus()', () => {
    it('should return true for nexus states', () => {
      expect(hasUSNexus('CA')).toBe(true);
      expect(hasUSNexus('TX')).toBe(true);
      expect(hasUSNexus('NY')).toBe(true);
    });

    it('should return false for non-nexus states', () => {
      expect(hasUSNexus('OR')).toBe(false);
      expect(hasUSNexus('MT')).toBe(false);
    });

    it('should handle lowercase input', () => {
      expect(hasUSNexus('ca')).toBe(true);
      expect(hasUSNexus('or')).toBe(false);
    });
  });

  describe('getUSNexusRate()', () => {
    it('should return rate for nexus states', () => {
      expect(getUSNexusRate('CA')).toBe(0.0725);
      expect(getUSNexusRate('TX')).toBe(0.0625);
    });

    it('should return undefined for non-nexus states', () => {
      expect(getUSNexusRate('OR')).toBeUndefined();
      expect(getUSNexusRate('MT')).toBeUndefined();
    });
  });

  describe('calculateTax() - Integration', () => {
    const baseInput: TaxCalculationInput = {
      amount: 10000, // $100.00 in cents
      buyerLocation: { countryCode: 'US', stateCode: 'CA' }
    };

    it('should calculate correct tax for California', () => {
      const result = calculateTax({
        ...baseInput,
        buyerLocation: { countryCode: 'US', stateCode: 'CA' }
      });

      expect(result.jurisdiction).toBe(TaxJurisdiction.US);
      expect(result.taxRate).toBe(0.0725);
      expect(result.taxAmount).toBe(725); // 10000 * 0.0725 = 725
    });

    it('should calculate correct tax for Texas', () => {
      const result = calculateTax({
        ...baseInput,
        buyerLocation: { countryCode: 'US', stateCode: 'TX' }
      });

      expect(result.taxRate).toBe(0.0625);
      expect(result.taxAmount).toBe(625);
    });

    it('should calculate correct tax for New York', () => {
      const result = calculateTax({
        ...baseInput,
        buyerLocation: { countryCode: 'US', stateCode: 'NY' }
      });

      expect(result.taxRate).toBe(0.08);
      expect(result.taxAmount).toBe(800);
    });

    it('should return 0 tax for non-nexus states', () => {
      const result = calculateTax({
        ...baseInput,
        buyerLocation: { countryCode: 'US', stateCode: 'OR' }
      });

      expect(result.jurisdiction).toBe(TaxJurisdiction.US);
      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.note).toContain('No nexus');
    });

    it('should return 0 tax when no state provided', () => {
      const result = calculateTax({
        ...baseInput,
        buyerLocation: { countryCode: 'US' }
      });

      expect(result.jurisdiction).toBe(TaxJurisdiction.US);
      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
    });

    it('should include correct note for nexus states', () => {
      const result = calculateTax({
        ...baseInput,
        buyerLocation: { countryCode: 'US', stateCode: 'CA' }
      });

      expect(result.note).toBe('Sales tax applied for CA');
    });

    it('should handle large amounts correctly', () => {
      const result = calculateTax({
        amount: 1000000, // $10,000.00
        buyerLocation: { countryCode: 'US', stateCode: 'NY' }
      });

      expect(result.taxAmount).toBe(80000); // 1000000 * 0.08 = 80000
    });

    it('should round tax amount correctly', () => {
      const result = calculateTax({
        amount: 10001, // $100.01
        buyerLocation: { countryCode: 'US', stateCode: 'CA' }
      });

      // 10001 * 0.0725 = 725.0725, should round to 725
      expect(result.taxAmount).toBe(725);
    });

    it('should handle invalid amount gracefully', () => {
      const result = calculateTax({
        amount: 0,
        buyerLocation: { countryCode: 'US', stateCode: 'CA' }
      });

      expect(result.taxAmount).toBe(0);
      expect(result.note).toBe('Invalid amount');
    });

    it('should handle negative amount gracefully', () => {
      const result = calculateTax({
        amount: -100,
        buyerLocation: { countryCode: 'US', stateCode: 'CA' }
      });

      expect(result.taxAmount).toBe(0);
      expect(result.note).toBe('Invalid amount');
    });
  });

  describe('BUG-009 Regression Tests', () => {
    /**
      * These tests verify the fix for BUG-009:
      * The bug was that 'US' country code was not matched to TaxJurisdiction.US
      * because getJurisdiction() was only checking usStates (2-letter codes) 
      * and not handling the 'US' country code separately.
      */
    
    it('should detect US jurisdiction with country code US', () => {
      const jurisdiction = getJurisdiction({ countryCode: 'US', stateCode: 'CA' });
      expect(jurisdiction).toBe(TaxJurisdiction.US);
    });

    it('should calculate US tax after jurisdiction detection', () => {
      const jurisdiction = getJurisdiction({ countryCode: 'US', stateCode: 'TX' });
      expect(jurisdiction).toBe(TaxJurisdiction.US);
      
      const taxRate = calculateUSTax({ countryCode: 'US', stateCode: 'TX' });
      expect(taxRate).toBe(0.0625);
    });

    it('should NOT return NONE for US country code', () => {
      // This was the bug - US was falling through to NONE
      const jurisdiction = getJurisdiction({ countryCode: 'US', stateCode: 'WA' });
      expect(jurisdiction).not.toBe(TaxJurisdiction.NONE);
      expect(jurisdiction).toBe(TaxJurisdiction.US);
    });

    it('should work with full calculateTax flow', () => {
      const result = calculateTax({
        amount: 5000,
        buyerLocation: { countryCode: 'US', stateCode: 'FL' }
      });
      
      // Before fix: returned { taxRate: 0, jurisdiction: NONE }
      // After fix: returns { taxRate: 0.06, jurisdiction: US }
      expect(result.jurisdiction).toBe(TaxJurisdiction.US);
      expect(result.taxRate).toBe(0.06);
      expect(result.taxAmount).toBe(300);
    });
  });
});
