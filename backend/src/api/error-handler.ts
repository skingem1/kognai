import { Request, Response, NextFunction } from 'express';

export interface ApiErrorResponse {
  error: string;
  code?: string;
  statusCode: number;
}

export function errorHandler(
  err: Error & { statusCode?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = statusCode === 500 ? 'Internal server error' : err.message;
  if (process.env.NODE_ENV !== 'production') console.error('[API Error]', err.message);
  res.status(statusCode).json({ error: message, code, statusCode } as ApiErrorResponse);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', statusCode: 404 } as ApiErrorResponse);
}