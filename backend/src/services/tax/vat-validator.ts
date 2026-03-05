/**
 * VAT Validator Service
 * 
 * Validates VAT numbers via EU VIES API with Redis caching
 * Stores validation evidence for compliance
 */

import axios, { AxiosError } from 'axios';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  VatValidationResult,
  CachedVatValidation,
  VatValidationStatus,
  TaxEvidence,
  ViesConfig,
  RedisConfig
} from './types';

/**
 * Default VIES configuration
 */
const DEFAULT_VIES_CONFIG: ViesConfig = {
  timeout: 10000,
  retryAttempts: 3,
  retryDelay: 1000
};

/**
 * Default Redis configuration
 */
const DEFAULT_REDIS_CONFIG: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  keyPrefix: 'tax:vat:',
  ttlSeconds: 2592000 // 30 days
};

/**
 * VIES API service for EU VAT validation
 */
export class VatValidator {
  private redis: Redis | null = null;
  private config: ViesConfig;
  private redisConfig: RedisConfig;
  private evidenceStore: Map<string, TaxEvidence> = new Map();

  /**
   * Create a new VatValidator instance
   * @param config - VIES configuration
   * @param redisConfig - Redis configuration
   */
  constructor(config?: Partial<ViesConfig>, redisConfig?: Partial<RedisConfig>) {
    this.config = { ...DEFAULT_VIES_CONFIG, ...config };
    this.redisConfig = { ...DEFAULT_REDIS_CONFIG, ...redisConfig };
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    if (!this.redis) {
      this.redis = new Redis({
        host: this.redisConfig.host,
        port: this.redisConfig.port,
        lazyConnect: true,
        retryStrategy: () => null
      });
      await this.redis.connect().catch(() => {
        // Redis not available, continue without caching
        console.warn('Redis not available, VAT validation caching disabled');
        this.redis = null;
      });
    }
  }

  /**
   * Generate cache key for VAT number
   */
  private getCacheKey(countryCode: string, vatNumber: string): string {
    return `${this.redisConfig.keyPrefix}${countryCode}${vatNumber}`.toUpperCase();
  }

  /**
   * Get cached validation result
   */
  private async getCachedResult(countryCode: string, vatNumber: string): Promise<VatValidationResult | null> {
    if (!this.redis) return null;

    try {
      const key = this.getCacheKey(countryCode, vatNumber);
      const cached = await this.redis.get(key);
      
      if (cached) {
        const parsed: CachedVatValidation = JSON.parse(cached);
        if (new Date(parsed.expiresAt) > new Date()) {
          return parsed.result;
        }
        // Expired, delete it
        await this.redis.del(key);
      }
    } catch (error) {
      console.error('Error reading from cache:', error);
    }
    
    return null;
  }

  /**
   * Cache validation result
   */
  private async cacheResult(countryCode: string, vatNumber: string, result: VatValidationResult): Promise<void> {
    if (!this.redis) return;

    try {
      const cached: CachedVatValidation = {
        result,
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() + this.redisConfig.ttlSeconds * 1000)
      };
      
      const key = this.getCacheKey(countryCode, vatNumber);
      await this.redis.set(key, JSON.stringify(cached), 'EX', this.redisConfig.ttlSeconds);
    } catch (error) {
      console.error('Error caching result:', error);
    }
  }

  /**
   * Store validation evidence for compliance
   */
  private async storeEvidence(
    countryCode: string,
    vatNumber: string,
    result: VatValidationResult,
    ipAddress?: string
  ): Promise<string> {
    const evidence: TaxEvidence = {
      id: uuidv4(),
      type: 'VAT_VALIDATION',
      buyerCountry: countryCode,
      sellerCountry: '', // Will be set by caller
      buyerVatNumber: vatNumber,
      ipAddress,
      evidence: {
        vatNumber: result.vatNumber,
        companyName: result.companyName,
        companyAddress: result.companyAddress,
        validFrom: result.validFrom,
        validTo: result.validTo,
        requestDate: result.requestDate,
        status: result.isValid ? VatValidationStatus.VALID : VatValidationStatus.INVALID
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000) // 7 years for tax records
    };

    // Store in memory (in production, persist to database)
    this.evidenceStore.set(evidence.id, evidence);
    
    // In production, also save to database:
    // await this.saveEvidenceToDatabase(evidence);
    
    return evidence.id;
  }

  /**
   * Validate VAT number via VIES API
   * @param countryCode - Two-letter EU country code
   * @param vatNumber - VAT number to validate (without country code)
   * @param ipAddress - Optional IP address for evidence
   * @returns Validation result with evidence ID
   */
  async validateVat(
    countryCode: string,
    vatNumber: string,
    ipAddress?: string
  ): Promise<{
    result: VatValidationResult;
    evidenceId: string;
    fromCache: boolean;
  }> {
    const normalizedCountry = countryCode.toUpperCase();
    const normalizedVat = vatNumber.replace(/[\s.-]/g, '').toUpperCase();

    // Check cache first
    const cachedResult = await this.getCachedResult(normalizedCountry, normalizedVat);
    if (cachedResult) {
      const evidenceId = await this.storeEvidence(
        normalizedCountry,
        normalizedVat,
        cachedResult,
        ipAddress
      );
      
      return {
        result: cachedResult,
        evidenceId,
        fromCache: true
      };
    }

    // Call VIES API with retry logic
    const result = await this.callViesApi(normalizedCountry, normalizedVat);
    
    // Cache the result
    await this.cacheResult(normalizedCountry, normalizedVat, result);
    
    // Store evidence
    const evidenceId = await this.storeEvidence(normalizedCountry, normalizedVat, result, ipAddress);

    return {
      result,
      evidenceId,
      fromCache: false
    };
  }

  /**
   * Call VIES SOAP/REST API with retry logic
   */
  private async callViesApi(countryCode: string, vatNumber: string): Promise<VatValidationResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        // Using the VIES REST API endpoint
        const response = await axios.get(
          `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${countryCode}/vat/${vatNumber}`,
          {
            timeout: this.config.timeout,
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (response.data) {
          return {
            isValid: response.data.isValid ?? false,
            countryCode: response.data.countryCode ?? countryCode,
            vatNumber: response.data.vatNumber ?? vatNumber,
            companyName: response.data.name,
            companyAddress: response.data.address,
            requestDate: new Date(),
            validFrom: response.data.validFrom ? new Date(response.data.validFrom) : undefined,
            validTo: response.data.validTo ? new Date(response.data.validTo) : undefined
          };
        }
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a rate limit or service unavailable
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          if (axiosError.response?.status === 503 || axiosError.response?.status === 429) {
            // Service unavailable, wait and retry
            await this.delay(this.config.retryDelay * (attempt + 1));
            continue;
          }
          if (axiosError.response?.status === 400) {
            // Invalid request format
            return {
              isValid: false,
              countryCode,
              vatNumber,
              requestDate: new Date()
            };
          }
        }
        
        // Non-retryable error
        break;
      }
    }

    // Return error result if all retries failed
    console.error('VIES API call failed:', lastError);
    return {
      isValid: false,
      countryCode,
      vatNumber,
      requestDate: new Date()
    };
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all stored evidence
   */
  getEvidence(): TaxEvidence[] {
    return Array.from(this.evidenceStore.values());
  }

  /**
   * Get evidence by ID
   */
  getEvidenceById(id: string): TaxEvidence | undefined {
    return this.evidenceStore.get(id);
  }

  /**
   * Clear all cached data (for testing)
   */
  async clearCache(): Promise<void> {
    if (this.redis) {
      const keys = await this.redis.keys(`${this.redisConfig.keyPrefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}

/**
 * Default VAT validator instance
 */
let defaultValidator: VatValidator | null = null;

/**
 * Get or create default VAT validator
 */
export function getVatValidator(): VatValidator {
  if (!defaultValidator) {
    defaultValidator = new VatValidator();
  }
  return defaultValidator;
}

export default VatValidator;
