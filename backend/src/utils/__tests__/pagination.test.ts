import { parsePagination, paginate } from '../pagination';

describe('parsePagination', () => {
  it('parses string values correctly', () => {
    const result = parsePagination({ limit: '20', offset: '5' });
    expect(result).toEqual({ limit: 20, offset: 5 });
  });

  it('clamps limit to maxLimit default of 100', () => {
    const result = parsePagination({ limit: '999' });
    expect(result.limit).toBe(100);
  });

  it('clamps negative offset to 0', () => {
    const result = parsePagination({ limit: '10', offset: '-5' });
    expect(result.offset).toBe(0);
  });
});

describe('paginate', () => {
  it('returns hasMore=true when offset+limit < total', () => {
    const result = paginate([1, 2, 3], 10, { limit: 5, offset: 0 });
    expect(result.hasMore).toBe(true);
  });

  it('returns hasMore=false when offset+limit >= total', () => {
    const result = paginate([1, 2, 3], 5, { limit: 5, offset: 0 });
    expect(result.hasMore).toBe(false);
  });
});