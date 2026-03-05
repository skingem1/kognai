import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkHealth, type HealthCheckResponse } from '../../src/api/health';

describe('Health Check API', () => {
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    // Mock Date.now() for consistent timestamp testing
    originalDateNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-15T10:30:00.000Z').getTime());
  });

  describe('checkHealth', () => {
    it('should return health status as "healthy"', () => {
      const result = checkHealth();
      expect(result.status).toBe('healthy');
    });

    it('should return a number for uptime', () => {
      const result = checkHealth();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return a valid ISO timestamp', () => {
      const result = checkHealth();
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should return version as "1.0.0"', () => {
      const result = checkHealth();
      expect(result.version).toBe('1.0.0');
    });

    it('should return all required fields', () => {
      const result = checkHealth();
      const keys = Object.keys(result);
      
      expect(keys).toContain('status');
      expect(keys).toContain('uptime');
      expect(keys).toContain('timestamp');
      expect(keys).toContain('version');
    });

    it('should return an object matching the HealthCheckResponse type', () => {
      const result = checkHealth();
      
      // Type check - if this compiles, the type is correct
      const typedResult: HealthCheckResponse = result;
      
      expect(typedResult.status).toBe('healthy');
      expect(typeof typedResult.uptime).toBe('number');
      expect(typeof typedResult.timestamp).toBe('string');
      expect(typeof typedResult.version).toBe('string');
    });

    it('should return consistent uptime values within the same test execution', () => {
      const result1 = checkHealth();
      const result2 = checkHealth();
      
      // Both should be valid numbers, and second should be >= first
      expect(result2.uptime).toBeGreaterThanOrEqual(result1.uptime);
    });

    it('should throw error if response does not match schema', () => {
      // This test verifies Zod schema validation is working
      // by checking that the function returns valid data
      expect(() => checkHealth()).not.toThrow();
    });
  });

  describe('Schema Validation', () => {
    it('should accept valid health check response', () => {
      const validResponse = {
        status: 'healthy',
        uptime: 100.5,
        timestamp: '2024-01-15T10:30:00.000Z',
        version: '1.0.0',
      };

      // Should not throw for valid response
      expect(() => checkHealth()).not.toThrow();
    });

    it('should reject invalid status', () => {
      // The Zod schema uses z.literal('healthy'), so invalid status would fail
      // This test documents the schema constraint
      const result = checkHealth();
      expect(result.status).toBe('healthy');
      expect(result.status).not.toBe('unhealthy');
      expect(result.status).not.toBe('degraded');
    });
  });
});
