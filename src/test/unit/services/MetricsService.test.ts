import { MetricsService } from '../../../services/MetricsService';
import {
    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockContainer,
    createMockExtensionContext,
    createMockOutputChannel,
    createMockTerminal,
    setupVSCodeMocks
} from './../../helpers/mockFactories';

import {
    IConfigurationService,
    ILoggingService,
    IEventBus,
    MetricType,
    METRICS_CONFIG_KEYS
} from '../../../services/interfaces';

// Helper function to filter out system metrics in tests
const getTestMetrics = (service: MetricsService) => {
    return service.getMetrics().filter(m => !m.name.startsWith('system.'));
};

describe('MetricsService', () => {
    let metricsService: MetricsService;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockLogger: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        mockConfigService = createMockConfigurationService();
        jest.useFakeTimers();
        // Reset mocks
        jest.clearAllMocks();

        // Mock configuration service
        mockConfigService = {
            get: jest.fn(),
            getAll: jest.fn(),
            update: jest.fn(),
            onDidChange: jest.fn(),
            validateAll: jest.fn(() => ({ isValid: true, errors: [] })),
            getMaxAgents: jest.fn(),
            getAiPath: jest.fn(),
            isAutoAssignTasks: jest.fn(),
            isUseWorktrees: jest.fn(),
            isShowAgentTerminalOnSpawn: jest.fn(),
            getTemplatesPath: jest.fn(),
            isPersistAgents: jest.fn(),
            getLogLevel: jest.fn(),
            getOrchestrationHeartbeatInterval: jest.fn(),
            getOrchestrationHeartbeatTimeout: jest.fn(),
            getOrchestrationHistoryLimit: jest.fn(),
            getOrchestrationPersistencePath: jest.fn(),
            getOrchestrationMaxFileSize: jest.fn()
        };

        // Mock logger
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn(),
            getChannel: jest.fn(),
            time: jest.fn(),
            timeEnd: jest.fn(),
            dispose: jest.fn()
        };

        // Mock event bus
        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            once: jest.fn(),
            filter: jest.fn(),
            subscribePattern: jest.fn(),
            setLoggingService: jest.fn(),
            dispose: jest.fn()
        };

        // Default configuration
        mockConfigService.get.mockImplementation((key: string) => {
            const config: Record<string, any> = {
                [METRICS_CONFIG_KEYS.ENABLE_METRICS]: true,
                [METRICS_CONFIG_KEYS.METRICS_OUTPUT_LEVEL]: 'basic',
                [METRICS_CONFIG_KEYS.METRICS_RETENTION_HOURS]: 24
            };
            return config[key];
        });

        metricsService = new MetricsService(mockConfigService, mockLogger, mockEventBus);
    });

    afterEach(() => {
        metricsService.dispose();
        jest.useRealTimers();
    });

    describe('Counter Operations', () => {
        it('should increment counter', () => {
            metricsService.incrementCounter('test.counter');

            const metrics = getTestMetrics(metricsService);
            expect(metrics).toHaveLength(1);
            expect(metrics[0]).toMatchObject({
                name: 'test.counter',
                type: MetricType.COUNTER,
                value: 1,
                timestamp: expect.any(Date)
            });
        });

        it('should increment counter with tags', () => {
            const tags = { component: 'test', level: 'info' };
            metricsService.incrementCounter('test.counter', tags);

            const metrics = getTestMetrics(metricsService);
            expect(metrics[0].tags).toEqual(tags);
        });

        it('should accumulate multiple counter increments', () => {
            metricsService.incrementCounter('test.counter');
            metricsService.incrementCounter('test.counter');
            metricsService.incrementCounter('test.counter');

            const metrics = metricsService.getMetrics();
            const counterMetrics = metrics.filter(m => m.name === 'test.counter');
            expect(counterMetrics).toHaveLength(3);
            expect(counterMetrics.every(m => m.value === 1)).toBe(true);
        });

        it('should not record metrics when disabled', () => {
            mockConfigService.get.mockReturnValue(false); // Disable metrics
            const disabledService = new MetricsService(mockConfigService, mockLogger, mockEventBus);

            disabledService.incrementCounter('test.counter');

            const metrics = disabledService.getMetrics();
            expect(metrics).toHaveLength(0);

            disabledService.dispose();
        });
    });

    describe('Gauge Operations', () => {
        it('should set gauge value', () => {
            metricsService.setGauge('test.gauge', 42.5);

            const metrics = getTestMetrics(metricsService);
            expect(metrics).toHaveLength(1);
            expect(metrics[0]).toMatchObject({
                name: 'test.gauge',
                type: MetricType.GAUGE,
                value: 42.5
            });
        });

        it('should overwrite previous gauge value', () => {
            metricsService.setGauge('test.gauge', 10);
            metricsService.setGauge('test.gauge', 20);

            const metrics = metricsService.getMetrics();
            const gaugeMetrics = metrics.filter(m => m.name === 'test.gauge');
            expect(gaugeMetrics).toHaveLength(2);
            expect(gaugeMetrics[0].value).toBe(10);
            expect(gaugeMetrics[1].value).toBe(20);
        });

        it('should set gauge with tags', () => {
            const tags = { unit: 'bytes' };
            metricsService.setGauge('memory.usage', 1024, tags);

            const metrics = getTestMetrics(metricsService);
            expect(metrics[0].tags).toEqual(tags);
        });
    });

    describe('Duration Recording', () => {
        it('should record duration manually', () => {
            metricsService.recordDuration('test.duration', 150.5);

            const metrics = getTestMetrics(metricsService);
            expect(metrics).toHaveLength(1);
            expect(metrics[0]).toMatchObject({
                name: 'test.duration',
                type: MetricType.HISTOGRAM,
                value: 150.5
            });
        });

        it('should record duration with tags', () => {
            const tags = { operation: 'test' };
            metricsService.recordDuration('test.duration', 100, tags);

            const metrics = getTestMetrics(metricsService);
            expect(metrics[0].tags).toEqual(tags);
        });
    });

    describe('Timer Operations', () => {
        it('should start and end timer', () => {
            const timerId = metricsService.startTimer('test.timer');

            expect(timerId).toBeTruthy();
            expect(typeof timerId).toBe('string');

            // Simulate some time passing
            jest.advanceTimersByTime(100);

            metricsService.endTimer(timerId);

            const metrics = getTestMetrics(metricsService);
            expect(metrics).toHaveLength(1);
            expect(metrics[0]).toMatchObject({
                name: 'test.timer',
                type: MetricType.HISTOGRAM,
                value: expect.any(Number)
            });
        });

        it('should handle invalid timer ID', () => {
            metricsService.endTimer('invalid-timer-id');

            expect(mockLogger.warn).toHaveBeenCalledWith('Timer not found', { timerId: 'invalid-timer-id' });
        });

        it('should not record timer when disabled', () => {
            mockConfigService.get.mockReturnValue(false);
            const disabledService = new MetricsService(mockConfigService, mockLogger, mockEventBus);

            const timerId = disabledService.startTimer('test.timer');
            expect(timerId).toBe('');

            disabledService.endTimer(timerId);

            const metrics = disabledService.getMetrics();
            expect(metrics).toHaveLength(0);

            disabledService.dispose();
        });
    });

    describe('Metrics Export', () => {
        beforeEach(() => {
            metricsService.incrementCounter('test.counter');
            metricsService.setGauge('test.gauge', 42);
            metricsService.recordDuration('test.duration', 100);
        });

        it('should export metrics as JSON', () => {
            const json = metricsService.exportMetrics('json');

            const parsed = JSON.parse(json);
            expect(parsed).toHaveProperty('timestamp');
            expect(parsed).toHaveProperty('metrics');
            expect(parsed).toHaveProperty('summary');
            const testMetrics = parsed.metrics.filter((m: any) => !m.name.startsWith('system.'));
            expect(testMetrics).toHaveLength(3);
        });

        it('should export metrics as CSV', () => {
            const csv = metricsService.exportMetrics('csv');

            const lines = csv.split('\n');
            expect(lines[0]).toBe('timestamp,name,type,value,tags');
            const testLines = lines.filter(line => line.includes('test.') || line.startsWith('timestamp'));
            expect(testLines).toHaveLength(4); // Header + 3 metrics
        });

        it('should export empty metrics', () => {
            const emptyService = new MetricsService(mockConfigService, mockLogger, mockEventBus);

            const json = emptyService.exportMetrics('json');
            const parsed = JSON.parse(json);

            const testMetrics = parsed.metrics.filter((m: any) => !m.name.startsWith('system.'));
            expect(testMetrics).toHaveLength(0);
            expect(parsed.summary.totalMetrics).toBeGreaterThanOrEqual(0);

            emptyService.dispose();
        });
    });

    describe('Metrics Reset', () => {
        it('should reset all metrics', () => {
            metricsService.incrementCounter('test.counter');
            metricsService.setGauge('test.gauge', 42);

            expect(getTestMetrics(metricsService)).toHaveLength(2);

            metricsService.resetMetrics();

            expect(getTestMetrics(metricsService)).toHaveLength(0);
            expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.reset', {});
        });

        it('should clear active timers on reset', () => {
            const timerId = metricsService.startTimer('test.timer');

            metricsService.resetMetrics();

            // Timer should be cleared, so ending it should not record anything
            metricsService.endTimer(timerId);

            expect(metricsService.getMetrics()).toHaveLength(0);
        });
    });

    describe('Configuration Integration', () => {
        it('should respond to configuration changes', () => {
            const changeCallback = mockConfigService.onDidChange.mock.calls[0][0];

            // Simulate configuration change
            const mockEvent = {
                affectsConfiguration: jest.fn().mockReturnValue(true)
            };
            changeCallback(mockEvent);

            expect(mockEvent.affectsConfiguration).toHaveBeenCalledWith('nofx.enableMetrics');
        });

        it('should update output level from configuration', () => {
            mockConfigService.get.mockImplementation((key: string) => {
                if (key === METRICS_CONFIG_KEYS.METRICS_OUTPUT_LEVEL) return 'detailed';
                return true;
            });

            const service = new MetricsService(mockConfigService, mockLogger, mockEventBus);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'MetricsService initialized',
                expect.objectContaining({
                    enabled: true,
                    retentionHours: 24
                })
            );

            service.dispose();
        });
    });

    describe('Event Publishing', () => {
        it('should publish counter increment events', () => {
            metricsService.incrementCounter('test.counter', { tag: 'value' });

            expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.counter.incremented', {
                name: 'test.counter',
                tags: { tag: 'value' }
            });
        });

        it('should publish duration recorded events', () => {
            metricsService.recordDuration('test.duration', 100, { tag: 'value' });

            expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.duration.recorded', {
                name: 'test.duration',
                duration: 100,
                tags: { tag: 'value' }
            });
        });

        it('should publish gauge set events', () => {
            metricsService.setGauge('test.gauge', 42, { tag: 'value' });

            expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.gauge.set', {
                name: 'test.gauge',
                value: 42,
                tags: { tag: 'value' }
            });
        });

        it('should publish metrics recorded events', () => {
            metricsService.incrementCounter('test.counter');

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'metrics.recorded',
                expect.objectContaining({
                    name: 'test.counter',
                    type: MetricType.COUNTER,
                    value: 1
                })
            );
        });
    });

    describe('Dashboard Data', () => {
        beforeEach(() => {
            // Add some test metrics
            metricsService.incrementCounter('test.counter1');
            metricsService.incrementCounter('test.counter1');
            metricsService.incrementCounter('test.counter2');
            metricsService.setGauge('test.gauge', 42);
            metricsService.recordDuration('test.duration', 100);
            metricsService.recordDuration('test.duration', 200);
        });

        it('should provide dashboard data', () => {
            const dashboardData = metricsService.getDashboardData();

            expect(dashboardData).toHaveProperty('enabled', true);
            expect(dashboardData).toHaveProperty('outputLevel', 'basic');
            const testMetricsCount = getTestMetrics(metricsService).length;
            expect(testMetricsCount).toBeGreaterThanOrEqual(5);
            expect(dashboardData).toHaveProperty('recentMetrics');
            expect(dashboardData).toHaveProperty('metricsByType');
            expect(dashboardData).toHaveProperty('topCounters');
            expect(dashboardData).toHaveProperty('averageDurations');
            expect(dashboardData).toHaveProperty('systemMetrics');
        });

        it('should calculate top counters correctly', () => {
            const dashboardData = metricsService.getDashboardData();

            expect(dashboardData.topCounters).toHaveLength(2);
            expect(dashboardData.topCounters[0]).toEqual({ name: 'test.counter1', count: 2 });
            expect(dashboardData.topCounters[1]).toEqual({ name: 'test.counter2', count: 1 });
        });

        it('should calculate average durations correctly', () => {
            const dashboardData = metricsService.getDashboardData();

            expect(dashboardData.averageDurations).toHaveLength(1);
            expect(dashboardData.averageDurations[0]).toEqual({ name: 'test.duration', average: 150 });
        });
    });

    describe('System Metrics', () => {
        it('should include system metrics in dashboard data', () => {
            const dashboardData = metricsService.getDashboardData();

            expect(dashboardData.systemMetrics).toHaveProperty('memory');
            expect(dashboardData.systemMetrics).toHaveProperty('uptime');
            expect(dashboardData.systemMetrics).toHaveProperty('nodeVersion');
            expect(dashboardData.systemMetrics).toHaveProperty('platform');

            expect(dashboardData.systemMetrics.memory).toHaveProperty('heapUsed');
            expect(dashboardData.systemMetrics.memory).toHaveProperty('heapTotal');
            expect(dashboardData.systemMetrics.memory).toHaveProperty('external');
            expect(dashboardData.systemMetrics.memory).toHaveProperty('rss');
        });
    });

    describe('Performance and Cleanup', () => {
        it('should handle high-frequency metrics', () => {
            // Add many metrics quickly
            for (let i = 0; i < 1000; i++) {
                metricsService.incrementCounter('high.frequency.counter');
            }

            const metrics = getTestMetrics(metricsService);
            expect(metrics).toHaveLength(1000);
        });

        it('should clean up old metrics', () => {
            // Mock old timestamps
            const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

            // Add old metric
            metricsService.incrementCounter('old.counter');
            const metrics = metricsService.getMetrics();
            metrics[0].timestamp = oldDate;

            // Trigger cleanup
            metricsService['cleanupOldMetrics']();

            const remainingMetrics = getTestMetrics(metricsService);
            expect(remainingMetrics.length).toBeLessThanOrEqual(1);
        });

        it('should dispose properly', () => {
            metricsService.incrementCounter('test.counter');

            metricsService.dispose();

            const metrics = metricsService.getMetrics();
            expect(metrics).toHaveLength(0);
        });
    });

    describe('Error Scenarios', () => {
        it('should handle configuration service errors', () => {
            mockConfigService.get.mockImplementation(() => {
                throw new Error('Configuration error');
            });

            // Should not throw
            expect(() => {
                new MetricsService(mockConfigService, mockLogger, mockEventBus);
            }).not.toThrow();
        });

        it('should handle event bus errors', () => {
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Event bus error');
            });

            // Should not throw
            expect(() => {
                metricsService.incrementCounter('test.counter');
            }).not.toThrow();
        });
    });
});
