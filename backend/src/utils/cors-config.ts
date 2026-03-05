export interface CorsOptions {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  maxAge: number;
  credentials: boolean;
}

export const DEFAULT_CORS_OPTIONS: CorsOptions = {
  allowedOrigins: ['http://localhost:3000', 'http://localhost:3001', 'https://invoica.dev', 'https://app.invoica.dev'],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Timestamp'],
  maxAge: 86400,
  credentials: true,
};

export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

export function getCorsHeaders(origin: string, options?: Partial<CorsOptions>): Record<string, string> {
  const merged = { ...DEFAULT_CORS_OPTIONS, ...options };
  if (!isOriginAllowed(origin, merged.allowedOrigins)) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': merged.allowedMethods.join(', '),
    'Access-Control-Allow-Headers': merged.allowedHeaders.join(', '),
    'Access-Control-Max-Age': String(merged.maxAge),
    'Access-Control-Allow-Credentials': String(merged.credentials),
  };
}