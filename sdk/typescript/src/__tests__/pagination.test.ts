import { paginate, collectAll } from '../pagination';

describe('paginate', () => {
  it('yields pages from fetchPage', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ data: ['a', 'b'], hasMore: true, nextToken: 't1' })
      .mockResolvedValueOnce({ data: ['c'], hasMore: false });
    const pages: string[][] = [];
    for await (const page of paginate(mockFetch)) pages.push(page);
    expect(pages).toEqual([['a', 'b'], ['c']]);
  });

  it('stops when hasMore=false', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ data: ['a'], hasMore: false });
    const pages: string[][] = [];
    for await (const page of paginate(mockFetch)) pages.push(page);
    expect(pages).toEqual([['a']]);
  });

  it('stops when data is empty', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ data: [], hasMore: true });
    const pages: string[][] = [];
    for await (const page of paginate(mockFetch)) pages.push(page);
    expect(pages).toEqual([[]]);
  });

  it('respects maxPages option', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValue({ data: ['a'], hasMore: true });
    const pages: string[][] = [];
    for await (const page of paginate(mockFetch, { maxPages: 2 })) pages.push(page);
    expect(pages).toEqual([['a'], ['a']]);
  });
});

describe('collectAll', () => {
  it('flattens multiple pages into one array', async () => {
    async function* gen(): AsyncGenerator<string[]> { yield ['a', 'b']; yield ['c']; }
    const result = await collectAll(gen());
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array for generator with no pages', async () => {
    async function* gen(): AsyncGenerator<string[]> { return; }
    const result = await collectAll(gen());
    expect(result).toEqual([]);
  });
});