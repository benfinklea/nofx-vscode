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
    workingDirectory?: string; // Working directory for the agent
}

export type AgentStatus = 'idle' | 'working' | 'error' | 'offline' | 'online';

export interface AgentConfig {
    name: string;
    type: string;
    autoStart?: boolean;
    template?: any; // Optional template with prompts
    context?: any; // Optional context from restored session
}

// Smart Agent Configuration for dynamic template creation
export interface SmartAgentSpawnConfig {
    name: string;
    smartConfig: SmartAgentConfigInterface; // Dynamic template configuration
    autoStart?: boolean;
    workingDirectory?: string; // Optional working directory
    context?: any; // Optional context from restored session
}

export interface SmartAgentConfigInterface {
    category: 'developer' | 'architect' | 'quality' | 'process';
    primaryDomain?: string; // For developers: frontend, backend, fullstack, ai-ml, mobile, etc.
    scope?: string; // For architects: software, database, security, cloud, etc.
    primaryFocus?: string; // For quality: testing, security, audit, performance, etc.
    role?: string; // For process: product-manager, scrum-master, technical-writer, etc.
    languages?: string[]; // Programming languages
    frameworks?: string[]; // Frameworks and libraries
    specializations?: string[]; // Specific specializations
    toolchain?: string[]; // Tools and technologies
    focusAreas?: string[]; // Areas of focus
    decisionLevel?: 'tactical' | 'strategic' | 'operational'; // Decision-making level
    systemTypes?: string[]; // Types of systems to work with
    testingTypes?: string[]; // Types of testing
    securityScope?: string[]; // Security domains
    auditAreas?: string[]; // Audit focus areas
    methodologies?: string[]; // Process methodologies
    stakeholders?: string[]; // Stakeholder types
    deliverables?: string[]; // Expected deliverables
    communicationStyle?: 'technical' | 'business' | 'user-focused'; // Communication approach
    complexity: 'low' | 'medium' | 'high'; // Task complexity preference
    priority: 'low' | 'medium' | 'high' | 'critical'; // Agent priority level
}

// Smart Team Configuration for spawning multiple smart agents
export interface SmartTeamSpawnConfig {
    teamName: string; // Team display name
    teamType: string; // Team preset type (e.g., 'full-stack-team', 'security-audit-team')
    agentConfigs: (SmartAgentConfigInterface & { name?: string })[]; // Array of agent configurations with optional names
    autoStart?: boolean; // Start all agents immediately
    workspaceStrategy?: 'shared' | 'worktrees' | 'isolated'; // Workspace management
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
