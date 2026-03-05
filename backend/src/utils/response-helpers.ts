/**
 * Response formatting utilities for consistent API responses.
 * All functions are pure with no side effects and no external dependencies.
 */

/**
 * Wraps data in a standard success envelope.
 */
export function successResponse<T>(
  data: T,
  meta?: { total?: number; limit?: number; offset?: number }
): { success: true; data: T; meta?: typeof meta } {
  return { success: true, data, meta };
}

/**
 * Wraps errors in a standard error envelope.
 * The status parameter represents the HTTP status code but is not included in the error payload.
 */
export function errorResponse(
  message: string,
  code: string,
  status: number,
  details?: unknown
): { success: false; error: { message: string; code: string; details?: unknown } } {
  return {
    success: false,
    error: {
      message,
      code,
      ...(details !== undefined && { details }),
    },
  };
}

/**
 * Wraps paginated results with hasMore computed as offset + limit < total.
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number
): {
  success: true;
  data: T[];
  meta: { total: number; limit: number; offset: number; hasMore: boolean };
} {
  return {
    success: true,
    data: items,
    meta: { total, limit, offset, hasMore: offset + limit < total },
  };
}