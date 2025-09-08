import * as vscode from 'vscode';
import { ConductorCommands } from '../../../commands/ConductorCommands';
import {
    IContainer,
    INotificationService,
    ICommandService,
    IConfigurationService,
    ILoggingService,
    SERVICE_TOKENS
} from '../../../services/interfaces';
import { AgentManager } from '../../../agents/AgentManager';
import { TaskQueue } from '../../../tasks/TaskQueue';
import { AgentTreeProvider } from '../../../views/AgentTreeProvider';
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

// Mock VS Code API
jest.mock('vscode', () => ({
    window: {
        showQuickPick: jest.fn(),
        showInputBox: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        createTerminal: jest.fn()
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
        createFileSystemWatcher: jest.fn(() => ({
            onDidCreate: jest.fn(),
            onDidChange: jest.fn(),
            onDidDelete: jest.fn(),
            dispose: jest.fn()
        }))
    },
    RelativePattern: class MockRelativePattern {
        public base: any;
        public pattern: string;
        constructor(base: any, pattern: string) {
            this.base = base;
            this.pattern = pattern;
        }
    },
    Disposable: {
        from: jest.fn()
    },
    EventEmitter: class MockEventEmitter {
        public event = jest.fn();
        public fire = jest.fn();
        public dispose = jest.fn();
        constructor() {}
    }
}));

// Mock file system
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue('{}'),
    readdirSync: jest.fn().mockReturnValue([])
}));

describe('ConductorCommands', () => {
    let conductorCommands: ConductorCommands;
    let mockContainer: jest.Mocked<IContainer>;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockTaskQueue: jest.Mocked<TaskQueue>;
    let mockCommandService: jest.Mocked<ICommandService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockAgentProvider: jest.Mocked<AgentTreeProvider>;

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        mockConfigService = createMockConfigurationService();
        jest.clearAllMocks();

        // Create mocks
        mockAgentManager = {
            spawnAgent: jest.fn().mockResolvedValue({ id: 'agent-1', name: 'Test Agent' }),
            getAgents: jest.fn().mockReturnValue([]),
            getActiveAgents: jest.fn().mockReturnValue([]),
            terminateAgent: jest.fn().mockResolvedValue(undefined),
            dispose: jest.fn()
        } as any;

        mockTaskQueue = {
            addTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
            getTasks: jest.fn().mockReturnValue([])
        } as any;

        mockCommandService = {
            register: jest.fn(),
            registerTextEditorCommand: jest.fn(),
            execute: jest.fn().mockResolvedValue(undefined),
            getCommands: jest.fn().mockResolvedValue([]),
            getRegisteredCommands: jest.fn().mockReturnValue([]),
            hasCommand: jest.fn().mockReturnValue(false),
            unregister: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockNotificationService = createMockNotificationService();

        mockConfigService = createMockConfigurationService();

        mockLoggingService = createMockLoggingService();

        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn(),
                update: jest.fn()
            },
            globalState: {
                get: jest.fn(),
                update: jest.fn()
            },
            extensionUri: { fsPath: '/test/extension' } as any
        } as any;

        mockAgentProvider = {
            setTeamName: jest.fn(),
            refresh: jest.fn()
        } as any;

        // Create mock container with resolve method
        mockContainer = {
            resolve: jest.fn((token: symbol) => {
                switch (token) {
                    case SERVICE_TOKENS.AgentManager:
                        return mockAgentManager;
                    case SERVICE_TOKENS.TaskQueue:
                        return mockTaskQueue;
                    case SERVICE_TOKENS.CommandService:
                        return mockCommandService;
                    case SERVICE_TOKENS.NotificationService:
                        return mockNotificationService;
                    case SERVICE_TOKENS.ConfigurationService:
                        return mockConfigService;
                    case SERVICE_TOKENS.LoggingService:
                        return mockLoggingService;
                    case SERVICE_TOKENS.ExtensionContext:
                        return mockContext;
                    default:
                        return undefined;
                }
            }),
            register: jest.fn(),
            get: jest.fn()
        } as any;

        // Mock workspace folders
        (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];

        conductorCommands = new ConductorCommands(mockContainer);
        conductorCommands.setAgentProvider(mockAgentProvider);
    });

    describe('register', () => {
        it('should register all conductor commands', () => {
            conductorCommands.register();

            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.startConductor', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.quickStartChat', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.openConductorChat', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith(
                'nofx.openConductorTerminal',
                expect.any(Function)
            );
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.openSimpleConductor', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.openConductorPanel', expect.any(Function));
        });
    });

    describe('startConductor', () => {
        it('should start conductor with Full-Stack Development Team preset', async () => {
            const mockPreset = {
                label: '$(rocket) Full-Stack Development Team',
                description: 'Frontend, Backend, Database, and DevOps specialists',
                value: {
                    value: 'fullstack',
                    agents: ['frontend-specialist', 'backend-specialist', 'database-architect', 'devops-engineer']
                }
            };

            (mockNotificationService.showQuickPick as any).mockResolvedValue(mockPreset);

            // Execute the startConductor method directly
            await (conductorCommands as any).startConductor();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([expect.objectContaining({ label: '$(rocket) Full-Stack Development Team' })]),
                expect.objectContaining({ placeHolder: 'Select a team configuration' })
            );

            // Verify agents were spawned
            expect(mockAgentManager.spawnAgent).toHaveBeenCalledTimes(4);
            expect(mockNotificationService.showInformation).toHaveBeenCalled();
        });

        it('should start conductor with Testing & Quality Team preset', async () => {
            const mockPreset = {
                label: '$(beaker) Testing & Quality Team',
                description: 'Test Engineer, Security Expert, and Performance Specialist',
                value: {
                    value: 'testing',
                    agents: ['testing-specialist', 'security-expert', 'backend-specialist']
                }
            };

            (mockNotificationService.showQuickPick as any).mockResolvedValue(mockPreset);

            await (conductorCommands as any).startConductor();

            expect(mockAgentManager.spawnAgent).toHaveBeenCalledTimes(3);
            expect(mockNotificationService.showInformation).toHaveBeenCalled();
        });

        it('should handle custom team selection', async () => {
            const mockPreset = {
                label: '$(person) Custom Team',
                description: 'Select your own combination of agents',
                value: {
                    value: 'custom',
                    agents: []
                }
            };

            (mockNotificationService.showQuickPick as any).mockResolvedValue(mockPreset);

            await (conductorCommands as any).startConductor();

            expect(mockCommandService.execute).toHaveBeenCalledWith('nofx.addAgent');
        });

        it('should handle cancellation', async () => {
            (mockNotificationService.showQuickPick as any).mockResolvedValue(undefined);

            await (conductorCommands as any).startConductor();

            expect(mockAgentManager.spawnAgent).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        it('should show error when no workspace is open', async () => {
            (vscode.workspace as any).workspaceFolders = undefined;

            const mockPreset = {
                label: '$(rocket) Full-Stack Development Team',
                value: { value: 'fullstack', agents: [] }
            };
            (mockNotificationService.showQuickPick as any).mockResolvedValue(mockPreset);

            await (conductorCommands as any).startConductor();

            expect(mockNotificationService.showError).toHaveBeenCalledWith('No workspace folder open');
            expect(mockAgentManager.spawnAgent).not.toHaveBeenCalled();
        });

        it('should update team name in agent provider', async () => {
            const mockPreset = {
                label: '$(rocket) Full-Stack Development Team',
                value: {
                    value: 'fullstack',
                    agents: ['frontend-specialist']
                }
            };

            (mockNotificationService.showQuickPick as any).mockResolvedValue(mockPreset);

            await (conductorCommands as any).startConductor();

            expect(mockAgentProvider.setTeamName).toHaveBeenCalledWith('Full-Stack Development Team');
        });
    });

    describe('quickStartChat', () => {
        it('should handle web application project type', async () => {
            const mockProjectType = {
                label: '$(globe) Web Application',
                description: 'React, Vue, Angular, or vanilla JS',
                value: {
                    value: 'web',
                    teamPreset: 'frontend',
                    teamName: 'Web Team',
                    agents: ['frontend-specialist', 'backend-specialist']
                }
            };

            (mockNotificationService.showQuickPick as any).mockResolvedValueOnce(mockProjectType);

            // Mock the second quick pick for project details
            (mockNotificationService.showQuickPick as any).mockResolvedValueOnce({
                label: 'React with TypeScript',
                value: { framework: 'react', language: 'typescript' }
            });

            await (conductorCommands as any).quickStartChat();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledTimes(2);
        });
    });
});
