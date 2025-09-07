import * as vscode from 'vscode';
import { AgentCommands } from '../../../commands/AgentCommands';
import { AgentManager } from '../../../agents/AgentManager';
import { PickItem } from '../../../types/ui';

// Import actual interfaces
import { IContainer, ICommandService, INotificationService, IConfigurationService, SERVICE_TOKENS } from '../../../services/interfaces';
import { Agent } from '../../../agents/types';

interface AgentTemplate {
    id: string;
    name: string;
    icon: string;
    systemPrompt: string;
    capabilities: string[];
    taskPreferences?: any;
}

// Mock VS Code API
const mockTerminal = {
    show: jest.fn(),
    sendText: jest.fn(),
    dispose: jest.fn()
} as unknown as vscode.Terminal;

const mockWorkspaceFolder = {
    uri: {
        fsPath: '/workspace'
    }
} as vscode.WorkspaceFolder;

Object.defineProperty(vscode.workspace, 'workspaceFolders', {
    value: [mockWorkspaceFolder],
    configurable: true
});

Object.defineProperty(vscode.window, 'showInformationMessage', {
    value: jest.fn(),
    configurable: true
});

// Mock AgentTemplateManager
jest.mock('../../../agents/AgentTemplateManager', () => ({
    AgentTemplateManager: jest.fn().mockImplementation(() => ({
        getTemplates: jest.fn().mockResolvedValue([
            {
                id: 'frontend-specialist',
                name: 'Frontend Specialist',
                icon: '🎨',
                systemPrompt: 'You are a frontend expert',
                capabilities: ['React', 'Vue', 'CSS']
            },
            {
                id: 'backend-specialist',
                name: 'Backend Specialist',
                icon: '⚙️',
                systemPrompt: 'You are a backend expert',
                capabilities: ['Node.js', 'Python', 'APIs']
            }
        ]),
        getTemplate: jest.fn().mockImplementation((id: string) => {
            const templates = [
                {
                    id: 'frontend-specialist',
                    name: 'Frontend Specialist',
                    icon: '🎨',
                    systemPrompt: 'You are a frontend expert',
                    capabilities: ['React', 'Vue', 'CSS']
                },
                {
                    id: 'backend-specialist',
                    name: 'Backend Specialist',
                    icon: '⚙️',
                    systemPrompt: 'You are a backend expert',
                    capabilities: ['Node.js', 'Python', 'APIs']
                }
            ];
            return Promise.resolve(templates.find(t => t.id === id));
        })
    }))
}));

describe('AgentCommands', () => {
    let agentCommands: AgentCommands;
    let mockContainer: jest.Mocked<IContainer>;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockCommandService: jest.Mocked<ICommandService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;

    const mockAgent: Agent = {
        id: 'agent-123',
        name: 'Test Agent',
        type: 'frontend-specialist',
        status: 'idle',
        terminal: mockTerminal,
        currentTask: null,
        startTime: new Date('2023-01-01'),
        tasksCompleted: 0,
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

        // Setup mock agent manager
        mockAgentManager = {
            spawnAgent: jest.fn().mockResolvedValue(mockAgent),
            removeAgent: jest.fn().mockResolvedValue(undefined),
            getActiveAgents: jest.fn().mockReturnValue([mockAgent]),
            getAgent: jest.fn().mockReturnValue(mockAgent),
            renameAgent: jest.fn(),
            updateAgentType: jest.fn(),
            restoreAgents: jest.fn().mockResolvedValue(2)
        } as any;

        // Setup mock command service
        mockCommandService = {
            register: jest.fn(),
            registerTextEditorCommand: jest.fn(),
            execute: jest.fn().mockResolvedValue(undefined),
            getCommands: jest.fn().mockResolvedValue([]),
            getRegisteredCommands: jest.fn().mockReturnValue([]),
            hasCommand: jest.fn().mockReturnValue(false),
            unregister: jest.fn(),
            dispose: jest.fn()
        } as jest.Mocked<ICommandService>;

        // Setup mock notification service
        mockNotificationService = {
            showInformation: jest.fn().mockResolvedValue(undefined),
            showWarning: jest.fn().mockResolvedValue(undefined),
            showError: jest.fn().mockResolvedValue(undefined),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            withProgress: jest.fn(),
            confirm: jest.fn().mockResolvedValue(true),
            confirmDestructive: jest.fn().mockResolvedValue(true)
        } as jest.Mocked<INotificationService>;

        // Setup mock config service
        mockConfigService = {
            get: jest.fn(),
            getAll: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
            onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            validateAll: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
            getMaxAgents: jest.fn().mockReturnValue(5),
            getClaudePath: jest.fn().mockReturnValue('claude'),
            isAutoAssignTasks: jest.fn().mockReturnValue(true),
            isUseWorktrees: jest.fn().mockReturnValue(true),
            isShowAgentTerminalOnSpawn: jest.fn().mockReturnValue(false),
            isClaudeSkipPermissions: jest.fn().mockReturnValue(false),
            getTemplatesPath: jest.fn().mockReturnValue('.nofx/templates'),
            isPersistAgents: jest.fn().mockReturnValue(true),
            getLogLevel: jest.fn().mockReturnValue('info'),
            getOrchestrationHeartbeatInterval: jest.fn().mockReturnValue(10000),
            getOrchestrationHeartbeatTimeout: jest.fn().mockReturnValue(5000),
            getOrchestrationHistoryLimit: jest.fn().mockReturnValue(1000),
            getOrchestrationPersistencePath: jest.fn().mockReturnValue('.nofx/persistence'),
            getOrchestrationMaxFileSize: jest.fn().mockReturnValue(10 * 1024 * 1024)
        } as jest.Mocked<IConfigurationService>;

        // Setup mock context
        mockContext = {
            subscriptions: [],
            extensionUri: vscode.Uri.file('/extension'),
            globalState: {} as any,
            workspaceState: {} as any
        } as any;

        // Setup mock container
        mockContainer = {
            resolve: jest.fn().mockImplementation((token: symbol) => {
                switch (token) {
                    case SERVICE_TOKENS.AgentManager:
                        return mockAgentManager;
                    case SERVICE_TOKENS.CommandService:
                        return mockCommandService;
                    case SERVICE_TOKENS.NotificationService:
                        return mockNotificationService;
                    case SERVICE_TOKENS.ConfigurationService:
                        return mockConfigService;
                    case SERVICE_TOKENS.ExtensionContext:
                        return mockContext;
                    default:
                        return null;
                }
            }),
            register: jest.fn(),
            registerInstance: jest.fn(),
            resolveOptional: jest.fn(),
            has: jest.fn(),
            setLoggingService: jest.fn(),
            createScope: jest.fn(),
            dispose: jest.fn().mockResolvedValue(undefined)
        } as jest.Mocked<IContainer>;

        agentCommands = new AgentCommands(mockContainer);
    });

    describe('initialization and registration', () => {
        it('should initialize with container dependencies', () => {
            expect(agentCommands).toBeInstanceOf(AgentCommands);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.AgentManager);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.CommandService);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.NotificationService);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.ConfigurationService);
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.ExtensionContext);
        });

        it('should register all agent commands', () => {
            agentCommands.register();

            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.addAgent', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.deleteAgent', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.editAgent', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.focusAgentTerminal', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.restoreAgents', expect.any(Function));
        });

        it('should register commands with bound methods', () => {
            agentCommands.register();

            const calls = mockCommandService.register.mock.calls;
            expect(calls).toHaveLength(5);
            expect(calls.every(call => typeof call[1] === 'function')).toBe(true);
        });
    });

    describe('addAgent command', () => {
        it('should show agent selection options', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            await (agentCommands as any).addAgent();

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('NofX: Opening agent selection...');
            expect(mockNotificationService.showQuickPick).toHaveBeenCalledWith(
                [
                    {
                        label: '$(person) Individual Agent',
                        description: 'Add a single agent with specific capabilities',
                        value: 'individual'
                    },
                    {
                        label: '$(organization) Team Preset',
                        description: 'Add a pre-configured team of agents',
                        value: 'team'
                    }
                ],
                {
                    placeHolder: 'How would you like to add agents?'
                }
            );
        });

        it('should handle user cancellation of agent selection', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            await (agentCommands as any).addAgent();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledTimes(1);
            // Should not proceed to individual or team selection
        });

        it('should route to individual agent when selected', async () => {
            const mockSelection = { value: 'individual' };
            mockNotificationService.showQuickPick.mockResolvedValueOnce(mockSelection);
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined); // Cancel template selection

            await (agentCommands as any).addAgent();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledTimes(2);
            // Second call should be for template selection
            expect(mockNotificationService.showQuickPick).toHaveBeenNthCalledWith(2,
                expect.arrayContaining([
                    expect.objectContaining({
                        label: '🎨 Frontend Specialist',
                        value: 'frontend-specialist'
                    })
                ]),
                { placeHolder: 'Select an agent template' }
            );
        });

        it('should route to team preset when selected', async () => {
            const mockSelection = { value: 'team' };
            mockNotificationService.showQuickPick.mockResolvedValueOnce(mockSelection);
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined); // Cancel team selection

            await (agentCommands as any).addAgent();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledTimes(2);
            // Second call should be for team preset selection
            expect(mockNotificationService.showQuickPick).toHaveBeenNthCalledWith(2,
                expect.arrayContaining([
                    expect.objectContaining({
                        label: '$(rocket) Full-Stack Development Team',
                        value: expect.objectContaining({
                            agents: ['frontend-specialist', 'backend-specialist', 'database-architect', 'devops-engineer']
                        })
                    })
                ]),
                { placeHolder: 'Select a team preset' }
            );
        });

        it('should handle error in showing info message', async () => {
            (vscode.window.showInformationMessage as jest.Mock).mockImplementation(() => {
                throw new Error('VS Code API error');
            });

            // Should not throw, should handle error gracefully
            await expect((agentCommands as any).addAgent()).resolves.not.toThrow();
        });
    });

    describe('addIndividualAgent', () => {
        it('should handle no workspace folder', async () => {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: undefined,
                configurable: true
            });

            await (agentCommands as any).addIndividualAgent();

            expect(mockNotificationService.showError).toHaveBeenCalledWith('No workspace folder open');
        });

        it('should show template selection with capabilities', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            await (agentCommands as any).addIndividualAgent();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        label: '🎨 Frontend Specialist',
                        description: 'React, Vue, CSS',
                        value: 'frontend-specialist'
                    }),
                    expect.objectContaining({
                        label: '⚙️ Backend Specialist',
                        description: 'Node.js, Python, APIs',
                        value: 'backend-specialist'
                    })
                ]),
                { placeHolder: 'Select an agent template' }
            );
        });

        it('should handle template with non-array capabilities', async () => {
            const { AgentTemplateManager } = require('../../../agents/AgentTemplateManager');
            const mockTemplateManager = new AgentTemplateManager('/workspace');
            mockTemplateManager.getTemplates.mockResolvedValueOnce([
                {
                    id: 'custom-agent',
                    name: 'Custom Agent',
                    icon: '🤖',
                    capabilities: 'not-an-array'
                }
            ]);

            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            await (agentCommands as any).addIndividualAgent();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        label: '🤖 Custom Agent',
                        description: 'Custom agent',
                        value: 'custom-agent'
                    })
                ]),
                { placeHolder: 'Select an agent template' }
            );
        });

        it('should prompt for agent name with validation', async () => {
            const mockTemplate = { value: 'frontend-specialist' };
            mockNotificationService.showQuickPick.mockResolvedValueOnce(mockTemplate);
            mockNotificationService.showInputBox.mockResolvedValueOnce(undefined);

            await (agentCommands as any).addIndividualAgent();

            expect(mockNotificationService.showInputBox).toHaveBeenCalledWith({
                prompt: 'Enter agent name',
                value: 'Frontend Specialist',
                validateInput: expect.any(Function)
            });

            // Test validation function
            const options = mockNotificationService.showInputBox.mock.calls[0][0];
            expect(options.validateInput!('')).toBe('Agent name is required');
            expect(options.validateInput!('   ')).toBe('Agent name is required');
            expect(options.validateInput!('Valid Name')).toBeUndefined();
        });

        it('should create agent successfully', async () => {
            const mockTemplate = { value: 'frontend-specialist' };
            const agentName = 'My Frontend Agent';
            
            mockNotificationService.showQuickPick.mockResolvedValueOnce(mockTemplate);
            mockNotificationService.showInputBox.mockResolvedValueOnce(agentName);

            await (agentCommands as any).addIndividualAgent();

            expect(mockAgentManager.spawnAgent).toHaveBeenCalledWith({
                name: agentName,
                type: 'frontend-specialist',
                template: expect.objectContaining({
                    id: 'frontend-specialist',
                    name: 'Frontend Specialist'
                })
            });
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('Agent "My Frontend Agent" created successfully');
        });

        it('should handle template not found', async () => {
            const mockTemplate = { value: 'non-existent-template' };
            mockNotificationService.showQuickPick.mockResolvedValueOnce(mockTemplate);

            await (agentCommands as any).addIndividualAgent();

            expect(mockAgentManager.spawnAgent).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        it('should handle user cancellation at template selection', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            await (agentCommands as any).addIndividualAgent();

            expect(mockNotificationService.showInputBox).not.toHaveBeenCalled();
            expect(mockAgentManager.spawnAgent).not.toHaveBeenCalled();
        });

        it('should handle user cancellation at name input', async () => {
            const mockTemplate = { value: 'frontend-specialist' };
            mockNotificationService.showQuickPick.mockResolvedValueOnce(mockTemplate);
            mockNotificationService.showInputBox.mockResolvedValueOnce(undefined);

            await (agentCommands as any).addIndividualAgent();

            expect(mockAgentManager.spawnAgent).not.toHaveBeenCalled();
        });
    });

    describe('addTeamPreset', () => {
        it('should show team preset options', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            await (agentCommands as any).addTeamPreset();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        label: '$(rocket) Full-Stack Development Team',
                        description: 'Frontend, Backend, Database, and DevOps specialists',
                        value: expect.objectContaining({
                            agents: ['frontend-specialist', 'backend-specialist', 'database-architect', 'devops-engineer']
                        })
                    }),
                    expect.objectContaining({
                        label: '$(beaker) Testing & Quality Team',
                        value: expect.objectContaining({
                            agents: ['testing-specialist', 'security-expert', 'backend-specialist']
                        })
                    })
                ]),
                { placeHolder: 'Select a team preset' }
            );
        });

        it('should handle no workspace folder for team creation', async () => {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: undefined,
                configurable: true
            });

            const mockPreset = {
                value: {
                    agents: ['frontend-specialist'],
                    label: 'Test Team'
                }
            };
            mockNotificationService.showQuickPick.mockResolvedValueOnce(mockPreset);

            await (agentCommands as any).addTeamPreset();

            expect(mockNotificationService.showError).toHaveBeenCalledWith('No workspace folder open');
        });

        it('should create all team agents successfully', async () => {
            const mockPreset = {
                value: {
                    agents: ['frontend-specialist', 'backend-specialist'],
                    label: '$(test) Test Team'
                }
            };
            mockNotificationService.showQuickPick.mockResolvedValueOnce(mockPreset);

            await (agentCommands as any).addTeamPreset();

            expect(mockAgentManager.spawnAgent).toHaveBeenCalledTimes(2);
            expect(mockAgentManager.spawnAgent).toHaveBeenNthCalledWith(1, {
                name: 'Frontend Specialist',
                type: 'frontend-specialist',
                template: expect.objectContaining({ id: 'frontend-specialist' })
            });
            expect(mockAgentManager.spawnAgent).toHaveBeenNthCalledWith(2, {
                name: 'Backend Specialist',
                type: 'backend-specialist',
                template: expect.objectContaining({ id: 'backend-specialist' })
            });
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                'Team "$(test) Test Team" created with 2 agents'
            );
            expect(mockCommandService.execute).toHaveBeenCalledWith('nofx.openConductorTerminal');
        });

        it('should handle partial team creation failure', async () => {
            const mockPreset = {
                value: {
                    agents: ['frontend-specialist', 'non-existent-template'],
                    label: '$(test) Test Team'
                }
            };
            mockNotificationService.showQuickPick.mockResolvedValueOnce(mockPreset);
            mockAgentManager.spawnAgent.mockRejectedValueOnce(new Error('Spawn failed'));

            const { AgentTemplateManager } = require('../../../agents/AgentTemplateManager');
            const mockTemplateManager = new AgentTemplateManager('/workspace');
            mockTemplateManager.getTemplate.mockImplementation((id: string) => {
                if (id === 'frontend-specialist') {
                    return Promise.resolve({
                        id: 'frontend-specialist',
                        name: 'Frontend Specialist'
                    });
                }
                return Promise.resolve(null);
            });

            await (agentCommands as any).addTeamPreset();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                'Team "$(test) Test Team" created with 0 of 2 agents (2 failed)'
            );
        });

        it('should handle user cancellation of team selection', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            await (agentCommands as any).addTeamPreset();

            expect(mockAgentManager.spawnAgent).not.toHaveBeenCalled();
            expect(mockCommandService.execute).not.toHaveBeenCalled();
        });
    });

    describe('deleteAgent command', () => {
        it('should delete specified agent with confirmation', async () => {
            const agentId = 'agent-123';

            await (agentCommands as any).deleteAgent(agentId);

            expect(mockNotificationService.confirmDestructive).toHaveBeenCalledWith(
                'Delete agent? This will terminate their terminal.',
                'Delete'
            );
            expect(mockAgentManager.removeAgent).toHaveBeenCalledWith(agentId);
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('Agent deleted');
        });

        it('should show agent selection when no agentId provided', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce({ value: 'agent-123' });

            await (agentCommands as any).deleteAgent();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledWith(
                [
                    expect.objectContaining({
                        label: 'Test Agent (idle)',
                        description: 'frontend-specialist',
                        value: 'agent-123'
                    })
                ],
                { placeHolder: 'Select agent to delete' }
            );
            expect(mockAgentManager.removeAgent).toHaveBeenCalledWith('agent-123');
        });

        it('should handle no agents available for deletion', async () => {
            mockAgentManager.getActiveAgents.mockReturnValueOnce([]);

            await (agentCommands as any).deleteAgent();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('No agents to delete');
            expect(mockAgentManager.removeAgent).not.toHaveBeenCalled();
        });

        it('should handle user cancellation of agent selection', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            await (agentCommands as any).deleteAgent();

            expect(mockAgentManager.removeAgent).not.toHaveBeenCalled();
        });

        it('should handle user declining deletion confirmation', async () => {
            mockNotificationService.confirmDestructive.mockResolvedValueOnce(false);

            await (agentCommands as any).deleteAgent('agent-123');

            expect(mockAgentManager.removeAgent).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalledWith('Agent deleted');
        });
    });

    describe('editAgent command', () => {
        it('should edit specified agent name', async () => {
            const agentId = 'agent-123';
            mockNotificationService.showQuickPick.mockResolvedValueOnce({ value: 'name' });
            mockNotificationService.showInputBox.mockResolvedValueOnce('New Agent Name');

            await (agentCommands as any).editAgent(agentId);

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledWith(
                [
                    { label: 'Change Name', value: 'name' },
                    { label: 'Change Role', value: 'role' },
                    { label: 'Update Capabilities', value: 'capabilities' }
                ],
                { placeHolder: 'What would you like to edit?' }
            );
            expect(mockNotificationService.showInputBox).toHaveBeenCalledWith({
                prompt: 'Enter new name',
                value: 'Test Agent'
            });
            expect(mockAgentManager.renameAgent).toHaveBeenCalledWith('agent-123', 'New Agent Name');
        });

        it('should edit specified agent role', async () => {
            const agentId = 'agent-123';
            mockNotificationService.showQuickPick.mockResolvedValueOnce({ value: 'role' });
            mockNotificationService.showInputBox.mockResolvedValueOnce('backend-specialist');

            await (agentCommands as any).editAgent(agentId);

            expect(mockNotificationService.showInputBox).toHaveBeenCalledWith({
                prompt: 'Enter new role',
                value: 'frontend-specialist'
            });
            expect(mockAgentManager.updateAgentType).toHaveBeenCalledWith('agent-123', 'backend-specialist');
        });

        it('should show warning for capabilities edit', async () => {
            const agentId = 'agent-123';
            mockNotificationService.showQuickPick.mockResolvedValueOnce({ value: 'capabilities' });
            mockNotificationService.showInputBox.mockResolvedValueOnce('React, Vue, Angular');

            await (agentCommands as any).editAgent(agentId);

            expect(mockNotificationService.showInputBox).toHaveBeenCalledWith({
                prompt: 'Enter capabilities (comma-separated)',
                value: 'React, Vue, CSS'
            });
            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                'Capabilities are defined by the agent template and cannot be directly edited.'
            );
        });

        it('should show agent selection when no agentId provided', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce({ value: 'agent-123' });
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined); // Cancel edit action

            await (agentCommands as any).editAgent();

            expect(mockNotificationService.showQuickPick).toHaveBeenNthCalledWith(1,
                [
                    expect.objectContaining({
                        label: 'Test Agent',
                        description: 'frontend-specialist',
                        value: 'agent-123'
                    })
                ],
                { placeHolder: 'Select agent to edit' }
            );
        });

        it('should handle no agents available for editing', async () => {
            mockAgentManager.getActiveAgents.mockReturnValueOnce([]);

            await (agentCommands as any).editAgent();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('No agents to edit');
        });

        it('should handle agent not found', async () => {
            mockAgentManager.getAgent.mockReturnValueOnce(undefined);

            await (agentCommands as any).editAgent('non-existent-agent');

            expect(mockNotificationService.showError).toHaveBeenCalledWith('Agent not found');
        });

        it('should handle user cancellation of edit action', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            await (agentCommands as any).editAgent('agent-123');

            expect(mockAgentManager.renameAgent).not.toHaveBeenCalled();
            expect(mockAgentManager.updateAgentType).not.toHaveBeenCalled();
        });

        it('should handle user cancellation of input', async () => {
            mockNotificationService.showQuickPick.mockResolvedValueOnce({ value: 'name' });
            mockNotificationService.showInputBox.mockResolvedValueOnce(undefined);

            await (agentCommands as any).editAgent('agent-123');

            expect(mockAgentManager.renameAgent).not.toHaveBeenCalled();
        });

        it('should handle agent with no template capabilities', async () => {
            const agentWithoutTemplate: Agent = { ...mockAgent, template: undefined };
            mockAgentManager.getAgent.mockReturnValueOnce(agentWithoutTemplate);
            mockNotificationService.showQuickPick.mockResolvedValueOnce({ value: 'capabilities' });
            mockNotificationService.showInputBox.mockResolvedValueOnce('New capabilities');

            await (agentCommands as any).editAgent('agent-123');

            expect(mockNotificationService.showInputBox).toHaveBeenCalledWith({
                prompt: 'Enter capabilities (comma-separated)',
                value: ''
            });
        });
    });

    describe('focusAgentTerminal command', () => {
        it('should focus specified agent terminal', async () => {
            await (agentCommands as any).focusAgentTerminal('agent-123');

            expect(mockTerminal.show).toHaveBeenCalled();
        });

        it('should focus single active agent terminal', async () => {
            await (agentCommands as any).focusAgentTerminal();

            expect(mockTerminal.show).toHaveBeenCalled();
        });

        it('should show agent selection for multiple agents', async () => {
            const secondAgent: Agent = { ...mockAgent, id: 'agent-456', name: 'Second Agent' };
            mockAgentManager.getActiveAgents.mockReturnValueOnce([mockAgent, secondAgent]);
            mockNotificationService.showQuickPick.mockResolvedValueOnce({ value: 'agent-456' });
            mockAgentManager.getAgent.mockImplementation((id: string) => 
                id === 'agent-456' ? secondAgent : mockAgent
            );

            await (agentCommands as any).focusAgentTerminal();

            expect(mockNotificationService.showQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        label: 'Test Agent',
                        description: 'idle',
                        value: 'agent-123'
                    }),
                    expect.objectContaining({
                        label: 'Second Agent',
                        description: 'idle',
                        value: 'agent-456'
                    })
                ]),
                { placeHolder: 'Select agent terminal to focus' }
            );
        });

        it('should handle no active agents', async () => {
            mockAgentManager.getActiveAgents.mockReturnValueOnce([]);

            await (agentCommands as any).focusAgentTerminal();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('No active agents');
        });

        it('should handle agent not found', async () => {
            mockAgentManager.getAgent.mockReturnValueOnce(undefined);

            await (agentCommands as any).focusAgentTerminal('non-existent-agent');

            expect(mockNotificationService.showError).toHaveBeenCalledWith('Agent not found');
        });

        it('should handle agent with no terminal', async () => {
            const agentWithoutTerminal: Agent = { ...mockAgent, terminal: undefined as any };
            mockAgentManager.getAgent.mockReturnValueOnce(agentWithoutTerminal);

            await (agentCommands as any).focusAgentTerminal('agent-123');

            expect(mockNotificationService.showWarning).toHaveBeenCalledWith('Agent terminal not available');
        });

        it('should handle user cancellation of agent selection', async () => {
            const secondAgent: Agent = { ...mockAgent, id: 'agent-456', name: 'Second Agent' };
            mockAgentManager.getActiveAgents.mockReturnValueOnce([mockAgent, secondAgent]);
            mockNotificationService.showQuickPick.mockResolvedValueOnce(undefined);

            await (agentCommands as any).focusAgentTerminal();

            expect(mockTerminal.show).not.toHaveBeenCalled();
        });
    });

    describe('restoreAgents command', () => {
        it('should restore agents successfully', async () => {
            await (agentCommands as any).restoreAgents();

            expect(mockAgentManager.restoreAgents).toHaveBeenCalled();
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('Restored 2 agents');
        });

        it('should handle no agents to restore', async () => {
            mockAgentManager.restoreAgents.mockResolvedValueOnce(0);

            await (agentCommands as any).restoreAgents();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('No agents to restore');
        });
    });

    describe('disposal', () => {
        it('should dispose without errors', () => {
            expect(() => agentCommands.dispose()).not.toThrow();
        });
    });
});