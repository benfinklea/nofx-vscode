import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { WorktreeManager } from '../worktrees/WorktreeManager';
import { AgentManager } from '../agents/AgentManager';
import { ILoggingService, INotificationService } from './interfaces';

export interface CleanupOptions {
    removeOrphanedWorktrees?: boolean;
    removeUnusedBranches?: boolean;
    removeOldBackups?: boolean;
    dryRun?: boolean;
    maxAge?: number; // in days
}

export interface CleanupResult {
    worktreesRemoved: number;
    branchesRemoved: number;
    backupsRemoved: number;
    spaceSaved: string;
    errors: string[];
}

export class WorktreeCleanupService {
    constructor(
        private worktreeManager: WorktreeManager,
        private agentManager: AgentManager,
        private loggingService?: ILoggingService,
        private notificationService?: INotificationService
    ) {}

    /**
     * Comprehensive cleanup with detailed reporting
     */
    async performCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
        const result: CleanupResult = {
            worktreesRemoved: 0,
            branchesRemoved: 0,
            backupsRemoved: 0,
            spaceSaved: '0 KB',
            errors: []
        };

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            result.errors.push('No workspace folder available');
            return result;
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        let totalSpaceSaved = 0;

        try {
            // Step 1: Clean up orphaned worktrees
            if (options.removeOrphanedWorktrees !== false) {
                this.loggingService?.info('Cleaning up orphaned worktrees...');
                const { removed, spaceSaved, errors } = await this.cleanupOrphanedWorktrees(
                    workspacePath,
                    options.dryRun
                );
                result.worktreesRemoved += removed;
                totalSpaceSaved += spaceSaved;
                result.errors.push(...errors);
            }

            // Step 2: Clean up unused branches
            if (options.removeUnusedBranches) {
                this.loggingService?.info('Cleaning up unused agent branches...');
                const { removed, errors } = await this.cleanupUnusedBranches(workspacePath, options.dryRun);
                result.branchesRemoved += removed;
                result.errors.push(...errors);
            }

            // Step 3: Clean up old backups
            if (options.removeOldBackups) {
                this.loggingService?.info('Cleaning up old backup branches...');
                const { removed, errors } = await this.cleanupOldBackups(
                    workspacePath,
                    options.maxAge || 30,
                    options.dryRun
                );
                result.backupsRemoved += removed;
                result.errors.push(...errors);
            }

            // Calculate total space saved
            result.spaceSaved = this.formatBytes(totalSpaceSaved);

            this.loggingService?.info(
                `Cleanup completed: ${result.worktreesRemoved} worktrees, ${result.branchesRemoved} branches, ${result.backupsRemoved} backups removed`
            );
        } catch (error) {
            const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            result.errors.push(errorMsg);
            this.loggingService?.error(errorMsg, error);
        }

        return result;
    }

    /**
     * Clean up orphaned worktrees (worktrees without active agents)
     */
    private async cleanupOrphanedWorktrees(
        workspacePath: string,
        dryRun = false
    ): Promise<{
        removed: number;
        spaceSaved: number;
        errors: string[];
    }> {
        const result = { removed: 0, spaceSaved: 0, errors: [] as string[] };

        try {
            const allWorktrees = await this.worktreeManager.listWorktreesInfo();
            const activeAgents = this.agentManager.getActiveAgents();
            const activeAgentIds = new Set(activeAgents.map(a => a.id));

            for (const worktree of allWorktrees) {
                if (worktree.agentId && !activeAgentIds.has(worktree.agentId)) {
                    try {
                        // Calculate directory size before removal
                        const size = await this.getDirectorySize(worktree.directory);

                        if (!dryRun) {
                            // Remove the worktree
                            execSync(`git worktree remove "${worktree.directory}" --force`, {
                                cwd: workspacePath,
                                encoding: 'utf-8'
                            });

                            this.loggingService?.debug(`Removed orphaned worktree: ${worktree.directory}`);
                        } else {
                            this.loggingService?.debug(
                                `[DRY RUN] Would remove orphaned worktree: ${worktree.directory}`
                            );
                        }

                        result.removed++;
                        result.spaceSaved += size;
                    } catch (error) {
                        const errorMsg = `Failed to remove worktree ${worktree.directory}: ${error instanceof Error ? error.message : 'Unknown'}`;
                        result.errors.push(errorMsg);
                        this.loggingService?.error(errorMsg);
                    }
                }
            }
        } catch (error) {
            const errorMsg = `Error during orphaned worktree cleanup: ${error instanceof Error ? error.message : 'Unknown'}`;
            result.errors.push(errorMsg);
        }

        return result;
    }

    /**
     * Format bytes into human readable string
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Get the size of a directory in bytes
     */
    private async getDirectorySize(dirPath: string): Promise<number> {
        let totalSize = 0;

        try {
            if (!fs.existsSync(dirPath)) {
                return 0;
            }

            const stats = fs.statSync(dirPath);
            if (stats.isFile()) {
                return stats.size;
            }

            if (stats.isDirectory()) {
                const files = fs.readdirSync(dirPath);
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    totalSize += await this.getDirectorySize(filePath);
                }
            }
        } catch (error) {
            // Ignore errors in size calculation
        }

        return totalSize;
    }

    /**
     * Clean up unused agent branches (branches without active agents)
     */
    private async cleanupUnusedBranches(
        workspacePath: string,
        dryRun = false
    ): Promise<{
        removed: number;
        errors: string[];
    }> {
        const result = { removed: 0, errors: [] as string[] };

        try {
            // Get all agent branches
            const branchOutput = execSync('git branch', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });

            const branches = branchOutput
                .split('\n')
                .map(line => line.replace(/^[\s*]+/, '').trim())
                .filter(branch => branch.startsWith('agent-'));

            const activeAgents = this.agentManager.getActiveAgents();
            const activeBranches = new Set();

            // Build set of active branches
            for (const agent of activeAgents) {
                const worktreePath = this.worktreeManager.getWorktreePath(agent.id);
                if (worktreePath && fs.existsSync(worktreePath)) {
                    try {
                        const markerPath = path.join(worktreePath, '.nofx-agent');
                        if (fs.existsSync(markerPath)) {
                            const markerData = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
                            activeBranches.add(markerData.branchName);
                        }
                    } catch (error) {
                        // Ignore marker read errors
                    }
                }
            }

            // Remove unused branches
            for (const branch of branches) {
                if (!activeBranches.has(branch) && !branch.startsWith('backup-')) {
                    try {
                        if (!dryRun) {
                            execSync(`git branch -D ${branch}`, {
                                cwd: workspacePath,
                                encoding: 'utf-8'
                            });
                            this.loggingService?.debug(`Removed unused branch: ${branch}`);
                        } else {
                            this.loggingService?.debug(`[DRY RUN] Would remove unused branch: ${branch}`);
                        }
                        result.removed++;
                    } catch (error) {
                        const errorMsg = `Failed to remove branch ${branch}: ${error instanceof Error ? error.message : 'Unknown'}`;
                        result.errors.push(errorMsg);
                    }
                }
            }
        } catch (error) {
            const errorMsg = `Error during branch cleanup: ${error instanceof Error ? error.message : 'Unknown'}`;
            result.errors.push(errorMsg);
        }

        return result;
    }

    /**
     * Clean up old backup branches
     */
    private async cleanupOldBackups(
        workspacePath: string,
        maxAgeDays: number,
        dryRun = false
    ): Promise<{
        removed: number;
        errors: string[];
    }> {
        const result = { removed: 0, errors: [] as string[] };
        const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
        const cutoffDate = new Date(Date.now() - maxAgeMs);

        try {
            // Get all backup branches
            const branchOutput = execSync('git branch', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });

            const backupBranches = branchOutput
                .split('\n')
                .map(line => line.replace(/^[\s*]+/, '').trim())
                .filter(branch => branch.startsWith('backup-'));

            for (const branch of backupBranches) {
                try {
                    // Extract timestamp from branch name (format: backup-agent-name-timestamp)
                    const timestampMatch = branch.match(/-([0-9]+)$/);
                    if (timestampMatch) {
                        const timestamp = parseInt(timestampMatch[1]);
                        const branchDate = new Date(timestamp);

                        if (branchDate < cutoffDate) {
                            if (!dryRun) {
                                execSync(`git branch -D ${branch}`, {
                                    cwd: workspacePath,
                                    encoding: 'utf-8'
                                });
                                this.loggingService?.debug(`Removed old backup branch: ${branch}`);
                            } else {
                                this.loggingService?.debug(`[DRY RUN] Would remove old backup branch: ${branch}`);
                            }
                            result.removed++;
                        }
                    }
                } catch (error) {
                    const errorMsg = `Failed to remove backup branch ${branch}: ${error instanceof Error ? error.message : 'Unknown'}`;
                    result.errors.push(errorMsg);
                }
            }
        } catch (error) {
            const errorMsg = `Error during backup cleanup: ${error instanceof Error ? error.message : 'Unknown'}`;
            result.errors.push(errorMsg);
        }

        return result;
    }

    /**
     * Get cleanup recommendations based on current state
     */
    async getCleanupRecommendations(): Promise<{
        recommendations: string[];
        severity: 'low' | 'medium' | 'high';
        estimatedSpaceSaving: string;
    }> {
        const recommendations: string[] = [];
        let estimatedSaving = 0;
        let orphanedWorktrees: any[] = [];

        try {
            // Check for orphaned worktrees
            const allWorktrees = await this.worktreeManager.listWorktreesInfo();
            const activeAgents = this.agentManager.getActiveAgents();
            const activeAgentIds = new Set(activeAgents.map(a => a.id));

            orphanedWorktrees = allWorktrees.filter(w => w.agentId && !activeAgentIds.has(w.agentId));

            if (orphanedWorktrees.length > 0) {
                recommendations.push(`Remove ${orphanedWorktrees.length} orphaned worktree(s)`);
                // Estimate space saving (rough estimate)
                estimatedSaving += orphanedWorktrees.length * 50 * 1024 * 1024; // 50MB per worktree estimate
            }

            // Check for old backup branches
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspacePath) {
                try {
                    const branchOutput = execSync('git branch', {
                        cwd: workspacePath,
                        encoding: 'utf-8'
                    });

                    const backupBranches = branchOutput
                        .split('\n')
                        .filter(line => line.trim().startsWith('backup-')).length;

                    if (backupBranches > 5) {
                        recommendations.push(`Consider removing old backup branches (${backupBranches} found)`);
                    }
                } catch (error) {
                    // Ignore git command errors
                }
            }

            // Check for unused branches
            const unusedBranches = allWorktrees.filter(w => !w.agentId).length;
            if (unusedBranches > 0) {
                recommendations.push(`Remove ${unusedBranches} unused agent branch(es)`);
            }
        } catch (error) {
            recommendations.push('Run health check to identify issues');
        }

        const severity: 'low' | 'medium' | 'high' =
            orphanedWorktrees.length > 5 ? 'high' : orphanedWorktrees.length > 2 ? 'medium' : 'low';

        return {
            recommendations,
            severity,
            estimatedSpaceSaving: this.formatBytes(estimatedSaving)
        };
    }
}
