import * as vscode from 'vscode';
import { Task, TaskConfig, TaskStatus, TaskValidationError } from '../agents/types';
import { AgentManager } from '../agents/AgentManager';
import { ILoggingService, IEventBus, IErrorHandler, INotificationService, ITaskReader, IConfigurationService, ITaskStateMachine, IPriorityTaskQueue, ICapabilityMatcher, ITaskDependencyManager, IMetricsService } from '../services/interfaces';
import { DOMAIN_EVENTS } from '../services/EventConstants';

// Utility function to safely publish events
function safePublish(eventBus: any, logger: any, event: string, data: any) {
    try {
        eventBus?.publish(event, data);
    } catch (error) {
        logger?.warn(`Failed to publish event ${event}`, { error: error instanceof Error ? error.message : String(error) });
    }
}
import { priorityToNumeric } from './priority';

/**
 * TaskQueue manages task lifecycle and assignment.
 * 
 * Queue Behavior:
 * - Tasks in 'ready' and 'validated' states are queued in the priority queue
 * - 'validated' tasks are queued to provide visibility and proper ordering
 * - When 'validated' tasks transition to 'ready', they are re-enqueued to maintain priority order
 * - The assignNextTask() method prefers 'ready' tasks over 'validated' tasks to avoid churn
 */
export class TaskQueue implements ITaskReader {
    private tasks: Map<string, Task> = new Map();
    private agentManager: AgentManager;
    private _onTaskUpdate = new vscode.EventEmitter<void>();
    public readonly onTaskUpdate = this._onTaskUpdate.event;
    private loggingService?: ILoggingService;
    private eventBus?: IEventBus;
    private errorHandler?: IErrorHandler;
    private notificationService?: INotificationService;
    private configService?: IConfigurationService;
    private taskStateMachine?: ITaskStateMachine;
    private priorityQueue?: IPriorityTaskQueue;
    private capabilityMatcher?: ICapabilityMatcher;
    private dependencyManager?: ITaskDependencyManager;
    private metricsService?: IMetricsService;
    private subscriptions: vscode.Disposable[] = [];

    constructor(
        agentManager: AgentManager,
        loggingService?: ILoggingService,
        eventBus?: IEventBus,
        errorHandler?: IErrorHandler,
        notificationService?: INotificationService,
        configService?: IConfigurationService,
        taskStateMachine?: ITaskStateMachine,
        priorityQueue?: IPriorityTaskQueue,
        capabilityMatcher?: ICapabilityMatcher,
        dependencyManager?: ITaskDependencyManager,
        metricsService?: IMetricsService
    ) {
        this.agentManager = agentManager;
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.notificationService = notificationService;
        this.configService = configService;
        this.taskStateMachine = taskStateMachine;
        this.priorityQueue = priorityQueue;
        this.capabilityMatcher = capabilityMatcher;
        this.dependencyManager = dependencyManager;
        this.metricsService = metricsService;
        
        // Auto-assign tasks when agents become available
        this.agentManager.onAgentUpdate(() => {
            this.tryAssignTasks();
        });

        // Subscribe to agent events from EventBus
        if (this.eventBus) {
            this.subscriptions.push(this.eventBus.subscribe(DOMAIN_EVENTS.AGENT_CREATED, () => {
                this.tryAssignTasks();
            }));
            this.subscriptions.push(this.eventBus.subscribe(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, (data) => {
                if (data.status === 'idle') {
                    this.tryAssignTasks();
                }
            }));
            this.subscriptions.push(this.eventBus.subscribe(DOMAIN_EVENTS.TASK_STATE_CHANGED, ({ taskId, newState }) => {
                if (!this.priorityQueue) return;
                const removeStates = ['blocked','assigned','in-progress','completed','failed'];
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
            }));
            this.subscriptions.push(this.eventBus.subscribe(DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, ({ taskId }) => {
                const t = this.getTask(taskId);
                if (t && t.status === 'blocked' && (!t.conflictsWith || t.conflictsWith.length === 0)) {
                    this.taskStateMachine?.transition(t, 'ready');
                    this.priorityQueue?.moveToReady(t);
                    this.tryAssignTasks();
                }
            }));
            this.subscriptions.push(this.eventBus.subscribe(DOMAIN_EVENTS.TASK_CREATED, ({ taskId }) => {
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
            }));
        }
    }

    addTask(config: TaskConfig): Task {
        const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        this.loggingService?.debug(`Creating task ${taskId}`);
        this.loggingService?.debug(`Config:`, config);
        
        // Record task creation metrics
        this.metricsService?.incrementCounter('tasks_created', { 
            priority: config.priority || 'medium',
            hasDependencies: (config.dependsOn && config.dependsOn.length > 0) ? 'true' : 'false'
        });
        
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
            this.loggingService?.error(`Task validation failed:`, validationErrors);
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
                            this.loggingService?.error(`State transition to validated failed:`, validationErrors);
                            throw new Error(`State transition failed: ${validationErrors.map(e => e.message).join(', ')}`);
                        }
                        
                        const blockedErrors = this.taskStateMachine.transition(task, 'blocked');
                        if (blockedErrors.length > 0) {
                            this.loggingService?.error(`State transition to blocked failed:`, blockedErrors);
                            throw new Error(`State transition failed: ${blockedErrors.map(e => e.message).join(', ')}`);
                        }
                    } else {
                        task.status = 'blocked';
                    }
                    // Do not enqueue blocked tasks
                    this.loggingService?.info(`Task ${taskId} blocked due to dependency errors - returning early without further transitions`);
                    
                    // Publish task.created event before early return
                    if (this.eventBus) {
                        safePublish(this.eventBus, this.loggingService, DOMAIN_EVENTS.TASK_CREATED, { taskId, task });
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
                this.loggingService?.error(`State transition failed:`, validationErrors);
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
                    this.loggingService?.warn(`Task blocked due to conflicts:`, conflicts);
                } else {
                    // Let state machine handle readiness validation (including dependency completion)
                    const readinessErrors = this.taskStateMachine.transition(task, 'ready');
                    if (readinessErrors.length > 0) {
                        this.loggingService?.warn(`Task readiness transition failed:`, readinessErrors);
                        // Set blockedBy to dependencies for UI visibility
                        task.blockedBy = task.dependsOn || [];
                        // Publish waiting event for observability
                        safePublish(this.eventBus, this.loggingService, DOMAIN_EVENTS.TASK_WAITING, { taskId: task.id, task, reasons: readinessErrors });
                    }
                }
            } else {
                // Let state machine handle readiness validation
                const readinessErrors = this.taskStateMachine.transition(task, 'ready');
                if (readinessErrors.length > 0) {
                    this.loggingService?.warn(`Task readiness transition failed:`, readinessErrors);
                    // Set blockedBy to dependencies for UI visibility
                    task.blockedBy = task.dependsOn || [];
                    // Publish waiting event for observability
                    this.eventBus?.publish(DOMAIN_EVENTS.TASK_WAITING, { taskId: task.id, task, reasons: readinessErrors });
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
            this.eventBus.publish(DOMAIN_EVENTS.TASK_CREATED, { taskId, task });
        }
        // Note: task.ready and task.blocked events are already published by TaskStateMachine.transition()

        // Try to assign immediately
        this.loggingService?.debug(`Attempting immediate assignment...`);
        this.tryAssignTasks();

        return task;
    }

    assignNextTask(): boolean {
        if (!this.priorityQueue || this.priorityQueue.isEmpty()) {
            this.loggingService?.debug('No tasks in priority queue');
            return false;
        }

        const idleAgents = this.agentManager.getIdleAgents();
        this.loggingService?.debug(`Idle agents available: ${idleAgents.length}`);
        
        if (idleAgents.length === 0) {
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
            const scoredAgents = this.capabilityMatcher.rankAgents(idleAgents, task);
            if (scoredAgents.length > 0) {
                task.agentMatchScore = scoredAgents[0].score;
                // Publish match score event for UI
                this.eventBus?.publish(DOMAIN_EVENTS.TASK_MATCH_SCORE, { 
                    taskId: task.id, 
                    score: scoredAgents[0].score,
                    agentId: scoredAgents[0].agent.id 
                });
            }
        }

        // Find best agent using capability matcher
        const agent = this.capabilityMatcher?.findBestAgent(idleAgents, task);
        
        if (agent) {
            // Set assignedTo before transition to ensure required fields validate
            task.assignedTo = agent.id;
            
            // Use state machine to transition to assigned
            if (this.taskStateMachine) {
                const transitionErrors = this.taskStateMachine.transition(task, 'assigned');
                if (transitionErrors.length > 0) {
                    this.loggingService?.error(`State transition failed:`, transitionErrors);
                    task.assignedTo = undefined; // clear stale assignee
                    this.priorityQueue.enqueue(task);
                    return false;
                }
            } else {
                task.status = 'assigned';
            }
            this._onTaskUpdate.fire();

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
                this.notificationService?.showInformation(
                    `📋 Task "${task.title}" assigned to ${agent.template?.icon || '🤖'} ${agent.name}`,
                    'View Terminal'
                ).then(selection => {
                    if (selection === 'View Terminal') {
                        const terminal = this.agentManager.getAgentTerminal(agent.id);
                        if (terminal) {
                            terminal.show();
                        }
                    }
                });
                
                this.loggingService?.info(`Task successfully assigned and executing`);
                
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
            this.loggingService?.debug(`Auto-assign disabled`);
            this.notificationService?.showInformation('📋 Task added. Auto-assign is disabled - assign manually.');
            return;
        }

        let assigned = false;
        let attempts = 0;
        
        // Recompute queue size and idle agents per iteration
        while (attempts < 10) {
            const idleAgents = this.agentManager.getIdleAgents();
            const queueSize = this.priorityQueue?.size() || 0;
            
            this.loggingService?.debug(`Assignment attempt ${attempts + 1}: Queue: ${queueSize}, Idle agents: ${idleAgents.length}`);
            
            if (queueSize === 0 || idleAgents.length === 0) {
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
            const idleCount = this.agentManager.getIdleAgents().length;
            const queueSize = this.priorityQueue?.size() || 0;
            this.loggingService?.debug(`No assignment made. Queue: ${queueSize}, Idle: ${idleCount}`);
            if (idleCount === 0) {
                this.notificationService?.showInformation('📋 Task queued. All agents are busy.');
            } else {
                this.notificationService?.showWarning('📋 Task added but not assigned. Check agent status.');
            }
        }
    }

    completeTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found`);
            this.metricsService?.incrementCounter('tasks_completion_failed', { reason: 'task_not_found' });
            return false;
        }

        // Use state machine to transition to completed
        if (this.taskStateMachine) {
            const transitionErrors = this.taskStateMachine.transition(task, 'completed');
            if (transitionErrors.length > 0) {
                this.loggingService?.error(`State transition failed:`, transitionErrors);
                this.metricsService?.incrementCounter('tasks_completion_failed', { reason: 'transition_error' });
                return false;
            }
        } else {
            task.status = 'completed';
            task.completedAt = new Date();
        }
        
        // Record successful completion metrics
        this.metricsService?.incrementCounter('tasks_completed', { 
            priority: task.priority,
            duration: task.completedAt && task.createdAt ? 
                (task.completedAt.getTime() - task.createdAt.getTime()) : 0
        });

        this._onTaskUpdate.fire();
        
        // Update queue depth metrics
        this.updateQueueMetrics();

        // Check for dependent tasks that become ready
        if (this.dependencyManager) {
            const allTasks = this.getTasks();
            const readyTasks = this.dependencyManager.getReadyTasks(allTasks);
            
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
                        // Clear conflictsWith and conflict-related blockedBy entries when transitioning to ready
                        if (conflicts.length === 0) {
                            const prevConflicts = (readyTask.conflictsWith || []).slice();
                            readyTask.conflictsWith = [];
                            readyTask.blockedBy = (readyTask.blockedBy || []).filter(id => !prevConflicts.includes(id));
                        }
                        
                        // Transition to ready state
                        if (this.taskStateMachine) {
                            const transitionErrors = this.taskStateMachine.transition(readyTask, 'ready');
                            if (transitionErrors.length === 0) {
                                // Use moveToReady helper to cleanly migrate tasks
                                this.priorityQueue.moveToReady(readyTask);
                                this.loggingService?.info(`Task ${readyTask.id} is now ready due to completion of ${taskId}`);
                            }
                        }
                    }
                }
            }

            // Check for tasks with soft dependencies on the completed task
            const softDependents = this.dependencyManager.getSoftDependents(taskId);
            for (const softDepTaskId of softDependents) {
                const softDepTask = this.tasks.get(softDepTaskId);
                if (softDepTask && this.priorityQueue && this.priorityQueue.contains(softDepTaskId)) {
                    // Recompute priority for tasks that prefer this completed task
                    this.recomputeTaskPriorityWithSoftDeps(softDepTask);
                    this.loggingService?.debug(`Recomputed priority for soft dependent task ${softDepTaskId} after completion of ${taskId}`);
                }
            }
        }

        // Note: task.completed event is already published by TaskStateMachine.transition()

        this.loggingService?.info(`Task completed: ${task.title}`);
        this.notificationService?.showInformation(
            `✅ Task completed: ${task.title}`
        );

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
                this.loggingService?.error(`State transition failed:`, transitionErrors);
                return;
            }
        } else {
            task.status = 'failed';
        }

        this._onTaskUpdate.fire();

        // Note: task.failed event is already published by TaskStateMachine.transition()

        this.loggingService?.error(`Task failed: ${task.title}${reason ? ` - ${reason}` : ''}`);
        this.notificationService?.showError(
            `❌ Task failed: ${task.title}${reason ? ` - ${reason}` : ''}`
        );

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
        return Array.from(this.tasks.values()).filter(
            task => task.assignedTo === agentId
        );
    }

    clearCompleted() {
        const completed = Array.from(this.tasks.values()).filter(
            task => task.status === 'completed'
        );

        completed.forEach(task => {
            this.tasks.delete(task.id);
        });

        this._onTaskUpdate.fire();
    }

    async assignTask(taskId: string, agentId: string): Promise<boolean> {
        const assignmentTimer = this.metricsService?.startTimer('task_assignment_duration');
        
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found`);
            this.metricsService?.incrementCounter('assignments_failed', { reason: 'task_not_found' });
            return false;
        }

        // Guard against assigning non-ready tasks
        if (task.status !== 'ready') {
            this.loggingService?.warn(`Cannot assign task ${taskId} with status '${task.status}' - only 'ready' tasks can be assigned`);
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

        // Set assignedTo and use state machine to transition to assigned
        task.assignedTo = agentId;
        if (this.taskStateMachine) {
            const transitionErrors = this.taskStateMachine.transition(task, 'assigned');
            if (transitionErrors.length > 0) {
                this.loggingService?.error(`State transition failed:`, transitionErrors);
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

        this.loggingService?.info(`Executing task ${taskId} on agent ${agentId}`);
        
        try {
            this.agentManager.executeTask(agentId, task);
            
            // Transition to in-progress
            if (this.taskStateMachine) {
                this.taskStateMachine.transition(task, 'in-progress');
            } else {
                task.status = 'in-progress';
            }
            
            // Show notification
            this.notificationService?.showInformation(
                `📋 Task "${task.title}" assigned to ${agent.template?.icon || '🤖'} ${agent.name}`,
                'View Terminal'
            ).then(selection => {
                if (selection === 'View Terminal') {
                    const terminal = this.agentManager.getAgentTerminal(agentId);
                    if (terminal) {
                        terminal.show();
                    }
                }
            });
            
            // Record successful assignment metrics
            this.metricsService?.endTimer(assignmentTimer!);
            this.metricsService?.incrementCounter('assignments_made', { 
                agentId,
                taskPriority: task.priority 
            });
            
            return true;
        } catch (error: any) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'assignTask');
            
            // Record failed assignment metrics
            this.metricsService?.endTimer(assignmentTimer!);
            this.metricsService?.incrementCounter('assignments_failed', { 
                reason: 'assignment_error',
                error: err.message 
            });
            
            // Revert via state machine on failure
            if (this.taskStateMachine) {
                this.taskStateMachine.transition(task, 'ready');
                if (this.priorityQueue) {
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

        const success = this.dependencyManager.resolveConflict(taskId, resolution);
        if (success) {
            const task = this.tasks.get(taskId);
            if (task && task.status === 'blocked') {
                if (resolution === 'allow' || resolution === 'merge') {
                    // Clear conflict fields and transition to ready
                    task.conflictsWith = [];
                    task.blockedBy = [];
                    
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
            this.eventBus?.publish(DOMAIN_EVENTS.TASK_DEPENDENCY_ADDED, { taskId, dependsOnTaskId });
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
        this.eventBus?.publish(DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED, { taskId, dependsOnTaskId });

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
            this.loggingService?.debug(`Task ${task.id} priority adjusted by ${softDepAdjustment} due to soft dependencies, new priority: ${newPriority}`);
            
            // Publish event when soft dependencies are satisfied (positive adjustment)
            if (softDepAdjustment > 0) {
                this.eventBus?.publish(DOMAIN_EVENTS.TASK_SOFT_DEPENDENCY_SATISFIED, {
                    taskId: task.id,
                    task,
                    satisfiedDependencies: task.prefers || []
                });
            }
        }
    }

    /**
     * Updates queue depth and status metrics
     */
    private updateQueueMetrics(): void {
        if (!this.metricsService) return;
        
        const tasks = this.getTasks();
        const stats = this.getTaskStats();
        
        // Update queue depth metrics
        this.metricsService.setGauge('current_queue_depth', stats.queued + stats.ready);
        this.metricsService.setGauge('ready_tasks_count', stats.ready);
        this.metricsService.setGauge('blocked_tasks_count', stats.blocked);
        this.metricsService.setGauge('active_tasks_count', stats.inProgress);
        this.metricsService.setGauge('completed_tasks_count', stats.completed);
        this.metricsService.setGauge('failed_tasks_count', stats.failed);
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