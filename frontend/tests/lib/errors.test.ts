import { ApiError } from '../../lib/errors';

describe('ApiError', () => {
  it('creates error with message, status, and data', () => {
    const error = new ApiError('Not found', 404, { detail: 'missing' });
    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.data).toEqual({ detail: 'missing' });
  });

  it('defaults data to null when not provided', () => {
    const error = new ApiError('Error', 500);
    expect(error.data).toBeNull();
  });

  it('has name property set to ApiError', () => {
    const error = new ApiError('Err', 400);
    expect(error.name).toBe('ApiError');
  });

  it('passes instanceof checks for Error and ApiError', () => {
    const error = new ApiError('Err', 400);
    expect(error instanceof Error).toBe(true);
    expect(error instanceof ApiError).toBe(true);
  });

  it('handles null data explicitly', () => {
    const error = new ApiError('Err', 400, null);
    expect(error.data).toBeNull();
  });

  it('converts undefined data to null', () => {
    const error = new ApiError('Err', 400, undefined);
    expect(error.data).toBeNull();
  });
});