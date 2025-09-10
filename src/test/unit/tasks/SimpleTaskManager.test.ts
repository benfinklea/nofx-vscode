import { SimpleTaskManager } from '../../../tasks/SimpleTaskManager';
import { SimpleTaskConfig, TaskPriority, TaskEvent } from '../../../tasks/SimpleTaskTypes';
import { AgentManager } from '../../../agents/AgentManager';
import { ILoggingService, IEventBus, INotificationService, IConfigurationService } from '../../../services/interfaces';
import {
    createMockAgentManager,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockConfigurationService
} from '../../helpers/mockFactories';

describe('SimpleTaskManager', () => {
    let taskManager: SimpleTaskManager;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;

    const createMockAgent = (id: string, name: string = 'Test Agent') => ({
        id,
        name,
        status: 'idle',
        template: { icon: '🤖' }
    });

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Create mock services
        mockAgentManager = createMockAgentManager() as jest.Mocked<AgentManager>;
        mockLoggingService = createMockLoggingService();
        mockEventBus = createMockEventBus();
        mockNotificationService = createMockNotificationService();
        mockConfigService = createMockConfigurationService();

        // Configure default config service behavior
        mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
            switch (key) {
                case 'nofx.tasks.enablePriority':
                    return true;
                case 'nofx.tasks.maxConcurrent':
                    return 10;
                case 'nofx.tasks.retryFailed':
                    return false;
                default:
                    return defaultValue;
            }
        });
        mockConfigService.isAutoAssignTasks.mockReturnValue(true);

        // Create task manager
        taskManager = new SimpleTaskManager(
            mockAgentManager,
            mockLoggingService,
            mockEventBus,
            mockNotificationService,
            mockConfigService
        );
    });

    afterEach(() => {
        taskManager.dispose();
    });

    describe('Task Creation', () => {
        it('should create a task with correct defaults', () => {
            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };

            const task = taskManager.addTask(config);

            expect(task.title).toBe('Test Task');
            expect(task.description).toBe('Test description');
            expect(task.priority).toBe('medium');
            expect(task.status).toBe('ready');
            expect(task.files).toEqual([]);
            expect(task.createdAt).toBeInstanceOf(Date);
        });

        it('should create a task with high priority', () => {
            const config: SimpleTaskConfig = {
                title: 'High Priority Task',
                description: 'Urgent task',
                priority: 'high'
            };

            const task = taskManager.addTask(config);

            expect(task.priority).toBe('high');
            expect(task.numericPriority).toBe(TaskPriority.HIGH);
        });

        it('should emit task created event', () => {
            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };

            taskManager.addTask(config);

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                TaskEvent.CREATED,
                expect.objectContaining({
                    taskId: expect.any(String)
                })
            );
        });

        it('should add task to internal storage', () => {
            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };

            const task = taskManager.addTask(config);
            const retrieved = taskManager.getTask(task.id);

            expect(retrieved).toBeDefined();
            expect(retrieved!.id).toBe(task.id);
        });
    });

    describe('Task Assignment', () => {
        it('should assign next task when agents are available', () => {
            // Setup
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAvailableAgents.mockReturnValue([agent]);
            mockAgentManager.executeTask.mockImplementation(() => {});
            mockAgentManager.getAgentTerminal.mockReturnValue({ show: jest.fn() } as any);

            // Create task
            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };
            taskManager.addTask(config);

            // Test assignment
            const result = taskManager.assignNextTask();

            expect(result).toBe(true);
            expect(mockAgentManager.executeTask).toHaveBeenCalledWith('agent-1', expect.any(Object));
        });

        it('should not assign when no agents available', () => {
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };
            taskManager.addTask(config);

            const result = taskManager.assignNextTask();

            expect(result).toBe(false);
        });

        it('should not assign when no tasks in queue', () => {
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAvailableAgents.mockReturnValue([agent]);

            const result = taskManager.assignNextTask();

            expect(result).toBe(false);
        });

        it('should assign specific task to specific agent', async () => {
            // Setup
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAgent.mockReturnValue(agent);
            mockAgentManager.executeTask.mockImplementation(() => {});

            // Create task
            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };
            const task = taskManager.addTask(config);

            // Test specific assignment
            const result = await taskManager.assignTask(task.id, 'agent-1');

            expect(result).toBe(true);
            expect(mockAgentManager.executeTask).toHaveBeenCalledWith('agent-1', expect.any(Object));
        });
    });

    describe('Priority Queue', () => {
        it('should prioritize high priority tasks', () => {
            // Setup agents
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAvailableAgents.mockReturnValue([agent]);
            mockAgentManager.executeTask.mockImplementation(() => {});

            // Create tasks in reverse priority order
            const lowTask = taskManager.addTask({
                title: 'Low Priority',
                description: 'Low',
                priority: 'low'
            });

            const highTask = taskManager.addTask({
                title: 'High Priority',
                description: 'High',
                priority: 'high'
            });

            const mediumTask = taskManager.addTask({
                title: 'Medium Priority',
                description: 'Medium',
                priority: 'medium'
            });

            // High priority task should be assigned first
            const result = taskManager.assignNextTask();

            expect(result).toBe(true);
            expect(mockAgentManager.executeTask).toHaveBeenCalledWith(
                'agent-1',
                expect.objectContaining({
                    title: 'High Priority'
                })
            );
        });

        it('should use FIFO for same priority tasks', () => {
            // Setup agents
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAvailableAgents.mockReturnValue([agent]);
            mockAgentManager.executeTask.mockImplementation(() => {});

            // Create multiple medium priority tasks
            const firstTask = taskManager.addTask({
                title: 'First Task',
                description: 'First',
                priority: 'medium'
            });

            // Small delay to ensure different timestamps
            jest.advanceTimersByTime(10);

            const secondTask = taskManager.addTask({
                title: 'Second Task',
                description: 'Second',
                priority: 'medium'
            });

            // First task should be assigned first
            const result = taskManager.assignNextTask();

            expect(result).toBe(true);
            expect(mockAgentManager.executeTask).toHaveBeenCalledWith(
                'agent-1',
                expect.objectContaining({
                    title: 'First Task'
                })
            );
        });
    });

    describe('Task Completion', () => {
        it('should mark task as completed', () => {
            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };
            const task = taskManager.addTask(config);

            const result = taskManager.completeTask(task.id);

            expect(result).toBe(true);

            const updatedTask = taskManager.getTask(task.id);
            expect(updatedTask!.status).toBe('completed');
            expect(updatedTask!.completedAt).toBeInstanceOf(Date);
        });

        it('should emit task completed event', () => {
            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };
            const task = taskManager.addTask(config);

            taskManager.completeTask(task.id);

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                TaskEvent.COMPLETED,
                expect.objectContaining({
                    taskId: task.id
                })
            );
        });

        it('should show completion notification', () => {
            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };
            const task = taskManager.addTask(config);

            taskManager.completeTask(task.id);

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('✅ Task completed: Test Task');
        });
    });

    describe('Task Failure', () => {
        it('should mark task as failed', () => {
            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };
            const task = taskManager.addTask(config);

            taskManager.failTask(task.id, 'Test error');

            const updatedTask = taskManager.getTask(task.id);
            expect(updatedTask!.status).toBe('failed');
        });

        it('should emit task failed event', () => {
            const config: SimpleTaskConfig = {
                title: 'Test Task',
                description: 'Test description'
            };
            const task = taskManager.addTask(config);

            taskManager.failTask(task.id, 'Test error');

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                TaskEvent.FAILED,
                expect.objectContaining({
                    taskId: task.id,
                    error: 'Test error'
                })
            );
        });
    });

    describe('Task Statistics', () => {
        it('should return correct task statistics', () => {
            // Create tasks with different statuses
            const task1 = taskManager.addTask({
                title: 'Task 1',
                description: 'Ready task'
            });

            const task2 = taskManager.addTask({
                title: 'Task 2',
                description: 'Completed task'
            });
            taskManager.completeTask(task2.id);

            const task3 = taskManager.addTask({
                title: 'Task 3',
                description: 'Failed task'
            });
            taskManager.failTask(task3.id);

            const stats = taskManager.getTaskStats();

            expect(stats.total).toBe(3);
            expect(stats.ready).toBe(1);
            expect(stats.completed).toBe(1);
            expect(stats.failed).toBe(1);
            expect(stats.queued).toBe(1); // One ready task in queue
        });
    });

    describe('Auto Assignment', () => {
        it('should auto-assign tasks when auto-assign is enabled', () => {
            // Setup
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAvailableAgents.mockReturnValue([agent]);
            mockAgentManager.executeTask.mockImplementation(() => {});
            mockAgentManager.onAgentUpdate.mockImplementation(callback => {
                // Simulate immediate callback
                setTimeout(callback, 0);
                return { dispose: () => {} } as any;
            });

            // Create task (should auto-assign)
            const config: SimpleTaskConfig = {
                title: 'Auto Assign Task',
                description: 'Should be assigned automatically'
            };
            taskManager.addTask(config);

            // Verify assignment was attempted
            expect(mockAgentManager.executeTask).toHaveBeenCalled();
        });
    });

    describe('Task Retrieval', () => {
        it('should retrieve tasks by status', () => {
            const task1 = taskManager.addTask({
                title: 'Task 1',
                description: 'Ready task'
            });

            const task2 = taskManager.addTask({
                title: 'Task 2',
                description: 'Another task'
            });
            taskManager.completeTask(task2.id);

            const readyTasks = taskManager.getTasksByStatus('ready');
            const completedTasks = taskManager.getTasksByStatus('completed');

            expect(readyTasks).toHaveLength(1);
            expect(readyTasks[0].title).toBe('Task 1');
            expect(completedTasks).toHaveLength(1);
            expect(completedTasks[0].title).toBe('Task 2');
        });

        it('should retrieve tasks for specific agent', () => {
            // Setup
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAgent.mockReturnValue(agent);
            mockAgentManager.executeTask.mockImplementation(() => {});

            // Create and assign task
            const task = taskManager.addTask({
                title: 'Agent Task',
                description: 'Task for specific agent'
            });
            taskManager.assignTask(task.id, 'agent-1');

            const agentTasks = taskManager.getTasksForAgent('agent-1');

            expect(agentTasks).toHaveLength(1);
            expect(agentTasks[0].id).toBe(task.id);
        });
    });

    describe('Task Cleanup', () => {
        it('should clear all tasks', () => {
            taskManager.addTask({
                title: 'Task 1',
                description: 'First task'
            });

            taskManager.addTask({
                title: 'Task 2',
                description: 'Second task'
            });

            taskManager.clearAllTasks();

            expect(taskManager.getTasks()).toHaveLength(0);
            expect(taskManager.getTaskStats().total).toBe(0);
        });

        it('should clear only completed tasks', () => {
            const task1 = taskManager.addTask({
                title: 'Active Task',
                description: 'Still active'
            });

            const task2 = taskManager.addTask({
                title: 'Completed Task',
                description: 'Done'
            });
            taskManager.completeTask(task2.id);

            taskManager.clearCompleted();

            const remainingTasks = taskManager.getTasks();
            expect(remainingTasks).toHaveLength(1);
            expect(remainingTasks[0].id).toBe(task1.id);
        });
    });

    describe('Legacy Compatibility', () => {
        it('should provide legacy interface methods', () => {
            // Test that all legacy methods exist and return expected types
            expect(typeof taskManager.getAllTasks).toBe('function');
            expect(typeof taskManager.getPendingTasks).toBe('function');
            expect(typeof taskManager.getActiveTasks).toBe('function');
            expect(typeof taskManager.getActiveOrAssignedTasks).toBe('function');
            expect(typeof taskManager.getBlockedTasks).toBe('function');

            // Test that they return arrays
            expect(Array.isArray(taskManager.getAllTasks())).toBe(true);
            expect(Array.isArray(taskManager.getPendingTasks())).toBe(true);
            expect(Array.isArray(taskManager.getActiveTasks())).toBe(true);
        });

        it('should return empty arrays for complex features', () => {
            // Blocked tasks don't exist in simple system
            expect(taskManager.getBlockedTasks()).toEqual([]);
            expect(taskManager.getDependentTasks()).toEqual([]);
        });

        it('should return false for dependency methods', () => {
            // Dependency management not supported in simple system
            expect(taskManager.addTaskDependency()).toBe(false);
            expect(taskManager.removeTaskDependency()).toBe(false);
            expect(taskManager.resolveConflict()).toBe(false);
        });
    });
});
