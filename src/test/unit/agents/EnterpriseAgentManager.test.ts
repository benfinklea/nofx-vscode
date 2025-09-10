import {
    EnterpriseAgentManager,
    AgentManagerError,
    AgentNotFoundError,
    AgentSpawnError,
    DependencyNotSetError
} from '../../../agents/EnterpriseAgentManager';
import { AgentConfig, SmartAgentSpawnConfig, SmartTeamSpawnConfig } from '../../../agents/types';
import { PersistenceService } from '../../../services/PersistenceService';
import * as vscode from 'vscode';
import {
    IAgentLifecycleManager,
    ITerminalManager,
    IWorktreeService,
    IConfigurationService,
    INotificationService,
    ILoggingService,
    IEventBus,
    IErrorHandler,
    IPersistenceService
} from '../../../services/interfaces';
import { EVENTS } from '../../../services/EventConstants';
import { getAppStateStore } from '../../../state/AppStateStore';
import * as selectors from '../../../state/selectors';
import * as actions from '../../../state/actions';
// Mock all dependencies
jest.mock('../../../services/PersistenceService');
jest.mock('../../../services/MonitoringService', () => ({
    monitoringService: {
        startMonitoring: jest.fn(),
        stopMonitoring: jest.fn(),
        getAgentStatus: jest.fn(),
        getSystemHealth: jest.fn(() => ({
            healthy: true,
            components: new Map(),
            lastCheck: new Date()
        }))
    }
}));

describe('EnterpriseAgentManager', () => {
    let manager: EnterpriseAgentManager;
    let mockContext: vscode.ExtensionContext;
    let mockPersistence: jest.Mocked<PersistenceService>;
    let mockAgentLifecycleManager: jest.Mocked<IAgentLifecycleManager>;
    let mockTerminalManager: jest.Mocked<ITerminalManager>;
    let mockWorktreeService: jest.Mocked<IWorktreeService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockPersistenceService: jest.Mocked<IPersistenceService>;

    beforeEach(() => {
        // Setup mock context
        mockContext = {
            subscriptions: [],
            extensionUri: { fsPath: '/test/extension' } as any,
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn(() => [])
            } as any,
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn(() => [])
            } as any
        } as any;

        // Setup mock persistence
        mockPersistence = {
            loadAgentState: jest.fn().mockResolvedValue([]),
            saveAgentState: jest.fn().mockResolvedValue(undefined),
            saveAgentSession: jest.fn().mockResolvedValue(undefined),
            getAgentContextSummary: jest.fn().mockResolvedValue(null)
        } as any;

        // Setup mock services
        mockAgentLifecycleManager = {
            initialize: jest.fn().mockResolvedValue(undefined),
            spawnAgent: jest.fn().mockResolvedValue({
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test',
                status: 'idle',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            }),
            removeAgent: jest.fn().mockResolvedValue(true),
            startTaskMonitoring: jest.fn(),
            stopTaskMonitoring: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockTerminalManager = {
            createTerminal: jest.fn().mockReturnValue({
                show: jest.fn(),
                sendText: jest.fn(),
                dispose: jest.fn()
            }),
            createEphemeralTerminal: jest.fn().mockReturnValue({
                show: jest.fn(),
                sendText: jest.fn(),
                dispose: jest.fn()
            }),
            getTerminal: jest.fn().mockReturnValue({
                show: jest.fn(),
                sendText: jest.fn(),
                dispose: jest.fn()
            }),
            onTerminalClosed: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            dispose: jest.fn()
        } as any;

        mockWorktreeService = {
            dispose: jest.fn()
        } as any;

        mockConfigService = {
            getAiPath: jest.fn().mockReturnValue('claude'),
            update: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockNotificationService = {
            showInformation: jest.fn().mockResolvedValue(undefined),
            showWarning: jest.fn().mockResolvedValue(undefined),
            showError: jest.fn().mockResolvedValue(undefined),
            showInputBox: jest.fn().mockResolvedValue(undefined),
            showQuickPick: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockLoggingService = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn()
        } as any;

        mockEventBus = {
            publish: jest.fn()
        } as any;

        mockErrorHandler = {
            handleError: jest.fn()
        } as any;

        mockPersistenceService = {
            createSession: jest.fn().mockResolvedValue(undefined)
        } as any;

        // Create manager instance
        manager = new EnterpriseAgentManager(mockContext, mockPersistence);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with context and persistence', () => {
            expect(manager).toBeDefined();
            expect(manager.onAgentUpdate).toBeDefined();
        });

        it('should initialize without persistence', () => {
            const managerWithoutPersistence = new EnterpriseAgentManager(mockContext);
            expect(managerWithoutPersistence).toBeDefined();
        });
    });

    describe('setDependencies', () => {
        it('should set all dependencies successfully', () => {
            expect(() => {
                manager.setDependencies(
                    mockAgentLifecycleManager,
                    mockTerminalManager,
                    mockWorktreeService,
                    mockConfigService,
                    mockNotificationService,
                    mockLoggingService,
                    mockEventBus,
                    mockErrorHandler,
                    mockPersistenceService
                );
            }).not.toThrow();

            expect(mockLoggingService.info).toHaveBeenCalledWith(
                'EnterpriseAgentManager dependencies set successfully'
            );
        });

        it('should throw error if required dependency is missing', () => {
            expect(() => {
                manager.setDependencies(
                    null as any,
                    mockTerminalManager,
                    mockWorktreeService,
                    mockConfigService,
                    mockNotificationService
                );
            }).toThrow(DependencyNotSetError);
        });

        it('should setup terminal close event listener', () => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService
            );

            expect(mockTerminalManager.onTerminalClosed).toHaveBeenCalled();
        });
    });

    describe('initialize', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should initialize successfully without showing setup dialog', async () => {
            await manager.initialize(false);

            expect(mockAgentLifecycleManager.initialize).toHaveBeenCalled();
            expect(mockConfigService.getAiPath).toHaveBeenCalled();
            expect(mockLoggingService.info).toHaveBeenCalledWith('EnterpriseAgentManager initialized successfully');
        });

        it('should show setup dialog when requested', async () => {
            mockNotificationService.showInformation.mockResolvedValueOnce('Test Claude');

            await manager.initialize(true);

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                expect.stringContaining('NofX Enterprise Conductor ready'),
                'Test Claude',
                'Change Path',
                'Restore Session'
            );
            expect(mockTerminalManager.createEphemeralTerminal).toHaveBeenCalled();
        });

        it('should handle Change Path option in setup dialog', async () => {
            mockNotificationService.showInformation.mockResolvedValueOnce('Change Path');
            mockNotificationService.showInputBox.mockResolvedValueOnce('/new/path/claude');

            await manager.initialize(true);

            expect(mockNotificationService.showInputBox).toHaveBeenCalled();
            const vscode = require('vscode');
            expect(mockConfigService.update).toHaveBeenCalledWith(
                'aiPath',
                '/new/path/claude',
                vscode.ConfigurationTarget.Global
            );
        });

        it('should handle Restore Session option in setup dialog', async () => {
            mockNotificationService.showInformation.mockResolvedValueOnce('Restore Session');
            mockPersistence.loadAgentState.mockResolvedValueOnce([
                { id: 'agent-1', name: 'Saved Agent', type: 'test', status: 'idle', template: 'test-template' }
            ]);

            await manager.initialize(true);

            expect(mockPersistence.loadAgentState).toHaveBeenCalled();
        });

        it('should retry on transient failures', async () => {
            mockAgentLifecycleManager.initialize
                .mockRejectedValueOnce(new Error('Transient error'))
                .mockResolvedValueOnce(undefined);

            await manager.initialize(false);

            expect(mockAgentLifecycleManager.initialize).toHaveBeenCalledTimes(2);
            expect(mockLoggingService.info).toHaveBeenCalledWith('EnterpriseAgentManager initialized successfully');
        });

        it('should throw error after max retries', async () => {
            mockAgentLifecycleManager.initialize.mockRejectedValue(new Error('Persistent error'));

            await expect(manager.initialize(false)).rejects.toThrow();
            expect(mockAgentLifecycleManager.initialize).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
        });

        it('should throw error if dependencies not set', async () => {
            const newManager = new EnterpriseAgentManager(mockContext, mockPersistence);

            await expect(newManager.initialize(false)).rejects.toThrow(DependencyNotSetError);
        });
    });

    describe('spawnAgent', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should spawn agent successfully with valid config', async () => {
            const config: AgentConfig = {
                name: 'Test Agent',
                type: 'test-type'
            };

            const agent = await manager.spawnAgent(config);

            expect(agent).toBeDefined();
            expect(agent.id).toBe('agent-1');
            expect(agent.name).toBe('Test Agent');
            expect(mockAgentLifecycleManager.spawnAgent).toHaveBeenCalledWith(config, undefined);
            expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.AGENT_CREATED, expect.any(Object));
        });

        it('should spawn agent with restored ID', async () => {
            const config: AgentConfig = {
                name: 'Restored Agent',
                type: 'test-type'
            };

            await manager.spawnAgent(config, 'restored-id');

            expect(mockAgentLifecycleManager.spawnAgent).toHaveBeenCalledWith(config, 'restored-id');
        });

        it('should validate and sanitize agent configuration', async () => {
            const config: AgentConfig = {
                name: '<script>alert("xss")</script>',
                type: 'test-type'
            };

            await expect(manager.spawnAgent(config)).rejects.toThrow(AgentSpawnError);
        });

        it('should throw error for invalid agent name', async () => {
            const config: AgentConfig = {
                name: '',
                type: 'test-type'
            };

            await expect(manager.spawnAgent(config)).rejects.toThrow(AgentSpawnError);
        });

        it('should throw error for invalid agent type', async () => {
            const config: AgentConfig = {
                name: 'Test Agent',
                type: ''
            };

            await expect(manager.spawnAgent(config)).rejects.toThrow(AgentSpawnError);
        });

        it('should create session for new agent', async () => {
            const config: AgentConfig = {
                name: 'Test Agent',
                type: 'test-type'
            };

            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

            await manager.spawnAgent(config);

            expect(mockPersistenceService.createSession).toHaveBeenCalled();
        });

        it('should not create session for restored agent', async () => {
            const config: AgentConfig = {
                name: 'Test Agent',
                type: 'test-type',
                context: { sessionId: 'existing-session' }
            };

            await manager.spawnAgent(config);

            expect(mockPersistenceService.createSession).not.toHaveBeenCalled();
        });

        it('should continue if session creation fails', async () => {
            mockPersistenceService.createSession.mockRejectedValueOnce(new Error('Session error'));

            const config: AgentConfig = {
                name: 'Test Agent',
                type: 'test-type'
            };

            const agent = await manager.spawnAgent(config);

            expect(agent).toBeDefined();
            expect(mockLoggingService.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to create session'));
        });

        it('should save agent state after spawning', async () => {
            const config: AgentConfig = {
                name: 'Test Agent',
                type: 'test-type'
            };

            await manager.spawnAgent(config);

            expect(mockPersistence.saveAgentState).toHaveBeenCalled();
        });

        it('should handle circuit breaker open state', async () => {
            // Simulate multiple failures to open circuit breaker
            mockAgentLifecycleManager.spawnAgent.mockRejectedValue(new Error('Service unavailable'));

            // Try to spawn agents multiple times to trigger circuit breaker
            for (let i = 0; i < 5; i++) {
                try {
                    await manager.spawnAgent({ name: `Agent ${i}`, type: 'test' });
                } catch (error) {
                    // Expected to fail
                }
            }

            // Circuit breaker should now be open
            await expect(manager.spawnAgent({ name: 'New Agent', type: 'test' })).rejects.toThrow(
                'Circuit breaker is OPEN'
            );
        });
    });

    describe('spawnSmartAgent', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );

            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
        });

        it('should spawn smart agent successfully', async () => {
            const config: SmartAgentSpawnConfig = {
                name: 'Smart Agent',
                smartConfig: {
                    category: 'developer',
                    complexity: 'high',
                    priority: 'high'
                }
            };

            // Mock the dynamic template creation
            jest.mock('../../../agents/AgentTemplateManager', () => ({
                AgentTemplateManager: jest.fn().mockImplementation(() => ({
                    createDynamicTemplate: jest.fn().mockReturnValue({
                        id: 'smart-template',
                        name: 'Smart Template'
                    })
                }))
            }));

            const agent = await manager.spawnSmartAgent(config);

            expect(agent).toBeDefined();
            expect(agent.id).toBe('agent-1');
        });

        it('should validate smart agent configuration', async () => {
            const config: SmartAgentSpawnConfig = {
                name: '',
                smartConfig: {
                    category: 'invalid' as any,
                    complexity: 'high',
                    priority: 'high'
                }
            };

            await expect(manager.spawnSmartAgent(config)).rejects.toThrow(AgentSpawnError);
        });

        it('should throw error if no workspace folder', async () => {
            (vscode.workspace as any).workspaceFolders = undefined;

            const config: SmartAgentSpawnConfig = {
                name: 'Smart Agent',
                smartConfig: {
                    category: 'developer',
                    complexity: 'high',
                    priority: 'high'
                }
            };

            await expect(manager.spawnSmartAgent(config)).rejects.toThrow(AgentSpawnError);
        });
    });

    describe('spawnSmartTeam', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );

            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
        });

        it('should spawn smart team successfully', async () => {
            const teamConfig: SmartTeamSpawnConfig = {
                teamName: 'Test Team',
                teamType: 'fullstack',
                agentConfigs: [
                    {
                        category: 'developer',
                        complexity: 'high',
                        priority: 'high'
                    },
                    {
                        category: 'architect',
                        complexity: 'high',
                        priority: 'critical'
                    }
                ]
            };

            const agents = await manager.spawnSmartTeam(teamConfig);

            expect(agents).toHaveLength(2);
            expect(mockAgentLifecycleManager.spawnAgent).toHaveBeenCalledTimes(2);
        });

        it('should continue spawning if one agent fails', async () => {
            mockAgentLifecycleManager.spawnAgent
                .mockRejectedValueOnce(new Error('First agent failed'))
                .mockResolvedValueOnce({
                    id: 'agent-2',
                    name: 'Second Agent',
                    type: 'test',
                    status: 'idle',
                    terminal: {} as any,
                    currentTask: null,
                    startTime: new Date(),
                    tasksCompleted: 0
                });

            const teamConfig: SmartTeamSpawnConfig = {
                teamName: 'Test Team',
                teamType: 'fullstack',
                agentConfigs: [
                    { category: 'developer', complexity: 'high', priority: 'high' },
                    { category: 'architect', complexity: 'high', priority: 'critical' }
                ]
            };

            const agents = await manager.spawnSmartTeam(teamConfig);

            expect(agents).toHaveLength(1);
            expect(mockLoggingService.warn).toHaveBeenCalled();
        });

        it('should throw error if no agents are spawned', async () => {
            mockAgentLifecycleManager.spawnAgent.mockRejectedValue(new Error('All agents failed'));

            const teamConfig: SmartTeamSpawnConfig = {
                teamName: 'Test Team',
                teamType: 'fullstack',
                agentConfigs: [{ category: 'developer', complexity: 'high', priority: 'high' }]
            };

            await expect(manager.spawnSmartTeam(teamConfig)).rejects.toThrow(AgentSpawnError);
        });

        it('should use worktree strategy when specified', async () => {
            const teamConfig: SmartTeamSpawnConfig = {
                teamName: 'Test Team',
                teamType: 'fullstack',
                workspaceStrategy: 'worktrees',
                agentConfigs: [{ category: 'developer', complexity: 'high', priority: 'high' }]
            };

            await manager.spawnSmartTeam(teamConfig);

            // Verify working directory is set based on worktree strategy
            expect(mockAgentLifecycleManager.spawnAgent).toHaveBeenCalled();
        });
    });

    describe('executeTask', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should execute task successfully', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test',
                status: 'idle',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            mockAgentLifecycleManager.spawnAgent.mockResolvedValueOnce(agent);
            await manager.spawnAgent({ name: 'Test Agent', type: 'test' });

            const task = {
                id: 'task-1',
                title: 'Test Task',
                description: 'Test task description',
                priority: 'high'
            };

            await manager.executeTask('agent-1', task);

            expect(mockTerminalManager.getTerminal).toHaveBeenCalledWith('agent-1');
            expect(mockAgentLifecycleManager.startTaskMonitoring).toHaveBeenCalledWith('agent-1');
            expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.AGENT_STATUS_CHANGED, expect.any(Object));
            expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.AGENT_TASK_ASSIGNED, expect.any(Object));
        });

        it('should throw error if agent not found', async () => {
            const task = {
                id: 'task-1',
                title: 'Test Task',
                description: 'Test task description',
                priority: 'high'
            };

            await expect(manager.executeTask('non-existent', task)).rejects.toThrow(AgentNotFoundError);
        });

        it('should throw error if terminal not found', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test',
                status: 'idle',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            mockAgentLifecycleManager.spawnAgent.mockResolvedValueOnce(agent);
            await manager.spawnAgent({ name: 'Test Agent', type: 'test' });

            mockTerminalManager.getTerminal.mockReturnValueOnce(undefined);

            const task = {
                id: 'task-1',
                title: 'Test Task',
                description: 'Test task description',
                priority: 'high'
            };

            await expect(manager.executeTask('agent-1', task)).rejects.toThrow('Agent agent-1 terminal not found');
        });

        it('should save agent state after task assignment', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test',
                status: 'idle',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            mockAgentLifecycleManager.spawnAgent.mockResolvedValueOnce(agent);
            await manager.spawnAgent({ name: 'Test Agent', type: 'test' });

            const task = {
                id: 'task-1',
                title: 'Test Task',
                description: 'Test task description',
                priority: 'high'
            };

            await manager.executeTask('agent-1', task);

            expect(mockPersistence.saveAgentState).toHaveBeenCalled();
        });
    });

    describe('removeAgent', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should remove agent successfully', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test',
                status: 'idle',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            mockAgentLifecycleManager.spawnAgent.mockResolvedValueOnce(agent);
            await manager.spawnAgent({ name: 'Test Agent', type: 'test' });

            await manager.removeAgent('agent-1');

            expect(mockAgentLifecycleManager.removeAgent).toHaveBeenCalledWith('agent-1');
            expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.AGENT_REMOVED, expect.any(Object));
            expect(mockPersistence.saveAgentState).toHaveBeenCalled();
        });

        it('should handle agent not found gracefully', async () => {
            await manager.removeAgent('non-existent');

            expect(mockLoggingService.debug).toHaveBeenCalledWith('Cannot remove agent non-existent - not found');
            expect(mockAgentLifecycleManager.removeAgent).not.toHaveBeenCalled();
        });

        it('should continue if removal fails', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test',
                status: 'idle',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            mockAgentLifecycleManager.spawnAgent.mockResolvedValueOnce(agent);
            await manager.spawnAgent({ name: 'Test Agent', type: 'test' });

            mockAgentLifecycleManager.removeAgent.mockResolvedValueOnce(false);

            await manager.removeAgent('agent-1');

            expect(mockEventBus.publish).not.toHaveBeenCalledWith(EVENTS.AGENT_REMOVED, expect.any(Object));
        });
    });

    describe('getActiveAgents', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should return all active agents', async () => {
            const agent1 = {
                id: 'agent-1',
                name: 'Agent 1',
                type: 'test',
                status: 'idle',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            const agent2 = {
                id: 'agent-2',
                name: 'Agent 2',
                type: 'test',
                status: 'working',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            mockAgentLifecycleManager.spawnAgent.mockResolvedValueOnce(agent1).mockResolvedValueOnce(agent2);

            await manager.spawnAgent({ name: 'Agent 1', type: 'test' });
            await manager.spawnAgent({ name: 'Agent 2', type: 'test' });

            const agents = manager.getActiveAgents();

            expect(agents).toHaveLength(2);
            expect(agents[0].id).toBe('agent-1');
            expect(agents[1].id).toBe('agent-2');
        });

        it('should return empty array when no agents exist', () => {
            const agents = manager.getActiveAgents();
            expect(agents).toEqual([]);
        });

        it('should handle errors gracefully', () => {
            // Force an internal error by manipulating internals
            (manager as any).agents = null;

            const agents = manager.getActiveAgents();

            expect(agents).toEqual([]);
            expect(mockLoggingService.error).toHaveBeenCalled();
        });
    });

    describe('getAgent', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should return agent by ID', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test',
                status: 'idle',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            mockAgentLifecycleManager.spawnAgent.mockResolvedValueOnce(agent);
            await manager.spawnAgent({ name: 'Test Agent', type: 'test' });

            const retrievedAgent = manager.getAgent('agent-1');

            expect(retrievedAgent).toBeDefined();
            expect(retrievedAgent?.id).toBe('agent-1');
        });

        it('should return undefined for non-existent agent', () => {
            const agent = manager.getAgent('non-existent');
            expect(agent).toBeUndefined();
        });

        it('should handle invalid agent ID', () => {
            const agent = manager.getAgent(null as any);
            expect(agent).toBeUndefined();
            expect(mockLoggingService.error).toHaveBeenCalled();
        });
    });

    describe('restoreAgents', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should restore agents from persistence', async () => {
            const savedAgents = [
                { id: 'agent-1', name: 'Saved Agent 1', type: 'test', status: 'idle', template: 'test-template' },
                { id: 'agent-2', name: 'Saved Agent 2', type: 'test', status: 'working', template: 'test-template' }
            ];

            mockPersistence.loadAgentState.mockResolvedValueOnce(savedAgents);
            mockNotificationService.showInformation.mockResolvedValueOnce('Yes, Restore');

            const restoredCount = await manager.restoreAgents();

            expect(restoredCount).toBe(2);
            expect(mockAgentLifecycleManager.spawnAgent).toHaveBeenCalledTimes(2);
        });

        it('should handle no saved agents', async () => {
            mockPersistence.loadAgentState.mockResolvedValueOnce([]);

            const restoredCount = await manager.restoreAgents();

            expect(restoredCount).toBe(0);
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('No saved agents found.');
        });

        it('should handle no persistence available', async () => {
            const managerWithoutPersistence = new EnterpriseAgentManager(mockContext);
            managerWithoutPersistence.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );

            const restoredCount = await managerWithoutPersistence.restoreAgents();

            expect(restoredCount).toBe(0);
            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                'No workspace open. Cannot restore agents.'
            );
        });

        it('should continue restoration if one agent fails', async () => {
            const savedAgents = [
                { id: 'agent-1', name: 'Saved Agent 1', type: 'test', status: 'idle', template: 'test-template' },
                { id: 'agent-2', name: 'Saved Agent 2', type: 'test', status: 'idle', template: 'test-template' }
            ];

            mockPersistence.loadAgentState.mockResolvedValueOnce(savedAgents);
            mockNotificationService.showInformation.mockResolvedValueOnce('Yes, Restore');

            mockAgentLifecycleManager.spawnAgent
                .mockRejectedValueOnce(new Error('Failed to restore first agent'))
                .mockResolvedValueOnce({
                    id: 'agent-2',
                    name: 'Saved Agent 2',
                    type: 'test',
                    status: 'idle',
                    terminal: {} as any,
                    currentTask: null,
                    startTime: new Date(),
                    tasksCompleted: 0
                });

            const restoredCount = await manager.restoreAgents();

            expect(restoredCount).toBe(1);
            expect(mockLoggingService.error).toHaveBeenCalled();
        });

        it('should restore session context if available', async () => {
            const savedAgents = [
                { id: 'agent-1', name: 'Saved Agent', type: 'test', status: 'idle', template: 'test-template' }
            ];

            mockPersistence.loadAgentState.mockResolvedValueOnce(savedAgents);
            mockPersistence.getAgentContextSummary.mockResolvedValueOnce('Previous session context');
            mockNotificationService.showInformation.mockResolvedValueOnce('Yes, Restore');

            const terminal = {
                name: 'test-agent',
                processId: 12345,
                creationOptions: {},
                exitStatus: undefined,
                state: { isInteractedWith: false },
                shellIntegration: undefined,
                shellLaunchConfig: {},
                show: jest.fn(),
                sendText: jest.fn(),
                dispose: jest.fn()
            } as any;
            mockTerminalManager.getTerminal.mockReturnValueOnce(terminal);

            await manager.restoreAgents();

            expect(terminal.sendText).toHaveBeenCalledWith('# Restored from previous session');
            expect(terminal.sendText).toHaveBeenCalledWith(expect.stringContaining('Previous session context'));
        });
    });

    describe('completeTask', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should complete task successfully', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test',
                status: 'working' as any,
                terminal: {} as any,
                currentTask: { id: 'task-1', title: 'Current Task' },
                startTime: new Date(),
                tasksCompleted: 0
            };

            mockAgentLifecycleManager.spawnAgent.mockResolvedValueOnce(agent);
            await manager.spawnAgent({ name: 'Test Agent', type: 'test' });

            const task = { id: 'task-1', title: 'Current Task' };
            await manager.completeTask('agent-1', task);

            expect(agent.status).toBe('idle');
            expect(agent.currentTask).toBeNull();
            expect(agent.tasksCompleted).toBe(1);
            expect(mockAgentLifecycleManager.stopTaskMonitoring).toHaveBeenCalledWith('agent-1');
            expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.AGENT_STATUS_CHANGED, expect.any(Object));
            expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.AGENT_TASK_COMPLETED, expect.any(Object));
        });

        it('should handle agent not found gracefully', async () => {
            const task = { id: 'task-1', title: 'Test Task' };
            await manager.completeTask('non-existent', task);

            expect(mockAgentLifecycleManager.stopTaskMonitoring).not.toHaveBeenCalled();
        });
    });

    describe('getAgentStats', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should return correct agent statistics', async () => {
            const agents = [
                { id: 'agent-1', name: 'Agent 1', type: 'test', status: 'idle' },
                { id: 'agent-2', name: 'Agent 2', type: 'test', status: 'working' },
                { id: 'agent-3', name: 'Agent 3', type: 'test', status: 'error' },
                { id: 'agent-4', name: 'Agent 4', type: 'test', status: 'offline' }
            ];

            for (const agentData of agents) {
                mockAgentLifecycleManager.spawnAgent.mockResolvedValueOnce({
                    ...agentData,
                    terminal: {} as any,
                    currentTask: null,
                    startTime: new Date(),
                    tasksCompleted: 0
                } as any);
                await manager.spawnAgent({ name: agentData.name, type: agentData.type });
            }

            const stats = manager.getAgentStats();

            expect(stats.total).toBe(4);
            expect(stats.idle).toBe(1);
            expect(stats.working).toBe(1);
            expect(stats.error).toBe(1);
            expect(stats.offline).toBe(1);
        });

        it('should return zeros when no agents exist', () => {
            const stats = manager.getAgentStats();

            expect(stats.total).toBe(0);
            expect(stats.idle).toBe(0);
            expect(stats.working).toBe(0);
            expect(stats.error).toBe(0);
            expect(stats.offline).toBe(0);
        });

        it('should handle errors gracefully', () => {
            // Force an internal error
            (manager as any).agents = null;

            const stats = manager.getAgentStats();

            expect(stats.total).toBe(0);
            expect(mockLoggingService.error).toHaveBeenCalled();
        });
    });

    describe('getEnterpriseMetrics', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should return comprehensive enterprise metrics', async () => {
            // Spawn an agent to generate some metrics
            await manager.spawnAgent({ name: 'Test Agent', type: 'test' });

            const metrics = manager.getEnterpriseMetrics();

            expect(metrics).toHaveProperty('operations');
            expect(metrics).toHaveProperty('agents');
            expect(metrics).toHaveProperty('circuitBreaker');
            expect(metrics).toHaveProperty('resources');

            expect(metrics.operations).toHaveProperty('spawn_agent');
            expect(metrics.agents.total).toBeGreaterThanOrEqual(0);
            expect(metrics.resources.count).toBeGreaterThanOrEqual(0);
        });
    });

    describe('dispose', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should dispose all resources properly', async () => {
            // Spawn some agents
            await manager.spawnAgent({ name: 'Agent 1', type: 'test' });
            await manager.spawnAgent({ name: 'Agent 2', type: 'test' });

            await manager.dispose();

            expect(mockPersistence.saveAgentState).toHaveBeenCalled();
            expect(mockAgentLifecycleManager.removeAgent).toHaveBeenCalledTimes(2);
            expect(mockLoggingService.info).toHaveBeenCalledWith('EnterpriseAgentManager: Disposal completed');
        });

        it('should handle disposal errors gracefully', async () => {
            mockPersistence.saveAgentState.mockRejectedValueOnce(new Error('Save failed'));

            await manager.dispose();

            expect(mockLoggingService.error).not.toHaveBeenCalledWith(
                expect.stringContaining('Error during EnterpriseAgentManager disposal')
            );
        });

        it('should prevent double disposal', async () => {
            await manager.dispose();
            await manager.dispose();

            expect(mockPersistence.saveAgentState).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should handle null values gracefully', () => {
            expect(manager.getAgent(null as any)).toBeUndefined();
            expect(() => manager.getActiveAgents()).not.toThrow();
            expect(() => manager.getAgentStats()).not.toThrow();
        });

        it('should handle undefined values gracefully', () => {
            expect(manager.getAgent(undefined as any)).toBeUndefined();
            expect(() => manager.setUseWorktrees(undefined as any)).not.toThrow();
        });

        it('should handle empty strings', async () => {
            const config: AgentConfig = {
                name: '',
                type: ''
            };

            await expect(manager.spawnAgent(config)).rejects.toThrow(AgentSpawnError);
        });

        it('should handle very long strings', async () => {
            const config: AgentConfig = {
                name: 'a'.repeat(1000),
                type: 'test'
            };

            await expect(manager.spawnAgent(config)).rejects.toThrow(AgentSpawnError);
        });

        it('should handle special characters in names', async () => {
            const config: AgentConfig = {
                name: 'Test!@#$%^&*()',
                type: 'test'
            };

            await expect(manager.spawnAgent(config)).rejects.toThrow(AgentSpawnError);
        });

        it('should handle concurrent operations', async () => {
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(manager.spawnAgent({ name: `Agent ${i}`, type: 'test' }));
            }

            const results = await Promise.allSettled(promises);
            const successful = results.filter(r => r.status === 'fulfilled');

            expect(successful.length).toBeGreaterThan(0);
        });
    });

    describe('Load Balancing Methods', () => {
        beforeEach(() => {
            manager.setDependencies(
                mockAgentLifecycleManager,
                mockTerminalManager,
                mockWorktreeService,
                mockConfigService,
                mockNotificationService,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockPersistenceService
            );
        });

        it('should get agent capacity correctly', async () => {
            await manager.spawnAgent({ name: 'Test Agent', type: 'test' });

            const capacity = manager.getAgentCapacity('agent-1');

            expect(capacity).toHaveProperty('currentLoad');
            expect(capacity).toHaveProperty('maxCapacity');
            expect(capacity).toHaveProperty('isAvailable');
            expect(capacity.isAvailable).toBe(true);
        });

        it('should return zero capacity for non-existent agent', () => {
            const capacity = manager.getAgentCapacity('non-existent');

            expect(capacity.currentLoad).toBe(0);
            expect(capacity.maxCapacity).toBe(0);
            expect(capacity.isAvailable).toBe(false);
        });

        it('should handle errors in capacity calculation', () => {
            (manager as any).agentLoadTracking = null;

            const capacity = manager.getAgentCapacity('agent-1');

            expect(capacity.currentLoad).toBe(0);
            expect(capacity.maxCapacity).toBe(0);
            expect(capacity.isAvailable).toBe(false);
        });
    });
});
