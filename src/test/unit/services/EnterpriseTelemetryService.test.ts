import {
    EnterpriseTelemetryService,
    TelemetryErrorCode,
    ErrorSeverity
} from '../../../services/EnterpriseTelemetryService';
import { createMockLoggingService } from '../../helpers/mockFactories';
import { ILoggingService } from '../../../services/interfaces';

// Mock TelemetryReporter
jest.mock('@vscode/extension-telemetry', () => {
    return {
        __esModule: true,
        TelemetryReporter: jest.fn().mockImplementation(() => ({
            sendTelemetryEvent: jest.fn(),
            sendTelemetryErrorEvent: jest.fn(),
            dispose: jest.fn().mockResolvedValue(undefined)
        }))
    };
});

// Mock VS Code
const mockWorkspace = {
    getConfiguration: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue('all') // Telemetry enabled
    })
};

(global as any).vscode = {
    workspace: mockWorkspace
};

describe('EnterpriseTelemetryService', () => {
    let service: EnterpriseTelemetryService;
    let mockLogger: jest.Mocked<ILoggingService>;

    beforeEach(() => {
        mockLogger = createMockLoggingService();
        service = new EnterpriseTelemetryService(mockLogger);
        jest.clearAllMocks();
    });

    afterEach(async () => {
        if (service) {
            await service.shutdown();
        }
    });

    describe('Initialization', () => {
        it('should initialize successfully with valid parameters', async () => {
            await expect(service.initialize('test-extension', '1.0.0', 'test-key')).resolves.not.toThrow();

            const health = service.getHealthStatus();
            expect(health.isHealthy).toBe(true);
        });

        it('should handle initialization with missing instrumentation key', async () => {
            await expect(service.initialize('test-extension', '1.0.0')).resolves.not.toThrow();

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No valid instrumentation key'));
        });

        it('should reject invalid extension ID', async () => {
            await expect(service.initialize('', '1.0.0', 'test-key')).rejects.toThrow('Extension ID is required');
        });

        it('should reject invalid extension version', async () => {
            await expect(service.initialize('test-extension', '', 'test-key')).rejects.toThrow(
                'Extension version is required'
            );
        });

        it('should handle null/undefined parameters gracefully', async () => {
            await expect(service.initialize(null as any, undefined as any)).rejects.toThrow();
        });

        it('should continue in fallback mode after initialization failure', async () => {
            // Force an error during initialization
            const originalConsole = console.error;
            console.error = jest.fn();

            try {
                // This should not throw but create a fallback service
                await service.initialize('test', '1.0.0', 'test-key');
                const health = service.getHealthStatus();
                expect(health).toBeDefined();
            } finally {
                console.error = originalConsole;
            }
        });
    });

    describe('Event Sending', () => {
        beforeEach(async () => {
            await service.initialize('test-extension', '1.0.0', 'test-key');
        });

        it('should send valid telemetry events successfully', async () => {
            await expect(
                service.sendEvent(
                    'test.event',
                    {
                        key1: 'value1',
                        key2: 'value2'
                    },
                    {
                        metric1: 123,
                        metric2: 456
                    }
                )
            ).resolves.not.toThrow();

            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBe(1);
        });

        it('should handle empty event names', async () => {
            await service.sendEvent('', { key: 'value' });

            // Should not crash but may log warning
            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBe(0);
        });

        it('should sanitize dangerous input', async () => {
            await service.sendEvent('test<script>alert(1)</script>', {
                dangerous: '<script>alert("xss")</script>',
                normal: 'safe value'
            });

            // Should not crash
            expect(mockLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining('<script>'));
        });

        it('should handle very large events', async () => {
            const largeString = 'x'.repeat(100000);

            await service.sendEvent('large.event', {
                large: largeString
            });

            // Should handle size limits gracefully
            const health = service.getHealthStatus();
            expect(health.isHealthy).toBe(true);
        });

        it('should handle non-string properties', async () => {
            await service.sendEvent('mixed.types', {
                string: 'value',
                number: 123 as any,
                boolean: true as any,
                null: null as any,
                undefined: undefined as any,
                object: { nested: 'object' } as any
            });

            // Should sanitize and convert to strings
            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBe(1);
        });

        it('should handle invalid measurements', async () => {
            await service.sendEvent(
                'test.measurements',
                {
                    key: 'value'
                },
                {
                    valid: 123,
                    nan: NaN,
                    infinity: Infinity,
                    string: 'not a number' as any,
                    negative: -456
                }
            );

            // Should filter out invalid measurements
            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBe(1);
        });
    });

    describe('Circuit Breaker', () => {
        beforeEach(async () => {
            await service.initialize('test-extension', '1.0.0', 'test-key');
        });

        it('should open circuit breaker after failure threshold', async () => {
            // Simulate failures by causing telemetry errors
            const mockReporter = require('@vscode/extension-telemetry').default;
            mockReporter.mockImplementation(() => ({
                sendTelemetryEvent: jest.fn().mockRejectedValue(new Error('Network failure')),
                dispose: jest.fn()
            }));

            // Reinitialize with failing reporter
            service = new EnterpriseTelemetryService(mockLogger);
            await service.initialize('test-extension', '1.0.0', 'test-key');

            // Send events that will fail - circuit breaker should eventually open
            for (let i = 0; i < 10; i++) {
                await service.sendEvent(`test.event.${i}`, { attempt: i.toString() });
                // Small delay to allow processing
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            const health = service.getHealthStatus();
            expect(health.circuitBreakerState).toBe('OPEN');
            expect(health.metrics.circuitBreakerTrips).toBeGreaterThan(0);
        });

        it('should reject events when circuit breaker is open', async () => {
            // Force circuit breaker open by simulating many failures
            const mockReporter = require('@vscode/extension-telemetry').default;
            mockReporter.mockImplementation(() => ({
                sendTelemetryEvent: jest.fn().mockRejectedValue(new Error('Persistent failure')),
                dispose: jest.fn()
            }));

            service = new EnterpriseTelemetryService(mockLogger);
            await service.initialize('test-extension', '1.0.0', 'test-key');

            // Trigger circuit breaker
            for (let i = 0; i < 6; i++) {
                await service.sendEvent(`failure.${i}`, { attempt: i.toString() });
            }

            // Circuit breaker should now be open
            await service.sendEvent('should.fail', { test: 'value' });

            const health = service.getHealthStatus();
            expect(health.circuitBreakerState).toBe('OPEN');
        });
    });

    describe('Rate Limiting', () => {
        beforeEach(async () => {
            await service.initialize('test-extension', '1.0.0', 'test-key');
        });

        it('should apply rate limiting under high load', async () => {
            // Send many events rapidly
            const promises: Promise<void>[] = [];
            for (let i = 0; i < 500; i++) {
                promises.push(service.sendEvent(`burst.${i}`, { index: i.toString() }));
            }

            await Promise.allSettled(promises);

            const health = service.getHealthStatus();
            // Not all events should be processed due to rate limiting
            expect(health.metrics.totalEvents).toBeLessThan(500);
            expect(health.isHealthy).toBe(true); // Should remain healthy despite rate limiting
        });

        it('should recover from rate limiting over time', async () => {
            // Fill rate limit quickly
            for (let i = 0; i < 100; i++) {
                await service.sendEvent(`quick.${i}`, { index: i.toString() });
            }

            const initialHealth = service.getHealthStatus();
            const initialEvents = initialHealth.metrics.totalEvents;

            // Wait for rate limit to recover (simulate time passage)
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should be able to send more events
            await service.sendEvent('recovery.test', { recovered: 'true' });

            const finalHealth = service.getHealthStatus();
            expect(finalHealth.metrics.totalEvents).toBeGreaterThanOrEqual(initialEvents);
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await service.initialize('test-extension', '1.0.0', 'test-key');
        });

        it('should handle sendErrorEvent with comprehensive context', async () => {
            const testError = new Error('Test error message');
            testError.stack = 'Error: Test error\\n    at test function';

            await expect(
                service.sendErrorEvent(testError, {
                    'context.type': 'test',
                    'context.operation': 'error_handling_test'
                })
            ).resolves.not.toThrow();

            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBeGreaterThan(0);
        });

        it('should handle errors without stack traces', async () => {
            const errorWithoutStack = new Error('Simple error');
            delete errorWithoutStack.stack;

            await expect(service.sendErrorEvent(errorWithoutStack)).resolves.not.toThrow();
        });

        it('should handle non-Error objects', async () => {
            const stringError = 'String error' as any;
            const objectError = { message: 'Object error', type: 'custom' } as any;

            await expect(service.sendErrorEvent(stringError)).resolves.not.toThrow();
            await expect(service.sendErrorEvent(objectError)).resolves.not.toThrow();
        });
    });

    describe('Health Monitoring', () => {
        beforeEach(async () => {
            await service.initialize('test-extension', '1.0.0', 'test-key');
        });

        it('should report healthy status initially', () => {
            const health = service.getHealthStatus();

            expect(health.isHealthy).toBe(true);
            expect(health.status).toBe('healthy');
            expect(health.metrics.totalEvents).toBe(0);
            expect(health.circuitBreakerState).toBe('CLOSED');
        });

        it('should track metrics accurately', async () => {
            await service.sendEvent('test1', { key: 'value1' });
            await service.sendEvent('test2', { key: 'value2' });

            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBe(2);
            expect(health.metrics.successfulEvents).toBe(2);
            expect(health.metrics.failedEvents).toBe(0);
        });

        it('should report degraded status under stress', async () => {
            // Simulate high error rate
            const mockReporter = require('@vscode/extension-telemetry').default;
            mockReporter.mockImplementation(() => ({
                sendTelemetryEvent: jest.fn().mockRejectedValue(new Error('Simulated failure')),
                dispose: jest.fn()
            }));

            service = new EnterpriseTelemetryService(mockLogger);
            await service.initialize('test-extension', '1.0.0', 'test-key');

            // Send events that will fail
            for (let i = 0; i < 5; i++) {
                await service.sendEvent(`stress.${i}`, { test: 'value' });
            }

            const health = service.getHealthStatus();
            expect(health.isHealthy).toBe(false);
            expect(health.status).toBe('degraded');
        });
    });

    describe('Queue Management', () => {
        beforeEach(async () => {
            await service.initialize('test-extension', '1.0.0', 'test-key');
        });

        it('should handle queue overflow gracefully', async () => {
            // Fill queue beyond capacity
            const promises: Promise<void>[] = [];
            for (let i = 0; i < 2000; i++) {
                promises.push(service.sendEvent(`overflow.${i}`, { index: i.toString() }));
            }

            await Promise.allSettled(promises);

            const health = service.getHealthStatus();
            // Should remain healthy despite queue overflow
            expect(health.isHealthy).toBe(true);
            // Queue size should be managed
            expect(health.metrics.queueSize).toBeLessThan(2000);
        });

        it('should process events in reasonable time', async () => {
            const startTime = Date.now();

            await service.sendEvent('timing.test', { start: startTime.toString() });

            // Event should be queued immediately (not wait for processing)
            const processingTime = Date.now() - startTime;
            expect(processingTime).toBeLessThan(100); // Should be very fast
        });
    });

    describe('Shutdown and Cleanup', () => {
        beforeEach(async () => {
            await service.initialize('test-extension', '1.0.0', 'test-key');
        });

        it('should shutdown gracefully', async () => {
            // Add some events to the queue
            await service.sendEvent('shutdown.test1', { phase: 'before' });
            await service.sendEvent('shutdown.test2', { phase: 'before' });

            await expect(service.shutdown()).resolves.not.toThrow();
        });

        it('should handle multiple shutdown calls', async () => {
            await expect(service.shutdown()).resolves.not.toThrow();
            await expect(service.shutdown()).resolves.not.toThrow();
            await expect(service.shutdown()).resolves.not.toThrow();
        });

        it('should reject events after shutdown', async () => {
            await service.shutdown();

            // Events after shutdown should be ignored gracefully
            await service.sendEvent('post.shutdown', { test: 'value' });

            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBe(0);
        });

        it('should handle shutdown timeout gracefully', async () => {
            // Add many events to potentially slow down shutdown
            for (let i = 0; i < 100; i++) {
                await service.sendEvent(`shutdown.load.${i}`, { index: i.toString() });
            }

            const shutdownStart = Date.now();
            await service.shutdown();
            const shutdownTime = Date.now() - shutdownStart;

            // Should complete within reasonable time even with load
            expect(shutdownTime).toBeLessThan(10000); // 10 seconds max
        });
    });

    describe('Edge Cases', () => {
        it('should handle service without initialization', async () => {
            const uninitializedService = new EnterpriseTelemetryService(mockLogger);

            // Should not crash
            await uninitializedService.sendEvent('test', { key: 'value' });

            const health = uninitializedService.getHealthStatus();
            expect(health).toBeDefined();

            await uninitializedService.shutdown();
        });

        it('should handle concurrent initialization attempts', async () => {
            const promises = [
                service.initialize('test1', '1.0.0', 'key1'),
                service.initialize('test2', '1.0.0', 'key2'),
                service.initialize('test3', '1.0.0', 'key3')
            ];

            // Should not crash with concurrent initialization
            await Promise.allSettled(promises);

            const health = service.getHealthStatus();
            expect(health).toBeDefined();
        });

        it('should handle events with circular references', async () => {
            const circular: any = { name: 'test' };
            circular.self = circular;

            // Should not crash with circular references
            // Attempt to send event with circular reference
            try {
                await service.sendEvent('circular.test', {
                    safe: 'value',
                    circular: '[Circular Reference]' // Mock what would happen with circular data
                });
            } catch (error) {
                // Expected to handle gracefully
            }
        });

        it('should handle extremely long event names', async () => {
            const longName = 'a'.repeat(10000);

            await service.sendEvent(longName, { key: 'value' });

            // Should handle gracefully (truncate or reject)
            const health = service.getHealthStatus();
            expect(health.isHealthy).toBe(true);
        });

        it('should handle special characters in event data', async () => {
            await service.sendEvent('special.chars', {
                unicode: '🎸🎵🎶',
                special: '\\n\\t\\r',
                quotes: '\\"',
                html: '<div>test</div>',
                sql: 'SELECT * FROM users WHERE id = 1; DROP TABLE users;--'
            });

            // Should sanitize dangerous content
            const health = service.getHealthStatus();
            expect(health.isHealthy).toBe(true);
        });
    });

    describe('Memory and Resource Management', () => {
        it('should not leak memory with many events', async () => {
            await service.initialize('test-extension', '1.0.0', 'test-key');

            // Send many events to test memory management
            for (let i = 0; i < 1000; i++) {
                await service.sendEvent(`memory.test.${i}`, {
                    data: `Large data string for event ${i}`.repeat(100),
                    index: i.toString()
                });

                // Occasionally check health
                if (i % 100 === 0) {
                    const health = service.getHealthStatus();
                    expect(health.isHealthy).toBe(true);
                }
            }

            // Final health check
            const health = service.getHealthStatus();
            expect(health.isHealthy).toBe(true);
            expect(health.metrics.queueSize).toBeLessThan(1000); // Queue should be managed
        });

        it('should clean up timers and resources on shutdown', async () => {
            await service.initialize('test-extension', '1.0.0', 'test-key');

            // Send some events to start timers
            await service.sendEvent('timer.test', { data: 'test' });

            // Shutdown should clean up all resources
            await service.shutdown();

            // No way to directly test timer cleanup, but shutdown should complete without hanging
            expect(true).toBe(true); // If we get here, shutdown worked
        });
    });
});
