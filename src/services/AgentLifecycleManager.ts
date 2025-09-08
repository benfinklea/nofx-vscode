import * as vscode from 'vscode';
import {
    IAgentLifecycleManager,
    ITerminalManager,
    IWorktreeService,
    IConfigurationService,
    INotificationService,
    ILoggingService,
    IEventBus,
    IErrorHandler
} from './interfaces';
import { Agent, AgentConfig, AgentStatus } from '../agents/types';
import { AgentActivityStatus } from '../types/agent';
import { DOMAIN_EVENTS } from './EventConstants';
import { ActivityMonitor } from './ActivityMonitor';
import { AgentNotificationService } from './AgentNotificationService';

export class AgentLifecycleManager implements IAgentLifecycleManager {
    private outputChannels = new Map<string, vscode.OutputChannel>();
    private loggingService?: ILoggingService;
    private eventBus?: IEventBus;
    private errorHandler?: IErrorHandler;
    private activityMonitor: ActivityMonitor;
    private agentNotificationService: AgentNotificationService;
    private agents = new Map<string, Agent>();

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

        // Initialize monitoring services
        this.activityMonitor = new ActivityMonitor();
        this.agentNotificationService = new AgentNotificationService();

        // Set up monitoring event listeners
        this.setupMonitoringListeners();
    }

    private setupMonitoringListeners(): void {
        // Listen for monitoring events
        this.activityMonitor.on('monitoring-event', event => {
            this.handleMonitoringEvent(event);
        });

        this.activityMonitor.on('agent-status-changed', data => {
            this.handleAgentStatusChange(data);
        });
    }

    private handleMonitoringEvent(event: any): void {
        const agent = this.agents.get(event.agentId);
        if (!agent) return;

        // Handle different event types
        switch (event.type) {
            case 'permission':
                this.agentNotificationService.notifyUserAttention(agent, 'permission', event);
                break;
            case 'inactivity':
                if (event.data.level === 'warning') {
                    this.agentNotificationService.notifyUserAttention(agent, 'inactive', event);
                } else if (event.data.level === 'alert') {
                    this.agentNotificationService.notifyUserAttention(agent, 'stuck', event);
                }
                break;
            case 'error':
                this.agentNotificationService.notifyUserAttention(agent, 'error', event);
                break;
            case 'completion':
                if (this.configService.get('nofx.monitoring.autoComplete', true)) {
                    // Auto-mark task as complete
                    agent.currentTask = null;
                    agent.tasksCompleted++;
                    this.onAgentUpdate();
                }
                this.agentNotificationService.notifyUserAttention(agent, 'completion', event);
                break;
        }
    }

    private handleAgentStatusChange(data: any): void {
        const { agentId, newStatus } = data;
        const agent = this.agents.get(agentId);

        if (agent) {
            // Update agent's activity status (separate from operational status)
            (agent as any).activityStatus = newStatus;

            // Update tree view
            this.onAgentUpdate();

            // Update status bar
            this.agentNotificationService.updateStatusBar(this.activityMonitor.getAllAgentStatuses());

            // Publish event
            if (this.eventBus) {
                this.eventBus.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, {
                    agentId,
                    status: agent.status,
                    activityStatus: newStatus
                });
            }
        }
    }

    async initialize(): Promise<void> {
        // Clean up any orphaned worktrees on startup
        await this.worktreeService.cleanupOrphaned();
    }

    async spawnAgent(config: AgentConfig, restoredId?: string): Promise<Agent> {
        console.log('[NofX LifecycleManager Debug] spawnAgent called with config:', {
            name: config.name,
            type: config.type,
            hasTemplate: !!config.template,
            templateType: typeof config.template,
            templateKeys: config.template ? Object.keys(config.template) : [],
            templateId: config.template?.id,
            hasSystemPrompt: !!config.template?.systemPrompt,
            hasDetailedPrompt: !!config.template?.detailedPrompt
        });

        const agentId = restoredId || `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Get icon based on agent template first, then fall back to type mapping
        let terminalIcon = 'person'; // default

        if (config.template?.id) {
            // Template-specific icon mapping for better visual identification
            const templateIconMap: { [key: string]: string } = {
                'frontend-specialist': 'symbol-color',
                'backend-specialist': 'server',
                'fullstack-developer': 'layers',
                'mobile-developer': 'device-mobile',
                'database-architect': 'database',
                'devops-engineer': 'cloud',
                'testing-specialist': 'beaker',
                'security-expert': 'shield',
                'ai-ml-specialist': 'hubot',
                'nlp-specialist': 'comment-discussion',
                'algorithm-engineer': 'gear'
            };
            terminalIcon = templateIconMap[config.template.id] || 'person';
        } else {
            // Fallback to type-based mapping
            const typeIconMap: { [key: string]: string } = {
                frontend: 'symbol-color',
                backend: 'server',
                fullstack: 'layers',
                mobile: 'device-mobile',
                database: 'database',
                devops: 'cloud',
                testing: 'beaker',
                ai: 'hubot',
                general: 'person'
            };
            terminalIcon = typeIconMap[config.type] || 'person';
        }

        this.loggingService?.agents(
            `AgentLifecycleManager: Using terminal icon '${terminalIcon}' for agent ${config.name} (template: ${config.template?.id || 'none'}, type: ${config.type})`
        );

        // Create terminal using TerminalManager
        const terminal = this.terminalManager.createTerminal(agentId, {
            ...config,
            terminalIcon
        });

        // Create output channel for agent logs using LoggingService
        const outputChannel =
            this.loggingService?.getChannel(`Agent: ${config.name}`) ||
            vscode.window.createOutputChannel(`n of x: ${config.name}`);

        // Create agent object - initially offline until terminal is ready
        const agent: Agent = {
            id: agentId,
            name: config.name,
            type: config.type,
            status: 'offline' as AgentStatus, // Start as offline until terminal initializes
            terminal: terminal,
            currentTask: null,
            startTime: new Date(),
            tasksCompleted: 0,
            template: config.template // Store template for prompts and capabilities
        };

        console.log('[NofX Debug] Created agent object:', {
            id: agent.id,
            name: agent.name,
            status: agent.status,
            hasTerminal: !!agent.terminal,
            hasTemplate: !!agent.template,
            templateId: agent.template?.id,
            hasSystemPrompt: !!agent.template?.systemPrompt,
            hasDetailedPrompt: !!agent.template?.detailedPrompt,
            systemPromptLength: agent.template?.systemPrompt?.length || 0,
            detailedPromptLength: agent.template?.detailedPrompt?.length || 0
        });
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
            workingDirectory =
                (await this.errorHandler?.handleAsync(async () => {
                    const result = await this.worktreeService.createForAgent(agent);
                    if (result) {
                        this.loggingService?.debug(`Created worktree for ${agent.name} at ${result}`);
                    }
                    return result;
                }, `Failed to create worktree for ${agent.name}`)) || undefined;
        }

        // Store agent for monitoring immediately to prevent race conditions
        this.agents.set(agentId, agent);

        // Initialize agent terminal with proper error handling
        try {
            // Add a small delay to prevent terminal connection issues
            await new Promise(resolve => setTimeout(resolve, 500));

            this.loggingService?.agents(`AgentLifecycleManager: Starting terminal initialization for ${agent.name}`);
            await this.terminalManager.initializeAgentTerminal(agent, workingDirectory);

            // Terminal is now ready, update status to idle
            agent.status = 'idle' as AgentStatus;
            console.log(`[NofX Debug] Agent ${agent.name} terminal initialized, status updated to: ${agent.status}`);
            this.loggingService?.agents(
                `AgentLifecycleManager: Agent ${agent.name} terminal ready, status: ${agent.status}`
            );

            // Start activity monitoring for this agent
            this.activityMonitor.startMonitoring(agent, terminal);
            console.log(`[NofX Debug] Started monitoring for agent ${agent.name}`);
            this.loggingService?.agents(`AgentLifecycleManager: Started activity monitoring for ${agent.name}`);

            // Start sub-agent monitoring if available
            try {
                const Container = require('./Container').Container;
                const container = Container.getInstance();
                const SERVICE_TOKENS = require('./interfaces').SERVICE_TOKENS;
                const terminalMonitor = container.resolveOptional(SERVICE_TOKENS.TerminalMonitor);

                if (terminalMonitor && terminal) {
                    terminalMonitor.startMonitoring(terminal, agentId);
                    console.log(`[NofX Debug] Started sub-agent monitoring for ${agent.name}`);
                    this.loggingService?.info(`Sub-agent capabilities enabled for ${agent.name}`);
                }
            } catch (error) {
                console.log(`[NofX Debug] Sub-agent monitoring not available: ${error}`);
                this.loggingService?.debug(`Sub-agent monitoring unavailable for ${agent.name}: ${error}`);
            }

            // Notify that agent has been updated
            this.onAgentUpdate();

            // Publish status change event
            if (this.eventBus) {
                this.eventBus.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, { agentId, status: 'idle' });
            }
        } catch (error) {
            // Handle terminal initialization errors more gracefully
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.loggingService?.error(`Failed to initialize terminal for agent ${agent.name}: ${errorMsg}`);
            console.error(`[NofX Debug] Terminal initialization failed for ${agent.name}:`, error);

            // Update agent status to reflect the error
            agent.status = 'offline' as AgentStatus;

            // Still notify about the agent update so it shows in the UI
            this.onAgentUpdate();

            // Don't throw the error - let the agent exist in offline state
        }

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

        // Stop monitoring for this agent
        this.activityMonitor.stopMonitoring(agentId);
        this.agentNotificationService.clearNotification(agentId);

        // Remove from internal map
        this.agents.delete(agentId);

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

    /**
     * Start task monitoring for an agent (called when task is assigned)
     */
    startTaskMonitoring(agentId: string): void {
        this.activityMonitor.startTaskMonitoring(agentId);
    }

    /**
     * Stop task monitoring for an agent (called when task is completed/failed)
     */
    stopTaskMonitoring(agentId: string): void {
        this.activityMonitor.stopTaskMonitoring(agentId);
    }

    dispose(): void {
        // Dispose monitoring services
        this.activityMonitor.dispose();
        this.agentNotificationService.dispose();

        // Dispose all output channels (only if not managed by LoggingService)
        for (const outputChannel of this.outputChannels.values()) {
            if (!this.loggingService) {
                outputChannel.dispose();
            }
        }
        this.outputChannels.clear();

        // Clear agent map
        this.agents.clear();
    }
}
