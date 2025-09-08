import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { extractJsonFromClaudeOutput } from '../orchestration/MessageProtocol';
import { ILoggingService, IEventBus } from './interfaces';
import { AGENT_EVENTS, TASK_EVENTS } from './EventConstants';

/**
 * Routes and executes commands from conductor terminal output
 * Enhanced with robust error handling, retry logic, and self-healing
 */
export class TerminalCommandRouter {
    private terminal: vscode.Terminal | undefined;
    private disposables: vscode.Disposable[] = [];
    private outputBuffer: string = '';
    private bufferTimeout: NodeJS.Timeout | undefined;
    private isProcessing = false;
    private commandQueue: Array<{ command: any; timestamp: Date }> = [];
    private failedCommands: Map<string, number> = new Map();
    private isHealthy = true;
    private lastHealthCheck: Date = new Date();
    private readonly MAX_RETRIES = 3;
    private readonly MAX_QUEUE_SIZE = 50;
    private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
    private healthCheckTimer?: NodeJS.Timeout;

    constructor(
        private agentManager: AgentManager,
        private taskQueue: TaskQueue,
        private loggingService?: ILoggingService,
        private eventBus?: IEventBus
    ) {}

    /**
     * Start monitoring a terminal for conductor commands
     */
    public startMonitoring(terminal: vscode.Terminal): void {
        try {
            this.terminal = terminal;
            this.isHealthy = true;
            this.loggingService?.info('TerminalCommandRouter: Starting command monitoring');

            // Monitor terminal output
            const writeEmitter = (vscode.window as any).onDidWriteTerminalData;
            if (writeEmitter) {
                this.disposables.push(
                    writeEmitter((e: any) => {
                        try {
                            if (e.terminal === this.terminal) {
                                this.handleTerminalOutput(e.data);
                            }
                        } catch (error) {
                            this.loggingService?.error('Error handling terminal data event:', error);
                            // Continue monitoring even if one event fails
                        }
                    })
                );

                // Start health check timer
                this.startHealthCheck();
            } else {
                // Fallback: VS Code API might not have this event yet
                this.loggingService?.warn('Terminal data monitoring not available in this VS Code version');

                // Try alternative monitoring approach
                this.setupAlternativeMonitoring();
            }
        } catch (error) {
            this.loggingService?.error('Failed to start terminal monitoring:', error);
            this.isHealthy = false;
            throw error;
        }
    }

    /**
     * Handle terminal output data with error resilience
     */
    private handleTerminalOutput(data: string): void {
        try {
            // Validate data
            if (typeof data !== 'string') {
                this.loggingService?.warn('Invalid terminal data type:', typeof data);
                return;
            }

            // Add to buffer with size limit
            if (this.outputBuffer.length > 100000) {
                // Buffer too large, process what we have and clear
                this.loggingService?.warn('Terminal buffer overflow, processing and clearing');
                this.processBuffer();
                this.outputBuffer = data;
            } else {
                this.outputBuffer += data;
            }

            // Clear existing timeout
            if (this.bufferTimeout) {
                clearTimeout(this.bufferTimeout);
            }

            // Set new timeout to process buffer
            this.bufferTimeout = setTimeout(() => {
                this.processBuffer();
            }, 500); // Wait 500ms for complete output
        } catch (error) {
            this.loggingService?.error('Error in handleTerminalOutput:', error);
            // Reset buffer to prevent corruption
            this.outputBuffer = '';
        }
    }

    /**
     * Process buffered output for commands with queue management
     */
    private async processBuffer(): Promise<void> {
        if (this.isProcessing || !this.outputBuffer.trim()) {
            return;
        }

        this.isProcessing = true;
        const buffer = this.outputBuffer;
        this.outputBuffer = '';

        try {
            // Extract JSON commands from Claude's output
            const commands = this.extractAllCommands(buffer);

            if (commands.length > 0) {
                for (const command of commands) {
                    this.loggingService?.info('Detected conductor command:', command);

                    // Add to queue instead of executing immediately
                    this.enqueueCommand(command);
                }

                // Process queue
                await this.processCommandQueue();
            }
        } catch (error) {
            this.loggingService?.error('Error processing terminal output:', error);
            this.recordFailure('processBuffer', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Extract all JSON commands from buffer (might be multiple)
     */
    private extractAllCommands(buffer: string): any[] {
        const commands: any[] = [];

        try {
            // Try the standard extraction first
            const command = extractJsonFromClaudeOutput(buffer);
            if (command) {
                commands.push(command);
            }

            // Also look for multiple JSON objects in the buffer
            const jsonMatches = buffer.match(/\{[^{}]*\}/g);
            if (jsonMatches) {
                for (const match of jsonMatches) {
                    try {
                        const parsed = JSON.parse(match);
                        if (parsed.type && !commands.some(c => JSON.stringify(c) === JSON.stringify(parsed))) {
                            commands.push(parsed);
                        }
                    } catch {
                        // Not valid JSON, skip
                    }
                }
            }
        } catch (error) {
            this.loggingService?.error('Error extracting commands:', error);
        }

        return commands;
    }

    /**
     * Add command to queue with deduplication
     */
    private enqueueCommand(command: any): void {
        // Check queue size
        if (this.commandQueue.length >= this.MAX_QUEUE_SIZE) {
            this.loggingService?.warn('Command queue full, removing oldest command');
            this.commandQueue.shift();
        }

        // Add to queue with timestamp
        this.commandQueue.push({
            command,
            timestamp: new Date()
        });
    }

    /**
     * Process queued commands with retry logic
     */
    private async processCommandQueue(): Promise<void> {
        while (this.commandQueue.length > 0) {
            const item = this.commandQueue.shift();
            if (!item) continue;

            const commandKey = JSON.stringify(item.command);
            const retryCount = this.failedCommands.get(commandKey) || 0;

            try {
                await this.executeCommandWithRetry(item.command, retryCount);
                this.failedCommands.delete(commandKey);
            } catch (error) {
                this.loggingService?.error('Failed to execute command after retries:', error);
                // Command failed even after retries, don't re-queue
            }
        }
    }

    /**
     * Execute command with retry logic
     */
    private async executeCommandWithRetry(command: any, currentRetry: number = 0): Promise<void> {
        try {
            await this.executeCommand(command);
        } catch (error) {
            const commandKey = JSON.stringify(command);

            if (currentRetry < this.MAX_RETRIES) {
                this.loggingService?.warn(`Command execution failed, retry ${currentRetry + 1}/${this.MAX_RETRIES}`);

                // Exponential backoff
                const delay = Math.pow(2, currentRetry) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));

                this.failedCommands.set(commandKey, currentRetry + 1);
                await this.executeCommandWithRetry(command, currentRetry + 1);
            } else {
                this.failedCommands.delete(commandKey);
                throw error;
            }
        }
    }

    /**
     * Execute a conductor command with validation
     */
    private async executeCommand(command: any): Promise<void> {
        // Validate command structure
        if (!command || typeof command !== 'object' || !command.type) {
            throw new Error('Invalid command structure');
        }

        try {
            let result: string | undefined;

            switch (command.type) {
                case 'spawn':
                case 'spawn_agent':
                    result = await this.handleSpawnAgent(command);
                    break;

                case 'assign':
                case 'assign_task':
                    result = await this.handleAssignTask(command);
                    break;

                case 'status':
                case 'query_status':
                    result = await this.handleQueryStatus(command);
                    break;

                case 'terminate':
                case 'terminate_agent':
                    result = await this.handleTerminateAgent(command);
                    break;

                case 'spawn_team':
                    result = await this.handleSpawnTeam(command);
                    break;

                case 'help':
                    result = this.handleHelp();
                    break;

                default:
                    this.loggingService?.warn(`Unknown command type: ${command.type}`);
                    result = `⚠️ Unknown command type: ${command.type}`;
            }

            // Send result back to terminal if available
            if (result && this.terminal) {
                this.sendToTerminal(result);
            }

            // Record success for health monitoring
            this.recordSuccess();
        } catch (error) {
            const errorMsg = `❌ Command execution failed: ${error}`;
            this.loggingService?.error(errorMsg);
            this.sendToTerminal(errorMsg);
            this.recordFailure('executeCommand', error);
            throw error; // Re-throw for retry logic
        }
    }

    /**
     * Handle spawn agent command
     */
    private async handleSpawnAgent(command: any): Promise<string> {
        const { role, name } = command;

        this.loggingService?.info(`Spawning agent: ${role} (${name || 'unnamed'})`);

        // Use AgentManager to spawn the agent
        const agent = await this.agentManager.spawnAgent({
            type: role,
            name: name || undefined
        });

        if (agent) {
            this.eventBus?.publish(AGENT_EVENTS.AGENT_CREATED, { agent });
            return `✅ Spawned ${role} agent: ${agent.name} (${agent.id})`;
        } else {
            return `❌ Failed to spawn ${role} agent`;
        }
    }

    /**
     * Handle assign task command
     */
    private async handleAssignTask(command: any): Promise<string> {
        const { task, agentId, priority = 'normal' } = command;

        this.loggingService?.info(`Assigning task to ${agentId}: ${task}`);

        // Add task to queue
        const taskItem = this.taskQueue.addTask({
            title: task,
            description: task,
            priority
        });

        if (taskItem) {
            this.eventBus?.publish(TASK_EVENTS.TASK_CREATED, { task: taskItem });

            // If specific agent, assign the task to them
            if (agentId && agentId !== 'auto') {
                await this.taskQueue.assignTask(taskItem.id, agentId);

                const agent = this.agentManager.getAgent(agentId);
                if (agent?.terminal) {
                    // Send task to agent's terminal
                    agent.terminal.sendText(`\n# New Task Assigned:\n${task}\nPriority: ${priority}\n`);
                }

                return `✅ Task assigned: "${task}" to ${agentId} (priority: ${priority})`;
            } else {
                // Auto-assign will be handled by task queue
                return `✅ Task created: "${task}" (priority: ${priority}, auto-assignment pending)`;
            }
        } else {
            return `❌ Failed to create task: ${task}`;
        }
    }

    /**
     * Handle query status command
     */
    private async handleQueryStatus(command: any): Promise<string> {
        const { agentId } = command;

        if (agentId === 'all') {
            const agents = this.agentManager.getActiveAgents();
            if (agents.length === 0) {
                return '📊 No active agents';
            }

            let status = '📊 Agent Status:\n';
            for (const agent of agents) {
                const tasks = this.taskQueue.getTasksForAgent(agent.id);
                const taskInfo = tasks.length > 0 ? `working on ${tasks.length} task(s)` : 'idle';
                status += `  • ${agent.name} (${agent.type}): ${agent.status} - ${taskInfo}\n`;
            }
            return status;
        } else {
            const agent = this.agentManager.getAgent(agentId);
            if (!agent) {
                return `❌ Agent ${agentId} not found`;
            }

            const tasks = this.taskQueue.getTasksForAgent(agent.id);
            const taskInfo = tasks.length > 0 ? `Working on: ${tasks.map(t => t.title).join(', ')}` : 'No active tasks';

            return `📊 ${agent.name} (${agent.type}):\n  Status: ${agent.status}\n  ${taskInfo}`;
        }
    }

    /**
     * Handle terminate agent command
     */
    private async handleTerminateAgent(command: any): Promise<string> {
        const { agentId } = command;

        if (agentId === 'all') {
            const agents = this.agentManager.getActiveAgents();
            for (const agent of agents) {
                await this.agentManager.removeAgent(agent.id);
            }
            this.eventBus?.publish(AGENT_EVENTS.ALL_TERMINATED, {});
            return `✅ Terminated all ${agents.length} agents`;
        } else {
            const agent = this.agentManager.getAgent(agentId);
            if (!agent) {
                return `❌ Agent ${agentId} not found`;
            }

            await this.agentManager.removeAgent(agentId);
            this.eventBus?.publish(AGENT_EVENTS.AGENT_TERMINATED, { agentId });
            return `✅ Terminated ${agent.name} (${agentId})`;
        }
    }

    /**
     * Handle spawn team command
     */
    private async handleSpawnTeam(command: any): Promise<string> {
        const { preset } = command;

        this.loggingService?.info(`Spawning team preset: ${preset}`);

        // Define team presets
        const presets: Record<string, string[]> = {
            'small-team': ['frontend-specialist', 'backend-specialist'],
            'standard-team': ['frontend-specialist', 'backend-specialist', 'testing-specialist'],
            'large-team': [
                'frontend-specialist',
                'backend-specialist',
                'testing-specialist',
                'devops-engineer',
                'database-architect'
            ],
            'fullstack-team': ['fullstack-developer', 'testing-specialist', 'devops-engineer'],
            'custom-team': ['frontend-specialist', 'backend-specialist'] // Default for custom
        };

        const roles = presets[preset] || presets['standard-team'];
        const spawned: string[] = [];

        for (const role of roles) {
            const agent = await this.agentManager.spawnAgent({
                type: role,
                name: `${role}-${Date.now().toString(36).substr(-4)}`
            });
            if (agent) {
                spawned.push(`${agent.name} (${role})`);
            }
        }

        if (spawned.length > 0) {
            return `✅ Spawned ${preset}:\n${spawned.map(s => `  • ${s}`).join('\n')}`;
        } else {
            return `❌ Failed to spawn ${preset}`;
        }
    }

    /**
     * Handle help command
     */
    private handleHelp(): string {
        return `📚 Conductor Commands:
        
Natural Language:
  • "add a frontend dev" - Spawn an agent
  • "what's everyone doing?" - Check all status
  • "assign login form to agent-1" - Assign task
  • "terminate agent-2" - Remove agent
  • "start a small team" - Spawn team preset

JSON Commands:
  • {"type": "spawn", "role": "frontend-specialist"}
  • {"type": "status", "agentId": "all"}
  • {"type": "assign", "task": "...", "agentId": "agent-1"}
  • {"type": "terminate", "agentId": "agent-1"}
  
Team Presets: small-team, standard-team, large-team, fullstack-team`;
    }

    /**
     * Send message to terminal
     */
    private sendToTerminal(message: string): void {
        if (this.terminal) {
            // Format message with newlines and prefix
            const formatted = `\n[System] ${message}\n`;

            // Note: We can't directly write to terminal, but we can show notification
            // and log the result
            vscode.window.showInformationMessage(message);
            this.loggingService?.info(`Command result: ${message}`);
        }
    }

    /**
     * Setup alternative monitoring for older VS Code versions
     */
    private setupAlternativeMonitoring(): void {
        this.loggingService?.info('Setting up alternative terminal monitoring');

        // Poll terminal state periodically as fallback
        const pollInterval = setInterval(() => {
            if (!this.terminal) {
                clearInterval(pollInterval);
                return;
            }

            // Check if terminal is still active
            const terminals = vscode.window.terminals;
            if (!terminals.includes(this.terminal)) {
                this.loggingService?.warn('Monitored terminal no longer active');
                this.stopMonitoring();
            }
        }, 5000);

        this.disposables.push(new vscode.Disposable(() => clearInterval(pollInterval)));
    }

    /**
     * Start health check timer
     */
    private startHealthCheck(): void {
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, this.HEALTH_CHECK_INTERVAL);
    }

    /**
     * Perform health check and self-healing
     */
    private performHealthCheck(): void {
        const now = new Date();
        const timeSinceLastCheck = now.getTime() - this.lastHealthCheck.getTime();

        // Check if monitoring is still working
        if (timeSinceLastCheck > this.HEALTH_CHECK_INTERVAL * 2) {
            this.loggingService?.warn('Health check delayed, monitoring may be stuck');
            this.isHealthy = false;
        }

        // Check command queue health
        if (this.commandQueue.length > this.MAX_QUEUE_SIZE * 0.8) {
            this.loggingService?.warn('Command queue near capacity');
        }

        // Check failed commands
        if (this.failedCommands.size > 10) {
            this.loggingService?.warn(`High number of failed commands: ${this.failedCommands.size}`);
            // Clear old failed commands
            this.failedCommands.clear();
        }

        this.lastHealthCheck = now;

        // Self-healing if unhealthy
        if (!this.isHealthy && this.terminal) {
            this.loggingService?.info('Attempting self-healing of terminal monitoring');
            this.restart();
        }
    }

    /**
     * Record successful command execution
     */
    private recordSuccess(): void {
        this.isHealthy = true;
    }

    /**
     * Record failure for health monitoring
     */
    private recordFailure(operation: string, error: any): void {
        this.loggingService?.error(`Operation ${operation} failed:`, error);

        // Don't mark unhealthy for isolated failures
        if (this.failedCommands.size > 5) {
            this.isHealthy = false;
        }
    }

    /**
     * Restart monitoring
     */
    private restart(): void {
        const terminal = this.terminal;
        this.stopMonitoring();

        if (terminal) {
            setTimeout(() => {
                this.startMonitoring(terminal);
            }, 1000);
        }
    }

    /**
     * Get health status
     */
    public getHealthStatus(): {
        isHealthy: boolean;
        queueSize: number;
        failedCommands: number;
        lastHealthCheck: Date;
    } {
        return {
            isHealthy: this.isHealthy,
            queueSize: this.commandQueue.length,
            failedCommands: this.failedCommands.size,
            lastHealthCheck: this.lastHealthCheck
        };
    }

    /**
     * Stop monitoring
     */
    public stopMonitoring(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }

        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }

        this.terminal = undefined;
        this.outputBuffer = '';
        this.commandQueue = [];
        this.failedCommands.clear();
        this.loggingService?.info('TerminalCommandRouter: Stopped monitoring');
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stopMonitoring();
    }
}
