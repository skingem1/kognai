import { extractApiKey, validateApiKeyFormat, AUTH_ERRORS } from '../auth';
import { Request } from 'express';

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

describe('extractApiKey', () => {
  it('extracts from x-api-key header', () => {
    const req = mockReq({ 'x-api-key': 'sk_test_abc123def456ghi789jkl012mno345' });
    expect(extractApiKey(req)).toBe('sk_test_abc123def456ghi789jkl012mno345');
  });

  it('extracts from Authorization Bearer header', () => {
    const req = mockReq({ authorization: 'Bearer sk_test_abc123def456ghi789jkl012mno345' });
    expect(extractApiKey(req)).toBe('sk_test_abc123def456ghi789jkl012mno345');
  });

  it('returns null when no key provided', () => {
    const req = mockReq({});
    expect(extractApiKey(req)).toBeNull();
  });

  it('trims whitespace from extracted key', () => {
    const req = mockReq({ 'x-api-key': '  sk_test_abc123def456ghi789jkl012mno345  ' });
    expect(extractApiKey(req)).toBe('sk_test_abc123def456ghi789jkl012mno345');
  });
});

describe('validateApiKeyFormat', () => {
  it('accepts valid 32+ character alphanumeric key', () => {
    expect(validateApiKeyFormat('sk_test_abc123def456ghi789jkl012mno345')).toBe(true);
  });

  it('rejects key shorter than 32 characters', () => {
    expect(validateApiKeyFormat('short_key')).toBe(false);
  });

  it('rejects key with special characters', () => {
    expect(validateApiKeyFormat('sk_test_abc123def456!@#$ghi789jkl0')).toBe(false);
  });
});

describe('AUTH_ERRORS', () => {
  it('has correct status codes', () => {
    expect(AUTH_ERRORS.MISSING_API_KEY.statusCode).toBe(401);
    expect(AUTH_ERRORS.INVALID_API_KEY.statusCode).toBe(401);
    expect(AUTH_ERRORS.INSUFFICIENT_PERMISSIONS.statusCode).toBe(403);
    expect(AUTH_ERRORS.RATE_LIMIT_EXCEEDED.statusCode).toBe(429);
  });
});