import { paginate, collectAll, PaginatedResponse } from '../src/pagination';

function mockFetchPage(pages: number[][]): (page: number, pageSize: number) => Promise<PaginatedResponse<number>> {
  return async (page: number) => ({
    data: pages[page - 1] || [],
    total: pages.flat().length,
    page,
    pageSize: 10,
    hasMore: page < pages.length,
  });
}

describe('paginate', () => {
  it('yields pages from paginated API', async () => {
    const fetcher = mockFetchPage([[1, 2], [3, 4], [5]]);
    const results: number[][] = [];
    for await (const page of paginate(fetcher)) {
      results.push(page);
    }
    expect(results).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('stops on empty page', async () => {
    const fetcher = mockFetchPage([]);
    const results: number[][] = [];
    for await (const page of paginate(fetcher)) {
      results.push(page);
    }
    expect(results).toEqual([]);
  });
});

describe('collectAll', () => {
  it('flattens all pages into a single array', async () => {
    const fetcher = mockFetchPage([[1, 2], [3, 4]]);
    const all = await collectAll(paginate(fetcher));
    expect(all).toEqual([1, 2, 3, 4]);
  });
});