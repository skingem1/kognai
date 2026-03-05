import { createAuthHeaders, validateApiKey, signRequest, ApiKeyError } from '../auth';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: () => 'test-uuid-1234-5678',
}));

describe('auth', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2024-01-01T00:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createAuthHeaders', () => {
    it('returns correct Authorization, X-Request-Id, X-Timestamp', () => {
      const headers = createAuthHeaders('test-key');
      expect(headers.Authorization).toBe('Bearer test-key');
      expect(headers['X-Request-Id']).toBe('test-uuid-1234-5678');
      expect(headers['X-Timestamp']).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('validateApiKey', () => {
    it('returns true for valid key with 32 hex chars', () => {
      expect(validateApiKey('inv_0123456789abcdef0123456789abcdef')).toBe(true);
    });

    it('returns false for invalid keys', () => {
      expect(validateApiKey('key_0123456789abcdef0123456789abcdef')).toBe(false);
      expect(validateApiKey('inv_abc')).toBe(false);
      expect(validateApiKey('inv_0123456789abcdef0123456789abcdef00')).toBe(false);
      expect(validateApiKey('inv_ghijklmnopqrstuvwxyz0123456789')).toBe(false);
    });
  });

  describe('signRequest', () => {
    it('produces consistent HMAC for same inputs', () => {
      const sig1 = signRequest('testkey', 'GET', '/api', '');
      const sig2 = signRequest('testkey', 'GET', '/api', '');
      expect(sig1).toBe(sig2);
    });

    it('produces different HMAC for different inputs', () => {
      const sig1 = signRequest('testkey', 'GET', '/api', '');
      const sig2 = signRequest('testkey', 'POST', '/api', '');
      expect(sig1).not.toBe(sig2);
    });

    it('handles missing body as empty string', () => {
      const sig = signRequest('testkey', 'GET', '/api');
      expect(typeof sig).toBe('string');
      expect(sig.length).toBe(64);
    });
  });

  describe('ApiKeyError', () => {
    it('has correct name and message', () => {
      const error = new ApiKeyError('Invalid key');
      expect(error.name).toBe('ApiKeyError');
      expect(error.message).toBe('Invalid key');
    });
  });
});