import { SdkEventEmitter } from '../src/events';

describe('SdkEventEmitter', () => {
  test('on + emit calls listener with correct data', () => {
    const emitter = new SdkEventEmitter();
    const listener = jest.fn();
    emitter.on('request:start', listener);
    emitter.emit('request:start', { method: 'GET', url: '/test' });
    expect(listener).toHaveBeenCalledWith({ method: 'GET', url: '/test' });
  });

  test('multiple listeners all get called', () => {
    const emitter = new SdkEventEmitter();
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    emitter.on('request:start', fn1);
    emitter.on('request:start', fn2);
    emitter.emit('request:start', { method: 'GET', url: '/test' });
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  test('off removes listener', () => {
    const emitter = new SdkEventEmitter();
    const listener = jest.fn();
    emitter.on('request:start', listener);
    emitter.off('request:start', listener);
    emitter.emit('request:start', { method: 'GET', url: '/test' });
    expect(listener).not.toHaveBeenCalled();
  });

  test('emit with no listeners does not throw', () => {
    const emitter = new SdkEventEmitter();
    expect(() => emitter.emit('request:end', { method: 'GET', url: '/x', status: 200, durationMs: 10 })).not.toThrow();
  });

  test('removeAllListeners clears all', () => {
    const emitter = new SdkEventEmitter();
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    emitter.on('request:start', fn1);
    emitter.on('request:end', fn2);
    emitter.removeAllListeners();
    emitter.emit('request:start', { method: 'GET', url: '/a' });
    emitter.emit('request:end', { method: 'GET', url: '/b', status: 200, durationMs: 5 });
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  test('different events are independent', () => {
    const emitter = new SdkEventEmitter();
    const listener = jest.fn();
    emitter.on('request:start', listener);
    emitter.emit('request:end', { method: 'GET', url: '/test', status: 200, durationMs: 10 });
    expect(listener).not.toHaveBeenCalled();
  });

  test('listener receives correct data shape for request:end', () => {
    const emitter = new SdkEventEmitter();
    const listener = jest.fn();
    emitter.on('request:end', listener);
    emitter.emit('request:end', { method: 'POST', url: '/x', status: 200, durationMs: 50 });
    expect(listener).toHaveBeenCalledWith({ method: 'POST', url: '/x', status: 200, durationMs: 50 });
  });
});