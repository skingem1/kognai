import { HttpTransport } from '../http-transport';

jest.mock('../timeout', () => ({ withTimeout: jest.fn((p) => p) }));
jest.mock('../retry', () => ({ retryWithBackoff: jest.fn((fn) => fn()) }));
jest.mock('../request-builder', () => ({
  buildUrl: jest.fn((base, path) => `${base}${path}`),
  buildHeaders: jest.fn((key) => ({ Authorization: `Bearer ${key}` })),
}));
jest.mock('../response-parser', () => ({ parseResponse: jest.fn() }));

import { withTimeout } from '../timeout';
import { retryWithBackoff } from '../retry';
import { buildUrl, buildHeaders } from '../request-builder';
import { parseResponse } from '../response-parser';

describe('HttpTransport', () => {
  let transport: HttpTransport;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    transport = new HttpTransport({ baseUrl: 'https://api.test.com', apiKey: 'test-key', timeout: 5000, maxRetries: 2 });
    mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    globalThis.fetch = mockFetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET request calls fetch with correct URL, method, headers and no body', async () => {
    (parseResponse as jest.Mock).mockResolvedValueOnce({ data: 'test' });
    await transport.request('GET', '/users');
    expect(buildUrl).toHaveBeenCalledWith('https://api.test.com', '/users');
    expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/users', expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer test-key' }) }));
    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: undefined }));
  });

  it('POST request includes JSON.stringify(body) and Content-Type header', async () => {
    (parseResponse as jest.Mock).mockResolvedValueOnce({ data: 'created' });
    const body = { name: 'test' };
    await transport.request('POST', '/users', body);
    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }));
    expect(buildHeaders).toHaveBeenCalledWith('test-key');
  });

  it('DELETE request does not include body even if body param provided', async () => {
    (parseResponse as jest.Mock).mockResolvedValueOnce({ data: 'deleted' });
    await transport.request('DELETE', '/users/1', { force: true });
    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'DELETE', body: undefined }));
  });

  it('PATCH request includes body when provided', async () => {
    (parseResponse as jest.Mock).mockResolvedValueOnce({ data: 'updated' });
    const body = { name: 'updated' };
    await transport.request('PATCH', '/users/1', body);
    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PATCH', body: JSON.stringify(body) }));
  });

  it('withTimeout is called with fetch promise and config.timeout', async () => {
    (parseResponse as jest.Mock).mockResolvedValueOnce({ data: 'test' });
    await transport.request('GET', '/users');
    expect(withTimeout).toHaveBeenCalledWith(expect.any(Promise), 5000);
  });

  it('retryWithBackoff is called with config.maxRetries', async () => {
    (parseResponse as jest.Mock).mockResolvedValueOnce({ data: 'test' });
    await transport.request('GET', '/users');
    expect(retryWithBackoff).toHaveBeenCalledWith(expect.any(Function), 2);
  });

  it('parseResponse is called with the fetch Response', async () => {
    const mockResp = { ok: true, json: () => Promise.resolve({ data: 'test' }) };
    mockFetch.mockResolvedValueOnce(mockResp);
    (parseResponse as jest.Mock).mockResolvedValueOnce({ data: 'test' });
    await transport.request('GET', '/users');
    expect(parseResponse).toHaveBeenCalledWith(mockResp);
  });
});