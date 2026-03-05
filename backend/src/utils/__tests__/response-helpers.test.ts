import { successResponse, errorResponse, paginatedResponse } from '../response-helpers';

describe('response-helpers', () => {
  describe('successResponse', () => {
    it('should return success with data and meta', () => {
      const result = successResponse({ id: 1 }, { page: 1 });
      expect(result).toEqual({ success: true, data: { id: 1 }, meta: { page: 1 } });
    });

    it('should return success without meta when omitted', () => {
      const result = successResponse<string>('hello');
      expect(result).toEqual({ success: true, data: 'hello' });
      expect(result.data).toBe('hello');
    });
  });

  describe('errorResponse', () => {
    it('should return error with all fields', () => {
      const result = errorResponse('Not found', 'NOT_FOUND', 404, { extra: 'info' });
      expect(result).toEqual({
        success: false,
        error: { message: 'Not found', code: 'NOT_FOUND', details: { extra: 'info' } }
      });
    });

    it('should return error without details when omitted', () => {
      const result = errorResponse('Bad request', 'BAD_REQUEST', 400);
      expect(result).toEqual({ success: false, error: { message: 'Bad request', code: 'BAD_REQUEST' } });
      expect(result.error.details).toBeUndefined();
    });
  });

  describe('paginatedResponse', () => {
    it('should return hasMore=true when offset+limit < total', () => {
      const result = paginatedResponse([{ id: 1 }, { id: 2 }], 10, 2, 0);
      expect(result).toEqual({
        success: true,
        data: [{ id: 1 }, { id: 2 }],
        meta: { total: 10, limit: 2, offset: 0, hasMore: true }
      });
    });

    it('should return hasMore=false when offset+limit >= total (boundary)', () => {
      const result = paginatedResponse<string>(['a', 'b'], 10, 5, 5);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(['a', 'b']);
      expect(result.meta.total).toBe(10);
      expect(result.meta.limit).toBe(5);
      expect(result.meta.offset).toBe(5);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should handle large offset beyond total', () => {
      const result = paginatedResponse([], 5, 10, 100);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.total).toBe(5);
      expect(result.data).toEqual([]);
    });

    it('should handle zero total with empty array', () => {
      const result = paginatedResponse<string>([], 0, 10, 0);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.total).toBe(0);
    });
  });
});