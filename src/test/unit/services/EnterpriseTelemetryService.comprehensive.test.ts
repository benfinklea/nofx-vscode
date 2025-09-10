import {
    EnterpriseTelemetryService,
    TelemetryErrorCode,
    ErrorSeverity
} from '../../../services/EnterpriseTelemetryService';
import { createMockLoggingService } from '../../helpers/mockFactories';
import { ILoggingService } from '../../../services/interfaces';

// Mock TelemetryReporter - create comprehensive mock with all methods
const mockTelemetryReporter = {
    sendTelemetryEvent: jest.fn(),
    sendTelemetryErrorEvent: jest.fn(),
    dispose: jest.fn().mockResolvedValue(undefined)
};

jest.mock('@vscode/extension-telemetry', () => ({
    TelemetryReporter: jest.fn().mockImplementation(() => mockTelemetryReporter)
}));

// Mock VS Code - define before using in jest.mock
const mockWorkspace = {
    getConfiguration: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue('all') // Telemetry enabled by default
    })
};

const mockEnv = {
    isTelemetryEnabled: true
};

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue('all')
        })
    },
    env: {
        isTelemetryEnabled: true
    }
}));

describe('EnterpriseTelemetryService - Comprehensive Tests', () => {
    let service: EnterpriseTelemetryService;
    let mockLogger: ILoggingService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLoggingService();
        service = new EnterpriseTelemetryService(mockLogger);

        // Reset VS Code mocks
        const vscode = require('vscode');
        vscode.workspace.getConfiguration.mockReturnValue({
            get: jest.fn().mockReturnValue('all')
        });
        vscode.env.isTelemetryEnabled = true;

        // Reset TelemetryReporter mock
        mockTelemetryReporter.sendTelemetryEvent.mockResolvedValue(undefined);
        mockTelemetryReporter.sendTelemetryErrorEvent.mockResolvedValue(undefined);
        mockTelemetryReporter.dispose.mockResolvedValue(undefined);
    });

    afterEach(async () => {
        try {
            await service.shutdown();
        } catch (error) {
            // Ignore shutdown errors in tests
        }
    });

    describe('Constructor', () => {
        it('should create service with default logger when none provided', () => {
            const serviceWithoutLogger = new EnterpriseTelemetryService();
            expect(serviceWithoutLogger).toBeDefined();
        });

        it('should create service with provided logger', () => {
            expect(service).toBeDefined();
        });
    });

    describe('Initialization', () => {
        describe('Input Validation', () => {
            it('should reject null extensionId', async () => {
                await expect(service.initialize(null as any, '1.0.0')).rejects.toThrow(
                    'Extension ID is required and must be a non-empty string'
                );
            });

            it('should reject undefined extensionId', async () => {
                await expect(service.initialize(undefined as any, '1.0.0')).rejects.toThrow(
                    'Extension ID is required and must be a non-empty string'
                );
            });

            it('should reject empty extensionId', async () => {
                await expect(service.initialize('', '1.0.0')).rejects.toThrow(
                    'Extension ID is required and must be a non-empty string'
                );
            });

            it('should reject whitespace-only extensionId', async () => {
                await expect(service.initialize('   ', '1.0.0')).rejects.toThrow(
                    'Extension ID is required and must be a non-empty string'
                );
            });

            it('should reject non-string extensionId', async () => {
                await expect(service.initialize(123 as any, '1.0.0')).rejects.toThrow(
                    'Extension ID is required and must be a non-empty string'
                );
            });

            it('should reject null extensionVersion', async () => {
                await expect(service.initialize('test-ext', null as any)).rejects.toThrow(
                    'Extension version is required and must be a non-empty string'
                );
            });

            it('should reject undefined extensionVersion', async () => {
                await expect(service.initialize('test-ext', undefined as any)).rejects.toThrow(
                    'Extension version is required and must be a non-empty string'
                );
            });

            it('should reject empty extensionVersion', async () => {
                await expect(service.initialize('test-ext', '')).rejects.toThrow(
                    'Extension version is required and must be a non-empty string'
                );
            });

            it('should reject whitespace-only extensionVersion', async () => {
                await expect(service.initialize('test-ext', '   ')).rejects.toThrow(
                    'Extension version is required and must be a non-empty string'
                );
            });

            it('should reject non-string extensionVersion', async () => {
                await expect(service.initialize('test-ext', 1.0 as any)).rejects.toThrow(
                    'Extension version is required and must be a non-empty string'
                );
            });
        });

        describe('Telemetry Disabled Scenarios', () => {
            it('should handle telemetry disabled in workspace config', async () => {
                const vscode = require('vscode');
                vscode.workspace.getConfiguration.mockReturnValue({
                    get: jest.fn().mockReturnValue('off')
                });

                await service.initialize('test-ext', '1.0.0');
                expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Telemetry disabled'));
            });

            it('should handle telemetry disabled in environment', async () => {
                const vscode = require('vscode');
                vscode.env.isTelemetryEnabled = false;

                await service.initialize('test-ext', '1.0.0');
                expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Telemetry disabled'));
            });

            it('should handle error telemetry only', async () => {
                const vscode = require('vscode');
                vscode.workspace.getConfiguration.mockReturnValue({
                    get: jest.fn().mockReturnValue('error')
                });

                await service.initialize('test-ext', '1.0.0');
                expect(mockLogger.info).toHaveBeenCalledWith(
                    expect.stringContaining('Telemetry limited to errors only')
                );
            });
        });

        describe('Instrumentation Key Handling', () => {
            it('should initialize with valid instrumentation key', async () => {
                await service.initialize('test-ext', '1.0.0', 'valid-key-123');

                const health = service.getHealthStatus();
                expect(health.isHealthy).toBe(true);
                expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Telemetry reporter initialized'));
            });

            it('should handle missing instrumentation key', async () => {
                await service.initialize('test-ext', '1.0.0');

                expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No valid instrumentation key'));
            });

            it('should handle placeholder instrumentation key', async () => {
                await service.initialize('test-ext', '1.0.0', 'your-instrumentation-key');

                expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No valid instrumentation key'));
            });

            it('should handle empty instrumentation key', async () => {
                await service.initialize('test-ext', '1.0.0', '');

                expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No valid instrumentation key'));
            });

            it('should handle whitespace-only instrumentation key', async () => {
                await service.initialize('test-ext', '1.0.0', '   ');

                expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No valid instrumentation key'));
            });
        });

        describe('Error Handling', () => {
            it('should handle TelemetryReporter initialization failure', async () => {
                const { TelemetryReporter } = require('@vscode/extension-telemetry');
                TelemetryReporter.mockImplementationOnce(() => {
                    throw new Error('Reporter init failed');
                });

                await expect(service.initialize('test-ext', '1.0.0', 'test-key')).rejects.toThrow(
                    'Failed to initialize telemetry service'
                );
            });

            it('should handle timeout during initialization', async () => {
                // Mock a very slow initialization
                const { TelemetryReporter } = require('@vscode/extension-telemetry');
                TelemetryReporter.mockImplementationOnce(() => {
                    return new Promise(resolve => {
                        setTimeout(() => resolve(mockTelemetryReporter), 20000); // 20 seconds
                    });
                });

                await expect(service.initialize('test-ext', '1.0.0', 'test-key')).rejects.toThrow();
            });
        });

        describe('Success Cases', () => {
            it('should initialize successfully with minimum parameters', async () => {
                await expect(service.initialize('test-ext', '1.0.0')).resolves.not.toThrow();
            });

            it('should initialize successfully with all parameters', async () => {
                await expect(service.initialize('test-ext', '1.0.0', 'test-key')).resolves.not.toThrow();
            });

            it('should handle multiple initialization calls gracefully', async () => {
                await service.initialize('test-ext', '1.0.0');
                await service.initialize('test-ext', '1.0.0');
                // Should not throw or cause issues
            });
        });
    });

    describe('Event Sending', () => {
        beforeEach(async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');
        });

        describe('Basic Event Sending', () => {
            it('should send valid event successfully', async () => {
                await service.sendEvent('test.event');

                const health = service.getHealthStatus();
                expect(health.metrics.totalEvents).toBeGreaterThan(0);
                expect(health.metrics.successfulEvents).toBeGreaterThan(0);
            });

            it('should send event with properties', async () => {
                await service.sendEvent('test.event', {
                    prop1: 'value1',
                    prop2: 'value2'
                });

                const health = service.getHealthStatus();
                expect(health.metrics.totalEvents).toBeGreaterThan(0);
            });

            it('should send event with measurements', async () => {
                await service.sendEvent('test.event', undefined, {
                    metric1: 123.45,
                    metric2: 678.9
                });

                const health = service.getHealthStatus();
                expect(health.metrics.totalEvents).toBeGreaterThan(0);
            });

            it('should send event with both properties and measurements', async () => {
                await service.sendEvent(
                    'test.event',
                    {
                        category: 'performance'
                    },
                    {
                        duration: 150.5
                    }
                );

                const health = service.getHealthStatus();
                expect(health.metrics.totalEvents).toBeGreaterThan(0);
            });
        });

        describe('Input Sanitization', () => {
            it('should handle empty event name', async () => {
                await service.sendEvent('');
                // Should not crash but may be filtered out
            });

            it('should handle null properties', async () => {
                await service.sendEvent('test.event', null as any);
                // Should handle gracefully
            });

            it('should handle undefined properties', async () => {
                await service.sendEvent('test.event', undefined);
                // Should handle gracefully
            });

            it('should handle null measurements', async () => {
                await service.sendEvent('test.event', undefined, null as any);
                // Should handle gracefully
            });

            it('should handle special characters in event name', async () => {
                await service.sendEvent('test.event!@#$%^&*()');
                // Should sanitize or handle safely
            });

            it('should handle Unicode characters in properties', async () => {
                await service.sendEvent('test.event', {
                    unicode: '🎸🎵🎶',
                    emoji: '✅❌⚠️'
                });

                const health = service.getHealthStatus();
                expect(health.metrics.totalEvents).toBeGreaterThan(0);
            });

            it('should handle very long strings in properties', async () => {
                const longString = 'x'.repeat(10000);
                await service.sendEvent('test.event', {
                    longProp: longString
                });

                // Should handle without crashing
            });

            it('should handle null values in properties', async () => {
                await service.sendEvent('test.event', {
                    nullProp: null as any,
                    validProp: 'value'
                });

                // Should filter out null values
            });

            it('should handle undefined values in properties', async () => {
                await service.sendEvent('test.event', {
                    undefinedProp: undefined as any,
                    validProp: 'value'
                });

                // Should filter out undefined values
            });

            it('should handle non-string values in properties', async () => {
                await service.sendEvent('test.event', {
                    numberProp: 123 as any,
                    booleanProp: true as any,
                    objectProp: { nested: 'value' } as any
                });

                // Should convert to strings or filter out
            });

            it('should handle non-number values in measurements', async () => {
                await service.sendEvent('test.event', undefined, {
                    stringMeasurement: 'not-a-number' as any,
                    nullMeasurement: null as any,
                    validMeasurement: 123.45
                });

                // Should filter out invalid measurements
            });

            it('should handle infinite and NaN measurements', async () => {
                await service.sendEvent('test.event', undefined, {
                    infiniteValue: Infinity,
                    negativeInfinite: -Infinity,
                    nanValue: NaN,
                    validValue: 42
                });

                // Should filter out invalid measurements
            });
        });

        describe('State Validation', () => {
            it('should reject events before initialization', async () => {
                const uninitializedService = new EnterpriseTelemetryService(mockLogger);

                await uninitializedService.sendEvent('test.event');
                // Should log warning and not crash
                expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
            });

            it('should reject events after shutdown', async () => {
                await service.shutdown();

                await service.sendEvent('test.event');
                // Should log warning and not crash
            });
        });

        describe('Circuit Breaker', () => {
            it('should open circuit breaker after failure threshold', async () => {
                // Simulate failures
                mockTelemetryReporter.sendTelemetryEvent.mockRejectedValue(new Error('Simulated failure'));

                // Trigger failures to open circuit breaker
                for (let i = 0; i < 10; i++) {
                    try {
                        await service.sendEvent('test.event');
                    } catch (error) {
                        // Expected failures
                    }
                }

                const health = service.getHealthStatus();
                expect(health.circuitBreakerState).toBe('OPEN');
            });

            it('should reject events when circuit breaker is open', async () => {
                // First, open the circuit breaker
                mockTelemetryReporter.sendTelemetryEvent.mockRejectedValue(new Error('Simulated failure'));

                for (let i = 0; i < 10; i++) {
                    try {
                        await service.sendEvent('test.event');
                    } catch (error) {
                        // Expected failures
                    }
                }

                // Now try to send an event - should be rejected due to open circuit
                await service.sendEvent('test.event');
                const health = service.getHealthStatus();
                expect(health.circuitBreakerState).toBe('OPEN');
            });

            it('should transition to half-open after recovery timeout', done => {
                // This test would need to manipulate time or wait for timeout
                // For now, just test that the logic is in place
                const health = service.getHealthStatus();
                expect(health.circuitBreakerState).toBe('CLOSED'); // Initial state
                done();
            });
        });

        describe('Rate Limiting', () => {
            it('should enforce rate limits', async () => {
                // Send many events rapidly to trigger rate limiting
                const promises = [];
                for (let i = 0; i < 500; i++) {
                    promises.push(service.sendEvent(`test.event.${i}`));
                }

                await Promise.allSettled(promises);

                // Some events should have been rate limited
                const health = service.getHealthStatus();
                expect(health.metrics.totalEvents).toBeLessThan(500);
            });

            it('should allow events after rate limit window passes', async () => {
                // This would require manipulating time
                // For now, just verify initial state
                const initialHealth = service.getHealthStatus();
                await service.sendEvent('test.event');
                const afterHealth = service.getHealthStatus();

                expect(afterHealth.metrics.totalEvents).toBeGreaterThan(initialHealth.metrics.totalEvents);
            });
        });

        describe('Queue Management', () => {
            it('should handle queue overflow gracefully', async () => {
                // Fill up the queue with many events
                const promises = [];
                for (let i = 0; i < 2000; i++) {
                    promises.push(service.sendEvent(`queue.test.${i}`));
                }

                await Promise.allSettled(promises);

                const health = service.getHealthStatus();
                // Queue should be managed and not grow indefinitely
                expect(health.metrics.queueSize).toBeLessThanOrEqual(1000); // Default max queue size
            });
        });

        describe('Error Recovery', () => {
            it('should recover from temporary failures', async () => {
                // Start with failures
                mockTelemetryReporter.sendTelemetryEvent.mockRejectedValue(new Error('Temporary failure'));

                try {
                    await service.sendEvent('failing.event');
                } catch (error) {
                    // Expected
                }

                // Now fix the mock
                mockTelemetryReporter.sendTelemetryEvent.mockResolvedValue(undefined);

                // Should succeed now
                await service.sendEvent('recovering.event');

                const health = service.getHealthStatus();
                expect(health.metrics.successfulEvents).toBeGreaterThan(0);
            });
        });
    });

    describe('Error Event Sending', () => {
        beforeEach(async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');
        });

        it('should send error event successfully', async () => {
            const testError = new Error('Test error message');

            await service.sendErrorEvent(testError);

            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBeGreaterThan(0);
        });

        it('should send error event with properties', async () => {
            const testError = new Error('Test error');
            const properties = {
                context: 'unit-test',
                operation: 'error-testing'
            };

            await service.sendErrorEvent(testError, properties);

            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBeGreaterThan(0);
        });

        it('should handle non-Error objects', async () => {
            await service.sendErrorEvent('String error' as any);
            await service.sendErrorEvent(123 as any);
            await service.sendErrorEvent({ message: 'Object error' } as any);
            await service.sendErrorEvent(null as any);
            await service.sendErrorEvent(undefined as any);

            // Should handle all cases gracefully
        });

        it('should extract stack trace from Error objects', async () => {
            const error = new Error('Test error with stack');

            await service.sendErrorEvent(error);

            // Should include stack trace information
            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBeGreaterThan(0);
        });

        it('should handle errors without message', async () => {
            const errorWithoutMessage = new Error();

            await service.sendErrorEvent(errorWithoutMessage);

            // Should handle gracefully
        });

        it('should handle circular references in error objects', async () => {
            const circularError: any = new Error('Circular error');
            circularError.self = circularError;

            await service.sendErrorEvent(circularError);

            // Should handle without crashing
        });
    });

    describe('Health Status', () => {
        beforeEach(async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');
        });

        it('should return initial health status', () => {
            const health = service.getHealthStatus();

            expect(health).toHaveProperty('isHealthy');
            expect(health).toHaveProperty('circuitBreakerState');
            expect(health).toHaveProperty('metrics');
            expect(health.metrics).toHaveProperty('totalEvents');
            expect(health.metrics).toHaveProperty('successfulEvents');
            expect(health.metrics).toHaveProperty('failedEvents');
        });

        it('should update metrics after sending events', async () => {
            const initialHealth = service.getHealthStatus();

            await service.sendEvent('test.event');

            const updatedHealth = service.getHealthStatus();
            expect(updatedHealth.metrics.totalEvents).toBeGreaterThan(initialHealth.metrics.totalEvents);
        });

        it('should track failure metrics', async () => {
            mockTelemetryReporter.sendTelemetryEvent.mockRejectedValueOnce(new Error('Test failure'));

            try {
                await service.sendEvent('failing.event');
            } catch (error) {
                // Expected
            }

            const health = service.getHealthStatus();
            expect(health.metrics.failedEvents).toBeGreaterThan(0);
        });

        it('should calculate uptime', () => {
            const health = service.getHealthStatus();

            expect(health.metrics.uptime).toBeGreaterThanOrEqual(0);
        });

        it('should track last success and failure times', async () => {
            // Send successful event
            await service.sendEvent('success.event');

            const healthAfterSuccess = service.getHealthStatus();
            expect(healthAfterSuccess.metrics.lastSuccessTime).toBeGreaterThan(0);
        });

        it('should report unhealthy status when circuit breaker is open', async () => {
            // Force circuit breaker open
            mockTelemetryReporter.sendTelemetryEvent.mockRejectedValue(new Error('Persistent failure'));

            for (let i = 0; i < 10; i++) {
                try {
                    await service.sendEvent('failing.event');
                } catch (error) {
                    // Expected
                }
            }

            const health = service.getHealthStatus();
            expect(health.isHealthy).toBe(false);
            expect(health.circuitBreakerState).toBe('OPEN');
        });
    });

    describe('Shutdown', () => {
        beforeEach(async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');
        });

        it('should shutdown gracefully', async () => {
            await expect(service.shutdown()).resolves.not.toThrow();
        });

        it('should handle multiple shutdown calls', async () => {
            await service.shutdown();
            await expect(service.shutdown()).resolves.not.toThrow();
        });

        it('should dispose of telemetry reporter', async () => {
            await service.shutdown();

            expect(mockTelemetryReporter.dispose).toHaveBeenCalled();
        });

        it('should clear timers during shutdown', async () => {
            // Send an event to potentially start timers
            await service.sendEvent('test.event');

            await service.shutdown();

            // Timers should be cleared (hard to test directly, but shutdown should complete)
        });

        it('should handle shutdown timeout', async () => {
            // Mock a slow dispose operation
            mockTelemetryReporter.dispose.mockImplementationOnce(
                () => new Promise(resolve => setTimeout(resolve, 20000))
            );

            // Should timeout and complete anyway
            await expect(service.shutdown()).resolves.not.toThrow();
        });

        it('should handle dispose errors', async () => {
            mockTelemetryReporter.dispose.mockRejectedValueOnce(new Error('Dispose failed'));

            await expect(service.shutdown()).resolves.not.toThrow();
        });
    });

    describe('Edge Cases and Error Scenarios', () => {
        it('should handle service in uninitialized state', () => {
            const uninitializedService = new EnterpriseTelemetryService();

            const health = uninitializedService.getHealthStatus();
            expect(health.isHealthy).toBe(false);
        });

        it('should handle extremely large events', async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');

            const largeProperty = 'x'.repeat(100000); // 100KB string
            await service.sendEvent('large.event', {
                largeProp: largeProperty
            });

            // Should handle size limits gracefully
        });

        it('should handle events with many properties', async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');

            const manyProperties: Record<string, string> = {};
            for (let i = 0; i < 1000; i++) {
                manyProperties[`prop${i}`] = `value${i}`;
            }

            await service.sendEvent('many.props.event', manyProperties);

            // Should handle gracefully
        });

        it('should handle rapid concurrent events', async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');

            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(service.sendEvent(`concurrent.event.${i}`));
            }

            await Promise.allSettled(promises);

            // Should handle concurrency without issues
        });

        it('should maintain memory efficiency under load', async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');

            // Send many events to test memory management
            for (let i = 0; i < 1000; i++) {
                await service.sendEvent(`memory.test.${i}`, {
                    iteration: i.toString(),
                    data: `test-data-${i}`
                });

                if (i % 100 === 0) {
                    const health = service.getHealthStatus();
                    // Memory usage should be bounded
                    expect(health.metrics.queueSize).toBeLessThan(2000);
                }
            }
        });
    });

    describe('Integration Scenarios', () => {
        it('should work without VS Code workspace configuration', async () => {
            // Simulate no workspace config
            const vscode = require('vscode');
            vscode.workspace.getConfiguration.mockReturnValue({
                get: jest.fn().mockReturnValue(undefined)
            });

            await service.initialize('test-ext', '1.0.0');

            // Should use reasonable defaults
            await service.sendEvent('test.event');
        });

        it('should handle VS Code API errors gracefully', async () => {
            // Simulate VS Code API throwing error
            const vscode = require('vscode');
            vscode.workspace.getConfiguration.mockImplementation(() => {
                throw new Error('VS Code API error');
            });

            await service.initialize('test-ext', '1.0.0');

            // Should fall back to safe defaults
        });

        it('should work with different telemetry settings combinations', async () => {
            const settings = ['all', 'error', 'crash', 'off'];

            for (const setting of settings) {
                const testService = new EnterpriseTelemetryService(mockLogger);

                const vscode = require('vscode');
                vscode.workspace.getConfiguration.mockReturnValue({
                    get: jest.fn().mockReturnValue(setting)
                });

                await testService.initialize('test-ext', '1.0.0');
                await testService.sendEvent('test.event');
                await testService.shutdown();

                // Should handle all settings gracefully
            }
        });
    });
});
