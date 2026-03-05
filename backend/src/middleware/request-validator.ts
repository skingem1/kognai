import { Request, Response, NextFunction, RequestHandler } from 'express';

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  min?: number;
  max?: number;
}

export function validateBody(rules: ValidationRule[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body || {};
    for (const rule of rules) {
      const value = body[rule.field];
      if (rule.required && (value === undefined || value === null)) {
        res.status(400).json({ error: 'validation_error', message: `${rule.field} is required` });
        return;
      }
      if (value !== undefined && value !== null && typeof value !== rule.type) {
        res.status(400).json({ error: 'validation_error', message: `${rule.field} must be a ${rule.type}` });
        return;
      }
      if (rule.type === 'number' && typeof value === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          res.status(400).json({ error: 'validation_error', message: `${rule.field} must be at least ${rule.min}` });
          return;
        }
        if (rule.max !== undefined && value > rule.max) {
          res.status(400).json({ error: 'validation_error', message: `${rule.field} must be at most ${rule.max}` });
          return;
        }
      }
    }
    next();
  };
}

export function validateInvoiceCreate(): RequestHandler {
  return validateBody([
    { field: 'amount', type: 'number', required: true, min: 1 },
    { field: 'currency', type: 'string', required: true },
    { field: 'description', type: 'string', required: false },
  ]);
}