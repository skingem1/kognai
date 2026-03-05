/**
 * PayAI SDK TypeScript Types
 * Core type definitions for the PayAI payment SDK
 */

export type SettlementStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface GetSettlementParams {
  startDate: string;
  endDate: string;
  status?: SettlementStatus;
}

export type WebhookEventType =
  | 'invoice.created'
  | 'invoice.paid'
  | 'invoice.settled'
  | 'settlement.completed'
  | 'settlement.failed';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: 'pending' | 'settled' | 'processing' | 'completed';
  createdAt: string;
  settledAt: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateInvoiceParams {
  amount: number;
  currency: string;
  description?: string;
  customerId?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

export interface CreateApiKeyParams {
  name: string;
}

export interface ApiKeyListResponse {
  apiKeys: ApiKey[];
  total: number;
}

export interface WebhookRegistrationConfig {
  url: string;
  events: WebhookEventType[];
  secret: string;
}

export interface WebhookRegistration {
  id: string;
  url: string;
  events: WebhookEventType[];
  active: boolean;
  createdAt: string;
}

export interface WebhookListResponse {
  webhooks: WebhookRegistration[];
  total: number;
}
