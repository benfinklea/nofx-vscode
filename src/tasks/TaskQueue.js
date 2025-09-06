"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskQueue = void 0;
const vscode = __importStar(require("vscode"));
const EventConstants_1 = require("../services/EventConstants");
function safePublish(eventBus, logger, event, data) {
    try {
        eventBus?.publish(event, data);
    }
    catch (error) {
        logger?.warn(`Failed to publish event ${event}`, { error: error instanceof Error ? error.message : String(error) });
    }
}
const priority_1 = require("./priority");
class TaskQueue {
    constructor(agentManager, loggingService, eventBus, errorHandler, notificationService, configService, taskStateMachine, priorityQueue, capabilityMatcher, dependencyManager, metricsService) {
        this.tasks = new Map();
        this._onTaskUpdate = new vscode.EventEmitter();
        this.onTaskUpdate = this._onTaskUpdate.event;
        this.subscriptions = [];
        this.agentManager = agentManager;
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.notificationService = notificationService;
        this.configService = configService;
        this.taskStateMachine = taskStateMachine;
        this.priorityQueue = priorityQueue;
        if (this.priorityQueue && this.taskStateMachine && 'taskStateMachine' in this.priorityQueue) {
            this.priorityQueue.taskStateMachine = this.taskStateMachine;
        }
        this.capabilityMatcher = capabilityMatcher;
        this.dependencyManager = dependencyManager;
        this.metricsService = metricsService;
        this.agentManager.onAgentUpdate(() => {
            this.tryAssignTasks();
        });
        if (this.eventBus) {
            this.subscriptions.push(this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.AGENT_CREATED, () => {
                this.tryAssignTasks();
            }));
            this.subscriptions.push(this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.AGENT_STATUS_CHANGED, (data) => {
                if (data.status === 'idle') {
                    this.tryAssignTasks();
                }
            }));
            this.subscriptions.push(this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_STATE_CHANGED, ({ taskId, newState }) => {
                if (!this.priorityQueue)
                    return;
                const removeStates = ['blocked', 'assigned', 'in-progress', 'completed', 'failed'];
                if (removeStates.includes(newState) && this.priorityQueue.contains(taskId)) {
                    this.priorityQueue.remove(taskId);
                }
                if (newState === 'ready') {
                    const t = this.getTask(taskId);
                    if (t) {
                        this.priorityQueue.moveToReady(t);
                    }
                }
            }));
            this.subscriptions.push(this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, ({ taskId }) => {
                const t = this.getTask(taskId);
                if (t && t.status === 'blocked' && (!t.conflictsWith || t.conflictsWith.length === 0)) {
                    this.taskStateMachine?.transition(t, 'ready');
                    this.priorityQueue?.moveToReady(t);
                    this.tryAssignTasks();
                }
            }));
            this.subscriptions.push(this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_CREATED, ({ taskId }) => {
                if (this.dependencyManager) {
                    const allTasks = this.getTasks();
                    const blockedTasks = allTasks.filter(task => task.status === 'blocked');
                    for (const blockedTask of blockedTasks) {
                        const depErrors = this.dependencyManager.validateDependencies(blockedTask, allTasks);
                        if (depErrors.length === 0) {
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
    addTask(config) {
        const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.loggingService?.debug(`Creating task ${taskId}`);
        this.loggingService?.debug(`Config:`, config);
        this.metricsService?.incrementCounter('tasks_created', {
            priority: config.priority || 'medium',
            hasDependencies: (config.dependsOn && config.dependsOn.length > 0) ? 'true' : 'false'
        });
        const task = {
            id: taskId,
            title: config.title,
            description: config.description,
            priority: config.priority || 'medium',
            numericPriority: (0, priority_1.priorityToNumeric)(config.priority || 'medium'),
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
        const validationErrors = this.validateTask(config);
        if (validationErrors.length > 0) {
            this.loggingService?.error(`Task validation failed:`, validationErrors);
            throw new Error(`Task validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
        }
        this.tasks.set(taskId, task);
        this.loggingService?.debug(`Task added to map. Total tasks: ${this.tasks.size}`);
        if (this.dependencyManager) {
            const depErrors = this.dependencyManager.validateDependencies(task, this.getTasks());
            if (depErrors.length > 0) {
                this.loggingService?.warn(`Task ${taskId} has dependency validation errors:`, depErrors);
                task.blockedBy = task.dependsOn;
                if (depErrors.some(e => e.code === 'MISSING_DEPENDENCY' || e.code === 'CIRCULAR_DEPENDENCY')) {
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
                    }
                    else {
                        task.status = 'blocked';
                    }
                    this.loggingService?.info(`Task ${taskId} blocked due to dependency errors - returning early without further transitions`);
                    if (this.eventBus) {
                        safePublish(this.eventBus, this.loggingService, EventConstants_1.DOMAIN_EVENTS.TASK_CREATED, { taskId, task });
                    }
                    this._onTaskUpdate.fire();
                    return task;
                }
            }
            else {
                if (task.dependsOn && task.dependsOn.length > 0) {
                    for (const depId of task.dependsOn) {
                        this.dependencyManager.addDependency(task.id, depId);
                    }
                }
                if (task.prefers && task.prefers.length > 0) {
                    for (const prefId of task.prefers) {
                        this.dependencyManager.addSoftDependency(task.id, prefId);
                    }
                }
            }
        }
        if (this.taskStateMachine) {
            const validationErrors = this.taskStateMachine.transition(task, 'validated');
            if (validationErrors.length > 0) {
                this.loggingService?.error(`State transition failed:`, validationErrors);
                throw new Error(`State transition failed: ${validationErrors.map(e => e.message).join(', ')}`);
            }
            if (this.dependencyManager) {
                const activeOrAssignedTasks = this.getActiveOrAssignedTasks();
                const conflicts = this.dependencyManager.checkConflicts(task, activeOrAssignedTasks);
                if (conflicts.length > 0) {
                    task.conflictsWith = conflicts;
                    task.blockedBy = conflicts;
                    this.taskStateMachine.transition(task, 'blocked');
                    this.loggingService?.warn(`Task blocked due to conflicts:`, conflicts);
                }
                else {
                    const readinessErrors = this.taskStateMachine.transition(task, 'ready');
                    if (readinessErrors.length > 0) {
                        this.loggingService?.warn(`Task readiness transition failed:`, readinessErrors);
                        task.blockedBy = task.dependsOn || [];
                        safePublish(this.eventBus, this.loggingService, EventConstants_1.DOMAIN_EVENTS.TASK_WAITING, { taskId: task.id, task, reasons: readinessErrors });
                    }
                }
            }
            else {
                const readinessErrors = this.taskStateMachine.transition(task, 'ready');
                if (readinessErrors.length > 0) {
                    this.loggingService?.warn(`Task readiness transition failed:`, readinessErrors);
                    task.blockedBy = task.dependsOn || [];
                    this.eventBus?.publish(EventConstants_1.DOMAIN_EVENTS.TASK_WAITING, { taskId: task.id, task, reasons: readinessErrors });
                }
            }
        }
        if ((task.status === 'ready' || task.status === 'validated') && this.priorityQueue) {
            this.priorityQueue.enqueue(task);
            this.loggingService?.debug(`Task added to priority queue with status: ${task.status}`);
            this.recomputeTaskPriorityWithSoftDeps(task);
        }
        this._onTaskUpdate.fire();
        if (this.eventBus) {
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_CREATED, { taskId, task });
        }
        this.loggingService?.debug(`Attempting immediate assignment...`);
        this.tryAssignTasks();
        return task;
    }
    assignNextTask() {
        if (!this.priorityQueue || this.priorityQueue.isEmpty()) {
            this.loggingService?.debug('No tasks in priority queue');
            return false;
        }
        const idleAgents = this.agentManager.getIdleAgents();
        this.loggingService?.debug(`Idle agents available: ${idleAgents.length}`);
        if (idleAgents.length === 0) {
            return false;
        }
        const task = this.priorityQueue.dequeueReady();
        if (!task) {
            this.loggingService?.debug('No READY tasks available for assignment');
            return false;
        }
        this.loggingService?.info(`Assigning task: ${task.title}`);
        if (this.dependencyManager) {
            const activeOrAssignedTasks = this.getActiveOrAssignedTasks();
            const conflicts = this.dependencyManager.checkConflicts(task, activeOrAssignedTasks);
            if (conflicts.length > 0) {
                this.loggingService?.warn(`Task ${task.id} has conflicts detected before assignment:`, conflicts);
                task.conflictsWith = conflicts;
                task.blockedBy = conflicts;
                if (this.taskStateMachine) {
                    this.taskStateMachine.transition(task, 'blocked');
                }
                else {
                    task.status = 'blocked';
                }
                return false;
            }
        }
        if (this.capabilityMatcher) {
            const scoredAgents = this.capabilityMatcher.rankAgents(idleAgents, task);
            if (scoredAgents.length > 0) {
                task.agentMatchScore = scoredAgents[0].score;
                this.eventBus?.publish(EventConstants_1.DOMAIN_EVENTS.TASK_MATCH_SCORE, {
                    taskId: task.id,
                    score: scoredAgents[0].score,
                    agentId: scoredAgents[0].agent.id
                });
            }
        }
        const agent = this.capabilityMatcher?.findBestAgent(idleAgents, task);
        if (agent) {
            task.assignedTo = agent.id;
            if (this.taskStateMachine) {
                const transitionErrors = this.taskStateMachine.transition(task, 'assigned');
                if (transitionErrors.length > 0) {
                    this.loggingService?.error(`State transition failed:`, transitionErrors);
                    task.assignedTo = undefined;
                    this.priorityQueue.enqueue(task);
                    return false;
                }
            }
            else {
                task.status = 'assigned';
            }
            this._onTaskUpdate.fire();
            if (this.eventBus) {
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_ASSIGNED, { taskId: task.id, agentId: agent.id, task });
            }
            this.loggingService?.info(`Executing task on agent: ${agent.name}`);
            try {
                this.loggingService?.debug(`About to execute task on agent ${agent.id}`);
                this.agentManager.executeTask(agent.id, task);
                if (this.taskStateMachine) {
                    this.taskStateMachine.transition(task, 'in-progress');
                }
                else {
                    task.status = 'in-progress';
                }
                this.notificationService?.showInformation(`📋 Task "${task.title}" assigned to ${agent.template?.icon || '🤖'} ${agent.name}`, 'View Terminal').then(selection => {
                    if (selection === 'View Terminal') {
                        const terminal = this.agentManager.getAgentTerminal(agent.id);
                        if (terminal) {
                            terminal.show();
                        }
                    }
                });
                this.loggingService?.info(`Task successfully assigned and executing`);
                delete task.agentMatchScore;
                return true;
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.errorHandler?.handleError(err, 'assignNextTask');
                this.priorityQueue.enqueue(task);
                if (this.taskStateMachine) {
                    this.taskStateMachine.transition(task, 'ready');
                }
                else {
                    task.status = 'ready';
                    task.assignedTo = undefined;
                }
                delete task.agentMatchScore;
                return false;
            }
        }
        this.priorityQueue.enqueue(task);
        delete task.agentMatchScore;
        return false;
    }
    tryAssignTasks() {
        const autoAssign = this.configService?.isAutoAssignTasks() ?? true;
        this.loggingService?.debug(`Auto-assign: ${autoAssign}`);
        if (!autoAssign) {
            this.loggingService?.debug(`Auto-assign disabled`);
            this.notificationService?.showInformation('📋 Task added. Auto-assign is disabled - assign manually.');
            return;
        }
        let assigned = false;
        let attempts = 0;
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
            }
            else {
                break;
            }
            attempts++;
        }
        if (!assigned) {
            const idleCount = this.agentManager.getIdleAgents().length;
            const queueSize = this.priorityQueue?.size() || 0;
            this.loggingService?.debug(`No assignment made. Queue: ${queueSize}, Idle: ${idleCount}`);
            if (idleCount === 0) {
                this.notificationService?.showInformation('📋 Task queued. All agents are busy.');
            }
            else {
                this.notificationService?.showWarning('📋 Task added but not assigned. Check agent status.');
            }
        }
    }
    completeTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found`);
            this.metricsService?.incrementCounter('tasks_completion_failed', { reason: 'task_not_found' });
            return false;
        }
        if (this.taskStateMachine) {
            const transitionErrors = this.taskStateMachine.transition(task, 'completed');
            if (transitionErrors.length > 0) {
                this.loggingService?.error(`State transition failed:`, transitionErrors);
                this.metricsService?.incrementCounter('tasks_completion_failed', { reason: 'transition_error' });
                return false;
            }
        }
        else {
            task.status = 'completed';
            task.completedAt = new Date();
        }
        this.metricsService?.incrementCounter('tasks_completed', {
            priority: task.priority,
            duration: task.completedAt && task.createdAt ?
                String(task.completedAt.getTime() - task.createdAt.getTime()) : '0'
        });
        this._onTaskUpdate.fire();
        this.updateQueueMetrics();
        if (this.dependencyManager) {
            const allTasks = this.getTasks();
            const readyTasks = this.dependencyManager.getReadyTasks(allTasks);
            for (const readyTask of readyTasks) {
                if (readyTask.id !== taskId && readyTask.status !== 'ready' && this.priorityQueue) {
                    const activeOrAssignedTasks = this.getActiveOrAssignedTasks();
                    const conflicts = this.dependencyManager.checkConflicts(readyTask, activeOrAssignedTasks);
                    if (conflicts.length > 0) {
                        readyTask.conflictsWith = conflicts;
                        readyTask.blockedBy = conflicts;
                        if (this.taskStateMachine) {
                            this.taskStateMachine.transition(readyTask, 'blocked');
                        }
                        else {
                            readyTask.status = 'blocked';
                        }
                        this.loggingService?.warn(`Task ${readyTask.id} blocked due to conflicts:`, conflicts);
                    }
                    else {
                        if (conflicts.length === 0) {
                            const prevConflicts = (readyTask.conflictsWith || []).slice();
                            readyTask.conflictsWith = [];
                            readyTask.blockedBy = (readyTask.blockedBy || []).filter(id => !prevConflicts.includes(id));
                        }
                        if (this.taskStateMachine) {
                            const transitionErrors = this.taskStateMachine.transition(readyTask, 'ready');
                            if (transitionErrors.length === 0) {
                                this.priorityQueue.moveToReady(readyTask);
                                this.loggingService?.info(`Task ${readyTask.id} is now ready due to completion of ${taskId}`);
                            }
                        }
                    }
                }
            }
            const softDependents = this.dependencyManager.getSoftDependents(taskId);
            for (const softDepTaskId of softDependents) {
                const softDepTask = this.tasks.get(softDepTaskId);
                if (softDepTask && this.priorityQueue && this.priorityQueue.contains(softDepTaskId)) {
                    this.recomputeTaskPriorityWithSoftDeps(softDepTask);
                    this.loggingService?.debug(`Recomputed priority for soft dependent task ${softDepTaskId} after completion of ${taskId}`);
                }
            }
        }
        this.loggingService?.info(`Task completed: ${task.title}`);
        this.notificationService?.showInformation(`✅ Task completed: ${task.title}`);
        this.tryAssignTasks();
        return true;
    }
    failTask(taskId, reason) {
        const task = this.tasks.get(taskId);
        if (!task)
            return;
        if (this.taskStateMachine) {
            const transitionErrors = this.taskStateMachine.transition(task, 'failed');
            if (transitionErrors.length > 0) {
                this.loggingService?.error(`State transition failed:`, transitionErrors);
                return;
            }
        }
        else {
            task.status = 'failed';
        }
        this._onTaskUpdate.fire();
        this.loggingService?.error(`Task failed: ${task.title}${reason ? ` - ${reason}` : ''}`);
        this.notificationService?.showError(`❌ Task failed: ${task.title}${reason ? ` - ${reason}` : ''}`);
        this.tryAssignTasks();
    }
    getTasks() {
        return Array.from(this.tasks.values());
    }
    getTask(taskId) {
        return this.tasks.get(taskId);
    }
    getAllTasks() {
        return Array.from(this.tasks.values());
    }
    getPendingTasks() {
        return Array.from(this.tasks.values()).filter(t => t.status === 'queued');
    }
    getActiveTasks() {
        return Array.from(this.tasks.values()).filter(t => t.status === 'in-progress');
    }
    getActiveOrAssignedTasks() {
        return Array.from(this.tasks.values()).filter(t => t.status === 'in-progress' || t.status === 'assigned');
    }
    getQueuedTasks() {
        return this.priorityQueue ? this.priorityQueue.toArray() : [];
    }
    getTasksForAgent(agentId) {
        return Array.from(this.tasks.values()).filter(task => task.assignedTo === agentId);
    }
    clearCompleted() {
        const completed = Array.from(this.tasks.values()).filter(task => task.status === 'completed');
        completed.forEach(task => {
            this.tasks.delete(task.id);
        });
        this._onTaskUpdate.fire();
    }
    async assignTask(taskId, agentId) {
        const assignmentTimer = this.metricsService?.startTimer('task_assignment_duration');
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found`);
            this.metricsService?.incrementCounter('assignments_failed', { reason: 'task_not_found' });
            return false;
        }
        if (task.status !== 'ready') {
            this.loggingService?.warn(`Cannot assign task ${taskId} with status '${task.status}' - only 'ready' tasks can be assigned`);
            return false;
        }
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            this.loggingService?.warn(`Agent ${agentId} not found`);
            return false;
        }
        if (this.priorityQueue) {
            this.priorityQueue.remove(taskId);
        }
        task.assignedTo = agentId;
        if (this.taskStateMachine) {
            const transitionErrors = this.taskStateMachine.transition(task, 'assigned');
            if (transitionErrors.length > 0) {
                this.loggingService?.error(`State transition failed:`, transitionErrors);
                task.assignedTo = undefined;
                if (this.priorityQueue) {
                    this.priorityQueue.enqueue(task);
                }
                return false;
            }
        }
        else {
            task.status = 'assigned';
        }
        this._onTaskUpdate.fire();
        if (this.eventBus) {
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_ASSIGNED, { taskId: task.id, agentId: agentId, task });
        }
        this.loggingService?.info(`Executing task ${taskId} on agent ${agentId}`);
        try {
            this.agentManager.executeTask(agentId, task);
            if (this.taskStateMachine) {
                this.taskStateMachine.transition(task, 'in-progress');
            }
            else {
                task.status = 'in-progress';
            }
            this.notificationService?.showInformation(`📋 Task "${task.title}" assigned to ${agent.template?.icon || '🤖'} ${agent.name}`, 'View Terminal').then(selection => {
                if (selection === 'View Terminal') {
                    const terminal = this.agentManager.getAgentTerminal(agentId);
                    if (terminal) {
                        terminal.show();
                    }
                }
            });
            this.metricsService?.endTimer(assignmentTimer);
            this.metricsService?.incrementCounter('assignments_made', {
                agentId,
                taskPriority: task.priority
            });
            return true;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'assignTask');
            this.metricsService?.endTimer(assignmentTimer);
            this.metricsService?.incrementCounter('assignments_failed', {
                reason: 'assignment_error',
                error: err.message
            });
            if (this.taskStateMachine) {
                const transitionErrors = this.taskStateMachine.transition(task, 'ready');
                if (transitionErrors.length === 0 && this.priorityQueue) {
                    this.priorityQueue.moveToReady(task);
                }
            }
            else {
                task.status = 'ready';
                task.assignedTo = undefined;
                if (this.priorityQueue) {
                    this.priorityQueue.moveToReady(task);
                }
            }
            this._onTaskUpdate.fire();
            return false;
        }
    }
    clearAllTasks() {
        this.tasks.clear();
        if (this.priorityQueue) {
            while (!this.priorityQueue.isEmpty()) {
                this.priorityQueue.dequeue();
            }
        }
        this._onTaskUpdate.fire();
        this.loggingService?.info('All tasks cleared');
    }
    validateTask(config) {
        const errors = [];
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
    getDependentTasks(taskId) {
        if (!this.dependencyManager) {
            return [];
        }
        const dependentTaskIds = this.dependencyManager.getDependentTasks(taskId);
        return dependentTaskIds.map(id => this.tasks.get(id)).filter(Boolean);
    }
    getBlockedTasks() {
        return Array.from(this.tasks.values()).filter(task => task.status === 'blocked');
    }
    resolveConflict(taskId, resolution) {
        if (!this.dependencyManager) {
            return false;
        }
        const task = this.tasks.get(taskId);
        const success = this.dependencyManager.resolveConflict(taskId, resolution, task);
        if (success && task && task.status === 'blocked') {
            if (resolution === 'allow' || resolution === 'merge') {
                if (this.taskStateMachine) {
                    const transitionErrors = this.taskStateMachine.transition(task, 'ready');
                    if (transitionErrors.length === 0 && this.priorityQueue) {
                        this.priorityQueue.moveToReady(task);
                        this.tryAssignTasks();
                    }
                }
            }
        }
        return success;
    }
    addTaskDependency(taskId, dependsOnTaskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found`);
            return false;
        }
        const original = task.dependsOn ? [...task.dependsOn] : [];
        if (!task.dependsOn) {
            task.dependsOn = [];
        }
        if (!task.dependsOn.includes(dependsOnTaskId)) {
            task.dependsOn.push(dependsOnTaskId);
        }
        const success = this.dependencyManager?.addDependency(taskId, dependsOnTaskId) ?? false;
        if (!success) {
            task.dependsOn = original;
            return false;
        }
        if (success) {
            const allTasks = this.getTasks();
            const depErrors = this.dependencyManager?.validateDependencies(task, allTasks) ?? [];
            if (depErrors.length > 0) {
                if (this.taskStateMachine) {
                    this.taskStateMachine.transition(task, 'blocked');
                }
                else {
                    task.status = 'blocked';
                }
                this.loggingService?.warn(`Task ${taskId} blocked due to dependency issues:`, depErrors);
            }
            else {
                const activeOrAssignedTasks = this.getActiveOrAssignedTasks();
                const conflicts = this.dependencyManager?.checkConflicts(task, activeOrAssignedTasks) ?? [];
                if (conflicts.length > 0) {
                    task.conflictsWith = conflicts;
                    task.blockedBy = conflicts;
                    if (this.taskStateMachine) {
                        this.taskStateMachine.transition(task, 'blocked');
                    }
                    else {
                        task.status = 'blocked';
                    }
                    this.loggingService?.warn(`Task ${taskId} blocked due to conflicts:`, conflicts);
                }
            }
            this._onTaskUpdate.fire();
            this.eventBus?.publish(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_ADDED, { taskId, dependsOnTaskId });
        }
        return success;
    }
    removeTaskDependency(taskId, dependsOnTaskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.loggingService?.warn(`Task ${taskId} not found`);
            return false;
        }
        if (task.dependsOn) {
            const index = task.dependsOn.indexOf(dependsOnTaskId);
            if (index > -1) {
                task.dependsOn.splice(index, 1);
            }
        }
        this.dependencyManager?.removeDependency(taskId, dependsOnTaskId);
        const allTasks = this.getTasks();
        const depErrors = this.dependencyManager?.validateDependencies(task, allTasks) ?? [];
        if (depErrors.length === 0 && task.status === 'blocked') {
            const activeOrAssignedTasks = this.getActiveOrAssignedTasks();
            const conflicts = this.dependencyManager?.checkConflicts(task, activeOrAssignedTasks) ?? [];
            if (conflicts.length === 0) {
                task.conflictsWith = [];
                task.blockedBy = [];
                if (this.taskStateMachine) {
                    const transitionErrors = this.taskStateMachine.transition(task, 'ready');
                    if (transitionErrors.length === 0 && this.priorityQueue) {
                        this.priorityQueue.moveToReady(task);
                    }
                }
                else {
                    task.status = 'ready';
                    task.assignedTo = undefined;
                    if (this.priorityQueue) {
                        this.priorityQueue.moveToReady(task);
                    }
                }
            }
        }
        this._onTaskUpdate.fire();
        this.eventBus?.publish(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED, { taskId, dependsOnTaskId });
        return true;
    }
    getTaskStats() {
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
    makeReady(task) {
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
    recomputeTaskPriorityWithSoftDeps(task) {
        if (!this.priorityQueue || !this.priorityQueue.contains(task.id)) {
            return;
        }
        const allTasks = this.getTasks();
        const newPriority = this.priorityQueue.computeEffectivePriority(task, allTasks);
        const basePriority = task.numericPriority || (0, priority_1.priorityToNumeric)(task.priority);
        const softDepAdjustment = newPriority - basePriority;
        if (softDepAdjustment !== 0) {
            this.priorityQueue.updatePriority(task.id, newPriority);
            this.loggingService?.debug(`Task ${task.id} priority adjusted by ${softDepAdjustment} due to soft dependencies, new priority: ${newPriority}`);
            this.eventBus?.publish(EventConstants_1.DOMAIN_EVENTS.TASK_PRIORITY_UPDATED, {
                taskId: task.id,
                oldPriority: basePriority,
                newPriority: newPriority
            });
            if (softDepAdjustment > 0) {
                this.eventBus?.publish(EventConstants_1.DOMAIN_EVENTS.TASK_SOFT_DEPENDENCY_SATISFIED, {
                    taskId: task.id,
                    task,
                    satisfiedDependencies: task.prefers || []
                });
            }
        }
    }
    updateQueueMetrics() {
        if (!this.metricsService)
            return;
        const tasks = this.getTasks();
        const stats = this.getTaskStats();
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
exports.TaskQueue = TaskQueue;
//# sourceMappingURL=TaskQueue.js.map