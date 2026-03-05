import { HttpTransport } from './http-transport';
import {
  ApiKey,
  ApiKeyCreateResponse,
  WebhookRegistrationConfig,
  WebhookRegistration,
  WebhookListResponse,
} from './types';

export function createApiKeyMethods(transport: HttpTransport) {
  return {
    async createApiKey(name: string): Promise<ApiKeyCreateResponse> {
      return transport.request<ApiKeyCreateResponse>({
        method: 'POST',
        path: '/api-keys',
        body: { name },
      });
    },

    async revokeApiKey(id: string): Promise<void> {
      return transport.request<void>({
        method: 'DELETE',
        path: `/api-keys/${id}`,
      });
    },

    async listApiKeys(): Promise<ApiKey[]> {
      return transport.request<ApiKey[]>({
        method: 'GET',
        path: '/api-keys',
      });
    },
  };
}

export function createWebhookMethods(transport: HttpTransport) {
  return {
    async registerWebhook(
      config: WebhookRegistrationConfig
    ): Promise<WebhookRegistration> {
      return transport.request<WebhookRegistration>({
        method: 'POST',
        path: '/webhooks',
        body: config,
      });
    },

    async listWebhooks(): Promise<WebhookListResponse> {
      return transport.request<WebhookListResponse>({
        method: 'GET',
        path: '/webhooks',
      });
    },

    async deleteWebhook(id: string): Promise<void> {
      return transport.request<void>({
        method: 'DELETE',
        path: `/webhooks/${id}`,
      });
    },
  };
}