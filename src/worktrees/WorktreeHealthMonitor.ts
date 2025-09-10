import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import { ILogger, INotificationService } from '../services/interfaces';

/**
 * Health status of a worktree
 */
export interface WorktreeHealth {
    agentId: string;
    path: string;
    status: 'healthy' | 'degraded' | 'critical' | 'dead';
    lastCheck: Date;
    issues: HealthIssue[];
    metrics: HealthMetrics;
    recoveryAttempts: number;
    autoRecoveryEnabled: boolean;
}

/**
 * Specific health issue detected
 */
export interface HealthIssue {
    type: 'missing' | 'corrupt' | 'locked' | 'orphaned' | 'stale' | 'permission' | 'disk-space';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    autoRecoverable: boolean;
    timestamp: Date;
}

/**
 * Health metrics for a worktree
 */
export interface HealthMetrics {
    diskUsageMB: number;
    fileCount: number;
    modifiedFiles: number;
    uncommittedChanges: number;
    lastActivity: Date;
    gitStatus: 'clean' | 'dirty' | 'conflicted' | 'unknown';
    responseTimeMs: number;
}

/**
 * Recovery action to take
 */
export interface RecoveryAction {
    type: 'reset' | 'clean' | 'recreate' | 'unlock' | 'prune' | 'repair';
    agentId: string;
    reason: string;
    priority: number;
}

/**
 * Advanced health monitoring with intelligent auto-recovery
 */
export class WorktreeHealthMonitor extends EventEmitter {
    private healthStates = new Map<string, WorktreeHealth>();
    private monitoringInterval: NodeJS.Timeout | undefined;
    private recoveryQueue: RecoveryAction[] = [];
    private isRecovering = false;

    // Configuration
    private readonly config = {
        checkIntervalMs: 30000, // 30 seconds
        staleThresholdMs: 3600000, // 1 hour
        maxRecoveryAttempts: 3,
        autoRecoveryEnabled: true,
        criticalDiskUsageMB: 1000,
        warningDiskUsageMB: 500,
        maxUncommittedChanges: 100,
        healthCheckTimeoutMs: 5000
    };

    // Metrics
    private totalChecks = 0;
    private totalRecoveries = 0;
    private successfulRecoveries = 0;
    private failedRecoveries = 0;

    constructor(
        private workspacePath: string,
        private loggingService?: ILogger,
        private notificationService?: INotificationService
    ) {
        super();
        this.startMonitoring();
    }

    /**
     * Start health monitoring
     */
    private startMonitoring(): void {
        this.monitoringInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, this.config.checkIntervalMs);

        // Perform initial check
        this.performHealthCheck();
    }

    /**
     * Register a worktree for monitoring
     */
    registerWorktree(agentId: string, worktreePath: string): void {
        this.healthStates.set(agentId, {
            agentId,
            path: worktreePath,
            status: 'healthy',
            lastCheck: new Date(),
            issues: [],
            metrics: this.createEmptyMetrics(),
            recoveryAttempts: 0,
            autoRecoveryEnabled: this.config.autoRecoveryEnabled
        });

        this.loggingService?.debug(`Registered worktree for monitoring: ${agentId}`);
        this.emit('worktree:registered', { agentId, path: worktreePath });
    }

    /**
     * Unregister a worktree from monitoring
     */
    unregisterWorktree(agentId: string): void {
        this.healthStates.delete(agentId);
        this.loggingService?.debug(`Unregistered worktree from monitoring: ${agentId}`);
        this.emit('worktree:unregistered', { agentId });
    }

    /**
     * Perform comprehensive health check on all worktrees
     */
    async performHealthCheck(): Promise<void> {
        this.totalChecks++;
        const startTime = Date.now();

        const checks: Promise<void>[] = [];

        for (const [agentId, health] of this.healthStates.entries()) {
            checks.push(this.checkWorktreeHealth(agentId, health));
        }

        await Promise.all(checks);

        // Process recovery queue
        await this.processRecoveryQueue();

        const duration = Date.now() - startTime;
        this.emit('health:check:complete', {
            duration,
            worktrees: this.healthStates.size,
            healthy: Array.from(this.healthStates.values()).filter(h => h.status === 'healthy').length
        });

        // Alert if too many unhealthy worktrees
        this.checkOverallHealth();
    }

    /**
     * Check individual worktree health
     */
    private async checkWorktreeHealth(agentId: string, health: WorktreeHealth): Promise<void> {
        const issues: HealthIssue[] = [];
        const metrics = this.createEmptyMetrics();
        const checkStart = Date.now();

        try {
            // 1. Check if path exists
            const exists = await this.checkPathExists(health.path);
            if (!exists) {
                issues.push({
                    type: 'missing',
                    severity: 'critical',
                    description: 'Worktree path does not exist',
                    autoRecoverable: true,
                    timestamp: new Date()
                });
            } else {
                // 2. Check disk usage
                const diskUsage = await this.checkDiskUsage(health.path);
                metrics.diskUsageMB = diskUsage;

                if (diskUsage > this.config.criticalDiskUsageMB) {
                    issues.push({
                        type: 'disk-space',
                        severity: 'critical',
                        description: `Disk usage critical: ${diskUsage}MB`,
                        autoRecoverable: true,
                        timestamp: new Date()
                    });
                } else if (diskUsage > this.config.warningDiskUsageMB) {
                    issues.push({
                        type: 'disk-space',
                        severity: 'medium',
                        description: `Disk usage warning: ${diskUsage}MB`,
                        autoRecoverable: true,
                        timestamp: new Date()
                    });
                }

                // 3. Check Git status
                const gitStatus = await this.checkGitStatus(health.path);
                metrics.gitStatus = gitStatus.status;
                metrics.modifiedFiles = gitStatus.modifiedFiles;
                metrics.uncommittedChanges = gitStatus.uncommittedChanges;

                if (gitStatus.status === 'conflicted') {
                    issues.push({
                        type: 'corrupt',
                        severity: 'high',
                        description: 'Git repository has conflicts',
                        autoRecoverable: true,
                        timestamp: new Date()
                    });
                }

                if (gitStatus.uncommittedChanges > this.config.maxUncommittedChanges) {
                    issues.push({
                        type: 'stale',
                        severity: 'medium',
                        description: `Too many uncommitted changes: ${gitStatus.uncommittedChanges}`,
                        autoRecoverable: true,
                        timestamp: new Date()
                    });
                }

                // 4. Check for locks
                const isLocked = await this.checkForLocks(health.path);
                if (isLocked) {
                    issues.push({
                        type: 'locked',
                        severity: 'high',
                        description: 'Worktree is locked',
                        autoRecoverable: true,
                        timestamp: new Date()
                    });
                }

                // 5. Check staleness
                const lastActivity = await this.getLastActivity(health.path);
                metrics.lastActivity = lastActivity;

                if (Date.now() - lastActivity.getTime() > this.config.staleThresholdMs) {
                    issues.push({
                        type: 'stale',
                        severity: 'low',
                        description: 'Worktree has been inactive',
                        autoRecoverable: false,
                        timestamp: new Date()
                    });
                }

                // 6. Check permissions
                const hasPermissions = await this.checkPermissions(health.path);
                if (!hasPermissions) {
                    issues.push({
                        type: 'permission',
                        severity: 'critical',
                        description: 'Permission issues detected',
                        autoRecoverable: false,
                        timestamp: new Date()
                    });
                }
            }

            metrics.responseTimeMs = Date.now() - checkStart;

            // Update health state
            health.issues = issues;
            health.metrics = metrics;
            health.lastCheck = new Date();
            health.status = this.calculateHealthStatus(issues);

            // Queue recovery if needed
            if (health.autoRecoveryEnabled && health.status !== 'healthy') {
                this.queueRecovery(agentId, health);
            }

            // Emit health update
            this.emit('health:update', health);
        } catch (error) {
            this.loggingService?.error(`Health check failed for ${agentId}:`, error);
            health.status = 'critical';
            health.issues.push({
                type: 'corrupt',
                severity: 'critical',
                description: `Health check error: ${error}`,
                autoRecoverable: false,
                timestamp: new Date()
            });
        }
    }

    /**
     * Calculate overall health status from issues
     */
    private calculateHealthStatus(issues: HealthIssue[]): WorktreeHealth['status'] {
        if (issues.length === 0) return 'healthy';

        const hasCritical = issues.some(i => i.severity === 'critical');
        const hasHigh = issues.some(i => i.severity === 'high');
        const hasMedium = issues.some(i => i.severity === 'medium');

        if (hasCritical) return 'critical';
        if (hasHigh) return 'degraded';
        if (hasMedium) return 'degraded';

        return 'healthy';
    }

    /**
     * Queue recovery action
     */
    private queueRecovery(agentId: string, health: WorktreeHealth): void {
        if (health.recoveryAttempts >= this.config.maxRecoveryAttempts) {
            this.loggingService?.warn(`Max recovery attempts reached for ${agentId}`);
            health.status = 'dead';
            return;
        }

        // Determine recovery action based on issues
        const criticalIssue = health.issues.find(i => i.severity === 'critical' && i.autoRecoverable);

        if (criticalIssue) {
            let action: RecoveryAction['type'] = 'repair';

            switch (criticalIssue.type) {
                case 'missing':
                    action = 'recreate';
                    break;
                case 'corrupt':
                    action = 'reset';
                    break;
                case 'locked':
                    action = 'unlock';
                    break;
                case 'disk-space':
                    action = 'clean';
                    break;
                case 'orphaned':
                    action = 'prune';
                    break;
            }

            this.recoveryQueue.push({
                type: action,
                agentId,
                reason: criticalIssue.description,
                priority: this.getRecoveryPriority(criticalIssue)
            });

            // Sort by priority
            this.recoveryQueue.sort((a, b) => b.priority - a.priority);
        }
    }

    /**
     * Process recovery queue
     */
    private async processRecoveryQueue(): Promise<void> {
        if (this.isRecovering || this.recoveryQueue.length === 0) {
            return;
        }

        this.isRecovering = true;

        try {
            while (this.recoveryQueue.length > 0) {
                const action = this.recoveryQueue.shift()!;
                await this.performRecovery(action);
            }
        } finally {
            this.isRecovering = false;
        }
    }

    /**
     * Perform recovery action
     */
    private async performRecovery(action: RecoveryAction): Promise<void> {
        this.totalRecoveries++;
        const health = this.healthStates.get(action.agentId);

        if (!health) return;

        health.recoveryAttempts++;

        this.loggingService?.info(`Performing ${action.type} recovery for ${action.agentId}: ${action.reason}`);
        this.emit('recovery:start', action);

        try {
            switch (action.type) {
                case 'reset':
                    await this.recoverReset(health);
                    break;
                case 'clean':
                    await this.recoverClean(health);
                    break;
                case 'recreate':
                    await this.recoverRecreate(health);
                    break;
                case 'unlock':
                    await this.recoverUnlock(health);
                    break;
                case 'prune':
                    await this.recoverPrune(health);
                    break;
                case 'repair':
                    await this.recoverRepair(health);
                    break;
            }

            this.successfulRecoveries++;
            health.recoveryAttempts = 0; // Reset on success
            this.emit('recovery:success', action);
        } catch (error) {
            this.failedRecoveries++;
            this.loggingService?.error(`Recovery failed for ${action.agentId}:`, error);
            this.emit('recovery:failed', { action, error });

            // Notify user if critical
            if (health.status === 'critical') {
                this.notificationService?.showError(
                    `Failed to recover worktree for agent ${action.agentId}. Manual intervention may be required.`
                );
            }
        }
    }

    /**
     * Recovery: Reset worktree to clean state
     */
    private async recoverReset(health: WorktreeHealth): Promise<void> {
        execSync('git reset --hard HEAD', { cwd: health.path });
        execSync('git clean -fd', { cwd: health.path });
    }

    /**
     * Recovery: Clean up disk space
     */
    private async recoverClean(health: WorktreeHealth): Promise<void> {
        // Clean Git objects
        execSync('git gc --aggressive --prune=now', { cwd: health.path });

        // Remove node_modules if present
        const nodeModulesPath = path.join(health.path, 'node_modules');
        try {
            await fs.rm(nodeModulesPath, { recursive: true, force: true });
        } catch {
            // Ignore if not present
        }

        // Clean build artifacts
        const commonBuildDirs = ['dist', 'build', 'out', '.next', 'coverage'];
        for (const dir of commonBuildDirs) {
            try {
                await fs.rm(path.join(health.path, dir), { recursive: true, force: true });
            } catch {
                // Ignore if not present
            }
        }
    }

    /**
     * Recovery: Recreate missing worktree
     */
    private async recoverRecreate(health: WorktreeHealth): Promise<void> {
        // Remove any remnants
        try {
            execSync(`git worktree remove "${health.path}" --force`, { cwd: this.workspacePath });
        } catch {
            // Ignore if doesn't exist
        }

        // Recreate worktree
        const branchName = `recovery-${health.agentId}-${Date.now()}`;
        execSync(`git worktree add -b ${branchName} "${health.path}"`, { cwd: this.workspacePath });
    }

    /**
     * Recovery: Unlock worktree
     */
    private async recoverUnlock(health: WorktreeHealth): Promise<void> {
        // Remove lock files
        const lockFiles = ['.git/index.lock', '.git/HEAD.lock'];
        for (const lockFile of lockFiles) {
            try {
                await fs.unlink(path.join(health.path, lockFile));
            } catch {
                // Ignore if not present
            }
        }
    }

    /**
     * Recovery: Prune worktree
     */
    private async recoverPrune(health: WorktreeHealth): Promise<void> {
        execSync('git worktree prune', { cwd: this.workspacePath });
    }

    /**
     * Recovery: General repair
     */
    private async recoverRepair(health: WorktreeHealth): Promise<void> {
        // Try multiple repair strategies
        try {
            execSync('git fsck --full', { cwd: health.path });
        } catch {
            // Try to repair
            execSync('git config core.fileMode false', { cwd: health.path });
            execSync('git update-index --refresh', { cwd: health.path });
        }
    }

    /**
     * Check if path exists
     */
    private async checkPathExists(path: string): Promise<boolean> {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check disk usage
     */
    private async checkDiskUsage(worktreePath: string): Promise<number> {
        try {
            const output = execSync(`du -sm "${worktreePath}"`, { encoding: 'utf-8' });
            return parseInt(output.split('\t')[0]);
        } catch {
            return 0;
        }
    }

    /**
     * Check Git status
     */
    private async checkGitStatus(worktreePath: string): Promise<{
        status: 'clean' | 'dirty' | 'conflicted' | 'unknown';
        modifiedFiles: number;
        uncommittedChanges: number;
    }> {
        try {
            const output = execSync('git status --porcelain', {
                cwd: worktreePath,
                encoding: 'utf-8',
                timeout: this.config.healthCheckTimeoutMs
            });

            const lines = output.split('\n').filter(l => l.trim());
            const hasConflicts = lines.some(l => l.startsWith('UU'));

            return {
                status: hasConflicts ? 'conflicted' : lines.length > 0 ? 'dirty' : 'clean',
                modifiedFiles: lines.filter(l => l.startsWith(' M')).length,
                uncommittedChanges: lines.length
            };
        } catch {
            return { status: 'unknown', modifiedFiles: 0, uncommittedChanges: 0 };
        }
    }

    /**
     * Check for lock files
     */
    private async checkForLocks(worktreePath: string): Promise<boolean> {
        const lockFiles = [path.join(worktreePath, '.git', 'index.lock'), path.join(worktreePath, '.git', 'HEAD.lock')];

        for (const lockFile of lockFiles) {
            try {
                await fs.access(lockFile);
                return true;
            } catch {
                // Lock file doesn't exist
            }
        }

        return false;
    }

    /**
     * Get last activity time
     */
    private async getLastActivity(worktreePath: string): Promise<Date> {
        try {
            const stats = await fs.stat(worktreePath);
            return stats.mtime;
        } catch {
            return new Date(0);
        }
    }

    /**
     * Check permissions
     */
    private async checkPermissions(worktreePath: string): Promise<boolean> {
        try {
            await fs.access(worktreePath, fs.constants.R_OK | fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get recovery priority
     */
    private getRecoveryPriority(issue: HealthIssue): number {
        const severityScore = {
            critical: 1000,
            high: 100,
            medium: 10,
            low: 1
        };

        const typeScore = {
            missing: 500,
            corrupt: 400,
            locked: 300,
            orphaned: 200,
            stale: 100,
            permission: 600,
            'disk-space': 250
        };

        return severityScore[issue.severity] + typeScore[issue.type];
    }

    /**
     * Check overall system health
     */
    private checkOverallHealth(): void {
        const healths = Array.from(this.healthStates.values());
        const unhealthy = healths.filter(h => h.status !== 'healthy');

        if (unhealthy.length > healths.length * 0.5) {
            this.notificationService?.showWarning(
                `${unhealthy.length} of ${healths.length} worktrees are unhealthy. Running recovery...`
            );
        }
    }

    /**
     * Create empty metrics object
     */
    private createEmptyMetrics(): HealthMetrics {
        return {
            diskUsageMB: 0,
            fileCount: 0,
            modifiedFiles: 0,
            uncommittedChanges: 0,
            lastActivity: new Date(),
            gitStatus: 'unknown',
            responseTimeMs: 0
        };
    }

    /**
     * Get health report
     */
    getHealthReport(): {
        summary: {
            total: number;
            healthy: number;
            degraded: number;
            critical: number;
            dead: number;
        };
        details: WorktreeHealth[];
        metrics: {
            totalChecks: number;
            totalRecoveries: number;
            successfulRecoveries: number;
            failedRecoveries: number;
            successRate: number;
        };
    } {
        const healths = Array.from(this.healthStates.values());

        return {
            summary: {
                total: healths.length,
                healthy: healths.filter(h => h.status === 'healthy').length,
                degraded: healths.filter(h => h.status === 'degraded').length,
                critical: healths.filter(h => h.status === 'critical').length,
                dead: healths.filter(h => h.status === 'dead').length
            },
            details: healths,
            metrics: {
                totalChecks: this.totalChecks,
                totalRecoveries: this.totalRecoveries,
                successfulRecoveries: this.successfulRecoveries,
                failedRecoveries: this.failedRecoveries,
                successRate: this.totalRecoveries > 0 ? this.successfulRecoveries / this.totalRecoveries : 1
            }
        };
    }

    /**
     * Force immediate health check
     */
    async forceHealthCheck(agentId?: string): Promise<void> {
        if (agentId) {
            const health = this.healthStates.get(agentId);
            if (health) {
                await this.checkWorktreeHealth(agentId, health);
            }
        } else {
            await this.performHealthCheck();
        }
    }

    /**
     * Enable/disable auto-recovery
     */
    setAutoRecovery(enabled: boolean, agentId?: string): void {
        if (agentId) {
            const health = this.healthStates.get(agentId);
            if (health) {
                health.autoRecoveryEnabled = enabled;
            }
        } else {
            this.config.autoRecoveryEnabled = enabled;
            for (const health of this.healthStates.values()) {
                health.autoRecoveryEnabled = enabled;
            }
        }
    }

    /**
     * Dispose of monitor
     */
    dispose(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        this.removeAllListeners();
    }
}
