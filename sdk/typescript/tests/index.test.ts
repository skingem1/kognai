// sdk/typescript/tests/index.test.ts
import {
  InvoicaClient,
  InvoicaConfig,
  RequestOptions,
  Invoice,
  CreateInvoiceParams,
  SettlementStatus,
  GetSettlementParams,
  WebhookEventType,
  ApiResponse,
  InvoicaError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  validateParams,
  verifyWebhookSignature,
  parseWebhookEvent,
} from '../src';

describe('SDK Barrel Exports', () => {
  it('exports InvoicaClient constructor', () => {
    expect(typeof InvoicaClient).toBe('function');
  });

  it('exports config types', () => {
    const config: InvoicaConfig = { apiKey: 'test-key', baseUrl: 'https://api.test.com' };
    const options: RequestOptions = { timeout: 5000 };
    expect(config.apiKey).toBe('test-key');
    expect(options.timeout).toBe(5000);
  });

  it('exports invoice types', () => {
    const invoice: Invoice = { id: 'inv_123', status: 'pending', amount: 100 };
    const params: CreateInvoiceParams = { amount: 50, currency: 'USD' };
    expect(invoice.status).toBe('pending');
    expect(params.amount).toBe(50);
  });

  it('exports settlement and webhook types', () => {
    const status: SettlementStatus = 'completed';
    const params: GetSettlementParams = { limit: 10 };
    const eventType: WebhookEventType = 'invoice.created';
    expect(status).toBe('completed');
    expect(eventType).toBe('invoice.created');
  });

  it('exports error classes', () => {
    const baseError = new InvoicaError('base');
    const validationError = new ValidationError('validation failed');
    const notFoundError = new NotFoundError('not found');
    const authError = new AuthenticationError('unauthorized');
    expect(baseError.message).toBe('base');
    expect(validationError.name).toBe('ValidationError');
    expect(notFoundError.name).toBe('NotFoundError');
    expect(authError.name).toBe('AuthenticationError');
  });

  it('exports utility functions', () => {
    expect(typeof validateParams).toBe('function');
    expect(typeof verifyWebhookSignature).toBe('function');
    expect(typeof parseWebhookEvent).toBe('function');
  });
});