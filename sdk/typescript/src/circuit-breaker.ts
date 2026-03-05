/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Configuration options for CircuitBreaker
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;  // failures before opening (default 5)
  resetTimeoutMs: number;    // ms before trying half-open (default 30000)
  successThreshold: number;  // successes in half-open to close (default 2)
}

/**
 * Circuit breaker pattern implementation for API resilience.
 * Uses Date.now() for timing - no external dependencies.
 */
export class CircuitBreaker {
  private state: CircuitState;
  private failureCount: number;
  private successCount: number;
  private lastFailureTime: number;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = {
      failureThreshold: options?.failureThreshold ?? 5,
      resetTimeoutMs: options?.resetTimeoutMs ?? 30000,
      successThreshold: options?.successThreshold ?? 2
    };
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /** Returns current circuit state */
  getState(): CircuitState {
    return this.state;
  }

  /** Check if request can be executed */
  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow requests to test recovery
    return true;
  }

  /** Record successful execution */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }
  }

  /** Record failed execution */
  recordFailure(): void {
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.CLOSED) {
      this.failureCount++;
      if (this.failureCount >= this.options.failureThreshold) {
        this.state = CircuitState.OPEN;
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.successCount = 0;
    }
  }

  /** Reset circuit breaker to initial closed state */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}