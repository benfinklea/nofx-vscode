import * as vscode from 'vscode';
import { ITaskManager, Task as ITask, TaskConfig as ITaskConfig } from '../interfaces/ITask';
import { Task, TaskConfig, TaskStatus, TaskValidationError } from '../agents/types';
import { AgentManager } from '../agents/AgentManager';
import {
    ILogger,
    IEventEmitter,
    IEventSubscriber,
    IErrorHandler,
    INotificationService,
    ITaskReader,
    IConfiguration,
    ITaskStateMachine,
    IPriorityTaskQueue,
    ICapabilityMatcher,
    ITaskDependencyManager
} from '../services/interfaces';
import { EVENTS } from '../services/EventConstants';
import { LoadBalancingStrategy, AgentCapacityScore, TaskReassignmentReason } from '../intelligence';

// Utility function to safely publish events
function safePublish(eventBus: any, logger: any, event: string, data: any) {
    try {
        eventBus?.publish(event, data);
    } catch (error) {
        logger?.warn(`Failed to publish event ${event}`, { error });
    }
}
import { priorityToNumeric } from './priority';
import { getAppStateStore } from '../state/AppStateStore';
import * as selectors from '../state/selectors';
import * as actions from '../state/actions';
/**
 * TaskQueue manages task lifecycle and assignment.
 *
 * Queue Behavior:
 * - Tasks in 'ready' and 'validated' states are queued in the priority queue
 * - 'validated' tasks are queued to provide visibility and proper ordering
 * - When 'validated' tasks transition to 'ready', they are re-enqueued to maintain priority order
 * - The assignNextTask() method prefers 'ready' tasks over 'validated' tasks to avoid churn
 */
export class TaskQueue implements ITaskManager, ITaskReader {
    // Helper to adapt between subscribe and on
    private subscribeToEvent(event: string, handler: (data?: any) => void): any {
        if (this.eventBus && 'subscribe' in this.eventBus) {
            return (this.eventBus as any).subscribe(event, handler);
        } else if (this.eventBus && 'on' in this.eventBus) {
            this.eventBus.on(event, handler);
            return { dispose: () => this.eventBus?.off?.(event, handler) };
        }
        return { dispose: () => {} };
    }

    // Helper to publish events
    private publishEvent(event: string, data?: any): void {
        if (this.eventBus && 'publish' in this.eventBus) {
            (this.eventBus as any).publish(event, data);
        } else if (this.eventBus && 'emit' in this.eventBus) {
            this.eventBus.emit(event, data);
        }
    }

    private tasks: Map<string, Task> = new Map();
    private agentManager: AgentManager;
    private _onTaskUpdate = new vscode.EventEmitter<void>();
    public readonly onTaskUpdate = this._onTaskUpdate.event;
    private loggingService?: ILogger;
    private eventBus?: IEventEmitter & IEventSubscriber;
    private errorHandler?: IErrorHandler;
    private notificationService?: INotificationService;
    private configService?: IConfiguration;
    private taskStateMachine?: ITaskStateMachine;
    private priorityQueue?: IPriorityTaskQueue;
    private capabilityMatcher?: ICapabilityMatcher;
    private dependencyManager?: ITaskDependencyManager;
    private subscriptions: vscode.Disposable[] = [];

    // Load balancing integration
    private loadBalancingStrategy: LoadBalancingStrategy = LoadBalancingStrategy.BALANCED;
    private loadBalancingEnabled: boolean = true;
    private reassignmentsThisCycle: number = 0;
    private maxReassignmentsPerCycle: number = 10; // Configurable rate limit

    constructor(
        agentManager: AgentManager,
        loggingService?: ILogger,
        eventBus?: IEventEmitter & IEventSubscriber,
        errorHandler?: IErrorHandler,
        notificationService?: INotificationService,
        configService?: IConfiguration,
        taskStateMachine?: ITaskStateMachine,
        priorityQueue?: IPriorityTaskQueue,
        capabilityMatcher?: ICapabilityMatcher,
        dependencyManager?: ITaskDependencyManager
    ) {
        this.agentManager = agentManager;
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.notificationService = notificationService;
        this.configService = configService;
        this.taskStateMachine = taskStateMachine;
        this.priorityQueue = priorityQueue;

        // If we have both priorityQueue and taskStateMachine, inject the state machine
        if (this.priorityQueue && this.taskStateMachine && 'taskStateMachine' in this.priorityQueue) {
            (this.priorityQueue as any).taskStateMachine = this.taskStateMachine;
        }
        this.capabilityMatcher = capabilityMatcher;
        this.dependencyManager = dependencyManager;

        // Set TaskQueue as the task reader for TaskStateMachine dependency validation
        if (this.taskStateMachine && 'setTaskReader' in this.taskStateMachine) {
            (this.taskStateMachine as any).setTaskReader(this);
        }

        // Auto-assign tasks when agents become available
        this.agentManager.onAgentUpdate(() => {
            this.tryAssignTasks();
        });

        // Initialize load balancing configuration
        this.initializeLoadBalancingConfig();

        // Subscribe to configuration changes
        if (this.configService) {
            this.subscriptions.push(
                this.configService.onDidChange((e: vscode.ConfigurationChangeEvent) => {
                    if (e.affectsConfiguration('nofx.loadBalancing')) {
                        this.initializeLoadBalancingConfig();
                    }
                })
            );
        }

        // Subscribe to agent events from EventBus
        if (this.eventBus) {
            this.subscriptions.push(
                this.subscribeToEvent(EVENTS.AGENT_CREATED, () => {
                    this.tryAssignTasks();
                })
            );
            this.subscriptions.push(
                this.subscribeToEvent(EVENTS.AGENT_STATUS_CHANGED, data => {
                    if (data.status === 'idle') {
                        this.tryAssignTasks();
                    }
                })
            );
            this.subscriptions.push(
                this.subscribeToEvent(EVENTS.TASK_STATE_CHANGED, ({ taskId, newState }) => {
                    if (!this.priorityQueue) return;
                    const removeStates = ['blocked', 'assigned', 'in-progress', 'completed', 'failed'];
                    if (removeStates.includes(newState) && this.priorityQueue.contains(taskId)) {
                        this.priorityQueue.remove(taskId);
                    }
                    if (newState === 'ready') {
                        const t = this.getTask(taskId);
                        if (t) {
                            // Use the moveToReady helper method to cleanly migrate tasks
                            this.priorityQueue.moveToReady(t);
                        }
                    }
                })
            );
            this.subscriptions.push(
                this.subscribeToEvent(EVENTS.TASK_CONFLICT_RESOLVED, ({ taskId }) => {
                    const t = this.getTask(taskId);
                    if (t && t.status === 'blocked' && (!t.conflictsWith || t.conflictsWith.length === 0)) {
                        this.taskStateMachine?.transition(t, 'ready');
                        this.priorityQueue?.moveToReady(t);
                        this.tryAssignTasks();
                    }
                })
            );
            this.subscriptions.push(
                this.subscribeToEvent(EVENTS.TASK_CREATED, ({ taskId }) => {
                    // Check if any blocked tasks are waiting for this newly created task
                    if (this.dependencyManager) {
                        const allTasks = this.getTasks();
                        const blockedTasks = allTasks.filter(task => task.status === 'blocked');

                        for (const blockedTask of blockedTasks) {
                            // Re-validate dependencies for blocked tasks
                            const depErrors = this.dependencyManager.validateDependencies(blockedTask, allTasks);
                            if (depErrors.length === 0) {
                                // No more dependency errors, try to transition to ready
                                if (this.taskStateMachine) {
                                    const transitionErrors = this.taskStateMachine.transition(blockedTask, 'ready');
                                    if (transitionErrors.length === 0 && this.priorityQueue) {
                                        this.priorityQueue.moveToReady(blockedTask);
                                        this.tryAssignTasks();
                                    }
                                }
                            }
                        }
                    }
                })
            );
        }
    }

    // Alias for ITaskManager interface compatibility
    createTask(task: ITaskConfig): ITask {
        const result = this.addTask(task as TaskConfig);
        // Map to interface-compatible type
        return {
            id: result.id,
            title: result.title,
            description: result.description,
            status: result.status === 'completed' ? 'complete' : (result.status as any),
            priority: result.priority,
            assignedTo: result.assignedTo,
            createdAt: result.createdAt
        } as ITask;
    }

    addTask(config: TaskConfig): Task {
        const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        this.loggingService?.debug(`Creating task ${taskId}`);
        this.loggingService?.debug('Config:', config);

        const task: Task = {
            id: taskId,
            title: config.title,
            description: config.description,
            priority: config.priority || 'medium',
            numericPriority: priorityToNumeric(config.priority || 'medium'),
            status: 'queued',
            files: config.files || [],
            createdAt: new Date(),
            dependsOn: config.dependsOn || [],
            prefers: config.prefers || [],
            blockedBy: [],
            tags: config.tags || [],
            estimatedDuration: config.estimatedDuration,
            requiredCapabilities: config.requiredCapabilities || [],
            conflictsWith: []
        };

        // Validate task configuration
        const validationErrors = this.validateTask(config);
        if (validationErrors.length > 0) {
            this.loggingService?.error('Task validation failed:', validationErrors);
            throw new Error(`Task validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
        }

        this.tasks.set(taskId, task);
        this.loggingService?.debug(`Task added to map. Total tasks: ${this.tasks.size}`);

        // Add dependencies to dependency manager and validate existence
        if (this.dependencyManager) {
            // Validate dependency existence
            const depErrors = this.dependencyManager.validateDependencies(task, this.getTasks());
            if (depErrors.length > 0) {
                this.loggingService?.warn(`Task ${taskId} has dependency validation errors:`, depErrors);
                // Keep task in validated/blocked state with blockedBy = task.dependsOn
                task.blockedBy = task.dependsOn;
                if (depErrors.some(e => e.code === 'MISSING_DEPENDENCY' || e.code === 'CIRCULAR_DEPENDENCY')) {
                    // First transition to validated, then to blocked
                    if (this.taskStateMachine) {
                        const validationErrors = this.taskStateMachine.transition(task, 'validated');
                        if (validationErrors.length > 0) {
                            this.loggingService?.error('State transition to validated failed:', validationErrors);
                            throw new Error(
                                `State transition failed: ${validationErrors.map(e => e.message).join(', ')}`
                            );
                        }

                        const blockedErrors = this.taskStateMachine.transition(task, 'blocked');
                        if (blockedErrors.length > 0) {
                            this.loggingService?.error('State transition to blocked failed:', blockedErrors);
                            throw new Error(`State transition failed: ${blockedErrors.map(e => e.message).join(', ')}`);
                        }
                    } else {
                        task.status = 'blocked';
                    }
                    // Do not enqueue blocked tasks
                    this.loggingService?.info(
                        `Task ${taskId} blocked due to dependency errors - returning early without further transitions`
                    );

                    // Publish task.created event before early return
                    if (this.eventBus) {
                        safePublish(this.eventBus, this.loggingService, EVENTS.TASK_CREATED, { taskId, task });
                    }

                    this._onTaskUpdate.fire();
                    return task;
                }
            } else {
                // Add hard dependencies if validation passes
                if (task.dependsOn && task.dependsOn.length > 0) {
                    for (const depId of task.dependsOn) {
                        this.dependencyManager.addDependency(task.id, depId);
                    }
                }
                // Add soft dependencies if validation passes
                if (task.prefers && task.prefers.length > 0) {
                    for (const prefId of task.prefers) {
                        this.dependencyManager.addSoftDependency(task.id, prefId);
                    }
                }
            }
        }

        // Use state machine to transition through states
        if (this.taskStateMachine) {
            // Transition to validated
            const validationErrors = this.taskStateMachine.transition(task, 'validated');
            if (validationErrors.length > 0) {
                this.loggingService?.error('State transition failed:', validationErrors);
                throw new Error(`State transition failed: ${validationErrors.map(e => e.message).join(', ')}`);
            }

            // Check for conflicts before attempting to transition to ready
            if (this.dependencyManager) {
                const activeOrAssignedTasks = this.getActiveOrAssignedTasks();
                const conflicts = this.dependencyManager.checkConflicts(task, activeOrAssignedTasks);
                if (conflicts.length > 0) {
                    // Set conflictsWith and blockedBy fields before transitioning
                    task.conflictsWith = conflicts;
                    task.blockedBy = conflicts;
                    this.taskStateMachine.transition(task, 'blocked');
                    this.loggingService?.warn('Task blocked due to conflicts:', conflicts);
                } else {
                    // Let state machine handle readiness validation (including dependency completion)
                    const readinessErrors = this.taskStateMachine.transition(task, 'ready');
                    if (readinessErrors.length > 0) {
                        this.loggingService?.warn('Task readiness transition failed:', readinessErrors);
                        // Set blockedBy to dependencies for UI visibility
                        task.blockedBy = task.dependsOn || [];
                        // If task has unsatisfied dependencies, transition to blocked
                        if (readinessErrors.some(e => e.code === 'DEPENDENCIES_NOT_SATISFIED')) {
                            this.taskStateMachine.transition(task, 'blocked');
                        }
                        // Publish waiting event for observability
                        safePublish(this.eventBus, this.loggingService, EVENTS.TASK_WAITING, {
                            taskId: task.id,
                            task,
                            reasons: readinessErrors
                        });
                    }
                }
            } else {
                // Let state machine handle readiness validation
                const readinessErrors = this.taskStateMachine.transition(task, 'ready');
                if (readinessErrors.length > 0) {
                    this.loggingService?.warn('Task readiness transition failed:', readinessErrors);
                    // Set blockedBy to dependencies for UI visibility
                    task.blockedBy = task.dependsOn || [];
                    // If task has unsatisfied dependencies, transition to blocked
                    if (readinessErrors.some(e => e.code === 'DEPENDENCIES_NOT_SATISFIED')) {
                        this.taskStateMachine.transition(task, 'blocked');
                    }
                    // Publish waiting event for observability
                    this.publishEvent(EVENTS.TASK_WAITING, {
                        taskId: task.id,
                        task,
                        reasons: readinessErrors
                    });
                }
            }
        }

        // Add to priority queue if ready or validated
        if ((task.status === 'ready' || task.status === 'validated') && this.priorityQueue) {
            this.priorityQueue.enqueue(task);
            this.loggingService?.debug(`Task added to priority queue with status: ${task.status}`);

            // Recompute priority to account for soft dependencies
            this.recomputeTaskPriorityWithSoftDeps(task);
        }

        this._onTaskUpdate.fire();

        // Publish task.created event (not handled by state machine)
        if (this.eventBus) {
            this.publishEvent(EVENTS.TASK_CREATED, { taskId, task });
        }
        // Note: task.ready and task.blocked events are already published by TaskStateMachine.transition()

        // Try to assign immediately
        this.loggingService?.debug('Attempting immediate assignment...');
        this.tryAssignTasks();

        return task;
    }

    assignNextTask(): boolean {
        if (!this.priorityQueue || this.priorityQueue.isEmpty()) {
            this.loggingService?.debug('No tasks in priority queue');
            return false;
        }

        const availableAgents = this.agentManager.getAvailableAgents();
        this.loggingService?.debug(`Available agents: ${availableAgents.length}`);

        if (availableAgents.length === 0) {
            return false;
        }

        // Only attempt assignment for READY tasks to avoid invalid transitions
        const task = this.priorityQueue.dequeueReady();
        if (!task) {
            this.loggingService?.debug('No READY tasks available for assignment');
            return false;
        }

        this.loggingService?.info(`Assigning task: ${task.title}`);

        // Recheck for conflicts immediately before assignment
        if (this.dependencyManager) {
            const activeOrAssignedTasks = this.getActiveOrAssignedTasks();
            const conflicts = this.dependencyManager.checkConflicts(task, activeOrAssignedTasks);
            if (conflicts.length > 0) {
                this.loggingService?.warn(`Task ${task.id} has conflicts detected before assignment:`, conflicts);
                task.conflictsWith = conflicts;
                task.blockedBy = conflicts;
                if (this.taskStateMachine) {
                    this.taskStateMachine.transition(task, 'blocked');
                } else {
                    task.status = 'blocked';
                }
                return false;
            }
        }

        // Compute match scores for UI transparency
        if (this.capabilityMatcher) {
            const scoredAgents = this.capabilityMatcher.rankAgents(availableAgents, task);
            if (scoredAgents.length > 0) {
                task.agentMatchScore = scoredAgents[0].score;
                // Publish match score event for UI
                this.publishEvent(EVENTS.TASK_MATCH_SCORE, {
                    taskId: task.id,
                    score: scoredAgents[0].score
                });
            }
        }

        // Find best agent using capability matcher with load balancing consideration
        const agent = this.findBestAgent(availableAgents, task);

        if (agent) {
            // Set assignedTo and assignedAt before transition to ensure required fields validate
            task.assignedTo = agent.id;
            task.assignedAt = new Date();

            // Use state machine to transition to assigned
            if (this.taskStateMachine) {
                const transitionErrors = this.taskStateMachine.transition(task, 'assigned');
                if (transitionErrors.length > 0) {
                    this.loggingService?.error('State transition failed:', transitionErrors);
                    task.assignedTo = undefined; // clear stale assignee
                    this.priorityQueue.enqueue(task);
                    return false;
                }
            } else {
                task.status = 'assigned';
            }
            this._onTaskUpdate.fire();

            // Publish TASK_ASSIGNED event
            if (this.eventBus) {
                this.publishEvent(EVENTS.TASK_ASSIGNED, { taskId: task.id, agentId: agent.id, task });
            }

            this.loggingService?.info(`Executing task on agent: ${agent.name}`);

            // Execute task on agent
            try {
                this.loggingService?.debug(`About to execute task on agent ${agent.id}`);
                this.agentManager.executeTask(agent.id, task);

                // Transition to in-progress
                if (this.taskStateMachine) {
                    this.taskStateMachine.transition(task, 'in-progress');
                } else {
                    task.status = 'in-progress';
                }

                // Show detailed notification
                this.notificationService
                    ?.showInformation(
                        `📋 Task "${task.title}" assigned to ${agent.template?.icon || '🤖'} ${agent.name}`,
                        'View Terminal'
                    )
                    .then(selection => {
                        if (selection === 'View Terminal') {
                            const terminal = this.agentManager.getAgentTerminal(agent.id);
                            if (terminal) {
                                terminal.show();
                            }
                        }
                    });

                this.loggingService?.info('Task successfully assigned and executing');

                // Clear transient match score after assignment
                delete task.agentMatchScore;

                return true;
            } catch (error: any) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.errorHandler?.handleError(err, 'assignNextTask');

                // Put task back in queue and revert status
                this.priorityQueue.enqueue(task);
                if (this.taskStateMachine) {
                    this.taskStateMachine.transition(task, 'ready');
                } else {
                    task.status = 'ready';
                    task.assignedTo = undefined; // Clear assignee when manually setting to ready
                }
                // Clear transient match score
                delete task.agentMatchScore;
                return false;
            }
        }

        // Put task back in queue if no suitable agent
        this.priorityQueue.enqueue(task);
        // Clear transient match score
        delete task.agentMatchScore;
        return false;
    }

    private tryAssignTasks() {
        const autoAssign = this.configService?.isAutoAssignTasks() ?? true;

        this.loggingService?.debug(`Auto-assign: ${autoAssign}`);

        if (!autoAssign) {
            this.loggingService?.debug('Auto-assign disabled');
            this.notificationService?.showInformation('📋 Task added. Auto-assign is disabled - assign manually.');
            return;
        }

        let assigned = false;
        let attempts = 0;

        // Recompute queue size and idle agents per iteration
        while (attempts < 10) {
            const availableAgents = this.agentManager.getAvailableAgents();
            const queueSize = this.priorityQueue?.size() || 0;

            this.loggingService?.debug(
                `Assignment attempt ${attempts + 1}: Queue: ${queueSize}, Available agents: ${availableAgents.length}`
            );

            if (queueSize === 0 || availableAgents.length === 0) {
                break;
            }

            const result = this.assignNextTask();
            this.loggingService?.debug(`Assignment result: ${result}`);
            if (result) {
                assigned = true;
            } else {
                break; // Stop if assignment failed
            }
            attempts++;
        }

        if (!assigned) {
            const availableCount = this.agentManager.getAvailableAgents().length;
            const queueSize = this.priorityQueue?.size() || 0;
            this.loggingService?.debug(`No assignment made. Queue: ${queueSize}, Available: ${availableCount}`);
            
            // Only show notifications if there are actually tasks to assign
            if (queueSize > 0) {
                if (availableCount === 0) {
                    this.notificationService?.showInformation('📋 Task queued. All agents are busy.');
                } else {
                    this.notificationService?.showWarning('📋 Task added but not assigned. Check agent status.');
                }
            }
        }
    }

    completeTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found`);
            return false;
        }

        // Use state machine to transition to completed
        if (this.taskStateMachine) {
            const transitionErrors = this.taskStateMachine.transition(task, 'completed');
            if (transitionErrors.length > 0) {
                this.loggingService?.error('State transition failed:', transitionErrors);
                return false;
            }
        } else {
            task.status = 'completed';
            task.completedAt = new Date();
        }

        this._onTaskUpdate.fire();

        // Check for dependent tasks that become ready
        if (this.dependencyManager) {
            const allTasksForDeps = this.getTasks();
            const readyTasks = this.dependencyManager.getReadyTasks(allTasksForDeps);

            // Transition and enqueue newly ready tasks
            for (const readyTask of readyTasks) {
                if (readyTask.id !== taskId && readyTask.status !== 'ready' && this.priorityQueue) {
                    // Check for conflicts before transitioning to ready
                    const activeOrAssignedTasks = this.getActiveOrAssignedTasks();
                    const conflicts = this.dependencyManager.checkConflicts(readyTask, activeOrAssignedTasks);

                    if (conflicts.length > 0) {
                        // Set conflictsWith and transition to blocked
                        readyTask.conflictsWith = conflicts;
                        readyTask.blockedBy = conflicts;
                        if (this.taskStateMachine) {
                            this.taskStateMachine.transition(readyTask, 'blocked');
                        } else {
                            readyTask.status = 'blocked';
                        }
                        this.loggingService?.warn(`Task ${readyTask.id} blocked due to conflicts:`, conflicts);
                    } else {
                        // Clear conflictsWith and blockedBy when task becomes ready
                        readyTask.conflictsWith = [];
                        readyTask.blockedBy = []; // Clear all blockedBy entries when dependencies are satisfied

                        // Transition to ready state
                        if (this.taskStateMachine) {
                            const transitionErrors = this.taskStateMachine.transition(readyTask, 'ready');
                            if (transitionErrors.length === 0) {
                                // Use moveToReady helper to cleanly migrate tasks
                                this.priorityQueue.moveToReady(readyTask);
                                this.loggingService?.info(
                                    `Task ${readyTask.id} is now ready due to completion of ${taskId}`
                                );
                            }
                        }
                    }
                }
            }

            // Check for tasks with soft dependencies on the completed task
            const allTasks = this.getTasks();
            const softDependents = this.dependencyManager.getSoftDependents(taskId, allTasks);
            for (const softDepTaskId of softDependents) {
                const softDepTask = this.tasks.get(softDepTaskId);
                if (softDepTask && this.priorityQueue && this.priorityQueue.contains(softDepTaskId)) {
                    // Recompute priority for tasks that prefer this completed task
                    this.recomputeTaskPriorityWithSoftDeps(softDepTask);
                    this.loggingService?.debug(
                        `Recomputed priority for soft dependent task ${softDepTaskId} after completion of ${taskId}`
                    );
                }
            }
        }

        // Note: task.completed event is already published by TaskStateMachine.transition()

        this.loggingService?.info(`Task completed: ${task.title}`);
        this.notificationService?.showInformation(`✅ Task completed: ${task.title}`);

        // Try to assign more tasks
        this.tryAssignTasks();

        return true;
    }

    failTask(taskId: string, reason?: string) {
        const task = this.tasks.get(taskId);
        if (!task) return;

        // Use state machine to transition to failed
        if (this.taskStateMachine) {
            const transitionErrors = this.taskStateMachine.transition(task, 'failed');
            if (transitionErrors.length > 0) {
                this.loggingService?.error('State transition failed:', transitionErrors);
                return;
            }
        } else {
            task.status = 'failed';
        }

        this._onTaskUpdate.fire();

        // Note: task.failed event is already published by TaskStateMachine.transition()

        this.loggingService?.error(`Task failed: ${task.title}${reason ? ` - ${reason}` : ''}`);
        this.notificationService?.showError(`❌ Task failed: ${task.title}${reason ? ` - ${reason}` : ''}`);

        // Try to assign more tasks
        this.tryAssignTasks();
    }

    getTasks(): Task[] {
        return Array.from(this.tasks.values());
    }

    getTask(taskId: string): Task | undefined {
        return this.tasks.get(taskId);
    }

    getAllTasks(): Task[] {
        return Array.from(this.tasks.values());
    }

    getPendingTasks(): Task[] {
        return Array.from(this.tasks.values()).filter(t => t.status === 'queued');
    }

    getActiveTasks(): Task[] {
        return Array.from(this.tasks.values()).filter(t => t.status === 'in-progress');
    }

    /**
     * Gets tasks that are either active (in-progress) or assigned
     */
    getActiveOrAssignedTasks(): Task[] {
        return Array.from(this.tasks.values()).filter(t => t.status === 'in-progress' || t.status === 'assigned');
    }

    getQueuedTasks(): Task[] {
        return this.priorityQueue ? this.priorityQueue.toArray() : [];
    }

    getTasksForAgent(agentId: string): Task[] {
        return Array.from(this.tasks.values()).filter(task => task.assignedTo === agentId);
    }

    clearCompleted() {
        const completed = Array.from(this.tasks.values()).filter(task => task.status === 'completed');

        completed.forEach(task => {
            this.tasks.delete(task.id);
        });

        this._onTaskUpdate.fire();
    }

    async assignTask(taskId: string, agentId: string): Promise<boolean> {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found`);
            return false;
        }

        // Guard against assigning non-ready tasks
        if (task.status !== 'ready') {
            this.loggingService?.warn(
                `Cannot assign task ${taskId} with status '${task.status}' - only 'ready' tasks can be assigned`
            );
            return false;
        }

        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            this.loggingService?.warn(`Agent ${agentId} not found`);
            return false;
        }

        // Remove from priority queue if present
        if (this.priorityQueue) {
            this.priorityQueue.remove(taskId);
        }

        // Set assignedTo and assignedAt and use state machine to transition to assigned
        task.assignedTo = agentId;
        task.assignedAt = new Date();
        if (this.taskStateMachine) {
            const transitionErrors = this.taskStateMachine.transition(task, 'assigned');
            if (transitionErrors.length > 0) {
                this.loggingService?.error('State transition failed:', transitionErrors);
                // Reset assignedTo and re-queue task on failure
                task.assignedTo = undefined;
                if (this.priorityQueue) {
                    this.priorityQueue.enqueue(task);
                }
                return false;
            }
        } else {
            task.status = 'assigned';
        }

        this._onTaskUpdate.fire();

        // Publish TASK_ASSIGNED event
        if (this.eventBus) {
            this.publishEvent(EVENTS.TASK_ASSIGNED, { taskId: task.id, agentId: agentId, task });
        }

        this.loggingService?.info(`Executing task ${taskId} on agent ${agentId}`);

        try {
            await this.agentManager.executeTask(agentId, task);

            // Transition to in-progress
            if (this.taskStateMachine) {
                this.taskStateMachine.transition(task, 'in-progress');
            } else {
                task.status = 'in-progress';
            }

            // Show notification
            this.notificationService
                ?.showInformation(
                    `📋 Task "${task.title}" assigned to ${agent.template?.icon || '🤖'} ${agent.name}`,
                    'View Terminal'
                )
                .then(selection => {
                    if (selection === 'View Terminal') {
                        const terminal = this.agentManager.getAgentTerminal(agentId);
                        if (terminal) {
                            terminal.show();
                        }
                    }
                });

            // Update agent load to keep both sides consistent
            const newLoad = this.getAgentCurrentLoad(agentId);
            const maxCapacity = this.getAgentMaxCapacity(agentId);
            this.agentManager.updateAgentLoad(agentId, newLoad, maxCapacity);

            return true;
        } catch (error: any) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'assignTask');

            // Revert via state machine on failure - assigned can only go to failed, then to ready
            if (this.taskStateMachine) {
                // First transition to failed
                const failedErrors = this.taskStateMachine.transition(task, 'failed');
                if (failedErrors.length === 0) {
                    // Then transition to ready (allowed from failed state)
                    const readyErrors = this.taskStateMachine.transition(task, 'ready');
                    if (readyErrors.length === 0 && this.priorityQueue) {
                        // Use moveToReady helper to cleanly migrate tasks
                        this.priorityQueue.moveToReady(task);
                    }
                }
            } else {
                task.status = 'ready';
                task.assignedTo = undefined; // Clear assignee when manually setting to ready
                if (this.priorityQueue) {
                    // Use moveToReady helper to cleanly migrate tasks
                    this.priorityQueue.moveToReady(task);
                }
            }
            this._onTaskUpdate.fire();
            return false;
        }
    }

    clearAllTasks(): void {
        this.tasks.clear();
        if (this.priorityQueue) {
            // Clear priority queue by removing all tasks
            while (!this.priorityQueue.isEmpty()) {
                this.priorityQueue.dequeue();
            }
        }
        this._onTaskUpdate.fire();
        this.loggingService?.info('All tasks cleared');
    }

    // New helper methods for the enhanced task management

    /**
     * Validates task configuration
     */
    validateTask(config: TaskConfig): TaskValidationError[] {
        const errors: TaskValidationError[] = [];

        if (!config.title || config.title.trim().length === 0) {
            errors.push({
                field: 'title',
                message: 'Task title is required',
                code: 'MISSING_TITLE'
            });
        }

        if (!config.description || config.description.trim().length === 0) {
            errors.push({
                field: 'description',
                message: 'Task description is required',
                code: 'MISSING_DESCRIPTION'
            });
        }

        return errors;
    }

    /**
     * Gets tasks that depend on a specific task
     */
    getDependentTasks(taskId: string): Task[] {
        if (!this.dependencyManager) {
            return [];
        }

        const dependentTaskIds = this.dependencyManager.getDependentTasks(taskId);
        return dependentTaskIds.map(id => this.tasks.get(id)).filter(Boolean) as Task[];
    }

    /**
     * Gets all blocked tasks
     */
    getBlockedTasks(): Task[] {
        return Array.from(this.tasks.values()).filter(task => task.status === 'blocked');
    }

    /**
     * Resolves a conflict for a task
     */
    resolveConflict(taskId: string, resolution: 'block' | 'allow' | 'merge'): boolean {
        if (!this.dependencyManager) {
            return false;
        }

        const task = this.tasks.get(taskId);
        const success = this.dependencyManager.resolveConflict(taskId, resolution, task);
        if (success && task && task.status === 'blocked') {
            if (resolution === 'allow' || resolution === 'merge') {
                // Try to transition to ready if conflicts are resolved
                if (this.taskStateMachine) {
                    const transitionErrors = this.taskStateMachine.transition(task, 'ready');
                    if (transitionErrors.length === 0 && this.priorityQueue) {
                        // Use moveToReady helper to cleanly migrate tasks
                        this.priorityQueue.moveToReady(task);
                        this.tryAssignTasks();
                    }
                }
            }
            // For 'block' resolution, leave task blocked and do not clear fields
        }

        return success;
    }

    /**
     * Adds a dependency between two tasks
     */
    addTaskDependency(taskId: string, dependsOnTaskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found`);
            return false;
        }

        // Snapshot original dependsOn list
        const original = task.dependsOn ? [...task.dependsOn] : [];

        // Update Task.dependsOn in the task map (avoid duplicates)
        if (!task.dependsOn) {
            task.dependsOn = [];
        }
        if (!task.dependsOn.includes(dependsOnTaskId)) {
            task.dependsOn.push(dependsOnTaskId);
        }

        // Call dependency manager
        const success = this.dependencyManager?.addDependency(taskId, dependsOnTaskId) ?? false;

        if (!success) {
            task.dependsOn = original; // revert
            return false;
        }

        if (success) {
            // Re-validate dependencies and adjust state
            const allTasks = this.getTasks();
            const depErrors = this.dependencyManager?.validateDependencies(task, allTasks) ?? [];

            if (depErrors.length > 0) {
                // Transition to blocked if dependencies are invalid
                if (this.taskStateMachine) {
                    this.taskStateMachine.transition(task, 'blocked');
                } else {
                    task.status = 'blocked';
                }
                this.loggingService?.warn(`Task ${taskId} blocked due to dependency issues:`, depErrors);
            } else {
                // Check for conflicts
                const activeOrAssignedTasks = this.getActiveOrAssignedTasks();
                const conflicts = this.dependencyManager?.checkConflicts(task, activeOrAssignedTasks) ?? [];
                if (conflicts.length > 0) {
                    task.conflictsWith = conflicts;
                    task.blockedBy = conflicts;
                    if (this.taskStateMachine) {
                        this.taskStateMachine.transition(task, 'blocked');
                    } else {
                        task.status = 'blocked';
                    }
                    this.loggingService?.warn(`Task ${taskId} blocked due to conflicts:`, conflicts);
                }
            }

            // Publish appropriate events
            this._onTaskUpdate.fire();
            this.publishEvent(EVENTS.TASK_DEPENDENCY_ADDED, { taskId, dependsOnTaskId });
        }

        return success;
    }

    /**
     * Removes a dependency between two tasks
     */
    removeTaskDependency(taskId: string, dependsOnTaskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found`);
            return false;
        }

        // Update Task.dependsOn in the task map
        if (task.dependsOn) {
            const index = task.dependsOn.indexOf(dependsOnTaskId);
            if (index > -1) {
                task.dependsOn.splice(index, 1);
            }
        }

        // Call dependency manager
        this.dependencyManager?.removeDependency(taskId, dependsOnTaskId);

        // Re-validate dependencies and adjust state
        const allTasks = this.getTasks();
        const depErrors = this.dependencyManager?.validateDependencies(task, allTasks) ?? [];

        if (depErrors.length === 0 && task.status === 'blocked') {
            // Check if task can become ready
            const activeOrAssignedTasks = this.getActiveOrAssignedTasks();
            const conflicts = this.dependencyManager?.checkConflicts(task, activeOrAssignedTasks) ?? [];

            if (conflicts.length === 0) {
                // Clear conflict fields and transition to ready
                task.conflictsWith = [];
                task.blockedBy = [];

                if (this.taskStateMachine) {
                    const transitionErrors = this.taskStateMachine.transition(task, 'ready');
                    if (transitionErrors.length === 0 && this.priorityQueue) {
                        // Use moveToReady helper to cleanly migrate tasks
                        this.priorityQueue.moveToReady(task);
                    }
                } else {
                    task.status = 'ready';
                    task.assignedTo = undefined; // Clear assignee when manually setting to ready
                    if (this.priorityQueue) {
                        // Use moveToReady helper to cleanly migrate tasks
                        this.priorityQueue.moveToReady(task);
                    }
                }
            }
        }

        // Publish appropriate events
        this._onTaskUpdate.fire();
        this.publishEvent(EVENTS.TASK_DEPENDENCY_REMOVED, { taskId, dependsOnTaskId });

        return true;
    }

    /**
     * Gets task statistics
     */
    getTaskStats(): {
        total: number;
        queued: number;
        ready: number;
        assigned: number;
        inProgress: number;
        completed: number;
        failed: number;
        blocked: number;
        validated: number;
    } {
        const tasks = Array.from(this.tasks.values());
        return {
            total: tasks.length,
            queued: tasks.filter(t => t.status === 'queued').length,
            ready: tasks.filter(t => t.status === 'ready').length,
            assigned: tasks.filter(t => t.status === 'assigned').length,
            inProgress: tasks.filter(t => t.status === 'in-progress').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length,
            blocked: tasks.filter(t => t.status === 'blocked').length,
            validated: tasks.filter(t => t.status === 'validated').length
        };
    }

    /**
     * Helper method that performs both state transition to ready and enqueuing
     * This ensures TASK_READY events are properly emitted and validation is applied
     */
    private makeReady(task: Task): boolean {
        if (!this.taskStateMachine || !this.priorityQueue) {
            return false;
        }

        const transitionErrors = this.taskStateMachine.transition(task, 'ready');
        if (transitionErrors.length === 0) {
            this.priorityQueue.moveToReady(task);
            return true;
        }

        this.loggingService?.warn(`Failed to make task ${task.id} ready:`, transitionErrors);
        return false;
    }

    /**
     * Recomputes task priority with soft dependency adjustments
     */
    private recomputeTaskPriorityWithSoftDeps(task: Task): void {
        if (!this.priorityQueue || !this.priorityQueue.contains(task.id)) {
            return;
        }

        const allTasks = this.getTasks();
        const newPriority = this.priorityQueue.computeEffectivePriority(task, allTasks);

        // Get base priority for comparison
        const basePriority = task.numericPriority || priorityToNumeric(task.priority);
        const softDepAdjustment = newPriority - basePriority;

        if (softDepAdjustment !== 0) {
            // Update the task's priority in the queue
            this.priorityQueue.updatePriority(task.id, newPriority);
            this.loggingService?.debug(
                `Task ${task.id} priority adjusted by ${softDepAdjustment} due to soft dependencies, new priority: ${newPriority}`
            );

            // Publish priority updated event
            this.publishEvent(EVENTS.TASK_PRIORITY_UPDATED, {
                taskId: task.id,
                oldPriority: basePriority,
                newPriority: newPriority
            });

            // Publish event when soft dependencies are satisfied (positive adjustment)
            if (softDepAdjustment > 0) {
                this.publishEvent(EVENTS.TASK_SOFT_DEPENDENCY_SATISFIED, {
                    taskId: task.id,
                    task,
                    satisfiedDependencies: task.prefers || []
                });
            }
        }
    }

    /**
     * Updates queue depth and status metrics
            // Fall back to capability matcher if load balancing is disabled
            return this.capabilityMatcher?.findBestAgent(availableAgents, task) || null;
        }

        // Get agents with capacity information
        const agentsWithCapacity = this.getAvailableCapacityAgents(availableAgents);
        if (agentsWithCapacity.length === 0) {
            return this.capabilityMatcher?.findBestAgent(availableAgents, task) || null;
        }

        // Apply load balancing strategy
        switch (this.loadBalancingStrategy) {
            case LoadBalancingStrategy.BALANCED:
                return this.findBalancedAgent(agentsWithCapacity, task);
            case LoadBalancingStrategy.PERFORMANCE_OPTIMIZED:
                return this.findPerformanceOptimizedAgent(agentsWithCapacity, task);
            case LoadBalancingStrategy.CAPACITY_OPTIMIZED:
                return this.findCapacityOptimizedAgent(agentsWithCapacity, task);
            default:
                return this.capabilityMatcher?.findBestAgent(availableAgents, task) || null;
        }
    }

    /**
     * Get available agents with capacity information
     */
    private getAvailableCapacityAgents(availableAgents: any[]): any[] {
        return availableAgents.filter(agent => {
            // Check if agent has capacity information
            const agentInfo = this.agentManager.getAgent(agent.id);
            return agentInfo && (agentInfo.status === 'online' || agentInfo.status === 'idle');
        });
    }

    /**
     * Find best agent for a task (alias for findBalancedAgent)
     */
    private findBestAgent(agents: any[], task: Task): any | null {
        return this.findBalancedAgent(agents, task);
    }

    /**
     * Find agent using balanced load balancing strategy
     */
    private findBalancedAgent(agents: any[], task: Task): any | null {
        // Calculate load for each agent
        const agentLoads = agents.map(agent => {
            const currentLoad = this.getAgentCurrentLoad(agent.id);
            const maxCapacity = this.getAgentMaxCapacity(agent.id);
            const cap = Math.max(1, maxCapacity || 0);
            const utilization = (currentLoad / cap) * 100;

            return {
                agent,
                currentLoad,
                maxCapacity,
                utilization,
                availableCapacity: maxCapacity - currentLoad
            };
        });

        // Sort by available capacity (descending) and capability match
        agentLoads.sort((a, b) => {
            // Primary sort: available capacity
            if (a.availableCapacity !== b.availableCapacity) {
                return b.availableCapacity - a.availableCapacity;
            }

            // Secondary sort: capability match if available
            if (this.capabilityMatcher) {
                const aCapabilities = a.agent.capabilities || [];
                const bCapabilities = b.agent.capabilities || [];
                const taskCapabilities = task.requiredCapabilities || [];
                const aScore = this.capabilityMatcher.calculateMatchScore(aCapabilities, taskCapabilities);
                const bScore = this.capabilityMatcher.calculateMatchScore(bCapabilities, taskCapabilities);
                return bScore - aScore;
            }

            return 0;
        });

        return agentLoads.length > 0 ? agentLoads[0].agent : null;
    }

    /**
     * Find agent using performance-optimized load balancing strategy
     */
    private findPerformanceOptimizedAgent(agents: any[], task: Task): any | null {
        let bestAgent: any | null = null;
        let bestScore = 0;

        for (const agent of agents) {
            const currentLoad = this.getAgentCurrentLoad(agent.id);
            const maxCapacity = this.getAgentMaxCapacity(agent.id);
            const cap = Math.max(1, maxCapacity || 0);
            const utilization = (currentLoad / cap) * 100;

            // Performance score based on utilization and capability match
            let performanceScore = 100 - utilization; // Lower utilization = higher score

            if (this.capabilityMatcher) {
                const agentCapabilities = agent.capabilities || [];
                const taskCapabilities = task.requiredCapabilities || [];
                const capabilityScore = this.capabilityMatcher.calculateMatchScore(agentCapabilities, taskCapabilities);
                performanceScore = performanceScore * 0.6 + capabilityScore * 0.4;
            }

            if (performanceScore > bestScore) {
                bestScore = performanceScore;
                bestAgent = agent;
            }
        }

        return bestAgent;
    }

    /**
     * Find agent using capacity-optimized load balancing strategy
     */
    private findCapacityOptimizedAgent(agents: any[], task: Task): any | null {
        // Find agent with highest available capacity
        let bestAgent: any | null = null;
        let maxAvailableCapacity = 0;

        for (const agent of agents) {
            const currentLoad = this.getAgentCurrentLoad(agent.id);
            const maxCapacity = this.getAgentMaxCapacity(agent.id);
            const availableCapacity = maxCapacity - currentLoad;

            if (availableCapacity > maxAvailableCapacity) {
                maxAvailableCapacity = availableCapacity;
                bestAgent = agent;
            }
        }

        return bestAgent;
    }

    /**
     * Get current load for an agent
     */
    private getAgentCurrentLoad(agentId: string): number {
        // Query AgentManager for capacity information
        const cap = this.agentManager.getAgentCapacity(agentId);
        if (cap.maxCapacity > 0) {
            return cap.currentLoad;
        }

        // Fallback to counting active tasks in TaskQueue
        const activeTasks = Array.from(this.tasks.values()).filter(
            task => task.assignedTo === agentId && (task.status === 'assigned' || task.status === 'in-progress')
        );

        return activeTasks.length;
    }

    /**
     * Get maximum capacity for an agent
     */
    private getAgentMaxCapacity(agentId: string): number {
        // Use AgentManager capacity information when available
        const cap = this.agentManager.getAgentCapacity(agentId);
        if (cap.maxCapacity > 0) {
            return cap.maxCapacity;
        }

        // Fallback to agent configuration
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) return 1;

        return agent.maxConcurrentTasks || 5;
    }

    /**
     * Assign task with load balancing considerations
     */
    assignTaskWithLoadBalancing(taskId: string, preferredAgentId?: string): Promise<boolean> {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found for load balancing assignment`);
            return Promise.resolve(false);
        }

        if (preferredAgentId) {
            // Check if preferred agent has capacity
            const agent = this.agentManager.getAgent(preferredAgentId);
            if (agent && this.canAgentHandleTask(agent, task)) {
                return this.assignTask(taskId, preferredAgentId);
            }
        }

        // Find best agent using load balancing
        const availableAgents = this.agentManager.getAvailableAgents();
        const bestAgent = this.findBestAgent(availableAgents, task);

        if (bestAgent) {
            return this.assignTask(taskId, bestAgent.id);
        }

        this.loggingService?.warn(`No suitable agent found for task ${taskId} with load balancing`);
        return Promise.resolve(false);
    }

    /**
     * Check if agent can handle a task considering capacity
     */
    private canAgentHandleTask(agent: any, task: Task): boolean {
        if (!agent || (agent.status !== 'online' && agent.status !== 'idle')) return false;

        const currentLoad = this.getAgentCurrentLoad(agent.id);
        const maxCapacity = this.getAgentMaxCapacity(agent.id);

        if (currentLoad >= maxCapacity) return false;

        // Check capabilities if capability matcher is available
        if (this.capabilityMatcher) {
            const agentCapabilities = agent.capabilities || [];
            const taskCapabilities = task.requiredCapabilities || [];
            const matchScore = this.capabilityMatcher.calculateMatchScore(agentCapabilities, taskCapabilities);
            return matchScore > 0.5; // Minimum capability threshold
        }

        return true;
    }

    /**
     * Reassign task for load balancing purposes
     */
    async reassignForLoadBalancing(
        taskId: string,
        reason: TaskReassignmentReason = TaskReassignmentReason.LOAD_BALANCING,
        maxReassignmentsPerCycle?: number
    ): Promise<boolean> {
        // Check rate limiting
        const limit = maxReassignmentsPerCycle || this.maxReassignmentsPerCycle;
        if (this.reassignmentsThisCycle >= limit) {
            this.loggingService?.warn(
                `Reassignment rate limit reached (${this.reassignmentsThisCycle}/${limit}). Skipping reassignment of task ${taskId}`
            );
            return false;
        }

        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found for load balancing reassignment`);
            return false;
        }

        const currentAgentId = task.assignedTo;
        if (!currentAgentId) {
            this.loggingService?.warn(`Task ${taskId} has no assigned agent for reassignment`);
            return false;
        }

        // Delegate to the new method with available agents as candidates
        const candidates = this.agentManager.getAvailableAgents().filter(a => a.id !== currentAgentId);
        const success = await this.reassignTaskWithCandidates(taskId, candidates, reason);

        if (success) {
            this.reassignmentsThisCycle++;
        }

        return success;
    }

    /**
     * Reassign task with explicit candidate list and reason for conductor-friendly API
     */
    async reassignTaskWithCandidates(
        taskId: string,
        candidates: any[],
        reason: TaskReassignmentReason = TaskReassignmentReason.LOAD_BALANCING
    ): Promise<boolean> {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found for reassignment`);
            return false;
        }

        const currentAgentId = task.assignedTo;
        if (!currentAgentId) {
            this.loggingService?.warn(`Task ${taskId} has no assigned agent for reassignment`);
            return false;
        }

        // Filter candidates by canAgentHandleTask and exclude current agent
        const filteredCandidates = candidates.filter(
            agent => agent.id !== currentAgentId && this.canAgentHandleTask(agent, task)
        );

        if (filteredCandidates.length === 0) {
            this.loggingService?.warn(`No suitable candidates found for reassignment of task ${taskId}`);
            return false;
        }

        // Pick best agent from filtered candidates
        const bestAgent = this.findBestAgent(filteredCandidates, task);
        if (!bestAgent) {
            this.loggingService?.warn(`No suitable alternative agent found for task ${taskId}`);
            return false;
        }

        // Publish load balancing event
        safePublish(this.eventBus, this.loggingService, EVENTS.LOAD_BALANCING_EVENT, {
            type: 'task_reassigned',
            taskId,
            reason,
            timestamp: new Date()
        });

        // Perform reassignment
        const success = await this.assignTask(taskId, bestAgent.id);

        if (success) {
            this.loggingService?.info(
                `Task ${taskId} reassigned from ${currentAgentId} to ${bestAgent.id} for ${reason}`
            );

            // Update load for both agents to keep both sides consistent
            const currentAgentLoad = this.getAgentCurrentLoad(currentAgentId);
            const currentAgentMaxCapacity = this.getAgentMaxCapacity(currentAgentId);
            this.agentManager.updateAgentLoad(currentAgentId, currentAgentLoad, currentAgentMaxCapacity);

            const newAgentLoad = this.getAgentCurrentLoad(bestAgent.id);
            const newAgentMaxCapacity = this.getAgentMaxCapacity(bestAgent.id);
            this.agentManager.updateAgentLoad(bestAgent.id, newAgentLoad, newAgentMaxCapacity);
        }

        return success;
    }

    /**
     * Set load balancing strategy
     */
    setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void {
        this.loadBalancingStrategy = strategy;
        this.loggingService?.info(`Load balancing strategy changed to: ${strategy}`);
    }

    /**
     * Enable or disable load balancing
     */
    setLoadBalancingEnabled(enabled: boolean): void {
        this.loadBalancingEnabled = enabled;
        this.loggingService?.info(`Load balancing ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get current load balancing configuration
     */
    getLoadBalancingConfig(): { strategy: LoadBalancingStrategy; enabled: boolean } {
        return {
            strategy: this.loadBalancingStrategy,
            enabled: this.loadBalancingEnabled
        };
    }

    /**
     * Initialize load balancing configuration from settings
     */
    private initializeLoadBalancingConfig(): void {
        if (!this.configService) return;

        const enabled = this.configService.get<boolean>('nofx.loadBalancing.enabled', true);
        const strategy = this.configService.get<string>('nofx.loadBalancing.strategy', LoadBalancingStrategy.BALANCED);
        const utilizationThreshold = this.configService.get<number>('nofx.loadBalancing.utilizationThreshold', 80);
        const maxReassignmentsPerCycle = this.configService.get<number>(
            'nofx.loadBalancing.maxReassignmentsPerCycle',
            10
        );

        this.setLoadBalancingEnabled(enabled);
        this.setLoadBalancingStrategy(strategy as LoadBalancingStrategy);
        this.maxReassignmentsPerCycle = maxReassignmentsPerCycle;

        this.loggingService?.debug(
            `Load balancing config updated: enabled=${enabled}, strategy=${strategy}, threshold=${utilizationThreshold}, maxReassignments=${maxReassignmentsPerCycle}`
        );
    }

    /**
     * Reset reassignment counter for new cycle
     */
    resetReassignmentCycle(): void {
        this.reassignmentsThisCycle = 0;
    }

    /**
     * Emit current utilizations for all active agents to keep metrics fresh
     */
    private emitCurrentAgentUtilizations(): void {
        const activeAgents = this.agentManager.getActiveAgents();
        for (const agent of activeAgents) {
            const currentLoad = this.getAgentCurrentLoad(agent.id);
            const maxCapacity = this.getAgentMaxCapacity(agent.id);
            const cap = Math.max(1, maxCapacity || 0);
            const utilization = (currentLoad / cap) * 100;
        }
    }

    dispose() {
        this.subscriptions.forEach(d => d.dispose());
        this.subscriptions = [];
        this._onTaskUpdate.dispose();
        this.priorityQueue?.dispose();
        this.taskStateMachine?.dispose();
        this.capabilityMatcher?.dispose();
        this.dependencyManager?.dispose();
    }
}
