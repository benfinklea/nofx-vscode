import { Task, TaskConfig, TaskStatus, TaskValidationError } from '../agents/types';

/**
 * Simplified task status - only essential states
 * Removed: 'validated', 'blocked' - rarely used complexity
 */
export type SimpleTaskStatus = 'queued' | 'ready' | 'assigned' | 'in-progress' | 'completed' | 'failed';

/**
 * Simple priority levels - maps to numeric values for optional sorting
 */
export enum TaskPriority {
    LOW = 1,
    MEDIUM = 2,
    HIGH = 3
}

/**
 * Simple task representation for the new system
 * Keeps only essential fields, removes complex dependency tracking
 */
export interface SimpleTask {
    id: string;
    title: string;
    description: string;
    priority: TaskPriority;
    status: SimpleTaskStatus;
    files?: string[];
    tags?: string[];
    createdAt: Date;
    assignedTo?: string;
    assignedAt?: Date;
    completedAt?: Date;

    // Optional fields for backward compatibility
    requiredCapabilities?: string[];
    estimatedDuration?: number;
}

/**
 * Simplified task configuration for creating tasks
 */
export interface SimpleTaskConfig {
    title: string;
    description: string;
    priority?: 'low' | 'medium' | 'high';
    files?: string[];
    tags?: string[];
    requiredCapabilities?: string[];
    estimatedDuration?: number;
}

/**
 * Task stats for monitoring
 */
export interface SimpleTaskStats {
    total: number;
    queued: number;
    ready: number;
    assigned: number;
    inProgress: number;
    completed: number;
    failed: number;
}

/**
 * Queue configuration options
 */
export interface SimpleQueueConfig {
    enablePriority: boolean;
    maxConcurrentTasks: number;
    autoAssign: boolean;
    retryFailedTasks: boolean;
}

/**
 * Task event types for notifications
 */
export enum TaskEvent {
    CREATED = 'task.created',
    ASSIGNED = 'task.assigned',
    STARTED = 'task.started',
    COMPLETED = 'task.completed',
    FAILED = 'task.failed',
    PRIORITY_CHANGED = 'task.priority.changed'
}

/**
 * Task event data structure
 */
export interface TaskEventData {
    taskId: string;
    task: SimpleTask;
    agentId?: string;
    previousState?: SimpleTaskStatus;
    error?: string;
}

/**
 * Conversion utilities for backward compatibility
 */
export class TaskConverter {
    /**
     * Convert legacy Task to SimpleTask
     */
    static fromLegacyTask(task: Task): SimpleTask {
        return {
            id: task.id,
            title: task.title,
            description: task.description,
            priority: this.convertPriority(task.priority),
            status: this.convertStatus(task.status),
            files: task.files,
            tags: task.tags,
            createdAt: task.createdAt,
            assignedTo: task.assignedTo,
            assignedAt: task.assignedAt,
            completedAt: task.completedAt,
            requiredCapabilities: task.requiredCapabilities,
            estimatedDuration: task.estimatedDuration
        };
    }

    /**
     * Convert SimpleTask to legacy Task format
     */
    static toLegacyTask(simpleTask: SimpleTask): Task {
        return {
            id: simpleTask.id,
            title: simpleTask.title,
            description: simpleTask.description,
            priority: this.convertPriorityToString(simpleTask.priority),
            numericPriority: simpleTask.priority,
            status: this.convertStatusToLegacy(simpleTask.status),
            files: simpleTask.files || [],
            tags: simpleTask.tags || [],
            createdAt: simpleTask.createdAt,
            assignedTo: simpleTask.assignedTo,
            assignedAt: simpleTask.assignedAt,
            completedAt: simpleTask.completedAt,
            requiredCapabilities: simpleTask.requiredCapabilities || [],
            estimatedDuration: simpleTask.estimatedDuration,

            // Default values for legacy fields
            dependsOn: [],
            prefers: [],
            blockedBy: [],
            conflictsWith: []
        };
    }

    private static convertPriority(priority: string): TaskPriority {
        switch (priority.toLowerCase()) {
            case 'high':
                return TaskPriority.HIGH;
            case 'low':
                return TaskPriority.LOW;
            default:
                return TaskPriority.MEDIUM;
        }
    }

    private static convertPriorityToString(priority: TaskPriority): 'low' | 'medium' | 'high' {
        switch (priority) {
            case TaskPriority.HIGH:
                return 'high';
            case TaskPriority.LOW:
                return 'low';
            default:
                return 'medium';
        }
    }

    private static convertStatus(status: TaskStatus): SimpleTaskStatus {
        // Map complex states to simple ones
        switch (status) {
            case 'validated':
            case 'blocked':
                return 'ready'; // Simplify to ready
            case 'queued':
            case 'ready':
            case 'assigned':
            case 'in-progress':
            case 'completed':
            case 'failed':
                return status as SimpleTaskStatus;
            default:
                return 'ready';
        }
    }

    private static convertStatusToLegacy(status: SimpleTaskStatus): TaskStatus {
        return status as TaskStatus; // All simple states are valid legacy states
    }
}
