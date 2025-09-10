// Circuit Breaker Pattern Implementation

export enum CircuitState {
    CLOSED = 'closed',
    OPEN = 'open',
    HALF_OPEN = 'half_open'
}

export interface CircuitBreakerOptions {
    failureThreshold?: number;
    resetTimeout?: number;
    successThreshold?: number;
}

export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount = 0;
    private successCount = 0;
    private lastFailureTime?: Date;

    constructor(private options: CircuitBreakerOptions = {}) {
        this.options.failureThreshold = options.failureThreshold || 5;
        this.options.resetTimeout = options.resetTimeout || 60000;
        this.options.successThreshold = options.successThreshold || 2;
    }

    get currentState(): CircuitState {
        return this.state;
    }

    recordSuccess(): void {
        this.failureCount = 0;
        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.options.successThreshold!) {
                this.state = CircuitState.CLOSED;
                this.successCount = 0;
            }
        }
    }

    recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = new Date();
        if (this.failureCount >= this.options.failureThreshold!) {
            this.state = CircuitState.OPEN;
        }
    }

    shouldAllowRequest(): boolean {
        if (this.state === CircuitState.CLOSED) {
            return true;
        }

        if (this.state === CircuitState.OPEN) {
            const now = new Date();
            if (this.lastFailureTime) {
                const elapsed = now.getTime() - this.lastFailureTime.getTime();
                if (elapsed >= this.options.resetTimeout!) {
                    this.state = CircuitState.HALF_OPEN;
                    this.successCount = 0;
                    return true;
                }
            }
            return false;
        }

        return this.state === CircuitState.HALF_OPEN;
    }

    reset(): void {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = undefined;
    }
}
