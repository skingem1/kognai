import { Request, Response, NextFunction, RequestHandler } from 'express';

export interface ApiVersionRequest extends Request {
  apiVersion: string;
}

export function apiVersionMiddleware(supportedVersions: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestedVersion = req.get('X-API-Version') || supportedVersions[supportedVersions.length - 1];

    if (!supportedVersions.includes(requestedVersion)) {
      res.status(400).json({
        error: {
          code: 'UNSUPPORTED_VERSION',
          message: `API version ${requestedVersion} is not supported. Supported versions: ${supportedVersions.join(', ')}`
        }
      });
      return;
    }

    (req as ApiVersionRequest).apiVersion = requestedVersion;
    res.setHeader('X-API-Version', requestedVersion);
    next();
  };
}

export function getApiVersion(req: Request): string {
  return (req as ApiVersionRequest).apiVersion || 'v1';
}