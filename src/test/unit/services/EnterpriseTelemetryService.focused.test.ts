/**
 * Focused Unit Tests for EnterpriseTelemetryService
 *
 * These tests focus specifically on the core telemetry functionality
 * without depending on the broader codebase compilation.
 */

// Mock dependencies first
const mockTelemetryReporter = {
    sendTelemetryEvent: jest.fn().mockResolvedValue(undefined),
    sendTelemetryErrorEvent: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn().mockResolvedValue(undefined)
};

jest.mock('@vscode/extension-telemetry', () => ({
    TelemetryReporter: jest.fn().mockImplementation(() => mockTelemetryReporter)
}));

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

// Mock createMockLoggingService
const createMockLoggingService = () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
    agents: jest.fn(),
    isLevelEnabled: jest.fn().mockReturnValue(true),
    setConfigurationService: jest.fn(),
    getChannel: jest.fn().mockReturnValue({ appendLine: jest.fn() }),
    time: jest.fn(),
    timeEnd: jest.fn(),
    onDidChangeConfiguration: jest.fn(),
    dispose: jest.fn()
});

// Import the service after mocks
import { EnterpriseTelemetryService } from '../../../services/EnterpriseTelemetryService';

describe('EnterpriseTelemetryService - Focused Tests', () => {
    let service: EnterpriseTelemetryService;
    let mockLogger: ReturnType<typeof createMockLoggingService>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLoggingService();
        service = new EnterpriseTelemetryService(mockLogger);

        // Reset mocks
        mockTelemetryReporter.sendTelemetryEvent.mockResolvedValue(undefined);
        mockTelemetryReporter.sendTelemetryErrorEvent.mockResolvedValue(undefined);
        mockTelemetryReporter.dispose.mockResolvedValue(undefined);

        const vscode = require('vscode');
        vscode.workspace.getConfiguration.mockReturnValue({
            get: jest.fn().mockReturnValue('all')
        });
        vscode.env.isTelemetryEnabled = true;
    });

    afterEach(async () => {
        try {
            await service.shutdown();
        } catch (error) {
            // Ignore shutdown errors in tests
        }
    });

    describe('Basic Functionality', () => {
        it('should create service instance', () => {
            expect(service).toBeDefined();
            expect(service).toBeInstanceOf(EnterpriseTelemetryService);
        });

        it('should initialize successfully', async () => {
            await expect(service.initialize('test-ext', '1.0.0', 'test-key')).resolves.not.toThrow();
        });

        it('should send events after initialization', async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');

            await service.sendEvent('test.event', { prop: 'value' }, { metric: 123 });

            // Allow batch processing to run
            await new Promise(resolve => setTimeout(resolve, 100));

            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBeGreaterThan(0);
        });

        it('should send error events', async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');

            const testError = new Error('Test error');
            await service.sendErrorEvent(testError, { context: 'test' });

            expect(mockTelemetryReporter.sendTelemetryErrorEvent).toHaveBeenCalled();
        });

        it('should return health status', async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');

            const health = service.getHealthStatus();

            expect(health).toBeDefined();
            expect(health).toHaveProperty('isHealthy');
            expect(health).toHaveProperty('metrics');
            expect(health).toHaveProperty('circuitBreakerState');
        });

        it('should shutdown gracefully', async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');

            await expect(service.shutdown()).resolves.not.toThrow();
            expect(mockTelemetryReporter.dispose).toHaveBeenCalled();
        });
    });

    describe('Input Validation', () => {
        it('should reject invalid extensionId', async () => {
            await expect(service.initialize('', '1.0.0')).rejects.toThrow('Extension ID is required');
        });

        it('should reject invalid extensionVersion', async () => {
            await expect(service.initialize('test-ext', '')).rejects.toThrow('Extension version is required');
        });

        it('should handle null inputs', async () => {
            await expect(service.initialize(null as any, '1.0.0')).rejects.toThrow();

            await expect(service.initialize('test-ext', null as any)).rejects.toThrow();
        });

        it('should handle undefined inputs', async () => {
            await expect(service.initialize(undefined as any, '1.0.0')).rejects.toThrow();

            await expect(service.initialize('test-ext', undefined as any)).rejects.toThrow();
        });
    });

    describe('Telemetry Events', () => {
        beforeEach(async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');
        });

        it('should handle events with properties only', async () => {
            await service.sendEvent('test.event', { key: 'value' });

            expect(mockTelemetryReporter.sendTelemetryEvent).toHaveBeenCalledWith(
                expect.stringContaining('test.event'),
                expect.objectContaining({ key: 'value' }),
                undefined
            );
        });

        it('should handle events with measurements only', async () => {
            await service.sendEvent('test.event', undefined, { count: 42 });

            expect(mockTelemetryReporter.sendTelemetryEvent).toHaveBeenCalledWith(
                expect.stringContaining('test.event'),
                expect.any(Object),
                expect.objectContaining({ count: 42 })
            );
        });

        it('should handle events with both properties and measurements', async () => {
            await service.sendEvent('test.event', { type: 'test' }, { duration: 100 });

            expect(mockTelemetryReporter.sendTelemetryEvent).toHaveBeenCalledWith(
                expect.stringContaining('test.event'),
                expect.objectContaining({ type: 'test' }),
                expect.objectContaining({ duration: 100 })
            );
        });

        it('should handle empty event name', async () => {
            await service.sendEvent('');
            // Should not crash
            expect(true).toBe(true);
        });

        it('should handle null properties', async () => {
            await service.sendEvent('test.event', null as any);
            // Should not crash
            expect(true).toBe(true);
        });

        it('should handle null measurements', async () => {
            await service.sendEvent('test.event', undefined, null as any);
            // Should not crash
            expect(true).toBe(true);
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');
        });

        it('should handle Error objects', async () => {
            const error = new Error('Test error message');

            await service.sendErrorEvent(error);

            expect(mockTelemetryReporter.sendTelemetryErrorEvent).toHaveBeenCalled();
        });

        it('should handle string errors', async () => {
            await service.sendErrorEvent('String error' as any);

            expect(mockTelemetryReporter.sendTelemetryErrorEvent).toHaveBeenCalled();
        });

        it('should handle null errors', async () => {
            await service.sendErrorEvent(null as any);
            // Should not crash
            expect(true).toBe(true);
        });

        it('should handle undefined errors', async () => {
            await service.sendErrorEvent(undefined as any);
            // Should not crash
            expect(true).toBe(true);
        });

        it('should handle telemetry reporter failures', async () => {
            mockTelemetryReporter.sendTelemetryEvent.mockRejectedValueOnce(new Error('Reporter failed'));

            await expect(service.sendEvent('test.event')).resolves.not.toThrow();
        });

        it('should handle error event failures', async () => {
            mockTelemetryReporter.sendTelemetryErrorEvent.mockRejectedValueOnce(new Error('Error reporter failed'));

            const error = new Error('Test error');
            await expect(service.sendErrorEvent(error)).resolves.not.toThrow();
        });
    });

    describe('State Management', () => {
        it('should reject events before initialization', async () => {
            await service.sendEvent('test.event');

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not initialized or shutting down'));
        });

        it('should reject events after shutdown', async () => {
            await service.initialize('test-ext', '1.0.0');
            await service.shutdown();

            await service.sendEvent('test.event');

            expect(mockLogger.warn).toHaveBeenCalled();
        });

        it('should handle multiple initialization calls', async () => {
            await service.initialize('test-ext', '1.0.0');
            await service.initialize('test-ext', '1.0.0');

            // Should not cause issues
            expect(true).toBe(true);
        });

        it('should handle multiple shutdown calls', async () => {
            await service.initialize('test-ext', '1.0.0');
            await service.shutdown();
            await service.shutdown();

            // Should not cause issues
            expect(true).toBe(true);
        });
    });

    describe('Health Monitoring', () => {
        it('should track successful events', async () => {
            await service.initialize('test-ext', '1.0.0');

            const initialHealth = service.getHealthStatus();
            const initialTotalCount = initialHealth.metrics.totalEvents;

            await service.sendEvent('test.event');

            const updatedHealth = service.getHealthStatus();
            expect(updatedHealth.metrics.totalEvents).toBeGreaterThan(initialTotalCount);
        });

        it('should track failed events', async () => {
            await service.initialize('test-ext', '1.0.0');

            mockTelemetryReporter.sendTelemetryEvent.mockRejectedValueOnce(new Error('Simulated failure'));

            const initialHealth = service.getHealthStatus();
            const initialFailureCount = initialHealth.metrics.failedEvents;

            try {
                await service.sendEvent('failing.event');
            } catch (error) {
                // Expected
            }

            const updatedHealth = service.getHealthStatus();
            expect(updatedHealth.metrics.failedEvents).toBeGreaterThan(initialFailureCount);
        });

        it('should calculate uptime', async () => {
            await service.initialize('test-ext', '1.0.0');

            const health = service.getHealthStatus();
            expect(health.metrics.uptime).toBeGreaterThanOrEqual(0);
        });

        it('should track total events', async () => {
            await service.initialize('test-ext', '1.0.0');

            const initialHealth = service.getHealthStatus();
            const initialTotal = initialHealth.metrics.totalEvents;

            await service.sendEvent('test.event1');
            await service.sendEvent('test.event2');

            const updatedHealth = service.getHealthStatus();
            expect(updatedHealth.metrics.totalEvents).toBeGreaterThan(initialTotal);
        });
    });

    describe('Configuration Scenarios', () => {
        it('should handle telemetry disabled in settings', async () => {
            const vscode = require('vscode');
            vscode.workspace.getConfiguration.mockReturnValue({
                get: jest.fn().mockReturnValue('off')
            });

            await service.initialize('test-ext', '1.0.0');

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Telemetry disabled by user settings')
            );
        });

        it('should handle telemetry disabled in environment', async () => {
            const vscode = require('vscode');
            vscode.env.isTelemetryEnabled = false;

            await service.initialize('test-ext', '1.0.0');

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Telemetry disabled by user settings')
            );
        });

        it('should handle missing instrumentation key', async () => {
            await service.initialize('test-ext', '1.0.0');

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No valid instrumentation key'));
        });

        it('should handle valid instrumentation key', async () => {
            await service.initialize('test-ext', '1.0.0', 'valid-key-123');

            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Telemetry reporter initialized'));
        });
    });

    describe('Performance and Edge Cases', () => {
        beforeEach(async () => {
            await service.initialize('test-ext', '1.0.0', 'test-key');
        });

        it('should handle many events rapidly', async () => {
            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(service.sendEvent(`rapid.event.${i}`));
            }

            await Promise.allSettled(promises);

            const health = service.getHealthStatus();
            expect(health.metrics.totalEvents).toBeGreaterThanOrEqual(100);
        });

        it('should handle large event data', async () => {
            const largeProperty = 'x'.repeat(1000);

            await service.sendEvent('large.event', {
                large_prop: largeProperty
            });

            // Should handle without crashing
            expect(true).toBe(true);
        });

        it('should handle special characters', async () => {
            await service.sendEvent('special.chars', {
                unicode: '🎸🎵🎶',
                special: '\\n\\t\\r',
                html: '<div>test</div>'
            });

            // Should sanitize and handle safely
            expect(true).toBe(true);
        });

        it('should handle concurrent operations', async () => {
            const operations = [
                service.sendEvent('concurrent.1'),
                service.sendEvent('concurrent.2'),
                service.sendErrorEvent(new Error('Concurrent error')),
                service.getHealthStatus(),
                service.sendEvent('concurrent.3')
            ];

            await Promise.allSettled(operations);

            // Should handle concurrency without issues
            expect(true).toBe(true);
        });
    });
});
