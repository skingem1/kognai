import { InvoicaError, AuthenticationError, NotFoundError, ValidationError } from './errors';
import { RateLimitError } from './error-compat';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message: string; code: string; details?: unknown };
  meta?: { total?: number; limit?: number; offset?: number; hasMore?: boolean };
}

export function isApiError(error: unknown): error is InvoicaError {
  return error instanceof InvoicaError;
}

export async function parseResponse<T>(response: Response): Promise<T> {
  let json: ApiResponse<T>;
  try {
    json = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new InvoicaError('Failed to parse response', 500, 'PARSE_ERROR');
  }

  if (!response.ok) {
    const errorMap: Record<number, new (message: string, statusCode: number, code: string) => InvoicaError> = {
      400: ValidationError as any,
      401: AuthenticationError as any,
      404: NotFoundError as any,
    };
    const err = json.error ?? { message: response.statusText, code: 'UNKNOWN_ERROR' };

    if (response.status === 429) {
      throw new RateLimitError(err.message);
    }

    const ErrorClass = errorMap[response.status];
    if (ErrorClass) {
      throw new ErrorClass(err.message, response.status, err.code);
    }
    throw new InvoicaError(err.message, response.status, err.code);
  }

  if (!json.success || json.data === undefined) {
    throw new InvoicaError('Response missing data', response.status, 'INVALID_RESPONSE');
  }

  return json.data;
}