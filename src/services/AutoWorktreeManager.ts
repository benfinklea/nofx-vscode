import * as vscode from 'vscode';
import { WorktreeManager } from '../worktrees/WorktreeManager';
import { WorktreeCleanupService, CleanupOptions } from './WorktreeCleanupService';
import { AgentManager } from '../agents/AgentManager';
import { Agent } from '../agents/types';
import { ILoggingService, INotificationService, IConfigurationService, IEventBus, SERVICE_TOKENS } from './interfaces';

interface AutoCleanupStats {
    lastCleanup: Date;
    itemsRemoved: number;
    spaceSaved: string;
    issuesDetected: number;
}

/**
 * AutoWorktreeManager provides automatic worktree management for users
 * who want git worktrees to "just work" without manual intervention.
 *
 * Features:
 * - Automatically creates worktrees when agents spawn
 * - Periodic background cleanup of orphaned worktrees
 * - Smart notifications about automatic actions
 * - Graceful error handling with fallback to main workspace
 * - Health monitoring and recommendations
 */
export class AutoWorktreeManager {
    private worktreeManager?: WorktreeManager;
    private cleanupService?: WorktreeCleanupService;
    private cleanupTimer?: NodeJS.Timeout;
    private healthCheckTimer?: NodeJS.Timeout;

    // Configuration
    private isEnabled = true;
    private cleanupInterval = 30 * 60 * 1000; // 30 minutes
    private healthCheckInterval = 10 * 60 * 1000; // 10 minutes
    private lastCleanupStats?: AutoCleanupStats;

    // Disposables for cleanup
    private disposables: vscode.Disposable[] = [];

    constructor(
        private agentManager: AgentManager,
        private loggingService: ILoggingService,
        private notificationService: INotificationService,
        private configService: IConfigurationService,
        private eventBus?: IEventBus
    ) {
        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            // Check if automatic management is enabled
            this.isEnabled = this.configService.get('autoManageWorktrees', true);

            if (!this.isEnabled) {
                this.loggingService.info('AutoWorktreeManager: Automatic worktree management disabled');
                return;
            }

            // Check if worktrees are available
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                this.loggingService.debug('AutoWorktreeManager: No workspace folder available');
                return;
            }

            const workspacePath = workspaceFolder.uri.fsPath;
            if (!WorktreeManager.isWorktreeAvailable(workspacePath)) {
                this.loggingService.info(
                    'AutoWorktreeManager: Git worktrees not available, automatic management disabled'
                );
                await this.showWorktreeUnavailableNotification();
                return;
            }

            // Initialize worktree components
            this.worktreeManager = new WorktreeManager(workspacePath, this.loggingService, this.notificationService);

            this.cleanupService = new WorktreeCleanupService(
                this.worktreeManager,
                this.agentManager,
                this.loggingService,
                this.notificationService
            );

            // Listen for agent lifecycle events
            this.setupEventListeners();

            // Start background processes
            this.startBackgroundCleanup();
            this.startHealthMonitoring();

            this.loggingService.info('AutoWorktreeManager: Initialized with automatic management enabled');

            // Show initial status if there are existing worktrees
            setTimeout(() => this.showInitialStatus(), 2000);
        } catch (error) {
            this.loggingService.error('AutoWorktreeManager: Initialization failed', error);
            // Don't throw - gracefully fall back to manual mode
        }
    }

    private setupEventListeners(): void {
        // Listen for agent updates to automatically create worktrees
        this.disposables.push(this.agentManager.onAgentUpdate(this.handleAgentUpdate.bind(this)));

        // Listen for configuration changes
        this.disposables.push(
            this.configService.onDidChange(e => {
                if (e.affectsConfiguration('nofx.autoManageWorktrees')) {
                    this.handleConfigurationChange();
                }
            })
        );

        // Listen for events via event bus if available
        if (this.eventBus) {
            this.disposables.push(
                this.eventBus.subscribe('agent.spawned', this.handleAgentSpawned.bind(this)),
                this.eventBus.subscribe('agent.removed', this.handleAgentRemoved.bind(this))
            );
        }
    }

    private async handleAgentUpdate(): Promise<void> {
        if (!this.isEnabled || !this.worktreeManager) return;

        try {
            const activeAgents = this.agentManager.getActiveAgents();

            for (const agent of activeAgents) {
                // Check if agent needs a worktree
                const existingWorktree = this.worktreeManager.getWorktreePath(agent.id);

                if (!existingWorktree && this.shouldCreateWorktree(agent)) {
                    await this.createWorktreeForAgent(agent);
                }
            }
        } catch (error) {
            this.loggingService.error('AutoWorktreeManager: Error handling agent update', error);
        }
    }

    private async handleAgentSpawned(data: { agent: Agent }): Promise<void> {
        if (!this.isEnabled || !this.worktreeManager) return;

        try {
            if (this.shouldCreateWorktree(data.agent)) {
                await this.createWorktreeForAgent(data.agent);
            }
        } catch (error) {
            this.loggingService.error('AutoWorktreeManager: Error creating worktree for new agent', error);
        }
    }

    private async handleAgentRemoved(data: { agentId: string }): Promise<void> {
        if (!this.isEnabled || !this.worktreeManager) return;

        try {
            const worktreePath = this.worktreeManager.getWorktreePath(data.agentId);
            if (worktreePath) {
                await this.handleOrphanedWorktree(data.agentId);
            }
        } catch (error) {
            this.loggingService.error('AutoWorktreeManager: Error handling removed agent', error);
        }
    }

    private shouldCreateWorktree(agent: Agent): boolean {
        // Don't create worktrees for certain agent types or temporary agents
        if (agent.type === 'conductor' || agent.type === 'temporary') {
            return false;
        }

        // Check if we have enough active agents to warrant worktrees
        const activeAgents = this.agentManager.getActiveAgents();
        return activeAgents.length >= 2; // Only use worktrees with multiple agents
    }

    private async createWorktreeForAgent(agent: Agent): Promise<void> {
        if (!this.worktreeManager) return;

        try {
            this.loggingService.info(`AutoWorktreeManager: Creating worktree for ${agent.name}`);

            const worktreePath = await this.worktreeManager.createWorktreeForAgent(agent);

            // Show subtle notification
            await this.showWorktreeCreatedNotification(agent.name, worktreePath);
        } catch (error) {
            this.loggingService.warn(
                `AutoWorktreeManager: Failed to create worktree for ${agent.name}, using main workspace`,
                error
            );

            // Show error notification but don't throw - agent can work in main workspace
            await this.showWorktreeCreationFailedNotification(agent.name, error);
        }
    }

    private async handleOrphanedWorktree(agentId: string): Promise<void> {
        if (!this.worktreeManager) return;

        try {
            // Give user a chance to save work
            const action = await this.notificationService.showWarning(
                'Agent removed with unsaved work in worktree. What would you like to do?',
                'Merge Work',
                'Discard',
                'Keep Worktree'
            );

            switch (action) {
                case 'Merge Work':
                    await this.worktreeManager.mergeAgentWork(agentId);
                    await this.worktreeManager.removeWorktreeForAgent(agentId);
                    break;
                case 'Discard':
                    await this.worktreeManager.removeWorktreeForAgent(agentId);
                    break;
                case 'Keep Worktree':
                    // Do nothing - leave worktree for manual cleanup
                    break;
                default:
                    // Default action after timeout - keep worktree safe
                    this.loggingService.info(
                        `AutoWorktreeManager: Keeping worktree for removed agent ${agentId} (no user action)`
                    );
                    break;
            }
        } catch (error) {
            this.loggingService.error('AutoWorktreeManager: Error handling orphaned worktree', error);
        }
    }

    private startBackgroundCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(async () => {
            await this.performBackgroundCleanup();
        }, this.cleanupInterval);

        // Perform initial cleanup after a short delay
        setTimeout(() => this.performBackgroundCleanup(), 5000);
    }

    private async performBackgroundCleanup(): Promise<void> {
        if (!this.cleanupService) return;

        try {
            this.loggingService.debug('AutoWorktreeManager: Starting background cleanup');

            const options: CleanupOptions = {
                removeOrphanedWorktrees: true,
                removeUnusedBranches: false, // Be conservative in background
                removeOldBackups: false,
                dryRun: false
            };

            const result = await this.cleanupService.performCleanup(options);

            this.lastCleanupStats = {
                lastCleanup: new Date(),
                itemsRemoved: result.worktreesRemoved + result.branchesRemoved + result.backupsRemoved,
                spaceSaved: result.spaceSaved,
                issuesDetected: result.errors.length
            };

            if (result.worktreesRemoved > 0) {
                this.loggingService.info(
                    `AutoWorktreeManager: Background cleanup removed ${result.worktreesRemoved} orphaned worktrees`
                );
                await this.showBackgroundCleanupNotification(result);
            }
        } catch (error) {
            this.loggingService.error('AutoWorktreeManager: Background cleanup failed', error);
        }
    }

    private startHealthMonitoring(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        this.healthCheckTimer = setInterval(async () => {
            await this.performHealthCheck();
        }, this.healthCheckInterval);
    }

    private async performHealthCheck(): Promise<void> {
        if (!this.worktreeManager || !this.cleanupService) return;

        try {
            const recommendations = await this.cleanupService.getCleanupRecommendations();

            if (recommendations.severity === 'high' && recommendations.recommendations.length > 0) {
                await this.showHealthWarningNotification(recommendations);
            }
        } catch (error) {
            this.loggingService.error('AutoWorktreeManager: Health check failed', error);
        }
    }

    private handleConfigurationChange(): void {
        const newEnabled = this.configService.get('autoManageWorktrees', true);

        if (newEnabled !== this.isEnabled) {
            this.isEnabled = newEnabled;

            if (this.isEnabled) {
                this.loggingService.info('AutoWorktreeManager: Automatic management enabled');
                this.initialize(); // Reinitialize
            } else {
                this.loggingService.info('AutoWorktreeManager: Automatic management disabled');
                this.stopBackgroundProcesses();
            }
        }
    }

    private stopBackgroundProcesses(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }

        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }
    }

    // Smart notification methods that don't overwhelm the user

    private async showWorktreeUnavailableNotification(): Promise<void> {
        const action = await this.notificationService.showWarning(
            'Git worktrees are not available in this workspace. Agents will use the main workspace.',
            'Learn More',
            'Dismiss'
        );

        if (action === 'Learn More') {
            vscode.env.openExternal(vscode.Uri.parse('https://git-scm.com/docs/git-worktree'));
        }
    }

    private async showWorktreeCreatedNotification(agentName: string, worktreePath: string): Promise<void> {
        // Only show notification for the first few worktrees to avoid spam
        const activeWorktrees = this.agentManager
            .getActiveAgents()
            .filter(a => this.worktreeManager?.getWorktreePath(a.id)).length;

        if (activeWorktrees <= 2) {
            const action = await this.notificationService.showInformation(
                `🌳 Created isolated workspace for ${agentName}`,
                'View Worktrees',
                'Dismiss'
            );

            if (action === 'View Worktrees') {
                vscode.commands.executeCommand('nofx.showWorktreeStats');
            }
        }
    }

    private async showWorktreeCreationFailedNotification(agentName: string, error: any): Promise<void> {
        const message = error instanceof Error ? error.message : 'Unknown error';

        await this.notificationService.showWarning(
            `Could not create isolated workspace for ${agentName}. Using main workspace. (${message})`,
            'OK'
        );
    }

    private async showBackgroundCleanupNotification(result: any): Promise<void> {
        // Only show if significant cleanup occurred
        if (result.worktreesRemoved >= 3) {
            await this.notificationService.showInformation(
                `🧹 Automatic cleanup: Removed ${result.worktreesRemoved} unused worktrees (${result.spaceSaved} recovered)`
            );
        }
    }

    private async showHealthWarningNotification(recommendations: any): Promise<void> {
        const action = await this.notificationService.showWarning(
            `⚠️ Worktree issues detected: ${recommendations.recommendations.join(', ')}. Run cleanup?`,
            'Run Cleanup',
            'View Details',
            'Dismiss'
        );

        if (action === 'Run Cleanup') {
            vscode.commands.executeCommand('nofx.cleanupWorktrees');
        } else if (action === 'View Details') {
            vscode.commands.executeCommand('nofx.worktreeHealthCheck');
        }
    }

    private async showInitialStatus(): Promise<void> {
        if (!this.worktreeManager) return;

        try {
            const activeAgents = this.agentManager.getActiveAgents();
            const agentsWithWorktrees = activeAgents.filter(a => this.worktreeManager?.getWorktreePath(a.id));

            if (agentsWithWorktrees.length > 0) {
                this.loggingService.info(`AutoWorktreeManager: Managing ${agentsWithWorktrees.length} agent worktrees`);
            }
        } catch (error) {
            // Ignore errors in status display
        }
    }

    // Public methods for manual control when needed

    public async getStats(): Promise<{
        enabled: boolean;
        totalWorktrees: number;
        activeAgents: number;
        lastCleanup?: Date;
        spaceSaved?: string;
    }> {
        const activeAgents = this.agentManager.getActiveAgents();
        const totalWorktrees = this.worktreeManager
            ? activeAgents.filter(a => this.worktreeManager?.getWorktreePath(a.id)).length
            : 0;

        return {
            enabled: this.isEnabled,
            totalWorktrees,
            activeAgents: activeAgents.length,
            lastCleanup: this.lastCleanupStats?.lastCleanup,
            spaceSaved: this.lastCleanupStats?.spaceSaved
        };
    }

    public async forceCleanup(): Promise<void> {
        if (this.cleanupService) {
            await this.performBackgroundCleanup();
        }
    }

    public async forceHealthCheck(): Promise<void> {
        await this.performHealthCheck();
    }

    public dispose(): void {
        this.stopBackgroundProcesses();

        // Dispose all event subscriptions
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        this.loggingService.info('AutoWorktreeManager: Disposed');
    }
}
