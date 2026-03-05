import { unique, chunk, flatten, groupBy, intersection } from '../array-utils';

describe('array-utils', () => {
  it('unique removes duplicates from numbers', () => expect(unique([1,2,2,3,3,3])).toEqual([1,2,3]));
  it('unique removes duplicates from strings', () => expect(unique(['a','b','a'])).toEqual(['a','b']));
  it('chunk splits array into chunks of specified size', () => expect(chunk([1,2,3,4,5], 2)).toEqual([[1,2],[3,4],[5]]));
  it('chunk handles chunk size larger than array', () => expect(chunk([1,2,3], 5)).toEqual([[1,2,3]]));
  it('chunk returns empty array for size 0', () => expect(chunk([1,2], 0)).toEqual([]));
  it('flatten flattens nested arrays', () => expect(flatten([[1,2],[3],[4,5]])).toEqual([1,2,3,4,5]));
  it('flatten handles mixed depth nesting', () => expect(flatten([1,[2,3],4])).toEqual([1,2,3,4]));
  it('groupBy groups by object key', () => { const r = groupBy([{t:'a',v:1},{t:'b',v:2},{t:'a',v:3}], 't'); expect(r.a).toHaveLength(2); expect(r.b).toHaveLength(1); });
  it('groupBy groups by function', () => { const r = groupBy([1,2,3,4], (n) => n % 2 === 0 ? 'even' : 'odd'); expect(r.odd).toHaveLength(2); expect(r.even).toHaveLength(2); });
  it('intersection returns common elements', () => expect(intersection([1,2,3], [2,3,4])).toEqual([2,3]));
  it('intersection returns empty when no common elements', () => expect(intersection([1,2], [3,4])).toEqual([]));
  it('intersection handles empty arrays', () => expect(intersection([], [1,2])).toEqual([]));
});