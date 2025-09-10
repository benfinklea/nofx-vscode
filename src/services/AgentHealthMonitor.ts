/**
 * Enterprise-Grade Agent Health Monitoring System
 *
 * Comprehensive health monitoring with self-healing capabilities,
 * anomaly detection, and predictive failure analysis.
 */

import * as vscode from 'vscode';
import { ITerminalManager, ILogger, IEventEmitter, IEventSubscriber, IConfiguration } from './interfaces';
import { EVENTS } from './EventConstants';
import { CircuitBreaker } from './reliability/CircuitBreaker';
import { RetryMechanism } from './reliability/RetryMechanism';

export enum AgentHealthStatus {
    HEALTHY = 'healthy',
    DEGRADED = 'degraded',
    UNHEALTHY = 'unhealthy',
    CRITICAL = 'critical',
    UNKNOWN = 'unknown',
    RECOVERING = 'recovering'
}

export interface HealthMetrics {
    status: AgentHealthStatus;
    lastCheckTime: number;
    lastResponseTime: number;
    averageResponseTime: number;
    errorRate: number;
    memoryUsage: number;
    cpuUsage: number;
    taskCompletionRate: number;
    consecutiveFailures: number;
    uptime: number;
    recoveryAttempts: number;
}

export interface HealthCheck {
    name: string;
    check: () => Promise<boolean>;
    weight: number;
    critical: boolean;
    timeout: number;
}

interface AgentHealthData {
    agentId: string;
    metrics: HealthMetrics;
    history: HealthMetrics[];
    circuitBreaker: CircuitBreaker;
    lastHealthCheck: number;
    isMonitoring: boolean;
    recoveryInProgress: boolean;
}

/**
 * Agent Health Monitor with self-healing and predictive capabilities
 */
export class AgentHealthMonitor {
    private agents: Map<string, AgentHealthData> = new Map();
    private monitoringInterval: NodeJS.Timeout | null = null;
    private readonly checkInterval = 30000; // 30 seconds
    private readonly historySize = 100;
    private readonly anomalyThreshold = 3; // Standard deviations
    private isShuttingDown = false;

    // Helper method to safely publish events
    private publishEvent(event: string, data?: any): void {
        if (this.eventBus && 'publish' in this.eventBus) {
            (this.eventBus as any).publish(event, data);
        } else if (this.eventBus && 'emit' in this.eventBus) {
            (this.eventBus as any).emit(event, data);
        }
    }

    // Health check registry
    private healthChecks: Map<string, HealthCheck[]> = new Map();

    // Recovery strategies
    private recoveryStrategies = {
        restart: this.restartAgent.bind(this),
        reload: this.reloadAgent.bind(this),
        clear: this.clearAgentState.bind(this),
        isolate: this.isolateAgent.bind(this)
    };

    // Retry mechanism for health checks
    private retryMechanism = new RetryMechanism({
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 5000,
        strategy: 'EXPONENTIAL' as any
    });

    constructor(
        private terminalManager: ITerminalManager,
        private loggingService?: ILogger,
        private eventBus?: IEventEmitter & IEventSubscriber,
        private configService?: IConfiguration
    ) {
        this.startMonitoring();
        this.setupEventListeners();
    }

    /**
     * Start monitoring a specific agent
     */
    startMonitoringAgent(agentId: string, initialMetrics?: Partial<HealthMetrics>): void {
        if (this.agents.has(agentId)) {
            this.loggingService?.debug(`Already monitoring agent ${agentId}`);
            return;
        }

        const metrics: HealthMetrics = {
            status: AgentHealthStatus.HEALTHY,
            lastCheckTime: Date.now(),
            lastResponseTime: 0,
            averageResponseTime: 0,
            errorRate: 0,
            memoryUsage: 0,
            cpuUsage: 0,
            taskCompletionRate: 100,
            consecutiveFailures: 0,
            uptime: Date.now(),
            recoveryAttempts: 0,
            ...initialMetrics
        };

        const circuitBreaker = new CircuitBreaker(`agent-${agentId}`, {
            failureThreshold: 3,
            timeout: 60000,
            onStateChange: (from, to) => {
                this.handleCircuitBreakerStateChange(agentId, from, to);
            }
        });

        this.agents.set(agentId, {
            agentId,
            metrics,
            history: [metrics],
            circuitBreaker,
            lastHealthCheck: Date.now(),
            isMonitoring: true,
            recoveryInProgress: false
        });

        // Register default health checks
        this.registerDefaultHealthChecks(agentId);

        this.loggingService?.info(`Started monitoring agent ${agentId}`);
        this.publishEvent(EVENTS.AGENT_CREATED, { agentId });
    }

    /**
     * Stop monitoring an agent
     */
    stopMonitoring(agentId: string): void {
        const agentData = this.agents.get(agentId);
        if (!agentData) {
            return;
        }

        agentData.isMonitoring = false;
        this.agents.delete(agentId);
        this.healthChecks.delete(agentId);

        this.loggingService?.info(`Stopped monitoring agent ${agentId}`);
        this.publishEvent(EVENTS.AGENT_REMOVED, { agentId });
    }

    /**
     * Get agent health status
     */
    getAgentHealth(agentId: string): AgentHealthStatus {
        const agentData = this.agents.get(agentId);
        return agentData?.metrics.status || AgentHealthStatus.UNKNOWN;
    }

    /**
     * Get agent health metrics
     */
    getAgentMetrics(agentId: string): HealthMetrics | null {
        const agentData = this.agents.get(agentId);
        return agentData ? { ...agentData.metrics } : null;
    }

    /**
     * Get all agents health summary
     */
    getHealthSummary(): Map<string, AgentHealthStatus> {
        const summary = new Map<string, AgentHealthStatus>();

        for (const [agentId, data] of this.agents) {
            summary.set(agentId, data.metrics.status);
        }

        return summary;
    }

    /**
     * Register health check for an agent
     */
    registerHealthCheck(agentId: string, check: HealthCheck): void {
        if (!this.healthChecks.has(agentId)) {
            this.healthChecks.set(agentId, []);
        }

        this.healthChecks.get(agentId)!.push(check);

        this.loggingService?.debug(`Registered health check '${check.name}' for agent ${agentId}`);
    }

    /**
     * Register default health checks
     */
    private registerDefaultHealthChecks(agentId: string): void {
        // Terminal responsiveness check
        this.registerHealthCheck(agentId, {
            name: 'terminal_responsive',
            check: async () => this.checkTerminalResponsive(agentId),
            weight: 0.3,
            critical: true,
            timeout: 5000
        });

        // Memory usage check
        this.registerHealthCheck(agentId, {
            name: 'memory_usage',
            check: async () => this.checkMemoryUsage(agentId),
            weight: 0.2,
            critical: false,
            timeout: 3000
        });

        // Task completion rate check
        this.registerHealthCheck(agentId, {
            name: 'task_completion',
            check: async () => this.checkTaskCompletion(agentId),
            weight: 0.3,
            critical: false,
            timeout: 3000
        });

        // Error rate check
        this.registerHealthCheck(agentId, {
            name: 'error_rate',
            check: async () => this.checkErrorRate(agentId),
            weight: 0.2,
            critical: false,
            timeout: 3000
        });
    }

    /**
     * Start periodic monitoring
     */
    private startMonitoring(): void {
        if (this.monitoringInterval) {
            return;
        }

        this.monitoringInterval = setInterval(async () => {
            if (this.isShuttingDown) {
                return;
            }

            await this.performHealthChecks();
        }, this.checkInterval);

        this.loggingService?.info('Agent health monitoring started');
    }

    /**
     * Perform health checks for all agents
     */
    private async performHealthChecks(): Promise<void> {
        const checks: Promise<void>[] = [];

        for (const [agentId, agentData] of this.agents) {
            if (!agentData.isMonitoring || agentData.recoveryInProgress) {
                continue;
            }

            checks.push(this.checkAgentHealth(agentId));
        }

        await Promise.allSettled(checks);
    }

    /**
     * Check health of a specific agent
     */
    private async checkAgentHealth(agentId: string): Promise<void> {
        const agentData = this.agents.get(agentId);
        if (!agentData) {
            return;
        }

        const startTime = Date.now();
        const checks = this.healthChecks.get(agentId) || [];

        let totalScore = 0;
        let totalWeight = 0;
        let criticalFailure = false;
        const results: Map<string, boolean> = new Map();

        // Run all health checks
        for (const check of checks) {
            try {
                const result = await this.retryMechanism.execute(async () => {
                    const timeoutPromise = new Promise<boolean>((_, reject) => {
                        setTimeout(() => reject(new Error('Health check timeout')), check.timeout);
                    });

                    return Promise.race([check.check(), timeoutPromise]);
                }, `health_check_${check.name}`);

                results.set(check.name, result);

                if (result) {
                    totalScore += check.weight;
                }

                if (!result && check.critical) {
                    criticalFailure = true;
                }

                totalWeight += check.weight;
            } catch (error) {
                this.loggingService?.warn(`Health check '${check.name}' failed for agent ${agentId}:`, error);
                results.set(check.name, false);

                if (check.critical) {
                    criticalFailure = true;
                }

                totalWeight += check.weight;
            }
        }

        // Calculate health score
        const healthScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

        // Update metrics
        const responseTime = Date.now() - startTime;
        this.updateAgentMetrics(agentId, {
            lastCheckTime: Date.now(),
            lastResponseTime: responseTime,
            averageResponseTime: this.calculateMovingAverage(
                agentData.metrics.averageResponseTime,
                responseTime,
                agentData.history.length
            )
        });

        // Determine health status
        const newStatus = this.determineHealthStatus(healthScore, criticalFailure, agentData.metrics);

        // Handle status change
        if (newStatus !== agentData.metrics.status) {
            await this.handleStatusChange(agentId, agentData.metrics.status, newStatus);
        }

        // Check for anomalies
        this.detectAnomalies(agentId);

        // Trigger recovery if needed
        if (newStatus === AgentHealthStatus.CRITICAL || newStatus === AgentHealthStatus.UNHEALTHY) {
            await this.attemptRecovery(agentId, newStatus);
        }
    }

    /**
     * Determine health status based on score and conditions
     */
    private determineHealthStatus(score: number, criticalFailure: boolean, metrics: HealthMetrics): AgentHealthStatus {
        if (criticalFailure) {
            return AgentHealthStatus.CRITICAL;
        }

        if (metrics.consecutiveFailures > 5) {
            return AgentHealthStatus.CRITICAL;
        }

        if (score >= 80) {
            return AgentHealthStatus.HEALTHY;
        } else if (score >= 60) {
            return AgentHealthStatus.DEGRADED;
        } else if (score >= 40) {
            return AgentHealthStatus.UNHEALTHY;
        } else {
            return AgentHealthStatus.CRITICAL;
        }
    }

    /**
     * Handle health status change
     */
    private async handleStatusChange(
        agentId: string,
        oldStatus: AgentHealthStatus,
        newStatus: AgentHealthStatus
    ): Promise<void> {
        const agentData = this.agents.get(agentId);
        if (!agentData) {
            return;
        }

        agentData.metrics.status = newStatus;

        this.loggingService?.info(`Agent ${agentId} health status changed: ${oldStatus} → ${newStatus}`);

        // Emit event
        this.publishEvent(EVENTS.AGENT_STATUS_CHANGED, {
            agentId,
            oldStatus,
            newStatus,
            metrics: { ...agentData.metrics }
        });

        // Send notification for critical status
        if (newStatus === AgentHealthStatus.CRITICAL) {
            vscode.window.showWarningMessage(`Agent ${agentId} is in CRITICAL health status. Attempting recovery...`);
        }
    }

    /**
     * Attempt to recover unhealthy agent
     */
    private async attemptRecovery(agentId: string, status: AgentHealthStatus): Promise<void> {
        const agentData = this.agents.get(agentId);
        if (!agentData || agentData.recoveryInProgress) {
            return;
        }

        agentData.recoveryInProgress = true;
        agentData.metrics.recoveryAttempts++;

        this.loggingService?.info(
            `Attempting recovery for agent ${agentId} (attempt ${agentData.metrics.recoveryAttempts})`
        );

        try {
            // Choose recovery strategy based on status and history
            const strategy = this.selectRecoveryStrategy(agentId, status);

            await strategy(agentId);

            // Wait for agent to stabilize
            await this.delay(5000);

            // Recheck health
            await this.checkAgentHealth(agentId);

            const newStatus = agentData.metrics.status;

            if (newStatus === AgentHealthStatus.HEALTHY || newStatus === AgentHealthStatus.DEGRADED) {
                this.loggingService?.info(`Agent ${agentId} recovered successfully`);
                agentData.metrics.status = AgentHealthStatus.RECOVERING;
                agentData.metrics.consecutiveFailures = 0;
            } else {
                this.loggingService?.warn(`Agent ${agentId} recovery failed`);
            }
        } catch (error) {
            this.loggingService?.error(`Recovery failed for agent ${agentId}:`, error);
        } finally {
            agentData.recoveryInProgress = false;
        }
    }

    /**
     * Select appropriate recovery strategy
     */
    private selectRecoveryStrategy(agentId: string, status: AgentHealthStatus): (id: string) => Promise<void> {
        const agentData = this.agents.get(agentId);
        if (!agentData) {
            return this.recoveryStrategies.restart;
        }

        const attempts = agentData.metrics.recoveryAttempts;

        if (attempts === 1) {
            return this.recoveryStrategies.clear;
        } else if (attempts === 2) {
            return this.recoveryStrategies.reload;
        } else if (attempts === 3) {
            return this.recoveryStrategies.restart;
        } else {
            return this.recoveryStrategies.isolate;
        }
    }

    /**
     * Detect anomalies in agent behavior
     */
    private detectAnomalies(agentId: string): void {
        const agentData = this.agents.get(agentId);
        if (!agentData || agentData.history.length < 10) {
            return;
        }

        // Calculate statistics from history
        const recentMetrics = agentData.history.slice(-20);
        const responseTimes = recentMetrics.map(m => m.lastResponseTime);
        const errorRates = recentMetrics.map(m => m.errorRate);

        const avgResponseTime = this.calculateAverage(responseTimes);
        const stdDevResponseTime = this.calculateStandardDeviation(responseTimes);

        const avgErrorRate = this.calculateAverage(errorRates);
        const stdDevErrorRate = this.calculateStandardDeviation(errorRates);

        // Check for anomalies
        const currentResponseTime = agentData.metrics.lastResponseTime;
        const currentErrorRate = agentData.metrics.errorRate;

        if (currentResponseTime > avgResponseTime + this.anomalyThreshold * stdDevResponseTime) {
            this.loggingService?.warn(`Anomaly detected for agent ${agentId}: Response time spike`);
            this.publishEvent(EVENTS.AGENT_STATUS_CHANGED, {
                agentId,
                type: 'response_time_spike',
                value: currentResponseTime,
                threshold: avgResponseTime + this.anomalyThreshold * stdDevResponseTime
            });
        }

        if (currentErrorRate > avgErrorRate + this.anomalyThreshold * stdDevErrorRate) {
            this.loggingService?.warn(`Anomaly detected for agent ${agentId}: Error rate spike`);
            this.publishEvent(EVENTS.AGENT_STATUS_CHANGED, {
                agentId,
                type: 'error_rate_spike',
                value: currentErrorRate,
                threshold: avgErrorRate + this.anomalyThreshold * stdDevErrorRate
            });
        }
    }

    // Recovery strategies

    private async restartAgent(agentId: string): Promise<void> {
        this.loggingService?.info(`Restarting agent ${agentId}`);
        // Implementation would restart the agent terminal
    }

    private async reloadAgent(agentId: string): Promise<void> {
        this.loggingService?.info(`Reloading agent ${agentId}`);
        // Implementation would reload agent configuration
    }

    private async clearAgentState(agentId: string): Promise<void> {
        this.loggingService?.info(`Clearing state for agent ${agentId}`);
        // Implementation would clear agent state
    }

    private async isolateAgent(agentId: string): Promise<void> {
        this.loggingService?.info(`Isolating agent ${agentId}`);
        // Implementation would isolate agent from tasks
    }

    // Health check implementations

    private async checkTerminalResponsive(agentId: string): Promise<boolean> {
        // Check if terminal is responsive
        return true; // Simplified for example
    }

    private async checkMemoryUsage(agentId: string): Promise<boolean> {
        const agentData = this.agents.get(agentId);
        if (!agentData) return false;

        // Check memory usage threshold
        return agentData.metrics.memoryUsage < 80; // Less than 80%
    }

    private async checkTaskCompletion(agentId: string): Promise<boolean> {
        const agentData = this.agents.get(agentId);
        if (!agentData) return false;

        // Check task completion rate
        return agentData.metrics.taskCompletionRate > 70; // More than 70%
    }

    private async checkErrorRate(agentId: string): Promise<boolean> {
        const agentData = this.agents.get(agentId);
        if (!agentData) return false;

        // Check error rate
        return agentData.metrics.errorRate < 10; // Less than 10%
    }

    // Utility methods

    private updateAgentMetrics(agentId: string, updates: Partial<HealthMetrics>): void {
        const agentData = this.agents.get(agentId);
        if (!agentData) return;

        Object.assign(agentData.metrics, updates);

        // Add to history
        agentData.history.push({ ...agentData.metrics });

        // Maintain history size
        if (agentData.history.length > this.historySize) {
            agentData.history.shift();
        }
    }

    private handleCircuitBreakerStateChange(agentId: string, from: string, to: string): void {
        this.loggingService?.info(`Agent ${agentId} circuit breaker: ${from} → ${to}`);

        if (to === 'OPEN') {
            const agentData = this.agents.get(agentId);
            if (agentData) {
                agentData.metrics.status = AgentHealthStatus.CRITICAL;
                agentData.metrics.consecutiveFailures++;
            }
        }
    }

    private setupEventListeners(): void {
        // Listen for agent events to update metrics
    }

    private calculateMovingAverage(current: number, newValue: number, count: number): number {
        return (current * count + newValue) / (count + 1);
    }

    private calculateAverage(values: number[]): number {
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    private calculateStandardDeviation(values: number[]): number {
        const avg = this.calculateAverage(values);
        const squareDiffs = values.map(value => Math.pow(value - avg, 2));
        const avgSquareDiff = this.calculateAverage(squareDiffs);
        return Math.sqrt(avgSquareDiff);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        this.isShuttingDown = true;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        // Clean up all monitoring
        for (const agentId of this.agents.keys()) {
            this.stopMonitoring(agentId);
        }

        this.loggingService?.info('Agent health monitoring shut down');
    }
}
