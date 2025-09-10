import { AgentManager } from '../../agents/AgentManager';
import { TerminalManager } from '../../services/TerminalManager';
import { AgentHealthMonitor } from '../../services/AgentHealthMonitor';
import { TerminalOutputMonitor } from '../../services/TerminalOutputMonitor';
import { ConfigurationService } from '../../services/ConfigurationService';
import { AgentTemplateManager } from '../../agents/AgentTemplateManager';
import { Container } from '../../services/Container';
import {
    IConfigurationService,
    ILoggingService,
    IEventBus,
    ITerminalManager,
    IAgentLifecycleManager,
    IWorktreeService,
    INotificationService,
    IErrorHandler,
    IMetricsService,
    IPersistenceService
} from '../../services/interfaces';
import * as vscode from 'vscode';
import { getAppStateStore } from '../../state/AppStateStore';
import * as selectors from '../../state/selectors';
import * as actions from '../../state/actions';
// Mock VS Code
jest.mock('vscode');

describe('Agent Robustness Integration Tests', () => {
    let agentManager: AgentManager;
    let terminalManager: TerminalManager;
    let healthMonitor: AgentHealthMonitor;
    let configService: ConfigurationService;
    let container: Container;

    // Mock services
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockTerminal: jest.Mocked<vscode.Terminal>;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockLifecycleManager: jest.Mocked<IAgentLifecycleManager>;
    let mockWorktreeService: jest.Mocked<IWorktreeService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockMetricsService: jest.Mocked<IMetricsService>;
    let mockSessionService: jest.Mocked<IPersistenceService>;

    const mockAgent = {
        id: 'integration-test-agent',
        name: 'Integration Test Agent',
        type: 'frontend-specialist',
        status: 'idle' as const,
        currentTask: null,
        template: {
            id: 'frontend-specialist',
            systemPrompt: 'You are a frontend specialist',
            detailedPrompt: 'Detailed instructions for frontend development work'
        }
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Setup mock VS Code workspace
        const mockWorkspaceConfig = {
            get: jest.fn(),
            update: jest.fn(),
            has: jest.fn(),
            inspect: jest.fn()
        };
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockWorkspaceConfig);
        (vscode.workspace.workspaceFolders as any) = [
            {
                uri: { fsPath: '/test/workspace' },
                name: 'Test Workspace',
                index: 0
            }
        ];

        // Setup mock terminal
        mockTerminal = {
            name: 'Test Terminal',
            sendText: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        } as any;

        (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);
        (vscode.EventEmitter as any).mockImplementation(() => ({
            event: jest.fn(),
            fire: jest.fn(),
            dispose: jest.fn()
        }));

        // Setup mock services
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            agents: jest.fn(),
            trace: jest.fn()
        } as any;

        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn()
        } as any;

        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn(),
                update: jest.fn()
            },
            globalState: {
                get: jest.fn(),
                update: jest.fn()
            }
        } as any;

        mockLifecycleManager = {
            spawnAgent: jest.fn().mockResolvedValue(mockAgent),
            removeAgent: jest.fn().mockResolvedValue(true),
            startTaskMonitoring: jest.fn(),
            stopTaskMonitoring: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockWorktreeService = {
            createWorktree: jest.fn(),
            deleteWorktree: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockNotificationService = {
            showInformation: jest.fn(),
            showWarning: jest.fn(),
            showError: jest.fn()
        } as any;

        mockErrorHandler = {
            handleError: jest.fn()
        } as any;

        mockMetricsService = {
            incrementCounter: jest.fn(),
            recordGauge: jest.fn()
        } as any;

        mockSessionService = {
            createSession: jest.fn(),
            saveSession: jest.fn()
        } as any;

        // Setup configuration with robustness settings
        mockWorkspaceConfig.get.mockImplementation((key: string) => {
            const robustnessDefaults: Record<string, any> = {
                'robustness.maxRetries': 3,
                'robustness.baseRetryDelay': 1000,
                'robustness.healthCheckInterval': 10000, // Shorter for testing
                'robustness.initializationTimeout': 15000, // Shorter for testing
                'robustness.responseTimeout': 5000,
                'robustness.maxConsecutiveFailures': 2,
                'robustness.enableAutoRecovery': true,
                'robustness.recoveryStrategy': 'progressive',
                aiProvider: 'claude',
                aiPath: 'claude',
                claudeInitializationDelay: 5 // Shorter for testing
            };
            return robustnessDefaults[key];
        });

        // Initialize services
        configService = new ConfigurationService();
        terminalManager = new TerminalManager(configService, mockLoggingService, mockEventBus, mockErrorHandler);
        healthMonitor = new AgentHealthMonitor(terminalManager, mockLoggingService, mockEventBus, configService);

        agentManager = new AgentManager(mockContext);
        agentManager.setDependencies(
            mockLifecycleManager,
            terminalManager,
            mockWorktreeService,
            configService,
            mockNotificationService,
            mockLoggingService,
            mockEventBus,
            mockErrorHandler,
            mockMetricsService,
            mockSessionService
        );
    });

    afterEach(() => {
        jest.useRealTimers();
        agentManager.dispose();
        terminalManager.dispose();
        healthMonitor.dispose();
        configService.dispose();
    });

    describe('End-to-End Agent Initialization with Robustness', () => {
        it('should successfully initialize agent with retry logic', async () => {
            // Mock terminal health check to fail twice, then succeed
            let healthCheckCallCount = 0;
            jest.spyOn(terminalManager, 'performHealthCheck').mockImplementation(async () => {
                healthCheckCallCount++;
                if (healthCheckCallCount <= 2) {
                    return { healthy: false, issues: ['Connection failed'] };
                }
                return { healthy: true, issues: [] };
            });

            // Spawn agent
            const agent = await agentManager.spawnAgent(mockAgent);

            // Fast-forward through retry delays
            await jest.advanceTimersByTimeAsync(30000);

            expect(agent).toBeDefined();
            expect(agent.id).toBe(mockAgent.id);
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('initialized successfully on attempt 3')
            );
            expect(healthCheckCallCount).toBe(3);
        });

        it('should fail after maximum retry attempts', async () => {
            // Mock health check to always fail
            jest.spyOn(terminalManager, 'performHealthCheck').mockImplementation(async () => ({
                healthy: false,
                issues: ['Persistent connection failure']
            }));

            // Spawn agent should eventually fail
            const spawnPromise = agentManager.spawnAgent(mockAgent);

            // Fast-forward through all retry attempts
            await jest.advanceTimersByTimeAsync(60000);

            await expect(spawnPromise).rejects.toThrow('Agent initialization failed after 3 attempts');
            expect(mockLoggingService.error).toHaveBeenCalledWith(expect.stringContaining('All 3 attempts failed'));
        });

        it('should use exponential backoff between retry attempts', async () => {
            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Test failure']
            });

            const spawnPromise = agentManager.spawnAgent(mockAgent);

            // Track timing of retry attempts
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

            // Let first attempt fail
            await jest.advanceTimersByTimeAsync(1000);

            // Check that setTimeout was called with exponential backoff
            const timeoutCalls = setTimeoutSpy.mock.calls.filter(call => call[1] >= 1000);
            expect(timeoutCalls.length).toBeGreaterThan(0);

            // First retry should be ~1000ms + jitter
            const firstRetryDelay = timeoutCalls[0][1];
            expect(firstRetryDelay).toBeGreaterThanOrEqual(1000);
            expect(firstRetryDelay).toBeLessThanOrEqual(2000);

            // Advance to second retry
            await jest.advanceTimersByTimeAsync(5000);

            // Second retry should be ~2000ms + jitter
            const secondRetryDelay = timeoutCalls[1][1];
            expect(secondRetryDelay).toBeGreaterThanOrEqual(2000);
            expect(secondRetryDelay).toBeLessThanOrEqual(3000);

            await jest.advanceTimersByTimeAsync(60000);
            await expect(spawnPromise).rejects.toThrow();
        });
    });

    describe('Health Monitoring Integration', () => {
        let agent: any;

        beforeEach(async () => {
            // Mock successful initialization
            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: true,
                issues: []
            });

            agent = await agentManager.spawnAgent(mockAgent);
        });

        it('should start health monitoring when agent spawns', () => {
            const healthStatus = agentManager.getAgentHealthStatus(agent.id);

            expect(healthStatus).toBeDefined();
            expect(healthStatus?.agentId).toBe(agent.id);
            expect(healthStatus?.initializationState).toBe('pending');
        });

        it('should trigger recovery when health checks fail consecutively', async () => {
            // Mock health checks to start failing
            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Health check failed']
            });

            // Trigger health checks
            await jest.advanceTimersByTimeAsync(10000); // First check
            await jest.advanceTimersByTimeAsync(10000); // Second check (should trigger recovery)

            const healthStatus = agentManager.getAgentHealthStatus(agent.id);
            expect(healthStatus?.initializationState).toBe('recovering');
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'agent.recovery.started',
                expect.objectContaining({ agentId: agent.id })
            );
        });

        it('should respect recovery strategy configuration', async () => {
            // Change to aggressive recovery strategy
            await configService.update('robustness.recoveryStrategy', 'aggressive');

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Test failure']
            });

            // Trigger consecutive failures
            await jest.advanceTimersByTimeAsync(20000);

            // Should use aggressive recovery (force restart)
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'agent.recovery.started',
                expect.objectContaining({
                    action: expect.objectContaining({
                        type: 'force_restart',
                        description: expect.stringContaining('Aggressive')
                    })
                })
            );
        });

        it('should disable auto-recovery when configured', async () => {
            await configService.update('robustness.enableAutoRecovery', false);

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Test failure']
            });

            // Trigger consecutive failures
            await jest.advanceTimersByTimeAsync(20000);

            const healthStatus = agentManager.getAgentHealthStatus(agent.id);
            expect(healthStatus?.initializationState).not.toBe('recovering');
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'agent.failed',
                expect.objectContaining({
                    agentId: agent.id,
                    requiresManualIntervention: true
                })
            );
        });
    });

    describe('Terminal Output Monitoring Integration', () => {
        let agent: any;
        let outputMonitor: TerminalOutputMonitor;

        beforeEach(async () => {
            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: true,
                issues: []
            });

            outputMonitor = new TerminalOutputMonitor();
            agent = await agentManager.spawnAgent(mockAgent);
        });

        afterEach(() => {
            outputMonitor.dispose();
        });

        it('should detect Claude ready events and update health status', async () => {
            const readyEventSpy = jest.fn();
            outputMonitor.on('claude-ready', readyEventSpy);

            // Start monitoring the agent's terminal
            outputMonitor.monitorTerminal(mockTerminal, agent.id);

            // Simulate Claude ready output
            const handler = (outputMonitor as any).terminalWriteEmitters.get(mockTerminal)?.handler;
            if (handler) {
                handler("I'm Claude, ready to assist!");
            }

            // Should detect Claude ready
            expect(readyEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentId: agent.id,
                    line: "I'm Claude, ready to assist!"
                })
            );
        });

        it('should detect Claude error events and trigger recovery', async () => {
            const errorEventSpy = jest.fn();
            outputMonitor.on('claude-error', errorEventSpy);

            outputMonitor.monitorTerminal(mockTerminal, agent.id);

            // Simulate Claude error output
            const handler = (outputMonitor as any).terminalWriteEmitters.get(mockTerminal)?.handler;
            if (handler) {
                handler('command not found: claude');
            }

            expect(errorEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentId: agent.id,
                    error: 'command not found: claude'
                })
            );
        });

        it('should handle multiple agents independently', async () => {
            const agent2Config = {
                ...mockAgent,
                id: 'integration-test-agent-2',
                name: 'Integration Test Agent 2'
            };

            mockLifecycleManager.spawnAgent.mockResolvedValueOnce({
                ...agent2Config,
                status: 'idle',
                currentTask: null
            });

            const agent2 = await agentManager.spawnAgent(agent2Config);

            // Both agents should have health monitoring
            const health1 = agentManager.getAgentHealthStatus(agent.id);
            const health2 = agentManager.getAgentHealthStatus(agent2.id);

            expect(health1).toBeDefined();
            expect(health2).toBeDefined();
            expect(health1?.agentId).toBe(agent.id);
            expect(health2?.agentId).toBe(agent2.id);

            // Health summary should show both agents
            const summary = agentManager.getAgentHealthSummary();
            expect(summary.total).toBe(2);
        });
    });

    describe('Configuration-Driven Behavior', () => {
        it('should use custom retry parameters from configuration', async () => {
            // Update configuration
            await configService.update('robustness.maxRetries', 5);
            await configService.update('robustness.baseRetryDelay', 500);

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Test failure']
            });

            const spawnPromise = agentManager.spawnAgent(mockAgent);
            await jest.advanceTimersByTimeAsync(30000);

            await expect(spawnPromise).rejects.toThrow('failed after 5 attempts');
            expect(mockLoggingService.info).toHaveBeenCalledWith(expect.stringContaining('Attempt 5/5'));
        });

        it('should use custom health check interval', async () => {
            await configService.update('robustness.healthCheckInterval', 5000);

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: true,
                issues: []
            });

            const agent = await agentManager.spawnAgent(mockAgent);

            // Should perform health checks every 5 seconds
            await jest.advanceTimersByTimeAsync(5000);
            await jest.advanceTimersByTimeAsync(5000);

            // Health check should have been called multiple times
            expect(terminalManager.performHealthCheck).toHaveBeenCalledTimes(2);
        });

        it('should respect initialization timeout configuration', async () => {
            await configService.update('robustness.initializationTimeout', 5000);

            jest.spyOn(terminalManager, 'performHealthCheck').mockImplementation(
                () =>
                    new Promise(resolve => {
                        // Never resolve to simulate hang
                    })
            );

            const spawnPromise = agentManager.spawnAgent(mockAgent);

            // Should timeout after configured time
            await jest.advanceTimersByTimeAsync(5000);

            const healthStatus = agentManager.getAgentHealthStatus(mockAgent.id);
            // The timeout should be handled by the health monitor
            expect(healthStatus?.initializationState).toBe('failed');
        });
    });

    describe('Error Scenarios and Edge Cases', () => {
        it('should handle agent removal during health monitoring', async () => {
            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: true,
                issues: []
            });

            const agent = await agentManager.spawnAgent(mockAgent);

            // Start health monitoring
            await jest.advanceTimersByTimeAsync(1000);

            // Remove agent
            await agentManager.removeAgent(agent.id);

            // Health status should be cleaned up
            const healthStatus = agentManager.getAgentHealthStatus(agent.id);
            expect(healthStatus).toBeUndefined();
        });

        it('should handle configuration service unavailability', async () => {
            // Create services without config service
            const terminalManagerNoConfig = new TerminalManager(
                {} as IConfigurationService, // Empty config service
                mockLoggingService,
                mockEventBus,
                mockErrorHandler
            );

            // Should use defaults when config service is unavailable
            jest.spyOn(terminalManagerNoConfig, 'performHealthCheck').mockResolvedValue({
                healthy: true,
                issues: []
            });

            expect(() => terminalManagerNoConfig.createTerminal('test-agent', mockAgent)).not.toThrow();

            terminalManagerNoConfig.dispose();
        });

        it('should handle terminal disposal during initialization', async () => {
            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Terminal disposed']
            });

            const agent = await agentManager.spawnAgent(mockAgent);

            // Dispose terminal during health monitoring
            mockTerminal.dispose();

            // Should handle gracefully
            await jest.advanceTimersByTimeAsync(10000);

            expect(mockErrorHandler.handleError).not.toHaveBeenCalledWith(
                expect.any(Error),
                expect.stringContaining('disposed terminal')
            );
        });
    });

    describe('Performance and Resource Management', () => {
        it('should not leak memory with multiple agent lifecycle operations', async () => {
            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: true,
                issues: []
            });

            // Create and remove multiple agents
            for (let i = 0; i < 10; i++) {
                const agentConfig = {
                    ...mockAgent,
                    id: `perf-test-agent-${i}`,
                    name: `Performance Test Agent ${i}`
                };

                mockLifecycleManager.spawnAgent.mockResolvedValueOnce({
                    ...agentConfig,
                    status: 'idle',
                    currentTask: null
                });

                const agent = await agentManager.spawnAgent(agentConfig);
                await agentManager.removeAgent(agent.id);
            }

            // No agents should remain in health monitoring
            const summary = agentManager.getAgentHealthSummary();
            expect(summary.total).toBe(0);
        });

        it('should handle rapid health check updates efficiently', async () => {
            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: true,
                issues: []
            });

            const agent = await agentManager.spawnAgent(mockAgent);

            // Perform many rapid health checks
            for (let i = 0; i < 100; i++) {
                await agentManager.performAgentHealthCheck(agent.id);
            }

            // Should complete without errors
            const healthStatus = agentManager.getAgentHealthStatus(agent.id);
            expect(healthStatus?.healthy).toBe(true);
        });

        it('should clean up all resources on disposal', async () => {
            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: true,
                issues: []
            });

            // Create multiple agents
            const agents = [];
            for (let i = 0; i < 3; i++) {
                const agentConfig = {
                    ...mockAgent,
                    id: `cleanup-test-agent-${i}`,
                    name: `Cleanup Test Agent ${i}`
                };

                mockLifecycleManager.spawnAgent.mockResolvedValueOnce({
                    ...agentConfig,
                    status: 'idle',
                    currentTask: null
                });

                const agent = await agentManager.spawnAgent(agentConfig);
                agents.push(agent);
            }

            // Dispose agent manager
            await agentManager.dispose();

            // All resources should be cleaned up
            agents.forEach(agent => {
                const healthStatus = agentManager.getAgentHealthStatus(agent.id);
                expect(healthStatus).toBeUndefined();
            });
        });
    });
});
