import * as vscode from 'vscode';
import { SystemHealthMonitor } from '../../../services/SystemHealthMonitor';
import { ILoggingService, IEventBus } from '../../../services/interfaces';
import { NaturalLanguageService } from '../../../services/NaturalLanguageService';
import { TerminalCommandRouter } from '../../../services/TerminalCommandRouter';
import { AgentNotificationService } from '../../../services/AgentNotificationService';

// Mock vscode module
jest.mock('vscode', () => ({
    window: {
        showErrorMessage: jest.fn()
    },
    workspace: {},
    commands: {
        executeCommand: jest.fn()
    }
}));

// Mock services
jest.mock('../../../services/NaturalLanguageService');
jest.mock('../../../services/TerminalCommandRouter');
jest.mock('../../../services/AgentNotificationService');

describe('SystemHealthMonitor', () => {
    let monitor: SystemHealthMonitor;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockNLService: jest.Mocked<NaturalLanguageService>;
    let mockRouter: jest.Mocked<TerminalCommandRouter>;
    let mockNotificationService: jest.Mocked<AgentNotificationService>;
    let unhandledRejectionHandler: any;

    beforeEach(() => {
        // Create mocks
        mockLoggingService = {
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
        } as any;

        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn().mockReturnValue({ dispose: jest.fn() })
        } as any;

        mockNLService = {
            getHealthStatus: jest.fn().mockReturnValue({
                isHealthy: true,
                failureCount: 0,
                lastSuccess: new Date(),
                cacheSize: 10
            }),
            reset: jest.fn()
        } as any;

        mockRouter = {
            getHealthStatus: jest.fn().mockReturnValue({
                isHealthy: true,
                queueSize: 0,
                failedCommands: 0,
                lastHealthCheck: new Date()
            })
        } as any;

        mockNotificationService = {} as any;

        // Capture unhandled rejection handler
        const originalOn = process.on;
        process.on = jest.fn((event, handler) => {
            if (event === 'unhandledRejection') {
                unhandledRejectionHandler = handler;
            }
            return process;
        }) as any;

        // Create monitor
        monitor = new SystemHealthMonitor(mockLoggingService, mockEventBus);

        // Restore process.on
        process.on = originalOn;

        // Clear all mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        monitor.dispose();
        jest.clearAllTimers();
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        it('should initialize successfully', () => {
            expect(monitor).toBeDefined();
            expect(mockLoggingService.info).toHaveBeenCalledWith('SystemHealthMonitor: Initializing');
        });

        it('should register default components', () => {
            const health = monitor.getSystemHealth();
            const componentNames = health.components.map(c => c.name);

            expect(componentNames).toContain('NaturalLanguageService');
            expect(componentNames).toContain('TerminalCommandRouter');
            expect(componentNames).toContain('AgentNotificationService');
            expect(componentNames).toContain('EventBus');
            expect(componentNames).toContain('VSCodeAPI');
        });

        it('should start health checks automatically', () => {
            jest.useFakeTimers();

            const newMonitor = new SystemHealthMonitor(mockLoggingService, mockEventBus);

            jest.advanceTimersByTime(15000); // HEALTH_CHECK_INTERVAL

            // Should have performed health checks
            const health = newMonitor.getSystemHealth();
            expect(health.components.length).toBeGreaterThan(0);

            newMonitor.dispose();
            jest.useRealTimers();
        });

        it('should work without logging or event bus', () => {
            const monitorWithoutServices = new SystemHealthMonitor();
            expect(monitorWithoutServices).toBeDefined();
            monitorWithoutServices.dispose();
        });
    });

    describe('registerService', () => {
        it('should register NaturalLanguageService', () => {
            monitor.registerService('NaturalLanguageService', mockNLService);

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                'Registered service for monitoring: NaturalLanguageService'
            );
        });

        it('should register TerminalCommandRouter', () => {
            monitor.registerService('TerminalCommandRouter', mockRouter);

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                'Registered service for monitoring: TerminalCommandRouter'
            );
        });

        it('should register AgentNotificationService', () => {
            monitor.registerService('AgentNotificationService', mockNotificationService);

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                'Registered service for monitoring: AgentNotificationService'
            );
        });

        it('should handle unknown service names gracefully', () => {
            monitor.registerService('UnknownService', {});

            expect(mockLoggingService.debug).toHaveBeenCalledWith('Registered service for monitoring: UnknownService');
        });
    });

    describe('health checks', () => {
        beforeEach(() => {
            monitor.registerService('NaturalLanguageService', mockNLService);
            monitor.registerService('TerminalCommandRouter', mockRouter);
        });

        it('should check NaturalLanguageService health', async () => {
            await monitor.forceHealthCheck();

            expect(mockNLService.getHealthStatus).toHaveBeenCalled();
        });

        it('should check TerminalCommandRouter health', async () => {
            await monitor.forceHealthCheck();

            expect(mockRouter.getHealthStatus).toHaveBeenCalled();
        });

        it('should check EventBus health', async () => {
            let testCallback: any;
            mockEventBus.subscribe.mockImplementation((event, callback) => {
                if (event.startsWith('health.check.')) {
                    testCallback = callback;
                }
                return { dispose: jest.fn() };
            });

            mockEventBus.publish.mockImplementation((event, data) => {
                if (event.startsWith('health.check.') && testCallback) {
                    testCallback(data);
                }
            });

            await monitor.forceHealthCheck();

            expect(mockEventBus.subscribe).toHaveBeenCalledWith(
                expect.stringMatching(/^health\.check\.\d+$/),
                expect.any(Function)
            );
            expect(mockEventBus.publish).toHaveBeenCalledWith(expect.stringMatching(/^health\.check\.\d+$/), {
                test: true
            });
        });

        it('should check VS Code API health', async () => {
            await monitor.forceHealthCheck();

            const health = monitor.getSystemHealth();
            const vscodeComponent = health.components.find(c => c.name === 'VSCodeAPI');

            expect(vscodeComponent).toBeDefined();
            expect(vscodeComponent?.isHealthy).toBe(true);
        });

        it('should handle unhealthy NaturalLanguageService', async () => {
            mockNLService.getHealthStatus.mockReturnValue({
                isHealthy: false,
                failureCount: 10,
                lastSuccess: new Date(),
                cacheSize: 0
            });

            await monitor.forceHealthCheck();

            expect(mockLoggingService.warn).toHaveBeenCalledWith('Component NaturalLanguageService became unhealthy');
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'component.unhealthy',
                expect.objectContaining({ component: 'NaturalLanguageService' })
            );
        });

        it('should handle unhealthy TerminalCommandRouter', async () => {
            mockRouter.getHealthStatus.mockReturnValue({
                isHealthy: false,
                queueSize: 50,
                failedCommands: 10,
                lastHealthCheck: new Date()
            });

            await monitor.forceHealthCheck();

            expect(mockLoggingService.warn).toHaveBeenCalledWith('Component TerminalCommandRouter became unhealthy');
        });

        it('should detect system health degradation', async () => {
            // All components healthy first
            await monitor.forceHealthCheck();

            // Make a component unhealthy
            mockNLService.getHealthStatus.mockReturnValue({
                isHealthy: false,
                failureCount: 10,
                lastSuccess: new Date(),
                cacheSize: 0
            });

            await monitor.forceHealthCheck();

            expect(mockLoggingService.warn).toHaveBeenCalledWith(expect.stringContaining('System health degraded'));
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'system.health.degraded',
                expect.objectContaining({ unhealthyCount: expect.any(Number) })
            );
        });

        it('should detect system health restoration', async () => {
            // Make system unhealthy
            mockNLService.getHealthStatus.mockReturnValue({
                isHealthy: false,
                failureCount: 10,
                lastSuccess: new Date(),
                cacheSize: 0
            });
            await monitor.forceHealthCheck();

            // Restore health
            mockNLService.getHealthStatus.mockReturnValue({
                isHealthy: true,
                failureCount: 0,
                lastSuccess: new Date(),
                cacheSize: 10
            });
            await monitor.forceHealthCheck();

            expect(mockLoggingService.info).toHaveBeenCalledWith('System health restored');
            expect(mockEventBus.publish).toHaveBeenCalledWith('system.health.restored', {});
        });

        it('should handle errors during health check', async () => {
            mockNLService.getHealthStatus.mockImplementation(() => {
                throw new Error('Health check error');
            });

            await monitor.forceHealthCheck();

            expect(mockLoggingService.error).toHaveBeenCalledWith('Error during health check:', expect.any(Error));
        });

        it('should warn about slow health checks', async () => {
            // Mock slow health check
            mockNLService.getHealthStatus.mockImplementation(() => {
                const start = Date.now();
                while (Date.now() - start < 1100) {
                    /* spin */
                }
                return { isHealthy: true, failureCount: 0, lastSuccess: new Date(), cacheSize: 0 };
            });

            await monitor.forceHealthCheck();

            expect(mockLoggingService.warn).toHaveBeenCalledWith(expect.stringMatching(/Health check took \d+ms/));
        });
    });

    describe('recovery attempts', () => {
        beforeEach(() => {
            monitor.registerService('NaturalLanguageService', mockNLService);
            monitor.registerService('TerminalCommandRouter', mockRouter);
        });

        it('should attempt recovery for unhealthy components', async () => {
            mockNLService.getHealthStatus.mockReturnValue({
                isHealthy: false,
                failureCount: 10,
                lastSuccess: new Date(),
                cacheSize: 0
            });

            await monitor.forceHealthCheck();

            expect(mockLoggingService.info).toHaveBeenCalledWith('Attempting recovery for NaturalLanguageService');
            expect(mockNLService.reset).toHaveBeenCalled();
        });

        it('should respect recovery cooldown', async () => {
            mockNLService.getHealthStatus.mockReturnValue({
                isHealthy: false,
                failureCount: 10,
                lastSuccess: new Date(),
                cacheSize: 0
            });

            // First recovery attempt
            await monitor.forceHealthCheck();
            expect(mockNLService.reset).toHaveBeenCalledTimes(1);

            // Immediate second check should not trigger recovery (cooldown)
            await monitor.forceHealthCheck();
            expect(mockNLService.reset).toHaveBeenCalledTimes(1);
        });

        it('should limit recovery attempts', async () => {
            mockNLService.getHealthStatus.mockReturnValue({
                isHealthy: false,
                failureCount: 10,
                lastSuccess: new Date(),
                cacheSize: 0
            });
            mockNLService.reset.mockImplementation(() => {
                // Simulate failed recovery
            });

            // Attempt recovery MAX_RECOVERY_ATTEMPTS times
            for (let i = 0; i < 4; i++) {
                await monitor.forceHealthCheck();
                // Wait for cooldown
                await new Promise(resolve => setTimeout(resolve, 60001));
            }

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Component NaturalLanguageService exceeded max recovery attempts'
            );
        });

        it('should clear recovery attempts on successful recovery', async () => {
            // Component unhealthy
            mockNLService.getHealthStatus.mockReturnValueOnce({
                isHealthy: false,
                failureCount: 10,
                lastSuccess: new Date(),
                cacheSize: 0
            });

            await monitor.forceHealthCheck();

            // Component recovers
            mockNLService.getHealthStatus.mockReturnValue({
                isHealthy: true,
                failureCount: 0,
                lastSuccess: new Date(),
                cacheSize: 10
            });
            mockNLService.reset.mockImplementation(() => {
                // Successful recovery
            });

            await monitor.forceHealthCheck();

            expect(mockLoggingService.info).toHaveBeenCalledWith('Successfully recovered NaturalLanguageService');
        });
    });

    describe('critical system failure', () => {
        it('should handle critical failures', async () => {
            // Trigger multiple critical failures
            for (let i = 0; i < 6; i++) {
                mockNLService.getHealthStatus.mockImplementation(() => {
                    throw new Error('Critical error');
                });
                await monitor.forceHealthCheck();
            }

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('NofX System Health Critical'),
                'Reload Window',
                'Disable Extension'
            );
        });

        it('should reload window when user chooses', async () => {
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Reload Window');

            // Trigger critical failure
            for (let i = 0; i < 6; i++) {
                mockNLService.getHealthStatus.mockImplementation(() => {
                    throw new Error('Critical error');
                });
                await monitor.forceHealthCheck();
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
        });

        it('should disable extension when user chooses', async () => {
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Disable Extension');

            // Trigger critical failure
            for (let i = 0; i < 6; i++) {
                mockNLService.getHealthStatus.mockImplementation(() => {
                    throw new Error('Critical error');
                });
                await monitor.forceHealthCheck();
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'workbench.extensions.action.disableExtension',
                'nofx.nofx'
            );
        });
    });

    describe('error event listeners', () => {
        it('should listen for system.error events', () => {
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('system.error', expect.any(Function));
        });

        it('should increment critical failures on system error', () => {
            let errorHandler: any;
            mockEventBus.subscribe.mockImplementation((event, handler) => {
                if (event === 'system.error') {
                    errorHandler = handler;
                }
                return { dispose: jest.fn() };
            });

            const newMonitor = new SystemHealthMonitor(mockLoggingService, mockEventBus);

            errorHandler({ error: 'Test error' });

            const health = newMonitor.getSystemHealth();
            expect(health.criticalFailures).toBe(1);

            newMonitor.dispose();
        });

        it('should handle component.failed events', () => {
            let failedHandler: any;
            mockEventBus.subscribe.mockImplementation((event, handler) => {
                if (event === 'component.failed') {
                    failedHandler = handler;
                }
                return { dispose: jest.fn() };
            });

            const newMonitor = new SystemHealthMonitor(mockLoggingService, mockEventBus);

            failedHandler({ component: 'TestComponent' });

            const health = newMonitor.getSystemHealth();
            const component = health.components.find(c => c.name === 'TestComponent');
            expect(component).toBeUndefined(); // Component not registered, so not in list

            newMonitor.dispose();
        });

        it('should handle unhandled promise rejections', () => {
            if (unhandledRejectionHandler) {
                unhandledRejectionHandler('Test rejection', Promise.reject());

                expect(mockLoggingService.error).toHaveBeenCalledWith('Unhandled promise rejection:', 'Test rejection');

                const health = monitor.getSystemHealth();
                expect(health.criticalFailures).toBeGreaterThan(0);
            }
        });
    });

    describe('getSystemHealth', () => {
        it('should return complete health status', () => {
            const health = monitor.getSystemHealth();

            expect(health).toHaveProperty('isHealthy');
            expect(health).toHaveProperty('components');
            expect(health).toHaveProperty('criticalFailures');
            expect(health).toHaveProperty('recoveryAttempts');
            expect(Array.isArray(health.components)).toBe(true);
            expect(health.recoveryAttempts).toBeInstanceOf(Map);
        });

        it('should include all registered components', () => {
            const health = monitor.getSystemHealth();

            expect(health.components.length).toBe(5); // 5 default components
            health.components.forEach(component => {
                expect(component).toHaveProperty('name');
                expect(component).toHaveProperty('isHealthy');
                expect(component).toHaveProperty('lastCheck');
                expect(component).toHaveProperty('failureCount');
            });
        });
    });

    describe('reset', () => {
        it('should reset all health metrics', async () => {
            // Make system unhealthy
            mockNLService.getHealthStatus.mockReturnValue({
                isHealthy: false,
                failureCount: 10,
                lastSuccess: new Date(),
                cacheSize: 0
            });
            await monitor.forceHealthCheck();

            // Reset
            monitor.reset();

            const health = monitor.getSystemHealth();
            expect(health.isHealthy).toBe(true);
            expect(health.criticalFailures).toBe(0);
            expect(health.recoveryAttempts.size).toBe(0);
            health.components.forEach(component => {
                expect(component.isHealthy).toBe(true);
                expect(component.failureCount).toBe(0);
            });

            expect(mockLoggingService.info).toHaveBeenCalledWith('Resetting system health monitor');
        });
    });

    describe('stop', () => {
        it('should stop health monitoring', () => {
            jest.useFakeTimers();
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            monitor.stop();

            expect(clearIntervalSpy).toHaveBeenCalled();
            expect(mockLoggingService.info).toHaveBeenCalledWith('SystemHealthMonitor stopped');

            jest.useRealTimers();
        });
    });

    describe('dispose', () => {
        it('should clean up all resources', () => {
            const stopSpy = jest.spyOn(monitor, 'stop');

            monitor.dispose();

            expect(stopSpy).toHaveBeenCalled();

            const health = monitor.getSystemHealth();
            expect(health.components.length).toBe(0);
            expect(health.recoveryAttempts.size).toBe(0);
        });
    });

    describe('EventBus health check edge cases', () => {
        it('should handle missing EventBus', async () => {
            const monitorWithoutEventBus = new SystemHealthMonitor(mockLoggingService);
            await monitorWithoutEventBus.forceHealthCheck();

            const health = monitorWithoutEventBus.getSystemHealth();
            const eventBusComponent = health.components.find(c => c.name === 'EventBus');
            expect(eventBusComponent?.isHealthy).toBe(false);

            monitorWithoutEventBus.dispose();
        });

        it('should handle EventBus test event timeout', async () => {
            mockEventBus.subscribe.mockImplementation(() => ({ dispose: jest.fn() }));
            // Don't call the callback - simulate timeout

            await monitor.forceHealthCheck();

            const health = monitor.getSystemHealth();
            const eventBusComponent = health.components.find(c => c.name === 'EventBus');
            expect(eventBusComponent?.isHealthy).toBe(false);
        });

        it('should handle EventBus error during test', async () => {
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('EventBus error');
            });

            await monitor.forceHealthCheck();

            expect(mockLoggingService.error).toHaveBeenCalledWith('EventBus health check failed:', expect.any(Error));
        });
    });

    describe('VS Code API health check edge cases', () => {
        it('should handle missing VS Code APIs', async () => {
            const originalWindow = (vscode as any).window;
            (vscode as any).window = undefined;

            await monitor.forceHealthCheck();

            const health = monitor.getSystemHealth();
            const vscodeComponent = health.components.find(c => c.name === 'VSCodeAPI');
            expect(vscodeComponent?.isHealthy).toBe(false);

            (vscode as any).window = originalWindow;
        });

        it('should handle VS Code API check exceptions', async () => {
            const originalWindow = (vscode as any).window;
            Object.defineProperty(vscode, 'window', {
                get: () => {
                    throw new Error('VS Code API error');
                },
                configurable: true
            });

            await monitor.forceHealthCheck();

            expect(mockLoggingService.error).toHaveBeenCalledWith('VS Code API check failed:', expect.any(Error));

            Object.defineProperty(vscode, 'window', {
                value: originalWindow,
                configurable: true
            });
        });
    });
});
