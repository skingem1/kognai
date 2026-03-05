/**
 * UK VAT Test Suite
 * 
 * Tests for UK VAT handling including:
 * - GB (Great Britain) country code recognition
 * - Northern Ireland (XI) handling
 * - B2C UK VAT calculation at 20%
 * - B2B reverse charge for valid UK VAT numbers
 * - Jurisdiction resolution
 */

import {
  calculateTax,
  getEUTaxRate,
  getAllTaxRates,
  TAX_RATES,
} from '../calculator';
import {
  getJurisdiction,
  isEUCountry,
  extractCountryFromVAT,
} from '../location-resolver';

// Mock dependencies
jest.mock('../vat-validator');
jest.mock('../cache/cache-manager');
jest.mock('../utils/ip-utils');

const mockValidateVATNumber = require('../vat-validator').validateVATNumber;
const mockCacheManager = require('../cache/cache-manager');

describe('UK VAT - Country Code Recognition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheManager.get.mockResolvedValue(null);
    mockCacheManager.set.mockResolvedValue(true);
  });

  describe('isEUCountry', () => {
    it('should return true for GB (Great Britain)', () => {
      expect(isEUCountry('GB')).toBe(true);
      expect(isEUCountry('gb')).toBe(true);
      expect(isEUCountry('GB')).toBe(true);
    });

    it('should return true for XI (Northern Ireland)', () => {
      expect(isEUCountry('XI')).toBe(true);
      expect(isEUCountry('xi')).toBe(true);
    });

    it('should return false for non-EU countries', () => {
      expect(isEUCountry('US')).toBe(false);
      expect(isEUCountry('CA')).toBe(false);
      expect(isEUCountry('AU')).toBe(false);
    });

    it('should return false for empty/null input', () => {
      expect(isEUCountry('')).toBe(false);
      expect(isEUCountry(null as any)).toBe(false);
      expect(isEUCountry(undefined as any)).toBe(false);
    });
  });

  describe('extractCountryFromVAT', () => {
    it('should extract GB from UK VAT number', () => {
      expect(extractCountryFromVAT('GB123456789')).toBe('GB');
      expect(extractCountryFromVAT('gb999999999')).toBe('GB');
    });

    it('should extract XI from Northern Ireland VAT number', () => {
      expect(extractCountryFromVAT('XI123456789')).toBe('XI');
    });

    it('should return null for invalid VAT numbers', () => {
      expect(extractCountryFromVAT('')).toBeNull();
      expect(extractCountryFromVAT('A')).toBeNull();
      expect(extractCountryFromVAT('123')).toBeNull();
    });
  });
});

describe('UK VAT - Tax Rate Configuration', () => {
  describe('TAX_RATES Map', () => {
    it('should have GB entry with 20% VAT rate', () => {
      const gbRate = TAX_RATES.get('GB');
      
      expect(gbRate).toBeDefined();
      expect(gbRate?.rate).toBe(0.20);
      expect(gbRate?.countryCode).toBe('GB');
      expect(gbRate?.id).toBe('GB-STD');
    });

    it('should have XI entry with 20% VAT rate', () => {
      const xiRate = TAX_RATES.get('XI');
      
      expect(xiRate).toBeDefined();
      expect(xiRate?.rate).toBe(0.20);
      expect(xiRate?.countryCode).toBe('XI');
    });

    it('should have effective date set to 2024-01-01 for GB', () => {
      const gbRate = TAX_RATES.get('GB');
      
      expect(gbRate?.effectiveDate).toEqual(new Date('2024-01-01'));
    });

    it('should have appliesToDigitalServices set to true for GB', () => {
      const gbRate = TAX_RATES.get('GB');
      
      expect(gbRate?.appliesToDigitalServices).toBe(true);
    });
  });

  describe('getEUTaxRate', () => {
    it('should return tax rate for GB', () => {
      const rate = getEUTaxRate('GB');
      
      expect(rate).toBeDefined();
      expect(rate?.rate).toBe(0.20);
    });

    it('should return tax rate for XI', () => {
      const rate = getEUTaxRate('XI');
      
      expect(rate).toBeDefined();
      expect(rate?.rate).toBe(0.20);
    });

    it('should return undefined for non-EU countries', () => {
      expect(getEUTaxRate('US')).toBeUndefined();
      expect(getEUTaxRate('CA')).toBeUndefined();
    });

    it('should be case insensitive', () => {
      expect(getEUTaxRate('gb')?.rate).toBe(0.20);
      expect(getEUTaxRate('Gb')?.rate).toBe(0.20);
    });
  });

  describe('getAllTaxRates', () => {
    it('should include GB in all tax rates', () => {
      const allRates = getAllTaxRates();
      const gbRate = allRates.find(r => r.countryCode === 'GB');
      
      expect(gbRate).toBeDefined();
      expect(gbRate?.rate).toBe(0.20);
    });

    it('should include XI in all tax rates', () => {
      const allRates = getAllTaxRates();
      const xiRate = allRates.find(r => r.countryCode === 'XI');
      
      expect(xiRate).toBeDefined();
    });
  });
});

describe('UK VAT - B2C Calculations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheManager.get.mockResolvedValue(null);
    mockCacheManager.set.mockResolvedValue(true);
  });

  it('should charge 20% VAT for GB B2C customer', async () => {
    const result = await calculateTax({
      amount: 100,
      billingCountry: 'GB',
      customerType: 'B2C',
      productType: 'digital',
    });

    expect(result.taxType).toBe('DOMESTIC');
    expect(result.jurisdiction).toBe('GB');
    expect(result.taxRate).toBe(0.20);
    expect(result.taxAmount).toBe(20);
    expect(result.grossAmount).toBe(120);
    expect(result.netAmount).toBe(100);
  });

  it('should charge 20% VAT for XI B2C customer', async () => {
    const result = await calculateTax({
      amount: 100,
      billingCountry: 'XI',
      customerType: 'B2C',
      productType: 'digital',
    });

    expect(result.taxType).toBe('DOMESTIC');
    expect(result.jurisdiction).toBe('XI');
    expect(result.taxRate).toBe(0.20);
    expect(result.taxAmount).toBe(20);
    expect(result.grossAmount).toBe(120);
  });

  it('should calculate correct VAT for various amounts', async () => {
    const testCases = [
      { amount: 50, expectedTax: 10 },
      { amount: 250, expectedTax: 50 },
      { amount: 1000, expectedTax: 200 },
      { amount: 0.99, expectedTax: 0.20 },
    ];

    for (const { amount, expectedTax } of testCases) {
      const result = await calculateTax({
        amount,
        billingCountry: 'GB',
        customerType: 'B2C',
        productType: 'digital',
      });

      expect(result.taxAmount).toBeCloseTo(expectedTax, 2);
    }
  });

  it('should include evidence in B2C calculation', async () => {
    const result = await calculateTax({
      amount: 100,
      billingCountry: 'GB',
      customerType: 'B2C',
      productType: 'digital',
    });

    expect(result.evidence).toBeDefined();
    expect(result.evidence.source).toBeDefined();
    expect(result.evidence.source.length).toBeGreaterThan(0);
    expect(result.evidence.timestamp).toBeInstanceOf(Date);
  });
});

describe('UK VAT - B2B Calculations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheManager.get.mockResolvedValue(null);
    mockCacheManager.set.mockResolvedValue(true);
  });

  it('should apply reverse charge (0%) for B2B with valid UK VAT', async () => {
    mockValidateVATNumber.mockResolvedValue({
      isValid: true,
      countryCode: 'GB',
      vatNumber: 'GB123456789',
      validatedAt: new Date(),
    });

    const result = await calculateTax({
      amount: 100,
      vatNumber: 'GB123456789',
      billingCountry: 'GB',
      customerType: 'B2B',
      productType: 'digital',
    });

    expect(result.taxType).toBe('REVERSE_CHARGE');
    expect(result.taxRate).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.grossAmount).toBe(100);
    expect(result.invoiceNote).toBe('Reverse charge - Art. 196 Council Directive 2006/112/EC');
  });

  it('should apply 20% VAT for B2B without valid UK VAT number', async () => {
    const result = await calculateTax({
      amount: 100,
      billingCountry: 'GB',
      customerType: 'B2B',
      productType: 'digital',
    });

    expect(result.taxType).toBe('DOMESTIC');
    expect(result.taxRate).toBe(0.20);
    expect(result.taxAmount).toBe(20);
    expect(result.grossAmount).toBe(120);
  });

  it('should apply reverse charge for B2B with valid XI VAT', async () => {
    mockValidateVATNumber.mockResolvedValue({
      isValid: true,
      countryCode: 'XI',
      vatNumber: 'XI123456789',
      validatedAt: new Date(),
    });

    const result = await calculateTax({
      amount: 100,
      vatNumber: 'XI123456789',
      customerType: 'B2B',
      productType: 'digital',
    });

    expect(result.taxType).toBe('REVERSE_CHARGE');
    expect(result.jurisdiction).toBe('XI');
    expect(result.taxAmount).toBe(0);
  });
});

describe('UK VAT - Jurisdiction Resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheManager.get.mockResolvedValue(null);
    mockCacheManager.set.mockResolvedValue(true);
  });

  it('should resolve jurisdiction from billing country GB', async () => {
    const jurisdiction = await getJurisdiction({
      billingCountry: 'GB',
    });

    expect(jurisdiction.countryCode).toBe('GB');
    expect(jurisdiction.isEU).toBe(true);
    expect(jurisdiction.hasVAT).toBe(false);
    expect(jurisdiction.taxType).toBe('DOMESTIC');
  });

  it('should resolve jurisdiction from billing country XI', async () => {
    const jurisdiction = await getJurisdiction({
      billingCountry: 'XI',
    });

    expect(jurisdiction.countryCode).toBe('XI');
    expect(jurisdiction.isEU).toBe(true);
    expect(jurisdiction.taxType).toBe('DOMESTIC');
  });

  it('should resolve jurisdiction from valid GB VAT number', async () => {
    mockValidateVATNumber.mockResolvedValue({
      isValid: true,
      countryCode: 'GB',
      vatNumber: 'GB999999999',
      validatedAt: new Date(),
    });

    const jurisdiction = await getJurisdiction({
      vatNumber: 'GB999999999',
    });

    expect(jurisdiction.countryCode).toBe('GB');
    expect(jurisdiction.isValidVAT).toBe(true);
    expect(jurisdiction.hasVAT).toBe(true);
    expect(jurisdiction.taxType).toBe('REVERSE_CHARGE');
  });

  it('should prioritize VAT number over billing country', async () => {
    mockValidateVATNumber.mockResolvedValue({
      isValid: true,
      countryCode: 'DE',
      vatNumber: 'DE123456789',
      validatedAt: new Date(),
    });

    const jurisdiction = await getJurisdiction({
      vatNumber: 'DE123456789',
      billingCountry: 'GB',
    });

    // VAT number should take priority
    expect(jurisdiction.countryCode).toBe('DE');
    expect(jurisdiction.isValidVAT).toBe(true);
  });
});

describe('UK VAT - Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheManager.get.mockResolvedValue(null);
    mockCacheManager.set.mockResolvedValue(true);
  });

  it('should handle invalid VAT number gracefully', async () => {
    mockValidateVATNumber.mockResolvedValue({
      isValid: false,
      countryCode: null,
      vatNumber: 'GBINVALID',
      validatedAt: new Date(),
    });

    const result = await calculateTax({
      amount: 100,
      vatNumber: 'GBINVALID',
      billingCountry: 'GB',
      customerType: 'B2C',
      productType: 'digital',
    });

    // Should fall back to billing country
    expect(result.taxRate).toBe(0.20);
    expect(result.taxAmount).toBe(20);
  });

  it('should throw error for negative amount', async () => {
    await expect(
      calculateTax({
        amount: -100,
        billingCountry: 'GB',
        customerType: 'B2C',
        productType: 'digital',
      })
    ).rejects.toThrow('Amount cannot be negative');
  });

  it('should throw error when no location info provided', async () => {
    await expect(
      calculateTax({
        amount: 100,
        customerType: 'B2C',
        productType: 'digital',
      })
    ).rejects.toThrow('no valid location information provided');
  });

  it('should round tax amount correctly', async () => {
    const result = await calculateTax({
      amount: 33.33,
      billingCountry: 'GB',
      customerType: 'B2C',
      productType: 'digital',
    });

    // 33.33 * 0.20 = 6.666, should round to 6.67
    expect(result.taxAmount).toBe(6.67);
    expect(result.grossAmount).toBeCloseTo(40, 2);
  });
});

describe('UK VAT - Comparison with Other EU Countries', () => {
  it('should have same rate as other 20% EU countries', () => {
    const gbRate = getEUTaxRate('GB')?.rate;
    const atRate = getEUTaxRate('AT')?.rate;
    const bgRate = getEUTaxRate('BG')?.rate;

    // GB, AT, BG all have 20% standard rate
    expect(gbRate).toBe(0.20);
    expect(atRate).toBe(0.20);
    expect(bgRate).toBe(0.20);
  });

  it('should have different rate than high-VAT Nordic countries', () => {
    const gbRate = getEUTaxRate('GB')?.rate;
    const seRate = getEUTaxRate('SE')?.rate;
    const fiRate = getEUTaxRate('FI')?.rate;

    // Sweden and Finland have 24%
    expect(gbRate).toBeLessThan(seRate!);
    expect(gbRate).toBeLessThan(fiRate!);
  });

  it('should have higher rate than low-VAT countries', () => {
    const gbRate = getEUTaxRate('GB')?.rate;
    const luRate = getEUTaxRate('LU')?.rate;
    const mtRate = getEUTaxRate('MT')?.rate;

    // Luxembourg (17%) and Malta (18%) have lower rates
    expect(gbRate).toBeGreaterThan(luRate!);
    expect(gbRate).toBeGreaterThan(mtRate!);
  });
});

describe('UK VAT - Tax Rate ID', () => {
  it('should include taxRateId in B2C calculation', async () => {
    const result = await calculateTax({
      amount: 100,
      billingCountry: 'GB',
      customerType: 'B2C',
      productType: 'digital',
    });

    expect(result.taxRateId).toBe('GB-STD');
  });

  it('should include effectiveDate in calculation', async () => {
    const result = await calculateTax({
      amount: 100,
      billingCountry: 'GB',
      customerType: 'B2C',
      productType: 'digital',
    });

    expect(result.effectiveDate).toEqual(new Date('2024-01-01'));
  });
});
