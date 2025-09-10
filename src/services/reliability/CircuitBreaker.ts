/**
 * Enterprise-Grade Circuit Breaker Implementation
 *
 * A production-ready circuit breaker that prevents cascading failures
 * with automatic recovery, self-healing, and comprehensive monitoring.
 */

export enum CircuitState {
    CLOSED = 'CLOSED', // Normal operation
    OPEN = 'OPEN', // Failures exceeded threshold, blocking calls
    HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerConfig {
    failureThreshold?: number; // Number of failures before opening
    successThreshold?: number; // Successes needed to close from half-open
    timeout?: number; // Time before trying half-open (ms)
    volumeThreshold?: number; // Minimum calls before evaluating
    errorPercentageThreshold?: number; // Error percentage to trip
    rollingWindowSize?: number; // Time window for metrics (ms)
    fallbackFunction?: () => Promise<any>; // Fallback when circuit is open
    onStateChange?: (from: CircuitState, to: CircuitState) => void;
    healthCheck?: () => Promise<boolean>; // Optional health check
}

interface CircuitMetrics {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    lastFailureTime: number;
    lastSuccessTime: number;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    stateChangeCount: number;
    halfOpenAttempts: number;
}

interface RollingWindow {
    timestamp: number;
    success: boolean;
}

/**
 * Thread-safe circuit breaker with comprehensive monitoring
 */
export class CircuitBreaker<T = any> {
    private state: CircuitState = CircuitState.CLOSED;
    private metrics: CircuitMetrics = {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        stateChangeCount: 0,
        halfOpenAttempts: 0
    };

    private rollingWindow: RollingWindow[] = [];
    private nextAttemptTime: number = 0;
    private readonly config: Required<CircuitBreakerConfig>;
    private stateTransitionLock: boolean = false;
    private healthCheckInProgress: boolean = false;

    constructor(
        private readonly name: string,
        config: CircuitBreakerConfig = {}
    ) {
        // Apply safe defaults for production
        this.config = {
            failureThreshold: config.failureThreshold ?? 5,
            successThreshold: config.successThreshold ?? 2,
            timeout: config.timeout ?? 60000, // 1 minute
            volumeThreshold: config.volumeThreshold ?? 10,
            errorPercentageThreshold: config.errorPercentageThreshold ?? 50,
            rollingWindowSize: config.rollingWindowSize ?? 60000, // 1 minute
            fallbackFunction: config.fallbackFunction ?? (() => Promise.reject(new Error('Circuit breaker is OPEN'))),
            onStateChange: config.onStateChange ?? (() => {}),
            healthCheck: config.healthCheck ?? (() => Promise.resolve(true))
        };

        // Start periodic cleanup of rolling window
        this.startWindowCleanup();
    }

    /**
     * Execute function with circuit breaker protection
     */
    async execute<R>(fn: () => Promise<R>): Promise<R> {
        // Check if circuit should be evaluated
        if (!this.canExecute()) {
            this.metrics.totalCalls++;
            this.metrics.failedCalls++;

            // Try fallback function
            if (this.config.fallbackFunction) {
                try {
                    return await this.config.fallbackFunction();
                } catch (fallbackError) {
                    throw new Error(`Circuit breaker ${this.name} is OPEN and fallback failed: ${fallbackError}`);
                }
            }

            throw new Error(`Circuit breaker ${this.name} is OPEN`);
        }

        const startTime = Date.now();

        try {
            // Execute the protected function
            const result = await this.executeWithTimeout(fn, 30000); // 30s default timeout

            // Record success
            this.recordSuccess(Date.now() - startTime);

            return result;
        } catch (error) {
            // Record failure
            this.recordFailure(Date.now() - startTime, error);

            throw error;
        }
    }

    /**
     * Execute with timeout protection
     */
    private async executeWithTimeout<R>(fn: () => Promise<R>, timeoutMs: number): Promise<R> {
        return new Promise<R>((resolve, reject) => {
            let timeoutId: NodeJS.Timeout;
            let completed = false;

            // Set timeout
            timeoutId = setTimeout(() => {
                if (!completed) {
                    completed = true;
                    reject(new Error(`Operation timed out after ${timeoutMs}ms`));
                }
            }, timeoutMs);

            // Execute function
            fn().then(
                result => {
                    if (!completed) {
                        completed = true;
                        clearTimeout(timeoutId);
                        resolve(result);
                    }
                },
                error => {
                    if (!completed) {
                        completed = true;
                        clearTimeout(timeoutId);
                        reject(error);
                    }
                }
            );
        });
    }

    /**
     * Check if execution is allowed based on circuit state
     */
    private canExecute(): boolean {
        this.cleanupRollingWindow();

        switch (this.state) {
            case CircuitState.CLOSED:
                return true;

            case CircuitState.OPEN:
                // Check if enough time has passed to try half-open
                if (Date.now() >= this.nextAttemptTime) {
                    this.transitionTo(CircuitState.HALF_OPEN);
                    return true;
                }
                return false;

            case CircuitState.HALF_OPEN:
                // Allow limited calls in half-open state
                return this.metrics.halfOpenAttempts < this.config.successThreshold;

            default:
                return false;
        }
    }

    /**
     * Record successful execution
     */
    private recordSuccess(latency: number): void {
        this.metrics.totalCalls++;
        this.metrics.successfulCalls++;
        this.metrics.lastSuccessTime = Date.now();
        this.metrics.consecutiveSuccesses++;
        this.metrics.consecutiveFailures = 0;

        // Add to rolling window
        this.rollingWindow.push({
            timestamp: Date.now(),
            success: true
        });

        // Handle state transitions
        switch (this.state) {
            case CircuitState.HALF_OPEN:
                this.metrics.halfOpenAttempts++;
                if (this.metrics.consecutiveSuccesses >= this.config.successThreshold) {
                    this.transitionTo(CircuitState.CLOSED);
                }
                break;

            case CircuitState.CLOSED:
                // Already closed, no action needed
                break;
        }
    }

    /**
     * Record failed execution
     */
    private recordFailure(latency: number, error: any): void {
        this.metrics.totalCalls++;
        this.metrics.failedCalls++;
        this.metrics.lastFailureTime = Date.now();
        this.metrics.consecutiveFailures++;
        this.metrics.consecutiveSuccesses = 0;

        // Add to rolling window
        this.rollingWindow.push({
            timestamp: Date.now(),
            success: false
        });

        // Log error for debugging
        console.warn(`[CircuitBreaker:${this.name}] Operation failed:`, error);

        // Handle state transitions
        switch (this.state) {
            case CircuitState.CLOSED:
                // Check if we should open the circuit
                if (this.shouldOpen()) {
                    this.transitionTo(CircuitState.OPEN);
                }
                break;

            case CircuitState.HALF_OPEN:
                // Single failure in half-open immediately opens circuit
                this.transitionTo(CircuitState.OPEN);
                break;

            case CircuitState.OPEN:
                // Already open, update next retry time
                this.nextAttemptTime = Date.now() + this.config.timeout;
                break;
        }
    }

    /**
     * Determine if circuit should open based on metrics
     */
    private shouldOpen(): boolean {
        // Check consecutive failures
        if (this.metrics.consecutiveFailures >= this.config.failureThreshold) {
            return true;
        }

        // Check error percentage in rolling window
        const recentCalls = this.getRecentCalls();
        if (recentCalls.length >= this.config.volumeThreshold) {
            const errorRate = this.calculateErrorRate(recentCalls);
            if (errorRate >= this.config.errorPercentageThreshold) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get recent calls within rolling window
     */
    private getRecentCalls(): RollingWindow[] {
        const windowStart = Date.now() - this.config.rollingWindowSize;
        return this.rollingWindow.filter(call => call.timestamp >= windowStart);
    }

    /**
     * Calculate error rate from calls
     */
    private calculateErrorRate(calls: RollingWindow[]): number {
        if (calls.length === 0) return 0;

        const failures = calls.filter(call => !call.success).length;
        return (failures / calls.length) * 100;
    }

    /**
     * Transition to new state with proper locking
     */
    private transitionTo(newState: CircuitState): void {
        // Prevent concurrent state transitions
        if (this.stateTransitionLock) {
            return;
        }

        this.stateTransitionLock = true;

        try {
            const oldState = this.state;

            if (oldState === newState) {
                return;
            }

            // Update state
            this.state = newState;
            this.metrics.stateChangeCount++;

            // Reset counters based on new state
            switch (newState) {
                case CircuitState.OPEN:
                    this.nextAttemptTime = Date.now() + this.config.timeout;
                    this.metrics.consecutiveSuccesses = 0;
                    console.warn(`[CircuitBreaker:${this.name}] Circuit OPENED`);
                    break;

                case CircuitState.HALF_OPEN:
                    this.metrics.halfOpenAttempts = 0;
                    console.info(`[CircuitBreaker:${this.name}] Circuit HALF-OPEN`);
                    this.triggerHealthCheck();
                    break;

                case CircuitState.CLOSED:
                    this.metrics.consecutiveFailures = 0;
                    this.metrics.halfOpenAttempts = 0;
                    console.info(`[CircuitBreaker:${this.name}] Circuit CLOSED`);
                    break;
            }

            // Notify state change
            if (this.config.onStateChange) {
                try {
                    this.config.onStateChange(oldState, newState);
                } catch (error) {
                    console.error(`[CircuitBreaker:${this.name}] State change handler error:`, error);
                }
            }
        } finally {
            this.stateTransitionLock = false;
        }
    }

    /**
     * Trigger health check in background
     */
    private async triggerHealthCheck(): Promise<void> {
        if (this.healthCheckInProgress || !this.config.healthCheck) {
            return;
        }

        this.healthCheckInProgress = true;

        try {
            const isHealthy = await this.config.healthCheck();

            if (isHealthy && this.state === CircuitState.HALF_OPEN) {
                // Health check passed, record as success
                this.recordSuccess(0);
            }
        } catch (error) {
            // Health check failed, ignore silently
            console.debug(`[CircuitBreaker:${this.name}] Health check failed:`, error);
        } finally {
            this.healthCheckInProgress = false;
        }
    }

    /**
     * Clean up old entries from rolling window
     */
    private cleanupRollingWindow(): void {
        const windowStart = Date.now() - this.config.rollingWindowSize;
        this.rollingWindow = this.rollingWindow.filter(call => call.timestamp >= windowStart);
    }

    /**
     * Start periodic cleanup of rolling window
     */
    private startWindowCleanup(): void {
        setInterval(() => {
            this.cleanupRollingWindow();
        }, 10000); // Clean up every 10 seconds
    }

    /**
     * Get current state
     */
    getState(): CircuitState {
        return this.state;
    }

    /**
     * Get circuit metrics
     */
    getMetrics(): Readonly<CircuitMetrics> {
        return { ...this.metrics };
    }

    /**
     * Get health status
     */
    getHealthStatus(): {
        name: string;
        state: CircuitState;
        isHealthy: boolean;
        metrics: CircuitMetrics;
        errorRate: number;
        uptime: number;
    } {
        const recentCalls = this.getRecentCalls();
        const errorRate = this.calculateErrorRate(recentCalls);

        return {
            name: this.name,
            state: this.state,
            isHealthy: this.state !== CircuitState.OPEN,
            metrics: { ...this.metrics },
            errorRate,
            uptime: this.metrics.lastSuccessTime ? Date.now() - this.metrics.lastSuccessTime : 0
        };
    }

    /**
     * Force circuit to specific state (for testing/recovery)
     */
    forceState(state: CircuitState): void {
        console.warn(`[CircuitBreaker:${this.name}] Forcing state to ${state}`);
        this.transitionTo(state);
    }

    /**
     * Reset circuit breaker
     */
    reset(): void {
        this.state = CircuitState.CLOSED;
        this.metrics = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            lastFailureTime: 0,
            lastSuccessTime: 0,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            stateChangeCount: 0,
            halfOpenAttempts: 0
        };
        this.rollingWindow = [];
        this.nextAttemptTime = 0;

        console.info(`[CircuitBreaker:${this.name}] Circuit reset`);
    }
}
