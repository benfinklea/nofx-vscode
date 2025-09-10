/**
 * Enterprise-Grade Health Check Service
 *
 * Comprehensive health monitoring with multiple check types,
 * aggregation, and automated alerting.
 */

import * as vscode from 'vscode';

export enum HealthStatus {
    HEALTHY = 'HEALTHY',
    DEGRADED = 'DEGRADED',
    UNHEALTHY = 'UNHEALTHY',
    UNKNOWN = 'UNKNOWN'
}

export enum CheckType {
    LIVENESS = 'LIVENESS', // Is the service alive?
    READINESS = 'READINESS', // Is the service ready to accept traffic?
    STARTUP = 'STARTUP' // Has the service started successfully?
}

export interface HealthCheck {
    name: string;
    type: CheckType;
    interval?: number; // Check interval in ms
    timeout?: number; // Check timeout in ms
    retries?: number; // Number of retries before marking unhealthy
    critical?: boolean; // Is this check critical?
    weight?: number; // Weight for aggregated health (0-1)
    check: () => Promise<HealthCheckResult>;
}

export interface HealthCheckResult {
    status: HealthStatus;
    message?: string;
    details?: Record<string, any>;
    timestamp?: number;
    duration?: number;
}

export interface AggregatedHealth {
    overall: HealthStatus;
    checks: Map<string, HealthCheckResult>;
    timestamp: number;
    uptime: number;
    lastHealthyTime?: number;
    consecutiveFailures: number;
}

interface CheckState {
    check: HealthCheck;
    lastResult?: HealthCheckResult;
    lastCheckTime: number;
    consecutiveFailures: number;
    intervalId?: NodeJS.Timeout;
}

/**
 * Comprehensive health monitoring service
 */
export class HealthCheckService {
    private checks: Map<string, CheckState> = new Map();
    private isRunning = false;
    private startTime: number = Date.now();
    private lastHealthyTime?: number;
    private aggregatedHealth: AggregatedHealth;
    private healthChangeListeners: Array<(health: AggregatedHealth) => void> = [];
    private criticalFailureHandler?: (check: string, result: HealthCheckResult) => void;

    constructor(
        private readonly config: {
            defaultInterval?: number;
            defaultTimeout?: number;
            defaultRetries?: number;
            aggregationStrategy?: 'worst' | 'weighted' | 'majority';
            enableAutoRecovery?: boolean;
            alertOnCriticalFailure?: boolean;
        } = {}
    ) {
        // Apply defaults
        this.config = {
            defaultInterval: config.defaultInterval ?? 30000, // 30 seconds
            defaultTimeout: config.defaultTimeout ?? 5000, // 5 seconds
            defaultRetries: config.defaultRetries ?? 3,
            aggregationStrategy: config.aggregationStrategy ?? 'worst',
            enableAutoRecovery: config.enableAutoRecovery ?? true,
            alertOnCriticalFailure: config.alertOnCriticalFailure ?? true
        };

        // Initialize aggregated health
        this.aggregatedHealth = {
            overall: HealthStatus.UNKNOWN,
            checks: new Map(),
            timestamp: Date.now(),
            uptime: 0,
            consecutiveFailures: 0
        };

        // Register default health checks
        this.registerDefaultChecks();
    }

    /**
     * Register a health check
     */
    registerCheck(check: HealthCheck): void {
        // Validate check
        if (!check.name || typeof check.check !== 'function') {
            throw new Error('Invalid health check configuration');
        }

        // Apply defaults
        const configuredCheck: HealthCheck = {
            ...check,
            interval: check.interval ?? this.config.defaultInterval,
            timeout: check.timeout ?? this.config.defaultTimeout,
            retries: check.retries ?? this.config.defaultRetries,
            critical: check.critical ?? false,
            weight: check.weight ?? 1
        };

        // Create check state
        const state: CheckState = {
            check: configuredCheck,
            lastCheckTime: 0,
            consecutiveFailures: 0
        };

        this.checks.set(check.name, state);

        console.info(`[HealthCheck] Registered check: ${check.name} (type: ${check.type})`);

        // Start check if service is running
        if (this.isRunning) {
            this.startCheck(state);
        }
    }

    /**
     * Unregister a health check
     */
    unregisterCheck(name: string): void {
        const state = this.checks.get(name);
        if (state) {
            if (state.intervalId) {
                clearInterval(state.intervalId);
            }
            this.checks.delete(name);
            this.aggregatedHealth.checks.delete(name);

            console.info(`[HealthCheck] Unregistered check: ${name}`);
        }
    }

    /**
     * Start health monitoring
     */
    start(): void {
        if (this.isRunning) {
            console.warn('[HealthCheck] Service already running');
            return;
        }

        this.isRunning = true;
        this.startTime = Date.now();

        console.info('[HealthCheck] Starting health monitoring');

        // Start all checks
        for (const state of this.checks.values()) {
            this.startCheck(state);
        }

        // Perform initial check
        this.performAllChecks();
    }

    /**
     * Stop health monitoring
     */
    stop(): void {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        console.info('[HealthCheck] Stopping health monitoring');

        // Stop all checks
        for (const state of this.checks.values()) {
            if (state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = undefined;
            }
        }
    }

    /**
     * Start individual check
     */
    private startCheck(state: CheckState): void {
        // Clear existing interval
        if (state.intervalId) {
            clearInterval(state.intervalId);
        }

        // Set up interval
        state.intervalId = setInterval(async () => {
            await this.performCheck(state);
        }, state.check.interval!);

        // Perform initial check
        this.performCheck(state);
    }

    /**
     * Perform individual health check
     */
    private async performCheck(state: CheckState): Promise<void> {
        const startTime = Date.now();

        try {
            // Execute check with timeout
            const result = await this.executeWithTimeout(state.check.check(), state.check.timeout!);

            // Add metadata
            result.timestamp = Date.now();
            result.duration = Date.now() - startTime;

            // Handle successful check
            this.handleCheckResult(state, result);
        } catch (error) {
            // Handle check failure
            const result: HealthCheckResult = {
                status: HealthStatus.UNHEALTHY,
                message: `Check failed: ${error}`,
                timestamp: Date.now(),
                duration: Date.now() - startTime
            };

            this.handleCheckResult(state, result);
        }
    }

    /**
     * Handle check result
     */
    private handleCheckResult(state: CheckState, result: HealthCheckResult): void {
        const previousStatus = state.lastResult?.status;

        // Update state
        state.lastResult = result;
        state.lastCheckTime = Date.now();

        // Update consecutive failures
        if (result.status === HealthStatus.UNHEALTHY) {
            state.consecutiveFailures++;

            // Check if retries exceeded
            if (state.consecutiveFailures > state.check.retries!) {
                // Mark as critically failed
                if (state.check.critical && this.config.alertOnCriticalFailure) {
                    this.handleCriticalFailure(state.check.name, result);
                }
            }
        } else {
            state.consecutiveFailures = 0;

            // Update last healthy time
            if (result.status === HealthStatus.HEALTHY) {
                this.lastHealthyTime = Date.now();
            }
        }

        // Update aggregated health
        this.aggregatedHealth.checks.set(state.check.name, result);
        this.updateAggregatedHealth();

        // Log status change
        if (previousStatus !== result.status) {
            console.info(`[HealthCheck] ${state.check.name}: ${previousStatus || 'UNKNOWN'} → ${result.status}`);
        }
    }

    /**
     * Update aggregated health status
     */
    private updateAggregatedHealth(): void {
        const previousOverall = this.aggregatedHealth.overall;

        // Calculate overall status based on strategy
        switch (this.config.aggregationStrategy) {
            case 'worst':
                this.aggregatedHealth.overall = this.calculateWorstCaseHealth();
                break;

            case 'weighted':
                this.aggregatedHealth.overall = this.calculateWeightedHealth();
                break;

            case 'majority':
                this.aggregatedHealth.overall = this.calculateMajorityHealth();
                break;

            default:
                this.aggregatedHealth.overall = this.calculateWorstCaseHealth();
        }

        // Update metadata
        this.aggregatedHealth.timestamp = Date.now();
        this.aggregatedHealth.uptime = Date.now() - this.startTime;
        this.aggregatedHealth.lastHealthyTime = this.lastHealthyTime;

        // Update consecutive failures
        if (this.aggregatedHealth.overall === HealthStatus.UNHEALTHY) {
            this.aggregatedHealth.consecutiveFailures++;
        } else {
            this.aggregatedHealth.consecutiveFailures = 0;
        }

        // Notify listeners if status changed
        if (previousOverall !== this.aggregatedHealth.overall) {
            console.info(`[HealthCheck] Overall health: ${previousOverall} → ${this.aggregatedHealth.overall}`);

            this.notifyHealthChange();

            // Attempt auto-recovery if degraded/unhealthy
            if (this.config.enableAutoRecovery && this.aggregatedHealth.overall !== HealthStatus.HEALTHY) {
                this.attemptAutoRecovery();
            }
        }
    }

    /**
     * Calculate worst-case health
     */
    private calculateWorstCaseHealth(): HealthStatus {
        let worst = HealthStatus.HEALTHY;

        for (const result of this.aggregatedHealth.checks.values()) {
            if (result.status === HealthStatus.UNHEALTHY) {
                return HealthStatus.UNHEALTHY;
            }
            if (result.status === HealthStatus.DEGRADED) {
                worst = HealthStatus.DEGRADED;
            }
            if (result.status === HealthStatus.UNKNOWN && worst === HealthStatus.HEALTHY) {
                worst = HealthStatus.UNKNOWN;
            }
        }

        return worst;
    }

    /**
     * Calculate weighted health
     */
    private calculateWeightedHealth(): HealthStatus {
        let totalWeight = 0;
        let healthScore = 0;

        for (const [name, result] of this.aggregatedHealth.checks.entries()) {
            const state = this.checks.get(name);
            if (!state) continue;

            const weight = state.check.weight || 1;
            totalWeight += weight;

            switch (result.status) {
                case HealthStatus.HEALTHY:
                    healthScore += weight * 1;
                    break;
                case HealthStatus.DEGRADED:
                    healthScore += weight * 0.5;
                    break;
                case HealthStatus.UNHEALTHY:
                    healthScore += weight * 0;
                    break;
                case HealthStatus.UNKNOWN:
                    healthScore += weight * 0.25;
                    break;
            }
        }

        if (totalWeight === 0) {
            return HealthStatus.UNKNOWN;
        }

        const score = healthScore / totalWeight;

        if (score >= 0.8) return HealthStatus.HEALTHY;
        if (score >= 0.5) return HealthStatus.DEGRADED;
        return HealthStatus.UNHEALTHY;
    }

    /**
     * Calculate majority health
     */
    private calculateMajorityHealth(): HealthStatus {
        const counts = {
            [HealthStatus.HEALTHY]: 0,
            [HealthStatus.DEGRADED]: 0,
            [HealthStatus.UNHEALTHY]: 0,
            [HealthStatus.UNKNOWN]: 0
        };

        for (const result of this.aggregatedHealth.checks.values()) {
            counts[result.status]++;
        }

        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total === 0) {
            return HealthStatus.UNKNOWN;
        }

        // Check for majority
        if (counts[HealthStatus.HEALTHY] > total / 2) {
            return HealthStatus.HEALTHY;
        }
        if (counts[HealthStatus.UNHEALTHY] > total / 2) {
            return HealthStatus.UNHEALTHY;
        }

        // No clear majority, check for degraded
        if (counts[HealthStatus.DEGRADED] > 0) {
            return HealthStatus.DEGRADED;
        }

        // Default to worst case
        if (counts[HealthStatus.UNHEALTHY] > 0) {
            return HealthStatus.UNHEALTHY;
        }
        if (counts[HealthStatus.UNKNOWN] > 0) {
            return HealthStatus.UNKNOWN;
        }

        return HealthStatus.HEALTHY;
    }

    /**
     * Handle critical failure
     */
    private handleCriticalFailure(checkName: string, result: HealthCheckResult): void {
        console.error(`[HealthCheck] CRITICAL FAILURE: ${checkName}`, result);

        // Show VS Code notification
        vscode.window
            .showErrorMessage(`⚠️ Critical health check failed: ${checkName}`, 'View Details', 'Ignore')
            .then(selection => {
                if (selection === 'View Details') {
                    const output = vscode.window.createOutputChannel('Health Check');
                    output.appendLine(`Critical Failure: ${checkName}`);
                    output.appendLine(`Status: ${result.status}`);
                    output.appendLine(`Message: ${result.message || 'No message'}`);
                    output.appendLine(`Details: ${JSON.stringify(result.details || {}, null, 2)}`);
                    output.show();
                }
            });

        // Call custom handler if registered
        if (this.criticalFailureHandler) {
            this.criticalFailureHandler(checkName, result);
        }
    }

    /**
     * Attempt automatic recovery
     */
    private async attemptAutoRecovery(): Promise<void> {
        console.info('[HealthCheck] Attempting auto-recovery...');

        // Find unhealthy checks
        const unhealthyChecks: string[] = [];
        for (const [name, result] of this.aggregatedHealth.checks.entries()) {
            if (result.status === HealthStatus.UNHEALTHY) {
                unhealthyChecks.push(name);
            }
        }

        // Attempt recovery for each unhealthy check
        for (const name of unhealthyChecks) {
            const state = this.checks.get(name);
            if (!state) continue;

            // Perform immediate re-check
            await this.performCheck(state);

            // If still unhealthy after retries, try recovery actions
            if (state.lastResult?.status === HealthStatus.UNHEALTHY) {
                console.warn(`[HealthCheck] ${name} still unhealthy after recovery attempt`);
            }
        }
    }

    /**
     * Register default health checks
     */
    private registerDefaultChecks(): void {
        // Memory check
        this.registerCheck({
            name: 'memory',
            type: CheckType.LIVENESS,
            interval: 60000, // 1 minute
            check: async () => {
                const usage = process.memoryUsage();
                const heapUsedMB = usage.heapUsed / 1024 / 1024;
                const heapTotalMB = usage.heapTotal / 1024 / 1024;
                const percentage = (heapUsedMB / heapTotalMB) * 100;

                let status = HealthStatus.HEALTHY;
                if (percentage > 90) {
                    status = HealthStatus.UNHEALTHY;
                } else if (percentage > 75) {
                    status = HealthStatus.DEGRADED;
                }

                return {
                    status,
                    message: `Heap usage: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB (${percentage.toFixed(1)}%)`,
                    details: {
                        heapUsed: usage.heapUsed,
                        heapTotal: usage.heapTotal,
                        external: usage.external,
                        percentage
                    }
                };
            }
        });

        // Extension context check
        this.registerCheck({
            name: 'extension-context',
            type: CheckType.READINESS,
            interval: 30000, // 30 seconds
            critical: true,
            check: async () => {
                // Check if VS Code extension context is available
                const contextAvailable = vscode.workspace.workspaceFolders !== undefined;

                return {
                    status: contextAvailable ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
                    message: contextAvailable ? 'Extension context available' : 'Extension context not available'
                };
            }
        });
    }

    /**
     * Perform all checks immediately
     */
    async performAllChecks(): Promise<void> {
        const promises = Array.from(this.checks.values()).map(state => this.performCheck(state));

        await Promise.allSettled(promises);
    }

    /**
     * Get current health status
     */
    getHealth(): AggregatedHealth {
        return { ...this.aggregatedHealth };
    }

    /**
     * Get specific check result
     */
    getCheckResult(name: string): HealthCheckResult | undefined {
        return this.aggregatedHealth.checks.get(name);
    }

    /**
     * Subscribe to health changes
     */
    onHealthChange(listener: (health: AggregatedHealth) => void): vscode.Disposable {
        this.healthChangeListeners.push(listener);

        return new vscode.Disposable(() => {
            const index = this.healthChangeListeners.indexOf(listener);
            if (index !== -1) {
                this.healthChangeListeners.splice(index, 1);
            }
        });
    }

    /**
     * Set critical failure handler
     */
    setCriticalFailureHandler(handler: (check: string, result: HealthCheckResult) => void): void {
        this.criticalFailureHandler = handler;
    }

    /**
     * Notify health change listeners
     */
    private notifyHealthChange(): void {
        const health = this.getHealth();
        for (const listener of this.healthChangeListeners) {
            try {
                listener(health);
            } catch (error) {
                console.error('[HealthCheck] Listener error:', error);
            }
        }
    }

    /**
     * Execute with timeout
     */
    private executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Health check timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            promise.then(
                result => {
                    clearTimeout(timeoutId);
                    resolve(result);
                },
                error => {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            );
        });
    }

    /**
     * Export health report
     */
    exportHealthReport(): string {
        const report = {
            timestamp: new Date().toISOString(),
            overall: this.aggregatedHealth.overall,
            uptime: this.aggregatedHealth.uptime,
            checks: Array.from(this.aggregatedHealth.checks.entries()).map(([name, result]) => ({
                name,
                status: result.status,
                message: result.message,
                duration: result.duration,
                timestamp: result.timestamp
            }))
        };

        return JSON.stringify(report, null, 2);
    }
}
