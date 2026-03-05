import { createDebugLogger, isDebugEnabled, DebugLogger } from '../src/debug';

describe('debug', () => {
  const originalEnv = process.env.INVOICA_DEBUG;

  afterEach(() => {
    if (originalEnv === undefined) { delete process.env.INVOICA_DEBUG; }
    else { process.env.INVOICA_DEBUG = originalEnv; }
  });

  it('isDebugEnabled returns false when INVOICA_DEBUG is not set', () => {
    delete process.env.INVOICA_DEBUG;
    expect(isDebugEnabled()).toBe(false);
  });

  it('isDebugEnabled returns true when INVOICA_DEBUG is set', () => {
    process.env.INVOICA_DEBUG = '1';
    expect(isDebugEnabled()).toBe(true);
  });

  it('creates a no-op logger when debug is disabled', () => {
    delete process.env.INVOICA_DEBUG;
    const logger = createDebugLogger('test') as DebugLogger;
    expect(logger.log).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
    logger.log('message'); logger.warn('message'); logger.error('message');
  });

  it('creates an active logger when debug is enabled', () => {
    process.env.INVOICA_DEBUG = '1';
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const logger = createDebugLogger('sdk');
    logger.log('hello');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});