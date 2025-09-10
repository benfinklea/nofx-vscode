/**
 * Comprehensive unit tests for RetryManager implementation
 * Tests exponential backoff, retry conditions, configurations, and edge cases
 */

import { RetryManager, RETRY_CONFIGURATIONS, RetryUtils } from '../../../services/RetryManager';
import { MaxRetriesExceededError, ErrorClassifier } from '../../../services/EventBusErrors';

// Mock logger for testing
const createMockLogger = () => ({
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
});

// Mock ErrorClassifier
jest.mock('../../../services/EventBusErrors', () => ({
    ...jest.requireActual('../../../services/EventBusErrors'),
    ErrorClassifier: {
        shouldRetry: jest.fn(),
        getSeverity: jest.fn(),
        isRecoverable: jest.fn()
    }
}));

const mockErrorClassifier = ErrorClassifier as jest.Mocked<typeof ErrorClassifier>;

describe('RetryManager', () => {
    let retryManager: RetryManager;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
        retryManager = new RetryManager('test-operation', mockLogger);

        // Default mock behavior
        mockErrorClassifier.shouldRetry.mockReturnValue(true);
        mockErrorClassifier.getSeverity.mockReturnValue('medium');
        mockErrorClassifier.isRecoverable.mockReturnValue(true);
    });

    describe('constructor', () => {
        it('should initialize with name and logger', () => {
            expect(retryManager).toBeDefined();
        });

        it('should work without logger', () => {
            expect(() => new RetryManager('test')).not.toThrow();
        });
    });

    describe('execute - Success Scenarios', () => {
        it('should execute successful operation without retry', async () => {
            const operation = jest.fn().mockResolvedValue('success');

            const result = await retryManager.execute(operation);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should return result from successful retry', async () => {
            const operation = jest
                .fn()
                .mockRejectedValueOnce(new Error('fail1'))
                .mockRejectedValueOnce(new Error('fail2'))
                .mockResolvedValueOnce('success');

            const result = await retryManager.execute(operation, RETRY_CONFIGURATIONS.FAST);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('succeeded on attempt 3'),
                expect.objectContaining({
                    totalAttempts: 3
                })
            );
        });

        it('should handle async operations', async () => {
            const operation = jest.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return 'async-success';
            });

            const result = await retryManager.execute(operation);

            expect(result).toBe('async-success');
        });
    });

    describe('execute - Retry Logic', () => {
        it('should retry on retryable errors', async () => {
            const error1 = new Error('transient error');
            const error2 = new Error('another transient error');
            const operation = jest
                .fn()
                .mockRejectedValueOnce(error1)
                .mockRejectedValueOnce(error2)
                .mockResolvedValueOnce('success');

            const result = await retryManager.execute(operation, {
                maxAttempts: 3,
                initialDelayMs: 10,
                maxDelayMs: 100,
                backoffMultiplier: 2,
                jitterMs: 5
            });

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
            expect(mockErrorClassifier.shouldRetry).toHaveBeenCalledWith(error1, 1);
            expect(mockErrorClassifier.shouldRetry).toHaveBeenCalledWith(error2, 2);
        });

        it('should stop retrying on non-retryable errors', async () => {
            const nonRetryableError = new TypeError('Programming error');
            mockErrorClassifier.shouldRetry.mockReturnValue(false);

            const operation = jest.fn().mockRejectedValue(nonRetryableError);

            await expect(retryManager.execute(operation, RETRY_CONFIGURATIONS.FAST)).rejects.toThrow(
                MaxRetriesExceededError
            );

            expect(operation).toHaveBeenCalledTimes(1);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('not retryable'),
                expect.objectContaining({
                    error: 'Programming error',
                    errorType: 'TypeError'
                })
            );
        });

        it('should respect max attempts limit', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('persistent error'));

            await expect(
                retryManager.execute(operation, {
                    maxAttempts: 2,
                    initialDelayMs: 1,
                    maxDelayMs: 10,
                    backoffMultiplier: 2,
                    jitterMs: 0
                })
            ).rejects.toThrow(MaxRetriesExceededError);

            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('should call onRetry callback', async () => {
            const onRetry = jest.fn();
            const operation = jest.fn().mockRejectedValueOnce(new Error('retry me')).mockResolvedValueOnce('success');

            await retryManager.execute(operation, {
                maxAttempts: 3,
                initialDelayMs: 10,
                maxDelayMs: 100,
                backoffMultiplier: 2,
                jitterMs: 0,
                onRetry
            });

            expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
        });

        it('should use custom retry condition', async () => {
            const customRetryCondition = jest.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);

            const operation = jest
                .fn()
                .mockRejectedValueOnce(new Error('first'))
                .mockRejectedValueOnce(new Error('second'));

            await expect(
                retryManager.execute(operation, {
                    maxAttempts: 3,
                    initialDelayMs: 1,
                    maxDelayMs: 10,
                    backoffMultiplier: 2,
                    jitterMs: 0,
                    retryCondition: customRetryCondition
                })
            ).rejects.toThrow(MaxRetriesExceededError);

            expect(customRetryCondition).toHaveBeenCalledTimes(2);
            expect(operation).toHaveBeenCalledTimes(2);
        });
    });

    describe('execute - Exponential Backoff', () => {
        it('should implement exponential backoff with jitter', async () => {
            const operation = jest
                .fn()
                .mockRejectedValueOnce(new Error('fail1'))
                .mockRejectedValueOnce(new Error('fail2'))
                .mockResolvedValueOnce('success');

            const startTime = Date.now();

            await retryManager.execute(operation, {
                maxAttempts: 3,
                initialDelayMs: 50,
                maxDelayMs: 1000,
                backoffMultiplier: 2,
                jitterMs: 10
            });

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // Should have waited for delays (approximately 50ms + 100ms = 150ms, plus jitter)
            expect(totalTime).toBeGreaterThan(100);
            expect(totalTime).toBeLessThan(300); // Allow for variance
        });

        it('should respect max delay limit', async () => {
            const operation = jest
                .fn()
                .mockRejectedValue(new Error('fail'))
                .mockRejectedValue(new Error('fail'))
                .mockRejectedValue(new Error('fail'));

            const startTime = Date.now();

            await expect(
                retryManager.execute(operation, {
                    maxAttempts: 3,
                    initialDelayMs: 100,
                    maxDelayMs: 150, // Cap at 150ms
                    backoffMultiplier: 5,
                    jitterMs: 0
                })
            ).rejects.toThrow();

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // Even with high multiplier, should be capped by maxDelay
            // Expected: ~100ms + ~150ms = ~250ms
            expect(totalTime).toBeLessThan(400);
        });

        it('should apply jitter correctly', async () => {
            const delays: number[] = [];

            const operation = jest.fn().mockRejectedValue(new Error('fail')).mockRejectedValue(new Error('fail'));

            // Patch setTimeout to capture delays
            const originalSetTimeout = setTimeout;
            global.setTimeout = jest.fn().mockImplementation((callback, delay) => {
                delays.push(delay);
                return originalSetTimeout(callback, 0); // Execute immediately for test speed
            });

            try {
                await expect(
                    retryManager.execute(operation, {
                        maxAttempts: 2,
                        initialDelayMs: 100,
                        maxDelayMs: 1000,
                        backoffMultiplier: 2,
                        jitterMs: 20
                    })
                ).rejects.toThrow();

                expect(delays).toHaveLength(1);
                // Delay should be base delay ± jitter
                expect(delays[0]).toBeGreaterThan(80); // 100 - 20
                expect(delays[0]).toBeLessThan(120); // 100 + 20
            } finally {
                global.setTimeout = originalSetTimeout;
            }
        });
    });

    describe('execute - Error Handling', () => {
        it('should throw MaxRetriesExceededError after all retries fail', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('persistent failure'));

            await expect(retryManager.execute(operation, RETRY_CONFIGURATIONS.FAST)).rejects.toThrow(
                MaxRetriesExceededError
            );

            expect(operation).toHaveBeenCalledTimes(RETRY_CONFIGURATIONS.FAST.maxAttempts);
        });

        it('should include retry details in MaxRetriesExceededError', async () => {
            const operation = jest
                .fn()
                .mockRejectedValueOnce(new Error('error1'))
                .mockRejectedValueOnce(new Error('error2'));

            try {
                await retryManager.execute(operation, {
                    maxAttempts: 2,
                    initialDelayMs: 1,
                    maxDelayMs: 10,
                    backoffMultiplier: 2,
                    jitterMs: 0
                });
            } catch (error) {
                expect(error).toBeInstanceOf(MaxRetriesExceededError);
                expect(error.context).toEqual(
                    expect.objectContaining({
                        originalError: 'error2',
                        totalDelayMs: expect.any(Number),
                        attempts: expect.arrayContaining([
                            expect.objectContaining({
                                attempt: 1,
                                error: 'error1'
                            }),
                            expect.objectContaining({
                                attempt: 2,
                                error: 'error2'
                            })
                        ])
                    })
                );
            }
        });

        it('should handle operation that throws non-Error objects', async () => {
            const operation = jest
                .fn()
                .mockRejectedValueOnce('string error')
                .mockRejectedValueOnce(null)
                .mockRejectedValueOnce({ message: 'object error' });

            await expect(
                retryManager.execute(operation, {
                    maxAttempts: 3,
                    initialDelayMs: 1,
                    maxDelayMs: 10,
                    backoffMultiplier: 2,
                    jitterMs: 0
                })
            ).rejects.toThrow(MaxRetriesExceededError);
        });
    });

    describe('Static Factory Methods', () => {
        it('should create fast retry manager', () => {
            const fastRetry = RetryManager.createFastRetry('fast-test', mockLogger);
            expect(fastRetry).toBeInstanceOf(RetryManager);
        });

        it('should create slow retry manager', () => {
            const slowRetry = RetryManager.createSlowRetry('slow-test', mockLogger);
            expect(slowRetry).toBeInstanceOf(RetryManager);
        });

        it('should create critical retry manager', () => {
            const criticalRetry = RetryManager.createCriticalRetry('critical-test', mockLogger);
            expect(criticalRetry).toBeInstanceOf(RetryManager);
        });
    });

    describe('Logging', () => {
        it('should log debug information for retries', async () => {
            const operation = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('success');

            await retryManager.execute(operation, {
                maxAttempts: 2,
                initialDelayMs: 10,
                maxDelayMs: 100,
                backoffMultiplier: 2,
                jitterMs: 0
            });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('failed on attempt 1, retrying'),
                expect.objectContaining({
                    error: 'fail',
                    attempt: 1,
                    maxAttempts: 2,
                    delayMs: expect.any(Number)
                })
            );
        });

        it('should log final failure', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('final failure'));

            await expect(
                retryManager.execute(operation, {
                    maxAttempts: 2,
                    initialDelayMs: 1,
                    maxDelayMs: 10,
                    backoffMultiplier: 2,
                    jitterMs: 0
                })
            ).rejects.toThrow();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('failed on final attempt 2'),
                expect.objectContaining({
                    error: 'final failure',
                    totalAttempts: 2
                })
            );
        });

        it('should work without logger', async () => {
            const noLoggerRetry = new RetryManager('test');
            const operation = jest.fn().mockResolvedValue('success');

            await expect(noLoggerRetry.execute(operation)).resolves.toBe('success');
        });
    });
});

describe('RETRY_CONFIGURATIONS', () => {
    it('should have all expected configurations', () => {
        expect(RETRY_CONFIGURATIONS.FAST).toBeDefined();
        expect(RETRY_CONFIGURATIONS.STANDARD).toBeDefined();
        expect(RETRY_CONFIGURATIONS.SLOW).toBeDefined();
        expect(RETRY_CONFIGURATIONS.CRITICAL).toBeDefined();
        expect(RETRY_CONFIGURATIONS.IMMEDIATE).toBeDefined();
    });

    it('should have valid configuration values', () => {
        Object.values(RETRY_CONFIGURATIONS).forEach(config => {
            expect(config.maxAttempts).toBeGreaterThan(0);
            expect(config.initialDelayMs).toBeGreaterThanOrEqual(0);
            expect(config.maxDelayMs).toBeGreaterThan(config.initialDelayMs);
            expect(config.backoffMultiplier).toBeGreaterThan(0);
            expect(config.jitterMs).toBeGreaterThanOrEqual(0);
        });
    });

    it('should have different characteristics for different scenarios', () => {
        // Fast should be... fast
        expect(RETRY_CONFIGURATIONS.FAST.maxDelayMs).toBeLessThan(5000);

        // Critical should try more times
        expect(RETRY_CONFIGURATIONS.CRITICAL.maxAttempts).toBeGreaterThan(RETRY_CONFIGURATIONS.FAST.maxAttempts);

        // Immediate should have minimal delay
        expect(RETRY_CONFIGURATIONS.IMMEDIATE.initialDelayMs).toBeLessThan(50);
    });
});

describe('RetryUtils', () => {
    describe('withRetry', () => {
        it('should wrap function with retry logic', async () => {
            const originalFn = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('success');

            const wrappedFn = RetryUtils.withRetry(originalFn, RETRY_CONFIGURATIONS.FAST);

            const result = await wrappedFn('arg1', 'arg2');

            expect(result).toBe('success');
            expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
            expect(originalFn).toHaveBeenCalledTimes(2);
        });

        it('should preserve function signature', async () => {
            const typedFn = async (a: string, b: number): Promise<string> => `${a}-${b}`;
            const wrappedFn = RetryUtils.withRetry(typedFn, RETRY_CONFIGURATIONS.FAST);

            const result = await wrappedFn('test', 42);
            expect(result).toBe('test-42');
        });
    });

    describe('createConditionalRetry', () => {
        it('should create retry config that only retries specific error types', async () => {
            const retryConfig = RetryUtils.createConditionalRetry([TypeError, ReferenceError], { maxAttempts: 3 });

            expect(retryConfig.maxAttempts).toBe(3);
            expect(retryConfig.retryCondition).toBeDefined();

            // Should retry TypeError
            expect(retryConfig.retryCondition!(new TypeError('test'), 1)).toBe(true);

            // Should retry ReferenceError
            expect(retryConfig.retryCondition!(new ReferenceError('test'), 1)).toBe(true);

            // Should not retry other errors
            expect(retryConfig.retryCondition!(new Error('test'), 1)).toBe(false);
        });
    });

    describe('createCustomBackoff', () => {
        it('should create retry config with custom backoff', () => {
            const customBackoff = (attempt: number) => attempt * 1000;
            const retryConfig = RetryUtils.createCustomBackoff(customBackoff, 5);

            expect(retryConfig.maxAttempts).toBe(5);
            expect(retryConfig.retryCondition).toBeDefined();
        });
    });
});

describe('Edge Cases and Integration', () => {
    let retryManager: RetryManager;

    beforeEach(() => {
        retryManager = new RetryManager('edge-case-test');
    });

    it('should handle operation that sometimes succeeds', async () => {
        let callCount = 0;
        const flakeyOperation = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount < 3) {
                throw new Error(`Attempt ${callCount} failed`);
            }
            return `Success on attempt ${callCount}`;
        });

        const result = await retryManager.execute(flakeyOperation, RETRY_CONFIGURATIONS.FAST);

        expect(result).toBe('Success on attempt 3');
        expect(flakeyOperation).toHaveBeenCalledTimes(3);
    });

    it('should handle very fast operations', async () => {
        const fastOperation = jest.fn().mockResolvedValue('immediate');

        const startTime = Date.now();
        const result = await retryManager.execute(fastOperation);
        const endTime = Date.now();

        expect(result).toBe('immediate');
        expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle operations with complex return types', async () => {
        const complexOperation = jest.fn().mockResolvedValue({
            data: [1, 2, 3],
            metadata: { timestamp: new Date(), count: 3 },
            nested: { deep: { value: 'test' } }
        });

        const result = await retryManager.execute(complexOperation);

        expect(result).toEqual({
            data: [1, 2, 3],
            metadata: { timestamp: expect.any(Date), count: 3 },
            nested: { deep: { value: 'test' } }
        });
    });

    it('should handle concurrent retry operations', async () => {
        const operations = Array.from({ length: 5 }, (_, i) =>
            jest
                .fn()
                .mockRejectedValueOnce(new Error(`fail-${i}`))
                .mockResolvedValueOnce(`success-${i}`)
        );

        const promises = operations.map((op, i) => retryManager.execute(op, RETRY_CONFIGURATIONS.FAST));

        const results = await Promise.all(promises);

        expect(results).toEqual(['success-0', 'success-1', 'success-2', 'success-3', 'success-4']);

        operations.forEach(op => {
            expect(op).toHaveBeenCalledTimes(2);
        });
    });

    it('should handle zero delay configuration', async () => {
        const operation = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('success');

        const startTime = Date.now();

        await retryManager.execute(operation, {
            maxAttempts: 2,
            initialDelayMs: 0,
            maxDelayMs: 0,
            backoffMultiplier: 1,
            jitterMs: 0
        });

        const endTime = Date.now();

        // Should complete very quickly with no delays
        expect(endTime - startTime).toBeLessThan(50);
    });

    it('should handle operations that return promises', async () => {
        const promiseOperation = jest.fn().mockImplementation(async () => {
            return Promise.resolve('promise-result');
        });

        const result = await retryManager.execute(promiseOperation);
        expect(result).toBe('promise-result');
    });
});
