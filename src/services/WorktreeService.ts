import * as vscode from 'vscode';
import { IWorktreeService, IConfigurationService, INotificationService, ILoggingService, IErrorHandler } from './interfaces';
import { WorktreeManager } from '../worktrees/WorktreeManager';

export class WorktreeService implements IWorktreeService {
    private worktreeManager?: WorktreeManager;
    private useWorktrees: boolean = false;
    private loggingService?: ILoggingService;
    private errorHandler?: IErrorHandler;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private configService: IConfigurationService,
        private notificationService: INotificationService,
        loggingService?: ILoggingService,
        errorHandler?: IErrorHandler
    ) {
        this.loggingService = loggingService;
        this.errorHandler = errorHandler;
        this.initializeWorktrees();
        
        // Subscribe to configuration changes
        this.disposables.push(
            this.configService.onDidChange((e) => {
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
        
        if (this.useWorktrees && WorktreeManager.isWorktreeAvailable(workspaceFolder.uri.fsPath)) {
            this.worktreeManager = new WorktreeManager(workspaceFolder.uri.fsPath);
            this.loggingService?.info('Git worktrees enabled and available');
            
            // Clean up any orphaned worktrees
            this.worktreeManager.cleanupOrphanedWorktrees();
        } else if (this.useWorktrees) {
            this.loggingService?.warn('Git worktrees requested but not available in this repository');
            this.notificationService.showWarning(
                'Git worktrees are enabled but this is not a Git repository. Agents will use the main workspace.'
            );
        }
    }

    async createForAgent(agent: any): Promise<string | undefined> {
        if (!this.worktreeManager || !this.useWorktrees) {
            return undefined;
        }

        try {
            const worktreePath = await this.worktreeManager.createWorktreeForAgent(agent);
            this.loggingService?.debug(`Worktree created for agent ${agent.name}: ${worktreePath}`);
            return worktreePath;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, `Failed to create worktree for ${agent.name}`);
            this.notificationService.showWarning(
                `Failed to create worktree for ${agent.name}. Using main workspace.`
            );
            return undefined;
        }
    }

    async removeForAgent(agentId: string): Promise<boolean> {
        if (!this.worktreeManager || !this.useWorktrees) {
            return true; // No worktree to remove
        }

        try {
            const worktreePath = this.worktreeManager.getWorktreePath(agentId);
            if (!worktreePath) {
                return true; // No worktree exists
            }

            // Ask user what to do with the worktree
            const action = await this.notificationService.showInformation(
                `Agent has a worktree. Merge changes before removing?`,
                'Merge & Remove', 'Remove Without Merging', 'Cancel'
            );
            
            if (action === 'Cancel') {
                return false; // User cancelled
            }
            
            if (action === 'Merge & Remove') {
                try {
                    await this.worktreeManager.mergeAgentWork(agentId);
                    this.loggingService?.debug(`Worktree merged for agent ${agentId}`);
                } catch (mergeError) {
                    const err = mergeError instanceof Error ? mergeError : new Error(String(mergeError));
                    this.errorHandler?.handleError(err, 'Error merging agent work');
                    this.notificationService.showError(
                        `Failed to merge agent's work. Check for conflicts.`
                    );
                    return false;
                }
            }
            
            await this.worktreeManager.removeWorktreeForAgent(agentId);
            this.loggingService?.debug(`Worktree removed for agent ${agentId}`);
            return true;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, `Error removing worktree for agent ${agentId}`);
            this.notificationService.showError(
                `Failed to remove worktree for agent. Check for conflicts.`
            );
            return false;
        }
    }

    async mergeForAgent(agentId: string): Promise<boolean> {
        if (!this.worktreeManager || !this.useWorktrees) {
            return true; // No worktree to merge
        }

        try {
            await this.worktreeManager.mergeAgentWork(agentId);
            this.loggingService?.debug(`Worktree merged for agent ${agentId}`);
            return true;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'Error merging agent work');
            this.notificationService.showError(
                `Failed to merge agent's work. Check for conflicts.`
            );
            return false;
        }
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
        
        try {
            await this.worktreeManager.cleanupOrphanedWorktrees();
            this.loggingService?.debug('Orphaned worktrees cleaned up');
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'Error cleaning up orphaned worktrees');
        }
    }

    dispose(): void {
        // Dispose all subscriptions
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        
        // WorktreeManager doesn't need explicit disposal
        this.worktreeManager = undefined;
    }
}
