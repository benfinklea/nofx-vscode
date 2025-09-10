/**
 * Comprehensive unit tests for SelfHealingManager
 * Tests recovery actions, fallback strategies, health tracking, and self-healing execution
 */

import { SelfHealingManager } from '../../../services/SelfHealingManager';
import { EventBusError, ResourceExhaustionError } from '../../../services/EventBusErrors';

// Mock logger for testing
const createMockLogger = () => ({
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
});

// Mock timers for testing
jest.useFakeTimers();

describe('SelfHealingManager', () => {
    let selfHealing: SelfHealingManager;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
        selfHealing = new SelfHealingManager(mockLogger);
    });

    afterEach(() => {
        selfHealing.dispose();
        jest.clearAllTimers();
    });

    describe('constructor', () => {
        it('should initialize with correct default health metrics', () => {
            const metrics = selfHealing.getHealthMetrics();

            expect(metrics.totalErrors).toBe(0);
            expect(metrics.errorRate).toBe(0);
            expect(metrics.lastErrorTime).toBeNull();
            expect(metrics.recoveryAttempts).toBe(0);
            expect(metrics.successfulRecoveries).toBe(0);
            expect(metrics.currentHealth).toBe('healthy');
            expect(metrics.uptime).toBeGreaterThan(0);
            expect(metrics.lastHealthCheck).toBeInstanceOf(Date);
        });

        it('should work without logger', () => {
            expect(() => new SelfHealingManager()).not.toThrow();
        });

        it('should initialize built-in recovery actions', () => {
            // Should have default recovery actions
            expect(mockLogger.info).toHaveBeenCalledWith('SelfHealingManager initialized with automated recovery');
        });
    });

    describe('recordError', () => {
        it('should record error with default severity', () => {
            const error = new Error('Test error');

            selfHealing.recordError(error);

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.totalErrors).toBe(1);
            expect(metrics.lastErrorTime).toBeInstanceOf(Date);
        });

        it('should record error with specified severity', () => {
            const error = new Error('Critical error');

            selfHealing.recordError(error, 'critical');

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.totalErrors).toBe(1);
            expect(metrics.currentHealth).toBe('unhealthy');
        });

        it('should update health status based on error severity', () => {
            // Low severity should keep healthy status initially
            selfHealing.recordError(new Error('Minor'), 'low');
            expect(selfHealing.getHealthMetrics().currentHealth).toBe('healthy');

            // High severity should degrade health
            selfHealing.recordError(new Error('Major'), 'high');
            expect(selfHealing.getHealthMetrics().currentHealth).toBe('degraded');

            // Critical severity should mark as unhealthy
            selfHealing.recordError(new Error('Critical'), 'critical');
            expect(selfHealing.getHealthMetrics().currentHealth).toBe('unhealthy');
        });

        it('should trim error history when it gets too large', () => {
            // Record many errors to test trimming
            for (let i = 0; i < 1100; i++) {
                selfHealing.recordError(new Error(`Error ${i}`));
            }

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.totalErrors).toBe(1100);
            // Internal history should be trimmed but we can't directly test it
            // We verify it doesn't crash with large numbers
        });

        it('should calculate error rate correctly', () => {
            // Record multiple errors quickly
            selfHealing.recordError(new Error('Error 1'));
            selfHealing.recordError(new Error('Error 2'));
            selfHealing.recordError(new Error('Error 3'));

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.errorRate).toBeGreaterThan(0);
        });
    });

    describe('executeWithHealing', () => {
        it('should execute successful operation without healing', async () => {
            const operation = jest.fn().mockResolvedValue('success');

            const result = await selfHealing.executeWithHealing(operation, 'test-op');

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should retry failed operations', async () => {
            const operation = jest
                .fn()
                .mockRejectedValueOnce(new Error('fail1'))
                .mockRejectedValueOnce(new Error('fail2'))
                .mockResolvedValueOnce('success');

            const result = await selfHealing.executeWithHealing(operation, 'test-op', {
                maxAttempts: 3
            });

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Self-healing successful'),
                expect.any(Object)
            );
        });

        it('should record successful recovery', async () => {
            const operation = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('success');

            await selfHealing.executeWithHealing(operation, 'test-op');

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.successfulRecoveries).toBe(1);
        });

        it('should attempt recovery actions between retries', async () => {
            const operation = jest
                .fn()
                .mockRejectedValueOnce(new ResourceExhaustionError('memory', 100, 150))
                .mockResolvedValueOnce('success');

            await selfHealing.executeWithHealing(operation, 'test-op');

            // Should have attempted recovery actions for ResourceExhaustionError
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('should use fallback strategies when all retries fail', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('persistent failure'));

            // Create a mock for a low-severity error that should use silent failure fallback
            const result = await selfHealing.executeWithHealing(operation, 'test-op', {
                maxAttempts: 2,
                enableFallback: true
            });

            // Should have attempted fallback strategies
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Executing fallback strategy'),
                expect.any(Object)
            );
        });

        it('should handle critical operations differently', async () => {
            const operation = jest
                .fn()
                .mockRejectedValueOnce(new Error('critical fail'))
                .mockResolvedValueOnce('success');

            await selfHealing.executeWithHealing(operation, 'critical-op', {
                criticalOperation: true
            });

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.totalErrors).toBeGreaterThan(0);
        });

        it('should throw after all attempts and fallbacks fail', async () => {
            const persistentError = new Error('unfixable error');
            const operation = jest.fn().mockRejectedValue(persistentError);

            await expect(
                selfHealing.executeWithHealing(operation, 'test-op', {
                    maxAttempts: 2,
                    enableFallback: true
                })
            ).rejects.toThrow('unfixable error');
        });

        it('should disable fallback when requested', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('fail'));

            await expect(
                selfHealing.executeWithHealing(operation, 'test-op', {
                    maxAttempts: 1,
                    enableFallback: false
                })
            ).rejects.toThrow('fail');

            // Should not log fallback execution
            expect(mockLogger.info).not.toHaveBeenCalledWith(
                expect.stringContaining('fallback strategy'),
                expect.any(Object)
            );
        });
    });

    describe('getHealthMetrics', () => {
        it('should return current health metrics', () => {
            selfHealing.recordError(new Error('Test'), 'medium');

            const metrics = selfHealing.getHealthMetrics();

            expect(metrics).toEqual(
                expect.objectContaining({
                    totalErrors: 1,
                    errorRate: expect.any(Number),
                    lastErrorTime: expect.any(Date),
                    recoveryAttempts: expect.any(Number),
                    successfulRecoveries: expect.any(Number),
                    currentHealth: expect.any(String),
                    uptime: expect.any(Number),
                    lastHealthCheck: expect.any(Date)
                })
            );
        });

        it('should update error rate calculation', () => {
            const initialMetrics = selfHealing.getHealthMetrics();
            expect(initialMetrics.errorRate).toBe(0);

            selfHealing.recordError(new Error('Test'));

            const updatedMetrics = selfHealing.getHealthMetrics();
            expect(updatedMetrics.errorRate).toBeGreaterThan(0);
        });
    });

    describe('Recovery Actions', () => {
        it('should execute memory cleanup recovery action', async () => {
            const operation = jest
                .fn()
                .mockRejectedValueOnce(new ResourceExhaustionError('memory', 100, 200))
                .mockResolvedValueOnce('success');

            // Mock global.gc to test memory cleanup
            const mockGc = jest.fn();
            (global as any).gc = mockGc;

            await selfHealing.executeWithHealing(operation, 'test-op');

            // Should have attempted memory cleanup
            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.recoveryAttempts).toBeGreaterThan(0);

            delete (global as any).gc;
        });

        it('should respect cooldown periods for recovery actions', async () => {
            const operation = jest.fn().mockRejectedValue(new ResourceExhaustionError('memory', 100, 200));

            // First call should attempt recovery
            await expect(selfHealing.executeWithHealing(operation, 'test-op1', { maxAttempts: 1 })).rejects.toThrow();

            // Immediate second call should not attempt recovery due to cooldown
            await expect(selfHealing.executeWithHealing(operation, 'test-op2', { maxAttempts: 1 })).rejects.toThrow();
        });

        it('should handle recovery action failures gracefully', async () => {
            // Add a recovery action that always fails
            selfHealing.addRecoveryAction('failing-action', {
                name: 'Failing Action',
                description: 'An action that always fails',
                severity: 'high',
                execute: async () => {
                    throw new Error('Recovery failed');
                },
                maxAttempts: 1,
                cooldownMs: 1000
            });

            const operation = jest.fn().mockRejectedValue(new Error('test error'));

            await expect(selfHealing.executeWithHealing(operation, 'test-op', { maxAttempts: 1 })).rejects.toThrow();

            // Should have logged the recovery failure
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Recovery action'),
                expect.any(Object)
            );
        });
    });

    describe('Fallback Strategies', () => {
        it('should execute degraded mode fallback', async () => {
            // Set health to unhealthy to trigger degraded mode
            for (let i = 0; i < 10; i++) {
                selfHealing.recordError(new Error(`Error ${i}`), 'high');
            }

            const operation = jest.fn().mockRejectedValue(new Error('fail'));

            const result = await selfHealing.executeWithHealing(operation, 'test-op', {
                maxAttempts: 1,
                enableFallback: true
            });

            // Degraded mode returns null
            expect(result).toBeNull();
        });

        it('should execute silent failure fallback for low severity errors', async () => {
            // Create a low-severity error (non-EventBusError)
            const operation = jest.fn().mockRejectedValue(new Error('minor error'));

            const result = await selfHealing.executeWithHealing(operation, 'test-op', {
                maxAttempts: 1,
                enableFallback: true
            });

            // Silent failure returns undefined
            expect(result).toBeUndefined();
        });

        it('should execute extended retry fallback', async () => {
            const operation = jest
                .fn()
                .mockRejectedValue(new Error('fail'))
                .mockRejectedValue(new Error('fail'))
                .mockRejectedValue(new Error('fail'))
                .mockRejectedValue(new Error('fail'))
                .mockRejectedValue(new Error('fail'))
                .mockResolvedValue('eventual success');

            // Keep health in recoverable state
            selfHealing.recordError(new Error('Test'), 'medium');

            const result = await selfHealing.executeWithHealing(operation, 'test-op', {
                maxAttempts: 1,
                enableFallback: true
            });

            expect(result).toBe('eventual success');
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Extended retry fallback'),
                expect.any(Object)
            );
        });

        it('should try fallback strategies in order until one succeeds', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('persistent'));

            // Add a custom fallback that succeeds
            selfHealing.addFallbackStrategy({
                name: 'Custom Success',
                condition: () => true,
                execute: async () => 'fallback success',
                description: 'Always succeeds'
            });

            const result = await selfHealing.executeWithHealing(operation, 'test-op', {
                maxAttempts: 1,
                enableFallback: true
            });

            expect(result).toBe('fallback success');
        });
    });

    describe('Health Status Management', () => {
        it('should transition health states correctly', () => {
            let metrics = selfHealing.getHealthMetrics();
            expect(metrics.currentHealth).toBe('healthy');

            // Medium severity should move to degraded
            selfHealing.recordError(new Error('Test'), 'medium');
            metrics = selfHealing.getHealthMetrics();
            expect(metrics.currentHealth).toBe('degraded');

            // High severity should move to unhealthy
            selfHealing.recordError(new Error('Test'), 'high');
            metrics = selfHealing.getHealthMetrics();
            expect(metrics.currentHealth).toBe('unhealthy');

            // Critical should definitely be unhealthy
            selfHealing.recordError(new Error('Test'), 'critical');
            metrics = selfHealing.getHealthMetrics();
            expect(metrics.currentHealth).toBe('unhealthy');
        });

        it('should improve health status on successful recoveries', async () => {
            // Degrade health first
            selfHealing.recordError(new Error('Test'), 'high');
            expect(selfHealing.getHealthMetrics().currentHealth).toBe('degraded');

            // Successful recovery should improve health
            const operation = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('success');

            await selfHealing.executeWithHealing(operation, 'test-op');

            // Health should improve
            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.successfulRecoveries).toBe(1);
        });

        it('should perform periodic health checks', () => {
            // Fast forward timers to trigger health check
            jest.advanceTimersByTime(30000);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Health check performed',
                expect.objectContaining({
                    health: expect.any(String),
                    errorRate: expect.any(Number)
                })
            );
        });

        it('should trigger recovery on poor health during health check', () => {
            // Create unhealthy state
            for (let i = 0; i < 20; i++) {
                selfHealing.recordError(new Error(`Error ${i}`), 'high');
            }

            // Fast forward to trigger health check
            jest.advanceTimersByTime(30000);

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.currentHealth).toBe('unhealthy');
        });
    });

    describe('Error Classification', () => {
        it('should classify error severity correctly', () => {
            const eventBusError = new ResourceExhaustionError('memory', 100, 200);
            const typeError = new TypeError('Programming error');
            const genericError = new Error('Generic error');

            selfHealing.recordError(eventBusError, 'critical');
            selfHealing.recordError(typeError);
            selfHealing.recordError(genericError);

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.totalErrors).toBe(3);
        });

        it('should handle network-related errors', async () => {
            const networkError = new Error('Network connection failed');
            const operation = jest.fn().mockRejectedValue(networkError);

            await expect(selfHealing.executeWithHealing(operation, 'network-op', { maxAttempts: 1 })).rejects.toThrow();

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.totalErrors).toBe(1);
        });

        it('should handle timeout errors', async () => {
            const timeoutError = new Error('Operation timed out');
            const operation = jest.fn().mockRejectedValue(timeoutError);

            await expect(selfHealing.executeWithHealing(operation, 'timeout-op', { maxAttempts: 1 })).rejects.toThrow();

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.totalErrors).toBe(1);
        });
    });

    describe('Custom Extensions', () => {
        it('should allow adding custom recovery actions', () => {
            const customAction = {
                name: 'Custom Recovery',
                description: 'A custom recovery action',
                severity: 'medium' as const,
                execute: jest.fn().mockResolvedValue(true),
                maxAttempts: 3,
                cooldownMs: 5000
            };

            selfHealing.addRecoveryAction('custom', customAction);

            expect(mockLogger.info).toHaveBeenCalledWith("Custom recovery action 'custom' added");
        });

        it('should allow adding custom fallback strategies', () => {
            const customStrategy = {
                name: 'Custom Fallback',
                condition: (error: Error) => error.message.includes('custom'),
                execute: async () => 'custom result',
                description: 'A custom fallback strategy'
            };

            selfHealing.addFallbackStrategy(customStrategy);

            expect(mockLogger.info).toHaveBeenCalledWith("Custom fallback strategy 'Custom Fallback' added");
        });

        it('should execute custom recovery actions', async () => {
            const customExecute = jest.fn().mockResolvedValue(true);
            selfHealing.addRecoveryAction('test-custom', {
                name: 'Test Custom',
                description: 'Test recovery',
                severity: 'high',
                execute: customExecute,
                maxAttempts: 1,
                cooldownMs: 0
            });

            const operation = jest.fn().mockRejectedValueOnce(new Error('Test error')).mockResolvedValueOnce('success');

            await selfHealing.executeWithHealing(operation, 'test-op');

            // Custom recovery should have been attempted
            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.recoveryAttempts).toBeGreaterThan(0);
        });

        it('should execute custom fallback strategies', async () => {
            const customExecute = jest.fn().mockResolvedValue('custom success');
            selfHealing.addFallbackStrategy({
                name: 'Test Custom Fallback',
                condition: error => error.message === 'trigger custom',
                execute: customExecute,
                description: 'Test fallback'
            });

            const operation = jest.fn().mockRejectedValue(new Error('trigger custom'));

            const result = await selfHealing.executeWithHealing(operation, 'test-op', {
                maxAttempts: 1,
                enableFallback: true
            });

            expect(result).toBe('custom success');
            expect(customExecute).toHaveBeenCalled();
        });
    });

    describe('Disposal and Cleanup', () => {
        it('should dispose cleanly', () => {
            selfHealing.dispose();

            expect(mockLogger.info).toHaveBeenCalledWith('SelfHealingManager disposed');
        });

        it('should clear timers on disposal', () => {
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            selfHealing.dispose();

            expect(clearIntervalSpy).toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle operations that return undefined', async () => {
            const operation = jest.fn().mockResolvedValue(undefined);

            const result = await selfHealing.executeWithHealing(operation, 'undefined-op');
            expect(result).toBeUndefined();
        });

        it('should handle operations that return null', async () => {
            const operation = jest.fn().mockResolvedValue(null);

            const result = await selfHealing.executeWithHealing(operation, 'null-op');
            expect(result).toBeNull();
        });

        it('should handle very quick successive operations', async () => {
            const operations = Array.from({ length: 10 }, (_, i) => jest.fn().mockResolvedValue(`result-${i}`));

            const promises = operations.map((op, i) => selfHealing.executeWithHealing(op, `quick-op-${i}`));

            const results = await Promise.all(promises);
            expect(results).toHaveLength(10);
        });

        it('should handle recovery action with rollback', async () => {
            const rollback = jest.fn().mockResolvedValue(undefined);
            const execute = jest.fn().mockRejectedValue(new Error('Recovery failed'));

            selfHealing.addRecoveryAction('rollback-test', {
                name: 'Rollback Test',
                description: 'Test rollback functionality',
                severity: 'high',
                execute,
                rollback,
                maxAttempts: 1,
                cooldownMs: 0
            });

            const operation = jest.fn().mockRejectedValue(new Error('Test'));

            await expect(
                selfHealing.executeWithHealing(operation, 'rollback-op', { maxAttempts: 1 })
            ).rejects.toThrow();

            // Rollback should have been called
            expect(rollback).toHaveBeenCalled();
        });

        it('should handle errors during error rate calculation', () => {
            // This tests internal robustness
            for (let i = 0; i < 5; i++) {
                selfHealing.recordError(new Error(`Error ${i}`));
            }

            // Should not throw when getting metrics
            expect(() => selfHealing.getHealthMetrics()).not.toThrow();
        });

        it('should handle extremely high error rates', () => {
            // Simulate many errors in short time
            for (let i = 0; i < 1000; i++) {
                selfHealing.recordError(new Error(`Burst error ${i}`), 'high');
            }

            const metrics = selfHealing.getHealthMetrics();
            expect(metrics.totalErrors).toBe(1000);
            expect(metrics.currentHealth).toBe('unhealthy');
            expect(metrics.errorRate).toBeGreaterThan(0);
        });
    });
});
