import { requestTimer, getRequestDuration, TIMING_HEADER } from '../request-timer';
import { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';

describe('requestTimer', () => {
  it('exports TIMING_HEADER constant', () => {
    expect(TIMING_HEADER).toBe('X-Response-Time');
  });

  it('calls next() immediately', () => {
    const req = {} as Request;
    const res = Object.assign(new EventEmitter(), { setHeader: jest.fn() }) as unknown as Response;
    const next = jest.fn() as NextFunction;
    requestTimer()(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets timing header on finish event', () => {
    const req = {} as Request;
    const res = Object.assign(new EventEmitter(), { setHeader: jest.fn() }) as unknown as Response;
    const next = jest.fn() as NextFunction;
    requestTimer()(req, res, next);
    res.emit('finish');
    expect(res.setHeader).toHaveBeenCalledWith(TIMING_HEADER, expect.stringMatching(/^\d+\.\d{2}ms$/));
  });
});

describe('getRequestDuration', () => {
  it('returns a positive number in milliseconds', () => {
    const duration = getRequestDuration(process.hrtime.bigint());
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});