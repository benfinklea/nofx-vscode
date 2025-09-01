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
    status: TaskStatus;
    assignedTo?: string;
    files?: string[];
    createdAt: Date;
    completedAt?: Date;
}

export type TaskStatus = 'queued' | 'assigned' | 'in-progress' | 'completed' | 'failed';

export interface TaskConfig {
    title: string;
    description: string;
    priority?: 'high' | 'medium' | 'low';
    files?: string[];
}