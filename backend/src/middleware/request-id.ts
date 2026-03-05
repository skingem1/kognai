import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Extended Express Request interface that includes the requestId property
 */
export interface RequestWithId extends Request {
  requestId: string;
}

/**
 * Generates a unique request ID using the pattern: req-{timestamp}-{random}
 * @returns A unique request ID string
 */
function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `req-${timestamp}-${random}`;
}

/**
 * Request ID middleware for Express
 * 
 * Generates a unique request ID for each incoming request and attaches it to:
 * - The request object (req.requestId)
 * - The response headers (x-request-id)
 * 
 * If the incoming request already has an x-request-id header, it will be used
 * to maintain traceability through proxies.
 * 
 * @returns Express middleware function
 */
const requestIdMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if x-request-id header already exists (from proxy or upstream)
  const existingRequestId = req.headers['x-request-id'] as string | undefined;
  
  // Use existing ID if provided, otherwise generate a new one
  const requestId = existingRequestId || generateRequestId();
  
  // Attach requestId to the request object
  (req as RequestWithId).requestId = requestId;
  
  // Set the x-request-id header on the response
  res.setHeader('x-request-id', requestId);
  
  // Continue to the next middleware
  next();
};

export default requestIdMiddleware;