/**
 * Message Protocol for NofX Orchestration System
 * Defines all message types and interfaces for conductor-agent communication
 */

export enum MessageType {
    // Conductor -> Agent commands
    SPAWN_AGENT = 'spawn_agent',
    ASSIGN_TASK = 'assign_task',
    QUERY_STATUS = 'query_status',
    TERMINATE_AGENT = 'terminate_agent',
    PAUSE_AGENT = 'pause_agent',
    RESUME_AGENT = 'resume_agent',

    // Agent -> Conductor status
    AGENT_READY = 'agent_ready',
    TASK_ACCEPTED = 'task_accepted',
    TASK_PROGRESS = 'task_progress',
    TASK_COMPLETE = 'task_complete',
    TASK_ERROR = 'task_error',
    AGENT_STATUS = 'agent_status',
    AGENT_QUERY = 'agent_query',

    // System messages
    CONNECTION_ESTABLISHED = 'connection_established',
    CONNECTION_LOST = 'connection_lost',
    HEARTBEAT = 'heartbeat',
    SYSTEM_ERROR = 'system_error',
    SYSTEM_ACK = 'system_ack',
    BROADCAST = 'broadcast'
}

export interface OrchestratorMessage {
    id: string;                    // Unique message ID (UUID)
    timestamp: string;             // ISO 8601 timestamp
    from: string;                  // conductor | agent-{id} | system
    to: string;                    // conductor | agent-{id} | broadcast | dashboard
    type: MessageType;             // Message type enum
    payload: any;                  // Message-specific payload
    correlationId?: string;        // For request-response correlation
    requiresAck?: boolean;         // Whether acknowledgment is required
}

// Specific payload interfaces

export interface SpawnAgentPayload {
    role: string;                  // frontend-specialist, backend-specialist, etc.
    name: string;                  // Display name
    template?: string;             // Template ID to use
    autoStart?: boolean;           // Start immediately after spawn
}

export interface AssignTaskPayload {
    agentId: string;              // Target agent ID
    taskId: string;               // Unique task ID
    title: string;                // Task title
    description: string;          // Detailed task description
    priority: 'low' | 'medium' | 'high' | 'critical';
    dependencies?: string[];      // Task IDs this depends on
    deadline?: string;            // ISO 8601 deadline
    context?: any;                // Additional context data
}

export interface TaskProgressPayload {
    taskId: string;               // Task being worked on
    progress: number;             // 0-100 percentage
    status: 'starting' | 'in_progress' | 'reviewing' | 'testing' | 'finalizing';
    message?: string;             // Progress message
    eta?: string;                 // Estimated completion time
}

export interface TaskCompletePayload {
    taskId: string;               // Completed task ID
    success: boolean;             // Whether task succeeded
    output?: string;              // Task output/result
    filesCreated?: string[];      // Files created
    filesModified?: string[];     // Files modified
    metrics?: {                   // Performance metrics
        duration: number;         // Time taken in ms
        linesAdded?: number;
        linesRemoved?: number;
        testsRun?: number;
        testsPassed?: number;
    };
}

export interface AgentStatusPayload {
    agentId: string;
    status: 'idle' | 'working' | 'paused' | 'error' | 'offline';
    currentTask?: string;         // Current task ID if working
    completedTasks: number;       // Total completed
    failedTasks: number;          // Total failed
    uptime: number;               // Uptime in ms
    capabilities?: string[];      // Agent capabilities
}

export interface AgentQueryPayload {
    question: string;             // Question from agent
    context?: any;                // Relevant context
    needsResponse: boolean;       // Whether response is needed
    options?: string[];           // Multiple choice options
}

// Connection management

export interface ClientConnection {
    id: string;                   // Connection ID (conductor or agent-{id})
    type: 'conductor' | 'agent' | 'dashboard';
    name: string;                 // Display name
    connectedAt: string;          // Connection timestamp
    lastHeartbeat: string;        // Last heartbeat received
    messageCount: number;         // Messages sent/received
    role?: string;                // For agents: their specialization
    status?: string;              // Current status
}

// Helper functions

export function createMessage(
    from: string,
    to: string,
    type: MessageType,
    payload: any,
    correlationId?: string
): OrchestratorMessage {
    return {
        id: generateMessageId(),
        timestamp: new Date().toISOString(),
        from,
        to,
        type,
        payload,
        correlationId: correlationId || generateMessageId(),
        requiresAck: shouldRequireAck(type)
    };
}

export function generateMessageId(): string {
    // Generate msg_ prefix with 8 hex characters
    const hex = Math.random().toString(16).substring(2, 10).padEnd(8, '0');
    return `msg_${hex}`;
}

export function shouldRequireAck(type: MessageType): boolean {
    // Commands typically require acknowledgment
    return [
        MessageType.SPAWN_AGENT,
        MessageType.ASSIGN_TASK,
        MessageType.TERMINATE_AGENT,
        MessageType.PAUSE_AGENT,
        MessageType.RESUME_AGENT
    ].includes(type);
}

export function isValidMessage(message: any): message is OrchestratorMessage {
    if (!message || typeof message !== 'object') {
        return false;
    }
    return (
        typeof message.id === 'string' &&
        typeof message.timestamp === 'string' &&
        typeof message.from === 'string' &&
        typeof message.to === 'string' &&
        Object.values(MessageType).includes(message.type) &&
        message.payload !== undefined
    );
}

// Message formatting for Claude

export function formatMessageForClaude(message: OrchestratorMessage): string {
    let content: string;

    switch (message.type) {
        case MessageType.ASSIGN_TASK:
            const task = message.payload as AssignTaskPayload;
            content = `[TASK ASSIGNED] ${task.title}\nPriority: ${task.priority}\nDescription: ${task.description}`;
            break;

        case MessageType.QUERY_STATUS:
            content = '[STATUS REQUEST] Please report your current status';
            break;

        case MessageType.AGENT_QUERY:
            const query = message.payload as AgentQueryPayload;
            content = `[QUESTION FROM ${message.from}] ${query.question}`;
            break;

        default:
            content = `[${message.type}] ${JSON.stringify(message.payload)}`;
            break;
    }

    return `ORCHESTRATION MESSAGE
Type: ${message.type}
From: ${message.from}
To: ${message.to}
Timestamp: ${message.timestamp}

${content}

\`\`\`json
${JSON.stringify(message.payload, null, 2)}
\`\`\``;
}

export function extractJsonFromClaudeOutput(output: string): any | null {
    // First try to extract JSON from code blocks
    const codeBlockMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        try {
            return JSON.parse(codeBlockMatch[1]);
        } catch {
            // Invalid JSON in code block
        }
    }

    // Then look for inline JSON objects (handle nested braces properly)
    const jsonMatches = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < output.length; i++) {
        if (output[i] === '{') {
            if (depth === 0) {
                start = i;
            }
            depth++;
        } else if (output[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                jsonMatches.push(output.substring(start, i + 1));
            }
        }
    }

    for (const match of jsonMatches) {
        try {
            return JSON.parse(match);
        } catch {
            // Not valid JSON, continue
        }
    }

    return null;
}

function convertClaudeCommandToMessage(command: any): OrchestratorMessage {
    // Map Claude's simplified commands to full messages
    let type: MessageType;
    let payload: any;

    switch (command.type) {
        case 'spawn':
        case 'spawn_agent':
            type = MessageType.SPAWN_AGENT;
            payload = {
                role: command.role,
                name: command.name || `${command.role}-agent`
            };
            break;

        case 'assign':
        case 'assign_task':
            type = MessageType.ASSIGN_TASK;
            payload = {
                agentId: command.agentId,
                taskId: generateMessageId(),
                title: command.task || command.title,
                description: command.description || command.task,
                priority: command.priority || 'medium'
            };
            break;

        case 'status':
        case 'query':
            type = MessageType.QUERY_STATUS;
            payload = { agentId: command.agentId || 'all' };
            break;

        case 'terminate':
        case 'stop':
            type = MessageType.TERMINATE_AGENT;
            payload = { agentId: command.agentId };
            break;

        default:
            type = MessageType.BROADCAST;
            payload = command;
    }

    return createMessage('conductor', command.agentId || 'broadcast', type, payload);
}
