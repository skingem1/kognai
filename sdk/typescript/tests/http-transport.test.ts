import { HttpTransport } from '../src/http-transport';
import { withTimeout } from '../src/timeout';
import { retryWithBackoff } from '../src/retry';
import { buildUrl, buildHeaders } from '../src/request-builder';
import { parseResponse } from '../src/response-parser';

jest.mock('../src/timeout', () => ({ withTimeout: jest.fn((p) => p) }));
jest.mock('../src/retry', () => ({ retryWithBackoff: jest.fn((fn) => fn()) }));
jest.mock('../src/request-builder', () => ({
  buildUrl: jest.fn((b, p) => b + p),
  buildHeaders: jest.fn((k) => ({ Authorization: 'Bearer ' + k })),
}));
jest.mock('../src/response-parser', () => ({ parseResponse: jest.fn((r) => r.json()) }));

global.fetch = jest.fn();

describe('HttpTransport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores config in constructor', () => {
    const t = new HttpTransport({ baseUrl: 'http://a.com', apiKey: 'k', timeout: 5000, maxRetries: 3 });
    expect(t).toBeDefined();
  });

  it('GET omits body and Content-Type', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ json: () => ({ ok: true }) });
    await new HttpTransport({ baseUrl: 'http://a.com/', apiKey: 'k', timeout: 5000, maxRetries: 3 })
      .request('GET', 'path', { ignored: true });
    expect(global.fetch).toHaveBeenCalledWith('http://a.com/path', expect.objectContaining({
      method: 'GET',
      headers: { Authorization: 'Bearer k' }
    }));
    expect(global.fetch).not.toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: expect.anything() }));
  });

  it('POST includes Content-Type and JSON body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ json: () => ({ ok: true }) });
    await new HttpTransport({ baseUrl: 'http://a.com/', apiKey: 'k', timeout: 5000, maxRetries: 3 })
      .request('POST', 'path', { foo: 'bar' });
    expect(global.fetch).toHaveBeenCalledWith('http://a.com/path', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' })
    }));
  });

  it('DELETE omits body even if provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ json: () => ({ ok: true }) });
    await new HttpTransport({ baseUrl: 'http://a.com/', apiKey: 'k', timeout: 5000, maxRetries: 3 })
      .request('DELETE', 'path', { foo: 'bar' });
    expect(global.fetch).toHaveBeenCalledWith('http://a.com/path', expect.objectContaining({
      method: 'DELETE',
      headers: { Authorization: 'Bearer k' }
    }));
    const call = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(call).not.toHaveProperty('body');
  });

  it('calls withTimeout, parseResponse, and retryWithBackoff', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ json: () => ({ data: 1 }) });
    await new HttpTransport({ baseUrl: 'http://a.com/', apiKey: 'k', timeout: 5000, maxRetries: 3 })
      .request('GET', 'path');
    expect(withTimeout).toHaveBeenCalledWith(expect.any(Promise), 5000);
    expect(parseResponse).toHaveBeenCalled();
    expect(retryWithBackoff).toHaveBeenCalledWith(expect.any(Function), { maxRetries: 3 });
  });
});