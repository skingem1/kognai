import {
  formatErrorMessage,
  isRetryableStatus,
  getSuggestedAction,
  toErrorLog,
  categorizeError,
} from '../error-formatter';

describe('formatErrorMessage', () => {
  it('401 contains Authentication failed', () => {
    expect(formatErrorMessage(401, 'Unauthorized')).toContain('Authentication failed');
  });
  it('404 contains Resource not found', () => {
    expect(formatErrorMessage(404, 'Not found')).toContain('Resource not found');
  });
  it('429 contains Rate limit exceeded', () => {
    expect(formatErrorMessage(429, 'Too many')).toContain('Rate limit exceeded');
  });
  it('500 contains Server error', () => {
    expect(formatErrorMessage(500, 'Internal')).toContain('Server error');
  });
  it('400 contains Invalid request', () => {
    expect(formatErrorMessage(400, 'Bad')).toContain('Invalid request');
  });
});

describe('isRetryableStatus', () => {
  it('429 is true', () => expect(isRetryableStatus(429)).toBe(true));
  it('500 is true', () => expect(isRetryableStatus(500)).toBe(true));
  it('502 is true', () => expect(isRetryableStatus(502)).toBe(true));
  it('503 is true', () => expect(isRetryableStatus(503)).toBe(true));
  it('504 is true', () => expect(isRetryableStatus(504)).toBe(true));
  it('400 is false', () => expect(isRetryableStatus(400)).toBe(false));
  it('401 is false', () => expect(isRetryableStatus(401)).toBe(false));
  it('404 is false', () => expect(isRetryableStatus(404)).toBe(false));
});

describe('getSuggestedAction', () => {
  it('401 mentions API key', () => expect(getSuggestedAction(401)).toMatch(/API key/i));
  it('404 mentions resource', () => expect(getSuggestedAction(404)).toMatch(/resource/i));
  it('429 mentions retry or rate limit', () => expect(getSuggestedAction(429)).toMatch(/retry|rate limit/i));
  it('500 mentions retry or support', () => expect(getSuggestedAction(500)).toMatch(/retry|support/i));
  it('418 returns default', () => expect(getSuggestedAction(418)).toMatch(/check.*request/i));
});

describe('toErrorLog', () => {
  it('returns object with all fields', () => {
    const r = toErrorLog(401, 'err', '/path', 'req-1');
    expect(r.statusCode).toBe(401); expect(r.message).toBe('err');
    expect(r.path).toBe('/path'); expect(r.requestId).toBe('req-1');
    expect(r.retryable).toBe(false); expect(Date.parse(r.timestamp!)).not.toBeNaN();
  });
  it('requestId null when not provided', () => expect(toErrorLog(400, 'e', '/').requestId).toBeNull());
  it('500 is retryable', () => expect(toErrorLog(500, 'e', '/').retryable).toBe(true));
  it('404 is not retryable', () => expect(toErrorLog(404, 'e', '/').retryable).toBe(false));
});

describe('categorizeError', () => {
  it('401 => authentication', () => expect(categorizeError(401)).toBe('authentication'));
  it('403 => authorization', () => expect(categorizeError(403)).toBe('authorization'));
  it('404 => not_found', () => expect(categorizeError(404)).toBe('not_found'));
  it('422 => validation', () => expect(categorizeError(422)).toBe('validation'));
  it('429 => rate_limit', () => expect(categorizeError(429)).toBe('rate_limit'));
  it('500 => server', () => expect(categorizeError(500)).toBe('server'));
  it('502 => server', () => expect(categorizeError(502)).toBe('server'));
  it('418 => unknown', () => expect(categorizeError(418)).toBe('unknown'));
});