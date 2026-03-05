describe('Server module', () => {
  const originalEnv = process.env.PORT;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PORT;
    else process.env.PORT = originalEnv;
    jest.restoreAllMocks();
  });

  it('exports a server object', () => {
    const mockListen = jest.fn((_port: number, cb: () => void) => {
      cb();
      return { on: jest.fn(), close: jest.fn(), address: jest.fn() };
    });
    jest.doMock('../app', () => ({
      app: { listen: mockListen },
    }));
    const { server } = require('../server');
    expect(server).toBeDefined();
    expect(server.on).toBeDefined();
    expect(server.close).toBeDefined();
  });

  it('uses PORT from environment variable', () => {
    process.env.PORT = '4000';
    jest.resetModules();
    let capturedPort = 0;
    const mockListen = jest.fn((port: number, cb: () => void) => {
      capturedPort = port;
      cb();
      return { on: jest.fn(), close: jest.fn(), address: jest.fn() };
    });
    jest.doMock('../app', () => ({
      app: { listen: mockListen },
    }));
    require('../server');
    expect(capturedPort).toBe(4000);
  });

  it('defaults to port 3001 when PORT is not set', () => {
    delete process.env.PORT;
    jest.resetModules();
    let capturedPort = 0;
    const mockListen = jest.fn((port: number, cb: () => void) => {
      capturedPort = port;
      cb();
      return { on: jest.fn(), close: jest.fn(), address: jest.fn() };
    });
    jest.doMock('../app', () => ({
      app: { listen: mockListen },
    }));
    require('../server');
    expect(capturedPort).toBe(3001);
  });
});