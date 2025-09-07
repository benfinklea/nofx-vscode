import * as vscode from 'vscode';
import { AgentLifecycleManager } from '../../../services/AgentLifecycleManager';
import { Agent, AgentConfig, AgentStatus } from '../../../agents/types';

// Mock interfaces for testing
interface ITerminalManager {
    createTerminal(agentId: string, config: any): vscode.Terminal;
    initializeAgentTerminal(agent: Agent, workingDirectory?: string): Promise<void>;
    disposeTerminal(agentId: string): void;
}

interface IWorktreeService {
    isAvailable(): boolean;
    createForAgent(agent: Agent): Promise<string | null>;
    removeForAgent(agentId: string): Promise<boolean>;
    cleanupOrphaned(): Promise<void>;
}

interface IConfigurationService {
    get<T>(key: string, defaultValue?: T): T;
}

interface INotificationService {
    showInformation(message: string): Promise<void>;
}

interface ILoggingService {
    debug(message: string): void;
    info(message: string): void;
    getChannel(name: string): vscode.OutputChannel;
}

interface IEventBus {
    publish(event: string, data: any): void;
    subscribe(event: string, handler: Function): void;
}

interface IErrorHandler {
    handleAsync<T>(operation: () => Promise<T>, context: string): Promise<T | null>;
}

// Mock constants
const DOMAIN_EVENTS = {
    AGENT_LIFECYCLE_SPAWNING: 'agent.lifecycle.spawning',
    AGENT_LIFECYCLE_SPAWNED: 'agent.lifecycle.spawned',
    AGENT_LIFECYCLE_REMOVING: 'agent.lifecycle.removing',
    AGENT_LIFECYCLE_REMOVED: 'agent.lifecycle.removed',
    AGENT_STATUS_CHANGED: 'agent.status.changed'
};

// Mock ActivityMonitor and AgentNotificationService
class MockActivityMonitor {
    on = jest.fn();
    startMonitoring = jest.fn();
    stopMonitoring = jest.fn();
    getAllAgentStatuses = jest.fn().mockReturnValue([]);
    dispose = jest.fn();
}

class MockAgentNotificationService {
    notifyUserAttention = jest.fn();
    clearNotification = jest.fn();
    updateStatusBar = jest.fn();
    dispose = jest.fn();
}

// Mock the imported classes - these modules might not exist, so we'll create mocks
const mockActivityMonitorInstance = new MockActivityMonitor();
const mockAgentNotificationServiceInstance = new MockAgentNotificationService();

jest.mock('../../../services/ActivityMonitor', () => ({
    ActivityMonitor: jest.fn(() => mockActivityMonitorInstance)
}));

jest.mock('../../../services/AgentNotificationService', () => ({
    AgentNotificationService: jest.fn(() => mockAgentNotificationServiceInstance)
}));

// Mock VS Code API
const mockTerminal = {
    show: jest.fn(),
    sendText: jest.fn(),
    dispose: jest.fn(),
    name: 'Test Terminal'
} as unknown as vscode.Terminal;

const mockOutputChannel = {
    appendLine: jest.fn(),
    dispose: jest.fn(),
    name: 'Test Output'
} as unknown as vscode.OutputChannel;

Object.defineProperty(vscode.window, 'createOutputChannel', {
    value: jest.fn().mockReturnValue(mockOutputChannel),
    configurable: true
});

describe('AgentLifecycleManager', () => {
    let lifecycleManager: AgentLifecycleManager;
    let mockTerminalManager: jest.Mocked<ITerminalManager>;
    let mockWorktreeService: jest.Mocked<IWorktreeService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockOnAgentUpdate: jest.Mock;

    const mockAgentConfig: AgentConfig = {
        name: 'Test Agent',
        type: 'frontend-specialist',
        template: {
            id: 'frontend-specialist',
            name: 'Frontend Specialist',
            icon: '🎨',
            systemPrompt: 'You are a frontend expert',
            capabilities: ['React', 'Vue', 'CSS']
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock terminal manager
        mockTerminalManager = {
            createTerminal: jest.fn().mockReturnValue(mockTerminal),
            initializeAgentTerminal: jest.fn().mockResolvedValue(undefined),
            disposeTerminal: jest.fn()
        };

        // Setup mock worktree service
        mockWorktreeService = {
            isAvailable: jest.fn().mockReturnValue(true),
            createForAgent: jest.fn().mockResolvedValue('/worktree/path'),
            removeForAgent: jest.fn().mockResolvedValue(true),
            cleanupOrphaned: jest.fn().mockResolvedValue(undefined)
        };

        // Setup mock config service
        mockConfigService = {
            get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
                const values: Record<string, any> = {
                    'nofx.monitoring.autoComplete': true
                };
                return values[key] ?? defaultValue;
            })
        };

        // Setup mock notification service
        mockNotificationService = {
            showInformation: jest.fn().mockResolvedValue(undefined)
        };

        // Setup mock logging service
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            getChannel: jest.fn().mockReturnValue(mockOutputChannel)
        };

        // Setup mock event bus
        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn()
        };

        // Setup mock error handler
        mockErrorHandler = {
            handleAsync: jest.fn().mockImplementation(async operation => {
                try {
                    return await operation();
                } catch (error) {
                    return null;
                }
            })
        };

        // Setup mock callback
        mockOnAgentUpdate = jest.fn();

        lifecycleManager = new AgentLifecycleManager(
            mockTerminalManager,
            mockWorktreeService,
            mockConfigService,
            mockNotificationService,
            mockOnAgentUpdate,
            mockLoggingService,
            mockEventBus,
            mockErrorHandler
        );
    });

    afterEach(() => {
        lifecycleManager?.dispose();
    });

    describe('initialization', () => {
        it('should initialize with all dependencies', () => {
            expect(lifecycleManager).toBeInstanceOf(AgentLifecycleManager);
        });

        it('should initialize without optional dependencies', () => {
            const simpleManager = new AgentLifecycleManager(
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockOnAgentUpdate
            );
            expect(simpleManager).toBeInstanceOf(AgentLifecycleManager);
            simpleManager.dispose();
        });

        it('should setup monitoring listeners', () => {
            // Verify ActivityMonitor was instantiated and listeners were set up
            expect(mockActivityMonitorInstance.on).toHaveBeenCalledWith('monitoring-event', expect.any(Function));
            expect(mockActivityMonitorInstance.on).toHaveBeenCalledWith('agent-status-changed', expect.any(Function));
        });

        it('should cleanup orphaned worktrees on initialization', async () => {
            await lifecycleManager.initialize();

            expect(mockWorktreeService.cleanupOrphaned).toHaveBeenCalled();
        });
    });

    describe('spawnAgent', () => {
        it('should spawn agent successfully with all features', async () => {
            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            expect(agent).toMatchObject({
                name: 'Test Agent',
                type: 'frontend-specialist',
                status: 'idle',
                terminal: mockTerminal,
                currentTask: null,
                tasksCompleted: 0,
                template: mockAgentConfig.template
            });

            expect(agent.id).toMatch(/^agent-\d+-[a-z0-9]+$/);
            expect(agent.startTime).toBeInstanceOf(Date);
            expect(mockTerminalManager.createTerminal).toHaveBeenCalled();
            expect(mockWorktreeService.createForAgent).toHaveBeenCalledWith(agent);
            expect(mockTerminalManager.initializeAgentTerminal).toHaveBeenCalledWith(agent, '/worktree/path');
        });

        it('should spawn agent with restored ID', async () => {
            const restoredId = 'restored-agent-123';
            const agent = await lifecycleManager.spawnAgent(mockAgentConfig, restoredId);

            expect(agent.id).toBe(restoredId);
        });

        it('should assign correct terminal icon based on agent type', async () => {
            const testCases = [
                { type: 'frontend', expectedIcon: 'symbol-color' },
                { type: 'backend', expectedIcon: 'server' },
                { type: 'fullstack', expectedIcon: 'layers' },
                { type: 'mobile', expectedIcon: 'device-mobile' },
                { type: 'database', expectedIcon: 'database' },
                { type: 'devops', expectedIcon: 'cloud' },
                { type: 'testing', expectedIcon: 'beaker' },
                { type: 'ai', expectedIcon: 'hubot' },
                { type: 'unknown', expectedIcon: 'person' }
            ];

            for (const testCase of testCases) {
                jest.clearAllMocks();
                const config = { ...mockAgentConfig, type: testCase.type };

                await lifecycleManager.spawnAgent(config);

                expect(mockTerminalManager.createTerminal).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                        terminalIcon: testCase.expectedIcon
                    })
                );
            }
        });

        it('should handle worktree creation failure gracefully', async () => {
            mockWorktreeService.createForAgent.mockResolvedValueOnce(null);

            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            expect(agent).toBeDefined();
            expect(mockTerminalManager.initializeAgentTerminal).toHaveBeenCalledWith(agent, undefined);
        });

        it('should handle worktree unavailable', async () => {
            mockWorktreeService.isAvailable.mockReturnValueOnce(false);

            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            expect(mockWorktreeService.createForAgent).not.toHaveBeenCalled();
            expect(mockTerminalManager.initializeAgentTerminal).toHaveBeenCalledWith(agent, undefined);
        });

        it('should handle terminal initialization failure', async () => {
            mockTerminalManager.initializeAgentTerminal.mockRejectedValueOnce(new Error('Terminal init failed'));

            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            expect(agent.status).toBe('offline'); // Should remain offline if terminal init fails
            expect(mockErrorHandler.handleAsync).toHaveBeenCalled();
        });

        it('should use LoggingService channel when available', async () => {
            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            expect(mockLoggingService.getChannel).toHaveBeenCalledWith('Agent: Test Agent');
        });

        it('should create VS Code output channel when LoggingService unavailable', async () => {
            const managerWithoutLogging = new AgentLifecycleManager(
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockOnAgentUpdate
            );

            await managerWithoutLogging.spawnAgent(mockAgentConfig);

            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('n of x: Test Agent');

            managerWithoutLogging.dispose();
        });

        it('should publish lifecycle events', async () => {
            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNING, {
                agentId: agent.id,
                config: mockAgentConfig
            });
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, {
                agentId: agent.id,
                agent
            });
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, {
                agentId: agent.id,
                status: 'idle'
            });
        });

        it('should start activity monitoring', async () => {
            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            expect(mockActivityMonitorInstance.startMonitoring).toHaveBeenCalledWith(agent, mockTerminal);
        });

        it('should log agent creation details', async () => {
            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            expect(mockLoggingService.debug).toHaveBeenCalledWith(`Created agent ${agent.id} with status: offline`);
            expect(mockLoggingService.info).toHaveBeenCalledWith('Agent Test Agent ready.');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '✅ Agent Test Agent (frontend-specialist) initialized'
            );
        });

        it('should delay terminal initialization to avoid connection issues', async () => {
            jest.useFakeTimers();

            const spawnPromise = lifecycleManager.spawnAgent(mockAgentConfig);

            // Fast-forward through the delay
            jest.advanceTimersByTime(500);

            const agent = await spawnPromise;

            expect(agent).toBeDefined();
            expect(mockTerminalManager.initializeAgentTerminal).toHaveBeenCalled();

            jest.useRealTimers();
        });
    });

    describe('removeAgent', () => {
        let testAgent: Agent;

        beforeEach(async () => {
            testAgent = await lifecycleManager.spawnAgent(mockAgentConfig);
        });

        it('should remove agent successfully', async () => {
            const result = await lifecycleManager.removeAgent(testAgent.id);

            expect(result).toBe(true);
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_LIFECYCLE_REMOVING, {
                agentId: testAgent.id
            });
            expect(mockActivityMonitorInstance.stopMonitoring).toHaveBeenCalledWith(testAgent.id);
            expect(mockAgentNotificationServiceInstance.clearNotification).toHaveBeenCalledWith(testAgent.id);
            expect(mockWorktreeService.removeForAgent).toHaveBeenCalledWith(testAgent.id);
            expect(mockTerminalManager.disposeTerminal).toHaveBeenCalledWith(testAgent.id);
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_LIFECYCLE_REMOVED, {
                agentId: testAgent.id
            });
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('Agent removed successfully');
            expect(mockLoggingService.info).toHaveBeenCalledWith(`Agent ${testAgent.id} removed successfully`);
        });

        it('should handle worktree removal failure', async () => {
            mockWorktreeService.removeForAgent.mockResolvedValueOnce(false);

            const result = await lifecycleManager.removeAgent(testAgent.id);

            expect(result).toBe(false);
            expect(mockTerminalManager.disposeTerminal).not.toHaveBeenCalled();
            expect(mockEventBus.publish).not.toHaveBeenCalledWith(
                DOMAIN_EVENTS.AGENT_LIFECYCLE_REMOVED,
                expect.anything()
            );
        });

        it('should dispose output channel only when not managed by LoggingService', async () => {
            const managerWithoutLogging = new AgentLifecycleManager(
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockOnAgentUpdate
            );

            const agent = await managerWithoutLogging.spawnAgent(mockAgentConfig);
            await managerWithoutLogging.removeAgent(agent.id);

            expect(mockOutputChannel.dispose).toHaveBeenCalled();

            managerWithoutLogging.dispose();
        });

        it('should not dispose output channel when managed by LoggingService', async () => {
            await lifecycleManager.removeAgent(testAgent.id);

            expect(mockOutputChannel.dispose).not.toHaveBeenCalled();
        });

        it('should log removal debug information', async () => {
            await lifecycleManager.removeAgent(testAgent.id);

            expect(mockLoggingService.debug).toHaveBeenCalledWith(`Removing agent ${testAgent.id}`);
        });
    });

    describe('monitoring event handling', () => {
        let testAgent: Agent;

        beforeEach(async () => {
            testAgent = await lifecycleManager.spawnAgent(mockAgentConfig);
            jest.clearAllMocks(); // Clear spawn-related calls
        });

        it('should handle permission monitoring events', () => {
            const event = {
                agentId: testAgent.id,
                type: 'permission',
                data: { message: 'Permission required' }
            };

            // Simulate the monitoring event
            const monitoringHandler = (lifecycleManager as any).handleMonitoringEvent.bind(lifecycleManager);
            monitoringHandler(event);

            expect(mockAgentNotificationServiceInstance.notifyUserAttention).toHaveBeenCalledWith(
                expect.objectContaining({ id: testAgent.id }),
                'permission',
                event
            );
        });

        it('should handle inactivity warning events', () => {
            const event = {
                agentId: testAgent.id,
                type: 'inactivity',
                data: { level: 'warning' }
            };

            const monitoringHandler = (lifecycleManager as any).handleMonitoringEvent.bind(lifecycleManager);
            monitoringHandler(event);

            expect(mockAgentNotificationServiceInstance.notifyUserAttention).toHaveBeenCalledWith(
                expect.objectContaining({ id: testAgent.id }),
                'inactive',
                event
            );
        });

        it('should handle inactivity alert events', () => {
            const event = {
                agentId: testAgent.id,
                type: 'inactivity',
                data: { level: 'alert' }
            };

            const monitoringHandler = (lifecycleManager as any).handleMonitoringEvent.bind(lifecycleManager);
            monitoringHandler(event);

            expect(mockAgentNotificationServiceInstance.notifyUserAttention).toHaveBeenCalledWith(
                expect.objectContaining({ id: testAgent.id }),
                'stuck',
                event
            );
        });

        it('should handle error monitoring events', () => {
            const event = {
                agentId: testAgent.id,
                type: 'error',
                data: { error: 'Test error' }
            };

            const monitoringHandler = (lifecycleManager as any).handleMonitoringEvent.bind(lifecycleManager);
            monitoringHandler(event);

            expect(mockAgentNotificationServiceInstance.notifyUserAttention).toHaveBeenCalledWith(
                expect.objectContaining({ id: testAgent.id }),
                'error',
                event
            );
        });

        it('should handle completion events with auto-complete enabled', () => {
            const event = {
                agentId: testAgent.id,
                type: 'completion',
                data: { task: 'Test task' }
            };

            const monitoringHandler = (lifecycleManager as any).handleMonitoringEvent.bind(lifecycleManager);
            monitoringHandler(event);

            expect(mockAgentNotificationServiceInstance.notifyUserAttention).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: testAgent.id,
                    currentTask: null,
                    tasksCompleted: 1
                }),
                'completion',
                event
            );
            expect(mockOnAgentUpdate).toHaveBeenCalled();
        });

        it('should handle completion events with auto-complete disabled', () => {
            mockConfigService.get.mockReturnValueOnce(false);

            const event = {
                agentId: testAgent.id,
                type: 'completion',
                data: { task: 'Test task' }
            };

            const monitoringHandler = (lifecycleManager as any).handleMonitoringEvent.bind(lifecycleManager);
            monitoringHandler(event);

            expect(mockAgentNotificationServiceInstance.notifyUserAttention).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: testAgent.id,
                    currentTask: null, // Should still be null but tasksCompleted shouldn't increase
                    tasksCompleted: 0
                }),
                'completion',
                event
            );
            expect(mockOnAgentUpdate).not.toHaveBeenCalled();
        });

        it('should ignore events for unknown agents', () => {
            const event = {
                agentId: 'unknown-agent',
                type: 'permission',
                data: {}
            };

            const monitoringHandler = (lifecycleManager as any).handleMonitoringEvent.bind(lifecycleManager);
            monitoringHandler(event);

            expect(mockAgentNotificationServiceInstance.notifyUserAttention).not.toHaveBeenCalled();
        });

        it('should handle agent status change events', () => {
            const statusChangeData = {
                agentId: testAgent.id,
                newStatus: 'working'
            };

            const statusChangeHandler = (lifecycleManager as any).handleAgentStatusChange.bind(lifecycleManager);
            statusChangeHandler(statusChangeData);

            expect(mockOnAgentUpdate).toHaveBeenCalled();
            expect(mockAgentNotificationServiceInstance.updateStatusBar).toHaveBeenCalledWith([]);
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, {
                agentId: testAgent.id,
                status: testAgent.status,
                activityStatus: 'working'
            });
        });

        it('should ignore status changes for unknown agents', () => {
            const statusChangeData = {
                agentId: 'unknown-agent',
                newStatus: 'working'
            };

            const statusChangeHandler = (lifecycleManager as any).handleAgentStatusChange.bind(lifecycleManager);
            statusChangeHandler(statusChangeData);

            expect(mockOnAgentUpdate).not.toHaveBeenCalled();
            expect(mockEventBus.publish).not.toHaveBeenCalled();
        });
    });

    describe('disposal', () => {
        it('should dispose all resources', () => {
            lifecycleManager.dispose();

            expect(mockActivityMonitorInstance.dispose).toHaveBeenCalled();
            expect(mockAgentNotificationServiceInstance.dispose).toHaveBeenCalled();
        });

        it('should dispose output channels when not managed by LoggingService', () => {
            const managerWithoutLogging = new AgentLifecycleManager(
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockOnAgentUpdate
            );

            managerWithoutLogging.dispose();

            // Since no agents were created, no output channels to dispose
            expect(() => managerWithoutLogging.dispose()).not.toThrow();
        });

        it('should not dispose output channels when managed by LoggingService', () => {
            lifecycleManager.dispose();

            expect(mockOutputChannel.dispose).not.toHaveBeenCalled();
        });

        it('should clear agents map', async () => {
            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            lifecycleManager.dispose();

            // Verify internal state is cleared (we can't access private members directly,
            // but we can verify disposal doesn't throw)
            expect(() => lifecycleManager.dispose()).not.toThrow();
        });
    });

    describe('error handling', () => {
        it('should handle worktree creation errors gracefully', async () => {
            mockWorktreeService.createForAgent.mockRejectedValueOnce(new Error('Worktree creation failed'));

            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            expect(agent).toBeDefined();
            expect(mockErrorHandler.handleAsync).toHaveBeenCalled();
        });

        it('should handle terminal initialization errors gracefully', async () => {
            mockErrorHandler.handleAsync.mockImplementationOnce(async (operation, context) => {
                try {
                    await operation();
                } catch (error) {
                    // Simulate error handler logging but not throwing
                    return null;
                }
            });
            mockTerminalManager.initializeAgentTerminal.mockRejectedValueOnce(new Error('Terminal failed'));

            const agent = await lifecycleManager.spawnAgent(mockAgentConfig);

            expect(agent).toBeDefined();
            expect(mockErrorHandler.handleAsync).toHaveBeenCalledWith(
                expect.any(Function),
                'Error initializing agent terminal'
            );
        });
    });

    describe('edge cases', () => {
        it('should handle empty agent name', async () => {
            const configWithEmptyName = { ...mockAgentConfig, name: '' };

            const agent = await lifecycleManager.spawnAgent(configWithEmptyName);

            expect(agent.name).toBe('');
            expect(mockLoggingService.getChannel).toHaveBeenCalledWith('Agent: ');
        });

        it('should handle agent without template', async () => {
            const configWithoutTemplate = {
                name: 'Test Agent',
                type: 'general'
            };

            const agent = await lifecycleManager.spawnAgent(configWithoutTemplate);

            expect(agent.template).toBeUndefined();
            expect(agent.type).toBe('general');
        });

        it('should handle concurrent agent spawning', async () => {
            const promises = [
                lifecycleManager.spawnAgent({ ...mockAgentConfig, name: 'Agent 1' }),
                lifecycleManager.spawnAgent({ ...mockAgentConfig, name: 'Agent 2' }),
                lifecycleManager.spawnAgent({ ...mockAgentConfig, name: 'Agent 3' })
            ];

            const agents = await Promise.all(promises);

            expect(agents).toHaveLength(3);
            expect(agents[0].id).not.toBe(agents[1].id);
            expect(agents[1].id).not.toBe(agents[2].id);
            expect(agents[0].name).toBe('Agent 1');
            expect(agents[1].name).toBe('Agent 2');
            expect(agents[2].name).toBe('Agent 3');
        });

        it('should handle removal of non-existent agent', async () => {
            const result = await lifecycleManager.removeAgent('non-existent-agent');

            expect(result).toBe(true); // Should still return true as removal "succeeded"
            expect(mockActivityMonitorInstance.stopMonitoring).toHaveBeenCalledWith('non-existent-agent');
        });
    });
});
