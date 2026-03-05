import { CountableClient } from './enhanced-client-v2';
import { createApiKeyMethods, createWebhookMethods } from './enhanced-client-extras-v2';
import { InvoicaClientConfig } from './client-config';

export class InvoicaFullClient extends CountableClient {
  public readonly apiKeys: ReturnType<typeof createApiKeyMethods>;
  public readonly webhooks: ReturnType<typeof createWebhookMethods>;

  constructor(config: InvoicaClientConfig) {
    super(config);
    this.apiKeys = createApiKeyMethods(this.transport);
    this.webhooks = createWebhookMethods(this.transport);
  }
}
