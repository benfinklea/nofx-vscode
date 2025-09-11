import * as vscode from 'vscode';
import { IAgentLifecycle, IAgentQuery } from '../interfaces/IAgent';
import { Agent, AgentConfig, AgentStatus, SmartAgentSpawnConfig, SmartTeamSpawnConfig } from './types';
import { PersistenceService } from '../services/PersistenceService';
import {
    IAgentLifecycleManager,
    ITerminalManager,
    IWorktreeService,
    IConfiguration,
    INotificationService,
    ILogger,
    IEventEmitter,
    IEventSubscriber,
    IErrorHandler,
    IAgentReader,
    IPersistenceService
} from '../services/interfaces';
import { EVENTS } from '../services/EventConstants';
import { AgentCapacityScore, LoadBalancingEvent } from '../intelligence';
import { CircuitBreaker, CircuitState } from '../services/reliability/CircuitBreaker';
import { RetryMechanism, RetryStrategy } from '../services/reliability/RetryMechanism';
import { RateLimiter } from '../services/reliability/RateLimiter';
import { DeadLetterQueue, DLQMessage } from '../services/reliability/DeadLetterQueue';
import { HealthCheckService, HealthStatus, CheckType } from '../services/reliability/HealthCheckService';
import { getAppStateStore } from '../state/AppStateStore';
import * as selectors from '../state/selectors';
import * as actions from '../state/actions'; // AgentHealthMonitor consolidated into MonitoringService

export class AgentManager implements IAgentLifecycle, IAgentQuery, IAgentReader {
    private agents: Map<string, Agent> = new Map();
    private context: vscode.ExtensionContext;
    private persistence: PersistenceService | undefined;
    private _onAgentUpdate = new vscode.EventEmitter<void>();
    public readonly onAgentUpdate = this._onAgentUpdate.event;
    private disposables: vscode.Disposable[] = [];
    private isDisposing: boolean = false;

    private agentLifecycleManager?: IAgentLifecycleManager;
    private terminalManager?: ITerminalManager;
    private worktreeService?: IWorktreeService;
    private configService?: IConfiguration;
    private notificationService?: INotificationService;
    private loggingService?: ILogger;
    private eventBus?: IEventEmitter & IEventSubscriber;
    private errorHandler?: IErrorHandler;
    private sessionPersistenceService?: IPersistenceService;
    private orchestrationLogger?: any; // OrchestrationLogger

    // Enterprise reliability components
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();
    private retryMechanism!: RetryMechanism;
    private rateLimiter!: RateLimiter;
    private deadLetterQueue!: DeadLetterQueue;
    private healthCheckService!: HealthCheckService;
    private enterpriseReliabilityEnabled = true;

    // Health monitoring integration - using MonitoringService

    // Load balancing integration
    private agentCapacityScores: Map<string, AgentCapacityScore> = new Map();
    private agentLoadTracking: Map<string, { currentLoad: number; maxCapacity: number; lastUpdate: Date }> = new Map();

    // Helper method to safely publish events
    private publishEvent(event: string, data?: any): void {
        if (this.eventBus && 'publish' in this.eventBus) {
            (this.eventBus as any).publish(event, data);
        } else if (this.eventBus && 'emit' in this.eventBus) {
            this.eventBus.emit(event, data);
        }
    }

    // IAgentLifecycle implementation adapters
    async spawn(config: any): Promise<any> {
        // Adapt to existing spawnAgent method
        return this.spawnAgent(config);
    }

    async terminate(agentId: string): Promise<void> {
        // Adapt to existing removeAgent method
        await this.removeAgent(agentId);
    }

    constructor(context: vscode.ExtensionContext, persistence?: PersistenceService) {
        this.context = context;
        this.persistence = persistence;

        // Initialize enterprise reliability components
        this.initializeEnterpriseComponents();

        // Terminal close event listener will be set up after dependencies are injected
    }

    setDependencies(
        agentLifecycleManager: IAgentLifecycleManager,
        terminalManager: ITerminalManager,
        worktreeService: IWorktreeService,
        configService: IConfiguration,
        notificationService: INotificationService,
        loggingService?: ILogger,
        eventBus?: IEventEmitter & IEventSubscriber,
        errorHandler?: IErrorHandler,
        sessionPersistenceService?: IPersistenceService
    ) {
        this.agentLifecycleManager = agentLifecycleManager;
        this.terminalManager = terminalManager;
        this.worktreeService = worktreeService;
        this.configService = configService;
        this.notificationService = notificationService;
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.sessionPersistenceService = sessionPersistenceService;

        // Get OrchestrationLogger if available
        try {
            const ServiceLocator = require('../services/ServiceLocator').ServiceLocator;
            this.orchestrationLogger = ServiceLocator.tryGet('OrchestrationLogger');
        } catch (error) {
            // OrchestrationLogger not available yet
        }

        // Health monitoring is now handled by MonitoringService

        // Set up terminal close event listener
        const terminalCloseDisposable = this.terminalManager.onTerminalClosed(terminal => {
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

                    // Stop task monitoring for interrupted task
                    if (this.agentLifecycleManager) {
                        this.agentLifecycleManager.stopTaskMonitoring(agent.id);
                    }

                    this._onAgentUpdate.fire();

                    // Publish event to EventBus
                    this.publishEvent(EVENTS.AGENT_STATUS_CHANGED, {
                        agentId: agent.id,
                        status: 'idle'
                    });
                    this.publishEvent(EVENTS.AGENT_TASK_INTERRUPTED, { agentId: agent.id, task });

                    this.notificationService?.showWarning(
                        `⚠️ Agent ${agent.name} stopped. Task "${task.title}" interrupted.`
                    );
                }
                this.removeAgent(agent.id);
            }
        });
        this.disposables.push(terminalCloseDisposable);

        // Start enterprise reliability services
        this.startEnterpriseServices();
    }

    /**
     * Initialize enterprise reliability components
     */
    private initializeEnterpriseComponents(): void {
        try {
            // Initialize retry mechanism with agent-optimized settings
            this.retryMechanism = new RetryMechanism({
                maxAttempts: 3,
                baseDelay: 2000,
                maxDelay: 30000,
                strategy: RetryStrategy.EXPONENTIAL,
                jitterFactor: 0.3,
                timeoutPerAttempt: 60000, // 1 minute per agent operation
                totalTimeout: 300000, // 5 minutes total
                retryableErrors: error => {
                    // Retry on agent communication errors
                    if (
                        error.code === 'ECONNREFUSED' ||
                        error.code === 'ETIMEDOUT' ||
                        error.message?.includes('terminal') ||
                        error.message?.includes('agent')
                    ) {
                        return true;
                    }
                    return false;
                },
                onRetry: (attempt, error, delay) => {
                    this.loggingService?.warn(
                        `[AgentManager] Retrying agent operation (attempt ${attempt}): ${error.message}`
                    );
                }
            });

            // Initialize rate limiter for agent operations
            this.rateLimiter = RateLimiter.forAPI({
                maxRequests: 50,
                windowMs: 60000, // 50 agent operations per minute
                blockDurationMs: 120000, // 2 minute block
                keyGenerator: context => context?.operation || 'agent-operation'
            });

            // Initialize dead letter queue for failed agent operations
            this.deadLetterQueue = new DeadLetterQueue('agent-manager', {
                maxRetries: 5,
                retryDelayMs: 10000,
                retryBackoffMultiplier: 1.5,
                maxQueueSize: 100,
                persistToDisk: true,
                onMessageExpired: message => {
                    this.loggingService?.error(`[AgentManager] Agent operation permanently failed: ${message.error}`);
                },
                onMessageRecovered: message => {
                    this.loggingService?.info(`[AgentManager] Agent operation recovered: ${message.id}`);
                }
            });

            // Initialize health check service
            this.healthCheckService = new HealthCheckService({
                defaultInterval: 30000, // 30 seconds
                defaultTimeout: 10000, // 10 seconds
                defaultRetries: 3,
                aggregationStrategy: 'weighted',
                enableAutoRecovery: true,
                alertOnCriticalFailure: true
            });

            this.loggingService?.info('[AgentManager] Enterprise reliability components initialized');
        } catch (error) {
            this.loggingService?.error('[AgentManager] Failed to initialize enterprise components:', error);
            this.enterpriseReliabilityEnabled = false;
        }
    }

    /**
     * Start enterprise reliability services
     */
    private startEnterpriseServices(): void {
        if (!this.enterpriseReliabilityEnabled) {
            return;
        }

        try {
            // Start health monitoring
            this.healthCheckService.start();

            // Register default health checks
            this.registerDefaultHealthChecks();

            // Register DLQ processors
            this.registerDLQProcessors();

            this.loggingService?.info('[AgentManager] Enterprise reliability services started');
        } catch (error) {
            this.loggingService?.error('[AgentManager] Failed to start enterprise services:', error);
        }
    }

    /**
     * Register default health checks
     */
    private registerDefaultHealthChecks(): void {
        // Agent count health check
        this.healthCheckService.registerCheck({
            name: 'agent-count',
            type: CheckType.READINESS,
            interval: 60000, // 1 minute
            check: async () => {
                const totalAgents = this.agents.size;
                const activeAgents = this.getActiveAgents().length;

                let status = HealthStatus.HEALTHY;
                let message = `${activeAgents}/${totalAgents} agents active`;

                if (totalAgents > 50) {
                    status = HealthStatus.DEGRADED;
                    message += ' (high agent count)';
                } else if (totalAgents === 0) {
                    status = HealthStatus.DEGRADED;
                    message += ' (no agents)';
                }

                return {
                    status,
                    message,
                    details: { totalAgents, activeAgents }
                };
            }
        });

        // Agent responsiveness health check
        this.healthCheckService.registerCheck({
            name: 'agent-responsiveness',
            type: CheckType.LIVENESS,
            interval: 45000, // 45 seconds
            critical: true,
            check: async () => {
                const workingAgents = Array.from(this.agents.values()).filter(a => a.status === 'working');
                const staleAgents = workingAgents.filter(agent => {
                    if (!agent.currentTask) return false;
                    const taskStartTime = (agent.currentTask as any).startTime || 0;
                    const staleThreshold = 300000; // 5 minutes
                    return Date.now() - taskStartTime > staleThreshold;
                });

                let status = HealthStatus.HEALTHY;
                let message = `${workingAgents.length - staleAgents.length}/${workingAgents.length} agents responsive`;

                if (staleAgents.length > 0) {
                    status =
                        staleAgents.length > workingAgents.length / 2 ? HealthStatus.UNHEALTHY : HealthStatus.DEGRADED;
                    message += ` (${staleAgents.length} stale)`;
                }

                return {
                    status,
                    message,
                    details: { workingAgents: workingAgents.length, staleAgents: staleAgents.length }
                };
            }
        });

        // Terminal availability health check
        this.healthCheckService.registerCheck({
            name: 'terminal-availability',
            type: CheckType.READINESS,
            interval: 30000, // 30 seconds
            check: async () => {
                const agentsWithTerminals = Array.from(this.agents.values()).filter(agent => {
                    return this.terminalManager?.getTerminal(agent.id) !== undefined;
                });

                const percentage = this.agents.size > 0 ? (agentsWithTerminals.length / this.agents.size) * 100 : 100;

                let status = HealthStatus.HEALTHY;
                if (percentage < 50) {
                    status = HealthStatus.UNHEALTHY;
                } else if (percentage < 80) {
                    status = HealthStatus.DEGRADED;
                }

                return {
                    status,
                    message: `${agentsWithTerminals.length}/${this.agents.size} agents have terminals (${percentage.toFixed(1)}%)`,
                    details: {
                        agentsWithTerminals: agentsWithTerminals.length,
                        totalAgents: this.agents.size,
                        percentage
                    }
                };
            }
        });
    }

    /**
     * Register DLQ processors for agent operations
     */
    private registerDLQProcessors(): void {
        // Processor for spawn agent failures
        this.deadLetterQueue.registerProcessor('spawn-agent', async (payload: any) => {
            this.loggingService?.info(`[DLQ] Retrying spawn agent: ${payload.config.name}`);
            await this.spawnAgent(payload.config, payload.restoredId);
        });

        // Processor for execute task failures
        this.deadLetterQueue.registerProcessor('execute-task', async (payload: any) => {
            this.loggingService?.info(
                `[DLQ] Retrying execute task: ${payload.task.title} for agent ${payload.agentId}`
            );
            await this.executeTask(payload.agentId, payload.task);
        });

        // Processor for remove agent failures
        this.deadLetterQueue.registerProcessor('remove-agent', async (payload: any) => {
            this.loggingService?.info(`[DLQ] Retrying remove agent: ${payload.agentId}`);
            await this.removeAgent(payload.agentId);
        });
    }

    /**
     * Get or create circuit breaker for agent operation
     */
    private getCircuitBreaker(agentId: string): CircuitBreaker {
        if (!this.circuitBreakers.has(agentId)) {
            const circuitBreaker = new CircuitBreaker(`agent-${agentId}`, {
                failureThreshold: 5,
                successThreshold: 3,
                timeout: 60000, // 1 minute
                volumeThreshold: 5,
                errorPercentageThreshold: 60,
                onStateChange: (from, to) => {
                    this.loggingService?.warn(`[AgentManager] Circuit breaker for agent ${agentId}: ${from} → ${to}`);

                    if (to === CircuitState.OPEN) {
                        this.notificationService?.showWarning(
                            `⚠️ Agent ${agentId} circuit breaker opened due to failures`
                        );
                    }
                }
            });

            this.circuitBreakers.set(agentId, circuitBreaker);
        }

        return this.circuitBreakers.get(agentId)!;
    }

    /**
     * Execute operation with enterprise reliability patterns
     */
    private async executeWithReliability<T>(
        operation: () => Promise<T>,
        operationName: string,
        agentId?: string,
        context?: any
    ): Promise<T> {
        if (!this.enterpriseReliabilityEnabled) {
            return operation();
        }

        // Check rate limit
        const rateLimitAllowed = await this.rateLimiter.isAllowed({ operation: operationName, agentId });
        if (!rateLimitAllowed.allowed) {
            throw new Error(`Rate limit exceeded for ${operationName}. Retry after ${rateLimitAllowed.retryAfter}ms`);
        }

        // Use circuit breaker if agent-specific
        if (agentId) {
            const circuitBreaker = this.getCircuitBreaker(agentId);
            return circuitBreaker.execute(() => this.retryMechanism.execute(async () => operation(), operationName));
        }

        // Use retry mechanism only
        return this.retryMechanism.execute(async () => operation(), operationName);
    }

    async initialize(showSetupDialog: boolean = false) {
        this.loggingService?.agents('AgentManager: Initializing...');

        // Only check for required dependencies
        if (!this.configService) {
            throw new Error('AgentManager dependencies not set. Call setDependencies() first.');
        }

        // Log persistence status
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.loggingService?.trace(`AgentManager: Workspace folder: ${workspaceFolder?.uri.fsPath || 'None'}`);

        if (this.persistence) {
            this.loggingService?.trace('AgentManager: Persistence initialized');
        } else {
            this.loggingService?.warn('AgentManager: No persistence available - agent state will not be saved');
        }

        // Initialize the agent lifecycle manager if available
        if (this.agentLifecycleManager) {
            await this.agentLifecycleManager.initialize();
        }

        // Check if Claude Code is available
        const aiPath = this.configService.getAiPath();

        this.loggingService?.info(`AgentManager initialized. AI path: ${aiPath}`);

        // Log that we have agents available but don't auto-restore
        const savedAgents = await this.persistence?.loadAgentState() || [];
        if (savedAgents.length > 0) {
            const maxAgents = Number(this.configService?.get('maxAgents')) || 3;
            const recentAgents = savedAgents
                .sort((a, b) => {
                    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return timeB - timeA;
                })
                .slice(0, maxAgents);
            
            console.log(`[AgentManager] Found ${savedAgents.length} saved agents. ${recentAgents.length} most recent available for restoration.`);
            // Don't auto-restore - let user decide via "Restore Previous Session" command
        } else {
            console.log('[AgentManager] No saved agents found.');
        }

        // Only show setup dialog if explicitly requested (e.g., when starting conductor)
        if (showSetupDialog) {
            const selection = await this.notificationService?.showInformation(
                '🎸 NofX Conductor ready. Using AI command: ' + aiPath,
                'Test Claude',
                'Change Path',
                'Restore Session'
            );

            if (selection === 'Test Claude') {
                const terminal = this.terminalManager?.createEphemeralTerminal('Claude Test');
                if (terminal) {
                    terminal.show();
                    terminal.sendText(`${aiPath} --version || echo "AI CLI not found. Please check installation."`);
                }
            } else if (selection === 'Change Path') {
                const newPath = await this.notificationService?.showInputBox({
                    prompt: 'Enter Claude command or path',
                    value: aiPath,
                    placeHolder: 'e.g., claude, aider, /usr/local/bin/claude'
                });
                if (newPath) {
                    await this.configService?.update('aiPath', newPath, vscode.ConfigurationTarget.Global);
                    this.notificationService?.showInformation(`AI path updated to: ${newPath}`);
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

        // Get max agents from configuration
        const maxAgents = Number(this.configService?.get('maxAgents')) || 3;
        this.loggingService?.debug(`Max agents configured: ${maxAgents}`);

        const savedAgents = await this.persistence.loadAgentState();
        this.loggingService?.info(`Found ${savedAgents.length} saved agent(s)`);

        if (savedAgents.length === 0) {
            if (userRequested) {
                this.notificationService?.showInformation('No saved agents found.');
            }
            return 0;
        }

        // Sort by creation time (most recent first) and limit to maxAgents
        const sortedAgents = savedAgents
            .sort((a, b) => {
                const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return timeB - timeA; // Most recent first
            })
            .slice(0, maxAgents); // Limit to maxAgents

        this.loggingService?.info(
            `Selected ${sortedAgents.length} most recent agents (limited by maxAgents: ${maxAgents})`
        );

        // Ask user if they want to restore the most recent team
        const restore = userRequested
            ? 'Yes, Restore'
            : await this.notificationService?.showInformation(
                  `Restore most recent team? (${sortedAgents.length} agents from ${savedAgents.length} total saved)`,
                  'Yes, Restore Recent',
                  'No, Start Fresh'
              );

        if (restore === 'Yes, Restore Recent' || restore === 'Yes, Restore' || userRequested) {
            // Use unified NofxAgentFactory instead of AgentTemplateManager
            const { NofxAgentFactory } = await import('../agents/NofxAgentFactory');
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const agentFactory = workspaceFolder ? NofxAgentFactory.getInstance(workspaceFolder.uri.fsPath) : null;

            let restoredCount = 0;
            for (const savedAgent of sortedAgents) {
                try {
                    // Load the actual template using unified factory
                    let template = savedAgent.template;
                    
                    if (typeof savedAgent.template === 'string' && agentFactory) {
                        this.loggingService?.debug(
                            `Loading template ${savedAgent.template} for agent ${savedAgent.name} using NofxAgentFactory`
                        );
                        
                        // Try to create using core agent types first
                        const coreType = agentFactory.getCoreAgentType(savedAgent.template);
                        if (coreType) {
                            // Use core agent type
                            template = agentFactory.createAgent({
                                coreType: savedAgent.template,
                                customName: savedAgent.name
                            });
                            this.loggingService?.debug(`Created template using core type: ${savedAgent.template}`);
                        } else {
                            // Fall back to legacy templates
                            const legacyTemplates = await agentFactory.loadLegacyTemplates();
                            const legacyTemplate = legacyTemplates.find(t => t.id === savedAgent.template);
                            if (legacyTemplate) {
                                template = legacyTemplate;
                                this.loggingService?.debug(`Found legacy template: ${savedAgent.template}`);
                            } else {
                                this.loggingService?.warn(
                                    `Template ${savedAgent.template} not found in core types or legacy templates, using ID as fallback`
                                );
                                template = savedAgent.template;
                            }
                        }
                    }

                    // Recreate agent with saved data and loaded template
                    const config: AgentConfig = {
                        name: savedAgent.name,
                        type: savedAgent.type,
                        template: template
                    };
                    
                    console.log(`[AgentManager] Restoring agent: ${savedAgent.name} (${savedAgent.type})`);
                    console.log(`[AgentManager] Agent template contains system prompt: ${!!template?.systemPrompt}`);
                    if (template?.systemPrompt) {
                        console.log(`[AgentManager] System prompt preview: ${template.systemPrompt.substring(0, 150)}...`);
                    }

                    // Check if we've hit the max agents limit
                    if (this.agents.size >= maxAgents) {
                        this.loggingService?.warn(`Reached max agents limit (${maxAgents}), stopping restoration`);
                        break;
                    }

                    const agent = await this.spawnAgent(config, savedAgent.id);

                    // Restore state
                    agent.status = savedAgent.status === 'working' ? 'idle' : savedAgent.status; // Reset working to idle
                    agent.tasksCompleted = savedAgent.tasksCompleted || 0;
                    
                    console.log(`[AgentManager] Agent ${savedAgent.name} restored with status: ${agent.status}`);

                    // Restore session context if available
                    const sessionContext = await this.persistence.getAgentContextSummary(savedAgent.id);
                    if (sessionContext) {
                        console.log(`[AgentManager] Loading session context for ${savedAgent.name}`);
                        const terminal = this.terminalManager?.getTerminal(agent.id);
                        if (terminal) {
                            terminal.sendText('# Restored from previous session');
                            terminal.sendText(`# ${sessionContext.split('\n').slice(0, 5).join('\n# ')}`);
                            console.log(`[AgentManager] Session context sent to terminal for ${savedAgent.name}`);
                        } else {
                            console.log(`[AgentManager] No terminal found for ${savedAgent.name} to send session context`);
                        }
                    } else {
                        console.log(`[AgentManager] No session context found for ${savedAgent.name}`);
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
        this.loggingService?.agents(`AgentManager: Spawning agent '${config.name}' (type: ${config.type})`);
        this.loggingService?.trace('AgentManager: Agent config:', config);

        // USE UNIFIED NOFX AGENT FACTORY
        const { NofxAgentFactory } = await import('./NofxAgentFactory');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const agentFactory = workspaceFolder ? NofxAgentFactory.getInstance(workspaceFolder.uri.fsPath) : NofxAgentFactory.getInstance();

        // Convert config type to core agent type
        let coreType = config.type;
        if (config.type === 'frontend-specialist') coreType = 'frontend';
        else if (config.type === 'backend-specialist') coreType = 'backend';
        else if (config.type === 'fullstack-developer') coreType = 'fullstack';
        else if (config.type === 'testing-specialist') coreType = 'testing';
        else if (config.type === 'devops-engineer') coreType = 'devops';

        // Create agent template using unified factory
        const template = agentFactory.createAgent({
            coreType,
            customName: config.name,
            projectContext: await this.analyzeProjectContext(),
            customInstructions: config.customInstructions || "Part of NofX.dev team - await instructions."
        });

        // Convert template to AgentConfig and spawn using legacy method (but with new template)
        const legacyConfig: AgentConfig = {
            name: config.name,
            type: config.type,
            template: template,
            autoStart: config.autoStart,
            context: config.context,
            customInstructions: config.customInstructions
        };

        return this.spawnAgentLegacy(legacyConfig, restoredId);
    }

    /**
     * Analyze current project to provide context for dynamic prompts
     */
    private async analyzeProjectContext(): Promise<string> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return "No workspace detected";
            }

            let context = `Project: ${workspaceFolder.name}`;
            
            // Read package.json to detect frameworks and project type
            try {
                const packageJsonPath = vscode.Uri.joinPath(workspaceFolder.uri, 'package.json');
                const packageJsonData = await vscode.workspace.fs.readFile(packageJsonPath);
                const packageJson = JSON.parse(packageJsonData.toString());
                
                // Detect project type from dependencies
                const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
                const frameworks = [];
                
                if (deps.react || deps['@types/react']) frameworks.push('React');
                if (deps.vue || deps['@vue/core']) frameworks.push('Vue');
                if (deps.angular || deps['@angular/core']) frameworks.push('Angular');
                if (deps.express) frameworks.push('Express');
                if (deps.next || deps['next']) frameworks.push('Next.js');
                if (deps.typescript || deps['@types/node']) frameworks.push('TypeScript');
                if (deps.jest || deps.mocha) frameworks.push('Testing');
                if (deps.vscode || packageJson.engines?.vscode) frameworks.push('VS Code Extension');
                if (deps.electron) frameworks.push('Electron');
                
                if (frameworks.length > 0) {
                    context += ` | Tech Stack: ${frameworks.join(', ')}`;
                }
                
                if (packageJson.description) {
                    context += ` | Description: ${packageJson.description.substring(0, 100)}`;
                }
            } catch (packageError) {
                // package.json not found or invalid - not an error
            }
            
            // Detect file structure patterns
            try {
                const files = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
                const directories = files.filter(([_, type]) => type === vscode.FileType.Directory).map(([name]) => name);
                
                if (directories.includes('src')) context += ' | Has src/';
                if (directories.includes('test') || directories.includes('tests')) context += ' | Has tests/';
                if (directories.includes('docs')) context += ' | Has docs/';
                if (directories.includes('scripts')) context += ' | Has scripts/';
                if (directories.includes('public')) context += ' | Has public/';
                if (directories.includes('dist') || directories.includes('build')) context += ' | Has build output/';
            } catch (fsError) {
                // File system access error - continue without structure info
            }
            
            return context;
        } catch (error) {
            return "Unable to analyze project context";
        }
    }

    /**
     * LEGACY METHOD - kept for backward compatibility but redirects to dynamic system
     */
    async spawnAgentLegacy(config: AgentConfig, restoredId?: string): Promise<Agent> {
        this.loggingService?.agents(`AgentManager: Spawning LEGACY agent '${config.name}' (type: ${config.type})`);

        // Log to orchestration logger
        this.orchestrationLogger?.agentSpawned(config.name, config.type, restoredId || 'pending');

        // AgentLifecycleManager is optional now (merged into AgentManager)

        try {
            // Execute with enterprise reliability patterns
            const agent = await this.executeWithReliability(
                async () => {
                    // Validate input
                    if (!config.name || !config.type) {
                        throw new Error('Invalid agent configuration: name and type are required');
                    }

                    // Create agent directly (AgentLifecycleManager functionality merged)
                    const agentId = restoredId || `agent-${Date.now()}`;
                    const agent: Agent = {
                        id: agentId,
                        name: config.name,
                        type: config.type,
                        status: 'idle',
                        template: config.template,
                        tasksCompleted: 0,
                        terminal: undefined,
                        currentTask: null,
                        maxConcurrentTasks: 5,
                        startTime: new Date()
                    };

                    // Create terminal for agent and launch Claude
                    console.error(
                        `[NofX DEBUG] About to create terminal. TerminalManager exists: ${!!this.terminalManager}`
                    );
                    if (this.terminalManager) {
                        console.error(`[NofX DEBUG] Creating terminal for ${agent.name}`);
                        const terminal = await this.terminalManager.createTerminal(agent.id, agent);
                        agent.terminal = terminal;
                        console.error(`[NofX DEBUG] Terminal created. Now calling initializeAgentTerminal...`);

                        // Initialize Claude Code in the terminal with the agent's system prompt
                        await this.terminalManager.initializeAgentTerminal(agent);
                        console.error(`[NofX DEBUG] initializeAgentTerminal completed`);
                        this.orchestrationLogger?.agentProgress(
                            agent.name,
                            'Claude Code starting with specialized prompt...'
                        );
                    } else {
                        console.error(`[NofX DEBUG] NO TERMINAL MANAGER - this explains why Claude doesn't launch!`);
                    }

                    // Create worktree if enabled (method doesn't exist in interface)
                    // if (this.worktreeService && this.configService?.get('useWorktrees')) {
                    //     await this.worktreeService.createWorktree(agentId, config.name);
                    // }

                    return agent;
                },
                'spawn-agent',
                restoredId,
                { config, restoredId }
            );

            // Store agent in our map
            this.agents.set(agent.id, agent);

            // Notify listeners
            this._onAgentUpdate.fire();

            // Publish event to EventBus
            this.publishEvent(EVENTS.AGENT_CREATED, {
                agentId: agent.id,
                name: agent.name,
                type: agent.type
            });

            // Log agent ready
            this.orchestrationLogger?.agentReady(agent.name);

            // Create session for the agent (if not restoring from existing session)
            if (this.sessionPersistenceService && !config.context?.sessionId) {
                try {
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    await this.sessionPersistenceService.createSession(agent, workspaceFolder?.uri.fsPath);
                    this.loggingService?.debug(`Session created for agent ${agent.name}`);
                } catch (error) {
                    // Session creation failure shouldn't prevent agent creation
                    this.loggingService?.warn(`Failed to create session for agent ${agent.name}:`, error);
                }
            }

            // Health monitoring is handled by MonitoringService

            // Save agent state after adding
            await this.saveAgentState();
            
            // 🟢 Set initial visual status to IDLE (Green icon)
            this.setAgentIdle(agent.id);

            this.loggingService?.info(`Agent ${config.name} ready. Total agents: ${this.agents.size}`);
            this.loggingService?.debug(
                'Agent statuses:',
                Array.from(this.agents.values()).map(a => `${a.name}: ${a.status}`)
            );

            return agent;
        } catch (error) {
            // Handle spawn failure with DLQ
            const errorObj = error instanceof Error ? error : new Error(String(error));
            this.loggingService?.error(`[AgentManager] Failed to spawn agent ${config.name}:`, errorObj);

            // Add to dead letter queue for retry
            if (this.enterpriseReliabilityEnabled) {
                await this.deadLetterQueue.addMessage({ config, restoredId }, errorObj, 'spawn-agent', {
                    critical: true,
                    agentName: config.name
                });
            }

            throw errorObj;
        }
    }

    async spawnSmartAgent(config: SmartAgentSpawnConfig, restoredId?: string): Promise<Agent> {
        this.loggingService?.agents(
            `AgentManager: Spawning smart agent '${config.name}' (category: ${config.smartConfig.category})`
        );
        this.loggingService?.trace('AgentManager: Smart agent config:', config);

        // AgentLifecycleManager is optional now (merged into AgentManager)

        // Use unified NofX Agent Factory for template creation
        const { NofxAgentFactory } = await import('./NofxAgentFactory');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const agentFactory = workspaceFolder ? NofxAgentFactory.getInstance(workspaceFolder.uri.fsPath) : NofxAgentFactory.getInstance();

        // Create dynamic template using NofxAgentFactory
        const smartTemplate = agentFactory.createAgent({
            coreType: 'fullstack', // Default to fullstack
            customName: config.name,
            customInstructions: config.smartConfig?.toString() || 'Smart agent'
        });

        // Convert SmartAgentSpawnConfig to AgentConfig
        const agentConfig: AgentConfig = {
            name: config.name,
            type: smartTemplate.id, // Use the dynamic template ID as type
            template: smartTemplate,
            autoStart: config.autoStart,
            context: config.context
        };

        // Delegate to standard spawnAgent method with generated template
        const agent = await this.spawnAgent(agentConfig, restoredId);

        // Add smart template metadata to agent
        (agent as any).smartConfig = config.smartConfig;
        (agent as any).isSmartAgent = true;

        this.loggingService?.info(`Smart agent ${config.name} ready with dynamic template ${smartTemplate.id}`);

        return agent;
    }

    async spawnSmartTeam(teamConfig: SmartTeamSpawnConfig): Promise<Agent[]> {
        this.loggingService?.agents(
            `AgentManager: Spawning smart team '${teamConfig.teamName}' with ${teamConfig.agentConfigs.length} agents`
        );

        const spawnedAgents: Agent[] = [];

        for (let i = 0; i < teamConfig.agentConfigs.length; i++) {
            const agentConfig = teamConfig.agentConfigs[i];
            const agentName = agentConfig.name || `${teamConfig.teamName}-Agent-${i + 1}`;

            try {
                const smartAgentConfig: SmartAgentSpawnConfig = {
                    name: agentName,
                    smartConfig: agentConfig,
                    autoStart: teamConfig.autoStart,
                    workingDirectory:
                        teamConfig.workspaceStrategy === 'worktrees'
                            ? `${teamConfig.teamName.toLowerCase()}-${agentName.toLowerCase()}`
                            : undefined
                };

                const agent = await this.spawnSmartAgent(smartAgentConfig);
                spawnedAgents.push(agent);

                // Add team metadata
                (agent as any).teamName = teamConfig.teamName;
                (agent as any).teamType = teamConfig.teamType;
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.errorHandler?.handleError(
                    err,
                    `Failed to spawn smart agent ${agentName} in team ${teamConfig.teamName}`
                );
                // Continue spawning other agents even if one fails
            }
        }

        if (spawnedAgents.length === 0) {
            throw new Error(`Failed to spawn any agents for smart team ${teamConfig.teamName}`);
        }

        this.loggingService?.info(
            `Smart team ${teamConfig.teamName} ready with ${spawnedAgents.length}/${teamConfig.agentConfigs.length} agents`
        );

        return spawnedAgents;
    }

    async executeTask(agentId: string, task: any) {
        this.loggingService?.debug(`Called for agent ${agentId} with task:`, task.title);

        const agent = this.agents.get(agentId);
        const agentName = agent?.name || agentId;

        // Log task reception
        this.orchestrationLogger?.agentReceivingTask(agentName, task.title, task.id || 'unknown');

        try {
            // Execute with enterprise reliability patterns
            await this.executeWithReliability(
                async () => {
                    // Validate inputs
                    if (!agentId || !task) {
                        throw new Error('Invalid parameters: agentId and task are required');
                    }

                    const agent = this.agents.get(agentId);
                    if (!agent) {
                        throw new Error(`Agent ${agentId} not found`);
                    }
                    this.loggingService?.debug(`Found agent: ${agent.name}, status: ${agent.status}`);

                    if (!this.terminalManager) {
                        throw new Error('TerminalManager not available');
                    }

                    const terminal = this.terminalManager.getTerminal(agentId);
                    if (!terminal) {
                        throw new Error(`Agent ${agentId} terminal not found`);
                    }

                    this.loggingService?.debug(`Updating agent status from ${agent.status} to working`);

                    // Update agent status
                    agent.status = 'working';
                    agent.currentTask = task;
                    
                    // 🔵 Set visual status to WORKING (Blue icon)
                    this.setAgentWorking(agentId);

                    // Add task start time for health monitoring
                    (task as any).startTime = Date.now();

                    // Start task monitoring for inactivity alerts
                    if (this.agentLifecycleManager) {
                        this.agentLifecycleManager.startTaskMonitoring(agentId);
                    }

                    this._onAgentUpdate.fire();

                    // Publish event to EventBus
                    this.publishEvent(EVENTS.AGENT_STATUS_CHANGED, { agentId: agent.id, status: 'working' });
                    this.publishEvent(EVENTS.AGENT_TASK_ASSIGNED, { agentId: agent.id, task });

                    // Log agent starting work
                    this.orchestrationLogger?.agentStartingWork(
                        agent.name,
                        task.title,
                        'Claude Code terminal interaction'
                    );
                    this.orchestrationLogger?.agentStatusChange(agent.name, 'idle', 'working');

                    // Save state after update
                    await this.saveAgentState();

                    // Log task start
                    this.loggingService?.info(`Starting task: ${task.title}`);
                    this.loggingService?.debug(`Description: ${task.description}`);
                    this.loggingService?.debug(`Priority: ${task.priority}`);
                    this.loggingService?.debug(`Task ID: ${task.id}`);

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
                        this.notificationService
                            .showInformation(
                                `🤖 Task sent to ${agent.name}'s Claude instance. Check terminal for progress.`,
                                'View Terminal'
                            )
                            .then(selection => {
                                if (selection === 'View Terminal') {
                                    terminal.show();
                                }
                            });

                        // Show notification
                        this.notificationService.showInformation(`🤖 ${agent.name} is working on: ${task.title}`);
                    }

                    // Log execution
                    this.loggingService?.info('Starting Claude Code session...');
                    this.loggingService?.info(`Task: ${task.title}`);
                },
                'execute-task',
                agentId,
                { agentId, task }
            );
        } catch (error) {
            // Handle task execution failure with DLQ
            const errorObj = error instanceof Error ? error : new Error(String(error));
            this.loggingService?.error(`[AgentManager] Failed to execute task for agent ${agentId}:`, errorObj);

            // Add to dead letter queue for retry
            if (this.enterpriseReliabilityEnabled) {
                await this.deadLetterQueue.addMessage({ agentId, task }, errorObj, 'execute-task', {
                    critical: false,
                    agentId,
                    taskTitle: task?.title
                });
            }

            throw errorObj;
        }
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
        prompt += "When you're done, please summarize what you accomplished.";

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

        // Calculate task duration
        const duration = (task as any).startTime ? Date.now() - (task as any).startTime : undefined;

        // Update agent status
        agent.status = 'idle';
        agent.currentTask = null;
        agent.tasksCompleted++;
        
        // 🟢 Set visual status to IDLE (Green icon)
        this.setAgentIdle(agentId);

        // Stop task monitoring for inactivity alerts
        if (this.agentLifecycleManager) {
            this.agentLifecycleManager.stopTaskMonitoring(agentId);
        }

        this._onAgentUpdate.fire();

        // Publish event to EventBus
        this.publishEvent(EVENTS.AGENT_STATUS_CHANGED, { agentId: agent.id, status: 'idle' });
        this.publishEvent(EVENTS.AGENT_TASK_COMPLETED, { agentId: agent.id, task });

        // Log task completion
        this.orchestrationLogger?.agentCompleted(agent.name, task.title, `Tasks completed: ${agent.tasksCompleted}`);
        this.orchestrationLogger?.taskCompleted(task.title, duration);
        this.orchestrationLogger?.agentStatusChange(agent.name, 'working', 'idle');

        // Save state after update
        await this.saveAgentState();

        this.loggingService?.info(`Task completed: ${task.title}`);
        this.loggingService?.info(`Total tasks completed: ${agent.tasksCompleted}`);

        // Show completion message
        if (this.notificationService) {
            this.notificationService.showInformation(`✅ ${agent.name} completed: ${task.title}`);
        }
    }

    async removeAgent(agentId: string) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            this.loggingService?.trace(`AgentManager: Cannot remove agent ${agentId} - not found`);
            return;
        }

        this.loggingService?.agents(`AgentManager: Removing agent '${agent.name}' (${agentId})`);

        if (!this.agentLifecycleManager) {
            const error = new Error('AgentLifecycleManager not available');
            this.errorHandler?.handleError(error, 'removeAgent');
            throw error;
        }

        try {
            // Execute with enterprise reliability patterns
            await this.executeWithReliability(
                async () => {
                    // Remove agent directly (AgentLifecycleManager functionality merged)
                    // Terminate terminal if exists
                    if (this.terminalManager) {
                        await this.terminalManager.disposeTerminal(agentId);
                    }

                    // Remove worktree if exists (method doesn't exist in interface)
                    // if (this.worktreeService && this.configService?.get('useWorktrees')) {
                    //     await this.worktreeService.removeWorktree(agentId);
                    // }

                    const success = true;

                    if (success) {
                        // Clean up enterprise components for this agent
                        const circuitBreaker = this.circuitBreakers.get(agentId);
                        if (circuitBreaker) {
                            circuitBreaker.reset();
                            this.circuitBreakers.delete(agentId);
                        }

                        // Remove from our map
                        this.agents.delete(agentId);
                        this._onAgentUpdate.fire();

                        // Publish event to EventBus
                        this.publishEvent(EVENTS.AGENT_REMOVED, { agentId, name: agent.name });

                        // Save agent state after removing
                        await this.saveAgentState();

                        this.loggingService?.info(`Agent ${agent.name} removed`);
                    }

                    return success;
                },
                'remove-agent',
                agentId,
                { agentId }
            );
        } catch (error) {
            // Handle removal failure with DLQ
            const errorObj = error instanceof Error ? error : new Error(String(error));
            this.loggingService?.error(`[AgentManager] Failed to remove agent ${agentId}:`, errorObj);

            // Add to dead letter queue for retry
            if (this.enterpriseReliabilityEnabled) {
                await this.deadLetterQueue.addMessage({ agentId }, errorObj, 'remove-agent', {
                    critical: false,
                    agentId,
                    agentName: agent.name
                });
            }

            throw errorObj;
        }
    }

    getActiveAgents(): Agent[] {
        const agents = Array.from(this.agents.values());
        this.loggingService?.trace(`AgentManager: Getting active agents (${agents.length} total)`);
        return agents;
    }

    getAgent(agentId: string): any {
        const agent = this.agents.get(agentId);
        if (!agent) return undefined;

        // Convert to interface-compliant Agent
        return {
            id: agent.id,
            name: agent.name,
            role: agent.type || 'unknown',
            status: agent.status === 'working' ? 'busy' : agent.status === 'idle' ? 'idle' : 'error'
        };
    }

    getIdleAgents(): Agent[] {
        const allAgents = Array.from(this.agents.values());
        const idleAgents = allAgents.filter(agent => agent.status === 'idle');

        this.loggingService?.debug(`Total agents: ${allAgents.length}, Idle: ${idleAgents.length}`);
        if (allAgents.length > 0) {
            this.loggingService?.debug(
                'Agent statuses:',
                allAgents.map(a => `${a.name}(${a.id}): ${a.status}`)
            );
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
                    this.notificationService
                        ?.showInformation(
                            `Is ${agent.name} done with "${task.title}"?`,
                            'Yes, Complete',
                            'Still Working'
                        )
                        .then(selection => {
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

    /**
     * Get all currently active agents
     * @returns Array of all agents
     */
    public getAllAgents(): any[] {
        return Array.from(this.agents.values()).map(agent => ({
            id: agent.id,
            name: agent.name,
            role: agent.type || 'unknown',
            status: agent.status === 'working' ? 'busy' : agent.status === 'idle' ? 'idle' : 'error'
        }));
    }

    public async saveAgentState() {
        if (!this.persistence) {
            console.log('[AgentManager] No persistence available - agents will not be saved');
            return;
        }

        try {
            const agents = Array.from(this.agents.values());
            console.log(`[AgentManager] Saving state for ${agents.length} agents to persistence`);
            await this.persistence.saveAgentState(agents);
            console.log(`[AgentManager] Successfully saved ${agents.length} agents to .nofx/agents.json`);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('[AgentManager] Failed to save agent state:', error);
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

    /**
     * Updates agent visual status and triggers terminal icon update
     */
    public updateAgentVisualStatus(agentId: string, newStatus: 'IDLE' | 'WORKING' | 'WAITING' | 'ERROR'): void {
        const agent = this.agents.get(agentId);
        if (!agent) {
            console.warn(`[AgentManager] Agent ${agentId} not found for status update`);
            return;
        }

        console.log(`[AgentManager] Updating ${agent.name} visual status: ${newStatus}`);
        
        // Update agent's visual status
        agent.visualStatus = newStatus;
        
        // Update terminal icon color through TerminalManager
        if (this.terminalManager && typeof this.terminalManager.updateAgentStatus === 'function') {
            this.terminalManager.updateAgentStatus(agentId, agent, newStatus);
        }

        // Fire agent update event
        this._onAgentUpdate.fire();
        
        // Save state
        this.saveAgentState();
    }

    /**
     * Sets agent to WORKING status when task starts
     */
    public setAgentWorking(agentId: string): void {
        this.updateAgentVisualStatus(agentId, 'WORKING');
    }

    /**
     * Sets agent to IDLE status when task completes
     */
    public setAgentIdle(agentId: string): void {
        this.updateAgentVisualStatus(agentId, 'IDLE');
    }

    /**
     * Sets agent to WAITING status when needing user input
     */
    public setAgentWaiting(agentId: string): void {
        this.updateAgentVisualStatus(agentId, 'WAITING');
    }

    /**
     * Sets agent to ERROR status when something goes wrong
     */
    public setAgentError(agentId: string): void {
        this.updateAgentVisualStatus(agentId, 'ERROR');
    }

    /**
     * Batch update multiple agent statuses
     */
    public updateMultipleAgentStatuses(updates: Array<{agentId: string, status: 'IDLE' | 'WORKING' | 'WAITING' | 'ERROR'}>): void {
        updates.forEach(update => {
            this.updateAgentVisualStatus(update.agentId, update.status);
        });
    }

    // Health monitoring public methods - delegated to MonitoringService
    public getAgentHealthStatus(agentId: string): any | undefined {
        // Replaced with MonitoringService integration
        return undefined;
    }

    public getAllAgentHealthStatuses(): any[] {
        // Replaced with MonitoringService integration
        return [];
    }

    public getAgentHealthSummary(): {
        total: number;
        healthy: number;
        unhealthy: number;
        recovering: number;
        failed: number;
    } {
        return { total: 0, healthy: 0, unhealthy: 0, recovering: 0, failed: 0 };
    }

    public async performAgentHealthCheck(agentId: string): Promise<boolean> {
        // Health checks now handled by MonitoringService
        return true;
    }

    async dispose(): Promise<void> {
        // Set disposing flag to prevent double-dispose
        this.isDisposing = true;

        this.loggingService?.info('[AgentManager] Starting graceful disposal...');

        // Save final state before disposal
        await this.saveAgentState();

        // Dispose enterprise reliability components
        if (this.enterpriseReliabilityEnabled) {
            try {
                // Stop health monitoring
                this.healthCheckService.stop();

                // Stop DLQ processing
                this.deadLetterQueue.stopProcessing();

                // Reset all circuit breakers
                for (const [agentId, circuitBreaker] of this.circuitBreakers.entries()) {
                    circuitBreaker.reset();
                }
                this.circuitBreakers.clear();

                // Dispose rate limiter
                this.rateLimiter.dispose();

                this.loggingService?.info('[AgentManager] Enterprise reliability components disposed');
            } catch (error) {
                this.loggingService?.error('[AgentManager] Error disposing enterprise components:', error);
            }
        }

        // Clean up all agents - await removal operations
        await Promise.allSettled([...this.agents.keys()].map(id => this.removeAgent(id)));

        // Dispose services
        this.agentLifecycleManager?.dispose();
        this.terminalManager?.dispose();
        this.worktreeService?.dispose();

        // Clean up load balancing data
        this.agentCapacityScores.clear();
        this.agentLoadTracking.clear();

        // Dispose all subscriptions
        this.disposables.forEach(d => d?.dispose());
        this.disposables = [];

        this.loggingService?.info('[AgentManager] Disposal completed');
    }

    // ============================================================================
    // ENTERPRISE RELIABILITY PUBLIC METHODS
    // ============================================================================

    /**
     * Get overall health status
     */
    getOverallHealthStatus(): { status: HealthStatus; details: any } | null {
        if (!this.enterpriseReliabilityEnabled) {
            return null;
        }

        const health = this.healthCheckService.getHealth();
        return {
            status: health.overall,
            details: {
                uptime: health.uptime,
                consecutiveFailures: health.consecutiveFailures,
                lastHealthyTime: health.lastHealthyTime,
                checks: Array.from(health.checks.entries()).map(([name, result]) => ({
                    name,
                    status: result.status,
                    message: result.message,
                    timestamp: result.timestamp
                }))
            }
        };
    }

    /**
     * Get circuit breaker status for an agent
     */
    getAgentCircuitBreakerStatus(agentId: string): { state: CircuitState; metrics: any } | null {
        if (!this.enterpriseReliabilityEnabled) {
            return null;
        }

        const circuitBreaker = this.circuitBreakers.get(agentId);
        if (!circuitBreaker) {
            return null;
        }

        return {
            state: circuitBreaker.getState(),
            metrics: circuitBreaker.getMetrics()
        };
    }

    /**
     * Get retry mechanism metrics
     */
    getRetryMetrics(): any | null {
        if (!this.enterpriseReliabilityEnabled) {
            return null;
        }

        return this.retryMechanism.getMetrics();
    }

    /**
     * Get rate limiter metrics
     */
    getRateLimiterMetrics(): any | null {
        if (!this.enterpriseReliabilityEnabled) {
            return null;
        }

        return this.rateLimiter.getMetrics();
    }

    /**
     * Get dead letter queue metrics
     */
    getDLQMetrics(): any | null {
        if (!this.enterpriseReliabilityEnabled) {
            return null;
        }

        return this.deadLetterQueue.getMetrics();
    }

    /**
     * Get comprehensive reliability status
     */
    getReliabilityStatus(): any {
        if (!this.enterpriseReliabilityEnabled) {
            return { enabled: false, message: 'Enterprise reliability features disabled' };
        }

        return {
            enabled: true,
            health: this.getOverallHealthStatus(),
            retry: this.getRetryMetrics(),
            rateLimiter: this.getRateLimiterMetrics(),
            dlq: this.getDLQMetrics(),
            circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([agentId, cb]) => ({
                agentId,
                state: cb.getState(),
                metrics: cb.getMetrics()
            }))
        };
    }

    /**
     * Force reset circuit breaker for an agent
     */
    resetAgentCircuitBreaker(agentId: string): boolean {
        if (!this.enterpriseReliabilityEnabled) {
            return false;
        }

        const circuitBreaker = this.circuitBreakers.get(agentId);
        if (circuitBreaker) {
            circuitBreaker.reset();
            this.loggingService?.info(`[AgentManager] Reset circuit breaker for agent ${agentId}`);
            return true;
        }

        return false;
    }

    /**
     * Manually retry a DLQ message
     */
    async retryDLQMessage(messageId: string): Promise<boolean> {
        if (!this.enterpriseReliabilityEnabled) {
            return false;
        }

        try {
            await this.deadLetterQueue.retryMessage(messageId);
            return true;
        } catch (error) {
            this.loggingService?.error(`[AgentManager] Failed to retry DLQ message ${messageId}:`, error);
            return false;
        }
    }

    /**
     * Get DLQ messages for inspection
     */
    getDLQMessages(): DLQMessage[] {
        if (!this.enterpriseReliabilityEnabled) {
            return [];
        }

        return this.deadLetterQueue.getMessages();
    }

    // ============================================================================
    // LOAD BALANCING INTEGRATION
    // ============================================================================

    /**
     * Get agent capacity information for load balancing
     */
    getAgentCapacity(agentId: string): { currentLoad: number; maxCapacity: number; isAvailable: boolean } {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return { currentLoad: 0, maxCapacity: 0, isAvailable: false };
        }

        const loadInfo = this.agentLoadTracking.get(agentId);
        const currentLoad = loadInfo?.currentLoad || 0;
        const maxCapacity = loadInfo?.maxCapacity || agent.maxConcurrentTasks || 5;
        const isAvailable = agent.status === 'idle' || agent.status === 'online';

        return { currentLoad, maxCapacity, isAvailable };
    }

    /**
     * Update agent load for load balancing tracking
     */
    updateAgentLoad(agentId: string, currentLoad: number, maxCapacity?: number): void {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        const existingLoad = this.agentLoadTracking.get(agentId);
        const newMaxCapacity = maxCapacity || existingLoad?.maxCapacity || agent.maxConcurrentTasks || 5;

        this.agentLoadTracking.set(agentId, {
            currentLoad,
            maxCapacity: newMaxCapacity,
            lastUpdate: new Date()
        });

        // Emit per-agent load gauge for dashboard support
        const cap = Math.max(1, newMaxCapacity || 0);
        const utilization = (currentLoad / cap) * 100;

        // Publish load change event
        this.publishEvent(EVENTS.LOAD_BALANCING_EVENT, {
            type: 'agent_load_updated',
            agentId,
            currentLoad,
            maxCapacity: newMaxCapacity,
            timestamp: new Date()
        });

        this.loggingService?.debug(`Updated load for agent ${agentId}: ${currentLoad}/${newMaxCapacity}`);
    }

    /**
     * Get available agents for load balancing (excluding overloaded agents)
     */
    getAvailableAgents(): Agent[] {
        const allAgents = Array.from(this.agents.values());
        return allAgents.filter(agent => {
            if (agent.status !== 'idle' && agent.status !== 'online') return false;

            const loadInfo = this.agentLoadTracking.get(agent.id);
            if (!loadInfo) return true; // No load info, assume available

            const cap = Math.max(1, loadInfo.maxCapacity || 0);
            const utilization = (loadInfo.currentLoad / cap) * 100;
            return utilization < 90; // Consider available if under 90% utilization
        });
    }

    /**
     * Get overloaded agents for load balancing
     */
    getOverloadedAgents(threshold: number = 80): Agent[] {
        const allAgents = Array.from(this.agents.values());
        return allAgents.filter(agent => {
            const loadInfo = this.agentLoadTracking.get(agent.id);
            if (!loadInfo) return false;

            const cap = Math.max(1, loadInfo.maxCapacity || 0);
            const utilization = (loadInfo.currentLoad / cap) * 100;
            return utilization > threshold;
        });
    }

    /**
     * Get optimal agents for a task with capacity consideration
     */
    getOptimalAgentsForTask(task: any, maxAgents: number = 5): Agent[] {
        const availableAgents = this.getAvailableAgents();

        // Score agents based on capacity and capabilities
        const scoredAgents = availableAgents.map(agent => {
            const loadInfo = this.agentLoadTracking.get(agent.id);
            const currentLoad = loadInfo?.currentLoad || 0;
            const maxCapacity = loadInfo?.maxCapacity || agent.maxConcurrentTasks || 5;
            const availableCapacity = maxCapacity - currentLoad;

            // Simple scoring: higher available capacity = better score
            const cap = Math.max(1, maxCapacity || 0);
            const capacityScore = (availableCapacity / cap) * 100;

            return {
                agent,
                capacityScore,
                availableCapacity
            };
        });

        // Sort by capacity score (descending) and return top agents
        return scoredAgents
            .sort((a, b) => b.capacityScore - a.capacityScore)
            .slice(0, maxAgents)
            .map(item => item.agent);
    }

    /**
     * Record agent capacity score for load balancing
     */
    recordAgentCapacityScore(agentId: string, capacityScore: AgentCapacityScore): void {
        this.agentCapacityScores.set(agentId, capacityScore);

        this.loggingService?.debug(`Recorded capacity score for agent ${agentId}: ${capacityScore.overallScore}`);
    }

    /**
     * Get agent capacity scores
     */
    getAgentCapacityScores(): Map<string, AgentCapacityScore> {
        return new Map(this.agentCapacityScores);
    }

    /**
     * Get agent load tracking information
     */
    getAgentLoadTracking(): Map<string, { currentLoad: number; maxCapacity: number; lastUpdate: Date }> {
        return new Map(this.agentLoadTracking);
    }

    /**
     * Calculate agent utilization percentage
     */
    getAgentUtilization(agentId: string): number {
        const loadInfo = this.agentLoadTracking.get(agentId);
        if (!loadInfo) return 0;

        const cap = Math.max(1, loadInfo.maxCapacity || 0);
        return (loadInfo.currentLoad / cap) * 100;
    }

    /**
     * Check if agent is available for new tasks
     */
    isAgentAvailable(agentId: string): boolean {
        const agent = this.agents.get(agentId);
        if (!agent) return false;

        if (agent.status !== 'idle' && agent.status !== 'online') return false;

        const utilization = this.getAgentUtilization(agentId);
        return utilization < 90; // Available if under 90% utilization
    }

    /**
     * Get agent availability score for load balancing
     */
    getAgentAvailabilityScore(agentId: string): number {
        const agent = this.agents.get(agentId);
        if (!agent) return 0;

        const utilization = this.getAgentUtilization(agentId);
        const statusScore = agent.status === 'idle' ? 100 : agent.status === 'online' ? 80 : 0;

        // Combine status and utilization scores
        return Math.round(statusScore * 0.6 + (100 - utilization) * 0.4);
    }

    /**
     * Publish load balancing event
     */
    private publishLoadBalancingEvent(event: LoadBalancingEvent): void {
        this.publishEvent(EVENTS.LOAD_BALANCING_EVENT, event);
        this.loggingService?.debug(`Published load balancing event: ${event.type} for agent ${event.agentId}`);
    }

    /**
     * Get all agents (for compatibility with existing code)
     */
    getAgents(): Agent[] {
        return Array.from(this.agents.values());
    }

    /**
     * Get agent statistics including load balancing information
     */
    getAgentStatsWithLoadBalancing(): {
        total: number;
        idle: number;
        working: number;
        error: number;
        offline: number;
        overloaded: number;
        averageUtilization: number;
    } {
        const allAgents = Array.from(this.agents.values());
        const overloadedAgents = this.getOverloadedAgents();

        const utilizationValues = Array.from(this.agentLoadTracking.values()).map(load => {
            const cap = Math.max(1, load.maxCapacity || 0);
            return (load.currentLoad / cap) * 100;
        });
        const averageUtilization =
            utilizationValues.length > 0
                ? utilizationValues.reduce((sum, util) => sum + util, 0) / utilizationValues.length
                : 0;

        return {
            total: allAgents.length,
            idle: allAgents.filter(a => a.status === 'idle').length,
            working: allAgents.filter(a => a.status === 'working').length,
            error: allAgents.filter(a => a.status === 'error').length,
            offline: allAgents.filter(a => a.status === 'offline').length,
            overloaded: overloadedAgents.length,
            averageUtilization: Math.round(averageUtilization)
        };
    }

    // Additional methods for MainCommands compatibility
    async selectAgents(): Promise<Agent[]> {
        // Show quick pick to select agents
        const items = Array.from(this.agents.values()).map(agent => ({
            label: agent.name,
            description: agent.type,
            picked: false,
            agent
        }));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'Select agents to spawn'
        });

        if (!selected) {
            return [];
        }

        return selected.map(item => item.agent);
    }

    async spawnAgents(configs: AgentConfig[]): Promise<Agent[]> {
        const agents: Agent[] = [];
        for (const config of configs) {
            try {
                const agent = await this.spawnAgent(config);
                agents.push(agent);
            } catch (error) {
                this.loggingService?.error(`Failed to spawn agent ${config.name}:`, error);
            }
        }
        return agents;
    }

    async clearAllAgents(): Promise<void> {
        // Remove all agents
        const agentIds = Array.from(this.agents.keys());
        for (const agentId of agentIds) {
            await this.removeAgent(agentId);
        }
    }

    async restorePreviousSession(): Promise<boolean> {
        // Try to restore agents from persistence
        if (this.persistence) {
            const savedAgents = await this.persistence.getAgents();
            if (savedAgents && savedAgents.length > 0) {
                for (const savedAgent of savedAgents) {
                    try {
                        const config: AgentConfig = {
                            name: savedAgent.name,
                            type: savedAgent.type,
                            template: savedAgent.templateId || savedAgent.type
                        };
                        await this.spawnAgent(config, savedAgent.id);
                    } catch (error) {
                        this.loggingService?.error(`Failed to restore agent ${savedAgent.name}:`, error);
                    }
                }
                return true;
            }
        }
        return false;
    }

    async quickStart(): Promise<void> {
        // Quick start with default team
        const defaultTeam = this.configService?.get('defaultTeam') || 'full-stack';
        await vscode.commands.executeCommand('nofx.quickStartTeam', defaultTeam);
    }
}
