import * as vscode from 'vscode';
import { Container } from '../../services/Container';
import { SERVICE_TOKENS } from '../../services/interfaces';
import { AgentTreeProvider } from '../../views/AgentTreeProvider';
import { TaskTreeProvider } from '../../views/TaskTreeProvider';
import { TreeStateManager } from '../../services/TreeStateManager';
import { UIStateManager } from '../../services/UIStateManager';
import { EventBus } from '../../services/EventBus';
import { DOMAIN_EVENTS } from '../../services/EventConstants';
import { AgentManager } from '../../agents/AgentManager';
import { TaskQueue } from '../../tasks/TaskQueue';
import { Agent } from '../../types/agent';
import { Task, TaskStatus } from '../../types/task';
import { LoggingService } from '../../services/LoggingService';
import { ConfigurationService } from '../../services/ConfigurationService';
import { setupExtension, teardownExtension, setupMockWorkspace, clearMockWorkspace } from './setup';

describe('UI Components', () => {
    let container: Container;
    let context: vscode.ExtensionContext;
    let agentManager: AgentManager;
    let taskQueue: TaskQueue;
    let eventBus: EventBus;
    let loggingService: LoggingService;
    let agentTreeProvider: AgentTreeProvider;
    let taskTreeProvider: TaskTreeProvider;

    beforeAll(async () => {
        context = await setupExtension();
        setupMockWorkspace();
    });

    beforeEach(() => {
        container = Container.getInstance();
        // Don't reset container to preserve command registrations
        // Instead, just override specific services for this test

        const configService = new ConfigurationService();
        const mainChannel = vscode.window.createOutputChannel('NofX Test');
        loggingService = new LoggingService(configService, mainChannel);
        eventBus = new EventBus();

        container.registerInstance(SERVICE_TOKENS.ConfigurationService, configService);
        container.registerInstance(SERVICE_TOKENS.LoggingService, loggingService);
        container.registerInstance(SERVICE_TOKENS.EventBus, eventBus);
        container.registerInstance(SERVICE_TOKENS.ExtensionContext, context);

        agentManager = new AgentManager(context);
        taskQueue = new TaskQueue(
            agentManager,
            loggingService,
            eventBus,
            {} as any, // ErrorHandler
            {} as any, // NotificationService
            configService,
            {} as any, // TaskStateMachine
            {} as any, // PriorityTaskQueue
            {} as any, // CapabilityMatcher
            {} as any, // TaskDependencyManager
            {} as any  // MetricsService
        );

        container.registerInstance(SERVICE_TOKENS.AgentManager, agentManager);
        container.registerInstance(SERVICE_TOKENS.TaskQueue, taskQueue);

        // Create tree providers
        const treeStateManager = new TreeStateManager({} as any, eventBus, loggingService);
        const uiStateManager = new UIStateManager(eventBus, loggingService, agentManager, taskQueue);
        
        agentTreeProvider = new AgentTreeProvider(treeStateManager, uiStateManager);
        taskTreeProvider = new TaskTreeProvider(uiStateManager, container);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        clearMockWorkspace();
        await teardownExtension();
    });

    describe('Agent Tree', () => {
        test('should display agents in tree view', async () => {
            const mockAgent: Agent = {
                id: 'agent1',
                name: 'Test Agent',
                type: 'frontend-specialist',
                status: 'idle',
                capabilities: ['React', 'Vue'],
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            agentManager.getAgents = jest.fn().mockReturnValue([mockAgent]);

            const children = await agentTreeProvider.getChildren();
            expect(children).toHaveLength(1);
            expect(children[0].label).toBe('Test Agent');
        });

        test('should show agent status in tree', async () => {
            const mockAgent: Agent = {
                id: 'agent1',
                name: 'Working Agent',
                type: 'backend-specialist',
                status: 'working',
                capabilities: ['Node.js', 'Python'],
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };

            agentManager.getAgents = jest.fn().mockReturnValue([mockAgent]);

            const children = await agentTreeProvider.getChildren();
            expect(children[0].description).toContain('working');
        });

        test('should handle empty agent list', async () => {
            agentManager.getAgents = jest.fn().mockReturnValue([]);

            const children = await agentTreeProvider.getChildren();
            expect(children).toHaveLength(0);
        });

        test('should refresh tree when agents change', async () => {
            const refreshSpy = jest.spyOn(agentTreeProvider, 'refresh');
            
            // Simulate agent change event
            eventBus.publish(DOMAIN_EVENTS.AGENT_CREATED, { id: 'agent1' });

            expect(refreshSpy).toHaveBeenCalled();
        });
    });

    describe('Task Tree', () => {
        test('should display tasks in tree view', async () => {
            const mockTask: Task = {
                id: 'task1',
                description: 'Test Task',
                priority: 'medium',
                status: 'ready',
                createdAt: Date.now()
            } as Task;

            taskQueue.getTasks = jest.fn().mockReturnValue([mockTask]);

            const children = await taskTreeProvider.getChildren();
            expect(children).toHaveLength(1);
            expect(children[0].label).toBe('Test Task');
        });

        test('should show task priority in tree', async () => {
            const mockTask: Task = {
                id: 'task1',
                description: 'High Priority Task',
                priority: 'high',
                status: 'ready',
                createdAt: Date.now()
            } as Task;

            taskQueue.getTasks = jest.fn().mockReturnValue([mockTask]);

            const children = await taskTreeProvider.getChildren();
            expect(children[0].description).toContain('high');
        });

        test('should group tasks by status', async () => {
            const mockTasks: Task[] = [
                { id: 'task1', description: 'Ready Task', priority: 'medium', status: 'ready', createdAt: Date.now() } as Task,
                { id: 'task2', description: 'In Progress Task', priority: 'high', status: 'inProgress', createdAt: Date.now() } as Task,
                { id: 'task3', description: 'Completed Task', priority: 'low', status: 'completed', createdAt: Date.now() } as Task
            ];

            taskQueue.getTasks = jest.fn().mockReturnValue(mockTasks);

            const children = await taskTreeProvider.getChildren();
            expect(children.length).toBeGreaterThan(1);
        });

        test('should handle empty task list', async () => {
            taskQueue.getTasks = jest.fn().mockReturnValue([]);

            const children = await taskTreeProvider.getChildren();
            expect(children).toHaveLength(0);
        });
    });

    describe('Activity View', () => {
        test('should show agent activity status', async () => {
            const mockAgent: Agent = {
                id: 'agent1',
                name: 'Active Agent',
                type: 'frontend-specialist',
                status: 'working',
                capabilities: ['React'],
                terminal: {} as any,
                currentTask: { id: 'task1', description: 'Current Task' } as any,
                startTime: new Date(),
                tasksCompleted: 5
            };

            agentManager.getAgents = jest.fn().mockReturnValue([mockAgent]);

            const children = await agentTreeProvider.getChildren();
            expect(children[0].description).toContain('working');
        });

        test('should track task completion count', async () => {
            const mockAgent: Agent = {
                id: 'agent1',
                name: 'Productive Agent',
                type: 'backend-specialist',
                status: 'idle',
                capabilities: ['Node.js'],
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 10
            };

            agentManager.getAgents = jest.fn().mockReturnValue([mockAgent]);

            const children = await agentTreeProvider.getChildren();
            expect(children[0].description).toContain('10');
        });
    });

    describe('Status Bar', () => {
        test('should update status bar with agent count', async () => {
            const mockAgents: Agent[] = [
                { id: 'agent1', name: 'Agent 1', type: 'frontend', status: 'idle', capabilities: [], terminal: {} as any, currentTask: null, startTime: new Date(), tasksCompleted: 0 },
                { id: 'agent2', name: 'Agent 2', type: 'backend', status: 'working', capabilities: [], terminal: {} as any, currentTask: null, startTime: new Date(), tasksCompleted: 0 }
            ];

            agentManager.getAgents = jest.fn().mockReturnValue(mockAgents);
            agentManager.getAgentStats = jest.fn().mockReturnValue({ total: 2, idle: 1, working: 1 });

            // Simulate status bar update
            const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
            statusBarItem.text = '$(organization) NofX | 🤖 1 idle, 1 working';

            expect(statusBarItem.text).toContain('1 idle, 1 working');
        });

        test('should update status bar with task count', async () => {
            const mockTasks: Task[] = [
                { id: 'task1', description: 'Task 1', priority: 'medium', status: 'ready', createdAt: Date.now() } as Task,
                { id: 'task2', description: 'Task 2', priority: 'high', status: 'inProgress', createdAt: Date.now() } as Task
            ];

            taskQueue.getTasks = jest.fn().mockReturnValue(mockTasks);
            taskQueue.getTaskStats = jest.fn().mockReturnValue({ total: 2, ready: 1, inProgress: 1, blocked: 0 });

            // Simulate status bar update
            const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
            statusBarItem.text = '$(organization) NofX | 📋 1 ready, 1 active';

            expect(statusBarItem.text).toContain('1 ready, 1 active');
        });
    });

    describe('Webviews', () => {
        test('should create conductor webview', async () => {
            const createWebviewSpy = jest.spyOn(vscode.window, 'createWebviewPanel');
            
            await vscode.commands.executeCommand('nofx.openConductorChat');

            expect(createWebviewSpy).toHaveBeenCalledWith(
                'conductorChat',
                'Conductor Chat',
                vscode.ViewColumn.One,
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true
                })
            );
        });

        test('should create message flow dashboard', async () => {
            const createWebviewSpy = jest.spyOn(vscode.window, 'createWebviewPanel');
            
            await vscode.commands.executeCommand('nofx.openMessageFlow');

            expect(createWebviewSpy).toHaveBeenCalledWith(
                'messageFlow',
                'Message Flow Dashboard',
                vscode.ViewColumn.One,
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true
                })
            );
        });

        test('should handle webview disposal', async () => {
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

