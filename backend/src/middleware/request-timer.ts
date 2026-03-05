import { Request, Response, NextFunction } from 'express';

export const TIMING_HEADER = 'X-Response-Time' as const;

export function requestTimer() {
  return function requestTimerMiddleware(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    
    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      res.setHeader(TIMING_HEADER, `${durationMs.toFixed(2)}ms`);
    });

    next();
  };
}

export function getRequestDuration(start: bigint): number {
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000;
}