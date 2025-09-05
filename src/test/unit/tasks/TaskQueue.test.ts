import { TaskQueue } from '../../../tasks/TaskQueue';
import { AgentManager } from '../../../agents/AgentManager';
import { 
    ILoggingService, 
    IEventBus, 
    IErrorHandler, 
    INotificationService, 
    IConfigurationService,
    ITaskStateMachine,
    IPriorityTaskQueue,
    ICapabilityMatcher,
    ITaskDependencyManager,
    IMetricsService,
    SERVICE_TOKENS
} from '../../../services/interfaces';
import { Task, TaskConfig, TaskStatus } from '../../../agents/types';
import { createTestContainer, createMockAgent, createMockTask, waitForEvent } from '../../setup';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';

describe('TaskQueue', () => {
    let taskQueue: TaskQueue;
    let agentManager: AgentManager;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockTaskStateMachine: jest.Mocked<ITaskStateMachine>;
    let mockPriorityQueue: jest.Mocked<IPriorityTaskQueue>;
    let mockCapabilityMatcher: jest.Mocked<ICapabilityMatcher>;
    let mockDependencyManager: jest.Mocked<ITaskDependencyManager>;
    let mockMetricsService: jest.Mocked<IMetricsService>;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock services
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn(() => true),
            getChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn() })),
            time: jest.fn(),
            timeEnd: jest.fn(),
            dispose: jest.fn()
        };

        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(() => ({ dispose: jest.fn() })),
            unsubscribe: jest.fn(),
            once: jest.fn(() => ({ dispose: jest.fn() })),
            filter: jest.fn(),
            dispose: jest.fn()
        };

        mockErrorHandler = {
            handleError: jest.fn(),
            handleAsync: jest.fn(),
            wrapSync: jest.fn(),
            withRetry: jest.fn(),
            dispose: jest.fn()
        };

        mockNotificationService = {
            showInformation: jest.fn().mockResolvedValue(undefined),
            showWarning: jest.fn().mockResolvedValue(undefined),
            showError: jest.fn().mockResolvedValue(undefined),
            showQuickPick: jest.fn().mockResolvedValue(undefined),
            showInputBox: jest.fn().mockResolvedValue(undefined),
            withProgress: jest.fn().mockImplementation((options, task) => task({ report: jest.fn() })),
            confirm: jest.fn().mockResolvedValue(true),
            confirmDestructive: jest.fn().mockResolvedValue(true)
        };

        mockConfigService = {
            get: jest.fn(),
            getAll: jest.fn(),
            update: jest.fn(),
            onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
            getMaxAgents: jest.fn(() => 3),
            getClaudePath: jest.fn(() => 'claude'),
            isAutoAssignTasks: jest.fn(() => true),
            isUseWorktrees: jest.fn(() => true),
            getTemplatesPath: jest.fn(() => '.nofx/templates'),
            isPersistAgents: jest.fn(() => true),
            getLogLevel: jest.fn(() => 'info'),
            getOrchestrationHeartbeatInterval: jest.fn(() => 10000),
            getOrchestrationHeartbeatTimeout: jest.fn(() => 30000),
            getOrchestrationHistoryLimit: jest.fn(() => 1000),
            getOrchestrationPersistencePath: jest.fn(() => '.nofx/orchestration'),
            getOrchestrationMaxFileSize: jest.fn(() => 10485760),
            dispose: jest.fn()
        };

        mockTaskStateMachine = {
            validateTransition: jest.fn(() => true),
            transition: jest.fn(() => []),
            getValidTransitions: jest.fn(() => ['ready', 'assigned', 'in-progress']),
            isTerminalState: jest.fn((state) => ['completed', 'failed'].includes(state)),
            setTaskReader: jest.fn(),
            dispose: jest.fn()
        };

        mockPriorityQueue = {
            enqueue: jest.fn(),
            dequeue: jest.fn(),
            dequeueReady: jest.fn(),
            peek: jest.fn(),
            remove: jest.fn(),
            contains: jest.fn(),
            reorder: jest.fn(),
            recomputePriority: jest.fn(),
            calculateSoftDependencyAdjustmentWithTasks: jest.fn(() => 0),
            computeEffectivePriority: jest.fn((task) => task.numericPriority || 5),
            moveToReady: jest.fn(),
            updatePriority: jest.fn(),
            enqueueMany: jest.fn(),
            getStats: jest.fn(() => ({ size: 0, averagePriority: 5, averageWaitMs: 0, depthHistory: [] })),
            size: jest.fn(() => 0),
            isEmpty: jest.fn(() => true),
            toArray: jest.fn(() => []),
            dispose: jest.fn()
        };

        mockCapabilityMatcher = {
            scoreAgent: jest.fn(() => 0.8),
            findBestAgent: jest.fn(),
            rankAgents: jest.fn(() => []),
            calculateCapabilityMatch: jest.fn(() => 0.8),
            getMatchExplanation: jest.fn(() => 'Good match'),
            dispose: jest.fn()
        };

        mockDependencyManager = {
            addDependency: jest.fn(() => true),
            removeDependency: jest.fn(),
            addSoftDependency: jest.fn(() => true),
            removeSoftDependency: jest.fn(),
            validateDependencies: jest.fn(() => []),
            getReadyTasks: jest.fn(() => []),
            detectCycles: jest.fn(() => []),
            checkConflicts: jest.fn(() => []),
            resolveConflict: jest.fn() as any,
            getDependentTasks: jest.fn() as any,
            getSoftDependents: jest.fn() as any,
            getDependencyGraph: jest.fn(() => ({})),
            getSoftDependencyGraph: jest.fn(() => ({})),
            getConflicts: jest.fn(() => []),
            dispose: jest.fn()
        };

        mockMetricsService = {
            incrementCounter: jest.fn(),
            recordDuration: jest.fn(),
            setGauge: jest.fn(),
            startTimer: jest.fn() as any,
            endTimer: jest.fn(),
            getMetrics: jest.fn(() => []),
            resetMetrics: jest.fn(),
            exportMetrics: jest.fn(() => '{}'),
            getDashboardData: jest.fn(() => ({})),
            dispose: jest.fn()
        };

        // Create mock AgentManager
        agentManager = {
            getIdleAgents: jest.fn(() => []),
            getAgent: jest.fn(),
            executeTask: jest.fn(),
            onAgentUpdate: jest.fn(() => ({ dispose: jest.fn() }))
        } as any;

        // Create TaskQueue instance
        taskQueue = new TaskQueue(
            agentManager,
            mockLoggingService,
            mockEventBus,
            mockErrorHandler,
            mockNotificationService,
            mockConfigService,
            mockTaskStateMachine,
            mockPriorityQueue,
            mockCapabilityMatcher,
            mockDependencyManager,
            mockMetricsService
        );
    });

    afterEach(() => {
        taskQueue.dispose();
    });

    describe('Task Creation', () => {
        it('should create a task with valid configuration', () => {
            const taskConfig: TaskConfig = {
                title: 'Test Task',
                description: 'A test task description',
                priority: 'high',
                capabilities: ['general']
            };

            const task = taskQueue.addTask(taskConfig);

            expect(task).toBeDefined();
            expect(task.title).toBe('Test Task');
            expect(task.description).toBe('A test task description');
            expect(task.priority).toBe('high');
            expect(task.status).toBe('validated');
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_created', {
                priority: 'high',
                hasDependencies: 'false'
            });
        });

        it('should validate task configuration and throw on invalid config', () => {
            const invalidConfig: TaskConfig = {
                title: '',
                description: '',
                priority: 'medium'
            };

            expect(() => taskQueue.addTask(invalidConfig)).toThrow('Task validation failed');
        });

        it('should handle tasks with dependencies', () => {
            const taskConfig: TaskConfig = {
                title: 'Dependent Task',
                description: 'A task with dependencies',
                priority: 'medium',
                dependsOn: ['parent-task-id'],
                capabilities: ['general']
            };

            mockDependencyManager.validateDependencies.mockReturnValue([]);

            const task = taskQueue.addTask(taskConfig);

            expect(task).toBeDefined();
            expect(task.dependsOn).toEqual(['parent-task-id']);
            expect(mockDependencyManager.addDependency).toHaveBeenCalledWith(task.id, 'parent-task-id');
        });

        it('should block tasks with invalid dependencies', () => {
            const taskConfig: TaskConfig = {
                title: 'Blocked Task',
                description: 'A task with invalid dependencies',
                priority: 'medium',
                dependsOn: ['non-existent-task'],
                capabilities: ['general']
            };

            mockDependencyManager.validateDependencies.mockReturnValue([
                { field: 'dependencies', message: 'Missing dependency', code: 'MISSING_DEPENDENCY' }
            ]);

            const task = taskQueue.addTask(taskConfig);

            expect(task.status).toBe('blocked');
            expect(task.blockedBy).toEqual(['non-existent-task']);
        });

        it('should handle tasks with conflicts', () => {
            const taskConfig: TaskConfig = {
                title: 'Conflicting Task',
                description: 'A task with conflicts',
                priority: 'medium',
                capabilities: ['general']
            };

            mockDependencyManager.checkConflicts.mockReturnValue(['conflicting-task-id']);

            const task = taskQueue.addTask(taskConfig);

            expect(task.status).toBe('blocked');
            expect(task.conflictsWith).toEqual(['conflicting-task-id']);
        });
    });

    describe('Task Assignment', () => {
        beforeEach(() => {
            // Set up mock agent
            const mockAgent = createMockAgent({ id: 'agent-1', status: 'idle' });
            (agentManager as any).getIdleAgents.mockReturnValue([mockAgent]);
            (agentManager as any).getAgent.mockReturnValue(mockAgent);
            (agentManager as any).executeTask.mockResolvedValue(undefined);
        });

        it('should assign task to idle agent', () => {
            const taskConfig: TaskConfig = {
                title: 'Assignable Task',
                description: 'A task that can be assigned',
                priority: 'medium',
                capabilities: ['general']
            };

            const task = taskQueue.addTask(taskConfig);
            mockPriorityQueue.dequeueReady.mockReturnValue(task);
            mockCapabilityMatcher.findBestAgent.mockReturnValue(createMockAgent({ id: 'agent-1' }));

            const result = taskQueue.assignNextTask();

            expect(result).toBe(true);
            expect(agentManager.executeTask).toHaveBeenCalledWith('agent-1', task);
            expect(mockTaskStateMachine.transition).toHaveBeenCalledWith(task, 'assigned');
            expect(mockTaskStateMachine.transition).toHaveBeenCalledWith(task, 'in-progress');
        });

        it('should not assign task when no idle agents available', () => {
            (agentManager as any).getIdleAgents.mockReturnValue([]);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockPriorityQueue.dequeueReady.mockReturnValue(createMockTask());

            const result = taskQueue.assignNextTask();

            expect(result).toBe(false);
            expect(agentManager.executeTask).not.toHaveBeenCalled();
        });

        it('should not assign task when priority queue is empty', () => {
            mockPriorityQueue.isEmpty.mockReturnValue(true);

            const result = taskQueue.assignNextTask();

            expect(result).toBe(false);
            expect(agentManager.executeTask).not.toHaveBeenCalled();
        });

        it('should handle assignment errors gracefully', () => {
            const task = createMockTask({ status: 'ready' });
            mockPriorityQueue.dequeueReady.mockReturnValue(task);
            mockCapabilityMatcher.findBestAgent.mockReturnValue(createMockAgent({ id: 'agent-1' }));
            (agentManager as any).executeTask.mockRejectedValue(new Error('Assignment failed'));

            const result = taskQueue.assignNextTask();

            expect(result).toBe(false);
            expect(mockPriorityQueue.enqueue).toHaveBeenCalledWith(task);
            expect(mockTaskStateMachine.transition).toHaveBeenCalledWith(task, 'ready');
        });

        it('should use capability matcher to find best agent', () => {
            const task = createMockTask({ status: 'ready' });
            const agent1 = createMockAgent({ id: 'agent-1', capabilities: ['frontend'] });
            const agent2 = createMockAgent({ id: 'agent-2', capabilities: ['backend'] });
            
            mockPriorityQueue.dequeueReady.mockReturnValue(task);
            (agentManager as any).getIdleAgents.mockReturnValue([agent1, agent2]);
            mockCapabilityMatcher.rankAgents.mockReturnValue([
                { agent: agent2, score: 0.9 },
                { agent: agent1, score: 0.7 }
            ]);
            mockCapabilityMatcher.findBestAgent.mockReturnValue(agent2);

            taskQueue.assignNextTask();

            expect(mockCapabilityMatcher.rankAgents).toHaveBeenCalledWith([agent1, agent2], task);
            expect(mockCapabilityMatcher.findBestAgent).toHaveBeenCalledWith([agent1, agent2], task);
        });
    });

    describe('Task Completion', () => {
        it('should complete task successfully', () => {
            const task = createMockTask({ id: 'task-1', status: 'in-progress' });
            jest.spyOn(taskQueue, 'getTask').mockReturnValue(task);

            const result = taskQueue.completeTask('task-1');

            expect(result).toBe(true);
            expect(mockTaskStateMachine.transition).toHaveBeenCalledWith(task, 'completed');
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_completed', expect.any(Object));
        });

        it('should return false for non-existent task', () => {
            jest.spyOn(taskQueue, 'getTask').mockReturnValue(undefined);

            const result = taskQueue.completeTask('non-existent');

            expect(result).toBe(false);
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_completion_failed', { reason: 'task_not_found' });
        });

        it('should handle transition errors', () => {
            const task = createMockTask({ id: 'task-1', status: 'in-progress' });
            jest.spyOn(taskQueue, 'getTask').mockReturnValue(task);
            mockTaskStateMachine.transition.mockReturnValue([
                { field: 'status', message: 'Invalid transition', code: 'INVALID_TRANSITION' }
            ]);

            const result = taskQueue.completeTask('task-1');

            expect(result).toBe(false);
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_completion_failed', { reason: 'transition_error' });
        });
    });

    describe('Task Failure', () => {
        it('should fail task successfully', () => {
            const task = createMockTask({ id: 'task-1', status: 'in-progress' });
            jest.spyOn(taskQueue, 'getTask').mockReturnValue(task);

            taskQueue.failTask('task-1', 'Test failure reason');

            expect(mockTaskStateMachine.transition).toHaveBeenCalledWith(task, 'failed');
            expect(mockNotificationService.showError).toHaveBeenCalledWith('❌ Task failed: Test Task - Test failure reason');
        });

        it('should handle non-existent task gracefully', () => {
            jest.spyOn(taskQueue, 'getTask').mockReturnValue(undefined);

            expect(() => taskQueue.failTask('non-existent')).not.toThrow();
        });
    });

    describe('Task Querying', () => {
        beforeEach(() => {
            // Add some test tasks
            const task1 = createMockTask({ id: 'task-1', status: 'pending' });
            const task2 = createMockTask({ id: 'task-2', status: 'in-progress' });
            const task3 = createMockTask({ id: 'task-3', status: 'completed' });
            
            jest.spyOn(taskQueue, 'getTasks').mockReturnValue([task1, task2, task3]);
        });

        it('should get all tasks', () => {
            const tasks = taskQueue.getTasks();
            expect(tasks).toHaveLength(3);
        });

        it('should get specific task by ID', () => {
            const task = taskQueue.getTask('task-1');
            expect(task).toBeDefined();
            expect(task?.id).toBe('task-1');
        });

        it('should get pending tasks', () => {
            const pendingTasks = taskQueue.getPendingTasks();
            expect(pendingTasks).toHaveLength(1);
            expect(pendingTasks[0].status).toBe('pending');
        });

        it('should get active tasks', () => {
            const activeTasks = taskQueue.getActiveTasks();
            expect(activeTasks).toHaveLength(1);
            expect(activeTasks[0].status).toBe('in-progress');
        });

        it('should get active or assigned tasks', () => {
            const activeOrAssignedTasks = taskQueue.getActiveOrAssignedTasks();
            expect(activeOrAssignedTasks).toHaveLength(1);
            expect(activeOrAssignedTasks[0].status).toBe('in-progress');
        });

        it('should get queued tasks from priority queue', () => {
            const queuedTasks = [createMockTask({ id: 'queued-1' })];
            mockPriorityQueue.toArray.mockReturnValue(queuedTasks);

            const result = taskQueue.getQueuedTasks();

            expect(result).toEqual(queuedTasks);
        });

        it('should get tasks for specific agent', () => {
            const tasks = [
                createMockTask({ id: 'task-1', assignedTo: 'agent-1' }),
                createMockTask({ id: 'task-2', assignedTo: 'agent-2' }),
                createMockTask({ id: 'task-3', assignedTo: 'agent-1' })
            ];
            jest.spyOn(taskQueue, 'getTasks').mockReturnValue(tasks);

            const agentTasks = taskQueue.getTasksForAgent('agent-1');

            expect(agentTasks).toHaveLength(2);
            expect(agentTasks.every(task => task.assignedTo === 'agent-1')).toBe(true);
        });
    });

    describe('Task Dependencies', () => {
        it('should add task dependency', () => {
            const task = createMockTask({ id: 'task-1' });
            jest.spyOn(taskQueue, 'getTask').mockReturnValue(task);
            mockDependencyManager.validateDependencies.mockReturnValue([]);
            mockDependencyManager.checkConflicts.mockReturnValue([]);

            const result = taskQueue.addTaskDependency('task-1', 'parent-task');

            expect(result).toBe(true);
            expect(mockDependencyManager.addDependency).toHaveBeenCalledWith('task-1', 'parent-task');
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.TASK_DEPENDENCY_ADDED, {
                taskId: 'task-1',
                dependsOnTaskId: 'parent-task'
            });
        });

        it('should remove task dependency', () => {
            const task = createMockTask({ id: 'task-1', dependsOn: ['parent-task'] });
            jest.spyOn(taskQueue, 'getTask').mockReturnValue(task);
            mockDependencyManager.validateDependencies.mockReturnValue([]);
            mockDependencyManager.checkConflicts.mockReturnValue([]);

            const result = taskQueue.removeTaskDependency('task-1', 'parent-task');

            expect(result).toBe(true);
            expect(mockDependencyManager.removeDependency).toHaveBeenCalledWith('task-1', 'parent-task');
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED, {
                taskId: 'task-1',
                dependsOnTaskId: 'parent-task'
            });
        });

        it('should get dependent tasks', () => {
            mockDependencyManager.getDependentTasks.mockReturnValue(['dependent-1', 'dependent-2']);
            const tasks = [
                createMockTask({ id: 'dependent-1' }),
                createMockTask({ id: 'dependent-2' })
            ];
            jest.spyOn(taskQueue, 'getTask').mockImplementation((id) => 
                tasks.find(t => t.id === id)
            );

            const dependentTasks = taskQueue.getDependentTasks('parent-task');

            expect(dependentTasks).toHaveLength(2);
            expect(mockDependencyManager.getDependentTasks).toHaveBeenCalledWith('parent-task');
        });

        it('should get blocked tasks', () => {
            const tasks = [
                createMockTask({ id: 'task-1', status: 'blocked' }),
                createMockTask({ id: 'task-2', status: 'ready' }),
                createMockTask({ id: 'task-3', status: 'blocked' })
            ];
            jest.spyOn(taskQueue, 'getTasks').mockReturnValue(tasks);

            const blockedTasks = taskQueue.getBlockedTasks();

            expect(blockedTasks).toHaveLength(2);
            expect(blockedTasks.every(task => task.status === 'blocked')).toBe(true);
        });
    });

    describe('Conflict Resolution', () => {
        it('should resolve conflict successfully', () => {
            const task = createMockTask({ id: 'task-1', status: 'blocked' });
            jest.spyOn(taskQueue, 'getTask').mockReturnValue(task);
            mockDependencyManager.resolveConflict.mockReturnValue(true);
            mockDependencyManager.checkConflicts.mockReturnValue([]);

            const result = taskQueue.resolveConflict('task-1', 'allow');

            expect(result).toBe(true);
            expect(mockDependencyManager.resolveConflict).toHaveBeenCalledWith('task-1', 'allow');
        });

        it('should handle conflict resolution failure', () => {
            mockDependencyManager.resolveConflict.mockReturnValue(false);

            const result = taskQueue.resolveConflict('task-1', 'block');

            expect(result).toBe(false);
        });
    });

    describe('Task Statistics', () => {
        it('should provide task statistics', () => {
            const tasks = [
                createMockTask({ id: 'task-1', status: 'queued' }),
                createMockTask({ id: 'task-2', status: 'ready' }),
                createMockTask({ id: 'task-3', status: 'assigned' }),
                createMockTask({ id: 'task-4', status: 'in-progress' }),
                createMockTask({ id: 'task-5', status: 'completed' }),
                createMockTask({ id: 'task-6', status: 'failed' }),
                createMockTask({ id: 'task-7', status: 'blocked' }),
                createMockTask({ id: 'task-8', status: 'validated' })
            ];
            jest.spyOn(taskQueue, 'getTasks').mockReturnValue(tasks);

            const stats = taskQueue.getTaskStats();

            expect(stats.total).toBe(8);
            expect(stats.queued).toBe(1);
            expect(stats.ready).toBe(1);
            expect(stats.assigned).toBe(1);
            expect(stats.inProgress).toBe(1);
            expect(stats.completed).toBe(1);
            expect(stats.failed).toBe(1);
            expect(stats.blocked).toBe(1);
            expect(stats.validated).toBe(1);
        });
    });

    describe('Task Assignment Integration', () => {
        it('should try to assign tasks when agent becomes available', async () => {
            const mockAgent = createMockAgent({ id: 'agent-1', status: 'idle' });
            (agentManager as any).getIdleAgents.mockReturnValue([mockAgent]);
            (agentManager as any).getAgent.mockReturnValue(mockAgent);
            (agentManager as any).executeTask.mockResolvedValue(undefined);

            const task = createMockTask({ status: 'ready' });
            mockPriorityQueue.dequeueReady.mockReturnValue(task);
            mockCapabilityMatcher.findBestAgent.mockReturnValue(mockAgent);

            // Simulate agent update event
            const agentUpdateCallback = (agentManager as any).onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            expect(mockPriorityQueue.dequeueReady).toHaveBeenCalled();
        });

        it('should handle auto-assign configuration', () => {
            mockConfigService.isAutoAssignTasks.mockReturnValue(false);

            const taskConfig: TaskConfig = {
                title: 'Test Task',
                description: 'A test task',
                priority: 'medium',
                capabilities: ['general']
            };

            taskQueue.addTask(taskConfig);

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task added. Auto-assign is disabled - assign manually.'
            );
        });
    });

    describe('Event Publishing', () => {
        it('should publish task created event', () => {
            const taskConfig: TaskConfig = {
                title: 'Test Task',
                description: 'A test task',
                priority: 'medium',
                capabilities: ['general']
            };

            taskQueue.addTask(taskConfig);

            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.TASK_CREATED, expect.any(Object));
        });

        it('should publish task waiting event when task cannot become ready', () => {
            const taskConfig: TaskConfig = {
                title: 'Test Task',
                description: 'A test task',
                priority: 'medium',
                capabilities: ['general']
            };

            mockTaskStateMachine.transition.mockReturnValue([
                { field: 'status', message: 'Dependencies not met', code: 'DEPENDENCIES_NOT_MET' }
            ]);

            taskQueue.addTask(taskConfig);

            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.TASK_WAITING, expect.any(Object));
        });
    });

    describe('Cleanup and Disposal', () => {
        it('should clear completed tasks', () => {
            const tasks = [
                createMockTask({ id: 'task-1', status: 'completed' }),
                createMockTask({ id: 'task-2', status: 'in-progress' }),
                createMockTask({ id: 'task-3', status: 'completed' })
            ];
            jest.spyOn(taskQueue, 'getTasks').mockReturnValue(tasks);

            taskQueue.clearCompleted();

            expect(mockEventBus.publish).toHaveBeenCalled();
        });

        it('should clear all tasks', () => {
            taskQueue.clearAllTasks();

            expect(mockPriorityQueue.isEmpty).toHaveBeenCalled();
            expect(mockLoggingService.info).toHaveBeenCalledWith('All tasks cleared');
        });

        it('should dispose properly', () => {
            taskQueue.dispose();

            expect(mockPriorityQueue.dispose).toHaveBeenCalled();
            expect(mockTaskStateMachine.dispose).toHaveBeenCalled();
            expect(mockCapabilityMatcher.dispose).toHaveBeenCalled();
            expect(mockDependencyManager.dispose).toHaveBeenCalled();
        });
    });
});

