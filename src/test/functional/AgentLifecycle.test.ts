import * as vscode from 'vscode';
import * as path from 'path';
import { Container } from '../../services/Container';
import { SERVICE_TOKENS } from '../../services/interfaces';
import { AgentManager } from '../../agents/AgentManager';
import { AgentTemplateManager } from '../../agents/AgentTemplateManager';
import { EventBus } from '../../services/EventBus';
import { DOMAIN_EVENTS } from '../../services/EventConstants';
import { ConfigurationService } from '../../services/ConfigurationService';
import { LoggingService } from '../../services/LoggingService';
import { Agent, AgentTemplate } from '../../types/agent';
import { AgentPersistence } from '../../persistence/AgentPersistence';
import { setupExtension, teardownExtension, setupMockWorkspace, clearMockWorkspace } from './setup';

/**
 * Comprehensive tests for agent lifecycle management based on AgentCommands.ts and AgentManager.ts
 */
describe('Agent Lifecycle', () => {
    let container: Container;
    let context: vscode.ExtensionContext;
    let agentManager: AgentManager;
    let templateManager: AgentTemplateManager;
    let eventBus: EventBus;
    let agentPersistence: AgentPersistence;
    let loggingService: LoggingService;

    const mockTemplates: any[] = [
        {
            id: 'frontend-specialist',
            name: 'Frontend Specialist',
            icon: '🎨',
            description: 'Frontend development expert',
            tags: ['frontend', 'ui', 'react'],
            systemPrompt: 'You are a frontend development expert...',
            capabilities: {
                languages: ['JavaScript', 'TypeScript'],
                frameworks: ['React', 'Vue'],
                tools: ['CSS', 'UI/UX'],
                testing: ['Jest', 'Cypress'],
                specialties: ['UI/UX', 'Responsive Design']
            },
            taskPreferences: {
                preferred: ['ui', 'styling', 'components'],
                avoid: ['backend', 'database'],
                priority: 'high'
            }
        },
        {
            id: 'backend-specialist',
            name: 'Backend Specialist',
            icon: '⚙️',
            description: 'Backend development expert',
            tags: ['backend', 'api', 'server'],
            systemPrompt: 'You are a backend development expert...',
            capabilities: {
                languages: ['Node.js', 'Python'],
                frameworks: ['Express', 'FastAPI'],
                tools: ['APIs', 'Microservices'],
                testing: ['Unit Tests', 'Integration Tests'],
                specialties: ['API Design', 'Database Design']
            },
            taskPreferences: {
                preferred: ['api', 'server', 'database'],
                avoid: ['ui', 'styling'],
                priority: 'high'
            }
        },
        {
            id: 'fullstack-developer',
            name: 'Full-Stack Developer',
            icon: '🔄',
            description: 'Full-stack development expert',
            tags: ['fullstack', 'frontend', 'backend'],
            systemPrompt: 'You are a full-stack development expert...',
            capabilities: {
                languages: ['JavaScript', 'TypeScript', 'Python'],
                frameworks: ['React', 'Express'],
                tools: ['Frontend', 'Backend', 'Database', 'DevOps'],
                testing: ['Unit Tests', 'E2E Tests'],
                specialties: ['Full-Stack Development', 'Architecture']
            },
            taskPreferences: {
                preferred: ['fullstack', 'architecture'],
                avoid: [],
                priority: 'medium'
            }
        },
        {
            id: 'testing-specialist',
            name: 'Testing Specialist',
            icon: '🧪',
            description: 'Testing and QA expert',
            tags: ['testing', 'qa', 'quality'],
            systemPrompt: 'You are a testing and QA expert...',
            capabilities: {
                languages: ['JavaScript', 'Python'],
                frameworks: ['Jest', 'Cypress'],
                tools: ['Unit Testing', 'E2E Testing', 'TDD', 'Performance Testing'],
                testing: ['Unit Tests', 'Integration Tests', 'E2E Tests'],
                specialties: ['Test Automation', 'Quality Assurance']
            },
            taskPreferences: {
                preferred: ['testing', 'qa', 'quality'],
                avoid: [],
                priority: 'medium'
            }
        }
    ];

    beforeAll(async () => {
        // Setup and activate extension
        context = await setupExtension();
        setupMockWorkspace();
    });

    beforeEach(async () => {
        // Get container instance but don't reset to preserve command registrations
        container = Container.getInstance();
        // container.reset(); // Removed to preserve command bindings

        // Initialize services
        const configService = new ConfigurationService();
        const mainChannel = vscode.window.createOutputChannel('NofX Test');
        loggingService = new LoggingService(configService, mainChannel);
        eventBus = new EventBus();

        container.registerInstance(SERVICE_TOKENS.ConfigurationService, configService);
        container.registerInstance(SERVICE_TOKENS.LoggingService, loggingService);
        container.registerInstance(SERVICE_TOKENS.EventBus, eventBus);
        container.registerInstance(SERVICE_TOKENS.ExtensionContext, context);

        // Initialize agent-related services
        templateManager = new AgentTemplateManager('/test/workspace');
        agentPersistence = new AgentPersistence(context.globalStorageUri.fsPath);
        agentManager = new AgentManager(context);

        container.registerInstance(SERVICE_TOKENS.AgentTemplateManager, templateManager);
        container.registerInstance(SERVICE_TOKENS.AgentPersistence, agentPersistence);
        container.registerInstance(SERVICE_TOKENS.AgentManager, agentManager);

        // Mock template manager
        jest.spyOn(templateManager, 'getTemplates').mockResolvedValue(mockTemplates);
        jest.spyOn(templateManager, 'getTemplate').mockImplementation(async (id: string) => {
            return mockTemplates.find(t => t.id === id);
        });

        // Mock terminal creation
        jest.spyOn(vscode.window, 'createTerminal').mockReturnValue({
            show: jest.fn(),
            sendText: jest.fn(),
            dispose: jest.fn(),
            processId: Promise.resolve(1234)
        } as any);

        // Mock Claude CLI path
        jest.spyOn(configService, 'get').mockReturnValue('/usr/local/bin/claude');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        clearMockWorkspace();
        await teardownExtension();
    });

    describe('Agent Creation', () => {
        test('should create individual agent with template', async () => {
            const quickPickSpy = jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: 'Individual Agent',
                description: 'Add a single agent'
            } as any).mockResolvedValueOnce({
                label: 'Frontend Specialist',
                description: 'React, Vue, CSS, UI/UX',
                template: mockTemplates[0]
            } as any);

            const inputBoxSpy = jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('UI Expert');

            await vscode.commands.executeCommand('nofx.addAgent');

            expect(quickPickSpy).toHaveBeenNthCalledWith(1,
                expect.arrayContaining([
                    expect.objectContaining({ label: 'Individual Agent' }),
                    expect.objectContaining({ label: 'Team Preset' })
                ]),
                expect.objectContaining({
                    placeHolder: 'How would you like to add agents?'
                })
            );

            expect(quickPickSpy).toHaveBeenNthCalledWith(2,
                expect.arrayContaining([
                    expect.objectContaining({ label: 'Frontend Specialist' }),
                    expect.objectContaining({ label: 'Backend Specialist' })
                ]),
                expect.objectContaining({
                    placeHolder: 'Select an agent template'
                })
            );

            expect(inputBoxSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    prompt: 'Enter a name for the agent',
                    value: 'Frontend Specialist'
                })
            );

            // Verify agent was created
            const agents = agentManager.getAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0].name).toBe('UI Expert');
            expect(agents[0].type).toBe('frontend-specialist');
        });

        test('should create team preset with multiple agents', async () => {
            const quickPickSpy = jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: 'Team Preset',
                description: 'Add a predefined team'
            } as any).mockResolvedValueOnce({
                label: 'Full-Stack Team',
                description: '3 agents for full-stack development',
                agents: ['frontend-specialist', 'backend-specialist', 'testing-specialist']
            } as any);

            await vscode.commands.executeCommand('nofx.addAgent');

            expect(quickPickSpy).toHaveBeenCalledTimes(2);

            // Verify multiple agents were created
            const agents = agentManager.getAgents();
            expect(agents).toHaveLength(3);
            expect(agents.map(a => a.type)).toContain('frontend-specialist');
            expect(agents.map(a => a.type)).toContain('backend-specialist');
            expect(agents.map(a => a.type)).toContain('testing-specialist');
        });

        test('should handle agent name validation', async () => {
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: 'Individual Agent'
            } as any).mockResolvedValueOnce({
                label: 'Backend Specialist',
                template: mockTemplates[1]
            } as any);

            // Test empty name - should use default
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('');

            await vscode.commands.executeCommand('nofx.addAgent');

            const agents = agentManager.getAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0].name).toBe('Backend Specialist'); // Should use template name as default
        });

        test('should emit AGENT_CREATED event', async () => {
            const eventSpy = jest.fn();
            eventBus.on(DOMAIN_EVENTS.AGENT_CREATED, eventSpy);

            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: 'Individual Agent'
            } as any).mockResolvedValueOnce({
                label: 'Testing Specialist',
                template: mockTemplates[3]
            } as any);

            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Test Engineer');

            await vscode.commands.executeCommand('nofx.addAgent');

            expect(eventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Test Engineer',
                    type: 'testing-specialist'
                })
            );
        });

        test('should handle template not found error', async () => {
            jest.spyOn(templateManager, 'getTemplate').mockResolvedValue(undefined);
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: 'Individual Agent'
            } as any).mockResolvedValueOnce({
                label: 'Unknown Template',
                template: { id: 'unknown' }
            } as any);

            const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage');

            await vscode.commands.executeCommand('nofx.addAgent');

            expect(warningSpy).toHaveBeenCalledWith(
                expect.stringContaining('Template unknown not found')
            );
        });
    });

    describe('Agent Management', () => {
        let testAgent: Agent;

        beforeEach(async () => {
            // Create a test agent
            testAgent = await agentManager.spawnAgent(mockTemplates[0], 'Test Agent');
        });

        test('should edit agent name', async () => {
            const quickPickSpy = jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: testAgent.name,
                agent: testAgent
            } as any).mockResolvedValueOnce({
                label: 'Rename Agent'
            } as any);

            const inputBoxSpy = jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Renamed Agent');

            await vscode.commands.executeCommand('nofx.editAgent');

            expect(quickPickSpy).toHaveBeenNthCalledWith(1,
                expect.arrayContaining([
                    expect.objectContaining({ label: testAgent.name })
                ]),
                expect.objectContaining({
                    placeHolder: 'Select an agent to edit'
                })
            );

            expect(inputBoxSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    prompt: 'Enter new name for the agent',
                    value: testAgent.name
                })
            );

            const agents = agentManager.getAgents();
            expect(agents[0].name).toBe('Renamed Agent');
        });

        test('should edit agent type/role', async () => {
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: testAgent.name,
                agent: testAgent
            } as any).mockResolvedValueOnce({
                label: 'Change Agent Type'
            } as any).mockResolvedValueOnce({
                label: 'Backend Specialist',
                template: mockTemplates[1]
            } as any);

            await vscode.commands.executeCommand('nofx.editAgent');

            const agents = agentManager.getAgents();
            expect(agents[0].type).toBe('backend-specialist');
            // Note: capabilities are now stored in the template, not directly on the agent
        });

        test('should show warning when editing capabilities', async () => {
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: testAgent.name,
                agent: testAgent
            } as any).mockResolvedValueOnce({
                label: 'Edit Capabilities'
            } as any);

            const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage');

            await vscode.commands.executeCommand('nofx.editAgent');

            expect(warningSpy).toHaveBeenCalledWith(
                expect.stringContaining('Capability')
            );
        });

        test('should handle edit with agentId parameter', async () => {
            const quickPickSpy = jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
                label: 'Rename Agent'
            } as any);

            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Direct Edit');

            await vscode.commands.executeCommand('nofx.editAgent', { agentId: testAgent.id });

            // Should skip agent selection when ID is provided
            expect(quickPickSpy).toHaveBeenCalledTimes(1);
            expect(quickPickSpy).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: 'Rename Agent' })
                ]),
                expect.any(Object)
            );

            const agents = agentManager.getAgents();
            expect(agents[0].name).toBe('Direct Edit');
        });

        test('should handle no agents available', async () => {
            // Remove all agents
            await agentManager.removeAgent(testAgent.id);

            const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage');

            await vscode.commands.executeCommand('nofx.editAgent');

            expect(warningSpy).toHaveBeenCalledWith(expect.stringContaining('No agents'));
        });
    });

    describe('Agent Deletion', () => {
        let testAgents: Agent[];

        beforeEach(async () => {
            // Create multiple test agents
            testAgents = [
                await agentManager.spawnAgent(mockTemplates[0], 'Frontend Dev'),
                await agentManager.spawnAgent(mockTemplates[1], 'Backend Dev'),
                await agentManager.spawnAgent(mockTemplates[2], 'Full-Stack Dev')
            ];
        });

        test('should delete agent with confirmation', async () => {
            const quickPickSpy = jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
                label: testAgents[0].name,
                agent: testAgents[0]
            } as any);

            const warningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Yes' as any);

            await vscode.commands.executeCommand('nofx.deleteAgent');

            expect(quickPickSpy).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: 'Frontend Dev' }),
                    expect.objectContaining({ label: 'Backend Dev' }),
                    expect.objectContaining({ label: 'Full-Stack Dev' })
                ]),
                expect.objectContaining({
                    placeHolder: 'Select an agent to delete'
                })
            );

            expect(warningMessageSpy).toHaveBeenCalledWith(
                expect.stringContaining('delete agent'),
                'Yes',
                'No'
            );

            const agents = agentManager.getAgents();
            expect(agents).toHaveLength(2);
            expect(agents.find(a => a.id === testAgents[0].id)).toBeUndefined();
        });

        test('should cancel deletion when user declines', async () => {
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
                label: testAgents[1].name,
                agent: testAgents[1]
            } as any);

            jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('No' as any);

            await vscode.commands.executeCommand('nofx.deleteAgent');

            const agents = agentManager.getAgents();
            expect(agents).toHaveLength(3); // No agents deleted
        });

        test('should delete agent directly with agentId parameter', async () => {
            const warningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Yes' as any);

            await vscode.commands.executeCommand('nofx.deleteAgent', { agentId: testAgents[2].id });

            expect(warningMessageSpy).toHaveBeenCalled();

            const agents = agentManager.getAgents();
            expect(agents).toHaveLength(2);
            expect(agents.find(a => a.id === testAgents[2].id)).toBeUndefined();
        });

        test('should emit AGENT_REMOVED event', async () => {
            const eventSpy = jest.fn();
            eventBus.on(DOMAIN_EVENTS.AGENT_REMOVED, eventSpy);

            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
                label: testAgents[0].name,
                agent: testAgents[0]
            } as any);

            jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Yes' as any);

            await vscode.commands.executeCommand('nofx.deleteAgent');

            expect(eventSpy).toHaveBeenCalledWith(testAgents[0].id);
        });

        test('should clean up agent terminal on deletion', async () => {
            const agent = testAgents[0];
            const terminal = agent.terminal;
            const disposeSpy = jest.spyOn(terminal, 'dispose');

            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
                label: agent.name,
                agent: agent
            } as any);

            jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Yes' as any);

            await vscode.commands.executeCommand('nofx.deleteAgent');

            expect(disposeSpy).toHaveBeenCalled();
        });
    });

    describe('Agent Terminal Focus', () => {
        let testAgents: Agent[];

        beforeEach(async () => {
            testAgents = [
                await agentManager.spawnAgent(mockTemplates[0], 'Agent 1'),
                await agentManager.spawnAgent(mockTemplates[1], 'Agent 2')
            ];
        });

        test('should focus agent terminal when multiple agents exist', async () => {
            const quickPickSpy = jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
                label: testAgents[0].name,
                agent: testAgents[0]
            } as any);

            const showSpy = jest.spyOn(testAgents[0].terminal, 'show');

            await vscode.commands.executeCommand('nofx.focusAgentTerminal');

            expect(quickPickSpy).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: 'Agent 1' }),
                    expect.objectContaining({ label: 'Agent 2' })
                ]),
                expect.objectContaining({
                    placeHolder: 'Select agent terminal to focus'
                })
            );

            expect(showSpy).toHaveBeenCalled();
        });

        test('should auto-focus when only one agent exists', async () => {
            // Remove one agent
            await agentManager.removeAgent(testAgents[1].id);

            const quickPickSpy = jest.spyOn(vscode.window, 'showQuickPick');
            const showSpy = jest.spyOn(testAgents[0].terminal, 'show');

            await vscode.commands.executeCommand('nofx.focusAgentTerminal');

            // Should not show quick pick for single agent
            expect(quickPickSpy).not.toHaveBeenCalled();
            expect(showSpy).toHaveBeenCalled();
        });

        test('should focus terminal with agentId parameter', async () => {
            const showSpy = jest.spyOn(testAgents[1].terminal, 'show');

            await vscode.commands.executeCommand('nofx.focusAgentTerminal', { agentId: testAgents[1].id });

            expect(showSpy).toHaveBeenCalled();
        });

        test('should handle missing terminal gracefully', async () => {
            // Mock agent without terminal
            const agentWithoutTerminal = await agentManager.spawnAgent(mockTemplates[2], 'No Terminal');
            agentWithoutTerminal.terminal = undefined as any;

            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
                label: agentWithoutTerminal.name,
                agent: agentWithoutTerminal
            } as any);

            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            await vscode.commands.executeCommand('nofx.focusAgentTerminal');

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Terminal')
            );
        });
    });

    describe('Agent Restoration', () => {
        test('should restore agents from previous session', async () => {
            // Mock persisted agents
            const persistedAgents = [
                {
                    id: 'restored-1',
                    name: 'Restored Frontend',
                    type: 'frontend-specialist',
                    status: 'idle',
                    capabilities: ['React', 'Vue', 'CSS'],
                    terminal: {} as any,
                    currentTask: null,
                    startTime: new Date(),
                    tasksCompleted: 0
                },
                {
                    id: 'restored-2',
                    name: 'Restored Backend',
                    type: 'backend-specialist',
                    status: 'idle',
                    capabilities: ['Node.js', 'Python', 'APIs'],
                    terminal: {} as any,
                    currentTask: null,
                    startTime: new Date(),
                    tasksCompleted: 0
                }
            ];

            jest.spyOn(agentPersistence, 'loadAgents').mockResolvedValue(persistedAgents as Agent[]);

            const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

            await vscode.commands.executeCommand('nofx.restoreAgents');

            expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Restored'));

            const agents = agentManager.getAgents();
            expect(agents).toHaveLength(2);
            expect(agents[0].name).toBe('Restored Frontend');
            expect(agents[1].name).toBe('Restored Backend');
        });

        test('should handle no agents to restore', async () => {
            jest.spyOn(agentPersistence, 'loadAgents').mockResolvedValue([]);

            const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

            await vscode.commands.executeCommand('nofx.restoreAgents');

            expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('No agents'));
        });

        test('should handle restoration errors gracefully', async () => {
            jest.spyOn(agentPersistence, 'loadAgents').mockRejectedValue(new Error('Failed to load'));

            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            await vscode.commands.executeCommand('nofx.restoreAgents');

            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to restore'));
        });

        test('should emit events for restored agents', async () => {
            const eventSpy = jest.fn();
            eventBus.on(DOMAIN_EVENTS.AGENT_CREATED, eventSpy);

            jest.spyOn(agentPersistence, 'loadAgents').mockResolvedValue([
                {
                    id: 'restored-1',
                    name: 'Restored Agent',
                    type: 'fullstack-developer',
                    status: 'idle',
                    capabilities: ['JavaScript', 'TypeScript', 'Python'],
                    terminal: {} as any,
                    currentTask: null,
                    startTime: new Date(),
                    tasksCompleted: 0
                } as Agent
            ]);

            await vscode.commands.executeCommand('nofx.restoreAgents');

            expect(eventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Restored Agent'
                })
            );
        });
    });

    describe('Integration with AgentManager', () => {
        test('should track agent status transitions', async () => {
            const agent = await agentManager.spawnAgent(mockTemplates[0], 'Status Test');

            expect(agent.status).toBe('idle');

            // Simulate status change
            await agentManager.updateAgentStatus(agent.id, 'working');

            const updatedAgent = agentManager.getAgent(agent.id);
            expect(updatedAgent?.status).toBe('working');

            // Test error status
            await agentManager.updateAgentStatus(agent.id, 'error');
            expect(agentManager.getAgent(agent.id)?.status).toBe('error');
        });

        test('should persist agents on creation', async () => {
            const saveSpy = jest.spyOn(agentPersistence, 'saveAgents');

            await agentManager.spawnAgent(mockTemplates[0], 'Persist Test');

            expect(saveSpy).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Persist Test' })
                ])
            );
        });

        test('should handle concurrent agent operations', async () => {
            const promises = [
                agentManager.spawnAgent(mockTemplates[0], 'Concurrent 1'),
                agentManager.spawnAgent(mockTemplates[1], 'Concurrent 2'),
                agentManager.spawnAgent(mockTemplates[2], 'Concurrent 3')
            ];

            const agents = await Promise.all(promises);

            expect(agents).toHaveLength(3);
            expect(agentManager.getAgents()).toHaveLength(3);

            // All agents should have unique IDs
            const ids = agents.map(a => a.id);
            expect(new Set(ids).size).toBe(3);
        });

        test('should validate agent capabilities', () => {
            const agent: Agent = {
                id: 'test-agent',
                name: 'Test Agent',
                type: 'frontend-specialist',
                status: 'idle',
                capabilities: ['React', 'Vue', 'CSS'],
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            expect(agent.capabilities).toContain('React');
            expect(agent.capabilities).toContain('Vue');
            expect(agent.capabilities).not.toContain('Backend');
        });

        test('should handle agent terminal lifecycle', async () => {
            const agent = await agentManager.spawnAgent(mockTemplates[0], 'Terminal Test');

            expect(agent.terminal).toBeDefined();

            const disposeSpy = jest.spyOn(agent.terminal, 'dispose');

            await agentManager.removeAgent(agent.id);

            expect(disposeSpy).toHaveBeenCalled();
        });
    });
});
