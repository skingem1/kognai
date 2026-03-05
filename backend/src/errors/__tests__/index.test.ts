import { describe, it, expect } from '@jest/globals';
import {
  ApiError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  RateLimitError,
} from '../index';

describe('Error Classes', () => {
  it('ApiError sets message, statusCode, code, and name', () => {
    const error = new ApiError('Test message', 500, 'TEST_CODE', { extra: 'data' });
    expect(error.message).toBe('Test message');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('ApiError');
  });

  it('ValidationError has statusCode=400 and code=VALIDATION_ERROR', () => {
    const error = new ValidationError('Validation failed', { field: 'email' });
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('NotFoundError has statusCode=404', () => {
    const error = new NotFoundError('Resource not found');
    expect(error.statusCode).toBe(404);
  });

  it('AuthenticationError has statusCode=401 and code=UNAUTHORIZED', () => {
    const error = new AuthenticationError('Unauthorized');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('All error classes are instanceof Error', () => {
    expect(new ApiError('msg', 500, 'CODE')).toBeInstanceOf(Error);
    expect(new ValidationError('msg')).toBeInstanceOf(Error);
    expect(new NotFoundError('msg')).toBeInstanceOf(Error);
    expect(new AuthenticationError('msg')).toBeInstanceOf(Error);
    expect(new RateLimitError('msg')).toBeInstanceOf(Error);
  });
});