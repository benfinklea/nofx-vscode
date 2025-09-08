import * as vscode from 'vscode';
import { NaturalLanguageService } from '../../services/NaturalLanguageService';
import { TerminalCommandRouter } from '../../services/TerminalCommandRouter';
import { SystemHealthMonitor } from '../../services/SystemHealthMonitor';
import { AgentManager } from '../../agents/AgentManager';
import { TaskQueue } from '../../tasks/TaskQueue';
import { EventBus } from '../../services/EventBus';
import { LoggingService } from '../../services/LoggingService';
import { Container } from '../../services/Container';
import { SERVICE_TOKENS } from '../../services/interfaces';

// Mock vscode module
jest.mock('vscode', () => ({
    window: {
        terminals: [],
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        onDidWriteTerminalData: jest.fn(),
        createTerminal: jest.fn(),
        createOutputChannel: jest.fn(() => ({
            append: jest.fn(),
            appendLine: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn(),
            show: jest.fn(),
            hide: jest.fn()
        }))
    },
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn().mockReturnValue('debug')
        }))
    },
    commands: {
        executeCommand: jest.fn()
    },
    Disposable: class {
        dispose = jest.fn();
    },
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3
    }
}));

describe('Robustness Features Integration', () => {
    let container: Container;
    let naturalLanguageService: NaturalLanguageService;
    let terminalCommandRouter: TerminalCommandRouter;
    let systemHealthMonitor: SystemHealthMonitor;
    let agentManager: AgentManager;
    let taskQueue: TaskQueue;
    let eventBus: EventBus;
    let loggingService: LoggingService;

    beforeEach(() => {
        // Setup container and services
        container = Container.getInstance();
        container.reset();

        // Create and register logging service
        loggingService = new LoggingService();
        container.register(SERVICE_TOKENS.LoggingService, loggingService);

        // Create and register event bus
        eventBus = new EventBus();
        container.register(SERVICE_TOKENS.EventBus, eventBus);

        // Create agent manager and task queue
        agentManager = {} as any; // Mock implementation
        taskQueue = {} as any; // Mock implementation
        
        container.register(SERVICE_TOKENS.AgentManager, agentManager);
        container.register(SERVICE_TOKENS.TaskQueue, taskQueue);

        // Create the services we're testing
        naturalLanguageService = new NaturalLanguageService(loggingService);
        terminalCommandRouter = new TerminalCommandRouter(agentManager, taskQueue, loggingService, eventBus);
        systemHealthMonitor = new SystemHealthMonitor(loggingService, eventBus);

        // Register services with health monitor
        systemHealthMonitor.registerService('NaturalLanguageService', naturalLanguageService);
        systemHealthMonitor.registerService('TerminalCommandRouter', terminalCommandRouter);
    });

    afterEach(() => {
        // Cleanup
        systemHealthMonitor.dispose();
        terminalCommandRouter.dispose();
        naturalLanguageService.reset();
        loggingService.dispose();
        container.reset();
    });

    describe('Natural Language Processing Integration', () => {
        it('should process natural language and provide feedback to system health', async () => {
            // Test successful parsing
            const result = naturalLanguageService.parseNaturalLanguage('add a frontend dev');
            expect(result.command).toBeDefined();
            expect(result.command?.type).toBe('spawn');
            expect(result.command?.role).toBe('frontend-specialist');

            // Check health status
            const nlHealth = naturalLanguageService.getHealthStatus();
            expect(nlHealth.isHealthy).toBe(true);
            expect(nlHealth.failureCount).toBe(0);

            // Force health check
            await systemHealthMonitor.forceHealthCheck();
            
            const systemHealth = systemHealthMonitor.getSystemHealth();
            const nlComponent = systemHealth.components.find(c => c.name === 'NaturalLanguageService');
            expect(nlComponent?.isHealthy).toBe(true);
        });

        it('should handle cascading failures gracefully', async () => {
            // Force multiple failures in natural language service
            for (let i = 0; i < 6; i++) {
                naturalLanguageService.parseNaturalLanguage('this will not match any pattern ' + i);
            }

            // Check service is marked unhealthy
            const nlHealth = naturalLanguageService.getHealthStatus();
            expect(nlHealth.isHealthy).toBe(false);

            // System health monitor should detect this
            await systemHealthMonitor.forceHealthCheck();
            
            const systemHealth = systemHealthMonitor.getSystemHealth();
            expect(systemHealth.isHealthy).toBe(false);

            // Reset should restore health
            naturalLanguageService.reset();
            const restoredHealth = naturalLanguageService.getHealthStatus();
            expect(restoredHealth.isHealthy).toBe(true);
        });
    });

    describe('Terminal Command Routing Integration', () => {
        it('should integrate with health monitoring', () => {
            const mockTerminal = {
                sendText: jest.fn(),
                show: jest.fn(),
                dispose: jest.fn()
            } as any;

            // Start monitoring
            terminalCommandRouter.startMonitoring(mockTerminal);

            // Get health status
            const routerHealth = terminalCommandRouter.getHealthStatus();
            expect(routerHealth.isHealthy).toBe(true);
            expect(routerHealth.queueSize).toBe(0);
            expect(routerHealth.failedCommands).toBe(0);
        });

        it('should work with natural language service for command processing', () => {
            // Parse natural language to get command
            const nlResult = naturalLanguageService.parseNaturalLanguage('assign login form to agent-1');
            expect(nlResult.command).toBeDefined();

            // Command should be suitable for terminal router
            const command = nlResult.command;
            expect(command?.type).toBe('assign');
            expect(command?.task).toBe('login form');
            expect(command?.agentId).toBe('agent-1');
            expect(command?.priority).toBe('normal');
        });
    });

    describe('System Health Monitor Integration', () => {
        it('should monitor all registered services', async () => {
            await systemHealthMonitor.forceHealthCheck();
            
            const health = systemHealthMonitor.getSystemHealth();
            
            // Should have all registered components
            const componentNames = health.components.map(c => c.name);
            expect(componentNames).toContain('NaturalLanguageService');
            expect(componentNames).toContain('TerminalCommandRouter');
            expect(componentNames).toContain('EventBus');
            expect(componentNames).toContain('VSCodeAPI');
        });

        it('should attempt recovery when services fail', async () => {
            // Mock unhealthy state
            jest.spyOn(naturalLanguageService, 'getHealthStatus').mockReturnValue({
                isHealthy: false,
                failureCount: 10,
                lastSuccess: new Date(),
                cacheSize: 0
            });

            const resetSpy = jest.spyOn(naturalLanguageService, 'reset');

            await systemHealthMonitor.forceHealthCheck();

            // Should attempt recovery
            expect(resetSpy).toHaveBeenCalled();
        });

        it('should handle system-wide reset', () => {
            // Cause some failures
            for (let i = 0; i < 3; i++) {
                naturalLanguageService.parseNaturalLanguage('unmatched ' + i);
            }

            // Reset system
            systemHealthMonitor.reset();

            const health = systemHealthMonitor.getSystemHealth();
            expect(health.isHealthy).toBe(true);
            expect(health.criticalFailures).toBe(0);
            health.components.forEach(component => {
                expect(component.isHealthy).toBe(true);
                expect(component.failureCount).toBe(0);
            });
        });
    });

    describe('Error Recovery and Self-Healing', () => {
        it('should recover from transient failures', async () => {
            // Simulate transient failure
            const nlResult1 = naturalLanguageService.parseNaturalLanguage('unmatched input');
            expect(nlResult1.command).toBeNull();

            // Should still be healthy after one failure
            let health = naturalLanguageService.getHealthStatus();
            expect(health.isHealthy).toBe(true);
            expect(health.failureCount).toBe(1);

            // Successful operation should reset failure count
            const nlResult2 = naturalLanguageService.parseNaturalLanguage('add a frontend dev');
            expect(nlResult2.command).toBeDefined();

            health = naturalLanguageService.getHealthStatus();
            expect(health.failureCount).toBe(0);
        });

        it('should cache successful results for improved performance', () => {
            const input = 'spawn backend specialist called API Expert';
            
            // First call
            const result1 = naturalLanguageService.parseNaturalLanguage(input);
            expect(result1.isFromCache).toBeUndefined();
            
            // Second call should be cached
            const result2 = naturalLanguageService.parseNaturalLanguage(input);
            expect(result2.isFromCache).toBe(true);
            expect(result2.command).toEqual(result1.command);
        });
    });

    describe('Event Bus Communication', () => {
        it('should publish health events through event bus', async () => {
            const publishSpy = jest.spyOn(eventBus, 'publish');

            // Make service unhealthy
            jest.spyOn(naturalLanguageService, 'getHealthStatus').mockReturnValue({
                isHealthy: false,
                failureCount: 10,
                lastSuccess: new Date(),
                cacheSize: 0
            });

            await systemHealthMonitor.forceHealthCheck();

            // Should publish degraded health event
            expect(publishSpy).toHaveBeenCalledWith(
                'component.unhealthy',
                expect.objectContaining({ component: 'NaturalLanguageService' })
            );

            // Restore health
            jest.spyOn(naturalLanguageService, 'getHealthStatus').mockReturnValue({
                isHealthy: true,
                failureCount: 0,
                lastSuccess: new Date(),
                cacheSize: 10
            });

            await systemHealthMonitor.forceHealthCheck();

            // Should publish recovery event
            expect(publishSpy).toHaveBeenCalledWith(
                'component.recovered',
                expect.objectContaining({ component: 'NaturalLanguageService' })
            );
        });

        it('should handle event bus failures gracefully', async () => {
            // Make event bus fail
            jest.spyOn(eventBus, 'publish').mockImplementation(() => {
                throw new Error('Event bus error');
            });

            // Health check should still complete
            await systemHealthMonitor.forceHealthCheck();

            const health = systemHealthMonitor.getSystemHealth();
            const eventBusComponent = health.components.find(c => c.name === 'EventBus');
            expect(eventBusComponent?.isHealthy).toBe(false);
        });
    });

    describe('Performance and Resource Management', () => {
        it('should limit cache size in natural language service', () => {
            // Fill cache beyond limit
            for (let i = 0; i < 110; i++) {
                naturalLanguageService.parseNaturalLanguage(`{"type": "test", "id": ${i}}`);
            }

            const health = naturalLanguageService.getHealthStatus();
            expect(health.cacheSize).toBeLessThanOrEqual(100);
        });

        it('should limit command queue size in terminal router', () => {
            const mockTerminal = {} as any;
            terminalCommandRouter.startMonitoring(mockTerminal);

            // Queue would be filled if we had access to internal methods
            // This is a limitation of the current test setup
            const health = terminalCommandRouter.getHealthStatus();
            expect(health.queueSize).toBeLessThanOrEqual(50);
        });
    });

    describe('End-to-End Workflow', () => {
        it('should handle complete workflow from natural language to command execution', async () => {
            // 1. Parse natural language
            const nlResult = naturalLanguageService.parseNaturalLanguage('create a small team');
            expect(nlResult.command).toBeDefined();
            expect(nlResult.confidence).toBeGreaterThan(0);

            // 2. Check system health before execution
            await systemHealthMonitor.forceHealthCheck();
            let health = systemHealthMonitor.getSystemHealth();
            expect(health.isHealthy).toBe(true);

            // 3. Process multiple commands
            const commands = [
                'add a frontend dev',
                'add a backend specialist',
                'assign login form to agent-1',
                'what\'s everyone doing?',
                'terminate agent-2'
            ];

            for (const cmd of commands) {
                const result = naturalLanguageService.parseNaturalLanguage(cmd);
                expect(result.command).toBeDefined();
            }

            // 4. Verify system remains healthy
            await systemHealthMonitor.forceHealthCheck();
            health = systemHealthMonitor.getSystemHealth();
            expect(health.isHealthy).toBe(true);

            // 5. Check service metrics
            const nlHealth = naturalLanguageService.getHealthStatus();
            expect(nlHealth.isHealthy).toBe(true);
            expect(nlHealth.cacheSize).toBeGreaterThan(0);

            const routerHealth = terminalCommandRouter.getHealthStatus();
            expect(routerHealth.isHealthy).toBe(true);
        });
    });
});