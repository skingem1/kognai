import { createAuthHeaders, validateApiKey, signRequest, ApiKeyError } from '../src/auth';

describe('Auth Module', () => {
  describe('createAuthHeaders', () => {
    it('should create auth headers with correct structure', () => {
      const headers = createAuthHeaders('inv_1234567890abcdef1234567890abcdef');
      expect(headers).toHaveProperty('Authorization');
      expect(headers).toHaveProperty('X-Request-Id');
      expect(headers).toHaveProperty('X-Timestamp');
    });

    it('should include Bearer token in Authorization header', () => {
      const apiKey = 'inv_1234567890abcdef1234567890abcdef';
      const headers = createAuthHeaders(apiKey);
      expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
    });

    it('should generate valid UUID for X-Request-Id', () => {
      const headers = createAuthHeaders('inv_1234567890abcdef1234567890abcdef');
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(headers['X-Request-Id']).toMatch(uuidRegex);
    });

    it('should generate valid ISO timestamp for X-Timestamp', () => {
      const headers = createAuthHeaders('inv_1234567890abcdef1234567890abcdef');
      const timestamp = new Date(headers['X-Timestamp']);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe('validateApiKey', () => {
    it('should return true for valid API key', () => {
      expect(validateApiKey('inv_1234567890abcdef1234567890abcdef')).toBe(true);
    });

    it('should return false for invalid API key with wrong prefix', () => {
      expect(validateApiKey('key_1234567890abcdef1234567890abcdef')).toBe(false);
    });

    it('should return false for API key with incorrect length', () => {
      expect(validateApiKey('inv_1234567890abcdef')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateApiKey('')).toBe(false);
    });

    it('should return false for API key containing invalid characters', () => {
      expect(validateApiKey('inv_1234567890abcdef1234567890abcdez')).toBe(false);
    });
  });

  describe('signRequest', () => {
    it('should generate consistent signature for same inputs', () => {
      const apiKey = 'inv_1234567890abcdef1234567890abcdef';
      const sig1 = signRequest(apiKey, 'POST', '/api/invoices', '{"amount":100}');
      const sig2 = signRequest(apiKey, 'POST', '/api/invoices', '{"amount":100}');
      expect(sig1).toBe(sig2);
    });

    it('should generate different signatures for different methods', () => {
      const apiKey = 'inv_1234567890abcdef1234567890abcdef';
      const sig1 = signRequest(apiKey, 'GET', '/api/invoices');
      const sig2 = signRequest(apiKey, 'POST', '/api/invoices');
      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different paths', () => {
      const apiKey = 'inv_1234567890abcdef1234567890abcdef';
      const sig1 = signRequest(apiKey, 'GET', '/api/invoices');
      const sig2 = signRequest(apiKey, 'GET', '/api/customers');
      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures when body changes', () => {
      const apiKey = 'inv_1234567890abcdef1234567890abcdef';
      const sig1 = signRequest(apiKey, 'POST', '/api/invoices', '{"amount":100}');
      const sig2 = signRequest(apiKey, 'POST', '/api/invoices', '{"amount":200}');
      expect(sig1).not.toBe(sig2);
    });

    it('should return 64-character hex string', () => {
      const signature = signRequest('inv_1234567890abcdef1234567890abcdef', 'GET', '/api');
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty body parameter', () => {
      const apiKey = 'inv_1234567890abcdef1234567890abcdef';
      const sig = signRequest(apiKey, 'GET', '/api');
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('ApiKeyError', () => {
    it('should create error with message', () => {
      const error = new ApiKeyError('Invalid API key');
      expect(error.message).toBe('Invalid API key');
      expect(error.name).toBe('ApiKeyError');
    });

    it('should be instance of Error', () => {
      const error = new ApiKeyError('test');
      expect(error instanceof Error).toBe(true);
    });
  });
});
