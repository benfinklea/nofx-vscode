import * as vscode from 'vscode';
import { IntelligentConductor } from '../../../conductor/IntelligentConductor';
import { AgentManager } from '../../../agents/AgentManager';
import { TaskQueue } from '../../../tasks/TaskQueue';
import { Agent, AgentStatus } from '../../../types/Agent';
import { Task, TaskStatus, TaskPriority } from '../../../types/Task';
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

// Mock all dependencies
jest.mock('../../../agents/AgentManager');
jest.mock('../../../tasks/TaskQueue');

// Mock VS Code API
const mockTerminal = {
    show: jest.fn(),
    sendText: jest.fn(),
    dispose: jest.fn(),
    name: 'NofX Conductor (Smart)'
};

const mockOutputChannel = {
    show: jest.fn(),
    appendLine: jest.fn(),
    dispose: jest.fn()
};

Object.defineProperty(vscode.window, 'createTerminal', {
    value: jest.fn().mockReturnValue(mockTerminal),
    configurable: true
});

Object.defineProperty(vscode.window, 'createOutputChannel', {
    value: jest.fn().mockReturnValue(mockOutputChannel),
    configurable: true
});

Object.defineProperty(vscode.window, 'showWarningMessage', {
    value: jest.fn(),
    configurable: true
});

Object.defineProperty(vscode.workspace, 'getConfiguration', {
    value: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue('claude')
    }),
    configurable: true
});

jest.mock('vscode');

describe('IntelligentConductor', () => {
    let intelligentConductor: IntelligentConductor;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockTaskQueue: jest.Mocked<TaskQueue>;

    const mockAgents: Agent[] = [
        {
            id: 'agent-1',
            name: 'Frontend Specialist',
            type: 'frontend-specialist',
            status: AgentStatus.IDLE,
            capabilities: ['react', 'typescript', 'css'],
            currentTask: undefined,
            createdAt: new Date(),
            lastActivity: new Date(),
            teamId: 'team-1',
            workingDirectory: '/test/project',
            terminalId: 'terminal-1',
            processId: 1234,
            tasksCompleted: 0,
            template: {
                capabilities: ['react', 'typescript'],
                specialization: 'frontend'
            }
        },
        {
            id: 'agent-2',
            name: 'Backend Specialist',
            type: 'backend-specialist',
            status: AgentStatus.BUSY,
            capabilities: ['nodejs', 'sql', 'api'],
            currentTask: undefined,
            createdAt: new Date(),
            lastActivity: new Date(),
            teamId: 'team-1',
            workingDirectory: '/test/project',
            terminalId: 'terminal-2',
            processId: 5678,
            tasksCompleted: 2,
            template: {
                capabilities: ['nodejs', 'sql'],
                specialization: 'backend'
            }
        }
    ];

    const mockTasks: Task[] = [
        {
            id: 'task-1',
            title: 'Create login component',
            description: 'Build React login form with validation',
            priority: TaskPriority.HIGH,
            status: TaskStatus.QUEUED,
            createdAt: new Date(),
            updatedAt: new Date(),
            tags: ['frontend', 'ui'],
            capabilities: ['react'],
            estimatedDuration: 60
        },
        {
            id: 'task-2',
            title: 'Setup authentication API',
            description: 'Create secure login endpoint',
            priority: TaskPriority.MEDIUM,
            status: TaskStatus.ASSIGNED,
            assignedTo: 'agent-2',
            createdAt: new Date(),
            updatedAt: new Date(),
            tags: ['backend', 'api'],
            capabilities: ['nodejs'],
            estimatedDuration: 90
        }
    ];

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        mockTerminal = createMockTerminal();
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useFakeTimers();

        mockAgentManager = new AgentManager({} as any) as jest.Mocked<AgentManager>;
        mockTaskQueue = new TaskQueue({} as any) as jest.Mocked<TaskQueue>;

        // Setup default mocks
        mockAgentManager.getActiveAgents = jest.fn().mockReturnValue(mockAgents);
        mockAgentManager.getIdleAgents = jest.fn().mockReturnValue([mockAgents[0]]);
        mockAgentManager.onAgentUpdate = jest.fn().mockImplementation(callback => {
            // Store callback for later triggering
            (mockAgentManager as any).updateCallback = callback;
        });

        mockTaskQueue.getQueuedTasks = jest.fn().mockReturnValue([mockTasks[0]]);
        mockTaskQueue.getTasks = jest.fn().mockReturnValue(mockTasks);
        mockTaskQueue.addTask = jest.fn().mockImplementation(taskData => ({
            id: 'new-task-id',
            ...taskData,
            status: 'queued'
        }));

        intelligentConductor = new IntelligentConductor(mockAgentManager, mockTaskQueue);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('initialization', () => {
        it('should initialize conductor with agent manager and task queue', () => {
            expect(intelligentConductor).toBeInstanceOf(IntelligentConductor);
            expect(mockAgentManager.onAgentUpdate).toHaveBeenCalled();
            expect(vscode.window.createOutputChannel).toHaveBeenCalled();
        });

        it('should create output channel with correct name', () => {
            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('NofX Conductor Brain');
        });

        it('should get Claude path from configuration', () => {
            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('nofx');
        });

        it('should set up agent update monitoring', () => {
            expect(mockAgentManager.onAgentUpdate).toHaveBeenCalledWith(expect.any(Function));
        });
    });

    describe('starting conductor', () => {
        it('should start conductor and create terminal', async () => {
            await intelligentConductor.start();

            expect(mockOutputChannel.show).toHaveBeenCalled();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('🎼 Intelligent Conductor Starting...');
            expect(vscode.window.createTerminal).toHaveBeenCalledWith({
                name: '🎼 NofX Conductor (Smart)',
                iconPath: expect.any(vscode.ThemeIcon)
            });
            expect(mockTerminal.show).toHaveBeenCalled();
        });

        it('should initialize conductor with enhanced system prompt', async () => {
            await intelligentConductor.start();

            expect(mockTerminal.sendText).toHaveBeenCalledWith('clear');
            expect(mockTerminal.sendText).toHaveBeenCalledWith('echo "🎸 NofX Intelligent Conductor v2.0"');
            expect(mockTerminal.sendText).toHaveBeenCalledWith(
                expect.stringContaining('claude --append-system-prompt')
            );
        });

        it('should include current agent status in system prompt', async () => {
            await intelligentConductor.start();

            const claudeCommand = mockTerminal.sendText.mock.calls.find(([cmd]) =>
                cmd.includes('claude --append-system-prompt')
            )?.[0];

            expect(claudeCommand).toContain('Active Agents: 2');
            expect(claudeCommand).toContain('Idle Agents: 1');
            expect(claudeCommand).toContain('Frontend Specialist (frontend-specialist)');
        });

        it('should send initial greeting after delay', async () => {
            await intelligentConductor.start();

            // Fast-forward past the 3 second delay
            jest.advanceTimersByTime(4000);

            expect(mockTerminal.sendText).toHaveBeenCalledWith('Hello! I am the NofX Intelligent Conductor. I can:');
            expect(mockTerminal.sendText).toHaveBeenCalledWith('- See all active agents and their status');
            expect(mockTerminal.sendText).toHaveBeenCalledWith(
                'Tell me what you want to build, and I will orchestrate everything!'
            );
        });

        it('should not create new terminal if one already exists', async () => {
            await intelligentConductor.start();
            jest.clearAllMocks();

            await intelligentConductor.start();

            expect(vscode.window.createTerminal).not.toHaveBeenCalled();
            expect(mockTerminal.show).toHaveBeenCalled();
        });
    });

    describe('command processing', () => {
        beforeEach(async () => {
            await intelligentConductor.start();
            jest.clearAllMocks();
        });

        it('should process CREATE_TASK command', async () => {
            const command = 'CREATE_TASK Build login form | Create React login component with validation | frontend';

            await intelligentConductor.processConductorCommand(command);

            expect(mockTaskQueue.addTask).toHaveBeenCalledWith({
                title: 'Build login form',
                description: 'Create React login component with validation',
                priority: 'high'
            });

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Created task: new-task-id - Build login form')
            );
        });

        it('should assign task to best available agent after creation', async () => {
            const command = 'CREATE_TASK API endpoints | Create REST API for user auth | backend';

            await intelligentConductor.processConductorCommand(command);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Assigning'));
        });

        it('should handle CREATE_TASK command with missing parts gracefully', async () => {
            const command = 'CREATE_TASK Incomplete command';

            await intelligentConductor.processConductorCommand(command);

            // Should still attempt to process but with undefined values
            expect(mockTaskQueue.addTask).toHaveBeenCalled();
        });

        it('should log all processed commands', async () => {
            const command = 'CREATE_TASK Test | Test description | test';

            await intelligentConductor.processConductorCommand(command);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                'Processing command: CREATE_TASK Test | Test description | test'
            );
        });
    });

    describe('agent assignment logic', () => {
        beforeEach(async () => {
            await intelligentConductor.start();
        });

        it('should find agent with exact type match', () => {
            const agent = (intelligentConductor as any).findBestAgent('frontend');

            expect(agent).toBe(mockAgents[0]);
            expect(agent.type).toContain('frontend');
        });

        it('should find agent with capability match when no exact type match', () => {
            mockAgents[0].type = 'fullstack-developer';

            const agent = (intelligentConductor as any).findBestAgent('react');

            expect(agent).toBe(mockAgents[0]);
            expect(agent.template.capabilities).toContain('react');
        });

        it('should fallback to any idle agent if no matches', () => {
            mockAgents[0].type = 'unrelated-type';
            mockAgents[0].template.capabilities = ['unrelated-skill'];

            const agent = (intelligentConductor as any).findBestAgent('unknown-type');

            expect(agent).toBe(mockAgents[0]); // Still returns the idle agent
        });

        it('should return null if no idle agents available', () => {
            mockAgentManager.getIdleAgents = jest.fn().mockReturnValue([]);

            const agent = (intelligentConductor as any).findBestAgent('frontend');

            expect(agent).toBeNull();
        });

        it('should find optimal agent using smart scoring', () => {
            const task = {
                title: 'React component',
                description: 'Build TypeScript React component with CSS styling'
            };

            const agent = (intelligentConductor as any).findOptimalAgent(task);

            expect(agent).toBe(mockAgents[0]); // Should prefer frontend agent for React task
        });

        it('should consider agent workload in optimal matching', () => {
            // Set up two frontend agents with different task counts
            const busyAgent = { ...mockAgents[0], tasksCompleted: 10 };
            const freshAgent = { ...mockAgents[0], id: 'agent-3', tasksCompleted: 0 };

            mockAgentManager.getIdleAgents = jest.fn().mockReturnValue([busyAgent, freshAgent]);

            const task = {
                title: 'Frontend task',
                description: 'Simple frontend component'
            };

            const agent = (intelligentConductor as any).findOptimalAgent(task);

            expect(agent).toBe(freshAgent); // Should prefer agent with fewer completed tasks
        });
    });

    describe('conflict detection', () => {
        beforeEach(async () => {
            await intelligentConductor.start();
            jest.clearAllMocks();
        });

        it('should detect multiple frontend agents working simultaneously', () => {
            const workingAgents = [
                { ...mockAgents[0], status: 'working', type: 'frontend-specialist' },
                { ...mockAgents[1], status: 'working', type: 'frontend-developer' }
            ];

            mockAgentManager.getActiveAgents = jest.fn().mockReturnValue(workingAgents);

            (intelligentConductor as any).checkForConflicts();

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '⚠️ Potential conflict: Multiple frontend agents active'
            );
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('Multiple frontend agents working')
            );
        });

        it('should not trigger conflict detection with single working agent', () => {
            const workingAgents = [{ ...mockAgents[0], status: 'working' }];

            mockAgentManager.getActiveAgents = jest.fn().mockReturnValue(workingAgents);

            (intelligentConductor as any).checkForConflicts();

            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        it('should check for file conflicts when multiple agents are working', () => {
            const workingAgents = [
                { ...mockAgents[0], status: 'working' },
                { ...mockAgents[1], status: 'working' }
            ];

            mockAgentManager.getActiveAgents = jest.fn().mockReturnValue(workingAgents);

            (intelligentConductor as any).checkForConflicts();

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Checking for file conflicts...');
        });
    });

    describe('task optimization', () => {
        beforeEach(async () => {
            await intelligentConductor.start();
            jest.clearAllMocks();
        });

        it('should optimize task assignment for queued tasks', () => {
            (intelligentConductor as any).optimizeTaskAssignment();

            expect(mockTaskQueue.getQueuedTasks).toHaveBeenCalled();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('📊 Optimizing assignment for 1 queued tasks');
        });

        it('should not attempt optimization when no queued tasks', () => {
            mockTaskQueue.getQueuedTasks = jest.fn().mockReturnValue([]);

            (intelligentConductor as any).optimizeTaskAssignment();

            expect(mockOutputChannel.appendLine).not.toHaveBeenCalledWith(
                expect.stringContaining('Optimizing assignment')
            );
        });

        it('should assign optimal agent to each queued task', () => {
            const queuedTasks = [
                { title: 'Frontend task', description: 'React component' },
                { title: 'Backend task', description: 'API endpoint' }
            ];

            mockTaskQueue.getQueuedTasks = jest.fn().mockReturnValue(queuedTasks);

            (intelligentConductor as any).optimizeTaskAssignment();

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Assigning'));
        });
    });

    describe('command monitoring', () => {
        beforeEach(async () => {
            await intelligentConductor.start();
            jest.clearAllMocks();
        });

        it('should start periodic monitoring after initialization', () => {
            // Fast-forward past the initialization delay
            jest.advanceTimersByTime(4000);

            // Fast-forward past first monitoring interval
            jest.advanceTimersByTime(11000);

            expect(mockTaskQueue.getQueuedTasks).toHaveBeenCalled();
        });

        it('should run conflict detection on monitoring interval', () => {
            // Fast-forward to trigger monitoring
            jest.advanceTimersByTime(15000);

            expect(mockAgentManager.getActiveAgents).toHaveBeenCalled();
        });

        it('should run task optimization on monitoring interval', () => {
            // Fast-forward to trigger monitoring
            jest.advanceTimersByTime(15000);

            expect(mockTaskQueue.getQueuedTasks).toHaveBeenCalled();
        });
    });

    describe('status reporting', () => {
        beforeEach(async () => {
            await intelligentConductor.start();
        });

        it('should provide comprehensive system status', () => {
            const status = intelligentConductor.getStatus();

            expect(status).toContain('System Status:');
            expect(status).toContain('Agents: 2 total');
            expect(status).toContain('Tasks: 2 total');
        });

        it('should categorize agents by status in status report', () => {
            // Set up agents with different statuses
            const mixedAgents = [
                { ...mockAgents[0], status: 'idle' },
                { ...mockAgents[1], status: 'working' }
            ];
            mockAgentManager.getActiveAgents = jest.fn().mockReturnValue(mixedAgents);

            const status = intelligentConductor.getStatus();

            expect(status).toContain('(1 idle, 1 working)');
        });

        it('should categorize tasks by status in status report', () => {
            const mixedTasks = [
                { ...mockTasks[0], status: 'queued' },
                { ...mockTasks[1], status: 'assigned' }
            ];
            mockTaskQueue.getTasks = jest.fn().mockReturnValue(mixedTasks);

            const status = intelligentConductor.getStatus();

            expect(status).toContain('(1 queued)');
        });

        it('should log status when agent updates occur', () => {
            // Trigger the agent update callback
            const updateCallback = (mockAgentManager as any).updateCallback;
            updateCallback();

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] System Status:/)
            );
        });
    });

    describe('team spawning', () => {
        beforeEach(async () => {
            await intelligentConductor.start();
            jest.clearAllMocks();
        });

        it('should initiate team spawning for project type', async () => {
            await intelligentConductor.spawnRecommendedTeam('web-application');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '🚀 Spawning recommended team for web-application project'
            );
        });

        it('should handle different project types', async () => {
            await intelligentConductor.spawnRecommendedTeam('mobile-app');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '🚀 Spawning recommended team for mobile-app project'
            );
        });
    });

    describe('resource management', () => {
        it('should dispose terminal and output channel', () => {
            intelligentConductor.dispose();

            expect(mockTerminal.dispose).toHaveBeenCalled();
            expect(mockOutputChannel.dispose).toHaveBeenCalled();
        });

        it('should handle dispose when terminal is undefined', () => {
            const freshConductor = new IntelligentConductor(mockAgentManager, mockTaskQueue);

            expect(() => freshConductor.dispose()).not.toThrow();
            expect(mockOutputChannel.dispose).toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        beforeEach(async () => {
            await intelligentConductor.start();
        });

        it('should handle task creation errors gracefully', async () => {
            mockTaskQueue.addTask = jest.fn().mockImplementation(() => {
                throw new Error('Task creation failed');
            });

            await expect(
                intelligentConductor.processConductorCommand('CREATE_TASK Test | Description | type')
            ).not.toThrow();
        });

        it('should handle agent manager errors in conflict detection', () => {
            mockAgentManager.getActiveAgents = jest.fn().mockImplementation(() => {
                throw new Error('Agent manager error');
            });

            expect(() => (intelligentConductor as any).checkForConflicts()).not.toThrow();
        });

        it('should handle task queue errors in optimization', () => {
            mockTaskQueue.getQueuedTasks = jest.fn().mockImplementation(() => {
                throw new Error('Task queue error');
            });

            expect(() => (intelligentConductor as any).optimizeTaskAssignment()).not.toThrow();
        });

        it('should handle configuration errors', () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockImplementation(() => {
                throw new Error('Configuration error');
            });

            expect(() => new IntelligentConductor(mockAgentManager, mockTaskQueue)).not.toThrow();
        });
    });

    describe('advanced scenarios', () => {
        beforeEach(async () => {
            await intelligentConductor.start();
        });

        it('should handle complex multi-agent task assignment scenarios', () => {
            const complexTask = {
                title: 'Full-stack feature',
                description: 'Create React frontend with Node.js backend and database integration'
            };

            const frontendAgent = { ...mockAgents[0], type: 'frontend-specialist' };
            const backendAgent = { ...mockAgents[1], type: 'backend-specialist', status: AgentStatus.IDLE };

            mockAgentManager.getIdleAgents = jest.fn().mockReturnValue([frontendAgent, backendAgent]);

            const selectedAgent = (intelligentConductor as any).findOptimalAgent(complexTask);

            // Should select based on highest scoring match
            expect(selectedAgent).toBeDefined();
        });

        it('should prioritize tasks based on agent specialization scoring', () => {
            const reactTask = {
                title: 'React component',
                description: 'TypeScript React component with hooks'
            };

            const vueTask = {
                title: 'Vue component',
                description: 'Vue.js component with composition API'
            };

            const reactAgent = (intelligentConductor as any).findOptimalAgent(reactTask);
            const vueAgent = (intelligentConductor as any).findOptimalAgent(vueTask);

            // Both should return the frontend agent, but scoring should be different
            expect(reactAgent).toBe(mockAgents[0]);
            expect(vueAgent).toBe(mockAgents[0]);
        });

        it('should balance load across multiple capable agents', () => {
            const lightAgent = { ...mockAgents[0], tasksCompleted: 1 };
            const heavyAgent = { ...mockAgents[0], id: 'agent-heavy', tasksCompleted: 10 };

            mockAgentManager.getIdleAgents = jest.fn().mockReturnValue([heavyAgent, lightAgent]);

            const task = {
                title: 'Frontend task',
                description: 'Simple component work'
            };

            const selectedAgent = (intelligentConductor as any).findOptimalAgent(task);

            expect(selectedAgent).toBe(lightAgent); // Should prefer less loaded agent
        });
    });
});
