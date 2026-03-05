/**
 * VAT Validator Service Tests
 */

import axios from 'axios';
import { VatValidator } from '../../src/services/tax/vat-validator';
import { VatValidationStatus } from '../../src/services/tax/types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VatValidator', () => {
  let validator: VatValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new VatValidator(
      { timeout: 5000, retryAttempts: 2, retryDelay: 100 },
      { host: 'localhost', port: 6379, keyPrefix: 'test:vat:', ttlSeconds: 2592000 }
    );
  });

  describe('validateVat', () => {
    it('should validate a valid VAT number from VIES API', async () => {
      // Arrange
      const mockResponse = {
        isValid: true,
        countryCode: 'DE',
        vatNumber: '123456789',
        name: 'Test Company GmbH',
        address: 'Test Street 1, 12345 Berlin'
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

      // Mock Redis
      (validator as any).redis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };

      // Act
      const result = await validator.validateVat('DE', '123456789');

      // Assert
      expect(result.result.isValid).toBe(true);
      expect(result.result.countryCode).toBe('DE');
      expect(result.result.companyName).toBe('Test Company GmbH');
      expect(result.fromCache).toBe(false);
    });

    it('should return cached result if available', async () => {
      // Arrange
      const cachedResult = {
        result: {
          isValid: true,
          countryCode: 'FR',
          vatNumber: '12345678901',
          companyName: 'Cached Company',
          requestDate: new Date()
        },
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000) // 24 hours from now
      };

      // Mock Redis with cached data
      (validator as any).redis = {
        get: jest.fn().mockResolvedValue(JSON.stringify(cachedResult)),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };

      // Act
      const result = await validator.validateVat('FR', '12345678901');

      // Assert
      expect(result.result.isValid).toBe(true);
      expect(result.result.companyName).toBe('Cached Company');
      expect(result.fromCache).toBe(true);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should handle invalid VAT number', async () => {
      // Arrange
      const mockResponse = {
        isValid: false,
        countryCode: 'DE',
        vatNumber: 'INVALID'
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

      // Mock Redis
      (validator as any).redis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };

      // Act
      const result = await validator.validateVat('DE', 'INVALID');

      // Assert
      expect(result.result.isValid).toBe(false);
      expect(result.fromCache).toBe(false);
    });

    it('should normalize VAT number and country code', async () => {
      // Arrange
      const mockResponse = {
        isValid: true,
        countryCode: 'DE',
        vatNumber: '123456789'
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

      // Mock Redis
      (validator as any).redis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };

      // Act - use lowercase and with spaces
      const result = await validator.validateVat('de', '  123456789  ');

      // Assert
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/DE/vat/123456789'),
        expect.any(Object)
      );
    });

    it('should handle VIES API errors gracefully', async () => {
      // Arrange
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      // Mock Redis (no cache)
      (validator as any).redis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };

      // Act
      const result = await validator.validateVat('DE', '123456789');

      // Assert - should return invalid result on error
      expect(result.result.isValid).toBe(false);
    });

    it('should handle 400 Bad Request from VIES', async () => {
      // Arrange
      const error = new Error('Bad Request');
      (error as any).response = { status: 400 };
      mockedAxios.get.mockRejectedValueOnce(error);

      // Mock Redis
      (validator as any).redis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };

      // Act
      const result = await validator.validateVat('DE', 'invalid-format');

      // Assert
      expect(result.result.isValid).toBe(false);
    });

    it('should retry on 503 Service Unavailable', async () => {
      // Arrange
      const serviceError = new Error('Service Unavailable');
      (serviceError as any).response = { status: 503 };
      
      mockedAxios
        .get
        .mockRejectedValueOnce(serviceError)
        .mockRejectedValueOnce(serviceError)
        .mockResolvedValueOnce({ 
          data: { isValid: true, countryCode: 'DE', vatNumber: '123456789' } 
        });

      // Mock Redis
      (validator as any).redis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };

      // Act
      const result = await validator.validateVat('DE', '123456789');

      // Assert
      expect(result.result.isValid).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    });

    it('should store validation evidence', async () => {
      // Arrange
      mockedAxios.get.mockResolvedValueOnce({ 
        data: { 
          isValid: true, 
          countryCode: 'DE', 
          vatNumber: '123456789',
          name: 'Test Company'
        } 
      });

      // Mock Redis
      (validator as any).redis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };

      // Act
      const result = await validator.validateVat('DE', '123456789', '192.168.1.1');

      // Assert
      expect(result.evidenceId).toBeDefined();
      const evidence = validator.getEvidenceById(result.evidenceId);
      expect(evidence).toBeDefined();
      expect(evidence?.type).toBe('VAT_VALIDATION');
      expect(evidence?.buyerVatNumber).toBe('123456789');
      expect(evidence?.ipAddress).toBe('192.168.1.1');
    });

    it('should work without Redis (no caching)', async () => {
      // Arrange
      mockedAxios.get.mockResolvedValueOnce({ 
        data: { 
          isValid: true, 
          countryCode: 'DE', 
          vatNumber: '123456789' 
        } 
      });

      // Don't mock Redis - let it be null
      (validator as any).redis = null;

      // Act
      const result = await validator.validateVat('DE', '123456789');

      // Assert
      expect(result.result.isValid).toBe(true);
      expect(result.fromCache).toBe(false);
    });
  });

  describe('getCacheKey', () => {
    it('should generate consistent cache keys', () => {
      // Using private method access
      const key1 = (validator as any).getCacheKey('DE', '123456789');
      const key2 = (validator as any).getCacheKey('de', '123456789');
      const key3 = (validator as any).getCacheKey('DE', '123456789');

      expect(key1).toBe(key2);
      expect(key1).toBe(key3);
      expect(key1).toContain('DE123456789');
    });
  });

  describe('evidence storage', () => {
    it('should store and retrieve evidence', async () => {
      // Arrange
      mockedAxios.get.mockResolvedValueOnce({ 
        data: { 
          isValid: true, 
          countryCode: 'FR', 
          vatNumber: '12345678901',
          name: 'French Company'
        } 
      });

      // Mock Redis
      (validator as any).redis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };

      // Act
      const result = await validator.validateVat('FR', '12345678901');
      const allEvidence = validator.getEvidence();

      // Assert
      expect(allEvidence.length).toBeGreaterThan(0);
      expect(allEvidence[0].id).toBe(result.evidenceId);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached entries', async () => {
      // Arrange
      const mockRedis = {
        keys: jest.fn().mockResolvedValue(['test:vat:DE123', 'test:vat:FR456']),
        del: jest.fn().mockResolvedValue(2),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };
      (validator as any).redis = mockRedis;

      // Act
      await validator.clearCache();

      // Assert
      expect(mockRedis.keys).toHaveBeenCalledWith('test:vat:*');
      expect(mockRedis.del).toHaveBeenCalledWith('test:vat:DE123', 'test:vat:FR456');
    });

    it('should handle empty cache', async () => {
      // Arrange
      const mockRedis = {
        keys: jest.fn().mockResolvedValue([]),
        del: jest.fn().mockResolvedValue(0),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      };
      (validator as any).redis = mockRedis;

      // Act & Assert - should not throw
      await expect(validator.clearCache()).resolves.not.toThrow();
    });
  });

  describe('close', () => {
    it('should close Redis connection', async () => {
      // Arrange
      const mockRedis = {
        quit: jest.fn().mockResolvedValue(undefined),
        get: jest.fn(),
        set: jest.fn(),
        keys: jest.fn(),
        del: jest.fn(),
        connect: jest.fn()
      };
      (validator as any).redis = mockRedis;

      // Act
      await validator.close();

      // Assert
      expect(mockRedis.quit).toHaveBeenCalled();
      expect((validator as any).redis).toBeNull();
    });
  });
});
