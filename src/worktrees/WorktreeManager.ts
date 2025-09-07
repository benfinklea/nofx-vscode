import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Agent } from '../agents/types';
import { ILoggingService, INotificationService } from '../services/interfaces';

export class WorktreeManager {
    private worktrees: Map<string, string> = new Map(); // agentId -> worktree path
    private baseDir: string;
    private workspacePath: string;
    private loggingService?: ILoggingService;
    private notificationService?: INotificationService;

    constructor(workspacePath: string, loggingService?: ILoggingService, notificationService?: INotificationService) {
        this.workspacePath = workspacePath;
        this.loggingService = loggingService;
        this.notificationService = notificationService;
        // Create worktrees in a .nofx-worktrees directory adjacent to the project
        this.baseDir = path.join(path.dirname(workspacePath), '.nofx-worktrees');

        // Ensure the worktrees directory exists
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    /**
     * Create a worktree for an agent
     */
    async createWorktreeForAgent(agent: Agent): Promise<string> {
        try {
            // Check if agent already has a worktree
            if (this.worktrees.has(agent.id)) {
                return this.worktrees.get(agent.id)!;
            }

            // Create a clean branch name from agent name
            const branchName = `agent-${agent.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
            const worktreePath = path.join(this.baseDir, agent.id);

            // Get current branch to base the worktree on
            const currentBranch = execSync('git branch --show-current', {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            }).trim();

            // Create the worktree with a new branch
            const command = `git worktree add -b ${branchName} "${worktreePath}" ${currentBranch || 'HEAD'}`;

            this.loggingService?.debug(`Creating worktree for ${agent.name}: ${command}`);

            execSync(command, {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            });

            // Store the worktree path
            this.worktrees.set(agent.id, worktreePath);

            // Create a marker file to identify this as an agent worktree
            const markerPath = path.join(worktreePath, '.nofx-agent');
            fs.writeFileSync(
                markerPath,
                JSON.stringify(
                    {
                        agentId: agent.id,
                        agentName: agent.name,
                        agentType: agent.type,
                        branchName: branchName,
                        createdAt: new Date().toISOString()
                    },
                    null,
                    2
                )
            );

            // Add marker file to .gitignore if not already there
            const gitignorePath = path.join(worktreePath, '.gitignore');
            if (fs.existsSync(gitignorePath)) {
                const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
                if (!gitignoreContent.includes('.nofx-agent')) {
                    fs.appendFileSync(gitignorePath, '\n# NofX agent worktree marker\n.nofx-agent\n');
                }
            } else {
                fs.writeFileSync(gitignorePath, '# NofX agent worktree marker\n.nofx-agent\n');
            }

            this.loggingService?.info(`Created worktree for ${agent.name} at ${worktreePath}`);

            return worktreePath;
        } catch (error) {
            this.loggingService?.error(`Error creating worktree for ${agent.name}:`, error);
            throw error;
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
            if (worktreePath && fs.existsSync(worktreePath)) {
                try {
                    fs.rmSync(worktreePath, { recursive: true, force: true });
                    this.worktrees.delete(agentId);
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
                if (fs.existsSync(markerPath)) {
                    const markerData = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));

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
        try {
            // Check if we're in a git repository
            execSync('git rev-parse --git-dir', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });

            // Check if git worktree command is available
            execSync('git worktree -h', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });

            return true;
        } catch (error) {
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
                        if (fs.existsSync(markerPath)) {
                            const markerData = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
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
            const markerData = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));

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
}
