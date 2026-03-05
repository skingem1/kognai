import { InvoicaError, ValidationError, NotFoundError, AuthenticationError } from '../errors';

describe('Error Classes', () => {
  describe('InvoicaError', () => {
    it('sets message, statusCode, code, and name correctly', () => {
      const error = new InvoicaError('Test error', 500, 'TEST_CODE');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('InvoicaError');
    });

    it('is instanceof Error', () => {
      const error = new InvoicaError('Test', 500, 'TEST');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('ValidationError', () => {
    it('has statusCode 400, code VALIDATION_ERROR, and name ValidationError', () => {
      const error = new ValidationError('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
      expect(error instanceof InvoicaError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('NotFoundError', () => {
    it('has statusCode 404, code NOT_FOUND, and name NotFoundError', () => {
      const error = new NotFoundError('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('NotFoundError');
      expect(error instanceof InvoicaError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('AuthenticationError', () => {
    it('has statusCode 401, code AUTH_ERROR, and name AuthenticationError', () => {
      const error = new AuthenticationError('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.name).toBe('AuthenticationError');
      expect(error instanceof InvoicaError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });
});