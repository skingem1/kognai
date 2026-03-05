import { groupBy, uniqueBy, sortBy, chunk, sumBy } from '../array-utils';

describe('groupBy', () => {
  it('groups by key and contains correct items', () => {
    const items = [{status:'pending',id:1},{status:'paid',id:2},{status:'pending',id:3}];
    const result = groupBy(items, 'status');
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['pending']).toHaveLength(2);
    expect(result['paid']).toHaveLength(1);
    expect(result['pending']).toContainEqual({status:'pending',id:1});
    expect(result['pending']).toContainEqual({status:'pending',id:3});
  });

  it('returns empty object for empty array', () => {
    expect(groupBy([], 'key')).toEqual({});
  });
});

describe('uniqueBy', () => {
  it('keeps first occurrence and handles single item', () => {
    expect(uniqueBy([{id:1,name:'a'},{id:2,name:'b'},{id:1,name:'c'}], 'id')).toHaveLength(2);
    expect(uniqueBy([{id:1,name:'a'},{id:2,name:'b'},{id:1,name:'c'}], 'id')[0].name).toBe('a');
    expect(uniqueBy([{id:1}], 'id')).toEqual([{id:1}]);
    expect(uniqueBy([], 'id')).toEqual([]);
  });
});

describe('sortBy', () => {
  it('sorts alphabetically by name', () => {
    const items = [{name:'Charlie'},{name:'Alice'},{name:'Bob'}];
    expect(sortBy(items, 'name').map(i=>i.name)).toEqual(['Alice','Bob','Charlie']);
  });

  it('sorts ascending and descending by age', () => {
    const items = [{age:30},{age:10},{age:20}];
    expect(sortBy(items, 'age').map(i=>i.age)).toEqual([10,20,30]);
    expect(sortBy(items, 'age','desc').map(i=>i.age)).toEqual([30,20,10]);
  });

  it('handles empty array and does not mutate', () => {
    const items = [{age:30},{age:10}];
    expect(sortBy([], 'name')).toEqual([]);
    sortBy(items, 'age');
    expect(items.map(i=>i.age)).toEqual([30,10]);
  });
});

describe('chunk', () => {
  it('chunks array into specified size', () => {
    expect(chunk([1,2,3,4,5], 2)).toEqual([[1,2],[3,4],[5]]);
    expect(chunk([1,2,3,4], 2)).toEqual([[1,2],[3,4]]);
    expect(chunk([1], 5)).toEqual([[1]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('sumBy', () => {
  it('sums values by key including edge cases', () => {
    expect(sumBy([{amount:10},{amount:20},{amount:30}], 'amount')).toBe(60);
    expect(sumBy([], 'amount')).toBe(0);
    expect(sumBy([{amount:0}], 'amount')).toBe(0);
    expect(sumBy([{amount:1.5},{amount:2.5}], 'amount')).toBe(4);
  });
});