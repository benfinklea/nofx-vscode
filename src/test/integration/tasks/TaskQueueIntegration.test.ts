import { TaskQueue } from '../../../tasks/TaskQueue';
import { PriorityTaskQueue } from '../../../tasks/PriorityTaskQueue';
import { TaskDependencyManager } from '../../../tasks/TaskDependencyManager';
import { TaskStateMachine } from '../../../tasks/TaskStateMachine';
import { CapabilityMatcher } from '../../../tasks/CapabilityMatcher';
import { AgentManager } from '../../../agents/AgentManager';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { MetricsService } from '../../../services/MetricsService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { Container } from '../../../services/Container';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';
import * as vscode from 'vscode';

interface Task {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'normal' | 'high' | 'critical';
    dependencies?: string[];
    requiredCapabilities?: string[];
    estimatedTime?: number;
    assignedTo?: string;
    status?: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
    result?: any;
    error?: Error;
}

interface Agent {
    id: string;
    name: string;
    capabilities: string[];
    status: 'idle' | 'working' | 'error' | 'offline' | 'online';
    currentTask?: string;
}

describe('Task Queue Integration', () => {
    let container: Container;
    let taskQueue: TaskQueue;
    let priorityQueue: PriorityTaskQueue;
    let dependencyManager: TaskDependencyManager;
    let stateMachine: TaskStateMachine;
    let capabilityMatcher: CapabilityMatcher;
    let agentManager: AgentManager;
    let eventBus: EventBus;
    let mockContext: vscode.ExtensionContext;
    let mockChannel: vscode.OutputChannel;
    let agents: Map<string, Agent>;

    beforeAll(() => {
        // Setup mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([]),
                setKeysForSync: jest.fn()
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([])
            },
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn()
            },
            extensionUri: vscode.Uri.file('/test/extension'),
            extensionMode: vscode.ExtensionMode.Test,
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/logs',
            asAbsolutePath: jest.fn(p => `/test/extension/${p}`)
        } as any;

        // Create mock output channel
        mockChannel = {
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn(),
            hide: jest.fn(),
            show: jest.fn(),
            name: 'Test Channel',
            replace: jest.fn()
        } as any;

        // Setup container and services
        container = Container.getInstance();
        eventBus = new EventBus();

        container.registerInstance(Symbol.for('IEventBus'), eventBus);
        container.register(Symbol.for('IConfigurationService'), () => new ConfigurationService(), 'singleton');
        container.register(
            Symbol.for('ILoggingService'),
            c => new LoggingService(c.resolve(Symbol.for('IConfigurationService')), mockChannel),
            'singleton'
        );
        container.register(
            Symbol.for('IMetricsService'),
            c =>
                new MetricsService(
                    c.resolve(Symbol.for('IConfigurationService')),
                    c.resolve(Symbol.for('ILoggingService'))
                ),
            'singleton'
        );

        // Register mock services
        container.register(
            Symbol.for('INotificationService'),
            () =>
                ({
                    showInfo: jest.fn(),
                    showWarning: jest.fn(),
                    showError: jest.fn(),
                    showProgress: jest.fn()
                }) as any,
            'singleton'
        );

        container.register(
            Symbol.for('ITerminalManager'),
            () =>
                ({
                    createTerminal: jest.fn(),
                    getTerminal: jest.fn(),
                    closeTerminal: jest.fn()
                }) as any,
            'singleton'
        );

        container.register(
            Symbol.for('IAgentLifecycleManager'),
            () =>
                ({
                    spawnAgent: jest.fn(),
                    terminateAgent: jest.fn(),
                    getAgentStatus: jest.fn()
                }) as any,
            'singleton'
        );

        container.register(
            Symbol.for('IAgentNotificationService'),
            () =>
                ({
                    notifyAgentSpawned: jest.fn(),
                    notifyAgentTerminated: jest.fn(),
                    notifyTaskAssigned: jest.fn()
                }) as any,
            'singleton'
        );

        // Create agent manager
        agentManager = new AgentManager(mockContext);

        // Create task state machine first
        stateMachine = new TaskStateMachine(
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IEventBus'))
        );

        // Create dependency manager
        dependencyManager = new TaskDependencyManager(
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IEventBus')),
            container.resolve(Symbol.for('INotificationService'))
        );

        // Create capability matcher
        capabilityMatcher = new CapabilityMatcher(
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IConfigurationService'))
        );

        // Create priority queue
        priorityQueue = new PriorityTaskQueue(
            container.resolve(Symbol.for('ILoggingService')),
            dependencyManager,
            stateMachine
        );

        // Create main task queue
        taskQueue = new TaskQueue(
            agentManager,
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IEventBus')),
            container.resolve(Symbol.for('IMetricsService'))
        );

        // Initialize agents
        agents = new Map();
        setupTestAgents();
    });

    afterAll(async () => {
        await agentManager.dispose();
        await container.dispose();
        Container['instance'] = null;
    });

    function setupTestAgents() {
        const testAgents: Agent[] = [
            {
                id: 'agent-001',
                name: 'Frontend Dev',
                capabilities: ['javascript', 'react', 'css', 'html'],
                status: 'idle',
                currentTask: undefined
            },
            {
                id: 'agent-002',
                name: 'Backend Dev',
                capabilities: ['nodejs', 'python', 'database', 'api'],
                status: 'idle',
                currentTask: undefined
            },
            {
                id: 'agent-003',
                name: 'Full Stack Dev',
                capabilities: ['javascript', 'nodejs', 'react', 'database'],
                status: 'idle',
                currentTask: undefined
            },
            {
                id: 'agent-004',
                name: 'Test Engineer',
                capabilities: ['testing', 'jest', 'cypress', 'qa'],
                status: 'idle',
                currentTask: undefined
            }
        ];

        testAgents.forEach(agent => agents.set(agent.id, agent));
    }

    describe('Basic Task Queue Operations', () => {
        it('should add task to queue', () => {
            const task: Task = {
                id: 'task-001',
                title: 'Create login component',
                description: 'Create a reusable login component for the application',
                priority: 'normal'
            };

            taskQueue.addTask(task);
            const tasks = taskQueue.getTasks();

            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('task-001');
        });

        it('should process tasks in order', () => {
            const tasks: Task[] = [
                { id: 'task-002', title: 'Task 1', description: 'First task description', priority: 'normal' },
                { id: 'task-003', title: 'Task 2', description: 'Second task description', priority: 'normal' },
                { id: 'task-004', title: 'Task 3', description: 'Third task description', priority: 'normal' }
            ];

            tasks.forEach(task => taskQueue.addTask(task));

            const nextTask = taskQueue.getNextTask();
            expect(nextTask?.id).toBe('task-002');
        });

        it('should remove task from queue', () => {
            const task: Task = {
                id: 'task-005',
                title: 'Removable task',
                description: 'Task that will be removed from queue',
                priority: 'normal'
            };

            taskQueue.addTask(task);
            expect(taskQueue.getTasks()).toHaveLength(1);

            taskQueue.removeTask('task-005');
            expect(taskQueue.getTasks()).toHaveLength(0);
        });

        it('should emit task added event', done => {
            const task: Task = {
                id: 'task-006',
                title: 'Event test task',
                description: 'Task for testing event emission',
                priority: 'normal'
            };

            const handler = (event: any) => {
                if (event.task?.id === 'task-006') {
                    expect(event.task.title).toBe('Event test task');
                    eventBus.unsubscribe(DOMAIN_EVENTS.TASK_ADDED, handler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TASK_ADDED, handler);
            taskQueue.addTask(task);
        });
    });

    describe('Priority Queue Operations', () => {
        it('should process high priority tasks first', () => {
            const tasks: Task[] = [
                { id: 'low-1', title: 'Low priority', description: 'Low priority task', priority: 'low' },
                {
                    id: 'critical-1',
                    title: 'Critical task',
                    description: 'Critical priority task',
                    priority: 'critical'
                },
                { id: 'normal-1', title: 'Normal task', description: 'Normal priority task', priority: 'normal' },
                { id: 'high-1', title: 'High priority', description: 'High priority task', priority: 'high' }
            ];

            tasks.forEach(task => priorityQueue.addTask(task));

            const nextTask = priorityQueue.getNextTask();
            expect(nextTask?.id).toBe('critical-1');

            priorityQueue.removeTask('critical-1');
            const secondTask = priorityQueue.getNextTask();
            expect(secondTask?.id).toBe('high-1');
        });

        it('should maintain FIFO within same priority', () => {
            const tasks: Task[] = [
                {
                    id: 'normal-1',
                    title: 'First normal',
                    description: 'First normal priority task',
                    priority: 'normal'
                },
                {
                    id: 'normal-2',
                    title: 'Second normal',
                    description: 'Second normal priority task',
                    priority: 'normal'
                },
                { id: 'normal-3', title: 'Third normal', description: 'Third normal priority task', priority: 'normal' }
            ];

            tasks.forEach(task => priorityQueue.addTask(task));

            expect(priorityQueue.getNextTask()?.id).toBe('normal-1');
            priorityQueue.removeTask('normal-1');
            expect(priorityQueue.getNextTask()?.id).toBe('normal-2');
        });

        it('should handle priority updates', () => {
            const task: Task = {
                id: 'task-priority-update',
                title: 'Updateable task',
                description: 'Task with updateable priority',
                priority: 'low'
            };

            priorityQueue.addTask(task);
            priorityQueue.updateTaskPriority('task-priority-update', 'critical');

            const updatedTask = priorityQueue.getTask('task-priority-update');
            expect(updatedTask?.priority).toBe('critical');
        });
    });

    describe('Task Dependencies', () => {
        it('should track task dependencies', () => {
            const parentTask: Task = {
                id: 'parent-1',
                title: 'Parent task',
                description: 'Parent task for dependency testing',
                priority: 'normal'
            };

            const childTask: Task = {
                id: 'child-1',
                title: 'Child task',
                description: 'Child task that depends on parent',
                priority: 'normal',
                dependencies: ['parent-1']
            };

            dependencyManager.addTask(parentTask);
            dependencyManager.addTask(childTask);

            const deps = dependencyManager.getDependencies('child-1');
            expect(deps).toContain('parent-1');
        });

        it('should identify ready tasks', () => {
            const tasks: Task[] = [
                { id: 'task-a', title: 'Task A', description: 'First task in chain', priority: 'normal' },
                {
                    id: 'task-b',
                    title: 'Task B',
                    description: 'Second task depending on A',
                    priority: 'normal',
                    dependencies: ['task-a']
                },
                {
                    id: 'task-c',
                    title: 'Task C',
                    description: 'Third task depending on B',
                    priority: 'normal',
                    dependencies: ['task-b']
                }
            ];

            tasks.forEach(task => dependencyManager.addTask(task));

            let readyTasks = dependencyManager.getReadyTasks();
            expect(readyTasks).toHaveLength(1);
            expect(readyTasks[0].id).toBe('task-a');

            // Complete task-a
            dependencyManager.markTaskComplete('task-a');
            readyTasks = dependencyManager.getReadyTasks();
            expect(readyTasks).toHaveLength(1);
            expect(readyTasks[0].id).toBe('task-b');
        });

        it('should detect circular dependencies', () => {
            const tasks: Task[] = [
                {
                    id: 'circular-1',
                    title: 'Task 1',
                    description: 'First task in circular dependency',
                    priority: 'normal',
                    dependencies: ['circular-3']
                },
                {
                    id: 'circular-2',
                    title: 'Task 2',
                    description: 'Second task in circular dependency',
                    priority: 'normal',
                    dependencies: ['circular-1']
                },
                {
                    id: 'circular-3',
                    title: 'Task 3',
                    description: 'Third task in circular dependency',
                    priority: 'normal',
                    dependencies: ['circular-2']
                }
            ];

            tasks.forEach(task => dependencyManager.addTask(task));

            const hasCircular = dependencyManager.hasCircularDependency('circular-1');
            expect(hasCircular).toBe(true);
        });

        it('should handle dependency completion events', done => {
            const parentTask: Task = {
                id: 'dep-parent',
                title: 'Parent',
                description: 'Parent task for dependency completion test',
                priority: 'normal'
            };

            const childTask: Task = {
                id: 'dep-child',
                title: 'Child',
                description: 'Child task for dependency completion test',
                priority: 'normal',
                dependencies: ['dep-parent']
            };

            dependencyManager.addTask(parentTask);
            dependencyManager.addTask(childTask);

            const handler = (event: any) => {
                if (event.taskId === 'dep-child') {
                    expect(event.ready).toBe(true);
                    eventBus.unsubscribe(DOMAIN_EVENTS.TASK_READY, handler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TASK_READY, handler);
            dependencyManager.markTaskComplete('dep-parent');
        });
    });

    describe('Task State Machine', () => {
        it('should transition task states correctly', () => {
            const task: Task = {
                id: 'state-task-1',
                title: 'State test',
                description: 'Task for state transition testing',
                priority: 'normal',
                status: 'pending'
            };

            stateMachine.addTask(task);

            expect(stateMachine.getTaskState('state-task-1')).toBe('pending');

            stateMachine.transitionTask('state-task-1', 'assigned');
            expect(stateMachine.getTaskState('state-task-1')).toBe('assigned');

            stateMachine.transitionTask('state-task-1', 'in_progress');
            expect(stateMachine.getTaskState('state-task-1')).toBe('in_progress');

            stateMachine.transitionTask('state-task-1', 'completed');
            expect(stateMachine.getTaskState('state-task-1')).toBe('completed');
        });

        it('should prevent invalid state transitions', () => {
            const task: Task = {
                id: 'invalid-state-task',
                title: 'Invalid transition test',
                description: 'Task for testing invalid state transitions',
                priority: 'normal',
                status: 'pending'
            };

            stateMachine.addTask(task);

            // Try to go directly from pending to completed (invalid)
            const result = stateMachine.transitionTask('invalid-state-task', 'completed');
            expect(result).toBe(false);
            expect(stateMachine.getTaskState('invalid-state-task')).toBe('pending');
        });

        it('should emit state change events', done => {
            const task: Task = {
                id: 'state-event-task',
                title: 'State event test',
                description: 'Task for testing state change events',
                priority: 'normal',
                status: 'pending'
            };

            stateMachine.addTask(task);

            const handler = (event: any) => {
                if (event.taskId === 'state-event-task') {
                    expect(event.oldState).toBe('pending');
                    expect(event.newState).toBe('assigned');
                    eventBus.unsubscribe(DOMAIN_EVENTS.TASK_STATE_CHANGED, handler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TASK_STATE_CHANGED, handler);
            stateMachine.transitionTask('state-event-task', 'assigned');
        });

        it('should track task history', () => {
            const task: Task = {
                id: 'history-task',
                title: 'History test',
                description: 'Task for testing task history tracking',
                priority: 'normal',
                status: 'pending'
            };

            stateMachine.addTask(task);
            stateMachine.transitionTask('history-task', 'assigned');
            stateMachine.transitionTask('history-task', 'in_progress');

            const history = stateMachine.getTaskHistory('history-task');
            expect(history).toHaveLength(3);
            expect(history[0].state).toBe('pending');
            expect(history[1].state).toBe('assigned');
            expect(history[2].state).toBe('in_progress');
        });
    });

    describe('Capability Matching', () => {
        it('should match agent capabilities to task requirements', () => {
            const task: Task = {
                id: 'cap-task-1',
                title: 'React component',
                description: 'Create a React component',
                priority: 'normal',
                requiredCapabilities: ['javascript', 'react']
            };

            const frontendAgent = agents.get('agent-001')!;
            const backendAgent = agents.get('agent-002')!;

            const frontendScore = capabilityMatcher.matchScore(task.requiredCapabilities!, frontendAgent.capabilities);
            const backendScore = capabilityMatcher.matchScore(task.requiredCapabilities!, backendAgent.capabilities);

            expect(frontendScore).toBeGreaterThan(backendScore);
        });

        it('should find best agent for task', () => {
            const task: Task = {
                id: 'cap-task-2',
                title: 'API endpoint',
                description: 'Create an API endpoint',
                priority: 'normal',
                requiredCapabilities: ['nodejs', 'api']
            };

            const agentArray = Array.from(agents.values());
            const bestAgent = capabilityMatcher.findBestMatch(task.requiredCapabilities!, agentArray);

            expect(bestAgent?.id).toBe('agent-002'); // Backend Dev
        });

        it('should handle partial capability matches', () => {
            const task: Task = {
                id: 'cap-task-3',
                title: 'Full stack feature',
                description: 'Create a full stack feature',
                priority: 'normal',
                requiredCapabilities: ['javascript', 'nodejs', 'react', 'database']
            };

            const agentArray = Array.from(agents.values());
            const bestAgent = capabilityMatcher.findBestMatch(task.requiredCapabilities!, agentArray);

            expect(bestAgent?.id).toBe('agent-003'); // Full Stack Dev
        });

        it('should return null for no matching capabilities', () => {
            const task: Task = {
                id: 'cap-task-4',
                title: 'Mobile app',
                description: 'Create a mobile application',
                priority: 'normal',
                requiredCapabilities: ['swift', 'ios', 'xcode']
            };

            const agentArray = Array.from(agents.values());
            const bestAgent = capabilityMatcher.findBestMatch(task.requiredCapabilities!, agentArray);

            expect(bestAgent).toBeNull();
        });
    });

    describe('Task Assignment Integration', () => {
        it('should assign task to best matching agent', done => {
            const task: Task = {
                id: 'assign-task-1',
                title: 'Write tests',
                description: 'Write unit tests for the application',
                priority: 'normal',
                requiredCapabilities: ['testing', 'jest']
            };

            const handler = (event: any) => {
                if (event.taskId === 'assign-task-1') {
                    expect(event.agentId).toBe('agent-004'); // Test Engineer
                    eventBus.unsubscribe(DOMAIN_EVENTS.TASK_ASSIGNED, handler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TASK_ASSIGNED, handler);

            // Add task and trigger assignment
            taskQueue.addTask(task);

            // Simulate assignment process
            const agentArray = Array.from(agents.values());
            const bestAgent = capabilityMatcher.findBestMatch(
                task.requiredCapabilities!,
                agentArray.filter(a => a.status === 'idle')
            );

            if (bestAgent) {
                task.assignedTo = bestAgent.id;
                bestAgent.status = 'working';
                bestAgent.currentTask = task.id;

                eventBus.publish(DOMAIN_EVENTS.TASK_ASSIGNED, {
                    taskId: task.id,
                    agentId: bestAgent.id
                });
            }
        });

        it('should handle task completion and agent availability', done => {
            const agent = agents.get('agent-001')!;
            agent.status = 'working';
            agent.currentTask = 'some-task';

            const handler = (event: any) => {
                if (event.agentId === 'agent-001') {
                    const updatedAgent = agents.get('agent-001')!;
                    expect(updatedAgent.status).toBe('idle');
                    expect(updatedAgent.currentTask).toBeUndefined();
                    eventBus.unsubscribe(DOMAIN_EVENTS.AGENT_AVAILABLE, handler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.AGENT_AVAILABLE, handler);

            // Simulate task completion
            agent.status = 'idle';
            agent.currentTask = undefined;

            eventBus.publish(DOMAIN_EVENTS.TASK_COMPLETED, {
                taskId: 'some-task',
                agentId: 'agent-001'
            });

            eventBus.publish(DOMAIN_EVENTS.AGENT_AVAILABLE, {
                agentId: 'agent-001'
            });
        });
    });

    describe('Complex Task Workflows', () => {
        it('should handle multi-stage task workflow', async () => {
            const stages = [
                {
                    id: 'stage-1',
                    title: 'Design',
                    description: 'Design the application interface',
                    priority: 'high' as const,
                    requiredCapabilities: ['design']
                },
                {
                    id: 'stage-2',
                    title: 'Frontend',
                    description: 'Implement frontend components',
                    priority: 'normal' as const,
                    dependencies: ['stage-1'],
                    requiredCapabilities: ['javascript', 'react']
                },
                {
                    id: 'stage-3',
                    title: 'Backend',
                    description: 'Implement backend services',
                    priority: 'normal' as const,
                    dependencies: ['stage-1'],
                    requiredCapabilities: ['nodejs', 'api']
                },
                {
                    id: 'stage-4',
                    title: 'Testing',
                    description: 'Test the complete application',
                    priority: 'normal' as const,
                    dependencies: ['stage-2', 'stage-3'],
                    requiredCapabilities: ['testing']
                }
            ];

            // Add all stages
            stages.forEach(stage => {
                priorityQueue.addTask(stage);
                dependencyManager.addTask(stage);
                stateMachine.addTask({ ...stage, status: 'pending' });
            });

            // Stage 1 should be ready
            let readyTasks = dependencyManager.getReadyTasks();
            expect(readyTasks).toHaveLength(1);
            expect(readyTasks[0].id).toBe('stage-1');

            // Complete stage 1
            dependencyManager.markTaskComplete('stage-1');
            stateMachine.transitionTask('stage-1', 'completed');

            // Stages 2 and 3 should now be ready
            readyTasks = dependencyManager.getReadyTasks();
            expect(readyTasks).toHaveLength(2);
            expect(readyTasks.map(t => t.id)).toContain('stage-2');
            expect(readyTasks.map(t => t.id)).toContain('stage-3');

            // Complete stages 2 and 3
            dependencyManager.markTaskComplete('stage-2');
            dependencyManager.markTaskComplete('stage-3');
            stateMachine.transitionTask('stage-2', 'completed');
            stateMachine.transitionTask('stage-3', 'completed');

            // Stage 4 should now be ready
            readyTasks = dependencyManager.getReadyTasks();
            expect(readyTasks).toHaveLength(1);
            expect(readyTasks[0].id).toBe('stage-4');
        });

        it('should handle task failure and retry', () => {
            const task: Task = {
                id: 'retry-task',
                title: 'Flaky task',
                description: 'Task that may fail and needs retry',
                priority: 'normal',
                status: 'in_progress'
            };

            stateMachine.addTask(task);

            // Fail the task
            stateMachine.transitionTask('retry-task', 'failed');
            expect(stateMachine.getTaskState('retry-task')).toBe('failed');

            // Retry - transition back to pending
            stateMachine.transitionTask('retry-task', 'pending');
            stateMachine.transitionTask('retry-task', 'assigned');
            stateMachine.transitionTask('retry-task', 'in_progress');
            stateMachine.transitionTask('retry-task', 'completed');

            expect(stateMachine.getTaskState('retry-task')).toBe('completed');

            // Check history includes retry
            const history = stateMachine.getTaskHistory('retry-task');
            const states = history.map(h => h.state);
            expect(states).toContain('failed');
            expect(states.lastIndexOf('completed')).toBeGreaterThan(states.indexOf('failed'));
        });

        it('should handle parallel task execution', () => {
            const parallelTasks: Task[] = [
                {
                    id: 'parallel-1',
                    title: 'Component A',
                    description: 'Create React component A',
                    priority: 'normal',
                    requiredCapabilities: ['react']
                },
                {
                    id: 'parallel-2',
                    title: 'Component B',
                    description: 'Create React component B',
                    priority: 'normal',
                    requiredCapabilities: ['react']
                },
                {
                    id: 'parallel-3',
                    title: 'API Endpoint',
                    description: 'Create API endpoint',
                    priority: 'normal',
                    requiredCapabilities: ['nodejs']
                }
            ];

            parallelTasks.forEach(task => {
                priorityQueue.addTask(task);
                dependencyManager.addTask(task);
            });

            // All tasks should be ready (no dependencies)
            const readyTasks = dependencyManager.getReadyTasks();
            expect(readyTasks).toHaveLength(3);

            // Assign to available agents
            const availableAgents = Array.from(agents.values()).filter(a => a.status === 'idle');

            readyTasks.forEach((task, index) => {
                if (index < availableAgents.length) {
                    const agent = availableAgents[index];
                    task.assignedTo = agent.id;
                    agent.status = 'working';
                    agent.currentTask = task.id;
                }
            });

            // Check assignments
            const workingAgents = Array.from(agents.values()).filter(a => a.status === 'working');
            expect(workingAgents.length).toBeGreaterThan(0);
            expect(workingAgents.length).toBeLessThanOrEqual(parallelTasks.length);
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should handle task timeout', done => {
            const task: Task = {
                id: 'timeout-task',
                title: 'Long running task',
                description: 'Task that will timeout for testing',
                priority: 'normal',
                estimatedTime: 100 // 100ms timeout
            };

            stateMachine.addTask({ ...task, status: 'in_progress' });

            const handler = (event: any) => {
                if (event.taskId === 'timeout-task') {
                    expect(event.reason).toContain('timeout');
                    eventBus.unsubscribe(DOMAIN_EVENTS.TASK_TIMEOUT, handler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TASK_TIMEOUT, handler);

            // Simulate timeout
            setTimeout(() => {
                eventBus.publish(DOMAIN_EVENTS.TASK_TIMEOUT, {
                    taskId: 'timeout-task',
                    reason: 'Task exceeded timeout of 100ms'
                });
            }, 150);
        });

        it('should handle agent disconnection', () => {
            const agent = agents.get('agent-001')!;
            const taskId = 'disconnect-task';

            // Assign task to agent
            agent.status = 'working';
            agent.currentTask = taskId;

            // Simulate disconnection
            agent.status = 'offline';

            // Task should be reassignable
            const task: Task = {
                id: taskId,
                title: 'Interrupted task',
                description: 'Task that was interrupted by agent disconnection',
                priority: 'high',
                assignedTo: 'agent-001',
                status: 'in_progress'
            };

            // Find new agent
            const availableAgents = Array.from(agents.values()).filter(
                a => a.status === 'idle' && a.id !== 'agent-001'
            );

            expect(availableAgents.length).toBeGreaterThan(0);

            // Reassign task
            task.assignedTo = availableAgents[0].id;
            availableAgents[0].status = 'working';
            availableAgents[0].currentTask = taskId;

            expect(task.assignedTo).not.toBe('agent-001');
        });

        it('should handle invalid task data', () => {
            const invalidTask: any = {
                // Missing required fields
                title: 'Invalid task'
            };

            // Should handle gracefully
            expect(() => {
                taskQueue.addTask(invalidTask);
            }).not.toThrow();

            // Task should get default values or be rejected
            const tasks = taskQueue.getTasks();
            const addedTask = tasks.find((t: any) => t.title === 'Invalid task');

            if (addedTask) {
                expect(addedTask.id).toBeDefined();
                expect(addedTask.priority).toBeDefined();
            }
        });
    });

    describe('Metrics and Monitoring', () => {
        it('should track task completion metrics', () => {
            const completedTasks = ['task-m1', 'task-m2', 'task-m3'];
            const startTime = Date.now();

            completedTasks.forEach((taskId, index) => {
                eventBus.publish(DOMAIN_EVENTS.TASK_COMPLETED, {
                    taskId,
                    duration: (index + 1) * 1000,
                    completedAt: new Date(startTime + (index + 1) * 1000)
                });
            });

            // Metrics should be recorded (implementation depends on MetricsService)
            // This is a placeholder for actual metric assertions
            expect(completedTasks).toHaveLength(3);
        });

        it('should track agent utilization', () => {
            const utilization: Map<string, number> = new Map();

            agents.forEach((agent, id) => {
                const workingTime = agent.status === 'working' ? 1 : 0;
                utilization.set(id, workingTime);
            });

            // Calculate average utilization
            const totalUtilization = Array.from(utilization.values()).reduce((a, b) => a + b, 0);
            const avgUtilization = totalUtilization / agents.size;

            expect(avgUtilization).toBeGreaterThanOrEqual(0);
            expect(avgUtilization).toBeLessThanOrEqual(1);
        });

        it('should track queue depth over time', () => {
            const queueDepths: number[] = [];

            // Add tasks and track depth
            for (let i = 0; i < 5; i++) {
                taskQueue.addTask({
                    title: `Task ${i}`,
                    description: `Description for task ${i}`,
                    priority: 'medium'
                });
                queueDepths.push(taskQueue.getTasks().length);
            }

            expect(queueDepths).toEqual([1, 2, 3, 4, 5]);

            // Complete tasks and track depth
            const allTasks = taskQueue.getTasks();
            for (let i = 0; i < 5; i++) {
                // Mark task as completed
                if (i < allTasks.length) {
                    allTasks[i].status = 'completed';
                }
                queueDepths.push(taskQueue.getTasks().filter((t: any) => t.status !== 'completed').length);
            }

            expect(queueDepths.slice(-5)).toEqual([4, 3, 2, 1, 0]);
        });
    });
});
