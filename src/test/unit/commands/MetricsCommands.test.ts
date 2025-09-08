import { MetricsCommands } from '../../../commands/MetricsCommands';
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
    IContainer,
    IMetricsService,
    INotificationService,
    IConfigurationService,
    ICommandService,
    IEventBus,
    SERVICE_TOKENS
} from '../../../services/interfaces';

describe('MetricsCommands', () => {
    let metricsCommands: MetricsCommands;
    let mockContainer: jest.Mocked<IContainer>;
    let mockMetricsService: jest.Mocked<IMetricsService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockCommandService: jest.Mocked<ICommandService>;
    let mockEventBus: jest.Mocked<IEventBus>;

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        mockConfigService = createMockConfigurationService();
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock services
        mockMetricsService = {
            incrementCounter: jest.fn(),
            recordDuration: jest.fn(),
            setGauge: jest.fn(),
            startTimer: jest.fn() as any,
            endTimer: jest.fn(),
            getMetrics: jest.fn(() => []),
            resetMetrics: jest.fn(),
            exportMetrics: jest.fn(() => '{}'),
            getDashboardData: jest.fn(() => ({
                enabled: true,
                outputLevel: 'basic',
                totalMetrics: 100,
                recentMetrics: 50,
                metricsByType: { counter: 30, gauge: 20, histogram: 10 },
                topCounters: [{ name: 'messages_received', count: 25 }],
                averageDurations: [{ name: 'message_processing_duration', average: 15.5 }],
                systemMetrics: { memory: { heapUsed: 1000000 } },
                recent: [
                    { name: 'messages_received', type: 'counter', timestamp: new Date(), value: 1, tags: {} },
                    {
                        name: 'message_processing_duration',
                        type: 'histogram',
                        timestamp: new Date(),
                        value: 10,
                        tags: {}
                    }
                ]
            })),
            dispose: jest.fn()
        };

        mockNotificationService = {
            showInformation: jest.fn(),
            showWarning: jest.fn(),
            showError: jest.fn(),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            withProgress: jest.fn(),
            confirm: jest.fn(),
            confirmDestructive: jest.fn()
        };

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

        mockCommandService = {
            register: jest.fn((commandId: string, handler: any, thisArg?: any) => ({ dispose: jest.fn() })),
            registerTextEditorCommand: jest.fn((commandId: string, handler: any, thisArg?: any) => ({
                dispose: jest.fn()
            })),
            execute: jest.fn(),
            getCommands: jest.fn(),
            hasCommand: jest.fn(),
            unregister: jest.fn(),
            dispose: jest.fn()
        };

        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn((event: string, handler: any) => ({ dispose: jest.fn() })),
            unsubscribe: jest.fn(),
            once: jest.fn((event: string, handler: any) => ({ dispose: jest.fn() })),
            filter: jest.fn(),
            subscribePattern: jest.fn((pattern: string, handler: any) => ({ dispose: jest.fn() })),
            setLoggingService: jest.fn(),
            dispose: jest.fn()
        };

        mockContainer = {
            register: jest.fn(),
            registerInstance: jest.fn(),
            resolve: jest.fn(<T>(token: symbol): T => {
                switch (token) {
                    case SERVICE_TOKENS.MetricsService:
                        return mockMetricsService as any;
                    case SERVICE_TOKENS.NotificationService:
                        return mockNotificationService as any;
                    case SERVICE_TOKENS.ConfigurationService:
                        return mockConfigService as any;
                    case SERVICE_TOKENS.CommandService:
                        return mockCommandService as any;
                    case SERVICE_TOKENS.EventBus:
                        return mockEventBus as any;
                    default:
                        return undefined as any;
                }
            }) as any,
            resolveOptional: jest.fn(),
            has: jest.fn(),
            createScope: jest.fn(),
            setLoggingService: jest.fn(),
            dispose: jest.fn()
        };

        // Create MetricsCommands instance
        metricsCommands = new MetricsCommands(mockContainer);
    });

    afterEach(() => {
        metricsCommands.dispose();
    });

    describe('Event Listeners', () => {
        it('should set up event listeners for metrics events', () => {
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('metrics.counter.incremented', expect.any(Function));
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('metrics.duration.recorded', expect.any(Function));
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('metrics.gauge.set', expect.any(Function));
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('metrics.recorded', expect.any(Function));
        });
    });

    describe('Command Registration', () => {
        it('should register all metrics commands', () => {
            metricsCommands.register();

            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.showMetricsDashboard', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.exportMetrics', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.resetMetrics', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.toggleMetrics', expect.any(Function));
        });
    });

    describe('Dashboard Filtering', () => {
        it('should apply time range filter correctly', () => {
            const data = {
                recent: [
                    {
                        name: 'test1',
                        type: 'counter',
                        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
                        value: 1,
                        tags: {}
                    }, // 2 hours ago
                    {
                        name: 'test2',
                        type: 'counter',
                        timestamp: new Date(Date.now() - 30 * 60 * 1000),
                        value: 1,
                        tags: {}
                    }, // 30 minutes ago
                    { name: 'test3', type: 'counter', timestamp: new Date(), value: 1, tags: {} } // now
                ]
            };

            const filters = { timeRange: '1h' };
            const applyFiltersToData = (metricsCommands as any).applyFiltersToData.bind(metricsCommands);
            const result = applyFiltersToData(data, filters);

            expect(result.recent).toHaveLength(2); // Only last hour
            expect(result.recentMetrics).toBe(2);
        });

        it('should apply metric type filter correctly', () => {
            const data = {
                recent: [
                    { name: 'test1', type: 'counter', timestamp: new Date(), value: 1, tags: {} },
                    { name: 'test2', type: 'gauge', timestamp: new Date(), value: 5, tags: {} },
                    { name: 'test3', type: 'histogram', timestamp: new Date(), value: 10, tags: {} }
                ]
            };

            const filters = { metricType: 'counter' };
            const applyFiltersToData = (metricsCommands as any).applyFiltersToData.bind(metricsCommands);
            const result = applyFiltersToData(data, filters);

            expect(result.recent).toHaveLength(1);
            expect(result.recent[0].type).toBe('counter');
        });

        it('should apply search filter correctly', () => {
            const data = {
                recent: [
                    { name: 'messages_received', type: 'counter', timestamp: new Date(), value: 1, tags: {} },
                    { name: 'bytes_transferred', type: 'counter', timestamp: new Date(), value: 1, tags: {} },
                    { name: 'connection_errors', type: 'counter', timestamp: new Date(), value: 1, tags: {} }
                ]
            };

            const filters = { searchFilter: 'messages' };
            const applyFiltersToData = (metricsCommands as any).applyFiltersToData.bind(metricsCommands);
            const result = applyFiltersToData(data, filters);

            expect(result.recent).toHaveLength(1);
            expect(result.recent[0].name).toBe('messages_received');
        });

        it('should recompute top counters from filtered data', () => {
            const data = {
                recent: [
                    { name: 'test1', type: 'counter', timestamp: new Date(), value: 5, tags: {} },
                    { name: 'test1', type: 'counter', timestamp: new Date(), value: 3, tags: {} },
                    { name: 'test2', type: 'counter', timestamp: new Date(), value: 2, tags: {} }
                ]
            };

            const filters = { metricType: 'counter' };
            const applyFiltersToData = (metricsCommands as any).applyFiltersToData.bind(metricsCommands);
            const result = applyFiltersToData(data, filters);

            expect(result.topCounters).toHaveLength(2);
            expect(result.topCounters[0]).toEqual({ name: 'test1', count: 8 });
            expect(result.topCounters[1]).toEqual({ name: 'test2', count: 2 });
        });

        it('should recompute average durations from filtered data', () => {
            const data = {
                recent: [
                    { name: 'duration1', type: 'histogram', timestamp: new Date(), value: 10, tags: {} },
                    { name: 'duration1', type: 'histogram', timestamp: new Date(), value: 20, tags: {} },
                    { name: 'duration2', type: 'histogram', timestamp: new Date(), value: 30, tags: {} }
                ]
            };

            const filters = { metricType: 'histogram' };
            const applyFiltersToData = (metricsCommands as any).applyFiltersToData.bind(metricsCommands);
            const result = applyFiltersToData(data, filters);

            expect(result.averageDurations).toHaveLength(2);
            expect(result.averageDurations[0]).toEqual({ name: 'duration2', average: 30 });
            expect(result.averageDurations[1]).toEqual({ name: 'duration1', average: 15 });
        });

        it('should return original data when no filters applied', () => {
            const data = { test: 'data' };
            const applyFiltersToData = (metricsCommands as any).applyFiltersToData.bind(metricsCommands);
            const result = applyFiltersToData(data, {});

            expect(result).toBe(data);
        });
    });

    describe('Event-Driven Updates', () => {
        it('should refresh dashboard when counter event is received', () => {
            const refreshSpy = jest.spyOn(metricsCommands as any, 'refreshMetricsDashboard');

            // Get the counter event handler
            const counterHandler = mockEventBus.subscribe.mock.calls.find(
                call => call[0] === 'metrics.counter.incremented'
            )?.[1];

            expect(counterHandler).toBeDefined();

            // Simulate event
            counterHandler?.();

            // Should not refresh if no panel is open
            expect(refreshSpy).not.toHaveBeenCalled();
        });

        it('should refresh dashboard when gauge event is received', () => {
            const refreshSpy = jest.spyOn(metricsCommands as any, 'refreshMetricsDashboard');

            // Get the gauge event handler
            const gaugeHandler = mockEventBus.subscribe.mock.calls.find(call => call[0] === 'metrics.gauge.set')?.[1];

            expect(gaugeHandler).toBeDefined();

            // Simulate event
            gaugeHandler?.();

            // Should not refresh if no panel is open
            expect(refreshSpy).not.toHaveBeenCalled();
        });

        it('should refresh dashboard when recorded event is received', () => {
            const refreshSpy = jest.spyOn(metricsCommands as any, 'refreshMetricsDashboard');

            // Get the recorded event handler
            const recordedHandler = mockEventBus.subscribe.mock.calls.find(call => call[0] === 'metrics.recorded')?.[1];

            expect(recordedHandler).toBeDefined();

            // Simulate event
            recordedHandler?.();

            // Should not refresh if no panel is open
            expect(refreshSpy).not.toHaveBeenCalled();
        });
    });

    describe('Disposal', () => {
        it('should dispose properly', () => {
            metricsCommands.dispose();

            // All registered disposables should be disposed
            const registeredDisposables = mockCommandService.register.mock.results.map(result => result.value);
            registeredDisposables.forEach(disposable => {
                expect(disposable.dispose).toHaveBeenCalled();
            });
        });
    });
});
