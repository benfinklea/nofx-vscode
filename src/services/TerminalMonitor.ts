import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { ILoggingService, IConfigurationService } from './interfaces';
import { TaskToolBridge, SubAgentType } from './TaskToolBridge';
import {
    MessageType,
    OrchestratorMessage,
    SpawnSubAgentPayload,
    SubAgentResultPayload,
    createMessage
} from '../orchestration/MessageProtocol';
import { Agent } from '../agents/types';
import { IAIProvider } from './ai/IAIProvider';
import { getAIProviderFactory } from './ai/AIProviderFactory';

/**
 * Pattern for detecting sub-agent requests in terminal output
 */
export interface SubAgentRequestPattern {
    type: SubAgentType;
    patterns: RegExp[];
    extractPrompt: (match: RegExpMatchArray, fullText: string) => string;
    extractDescription?: (match: RegExpMatchArray, fullText: string) => string;
}

/**
 * Parsed sub-agent request from terminal output
 */
export interface ParsedSubAgentRequest {
    type: SubAgentType;
    description: string;
    prompt: string;
    priority?: number;
    context?: Record<string, any>;
}

/**
 * Terminal monitoring statistics
 */
export interface TerminalMonitorStats {
    totalRequestsDetected: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    requestsByType: Map<SubAgentType, number>;
}

/**
 * Service that monitors terminal output for sub-agent requests
 * and bridges them with the TaskToolBridge
 */
export class TerminalMonitor extends EventEmitter {
    private readonly logger: ILoggingService;
    private readonly configService: IConfigurationService;
    private readonly taskToolBridge: TaskToolBridge;
    private aiProvider: IAIProvider;

    // Terminal tracking
    private readonly monitoredTerminals: Map<vscode.Terminal, string> = new Map(); // Terminal -> AgentId
    private readonly terminalBuffers: Map<vscode.Terminal, string> = new Map();
    private readonly terminalDisposables: Map<vscode.Terminal, vscode.Disposable[]> = new Map();

    // Request patterns
    private readonly requestPatterns: SubAgentRequestPattern[] = [];

    // Active requests
    private readonly activeRequests: Map<string, ParsedSubAgentRequest> = new Map();

    // Statistics
    private readonly stats: TerminalMonitorStats = {
        totalRequestsDetected: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        requestsByType: new Map()
    };

    private readonly responseTimes: number[] = [];

    constructor(loggingService: ILoggingService, configService: IConfigurationService, taskToolBridge: TaskToolBridge) {
        super();
        this.logger = loggingService;
        this.configService = configService;
        this.taskToolBridge = taskToolBridge;

        // Initialize AI provider
        const aiPath = configService.get('aiPath', 'claude');
        const factory = getAIProviderFactory(loggingService);
        this.aiProvider = factory.createProvider(aiPath);

        // Initialize request patterns (fallback for non-AI providers)
        this.initializeRequestPatterns();

        // Listen to TaskToolBridge events
        this.setupTaskToolBridgeListeners();

        this.logger.info('TerminalMonitor initialized', {
            aiProvider: this.aiProvider.name,
            supportsSubAgents: this.aiProvider.supportsSubAgents()
        });
    }

    /**
     * Start monitoring a terminal for an agent
     */
    startMonitoring(terminal: vscode.Terminal, agentId: string): void {
        if (this.monitoredTerminals.has(terminal)) {
            this.logger.warn(`Terminal already being monitored for agent ${agentId}`);
            return;
        }

        this.logger.info(`Starting terminal monitoring for agent ${agentId}`);

        // Track terminal
        this.monitoredTerminals.set(terminal, agentId);
        this.terminalBuffers.set(terminal, '');

        const disposables: vscode.Disposable[] = [];

        // Monitor terminal data events (if available in future VS Code versions)
        // For now, we'll use a different approach with output parsing

        // Listen for terminal close
        const closeListener = vscode.window.onDidCloseTerminal(closedTerminal => {
            if (closedTerminal === terminal) {
                this.stopMonitoring(terminal);
            }
        });
        disposables.push(closeListener);

        this.terminalDisposables.set(terminal, disposables);

        // Emit monitoring started event
        this.emit('monitoringStarted', { terminal, agentId });
    }

    /**
     * Stop monitoring a terminal
     */
    stopMonitoring(terminal: vscode.Terminal): void {
        const agentId = this.monitoredTerminals.get(terminal);
        if (!agentId) {
            return;
        }

        this.logger.info(`Stopping terminal monitoring for agent ${agentId}`);

        // Clean up disposables
        const disposables = this.terminalDisposables.get(terminal);
        if (disposables) {
            disposables.forEach(d => d.dispose());
            this.terminalDisposables.delete(terminal);
        }

        // Remove from tracking
        this.monitoredTerminals.delete(terminal);
        this.terminalBuffers.delete(terminal);

        // Emit monitoring stopped event
        this.emit('monitoringStopped', { terminal, agentId });
    }

    /**
     * Process terminal output data
     * This would be called by an extension that captures terminal output
     */
    async processTerminalData(terminal: vscode.Terminal, data: string): Promise<void> {
        const agentId = this.monitoredTerminals.get(terminal);
        if (!agentId) {
            return;
        }

        // Add to buffer
        let buffer = this.terminalBuffers.get(terminal) || '';
        buffer += data;

        // Keep only last 10KB of buffer
        if (buffer.length > 10240) {
            buffer = buffer.slice(-10240);
        }

        this.terminalBuffers.set(terminal, buffer);

        // Check for sub-agent requests
        const request = this.detectSubAgentRequest(buffer);
        if (request) {
            await this.handleSubAgentRequest(agentId, request);

            // Clear buffer after processing request
            this.terminalBuffers.set(terminal, '');
        }
    }

    /**
     * Detect sub-agent request in terminal output
     */
    private detectSubAgentRequest(text: string): ParsedSubAgentRequest | null {
        // First try AI provider-specific parsing if available
        if (this.aiProvider.supportsSubAgents()) {
            const aiRequest = this.aiProvider.parseSubAgentRequest(text);
            if (aiRequest) {
                return {
                    type: (aiRequest.type as SubAgentType) || SubAgentType.GENERAL_PURPOSE,
                    description: aiRequest.description,
                    prompt: aiRequest.prompt,
                    priority: aiRequest.options?.priority,
                    context: aiRequest.options?.context
                };
            }
        }

        // Fallback: First check for explicit JSON sub-agent requests
        const jsonMatch = text.match(/SUB_AGENT_REQUEST:\s*({[\s\S]*?})/);
        if (jsonMatch) {
            try {
                const json = JSON.parse(jsonMatch[1]);
                return {
                    type: json.type || SubAgentType.GENERAL_PURPOSE,
                    description: json.description || 'Sub-agent task',
                    prompt: json.prompt,
                    priority: json.priority,
                    context: json.context
                };
            } catch (error) {
                this.logger.error('Failed to parse SUB_AGENT_REQUEST JSON', error);
            }
        }

        // Fallback: Check pattern-based detection
        for (const pattern of this.requestPatterns) {
            for (const regex of pattern.patterns) {
                const match = text.match(regex);
                if (match) {
                    const description = pattern.extractDescription?.(match, text) || `${pattern.type} task`;
                    const prompt = pattern.extractPrompt(match, text);

                    if (prompt) {
                        return {
                            type: pattern.type,
                            description,
                            prompt
                        };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Handle detected sub-agent request
     */
    private async handleSubAgentRequest(agentId: string, request: ParsedSubAgentRequest): Promise<void> {
        const startTime = Date.now();
        const requestId = this.generateRequestId();

        this.logger.info(`Sub-agent request detected from ${agentId}`, request);

        // Track request
        this.activeRequests.set(requestId, request);
        this.stats.totalRequestsDetected++;
        this.updateTypeStats(request.type);

        // Emit request detected event
        this.emit('subAgentRequestDetected', {
            agentId,
            requestId,
            request
        });

        // Check if auto-execution is enabled
        if (!this.shouldAutoExecute(agentId, request)) {
            this.logger.info(`Auto-execution disabled for sub-agent request ${requestId}`);
            return;
        }

        try {
            // Emit sub-agent starting event for UI updates
            this.emit('subAgentStarted', {
                agentId,
                requestId,
                request
            });

            // Execute sub-agent task
            const result = await this.taskToolBridge.executeTaskForAgent(
                agentId,
                request.type,
                request.description,
                request.prompt,
                {
                    priority: request.priority,
                    context: request.context
                }
            );

            // Track response time
            const responseTime = Date.now() - startTime;
            this.trackResponseTime(responseTime);

            // Update statistics
            if (result.status === 'success') {
                this.stats.successfulRequests++;
            } else {
                this.stats.failedRequests++;
            }

            // Send result back to agent terminal
            await this.sendResultToAgent(agentId, requestId, result);

            // Emit completion event
            this.emit('subAgentRequestCompleted', {
                agentId,
                requestId,
                request,
                result,
                responseTime
            });
        } catch (error: any) {
            this.logger.error(`Failed to handle sub-agent request from ${agentId}`, error);
            this.stats.failedRequests++;

            // Send error to agent
            await this.sendErrorToAgent(agentId, requestId, error.message);

            // Emit error event
            this.emit('subAgentRequestFailed', {
                agentId,
                requestId,
                request,
                error: error.message
            });
        } finally {
            // Clean up
            this.activeRequests.delete(requestId);
        }
    }

    /**
     * Send sub-agent result back to agent terminal
     */
    private async sendResultToAgent(agentId: string, requestId: string, result: any): Promise<void> {
        // Find agent terminal
        const terminal = this.findAgentTerminal(agentId);
        if (!terminal) {
            this.logger.warn(`Terminal not found for agent ${agentId}`);
            return;
        }

        // Format result for terminal
        const formattedResult = this.formatResultForTerminal(requestId, result);

        // Send to terminal
        terminal.sendText(formattedResult);

        this.logger.info(`Sent sub-agent result to ${agentId}`);
    }

    /**
     * Send error to agent terminal
     */
    private async sendErrorToAgent(agentId: string, requestId: string, error: string): Promise<void> {
        const terminal = this.findAgentTerminal(agentId);
        if (!terminal) {
            return;
        }

        const errorMessage = `
SUB_AGENT_ERROR:
Request ID: ${requestId}
Error: ${error}
`;

        terminal.sendText(errorMessage);
    }

    /**
     * Format result for terminal display
     */
    private formatResultForTerminal(requestId: string, result: any): string {
        return `
================================================================================
SUB_AGENT_RESULT:
Request ID: ${requestId}
Status: ${result.status}
Execution Time: ${result.executionTime}ms

Result:
${result.result || result.error || 'No result'}

${result.metadata ? `Metadata: ${JSON.stringify(result.metadata, null, 2)}` : ''}
================================================================================
`;
    }

    /**
     * Find terminal for a given agent ID
     */
    private findAgentTerminal(agentId: string): vscode.Terminal | undefined {
        for (const [terminal, id] of this.monitoredTerminals.entries()) {
            if (id === agentId) {
                return terminal;
            }
        }
        return undefined;
    }

    /**
     * Initialize request detection patterns
     */
    private initializeRequestPatterns(): void {
        // Pattern for code review requests
        this.requestPatterns.push({
            type: SubAgentType.CODE_LEAD_REVIEWER,
            patterns: [
                /REVIEW_CODE:\s*([\s\S]*?)(?:END_REVIEW|$)/i,
                /Please review the following code:\s*([\s\S]*?)(?:---|\n\n|$)/i,
                /Code review needed:\s*([\s\S]*?)(?:---|\n\n|$)/i
            ],
            extractPrompt: (match, fullText) => {
                return match[1].trim();
            },
            extractDescription: () => 'Code review request'
        });

        // Pattern for general research/analysis
        this.requestPatterns.push({
            type: SubAgentType.GENERAL_PURPOSE,
            patterns: [
                /RESEARCH:\s*([\s\S]*?)(?:END_RESEARCH|$)/i,
                /ANALYZE:\s*([\s\S]*?)(?:END_ANALYZE|$)/i,
                /Please research:\s*([\s\S]*?)(?:---|\n\n|$)/i,
                /Find all\s+(.*?)\s+in the codebase/i
            ],
            extractPrompt: (match, fullText) => {
                return match[1].trim();
            },
            extractDescription: match => {
                if (match[0].toLowerCase().includes('research')) {
                    return 'Research task';
                } else if (match[0].toLowerCase().includes('analyze')) {
                    return 'Analysis task';
                } else if (match[0].toLowerCase().includes('find')) {
                    return 'Search task';
                }
                return 'General purpose task';
            }
        });

        // Pattern for parallel task execution
        this.requestPatterns.push({
            type: SubAgentType.GENERAL_PURPOSE,
            patterns: [/PARALLEL_TASKS:\s*\[([\s\S]*?)\]/i, /Execute in parallel:\s*\[([\s\S]*?)\]/i],
            extractPrompt: match => {
                // Parse parallel tasks
                try {
                    const tasks = JSON.parse(`[${match[1]}]`);
                    return `Execute the following tasks in parallel: ${JSON.stringify(tasks)}`;
                } catch {
                    return match[1];
                }
            },
            extractDescription: () => 'Parallel task execution'
        });
    }

    /**
     * Set up listeners for TaskToolBridge events
     */
    private setupTaskToolBridgeListeners(): void {
        // Listen for task progress
        this.taskToolBridge.on('taskProgress', progress => {
            this.emit('subAgentProgress', progress);
        });

        // Listen for task completion
        this.taskToolBridge.on('taskCompleted', result => {
            this.logger.debug('Sub-agent task completed', result);
        });

        // Listen for task errors
        this.taskToolBridge.on('taskFailed', result => {
            this.logger.error('Sub-agent task failed', result);
        });
    }

    /**
     * Inject sub-agent capability instructions into agent prompt
     */
    injectSubAgentInstructions(agentPrompt: string, agentType: string): string {
        const instructions = `

## Sub-Agent Capabilities

You have the ability to spawn sub-agents to help with complex tasks. To use sub-agents:

1. **For code review**, output:
   \`\`\`
   REVIEW_CODE:
   [paste code to review]
   END_REVIEW
   \`\`\`

2. **For research/analysis**, output:
   \`\`\`
   RESEARCH:
   [describe what to research]
   END_RESEARCH
   \`\`\`

3. **For explicit sub-agent requests**, output:
   \`\`\`json
   SUB_AGENT_REQUEST: {
     "type": "general-purpose",
     "description": "Brief description",
     "prompt": "Detailed instructions for sub-agent",
     "priority": 5,
     "context": { "key": "value" }
   }
   \`\`\`

Sub-agents will execute in parallel and return results directly to your terminal.
Use sub-agents for:
- Parallel research and analysis
- Code review after implementations
- Complex searches across the codebase
- Any task that can be delegated for efficiency

Remember: Sub-agents work independently and cannot modify files. They provide analysis and information only.
`;

        return agentPrompt + instructions;
    }

    /**
     * Get monitoring statistics
     */
    getStats(): TerminalMonitorStats {
        return {
            ...this.stats,
            requestsByType: new Map(this.stats.requestsByType)
        };
    }

    /**
     * Get list of monitored agents
     */
    getMonitoredAgents(): string[] {
        return Array.from(this.monitoredTerminals.values());
    }

    /**
     * Check if agent is being monitored
     */
    isAgentMonitored(agentId: string): boolean {
        return this.getMonitoredAgents().includes(agentId);
    }

    /**
     * Check if sub-agent request should be auto-executed
     */
    private shouldAutoExecute(agentId: string, request: ParsedSubAgentRequest): boolean {
        // Check global auto-execute setting
        const autoExecute = this.configService.get<boolean>('nofx.subAgents.autoExecute', true);
        if (!autoExecute) {
            return false;
        }

        // Check if this sub-agent type is allowed for auto-execution
        const allowedTypes = this.configService.get<string[]>('nofx.subAgents.autoExecuteTypes', [
            'general-purpose',
            'code-lead-reviewer'
        ]);
        
        if (!allowedTypes.includes(request.type)) {
            this.logger.debug(`Sub-agent type '${request.type}' not in auto-execute whitelist`, {
                allowedTypes,
                requestType: request.type
            });
            return false;
        }

        // Check agent-specific limits
        const maxConcurrentPerAgent = this.configService.get<number>('nofx.subAgents.maxPerAgent', 3);
        const currentAgentTasks = this.taskToolBridge.getAgentTasks(agentId).length;
        
        if (currentAgentTasks >= maxConcurrentPerAgent) {
            this.logger.debug(`Agent ${agentId} has reached max concurrent sub-agents (${currentAgentTasks}/${maxConcurrentPerAgent})`);
            return false;
        }

        // Check system-wide limits
        const maxConcurrentTotal = this.configService.get<number>('nofx.subAgents.maxTotal', 10);
        const stats = this.taskToolBridge.getStats();
        
        if (stats.activeTaskCount >= maxConcurrentTotal) {
            this.logger.debug(`System has reached max concurrent sub-agents (${stats.activeTaskCount}/${maxConcurrentTotal})`);
            return false;
        }

        return true;
    }

    /**
     * Generate unique request ID
     */
    private generateRequestId(): string {
        return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update type statistics
     */
    private updateTypeStats(type: SubAgentType): void {
        const current = this.stats.requestsByType.get(type) || 0;
        this.stats.requestsByType.set(type, current + 1);
    }

    /**
     * Track response time
     */
    private trackResponseTime(time: number): void {
        this.responseTimes.push(time);

        // Keep only last 100 times
        if (this.responseTimes.length > 100) {
            this.responseTimes.shift();
        }

        // Update average
        const sum = this.responseTimes.reduce((a, b) => a + b, 0);
        this.stats.averageResponseTime = Math.round(sum / this.responseTimes.length);
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Stop monitoring all terminals
        const terminals = Array.from(this.monitoredTerminals.keys());
        terminals.forEach(terminal => this.stopMonitoring(terminal));

        // Clear collections
        this.activeRequests.clear();
        this.responseTimes.length = 0;

        // Remove all listeners
        this.removeAllListeners();

        this.logger.info('TerminalMonitor disposed');
    }
}
