import { Task, TaskValidationError } from '../agents/types';
import { ILoggingService, IEventBus, INotificationService, ITaskDependencyManager } from '../services/interfaces';
import { DOMAIN_EVENTS } from '../services/EventConstants';

interface DependencyGraph {
    [taskId: string]: string[]; // Maps task ID to its dependencies
}

interface SoftDependencyGraph {
    [taskId: string]: string[]; // Maps task ID to its soft dependencies (prefers)
}

interface ConflictInfo {
    taskId: string;
    conflictingTasks: string[];
    reason: string;
}

export class TaskDependencyManager implements ITaskDependencyManager {
    private readonly logger: ILoggingService;
    private readonly eventBus: IEventBus;
    private readonly notificationService: INotificationService;
    private dependencyGraph: DependencyGraph = {};
    private softDependencyGraph: SoftDependencyGraph = {};
    private conflicts: Map<string, ConflictInfo> = new Map();
    private lastConflictResolvedState: Map<string, boolean> = new Map(); // Track last published state

    constructor(
        loggingService: ILoggingService,
        eventBus: IEventBus,
        notificationService: INotificationService
    ) {
        this.logger = loggingService;
        this.eventBus = eventBus;
        this.notificationService = notificationService;
    }

    /**
     * Adds a dependency between two tasks
     */
    addDependency(taskId: string, dependsOnTaskId: string): boolean {
        if (taskId === dependsOnTaskId) {
            this.logger.warn(`Cannot add self-dependency for task ${taskId}`);
            return false;
        }

        // Initialize dependency arrays if needed
        if (!this.dependencyGraph[taskId]) {
            this.dependencyGraph[taskId] = [];
        }

        // Check if dependency already exists
        if (this.dependencyGraph[taskId].includes(dependsOnTaskId)) {
            this.logger.debug(`Dependency already exists: ${taskId} -> ${dependsOnTaskId}`);
            return true;
        }

        // Add the dependency
        this.dependencyGraph[taskId].push(dependsOnTaskId);

        // Check for cycles
        const cycles = this.detectCyclesFromTask(taskId);
        if (cycles.length > 0) {
            // Remove the dependency if it creates a cycle
            this.dependencyGraph[taskId] = this.dependencyGraph[taskId].filter(id => id !== dependsOnTaskId);
            this.logger.warn(`Dependency ${taskId} -> ${dependsOnTaskId} creates cycle, not added`);
            return false;
        }

        this.logger.info(`Added dependency: ${taskId} -> ${dependsOnTaskId}`);
        this.eventBus.publish(DOMAIN_EVENTS.TASK_DEPENDENCY_ADDED, { taskId, dependsOnTaskId });
        return true;
    }

    /**
     * Removes a dependency between two tasks
     */
    removeDependency(taskId: string, dependsOnTaskId: string): void {
        if (!this.dependencyGraph[taskId]) {
            return;
        }

        const index = this.dependencyGraph[taskId].indexOf(dependsOnTaskId);
        if (index > -1) {
            this.dependencyGraph[taskId].splice(index, 1);
            this.logger.info(`Removed dependency: ${taskId} -> ${dependsOnTaskId}`);
            this.eventBus.publish(DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED, { taskId, dependsOnTaskId });
        }
    }

    /**
     * Adds a soft dependency (prefers) between two tasks
     */
    addSoftDependency(taskId: string, prefersTaskId: string): boolean {
        if (taskId === prefersTaskId) {
            this.logger.warn(`Cannot add self-soft-dependency for task ${taskId}`);
            return false;
        }

        // Initialize soft dependency arrays if needed
        if (!this.softDependencyGraph[taskId]) {
            this.softDependencyGraph[taskId] = [];
        }

        // Check if soft dependency already exists
        if (this.softDependencyGraph[taskId].includes(prefersTaskId)) {
            this.logger.debug(`Soft dependency already exists: ${taskId} -> ${prefersTaskId}`);
            return true;
        }

        // Add the soft dependency
        this.softDependencyGraph[taskId].push(prefersTaskId);

        this.logger.info(`Added soft dependency: ${taskId} -> ${prefersTaskId}`);
        this.eventBus.publish(DOMAIN_EVENTS.TASK_SOFT_DEPENDENCY_ADDED, { taskId, prefersTaskId });
        return true;
    }

    /**
     * Removes a soft dependency between two tasks
     */
    removeSoftDependency(taskId: string, prefersTaskId: string): void {
        if (!this.softDependencyGraph[taskId]) {
            return;
        }

        const index = this.softDependencyGraph[taskId].indexOf(prefersTaskId);
        if (index > -1) {
            this.softDependencyGraph[taskId].splice(index, 1);
            this.logger.info(`Removed soft dependency: ${taskId} -> ${prefersTaskId}`);
            this.eventBus.publish(DOMAIN_EVENTS.TASK_SOFT_DEPENDENCY_REMOVED, { taskId, prefersTaskId });
        }
    }

    /**
     * Validates dependencies for a task
     */
    validateDependencies(task: Task, allTasks?: Task[]): TaskValidationError[] {
        const errors: TaskValidationError[] = [];
        const dependencies = task.dependsOn || [];
        const softDependencies = task.prefers || [];

        // If allTasks is provided, build the dependency graph from tasks for cycle checks
        if (allTasks) {
            this.buildDependencyGraphFromTasks(allTasks);
            
            // Verify each dependency exists in the task set
            const taskMap = new Map(allTasks.map(t => [t.id, t]));
            for (const depId of dependencies) {
                if (!taskMap.has(depId)) {
                    errors.push({
                        field: 'dependsOn',
                        message: `Referenced task ${depId} does not exist`,
                        code: 'MISSING_DEPENDENCY'
                    });
                }
            }

            // Verify each soft dependency exists in the task set
            for (const prefId of softDependencies) {
                if (!taskMap.has(prefId)) {
                    errors.push({
                        field: 'prefers',
                        message: `Referenced preferred task ${prefId} does not exist`,
                        code: 'MISSING_SOFT_DEPENDENCY'
                    });
                }
            }
        }

        // Check for cycles using the synchronized graph (only hard dependencies create cycles)
        const cycles = this.detectCyclesFromTask(task.id);
        if (cycles.length > 0) {
            errors.push({
                field: 'dependsOn',
                message: `Task ${task.id} is part of a circular dependency`,
                code: 'CIRCULAR_DEPENDENCY'
            });
        }

        return errors;
    }

    /**
     * Gets tasks that are ready to be executed (all dependencies completed)
     */
    getReadyTasks(allTasks: Task[]): Task[] {
        // Rebuild dependency graph from tasks before evaluation
        this.buildDependencyGraphFromTasks(allTasks);
        
        const readyTasks: Task[] = [];
        const taskMap = new Map(allTasks.map(task => [task.id, task]));

        for (const task of allTasks) {
            const wasBlocked = task.status === 'blocked' || (task.blockedBy && task.blockedBy.length > 0);
            if (this.isTaskReady(task, taskMap)) {
                readyTasks.push(task);
                
                // Emit dependency resolution event if task was previously blocked
                if (wasBlocked) {
                    this.eventBus.publish(DOMAIN_EVENTS.TASK_DEPENDENCY_RESOLVED, {
                        taskId: task.id,
                        task,
                        resolvedDependencies: task.dependsOn || []
                    });
                }
            }
        }

        return readyTasks;
    }

    /**
     * Detects cycles in the dependency graph
     */
    detectCycles(tasks: Task[]): string[][] {
        const cycles: string[][] = [];
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        // Build dependency graph from tasks
        this.buildDependencyGraphFromTasks(tasks);

        for (const task of tasks) {
            if (!visited.has(task.id)) {
                const cycle = this.detectCycleDFS(task.id, visited, recursionStack);
                if (cycle.length > 0) {
                    cycles.push(cycle);
                }
            }
        }

        return cycles;
    }

    /**
     * Checks for conflicts between a task and active tasks
     */
    checkConflicts(task: Task, activeTasks: Task[]): string[] {
        const conflicts: string[] = [];
        const taskFiles = new Set(task.files || []);
        const hadConflicts = this.conflicts.has(task.id);
        
        // Store previous conflicts before computing/clearing
        const prevConflicts = (task.conflictsWith || []).slice();

        for (const activeTask of activeTasks) {
            if (activeTask.id === task.id) {
                continue; // Skip self
            }

            const activeFiles = new Set(activeTask.files || []);
            const intersection = new Set(Array.from(taskFiles).filter(file => activeFiles.has(file)));

            if (intersection.size > 0) {
                conflicts.push(activeTask.id);
                this.logger.warn(`Conflict detected between tasks ${task.id} and ${activeTask.id} on files: ${Array.from(intersection).join(', ')}`);
            }
        }

        if (conflicts.length > 0) {
            this.conflicts.set(task.id, {
                taskId: task.id,
                conflictingTasks: conflicts,
                reason: `File overlap with tasks: ${conflicts.join(', ')}`
            });

            // Set conflictsWith on the task object
            task.conflictsWith = conflicts;
            
            // Reset resolved state when new conflicts are detected
            this.lastConflictResolvedState.set(task.id, false);

            this.eventBus.publish(DOMAIN_EVENTS.TASK_CONFLICT_DETECTED, {
                taskId: task.id,
                conflictingTasks: conflicts,
                reason: this.conflicts.get(task.id)?.reason
            });
        } else if (conflicts.length === 0 && (this.conflicts.has(task.id) || prevConflicts.length > 0)) {
            // Clear conflict state when no conflicts are detected
            this.conflicts.delete(task.id);
            task.conflictsWith = [];
            task.blockedBy = (task.blockedBy || []).filter(id => !prevConflicts.includes(id));
            
            // Guard against duplicate publishes - only publish if state changed
            const wasResolved = this.lastConflictResolvedState.get(task.id) || false;
            if (!wasResolved) {
                this.eventBus.publish(DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, { 
                    taskId: task.id, 
                    resolution: 'auto' 
                });
                this.lastConflictResolvedState.set(task.id, true);
            }
        }

        return conflicts;
    }

    /**
     * Resolves a conflict for a task
     */
    resolveConflict(taskId: string, resolution: 'block' | 'allow' | 'merge'): boolean {
        const conflict = this.conflicts.get(taskId);
        if (!conflict) {
            return false;
        }

        switch (resolution) {
            case 'block':
                // Keep the conflict entry and publish a distinct event
                this.logger.info(`Resolved conflict for task ${taskId} by blocking`);
                this.eventBus.publish(DOMAIN_EVENTS.TASK_CONFLICT_DECISION, { taskId, resolution });
                break;
            case 'allow':
                // Allow the task to proceed (remove from conflicts)
                this.conflicts.delete(taskId);
                this.logger.info(`Resolved conflict for task ${taskId} by allowing`);
                this.eventBus.publish(DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, { taskId, resolution });
                break;
            case 'merge':
                // Merge with conflicting tasks (complex logic would go here)
                this.conflicts.delete(taskId);
                this.logger.info(`Resolved conflict for task ${taskId} by merging`);
                this.eventBus.publish(DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, { taskId, resolution });
                break;
        }

        return true;
    }

    /**
     * Gets the dependency chain for a task
     */
    getDependencyChain(taskId: string): string[] {
        const chain: string[] = [];
        const visited = new Set<string>();

        this.buildDependencyChain(taskId, chain, visited);
        return chain;
    }

    /**
     * Gets tasks that depend on a specific task
     */
    getDependentTasks(taskId: string): string[] {
        const dependents: string[] = [];

        for (const [candidateId, deps] of Object.entries(this.dependencyGraph)) {
            if (deps.includes(taskId)) {
                dependents.push(candidateId);
            }
        }

        return dependents;
    }

    /**
     * Gets tasks that have soft dependencies (prefers) on a specific task
     */
    getSoftDependents(taskId: string): string[] {
        const softDependents: string[] = [];

        for (const [candidateId, softDeps] of Object.entries(this.softDependencyGraph)) {
            if (softDeps.includes(taskId)) {
                softDependents.push(candidateId);
            }
        }

        return softDependents;
    }

    /**
     * Gets the dependency graph for visualization
     */
    getDependencyGraph(): DependencyGraph {
        return { ...this.dependencyGraph };
    }

    /**
     * Gets the soft dependency graph for visualization
     */
    getSoftDependencyGraph(): SoftDependencyGraph {
        return { ...this.softDependencyGraph };
    }

    /**
     * Gets all current conflicts
     */
    getConflicts(): ConflictInfo[] {
        return Array.from(this.conflicts.values());
    }

    /**
     * Checks if a task is ready (all dependencies completed)
     */
    private isTaskReady(task: Task, taskMap: Map<string, Task>): boolean {
        const dependencies = this.dependencyGraph[task.id] || [];
        
        for (const depId of dependencies) {
            const depTask = taskMap.get(depId);
            if (!depTask || depTask.status !== 'completed') {
                return false;
            }
        }

        return true;
    }

    /**
     * Detects cycles using DFS from a specific task
     */
    private detectCyclesFromTask(taskId: string): string[][] {
        const cycles: string[][] = [];
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const cycle = this.detectCycleDFS(taskId, visited, recursionStack);
        if (cycle.length > 0) {
            cycles.push(cycle);
        }

        return cycles;
    }

    /**
     * DFS-based cycle detection
     */
    private detectCycleDFS(taskId: string, visited: Set<string>, recursionStack: Set<string>): string[] {
        visited.add(taskId);
        recursionStack.add(taskId);

        const dependencies = this.dependencyGraph[taskId] || [];
        for (const depId of dependencies) {
            if (!visited.has(depId)) {
                const cycle = this.detectCycleDFS(depId, visited, recursionStack);
                if (cycle.length > 0) {
                    return cycle;
                }
            } else if (recursionStack.has(depId)) {
                // Found a cycle - build precise cycle path from recursion stack
                return this.buildPreciseCyclePath(depId, recursionStack);
            }
        }

        recursionStack.delete(taskId);
        return [];
    }

    /**
     * Builds the cycle path from the cycle start to the current task
     */
    private buildCyclePath(cycleStart: string, currentTask: string): string[] {
        const path: string[] = [cycleStart];
        let current = currentTask;

        while (current !== cycleStart) {
            path.push(current);
            const dependencies = this.dependencyGraph[current] || [];
            if (dependencies.length > 0) {
                current = dependencies[0]; // Take first dependency (simplified)
            } else {
                break;
            }
        }

        return path;
    }

    /**
     * Builds precise cycle path from recursion stack
     */
    private buildPreciseCyclePath(cycleStart: string, recursionStack: Set<string>): string[] {
        const cyclePath: string[] = [];
        const stackArray = Array.from(recursionStack);
        
        // Find the index of the cycle start in the recursion stack
        const startIndex = stackArray.indexOf(cycleStart);
        if (startIndex === -1) {
            return [cycleStart]; // Fallback
        }
        
        // Extract the cycle from the recursion stack
        for (let i = startIndex; i < stackArray.length; i++) {
            cyclePath.push(stackArray[i]);
        }
        
        // Add the cycle start at the end to complete the cycle
        cyclePath.push(cycleStart);
        
        return cyclePath;
    }

    /**
     * Builds dependency graph from task list
     */
    private buildDependencyGraphFromTasks(tasks: Task[]): void {
        this.dependencyGraph = {};
        this.softDependencyGraph = {};

        for (const task of tasks) {
            if (task.dependsOn && task.dependsOn.length > 0) {
                this.dependencyGraph[task.id] = [...task.dependsOn];
            }
            if (task.prefers && task.prefers.length > 0) {
                this.softDependencyGraph[task.id] = [...task.prefers];
            }
        }
    }

    /**
     * Builds dependency chain recursively
     */
    private buildDependencyChain(taskId: string, chain: string[], visited: Set<string>): void {
        if (visited.has(taskId)) {
            return;
        }

        visited.add(taskId);
        chain.push(taskId);

        const dependencies = this.dependencyGraph[taskId] || [];
        for (const depId of dependencies) {
            this.buildDependencyChain(depId, chain, visited);
        }
    }

    /**
     * Gets topological sort of tasks (execution order)
     */
    getTopologicalSort(tasks: Task[]): Task[] {
        this.buildDependencyGraphFromTasks(tasks);
        const visited = new Set<string>();
        const tempVisited = new Set<string>();
        const result: Task[] = [];
        const taskMap = new Map(tasks.map(task => [task.id, task]));

        for (const task of tasks) {
            if (!visited.has(task.id)) {
                this.topologicalSortDFS(task.id, taskMap, visited, tempVisited, result);
            }
        }

        return result.reverse(); // Reverse to get correct order
    }

    /**
     * DFS for topological sort
     */
    private topologicalSortDFS(
        taskId: string,
        taskMap: Map<string, Task>,
        visited: Set<string>,
        tempVisited: Set<string>,
        result: Task[]
    ): void {
        if (tempVisited.has(taskId)) {
            throw new Error(`Circular dependency detected involving task ${taskId}`);
        }

        if (visited.has(taskId)) {
            return;
        }

        tempVisited.add(taskId);

        const dependencies = this.dependencyGraph[taskId] || [];
        for (const depId of dependencies) {
            this.topologicalSortDFS(depId, taskMap, visited, tempVisited, result);
        }

        tempVisited.delete(taskId);
        visited.add(taskId);
        result.push(taskMap.get(taskId)!);
    }

    dispose(): void {
        this.dependencyGraph = {};
        this.softDependencyGraph = {};
        this.conflicts.clear();
        this.lastConflictResolvedState.clear();
        this.logger.debug('TaskDependencyManager disposed');
    }
}
