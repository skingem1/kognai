import { CountableClient } from './enhanced-client';
import { createApiKeyMethods, createWebhookMethods } from './enhanced-client-extras';
import { HttpTransport } from './http-transport';
import { resolveConfig, InvoicaClientConfig } from './client-config';
import { ApiKeyCreateResponse, ApiKey, WebhookRegistration, WebhookRegistrationConfig, WebhookListResponse } from './types';

export class InvoicaFullClient extends CountableClient {
  public readonly apiKeys: ReturnType<typeof createApiKeyMethods>;
  public readonly webhooks: ReturnType<typeof createWebhookMethods>;

  constructor(config: InvoicaClientConfig) {
    super(config);
    const resolved = resolveConfig(config);
    const transport = new HttpTransport(resolved);
    this.apiKeys = createApiKeyMethods(transport);
    this.webhooks = createWebhookMethods(transport);
  }
}