/**
 * lib/pagination.ts
 *
 * Pagination helpers used by routes/invoices.ts.
 * Exports paginateSchema (a zod schema) and createPaginationResponse.
 */

import { z } from 'zod';

/** Reusable zod schema for page/limit query params. */
export const paginateSchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginateInput = z.infer<typeof paginateSchema>;

export interface PaginationResponse {
  page:       number;
  limit:      number;
  total:      number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

/**
 * Build a pagination metadata object for API responses.
 *
 * @param params - page, limit, and total record count
 */
export function createPaginationResponse(params: {
  page:  number;
  limit: number;
  total: number;
}): PaginationResponse {
  const { page, limit, total } = params;
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
