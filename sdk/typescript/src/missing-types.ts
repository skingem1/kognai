export interface InvoiceUpdateInput {
  description?: string;
  metadata?: Record<string, string>;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface DeleteResponse {
  success: boolean;
  id: string;
  deletedAt: string;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface ListResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface WebhookEvent {
  id: string;
  type: import('./types').WebhookEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}