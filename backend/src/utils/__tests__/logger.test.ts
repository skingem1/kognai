import { logger } from '../logger';

describe('logger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('info calls console.log', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    logger.info('test');
    expect(spy).toHaveBeenCalled();
  });

  it('error calls console.error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    logger.error('err');
    expect(spy).toHaveBeenCalled();
  });

  it('warn calls console.warn', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    logger.warn('w');
    expect(spy).toHaveBeenCalled();
  });

  it('debug calls console.debug', () => {
    const spy = jest.spyOn(console, 'debug').mockImplementation();
    logger.debug('d');
    expect(spy).toHaveBeenCalled();
  });

  it('info includes message in output', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    logger.info('hello world');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('hello world'));
  });
});