import { parsePagination } from '../pagination';

describe('parsePagination', () => {
  it('passes through number inputs as-is', () => {
    expect(parsePagination({ limit: 25, offset: 50 })).toEqual({ limit: 25, offset: 50 });
  });

  it('coerces string inputs to numbers', () => {
    expect(parsePagination({ limit: '20', offset: '5' })).toEqual({ limit: 20, offset: 5 });
  });

  it('applies sensible defaults for undefined inputs (limit=10, offset=0)', () => {
    expect(parsePagination({})).toEqual({ limit: 10, offset: 0 });
  });

  it('clamps negative limit to 1 and negative offset to 0', () => {
    expect(parsePagination({ limit: -5, offset: -3 })).toEqual({ limit: 1, offset: 0 });
  });

  it('clamps limit to maxLimit when exceeded', () => {
    expect(parsePagination({ limit: 500 }, { maxLimit: 100 })).toEqual({ limit: 100, offset: 0 });
  });

  it('uses custom defaults when provided', () => {
    expect(parsePagination({}, { limit: 50, maxLimit: 200 })).toEqual({ limit: 50, offset: 0 });
  });
});