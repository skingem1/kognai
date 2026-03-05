import { TypedEmitter } from '../emitter';

type Events = { message: string; count: number; reset: void };

describe('TypedEmitter', () => {
  test('emits events to listeners', () => {
    const e = new TypedEmitter<Events>();
    const fn = jest.fn();
    e.on('message', fn);
    e.emit('message', 'hi');
    expect(fn).toHaveBeenCalledWith('hi');
  });

  test('supports multiple listeners', () => {
    const e = new TypedEmitter<Events>();
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    e.on('message', fn1);
    e.on('message', fn2);
    e.emit('message', 'hi');
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  test('on returns unsubscribe function', () => {
    const e = new TypedEmitter<Events>();
    const fn = jest.fn();
    const unsub = e.on('message', fn);
    unsub();
    e.emit('message', 'hi');
    expect(fn).not.toHaveBeenCalled();
  });

  test('off removes all listeners for event', () => {
    const e = new TypedEmitter<Events>();
    const fn = jest.fn();
    e.on('message', fn);
    e.off('message');
    e.emit('message', 'hi');
    expect(fn).not.toHaveBeenCalled();
  });

  test('off with no args clears all', () => {
    const e = new TypedEmitter<Events>();
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    e.on('message', fn1);
    e.on('count', fn2);
    e.off();
    e.emit('message', 'hi');
    e.emit('count', 1);
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  test('listenerCount returns count', () => {
    const e = new TypedEmitter<Events>();
    e.on('message', jest.fn());
    e.on('message', jest.fn());
    expect(e.listenerCount('message')).toBe(2);
  });

  test('listenerCount returns 0 for no listeners', () => {
    const e = new TypedEmitter<Events>();
    expect(e.listenerCount('message')).toBe(0);
  });
});