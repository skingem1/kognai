import { groupBy, keyBy, unique, chunk, flatten } from '../collection';

describe('collection', () => {
  it('groupBy groups items', () => {
    expect(groupBy([{ t: 'a', v: 1 }, { t: 'b', v: 2 }, { t: 'a', v: 3 }], i => i.t)).toEqual({
      a: [{ t: 'a', v: 1 }, { t: 'a', v: 3 }],
      b: [{ t: 'b', v: 2 }],
    });
  });

  it('groupBy handles empty array', () => {
    expect(groupBy([], () => 'k')).toEqual({});
  });

  it('keyBy creates lookup', () => {
    expect(keyBy([{ id: 'a', v: 1 }, { id: 'b', v: 2 }], i => i.id)).toEqual({
      a: { id: 'a', v: 1 },
      b: { id: 'b', v: 2 },
    });
  });

  it('unique removes duplicates', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('unique with keyFn', () => {
    expect(unique([{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 1, n: 'c' }], i => i.id)).toEqual([
      { id: 1, n: 'a' },
      { id: 2, n: 'b' },
    ]);
  });

  it('chunk splits array', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('chunk handles empty', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('chunk handles size larger than array', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('flatten flattens one level', () => {
    expect(flatten([1, [2, 3], [4, 5], 6])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('flatten handles empty', () => {
    expect(flatten([])).toEqual([]);
  });
});