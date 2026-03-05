import { Request, Response, NextFunction } from 'express';

/**
 * Custom error class for operational errors in the application.
 * Extends the built-in Error class with additional properties for HTTP status and error codes.
 */
export interface AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;
}

/**
 * Creates an application error with the specified parameters.
 * @param message - Human-readable error message
 * @param statusCode - HTTP status code (e.g., 400, 404, 500)
 * @param code - Machine-readable error code (e.g., 'VALIDATION_ERROR', 'NOT_FOUND')
 * @returns AppError instance
 */
export function createAppError(
  message: string,
  statusCode: number,
  code: string
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.isOperational = true;
  return error;
}

/**
 * Global Express error handler middleware.
 * Handles all errors thrown in the application and returns appropriate JSON responses.
 * In development, includes stack trace; in production, hides details.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const appError = err as AppError;
  const statusCode = appError.statusCode || 500;
  const code = appError.code || 'INTERNAL_SERVER_ERROR';
  const isProduction = process.env.NODE_ENV === 'production';

  // Log error as JSON with timestamp, method, path, statusCode, message
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode,
    message: err.message,
  };

  console.error(JSON.stringify(logEntry));

  // In production, hide error details for non-operational errors
  const displayMessage =
    isProduction && !appError.isOperational ? 'Internal server error' : err.message;

  // Build response payload
  const responsePayload: {
    error: {
      message: string;
      code: string;
      statusCode: number;
      stack?: string;
    };
  } = {
    error: {
      message: displayMessage,
      code,
      statusCode,
    },
  };

  // Include stack trace only in development
  if (!isProduction && appError.stack) {
    responsePayload.error.stack = appError.stack;
  }

  res.status(statusCode).json(responsePayload);
}