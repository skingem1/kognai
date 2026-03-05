import { HttpTransport } from '../src/http-transport-v2';
import { buildUrl, buildHeaders } from '../src/request-builder';
import { parseResponse } from '../src/response-parser';
import { withTimeout } from '../src/timeout';
import { retryWithBackoff } from '../src/retry';

jest.mock('../src/request-builder');
jest.mock('../src/response-parser');
jest.mock('../src/timeout');
jest.mock('../src/retry');

(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: 'ok' }) });

describe('HttpTransport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (withTimeout as jest.Mock).mockImplementation(promise => promise);
    (retryWithBackoff as jest.Mock).mockImplementation(fn => fn());
    (buildUrl as jest.Mock).mockImplementation((base, path) => base + path);
    (buildHeaders as jest.Mock).mockImplementation(key => ({ Authorization: 'Bearer ' + key }));
    (parseResponse as jest.Mock).mockResolvedValue({ data: 'ok' });
  });

  it('makes GET request without body and Content-Type header', async () => {
    const transport = new HttpTransport({ baseUrl: 'https://api.example.com', apiKey: 'test-key', timeout: 5000, maxRetries: 3 });
    await transport.request({ method: 'GET', path: '/invoices' });
    expect(buildUrl).toHaveBeenCalledWith('https://api.example.com', '/invoices', undefined);
    expect(buildHeaders).toHaveBeenCalledWith('test-key');
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/invoices', expect.objectContaining({ method: 'GET', body: undefined }));
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-key' }) }));
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.not.objectContaining({ headers: expect.objectContaining({ 'Content-Type': expect.any(String) }) }));
  });

  it('makes POST request with JSON body and Content-Type header', async () => {
    const transport = new HttpTransport({ baseUrl: 'https://api.example.com', apiKey: 'test-key', timeout: 5000, maxRetries: 3 });
    await transport.request({ method: 'POST', path: '/invoices', body: { amount: 100 } });
    expect(buildHeaders).toHaveBeenCalledWith('test-key');
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/invoices', expect.objectContaining({ method: 'POST', body: JSON.stringify({ amount: 100 }) }));
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json', Authorization: 'Bearer test-key' }) }));
  });

  it('makes DELETE request ignoring body', async () => {
    const transport = new HttpTransport({ baseUrl: 'https://api.example.com', apiKey: 'test-key', timeout: 5000, maxRetries: 3 });
    await transport.request({ method: 'DELETE', path: '/invoices/1', body: { force: true } });
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/invoices/1', expect.objectContaining({ method: 'DELETE', body: undefined }));
  });

  it('passes query params to buildUrl', async () => {
    const transport = new HttpTransport({ baseUrl: 'https://api.example.com', apiKey: 'test-key', timeout: 5000, maxRetries: 3 });
    await transport.request({ method: 'GET', path: '/invoices', query: { limit: 10 } });
    expect(buildUrl).toHaveBeenCalledWith('https://api.example.com', '/invoices', { limit: 10 });
  });

  it('calls parseResponse, withTimeout, and retryWithBackoff', async () => {
    const transport = new HttpTransport({ baseUrl: 'https://api.example.com', apiKey: 'test-key', timeout: 5000, maxRetries: 3 });
    await transport.request({ method: 'GET', path: '/invoices' });
    expect(parseResponse).toHaveBeenCalled();
    expect(withTimeout).toHaveBeenCalledWith(expect.any(Promise), 5000);
    expect(retryWithBackoff).toHaveBeenCalledWith(expect.any(Function), 3);
  });
});