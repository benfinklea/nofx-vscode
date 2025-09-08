import * as vscode from 'vscode';
import { TaskTreeProvider } from '../../../views/TaskTreeProvider';
import { IUIStateManager, IContainer, SERVICE_TOKENS, ITaskQueue } from '../../../services/interfaces';
import { TaskDTO } from '../../../types/ui';
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
jest.mock('vscode');

describe('TaskTreeProvider', () => {
    let provider: TaskTreeProvider;
    let mockUIStateManager: jest.Mocked<IUIStateManager>;
    let mockContainer: jest.Mocked<IContainer>;
    let mockTaskQueue: jest.Mocked<ITaskQueue>;
    let mockRefreshFire: jest.Mock;
    let mockDisposables: vscode.Disposable[];

    const mockTask: TaskDTO = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test task description',
        status: 'in-progress',
        numericPriority: 75,
        assignedTo: 'agent-1',
        dependsOn: ['task-0'],
        requiredCapabilities: ['typescript'],
        tags: ['test', 'unit'],
        estimatedDuration: 60,
        blockingReason: undefined,
        agentMatchScore: 0.85
    };

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        jest.clearAllMocks();
        mockDisposables = [];
        mockRefreshFire = jest.fn();

        // Mock TaskQueue
        mockTaskQueue = {
            addTaskDependency: jest.fn(),
            removeTaskDependency: jest.fn(),
            getTasks: jest.fn(),
            getTask: jest.fn(),
            completeTask: jest.fn(),
            resolveConflict: jest.fn()
        } as any;

        // Mock Container
        mockContainer = {
            resolve: jest.fn().mockImplementation((token: symbol) => {
                if (token === SERVICE_TOKENS.TaskQueue) {
                    return mockTaskQueue;
                }
                return undefined;
            })
        } as any;

        // Mock UIStateManager
        mockUIStateManager = {
            getState: jest.fn(),
            getTasksByStatus: jest.fn(),
            subscribe: jest.fn().mockImplementation(callback => {
                const disposable = { dispose: jest.fn() };
                mockDisposables.push(disposable);
                return disposable;
            })
        } as any;

        // Mock EventEmitter
        (vscode.EventEmitter as any) = jest.fn().mockImplementation(() => ({
            fire: mockRefreshFire,
            event: jest.fn(),
            dispose: jest.fn()
        }));

        // Mock ThemeIcon
        (vscode.ThemeIcon as any) = jest.fn().mockImplementation((icon: string) => ({ id: icon }));

        // Mock TreeItemCollapsibleState
        (vscode.TreeItemCollapsibleState as any) = {
            None: 0,
            Collapsed: 1,
            Expanded: 2
        };

        // Mock Uri
        (vscode.Uri as any) = {
            parse: jest.fn().mockImplementation((uri: string) => ({ toString: () => uri }))
        };

        // Mock DataTransferItem
        (vscode.DataTransferItem as any) = jest.fn().mockImplementation((value: any) => ({ value }));

        provider = new TaskTreeProvider(mockUIStateManager, mockContainer);
    });

    describe('constructor', () => {
        it('should resolve task queue from container', () => {
            expect(mockContainer.resolve).toHaveBeenCalledWith(SERVICE_TOKENS.TaskQueue);
        });

        it('should subscribe to UI state manager changes', () => {
            expect(mockUIStateManager.subscribe).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should trigger refresh when UI state changes', () => {
            const callback = mockUIStateManager.subscribe.mock.calls[0][0];
            callback();
            expect(mockRefreshFire).toHaveBeenCalled();
        });
    });

    describe('getChildren', () => {
        it('should return task groups when no element provided', async () => {
            mockUIStateManager.getState.mockReturnValue({
                taskStats: {
                    validated: 2,
                    ready: 3,
                    inProgress: 1,
                    blocked: 1,
                    assigned: 2,
                    queued: 4,
                    completed: 5,
                    failed: 1
                }
            });

            const children = await provider.getChildren();

            expect(children).toHaveLength(8); // All 8 groups with counts > 0
            expect(children[0]).toMatchObject({
                type: 'group',
                groupType: 'validated',
                contextValue: 'taskGroup'
            });
            expect(children[1]).toMatchObject({
                type: 'group',
                groupType: 'ready'
            });
        });

        it('should return tasks for a specific group', async () => {
            const groupItem = {
                type: 'group' as const,
                groupType: 'in-progress'
            };

            mockUIStateManager.getTasksByStatus.mockReturnValue([
                mockTask,
                { ...mockTask, id: 'task-2', title: 'Another Task' }
            ]);

            const children = await provider.getChildren(groupItem as any);

            expect(mockUIStateManager.getTasksByStatus).toHaveBeenCalledWith('in-progress');
            expect(children).toHaveLength(2);
            expect(children[0]).toMatchObject({
                type: 'task',
                task: mockTask,
                contextValue: 'task'
            });
        });

        it('should return task details for a specific task', async () => {
            const taskItem = {
                type: 'task' as const,
                task: mockTask
            };

            const children = await provider.getChildren(taskItem as any);

            // Should show dependencies, capabilities, tags, duration, and match score
            expect(children).toHaveLength(5);
            expect(children[0]).toMatchObject({
                type: 'detail',
                contextValue: 'taskDetail'
            });
            expect(children[0].label).toContain('Depends on');
            expect(children[1].label).toContain('Capabilities');
            expect(children[2].label).toContain('Tags');
            expect(children[3].label).toContain('Estimated');
            expect(children[4].label).toContain('Match Score');
        });

        it('should handle groups with no tasks', async () => {
            mockUIStateManager.getState.mockReturnValue({
                taskStats: {
                    validated: 0,
                    ready: 0,
                    inProgress: 0,
                    blocked: 0,
                    assigned: 0,
                    queued: 0,
                    completed: 0,
                    failed: 0
                }
            });

            const children = await provider.getChildren();

            expect(children).toHaveLength(0);
        });

        it('should collapse completed and failed groups by default', async () => {
            mockUIStateManager.getState.mockReturnValue({
                taskStats: {
                    validated: 0,
                    ready: 0,
                    inProgress: 0,
                    blocked: 0,
                    assigned: 0,
                    queued: 0,
                    completed: 1,
                    failed: 1
                }
            });

            const children = await provider.getChildren();

            expect(children[0].collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
            expect(children[1].collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        });
    });

    describe('getTreeItem', () => {
        it('should return the element as-is', () => {
            const element = { label: 'Test Item' };
            const result = provider.getTreeItem(element as any);
            expect(result).toBe(element);
        });
    });

    describe('refresh', () => {
        it('should fire the change event', () => {
            provider.refresh();
            expect(mockRefreshFire).toHaveBeenCalled();
        });
    });

    describe('getDragAndDropController', () => {
        let controller: vscode.TreeDragAndDropController<any>;
        let mockDataTransfer: any;
        let mockToken: vscode.CancellationToken;

        beforeEach(() => {
            controller = provider.getDragAndDropController();
            mockDataTransfer = {
                set: jest.fn(),
                get: jest.fn()
            };
            mockToken = {} as vscode.CancellationToken;
        });

        it('should handle drag for task items', () => {
            const taskItem = {
                type: 'task' as const,
                task: mockTask
            };

            controller.handleDrag([taskItem as any], mockDataTransfer, mockToken);

            expect(mockDataTransfer.set).toHaveBeenCalledWith(
                'application/vnd.code.tree.taskTree',
                expect.objectContaining({ value: ['task-1'] })
            );
        });

        it('should handle drop to create dependencies', () => {
            const targetTask = {
                type: 'task' as const,
                task: { ...mockTask, id: 'task-2' }
            };

            mockDataTransfer.get.mockReturnValue({ value: ['task-1'] });

            controller.handleDrop(targetTask as any, mockDataTransfer, mockToken);

            expect(mockTaskQueue.addTaskDependency).toHaveBeenCalledWith('task-1', 'task-2');
        });

        it('should not handle drop on non-task items', () => {
            const groupItem = {
                type: 'group' as const,
                groupType: 'in-progress'
            };

            mockDataTransfer.get.mockReturnValue({ value: ['task-1'] });

            controller.handleDrop(groupItem as any, mockDataTransfer, mockToken);

            expect(mockTaskQueue.addTaskDependency).not.toHaveBeenCalled();
        });

        it('should not create self-dependencies', () => {
            const targetTask = {
                type: 'task' as const,
                task: mockTask
            };

            mockDataTransfer.get.mockReturnValue({ value: ['task-1'] });

            controller.handleDrop(targetTask as any, mockDataTransfer, mockToken);

            expect(mockTaskQueue.addTaskDependency).not.toHaveBeenCalled();
        });

        it('should handle multiple dragged tasks', () => {
            const targetTask = {
                type: 'task' as const,
                task: { ...mockTask, id: 'task-3' }
            };

            mockDataTransfer.get.mockReturnValue({ value: ['task-1', 'task-2'] });

            controller.handleDrop(targetTask as any, mockDataTransfer, mockToken);

            expect(mockTaskQueue.addTaskDependency).toHaveBeenCalledWith('task-1', 'task-3');
            expect(mockTaskQueue.addTaskDependency).toHaveBeenCalledWith('task-2', 'task-3');
        });
    });

    describe('dispose', () => {
        it('should dispose all subscriptions', () => {
            provider.dispose();

            mockDisposables.forEach(disposable => {
                expect(disposable.dispose).toHaveBeenCalled();
            });
        });
    });

    describe('TaskItem class', () => {
        it('should create group items with correct properties', async () => {
            mockUIStateManager.getState.mockReturnValue({
                taskStats: {
                    validated: 1,
                    ready: 0,
                    inProgress: 0,
                    blocked: 0,
                    assigned: 0,
                    queued: 0,
                    completed: 0,
                    failed: 0
                }
            });

            const children = await provider.getChildren();
            const groupItem = children[0];

            expect(groupItem).toMatchObject({
                type: 'group',
                groupType: 'validated',
                contextValue: 'taskGroup'
            });
            expect(vscode.ThemeIcon).toHaveBeenCalledWith('folder');
        });

        it('should create task items with status-based icons', async () => {
            const tasks = [
                { ...mockTask, status: 'completed' },
                { ...mockTask, status: 'in-progress' },
                { ...mockTask, status: 'failed' },
                { ...mockTask, status: 'blocked' },
                { ...mockTask, status: 'ready' },
                { ...mockTask, status: 'validated' }
            ];

            const groupItem = { type: 'group' as const, groupType: 'test' };

            for (const task of tasks) {
                mockUIStateManager.getTasksByStatus.mockReturnValue([task]);
                await provider.getChildren(groupItem as any);
            }

            expect(vscode.ThemeIcon).toHaveBeenCalledWith('pass');
            expect(vscode.ThemeIcon).toHaveBeenCalledWith('sync~spin');
            expect(vscode.ThemeIcon).toHaveBeenCalledWith('error');
            expect(vscode.ThemeIcon).toHaveBeenCalledWith('circle-slash');
            expect(vscode.ThemeIcon).toHaveBeenCalledWith('play');
            expect(vscode.ThemeIcon).toHaveBeenCalledWith('check');
        });

        it('should set priority-based resource URIs for coloring', async () => {
            const highPriorityTask = { ...mockTask, numericPriority: 100 };
            const mediumPriorityTask = { ...mockTask, numericPriority: 75 };
            const lowPriorityTask = { ...mockTask, numericPriority: 25 };

            const groupItem = { type: 'group' as const, groupType: 'test' };

            mockUIStateManager.getTasksByStatus.mockReturnValue([highPriorityTask]);
            let children = await provider.getChildren(groupItem as any);
            expect(vscode.Uri.parse).toHaveBeenCalledWith('task://high/task-1');

            mockUIStateManager.getTasksByStatus.mockReturnValue([mediumPriorityTask]);
            children = await provider.getChildren(groupItem as any);
            expect(vscode.Uri.parse).toHaveBeenCalledWith('task://medium/task-1');

            mockUIStateManager.getTasksByStatus.mockReturnValue([lowPriorityTask]);
            children = await provider.getChildren(groupItem as any);
            expect(vscode.Uri.parse).toHaveBeenCalledWith('task://low/task-1');
        });

        it('should build comprehensive tooltips for tasks', async () => {
            const groupItem = { type: 'group' as const, groupType: 'test' };
            mockUIStateManager.getTasksByStatus.mockReturnValue([mockTask]);

            const children = await provider.getChildren(groupItem as any);
            const taskItem = children[0];

            expect(taskItem.tooltip).toContain('Test Task');
            expect(taskItem.tooltip).toContain('Test task description');
            expect(taskItem.tooltip).toContain('Status: in-progress');
            expect(taskItem.tooltip).toContain('Assigned to: agent-1');
            expect(taskItem.tooltip).toContain('Depends on: task-0');
        });

        it('should determine collapsible state based on task details', async () => {
            const taskWithDetails = mockTask;
            const taskWithoutDetails = {
                ...mockTask,
                dependsOn: undefined,
                requiredCapabilities: undefined,
                tags: undefined,
                estimatedDuration: undefined,
                agentMatchScore: undefined
            };

            const groupItem = { type: 'group' as const, groupType: 'test' };

            mockUIStateManager.getTasksByStatus.mockReturnValue([taskWithDetails]);
            let children = await provider.getChildren(groupItem as any);
            expect(children[0].collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);

            mockUIStateManager.getTasksByStatus.mockReturnValue([taskWithoutDetails]);
            children = await provider.getChildren(groupItem as any);
            expect(children[0].collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
        });
    });
});
