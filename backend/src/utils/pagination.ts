/**
 * Pagination utility module for consistent API pagination
 * Provides helpers for parsing query parameters and building paginated responses
 */

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Parse pagination parameters from query string or numeric values
 * @param query - Query object containing optional limit and offset
 * @param defaults - Optional defaults configuration with limit and maxLimit
 * @returns Parsed PaginationParams with clamped values
 */
export function parsePagination(
  query: { limit?: string | number; offset?: string | number },
  defaults?: { limit?: number; maxLimit?: number }
): PaginationParams {
  const maxLimit = defaults?.maxLimit ?? 100;
  const defaultLimit = defaults?.limit ?? 10;

  // Parse limit - handle string, number, undefined, null
  let limit: number;
  if (query.limit === undefined || query.limit === null) {
    limit = defaultLimit;
  } else if (typeof query.limit === 'number' && Number.isFinite(query.limit)) {
    limit = query.limit;
  } else if (typeof query.limit === 'string') {
    const parsed = parseInt(query.limit, 10);
    limit = Number.isNaN(parsed) ? defaultLimit : parsed;
  } else {
    limit = defaultLimit;
  }

  // Clamp limit between 1 and maxLimit (inclusive)
  limit = Math.max(1, Math.min(limit, maxLimit));

  // Parse offset - handle string, number, undefined, null
  let offset: number;
  if (query.offset === undefined || query.offset === null) {
    offset = 0;
  } else if (typeof query.offset === 'number' && Number.isFinite(query.offset)) {
    offset = query.offset;
  } else if (typeof query.offset === 'string') {
    const parsed = parseInt(query.offset, 10);
    offset = Number.isNaN(parsed) ? 0 : parsed;
  } else {
    offset = 0;
  }

  // Ensure offset is non-negative
  offset = Math.max(0, offset);

  return { limit, offset };
}

/**
 * Create a paginated result from items and total count
 * @param items - Array of items for current page
 * @param total - Total number of items across all pages
 * @param params - Pagination parameters (limit and offset)
 * @returns Paginated result with metadata
 */
export function paginate<T>(
  items: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  return {
    data: items,
    total,
    limit: params.limit,
    offset: params.offset,
    hasMore: params.offset + params.limit < total,
  };
}