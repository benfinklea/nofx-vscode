import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { ILoggingService, IConfigurationService } from './interfaces';
import { Agent } from '../agents/types';
import { IAIProvider } from './ai/IAIProvider';
import { getAIProviderFactory } from './ai/AIProviderFactory';

/**
 * Types of sub-agents that can be spawned
 */
export enum SubAgentType {
    GENERAL_PURPOSE = 'general-purpose',
    CODE_LEAD_REVIEWER = 'code-lead-reviewer',
    STATUSLINE_SETUP = 'statusline-setup',
    OUTPUT_STYLE_SETUP = 'output-style-setup'
}

/**
 * Request to spawn a sub-agent task
 */
export interface TaskRequest {
    id: string;
    parentAgentId: string;
    type: SubAgentType;
    description: string;
    prompt: string;
    priority?: number;
    timeout?: number;
    context?: Record<string, any>;
    createdAt: Date;
}

/**
 * Result from a sub-agent task execution
 */
export interface TaskResult {
    id: string;
    parentAgentId: string;
    type: SubAgentType;
    status: 'success' | 'error' | 'timeout' | 'cancelled';
    result?: string;
    error?: string;
    executionTime: number;
    completedAt: Date;
    metadata?: Record<string, any>;
}

/**
 * Progress update from a sub-agent
 */
export interface TaskProgress {
    id: string;
    parentAgentId: string;
    progress: number; // 0-100
    message: string;
    timestamp: Date;
}

/**
 * Configuration for TaskToolBridge
 */
export interface TaskToolBridgeConfig {
    maxConcurrentTasks: number;
    maxTasksPerAgent: number;
    defaultTimeout: number;
    retryAttempts: number;
    retryDelay: number;
    aiPath?: string;
}

/**
 * Statistics for monitoring sub-agent performance
 */
export interface SubAgentStats {
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    timeoutTasks: number;
    cancelledTasks: number;
    averageExecutionTime: number;
    activeTaskCount: number;
    queuedTaskCount: number;
}

/**
 * Bridge service that allows NofX agents to spawn and manage sub-agents
 * using Claude's Task tool capabilities
 */
export class TaskToolBridge extends EventEmitter {
    private readonly logger: ILoggingService;
    private readonly configService: IConfigurationService;
    private config: TaskToolBridgeConfig;
    private aiProvider: IAIProvider;

    // Task management
    private readonly activeTasks: Map<string, TaskRequest> = new Map();
    private readonly taskQueues: Map<string, TaskRequest[]> = new Map();
    private readonly taskProcesses: Map<string, ChildProcess> = new Map();
    private readonly taskTimeouts: Map<string, NodeJS.Timeout> = new Map();

    // Performance tracking
    private readonly stats: SubAgentStats = {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        timeoutTasks: 0,
        cancelledTasks: 0,
        averageExecutionTime: 0,
        activeTaskCount: 0,
        queuedTaskCount: 0
    };

    // Agent tracking
    private readonly agentTaskCounts: Map<string, number> = new Map();
    private readonly taskExecutionTimes: number[] = [];

    constructor(loggingService: ILoggingService, configService: IConfigurationService) {
        super();
        this.logger = loggingService;
        this.configService = configService;

        // Load configuration
        this.config = this.loadConfiguration();

        // Initialize AI provider based on configuration
        const aiPath = this.config.aiPath || this.configService.get('aiPath', 'claude');
        const factory = getAIProviderFactory(loggingService);
        this.aiProvider = factory.createProvider(aiPath);

        // Listen for configuration changes
        this.configService.onDidChange(this.onConfigurationChange.bind(this));

        this.logger.info('TaskToolBridge initialized', {
            ...this.config,
            aiProvider: this.aiProvider.name,
            supportsSubAgents: this.aiProvider.supportsSubAgents()
        });
    }

    /**
     * Execute a task for a specific agent
     */
    async executeTaskForAgent(
        parentAgentId: string,
        type: SubAgentType,
        description: string,
        prompt: string,
        options?: {
            priority?: number;
            timeout?: number;
            context?: Record<string, any>;
        }
    ): Promise<TaskResult> {
        // Validate agent can spawn sub-agents
        if (!this.canAgentSpawnTask(parentAgentId)) {
            throw new Error(`Agent ${parentAgentId} has reached max concurrent tasks limit`);
        }

        // Create task request
        const taskRequest: TaskRequest = {
            id: this.generateTaskId(),
            parentAgentId,
            type,
            description,
            prompt,
            priority: options?.priority ?? 5,
            timeout: options?.timeout ?? this.config.defaultTimeout,
            context: options?.context,
            createdAt: new Date()
        };

        this.logger.info(`Creating sub-agent task for ${parentAgentId}`, {
            id: taskRequest.id,
            type,
            description
        });

        // Add to queue if agent has active tasks
        if (this.hasActiveTasks(parentAgentId)) {
            return this.queueTask(taskRequest);
        }

        // Execute immediately
        return this.executeTask(taskRequest);
    }

    /**
     * Execute a task immediately
     */
    private async executeTask(taskRequest: TaskRequest): Promise<TaskResult> {
        const startTime = Date.now();

        // Track task
        this.activeTasks.set(taskRequest.id, taskRequest);
        this.incrementAgentTaskCount(taskRequest.parentAgentId);
        this.updateStats('activeTaskCount', this.activeTasks.size);
        this.stats.totalTasks++;

        // Emit task started event
        this.emit('taskStarted', taskRequest);

        try {
            // Set timeout
            const timeoutHandle = this.setupTimeout(taskRequest);
            this.taskTimeouts.set(taskRequest.id, timeoutHandle);

            // Execute task using Claude CLI
            const result = await this.executeClaudeTask(taskRequest);

            // Clear timeout
            clearTimeout(timeoutHandle);
            this.taskTimeouts.delete(taskRequest.id);

            // Create successful result
            const taskResult: TaskResult = {
                id: taskRequest.id,
                parentAgentId: taskRequest.parentAgentId,
                type: taskRequest.type,
                status: 'success',
                result: result,
                executionTime: Date.now() - startTime,
                completedAt: new Date()
            };

            // Update statistics
            this.stats.successfulTasks++;
            this.trackExecutionTime(taskResult.executionTime);

            // Clean up and emit completion
            this.completeTask(taskRequest.id, taskResult);

            return taskResult;
        } catch (error: any) {
            // Handle error
            const taskResult: TaskResult = {
                id: taskRequest.id,
                parentAgentId: taskRequest.parentAgentId,
                type: taskRequest.type,
                status: 'error',
                error: error.message || 'Unknown error',
                executionTime: Date.now() - startTime,
                completedAt: new Date()
            };

            // Update statistics
            this.stats.failedTasks++;

            // Clean up and emit error
            this.completeTask(taskRequest.id, taskResult);

            return taskResult;
        }
    }

    /**
     * Execute task using Claude CLI
     */
    private async executeClaudeTask(taskRequest: TaskRequest): Promise<string> {
        // Check if AI provider supports sub-agents
        if (!this.aiProvider.supportsSubAgents()) {
            throw new Error(`AI provider '${this.aiProvider.name}' does not support sub-agents`);
        }

        try {
            // Execute sub-agent using the AI provider abstraction
            const result = await this.aiProvider.executeSubAgent(taskRequest.type, this.buildTaskPrompt(taskRequest), {
                timeout: taskRequest.timeout,
                priority: taskRequest.priority,
                context: taskRequest.context,
                workingDirectory: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            });

            // Track the task ID for cancellation
            this.taskProcesses.set(taskRequest.id, {
                kill: () => this.aiProvider.cancelSubAgent(result.taskId)
            } as any);

            // Emit progress updates
            this.emitProgressUpdate(taskRequest, result.result);

            // Clean up tracking
            this.taskProcesses.delete(taskRequest.id);

            if (result.success) {
                return result.result;
            } else {
                throw new Error(result.error || 'Sub-agent execution failed');
            }
        } catch (error) {
            this.taskProcesses.delete(taskRequest.id);
            throw error;
        }
    }

    /**
     * Build task prompt for Claude
     */
    private buildTaskPrompt(taskRequest: TaskRequest): string {
        const contextStr = taskRequest.context ? `\nContext: ${JSON.stringify(taskRequest.context)}` : '';

        return `You are a sub-agent with type "${taskRequest.type}".
Task: ${taskRequest.description}
${contextStr}

${taskRequest.prompt}

Please complete this task and return your results in a structured format.`;
    }

    /**
     * Parse Claude output
     */
    private parseClaudeOutput(output: string): string {
        try {
            const json = JSON.parse(output);
            return json.result || json.content || JSON.stringify(json);
        } catch {
            // Return raw output if not JSON
            return output;
        }
    }

    /**
     * Queue a task for later execution
     */
    private async queueTask(taskRequest: TaskRequest): Promise<TaskResult> {
        return new Promise((resolve, reject) => {
            // Add to agent's queue
            const queue = this.taskQueues.get(taskRequest.parentAgentId) || [];
            queue.push(taskRequest);
            this.taskQueues.set(taskRequest.parentAgentId, queue);

            // Update stats
            this.updateStats('queuedTaskCount', this.getQueuedTaskCount());

            this.logger.info(`Task ${taskRequest.id} queued for agent ${taskRequest.parentAgentId}`);

            // Emit queued event
            this.emit('taskQueued', taskRequest);

            // Set up listener for task completion
            const completeHandler = (result: TaskResult) => {
                if (result.id === taskRequest.id) {
                    this.removeListener('taskCompleted', completeHandler);
                    this.removeListener('taskFailed', failHandler);
                    resolve(result);
                }
            };

            const failHandler = (result: TaskResult) => {
                if (result.id === taskRequest.id) {
                    this.removeListener('taskCompleted', completeHandler);
                    this.removeListener('taskFailed', failHandler);
                    resolve(result);
                }
            };

            this.on('taskCompleted', completeHandler);
            this.on('taskFailed', failHandler);
        });
    }

    /**
     * Process next task in queue for an agent
     */
    private async processNextQueuedTask(parentAgentId: string): Promise<void> {
        const queue = this.taskQueues.get(parentAgentId);
        if (!queue || queue.length === 0) {
            return;
        }

        const nextTask = queue.shift();
        if (nextTask) {
            this.taskQueues.set(parentAgentId, queue);
            this.updateStats('queuedTaskCount', this.getQueuedTaskCount());

            // Execute the queued task
            const result = await this.executeTask(nextTask);

            // Emit appropriate event based on result
            if (result.status === 'success') {
                this.emit('taskCompleted', result);
            } else {
                this.emit('taskFailed', result);
            }
        }
    }

    /**
     * Cancel a task
     */
    async cancelTask(taskId: string): Promise<void> {
        const task = this.activeTasks.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        this.logger.info(`Cancelling task ${taskId}`);

        // Kill process if exists
        const process = this.taskProcesses.get(taskId);
        if (process) {
            process.kill('SIGTERM');
            this.taskProcesses.delete(taskId);
        }

        // Clear timeout
        const timeout = this.taskTimeouts.get(taskId);
        if (timeout) {
            clearTimeout(timeout);
            this.taskTimeouts.delete(taskId);
        }

        // Create cancelled result
        const result: TaskResult = {
            id: taskId,
            parentAgentId: task.parentAgentId,
            type: task.type,
            status: 'cancelled',
            executionTime: Date.now() - task.createdAt.getTime(),
            completedAt: new Date()
        };

        // Update stats
        this.stats.cancelledTasks++;

        // Complete task
        this.completeTask(taskId, result);

        // Emit cancellation
        this.emit('taskCancelled', result);
    }

    /**
     * Cancel all tasks for an agent
     */
    async cancelAgentTasks(parentAgentId: string): Promise<void> {
        const tasks = Array.from(this.activeTasks.values()).filter(task => task.parentAgentId === parentAgentId);

        for (const task of tasks) {
            await this.cancelTask(task.id);
        }

        // Clear queue
        this.taskQueues.delete(parentAgentId);
        this.updateStats('queuedTaskCount', this.getQueuedTaskCount());
    }

    /**
     * Get active tasks for an agent
     */
    getAgentTasks(parentAgentId: string): TaskRequest[] {
        return Array.from(this.activeTasks.values()).filter(task => task.parentAgentId === parentAgentId);
    }

    /**
     * Get queued tasks for an agent
     */
    getQueuedTasks(parentAgentId: string): TaskRequest[] {
        return this.taskQueues.get(parentAgentId) || [];
    }

    /**
     * Get statistics
     */
    getStats(): SubAgentStats {
        return { ...this.stats };
    }

    /**
     * Get statistics (alias for getStats for backward compatibility)
     */
    getStatistics(): SubAgentStats {
        return this.getStats();
    }

    /**
     * Get agent-specific statistics
     */
    getAgentStats(parentAgentId: string): {
        activeTasks: number;
        queuedTasks: number;
        totalTasks: number;
    } {
        return {
            activeTasks: this.getAgentTasks(parentAgentId).length,
            queuedTasks: this.getQueuedTasks(parentAgentId).length,
            totalTasks: this.agentTaskCounts.get(parentAgentId) || 0
        };
    }

    /**
     * Complete a task
     */
    private completeTask(taskId: string, result: TaskResult): void {
        const task = this.activeTasks.get(taskId);
        if (!task) {
            return;
        }

        // Remove from active tasks
        this.activeTasks.delete(taskId);
        this.decrementAgentTaskCount(task.parentAgentId);
        this.updateStats('activeTaskCount', this.activeTasks.size);

        // Log completion
        this.logger.info(`Task ${taskId} completed`, {
            status: result.status,
            executionTime: result.executionTime
        });

        // Process next queued task for this agent
        this.processNextQueuedTask(task.parentAgentId);
    }

    /**
     * Set up timeout for a task
     */
    private setupTimeout(taskRequest: TaskRequest): NodeJS.Timeout {
        return setTimeout(() => {
            this.handleTaskTimeout(taskRequest);
        }, taskRequest.timeout || this.config.defaultTimeout);
    }

    /**
     * Handle task timeout
     */
    private handleTaskTimeout(taskRequest: TaskRequest): void {
        this.logger.warn(`Task ${taskRequest.id} timed out`);

        // Kill process if exists
        const process = this.taskProcesses.get(taskRequest.id);
        if (process) {
            process.kill('SIGTERM');
            this.taskProcesses.delete(taskRequest.id);
        }

        // Create timeout result
        const result: TaskResult = {
            id: taskRequest.id,
            parentAgentId: taskRequest.parentAgentId,
            type: taskRequest.type,
            status: 'timeout',
            error: `Task timed out after ${taskRequest.timeout}ms`,
            executionTime: taskRequest.timeout || this.config.defaultTimeout,
            completedAt: new Date()
        };

        // Update stats
        this.stats.timeoutTasks++;

        // Complete task
        this.completeTask(taskRequest.id, result);

        // Emit timeout
        this.emit('taskTimeout', result);
    }

    /**
     * Emit progress update
     */
    private emitProgressUpdate(taskRequest: TaskRequest, output: string): void {
        // Try to extract progress from output
        const progressMatch = output.match(/progress:\s*(\d+)/i);
        if (progressMatch) {
            const progress: TaskProgress = {
                id: taskRequest.id,
                parentAgentId: taskRequest.parentAgentId,
                progress: parseInt(progressMatch[1]),
                message: 'Processing...',
                timestamp: new Date()
            };

            this.emit('taskProgress', progress);
        }
    }

    /**
     * Check if agent can spawn more tasks
     */
    private canAgentSpawnTask(parentAgentId: string): boolean {
        const currentCount = this.getAgentTasks(parentAgentId).length;
        return currentCount < this.config.maxTasksPerAgent;
    }

    /**
     * Check if agent has active tasks
     */
    private hasActiveTasks(parentAgentId: string): boolean {
        return this.getAgentTasks(parentAgentId).length > 0;
    }

    /**
     * Generate unique task ID
     */
    private generateTaskId(): string {
        return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get total queued task count
     */
    private getQueuedTaskCount(): number {
        let count = 0;
        for (const queue of this.taskQueues.values()) {
            count += queue.length;
        }
        return count;
    }

    /**
     * Increment agent task count
     */
    private incrementAgentTaskCount(parentAgentId: string): void {
        const current = this.agentTaskCounts.get(parentAgentId) || 0;
        this.agentTaskCounts.set(parentAgentId, current + 1);
    }

    /**
     * Decrement agent task count
     */
    private decrementAgentTaskCount(parentAgentId: string): void {
        const current = this.agentTaskCounts.get(parentAgentId) || 0;
        this.agentTaskCounts.set(parentAgentId, Math.max(0, current - 1));
    }

    /**
     * Track execution time for statistics
     */
    private trackExecutionTime(time: number): void {
        this.taskExecutionTimes.push(time);

        // Keep only last 100 times for average calculation
        if (this.taskExecutionTimes.length > 100) {
            this.taskExecutionTimes.shift();
        }

        // Update average
        const sum = this.taskExecutionTimes.reduce((a, b) => a + b, 0);
        this.stats.averageExecutionTime = Math.round(sum / this.taskExecutionTimes.length);
    }

    /**
     * Update statistics
     */
    private updateStats(key: keyof SubAgentStats, value: number): void {
        (this.stats as any)[key] = value;
    }

    /**
     * Load configuration
     */
    private loadConfiguration(): TaskToolBridgeConfig {
        return {
            maxConcurrentTasks: this.configService.get<number>('nofx.subAgents.maxTotal', 10),
            maxTasksPerAgent: this.configService.get<number>('nofx.subAgents.maxPerAgent', 3),
            defaultTimeout: this.configService.get<number>('nofx.subAgents.timeout', 300000),
            retryAttempts: this.configService.get<number>('nofx.subAgents.retryAttempts', 2),
            retryDelay: this.configService.get<number>('nofx.subAgents.retryDelay', 1000),
            aiPath: this.configService.get<string>('nofx.aiPath')
        };
    }

    /**
     * Handle configuration changes
     */
    private onConfigurationChange(e: vscode.ConfigurationChangeEvent): void {
        if (e.affectsConfiguration('nofx.subAgents') || e.affectsConfiguration('nofx.aiPath')) {
            const oldProvider = this.aiProvider.name;
            this.config = this.loadConfiguration();

            // Update AI provider if aiPath changed
            if (e.affectsConfiguration('nofx.aiPath')) {
                const aiPath = this.config.aiPath || this.configService.get('aiPath', 'claude');
                const factory = getAIProviderFactory(this.logger);
                this.aiProvider = factory.createProvider(aiPath);

                this.logger.info('AI provider updated', {
                    oldProvider,
                    newProvider: this.aiProvider.name,
                    supportsSubAgents: this.aiProvider.supportsSubAgents()
                });
            }

            this.logger.info('TaskToolBridge configuration updated', this.config);
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Cancel all active tasks
        for (const taskId of this.activeTasks.keys()) {
            this.cancelTask(taskId);
        }

        // Clear timeouts
        for (const timeout of this.taskTimeouts.values()) {
            clearTimeout(timeout);
        }

        // Clear all collections
        this.activeTasks.clear();
        this.taskQueues.clear();
        this.taskProcesses.clear();
        this.taskTimeouts.clear();
        this.agentTaskCounts.clear();

        // Remove all listeners
        this.removeAllListeners();

        this.logger.info('TaskToolBridge disposed');
    }
}
