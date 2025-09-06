import * as vscode from 'vscode';
import * as path from 'path';
import { Container } from '../../services/Container';
import { SERVICE_TOKENS } from '../../services/interfaces';
import { TaskQueue } from '../../tasks/TaskQueue';
import { TaskStateMachine } from '../../tasks/TaskStateMachine';
import { TaskDependencyManager } from '../../tasks/TaskDependencyManager';
import { PriorityTaskQueue } from '../../tasks/PriorityTaskQueue';
import { EventBus } from '../../services/EventBus';
import { DOMAIN_EVENTS } from '../../services/EventConstants';
import { LoggingService } from '../../services/LoggingService';
import { ConfigurationService } from '../../services/ConfigurationService';
import { AgentManager } from '../../agents/AgentManager';
import { Task, TaskStatus } from '../../types/task';
import { Agent } from '../../types/agent';
import { setupExtension, teardownExtension, setupMockWorkspace, clearMockWorkspace } from './setup';

describe('Task Management', () => {
    let container: Container;
    let context: vscode.ExtensionContext;
    let taskQueue: TaskQueue;
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
        
        // Create real instances for proper testing
        const errorHandler = {
            handleError: jest.fn(),
            handleWarning: jest.fn(),
            handleInfo: jest.fn()
        };
        
        const notificationService = {
            showInformation: jest.fn(),
            showWarning: jest.fn(),
            showError: jest.fn(),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            showOpenDialog: jest.fn(),
            showSaveDialog: jest.fn(),
            setStatusBarMessage: jest.fn()
        };
        
        const taskStateMachine = new TaskStateMachine(loggingService, eventBus);
        const taskDependencyManager = new TaskDependencyManager(loggingService, eventBus, notificationService);
        const priorityTaskQueue = new PriorityTaskQueue(loggingService, taskDependencyManager, taskStateMachine);
        
        const capabilityMatcher = {
            findBestAgent: jest.fn().mockReturnValue(null),
            matchCapabilities: jest.fn().mockReturnValue([])
        };
        
        const metricsService = {
            incrementCounter: jest.fn(),
            recordGauge: jest.fn(),
            recordHistogram: jest.fn(),
            getMetrics: jest.fn().mockReturnValue({}),
            reset: jest.fn(),
            setEnabled: jest.fn(),
            isEnabled: jest.fn().mockReturnValue(true)
        };
        
        taskQueue = new TaskQueue(
            agentManager,
            loggingService,
            eventBus,
            errorHandler,
            notificationService,
            configService,
            taskStateMachine,
            priorityTaskQueue,
            capabilityMatcher,
            taskDependencyManager,
            metricsService
        );

        container.registerInstance(SERVICE_TOKENS.AgentManager, agentManager);
        container.registerInstance(SERVICE_TOKENS.TaskQueue, taskQueue);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        clearMockWorkspace();
        await teardownExtension();
    });

    describe('Task Creation', () => {
        test('should create task with basic properties', async () => {
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Test task description');
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue('medium');

            await vscode.commands.executeCommand('nofx.createTask');

            const tasks = taskQueue.getTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].description).toBe('Test task description');
            expect(tasks[0].priority).toBe('medium');
        });

        test('should create task with high priority', async () => {
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('High priority task');
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue('high');

            await vscode.commands.executeCommand('nofx.createTask');

            const tasks = taskQueue.getTasks();
            expect(tasks[0].priority).toBe('high');
        });

        test('should handle task creation cancellation', async () => {
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue(undefined);

            await vscode.commands.executeCommand('nofx.createTask');

            const tasks = taskQueue.getTasks();
            expect(tasks).toHaveLength(0);
        });
    });

    describe('Task Dependencies', () => {
        test('should add task dependency', async () => {
            // Create two tasks using TaskQueue API
            const task1 = taskQueue.createTask({ description: 'Task 1', priority: 'medium' });
            const task2 = taskQueue.createTask({ description: 'Task 2', priority: 'high' });
            
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(task1).mockResolvedValueOnce(task2);

            await vscode.commands.executeCommand('nofx.addTaskDependency', { 
                taskId: task1.id, 
                dependencyId: task2.id 
            });

            // Verify dependency was added using TaskDependencyManager
            const dependencies = taskQueue.getTaskDependencies(task1.id);
            expect(dependencies).toContain(task2.id);
        });

        test('should remove task dependency', async () => {
            // Create tasks using TaskQueue API
            const task1 = taskQueue.createTask({ description: 'Task 1', priority: 'medium' });
            const task2 = taskQueue.createTask({ description: 'Task 2', priority: 'high' });
            
            // Add dependency first
            taskQueue.addDependency(task1.id, task2.id);
            
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(task1).mockResolvedValueOnce(task2);

            await vscode.commands.executeCommand('nofx.removeTaskDependency', { 
                taskId: task1.id, 
                dependencyId: task2.id 
            });

            // Verify dependency was removed using TaskDependencyManager
            const dependencies = taskQueue.getTaskDependencies(task1.id);
            expect(dependencies).not.toContain(task2.id);
        });

        test('should view task dependencies', async () => {
            // Create task using TaskQueue API
            const task = taskQueue.createTask({ description: 'Task 1', priority: 'medium' });
            
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(task);
            const showInfoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

            await vscode.commands.executeCommand('nofx.viewTaskDependencies', { taskId: task.id });

            expect(showInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Dependencies'));
        });
    });

    describe('Task Conflicts', () => {
        test('should resolve task conflict', async () => {
            // Create tasks using TaskQueue API
            const task1 = taskQueue.createTask({ description: 'Task 1', priority: 'medium' });
            const task2 = taskQueue.createTask({ description: 'Task 2', priority: 'high' });
            
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(task1).mockResolvedValueOnce('Resolve by priority');

            await vscode.commands.executeCommand('nofx.resolveTaskConflict', { taskId: task1.id });

            // Verify conflict was resolved using TaskQueue API
            const conflicts = taskQueue.getTaskConflicts(task1.id);
            expect(conflicts).not.toContain(task2.id);
        });

        test('should retry blocked task', async () => {
            // Create task using TaskQueue API
            const task = taskQueue.createTask({ description: 'Task 1', priority: 'medium' });
            
            // Set task to blocked status using TaskQueue API
            taskQueue.updateTaskStatus(task.id, 'blocked');
            
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(task);

            await vscode.commands.executeCommand('nofx.retryBlockedTask', { taskId: task.id });

            // Verify task status was updated using TaskQueue API
            const updatedTask = taskQueue.getTask(task.id);
            expect(updatedTask?.status).toBe('ready');
        });
    });

    describe('Batch Operations', () => {
        test('should create task batch', async () => {
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Task 1\nTask 2\nTask 3');
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue('medium');

            await vscode.commands.executeCommand('nofx.createTaskBatch');

            const tasks = taskQueue.getTasks();
            expect(tasks).toHaveLength(3);
            expect(tasks[0].description).toBe('Task 1');
            expect(tasks[1].description).toBe('Task 2');
            expect(tasks[2].description).toBe('Task 3');
        });

        test('should resolve all conflicts', async () => {
            // Create tasks using TaskQueue API
            const task1 = taskQueue.createTask({ description: 'Task 1', priority: 'medium' });
            const task2 = taskQueue.createTask({ description: 'Task 2', priority: 'high' });
            
            // Add conflicts using TaskQueue API
            taskQueue.addConflict(task1.id, task2.id);
            taskQueue.addConflict(task2.id, task1.id);
            
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue('Resolve by priority');

            await vscode.commands.executeCommand('nofx.resolveAllConflicts');

            // Verify all conflicts were resolved using TaskQueue API
            const conflicts1 = taskQueue.getTaskConflicts(task1.id);
            const conflicts2 = taskQueue.getTaskConflicts(task2.id);
            expect(conflicts1).toHaveLength(0);
            expect(conflicts2).toHaveLength(0);
        });
    });

    describe('Task Completion', () => {
        test('should complete task', async () => {
            // Create task using TaskQueue API
            const task = taskQueue.createTask({ description: 'Task 1', priority: 'medium' });
            
            // Set task to inProgress status using TaskQueue API
            taskQueue.updateTaskStatus(task.id, 'inProgress');
            
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(task);

            await vscode.commands.executeCommand('nofx.completeTask', { taskId: task.id });

            // Verify task was completed using TaskQueue API
            const completedTask = taskQueue.getTask(task.id);
            expect(completedTask?.status).toBe('completed');
        });

        test('should handle task completion errors', async () => {
            // Create task using TaskQueue API
            const task = taskQueue.createTask({ description: 'Task 1', priority: 'medium' });
            
            // Set task to blocked status using TaskQueue API
            taskQueue.updateTaskStatus(task.id, 'blocked');
            
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(task);
            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            await vscode.commands.executeCommand('nofx.completeTask', { taskId: task.id });

            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('blocked'));
        });
    });
});

