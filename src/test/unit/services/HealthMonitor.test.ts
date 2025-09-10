/**
 * Comprehensive unit tests for HealthMonitor
 * Tests health checks, shutdown handling, and system monitoring
 */

import {
    HealthMonitor,
    HealthCheck,
    ShutdownHandler,
    HealthCheckResult,
    SystemHealth
} from '../../../services/HealthMonitor';
import { ILoggingService } from '../../../services/interfaces';

// Mock logger
const mockLogger: jest.Mocked<ILoggingService> = {
    trace: jest.fn(),
    debug: jest.fn(),
    agents: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    isLevelEnabled: jest.fn().mockReturnValue(true),
    setConfigurationService: jest.fn(),
    getChannel: jest.fn(),
    time: jest.fn(),
    timeEnd: jest.fn(),
    onDidChangeConfiguration: jest.fn(),
    dispose: jest.fn()
};

// Mock EventBus
const mockEventBus = {
    subscribe: jest.fn(),
    publish: jest.fn(),
    getRegisteredEvents: jest.fn().mockReturnValue(['event1', 'event2'])
};

describe('HealthMonitor', () => {
    let healthMonitor: HealthMonitor;
    let originalProcessOn: typeof process.on;
    let originalSetInterval: typeof setInterval;
    let originalClearInterval: typeof clearInterval;
    let intervalCallbacks: Map<any, () => void>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock intervals
        intervalCallbacks = new Map();
        originalSetInterval = setInterval;
        originalClearInterval = clearInterval;

        global.setInterval = jest.fn((callback, delay) => {
            const id = Math.random();
            intervalCallbacks.set(id, callback as () => void);
            return id as any;
        });

        global.clearInterval = jest.fn(id => {
            intervalCallbacks.delete(id);
        });

        // Mock process.on
        originalProcessOn = process.on;
        process.on = jest.fn().mockReturnValue(process);

        // Mock process memory and handles
        const mockMemoryUsage = {
            heapUsed: 50 * 1024 * 1024, // 50MB
            heapTotal: 100 * 1024 * 1024, // 100MB
            rss: 80 * 1024 * 1024,
            external: 5 * 1024 * 1024,
            arrayBuffers: 2 * 1024 * 1024
        };
        jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage);

        // Mock disposable
        mockEventBus.subscribe.mockReturnValue({
            dispose: jest.fn()
        });
    });

    afterEach(() => {
        global.setInterval = originalSetInterval;
        global.clearInterval = originalClearInterval;
        process.on = originalProcessOn;

        if (healthMonitor) {
            healthMonitor.dispose();
        }
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with default health checks', () => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);

            expect(mockLogger.info).toHaveBeenCalledWith('HealthMonitor initialized with comprehensive health checks');
            expect(setInterval).toHaveBeenCalledTimes(3); // memory, eventbus, resources
        });

        it('should initialize without logger or eventBus', () => {
            healthMonitor = new HealthMonitor();

            expect(setInterval).toHaveBeenCalledTimes(3);
        });

        it('should setup signal handlers', () => {
            healthMonitor = new HealthMonitor(mockLogger);

            expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
            expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
            expect(process.on).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));
            expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
        });
    });

    describe('Health Check Management', () => {
        beforeEach(() => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);
        });

        it('should add custom health check', () => {
            const customCheck: HealthCheck = {
                name: 'custom-check',
                description: 'Custom test check',
                execute: jest.fn().mockResolvedValue({
                    name: 'custom-check',
                    status: 'healthy' as const,
                    responseTime: 10,
                    timestamp: new Date()
                }),
                interval: 5000,
                timeout: 2000,
                critical: true,
                enabled: true
            };

            healthMonitor.addHealthCheck(customCheck);

            expect(mockLogger.info).toHaveBeenCalledWith("Health check 'custom-check' added", {
                interval: 5000,
                critical: true
            });
            expect(setInterval).toHaveBeenCalledTimes(4); // 3 default + 1 custom
        });

        it('should not start disabled health check', () => {
            const disabledCheck: HealthCheck = {
                name: 'disabled-check',
                description: 'Disabled test check',
                execute: jest.fn(),
                interval: 5000,
                timeout: 2000,
                critical: false,
                enabled: false
            };

            const initialIntervals = (setInterval as jest.Mock).mock.calls.length;
            healthMonitor.addHealthCheck(disabledCheck);

            expect(setInterval).toHaveBeenCalledTimes(initialIntervals); // No new interval
        });
    });

    describe('Shutdown Handler Management', () => {
        beforeEach(() => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);
        });

        it('should add shutdown handler', () => {
            const handler: ShutdownHandler = {
                name: 'test-handler',
                priority: 5,
                timeout: 3000,
                execute: jest.fn().mockResolvedValue(undefined)
            };

            healthMonitor.addShutdownHandler(handler);

            expect(mockLogger.info).toHaveBeenCalledWith("Shutdown handler 'test-handler' added with priority 5");
        });
    });

    describe('Memory Health Check', () => {
        beforeEach(() => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);
        });

        it('should report healthy memory usage', async () => {
            // Mock 50% usage (50MB used / 100MB total)
            const mockMemoryUsage = {
                heapUsed: 50 * 1024 * 1024,
                heapTotal: 100 * 1024 * 1024,
                rss: 80 * 1024 * 1024,
                external: 5 * 1024 * 1024,
                arrayBuffers: 2 * 1024 * 1024
            };
            jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage);

            const results = await healthMonitor.performHealthCheck('memory');
            const memoryResult = results.find(r => r.name === 'memory');

            expect(memoryResult?.status).toBe('healthy');
            expect(memoryResult?.details?.heapUsagePercent).toBe(50);
        });

        it('should report degraded memory usage', async () => {
            // Mock 80% usage
            const mockMemoryUsage = {
                heapUsed: 80 * 1024 * 1024,
                heapTotal: 100 * 1024 * 1024,
                rss: 120 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            };
            jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage);

            const results = await healthMonitor.performHealthCheck('memory');
            const memoryResult = results.find(r => r.name === 'memory');

            expect(memoryResult?.status).toBe('degraded');
            expect(memoryResult?.details?.heapUsagePercent).toBe(80);
        });

        it('should report unhealthy memory usage', async () => {
            // Mock 95% usage
            const mockMemoryUsage = {
                heapUsed: 95 * 1024 * 1024,
                heapTotal: 100 * 1024 * 1024,
                rss: 150 * 1024 * 1024,
                external: 15 * 1024 * 1024,
                arrayBuffers: 10 * 1024 * 1024
            };
            jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage);

            const results = await healthMonitor.performHealthCheck('memory');
            const memoryResult = results.find(r => r.name === 'memory');

            expect(memoryResult?.status).toBe('unhealthy');
            expect(memoryResult?.details?.heapUsagePercent).toBe(95);
        });

        it('should handle memory check errors', async () => {
            jest.spyOn(process, 'memoryUsage').mockImplementation(() => {
                throw new Error('Memory check failed');
            });

            const results = await healthMonitor.performHealthCheck('memory');
            const memoryResult = results.find(r => r.name === 'memory');

            expect(memoryResult?.status).toBe('unhealthy');
            expect(memoryResult?.error).toBe('Memory check failed');
        });
    });

    describe('EventBus Health Check', () => {
        beforeEach(() => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);
        });

        it('should report healthy EventBus', async () => {
            mockEventBus.subscribe.mockReturnValue({
                dispose: jest.fn()
            });

            const results = await healthMonitor.performHealthCheck('eventbus');
            const eventBusResult = results.find(r => r.name === 'eventbus');

            expect(eventBusResult?.status).toBe('healthy');
            expect(eventBusResult?.details?.callbackExecuted).toBe(true);
        });

        it('should report degraded when EventBus not available', async () => {
            healthMonitor = new HealthMonitor(mockLogger); // No eventBus

            const results = await healthMonitor.performHealthCheck('eventbus');
            const eventBusResult = results.find(r => r.name === 'eventbus');

            expect(eventBusResult?.status).toBe('degraded');
            expect(eventBusResult?.details?.message).toBe('EventBus not available for health check');
        });

        it('should handle EventBus errors', async () => {
            mockEventBus.subscribe.mockImplementation(() => {
                throw new Error('EventBus error');
            });

            const results = await healthMonitor.performHealthCheck('eventbus');
            const eventBusResult = results.find(r => r.name === 'eventbus');

            expect(eventBusResult?.status).toBe('unhealthy');
            expect(eventBusResult?.error).toBe('EventBus error');
        });
    });

    describe('Resource Health Check', () => {
        beforeEach(() => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);
        });

        it('should report healthy resource usage', async () => {
            // Mock low resource usage
            (process as any)._getActiveHandles = jest.fn().mockReturnValue(new Array(50));
            (process as any)._getActiveRequests = jest.fn().mockReturnValue(new Array(25));

            const results = await healthMonitor.performHealthCheck('resources');
            const resourceResult = results.find(r => r.name === 'resources');

            expect(resourceResult?.status).toBe('healthy');
            expect(resourceResult?.details?.totalActive).toBe(75);
        });

        it('should report degraded resource usage', async () => {
            // Mock medium resource usage
            (process as any)._getActiveHandles = jest.fn().mockReturnValue(new Array(400));
            (process as any)._getActiveRequests = jest.fn().mockReturnValue(new Array(200));

            const results = await healthMonitor.performHealthCheck('resources');
            const resourceResult = results.find(r => r.name === 'resources');

            expect(resourceResult?.status).toBe('degraded');
            expect(resourceResult?.details?.totalActive).toBe(600);
        });

        it('should report unhealthy resource usage', async () => {
            // Mock high resource usage
            (process as any)._getActiveHandles = jest.fn().mockReturnValue(new Array(800));
            (process as any)._getActiveRequests = jest.fn().mockReturnValue(new Array(300));

            const results = await healthMonitor.performHealthCheck('resources');
            const resourceResult = results.find(r => r.name === 'resources');

            expect(resourceResult?.status).toBe('unhealthy');
            expect(resourceResult?.details?.totalActive).toBe(1100);
        });

        it('should handle resource check errors gracefully', async () => {
            // Mock when _getActiveHandles is not available
            delete (process as any)._getActiveHandles;
            delete (process as any)._getActiveRequests;

            const results = await healthMonitor.performHealthCheck('resources');
            const resourceResult = results.find(r => r.name === 'resources');

            expect(resourceResult?.status).toBe('healthy');
            expect(resourceResult?.details?.activeTimers).toBe(0);
        });
    });

    describe('System Health Reporting', () => {
        beforeEach(() => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);
        });

        it('should report overall healthy system', async () => {
            // Simulate healthy checks
            const healthyResult: HealthCheckResult = {
                name: 'test-check',
                status: 'healthy',
                responseTime: 10,
                timestamp: new Date()
            };

            const customCheck: HealthCheck = {
                name: 'test-check',
                description: 'Test check',
                execute: jest.fn().mockResolvedValue(healthyResult),
                interval: 5000,
                timeout: 2000,
                critical: false,
                enabled: true
            };

            healthMonitor.addHealthCheck(customCheck);
            await healthMonitor.performHealthCheck('test-check');

            const systemHealth = await healthMonitor.getSystemHealth();

            expect(systemHealth.overall).toBe('healthy');
            expect(systemHealth.checks.length).toBeGreaterThan(0);
            expect(systemHealth.metadata.totalChecks).toBeGreaterThan(0);
        });

        it('should report degraded system when checks are degraded', async () => {
            const degradedResult: HealthCheckResult = {
                name: 'degraded-check',
                status: 'degraded',
                responseTime: 50,
                timestamp: new Date()
            };

            const degradedCheck: HealthCheck = {
                name: 'degraded-check',
                description: 'Degraded check',
                execute: jest.fn().mockResolvedValue(degradedResult),
                interval: 5000,
                timeout: 2000,
                critical: false,
                enabled: true
            };

            healthMonitor.addHealthCheck(degradedCheck);
            await healthMonitor.performHealthCheck('degraded-check');

            const systemHealth = await healthMonitor.getSystemHealth();

            expect(systemHealth.overall).toBe('degraded');
        });

        it('should report unhealthy system when checks are unhealthy', async () => {
            const unhealthyResult: HealthCheckResult = {
                name: 'unhealthy-check',
                status: 'unhealthy',
                responseTime: 100,
                error: 'Check failed',
                timestamp: new Date()
            };

            const unhealthyCheck: HealthCheck = {
                name: 'unhealthy-check',
                description: 'Unhealthy check',
                execute: jest.fn().mockResolvedValue(unhealthyResult),
                interval: 5000,
                timeout: 2000,
                critical: true,
                enabled: true
            };

            healthMonitor.addHealthCheck(unhealthyCheck);
            await healthMonitor.performHealthCheck('unhealthy-check');

            const systemHealth = await healthMonitor.getSystemHealth();

            expect(systemHealth.overall).toBe('unhealthy');
        });

        it('should report shutting_down during shutdown', async () => {
            await healthMonitor.shutdown('Test shutdown');

            const systemHealth = await healthMonitor.getSystemHealth();

            expect(systemHealth.overall).toBe('shutting_down');
        });

        it('should calculate metrics correctly', async () => {
            const results = await healthMonitor.performHealthCheck();

            const systemHealth = await healthMonitor.getSystemHealth();

            expect(systemHealth.metadata.avgResponseTime).toBeGreaterThanOrEqual(0);
            expect(systemHealth.uptime).toBeGreaterThanOrEqual(0);
            expect(systemHealth.lastCheck).toBeInstanceOf(Date);
        });
    });

    describe('Graceful Shutdown', () => {
        beforeEach(() => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);
        });

        it('should execute shutdown gracefully', async () => {
            const handler1 = jest.fn().mockResolvedValue(undefined);
            const handler2 = jest.fn().mockResolvedValue(undefined);

            healthMonitor.addShutdownHandler({
                name: 'handler1',
                priority: 1,
                timeout: 1000,
                execute: handler1
            });

            healthMonitor.addShutdownHandler({
                name: 'handler2',
                priority: 2,
                timeout: 1000,
                execute: handler2
            });

            await healthMonitor.shutdown('Test shutdown');

            expect(handler1).toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
            expect(clearInterval).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Graceful shutdown initiated: Test shutdown',
                expect.any(Object)
            );
        });

        it('should handle shutdown handler timeouts', async () => {
            const slowHandler = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));

            healthMonitor.addShutdownHandler({
                name: 'slow-handler',
                priority: 1,
                timeout: 100, // Short timeout
                execute: slowHandler
            });

            await healthMonitor.shutdown('Test shutdown');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                "Shutdown handler 'slow-handler' failed",
                expect.objectContaining({
                    timeout: 100
                })
            );
        });

        it('should handle shutdown handler errors', async () => {
            const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));

            healthMonitor.addShutdownHandler({
                name: 'error-handler',
                priority: 1,
                timeout: 1000,
                execute: errorHandler
            });

            await healthMonitor.shutdown('Test shutdown');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                "Shutdown handler 'error-handler' failed",
                expect.objectContaining({
                    error: 'Handler error'
                })
            );
        });

        it('should prevent duplicate shutdowns', async () => {
            const shutdownPromise1 = healthMonitor.shutdown('First shutdown');
            const shutdownPromise2 = healthMonitor.shutdown('Second shutdown');

            await Promise.all([shutdownPromise1, shutdownPromise2]);

            expect(mockLogger.warn).toHaveBeenCalledWith('Shutdown already in progress');
        });

        it('should execute handlers in priority order', async () => {
            const executionOrder: string[] = [];

            const handler1 = jest.fn().mockImplementation(async () => {
                executionOrder.push('handler1');
            });
            const handler2 = jest.fn().mockImplementation(async () => {
                executionOrder.push('handler2');
            });
            const handler3 = jest.fn().mockImplementation(async () => {
                executionOrder.push('handler3');
            });

            // Add in random order
            healthMonitor.addShutdownHandler({
                name: 'handler2',
                priority: 2,
                timeout: 1000,
                execute: handler2
            });

            healthMonitor.addShutdownHandler({
                name: 'handler1',
                priority: 1,
                timeout: 1000,
                execute: handler1
            });

            healthMonitor.addShutdownHandler({
                name: 'handler3',
                priority: 3,
                timeout: 1000,
                execute: handler3
            });

            await healthMonitor.shutdown('Test shutdown');

            expect(executionOrder).toEqual(['handler1', 'handler2', 'handler3']);
        });
    });

    describe('Health Check Execution', () => {
        beforeEach(() => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);
        });

        it('should execute specific health check', async () => {
            const results = await healthMonitor.performHealthCheck('memory');

            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('memory');
        });

        it('should execute all health checks', async () => {
            const results = await healthMonitor.performHealthCheck();

            expect(results.length).toBeGreaterThanOrEqual(3); // memory, eventbus, resources
        });

        it('should handle health check timeouts', async () => {
            const timeoutCheck: HealthCheck = {
                name: 'timeout-check',
                description: 'Timeout test',
                execute: jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000))),
                interval: 5000,
                timeout: 100, // Short timeout
                critical: false,
                enabled: true
            };

            healthMonitor.addHealthCheck(timeoutCheck);

            const results = await healthMonitor.performHealthCheck('timeout-check');
            const timeoutResult = results.find(r => r.name === 'timeout-check');

            expect(timeoutResult?.status).toBe('unhealthy');
            expect(timeoutResult?.error).toContain('timed out');
        });

        it('should skip disabled health checks', async () => {
            const disabledCheck: HealthCheck = {
                name: 'disabled-check',
                description: 'Disabled test',
                execute: jest.fn(),
                interval: 5000,
                timeout: 2000,
                critical: false,
                enabled: false
            };

            healthMonitor.addHealthCheck(disabledCheck);

            const results = await healthMonitor.performHealthCheck();

            expect(results.some(r => r.name === 'disabled-check')).toBe(false);
            expect(disabledCheck.execute).not.toHaveBeenCalled();
        });
    });

    describe('Health Check History and Logging', () => {
        beforeEach(() => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);
        });

        it('should log status changes', async () => {
            const changingCheck: HealthCheck = {
                name: 'changing-check',
                description: 'Check that changes status',
                execute: jest.fn(),
                interval: 5000,
                timeout: 2000,
                critical: false,
                enabled: true
            };

            // First call returns healthy
            (changingCheck.execute as jest.Mock).mockResolvedValueOnce({
                name: 'changing-check',
                status: 'healthy',
                responseTime: 10,
                timestamp: new Date()
            });

            // Second call returns unhealthy
            (changingCheck.execute as jest.Mock).mockResolvedValueOnce({
                name: 'changing-check',
                status: 'unhealthy',
                responseTime: 50,
                error: 'Something went wrong',
                timestamp: new Date()
            });

            healthMonitor.addHealthCheck(changingCheck);

            await healthMonitor.performHealthCheck('changing-check');
            await healthMonitor.performHealthCheck('changing-check');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                "Health check 'changing-check' status changed",
                expect.objectContaining({
                    from: 'healthy',
                    to: 'unhealthy'
                })
            );
        });
    });

    describe('Dispose', () => {
        it('should dispose and trigger shutdown', () => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);

            const shutdownSpy = jest.spyOn(healthMonitor, 'shutdown').mockResolvedValue();

            healthMonitor.dispose();

            expect(shutdownSpy).toHaveBeenCalledWith('HealthMonitor disposal');
        });

        it('should not shutdown if already shutting down', () => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);

            const shutdownSpy = jest.spyOn(healthMonitor, 'shutdown').mockResolvedValue();

            // First dispose
            healthMonitor.dispose();
            expect(shutdownSpy).toHaveBeenCalledTimes(1);

            // Second dispose should not call shutdown again
            healthMonitor.dispose();
            expect(shutdownSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('Periodic Health Check Execution', () => {
        beforeEach(() => {
            healthMonitor = new HealthMonitor(mockLogger, mockEventBus);
        });

        it('should execute health checks periodically', async () => {
            const customCheck: HealthCheck = {
                name: 'periodic-check',
                description: 'Periodic test',
                execute: jest.fn().mockResolvedValue({
                    name: 'periodic-check',
                    status: 'healthy',
                    responseTime: 10,
                    timestamp: new Date()
                }),
                interval: 1000,
                timeout: 500,
                critical: false,
                enabled: true
            };

            healthMonitor.addHealthCheck(customCheck);

            // Execute the interval callback manually
            const intervalCallback = intervalCallbacks.get(Array.from(intervalCallbacks.keys()).pop()!);
            if (intervalCallback) {
                await intervalCallback();
            }

            expect(customCheck.execute).toHaveBeenCalled();
        });

        it('should not execute during shutdown', async () => {
            const customCheck: HealthCheck = {
                name: 'shutdown-check',
                description: 'Check during shutdown',
                execute: jest.fn().mockResolvedValue({
                    name: 'shutdown-check',
                    status: 'healthy',
                    responseTime: 10,
                    timestamp: new Date()
                }),
                interval: 1000,
                timeout: 500,
                critical: false,
                enabled: true
            };

            healthMonitor.addHealthCheck(customCheck);
            await healthMonitor.shutdown('Test shutdown');

            // Try to execute the interval callback after shutdown
            const intervalCallback = intervalCallbacks.get(Array.from(intervalCallbacks.keys()).pop()!);
            if (intervalCallback) {
                await intervalCallback();
            }

            // Should not execute during shutdown
            expect(customCheck.execute).not.toHaveBeenCalled();
        });
    });
});
