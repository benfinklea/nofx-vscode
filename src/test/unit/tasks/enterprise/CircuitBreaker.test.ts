import {
    CircuitBreaker,
    CircuitBreakerState,
    CircuitBreakerConfig,
    RetryManager,
    RetryConfig,
    ResilientExecutor,
    ResilientExecutorConfig
} from '../../../../tasks/enterprise/CircuitBreaker';
import { TaskError, TaskErrorCode } from '../../../../tasks/enterprise/EnterpriseTaskTypes';

describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;
    let mockConfig: CircuitBreakerConfig;

    beforeEach(() => {
        mockConfig = {
            failureThreshold: 3,
            recoveryTimeoutMs: 5000,
            monitoringPeriodMs: 30000,
            successThreshold: 2
        };
        circuitBreaker = new CircuitBreaker(mockConfig);
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Constructor', () => {
        it('should initialize with closed state', () => {
            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
            expect(circuitBreaker.getFailureCount()).toBe(0);
            expect(circuitBreaker.getSuccessCount()).toBe(0);
        });

        it('should use provided configuration', () => {
            const customConfig = {
                failureThreshold: 5,
                recoveryTimeoutMs: 10000,
                monitoringPeriodMs: 60000,
                successThreshold: 3
            };
            const cb = new CircuitBreaker(customConfig);
            expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
        });
    });

    describe('State Transitions', () => {
        it('should transition from CLOSED to OPEN after threshold failures', async () => {
            const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

            // Execute failing operations up to threshold
            for (let i = 0; i < mockConfig.failureThreshold; i++) {
                try {
                    await circuitBreaker.execute(failingOperation, 'test-op');
                } catch (error) {
                    // Expected to fail
                }
            }

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
            expect(circuitBreaker.getFailureCount()).toBe(mockConfig.failureThreshold);
        });

        it('should reject calls immediately when OPEN', async () => {
            // Force circuit breaker to OPEN state
            const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
            for (let i = 0; i < mockConfig.failureThreshold; i++) {
                try {
                    await circuitBreaker.execute(failingOperation, 'test-op');
                } catch (error) {
                    // Expected to fail
                }
            }

            // Now test that it rejects immediately
            const newOperation = jest.fn().mockResolvedValue('success');

            try {
                await circuitBreaker.execute(newOperation, 'new-op');
                fail('Should have thrown circuit breaker error');
            } catch (error) {
                expect(error).toBeInstanceOf(TaskError);
                expect((error as TaskError).code).toBe(TaskErrorCode.CIRCUIT_BREAKER_OPEN);
                expect(newOperation).not.toHaveBeenCalled();
            }
        });

        it('should transition from OPEN to HALF_OPEN after timeout', async () => {
            // Force to OPEN state
            const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
            for (let i = 0; i < mockConfig.failureThreshold; i++) {
                try {
                    await circuitBreaker.execute(failingOperation, 'test-op');
                } catch (error) {
                    // Expected to fail
                }
            }

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

            // Fast-forward time past recovery timeout
            jest.advanceTimersByTime(mockConfig.recoveryTimeoutMs + 1000);

            // Next call should transition to HALF_OPEN
            const testOperation = jest.fn().mockResolvedValue('success');
            await circuitBreaker.execute(testOperation, 'recovery-test');

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
            expect(testOperation).toHaveBeenCalledTimes(1);
        });

        it('should transition from HALF_OPEN to CLOSED after successful executions', async () => {
            // Force to HALF_OPEN state through OPEN
            const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
            for (let i = 0; i < mockConfig.failureThreshold; i++) {
                try {
                    await circuitBreaker.execute(failingOperation, 'test-op');
                } catch (error) {
                    // Expected to fail
                }
            }

            jest.advanceTimersByTime(mockConfig.recoveryTimeoutMs + 1000);

            // Execute successful operations to reach success threshold
            const successOperation = jest.fn().mockResolvedValue('success');
            for (let i = 0; i < mockConfig.successThreshold; i++) {
                await circuitBreaker.execute(successOperation, `recovery-${i}`);
            }

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
            expect(circuitBreaker.getFailureCount()).toBe(0);
            expect(circuitBreaker.getSuccessCount()).toBe(0);
        });

        it('should transition from HALF_OPEN back to OPEN on failure', async () => {
            // Force to HALF_OPEN state
            const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
            for (let i = 0; i < mockConfig.failureThreshold; i++) {
                try {
                    await circuitBreaker.execute(failingOperation, 'test-op');
                } catch (error) {
                    // Expected to fail
                }
            }

            jest.advanceTimersByTime(mockConfig.recoveryTimeoutMs + 1000);

            // First success to get to HALF_OPEN
            const successOperation = jest.fn().mockResolvedValue('success');
            await circuitBreaker.execute(successOperation, 'recovery-success');
            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

            // Now fail - should go back to OPEN
            try {
                await circuitBreaker.execute(failingOperation, 'recovery-fail');
            } catch (error) {
                // Expected to fail
            }

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
        });
    });

    describe('Metrics and Monitoring', () => {
        it('should track failure and success counts correctly', async () => {
            const successOp = jest.fn().mockResolvedValue('success');
            const failOp = jest.fn().mockRejectedValue(new Error('fail'));

            // Execute some successes
            await circuitBreaker.execute(successOp, 'success-1');
            await circuitBreaker.execute(successOp, 'success-2');

            expect(circuitBreaker.getSuccessCount()).toBe(2);
            expect(circuitBreaker.getFailureCount()).toBe(0);

            // Execute some failures
            try {
                await circuitBreaker.execute(failOp, 'fail-1');
            } catch (error) {
                // Expected
            }

            expect(circuitBreaker.getSuccessCount()).toBe(2);
            expect(circuitBreaker.getFailureCount()).toBe(1);
        });

        it('should reset counters when transitioning to CLOSED', async () => {
            // Force to OPEN state
            const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
            for (let i = 0; i < mockConfig.failureThreshold; i++) {
                try {
                    await circuitBreaker.execute(failingOperation, 'test-op');
                } catch (error) {
                    // Expected to fail
                }
            }

            expect(circuitBreaker.getFailureCount()).toBe(mockConfig.failureThreshold);

            // Transition back to CLOSED
            jest.advanceTimersByTime(mockConfig.recoveryTimeoutMs + 1000);

            const successOperation = jest.fn().mockResolvedValue('success');
            for (let i = 0; i < mockConfig.successThreshold; i++) {
                await circuitBreaker.execute(successOperation, `recovery-${i}`);
            }

            expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
            expect(circuitBreaker.getFailureCount()).toBe(0);
            expect(circuitBreaker.getSuccessCount()).toBe(0);
        });

        it('should provide comprehensive stats', () => {
            const stats = circuitBreaker.getStats();

            expect(stats).toHaveProperty('state');
            expect(stats).toHaveProperty('failureCount');
            expect(stats).toHaveProperty('successCount');
            expect(stats).toHaveProperty('lastFailureTime');
            expect(stats).toHaveProperty('lastSuccessTime');

            expect(typeof stats.state).toBe('string');
            expect(typeof stats.failureCount).toBe('number');
            expect(typeof stats.successCount).toBe('number');
        });
    });

    describe('Error Handling', () => {
        it('should handle operation timeouts', async () => {
            const timeoutOperation = jest.fn().mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve('success'), 10000); // 10 second delay
                });
            });

            const startTime = Date.now();

            try {
                await circuitBreaker.execute(timeoutOperation, 'timeout-test', 1000); // 1 second timeout
                fail('Should have thrown timeout error');
            } catch (error) {
                expect(error).toBeInstanceOf(TaskError);
                expect((error as TaskError).code).toBe(TaskErrorCode.TIMEOUT);
                expect(Date.now() - startTime).toBeLessThan(2000); // Should timeout quickly
            }
        });

        it('should handle non-Error exceptions', async () => {
            const stringThrowingOperation = jest.fn().mockRejectedValue('String error');

            try {
                await circuitBreaker.execute(stringThrowingOperation, 'string-error');
                fail('Should have thrown error');
            } catch (error) {
                expect(circuitBreaker.getFailureCount()).toBe(1);
            }
        });

        it('should handle null/undefined operation', async () => {
            try {
                await circuitBreaker.execute(null as any, 'null-op');
                fail('Should have thrown error');
            } catch (error) {
                expect(error).toBeInstanceOf(TaskError);
                expect((error as TaskError).code).toBe(TaskErrorCode.INVALID_INPUT);
            }
        });
    });
});

describe('RetryManager', () => {
    let retryManager: RetryManager;
    let mockConfig: RetryConfig;

    beforeEach(() => {
        mockConfig = {
            maxAttempts: 3,
            initialDelayMs: 100,
            maxDelayMs: 5000,
            backoffMultiplier: 2,
            jitterMaxMs: 50
        };
        retryManager = new RetryManager(mockConfig);
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Retry Logic', () => {
        it('should retry failed operations up to max attempts', async () => {
            const failingOperation = jest
                .fn()
                .mockRejectedValueOnce(new Error('Attempt 1'))
                .mockRejectedValueOnce(new Error('Attempt 2'))
                .mockResolvedValueOnce('Success on attempt 3');

            const result = await retryManager.executeWithRetry(failingOperation, 'retry-test');

            expect(result).toBe('Success on attempt 3');
            expect(failingOperation).toHaveBeenCalledTimes(3);
        });

        it('should fail after max attempts exceeded', async () => {
            const failingOperation = jest.fn().mockRejectedValue(new Error('Always fails'));

            try {
                await retryManager.executeWithRetry(failingOperation, 'always-fail');
                fail('Should have thrown error after max attempts');
            } catch (error) {
                expect(failingOperation).toHaveBeenCalledTimes(mockConfig.maxAttempts);
                expect(error).toBeInstanceOf(TaskError);
                expect((error as TaskError).code).toBe(TaskErrorCode.MAX_RETRIES_EXCEEDED);
            }
        });

        it('should not retry non-retryable errors', async () => {
            const nonRetryableError = new TaskError(
                TaskErrorCode.INVALID_INPUT,
                'Invalid input',
                false // Not retryable
            );
            const failingOperation = jest.fn().mockRejectedValue(nonRetryableError);

            try {
                await retryManager.executeWithRetry(failingOperation, 'non-retryable');
                fail('Should have thrown non-retryable error');
            } catch (error) {
                expect(failingOperation).toHaveBeenCalledTimes(1); // Only called once
                expect(error).toBe(nonRetryableError);
            }
        });

        it('should implement exponential backoff', async () => {
            const failingOperation = jest.fn().mockRejectedValue(new Error('Always fails'));

            const promise = retryManager.executeWithRetry(failingOperation, 'backoff-test');

            // Verify first retry delay (should be around initialDelayMs + jitter)
            jest.advanceTimersByTime(50); // Less than initial delay
            expect(failingOperation).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(100); // Around initial delay
            expect(failingOperation).toHaveBeenCalledTimes(2);

            // Verify second retry delay (should be around initialDelayMs * backoffMultiplier)
            jest.advanceTimersByTime(150); // Less than backoff delay
            expect(failingOperation).toHaveBeenCalledTimes(2);

            jest.advanceTimersByTime(100); // Around backoff delay
            expect(failingOperation).toHaveBeenCalledTimes(3);

            await expect(promise).rejects.toThrow();
        });

        it('should cap delay at maxDelayMs', () => {
            // Test with high attempt number that would exceed max delay
            const delay1 = retryManager['calculateDelay'](10); // Should be capped
            const delay2 = retryManager['calculateDelay'](20); // Should be capped

            expect(delay1).toBeLessThanOrEqual(mockConfig.maxDelayMs + mockConfig.jitterMaxMs);
            expect(delay2).toBeLessThanOrEqual(mockConfig.maxDelayMs + mockConfig.jitterMaxMs);
        });

        it('should add jitter to delays', () => {
            const delays = Array.from({ length: 10 }, () => retryManager['calculateDelay'](1));

            // With jitter, delays should vary
            const uniqueDelays = new Set(delays);
            expect(uniqueDelays.size).toBeGreaterThan(1);

            // All delays should be within expected range
            delays.forEach(delay => {
                expect(delay).toBeGreaterThanOrEqual(mockConfig.initialDelayMs);
                expect(delay).toBeLessThanOrEqual(mockConfig.initialDelayMs + mockConfig.jitterMaxMs);
            });
        });
    });

    describe('Error Classification', () => {
        it('should identify retryable errors correctly', () => {
            const retryableError = new TaskError(TaskErrorCode.AGENT_UNAVAILABLE, 'Agent busy', true);
            const nonRetryableError = new TaskError(TaskErrorCode.INVALID_CONFIG, 'Bad config', false);
            const genericError = new Error('Generic error');

            expect(retryManager['isRetryableError'](retryableError)).toBe(true);
            expect(retryManager['isRetryableError'](nonRetryableError)).toBe(false);
            expect(retryManager['isRetryableError'](genericError)).toBe(true); // Generic errors are retryable
        });
    });

    describe('Configuration Edge Cases', () => {
        it('should handle zero max attempts', async () => {
            const zeroAttemptsConfig = { ...mockConfig, maxAttempts: 0 };
            const zeroRetryManager = new RetryManager(zeroAttemptsConfig);
            const operation = jest.fn().mockResolvedValue('success');

            try {
                await zeroRetryManager.executeWithRetry(operation, 'zero-attempts');
                fail('Should have thrown error for zero attempts');
            } catch (error) {
                expect(operation).toHaveBeenCalledTimes(0);
                expect(error).toBeInstanceOf(TaskError);
            }
        });

        it('should handle single attempt (no retries)', async () => {
            const singleAttemptConfig = { ...mockConfig, maxAttempts: 1 };
            const singleRetryManager = new RetryManager(singleAttemptConfig);
            const failingOperation = jest.fn().mockRejectedValue(new Error('Fails'));

            try {
                await singleRetryManager.executeWithRetry(failingOperation, 'single-attempt');
                fail('Should have thrown error');
            } catch (error) {
                expect(failingOperation).toHaveBeenCalledTimes(1);
            }
        });
    });
});

describe('ResilientExecutor', () => {
    let executor: ResilientExecutor;
    let mockConfig: ResilientExecutorConfig;

    beforeEach(() => {
        mockConfig = {
            circuitBreaker: {
                failureThreshold: 3,
                recoveryTimeoutMs: 5000,
                monitoringPeriodMs: 30000,
                successThreshold: 2
            },
            retry: {
                maxAttempts: 3,
                initialDelayMs: 100,
                maxDelayMs: 5000,
                backoffMultiplier: 2,
                jitterMaxMs: 50
            },
            defaultTimeoutMs: 10000
        };
        executor = new ResilientExecutor(mockConfig);
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Integration', () => {
        it('should combine circuit breaker and retry logic', async () => {
            const partiallyFailingOperation = jest
                .fn()
                .mockRejectedValueOnce(new Error('Fail 1'))
                .mockResolvedValueOnce('Success on retry');

            const result = await executor.execute(partiallyFailingOperation, 'integration-test');

            expect(result).toBe('Success on retry');
            expect(partiallyFailingOperation).toHaveBeenCalledTimes(2);
        });

        it('should open circuit breaker after repeated retry exhaustion', async () => {
            const alwaysFailingOperation = jest.fn().mockRejectedValue(new Error('Always fails'));

            // Exhaust retries multiple times to trigger circuit breaker
            for (let i = 0; i < mockConfig.circuitBreaker.failureThreshold; i++) {
                try {
                    await executor.execute(alwaysFailingOperation, `attempt-${i}`);
                } catch (error) {
                    // Expected to fail after retries
                }
                jest.advanceTimersByTime(1000); // Allow time between attempts
            }

            // Circuit breaker should now be open
            const newOperation = jest.fn().mockResolvedValue('success');

            try {
                await executor.execute(newOperation, 'circuit-open-test');
                fail('Should have been rejected by circuit breaker');
            } catch (error) {
                expect(error).toBeInstanceOf(TaskError);
                expect((error as TaskError).code).toBe(TaskErrorCode.CIRCUIT_BREAKER_OPEN);
                expect(newOperation).not.toHaveBeenCalled();
            }
        });

        it('should handle timeout with retry', async () => {
            const timeoutOperation = jest.fn().mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve('too late'), 15000); // Longer than timeout
                });
            });

            try {
                await executor.execute(timeoutOperation, 'timeout-retry-test', 1000);
                fail('Should have timed out');
            } catch (error) {
                expect(error).toBeInstanceOf(TaskError);
                expect((error as TaskError).code).toBe(TaskErrorCode.TIMEOUT);
                // Should have attempted retries
                expect(timeoutOperation).toHaveBeenCalledTimes(mockConfig.retry.maxAttempts);
            }
        });

        it('should respect operation-specific timeout', async () => {
            const operation = jest.fn().mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve('success'), 500);
                });
            });

            const result = await executor.execute(operation, 'custom-timeout-test', 2000);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should use default timeout when none specified', async () => {
            const longRunningOperation = jest.fn().mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve('success'), mockConfig.defaultTimeoutMs + 1000);
                });
            });

            try {
                await executor.execute(longRunningOperation, 'default-timeout-test');
                fail('Should have timed out with default timeout');
            } catch (error) {
                expect(error).toBeInstanceOf(TaskError);
                expect((error as TaskError).code).toBe(TaskErrorCode.TIMEOUT);
            }
        });
    });

    describe('Error Propagation', () => {
        it('should preserve original error context through retry and circuit breaker', async () => {
            const specificError = new TaskError(
                TaskErrorCode.AGENT_COMMUNICATION_FAILED,
                'Communication failed',
                true,
                'high',
                { agentId: 'agent-123', attempt: 1 }
            );

            const operation = jest.fn().mockRejectedValue(specificError);

            try {
                await executor.execute(operation, 'error-context-test');
                fail('Should have thrown error');
            } catch (error) {
                expect(error).toBeInstanceOf(TaskError);
                const taskError = error as TaskError;
                expect(taskError.code).toBe(TaskErrorCode.MAX_RETRIES_EXCEEDED);
                expect(taskError.message).toContain('Communication failed');
            }
        });

        it('should handle non-TaskError exceptions', async () => {
            const genericError = new Error('Generic failure');
            const operation = jest.fn().mockRejectedValue(genericError);

            try {
                await executor.execute(operation, 'generic-error-test');
                fail('Should have thrown error');
            } catch (error) {
                expect(error).toBeInstanceOf(TaskError);
                expect((error as TaskError).code).toBe(TaskErrorCode.MAX_RETRIES_EXCEEDED);
            }
        });
    });

    describe('Performance and Resource Management', () => {
        it('should handle concurrent executions', async () => {
            const operations = Array.from({ length: 10 }, (_, i) => jest.fn().mockResolvedValue(`result-${i}`));

            const promises = operations.map((op, i) => executor.execute(op, `concurrent-${i}`));

            const results = await Promise.all(promises);

            expect(results).toHaveLength(10);
            results.forEach((result, i) => {
                expect(result).toBe(`result-${i}`);
            });

            operations.forEach(op => {
                expect(op).toHaveBeenCalledTimes(1);
            });
        });

        it('should cleanup resources properly', async () => {
            const operation = jest.fn().mockResolvedValue('success');
            await executor.execute(operation, 'cleanup-test');

            // Verify circuit breaker and retry manager states are maintained
            const stats = executor['circuitBreaker'].getStats();
            expect(stats.successCount).toBeGreaterThan(0);
        });
    });
});
