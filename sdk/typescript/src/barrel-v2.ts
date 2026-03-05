// sdk/typescript/src/barrel-v2.ts
// Definitive barrel export - v2 fixed modules + ALL SDK features
// Pure re-exports ONLY. No logic. Maximum 40 lines.

export { CountableClient } from './enhanced-client-v2';
export { InvoicaFullClient } from './complete-client-v2';
export type { InvoicaClientConfig as CountableClientConfig } from './client-config';

export { HttpTransport } from './http-transport-v2';
export type { TransportRequestConfig } from './http-transport-v2';

export { InvoicaError, ValidationError, NotFoundError, AuthenticationError } from './errors';
export { CountableError, RateLimitError } from './error-compat';

export { createDebugLogger, isDebugEnabled } from './debug';
export type { DebugLogger } from './debug';
export { createApiKeyMethods, createWebhookMethods } from './enhanced-client-extras';
export { createInterceptorManager } from './interceptors';
export type { RequestInterceptor, ResponseInterceptor, InterceptorManager } from './interceptors';
export { detectEnvironment, getDefaultBaseUrl, getUserAgent, supportsStreaming } from './environment';
export type { SdkEnvironment } from './environment';
export { version } from './version';

export type {
  Invoice, InvoiceCreateInput, InvoiceListResponse,
  Settlement, SettlementListResponse, SettlementStatus,
  ApiKey, ApiKeyCreateResponse, ApiKeyListResponse,
  WebhookRegistration, WebhookRegistrationConfig, WebhookListResponse, WebhookEventType,
  ApiResponse, CreateInvoiceParams, CreateApiKeyParams, GetSettlementParams,
} from './types';

export type {
  InvoiceUpdateInput, DeleteResponse, PaginationParams,
  ListResponse, ErrorResponse, WebhookEvent,
} from './missing-types';