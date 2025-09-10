/**
 * Message Protocol for NofX DirectCommunication System
 *
 * SIMPLIFIED VERSION - Removed WebSocket-specific features:
 * - No connection management messages
 * - No heartbeat/ping-pong protocols
 * - Focused on core orchestration messages only
 * - Uses VS Code's EventBus for in-process communication
 */

export enum MessageType {
    // Core Conductor -> Agent commands
    SPAWN_AGENT = 'spawn_agent',
    SPAWN_SMART_AGENT = 'spawn_smart_agent',
    CREATE_SMART_TEAM = 'create_smart_team',
    ASSIGN_TASK = 'assign_task',
    QUERY_STATUS = 'query_status',
    TERMINATE_AGENT = 'terminate_agent',
    PAUSE_AGENT = 'pause_agent',
    RESUME_AGENT = 'resume_agent',

    // Core Agent -> Conductor responses
    AGENT_READY = 'agent_ready',
    TASK_ACCEPTED = 'task_accepted',
    TASK_PROGRESS = 'task_progress',
    TASK_COMPLETE = 'task_complete',
    TASK_ERROR = 'task_error',
    AGENT_STATUS = 'agent_status',

    // Sub-agent orchestration
    SPAWN_SUB_AGENT = 'spawn_sub_agent',
    SUB_AGENT_RESULT = 'sub_agent_result',
    SUB_AGENT_ERROR = 'sub_agent_error',
    CANCEL_SUB_AGENT = 'cancel_sub_agent',
    SUB_AGENT_STATUS = 'sub_agent_status',

    // Smart template messages
    TEMPLATE_CONFIG_REQUEST = 'template_config_request',
    TEMPLATE_CONFIG_RESPONSE = 'template_config_response',
    TEMPLATE_RESOLVED = 'template_resolved',
    NATURAL_LANGUAGE_PARSE = 'natural_language_parse',

    // System messages (simplified)
    SYSTEM_MESSAGE = 'system_message',
    SYSTEM_ERROR = 'system_error',
    BROADCAST = 'broadcast'
}

/**
 * Core message interface for DirectCommunication
 * Simplified from WebSocket version - removed network-specific fields
 */
export interface OrchestratorMessage {
    id: string; // Unique message ID
    timestamp: string; // ISO 8601 timestamp
    source: string; // conductor | agent-{id} | system
    target?: string; // conductor | agent-{id} | broadcast | dashboard
    to?: string; // Backwards compatibility
    from?: string; // Backwards compatibility
    type: MessageType; // Message type enum
    content: string; // Message content/description
    payload?: any; // Optional message-specific data
    status: MessageStatus; // Message processing status
    metadata?: Record<string, any>; // Additional metadata
}

/**
 * Message processing status
 */
export enum MessageStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed'
}

// Specific payload interfaces

export interface SpawnAgentPayload {
    role: string; // frontend-specialist, backend-specialist, etc.
    name: string; // Display name
    template?: string; // Template ID to use
    autoStart?: boolean; // Start immediately after spawn
}

// Smart template payload interfaces

export interface SpawnSmartAgentPayload {
    name: string; // Display name
    config: SmartAgentConfig; // Dynamic template configuration
    autoStart?: boolean; // Start immediately after spawn
    workingDirectory?: string; // Optional working directory
}

export interface SmartAgentConfig {
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

export interface CreateSmartTeamPayload {
    teamName: string; // Team display name
    teamType: string; // Team preset type (e.g., 'full-stack-team', 'security-audit-team')
    agentConfigs: SmartAgentConfig[]; // Array of agent configurations
    autoStart?: boolean; // Start all agents immediately
    workspaceStrategy?: 'shared' | 'worktrees' | 'isolated'; // Workspace management
}

export interface TemplateConfigRequestPayload {
    requestId: string; // Unique request ID
    agentId?: string; // Target agent (optional for broadcast)
    configType: 'partial' | 'complete' | 'suggestions'; // Type of configuration needed
    context?: {
        naturalLanguagePrompt?: string; // Original natural language request
        existingConfig?: Partial<SmartAgentConfig>; // Partial configuration
        domainHints?: string[]; // Domain suggestions
        taskContext?: string; // Context about the intended task
    };
}

export interface TemplateConfigResponsePayload {
    requestId: string; // Matching request ID
    agentId: string; // Responding agent ID
    suggestedConfig: SmartAgentConfig; // Suggested configuration
    confidence: number; // Confidence score (0-1)
    reasoning?: string; // Explanation of suggestions
    alternatives?: SmartAgentConfig[]; // Alternative configurations
}

export interface TemplateResolvedPayload {
    requestId: string; // Original request ID
    resolvedConfig: SmartAgentConfig; // Final resolved configuration
    templateId: string; // Generated template ID
    agentName: string; // Final agent name
    resolutionMethod: 'automatic' | 'user-selected' | 'ai-suggested'; // How it was resolved
}

export interface NaturalLanguageParsePayload {
    originalPrompt: string; // Original natural language request
    parsedIntent: {
        action: 'spawn_agent' | 'create_team' | 'assign_task' | 'modify_config'; // Detected action
        agentType?: string; // Detected agent type/role
        teamType?: string; // Detected team type
        taskDescription?: string; // Extracted task description
        priority?: 'low' | 'medium' | 'high' | 'critical'; // Detected priority
        urgency?: 'low' | 'medium' | 'high'; // Detected urgency
    };
    extractedConfig?: Partial<SmartAgentConfig>; // Extracted configuration elements
    confidence: number; // Parse confidence (0-1)
    ambiguities?: string[]; // Areas needing clarification
    suggestions?: string[]; // Alternative interpretations
}

export interface AssignTaskPayload {
    agentId: string; // Target agent ID
    taskId: string; // Unique task ID
    title: string; // Task title
    description: string; // Detailed task description
    priority: 'low' | 'medium' | 'high' | 'critical';
    dependencies?: string[]; // Task IDs this depends on
    deadline?: string; // ISO 8601 deadline
    context?: any; // Additional context data
}

export interface TaskProgressPayload {
    taskId: string; // Task being worked on
    progress: number; // 0-100 percentage
    status: 'starting' | 'in_progress' | 'reviewing' | 'testing' | 'finalizing';
    message?: string; // Progress message
    eta?: string; // Estimated completion time
}

export interface TaskCompletePayload {
    taskId: string; // Completed task ID
    success: boolean; // Whether task succeeded
    output?: string; // Task output/result
    filesCreated?: string[]; // Files created
    filesModified?: string[]; // Files modified
    metrics?: {
        // Performance metrics
        duration: number; // Time taken in ms
        linesAdded?: number;
        linesRemoved?: number;
        testsRun?: number;
        testsPassed?: number;
    };
}

export interface AgentStatusPayload {
    agentId: string;
    status: 'idle' | 'working' | 'paused' | 'error' | 'offline';
    currentTask?: string; // Current task ID if working
    completedTasks: number; // Total completed
    failedTasks: number; // Total failed
    uptime: number; // Uptime in ms
    capabilities?: string[]; // Agent capabilities
}

export interface AgentQueryPayload {
    question: string; // Question from agent
    context?: any; // Relevant context
    needsResponse: boolean; // Whether response is needed
    options?: string[]; // Multiple choice options
}

// Sub-agent payload interfaces (NEW)

export interface SpawnSubAgentPayload {
    parentAgentId: string; // Agent requesting sub-agent
    subAgentType: 'general-purpose' | 'code-lead-reviewer' | 'statusline-setup' | 'output-style-setup';
    taskDescription: string; // What the sub-agent should do
    prompt: string; // Detailed prompt for sub-agent
    priority?: number; // Task priority (1-10)
    timeout?: number; // Timeout in milliseconds
    context?: Record<string, any>; // Additional context
}

export interface SubAgentStartedPayload {
    parentAgentId: string; // Parent agent ID
    subAgentId: string; // Sub-agent task ID
    subAgentType: string; // Type of sub-agent
    startedAt: string; // ISO timestamp
}

export interface SubAgentProgressPayload {
    parentAgentId: string; // Parent agent ID
    subAgentId: string; // Sub-agent task ID
    progress: number; // 0-100 percentage
    message: string; // Progress message
    timestamp: string; // ISO timestamp
}

export interface SubAgentResultPayload {
    parentAgentId: string; // Parent agent ID
    subAgentId: string; // Sub-agent task ID
    status: 'success' | 'error' | 'timeout' | 'cancelled';
    result?: string; // Result if successful
    error?: string; // Error message if failed
    executionTime: number; // Time taken in ms
    completedAt: string; // ISO timestamp
    metadata?: Record<string, any>; // Additional metadata
}

export interface CancelSubAgentPayload {
    parentAgentId: string; // Parent agent ID
    subAgentId: string; // Sub-agent task ID to cancel
    reason?: string; // Cancellation reason
}

// Connection management

export interface ClientConnection {
    id: string; // Connection ID (conductor or agent-{id})
    type: 'conductor' | 'agent' | 'dashboard';
    name: string; // Display name
    connectedAt: string; // Connection timestamp
    lastHeartbeat: string; // Last heartbeat received
    messageCount: number; // Messages sent/received
    role?: string; // For agents: their specialization
    status?: string; // Current status
}

// Helper functions

/**
 * Create a DirectCommunication message
 */
export function createMessage(
    source: string,
    target: string,
    type: MessageType,
    content: string,
    payload?: any
): OrchestratorMessage {
    return {
        id: generateMessageId(),
        timestamp: new Date().toISOString(),
        source,
        target,
        type,
        content,
        status: MessageStatus.PENDING,
        payload,
        // Backwards compatibility
        from: source,
        to: target
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
        MessageType.SPAWN_SMART_AGENT,
        MessageType.CREATE_SMART_TEAM,
        MessageType.ASSIGN_TASK,
        MessageType.TERMINATE_AGENT,
        MessageType.PAUSE_AGENT,
        MessageType.RESUME_AGENT,
        MessageType.TEMPLATE_CONFIG_REQUEST
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

        case MessageType.SPAWN_SMART_AGENT:
            const smartAgent = message.payload as SpawnSmartAgentPayload;
            content = `[SMART AGENT REQUEST] Spawn ${smartAgent.name}\nCategory: ${smartAgent.config.category}\nConfiguration: ${JSON.stringify(smartAgent.config, null, 2)}`;
            break;

        case MessageType.CREATE_SMART_TEAM:
            const smartTeam = message.payload as CreateSmartTeamPayload;
            content = `[SMART TEAM REQUEST] Create ${smartTeam.teamName}\nType: ${smartTeam.teamType}\nAgents: ${smartTeam.agentConfigs.length}`;
            break;

        case MessageType.TEMPLATE_CONFIG_REQUEST:
            const configReq = message.payload as TemplateConfigRequestPayload;
            content = `[TEMPLATE CONFIG REQUEST] Type: ${configReq.configType}\nContext: ${configReq.context?.naturalLanguagePrompt || 'N/A'}`;
            break;

        case MessageType.TEMPLATE_CONFIG_RESPONSE:
            const configResp = message.payload as TemplateConfigResponsePayload;
            content = `[TEMPLATE CONFIG RESPONSE] Confidence: ${(configResp.confidence * 100).toFixed(0)}%\nReasoning: ${configResp.reasoning || 'N/A'}`;
            break;

        case MessageType.NATURAL_LANGUAGE_PARSE:
            const nlParse = message.payload as NaturalLanguageParsePayload;
            content = `[NATURAL LANGUAGE PARSE] Action: ${nlParse.parsedIntent.action}\nConfidence: ${(nlParse.confidence * 100).toFixed(0)}%\nPrompt: "${nlParse.originalPrompt}"`;
            break;

        case MessageType.QUERY_STATUS:
            content = '[STATUS REQUEST] Please report your current status';
            break;

        case MessageType.AGENT_STATUS:
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

export function convertClaudeCommandToMessage(command: any): OrchestratorMessage {
    // Map Claude's simplified commands to full messages
    let type: MessageType;
    let content: string;
    let payload: any;
    let target: string;

    switch (command.type) {
        case 'spawn':
        case 'spawn_agent':
            type = MessageType.SPAWN_AGENT;
            content = `Spawn ${command.role} agent`;
            target = 'system';
            payload = {
                role: command.role,
                name: command.name || `${command.role}-agent`
            };
            break;

        case 'spawn_smart':
        case 'spawn_smart_agent':
            type = MessageType.SPAWN_SMART_AGENT;
            content = `Spawn smart agent: ${command.name}`;
            target = 'system';
            payload = {
                name: command.name,
                config: command.config,
                autoStart: command.autoStart !== false
            };
            break;

        case 'create_team':
        case 'create_smart_team':
            type = MessageType.CREATE_SMART_TEAM;
            content = `Create smart team: ${command.teamName}`;
            target = 'system';
            payload = {
                teamName: command.teamName,
                teamType: command.teamType,
                agentConfigs: command.agentConfigs,
                autoStart: command.autoStart !== false,
                workspaceStrategy: command.workspaceStrategy || 'shared'
            };
            break;

        case 'parse_natural':
        case 'natural_language':
            type = MessageType.NATURAL_LANGUAGE_PARSE;
            content = `Parse natural language: "${command.prompt}"`;
            target = 'system';
            payload = {
                originalPrompt: command.prompt,
                parsedIntent: command.intent || {},
                extractedConfig: command.config,
                confidence: command.confidence || 0.5,
                ambiguities: command.ambiguities || [],
                suggestions: command.suggestions || []
            };
            break;

        case 'request_config':
        case 'template_config':
            type = MessageType.TEMPLATE_CONFIG_REQUEST;
            content = `Request template configuration`;
            target = command.agentId || 'broadcast';
            payload = {
                requestId: generateMessageId(),
                agentId: command.agentId,
                configType: command.configType || 'complete',
                context: command.context
            };
            break;

        case 'assign':
        case 'assign_task':
            type = MessageType.ASSIGN_TASK;
            content = `Assign task: ${command.task || command.title}`;
            target = command.agentId;
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
            content = `Query status for ${command.agentId || 'all agents'}`;
            target = command.agentId || 'all';
            payload = { agentId: command.agentId || 'all' };
            break;

        case 'terminate':
        case 'stop':
            type = MessageType.TERMINATE_AGENT;
            content = `Terminate agent ${command.agentId}`;
            target = command.agentId;
            payload = { agentId: command.agentId };
            break;

        default:
            type = MessageType.BROADCAST;
            content = JSON.stringify(command);
            target = 'broadcast';
            payload = command;
    }

    return {
        id: generateMessageId(),
        timestamp: new Date().toISOString(),
        source: 'conductor',
        target,
        type,
        content,
        status: MessageStatus.PENDING,
        payload,
        // Backwards compatibility
        from: 'conductor',
        to: target
    };
}
