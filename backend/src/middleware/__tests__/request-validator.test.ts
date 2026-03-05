import { Request, Response, NextFunction } from 'express';
import { validateBody, validateInvoiceCreate, ValidationRule } from '../request-validator';

const mockReq = (body: any = {}) => ({ body } as Request);
const mockRes = () => { const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() }; return res; };
const mockNext = jest.fn() as NextFunction;

describe('validateBody', () => {
  it('passes valid body', () => {
    const rules: ValidationRule[] = [{ field: 'name', type: 'string', required: true }];
    validateBody(rules)(mockReq({ name: 'test' }), mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('fails missing required field', () => {
    const rules: ValidationRule[] = [{ field: 'name', type: 'string', required: true }];
    const res = mockRes();
    validateBody(rules)(mockReq({}), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'validation_error', message: 'name is required' });
  });

  it('fails wrong type', () => {
    const rules: ValidationRule[] = [{ field: 'age', type: 'number', required: true }];
    const res = mockRes();
    validateBody(rules)(mockReq({ age: 'twenty' }), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'validation_error', message: 'age must be a number' });
  });

  it('fails number below min', () => {
    const rules: ValidationRule[] = [{ field: 'amount', type: 'number', required: true, min: 10 }];
    const res = mockRes();
    validateBody(rules)(mockReq({ amount: 5 }), res, mockNext);
    expect(res.json).toHaveBeenCalledWith({ error: 'validation_error', message: 'amount must be at least 10' });
  });
});

describe('validateInvoiceCreate', () => {
  it('passes valid invoice', () => {
    validateInvoiceCreate()(mockReq({ amount: 100, currency: 'USD' }), mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('passes with optional description', () => {
    validateInvoiceCreate()(mockReq({ amount: 50, currency: 'EUR', description: 'Test' }), mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});