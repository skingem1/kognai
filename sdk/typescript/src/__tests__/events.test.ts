import { SdkEventEmitter } from '../events';

describe('SdkEventEmitter', () => {
  it('should call listener on emit with correct data', () => {
    const emitter = new SdkEventEmitter();
    const listener = jest.fn();
    
    emitter.on('request:start', listener);
    emitter.emit('request:start', { method: 'GET', url: '/api' });
    
    expect(listener).toHaveBeenCalledWith({ method: 'GET', url: '/api' });
  });

  it('should not call removed listener', () => {
    const emitter = new SdkEventEmitter();
    const listener = jest.fn();
    
    emitter.on('request:start', listener);
    emitter.off('request:start', listener);
    emitter.emit('request:start', { method: 'GET', url: '/api' });
    
    expect(listener).not.toHaveBeenCalled();
  });

  it('should call all listeners for same event', () => {
    const emitter = new SdkEventEmitter();
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    
    emitter.on('request:start', listener1);
    emitter.on('request:start', listener2);
    emitter.emit('request:start', { method: 'GET', url: '/api' });
    
    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('should remove all listeners', () => {
    const emitter = new SdkEventEmitter();
    const listener = jest.fn();
    
    emitter.on('request:start', listener);
    emitter.on('request:end', listener);
    emitter.removeAllListeners();
    emitter.emit('request:start', { method: 'GET', url: '/api', status: 200, durationMs: 100 });
    
    expect(listener).not.toHaveBeenCalled();
  });

  it('should handle emit with no listeners without throwing', () => {
    const emitter = new SdkEventEmitter();
    
    expect(() => emitter.emit('request:start', { method: 'GET', url: '/api' })).not.toThrow();
  });

  it('should emit request:error with error payload', () => {
    const emitter = new SdkEventEmitter();
    const listener = jest.fn();
    const error = new Error('Network error');
    
    emitter.on('request:error', listener);
    emitter.emit('request:error', { method: 'GET', url: '/api', error });
    
    expect(listener).toHaveBeenCalledWith({ method: 'GET', url: '/api', error });
  });

  it('should emit rate-limit:hit with retryAfter payload', () => {
    const emitter = new SdkEventEmitter();
    const listener = jest.fn();
    
    emitter.on('rate-limit:hit', listener);
    emitter.emit('rate-limit:hit', { retryAfter: 60 });
    
    expect(listener).toHaveBeenCalledWith({ retryAfter: 60 });
  });

  it('should keep different event types independent', () => {
    const emitter = new SdkEventEmitter();
    const startListener = jest.fn();
    const endListener = jest.fn();
    
    emitter.on('request:start', startListener);
    emitter.on('request:end', endListener);
    emitter.emit('request:start', { method: 'GET', url: '/api' });
    
    expect(startListener).toHaveBeenCalled();
    expect(endListener).not.toHaveBeenCalled();
  });
});