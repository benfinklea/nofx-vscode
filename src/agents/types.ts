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
    template?: any; // Agent template with system prompt and capabilities
}

export type AgentStatus = 'idle' | 'working' | 'error' | 'offline';

export interface AgentConfig {
    name: string;
    type: string;
    autoStart?: boolean;
    template?: any; // Optional template with prompts
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
    dependsOn?: string[];
    prefers?: string[];
    blockedBy?: string[];
    tags?: string[];
    estimatedDuration?: number;
    requiredCapabilities?: string[];
    conflictsWith?: string[];
    agentMatchScore?: number; // Transient field for UI display
}

export type TaskStatus = 'queued' | 'validated' | 'ready' | 'assigned' | 'in-progress' | 'completed' | 'failed' | 'blocked';

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
}