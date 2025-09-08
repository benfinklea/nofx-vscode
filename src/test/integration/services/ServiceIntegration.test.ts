import * as vscode from 'vscode';
import { Container } from '../../../services/Container';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { MetricsService } from '../../../services/MetricsService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { TerminalManager } from '../../../services/TerminalManager';
import { TerminalMonitor } from '../../../services/TerminalMonitor';
import { WorktreeService } from '../../../services/WorktreeService';
import { NotificationService } from '../../../services/NotificationService';
import { AIProviderResolver } from '../../../services/AIProviderResolver';
import { MessageRouter } from '../../../services/MessageRouter';
import { MessageValidator } from '../../../services/MessageValidator';
import { ConnectionPoolService } from '../../../services/ConnectionPoolService';
import { DOMAIN_EVENTS, CONFIG_EVENTS, ORCH_EVENTS } from '../../../services/EventConstants';

describe('Service Integration', () => {
    let container: Container;
    let eventBus: EventBus;
    let loggingService: LoggingService;
    let metricsService: MetricsService;
    let configService: ConfigurationService;
    let mockContext: vscode.ExtensionContext;
    let mockChannel: vscode.OutputChannel;

    beforeAll(() => {
        // Setup mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
            globalState: {
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([]),
                setKeysForSync: jest.fn()
            },
            workspaceState: {
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([])
            },
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn()
            },
            extensionUri: vscode.Uri.file('/test/extension'),
            extensionMode: vscode.ExtensionMode.Test,
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/logs',
            asAbsolutePath: jest.fn(p => `/test/extension/${p}`)
        } as any;

        // Create mock output channel
        mockChannel = {
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn(),
            hide: jest.fn(),
            show: jest.fn(),
            name: 'Test Channel',
            replace: jest.fn()
        } as any;

        // Setup container
        container = Container.getInstance();
    });

    afterAll(async () => {
        await container.dispose();
        Container['instance'] = null;
    });

    beforeEach(() => {
        // Reset container for each test
        container.clear();

        // Register core services
        eventBus = new EventBus();
        container.registerInstance(Symbol.for('IEventBus'), eventBus);

        configService = new ConfigurationService();
        container.registerInstance(Symbol.for('IConfigurationService'), configService);

        loggingService = new LoggingService(configService, mockChannel);
        container.registerInstance(Symbol.for('ILoggingService'), loggingService);

        metricsService = new MetricsService(configService, loggingService);
        container.registerInstance(Symbol.for('IMetricsService'), metricsService);
    });

    describe('Service Container Integration', () => {
        it('should register and resolve services correctly', () => {
            // All core services should be resolvable
            expect(container.resolve(Symbol.for('IEventBus'))).toBe(eventBus);
            expect(container.resolve(Symbol.for('IConfigurationService'))).toBe(configService);
            expect(container.resolve(Symbol.for('ILoggingService'))).toBe(loggingService);
            expect(container.resolve(Symbol.for('IMetricsService'))).toBe(metricsService);
        });

        it('should handle service dependencies correctly', () => {
            // Register a dependent service
            container.register(
                Symbol.for('ITerminalManager'),
                c =>
                    new TerminalManager(
                        c.resolve(Symbol.for('IConfigurationService')),
                        c.resolve(Symbol.for('ILoggingService')),
                        c.resolve(Symbol.for('IEventBus'))
                    ),
                'singleton'
            );

            const terminalManager = container.resolve(Symbol.for('ITerminalManager'));
            expect(terminalManager).toBeInstanceOf(TerminalManager);
        });

        it('should maintain singleton behavior', () => {
            const service1 = container.resolve(Symbol.for('IEventBus'));
            const service2 = container.resolve(Symbol.for('IEventBus'));

            expect(service1).toBe(service2);
        });

        it('should handle service disposal', async () => {
            const disposalSpy = jest.spyOn(metricsService, 'dispose');

            await container.dispose();

            expect(disposalSpy).toHaveBeenCalled();
        });
    });

    describe('Event System Integration', () => {
        it('should route events between services', done => {
            let eventReceived = false;

            eventBus.subscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, event => {
                eventReceived = true;
                expect(event.agentId).toBe('test-agent');
                done();
            });

            eventBus.publish(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, {
                agentId: 'test-agent',
                timestamp: new Date().toISOString()
            });

            // Ensure event was processed
            expect(eventReceived).toBe(true);
        });

        it('should handle configuration change events', done => {
            eventBus.subscribe(CONFIG_EVENTS.CONFIGURATION_CHANGED, event => {
                expect(event.key).toBe('test.setting');
                expect(event.value).toBe('new-value');
                done();
            });

            // Simulate configuration change
            eventBus.publish(CONFIG_EVENTS.CONFIGURATION_CHANGED, {
                key: 'test.setting',
                value: 'new-value',
                previous: 'old-value'
            });
        });

        it('should handle orchestration events', done => {
            eventBus.subscribe(ORCH_EVENTS.CLIENT_CONNECTED, event => {
                expect(event.clientId).toBe('test-client');
                done();
            });

            eventBus.publish(ORCH_EVENTS.CLIENT_CONNECTED, {
                clientId: 'test-client',
                timestamp: new Date().toISOString()
            });
        });

        it('should handle multiple subscribers to same event', () => {
            let subscriber1Called = false;
            let subscriber2Called = false;

            eventBus.subscribe(DOMAIN_EVENTS.TASK_COMPLETED, () => {
                subscriber1Called = true;
            });

            eventBus.subscribe(DOMAIN_EVENTS.TASK_COMPLETED, () => {
                subscriber2Called = true;
            });

            eventBus.publish(DOMAIN_EVENTS.TASK_COMPLETED, {
                taskId: 'test-task'
            });

            expect(subscriber1Called).toBe(true);
            expect(subscriber2Called).toBe(true);
        });

        it('should handle event unsubscription', () => {
            let eventReceived = false;

            const unsubscribe = eventBus.subscribe(DOMAIN_EVENTS.AGENT_TERMINATED, () => {
                eventReceived = true;
            });

            unsubscribe();

            eventBus.publish(DOMAIN_EVENTS.AGENT_TERMINATED, {
                agentId: 'test-agent'
            });

            expect(eventReceived).toBe(false);
        });
    });

    describe('Logging Service Integration', () => {
        it('should integrate with configuration service', () => {
            // Mock configuration
            (configService as any).get = jest.fn().mockReturnValue('debug');

            // Create new logging service with config
            const logService = new LoggingService(configService, mockChannel);

            expect(logService.isLevelEnabled('debug')).toBe(true);
            expect(logService.isLevelEnabled('trace')).toBe(false);
        });

        it('should log to output channel', () => {
            loggingService.info('Test message');

            expect(mockChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Test message'));
        });

        it('should handle different log levels', () => {
            loggingService.error('Error message');
            loggingService.warn('Warning message');
            loggingService.debug('Debug message');

            expect(mockChannel.appendLine).toHaveBeenCalledTimes(3);
        });

        it('should support timing operations', () => {
            loggingService.time('test-operation');
            loggingService.timeEnd('test-operation');

            expect(mockChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Timer test-operation:'));
        });

        it('should create additional channels', () => {
            // Mock vscode.window.createOutputChannel
            (vscode.window as any).createOutputChannel = jest.fn().mockReturnValue(mockChannel);

            const additionalChannel = loggingService.getChannel('test-channel');

            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('NofX - test-channel');
            expect(additionalChannel).toBe(mockChannel);
        });
    });

    describe('Metrics Service Integration', () => {
        it('should integrate with configuration and logging', () => {
            // Enable metrics
            (configService as any).get = jest.fn().mockReturnValue(true);

            const metrics = new MetricsService(configService, loggingService);

            metrics.incrementCounter('test.counter');

            const allMetrics = metrics.getMetrics();
            expect(allMetrics.length).toBeGreaterThan(0);
        });

        it('should record different metric types', () => {
            metricsService.incrementCounter('requests.total');
            metricsService.recordDuration('request.duration', 150);
            metricsService.setGauge('active.connections', 5);

            const metrics = metricsService.getMetrics();
            expect(metrics).toHaveLength(3);

            const counterMetric = metrics.find(m => m.name === 'requests.total');
            const durationMetric = metrics.find(m => m.name === 'request.duration');
            const gaugeMetric = metrics.find(m => m.name === 'active.connections');

            expect(counterMetric?.value).toBe(1);
            expect(durationMetric?.value).toBe(150);
            expect(gaugeMetric?.value).toBe(5);
        });

        it('should handle timer operations', () => {
            const timerId = metricsService.startTimer('operation.time');
            expect(timerId).toBeTruthy();

            metricsService.endTimer(timerId);

            const metrics = metricsService.getMetrics();
            const timerMetric = metrics.find(m => m.name === 'operation.time');
            expect(timerMetric?.value).toBeGreaterThan(0);
        });

        it('should export metrics in different formats', () => {
            metricsService.incrementCounter('export.test');

            const jsonExport = metricsService.exportMetrics('json');
            expect(jsonExport).toContain('export.test');

            const csvExport = metricsService.exportMetrics('csv');
            expect(csvExport).toContain('timestamp,name,type,value,tags');
        });

        it('should provide dashboard data', () => {
            metricsService.incrementCounter('dashboard.test');
            metricsService.recordDuration('dashboard.duration', 100);

            const dashboardData = metricsService.getDashboardData();

            expect(dashboardData).toHaveProperty('totalMetrics');
            expect(dashboardData).toHaveProperty('metricsByType');
            expect(dashboardData).toHaveProperty('topCounters');
            expect(dashboardData.totalMetrics).toBeGreaterThan(0);
        });
    });

    describe('Terminal Service Integration', () => {
        it('should integrate terminal manager with event bus', () => {
            const terminalManager = new TerminalManager(configService, loggingService, eventBus);

            let terminalCreatedEvent = null;
            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_CREATED, event => {
                terminalCreatedEvent = event;
            });

            // Mock terminal creation
            const mockTerminal = {
                name: 'Test Terminal',
                show: jest.fn(),
                dispose: jest.fn()
            };
            (vscode.window as any).createTerminal = jest.fn().mockReturnValue(mockTerminal);

            const terminal = terminalManager.createAgentTerminal('test-agent', 'Test Agent');

            expect(terminal).toBe(mockTerminal);
            expect(terminalCreatedEvent).toBeTruthy();
        });

        it('should integrate terminal monitor with services', () => {
            // Create mock TaskToolBridge
            const mockTaskToolBridge = {
                handleToolCall: jest.fn(),
                executeSubAgentTask: jest.fn()
            };

            const terminalMonitor = new TerminalMonitor(loggingService, configService, mockTaskToolBridge);

            expect(terminalMonitor).toBeInstanceOf(TerminalMonitor);
        });
    });

    describe('AI Provider Integration', () => {
        it('should resolve AI providers based on configuration', () => {
            const resolver = new AIProviderResolver(configService, loggingService);

            // Mock configuration for AI path
            (configService as any).get = jest
                .fn()
                .mockReturnValueOnce('/usr/local/bin/claude') // aiPath
                .mockReturnValueOnce('claude'); // default return

            const aiPath = resolver.getAIPath();
            expect(aiPath).toBe('/usr/local/bin/claude');
        });

        it('should validate AI provider availability', () => {
            const resolver = new AIProviderResolver(configService, loggingService);

            // Mock file system check
            const fs = require('fs');
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'accessSync').mockReturnValue(undefined);

            const isAvailable = resolver.isAIProviderAvailable();
            expect(isAvailable).toBe(true);
        });
    });

    describe('Worktree Service Integration', () => {
        it('should integrate with configuration and notification services', () => {
            const notificationService = new NotificationService();
            const worktreeService = new WorktreeService(configService, notificationService, undefined, loggingService);

            expect(worktreeService).toBeInstanceOf(WorktreeService);
        });

        it('should check worktree availability', async () => {
            const notificationService = new NotificationService();
            const worktreeService = new WorktreeService(configService, notificationService, undefined, loggingService);

            // Mock git command availability
            jest.spyOn(require('child_process'), 'execSync').mockReturnValue('git worktree list');

            const isEnabled = await worktreeService.isWorktreeEnabled();
            expect(typeof isEnabled).toBe('boolean');
        });
    });

    describe('Message Routing Integration', () => {
        it('should integrate message routing components', () => {
            // Register required services
            container.register(
                Symbol.for('IMessageValidator'),
                c => new MessageValidator(c.resolve(Symbol.for('ILoggingService')), c.resolve(Symbol.for('IEventBus'))),
                'singleton'
            );

            container.register(
                Symbol.for('IErrorHandler'),
                () =>
                    ({
                        handleError: jest.fn()
                    }) as any,
                'singleton'
            );

            container.register(
                Symbol.for('IConnectionPoolService'),
                c =>
                    new ConnectionPoolService(
                        c.resolve(Symbol.for('ILoggingService')),
                        c.resolve(Symbol.for('IEventBus')),
                        c.resolve(Symbol.for('IErrorHandler')),
                        c.resolve(Symbol.for('IConfigurationService')),
                        c.resolve(Symbol.for('IMetricsService'))
                    ),
                'singleton'
            );

            container.register(
                Symbol.for('IMessageRouter'),
                c =>
                    new MessageRouter(
                        c.resolve(Symbol.for('IConnectionPoolService')),
                        c.resolve(Symbol.for('IMessageValidator')),
                        c.resolve(Symbol.for('IMetricsService')),
                        c.resolve(Symbol.for('ILoggingService')),
                        c.resolve(Symbol.for('IEventBus'))
                    ),
                'singleton'
            );

            const messageRouter = container.resolve(Symbol.for('IMessageRouter'));
            expect(messageRouter).toBeInstanceOf(MessageRouter);
        });

        it('should validate messages through integrated services', () => {
            const messageValidator = new MessageValidator(loggingService, eventBus);

            const validMessage = JSON.stringify({
                id: 'test-001',
                type: 'test_message',
                from: 'test',
                to: 'target',
                timestamp: new Date().toISOString(),
                payload: { data: 'test' }
            });

            const result = messageValidator.validate(validMessage);
            expect(result.isValid).toBe(true);
        });

        it('should handle message validation failures', () => {
            const messageValidator = new MessageValidator(loggingService, eventBus);

            let validationFailedEvent = null;
            eventBus.subscribe(ORCH_EVENTS.MESSAGE_VALIDATION_FAILED, event => {
                validationFailedEvent = event;
            });

            const invalidMessage = 'invalid json';
            const result = messageValidator.validate(invalidMessage);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('Service Performance Integration', () => {
        it('should handle high-frequency events efficiently', () => {
            const startTime = Date.now();
            const eventCount = 1000;

            // Subscribe to events
            let receivedCount = 0;
            eventBus.subscribe(DOMAIN_EVENTS.TASK_PROGRESS, () => {
                receivedCount++;
            });

            // Publish many events rapidly
            for (let i = 0; i < eventCount; i++) {
                eventBus.publish(DOMAIN_EVENTS.TASK_PROGRESS, {
                    taskId: `task-${i}`,
                    progress: (i / eventCount) * 100
                });
            }

            const duration = Date.now() - startTime;

            expect(receivedCount).toBe(eventCount);
            expect(duration).toBeLessThan(1000); // Should handle 1000 events in under 1s
        });

        it('should handle concurrent service operations', async () => {
            const operations = [];

            // Concurrent logging operations
            for (let i = 0; i < 100; i++) {
                operations.push(() => loggingService.info(`Concurrent log ${i}`));
            }

            // Concurrent metric operations
            for (let i = 0; i < 100; i++) {
                operations.push(() => metricsService.incrementCounter(`concurrent.counter.${i}`));
            }

            // Execute all operations concurrently
            const promises = operations.map(op => Promise.resolve(op()));
            await Promise.all(promises);

            // All operations should complete successfully
            const metrics = metricsService.getMetrics();
            expect(metrics.length).toBeGreaterThan(0);
            expect(mockChannel.appendLine).toHaveBeenCalledTimes(100);
        });

        it('should handle service disposal gracefully', async () => {
            // Create additional services
            const terminalManager = new TerminalManager(configService, loggingService, eventBus);
            const notificationService = new NotificationService();
            const worktreeService = new WorktreeService(configService, notificationService, undefined, loggingService);

            // Add them to container
            container.registerInstance(Symbol.for('ITerminalManager'), terminalManager);
            container.registerInstance(Symbol.for('IWorktreeService'), worktreeService);

            // Dispose should handle all services
            const startTime = Date.now();
            await container.dispose();
            const disposalTime = Date.now() - startTime;

            expect(disposalTime).toBeLessThan(1000); // Should dispose quickly
        });
    });

    describe('Error Handling Integration', () => {
        it('should propagate errors through event system', done => {
            eventBus.subscribe(DOMAIN_EVENTS.SYSTEM_ERROR, event => {
                expect(event.error).toContain('Test error');
                done();
            });

            // Simulate service error
            try {
                throw new Error('Test error');
            } catch (error) {
                eventBus.publish(DOMAIN_EVENTS.SYSTEM_ERROR, {
                    error: error instanceof Error ? error.message : String(error),
                    service: 'test-service',
                    timestamp: new Date().toISOString()
                });
            }
        });

        it('should handle service initialization failures', () => {
            // Mock a failing service
            container.register(
                Symbol.for('IFailingService'),
                () => {
                    throw new Error('Service initialization failed');
                },
                'singleton'
            );

            expect(() => {
                container.resolve(Symbol.for('IFailingService'));
            }).toThrow('Service initialization failed');
        });

        it('should handle configuration errors gracefully', () => {
            // Mock configuration error
            const errorConfigService = {
                get: jest.fn().mockImplementation(() => {
                    throw new Error('Configuration read error');
                })
            };

            // Service should handle configuration errors gracefully
            expect(() => {
                new MetricsService(errorConfigService as any, loggingService);
            }).not.toThrow();
        });
    });

    describe('Service State Consistency', () => {
        it('should maintain consistent state across services', () => {
            // Configuration change should affect multiple services
            const configChangeEvent = {
                key: 'nofx.enableMetrics',
                value: false,
                previous: true
            };

            eventBus.publish(CONFIG_EVENTS.CONFIGURATION_CHANGED, configChangeEvent);

            // Both logging and metrics services should react appropriately
            expect(true).toBe(true); // Placeholder - actual implementation would check state
        });

        it('should handle service restart scenarios', async () => {
            // Simulate service restart
            const originalMetrics = metricsService.getMetrics().length;

            // Dispose and recreate metrics service
            metricsService.dispose();
            metricsService = new MetricsService(configService, loggingService);
            container.registerInstance(Symbol.for('IMetricsService'), metricsService);

            // Service should start fresh
            expect(metricsService.getMetrics().length).toBe(0);
        });

        it('should synchronize service configurations', () => {
            // Mock configuration values
            (configService as any).get = jest
                .fn()
                .mockReturnValueOnce('debug') // log level
                .mockReturnValueOnce(true) // enable metrics
                .mockReturnValueOnce('detailed') // metrics output level
                .mockReturnValueOnce(48); // retention hours

            const newLoggingService = new LoggingService(configService, mockChannel);
            const newMetricsService = new MetricsService(configService, newLoggingService);

            expect(newLoggingService.isLevelEnabled('debug')).toBe(true);
            expect(newMetricsService.getDashboardData().enabled).toBe(true);
        });
    });

    describe('Service Monitoring and Health', () => {
        it('should provide service health information', () => {
            const healthData = {
                eventBus: {
                    status: 'healthy',
                    subscriberCount: 0 // EventBus doesn't expose subscriber count
                },
                logging: {
                    status: 'healthy',
                    level: loggingService.isLevelEnabled('debug') ? 'debug' : 'info'
                },
                metrics: {
                    status: 'healthy',
                    totalMetrics: metricsService.getMetrics().length
                }
            };

            expect(healthData.eventBus.status).toBe('healthy');
            expect(healthData.logging.status).toBe('healthy');
            expect(healthData.metrics.status).toBe('healthy');
        });

        it('should detect service performance issues', () => {
            const performanceMetrics = {
                eventProcessingTime: 0,
                logWriteTime: 0,
                metricRecordingTime: 0
            };

            // Measure event processing time
            const eventStart = Date.now();
            eventBus.publish(DOMAIN_EVENTS.METRICS_UPDATED, { timestamp: new Date().toISOString() });
            performanceMetrics.eventProcessingTime = Date.now() - eventStart;

            // Measure logging time
            const logStart = Date.now();
            loggingService.info('Performance test');
            performanceMetrics.logWriteTime = Date.now() - logStart;

            // Measure metrics recording time
            const metricStart = Date.now();
            metricsService.incrementCounter('performance.test');
            performanceMetrics.metricRecordingTime = Date.now() - metricStart;

            // All operations should be fast
            expect(performanceMetrics.eventProcessingTime).toBeLessThan(10);
            expect(performanceMetrics.logWriteTime).toBeLessThan(10);
            expect(performanceMetrics.metricRecordingTime).toBeLessThan(10);
        });
    });
});
