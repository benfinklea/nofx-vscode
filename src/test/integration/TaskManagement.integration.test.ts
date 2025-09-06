import { TaskQueue } from '../../tasks/TaskQueue';
import { AgentManager } from '../../agents/AgentManager';
import { PriorityTaskQueue } from '../../tasks/PriorityTaskQueue';
import { TaskStateMachine } from '../../tasks/TaskStateMachine';
import { CapabilityMatcher } from '../../tasks/CapabilityMatcher';
import { TaskDependencyManager } from '../../tasks/TaskDependencyManager';
import {
    ILoggingService,
    IEventBus,
    IErrorHandler,
    INotificationService,
    IConfigurationService,
    IMetricsService,
    SERVICE_TOKENS
} from '../../services/interfaces';
import { Task, TaskConfig, TaskStatus } from '../../agents/types';
import { createTestContainer, createMockAgent, createMockTask, waitForEvent, measureTime } from '../setup';
import { DOMAIN_EVENTS } from '../../services/EventConstants';

describe('Task Management Integration Tests', () => {
    let taskQueue: TaskQueue;
    let agentManager: AgentManager;
    let priorityQueue: PriorityTaskQueue;
    let taskStateMachine: TaskStateMachine;
    let capabilityMatcher: CapabilityMatcher;
    let dependencyManager: TaskDependencyManager;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
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
            isLevelEnabled: jest.fn() as any,
            getChannel: jest.fn() as any,
            time: jest.fn(),
            timeEnd: jest.fn(),
            dispose: jest.fn()
        };

        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn() as any,
            unsubscribe: jest.fn(),
            once: jest.fn() as any,
            filter: jest.fn(),
            subscribePattern: jest.fn() as any,
            setLoggingService: jest.fn(),
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
            onDidChange: jest.fn() as any,
            validateAll: jest.fn(() => ({ isValid: true, errors: [] })),
            getMaxAgents: jest.fn(() => 3),
            getClaudePath: jest.fn(() => 'claude'),
            isAutoAssignTasks: jest.fn(() => true),
            isUseWorktrees: jest.fn(() => true),
            isShowAgentTerminalOnSpawn: jest.fn(() => true),
            getTemplatesPath: jest.fn(() => '.nofx/templates'),
            isPersistAgents: jest.fn(() => true),
            getLogLevel: jest.fn(() => 'info'),
            getOrchestrationHeartbeatInterval: jest.fn(() => 10000),
            getOrchestrationHeartbeatTimeout: jest.fn(() => 30000),
            getOrchestrationHistoryLimit: jest.fn(() => 1000),
            getOrchestrationPersistencePath: jest.fn(() => '.nofx/orchestration'),
            getOrchestrationMaxFileSize: jest.fn(() => 10485760)
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

        // Create real instances of task management components
        priorityQueue = new PriorityTaskQueue(mockLoggingService);
        taskStateMachine = new TaskStateMachine(mockLoggingService, mockEventBus);
        capabilityMatcher = new CapabilityMatcher(mockLoggingService, mockConfigService);
        dependencyManager = new TaskDependencyManager(mockLoggingService, mockEventBus, mockNotificationService);

        // Create mock AgentManager
        agentManager = {
            getIdleAgents: jest.fn(() => []),
            getAgent: jest.fn(),
            executeTask: jest.fn(),
            onAgentUpdate: jest.fn(() => ({ dispose: jest.fn() }))
        } as any;

        // Create TaskQueue with real components
        taskQueue = new TaskQueue(
            agentManager,
            mockLoggingService,
            mockEventBus,
            mockErrorHandler,
            mockNotificationService,
            mockConfigService,
            taskStateMachine,
            priorityQueue,
            capabilityMatcher,
            dependencyManager,
            mockMetricsService
        );
    });

    afterEach(() => {
        taskQueue.dispose();
        priorityQueue.dispose();
        taskStateMachine.dispose();
        capabilityMatcher.dispose();
        dependencyManager.dispose();
    });

    describe('End-to-End Task Lifecycle', () => {
        it('should complete full task lifecycle from creation to completion', async () => {
            const { duration } = await measureTime(async () => {
                // 1. Create task
                const taskConfig: TaskConfig = {
                    title: 'Integration Test Task',
                    description: 'A comprehensive test task for integration testing',
                    priority: 'high',
                    requiredCapabilities: ['general', 'testing']
                };

                const task = taskQueue.addTask(taskConfig);
                expect(task).toBeDefined();
                expect(task.status).toBe('validated');
                expect(task.priority).toBe('high');

                // 2. Create and assign agent
                const mockAgent = createMockAgent({
                    id: 'agent-1',
                    status: 'idle',
                    requiredCapabilities: ['general', 'testing']
                });
                (agentManager as any).getIdleAgents.mockReturnValue([mockAgent]);
                (agentManager as any).getAgent.mockReturnValue(mockAgent);
                (agentManager as any).executeTask.mockResolvedValue(undefined);

                // 3. Assign task
                const assignmentResult = await taskQueue.assignTask(task.id, mockAgent.id);
                expect(assignmentResult).toBe(true);

                // 4. Verify task is assigned and in progress
                const assignedTask = taskQueue.getTask(task.id);
                expect(assignedTask?.status).toBe('in-progress');
                expect(assignedTask?.assignedTo).toBe(mockAgent.id);

                // 5. Complete task
                const completionResult = taskQueue.completeTask(task.id);
                expect(completionResult).toBe(true);

                // 6. Verify task is completed
                const completedTask = taskQueue.getTask(task.id);
                expect(completedTask?.status).toBe('completed');
                expect(completedTask?.completedAt).toBeDefined();
            });

            expect(duration).toBeLessThan(1000); // Should complete within 1 second
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_created', expect.any(Object));
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_completed', expect.any(Object));
        });

        it('should handle task failure and recovery', async () => {
            // Create task
            const taskConfig: TaskConfig = {
                title: 'Failing Task',
                description: 'A task that will fail and be retried',
                priority: 'medium',
                requiredCapabilities: ['general']
            };

            const task = taskQueue.addTask(taskConfig);

            // Create agent
            const mockAgent = createMockAgent({
                id: 'agent-1',
                status: 'idle',
                requiredCapabilities: ['general']
            });
            (agentManager as any).getIdleAgents.mockReturnValue([mockAgent]);
            (agentManager as any).getAgent.mockReturnValue(mockAgent);
            (agentManager as any).executeTask.mockRejectedValue(new Error('Task execution failed'));

            // Attempt assignment (should fail)
            const assignmentResult = await taskQueue.assignTask(task.id, mockAgent.id);
            expect(assignmentResult).toBe(false);

            // Task should be back in ready state
            const readyTask = taskQueue.getTask(task.id);
            expect(readyTask?.status).toBe('ready');

            // Simulate successful execution
            (agentManager as any).executeTask.mockResolvedValue(undefined);
            const retryResult = await taskQueue.assignTask(task.id, mockAgent.id);
            expect(retryResult).toBe(true);
        });
    });

    describe('Priority and Ordering Integration', () => {
        it('should process tasks in correct priority order', async () => {
            const tasks = [
                { title: 'Low Priority Task', priority: 'low' as const, description: 'Low priority task' },
                { title: 'High Priority Task', priority: 'high' as const, description: 'High priority task' },
                { title: 'Medium Priority Task', priority: 'medium' as const, description: 'Medium priority task' }
            ];

            const createdTasks: Task[] = [];
            for (const taskConfig of tasks) {
                const task = taskQueue.addTask(taskConfig);
                createdTasks.push(task);
            }

            // Create agent
            const mockAgent = createMockAgent({
                id: 'agent-1',
                status: 'idle',
                requiredCapabilities: ['general']
            });
            (agentManager as any).getIdleAgents.mockReturnValue([mockAgent]);
            (agentManager as any).getAgent.mockReturnValue(mockAgent);
            (agentManager as any).executeTask.mockResolvedValue(undefined);

            // Assign tasks in order
            const assignmentOrder: string[] = [];
            for (const task of createdTasks) {
                const result = await taskQueue.assignTask(task.id, mockAgent.id);
                if (result) {
                    assignmentOrder.push(task.title);
                }
            }

            // High priority should be assigned first
            expect(assignmentOrder[0]).toBe('High Priority Task');
        });

        it('should handle priority updates and reordering', async () => {
            const taskConfig: TaskConfig = {
                title: 'Priority Update Task',
                description: 'A task with changing priority',
                priority: 'low',
                requiredCapabilities: ['general']
            };

            const task = taskQueue.addTask(taskConfig);
            expect(task.priority).toBe('low');

            // Update priority
            priorityQueue.updatePriority(task.id, 8); // High priority

            // Create agent
            const mockAgent = createMockAgent({
                id: 'agent-1',
                status: 'idle',
                requiredCapabilities: ['general']
            });
            (agentManager as any).getIdleAgents.mockReturnValue([mockAgent]);
            (agentManager as any).getAgent.mockReturnValue(mockAgent);
            (agentManager as any).executeTask.mockResolvedValue(undefined);

            // Task should be processed with updated priority
            const assignmentResult = await taskQueue.assignTask(task.id, mockAgent.id);
            expect(assignmentResult).toBe(true);
        });
    });

    describe('Dependency Management Integration', () => {
        it('should handle task dependencies correctly', async () => {
            // Create parent task
            const parentTaskConfig: TaskConfig = {
                title: 'Parent Task',
                description: 'Task that must complete first',
                priority: 'high',
                requiredCapabilities: ['general']
            };

            const parentTask = taskQueue.addTask(parentTaskConfig);

            // Create child task with dependency
            const childTaskConfig: TaskConfig = {
                title: 'Child Task',
                description: 'Task that depends on parent',
                priority: 'medium',
                requiredCapabilities: ['general'],
                dependsOn: [parentTask.id]
            };

            const childTask = taskQueue.addTask(childTaskConfig);

            // Child task should be blocked initially
            expect(childTask.status).toBe('blocked');
            expect(childTask.blockedBy).toContain(parentTask.id);

            // Create agent
            const mockAgent = createMockAgent({
                id: 'agent-1',
                status: 'idle',
                requiredCapabilities: ['general']
            });
            (agentManager as any).getIdleAgents.mockReturnValue([mockAgent]);
            (agentManager as any).getAgent.mockReturnValue(mockAgent);
            (agentManager as any).executeTask.mockResolvedValue(undefined);

            // Complete parent task
            const parentAssignment = await taskQueue.assignTask(parentTask.id, mockAgent.id);
            expect(parentAssignment).toBe(true);

            const parentCompletion = taskQueue.completeTask(parentTask.id);
            expect(parentCompletion).toBe(true);

            // Child task should now be ready
            const updatedChildTask = taskQueue.getTask(childTask.id);
            expect(updatedChildTask?.status).toBe('ready');
            expect(updatedChildTask?.blockedBy).not.toContain(parentTask.id);
        });

        it('should detect and prevent circular dependencies', async () => {
            const task1Config: TaskConfig = {
                title: 'Task 1',
                description: 'First task in potential cycle',
                priority: 'medium',
                requiredCapabilities: ['general']
            };

            const task2Config: TaskConfig = {
                title: 'Task 2',
                description: 'Second task in potential cycle',
                priority: 'medium',
                requiredCapabilities: ['general']
            };

            const task1 = taskQueue.addTask(task1Config);
            const task2 = taskQueue.addTask(task2Config);

            // Add dependency from task1 to task2
            const dep1Result = taskQueue.addTaskDependency(task1.id, task2.id);
            expect(dep1Result).toBe(true);

            // Try to add circular dependency from task2 to task1
            const dep2Result = taskQueue.addTaskDependency(task2.id, task1.id);
            expect(dep2Result).toBe(false); // Should fail due to circular dependency
        });

        it('should handle soft dependencies and priority adjustments', async () => {
            const preferredTaskConfig: TaskConfig = {
                title: 'Preferred Task',
                description: 'Task that others prefer to run after',
                priority: 'high',
                requiredCapabilities: ['general']
            };

            const dependentTaskConfig: TaskConfig = {
                title: 'Dependent Task',
                description: 'Task that prefers to run after preferred task',
                priority: 'medium',
                requiredCapabilities: ['general'],
                prefers: [] // Will be set after creation
            };

            const preferredTask = taskQueue.addTask(preferredTaskConfig);
            const dependentTask = taskQueue.addTask(dependentTaskConfig);

            // Add soft dependency
            const softDepResult = dependencyManager.addSoftDependency(dependentTask.id, preferredTask.id);
            expect(softDepResult).toBe(true);

            // Create agent
            const mockAgent = createMockAgent({
                id: 'agent-1',
                status: 'idle',
                requiredCapabilities: ['general']
            });
            (agentManager as any).getIdleAgents.mockReturnValue([mockAgent]);
            (agentManager as any).getAgent.mockReturnValue(mockAgent);
            (agentManager as any).executeTask.mockResolvedValue(undefined);

            // Complete preferred task
            await taskQueue.assignTask(preferredTask.id, mockAgent.id);
            taskQueue.completeTask(preferredTask.id);

            // Dependent task should have priority adjusted
            const updatedDependentTask = taskQueue.getTask(dependentTask.id);
            expect(updatedDependentTask).toBeDefined();
        });
    });

    describe('Conflict Resolution Integration', () => {
        it('should detect and handle task conflicts', async () => {
            const task1Config: TaskConfig = {
                title: 'Conflicting Task 1',
                description: 'First conflicting task',
                priority: 'medium',
                requiredCapabilities: ['general']
            };

            const task2Config: TaskConfig = {
                title: 'Conflicting Task 2',
                description: 'Second conflicting task',
                priority: 'medium',
                requiredCapabilities: ['general']
            };

            const task1 = taskQueue.addTask(task1Config);
            const task2 = taskQueue.addTask(task2Config);

            // Simulate conflict detection
            const conflicts = dependencyManager.checkConflicts(task1, [task2]);
            if (conflicts.length > 0) {
                // Resolve conflict
                const resolutionResult = taskQueue.resolveConflict(task1.id, 'allow');
                expect(resolutionResult).toBe(true);
            }
        });

        it('should handle conflict resolution strategies', async () => {
            const taskConfig: TaskConfig = {
                title: 'Conflict Resolution Task',
                description: 'Task for testing conflict resolution',
                priority: 'medium',
                requiredCapabilities: ['general']
            };

            const task = taskQueue.addTask(taskConfig);

            // Test different resolution strategies
            const blockResult = taskQueue.resolveConflict(task.id, 'block');
            expect(blockResult).toBe(true);

            const allowResult = taskQueue.resolveConflict(task.id, 'allow');
            expect(allowResult).toBe(true);

            const mergeResult = taskQueue.resolveConflict(task.id, 'merge');
            expect(mergeResult).toBe(true);
        });
    });

    describe('Agent-Task Matching Integration', () => {
        it('should match tasks to agents based on capabilities', async () => {
            const frontendTaskConfig: TaskConfig = {
                title: 'Frontend Task',
                description: 'A frontend development task',
                priority: 'high',
                requiredCapabilities: ['frontend', 'react']
            };

            const backendTaskConfig: TaskConfig = {
                title: 'Backend Task',
                description: 'A backend development task',
                priority: 'high',
                requiredCapabilities: ['backend', 'api']
            };

            const frontendTask = taskQueue.addTask(frontendTaskConfig);
            const backendTask = taskQueue.addTask(backendTaskConfig);

            // Create specialized agents
            const frontendAgent = createMockAgent({
                id: 'frontend-agent',
                status: 'idle',
                capabilities: ['frontend', 'react', 'javascript']
            });

            const backendAgent = createMockAgent({
                id: 'backend-agent',
                status: 'idle',
                capabilities: ['backend', 'api', 'nodejs']
            });

            (agentManager as any).getIdleAgents.mockReturnValue([frontendAgent, backendAgent]);
            (agentManager as any).getAgent.mockImplementation((id: string) =>
                id === 'frontend-agent' ? frontendAgent : backendAgent
            );
            (agentManager as any).executeTask.mockResolvedValue(undefined);

            // Assign tasks
            const frontendAssignment = await taskQueue.assignTask(frontendTask.id, frontendAgent.id);
            const backendAssignment = await taskQueue.assignTask(backendTask.id, backendAgent.id);

            expect(frontendAssignment).toBe(true);
            expect(backendAssignment).toBe(true);

            // Verify correct assignments
            expect(frontendTask.assignedTo).toBe(frontendAgent.id);
            expect(backendTask.assignedTo).toBe(backendAgent.id);
        });

        it('should handle capability scoring and ranking', async () => {
            const taskConfig: TaskConfig = {
                title: 'Complex Task',
                description: 'A task requiring multiple capabilities',
                priority: 'high',
                requiredCapabilities: ['frontend', 'backend', 'testing']
            };

            const task = taskQueue.addTask(taskConfig);

            // Create agents with different capability matches
            const agent1 = createMockAgent({
                id: 'agent-1',
                status: 'idle',
                capabilities: ['frontend', 'testing'] // 2/3 match
            });

            const agent2 = createMockAgent({
                id: 'agent-2',
                status: 'idle',
                requiredCapabilities: ['frontend', 'backend', 'testing'] // 3/3 match
            });

            const agent3 = createMockAgent({
                id: 'agent-3',
                status: 'idle',
                capabilities: ['frontend'] // 1/3 match
            });

            (agentManager as any).getIdleAgents.mockReturnValue([agent1, agent2, agent3]);
            (agentManager as any).getAgent.mockImplementation((id: string) => {
                const agents = { 'agent-1': agent1, 'agent-2': agent2, 'agent-3': agent3 };
                return agents[id as keyof typeof agents];
            });
            (agentManager as any).executeTask.mockResolvedValue(undefined);

            // Test capability matching
            const scores = capabilityMatcher.rankAgents([agent1, agent2, agent3], task);
            expect(scores).toHaveLength(3);
            expect(scores[0].agent.id).toBe('agent-2'); // Best match should be first
        });
    });

    describe('Performance and Load Testing', () => {
        it('should handle high-frequency task creation', async () => {
            const { duration } = await measureTime(async () => {
                const tasks = [];

                // Create 100 tasks rapidly
                for (let i = 0; i < 100; i++) {
                    const taskConfig: TaskConfig = {
                        title: `Performance Task ${i}`,
                        description: `High-frequency task ${i}`,
                        priority: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
                        requiredCapabilities: ['general']
                    };

                    const task = taskQueue.addTask(taskConfig);
                    tasks.push(task);
                }

                expect(tasks).toHaveLength(100);
            });

            expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
        });

        it('should handle concurrent task assignments', async () => {
            const { duration } = await measureTime(async () => {
                // Create multiple tasks
                const tasks = [];
                for (let i = 0; i < 10; i++) {
                    const taskConfig: TaskConfig = {
                        title: `Concurrent Task ${i}`,
                        description: `Task for concurrent testing ${i}`,
                        priority: 'medium',
                        requiredCapabilities: ['general']
                    };

                    const task = taskQueue.addTask(taskConfig);
                    tasks.push(task);
                }

                // Create multiple agents
                const agents: any[] = [];
                for (let i = 0; i < 5; i++) {
                    const agent = createMockAgent({
                        id: `agent-${i}`,
                        status: 'idle',
                        requiredCapabilities: ['general']
                    });
                    agents.push(agent);
                }

                (agentManager as any).getIdleAgents.mockReturnValue(agents);
                (agentManager as any).getAgent.mockImplementation((id: string) =>
                    agents.find((a: any) => a.id === id)
                );
                (agentManager as any).executeTask.mockResolvedValue(undefined);

                // Assign tasks concurrently
                const assignmentPromises = tasks.map(task =>
                    taskQueue.assignTask(task.id, agents[Math.floor(Math.random() * agents.length)].id)
                );

                const results = await Promise.all(assignmentPromises);
                const successfulAssignments = results.filter(Boolean).length;

                expect(successfulAssignments).toBeGreaterThan(0);
            });

            expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
        });
    });

    describe('Event Publishing and Metrics Integration', () => {
        it('should publish all relevant events during task lifecycle', async () => {
            const taskConfig: TaskConfig = {
                title: 'Event Test Task',
                description: 'A task for testing event publishing',
                priority: 'medium',
                requiredCapabilities: ['general']
            };

            const task = taskQueue.addTask(taskConfig);

            // Verify task created event
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.TASK_CREATED, {
                taskId: task.id,
                task: expect.any(Object)
            });

            // Create agent and assign task
            const mockAgent = createMockAgent({
                id: 'agent-1',
                status: 'idle',
                requiredCapabilities: ['general']
            });
            (agentManager as any).getIdleAgents.mockReturnValue([mockAgent]);
            (agentManager as any).getAgent.mockReturnValue(mockAgent);
            (agentManager as any).executeTask.mockResolvedValue(undefined);

            await taskQueue.assignTask(task.id, mockAgent.id);

            // Complete task
            taskQueue.completeTask(task.id);

            // Verify metrics were recorded
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_created', expect.any(Object));
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_completed', expect.any(Object));
        });

        it('should record comprehensive metrics', async () => {
            const tasks = [];

            // Create tasks with different priorities
            const priorities = ['low', 'medium', 'high'];
            for (let i = 0; i < 9; i++) {
                const taskConfig: TaskConfig = {
                    title: `Metrics Task ${i}`,
                    description: `Task for metrics testing ${i}`,
                    priority: priorities[i % 3] as any,
                    requiredCapabilities: ['general']
                };

                const task = taskQueue.addTask(taskConfig);
                tasks.push(task);
            }

            // Verify metrics for different priorities
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_created', {
                priority: 'low',
                hasDependencies: 'false'
            });
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_created', {
                priority: 'medium',
                hasDependencies: 'false'
            });
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('tasks_created', {
                priority: 'high',
                hasDependencies: 'false'
            });
        });
    });

    describe('Error Recovery and Resilience', () => {
        it('should handle agent failures gracefully', async () => {
            const taskConfig: TaskConfig = {
                title: 'Resilience Test Task',
                description: 'A task for testing error recovery',
                priority: 'medium',
                requiredCapabilities: ['general']
            };

            const task = taskQueue.addTask(taskConfig);

            // Create agent that will fail
            const mockAgent = createMockAgent({
                id: 'failing-agent',
                status: 'idle',
                requiredCapabilities: ['general']
            });
            (agentManager as any).getIdleAgents.mockReturnValue([mockAgent]);
            (agentManager as any).getAgent.mockReturnValue(mockAgent);
            (agentManager as any).executeTask.mockRejectedValue(new Error('Agent failure'));

            // Attempt assignment (should fail)
            const assignmentResult = await taskQueue.assignTask(task.id, mockAgent.id);
            expect(assignmentResult).toBe(false);

            // Task should be back in ready state
            const readyTask = taskQueue.getTask(task.id);
            expect(readyTask?.status).toBe('ready');
        });

        it('should handle dependency manager errors', async () => {
            // Mock dependency manager to throw error
            const originalAddDependency = dependencyManager.addDependency;
            dependencyManager.addDependency = jest.fn().mockImplementation(() => {
                throw new Error('Dependency manager error');
            });

            const taskConfig: TaskConfig = {
                title: 'Dependency Error Task',
                description: 'A task for testing dependency error handling',
                priority: 'medium',
                requiredCapabilities: ['general'],
                dependsOn: ['parent-task']
            };

            // Should handle error gracefully
            expect(() => taskQueue.addTask(taskConfig)).not.toThrow();

            // Restore original method
            dependencyManager.addDependency = originalAddDependency;
        });
    });
});
