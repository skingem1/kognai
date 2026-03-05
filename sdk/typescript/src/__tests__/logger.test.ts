import {createLogger, formatLogEntry, LogLevel} from '../logger';

describe('logger', () => {
  beforeEach(() => {
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults to WARN level', () => {
    const logger = createLogger();
    expect(logger.getLevel()).toBe(LogLevel.WARN);
  });

  it('warn logs when level is WARN', () => {
    const logger = createLogger();
    logger.warn('test');
    expect(console.warn).toHaveBeenCalled();
  });

  it('debug silent when level is WARN', () => {
    const logger = createLogger();
    logger.debug('test');
    expect(console.debug).not.toHaveBeenCalled();
  });

  it('setLevel changes level', () => {
    const logger = createLogger();
    logger.setLevel(LogLevel.DEBUG);
    logger.debug('test');
    expect(console.debug).toHaveBeenCalled();
  });

  it('NONE silences all', () => {
    const l = createLogger('x', LogLevel.NONE);
    l.error('test');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('formatLogEntry formats correctly', () => {
    const result = formatLogEntry({level: LogLevel.ERROR, context: 'ctx', message: 'msg', timestamp: new Date().toISOString()});
    expect(result).toContain('ERROR');
    expect(result).toContain('ctx');
    expect(result).toContain('msg');
  });
});