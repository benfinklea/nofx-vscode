import * as vscode from 'vscode';
import { IWorktreeService, IConfiguration, INotificationService, ILogger, IErrorHandler } from './interfaces';
import { WorktreeManager } from '../worktrees/WorktreeManager';

export class WorktreeService implements IWorktreeService {
    private worktreeManager?: WorktreeManager;
    private useWorktrees: boolean = false;
    private loggingService?: ILogger;
    private errorHandler?: IErrorHandler;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private configService: IConfiguration,
        private notificationService: INotificationService,
        worktreeManager?: WorktreeManager,
        loggingService?: ILogger,
        errorHandler?: IErrorHandler
    ) {
        this.loggingService = loggingService;
        this.errorHandler = errorHandler;
        this.worktreeManager = worktreeManager;
        this.initializeWorktrees();

        // Subscribe to configuration changes
        this.disposables.push(
            this.configService.onDidChange(e => {
                if (e.affectsConfiguration('nofx.useWorktrees')) {
                    this.initializeWorktrees();
                }
            })
        );
    }

    private initializeWorktrees(): void {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        this.useWorktrees = this.configService.isUseWorktrees();

        if (!this.useWorktrees) {
            return;
        }

        if (!this.worktreeManager) {
            this.loggingService?.debug('WorktreeManager not available, skipping worktree initialization');
            return;
        }

        console.log(`[NofX Debug] WorktreeService initializing with workspace: ${workspaceFolder.uri.fsPath}`);
        this.loggingService?.debug(`WorktreeService: Checking Git availability for ${workspaceFolder.uri.fsPath}`);

        if (WorktreeManager.isWorktreeAvailable(workspaceFolder.uri.fsPath)) {
            this.loggingService?.info('Git worktrees enabled and available');
            console.log(`[NofX Debug] Git worktrees confirmed available`);

            // Clean up any orphaned worktrees
            this.worktreeManager.cleanupOrphanedWorktrees();
        } else {
            this.loggingService?.warn('Git worktrees requested but not available in this repository');
            console.log(`[NofX Debug] Git worktrees NOT available for workspace: ${workspaceFolder.uri.fsPath}`);
            this.notificationService.showWarning(
                'Git worktrees are enabled but this is not a Git repository. Agents will use the main workspace.'
            );
        }
    }

    async createForAgent(agent: any): Promise<string | undefined> {
        if (!this.worktreeManager || !this.useWorktrees) {
            return undefined;
        }

        return (
            (await this.errorHandler?.handleAsync(async () => {
                const worktreePath = await this.worktreeManager!.createWorktreeForAgent(agent);
                this.loggingService?.debug(`Worktree created for agent ${agent.name}: ${worktreePath}`);
                return worktreePath;
            }, `Failed to create worktree for ${agent.name}`)) || undefined
        );
    }

    async removeForAgent(agentId: string): Promise<boolean> {
        if (!this.worktreeManager || !this.useWorktrees) {
            return true; // No worktree to remove
        }

        return (
            (await this.errorHandler?.handleAsync(async () => {
                const worktreePath = this.worktreeManager!.getWorktreePath(agentId);
                if (!worktreePath) {
                    return true; // No worktree exists
                }

                // Ask user what to do with the worktree
                const action = await this.notificationService.showInformation(
                    'Agent has a worktree. Merge changes before removing?',
                    'Merge & Remove',
                    'Remove Without Merging',
                    'Cancel'
                );

                if (action === 'Cancel') {
                    return false; // User cancelled
                }

                if (action === 'Merge & Remove') {
                    await this.worktreeManager!.mergeAgentWork(agentId);
                    this.loggingService?.debug(`Worktree merged for agent ${agentId}`);
                }

                await this.worktreeManager!.removeWorktreeForAgent(agentId);
                this.loggingService?.debug(`Worktree removed for agent ${agentId}`);
                return true;
            }, `Error removing worktree for agent ${agentId}`)) || false
        );
    }

    async mergeForAgent(agentId: string): Promise<boolean> {
        if (!this.worktreeManager || !this.useWorktrees) {
            return true; // No worktree to merge
        }

        return (
            (await this.errorHandler?.handleAsync(async () => {
                await this.worktreeManager!.mergeAgentWork(agentId);
                this.loggingService?.debug(`Worktree merged for agent ${agentId}`);
                return true;
            }, 'Error merging agent work')) || false
        );
    }

    getWorktreePath(agentId: string): string | undefined {
        if (!this.worktreeManager) {
            return undefined;
        }
        return this.worktreeManager.getWorktreePath(agentId);
    }

    isAvailable(): boolean {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return false;

        return this.useWorktrees && WorktreeManager.isWorktreeAvailable(workspaceFolder.uri.fsPath);
    }

    async cleanupOrphaned(): Promise<void> {
        if (!this.worktreeManager) {
            return;
        }

        await this.errorHandler?.handleAsync(async () => {
            await this.worktreeManager!.cleanupOrphanedWorktrees();
            this.loggingService?.debug('Orphaned worktrees cleaned up');
        }, 'Error cleaning up orphaned worktrees');
    }

    dispose(): void {
        // Dispose all subscriptions
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // WorktreeManager doesn't need explicit disposal
        this.worktreeManager = undefined;
    }
}
