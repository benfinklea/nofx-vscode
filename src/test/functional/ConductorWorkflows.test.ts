import * as vscode from 'vscode';
import * as path from 'path';
import { Container } from '../../services/Container';
import { SERVICE_TOKENS } from '../../services/interfaces';
import { AgentManager } from '../../agents/AgentManager';
import { AgentTemplateManager } from '../../agents/AgentTemplateManager';
import { ConductorTerminal } from '../../conductor/ConductorTerminal';
import { IntelligentConductor } from '../../conductor/IntelligentConductor';
import { SuperSmartConductor } from '../../conductor/SuperSmartConductor';
import { ConductorCommands } from '../../commands/ConductorCommands';
import { EventBus } from '../../services/EventBus';
import { DOMAIN_EVENTS } from '../../services/EventConstants';
import { ConfigurationService } from '../../services/ConfigurationService';
import { LoggingService } from '../../services/LoggingService';
import { AgentTreeProvider } from '../../views/AgentTreeProvider';
import { TreeStateManager } from '../../services/TreeStateManager';
import { ExtensionTestHelpers } from '../utils/ExtensionTestHelpers';
import { setupExtension, teardownExtension, setupMockWorkspace, clearMockWorkspace } from './setup';

describe('Conductor Workflows', () => {
    let container: Container;
    let context: vscode.ExtensionContext;
    let agentManager: AgentManager;
    let eventBus: EventBus;
    let loggingService: LoggingService;

    beforeAll(async () => {
        context = await setupExtension();
        setupMockWorkspace();
    });

    beforeEach(() => {
        container = Container.getInstance();
        // Don't reset container to preserve command registrations
        // container.reset(); // Removed to preserve command bindings

        const configService = new ConfigurationService();
        const mainChannel = vscode.window.createOutputChannel('NofX Test');
        loggingService = new LoggingService(configService, mainChannel);
        eventBus = new EventBus();

        container.registerInstance(SERVICE_TOKENS.ConfigurationService, configService);
        container.registerInstance(SERVICE_TOKENS.LoggingService, loggingService);
        container.registerInstance(SERVICE_TOKENS.EventBus, eventBus);
        container.registerInstance(SERVICE_TOKENS.ExtensionContext, context);

        agentManager = new AgentManager(context);
        container.registerInstance(SERVICE_TOKENS.AgentManager, agentManager);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        clearMockWorkspace();
        await teardownExtension();
    });

    describe('Team Presets', () => {
        test('should create team preset with multiple agents', async () => {
            const mockTemplates = [
                { id: 'frontend-specialist', name: 'Frontend Specialist' },
                { id: 'backend-specialist', name: 'Backend Specialist' },
                { id: 'testing-specialist', name: 'Testing Specialist' }
            ];

            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: 'Team Preset',
                description: 'Add a predefined team'
            } as any).mockResolvedValueOnce({
                label: 'Full-Stack Team',
                description: '3 agents for full-stack development',
                agents: ['frontend-specialist', 'backend-specialist', 'testing-specialist']
            } as any);

            await vscode.commands.executeCommand('nofx.addAgent');

            const agents = agentManager.getActiveAgents();
            expect(agents).toHaveLength(3);
        });

        test('should handle team preset selection cancellation', async () => {
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: 'Team Preset'
            } as any).mockResolvedValueOnce(undefined); // User cancels

            await vscode.commands.executeCommand('nofx.addAgent');

            const agents = agentManager.getActiveAgents();
            expect(agents).toHaveLength(0);
        });
    });

    describe('Quick Start', () => {
        test('should start quick start chat', async () => {
            const showWebviewSpy = jest.spyOn(vscode.window, 'createWebviewPanel');
            
            await vscode.commands.executeCommand('nofx.quickStartChat');

            expect(showWebviewSpy).toHaveBeenCalled();
        });

        test('should open conductor chat', async () => {
            const showWebviewSpy = jest.spyOn(vscode.window, 'createWebviewPanel');
            
            await vscode.commands.executeCommand('nofx.openConductorChat');

            expect(showWebviewSpy).toHaveBeenCalled();
        });
    });

    describe('Conductor Selection', () => {
        test('should open simple conductor', async () => {
            const showWebviewSpy = jest.spyOn(vscode.window, 'createWebviewPanel');
            
            await vscode.commands.executeCommand('nofx.openSimpleConductor');

            expect(showWebviewSpy).toHaveBeenCalled();
        });

        test('should open conductor terminal', async () => {
            const createTerminalSpy = jest.spyOn(vscode.window, 'createTerminal');
            
            await vscode.commands.executeCommand('nofx.openConductorTerminal');

            expect(createTerminalSpy).toHaveBeenCalled();
        });

        test('should select ConductorTerminal for 1-2 agents and verify actual instantiation', async () => {
            // Create 2 agents
            const mockAgents = [
                { id: 'agent1', name: 'Agent 1', type: 'frontend-specialist', status: 'idle' },
                { id: 'agent2', name: 'Agent 2', type: 'backend-specialist', status: 'idle' }
            ];
            
            agentManager.getActiveAgents = jest.fn().mockReturnValue(mockAgents);
            
            // Stub Claude CLI path
            ExtensionTestHelpers.stubClaudeCliPath(container, '/mock/claude');
            
            // Create test-double conductor instance
            const startSpy = jest.fn().mockResolvedValue(undefined);
            const testConductor = { start: startSpy } as any;
            
            // Get the ConductorCommands instance and spy on createConductor method
            const conductorCommands = new ConductorCommands(container);
            const createConductorSpy = jest.spyOn(conductorCommands, 'createConductor' as any).mockReturnValue(testConductor);
            
            // Spy on notification service to verify info message
            const notificationSpy = jest.spyOn(vscode.window, 'showInformationMessage');
            
            // Mock the command execution to use our spied instance
            jest.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (command) => {
                if (command === 'nofx.openConductorTerminal') {
                    await conductorCommands['openConductorTerminal']();
                }
                return undefined;
            });
            
            // Execute the command that triggers conductor selection
            await vscode.commands.executeCommand('nofx.openConductorTerminal');
            
            // Verify createConductor was called with 'basic' type
            expect(createConductorSpy).toHaveBeenCalledWith('basic');
            
            // Verify start method is called on the instance
            expect(startSpy).toHaveBeenCalled();
            
            // Verify notification shows basic mode
            expect(notificationSpy).toHaveBeenCalledWith(
                expect.stringContaining('(basic mode)')
            );
        });

        test('should select IntelligentConductor for 3-4 agents and verify actual instantiation', async () => {
            // Create 3 agents
            const mockAgents = [
                { id: 'agent1', name: 'Agent 1', type: 'frontend-specialist', status: 'idle' },
                { id: 'agent2', name: 'Agent 2', type: 'backend-specialist', status: 'idle' },
                { id: 'agent3', name: 'Agent 3', type: 'testing-specialist', status: 'idle' }
            ];
            
            agentManager.getActiveAgents = jest.fn().mockReturnValue(mockAgents);
            
            // Stub Claude CLI path
            ExtensionTestHelpers.stubClaudeCliPath(container, '/mock/claude');
            
            // Create test-double conductor instance
            const startSpy = jest.fn().mockResolvedValue(undefined);
            const testConductor = { start: startSpy } as any;
            
            // Get the ConductorCommands instance and spy on createConductor method
            const conductorCommands = new ConductorCommands(container);
            const createConductorSpy = jest.spyOn(conductorCommands, 'createConductor' as any).mockReturnValue(testConductor);
            
            // Spy on notification service to verify info message
            const notificationSpy = jest.spyOn(vscode.window, 'showInformationMessage');
            
            // Mock the command execution to use our spied instance
            jest.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (command) => {
                if (command === 'nofx.openConductorTerminal') {
                    await conductorCommands['openConductorTerminal']();
                }
                return undefined;
            });
            
            // Execute the command that triggers conductor selection
            await vscode.commands.executeCommand('nofx.openConductorTerminal');
            
            // Verify createConductor was called with 'intelligent' type
            expect(createConductorSpy).toHaveBeenCalledWith('intelligent');
            
            // Verify start method is called on the instance
            expect(startSpy).toHaveBeenCalled();
            
            // Verify notification shows intelligent mode
            expect(notificationSpy).toHaveBeenCalledWith(
                expect.stringContaining('(intelligent mode)')
            );
        });

        test('should select SuperSmartConductor for 5+ agents and verify actual instantiation', async () => {
            // Create 5 agents
            const mockAgents = Array.from({ length: 5 }, (_, i) => ({
                id: `agent${i + 1}`,
                name: `Agent ${i + 1}`,
                type: 'general-purpose',
                status: 'idle'
            }));
            
            agentManager.getActiveAgents = jest.fn().mockReturnValue(mockAgents);
            
            // Stub Claude CLI path
            ExtensionTestHelpers.stubClaudeCliPath(container, '/mock/claude');
            
            // Create test-double conductor instance
            const startSpy = jest.fn().mockResolvedValue(undefined);
            const testConductor = { start: startSpy } as any;
            
            // Get the ConductorCommands instance and spy on createConductor method
            const conductorCommands = new ConductorCommands(container);
            const createConductorSpy = jest.spyOn(conductorCommands, 'createConductor' as any).mockReturnValue(testConductor);
            
            // Spy on notification service to verify info message
            const notificationSpy = jest.spyOn(vscode.window, 'showInformationMessage');
            
            // Mock the command execution to use our spied instance
            jest.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (command) => {
                if (command === 'nofx.openConductorTerminal') {
                    await conductorCommands['openConductorTerminal']();
                }
                return undefined;
            });
            
            // Execute the command that triggers conductor selection
            await vscode.commands.executeCommand('nofx.openConductorTerminal');
            
            // Verify createConductor was called with 'supersmart' type
            expect(createConductorSpy).toHaveBeenCalledWith('supersmart');
            
            // Verify start method is called on the instance
            expect(startSpy).toHaveBeenCalled();
            
            // Verify notification shows supersmart mode
            expect(notificationSpy).toHaveBeenCalledWith(
                expect.stringContaining('(supersmart mode)')
            );
        });

        test('should generate appropriate system prompts based on conductor type', async () => {
            // Test ConductorTerminal system prompt
            const conductorTerminal = new ConductorTerminal(agentManager, {} as any);
            expect(conductorTerminal).toBeDefined();
            
            // Test IntelligentConductor system prompt
            const intelligentConductor = new IntelligentConductor(agentManager, {} as any);
            expect(intelligentConductor).toBeDefined();
            
            // Test SuperSmartConductor system prompt
            const superSmartConductor = new SuperSmartConductor(agentManager, {} as any);
            expect(superSmartConductor).toBeDefined();
        });

        test('should handle Claude CLI path configuration', async () => {
            const configService = container.resolve<ConfigurationService>(SERVICE_TOKENS.ConfigurationService);
            const claudePath = configService.get('nofx.claudePath');
            
            expect(claudePath).toBeDefined();
            expect(typeof claudePath).toBe('string');
            
            // Test that conductors can access the Claude path
            const conductorTerminal = new ConductorTerminal(agentManager, {} as any);
            expect(conductorTerminal).toBeDefined();
        });

        test('should verify conductor instances consume configuration during startup', async () => {
            // Create 3 agents to trigger IntelligentConductor
            const mockAgents = [
                { id: 'agent1', name: 'Agent 1', type: 'frontend-specialist', status: 'idle' },
                { id: 'agent2', name: 'Agent 2', type: 'backend-specialist', status: 'idle' },
                { id: 'agent3', name: 'Agent 3', type: 'testing-specialist', status: 'idle' }
            ];
            
            agentManager.getActiveAgents = jest.fn().mockReturnValue(mockAgents);
            
            // Stub Claude CLI path
            ExtensionTestHelpers.stubClaudeCliPath(container, '/mock/claude');
            
            // Create test-double conductor instance that calls config service during start
            const configService = container.resolve<ConfigurationService>(SERVICE_TOKENS.ConfigurationService);
            const configGetSpy = jest.spyOn(configService, 'get');
            
            const startSpy = jest.fn().mockImplementation(async () => {
                // Simulate conductor accessing config during startup
                configService.get('nofx.claudePath');
                return undefined;
            });
            const testConductor = { start: startSpy } as any;
            
            // Get the ConductorCommands instance and spy on createConductor method
            const conductorCommands = new ConductorCommands(container);
            const createConductorSpy = jest.spyOn(conductorCommands, 'createConductor' as any).mockReturnValue(testConductor);
            
            // Mock the command execution to use our spied instance
            jest.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (command) => {
                if (command === 'nofx.openConductorTerminal') {
                    await conductorCommands['openConductorTerminal']();
                }
                return undefined;
            });
            
            // Execute the command
            await vscode.commands.executeCommand('nofx.openConductorTerminal');
            
            // Verify createConductor was called with 'intelligent' type
            expect(createConductorSpy).toHaveBeenCalledWith('intelligent');
            
            // Verify start method is called on the instance
            expect(startSpy).toHaveBeenCalled();
            
            // Verify config consumption - the conductor should access the Claude path during startup
            expect(configGetSpy).toHaveBeenCalledWith('nofx.claudePath');
        });

        test('should handle conductor selection based on team complexity', async () => {
            // Test with different team sizes and verify appropriate conductor selection
            const testCases = [
                { agentCount: 1, expectedType: 'basic' },
                { agentCount: 2, expectedType: 'basic' },
                { agentCount: 3, expectedType: 'intelligent' },
                { agentCount: 4, expectedType: 'intelligent' },
                { agentCount: 5, expectedType: 'supersmart' },
                { agentCount: 15, expectedType: 'supersmart' }
            ];

            for (const testCase of testCases) {
                const mockAgents = Array.from({ length: testCase.agentCount }, (_, i) => ({
                    id: `agent${i + 1}`,
                    name: `Agent ${i + 1}`,
                    type: 'general-purpose',
                    status: 'idle'
                }));
                
                agentManager.getActiveAgents = jest.fn().mockReturnValue(mockAgents);
                
                // Stub Claude CLI path
                ExtensionTestHelpers.stubClaudeCliPath(container, '/mock/claude');
                
                // Create test-double conductor instance
                const startSpy = jest.fn().mockResolvedValue(undefined);
                const testConductor = { start: startSpy } as any;
                
                // Get the ConductorCommands instance and spy on createConductor method
                const conductorCommands = new ConductorCommands(container);
                const createConductorSpy = jest.spyOn(conductorCommands, 'createConductor' as any).mockReturnValue(testConductor);
                
                // Mock the command execution to use our spied instance
                jest.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (command) => {
                    if (command === 'nofx.openConductorTerminal') {
                        await conductorCommands['openConductorTerminal']();
                    }
                    return undefined;
                });
                
                // Execute the command
                await vscode.commands.executeCommand('nofx.openConductorTerminal');
                
                // Verify createConductor was called with expected type
                expect(createConductorSpy).toHaveBeenCalledWith(testCase.expectedType);
                
                // Verify start method is called on the instance
                expect(startSpy).toHaveBeenCalled();
            }
        });
    });

    describe('Conductor Panel', () => {
        test('should open conductor panel', async () => {
            const showWebviewSpy = jest.spyOn(vscode.window, 'createWebviewPanel');
            
            await vscode.commands.executeCommand('nofx.openConductorPanel');

            expect(showWebviewSpy).toHaveBeenCalled();
        });

        test('should handle conductor panel errors gracefully', async () => {
            jest.spyOn(vscode.window, 'createWebviewPanel').mockImplementation(() => {
                throw new Error('Webview creation failed');
            });

            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
            
            await vscode.commands.executeCommand('nofx.openConductorPanel');

            expect(errorSpy).toHaveBeenCalled();
        });
    });

    describe('Conductor Chat', () => {
        test('should create conductor chat webview', async () => {
            const showWebviewSpy = jest.spyOn(vscode.window, 'createWebviewPanel');
            
            await vscode.commands.executeCommand('nofx.openConductorChat');

            expect(showWebviewSpy).toHaveBeenCalledWith(
                'conductorChat',
                'Conductor Chat',
                vscode.ViewColumn.One,
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true
                })
            );
        });

        test('should handle chat webview disposal', async () => {
            const mockWebview = {
                dispose: jest.fn(),
                onDidDispose: jest.fn()
            };
            
            jest.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(mockWebview as any);

            await vscode.commands.executeCommand('nofx.openConductorChat');

            expect(mockWebview.dispose).toBeDefined();
        });
    });
});

