import * as vscode from 'vscode';
import { IAgentLifecycleManager, ITerminalManager, IWorktreeService, IConfigurationService, INotificationService, ILoggingService, IEventBus, IErrorHandler } from './interfaces';
import { Agent, AgentConfig, AgentStatus } from '../agents/types';
import { DOMAIN_EVENTS } from './EventConstants';

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

        // Create output channel for agent logs using LoggingService
        const outputChannel = this.loggingService?.getChannel(`Agent: ${config.name}`) ||
            vscode.window.createOutputChannel(`n of x: ${config.name}`);

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
            this.eventBus.publish(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNING, { agentId, config });
        }

        // Store output channel
        this.outputChannels.set(agentId, outputChannel);

        // Setup worktree if enabled
        let workingDirectory: string | undefined;
        if (this.worktreeService.isAvailable()) {
            workingDirectory = await this.errorHandler?.handleAsync(async () => {
                const result = await this.worktreeService.createForAgent(agent);
                if (result) {
                    this.loggingService?.debug(`Created worktree for ${agent.name} at ${result}`);
                }
                return result;
            }, `Failed to create worktree for ${agent.name}`) || undefined;
        }

        // Initialize agent terminal
        await this.errorHandler?.handleAsync(async () => {
            await this.terminalManager.initializeAgentTerminal(agent, workingDirectory);
        }, 'Error initializing agent terminal');

        outputChannel.appendLine(`✅ Agent ${config.name} (${config.type}) initialized`);
        outputChannel.appendLine(`ID: ${agentId}`);
        outputChannel.appendLine(`Status: ${agent.status}`);
        outputChannel.appendLine('Ready to receive tasks...');

        this.loggingService?.info(`Agent ${config.name} ready.`);

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, { agentId, agent });
        }

        // Note: Persistence is now handled by AgentManager

        return agent;
    }

    async removeAgent(agentId: string): Promise<boolean> {
        this.loggingService?.debug(`Removing agent ${agentId}`);

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish(DOMAIN_EVENTS.AGENT_LIFECYCLE_REMOVING, { agentId });
        }

        // Clean up worktree if it exists
        const worktreeRemoved = await this.worktreeService.removeForAgent(agentId);
        if (!worktreeRemoved) {
            return false; // User cancelled or error occurred
        }

        // Clean up terminal using TerminalManager
        this.terminalManager.disposeTerminal(agentId);

        // Clean up output channel (only if not managed by LoggingService)
        const outputChannel = this.outputChannels.get(agentId);
        if (outputChannel) {
            // Only dispose if it's not managed by LoggingService
            if (!this.loggingService) {
                outputChannel.dispose();
            }
            this.outputChannels.delete(agentId);
        }

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish(DOMAIN_EVENTS.AGENT_LIFECYCLE_REMOVED, { agentId });
        }

        // Note: Persistence is now handled by AgentManager

        this.loggingService?.info(`Agent ${agentId} removed successfully`);
        this.notificationService.showInformation('Agent removed successfully');
        return true;
    }

    dispose(): void {
        // Dispose all output channels (only if not managed by LoggingService)
        for (const outputChannel of this.outputChannels.values()) {
            if (!this.loggingService) {
                outputChannel.dispose();
            }
        }
        this.outputChannels.clear();
    }
}
