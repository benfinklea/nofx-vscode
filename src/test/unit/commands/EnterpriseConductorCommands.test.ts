import {
    EnterpriseConductorCommands,
    ConductorCommandsError,
    ValidationError,
    ConfigurationError,
    OperationTimeoutError
} from '../../../commands/EnterpriseConductorCommands';
import { AgentManager } from '../../../agents/AgentManager';
import { TaskQueue } from '../../../tasks/TaskQueue';
import { SmartConductor } from '../../../conductor/SmartConductor';
import { AgentTreeProvider } from '../../../views/AgentTreeProvider';
import * as vscode from 'vscode';
import {
    IContainer,
    ICommandService,
    INotificationService,
    IConfigurationService,
    ILoggingService,
    IConductorViewModel,
    SERVICE_TOKENS
} from '../../../services/interfaces';
import { SmartAgentConfigInterface } from '../../../agents/types';

// Mock dependencies
jest.mock('../../../agents/AgentManager');
jest.mock('../../../tasks/TaskQueue');
jest.mock('../../../conductor/SmartConductor');
jest.mock('../../../agents/AgentTemplateManager');
jest.mock('../../../agents/SmartTemplateSystem');
jest.mock('../../../agents/NaturalLanguageTemplateResolver');

describe('EnterpriseConductorCommands', () => {
    let commands: EnterpriseConductorCommands;
    let mockContainer: jest.Mocked<IContainer>;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockTaskQueue: jest.Mocked<TaskQueue>;
    let mockCommandService: jest.Mocked<ICommandService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        // Setup mock services
        mockAgentManager = {
            getActiveAgents: jest.fn().mockReturnValue([]),
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
            dispose: jest.fn()
        } as any;

        mockTaskQueue = {
            dispose: jest.fn()
        } as any;

        mockCommandService = {
            register: jest.fn(),
            execute: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockNotificationService = {
            showInformation: jest.fn().mockResolvedValue(undefined),
            showWarning: jest.fn().mockResolvedValue(undefined),
            showError: jest.fn().mockResolvedValue(undefined),
            showInputBox: jest.fn().mockResolvedValue(undefined),
            showQuickPick: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockConfigService = {
            get: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockLoggingService = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn()
        } as any;

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

        // Setup mock container
        mockContainer = {
            resolve: jest.fn((token: string) => {
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
                        throw new Error(`Unknown service token: ${token}`);
                }
            }),
            resolveOptional: jest.fn()
        } as any;

        // Create commands instance
        commands = new EnterpriseConductorCommands(mockContainer);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with valid container', () => {
            expect(commands).toBeDefined();
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.AgentManager);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.TaskQueue);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.CommandService);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.NotificationService);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.ConfigurationService);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.LoggingService);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.ExtensionContext);
        });

        it('should throw ConfigurationError if required dependency is missing', () => {
            mockContainer.resolve.mockImplementation((token: string) => {
                if (token === SERVICE_TOKENS.AgentManager) {
                    return null;
                }
                return mockAgentManager;
            });

            expect(() => new EnterpriseConductorCommands(mockContainer)).toThrow(ConfigurationError);
        });

        it('should throw ConfigurationError if container resolve fails', () => {
            mockContainer.resolve.mockImplementation(() => {
                throw new Error('Container resolution failed');
            });

            expect(() => new EnterpriseConductorCommands(mockContainer)).toThrow(ConfigurationError);
        });
    });

    describe('setAgentProvider', () => {
        it('should set agent provider successfully', () => {
            const mockProvider = {} as AgentTreeProvider;

            expect(() => commands.setAgentProvider(mockProvider)).not.toThrow();
            expect(mockLoggingService.debug).toHaveBeenCalledWith('AgentTreeProvider set successfully');
        });

        it('should throw ValidationError if provider is null', () => {
            expect(() => commands.setAgentProvider(null as any)).toThrow(ValidationError);
        });

        it('should throw ValidationError if provider is undefined', () => {
            expect(() => commands.setAgentProvider(undefined as any)).toThrow(ValidationError);
        });
    });

    describe('register', () => {
        it('should register all commands successfully', () => {
            expect(() => commands.register()).not.toThrow();

            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.startConductor', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.quickStartChat', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.openConductorChat', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith(
                'nofx.openConductorTerminal',
                expect.any(Function)
            );
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.openSimpleConductor', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.openConductorPanel', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.startSmartTeam', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.spawnSmartAgent', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith(
                'nofx.createAgentFromNaturalLanguage',
                expect.any(Function)
            );

            expect(mockLoggingService.info).toHaveBeenCalledWith('Registered 9 enterprise conductor commands');
        });

        it('should handle registration errors', () => {
            mockCommandService.register.mockImplementation(() => {
                throw new Error('Registration failed');
            });

            expect(() => commands.register()).toThrow(ConfigurationError);
        });
    });

    describe('startConductor command', () => {
        beforeEach(() => {
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
            commands.register();
        });

        it('should start conductor successfully with team selection', async () => {
            const teamPreset = {
                label: '$(rocket) Full-Stack Development Team',
                description: 'Frontend, Backend, Database, and DevOps specialists',
                value: {
                    value: 'fullstack',
                    agents: ['frontend-specialist', 'backend-specialist', 'database-architect', 'devops-engineer']
                }
            };

            mockNotificationService.showQuickPick.mockResolvedValueOnce(teamPreset);
            mockAgentManager.getActiveAgents.mockReturnValueOnce([
                { id: 'agent-1', name: 'Test Agent', type: 'test', status: 'idle' } as any
            ]);

            // Mock AgentTemplateManager
            const mockTemplateManager = {
                getTemplate: jest.fn().mockResolvedValue({
                    id: 'frontend-specialist',
                    name: 'Frontend Specialist'
                })
            };
            jest.doMock('../../../agents/AgentTemplateManager', () => ({
                AgentTemplateManager: jest.fn().mockImplementation(() => mockTemplateManager)
            }));

            // Mock SmartConductor
            const mockSmartConductor = {
                start: jest.fn().mockResolvedValue(undefined),
                dispose: jest.fn()
            };
            (SmartConductor as jest.Mock).mockImplementation(() => mockSmartConductor);

            // Get the registered command function
            const startConductorCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.startConductor'
            );
            expect(startConductorCall).toBeDefined();

            const startConductorFn = startConductorCall![1];
            await startConductorFn();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                'NofX: Starting enterprise conductor setup...'
            );
            expect(mockNotificationService.showQuickPick).toHaveBeenCalled();
        });

        it('should handle user cancellation gracefully', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            const startConductorCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.startConductor'
            );
            const startConductorFn = startConductorCall![1];

            await expect(startConductorFn()).rejects.toThrow('User cancelled team selection');
        });

        it('should handle no workspace folder error', async () => {
            (vscode.workspace as any).workspaceFolders = undefined;

            const startConductorCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.startConductor'
            );
            const startConductorFn = startConductorCall![1];

            await expect(startConductorFn()).rejects.toThrow(ValidationError);
        });

        it('should handle custom team selection', async () => {
            const customTeamPreset = {
                label: '$(person) Custom Team',
                value: {
                    value: 'custom',
                    agents: []
                }
            };

            mockNotificationService.showQuickPick.mockResolvedValueOnce(customTeamPreset);

            const startConductorCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.startConductor'
            );
            const startConductorFn = startConductorCall![1];
            await startConductorFn();

            expect(mockCommandService.execute).toHaveBeenCalledWith('nofx.addAgent');
        });

        it('should retry on transient failures', async () => {
            mockNotificationService.showInformation
                .mockRejectedValueOnce(new Error('Transient error'))
                .mockResolvedValueOnce(undefined);

            mockNotificationService.showQuickPick.mockResolvedValueOnce({
                label: 'Test Team',
                value: { value: 'custom', agents: [] }
            });

            const startConductorCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.startConductor'
            );
            const startConductorFn = startConductorCall![1];
            await startConductorFn();

            expect(mockNotificationService.showInformation).toHaveBeenCalledTimes(3); // 1 retry + 2 success calls
        });

        it('should handle circuit breaker open state', async () => {
            // Simulate multiple failures to trigger circuit breaker
            for (let i = 0; i < 5; i++) {
                mockNotificationService.showInformation.mockRejectedValueOnce(new Error('Service failure'));

                const startConductorCall = mockCommandService.register.mock.calls.find(
                    call => call[0] === 'nofx.startConductor'
                );
                const startConductorFn = startConductorCall![1];

                try {
                    await startConductorFn();
                } catch (error) {
                    // Expected to fail
                }
            }

            // Circuit breaker should now be open
            const startConductorCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.startConductor'
            );
            const startConductorFn = startConductorCall![1];

            await expect(startConductorFn()).rejects.toThrow('Circuit breaker is OPEN');
        });
    });

    describe('quickStartChat command', () => {
        beforeEach(() => {
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
            commands.register();
        });

        it('should start quick chat successfully', async () => {
            const projectType = {
                label: '$(globe) Web Application',
                value: {
                    value: 'web',
                    teamPreset: 'frontend',
                    teamName: 'Frontend Team',
                    agents: ['frontend-specialist', 'testing-specialist']
                }
            };

            mockNotificationService.showQuickPick.mockResolvedValueOnce(projectType);
            mockAgentManager.getActiveAgents.mockReturnValueOnce([
                { id: 'agent-1', name: 'Test Agent', type: 'test', status: 'idle' } as any
            ]);

            const quickStartCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.quickStartChat'
            );
            const quickStartFn = quickStartCall![1];
            await quickStartFn();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalled();
        });

        it('should handle user cancellation', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            const quickStartCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.quickStartChat'
            );
            const quickStartFn = quickStartCall![1];

            await expect(quickStartFn()).rejects.toThrow('User cancelled project type selection');
        });

        it('should handle no workspace folder', async () => {
            (vscode.workspace as any).workspaceFolders = undefined;

            const quickStartCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.quickStartChat'
            );
            const quickStartFn = quickStartCall![1];

            await expect(quickStartFn()).rejects.toThrow(ValidationError);
        });
    });

    describe('openConductorTerminal command', () => {
        beforeEach(() => {
            commands.register();
        });

        it('should open conductor terminal successfully', async () => {
            mockAgentManager.getActiveAgents.mockReturnValueOnce([
                { id: 'agent-1', name: 'Test Agent', type: 'test', status: 'idle' } as any
            ]);

            const mockSmartConductor = {
                start: jest.fn().mockResolvedValue(undefined),
                dispose: jest.fn()
            };
            (SmartConductor as jest.Mock).mockImplementation(() => mockSmartConductor);

            const openTerminalCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.openConductorTerminal'
            );
            const openTerminalFn = openTerminalCall![1];
            await openTerminalFn();

            expect(mockSmartConductor.start).toHaveBeenCalled();
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('Active Agents conductor started');
        });

        it('should handle no agents available', async () => {
            mockAgentManager.getActiveAgents.mockReturnValueOnce([]);

            const openTerminalCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.openConductorTerminal'
            );
            const openTerminalFn = openTerminalCall![1];

            await expect(openTerminalFn()).rejects.toThrow(ValidationError);
        });

        it('should handle Smart Conductor start failure', async () => {
            mockAgentManager.getActiveAgents.mockReturnValueOnce([
                { id: 'agent-1', name: 'Test Agent', type: 'test', status: 'idle' } as any
            ]);

            const mockSmartConductor = {
                start: jest.fn().mockRejectedValue(new Error('Conductor start failed')),
                dispose: jest.fn()
            };
            (SmartConductor as jest.Mock).mockImplementation(() => mockSmartConductor);

            const openTerminalCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.openConductorTerminal'
            );
            const openTerminalFn = openTerminalCall![1];

            await expect(openTerminalFn()).rejects.toThrow('Failed to start Smart Conductor');
        });
    });

    describe('startSmartTeam command', () => {
        beforeEach(() => {
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
            commands.register();
        });

        it('should start smart team successfully', async () => {
            const smartTeamPreset = {
                label: '$(rocket) Smart Full-Stack Team',
                value: {
                    value: 'smart-fullstack',
                    name: 'Smart Full-Stack Team',
                    description: 'Dynamically configured full-stack development team',
                    agentConfigs: [
                        {
                            category: 'developer',
                            primaryDomain: 'frontend',
                            complexity: 'high',
                            priority: 'high'
                        }
                    ]
                }
            };

            mockNotificationService.showQuickPick.mockResolvedValueOnce(smartTeamPreset);
            mockAgentManager.getActiveAgents.mockReturnValueOnce([
                { id: 'agent-1', name: 'Test Agent', type: 'test', status: 'idle' } as any
            ]);

            // Mock SmartTemplateFactory
            jest.doMock('../../../agents/SmartTemplateSystem', () => ({
                SmartTemplateFactory: {
                    createTemplate: jest.fn().mockReturnValue({
                        id: 'smart-template',
                        name: 'Smart Template'
                    })
                }
            }));

            const startSmartTeamCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.startSmartTeam'
            );
            const startSmartTeamFn = startSmartTeamCall![1];
            await startSmartTeamFn();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalled();
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('NofX: Starting smart team setup...');
        });

        it('should handle custom smart team selection', async () => {
            const customSmartTeamPreset = {
                label: '$(person) Custom Smart Team',
                value: {
                    value: 'smart-custom',
                    name: 'Custom Smart Team',
                    agentConfigs: []
                }
            };

            mockNotificationService.showQuickPick.mockResolvedValueOnce(customSmartTeamPreset);

            const startSmartTeamCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.startSmartTeam'
            );
            const startSmartTeamFn = startSmartTeamCall![1];
            await startSmartTeamFn();

            // Should call spawnSmartAgent for custom team
            expect(mockNotificationService.showQuickPick).toHaveBeenCalled();
        });

        it('should handle no workspace folder', async () => {
            (vscode.workspace as any).workspaceFolders = undefined;

            const startSmartTeamCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.startSmartTeam'
            );
            const startSmartTeamFn = startSmartTeamCall![1];

            await expect(startSmartTeamFn()).rejects.toThrow(ValidationError);
        });

        it('should validate smart team configuration', async () => {
            const invalidSmartTeamPreset = {
                label: 'Invalid Team',
                value: {
                    value: 'invalid',
                    name: '<script>alert("xss")</script>',
                    agentConfigs: [
                        {
                            category: 'invalid' as any,
                            complexity: 'high',
                            priority: 'high'
                        }
                    ]
                }
            };

            mockNotificationService.showQuickPick.mockResolvedValueOnce(invalidSmartTeamPreset as any);

            const startSmartTeamCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.startSmartTeam'
            );
            const startSmartTeamFn = startSmartTeamCall![1];

            await expect(startSmartTeamFn()).rejects.toThrow(ValidationError);
        });
    });

    describe('createAgentFromNaturalLanguage command', () => {
        beforeEach(() => {
            commands.register();
        });

        it('should create agent from natural language successfully', async () => {
            const userInput = 'I need a React developer for UI work';

            (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(userInput);

            // Mock NaturalLanguageTemplateResolver
            const mockParseResult = {
                confidence: 0.8,
                parsedIntent: {
                    action: 'spawn_agent',
                    agentType: 'frontend-developer'
                },
                extractedConfig: {
                    category: 'developer',
                    primaryDomain: 'frontend',
                    complexity: 'medium',
                    priority: 'medium'
                }
            };

            jest.doMock('../../../agents/NaturalLanguageTemplateResolver', () => ({
                NaturalLanguageTemplateResolver: {
                    parseNaturalLanguageRequest: jest.fn().mockReturnValue(mockParseResult)
                }
            }));

            // Mock SmartTemplateFactory
            jest.doMock('../../../agents/SmartTemplateSystem', () => ({
                SmartTemplateFactory: {
                    createTemplate: jest.fn().mockReturnValue({
                        id: 'smart-template',
                        name: 'Frontend Developer'
                    })
                }
            }));

            const createAgentCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.createAgentFromNaturalLanguage'
            );
            const createAgentFn = createAgentCall![1];
            await createAgentFn();

            expect(vscode.window.showInputBox).toHaveBeenCalled();
        });

        it('should handle user cancellation', async () => {
            (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(undefined);

            const createAgentCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.createAgentFromNaturalLanguage'
            );
            const createAgentFn = createAgentCall![1];

            await expect(createAgentFn()).rejects.toThrow('User cancelled natural language request');
        });

        it('should validate input', async () => {
            (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce('<script>alert("xss")</script>');

            const createAgentCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.createAgentFromNaturalLanguage'
            );
            const createAgentFn = createAgentCall![1];

            await expect(createAgentFn()).rejects.toThrow('Invalid natural language request after sanitization');
        });

        it('should handle low confidence parsing', async () => {
            const userInput = 'create something';

            (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(userInput);

            const mockParseResult = {
                confidence: 0.2,
                parsedIntent: {
                    action: 'spawn_agent'
                },
                suggestions: ['Try being more specific about the agent type you need']
            };

            jest.doMock('../../../agents/NaturalLanguageTemplateResolver', () => ({
                NaturalLanguageTemplateResolver: {
                    parseNaturalLanguageRequest: jest.fn().mockReturnValue(mockParseResult)
                }
            }));

            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Try Again');

            const createAgentCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.createAgentFromNaturalLanguage'
            );
            const createAgentFn = createAgentCall![1];
            await createAgentFn();

            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        });

        it('should handle medium confidence parsing', async () => {
            const userInput = 'I need a developer';

            (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(userInput);

            const mockParseResult = {
                confidence: 0.6,
                parsedIntent: {
                    action: 'spawn_agent',
                    agentType: 'developer'
                },
                extractedConfig: {
                    category: 'developer',
                    complexity: 'medium',
                    priority: 'medium'
                }
            };

            jest.doMock('../../../agents/NaturalLanguageTemplateResolver', () => ({
                NaturalLanguageTemplateResolver: {
                    parseNaturalLanguageRequest: jest.fn().mockReturnValue(mockParseResult)
                }
            }));

            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Yes, Create');

            const createAgentCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.createAgentFromNaturalLanguage'
            );
            const createAgentFn = createAgentCall![1];
            await createAgentFn();

            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });

        it('should handle operation timeout', async () => {
            (vscode.window.showInputBox as jest.Mock).mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve('test input'), 20000)) // 20 seconds
            );

            const createAgentCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.createAgentFromNaturalLanguage'
            );
            const createAgentFn = createAgentCall![1];

            await expect(createAgentFn()).rejects.toThrow(OperationTimeoutError);
        });
    });

    describe('openConductorPanel command', () => {
        beforeEach(() => {
            commands.register();
        });

        it('should open conductor panel successfully', async () => {
            const mockViewModel = {} as IConductorViewModel;
            mockContainer.resolve.mockImplementation((token: symbol) => {
                if (token === SERVICE_TOKENS.ConductorViewModel) {
                    return mockViewModel;
                }
                return mockContainer.resolve(token);
            });

            // Mock ConductorPanel
            const mockConductorPanel = {
                createOrShow: jest.fn()
            };
            jest.doMock('../../../panels/ConductorPanel', () => ({
                ConductorPanel: mockConductorPanel
            }));

            const openPanelCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.openConductorPanel'
            );
            const openPanelFn = openPanelCall![1];
            await openPanelFn();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('Conductor Panel opened');
        });

        it('should handle panel creation failure', async () => {
            mockContainer.resolve.mockImplementation((token: symbol) => {
                if (token === SERVICE_TOKENS.ConductorViewModel) {
                    throw new Error('ViewModel not available');
                }
                return mockContainer.resolve(token);
            });

            const openPanelCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.openConductorPanel'
            );
            const openPanelFn = openPanelCall![1];
            await openPanelFn();

            expect(mockNotificationService.showError).toHaveBeenCalledWith('Failed to open Conductor Panel');
        });
    });

    describe('Input Validation', () => {
        it('should validate team names', () => {
            const { CommandInputValidator } = require('../../../commands/EnterpriseConductorCommands');

            const validResult = CommandInputValidator.validateTeamConfiguration('Valid Team', [{}]);
            expect(validResult.errors).toContain('At least one agent configuration is required');

            const invalidNameResult = CommandInputValidator.validateTeamConfiguration('<script>alert("xss")</script>', [
                {}
            ]);
            expect(invalidNameResult.errors).toContain('Team name contains potentially dangerous content');

            const emptyNameResult = CommandInputValidator.validateTeamConfiguration('', [{}]);
            expect(emptyNameResult.errors).toContain('Team name is required');

            const longNameResult = CommandInputValidator.validateTeamConfiguration('a'.repeat(100), [{}]);
            expect(longNameResult.errors).toContain('Team name contains invalid characters or is too long');
        });

        it('should validate agent configurations', () => {
            const { CommandInputValidator } = require('../../../commands/EnterpriseConductorCommands');

            const validConfig = {
                category: 'developer',
                complexity: 'high',
                priority: 'critical'
            };
            const validResult = CommandInputValidator.validateAgentConfiguration(validConfig);
            expect(validResult).toEqual([]);

            const invalidCategoryConfig = {
                category: 'invalid',
                complexity: 'high',
                priority: 'critical'
            };
            const invalidCategoryResult = CommandInputValidator.validateAgentConfiguration(invalidCategoryConfig);
            expect(invalidCategoryResult).toContain('Agent: Invalid category');

            const invalidComplexityConfig = {
                category: 'developer',
                complexity: 'invalid',
                priority: 'critical'
            };
            const invalidComplexityResult = CommandInputValidator.validateAgentConfiguration(invalidComplexityConfig);
            expect(invalidComplexityResult).toContain('Agent: Invalid complexity level');

            const missingConfigResult = CommandInputValidator.validateAgentConfiguration(null);
            expect(missingConfigResult).toContain('Agent: Configuration is required');
        });

        it('should validate natural language requests', () => {
            const { CommandInputValidator } = require('../../../commands/EnterpriseConductorCommands');

            const validResult = CommandInputValidator.validateNaturalLanguageRequest('I need a React developer');
            expect(validResult.isValid).toBe(true);

            const emptyResult = CommandInputValidator.validateNaturalLanguageRequest('');
            expect(emptyResult.isValid).toBe(false);
            expect(emptyResult.errors).toContain('Natural language request is required');

            const shortResult = CommandInputValidator.validateNaturalLanguageRequest('hi');
            expect(shortResult.isValid).toBe(false);
            expect(shortResult.errors).toContain('Natural language request is too short');

            const longResult = CommandInputValidator.validateNaturalLanguageRequest('a'.repeat(600));
            expect(longResult.isValid).toBe(false);
            expect(longResult.errors).toContain('Natural language request is too long (maximum 500 characters)');

            const dangerousResult = CommandInputValidator.validateNaturalLanguageRequest(
                '<script>alert("xss")</script>'
            );
            expect(dangerousResult.isValid).toBe(false);
            expect(dangerousResult.errors).toContain('Natural language request contains potentially dangerous content');
        });

        it('should sanitize inputs', () => {
            const { CommandInputValidator } = require('../../../commands/EnterpriseConductorCommands');

            const sanitized = CommandInputValidator.sanitizeInput('<script>alert("xss")</script>');
            expect(sanitized).not.toContain('<script>');
            expect(sanitized).not.toContain('alert');

            const longInput = 'a'.repeat(300);
            const sanitizedLong = CommandInputValidator.sanitizeInput(longInput);
            expect(sanitizedLong.length).toBeLessThanOrEqual(200);

            const whitespaceInput = '  test input  ';
            const sanitizedWhitespace = CommandInputValidator.sanitizeInput(whitespaceInput);
            expect(sanitizedWhitespace).toBe('test input');
        });
    });

    describe('Error Scenarios', () => {
        beforeEach(() => {
            commands.register();
        });

        it('should handle multiple concurrent command executions', async () => {
            mockAgentManager.getActiveAgents.mockReturnValue([
                { id: 'agent-1', name: 'Test Agent', type: 'test', status: 'idle' } as any
            ]);

            const openTerminalCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.openConductorTerminal'
            );
            const openTerminalFn = openTerminalCall![1];

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(openTerminalFn());
            }

            const results = await Promise.allSettled(promises);
            const successful = results.filter(r => r.status === 'fulfilled');

            expect(successful.length).toBeGreaterThan(0);
        });

        it('should handle null and undefined inputs gracefully', () => {
            expect(() => commands.setAgentProvider(null as any)).toThrow(ValidationError);
            expect(() => commands.setAgentProvider(undefined as any)).toThrow(ValidationError);
        });

        it('should handle unexpected errors in command execution', async () => {
            mockAgentManager.getActiveAgents.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            const openTerminalCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.openConductorTerminal'
            );
            const openTerminalFn = openTerminalCall![1];

            await expect(openTerminalFn()).rejects.toThrow();
            expect(mockLoggingService.error).toHaveBeenCalled();
        });
    });

    describe('getEnterpriseMetrics', () => {
        it('should return comprehensive enterprise metrics', () => {
            const metrics = commands.getEnterpriseMetrics();

            expect(metrics).toHaveProperty('commands');
            expect(metrics).toHaveProperty('userInteractions');
            expect(metrics).toHaveProperty('circuitBreaker');

            expect(metrics.userInteractions).toHaveProperty('teamSelections');
            expect(metrics.userInteractions).toHaveProperty('agentSpawns');
            expect(metrics.userInteractions).toHaveProperty('naturalLanguageRequests');
            expect(metrics.userInteractions).toHaveProperty('errors');
        });
    });

    describe('dispose', () => {
        it('should dispose resources properly', () => {
            commands.dispose();

            expect(mockLoggingService.info).toHaveBeenCalledWith('EnterpriseConductorCommands: Disposal completed');
        });

        it('should handle double disposal', () => {
            commands.dispose();
            commands.dispose();

            expect(mockLoggingService.info).toHaveBeenCalledWith('EnterpriseConductorCommands: Disposal completed');
        });
    });

    describe('Edge Cases and Boundary Values', () => {
        it('should handle empty arrays', () => {
            expect(mockAgentManager.getActiveAgents()).toEqual([]);
        });

        it('should handle very large inputs', async () => {
            const largeInput = 'a'.repeat(10000);

            (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(largeInput);

            const createAgentCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.createAgentFromNaturalLanguage'
            );
            const createAgentFn = createAgentCall![1];

            await expect(createAgentFn()).rejects.toThrow(ValidationError);
        });

        it('should handle special Unicode characters', async () => {
            const unicodeInput = '🤖 I need an AI agent for 测试';

            (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(unicodeInput);

            const mockParseResult = {
                confidence: 0.8,
                parsedIntent: {
                    action: 'spawn_agent',
                    agentType: 'ai-agent'
                },
                extractedConfig: {
                    category: 'developer',
                    complexity: 'medium',
                    priority: 'medium'
                }
            };

            jest.doMock('../../../agents/NaturalLanguageTemplateResolver', () => ({
                NaturalLanguageTemplateResolver: {
                    parseNaturalLanguageRequest: jest.fn().mockReturnValue(mockParseResult)
                }
            }));

            const createAgentCall = mockCommandService.register.mock.calls.find(
                call => call[0] === 'nofx.createAgentFromNaturalLanguage'
            );
            const createAgentFn = createAgentCall![1];

            // Should handle Unicode characters gracefully
            await expect(createAgentFn()).not.toThrow();
        });

        it('should handle minimum and maximum team sizes', () => {
            const { CommandInputValidator } = require('../../../commands/EnterpriseConductorCommands');

            // Empty team
            const emptyTeamResult = CommandInputValidator.validateTeamConfiguration('Test Team', []);
            expect(emptyTeamResult.isValid).toBe(false);
            expect(emptyTeamResult.errors).toContain('At least one agent configuration is required');

            // Maximum team size
            const largeTeam = Array(15).fill({ category: 'developer' });
            const largeTeamResult = CommandInputValidator.validateTeamConfiguration('Large Team', largeTeam);
            expect(largeTeamResult.isValid).toBe(false);
            expect(largeTeamResult.errors).toContain('Too many agents in team (maximum 10)');
        });
    });
});
