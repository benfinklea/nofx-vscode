import * as vscode from 'vscode';

export interface Agent {
    id: string;
    name: string;
    type: string;
    status: AgentStatus;
    terminal: vscode.Terminal;
    currentTask: Task | null;
    startTime: Date;
    tasksCompleted: number;
    capabilities?: string[];
    template?: any; // Agent template with system prompt and capabilities
    maxConcurrentTasks?: number; // Maximum tasks this agent can handle concurrently
}

export type AgentStatus = 'idle' | 'working' | 'error' | 'offline' | 'online';

export interface AgentConfig {
    name: string;
    type: string;
    autoStart?: boolean;
    template?: any; // Optional template with prompts
    context?: any; // Optional context from restored session
}

export interface Task {
    id: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    numericPriority?: number;
    status: TaskStatus;
    assignedTo?: string;
    files?: string[];
    createdAt: Date;
    completedAt?: Date;
    assignedAt?: Date; // When the task was assigned to an agent
    lastProgressAt?: Date; // When the task last showed progress
    dependsOn?: string[];
    prefers?: string[];
    blockedBy?: string[];
    tags?: string[];
    estimatedDuration?: number;
    requiredCapabilities?: string[];
    conflictsWith?: string[];
    agentMatchScore?: number; // Transient field for UI display
    parallelGroup?: string; // Group ID for tasks that can run in parallel
    canRunInParallel?: boolean; // Whether this task can run parallel with others
}

export type TaskStatus =
    | 'queued'
    | 'validated'
    | 'ready'
    | 'assigned'
    | 'in-progress'
    | 'completed'
    | 'failed'
    | 'blocked';

export interface TaskValidationError {
    field: string;
    message: string;
    code: string;
}

export interface TaskDependency {
    taskId: string;
    type: 'blocks' | 'requires' | 'prefers';
    reason?: string;
}

export interface TaskConfig {
    title: string;
    description: string;
    priority?: 'high' | 'medium' | 'low';
    files?: string[];
    dependsOn?: string[];
    prefers?: string[];
    tags?: string[];
    estimatedDuration?: number;
    requiredCapabilities?: string[];
    capabilities?: string[]; // Deprecated: use requiredCapabilities instead
    maxParallelAgents?: number; // Maximum number of agents that can work on parallel tasks
}
