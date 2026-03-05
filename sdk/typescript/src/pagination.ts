/**
 * Pagination helper for the Countable TypeScript SDK
 * Provides async iterator interface for paginated API responses
 */

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PaginationOptions {
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Creates an async generator that yields pages of data from a paginated API.
 * Automatically fetches subsequent pages until hasMore is false.
 * 
 * @param fetchPage - Function that fetches a single page of results
 * @param options - Optional pagination configuration
 * @yields Each page's data array
 * @example
 * ```typescript
 * const generator = paginate((page, pageSize) => 
 *   api.getItems({ page, pageSize })
 * );
 * 
 * for await (const page of generator) {
 *   console.log('Processing page:', page);
 * }
 * ```
 */
export async function* paginate<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PaginatedResponse<T>>,
  options?: PaginationOptions
): AsyncGenerator<T[], void, unknown> {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  let currentPage = 1;

  while (true) {
    let response: PaginatedResponse<T>;

    try {
      response = await fetchPage(currentPage, pageSize);
    } catch (error) {
      throw new Error(
        `Failed to fetch page ${currentPage}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    if (!response || !Array.isArray(response.data)) {
      throw new Error(
        `Invalid response from fetchPage for page ${currentPage}: expected PaginatedResponse<T>`
      );
    }

    if (response.data.length === 0) {
      return;
    }

    yield response.data;

    if (!response.hasMore) {
      return;
    }

    currentPage++;
  }
}

/**
 * Collects all pages from an async generator into a single flat array.
 * 
 * @param generator - Async generator yielding pages of data
 * @returns Flattened array containing all items from all pages
 * @example
 * ```typescript
 * const allItems = await collectAll(paginate((page, pageSize) => 
 *   api.getItems({ page, pageSize })
 * ));
 * ```
 */
export async function collectAll<T>(generator: AsyncGenerator<T[]>): Promise<T[]> {
  const results: T[] = [];

  for await (const page of generator) {
    if (!Array.isArray(page)) {
      throw new Error('Received invalid page data: expected array');
    }
    results.push(...page);
  }

  return results;
}