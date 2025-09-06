"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskStateMachine = void 0;
const EventConstants_1 = require("../services/EventConstants");
class TaskStateMachine {
    constructor(loggingService, eventBus, taskReader) {
        this.validTransitions = new Map([
            ['queued', ['validated', 'failed']],
            ['validated', ['ready', 'blocked', 'failed']],
            ['ready', ['assigned', 'blocked', 'failed']],
            ['assigned', ['in-progress', 'blocked', 'failed']],
            ['in-progress', ['completed', 'failed', 'blocked']],
            ['blocked', ['ready', 'failed']],
            ['completed', []],
            ['failed', ['ready']]
        ]);
        this.requiredFields = new Map([
            ['assigned', ['assignedTo']],
            ['in-progress', ['assignedTo']]
        ]);
        this.logger = loggingService;
        this.eventBus = eventBus;
        this.taskReader = taskReader;
    }
    setTaskReader(taskReader) {
        this.taskReader = taskReader;
    }
    validateTransition(currentState, nextState) {
        const allowedTransitions = this.validTransitions.get(currentState);
        return allowedTransitions ? allowedTransitions.includes(nextState) : false;
    }
    transition(task, nextState) {
        const errors = [];
        if (!this.validateTransition(task.status, nextState)) {
            errors.push({
                field: 'status',
                message: `Invalid transition from ${task.status} to ${nextState}`,
                code: 'INVALID_TRANSITION'
            });
            return errors;
        }
        const requiredFields = this.requiredFields.get(nextState) || [];
        for (const field of requiredFields) {
            if (!task[field]) {
                errors.push({
                    field,
                    message: `Field ${field} is required for state ${nextState}`,
                    code: 'MISSING_REQUIRED_FIELD'
                });
            }
        }
        if (nextState === 'ready') {
            const readinessErrors = this.validateReadiness(task);
            if (readinessErrors.length > 0) {
                errors.push(...readinessErrors);
            }
        }
        if (errors.length === 0) {
            const previousState = task.status;
            task.status = nextState;
            if (this.shouldClearAssignment(previousState, nextState)) {
                task.assignedTo = undefined;
            }
            if (nextState === 'completed' || nextState === 'failed') {
                task.assignedTo = undefined;
            }
            if (nextState === 'completed' && !task.completedAt) {
                task.completedAt = new Date();
            }
            this.logger.info(`Task ${task.id} transitioned from ${previousState} to ${nextState}`);
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_STATE_CHANGED, {
                taskId: task.id,
                previousState,
                newState: nextState,
                task
            });
            if (nextState === 'blocked') {
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_BLOCKED, { taskId: task.id, task });
            }
            else if (nextState === 'ready') {
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_READY, { taskId: task.id, task });
            }
            else if (nextState === 'assigned') {
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_ASSIGNED, { taskId: task.id, task });
            }
            else if (nextState === 'completed') {
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_COMPLETED, { taskId: task.id, task });
            }
            else if (nextState === 'failed') {
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_FAILED, { taskId: task.id, task });
            }
        }
        return errors;
    }
    getValidTransitions(currentState) {
        return this.validTransitions.get(currentState) || [];
    }
    isTerminalState(state) {
        const transitions = this.validTransitions.get(state);
        return !transitions || transitions.length === 0;
    }
    isValidState(state) {
        return this.validTransitions.has(state);
    }
    getInitialState() {
        return 'queued';
    }
    validateTaskState(task) {
        const errors = [];
        if (!this.isValidState(task.status)) {
            errors.push({
                field: 'status',
                message: `Invalid task state: ${task.status}`,
                code: 'INVALID_STATE'
            });
        }
        const requiredFields = this.requiredFields.get(task.status) || [];
        for (const field of requiredFields) {
            if (!task[field]) {
                errors.push({
                    field,
                    message: `Field ${field} is required for state ${task.status}`,
                    code: 'MISSING_REQUIRED_FIELD'
                });
            }
        }
        return errors;
    }
    getStateMachineConfig() {
        return {
            transitions: new Map(this.validTransitions),
            requiredFields: new Map(this.requiredFields)
        };
    }
    validateReadiness(task) {
        const errors = [];
        if (!task.dependsOn || task.dependsOn.length === 0) {
            return errors;
        }
        if (!this.taskReader) {
            this.logger.debug('TaskStateMachine: No task reader available for readiness validation - allowing transition');
            return errors;
        }
        const allTasks = this.taskReader.getTasks();
        const taskMap = new Map(allTasks.map(t => [t.id, t]));
        for (const depId of task.dependsOn) {
            const depTask = taskMap.get(depId);
            if (!depTask) {
                errors.push({
                    field: 'dependsOn',
                    message: `Dependency task ${depId} does not exist`,
                    code: 'MISSING_DEPENDENCY'
                });
            }
            else if (depTask.status !== 'completed') {
                errors.push({
                    field: 'dependsOn',
                    message: `Dependency task ${depId} is not completed (status: ${depTask.status})`,
                    code: 'DEPENDENCIES_NOT_SATISFIED'
                });
            }
        }
        return errors;
    }
    shouldClearAssignment(previousState, nextState) {
        const assignedStates = ['assigned', 'in-progress', 'failed', 'blocked'];
        const nonAssignedStates = ['ready', 'validated'];
        return assignedStates.includes(previousState) && nonAssignedStates.includes(nextState);
    }
    dispose() {
        this.logger.debug('TaskStateMachine disposed');
    }
}
exports.TaskStateMachine = TaskStateMachine;
//# sourceMappingURL=TaskStateMachine.js.map