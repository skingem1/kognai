import {
  InvoicaError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
} from '../src/errors';

describe('InvoicaError', () => {
  it('should set all properties correctly', () => {
    const error = new InvoicaError('Test error', 500, 'TEST_CODE');
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('InvoicaError');
  });
});

describe('ValidationError', () => {
  it('should set default code and statusCode', () => {
    const error = new ValidationError('Invalid input');
    expect(error.message).toBe('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});

describe('NotFoundError', () => {
  it('should set default code and statusCode', () => {
    const error = new NotFoundError('Resource not found');
    expect(error.message).toBe('Resource not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('AuthenticationError', () => {
  it('should set default code and statusCode', () => {
    const error = new AuthenticationError('Unauthorized');
    expect(error.message).toBe('Unauthorized');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('AUTH_ERROR');
  });
});

describe('Error inheritance', () => {
  it('should be instanceof Error', () => {
    const error = new ValidationError('test');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof InvoicaError).toBe(true);
  });
});