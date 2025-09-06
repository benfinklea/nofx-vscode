"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskDependencyManager = void 0;
const EventConstants_1 = require("../services/EventConstants");
class TaskDependencyManager {
    constructor(loggingService, eventBus, notificationService) {
        this.dependencyGraph = {};
        this.softDependencyGraph = {};
        this.conflicts = new Map();
        this.lastConflictResolvedState = new Map();
        this.logger = loggingService;
        this.eventBus = eventBus;
        this.notificationService = notificationService;
    }
    addDependency(taskId, dependsOnTaskId) {
        if (taskId === dependsOnTaskId) {
            this.logger.warn(`Cannot add self-dependency for task ${taskId}`);
            return false;
        }
        if (!this.dependencyGraph[taskId]) {
            this.dependencyGraph[taskId] = [];
        }
        if (this.dependencyGraph[taskId].includes(dependsOnTaskId)) {
            this.logger.debug(`Dependency already exists: ${taskId} -> ${dependsOnTaskId}`);
            return true;
        }
        this.dependencyGraph[taskId].push(dependsOnTaskId);
        const cycles = this.detectCyclesFromTask(taskId);
        if (cycles.length > 0) {
            this.dependencyGraph[taskId] = this.dependencyGraph[taskId].filter(id => id !== dependsOnTaskId);
            this.logger.warn(`Dependency ${taskId} -> ${dependsOnTaskId} creates cycle, not added`);
            return false;
        }
        this.logger.info(`Added dependency: ${taskId} -> ${dependsOnTaskId}`);
        this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_ADDED, { taskId, dependsOnTaskId });
        return true;
    }
    removeDependency(taskId, dependsOnTaskId) {
        if (!this.dependencyGraph[taskId]) {
            return;
        }
        const index = this.dependencyGraph[taskId].indexOf(dependsOnTaskId);
        if (index > -1) {
            this.dependencyGraph[taskId].splice(index, 1);
            this.logger.info(`Removed dependency: ${taskId} -> ${dependsOnTaskId}`);
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED, { taskId, dependsOnTaskId });
        }
    }
    addSoftDependency(taskId, prefersTaskId) {
        if (taskId === prefersTaskId) {
            this.logger.warn(`Cannot add self-soft-dependency for task ${taskId}`);
            return false;
        }
        if (!this.softDependencyGraph[taskId]) {
            this.softDependencyGraph[taskId] = [];
        }
        if (this.softDependencyGraph[taskId].includes(prefersTaskId)) {
            this.logger.debug(`Soft dependency already exists: ${taskId} -> ${prefersTaskId}`);
            return true;
        }
        this.softDependencyGraph[taskId].push(prefersTaskId);
        this.logger.info(`Added soft dependency: ${taskId} -> ${prefersTaskId}`);
        this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_SOFT_DEPENDENCY_ADDED, { taskId, prefersTaskId });
        return true;
    }
    removeSoftDependency(taskId, prefersTaskId) {
        if (!this.softDependencyGraph[taskId]) {
            return;
        }
        const index = this.softDependencyGraph[taskId].indexOf(prefersTaskId);
        if (index > -1) {
            this.softDependencyGraph[taskId].splice(index, 1);
            this.logger.info(`Removed soft dependency: ${taskId} -> ${prefersTaskId}`);
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_SOFT_DEPENDENCY_REMOVED, { taskId, prefersTaskId });
        }
    }
    validateDependencies(task, allTasks) {
        const errors = [];
        const dependencies = task.dependsOn || [];
        const softDependencies = task.prefers || [];
        if (allTasks) {
            this.buildDependencyGraphFromTasks(allTasks);
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
    getReadyTasks(allTasks) {
        this.buildDependencyGraphFromTasks(allTasks);
        const readyTasks = [];
        const taskMap = new Map(allTasks.map(task => [task.id, task]));
        for (const task of allTasks) {
            const wasBlocked = task.status === 'blocked' || (task.blockedBy && task.blockedBy.length > 0);
            if (this.isTaskReady(task, taskMap)) {
                readyTasks.push(task);
                if (wasBlocked) {
                    this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_RESOLVED, {
                        taskId: task.id,
                        task,
                        resolvedDependencies: task.dependsOn || []
                    });
                }
            }
        }
        return readyTasks;
    }
    detectCycles(tasks) {
        const cycles = [];
        const visited = new Set();
        const recursionStack = new Set();
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
    checkConflicts(task, activeTasks) {
        const conflicts = [];
        const taskFiles = new Set(task.files || []);
        const hadConflicts = this.conflicts.has(task.id);
        const prevConflicts = (task.conflictsWith || []).slice();
        for (const activeTask of activeTasks) {
            if (activeTask.id === task.id) {
                continue;
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
            task.conflictsWith = conflicts;
            this.lastConflictResolvedState.set(task.id, false);
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_CONFLICT_DETECTED, {
                taskId: task.id,
                conflictingTasks: conflicts,
                reason: this.conflicts.get(task.id)?.reason
            });
        }
        else if (conflicts.length === 0 && (this.conflicts.has(task.id) || prevConflicts.length > 0)) {
            this.conflicts.delete(task.id);
            task.conflictsWith = [];
            task.blockedBy = (task.blockedBy || []).filter(id => !prevConflicts.includes(id));
            const wasResolved = this.lastConflictResolvedState.get(task.id) || false;
            if (!wasResolved) {
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, {
                    taskId: task.id,
                    resolution: 'auto'
                });
                this.lastConflictResolvedState.set(task.id, true);
            }
        }
        return conflicts;
    }
    resolveConflict(taskId, resolution, task) {
        const conflict = this.conflicts.get(taskId);
        if (!conflict) {
            return false;
        }
        switch (resolution) {
            case 'block':
                this.logger.info(`Resolved conflict for task ${taskId} by blocking`);
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_CONFLICT_DECISION, { taskId, resolution });
                break;
            case 'allow':
            case 'merge':
                this.conflicts.delete(taskId);
                if (task) {
                    task.conflictsWith = [];
                    task.blockedBy = (task.blockedBy || []).filter(id => !conflict.conflictingTasks.includes(id));
                }
                this.logger.info(`Resolved conflict for task ${taskId} by ${resolution}`);
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, { taskId, resolution });
                break;
        }
        return true;
    }
    getDependencyChain(taskId) {
        const chain = [];
        const visited = new Set();
        this.buildDependencyChain(taskId, chain, visited);
        return chain;
    }
    getDependentTasks(taskId) {
        const dependents = [];
        for (const [candidateId, deps] of Object.entries(this.dependencyGraph)) {
            if (deps.includes(taskId)) {
                dependents.push(candidateId);
            }
        }
        return dependents;
    }
    getSoftDependents(taskId) {
        const softDependents = [];
        for (const [candidateId, softDeps] of Object.entries(this.softDependencyGraph)) {
            if (softDeps.includes(taskId)) {
                softDependents.push(candidateId);
            }
        }
        return softDependents;
    }
    getDependencyGraph() {
        return { ...this.dependencyGraph };
    }
    getSoftDependencyGraph() {
        return { ...this.softDependencyGraph };
    }
    getConflicts() {
        return Array.from(this.conflicts.values());
    }
    isTaskReady(task, taskMap) {
        const dependencies = this.dependencyGraph[task.id] || [];
        for (const depId of dependencies) {
            const depTask = taskMap.get(depId);
            if (!depTask || depTask.status !== 'completed') {
                return false;
            }
        }
        return true;
    }
    detectCyclesFromTask(taskId) {
        const cycles = [];
        const visited = new Set();
        const recursionStack = new Set();
        const cycle = this.detectCycleDFS(taskId, visited, recursionStack);
        if (cycle.length > 0) {
            cycles.push(cycle);
        }
        return cycles;
    }
    detectCycleDFS(taskId, visited, recursionStack) {
        visited.add(taskId);
        recursionStack.add(taskId);
        const dependencies = this.dependencyGraph[taskId] || [];
        for (const depId of dependencies) {
            if (!visited.has(depId)) {
                const cycle = this.detectCycleDFS(depId, visited, recursionStack);
                if (cycle.length > 0) {
                    return cycle;
                }
            }
            else if (recursionStack.has(depId)) {
                return this.buildPreciseCyclePath(depId, recursionStack);
            }
        }
        recursionStack.delete(taskId);
        return [];
    }
    buildPreciseCyclePath(cycleStart, recursionStack) {
        const cyclePath = [];
        const stackArray = Array.from(recursionStack);
        const startIndex = stackArray.indexOf(cycleStart);
        if (startIndex === -1) {
            return [cycleStart];
        }
        for (let i = startIndex; i < stackArray.length; i++) {
            cyclePath.push(stackArray[i]);
        }
        cyclePath.push(cycleStart);
        return cyclePath;
    }
    buildDependencyGraphFromTasks(tasks) {
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
    buildDependencyChain(taskId, chain, visited) {
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
    getTopologicalSort(tasks) {
        this.buildDependencyGraphFromTasks(tasks);
        const visited = new Set();
        const tempVisited = new Set();
        const result = [];
        const taskMap = new Map(tasks.map(task => [task.id, task]));
        for (const task of tasks) {
            if (!visited.has(task.id)) {
                this.topologicalSortDFS(task.id, taskMap, visited, tempVisited, result);
            }
        }
        return result.reverse();
    }
    topologicalSortDFS(taskId, taskMap, visited, tempVisited, result) {
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
        result.push(taskMap.get(taskId));
    }
    dispose() {
        this.dependencyGraph = {};
        this.softDependencyGraph = {};
        this.conflicts.clear();
        this.lastConflictResolvedState.clear();
        this.logger.debug('TaskDependencyManager disposed');
    }
}
exports.TaskDependencyManager = TaskDependencyManager;
//# sourceMappingURL=TaskDependencyManager.js.map