import * as vscode from 'vscode';
import { Agent, Task, AgentStatus, TaskStatus } from '../agents/types';
import { priorityToNumeric } from '../tasks/priority';

/**
 * Generic type for QuickPick items with custom values
 */
export interface PickItem<T = string> extends vscode.QuickPickItem {
    value: T;
}

/**
 * Helper function to create a PickItem
 */
export function createPickItem<T>(label: string, value: T, options?: {
    description?: string;
    detail?: string;
    picked?: boolean;
    alwaysShow?: boolean;
}): PickItem<T> {
    return {
        label,
        value,
        ...options
    };
}

/**
 * Helper function to extract value from selected PickItem
 */
export function getPickValue<T>(item: PickItem<T> | undefined): T | undefined {
    return item?.value;
}

// DTOs for UI data transfer
export interface AgentDTO {
    id: string;
    name: string;
    type: string;
    status: AgentStatus;
    currentTask: TaskDTO | null;
    template?: any;
    startTime: Date;
    tasksCompleted: number;
}

export interface TaskDTO {
    id: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    numericPriority: number;
    status: TaskStatus;
    assignedTo?: string;
    files?: string[];
    createdAt: Date;
    completedAt?: Date;
    dependsOn: string[];
    prefers: string[];
    blockedBy: string[];
    tags: string[];
    requiredCapabilities: string[];
    conflictsWith: string[];
    estimatedDuration?: number;
    dependencyStatus: 'ready' | 'waiting' | 'blocked';
    agentMatchScore?: number;
    blockingReason?: string;
    softDependencyStatus?: 'satisfied' | 'pending' | 'none';
    softDependencyHint?: string;
}

/**
 * Normalized task status for UI display
 * Maps various task statuses to consistent UI values
 */
export type NormalizedTaskStatus = 'queued' | 'assigned' | 'in-progress' | 'completed' | 'failed';

/**
 * Normalized agent status for UI display
 * Maps various agent statuses to consistent UI values
 */
export type NormalizedAgentStatus = 'idle' | 'working' | 'error' | 'offline';

// UI State interfaces
export interface ConductorViewState {
    agentStats: {
        total: number;
        idle: number;
        working: number;
        error: number;
        offline: number;
    };
    taskStats: {
        queued: number;
        validated: number;
        ready: number;
        assigned: number;
        inProgress: number;
        completed: number;
        failed: number;
        blocked: number;
        conflicted: number;
    };
    agents: AgentDTO[];
    tasks: TaskDTO[];
    dependencyGraph: {taskId: string, dependencies: string[], softDependencies: string[]}[];
    conflicts: {taskId: string, conflictsWith: string[], reason: string}[];
    blockedTasks: TaskDTO[];
    readyTasks: TaskDTO[];
    theme: 'light' | 'dark';
}

export interface DashboardViewState {
    connections: Array<{
        id: string;
        name: string;
        status: 'connected' | 'disconnected';
        lastMessage?: Date;
    }>;
    messages: Array<{
        id: string;
        timestamp: Date;
        type: 'request' | 'response' | 'error';
        content: string;
        source: string;
        target?: string;
    }>;
    stats: {
        totalMessages: number;
        successRate: number;
        averageResponseTime: number;
        activeConnections: number;
    };
    filters: {
        messageType?: string;
        timeRange?: string;
        source?: string;
    };
}

export interface TreeViewState {
    teamName: string;
    expandedSections: Set<string>;
    selectedItems: Set<string>;
}

// Webview Command constants for centralized command mapping
export const enum WEBVIEW_COMMANDS {
    // Conductor commands
    SPAWN_AGENT_GROUP = 'spawnAgentGroup',
    CREATE_TASK = 'createTask',
    REMOVE_AGENT = 'removeAgent',
    TOGGLE_THEME = 'toggleTheme',
    SPAWN_CUSTOM_AGENT = 'spawnCustomAgent',
    SHOW_AGENT_PROMPT = 'showAgentPrompt',
    
    // State management commands
    SET_STATE = 'setState',
    UPDATE_STATE = 'updateState',
    
    // Dashboard commands
    APPLY_FILTER = 'applyFilter',
    CLEAR_MESSAGES = 'clearMessages',
    EXPORT_MESSAGES = 'exportMessages',
    PAUSE_UPDATES = 'pauseUpdates',
    RESUME_UPDATES = 'resumeUpdates'
}

// Webview Command union type (for backward compatibility)
export type WebviewCommand = 
    | 'spawnAgentGroup'
    | 'createTask'
    | 'removeAgent'
    | 'toggleTheme'
    | 'spawnCustomAgent'
    | 'showAgentPrompt'
    | 'setState'
    | 'updateState'
    | 'applyFilter'
    | 'clearMessages'
    | 'exportMessages'
    | 'pauseUpdates'
    | 'resumeUpdates';

// Utility functions for DTO conversion
export function toAgentDTO(agent: Agent): AgentDTO {
    return {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        currentTask: agent.currentTask ? toTaskDTO(agent.currentTask) : null,
        template: agent.template,
        startTime: agent.startTime,
        tasksCompleted: agent.tasksCompleted
    };
}

export function toTaskDTO(task: Task, dependencyStatus?: 'ready' | 'waiting' | 'blocked', agentMatchScore?: number, allTasks?: Task[]): TaskDTO {
    // Compute dependency status if not provided
    let computedDependencyStatus: 'ready' | 'waiting' | 'blocked';
    if (dependencyStatus) {
        computedDependencyStatus = dependencyStatus;
    } else {
        // Use task status and dependencies to determine status without calling computeDependencyStatus with empty array
        if (task.status === 'blocked') {
            computedDependencyStatus = 'blocked';
        } else if ((task.dependsOn?.length ?? 0) === 0) {
            computedDependencyStatus = 'ready';
        } else {
            computedDependencyStatus = 'waiting';
        }
    }

    // Default to task.agentMatchScore if the third param is undefined
    const score = agentMatchScore ?? (task as any).agentMatchScore;

    // Compute soft dependency status
    const softDepStatus = computeSoftDependencyStatus(task, allTasks || []);
    const softDepHint = formatSoftDependencyHint(task, allTasks || []);

    return {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        numericPriority: task.numericPriority ?? priorityToNumeric(task.priority),
        status: task.status,
        assignedTo: task.assignedTo,
        files: task.files,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        dependsOn: task.dependsOn || [],
        prefers: task.prefers || [],
        blockedBy: task.blockedBy || [],
        tags: task.tags || [],
        requiredCapabilities: task.requiredCapabilities || [],
        conflictsWith: task.conflictsWith || [],
        estimatedDuration: task.estimatedDuration,
        dependencyStatus: computedDependencyStatus,
        agentMatchScore: score,
        blockingReason: formatBlockingReason(task),
        softDependencyStatus: softDepStatus,
        softDependencyHint: softDepHint
    };
}

/**
 * Normalize task status to consistent UI values
 * Maps various status strings to standardized values
 */
export function normalizeTaskStatus(status: string): NormalizedTaskStatus {
    switch (status.toLowerCase()) {
        case 'queued':
        case 'pending':
            return 'queued';
        case 'assigned':
        case 'allocated':
            return 'assigned';
        case 'in-progress':
        case 'inprogress':
        case 'working':
        case 'active':
            return 'in-progress';
        case 'completed':
        case 'done':
        case 'finished':
            return 'completed';
        case 'failed':
        case 'error':
        case 'cancelled':
        case 'canceled':
            return 'failed';
        default:
            return 'queued'; // Default fallback
    }
}

/**
 * Normalize agent status to consistent UI values
 * Maps various status strings to standardized values
 */
export function normalizeAgentStatus(status: string): NormalizedAgentStatus {
    switch (status.toLowerCase()) {
        case 'idle':
        case 'available':
        case 'ready':
            return 'idle';
        case 'working':
        case 'busy':
        case 'active':
        case 'in-progress':
            return 'working';
        case 'error':
        case 'failed':
        case 'crashed':
            return 'error';
        case 'offline':
        case 'disconnected':
        case 'stopped':
            return 'offline';
        default:
            return 'idle'; // Default fallback
    }
}

/**
 * Computes dependency status for a task
 */
export function computeDependencyStatus(task: Task, allTasks: Task[]): 'ready' | 'waiting' | 'blocked' {
    if (task.status === 'blocked') {
        return 'blocked';
    }

    const dependencies = task.dependsOn || [];
    if (dependencies.length === 0) {
        return 'ready';
    }

    const taskMap = new Map(allTasks.map(t => [t.id, t]));
    for (const depId of dependencies) {
        const depTask = taskMap.get(depId);
        if (!depTask || depTask.status !== 'completed') {
            return 'waiting';
        }
    }

    return 'ready';
}

/**
 * Formats blocking reason for a task
 */
export function formatBlockingReason(task: Task): string | undefined {
    if (task.status !== 'blocked') {
        return undefined;
    }

    const reasons: string[] = [];

    if (task.conflictsWith && task.conflictsWith.length > 0) {
        reasons.push(`Conflicts with: ${task.conflictsWith.join(', ')}`);
    }

    if (task.blockedBy && task.blockedBy.length > 0) {
        reasons.push(`Blocked by: ${task.blockedBy.join(', ')}`);
    }

    if (task.dependsOn && task.dependsOn.length > 0) {
        reasons.push(`Waiting for dependencies: ${task.dependsOn.join(', ')}`);
    }

    if (task.prefers && task.prefers.length > 0) {
        reasons.push(`Prefers: ${task.prefers.join(', ')}`);
    }

    return reasons.length > 0 ? reasons.join('; ') : 'Unknown reason';
}

/**
 * Formats priority for display
 */
export function formatPriority(numericPriority: number): string {
    if (numericPriority >= 100) return '🔥 High';
    if (numericPriority >= 50) return '⚡ Medium';
    return '📝 Low';
}

/**
 * Gets priority color for UI
 */
export function getPriorityColor(priority: 'high' | 'medium' | 'low'): string {
    switch (priority) {
        case 'high': return '#ff4444';
        case 'medium': return '#ffaa00';
        case 'low': return '#44aa44';
        default: return '#888888';
    }
}

/**
 * Gets status icon for UI
 */
export function getStatusIcon(status: TaskStatus): string {
    switch (status) {
        case 'queued': return '⏳';
        case 'validated': return '✓';
        case 'ready': return '🟢';
        case 'assigned': return '👤';
        case 'in-progress': return '🔄';
        case 'completed': return '✅';
        case 'failed': return '❌';
        case 'blocked': return '🔴';
        default: return '❓';
    }
}

/**
 * Computes soft dependency status for a task
 */
export function computeSoftDependencyStatus(task: Task, allTasks: Task[]): 'satisfied' | 'pending' | 'none' {
    if (!task.prefers || task.prefers.length === 0) {
        return 'none';
    }

    const taskMap = new Map(allTasks.map(t => [t.id, t]));
    let completedCount = 0;
    let totalCount = task.prefers.length;

    for (const prefId of task.prefers) {
        const prefTask = taskMap.get(prefId);
        if (prefTask && prefTask.status === 'completed') {
            completedCount++;
        }
    }

    if (completedCount === totalCount) {
        return 'satisfied';
    } else if (completedCount < totalCount) {
        return 'pending';
    }

    return 'none';
}

/**
 * Formats soft dependency hint for UI display
 */
export function formatSoftDependencyHint(task: Task, allTasks: Task[]): string | undefined {
    if (!task.prefers || task.prefers.length === 0) {
        return undefined;
    }

    const status = computeSoftDependencyStatus(task, allTasks);
    
    switch (status) {
        case 'satisfied':
            return '✨ Soft deps satisfied';
        case 'pending':
            const taskMap = new Map(allTasks.map(t => [t.id, t]));
            const pendingTasks = task.prefers.filter(prefId => {
                const prefTask = taskMap.get(prefId);
                return !prefTask || prefTask.status !== 'completed';
            });
            return `⏳ Waiting for: ${pendingTasks.join(', ')}`;
        case 'none':
        default:
            return undefined;
    }
}