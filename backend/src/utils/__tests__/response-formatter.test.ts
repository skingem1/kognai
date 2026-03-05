import { success, error, paginated, ApiResponse } from '../response-formatter';

describe('response-formatter', () => {
  describe('success', () => {
    it('returns success response with data', () => {
      const result = success({ foo: 'bar' });
      expect(result).toEqual({ success: true, data: { foo: 'bar' } });
    });
  });

  describe('error', () => {
    it('returns error response with code and message', () => {
      const result = error('NOT_FOUND', 'Resource not found');
      expect(result).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    });

    it('includes details when provided', () => {
      const result = error('VALIDATION_ERROR', 'Invalid input', { field: 'email' });
      expect(result.error.details).toEqual({ field: 'email' });
    });

    it('excludes details when undefined', () => {
      const result = error('BAD_REQUEST', 'Bad request');
      expect(result.error.details).toBeUndefined();
    });
  });

  describe('paginated', () => {
    it('returns paginated response with hasMore true', () => {
      const result = paginated([1, 2], 10, 5, 0);
      expect(result.data).toEqual({ items: [1, 2], total: 10, limit: 5, offset: 0, hasMore: true });
    });

    it('returns paginated response with hasMore false', () => {
      const result = paginated([1, 2], 2, 5, 0);
      expect(result.data.hasMore).toBe(false);
    });
  });
});