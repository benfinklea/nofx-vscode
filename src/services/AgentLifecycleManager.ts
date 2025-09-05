import * as vscode from 'vscode';
import { IAgentLifecycleManager, ITerminalManager, IWorktreeService, IConfigurationService, INotificationService, ILoggingService, IEventBus, IErrorHandler } from './interfaces';
import { Agent, AgentConfig, AgentStatus } from '../agents/types';
import { AgentPersistence } from '../persistence/AgentPersistence';

export class AgentLifecycleManager implements IAgentLifecycleManager {
    private outputChannels = new Map<string, vscode.OutputChannel>();
    private loggingService?: ILoggingService;
    private eventBus?: IEventBus;
    private errorHandler?: IErrorHandler;

    constructor(
        private terminalManager: ITerminalManager,
        private worktreeService: IWorktreeService,
        private configService: IConfigurationService,
        private notificationService: INotificationService,
        private agentPersistence: AgentPersistence | undefined,
        private onAgentUpdate: () => void,
        loggingService?: ILoggingService,
        eventBus?: IEventBus,
        errorHandler?: IErrorHandler
    ) {
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
    }

    async initialize(): Promise<void> {
        // Clean up any orphaned worktrees on startup
        await this.worktreeService.cleanupOrphaned();
    }

    async spawnAgent(config: AgentConfig, restoredId?: string): Promise<Agent> {
        const agentId = restoredId || `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Get icon based on agent type/template
        const iconMap: { [key: string]: string } = {
            'frontend': 'symbol-color',
            'backend': 'server',
            'fullstack': 'layers',
            'mobile': 'device-mobile',
            'database': 'database',
            'devops': 'cloud',
            'testing': 'beaker',
            'ai': 'hubot',
            'general': 'person'
        };
        
        const terminalIcon = iconMap[config.type] || 'person';
        
        // Create terminal using TerminalManager
        const terminal = this.terminalManager.createTerminal(agentId, {
            ...config,
            terminalIcon
        });

        // Create output channel for agent logs
        const outputChannel = vscode.window.createOutputChannel(
            `n of x: ${config.name}`,
            'nofx-agent'
        );

        // Create agent object
        const agent: Agent = {
            id: agentId,
            name: config.name,
            type: config.type,
            status: 'idle' as AgentStatus,
            terminal: terminal,
            currentTask: null,
            startTime: new Date(),
            tasksCompleted: 0,
            template: config.template // Store template for prompts and capabilities
        };

        this.loggingService?.debug(`Created agent ${agentId} with status: ${agent.status}`);

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish('agent.lifecycle.spawning', { agentId, config });
        }

        // Store output channel
        this.outputChannels.set(agentId, outputChannel);

        // Setup worktree if enabled
        let workingDirectory: string | undefined;
        if (this.worktreeService.isAvailable()) {
            try {
                workingDirectory = await this.worktreeService.createForAgent(agent);
                if (workingDirectory) {
                    this.loggingService?.debug(`Created worktree for ${agent.name} at ${workingDirectory}`);
                }
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.errorHandler?.handleError(err, `Failed to create worktree for ${agent.name}`);
            }
        }

        // Initialize agent terminal
        try {
            await this.terminalManager.initializeAgentTerminal(agent, workingDirectory);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'Error initializing agent terminal');
        }

        // Note: Agent updates are now handled by AgentManager

        outputChannel.appendLine(`✅ Agent ${config.name} (${config.type}) initialized`);
        outputChannel.appendLine(`ID: ${agentId}`);
        outputChannel.appendLine(`Status: ${agent.status}`);
        outputChannel.appendLine(`Ready to receive tasks...`);

        this.loggingService?.info(`Agent ${config.name} ready.`);

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish('agent.lifecycle.spawned', { agentId, agent });
        }

        // Note: Persistence is now handled by AgentManager

        return agent;
    }

    async removeAgent(agentId: string): Promise<boolean> {
        this.loggingService?.debug(`Removing agent ${agentId}`);

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish('agent.lifecycle.removing', { agentId });
        }

        // Clean up worktree if it exists
        const worktreeRemoved = await this.worktreeService.removeForAgent(agentId);
        if (!worktreeRemoved) {
            return false; // User cancelled or error occurred
        }

        // Clean up terminal using TerminalManager
        this.terminalManager.disposeTerminal(agentId);

        // Clean up output channel
        const outputChannel = this.outputChannels.get(agentId);
        if (outputChannel) {
            outputChannel.dispose();
            this.outputChannels.delete(agentId);
        }

        // Note: Agent updates are now handled by AgentManager

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish('agent.lifecycle.removed', { agentId });
        }

        // Note: Persistence is now handled by AgentManager

        this.loggingService?.info(`Agent ${agentId} removed successfully`);
        this.notificationService.showInformation(`Agent removed successfully`);
        return true;
    }

    dispose(): void {
        // Dispose all output channels
        for (const outputChannel of this.outputChannels.values()) {
            outputChannel.dispose();
        }
        this.outputChannels.clear();
    }
}
