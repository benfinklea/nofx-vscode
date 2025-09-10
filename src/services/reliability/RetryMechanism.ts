/**
 * Enterprise-Grade Retry Mechanism with Exponential Backoff
 *
 * Production-ready retry logic with configurable strategies,
 * jitter, circuit breaking integration, and comprehensive monitoring.
 */

import { CircuitBreaker } from './CircuitBreaker';

export enum RetryStrategy {
    EXPONENTIAL = 'EXPONENTIAL', // Exponential backoff
    LINEAR = 'LINEAR', // Linear backoff
    FIXED = 'FIXED', // Fixed delay
    FIBONACCI = 'FIBONACCI', // Fibonacci sequence
    DECORRELATED = 'DECORRELATED' // Decorrelated jitter
}

export interface RetryConfig {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    strategy?: RetryStrategy;
    jitterFactor?: number;
    timeoutPerAttempt?: number;
    totalTimeout?: number;
    retryableErrors?: (error: any) => boolean;
    onRetry?: (attempt: number, error: any, nextDelay: number) => void;
    circuitBreaker?: CircuitBreaker;
    abortSignal?: AbortSignal;
}

interface RetryMetrics {
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    totalRetries: number;
    lastError: Error | null;
    totalLatency: number;
    retryLatencies: number[];
}

/**
 * Retry mechanism with multiple strategies and production safeguards
 */
export class RetryMechanism {
    private readonly config: Required<Omit<RetryConfig, 'circuitBreaker' | 'abortSignal'>>;
    private readonly circuitBreaker?: CircuitBreaker;
    private readonly abortSignal?: AbortSignal;
    private metrics: RetryMetrics = {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        totalRetries: 0,
        lastError: null,
        totalLatency: 0,
        retryLatencies: []
    };

    // Fibonacci cache for performance
    private fibonacciCache: Map<number, number> = new Map([
        [0, 0],
        [1, 1]
    ]);

    constructor(config: RetryConfig = {}) {
        // Apply production-safe defaults
        this.config = {
            maxAttempts: config.maxAttempts ?? 3,
            baseDelay: config.baseDelay ?? 1000,
            maxDelay: config.maxDelay ?? 30000,
            strategy: config.strategy ?? RetryStrategy.EXPONENTIAL,
            jitterFactor: config.jitterFactor ?? 0.2,
            timeoutPerAttempt: config.timeoutPerAttempt ?? 30000,
            totalTimeout: config.totalTimeout ?? 120000,
            retryableErrors: config.retryableErrors ?? this.defaultRetryableErrors,
            onRetry: config.onRetry ?? (() => {})
        };

        this.circuitBreaker = config.circuitBreaker;
        this.abortSignal = config.abortSignal;

        // Validate configuration
        this.validateConfig();
    }

    /**
     * Execute function with retry logic
     */
    async execute<T>(fn: (attempt: number) => Promise<T>, context?: string): Promise<T> {
        const startTime = Date.now();
        let lastError: Error = new Error('No attempts made');

        // Check abort signal
        if (this.abortSignal?.aborted) {
            throw new Error('Operation aborted before execution');
        }

        for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
            try {
                // Check total timeout
                if (Date.now() - startTime > this.config.totalTimeout) {
                    throw new Error(`Total timeout exceeded after ${attempt - 1} attempts`);
                }

                // Check abort signal
                if (this.abortSignal?.aborted) {
                    throw new Error(`Operation aborted at attempt ${attempt}`);
                }

                // Execute with circuit breaker if configured
                const result = await this.executeAttempt(fn, attempt);

                // Record success
                this.recordSuccess(attempt, Date.now() - startTime);

                return result;
            } catch (error) {
                lastError = this.normalizeError(error);

                // Record failure
                this.recordFailure(attempt, lastError);

                // Check if error is retryable
                if (!this.config.retryableErrors(lastError)) {
                    console.warn(`[RetryMechanism] Non-retryable error at attempt ${attempt}:`, lastError.message);
                    throw lastError;
                }

                // Check if we have more attempts
                if (attempt < this.config.maxAttempts) {
                    const delay = this.calculateDelay(attempt);

                    // Notify retry handler
                    try {
                        this.config.onRetry(attempt, lastError, delay);
                    } catch (handlerError) {
                        console.error('[RetryMechanism] Retry handler error:', handlerError);
                    }

                    // Log retry
                    console.info(
                        `[RetryMechanism] Retrying ${context || 'operation'} after ${delay}ms (attempt ${attempt}/${this.config.maxAttempts})`
                    );

                    // Wait before retry
                    await this.delay(delay);

                    this.metrics.totalRetries++;
                    this.metrics.retryLatencies.push(delay);
                } else {
                    // No more attempts
                    console.error(
                        `[RetryMechanism] All ${this.config.maxAttempts} attempts failed for ${context || 'operation'}`
                    );
                }
            }
        }

        // All attempts failed
        throw new Error(`All ${this.config.maxAttempts} retry attempts failed: ${lastError.message}`);
    }

    /**
     * Execute single attempt with timeout and circuit breaker
     */
    private async executeAttempt<T>(fn: (attempt: number) => Promise<T>, attempt: number): Promise<T> {
        const attemptFn = () => this.executeWithTimeout(() => fn(attempt), this.config.timeoutPerAttempt);

        if (this.circuitBreaker) {
            return this.circuitBreaker.execute(attemptFn);
        }

        return attemptFn();
    }

    /**
     * Execute with timeout protection
     */
    private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
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
     * Calculate delay based on strategy
     */
    private calculateDelay(attempt: number): number {
        let baseDelay: number;

        switch (this.config.strategy) {
            case RetryStrategy.EXPONENTIAL:
                baseDelay = this.config.baseDelay * Math.pow(2, attempt - 1);
                break;

            case RetryStrategy.LINEAR:
                baseDelay = this.config.baseDelay * attempt;
                break;

            case RetryStrategy.FIXED:
                baseDelay = this.config.baseDelay;
                break;

            case RetryStrategy.FIBONACCI:
                baseDelay = this.config.baseDelay * this.fibonacci(attempt);
                break;

            case RetryStrategy.DECORRELATED:
                // Decorrelated jitter from AWS
                const prevDelay =
                    attempt === 1 ? this.config.baseDelay : this.config.baseDelay * Math.pow(2, attempt - 2);
                baseDelay = Math.min(
                    this.config.maxDelay,
                    Math.random() * (prevDelay * 3 - this.config.baseDelay) + this.config.baseDelay
                );
                break;

            default:
                baseDelay = this.config.baseDelay;
        }

        // Apply jitter (except for decorrelated which has its own)
        if (this.config.strategy !== RetryStrategy.DECORRELATED && this.config.jitterFactor > 0) {
            const jitter = baseDelay * this.config.jitterFactor * (Math.random() * 2 - 1);
            baseDelay = Math.max(0, baseDelay + jitter);
        }

        // Cap at max delay
        return Math.min(baseDelay, this.config.maxDelay);
    }

    /**
     * Calculate Fibonacci number with memoization
     */
    private fibonacci(n: number): number {
        if (this.fibonacciCache.has(n)) {
            return this.fibonacciCache.get(n)!;
        }

        const result = this.fibonacci(n - 1) + this.fibonacci(n - 2);
        this.fibonacciCache.set(n, result);

        return result;
    }

    /**
     * Default retryable error checker
     */
    private defaultRetryableErrors(error: any): boolean {
        // Don't retry on programming errors
        if (error instanceof TypeError || error instanceof ReferenceError) {
            return false;
        }

        // Don't retry on abort
        if (error.name === 'AbortError') {
            return false;
        }

        // Retry on network errors
        if (
            error.code === 'ECONNREFUSED' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ENETUNREACH'
        ) {
            return true;
        }

        // Retry on specific HTTP status codes
        if (error.statusCode) {
            const retryableCodes = [408, 429, 500, 502, 503, 504];
            return retryableCodes.includes(error.statusCode);
        }

        // Retry on timeout
        if (error.message && error.message.includes('timeout')) {
            return true;
        }

        // Default to retry
        return true;
    }

    /**
     * Normalize error to Error object
     */
    private normalizeError(error: any): Error {
        if (error instanceof Error) {
            return error;
        }

        if (typeof error === 'string') {
            return new Error(error);
        }

        if (error && typeof error === 'object') {
            const err = new Error(error.message || JSON.stringify(error));
            Object.assign(err, error);
            return err;
        }

        return new Error(String(error));
    }

    /**
     * Validate configuration
     */
    private validateConfig(): void {
        if (this.config.maxAttempts < 1) {
            throw new Error('maxAttempts must be at least 1');
        }

        if (this.config.maxAttempts > 10) {
            console.warn('[RetryMechanism] maxAttempts > 10 may cause excessive delays');
        }

        if (this.config.baseDelay < 0) {
            throw new Error('baseDelay must be non-negative');
        }

        if (this.config.maxDelay < this.config.baseDelay) {
            throw new Error('maxDelay must be >= baseDelay');
        }

        if (this.config.jitterFactor < 0 || this.config.jitterFactor > 1) {
            throw new Error('jitterFactor must be between 0 and 1');
        }

        if (this.config.timeoutPerAttempt < 100) {
            console.warn('[RetryMechanism] Very low timeoutPerAttempt may cause premature timeouts');
        }
    }

    /**
     * Record successful attempt
     */
    private recordSuccess(attempt: number, totalTime: number): void {
        this.metrics.totalAttempts++;
        this.metrics.successfulAttempts++;
        this.metrics.totalLatency = totalTime;

        if (attempt > 1) {
            console.info(`[RetryMechanism] Succeeded after ${attempt} attempts in ${totalTime}ms`);
        }
    }

    /**
     * Record failed attempt
     */
    private recordFailure(attempt: number, error: Error): void {
        this.metrics.totalAttempts++;
        this.metrics.failedAttempts++;
        this.metrics.lastError = error;
    }

    /**
     * Delay utility
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get metrics
     */
    getMetrics(): Readonly<RetryMetrics> {
        return { ...this.metrics };
    }

    /**
     * Reset metrics
     */
    resetMetrics(): void {
        this.metrics = {
            totalAttempts: 0,
            successfulAttempts: 0,
            failedAttempts: 0,
            totalRetries: 0,
            lastError: null,
            totalLatency: 0,
            retryLatencies: []
        };
    }

    /**
     * Create a retry mechanism with preset for HTTP requests
     */
    static forHttp(overrides?: RetryConfig): RetryMechanism {
        return new RetryMechanism({
            maxAttempts: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            strategy: RetryStrategy.EXPONENTIAL,
            jitterFactor: 0.3,
            timeoutPerAttempt: 30000,
            retryableErrors: error => {
                if (error.statusCode) {
                    const retryableCodes = [408, 429, 500, 502, 503, 504];
                    return retryableCodes.includes(error.statusCode);
                }
                return true;
            },
            ...overrides
        });
    }

    /**
     * Create a retry mechanism with preset for database operations
     */
    static forDatabase(overrides?: RetryConfig): RetryMechanism {
        return new RetryMechanism({
            maxAttempts: 5,
            baseDelay: 100,
            maxDelay: 5000,
            strategy: RetryStrategy.DECORRELATED,
            timeoutPerAttempt: 10000,
            retryableErrors: error => {
                // Retry on connection errors and deadlocks
                const retryableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'DEADLOCK', 'LOCK_TIMEOUT'];
                return retryableCodes.some(code => error.code === code || error.message?.includes(code));
            },
            ...overrides
        });
    }

    /**
     * Create a retry mechanism with preset for file operations
     */
    static forFileSystem(overrides?: RetryConfig): RetryMechanism {
        return new RetryMechanism({
            maxAttempts: 3,
            baseDelay: 50,
            maxDelay: 1000,
            strategy: RetryStrategy.LINEAR,
            timeoutPerAttempt: 5000,
            retryableErrors: error => {
                // Retry on temporary file system errors
                const retryableCodes = ['EAGAIN', 'EBUSY', 'EMFILE', 'ENFILE', 'ENOENT'];
                return retryableCodes.includes(error.code);
            },
            ...overrides
        });
    }
}
