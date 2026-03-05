import { ApiError } from '../errors';

describe('ApiError', () => {
  it('creates instance of Error', () => {
    expect(new ApiError('Error', 500)).toBeInstanceOf(Error);
  });

  it('sets message, name, and status', () => {
    const error = new ApiError('Not Found', 404);
    expect(error.message).toBe('Not Found');
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(404);
  });

  it('sets data to null when not provided', () => {
    expect(new ApiError('Error', 500).data).toBeNull();
  });

  it('sets data when provided as object', () => {
    const error = new ApiError('Error', 404, { code: 'NOT_FOUND' });
    expect(error.data).toEqual({ code: 'NOT_FOUND' });
  });

  it('sets data when provided as string', () => {
    expect(new ApiError('Error', 400, 'invalid input').data).toBe('invalid input');
  });

  it('sets data to null when explicitly undefined', () => {
    expect(new ApiError('Error', 500, undefined).data).toBeNull();
  });

  it('handles various status codes: 400, 401, 404, 500', () => {
    [400, 401, 404, 500].forEach(status => {
      expect(new ApiError('Error', status).status).toBe(status);
    });
  });
});