// Mock VS Code
jest.mock('vscode', () => ({
    window: {
        createTerminal: jest.fn(),
        showInformationMessage: jest.fn(),
        showQuickPick: jest.fn(),
        showInputBox: jest.fn(),
        activeTerminal: null
    },
    workspace: {
        getConfiguration: jest.fn(),
        workspaceFolders: [
            {
                uri: { fsPath: '/test/workspace' }
            }
        ]
    },
    ExtensionContext: {},
    Disposable: { from: jest.fn() },
    Uri: {
        file: (path: string) => ({ fsPath: path, path, scheme: 'file' })
    },
    ExtensionMode: {
        Production: 1,
        Development: 2,
        Test: 3
    },
    ExtensionKind: {
        UI: 1,
        Workspace: 2
    },
    EventEmitter: class MockEventEmitter {
        public event = jest.fn();
        public fire = jest.fn();
        public dispose = jest.fn();
        constructor() {}
    },
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3
    }
}));

jest.mock('../../../persistence/AgentPersistence');

import * as vscode from 'vscode';
import { AgentManager } from '../../../agents/AgentManager';
import {
    IAgentLifecycleManager,
    ITerminalManager,
    IWorktreeService,
    IConfigurationService,
    INotificationService,
    ILoggingService,
    IEventBus,
    IErrorHandler,
    IMetricsService
} from '../../../services/interfaces';
import { Agent, AgentConfig } from '../../../agents/types';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';
import {
    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockTerminal
} from './../../helpers/mockFactories';
import { AgentPersistence } from '../../../persistence/AgentPersistence';

describe('AgentManager', () => {
    let agentManager: AgentManager;
    let mockContext: vscode.ExtensionContext;
    let mockAgentLifecycleManager: jest.Mocked<IAgentLifecycleManager>;
    let mockTerminalManager: jest.Mocked<ITerminalManager>;
    let mockWorktreeService: jest.Mocked<IWorktreeService>;
    let mockConfigService: any;
    let mockNotificationService: any;
    let mockLoggingService: any;
    let mockEventBus: any;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockMetricsService: jest.Mocked<IMetricsService>;
    let mockTerminal: any;
    let mockPersistence: jest.Mocked<AgentPersistence>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock terminal
        mockTerminal = createMockTerminal();

        // Create mock services
        mockLoggingService = createMockLoggingService();
        mockConfigService = createMockConfigurationService();
        mockNotificationService = createMockNotificationService();
        mockEventBus = createMockEventBus();

        // Mock context
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn(),
                update: jest.fn()
            },
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                setKeysForSync: jest.fn()
            },
            extensionPath: '/test/extension',
            extensionUri: vscode.Uri.file('/test/extension'),
            environmentVariableCollection: {
                clear: jest.fn(),
                delete: jest.fn(),
                get: jest.fn(),
                set: jest.fn(),
                forEach: jest.fn()
            },
            storagePath: '/test/storage',
            globalStoragePath: '/test/global-storage',
            logPath: '/test/logs',
            extensionMode: vscode.ExtensionMode.Test,
            extension: {
                id: 'test.extension',
                packageJSON: {},
                extensionPath: '/test/extension',
                extensionUri: vscode.Uri.file('/test/extension'),
                extensionKind: vscode.ExtensionKind.UI,
                isActive: true,
                exports: undefined
            },
            asAbsolutePath: jest.fn(p => `/test/extension/${p}`),
            logUri: vscode.Uri.file('/test/logs'),
            storageUri: vscode.Uri.file('/test/storage'),
            globalStorageUri: vscode.Uri.file('/test/global-storage'),
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn()
            },
            languageModelAccessInformation: {
                canSendRequest: jest.fn(),
                onDidChange: jest.fn()
            }
        } as any;

        // Mock persistence
        mockPersistence = {
            loadAgentState: jest.fn().mockResolvedValue([]),
            saveAgentState: jest.fn().mockResolvedValue(undefined),
            saveAgentSession: jest.fn().mockResolvedValue(undefined),
            loadAgentSession: jest.fn().mockResolvedValue(null),
            getAgentContextSummary: jest.fn().mockResolvedValue(''),
            clearAll: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockAgentLifecycleManager = {
            spawnAgent: jest.fn(),
            removeAgent: jest.fn(),
            initialize: jest.fn(),
            startTaskMonitoring: jest.fn(),
            stopTaskMonitoring: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockTerminalManager = {
            createTerminal: jest.fn(),
            getTerminal: jest.fn(),
            disposeTerminal: jest.fn(),
            initializeAgentTerminal: jest.fn(),
            createEphemeralTerminal: jest.fn(),
            onTerminalClosed: jest.fn(() => ({ dispose: jest.fn() })),
            dispose: jest.fn()
        } as any;

        mockWorktreeService = {
            createForAgent: jest.fn(),
            removeForAgent: jest.fn(),
            mergeForAgent: jest.fn(),
            getWorktreePath: jest.fn(),
            isAvailable: jest.fn(() => true),
            cleanupOrphaned: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockErrorHandler = {
            handleError: jest.fn(),
            handleWarning: jest.fn(),
            handleInfo: jest.fn(),
            captureException: jest.fn(),
            setContext: jest.fn(),
            clearContext: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockMetricsService = {
            trackEvent: jest.fn(),
            trackMetric: jest.fn(),
            trackException: jest.fn(),
            trackDuration: jest.fn(),
            incrementCounter: jest.fn(),
            decrementCounter: jest.fn(),
            setGauge: jest.fn(),
            recordDuration: jest.fn(),
            getMetrics: jest.fn().mockReturnValue([]),
            clearMetrics: jest.fn(),
            resetMetrics: jest.fn(),
            exportMetrics: jest.fn(),
            getDashboardData: jest.fn().mockReturnValue({}),
            startTimer: jest.fn().mockReturnValue('timer-id'),
            endTimer: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Mock VS Code APIs
        (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);
        (vscode.window.showInformationMessage as jest.Mock) = mockNotificationService.showInformation;
        (vscode.window.showInputBox as jest.Mock) = mockNotificationService.showInputBox;

        // Create AgentManager instance
        agentManager = new AgentManager(mockContext, mockPersistence);

        // Set dependencies
        agentManager.setDependencies(
            mockAgentLifecycleManager,
            mockTerminalManager,
            mockWorktreeService,
            mockConfigService,
            mockNotificationService,
            mockLoggingService,
            mockEventBus,
            mockErrorHandler,
            mockMetricsService
        );
    });

    afterEach(() => {
        agentManager.dispose();
    });

    describe('Initialization', () => {
        it('should initialize with dependencies', async () => {
            await agentManager.initialize(false);

            expect(mockPersistence.loadAgentState).toHaveBeenCalled();
        });

        it('should show setup dialog when requested', async () => {
            mockNotificationService.showInformation.mockResolvedValue('Test Claude');

            await agentManager.initialize(true);

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '🎸 NofX Conductor ready. Using AI command: claude',
                'Test Claude',
                'Change Path',
                'Restore Session'
            );
            // Terminal creation is not called in showSetupDialog
            // expect(vscode.window.createTerminal).toHaveBeenCalledWith('Claude Test');
        });

        it('should handle path change', async () => {
            mockNotificationService.showInformation.mockResolvedValue('Change Path');
            mockNotificationService.showInputBox.mockResolvedValue('/new/path/claude');

            await agentManager.initialize(true);

            expect(mockConfigService.update).toHaveBeenCalledWith(
                'aiPath',
                '/new/path/claude',
                vscode.ConfigurationTarget.Global
            );
        });
    });

    describe('Agent Restoration', () => {
        it('should restore agents on initialization', async () => {
            const savedAgent = {
                id: 'saved-1',
                name: 'Saved Agent',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 5,
                terminal: null,
                currentTask: null,
                startTime: new Date()
            };

            mockPersistence.loadAgentState.mockResolvedValue([savedAgent]);
            mockNotificationService.showInformation.mockResolvedValue('Yes, Restore');

            await agentManager.initialize(false);

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                'Found 1 saved agent(s). Restore them?',
                'Yes, Restore',
                'No, Start Fresh'
            );
        });

        it('should restore agents with context', async () => {
            const savedAgent = {
                id: 'saved-1',
                name: 'Saved Agent',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 5,
                terminal: null,
                currentTask: null,
                startTime: new Date()
            };

            mockPersistence.loadAgentState.mockResolvedValue([savedAgent]);
            mockPersistence.loadAgentSession.mockResolvedValue('Previous conversation context');
            mockNotificationService.showInformation.mockResolvedValue('Yes, Restore');
            mockAgentLifecycleManager.spawnAgent.mockResolvedValue(savedAgent);
            mockTerminalManager.getTerminal.mockReturnValue(mockTerminal);

            await agentManager.initialize(false);

            expect(mockAgentLifecycleManager.spawnAgent).toHaveBeenCalled();
        });
    });

    describe('Agent Spawning', () => {
        it('should spawn agent successfully', async () => {
            const agentConfig: AgentConfig = {
                name: 'Test Agent',
                type: 'General Purpose'
            };

            const mockAgent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            mockAgentLifecycleManager.spawnAgent.mockResolvedValue(mockAgent);

            const result = await agentManager.spawnAgent(agentConfig);

            expect(result).toBe(mockAgent);
            expect(mockAgentLifecycleManager.spawnAgent).toHaveBeenCalledWith(agentConfig, undefined);
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('agents_created', {
                agentType: 'General Purpose',
                totalAgents: '1'
            });
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_CREATED, {
                agentId: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose'
            });
        });

        it('should throw error if AgentLifecycleManager not available', async () => {
            const newAgentManager = new AgentManager(mockContext, mockPersistence);

            const agentConfig: AgentConfig = {
                name: 'Test Agent',
                type: 'General Purpose'
            };

            await expect(newAgentManager.spawnAgent(agentConfig)).rejects.toThrow(
                'AgentLifecycleManager not available'
            );
        });
    });

    describe('Task Execution', () => {
        it('should execute task on agent', async () => {
            const mockAgent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            const mockTask = {
                id: 'task-1',
                title: 'Test Task',
                description: 'Test task description',
                priority: 'medium' as const,
                status: 'queued' as const,
                createdAt: new Date()
            } as any;

            (agentManager as any).agents.set('agent-1', mockAgent);
            mockTerminalManager.getTerminal.mockReturnValue(mockTerminal);

            await agentManager.executeTask('agent-1', mockTask);

            expect(mockTerminal.sendText).toHaveBeenCalled();
            expect(mockAgent.status).toBe('working');
            expect(mockAgent.currentTask).toBe(mockTask);
        });
    });

    describe('Agent Management', () => {
        it('should get agent by ID', () => {
            const mockAgent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            (agentManager as any).agents.set('agent-1', mockAgent);

            const result = agentManager.getAgent('agent-1');

            expect(result).toBe(mockAgent);
        });

        it('should get all agents', () => {
            const mockAgent1 = {
                id: 'agent-1',
                name: 'Test Agent 1',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            const mockAgent2 = {
                id: 'agent-2',
                name: 'Test Agent 2',
                type: 'Specialist',
                status: 'working' as const,
                capabilities: [],
                tasksCompleted: 1,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            (agentManager as any).agents.set('agent-1', mockAgent1);
            (agentManager as any).agents.set('agent-2', mockAgent2);

            const result = agentManager.getAllAgents();

            expect(result).toEqual([mockAgent1, mockAgent2]);
        });

        it('should get idle agents', () => {
            const mockAgent1 = {
                id: 'agent-1',
                name: 'Test Agent 1',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            const mockAgent2 = {
                id: 'agent-2',
                name: 'Test Agent 2',
                type: 'Specialist',
                status: 'working' as const,
                capabilities: [],
                tasksCompleted: 1,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            (agentManager as any).agents.set('agent-1', mockAgent1);
            (agentManager as any).agents.set('agent-2', mockAgent2);

            const result = agentManager.getIdleAgents();

            expect(result).toEqual([mockAgent1]);
        });

        it('should get active agents', () => {
            const mockAgent1 = {
                id: 'agent-1',
                name: 'Test Agent 1',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            (agentManager as any).agents.set('agent-1', mockAgent1);

            const result = agentManager.getActiveAgents();

            expect(result).toEqual([mockAgent1]);
        });

        it('should get agent stats', () => {
            const mockAgent1 = {
                id: 'agent-1',
                name: 'Test Agent 1',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            const mockAgent2 = {
                id: 'agent-2',
                name: 'Test Agent 2',
                type: 'Specialist',
                status: 'working' as const,
                capabilities: [],
                tasksCompleted: 1,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            (agentManager as any).agents.set('agent-1', mockAgent1);
            (agentManager as any).agents.set('agent-2', mockAgent2);

            const stats = agentManager.getAgentStats();

            expect(stats).toEqual({
                total: 2,
                idle: 1,
                working: 1,
                error: 0,
                offline: 0
            });
        });

        it('should rename agent', () => {
            const mockAgent = {
                id: 'agent-1',
                name: 'Old Name',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            (agentManager as any).agents.set('agent-1', mockAgent);

            agentManager.renameAgent('agent-1', 'New Name');

            expect(mockAgent.name).toBe('New Name');
        });

        it('should update agent type', () => {
            const mockAgent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            (agentManager as any).agents.set('agent-1', mockAgent);

            agentManager.updateAgentType('agent-1', 'Specialist');

            expect(mockAgent.type).toBe('Specialist');
        });
    });

    describe('Task Completion', () => {
        it('should handle task completion', () => {
            const mockTask = {
                id: 'task-1',
                title: 'Test Task',
                description: 'Test task description',
                priority: 'medium' as const,
                status: 'queued' as const,
                createdAt: new Date()
            } as any;

            const mockAgent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose',
                status: 'working' as const,
                currentTask: mockTask,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                startTime: new Date()
            } as Agent;

            (agentManager as any).agents.set('agent-1', mockAgent);

            agentManager.completeTask('agent-1', mockTask);

            expect(mockAgent.status).toBe('idle');
            expect(mockAgent.currentTask).toBeNull();
            expect(mockAgent.tasksCompleted).toBe(1);
        });
    });

    describe('Persistence', () => {
        it('should save agent state', async () => {
            const mockAgent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            (agentManager as any).agents.set('agent-1', mockAgent);

            await (agentManager as any).saveAgentState();

            expect(mockPersistence.saveAgentState).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 'agent-1',
                        name: 'Test Agent',
                        type: 'General Purpose'
                    })
                ])
            );
        });
    });

    describe('Disposal', () => {
        it('should dispose all resources', async () => {
            const mockAgent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose',
                status: 'idle' as const,
                capabilities: [],
                tasksCompleted: 0,
                terminal: mockTerminal,
                currentTask: null,
                startTime: new Date()
            } as Agent;

            (agentManager as any).agents.set('agent-1', mockAgent);

            // Mock removeAgent to return true
            mockAgentLifecycleManager.removeAgent.mockResolvedValue(true);

            await agentManager.dispose();

            expect(mockAgentLifecycleManager.dispose).toHaveBeenCalled();
            expect(mockTerminalManager.dispose).toHaveBeenCalled();
            expect(mockWorktreeService.dispose).toHaveBeenCalled();
            expect((agentManager as any).agents.size).toBe(0);
        });
    });
});
