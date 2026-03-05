import { paginate } from '../pagination';

describe('paginate', () => {
  it('should return correct slice and hasMore for normal data', () => {
    const items = [1, 2, 3, 4, 5];
    const result = paginate(items, 10, { limit: 5, offset: 0 });
    expect(result.data).toEqual([1, 2, 3, 4, 5]);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(10);
    expect(result.limit).toBe(5);
    expect(result.offset).toBe(0);
  });

  it('should handle empty items with total=0', () => {
    const result = paginate<string>([], 0, { limit: 10, offset: 0 });
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(0);
  });

  it('should return hasMore false when offset+limit equals total', () => {
    const items = [1, 2, 3];
    const result = paginate(items, 10, { limit: 5, offset: 5 });
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.hasMore).toBe(false);
  });

  it('should return hasMore true when offset+limit < total', () => {
    const items = [1, 2];
    const result = paginate(items, 10, { limit: 3, offset: 2 });
    expect(result.hasMore).toBe(true);
  });

  it('should return empty data and hasMore false when offset >= total', () => {
    const items = [1, 2, 3];
    const result = paginate(items, 10, { limit: 5, offset: 15 });
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});