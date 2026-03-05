export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function success<T>(data: T): ApiSuccessResponse<T> {
  return { success: true, data };
}

export function error(code: string, message: string, details?: unknown): ApiErrorResponse {
  return {
    success: false,
    error: { code, message, ...(details !== undefined && { details }) },
  };
}

export function paginated<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number
): ApiSuccessResponse<{ items: T[]; total: number; limit: number; offset: number; hasMore: boolean }> {
  return success({ items, total, limit, offset, hasMore: offset + limit < total });
}