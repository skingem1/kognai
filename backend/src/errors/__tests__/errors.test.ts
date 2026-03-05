import { ApiError, ValidationError, NotFoundError, AuthenticationError, RateLimitError } from '../index';

describe('ApiError', () => {
  it('creates error with all properties', () => {
    const error = new ApiError('Test error', 500, 'TEST_ERROR', { field: 'email' });
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('TEST_ERROR');
    expect(error.name).toBe('ApiError');
    expect(error.details).toEqual({ field: 'email' });
    expect(error instanceof Error).toBe(true);
  });

  it('creates error without details', () => {
    const error = new ApiError('Test error', 500, 'TEST_ERROR');
    expect(error.details).toBeUndefined();
    expect(error instanceof Error).toBe(true);
  });
});

describe('ValidationError', () => {
  it('creates error with correct properties', () => {
    const error = new ValidationError('Validation failed', { field: 'email' });
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.name).toBe('ValidationError');
    expect(error.details).toEqual({ field: 'email' });
    expect(error instanceof ApiError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});

describe('NotFoundError', () => {
  it('creates error with correct properties', () => {
    const error = new NotFoundError('Not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.name).toBe('NotFoundError');
    expect(error instanceof ApiError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});

describe('AuthenticationError', () => {
  it('creates error with correct properties', () => {
    const error = new AuthenticationError('Unauthorized');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.name).toBe('AuthenticationError');
    expect(error instanceof ApiError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});

describe('RateLimitError', () => {
  it('creates error with correct properties', () => {
    const error = new RateLimitError('Rate limit exceeded');
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.name).toBe('RateLimitError');
    expect(error instanceof ApiError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});