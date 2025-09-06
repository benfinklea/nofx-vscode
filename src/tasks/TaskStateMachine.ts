import { Task, TaskStatus, TaskValidationError } from '../agents/types';
import { ILoggingService, IEventBus, ITaskStateMachine, ITaskReader } from '../services/interfaces';
import { DOMAIN_EVENTS } from '../services/EventConstants';

export class TaskStateMachine implements ITaskStateMachine {
    private readonly logger: ILoggingService;
    private readonly eventBus: IEventBus;
    private taskReader?: ITaskReader;

    // State transition rules
    private readonly validTransitions: Map<TaskStatus, TaskStatus[]> = new Map([
        ['queued', ['validated', 'failed']],
        ['validated', ['ready', 'blocked', 'failed']],
        ['ready', ['assigned', 'blocked', 'failed']],
        ['assigned', ['in-progress', 'blocked', 'failed']],
        ['in-progress', ['completed', 'failed', 'blocked']],
        ['blocked', ['ready', 'failed']],
        ['completed', []], // Terminal state
        ['failed', ['ready']] // Can retry failed tasks
    ]);

    // Required fields for each state
    private readonly requiredFields: Map<TaskStatus, string[]> = new Map([
        ['assigned', ['assignedTo']],
        ['in-progress', ['assignedTo']]
        // Note: 'completed' removed from requiredFields since completedAt is set during transition
    ]);

    constructor(loggingService: ILoggingService, eventBus: IEventBus, taskReader?: ITaskReader) {
        this.logger = loggingService;
        this.eventBus = eventBus;
        this.taskReader = taskReader;
    }

    /**
     * Sets the task reader for dependency validation
     */
    setTaskReader(taskReader: ITaskReader): void {
        this.taskReader = taskReader;
    }

    /**
     * Validates if a transition from currentState to nextState is allowed
     */
    validateTransition(currentState: TaskStatus, nextState: TaskStatus): boolean {
        const allowedTransitions = this.validTransitions.get(currentState);
        return allowedTransitions ? allowedTransitions.includes(nextState) : false;
    }

    /**
     * Transitions a task to the next state, returning validation errors if invalid
     */
    transition(task: Task, nextState: TaskStatus): TaskValidationError[] {
        const errors: TaskValidationError[] = [];

        // Check if transition is valid
        if (!this.validateTransition(task.status, nextState)) {
            errors.push({
                field: 'status',
                message: `Invalid transition from ${task.status} to ${nextState}`,
                code: 'INVALID_TRANSITION'
            });
            return errors;
        }

        // Check required fields for the target state
        const requiredFields = this.requiredFields.get(nextState) || [];
        for (const field of requiredFields) {
            if (!(task as any)[field]) {
                errors.push({
                    field,
                    message: `Field ${field} is required for state ${nextState}`,
                    code: 'MISSING_REQUIRED_FIELD'
                });
            }
        }

        // Check dependency completeness when transitioning to ready
        if (nextState === 'ready') {
            const readinessErrors = this.validateReadiness(task);
            if (readinessErrors.length > 0) {
                errors.push(...readinessErrors);
            }
        }

        // If no errors, perform the transition
        if (errors.length === 0) {
            const previousState = task.status;
            task.status = nextState;

            // Clear assignedTo when transitioning back to non-assigned states
            if (this.shouldClearAssignment(previousState, nextState)) {
                task.assignedTo = undefined;
            }

            // Clear assignedTo on completed/failed to avoid lingering assignee in terminal states
            if (nextState === 'completed' || nextState === 'failed') {
                task.assignedTo = undefined;
            }

            // Set completion timestamp if transitioning to completed
            if (nextState === 'completed' && !task.completedAt) {
                task.completedAt = new Date();
            }

            this.logger.info(`Task ${task.id} transitioned from ${previousState} to ${nextState}`);

            // Publish state change event
            this.eventBus.publish(DOMAIN_EVENTS.TASK_STATE_CHANGED, {
                taskId: task.id,
                previousState,
                newState: nextState,
                task
            });

            // Publish specific state events
            if (nextState === 'blocked') {
                this.eventBus.publish(DOMAIN_EVENTS.TASK_BLOCKED, { taskId: task.id, task });
            } else if (nextState === 'ready') {
                this.eventBus.publish(DOMAIN_EVENTS.TASK_READY, { taskId: task.id, task });
            } else if (nextState === 'assigned') {
                this.eventBus.publish(DOMAIN_EVENTS.TASK_ASSIGNED, { taskId: task.id, task });
            } else if (nextState === 'completed') {
                this.eventBus.publish(DOMAIN_EVENTS.TASK_COMPLETED, { taskId: task.id, task });
            } else if (nextState === 'failed') {
                this.eventBus.publish(DOMAIN_EVENTS.TASK_FAILED, { taskId: task.id, task });
            }
        }

        return errors;
    }

    /**
     * Gets all valid transitions from the current state
     */
    getValidTransitions(currentState: TaskStatus): TaskStatus[] {
        return this.validTransitions.get(currentState) || [];
    }

    /**
     * Checks if a state is terminal (no further transitions allowed)
     */
    isTerminalState(state: TaskStatus): boolean {
        const transitions = this.validTransitions.get(state);
        return !transitions || transitions.length === 0;
    }

    /**
     * Checks if a state is valid
     */
    isValidState(state: string): boolean {
        return this.validTransitions.has(state as TaskStatus);
    }

    /**
     * Gets the initial state for new tasks
     */
    getInitialState(): TaskStatus {
        return 'queued';
    }

    /**
     * Validates a task's current state and required fields
     */
    validateTaskState(task: Task): TaskValidationError[] {
        const errors: TaskValidationError[] = [];

        // Check if state is valid
        if (!this.isValidState(task.status)) {
            errors.push({
                field: 'status',
                message: `Invalid task state: ${task.status}`,
                code: 'INVALID_STATE'
            });
        }

        // Check required fields for current state
        const requiredFields = this.requiredFields.get(task.status) || [];
        for (const field of requiredFields) {
            if (!(task as any)[field]) {
                errors.push({
                    field,
                    message: `Field ${field} is required for state ${task.status}`,
                    code: 'MISSING_REQUIRED_FIELD'
                });
            }
        }

        return errors;
    }

    /**
     * Gets the state machine configuration for debugging
     */
    getStateMachineConfig(): { transitions: Map<TaskStatus, TaskStatus[]>, requiredFields: Map<TaskStatus, string[]> } {
        return {
            transitions: new Map(this.validTransitions),
            requiredFields: new Map(this.requiredFields)
        };
    }

    /**
     * Validates that all dependencies are completed before transitioning to ready state
     */
    private validateReadiness(task: Task): TaskValidationError[] {
        const errors: TaskValidationError[] = [];

        // If no dependencies, task is ready - return immediately
        if (!task.dependsOn || task.dependsOn.length === 0) {
            return errors;
        }

        // If no task reader available, allow transition (return empty errors)
        // This prevents blocking tasks when dependency validation is unavailable
        if (!this.taskReader) {
            this.logger.debug('TaskStateMachine: No task reader available for readiness validation - allowing transition');
            return errors;
        }

        // Get all tasks to build dependency map
        const allTasks = this.taskReader.getTasks();
        const taskMap = new Map(allTasks.map(t => [t.id, t]));

        // Check each dependency
        for (const depId of task.dependsOn) {
            const depTask = taskMap.get(depId);

            if (!depTask) {
                errors.push({
                    field: 'dependsOn',
                    message: `Dependency task ${depId} does not exist`,
                    code: 'MISSING_DEPENDENCY'
                });
            } else if (depTask.status !== 'completed') {
                errors.push({
                    field: 'dependsOn',
                    message: `Dependency task ${depId} is not completed (status: ${depTask.status})`,
                    code: 'DEPENDENCIES_NOT_SATISFIED'
                });
            }
        }

        return errors;
    }

    /**
     * Determines if assignment should be cleared when transitioning states
     *
     * Policy: assignedTo is retained when transitioning assigned -> blocked because:
     * - The task remains assigned to the agent, just temporarily blocked
     * - The agent should be aware they have a blocked task
     * - When unblocked, the task can continue with the same agent
     */
    private shouldClearAssignment(previousState: TaskStatus, nextState: TaskStatus): boolean {
        // Clear assignment when transitioning from assigned states to non-assigned states
        const assignedStates: TaskStatus[] = ['assigned', 'in-progress', 'failed', 'blocked'];
        const nonAssignedStates: TaskStatus[] = ['ready', 'validated'];

        return assignedStates.includes(previousState) && nonAssignedStates.includes(nextState);
    }

    dispose(): void {
        this.logger.debug('TaskStateMachine disposed');
    }
}
