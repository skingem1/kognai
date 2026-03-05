import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock signature module with correct path
jest.mock('../signature', () => ({
  signPayload: jest.fn().mockReturnValue('mock-sig'),
}));

import { signPayload } from '../signature';

interface DispatchResult {
  success: boolean;
  statusCode: number;
  retryable: boolean;
}

describe('dispatchWebhook response handling', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    (globalThis.fetch as jest.Mock) = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns success when fetch returns ok: true, status: 200', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const { dispatchWebhook } = await import('../dispatch');
    const result: DispatchResult = await dispatchWebhook('https://example.com', { test: 'data' });

    expect(result).toEqual({ success: true, statusCode: 200, retryable: false });
    expect(signPayload).toHaveBeenCalled();
  });

  it('returns retryable error when fetch returns ok: false, status: 500', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { dispatchWebhook } = await import('../dispatch');
    const result: DispatchResult = await dispatchWebhook('https://example.com', { test: 'data' });

    expect(result).toEqual({ success: false, statusCode: 500, retryable: true });
  });

  it('returns retryable error when fetch throws an error', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { dispatchWebhook } = await import('../dispatch');
    const result: DispatchResult = await dispatchWebhook('https://example.com', { test: 'data' });

    expect(result).toEqual({ success: false, statusCode: 0, retryable: true });
  });
});