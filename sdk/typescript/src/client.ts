import {
  Invoice,
  InvoiceCreateInput,
  InvoiceListResponse,
  Settlement,
  SettlementListResponse,
  ApiKey,
  ApiKeyCreateResponse,
  WebhookRegistrationConfig,
  WebhookRegistration,
  WebhookListResponse,
} from './types';

interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Invoica SDK Client
 * Provides methods for interacting with the Invoica API
 */
export class InvoicaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  /**
   * Creates a new InvoicaClient instance
   * @param baseUrl - The base URL of the Invoica API
   * @param apiKey - The API key for authentication
   */
  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Makes an authenticated request to the API
   * @param options - Request configuration
   * @returns Promise resolving to the response data
   */
  private async request<T>(options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${options.path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP error ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  /**
   * Retrieves an invoice by ID
   * @param id - The invoice ID
   * @returns Promise resolving to the invoice
   */
  async getInvoice(id: string): Promise<Invoice> {
    return this.request<Invoice>({
      method: 'GET',
      path: `/invoices/${id}`,
    });
  }

  /**
   * Creates a new invoice
   * @param input - Invoice creation data
   * @returns Promise resolving to the created invoice
   */
  async createInvoice(input: InvoiceCreateInput): Promise<Invoice> {
    return this.request<Invoice>({
      method: 'POST',
      path: '/invoices',
      body: input,
    });
  }

  /**
   * Lists all invoices with optional pagination
   * @param params - Query parameters for filtering/pagination
   * @returns Promise resolving to the invoice list response
   */
  async listInvoices(params?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<InvoiceListResponse> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.offset) query.set('offset', params.offset.toString());
    if (params?.status) query.set('status', params.status);

    const queryString = query.toString();
    return this.request<InvoiceListResponse>({
      method: 'GET',
      path: `/invoices${queryString ? `?${queryString}` : ''}`,
    });
  }

  /**
   * Retrieves a settlement by ID
   * @param id - The settlement ID
   * @returns Promise resolving to the settlement
   */
  async getSettlement(id: string): Promise<Settlement> {
    return this.request<Settlement>({
      method: 'GET',
      path: `/settlements/${id}`,
    });
  }

  /**
   * Lists all settlements with optional pagination
   * @param params - Query parameters for filtering/pagination
   * @returns Promise resolving to the settlement list response
   */
  async listSettlements(params?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<SettlementListResponse> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.offset) query.set('offset', params.offset.toString());
    if (params?.status) query.set('status', params.status);

    const queryString = query.toString();
    return this.request<SettlementListResponse>({
      method: 'GET',
      path: `/settlements${queryString ? `?${queryString}` : ''}`,
    });
  }

  /**
   * Creates a new API key
   * @param name - The name for the API key
   * @returns Promise resolving to the created API key response
   */
  async createApiKey(name: string): Promise<ApiKeyCreateResponse> {
    return this.request<ApiKeyCreateResponse>({
      method: 'POST',
      path: '/api-keys',
      body: { name },
    });
  }

  /**
   * Revokes an existing API key
   * @param id - The API key ID to revoke
   * @returns Promise resolving when the key is revoked
   */
  async revokeApiKey(id: string): Promise<void> {
    return this.request<void>({
      method: 'DELETE',
      path: `/api-keys/${id}`,
    });
  }

  /**
   * Lists all API keys
   * @returns Promise resolving to the list of API keys
   */
  async listApiKeys(): Promise<ApiKey[]> {
    return this.request<ApiKey[]>({
      method: 'GET',
      path: '/api-keys',
    });
  }

  /**
   * Registers a new webhook endpoint
   * @param config - Webhook registration configuration
   * @returns Promise resolving to the webhook registration
   */
  async registerWebhook(config: WebhookRegistrationConfig): Promise<WebhookRegistration> {
    return this.request<WebhookRegistration>({
      method: 'POST',
      path: '/webhooks',
      body: config,
    });
  }

  /**
   * Lists all registered webhooks
   * @returns Promise resolving to the list of webhooks
   */
  async listWebhooks(): Promise<WebhookListResponse> {
    return this.request<WebhookListResponse>({
      method: 'GET',
      path: '/webhooks',
    });
  }

  /**
   * Deletes a webhook by ID
   * @param id - The webhook ID to delete
   * @returns Promise resolving when the webhook is deleted
   */
  async deleteWebhook(id: string): Promise<void> {
    return this.request<void>({
      method: 'DELETE',
      path: `/webhooks/${id}`,
    });
  }
}
