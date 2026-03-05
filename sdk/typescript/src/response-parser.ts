import {
  CountableError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors';

/**
 * Generic API response wrapper type
 * @template T - The type of the data payload
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message: string; code: string; details?: unknown };
  meta?: { total?: number; limit?: number; offset?: number; hasMore?: boolean };
}

/**
 * Type guard for CountableError instances
 * @param error - Value to check
 * @returns True if error is a CountableError
 */
export function isApiError(error: unknown): error is CountableError {
  return error instanceof CountableError;
}

/**
 * Parses HTTP response and returns parsed data or throws appropriate error
 * @param response - Fetch Response object
 * @returns Parsed data from successful response
 * @throws ValidationError (400), AuthenticationError (401), NotFoundError (404), RateLimitError (429), CountableError
 */
export async function parseResponse<T>(response: Response): Promise<T> {
  let json: ApiResponse<T>;
  try {
    json = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new CountableError('Failed to parse response', 'PARSE_ERROR', { status: response.status });
  }

  if (!response.ok) {
    const errorMap: Record<number, typeof CountableError> = {
      400: ValidationError,
      401: AuthenticationError,
      404: NotFoundError,
      429: RateLimitError,
    };
    const ErrorClass = errorMap[response.status] || CountableError;
    const err = json.error ?? { message: response.statusText, code: 'UNKNOWN_ERROR' };
    throw new ErrorClass(err.message, err.code, { status: response.status, details: err.details });
  }

  if (!json.success || json.data === undefined) {
    throw new CountableError('Response missing data', 'INVALID_RESPONSE', { status: response.status });
  }

  return json.data;
}