import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as fsSync from 'fs';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { Agent } from '../agents/types';
import { ILogger, INotificationService } from '../services/interfaces';

const execAsync = promisify(exec);

interface WorktreeState {
    agentId: string;
    agentName: string;
    agentType: string;
    branchName: string;
    worktreePath: string;
    createdAt: string;
    status: 'creating' | 'active' | 'removing' | 'error';
    lastHealthCheck?: string;
    errorCount: number;
}

interface WorktreeBackup {
    originalPath: string;
    backupPath: string;
    timestamp: string;
}

class WorktreeOperationError extends Error {
    constructor(
        message: string,
        public readonly operation: string,
        public readonly agentId: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'WorktreeOperationError';
    }
}

export class WorktreeManager {
    private worktrees: Map<string, string> = new Map();
    private worktreeStates: Map<string, WorktreeState> = new Map();
    private operationLocks: Map<string, Promise<any>> = new Map();
    private baseDir: string;
    private workspacePath: string;
    private stateFile: string;
    private backupDir: string;
    private loggingService?: ILogger;
    private notificationService?: INotificationService;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // ms
    private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
    private healthCheckTimer?: NodeJS.Timeout;

    constructor(workspacePath: string, loggingService?: ILogger, notificationService?: INotificationService) {
        this.workspacePath = workspacePath;
        this.loggingService = loggingService;
        this.notificationService = notificationService;

        // Create worktrees in a .nofx-worktrees directory adjacent to the project
        this.baseDir = path.join(path.dirname(workspacePath), '.nofx-worktrees');
        this.stateFile = path.join(this.baseDir, '.worktree-state.json');
        this.backupDir = path.join(this.baseDir, '.backups');

        // Initialize directories and state
        this.initializeAsync().catch(error => {
            this.loggingService?.error('Failed to initialize WorktreeManager:', error);
        });

        // Start health monitoring
        this.startHealthMonitoring();
    }

    private async initializeAsync(): Promise<void> {
        try {
            await this.ensureDirectoryExists(this.baseDir);
            await this.ensureDirectoryExists(this.backupDir);
            await this.loadState();
            await this.recoverIncompleteOperations();
        } catch (error) {
            this.loggingService?.error('WorktreeManager initialization failed:', error);
            throw new WorktreeOperationError(
                'Failed to initialize WorktreeManager',
                'initialize',
                'system',
                error as Error
            );
        }
    }

    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            await fsPromises.access(dirPath);
        } catch {
            await fsPromises.mkdir(dirPath, { recursive: true });
        }
    }

    private async loadState(): Promise<void> {
        try {
            const stateData = await fsPromises.readFile(this.stateFile, 'utf-8');
            const states: WorktreeState[] = JSON.parse(stateData);

            for (const state of states) {
                this.worktreeStates.set(state.agentId, state);
                this.worktrees.set(state.agentId, state.worktreePath);
            }

            this.loggingService?.info(`Loaded ${states.length} worktree states from persistence`);
        } catch (error) {
            // State file doesn't exist or is corrupted - start fresh
            this.loggingService?.debug('No valid state file found, starting with empty state');
        }
    }

    private async saveState(): Promise<void> {
        try {
            const states = Array.from(this.worktreeStates.values());
            await fsPromises.writeFile(this.stateFile, JSON.stringify(states, null, 2));
        } catch (error) {
            this.loggingService?.error('Failed to save worktree state:', error);
        }
    }

    private async recoverIncompleteOperations(): Promise<void> {
        const incompleteOperations = Array.from(this.worktreeStates.values()).filter(
            state => state.status === 'creating' || state.status === 'removing'
        );

        for (const state of incompleteOperations) {
            try {
                if (state.status === 'creating') {
                    // Try to complete creation or clean up
                    await this.recoverIncompleteCreation(state);
                } else if (state.status === 'removing') {
                    // Complete removal
                    await this.recoverIncompleteRemoval(state);
                }
            } catch (error) {
                this.loggingService?.error(`Failed to recover operation for ${state.agentId}:`, error);
                state.status = 'error';
                state.errorCount++;
            }
        }

        await this.saveState();
    }

    private async recoverIncompleteCreation(state: WorktreeState): Promise<void> {
        // Check if worktree actually exists
        try {
            await fsPromises.access(state.worktreePath);
            // Worktree exists, mark as active
            state.status = 'active';
            this.loggingService?.info(`Recovered worktree for ${state.agentName}`);
        } catch {
            // Worktree doesn't exist, clean up state
            this.worktrees.delete(state.agentId);
            this.loggingService?.info(`Cleaned up incomplete creation for ${state.agentName}`);
        }
    }

    private async recoverIncompleteRemoval(state: WorktreeState): Promise<void> {
        try {
            await this.executeGitCommand(`git worktree remove "${state.worktreePath}" --force`);
        } catch {
            // Already removed or doesn't exist
        }
        this.worktrees.delete(state.agentId);
        this.loggingService?.info(`Completed removal recovery for ${state.agentName}`);
    }

    private startHealthMonitoring(): void {
        this.healthCheckTimer = setInterval(async () => {
            await this.performHealthCheck();
        }, this.HEALTH_CHECK_INTERVAL);
    }

    private async performHealthCheck(): Promise<void> {
        for (const [agentId, worktreePath] of Array.from(this.worktrees.entries())) {
            const state = this.worktreeStates.get(agentId);
            if (!state || state.status !== 'active') continue;

            try {
                await fsPromises.access(worktreePath);
                state.lastHealthCheck = new Date().toISOString();
            } catch (error) {
                this.loggingService?.warn(`Health check failed for ${state.agentName}: worktree missing`);
                state.status = 'error';
                state.errorCount++;
            }
        }
        await this.saveState();
    }

    private async executeWithLock<T>(agentId: string, operation: () => Promise<T>): Promise<T> {
        // Wait for any existing operation to complete
        const existingLock = this.operationLocks.get(agentId);
        if (existingLock) {
            await existingLock.catch(() => {}); // Ignore errors from previous operations
        }

        // Create new operation lock
        const operationPromise = operation();
        this.operationLocks.set(agentId, operationPromise);

        try {
            const result = await operationPromise;
            this.operationLocks.delete(agentId);
            return result;
        } catch (error) {
            this.operationLocks.delete(agentId);
            throw error;
        }
    }

    private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries: number = this.MAX_RETRIES): Promise<T> {
        let lastError: Error;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;

                if (attempt === maxRetries) {
                    break;
                }

                // Wait before retrying with exponential backoff
                const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));

                this.loggingService?.debug(
                    `Retrying operation (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms`
                );
            }
        }

        throw lastError!;
    }

    private async executeGitCommand(command: string, cwd?: string): Promise<string> {
        return this.executeWithRetry(async () => {
            const { stdout, stderr } = await execAsync(command, {
                cwd: cwd || this.workspacePath,
                encoding: 'utf-8'
            });

            if (stderr && !stderr.includes('warning:')) {
                throw new Error(`Git command failed: ${stderr}`);
            }

            return stdout.trim();
        });
    }

    private async createBackup(worktreePath: string): Promise<WorktreeBackup> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(this.backupDir, `backup-${timestamp}`);

        // Copy worktree to backup location
        await fsPromises.cp(worktreePath, backupPath, { recursive: true });

        return {
            originalPath: worktreePath,
            backupPath,
            timestamp
        };
    }

    /**
     * Create a worktree for an agent with full error recovery
     */
    async createWorktreeForAgent(agent: Agent): Promise<string> {
        return this.executeWithLock(agent.id, async () => {
            try {
                // Check if agent already has a worktree
                const existingState = this.worktreeStates.get(agent.id);
                if (existingState && existingState.status === 'active') {
                    // Verify worktree actually exists
                    try {
                        await fsPromises.access(existingState.worktreePath);
                        return existingState.worktreePath;
                    } catch {
                        // Worktree missing, clean up state and recreate
                        this.worktrees.delete(agent.id);
                    }
                }

                // Create state entry immediately to track operation
                const branchName = `agent-${agent.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
                const worktreePath = path.join(this.baseDir, agent.id);

                const state: WorktreeState = {
                    agentId: agent.id,
                    agentName: agent.name,
                    agentType: agent.type,
                    branchName,
                    worktreePath,
                    createdAt: new Date().toISOString(),
                    status: 'creating',
                    errorCount: 0
                };

                this.worktreeStates.set(agent.id, state);
                this.worktrees.set(agent.id, state.worktreePath);
                await this.saveState();

                this.loggingService?.debug(`Creating worktree for ${agent.name} at ${worktreePath}`);

                // Get current branch to base the worktree on
                const currentBranch = await this.executeGitCommand('git branch --show-current');

                // Create the worktree with a new branch
                const command = `git worktree add -b ${branchName} "${worktreePath}" ${currentBranch || 'HEAD'}`;
                await this.executeGitCommand(command);

                // Create marker file
                await this.createMarkerFile(state);

                // Update gitignore
                await this.updateGitignore(worktreePath);

                // Mark as active
                state.status = 'active';
                state.lastHealthCheck = new Date().toISOString();
                await this.saveState();

                this.loggingService?.info(`Successfully created worktree for ${agent.name} at ${worktreePath}`);

                return worktreePath;
            } catch (error) {
                // Cleanup on failure
                const state = this.worktreeStates.get(agent.id);
                if (state) {
                    state.status = 'error';
                    state.errorCount++;
                    await this.saveState();

                    // Try to clean up partial worktree
                    try {
                        await this.executeGitCommand(`git worktree remove "${state.worktreePath}" --force`);
                    } catch {
                        // Ignore cleanup errors
                    }

                    this.worktrees.delete(agent.id);
                }

                const operationError = new WorktreeOperationError(
                    `Failed to create worktree for ${agent.name}`,
                    'create',
                    agent.id,
                    error as Error
                );

                this.loggingService?.error('Worktree creation failed:', operationError);
                throw operationError;
            }
        });
    }

    private async createMarkerFile(state: WorktreeState): Promise<void> {
        const markerPath = path.join(state.worktreePath, '.nofx-agent');
        const markerData = {
            agentId: state.agentId,
            agentName: state.agentName,
            agentType: state.agentType,
            branchName: state.branchName,
            createdAt: state.createdAt
        };

        await fsPromises.writeFile(markerPath, JSON.stringify(markerData, null, 2));
    }

    private async updateGitignore(worktreePath: string): Promise<void> {
        const gitignorePath = path.join(worktreePath, '.gitignore');

        try {
            const gitignoreContent = await fsPromises.readFile(gitignorePath, 'utf-8');
            if (!gitignoreContent.includes('.nofx-agent')) {
                await fsPromises.appendFile(gitignorePath, '\n# NofX agent worktree marker\n.nofx-agent\n');
            }
        } catch {
            // File doesn't exist, create it
            await fsPromises.writeFile(gitignorePath, '# NofX agent worktree marker\n.nofx-agent\n');
        }
    }

    /**
     * Remove a worktree for an agent
     */
    async removeWorktreeForAgent(agentId: string): Promise<void> {
        try {
            const worktreePath = this.worktrees.get(agentId);
            if (!worktreePath) {
                this.loggingService?.debug(`No worktree found for agent ${agentId}`);
                return;
            }

            // Remove the worktree
            const command = `git worktree remove "${worktreePath}" --force`;

            this.loggingService?.debug(`Removing worktree: ${command}`);

            execSync(command, {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            });

            // Remove from our map
            this.worktrees.delete(agentId);

            this.loggingService?.info(`Removed worktree for agent ${agentId}`);
        } catch (error) {
            this.loggingService?.error(`Error removing worktree for ${agentId}:`, error);
            // Try to clean up the directory manually if git command failed
            const worktreePath = this.worktrees.get(agentId);
            if (worktreePath && fsSync.existsSync(worktreePath)) {
                try {
                    fsSync.rmSync(worktreePath, { recursive: true, force: true });
                    this.worktrees.delete(agentId);
                    this.worktreeStates.delete(agentId);
                } catch (cleanupError) {
                    this.loggingService?.error('Error cleaning up worktree directory:', cleanupError);
                }
            }
        }
    }

    /**
     * List all worktrees
     */
    listWorktrees(): string[] {
        try {
            const output = execSync('git worktree list --porcelain', {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            });

            const worktrees: string[] = [];
            const lines = output.split('\n');

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('worktree ')) {
                    const path = lines[i].substring(9);
                    worktrees.push(path);
                }
            }

            return worktrees;
        } catch (error) {
            this.loggingService?.error('Error listing worktrees:', error);
            return [];
        }
    }

    /**
     * Clean up orphaned worktrees
     */
    async cleanupOrphanedWorktrees(): Promise<void> {
        try {
            // Prune worktrees that no longer exist
            execSync('git worktree prune', {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            });

            // Check for any worktree directories that don't have active agents
            const worktrees = this.listWorktrees();

            for (const worktreePath of worktrees) {
                // Check if this is one of our agent worktrees
                const markerPath = path.join(worktreePath, '.nofx-agent');
                if (fsSync.existsSync(markerPath)) {
                    const markerData = JSON.parse(fsSync.readFileSync(markerPath, 'utf-8'));

                    // If we don't have this agent in our map, it's orphaned
                    if (!this.worktrees.has(markerData.agentId)) {
                        this.loggingService?.info(
                            `Found orphaned worktree for agent ${markerData.agentName}, cleaning up...`
                        );

                        try {
                            execSync(`git worktree remove "${worktreePath}" --force`, {
                                cwd: this.workspacePath,
                                encoding: 'utf-8'
                            });
                        } catch (removeError) {
                            this.loggingService?.error('Error removing orphaned worktree:', removeError);
                        }
                    }
                }
            }
        } catch (error) {
            this.loggingService?.error('Error cleaning up orphaned worktrees:', error);
        }
    }

    /**
     * Get the worktree path for an agent
     */
    getWorktreePath(agentId: string): string | undefined {
        return this.worktrees.get(agentId);
    }

    /**
     * Check if git worktrees are available
     */
    static isWorktreeAvailable(workspacePath: string): boolean {
        console.log(`[NofX Debug] Checking Git worktree availability for: ${workspacePath}`);
        console.log(`[NofX Debug] Working directory exists: ${fs.existsSync(workspacePath)}`);

        try {
            // Check if we're in a git repository
            console.log(`[NofX Debug] Testing: git rev-parse --git-dir in ${workspacePath}`);
            const gitDir = execSync('git rev-parse --git-dir', {
                cwd: workspacePath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            }).trim();
            console.log(`[NofX Debug] Git directory found: ${gitDir}`);

            // Check if git worktree command is available
            console.log(`[NofX Debug] Testing: git worktree -h in ${workspacePath}`);
            execSync('git worktree -h', {
                cwd: workspacePath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            console.log(`[NofX Debug] Git worktree command available`);

            console.log(`[NofX Debug] Git worktrees available: true`);
            return true;
        } catch (error) {
            console.log(
                `[NofX Debug] Git worktree not available for path "${workspacePath}":`,
                error instanceof Error ? error.message : String(error)
            );
            return false;
        }
    }

    /**
     * List all agent worktrees with their information
     */
    async listWorktreesInfo(): Promise<Array<{ directory: string; branch: string; agentId?: string }>> {
        const worktrees: Array<{ directory: string; branch: string; agentId?: string }> = [];

        try {
            // List all worktrees
            const result = execSync('git worktree list --porcelain', {
                cwd: this.workspacePath,
                encoding: 'utf8'
            });

            const lines = result.split('\n');
            let currentWorktree: { directory: string; branch: string; agentId?: string } | null = null;

            for (const line of lines) {
                if (line.startsWith('worktree ')) {
                    const directory = line.substring(9);
                    if (currentWorktree) {
                        worktrees.push(currentWorktree);
                    }
                    currentWorktree = { directory, branch: '' };
                } else if (line.startsWith('branch ') && currentWorktree) {
                    currentWorktree.branch = line.substring(7).replace('refs/heads/', '');
                    // Try to read agent ID from marker file
                    try {
                        const markerPath = path.join(currentWorktree.directory, '.nofx-agent');
                        if (fsSync.existsSync(markerPath)) {
                            const markerData = JSON.parse(fsSync.readFileSync(markerPath, 'utf-8'));
                            currentWorktree.agentId = markerData.agentId;
                        }
                    } catch (e) {
                        // Ignore marker read errors
                    }
                }
            }

            if (currentWorktree && currentWorktree.branch) {
                worktrees.push(currentWorktree);
            }
        } catch (error) {
            this.loggingService?.error('Error listing worktrees:', error);
        }

        return worktrees.filter(w => w.branch.startsWith('agent-'));
    }

    /**
     * Merge changes from agent worktree back to main branch
     */
    async mergeAgentWork(agentId: string): Promise<void> {
        try {
            const worktreePath = this.worktrees.get(agentId);
            if (!worktreePath) {
                throw new Error(`No worktree found for agent ${agentId}`);
            }

            // Get the branch name from the marker file
            const markerPath = path.join(worktreePath, '.nofx-agent');
            const markerData = JSON.parse(fsSync.readFileSync(markerPath, 'utf-8'));

            // First, commit any uncommitted changes in the worktree
            try {
                execSync('git add -A', { cwd: worktreePath });
                execSync(`git commit -m "Agent ${markerData.agentName} work - auto-commit before merge"`, {
                    cwd: worktreePath
                });
            } catch (commitError) {
                // No changes to commit, that's okay
                this.loggingService?.debug('No changes to commit in worktree');
            }

            // Switch to main branch in the main workspace
            const currentBranch = execSync('git branch --show-current', {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            }).trim();

            // Merge the agent's branch
            execSync(
                `git merge ${markerData.branchName} --no-ff -m "Merge agent ${markerData.agentName} work from ${markerData.branchName}"`,
                {
                    cwd: this.workspacePath,
                    encoding: 'utf-8'
                }
            );

            this.loggingService?.info(`Merged agent ${markerData.agentName} work from ${markerData.branchName}`);

            this.notificationService?.showInformation(
                `✅ Merged ${markerData.agentName}'s work from branch ${markerData.branchName}`
            );
        } catch (error) {
            this.loggingService?.error('Error merging agent work:', error);
            throw error;
        }
    }

    /**
     * Get summary statistics about worktrees
     */
    getWorktreeStats(): {
        totalWorktrees: number;
        activeAgents: number;
        diskSpaceUsed: string;
    } {
        const totalWorktrees = this.worktrees.size;
        const activeAgents = Array.from(this.worktrees.keys()).length;

        let totalSize = 0;
        try {
            for (const worktreePath of Array.from(this.worktrees.values())) {
                if (fsSync.existsSync(worktreePath)) {
                    // Simple size calculation - in production you might want something more sophisticated
                    const stats = fsSync.statSync(worktreePath);
                    totalSize += stats.size || 0;
                }
            }
        } catch (error) {
            // Ignore errors in size calculation
        }

        const diskSpaceUsed =
            totalSize > 1024 * 1024
                ? `${(totalSize / (1024 * 1024)).toFixed(1)} MB`
                : `${(totalSize / 1024).toFixed(1)} KB`;

        return {
            totalWorktrees,
            activeAgents,
            diskSpaceUsed
        };
    }
}
