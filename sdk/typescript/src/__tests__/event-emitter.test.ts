import {EventEmitter} from '../event-emitter';

type TestEvents = {message: string; count: number; empty: void};

describe('EventEmitter', () => {
  it('handler called on emit', () => {
    const ee = new EventEmitter<TestEvents>();
    const fn = jest.fn();
    ee.on('message', fn);
    ee.emit('message', 'hello');
    expect(fn).toHaveBeenCalledWith('hello');
  });

  it('multiple handlers', () => {
    const ee = new EventEmitter<TestEvents>();
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    ee.on('message', fn1);
    ee.on('message', fn2);
    ee.emit('message', 'hi');
    expect(fn1).toHaveBeenCalledWith('hi');
    expect(fn2).toHaveBeenCalledWith('hi');
  });

  it('different events independent', () => {
    const ee = new EventEmitter<TestEvents>();
    const fn = jest.fn();
    ee.on('message', fn);
    ee.emit('count', 42);
    expect(fn).not.toHaveBeenCalled();
  });

  it('receives correct data for count event', () => {
    const ee = new EventEmitter<TestEvents>();
    const fn = jest.fn();
    ee.on('count', fn);
    ee.emit('count', 42);
    expect(fn).toHaveBeenCalledWith(42);
  });

  it('removes handler with off', () => {
    const ee = new EventEmitter<TestEvents>();
    const fn = jest.fn();
    ee.on('message', fn);
    ee.off('message', fn);
    ee.emit('message', 'test');
    expect(fn).not.toHaveBeenCalled();
  });

  it('on returns unsubscribe function', () => {
    const ee = new EventEmitter<TestEvents>();
    const fn = jest.fn();
    const unsub = ee.on('message', fn);
    unsub();
    ee.emit('message', 'test');
    expect(fn).not.toHaveBeenCalled();
  });

  it('once fires only once', () => {
    const ee = new EventEmitter<TestEvents>();
    const fn = jest.fn();
    ee.once('message', fn);
    ee.emit('message', 'a');
    ee.emit('message', 'b');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('once receives correct data', () => {
    const ee = new EventEmitter<TestEvents>();
    const fn = jest.fn();
    ee.once('message', fn);
    ee.emit('message', 'hello');
    expect(fn).toHaveBeenCalledWith('hello');
  });

  it('removeAllListeners removes all for specific event', () => {
    const ee = new EventEmitter<TestEvents>();
    const fn = jest.fn();
    ee.on('message', fn);
    ee.removeAllListeners('message');
    expect(ee.listenerCount('message')).toBe(0);
  });

  it('removeAllListeners with no args removes all', () => {
    const ee = new EventEmitter<TestEvents>();
    const fn = jest.fn();
    ee.on('message', fn);
    ee.on('count', fn);
    ee.removeAllListeners();
    expect(ee.listenerCount('message')).toBe(0);
    expect(ee.listenerCount('count')).toBe(0);
  });

  it('listenerCount returns correct count', () => {
    const ee = new EventEmitter<TestEvents>();
    ee.on('message', jest.fn());
    ee.on('message', jest.fn());
    expect(ee.listenerCount('message')).toBe(2);
  });

  it('listenerCount returns 0 for event with no listeners', () => {
    const ee = new EventEmitter<TestEvents>();
    expect(ee.listenerCount('message')).toBe(0);
  });

  it('emit with no listeners does not throw', () => {
    const ee = new EventEmitter<TestEvents>();
    expect(() => ee.emit('message', 'test')).not.toThrow();
  });
});