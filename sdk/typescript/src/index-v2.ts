// sdk/typescript/src/index-v2.ts
// Definitive v2 package entry point - pure re-exports only

// Client classes
export { CountableClient } from './enhanced-client-v2';
export { InvoicaFullClient } from './complete-client-v2';
export type { InvoicaClientConfig as CountableClientConfig } from './client-config';

// Transport
export { HttpTransport } from './http-transport-v2';
export type { TransportRequestConfig } from './http-transport-v2';

// Errors
export { InvoicaError, ValidationError, NotFoundError, AuthenticationError } from './errors';
export { CountableError, RateLimitError } from './error-compat';

// Response parsing
export { parseResponse, isApiError } from './response-parser-v2';
export type { ApiResponse } from './response-parser-v2';

// Utilities
export { createDebugLogger, isDebugEnabled } from './debug';
export type { DebugLogger } from './debug';
export { createApiKeyMethods, createWebhookMethods } from './enhanced-client-extras-v2';
export { createInterceptorManager } from './interceptors';
export type { RequestInterceptor, ResponseInterceptor, InterceptorManager } from './interceptors';
export { detectEnvironment, getDefaultBaseUrl, getUserAgent, supportsStreaming } from './environment';
export type { SdkEnvironment } from './environment';
export { version } from './version';

// Core types
export type {
  Invoice, InvoiceCreateInput, InvoiceListResponse,
  Settlement, SettlementListResponse, SettlementStatus,
  ApiKey, ApiKeyCreateResponse, ApiKeyListResponse,
  WebhookRegistration, WebhookRegistrationConfig, WebhookListResponse, WebhookEventType,
  CreateInvoiceParams, CreateApiKeyParams, GetSettlementParams,
} from './types';

// Extended types
export type {
  InvoiceUpdateInput, DeleteResponse, PaginationParams,
  ListResponse, ErrorResponse, WebhookEvent,
} from './missing-types';