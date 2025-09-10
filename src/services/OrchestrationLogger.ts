import * as vscode from 'vscode';
import { ILogger } from './interfaces';

/**
 * Enhanced logging service for NofX conductor and agent orchestration
 * Provides detailed activity logging for all orchestration events
 */
export class OrchestrationLogger {
    private outputChannel: vscode.OutputChannel;
    private loggingService?: ILogger;
    private logLevel: 'verbose' | 'info' | 'minimal' = 'verbose';

    // Separate channels for different aspects
    private conductorChannel: vscode.OutputChannel;
    private agentChannel: vscode.OutputChannel;
    private taskChannel: vscode.OutputChannel;
    private orchestrationChannel: vscode.OutputChannel;

    constructor(loggingService?: ILogger) {
        this.loggingService = loggingService;

        // Create dedicated output channels
        this.outputChannel = vscode.window.createOutputChannel('NofX Activity');
        this.conductorChannel = vscode.window.createOutputChannel('NofX Conductor');
        this.agentChannel = vscode.window.createOutputChannel('NofX Agents');
        this.taskChannel = vscode.window.createOutputChannel('NofX Tasks');
        this.orchestrationChannel = vscode.window.createOutputChannel('NofX Orchestration');

        // Show main channel by default
        this.outputChannel.show();

        this.log('🎸 NofX Orchestration Logger initialized');
        this.log('━'.repeat(60));
    }

    private timestamp(): string {
        return new Date().toISOString().slice(11, 23);
    }

    private log(message: string, channel?: vscode.OutputChannel): void {
        const timestampedMessage = `[${this.timestamp()}] ${message}`;
        const targetChannel = channel || this.outputChannel;
        targetChannel.appendLine(timestampedMessage);

        // Also log to main channel if using a specific channel
        if (channel && channel !== this.outputChannel) {
            this.outputChannel.appendLine(timestampedMessage);
        }
    }

    // ========== CONDUCTOR LOGGING ==========

    conductorInitialized(type: string, config?: any): void {
        this.log(`🎭 CONDUCTOR INITIALIZED: ${type}`, this.conductorChannel);
        if (config) {
            this.log(`   Config: ${JSON.stringify(config, null, 2)}`, this.conductorChannel);
        }
        this.log('   Status: Ready to orchestrate agents', this.conductorChannel);
    }

    conductorEvaluatingTask(taskDescription: string): void {
        this.log(`🔍 CONDUCTOR EVALUATING TASK:`, this.conductorChannel);
        this.log(`   "${taskDescription}"`, this.conductorChannel);
        this.log(`   Analyzing requirements...`, this.conductorChannel);
    }

    conductorCreatingTasks(count: number, tasks: any[]): void {
        this.log(`📝 CONDUCTOR CREATING ${count} TASKS:`, this.conductorChannel);
        tasks.forEach((task, i) => {
            this.log(`   ${i + 1}. [${task.priority}] ${task.title}`, this.conductorChannel);
            if (task.dependencies?.length > 0) {
                this.log(`      Dependencies: ${task.dependencies.join(', ')}`, this.conductorChannel);
            }
        });
    }

    conductorAssigningTask(taskTitle: string, agentName: string, reason?: string): void {
        this.log(`📤 CONDUCTOR ASSIGNING TASK:`, this.conductorChannel);
        this.log(`   Task: "${taskTitle}"`, this.conductorChannel);
        this.log(`   → Agent: ${agentName}`, this.conductorChannel);
        if (reason) {
            this.log(`   Reason: ${reason}`, this.conductorChannel);
        }
    }

    conductorReceivingUpdate(agentName: string, status: string, details?: string): void {
        this.log(`📥 CONDUCTOR RECEIVING UPDATE:`, this.conductorChannel);
        this.log(`   From: ${agentName}`, this.conductorChannel);
        this.log(`   Status: ${status}`, this.conductorChannel);
        if (details) {
            this.log(`   Details: ${details}`, this.conductorChannel);
        }
    }

    conductorMakingDecision(decision: string, factors: string[]): void {
        this.log(`🤔 CONDUCTOR MAKING DECISION: ${decision}`, this.conductorChannel);
        this.log(`   Factors considered:`, this.conductorChannel);
        factors.forEach(factor => {
            this.log(`   • ${factor}`, this.conductorChannel);
        });
    }

    conductorCoordinatingAgents(agents: string[], action: string): void {
        this.log(`🎯 CONDUCTOR COORDINATING AGENTS:`, this.conductorChannel);
        this.log(`   Action: ${action}`, this.conductorChannel);
        this.log(`   Agents involved: ${agents.join(', ')}`, this.conductorChannel);
    }

    // ========== AGENT LOGGING ==========

    agentSpawned(agentName: string, agentType: string, agentId: string): void {
        this.log(`🤖 AGENT SPAWNED: ${agentName}`, this.agentChannel);
        this.log(`   Type: ${agentType}`, this.agentChannel);
        this.log(`   ID: ${agentId}`, this.agentChannel);
        this.log(`   Status: Initializing...`, this.agentChannel);
    }

    agentReady(agentName: string): void {
        this.log(`✅ AGENT READY: ${agentName}`, this.agentChannel);
        this.log(`   Status: Waiting for tasks`, this.agentChannel);
    }

    agentReceivingTask(agentName: string, taskTitle: string, taskId: string): void {
        this.log(`📨 AGENT RECEIVING TASK: ${agentName}`, this.agentChannel);
        this.log(`   Task: "${taskTitle}"`, this.agentChannel);
        this.log(`   Task ID: ${taskId}`, this.agentChannel);
        this.log(`   Status: Processing...`, this.agentChannel);
    }

    agentStartingWork(agentName: string, taskTitle: string, approach?: string): void {
        this.log(`🔨 AGENT STARTING WORK: ${agentName}`, this.agentChannel);
        this.log(`   Task: "${taskTitle}"`, this.agentChannel);
        if (approach) {
            this.log(`   Approach: ${approach}`, this.agentChannel);
        }
    }

    agentProgress(agentName: string, progress: string, percentage?: number): void {
        const progressBar = percentage ? this.createProgressBar(percentage) : '';
        this.log(`⚡ AGENT PROGRESS: ${agentName}`, this.agentChannel);
        this.log(`   ${progress}`, this.agentChannel);
        if (progressBar) {
            this.log(`   Progress: ${progressBar} ${percentage}%`, this.agentChannel);
        }
    }

    agentCompleted(agentName: string, taskTitle: string, result?: string): void {
        this.log(`✨ AGENT COMPLETED TASK: ${agentName}`, this.agentChannel);
        this.log(`   Task: "${taskTitle}"`, this.agentChannel);
        if (result) {
            this.log(`   Result: ${result}`, this.agentChannel);
        }
        this.log(`   Status: Ready for next task`, this.agentChannel);
    }

    agentError(agentName: string, error: string, taskTitle?: string): void {
        this.log(`❌ AGENT ERROR: ${agentName}`, this.agentChannel);
        if (taskTitle) {
            this.log(`   Task: "${taskTitle}"`, this.agentChannel);
        }
        this.log(`   Error: ${error}`, this.agentChannel);
    }

    agentStatusChange(agentName: string, oldStatus: string, newStatus: string): void {
        this.log(`🔄 AGENT STATUS CHANGE: ${agentName}`, this.agentChannel);
        this.log(`   ${oldStatus} → ${newStatus}`, this.agentChannel);
    }

    // ========== TASK LOGGING ==========

    taskCreated(taskId: string, title: string, priority: string): void {
        this.log(`📋 TASK CREATED: ${title}`, this.taskChannel);
        this.log(`   ID: ${taskId}`, this.taskChannel);
        this.log(`   Priority: ${priority}`, this.taskChannel);
    }

    taskQueued(taskTitle: string, position: number, totalInQueue: number): void {
        this.log(`📚 TASK QUEUED: ${taskTitle}`, this.taskChannel);
        this.log(`   Position: ${position}/${totalInQueue}`, this.taskChannel);
    }

    taskAssigned(taskTitle: string, agentName: string): void {
        this.log(`🎯 TASK ASSIGNED: ${taskTitle}`, this.taskChannel);
        this.log(`   → Assigned to: ${agentName}`, this.taskChannel);
    }

    taskStarted(taskTitle: string, agentName: string): void {
        this.log(`▶️ TASK STARTED: ${taskTitle}`, this.taskChannel);
        this.log(`   Being executed by: ${agentName}`, this.taskChannel);
    }

    taskProgress(taskTitle: string, status: string, details?: string): void {
        this.log(`📊 TASK PROGRESS: ${taskTitle}`, this.taskChannel);
        this.log(`   Status: ${status}`, this.taskChannel);
        if (details) {
            this.log(`   ${details}`, this.taskChannel);
        }
    }

    taskCompleted(taskTitle: string, duration?: number): void {
        this.log(`✅ TASK COMPLETED: ${taskTitle}`, this.taskChannel);
        if (duration) {
            this.log(`   Duration: ${this.formatDuration(duration)}`, this.taskChannel);
        }
    }

    taskFailed(taskTitle: string, reason: string): void {
        this.log(`❌ TASK FAILED: ${taskTitle}`, this.taskChannel);
        this.log(`   Reason: ${reason}`, this.taskChannel);
    }

    // ========== ORCHESTRATION LOGGING ==========

    orchestrationEvent(event: string, source: string, target?: string, data?: any): void {
        this.log(`🔗 ORCHESTRATION EVENT: ${event}`, this.orchestrationChannel);
        this.log(`   Source: ${source}`, this.orchestrationChannel);
        if (target) {
            this.log(`   Target: ${target}`, this.orchestrationChannel);
        }
        if (data) {
            this.log(`   Data: ${JSON.stringify(data, null, 2)}`, this.orchestrationChannel);
        }
    }

    messageRouted(messageType: string, from: string, to: string): void {
        this.log(`📬 MESSAGE ROUTED: ${messageType}`, this.orchestrationChannel);
        this.log(`   ${from} → ${to}`, this.orchestrationChannel);
    }

    workflowStarted(workflowName: string, steps: number): void {
        this.log(`🚀 WORKFLOW STARTED: ${workflowName}`, this.orchestrationChannel);
        this.log(`   Total steps: ${steps}`, this.orchestrationChannel);
    }

    workflowStep(stepName: string, stepNumber: number, totalSteps: number): void {
        this.log(`📍 WORKFLOW STEP ${stepNumber}/${totalSteps}: ${stepName}`, this.orchestrationChannel);
    }

    workflowCompleted(workflowName: string, duration?: number): void {
        this.log(`🎉 WORKFLOW COMPLETED: ${workflowName}`, this.orchestrationChannel);
        if (duration) {
            this.log(`   Total duration: ${this.formatDuration(duration)}`, this.orchestrationChannel);
        }
    }

    // ========== SUMMARY LOGGING ==========

    summary(title: string, stats: { [key: string]: any }): void {
        this.log(`━${'━'.repeat(59)}`);
        this.log(`📊 ${title.toUpperCase()}`);
        this.log(`━${'━'.repeat(59)}`);

        Object.entries(stats).forEach(([key, value]) => {
            this.log(`   ${key}: ${value}`);
        });

        this.log(`━${'━'.repeat(59)}`);
    }

    // ========== UTILITY METHODS ==========

    private createProgressBar(percentage: number): string {
        const filled = Math.floor(percentage / 5);
        const empty = 20 - filled;
        return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
    }

    private formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    setLogLevel(level: 'verbose' | 'info' | 'minimal'): void {
        this.logLevel = level;
        this.log(`Log level set to: ${level}`);
    }

    showChannel(channelName?: 'main' | 'conductor' | 'agents' | 'tasks' | 'orchestration'): void {
        switch (channelName) {
            case 'conductor':
                this.conductorChannel.show();
                break;
            case 'agents':
                this.agentChannel.show();
                break;
            case 'tasks':
                this.taskChannel.show();
                break;
            case 'orchestration':
                this.orchestrationChannel.show();
                break;
            default:
                this.outputChannel.show();
        }
    }

    clear(): void {
        this.outputChannel.clear();
        this.conductorChannel.clear();
        this.agentChannel.clear();
        this.taskChannel.clear();
        this.orchestrationChannel.clear();
    }

    dispose(): void {
        this.outputChannel.dispose();
        this.conductorChannel.dispose();
        this.agentChannel.dispose();
        this.taskChannel.dispose();
        this.orchestrationChannel.dispose();
    }
}
