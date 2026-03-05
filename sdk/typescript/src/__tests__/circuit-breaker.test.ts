import { CircuitBreaker, CircuitState } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes in CLOSED state', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('canExecute returns true when CLOSED', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.canExecute()).toBe(true);
  });

  it('recordSuccess resets failure count in CLOSED', () => {
    const breaker = new CircuitBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('recordFailure increments failure count', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('transitions to OPEN after failureThreshold failures', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('canExecute returns false when OPEN and timeout not elapsed', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    expect(breaker.canExecute()).toBe(false);
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('transitions to HALF_OPEN after resetTimeoutMs when canExecute is called', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    jest.advanceTimersByTime(30001);
    expect(breaker.canExecute()).toBe(true);
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
  });

  it('transitions from HALF_OPEN to CLOSED after successThreshold successes', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    jest.advanceTimersByTime(30001);
    breaker.canExecute();
    breaker.recordSuccess();
    breaker.recordSuccess();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('transitions from HALF_OPEN to OPEN on failure', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    jest.advanceTimersByTime(30001);
    breaker.canExecute();
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('reset returns to CLOSED state with zero counts', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    breaker.reset();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(breaker.canExecute()).toBe(true);
  });

  it('respects custom failureThreshold option', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('uses default failureThreshold of 5', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 4; i++) {
      breaker.recordFailure();
    }
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('uses default resetTimeoutMs of 30000', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    jest.advanceTimersByTime(29999);
    expect(breaker.canExecute()).toBe(false);
    jest.advanceTimersByTime(2);
    expect(breaker.canExecute()).toBe(true);
  });

  it('uses default successThreshold of 2', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    jest.advanceTimersByTime(30001);
    breaker.canExecute();
    breaker.recordSuccess();
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    breaker.recordSuccess();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });
});