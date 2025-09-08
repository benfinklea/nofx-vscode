export interface AgentSession {
    // Basic session info
    id: string;
    name: string;
    agentId: string;
    agentName: string;
    agentType: string;

    // Session metadata
    createdAt: Date;
    lastActiveAt: Date;
    sessionDuration: number; // in milliseconds
    expiresAt?: Date; // when the Claude session will timeout

    // Session state
    status: 'active' | 'expired' | 'archived' | 'paused';
    isClaudeSessionActive: boolean;

    // Context data
    conversationHistory: ConversationMessage[];
    currentTask?: SessionTask;
    completedTasks: SessionTask[];
    workingDirectory?: string;
    gitBranch?: string;

    // Agent configuration at time of session
    template: any; // Agent template used
    capabilities: string[];
    systemPrompt: string;

    // Performance metrics
    tasksCompleted: number;
    totalOutputLines: number;
    averageResponseTime?: number;
}

export interface ConversationMessage {
    id: string;
    timestamp: Date;
    type: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    metadata?: {
        taskId?: string;
        fileContext?: string[];
        commandExecuted?: string;
        errorOccurred?: boolean;
    };
}

export interface SessionTask {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'interrupted';
    assignedAt: Date;
    completedAt?: Date;
    duration?: number;
    priority: 'low' | 'medium' | 'high';
    tags: string[];

    // Task context
    filesModified: string[];
    commandsExecuted: string[];
    conversationRange?: {
        startMessageId: string;
        endMessageId: string;
    };
}

export interface SessionSummary {
    sessionId: string;
    name: string;
    agentName: string;
    agentType: string;
    status: 'active' | 'expired' | 'archived';
    createdAt: Date;
    lastActiveAt: Date;
    duration: string; // Human readable
    tasksCompleted: number;
    isRestorable: boolean;
    expiresIn?: string; // Time until Claude session expires
}

export interface SessionRestoreOptions {
    restoreConversationHistory: boolean;
    restoreCurrentTask: boolean;
    restoreWorkingDirectory: boolean;
    continueFromLastMessage: boolean;
    summarizeHistory: boolean; // Provide context summary instead of full history
}

export interface BulkRestoreRequest {
    sessionIds: string[];
    options: SessionRestoreOptions;
    restoreAsNewSessions: boolean; // Create new sessions vs continue existing
}

export interface SessionArchive {
    sessions: AgentSession[];
    exportedAt: Date;
    projectName?: string;
    projectPath?: string;
    totalSessions: number;
    formatVersion: string;
}
