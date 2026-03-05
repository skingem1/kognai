import { DEFAULT_CONFIG, createShutdownHandler } from '../graceful-shutdown';

describe('graceful-shutdown', () => {
  let consoleLog: jest.SpyInstance;

  beforeEach(() => {
    consoleLog = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLog.mockRestore();
  });

  it('DEFAULT_CONFIG has timeout=10000 and signals with SIGTERM and SIGINT', () => {
    expect(DEFAULT_CONFIG.timeout).toBe(10000);
    expect(DEFAULT_CONFIG.signals).toContain('SIGTERM');
    expect(DEFAULT_CONFIG.signals).toContain('SIGINT');
  });

  it('createShutdownHandler returns a function', () => {
    const server = { close: jest.fn((cb) => cb()) };
    const handler = createShutdownHandler(server);
    expect(typeof handler).toBe('function');
  });

  it('shutdown calls server.close', async () => {
    const server = { close: jest.fn((cb) => cb()) };
    const handler = createShutdownHandler(server);
    await handler();
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it('double shutdown is prevented', async () => {
    const server = { close: jest.fn((cb) => cb()) };
    const handler = createShutdownHandler(server);
    await handler();
    await handler();
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it('onShutdown callback is called', async () => {
    const onShutdown = jest.fn();
    const server = { close: jest.fn((cb) => cb()) };
    const handler = createShutdownHandler(server, { onShutdown });
    await handler();
    expect(onShutdown).toHaveBeenCalledTimes(1);
  });
});