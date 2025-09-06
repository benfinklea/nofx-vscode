import * as vscode from 'vscode';
import { Agent, AgentConfig, AgentStatus } from './types';
import { AgentPersistence } from '../persistence/AgentPersistence';
import { IAgentLifecycleManager, ITerminalManager, IWorktreeService, IConfigurationService, INotificationService, ILoggingService, IEventBus, IErrorHandler, IAgentReader, IMetricsService } from '../services/interfaces';
import { DOMAIN_EVENTS } from '../services/EventConstants';

export class AgentManager implements IAgentReader {
    private agents: Map<string, Agent> = new Map();
    private context: vscode.ExtensionContext;
    private persistence: AgentPersistence | undefined;
    private _onAgentUpdate = new vscode.EventEmitter<void>();
    public readonly onAgentUpdate = this._onAgentUpdate.event;
    private disposables: vscode.Disposable[] = [];
    private isDisposing: boolean = false;

    private agentLifecycleManager?: IAgentLifecycleManager;
    private terminalManager?: ITerminalManager;
    private worktreeService?: IWorktreeService;
    private configService?: IConfigurationService;
    private notificationService?: INotificationService;
    private loggingService?: ILoggingService;
    private eventBus?: IEventBus;
    private errorHandler?: IErrorHandler;
    private metricsService?: IMetricsService;

    constructor(context: vscode.ExtensionContext, persistence?: AgentPersistence) {
        this.context = context;
        this.persistence = persistence;

        // Terminal close event listener will be set up after dependencies are injected
    }

    setDependencies(
        agentLifecycleManager: IAgentLifecycleManager,
        terminalManager: ITerminalManager,
        worktreeService: IWorktreeService,
        configService: IConfigurationService,
        notificationService: INotificationService,
        loggingService?: ILoggingService,
        eventBus?: IEventBus,
        errorHandler?: IErrorHandler,
        metricsService?: IMetricsService
    ) {
        this.agentLifecycleManager = agentLifecycleManager;
        this.terminalManager = terminalManager;
        this.worktreeService = worktreeService;
        this.configService = configService;
        this.notificationService = notificationService;
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.metricsService = metricsService;

        // Set up terminal close event listener
        const terminalCloseDisposable = this.terminalManager.onTerminalClosed((terminal) => {
            // Bail out if we're already disposing to prevent double-dispose
            if (this.isDisposing) {
                return;
            }

            const agent = this.findAgentByTerminal(terminal);
            if (agent) {
                // If agent was working, mark as idle and task as interrupted
                if (agent.status === 'working' && agent.currentTask) {
                    agent.status = 'idle';
                    const task = agent.currentTask;
                    agent.currentTask = null;
                    this._onAgentUpdate.fire();

                    // Publish event to EventBus
                    if (this.eventBus) {
                        this.eventBus.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, { agentId: agent.id, status: 'idle' });
                        this.eventBus.publish(DOMAIN_EVENTS.AGENT_TASK_INTERRUPTED, { agentId: agent.id, task });
                    }

                    this.notificationService?.showWarning(
                        `⚠️ Agent ${agent.name} stopped. Task "${task.title}" interrupted.`
                    );
                }
                this.removeAgent(agent.id);
            }
        });
        this.disposables.push(terminalCloseDisposable);
    }

    async initialize(showSetupDialog: boolean = false) {
        if (!this.agentLifecycleManager || !this.configService) {
            throw new Error('AgentManager dependencies not set. Call setDependencies() first.');
        }

        // Log persistence status
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.loggingService?.debug(`Workspace folder: ${workspaceFolder?.uri.fsPath || 'None'}`);

        if (this.persistence) {
            this.loggingService?.debug('Persistence initialized');
        } else {
            this.loggingService?.warn('No persistence available - agent state will not be saved');
        }

        // Initialize the agent lifecycle manager
        await this.agentLifecycleManager.initialize();

        // Check if Claude Code is available
        const claudePath = this.configService.getClaudePath();

        this.loggingService?.info(`AgentManager initialized. Claude path: ${claudePath}`);

        // Try to restore agents from persistence
        await this.restoreAgentsFromPersistence();

        // Only show setup dialog if explicitly requested (e.g., when starting conductor)
        if (showSetupDialog) {
            const selection = await this.notificationService?.showInformation(
                '🎸 NofX Conductor ready. Using Claude command: ' + claudePath,
                'Test Claude',
                'Change Path',
                'Restore Session'
            );

            if (selection === 'Test Claude') {
                const terminal = this.terminalManager?.createEphemeralTerminal('Claude Test');
                if (terminal) {
                    terminal.show();
                    terminal.sendText(`${claudePath} --version || echo "Claude not found. Please check installation."`);
                }
            } else if (selection === 'Change Path') {
                const newPath = await this.notificationService?.showInputBox({
                    prompt: 'Enter Claude command or path',
                    value: claudePath,
                    placeHolder: 'e.g., claude, /usr/local/bin/claude'
                });
                if (newPath) {
                    await this.configService?.update('claudePath', newPath, vscode.ConfigurationTarget.Global);
                    this.notificationService?.showInformation(`Claude path updated to: ${newPath}`);
                }
            } else if (selection === 'Restore Session') {
                await this.restoreAgentsFromPersistence(true);
            }
        }
    }

    public async restoreAgents(): Promise<number> {
        return this.restoreAgentsFromPersistence(true);
    }

    private async restoreAgentsFromPersistence(userRequested: boolean = false): Promise<number> {
        this.loggingService?.debug('Checking for saved agents to restore...');

        if (!this.persistence) {
            this.loggingService?.warn('No persistence available (no workspace open)');
            if (userRequested) {
                this.notificationService?.showWarning('No workspace open. Cannot restore agents.');
            }
            return 0;
        }

        const savedAgents = await this.persistence.loadAgentState();
        this.loggingService?.info(`Found ${savedAgents.length} saved agent(s)`);

        if (savedAgents.length === 0) {
            if (userRequested) {
                this.notificationService?.showInformation('No saved agents found.');
            }
            return 0;
        }

        // Ask user if they want to restore
        const restore = userRequested ? 'Yes, Restore' : await this.notificationService?.showInformation(
            `Found ${savedAgents.length} saved agent(s). Restore them?`,
            'Yes, Restore',
            'No, Start Fresh'
        );

        if (restore === 'Yes, Restore' || userRequested) {
            let restoredCount = 0;
            for (const savedAgent of savedAgents) {
                try {
                    // Recreate agent with saved data
                    const config: AgentConfig = {
                        name: savedAgent.name,
                        type: savedAgent.type,
                        template: savedAgent.template
                    };

                    const agent = await this.spawnAgent(config, savedAgent.id);

                    // Restore state
                    agent.status = savedAgent.status === 'working' ? 'idle' : savedAgent.status; // Reset working to idle
                    agent.tasksCompleted = savedAgent.tasksCompleted || 0;

                    // Restore session context if available
                    const sessionContext = await this.persistence.getAgentContextSummary(savedAgent.id);
                    if (sessionContext) {
                        const terminal = this.terminalManager?.getTerminal(agent.id);
                        if (terminal) {
                            terminal.sendText('# Restored from previous session');
                            terminal.sendText(`# ${sessionContext.split('\n').slice(0, 5).join('\n# ')}`);
                        }
                    }

                    restoredCount++;
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.errorHandler?.handleError(err, `Failed to restore agent ${savedAgent.name}`);
                }
            }

            if (restoredCount > 0) {
                this.notificationService?.showInformation(
                    `✅ Restored ${restoredCount} agent(s) from previous session`
                );
            }

            return restoredCount;
        }

        return 0;
    }

    async spawnAgent(config: AgentConfig, restoredId?: string): Promise<Agent> {
        if (!this.agentLifecycleManager) {
            throw new Error('AgentLifecycleManager not available');
        }

        // Delegate to AgentLifecycleManager
        const agent = await this.agentLifecycleManager.spawnAgent(config, restoredId);

        // Store agent in our map
        this.agents.set(agent.id, agent);

        // Record metrics
        this.metricsService?.incrementCounter('agents_created', {
            agentType: agent.type,
            totalAgents: this.agents.size.toString()
        });

        // Notify listeners
        this._onAgentUpdate.fire();

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish(DOMAIN_EVENTS.AGENT_CREATED, { agentId: agent.id, name: agent.name, type: agent.type });
        }

        // Save agent state after adding
        await this.saveAgentState();

        this.loggingService?.info(`Agent ${config.name} ready. Total agents: ${this.agents.size}`);
        this.loggingService?.debug('Agent statuses:', Array.from(this.agents.values()).map(a => `${a.name}: ${a.status}`));

        return agent;
    }


    async executeTask(agentId: string, task: any) {
        this.loggingService?.debug(`Called for agent ${agentId} with task:`, task.title);

        const agent = this.agents.get(agentId);
        if (!agent) {
            const error = new Error(`Agent ${agentId} not found`);
            this.errorHandler?.handleError(error, 'executeTask');
            throw error;
        }
        this.loggingService?.debug(`Found agent: ${agent.name}, status: ${agent.status}`);

        if (!this.terminalManager) {
            const error = new Error('TerminalManager not available');
            this.errorHandler?.handleError(error, 'executeTask');
            throw error;
        }

        const terminal = this.terminalManager.getTerminal(agentId);

        if (!terminal) {
            const error = new Error(`Agent ${agentId} terminal not found`);
            this.errorHandler?.handleError(error, 'executeTask');
            throw error;
        }

        this.loggingService?.debug(`Updating agent status from ${agent.status} to working`);

        // Start timer for task assignment
        const assignmentTimer = this.metricsService?.startTimer('task_assignment_time');

        // Update agent status
        agent.status = 'working';
        agent.currentTask = task;
        this._onAgentUpdate.fire();

        // Record task assignment metrics
        this.metricsService?.incrementCounter('task_assigned', {
            agentType: agent.type,
            taskPriority: task.priority?.toString() || 'unknown'
        });

        // End assignment timer
        if (assignmentTimer) {
            this.metricsService?.endTimer(assignmentTimer);
        }

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, { agentId: agent.id, status: 'working' });
            this.eventBus.publish(DOMAIN_EVENTS.AGENT_TASK_ASSIGNED, { agentId: agent.id, task });
        }

        // Save state after update
        this.saveAgentState();

        // Log task start
        this.loggingService?.info(`Starting task: ${task.title}`);
        this.loggingService?.debug(`Description: ${task.description}`);
        this.loggingService?.debug(`Priority: ${task.priority}`);
        this.loggingService?.debug(`Task ID: ${task.id}`);

        // Prepare task for Claude Code (using detailed prompt method if needed)
        // const detailedPrompt = this.createDetailedTaskPrompt(agent, task);

        // Execute with Claude Code in the terminal
        terminal.show();

        // Build a simple, clean prompt
        const taskPrompt = `${task.title}: ${task.description}`;

        this.loggingService?.debug('Sending task to agent');

        // Show task assignment
        terminal.sendText(''); // Empty line for clarity
        terminal.sendText('echo "=== New Task Assignment ==="');
        terminal.sendText(`echo "Task: ${task.title}"`);
        terminal.sendText('echo "==========================="');
        terminal.sendText('');

        // Since Claude is already running in the agent's terminal with system prompt,
        // we can just send the task directly
        terminal.sendText(`Please complete this task: ${taskPrompt}`);
        this.loggingService?.debug('Sent task directly to already-running Claude instance');

        // Show notification
        if (this.notificationService) {
            this.notificationService.showInformation(
                `🤖 Task sent to ${agent.name}'s Claude instance. Check terminal for progress.`,
                'View Terminal'
            ).then(selection => {
                if (selection === 'View Terminal') {
                    terminal.show();
                }
            });

            // Show notification
            this.notificationService.showInformation(
                `🤖 ${agent.name} is working on: ${task.title}`
            );
        }

        // Log execution
        this.loggingService?.info('Starting Claude Code session...');
        this.loggingService?.info(`Task: ${task.title}`);

        // Don't monitor - let the conductor or user decide when tasks are done
        // this.monitorTaskExecution(agentId, task);
    }

    private createDetailedTaskPrompt(agent: Agent, task: any): string {
        let prompt = `You are ${agent.name}, a ${agent.type} specialist.\n\n`;
        prompt += `Task: ${task.title}\n`;
        prompt += `Description: ${task.description}\n\n`;

        if (task.files && task.files.length > 0) {
            prompt += 'Relevant files:\n';
            task.files.forEach((file: string) => {
                prompt += `- ${file}\n`;
            });
            prompt += '\n';
        }

        prompt += `Please complete this task following best practices for ${agent.type} development.\n`;
        prompt += 'Make all necessary changes to implement the requested functionality.';

        return prompt;
    }

    private createFullPrompt(agent: Agent, task: any): string {
        let prompt = '';

        // Add system prompt if available
        if (agent.template && agent.template.systemPrompt) {
            prompt += agent.template.systemPrompt + '\n\n';
        } else {
            prompt += `You are ${agent.name}, a ${agent.type} specialist.\n\n`;
        }

        // Add task details
        prompt += '=== TASK ===\n';
        prompt += `Title: ${task.title}\n`;
        prompt += `Description: ${task.description}\n`;
        prompt += `Priority: ${task.priority}\n\n`;

        // Add file context if available
        if (task.files && task.files.length > 0) {
            prompt += '=== RELEVANT FILES ===\n';
            task.files.forEach((file: string) => {
                prompt += `- ${file}\n`;
            });
            prompt += '\n';
        }

        // Add instructions
        prompt += '=== INSTRUCTIONS ===\n';
        prompt += 'Please complete this task following best practices.\n';
        prompt += 'Make all necessary changes to implement the requested functionality.\n';
        prompt += 'When you\'re done, please summarize what you accomplished.';

        return prompt;
    }

    private buildClaudeCommand(prompt: string, task: any): string {
        // Start an interactive Claude session with initial context
        // This allows the user to continue giving commands to Claude
        const taskDescription = `${task.title}: ${task.description}`;

        // Start Claude in interactive mode
        // The initial prompt sets context, then Claude stays open for more commands
        return 'claude'; // Just start Claude - user can type commands
    }

    public async completeTask(agentId: string, task: any) {
        const agent = this.agents.get(agentId);

        if (!agent) return;

        // Update agent status
        agent.status = 'idle';
        agent.currentTask = null;
        agent.tasksCompleted++;
        this._onAgentUpdate.fire();

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, { agentId: agent.id, status: 'idle' });
            this.eventBus.publish(DOMAIN_EVENTS.AGENT_TASK_COMPLETED, { agentId: agent.id, task });
        }

        // Save state after update
        await this.saveAgentState();

        this.loggingService?.info(`Task completed: ${task.title}`);
        this.loggingService?.info(`Total tasks completed: ${agent.tasksCompleted}`);

        // Show completion message
        if (this.notificationService) {
            this.notificationService.showInformation(
                `✅ ${agent.name} completed: ${task.title}`
            );
        }
    }

    async removeAgent(agentId: string) {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        if (!this.agentLifecycleManager) {
            const error = new Error('AgentLifecycleManager not available');
            this.errorHandler?.handleError(error, 'removeAgent');
            throw error;
        }

        // Delegate to AgentLifecycleManager
        const success = await this.agentLifecycleManager.removeAgent(agentId);

        if (success) {
            // Record metrics
            this.metricsService?.incrementCounter('agents_removed', {
                agentType: agent.type,
                totalAgents: (this.agents.size - 1).toString()
            });

            // Remove from our map
            this.agents.delete(agentId);
            this._onAgentUpdate.fire();

            // Publish event to EventBus
            if (this.eventBus) {
                this.eventBus.publish(DOMAIN_EVENTS.AGENT_REMOVED, { agentId, name: agent.name });
            }

            // Save agent state after removing
            await this.saveAgentState();

            this.loggingService?.info(`Agent ${agent.name} removed`);
        }
    }

    getActiveAgents(): Agent[] {
        return Array.from(this.agents.values());
    }

    getAgent(agentId: string): Agent | undefined {
        return this.agents.get(agentId);
    }

    getIdleAgents(): Agent[] {
        const allAgents = Array.from(this.agents.values());
        const idleAgents = allAgents.filter(agent => agent.status === 'idle');

        this.loggingService?.debug(`Total agents: ${allAgents.length}, Idle: ${idleAgents.length}`);
        if (allAgents.length > 0) {
            this.loggingService?.debug('Agent statuses:', allAgents.map(a => `${a.name}(${a.id}): ${a.status}`));
        }

        return idleAgents;
    }

    getAgentTerminal(agentId: string): vscode.Terminal | undefined {
        if (!this.terminalManager) {
            return undefined;
        }
        return this.terminalManager.getTerminal(agentId);
    }

    getAgentStats(): { total: number; idle: number; working: number; error: number; offline: number } {
        const allAgents = Array.from(this.agents.values());
        return {
            total: allAgents.length,
            idle: allAgents.filter(a => a.status === 'idle').length,
            working: allAgents.filter(a => a.status === 'working').length,
            error: allAgents.filter(a => a.status === 'error').length,
            offline: allAgents.filter(a => a.status === 'offline').length
        };
    }

    private findAgentByTerminal(terminal: vscode.Terminal): Agent | undefined {
        for (const [agentId, agent] of this.agents.entries()) {
            if (agent.terminal === terminal) {
                return agent;
            }
        }
        return undefined;
    }

    private monitorTaskExecution(agentId: string, task: any) {
        let lastActivityTime = Date.now();
        const IDLE_THRESHOLD = 30000; // 30 seconds of inactivity

        const checkInterval = setInterval(() => {
            const terminal = this.terminalManager?.getTerminal(agentId);
            const agent = this.agents.get(agentId);

            if (!terminal || !agent || agent.status !== 'working') {
                clearInterval(checkInterval);
                return;
            }

            // Check if terminal exists and is still active
            // VS Code doesn't expose terminal output directly, but we can check state
            const currentTime = Date.now();

            // If terminal was closed, it will be handled by onDidCloseTerminal
            // Here we check for idle state (Claude might have finished)
            if (vscode.window.activeTerminal !== terminal) {
                // Terminal is not active, check if it's been idle too long
                if (currentTime - lastActivityTime > IDLE_THRESHOLD) {
                    // Prompt user to confirm if task is complete
                    this.notificationService?.showInformation(
                        `Is ${agent.name} done with "${task.title}"?`,
                        'Yes, Complete', 'Still Working'
                    ).then(selection => {
                        if (selection === 'Yes, Complete') {
                            this.completeTask(agentId, task);
                            clearInterval(checkInterval);
                        } else {
                            lastActivityTime = Date.now(); // Reset timer
                        }
                    });
                }
            } else {
                // Terminal is active, reset activity time
                lastActivityTime = Date.now();
            }
        }, 15000); // Check every 15 seconds

        // Store interval for cleanup
        const agentData = this.agents.get(agentId);
        if (agentData) {
            (agentData as any).monitorInterval = checkInterval;
        }
    }

    public updateAgent(agent: Agent): void {
        this.agents.set(agent.id, agent);
        this._onAgentUpdate.fire();
        this.saveAgentState();
    }

    public renameAgent(id: string, newName: string): void {
        const agent = this.agents.get(id);
        if (agent) {
            agent.name = newName;
            this.updateAgent(agent);
        }
    }

    public updateAgentType(id: string, newType: string): void {
        const agent = this.agents.get(id);
        if (agent) {
            agent.type = newType;
            this.updateAgent(agent);
        }
    }

    public setUseWorktrees(value: boolean): void {
        // Delegate to ConfigurationService
        this.configService?.update('useWorktrees', value, vscode.ConfigurationTarget.Workspace);
    }

    public notifyAgentUpdated(): void {
        this._onAgentUpdate.fire();
    }

    private async saveAgentState() {
        if (!this.persistence) return;

        try {
            const agents = Array.from(this.agents.values());
            await this.persistence.saveAgentState(agents);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'saveAgentState');
        }
    }

    private async saveAgentSession(agentId: string, content: string) {
        if (!this.persistence) return;

        try {
            await this.persistence.saveAgentSession(agentId, content);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'saveAgentSession');
        }
    }

    async dispose(): Promise<void> {
        // Set disposing flag to prevent double-dispose
        this.isDisposing = true;

        // Save final state before disposal
        await this.saveAgentState();

        // Clean up all agents - await removal operations
        await Promise.allSettled([...this.agents.keys()].map(id => this.removeAgent(id)));

        // Dispose services
        this.agentLifecycleManager?.dispose();
        this.terminalManager?.dispose();
        this.worktreeService?.dispose();

        // Dispose all subscriptions
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        this._onAgentUpdate.dispose();
    }
}
