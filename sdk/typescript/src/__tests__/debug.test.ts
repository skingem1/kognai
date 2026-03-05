import { isDebugEnabled, createDebugLogger } from '../debug';

describe('debug', () => {
  const originalEnv = process.env.INVOICA_DEBUG;

  afterEach(() => {
    process.env.INVOICA_DEBUG = originalEnv;
  });

  describe('isDebugEnabled', () => {
    it('returns false when INVOICA_DEBUG not set', () => {
      delete process.env.INVOICA_DEBUG;
      expect(isDebugEnabled()).toBe(false);
    });

    it('returns true when INVOICA_DEBUG is set to truthy value', () => {
      process.env.INVOICA_DEBUG = '1';
      expect(isDebugEnabled()).toBe(true);
    });
  });

  describe('createDebugLogger', () => {
    beforeEach(() => {
      process.env.INVOICA_DEBUG = '1';
    });

    afterEach(() => {
      delete process.env.INVOICA_DEBUG;
    });

    it('does nothing when debug disabled', () => {
      delete process.env.INVOICA_DEBUG;
      const logSpy = jest.spyOn(console, 'log');
      const warnSpy = jest.spyOn(console, 'warn');
      const errorSpy = jest.spyOn(console, 'error');

      const logger = createDebugLogger('test');
      logger.log('msg');
      logger.warn('msg');
      logger.error('msg');

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs formatted message with namespace', () => {
      const logSpy = jest.spyOn(console, 'log');
      const logger = createDebugLogger('myns');
      logger.log('hello');
      expect(logSpy).toHaveBeenCalledWith('[invoica:myns]', expect.any(String), 'hello');
    });

    it('warn calls console.warn', () => {
      const warnSpy = jest.spyOn(console, 'warn');
      const logger = createDebugLogger('ns');
      logger.warn('msg');
      expect(warnSpy).toHaveBeenCalledWith('[invoica:ns]', expect.any(String), 'msg');
    });

    it('error calls console.error', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const logger = createDebugLogger('ns');
      logger.error('msg');
      expect(errorSpy).toHaveBeenCalledWith('[invoica:ns]', expect.any(String), 'msg');
    });

    it('passes data parameter through', () => {
      const logSpy = jest.spyOn(console, 'log');
      const logger = createDebugLogger('ns');
      logger.log('msg', { foo: 'bar' });
      expect(logSpy).toHaveBeenCalledWith('[invoica:ns]', expect.any(String), 'msg', { foo: 'bar' });
    });
  });
});