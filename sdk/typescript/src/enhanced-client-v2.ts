import { Invoice, InvoiceCreateInput, InvoiceListResponse, Settlement, SettlementListResponse } from './types';
import { HttpTransport } from './http-transport-v2';
import { resolveConfig, InvoicaClientConfig } from './client-config';
import { RateLimitTracker } from './rate-limit';

export class CountableClient {
  protected transport: HttpTransport;
  private rateLimitTracker: RateLimitTracker;

  constructor(config: InvoicaClientConfig) {
    const resolved = resolveConfig(config);
    this.transport = new HttpTransport(resolved);
    this.rateLimitTracker = new RateLimitTracker();
  }

  async getInvoice(id: string): Promise<Invoice> {
    await this.rateLimitTracker.waitIfNeeded();
    return this.transport.request<Invoice>({ method: 'GET', path: `/invoices/${id}` });
  }

  async createInvoice(input: InvoiceCreateInput): Promise<Invoice> {
    await this.rateLimitTracker.waitIfNeeded();
    return this.transport.request<Invoice>({ method: 'POST', path: '/invoices', body: input });
  }

  async listInvoices(params?: { limit?: number; offset?: number; status?: string }): Promise<InvoiceListResponse> {
    await this.rateLimitTracker.waitIfNeeded();
    return this.transport.request<InvoiceListResponse>({ method: 'GET', path: '/invoices', query: params });
  }

  async getSettlement(id: string): Promise<Settlement> {
    await this.rateLimitTracker.waitIfNeeded();
    return this.transport.request<Settlement>({ method: 'GET', path: `/settlements/${id}` });
  }

  async listSettlements(params?: { limit?: number; offset?: number }): Promise<SettlementListResponse> {
    await this.rateLimitTracker.waitIfNeeded();
    return this.transport.request<SettlementListResponse>({ method: 'GET', path: '/settlements', query: params });
  }
}