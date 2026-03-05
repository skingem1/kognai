/**
 * Tax Calculator Service Tests
 */

import { TaxCalculator } from '../../src/services/tax/calculator';
import { LocationResolver } from '../../src/services/tax/location-resolver';
import { VatValidator } from '../../src/services/tax/vat-validator';
import {
  TaxCalculationRequest,
  TaxCalculationResult,
  TaxJurisdiction,
  TransactionType
} from '../../src/services/tax/types';

// Mock the VAT validator
jest.mock('../../src/services/tax/vat-validator');
const MockVatValidator = VatValidator as jest.MockedClass<typeof VatValidator>;

// Mock the location resolver
jest.mock('../../src/services/tax/location-resolver');
const MockLocationResolver = LocationResolver as jest.MockedClass<typeof LocationResolver>;

describe('TaxCalculator', () => {
  let calculator: TaxCalculator;
  let mockVatValidator: jest.Mocked<VatValidator>;
  let mockLocationResolver: jest.Mocked<LocationResolver>;

  beforeEach(() => {
    // Create mock instances
    mockVatValidator = {
      initialize: jest.fn().mockResolvedValue(undefined),
      validateVat: jest.fn(),
      clearCache: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      getEvidence: jest.fn().mockReturnValue([]),
      getEvidenceById: jest.fn()
    } as unknown as jest.Mocked<VatValidator>;

    mockLocationResolver = {
      initialize: jest.fn().mockResolvedValue(undefined),
      resolveLocation: jest.fn(),
      getJurisdiction: jest.fn(),
      isEUCountry: jest.fn(),
      isUSCountry: jest.fn(),
      getEvidence: jest.fn().mockReturnValue([])
    } as unknown as jest.Mocked<LocationResolver>;

    // Create calculator with mocks
    calculator = new TaxCalculator(
      mockLocationResolver,
      mockVatValidator,
      {
        enableViesValidation: true,
        enableEvidenceStorage: true,
        defaultJurisdiction: TaxJurisdiction.NONE
      }
    );
  });

  describe('calculateTax', () => {
    const baseRequest: TaxCalculationRequest = {
      sellerCountry: 'DE',
      buyerCountry: 'FR',
      transactionType: TransactionType.B2C,
      amount: 100,
      productType: 'digital',
      isDigitalService: true,
      timestamp: new Date()
    };

    it('should calculate B2C VAT correctly', async () => {
      // Arrange
      mockLocationResolver.resolveLocation.mockResolvedValue({
        resolved: true,
        countryCode: 'FR',
        method: 'BILLING_ADDRESS',
        confidence: 0.8
      });
      mockLocationResolver.getJurisdiction.mockReturnValue(TaxJurisdiction.EU);
      mockLocationResolver.isEUCountry.mockReturnValue(true);

      // Act
      const result = await calculator.calculateTax(baseRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.jurisdiction).toBe(TaxJurisdiction.EU);
      expect(result.countryCode).toBe('FR');
      expect(result.reverseCharge).toBe(false);
      expect(result.taxRate).toBe(0.20); // France standard rate
      expect(result.taxAmount).toBe(20);
      expect(result.amount).toBe(120); // 100 + 20
    });

    it('should apply reverse charge for B2B with valid VAT', async () => {
      // Arrange
      const b2bRequest: TaxCalculationRequest = {
        ...baseRequest,
        transactionType: TransactionType.B2B,
        buyerVatNumber: 'FR12345678901'
      };

      mockLocationResolver.resolveLocation.mockResolvedValue({
        resolved: true,
        countryCode: 'FR',
        method: 'VAT_NUMBER',
        vatNumber: 'FR12345678901',
        isValidVat: true,
        confidence: 1.0
      });
      mockLocationResolver.getJurisdiction.mockReturnValue(TaxJurisdiction.EU);
      mockLocationResolver.isEUCountry.mockReturnValue(true);

      mockVatValidator.validateVat.mockResolvedValue({
        result: {
          isValid: true,
          countryCode: 'FR',
          vatNumber: '12345678901',
          companyName: 'Test Company',
          companyAddress: '123 Test St',
          requestDate: new Date()
        },
        evidenceId: 'evidence-123',
        fromCache: false
      });

      // Act
      const result = await calculator.calculateTax(b2bRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.reverseCharge).toBe(true);
      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.invoiceNote).toContain('Reverse charge');
    });

    it('should handle cross-border EU B2B without valid VAT', async () => {
      // Arrange
      const b2bRequestNoVat: TaxCalculationRequest = {
        ...baseRequest,
        transactionType: TransactionType.B2B,
        buyerVatNumber: undefined
      };

      mockLocationResolver.resolveLocation.mockResolvedValue({
        resolved: true,
        countryCode: 'FR',
        method: 'BILLING_ADDRESS',
        confidence: 0.8
      });
      mockLocationResolver.getJurisdiction.mockReturnValue(TaxJurisdiction.EU);
      mockLocationResolver.isEUCountry.mockReturnValue(true);

      // Act
      const result = await calculator.calculateTax(b2bRequestNoVat);

      // Assert
      expect(result.success).toBe(true);
      expect(result.reverseCharge).toBe(false);
      expect(result.taxRate).toBe(0.20); // France VAT
      expect(result.taxAmount).toBe(20);
    });

    it('should return 0 tax for non-EU countries', async () => {
      // Arrange
      const nonEuRequest: TaxCalculationRequest = {
        ...baseRequest,
        buyerCountry: 'US'
      };

      mockLocationResolver.resolveLocation.mockResolvedValue({
        resolved: true,
        countryCode: 'US',
        method: 'BILLING_ADDRESS',
        confidence: 0.8
      });
      mockLocationResolver.getJurisdiction.mockReturnValue(TaxJurisdiction.US);
      mockLocationResolver.isEUCountry.mockReturnValue(false);
      mockLocationResolver.isUSCountry.mockReturnValue(true);

      // Act
      const result = await calculator.calculateTax(nonEuRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.jurisdiction).toBe(TaxJurisdiction.US);
      expect(result.taxAmount).toBe(0); // US not implemented yet
    });

    it('should handle unknown countries', async () => {
      // Arrange
      const unknownRequest: TaxCalculationRequest = {
        ...baseRequest,
        buyerCountry: 'XX'
      };

      mockLocationResolver.resolveLocation.mockResolvedValue({
        resolved: false,
        countryCode: 'DE', // Default
        method: 'DEFAULT',
        confidence: 0
      });
      mockLocationResolver.getJurisdiction.mockReturnValue(TaxJurisdiction.NONE);

      // Act
      const result = await calculator.calculateTax(unknownRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.jurisdiction).toBe(TaxJurisdiction.NONE);
      expect(result.taxAmount).toBe(0);
    });

    it('should calculate different EU country VAT rates', async () => {
      // Test Germany (19%)
      mockLocationResolver.resolveLocation.mockResolvedValue({
        resolved: true,
        countryCode: 'DE',
        method: 'BILLING_ADDRESS',
        confidence: 0.8
      });
      mockLocationResolver.getJurisdiction.mockReturnValue(TaxJurisdiction.EU);
      mockLocationResolver.isEUCountry.mockReturnValue(true);

      const resultDE = await calculator.calculateTax(baseRequest);
      expect(resultDE.taxRate).toBe(0.19);

      // Test Hungary (27%)
      mockLocationResolver.resolveLocation.mockResolvedValue({
        resolved: true,
        countryCode: 'HU',
        method: 'BILLING_ADDRESS',
        confidence: 0.8
      });

      const resultHU = await calculator.calculateTax({
        ...baseRequest,
        buyerCountry: 'HU'
      });
      expect(resultHU.taxRate).toBe(0.27);

      // Test Sweden (25%)
      mockLocationResolver.resolveLocation.mockResolvedValue({
        resolved: true,
        countryCode: 'SE',
        method: 'BILLING_ADDRESS',
        confidence: 0.8
      });

      const resultSE = await calculator.calculateTax({
        ...baseRequest,
        buyerCountry: 'SE'
      });
      expect(resultSE.taxRate).toBe(0.25);
    });

    it('should throw error for invalid request - negative amount', async () => {
      // Arrange
      const invalidRequest: TaxCalculationRequest = {
        ...baseRequest,
        amount: -10
      };

      // Act & Assert
      await expect(calculator.calculateTax(invalidRequest)).rejects.toThrow('Amount cannot be negative');
    });

    it('should throw error for invalid request - missing buyer country', async () => {
      // Arrange
      const invalidRequest: TaxCalculationRequest = {
        ...baseRequest,
        buyerCountry: ''
      };

      // Act & Assert
      await expect(calculator.calculateTax(invalidRequest)).rejects.toThrow('Buyer country is required');
    });

    it('should throw error for invalid request - missing seller country', async () => {
      // Arrange
      const invalidRequest: TaxCalculationRequest = {
        ...baseRequest,
        sellerCountry: ''
      };

      // Act & Assert
      await expect(calculator.calculateTax(invalidRequest)).rejects.toThrow('Seller country is required');
    });

    it('should throw error for invalid transaction type', async () => {
      // Arrange
      const invalidRequest: TaxCalculationRequest = {
        ...baseRequest,
        transactionType: 'INVALID' as TransactionType
      };

      // Act & Assert
      await expect(calculator.calculateTax(invalidRequest)).rejects.toThrow('Invalid transaction type');
    });

    it('should include evidence ID in result when enabled', async () => {
      // Arrange
      mockLocationResolver.resolveLocation.mockResolvedValue({
        resolved: true,
        countryCode: 'FR',
        method: 'BILLING_ADDRESS',
        confidence: 0.8
      });
      mockLocationResolver.getJurisdiction.mockReturnValue(TaxJurisdiction.EU);
      mockLocationResolver.isEUCountry.mockReturnValue(true);

      // Act
      const result = await calculator.calculateTax(baseRequest);

      // Assert
      expect(result.calculationEvidenceId).toBeDefined();
    });

    it('should store and retrieve evidence', async () => {
      // Arrange
      mockLocationResolver.resolveLocation.mockResolvedValue({
        resolved: true,
        countryCode: 'FR',
        method: 'BILLING_ADDRESS',
        confidence: 0.8
      });
      mockLocationResolver.getJurisdiction.mockReturnValue(TaxJurisdiction.EU);
      mockLocationResolver.isEUCountry.mockReturnValue(true);

      // Act
      const result = await calculator.calculateTax(baseRequest);
      const evidence = calculator.getEvidenceById(result.calculationEvidenceId!);

      // Assert
      expect(evidence).toBeDefined();
      expect(evidence?.type).toBe('TAX_CALCULATION');
      expect(evidence?.buyerCountry).toBe('FR');
    });
  });

  describe('isEUCountry', () => {
    it('should return true for EU countries', () => {
      mockLocationResolver.isEUCountry.mockReturnValue(true);
      
      expect(calculator.isEUCountry('DE')).toBe(true);
      expect(calculator.isEUCountry('FR')).toBe(true);
      expect(calculator.isEUCountry('ES')).toBe(true);
    });

    it('should return false for non-EU countries', () => {
      mockLocationResolver.isEUCountry.mockReturnValue(false);
      
      expect(calculator.isEUCountry('US')).toBe(false);
      expect(calculator.isEUCountry('CN')).toBe(false);
    });
  });

  describe('getTaxRateForCountry', () => {
    it('should return tax rate for valid EU countries', () => {
      const rate = calculator.getTaxRateForCountry('DE');
      expect(rate.countryCode).toBe('DE');
      expect(rate.rate).toBe(0.19);
    });

    it('should throw error for unknown countries', () => {
      expect(() => calculator.getTaxRateForCountry('XX')).toThrow('No tax rate found for country: XX');
    });
  });

  describe('initialize', () => {
    it('should initialize location resolver', async () => {
      await calculator.initialize();
      expect(mockLocationResolver.initialize).toHaveBeenCalled();
    });
  });
});
