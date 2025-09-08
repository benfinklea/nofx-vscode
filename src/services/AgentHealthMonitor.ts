import * as vscode from 'vscode';
import { TerminalOutputMonitor } from './TerminalOutputMonitor';
import { ILoggingService, ITerminalManager, IEventBus, IConfigurationService } from './interfaces';
import { DOMAIN_EVENTS } from './EventConstants';

export interface AgentHealthStatus {
    agentId: string;
    healthy: boolean;
    lastSeen: Date;
    issues: string[];
    consecutiveFailures: number;
    responseTime?: number;
    initializationState: 'pending' | 'initializing' | 'ready' | 'failed' | 'recovering';
}

export interface AgentRecoveryAction {
    type: 'restart' | 'reinitialize' | 'reset_terminal' | 'force_restart';
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
}

export class AgentHealthMonitor {
    private healthStatuses = new Map<string, AgentHealthStatus>();
    private healthCheckIntervals = new Map<string, NodeJS.Timeout>();
    private outputMonitor: TerminalOutputMonitor;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private terminalManager: ITerminalManager,
        private loggingService?: ILoggingService,
        private eventBus?: IEventBus,
        private configService?: IConfigurationService
    ) {
        this.outputMonitor = new TerminalOutputMonitor();
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Listen for Claude ready events
        this.outputMonitor.on('claude-ready', (event: any) => {
            this.handleClaudeReady(event.agentId);
        });

        // Listen for Claude error events
        this.outputMonitor.on('claude-error', (event: any) => {
            this.handleClaudeError(event.agentId, event.error);
        });
    }

    /**
     * Start monitoring an agent's health
     */
    public startMonitoring(agentId: string, terminal: vscode.Terminal): void {
        this.loggingService?.debug(`Starting health monitoring for agent ${agentId}`);

        // Initialize health status
        const healthStatus: AgentHealthStatus = {
            agentId,
            healthy: false,
            lastSeen: new Date(),
            issues: [],
            consecutiveFailures: 0,
            initializationState: 'pending'
        };
        this.healthStatuses.set(agentId, healthStatus);

        // Start terminal output monitoring
        this.outputMonitor.monitorTerminal(terminal, agentId);

        // Set up periodic health checks using configured interval
        const healthCheckInterval = this.configService?.get<number>('robustness.healthCheckInterval', 30000) || 30000;
        const interval = setInterval(() => {
            this.performHealthCheck(agentId);
        }, healthCheckInterval);

        this.healthCheckIntervals.set(agentId, interval);

        // Set initialization timeout using configured value
        const initTimeout = this.configService?.get<number>('robustness.initializationTimeout', 45000) || 45000;
        setTimeout(() => {
            const status = this.healthStatuses.get(agentId);
            if (status && status.initializationState === 'pending') {
                this.handleInitializationTimeout(agentId);
            }
        }, initTimeout);
    }

    /**
     * Stop monitoring an agent
     */
    public stopMonitoring(agentId: string): void {
        this.loggingService?.debug(`Stopping health monitoring for agent ${agentId}`);

        // Clear interval
        const interval = this.healthCheckIntervals.get(agentId);
        if (interval) {
            clearInterval(interval);
            this.healthCheckIntervals.delete(agentId);
        }

        // Remove health status
        this.healthStatuses.delete(agentId);

        // Stop terminal monitoring
        const terminal = this.terminalManager.getTerminal(agentId);
        if (terminal) {
            this.outputMonitor.stopMonitoring(terminal);
        }
    }

    /**
     * Get health status for an agent
     */
    public getHealthStatus(agentId: string): AgentHealthStatus | undefined {
        return this.healthStatuses.get(agentId);
    }

    /**
     * Get health status for all monitored agents
     */
    public getAllHealthStatuses(): AgentHealthStatus[] {
        return Array.from(this.healthStatuses.values());
    }

    /**
     * Perform a health check on a specific agent
     */
    public async performHealthCheck(agentId: string): Promise<boolean> {
        const status = this.healthStatuses.get(agentId);
        if (!status) {
            this.loggingService?.warn(`No health status found for agent ${agentId}`);
            return false;
        }

        try {
            const startTime = Date.now();
            const healthResult = await this.terminalManager.performHealthCheck(agentId);
            const responseTime = Date.now() - startTime;

            // Update health status
            status.lastSeen = new Date();
            status.responseTime = responseTime;
            status.issues = healthResult.issues;

            if (healthResult.healthy) {
                status.healthy = true;
                status.consecutiveFailures = 0;
                if (status.initializationState === 'pending') {
                    status.initializationState = 'ready';
                }
            } else {
                status.healthy = false;
                status.consecutiveFailures++;

                this.loggingService?.warn(`Health check failed for agent ${agentId}:`, {
                    consecutiveFailures: status.consecutiveFailures,
                    issues: healthResult.issues
                });

                // Check if recovery is needed using configured threshold
                const maxConsecutiveFailures =
                    this.configService?.get<number>('robustness.maxConsecutiveFailures', 3) || 3;
                if (status.consecutiveFailures >= maxConsecutiveFailures) {
                    await this.triggerRecovery(agentId, status);
                }
            }

            this.eventBus?.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, { agentId, status });
            return healthResult.healthy;
        } catch (error) {
            this.loggingService?.error(`Health check error for agent ${agentId}:`, error);
            status.healthy = false;
            status.consecutiveFailures++;
            status.issues.push(`Health check failed: ${error}`);

            const maxConsecutiveFailures = this.configService?.get<number>('robustness.maxConsecutiveFailures', 3) || 3;
            if (status.consecutiveFailures >= maxConsecutiveFailures) {
                await this.triggerRecovery(agentId, status);
            }

            return false;
        }
    }

    /**
     * Handle Claude ready detection
     */
    private handleClaudeReady(agentId: string): void {
        const status = this.healthStatuses.get(agentId);
        if (status) {
            this.loggingService?.info(`Claude ready detected for agent ${agentId}`);
            status.initializationState = 'ready';
            status.healthy = true;
            status.consecutiveFailures = 0;
            status.lastSeen = new Date();
            status.issues = [];

            this.eventBus?.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, { agentId, status });
        }
    }

    /**
     * Handle Claude error detection
     */
    private handleClaudeError(agentId: string, error: string): void {
        const status = this.healthStatuses.get(agentId);
        if (status) {
            this.loggingService?.error(`Claude error detected for agent ${agentId}: ${error}`);
            status.healthy = false;
            status.consecutiveFailures++;
            status.issues.push(`Claude error: ${error}`);
            status.initializationState = 'failed';

            this.eventBus?.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, { agentId, status });

            // Immediate recovery for critical errors
            this.triggerRecovery(agentId, status);
        }
    }

    /**
     * Handle initialization timeout
     */
    private handleInitializationTimeout(agentId: string): void {
        const status = this.healthStatuses.get(agentId);
        if (status) {
            const initTimeout = this.configService?.get<number>('robustness.initializationTimeout', 45000) || 45000;
            this.loggingService?.error(`Initialization timeout for agent ${agentId} after ${initTimeout}ms`);
            status.healthy = false;
            status.initializationState = 'failed';
            status.issues.push('Initialization timeout');

            this.triggerRecovery(agentId, status);
        }
    }

    /**
     * Trigger recovery procedures for an unhealthy agent
     */
    private async triggerRecovery(agentId: string, status: AgentHealthStatus): Promise<void> {
        // Check if auto-recovery is enabled
        const autoRecoveryEnabled = this.configService?.get<boolean>('robustness.enableAutoRecovery', true) ?? true;
        if (!autoRecoveryEnabled) {
            this.loggingService?.warn(`Auto-recovery disabled for agent ${agentId} - manual intervention required`);
            this.eventBus?.publish(DOMAIN_EVENTS.AGENT_FAILED, { agentId, status, requiresManualIntervention: true });
            return;
        }

        this.loggingService?.warn(
            `Triggering recovery for agent ${agentId} after ${status.consecutiveFailures} failures`
        );

        status.initializationState = 'recovering';

        const action = this.determineRecoveryAction(status);
        this.loggingService?.info(`Recovery action for ${agentId}: ${action.type} - ${action.description}`);

        try {
            await this.executeRecoveryAction(agentId, action);

            // Reset failure count on successful recovery initiation
            status.consecutiveFailures = 0;
            status.initializationState = 'initializing';
        } catch (error) {
            this.loggingService?.error(`Recovery failed for agent ${agentId}:`, error);
            status.issues.push(`Recovery failed: ${error}`);

            // If recovery fails completely, mark as critically failed
            const maxConsecutiveFailures = this.configService?.get<number>('robustness.maxConsecutiveFailures', 3) || 3;
            if (status.consecutiveFailures > maxConsecutiveFailures * 2) {
                status.initializationState = 'failed';
                this.eventBus?.publish(DOMAIN_EVENTS.AGENT_FAILED, {
                    agentId,
                    status,
                    requiresManualIntervention: true
                });
            }
        }
    }

    /**
     * Determine the appropriate recovery action based on failure patterns
     */
    private determineRecoveryAction(status: AgentHealthStatus): AgentRecoveryAction {
        const failureCount = status.consecutiveFailures;
        const recoveryStrategy =
            this.configService?.get<string>('robustness.recoveryStrategy', 'progressive') || 'progressive';

        const hasTerminalIssues = status.issues.some(
            issue => issue.includes('terminal') || issue.includes('connection')
        );
        const hasInitializationIssues = status.issues.some(
            issue => issue.includes('initialization') || issue.includes('timeout') || issue.includes('Claude')
        );

        switch (recoveryStrategy) {
            case 'conservative':
                // Conservative strategy: Always try gentle approaches first
                if (hasTerminalIssues) {
                    return {
                        type: 'reset_terminal',
                        description: 'Conservative: Reset terminal due to connection issues',
                        severity: 'low'
                    };
                } else {
                    return {
                        type: 'reinitialize',
                        description: 'Conservative: Gentle reinitialize attempt',
                        severity: 'medium'
                    };
                }

            case 'aggressive':
                // Aggressive strategy: Go straight to force restart
                return {
                    type: 'force_restart',
                    description: 'Aggressive: Force restart for any failure',
                    severity: 'critical'
                };

            case 'progressive':
            default:
                // Progressive strategy: Escalate based on failure count
                if (failureCount <= 2 && hasTerminalIssues) {
                    return {
                        type: 'reset_terminal',
                        description: 'Progressive: Reset terminal due to connection issues',
                        severity: 'medium'
                    };
                } else if (failureCount <= 3 && hasInitializationIssues) {
                    return {
                        type: 'reinitialize',
                        description: 'Progressive: Reinitialize agent due to startup problems',
                        severity: 'medium'
                    };
                } else if (failureCount <= 5) {
                    return {
                        type: 'restart',
                        description: 'Progressive: Restart agent due to persistent issues',
                        severity: 'high'
                    };
                } else {
                    return {
                        type: 'force_restart',
                        description: 'Progressive: Force restart agent due to critical failures',
                        severity: 'critical'
                    };
                }
        }
    }

    /**
     * Execute a recovery action
     */
    private async executeRecoveryAction(agentId: string, action: AgentRecoveryAction): Promise<void> {
        this.eventBus?.publish(DOMAIN_EVENTS.AGENT_RECOVERY_STARTED, { agentId, action });

        switch (action.type) {
            case 'reset_terminal':
                await this.resetTerminal(agentId);
                break;

            case 'reinitialize':
                await this.reinitializeAgent(agentId);
                break;

            case 'restart':
                await this.restartAgent(agentId);
                break;

            case 'force_restart':
                await this.forceRestartAgent(agentId);
                break;

            default:
                throw new Error(`Unknown recovery action: ${action.type}`);
        }

        this.eventBus?.publish(DOMAIN_EVENTS.AGENT_RECOVERY_COMPLETED, { agentId, action });
    }

    private async resetTerminal(agentId: string): Promise<void> {
        this.loggingService?.info(`Resetting terminal for agent ${agentId}`);
        // Implementation would reset terminal state
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    private async reinitializeAgent(agentId: string): Promise<void> {
        this.loggingService?.info(`Reinitializing agent ${agentId}`);
        // Implementation would trigger reinitialization
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    private async restartAgent(agentId: string): Promise<void> {
        this.loggingService?.info(`Restarting agent ${agentId}`);
        // Implementation would fully restart the agent
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    private async forceRestartAgent(agentId: string): Promise<void> {
        this.loggingService?.info(`Force restarting agent ${agentId}`);
        // Implementation would force restart with cleanup
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    /**
     * Get summary statistics for all agents
     */
    public getHealthSummary(): {
        total: number;
        healthy: number;
        unhealthy: number;
        recovering: number;
        failed: number;
    } {
        const all = this.getAllHealthStatuses();

        return {
            total: all.length,
            healthy: all.filter(s => s.healthy && s.initializationState === 'ready').length,
            unhealthy: all.filter(s => !s.healthy && s.initializationState !== 'recovering').length,
            recovering: all.filter(s => s.initializationState === 'recovering').length,
            failed: all.filter(s => s.initializationState === 'failed').length
        };
    }

    /**
     * Dispose of all monitoring resources
     */
    public dispose(): void {
        // Clear all intervals
        for (const interval of this.healthCheckIntervals.values()) {
            clearInterval(interval);
        }
        this.healthCheckIntervals.clear();

        // Clear health statuses
        this.healthStatuses.clear();

        // Dispose output monitor
        this.outputMonitor.dispose();

        // Dispose event listeners
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
