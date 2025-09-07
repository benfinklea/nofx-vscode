import * as vscode from 'vscode';
import { TaskCommands } from '../../../commands/TaskCommands';
import {
    IContainer,
    INotificationService,
    ICommandService,
    IConfigurationService,
    SERVICE_TOKENS
} from '../../../services/interfaces';
import { AgentManager } from '../../../agents/AgentManager';
import { TaskQueue } from '../../../tasks/TaskQueue';
import { Task, TaskConfig } from '../../../agents/types';

// Mock VS Code API
jest.mock('vscode');

describe('TaskCommands', () => {
    let taskCommands: TaskCommands;
    let mockContainer: jest.Mocked<IContainer>;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockTaskQueue: jest.Mocked<TaskQueue>;
    let mockCommandService: jest.Mocked<ICommandService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;

    const mockTask: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test task description',
        priority: 'high',
        status: 'pending',
        files: ['src/test.ts'],
        tags: ['test', 'unit'],
        dependsOn: [],
        requiredCapabilities: ['typescript'],
        assignedTo: undefined,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mocks
        mockAgentManager = {
            getAgent: jest.fn().mockReturnValue({ id: 'agent-1', name: 'Test Agent' }),
            getAgents: jest.fn().mockReturnValue([]),
            spawnAgent: jest.fn().mockResolvedValue({ id: 'agent-1' })
        } as any;

        mockTaskQueue = {
            addTask: jest.fn().mockReturnValue(mockTask),
            getTasks: jest.fn().mockReturnValue([mockTask]),
            completeTask: jest.fn().mockReturnValue(true),
            getTask: jest.fn().mockReturnValue(mockTask),
            updateTask: jest.fn().mockReturnValue(true),
            removeTask: jest.fn().mockReturnValue(true),
            getBlockedTasks: jest.fn().mockReturnValue([]),
            getDependencies: jest.fn().mockReturnValue([]),
            addTaskDependency: jest.fn().mockReturnValue(true),
            removeTaskDependency: jest.fn().mockReturnValue(true),
            resolveConflict: jest.fn().mockReturnValue(true)
        } as any;

        mockCommandService = {
            register: jest.fn(),
            execute: jest.fn().mockResolvedValue(undefined)
        };

        mockNotificationService = {
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            showInformation: jest.fn().mockResolvedValue(undefined),
            showWarning: jest.fn().mockResolvedValue(undefined),
            showError: jest.fn().mockResolvedValue(undefined)
        };

        mockConfigService = {
            get: jest.fn().mockReturnValue('default'),
            update: jest.fn().mockResolvedValue(undefined),
            onChange: jest.fn()
        };

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
                    default:
                        return undefined;
                }
            }),
            register: jest.fn(),
            get: jest.fn()
        } as any;

        // Mock active text editor
        (vscode.window as any).activeTextEditor = {
            document: {
                uri: { fsPath: '/test/workspace/src/test.ts' }
            }
        };

        // Mock workspace
        (vscode.workspace as any).asRelativePath = jest.fn().mockReturnValue('src/test.ts');

        taskCommands = new TaskCommands(mockContainer);
    });

    describe('register', () => {
        it('should register all task commands', () => {
            taskCommands.register();

            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.createTask', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.completeTask', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.addTaskDependency', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.removeTaskDependency', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.resolveTaskConflict', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.viewTaskDependencies', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.retryBlockedTask', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.createTaskBatch', expect.any(Function));
            expect(mockCommandService.register).toHaveBeenCalledWith('nofx.resolveAllConflicts', expect.any(Function));
        });
    });

    describe('createTask', () => {
        it('should create a task with all provided information', async () => {
            mockNotificationService.showInputBox
                .mockResolvedValueOnce('Fix authentication bug') // description
                .mockResolvedValueOnce('frontend, bug') // tags
                .mockResolvedValueOnce('React, TypeScript') // capabilities
                .mockResolvedValueOnce('30'); // duration

            mockNotificationService.showQuickPick
                .mockResolvedValueOnce({ label: '🔴 High', value: 'high' }) // priority
                .mockResolvedValueOnce({ label: 'No dependencies', value: 'none' }); // dependencies

            // Execute the createTask method directly
            await (taskCommands as any).createTask();

            expect(mockTaskQueue.addTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Fix authentication bug',
                    description: 'Fix authentication bug',
                    priority: 'high',
                    files: ['src/test.ts'],
                    tags: ['frontend', 'bug'],
                    requiredCapabilities: ['React', 'TypeScript'],
                    estimatedDuration: 30,
                    dependsOn: []
                })
            );

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('Task created and added to queue');
        });

        it('should handle task creation with dependencies', async () => {
            const existingTask = { ...mockTask, id: 'task-0', title: 'Existing Task' };
            mockTaskQueue.getTasks.mockReturnValue([existingTask]);

            mockNotificationService.showInputBox
                .mockResolvedValueOnce('New task') // description
                .mockResolvedValueOnce('') // tags
                .mockResolvedValueOnce('') // capabilities
                .mockResolvedValueOnce(''); // duration

            mockNotificationService.showQuickPick
                .mockResolvedValueOnce({ label: '🟡 Medium', value: 'medium' }) // priority
                .mockResolvedValueOnce({ label: 'Add dependencies', value: 'add' }) // dependencies choice
                .mockResolvedValueOnce([{ label: 'Existing Task', value: 'task-0' }]); // selected dependencies

            await (taskCommands as any).createTask();

            expect(mockTaskQueue.addTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'New task',
                    priority: 'medium',
                    dependsOn: ['task-0']
                })
            );
        });

        it('should handle cancellation', async () => {
            mockNotificationService.showInputBox.mockResolvedValueOnce(undefined);

            await (taskCommands as any).createTask();

            expect(mockTaskQueue.addTask).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        it('should handle task creation errors', async () => {
            mockNotificationService.showInputBox
                .mockResolvedValueOnce('Test task')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');

            mockNotificationService.showQuickPick
                .mockResolvedValueOnce({ label: '🟢 Low', value: 'low' })
                .mockResolvedValueOnce({ label: 'No dependencies', value: 'none' });

            mockTaskQueue.addTask.mockImplementation(() => {
                throw new Error('Queue is full');
            });

            await (taskCommands as any).createTask();

            expect(mockNotificationService.showError).toHaveBeenCalledWith('Failed to create task: Queue is full');
        });
    });

    describe('completeTask', () => {
        it('should complete a single active task', async () => {
            mockTaskQueue.getTasks.mockReturnValue([mockTask]);

            await (taskCommands as any).completeTask();

            expect(mockTaskQueue.completeTask).toHaveBeenCalledWith('task-1');
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(expect.stringContaining('completed'));
        });

        it('should allow selection when multiple tasks exist', async () => {
            const task2 = { ...mockTask, id: 'task-2', title: 'Second Task' };
            mockTaskQueue.getTasks.mockReturnValue([mockTask, task2]);

            mockNotificationService.showQuickPick.mockResolvedValueOnce({
                label: 'Second Task',
                value: 'task-2'
            });

            await (taskCommands as any).completeTask();

            expect(mockTaskQueue.completeTask).toHaveBeenCalledWith('task-2');
        });

        it('should show message when no active tasks', async () => {
            mockTaskQueue.getTasks.mockReturnValue([]);

            await (taskCommands as any).completeTask();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('No active tasks to complete');
            expect(mockTaskQueue.completeTask).not.toHaveBeenCalled();
        });

        it('should handle task not found error', async () => {
            mockTaskQueue.getTasks.mockReturnValue([mockTask]);
            mockTaskQueue.completeTask.mockReturnValue(false);

            await (taskCommands as any).completeTask();

            expect(mockNotificationService.showError).toHaveBeenCalledWith(expect.stringContaining('Failed'));
        });
    });

    describe('addTaskDependency', () => {
        it('should add dependency between tasks', async () => {
            const task2 = { ...mockTask, id: 'task-2', title: 'Task 2' };
            mockTaskQueue.getTasks.mockReturnValue([mockTask, task2]);

            mockNotificationService.showQuickPick
                .mockResolvedValueOnce({ label: 'Test Task', value: 'task-1' }) // dependent task
                .mockResolvedValueOnce({ label: 'Task 2', value: 'task-2' }); // dependency

            mockTaskQueue.addTaskDependency.mockReturnValue(true);

            await (taskCommands as any).addTaskDependency();

            expect(mockTaskQueue.addTaskDependency).toHaveBeenCalledWith('task-1', 'task-2');
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(expect.stringContaining('added'));
        });

        it('should handle circular dependency error', async () => {
            const task2 = { ...mockTask, id: 'task-2', title: 'Task 2' };
            mockTaskQueue.getTasks.mockReturnValue([mockTask, task2]);

            mockNotificationService.showQuickPick
                .mockResolvedValueOnce({ label: 'Test Task', value: 'task-1' })
                .mockResolvedValueOnce({ label: 'Task 2', value: 'task-2' });

            mockTaskQueue.addTaskDependency.mockImplementation(() => {
                throw new Error('Circular dependency detected');
            });

            await (taskCommands as any).addTaskDependency();

            expect(mockNotificationService.showError).toHaveBeenCalledWith(
                'Failed to add dependency: Circular dependency detected'
            );
        });
    });

    describe('removeTaskDependency', () => {
        it('should remove dependency between tasks', async () => {
            const task2 = { ...mockTask, id: 'task-2', title: 'Task 2', dependsOn: ['task-1'] };
            mockTaskQueue.getTasks.mockReturnValue([mockTask, task2]);
            mockTaskQueue.getDependencies.mockReturnValue(['task-1']);

            mockNotificationService.showQuickPick
                .mockResolvedValueOnce({ label: 'Task 2', value: 'task-2' }) // task with dependencies
                .mockResolvedValueOnce({ label: 'Test Task', value: 'task-1' }); // dependency to remove

            mockTaskQueue.removeTaskDependency.mockReturnValue(true);

            await (taskCommands as any).removeTaskDependency();

            expect(mockTaskQueue.removeTaskDependency).toHaveBeenCalledWith('task-2', 'task-1');
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(expect.stringContaining('removed'));
        });
    });

    describe('resolveTaskConflict', () => {
        it('should resolve conflicts for blocked tasks', async () => {
            const blockedTask = {
                ...mockTask,
                status: 'blocked' as any,
                blockingReason: { type: 'dependency' as any, details: 'Waiting for task-2' }
            };
            mockTaskQueue.getBlockedTasks.mockReturnValue([blockedTask]);

            mockNotificationService.showQuickPick
                .mockResolvedValueOnce({ label: 'Test Task', value: 'task-1' }) // blocked task
                .mockResolvedValueOnce({ label: 'Force complete', value: 'force' }); // resolution

            mockTaskQueue.resolveConflict.mockReturnValue(true);

            await (taskCommands as any).resolveTaskConflict();

            expect(mockTaskQueue.resolveConflict).toHaveBeenCalledWith('task-1', 'force');
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(expect.stringContaining('resolved'));
        });

        it('should show message when no blocked tasks', async () => {
            mockTaskQueue.getBlockedTasks.mockReturnValue([]);

            await (taskCommands as any).resolveTaskConflict();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('No blocked tasks to resolve');
        });
    });
});
