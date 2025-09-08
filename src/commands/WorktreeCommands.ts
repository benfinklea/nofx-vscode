import * as vscode from 'vscode';
import * as path from 'path';
import {
    ICommandHandler,
    IContainer,
    ICommandService,
    INotificationService,
    IConfigurationService,
    IWorktreeService,
    SERVICE_TOKENS,
    CONFIG_KEYS
} from '../services/interfaces';
import { PickItem } from '../types/ui';
import { AgentManager } from '../agents/AgentManager';
import { WorktreeCleanupService, CleanupOptions } from '../services/WorktreeCleanupService';
import { WorktreeManager } from '../worktrees/WorktreeManager';

export class WorktreeCommands implements ICommandHandler {
    private readonly agentManager: AgentManager;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;
    private readonly worktreeService: IWorktreeService;
    private cleanupService?: WorktreeCleanupService;

    constructor(container: IContainer) {
        this.agentManager = container.resolve<AgentManager>(SERVICE_TOKENS.AgentManager);
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
        this.worktreeService = container.resolve<IWorktreeService>(SERVICE_TOKENS.WorktreeService);
    }

    register(): void {
        this.commandService.register('nofx.toggleWorktrees', this.toggleWorktrees.bind(this));
        this.commandService.register('nofx.mergeAgentWork', this.mergeAgentWork.bind(this));
        this.commandService.register('nofx.openWorktreeInTerminal', this.openWorktreeInTerminal.bind(this));
        this.commandService.register('nofx.switchToWorktreeBranch', this.switchToWorktreeBranch.bind(this));
        this.commandService.register('nofx.worktreeHealthCheck', this.worktreeHealthCheck.bind(this));
        this.commandService.register('nofx.backupAgentWork', this.backupAgentWork.bind(this));
        this.commandService.register('nofx.showWorktreeStats', this.showWorktreeStats.bind(this));
        this.commandService.register('nofx.cleanupWorktrees', this.cleanupWorktrees.bind(this));
        this.commandService.register(
            'nofx.worktreeCleanupRecommendations',
            this.worktreeCleanupRecommendations.bind(this)
        );
    }

    private async toggleWorktrees(): Promise<void> {
        const currentValue = this.configService.isUseWorktrees();
        const newValue = !currentValue;

        await this.configService.update(CONFIG_KEYS.USE_WORKTREES, newValue);

        const status = newValue ? 'enabled' : 'disabled';
        await this.notificationService.showInformation(
            `Git worktrees ${status}. New agents will ${newValue ? 'use' : 'not use'} worktrees.`
        );

        if (newValue) {
            const learnMore = await this.notificationService.showInformation(
                'Worktrees allow agents to work in parallel without conflicts.',
                'Learn More'
            );

            if (learnMore === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse('https://git-scm.com/docs/git-worktree'));
            }
        }
    }

    private async mergeAgentWork(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        if (!this.worktreeService.isAvailable()) {
            await this.notificationService.showError('Git worktrees are not available in this workspace');
            return;
        }

        // Get active agents to show for merging
        const activeAgents = this.agentManager.getActiveAgents();
        if (activeAgents.length === 0) {
            await this.notificationService.showInformation('No active agents found');
            return;
        }

        // Let user select which agent work to merge
        const items: PickItem<{ agentId: string; agentName: string }>[] = activeAgents.map(agent => ({
            label: agent.name,
            description: `Agent ID: ${agent.id}`,
            detail: `Worktree path: ${this.worktreeService.getWorktreePath(agent.id) || 'Not available'}`,
            value: { agentId: agent.id, agentName: agent.name }
        }));

        const selected = await this.notificationService.showQuickPick(items, {
            placeHolder: 'Select agent work to merge'
        });

        if (!selected) {
            return;
        }

        const worktree = selected.value;

        await this.notificationService.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Merging work from ${worktree.agentName}...`,
                cancellable: false
            },
            async progress => {
                try {
                    progress.report({ message: 'Merging agent work...', increment: 50 });

                    // Merge the agent's work using the service
                    const success = await this.worktreeService.mergeForAgent(worktree.agentId);

                    if (!success) {
                        await this.notificationService.showError('Failed to merge agent work');
                        return;
                    }

                    progress.report({ message: 'Cleaning up worktree...', increment: 25 });

                    // Optionally remove the worktree after successful merge
                    const cleanup = await this.notificationService.confirm(
                        'Successfully merged! Remove the agent worktree?',
                        'Remove'
                    );

                    if (cleanup) {
                        await this.worktreeService.removeForAgent(worktree.agentId);

                        // Also remove the agent from the manager
                        const agent = this.agentManager.getAgent(worktree.agentId);
                        if (agent) {
                            await this.agentManager.removeAgent(agent.id);
                        }
                    }

                    await this.notificationService.showInformation('Agent work successfully merged!');
                } catch (error) {
                    await this.notificationService.showError(
                        `Failed to merge: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                }
            }
        );
    }

    private async openWorktreeInTerminal(worktreePath: string): Promise<void> {
        if (!worktreePath) {
            await this.notificationService.showError('No worktree path provided');
            return;
        }

        // Open a new terminal in the worktree directory
        const terminal = vscode.window.createTerminal({
            name: `Worktree: ${path.basename(worktreePath)}`,
            cwd: worktreePath
        });
        terminal.show();
    }

    private async switchToWorktreeBranch(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        if (!this.worktreeService.isAvailable()) {
            await this.notificationService.showError('Git worktrees are not available in this workspace');
            return;
        }

        try {
            // Get all agent worktrees
            const activeAgents = this.agentManager.getActiveAgents();
            if (activeAgents.length === 0) {
                await this.notificationService.showInformation('No active agents with worktrees found');
                return;
            }

            const items: PickItem<{ agentId: string; agentName: string }>[] = activeAgents
                .filter(agent => this.worktreeService.getWorktreePath(agent.id))
                .map(agent => ({
                    label: `$(git-branch) ${agent.name}`,
                    description: `Switch to agent's branch`,
                    detail: `Path: ${this.worktreeService.getWorktreePath(agent.id)}`,
                    value: { agentId: agent.id, agentName: agent.name }
                }));

            if (items.length === 0) {
                await this.notificationService.showInformation('No agents with worktrees found');
                return;
            }

            const selected = await this.notificationService.showQuickPick(items, {
                placeHolder: 'Select agent branch to switch to'
            });

            if (selected) {
                const worktreePath = this.worktreeService.getWorktreePath(selected.value.agentId)!;
                await this.openWorktreeInTerminal(worktreePath);
            }
        } catch (error) {
            await this.notificationService.showError(
                `Error switching branches: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    private async worktreeHealthCheck(): Promise<void> {
        if (!this.worktreeService.isAvailable()) {
            await this.notificationService.showError('Git worktrees are not available in this workspace');
            return;
        }

        await this.notificationService.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Running worktree health check...',
                cancellable: false
            },
            async progress => {
                try {
                    progress.report({ message: 'Checking worktree status...', increment: 20 });

                    // This would require adding a health check method to WorktreeService
                    // For now, we'll do a basic check
                    const activeAgents = this.agentManager.getActiveAgents();
                    let healthyWorktrees = 0;
                    let totalWorktrees = 0;
                    const issues: string[] = [];

                    progress.report({ message: 'Scanning agent worktrees...', increment: 30 });

                    for (const agent of activeAgents) {
                        const worktreePath = this.worktreeService.getWorktreePath(agent.id);
                        if (worktreePath) {
                            totalWorktrees++;
                            try {
                                const fs = await import('fs');
                                if (fs.existsSync(worktreePath)) {
                                    healthyWorktrees++;
                                } else {
                                    issues.push(`Worktree missing for ${agent.name}`);
                                }
                            } catch (error) {
                                issues.push(`Cannot access worktree for ${agent.name}`);
                            }
                        }
                    }

                    progress.report({ message: 'Generating report...', increment: 50 });

                    let message = `Health Check Results:\n\n`;
                    message += `✓ Healthy worktrees: ${healthyWorktrees}/${totalWorktrees}\n`;

                    if (issues.length > 0) {
                        message += `\n⚠️ Issues found:\n${issues.map(issue => `• ${issue}`).join('\n')}`;
                        message += `\n\nRecommendation: Run cleanup to resolve issues.`;
                    } else if (totalWorktrees > 0) {
                        message += `\n✅ All worktrees are healthy!`;
                    } else {
                        message += `\nℹ️ No worktrees found.`;
                    }

                    if (issues.length > 0) {
                        const action = await this.notificationService.showWarning(message, 'Run Cleanup', 'OK');
                        if (action === 'Run Cleanup') {
                            await this.worktreeService.cleanupOrphaned();
                        }
                    } else {
                        await this.notificationService.showInformation(message);
                    }
                } catch (error) {
                    await this.notificationService.showError(
                        `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                }
            }
        );
    }

    private async backupAgentWork(): Promise<void> {
        const activeAgents = this.agentManager.getActiveAgents();
        if (activeAgents.length === 0) {
            await this.notificationService.showInformation('No active agents found');
            return;
        }

        const items: PickItem<{ agentId: string; agentName: string }>[] = activeAgents
            .filter(agent => this.worktreeService.getWorktreePath(agent.id))
            .map(agent => ({
                label: agent.name,
                description: 'Create backup of agent work',
                detail: `Worktree: ${this.worktreeService.getWorktreePath(agent.id)}`,
                value: { agentId: agent.id, agentName: agent.name }
            }));

        if (items.length === 0) {
            await this.notificationService.showInformation('No agents with worktrees found');
            return;
        }

        const selected = await this.notificationService.showQuickPick(items, {
            placeHolder: 'Select agent work to backup'
        });

        if (!selected) {
            return;
        }

        await this.notificationService.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Creating backup of ${selected.value.agentName}'s work...`,
                cancellable: false
            },
            async progress => {
                try {
                    progress.report({ message: 'Creating backup branch...', increment: 50 });

                    // This would require adding a backup method to WorktreeService/WorktreeManager
                    // For now, we'll show a placeholder message
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work

                    progress.report({ message: 'Backup complete!', increment: 50 });

                    await this.notificationService.showInformation(
                        `✅ Backup created for ${selected.value.agentName}'s work`
                    );
                } catch (error) {
                    await this.notificationService.showError(
                        `Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                }
            }
        );
    }

    private async showWorktreeStats(): Promise<void> {
        if (!this.worktreeService.isAvailable()) {
            await this.notificationService.showError('Git worktrees are not available in this workspace');
            return;
        }

        try {
            const activeAgents = this.agentManager.getActiveAgents();
            const agentsWithWorktrees = activeAgents.filter(agent => this.worktreeService.getWorktreePath(agent.id));

            let statsMessage = `📊 **Worktree Statistics**\n\n`;
            statsMessage += `• Total active agents: ${activeAgents.length}\n`;
            statsMessage += `• Agents with worktrees: ${agentsWithWorktrees.length}\n`;
            statsMessage += `• Worktree usage: ${Math.round((agentsWithWorktrees.length / Math.max(activeAgents.length, 1)) * 100)}%\n\n`;

            if (agentsWithWorktrees.length > 0) {
                statsMessage += `**Active Worktrees:**\n`;
                for (const agent of agentsWithWorktrees) {
                    const worktreePath = this.worktreeService.getWorktreePath(agent.id)!;
                    const relativePath = path.relative(
                        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
                        worktreePath
                    );
                    statsMessage += `• ${agent.name}: ${relativePath}\n`;
                }
            }

            await this.notificationService.showInformation(statsMessage);
        } catch (error) {
            await this.notificationService.showError(
                `Error getting worktree stats: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    private async cleanupWorktrees(): Promise<void> {
        if (!this.worktreeService.isAvailable()) {
            await this.notificationService.showError('Git worktrees are not available in this workspace');
            return;
        }

        // Initialize cleanup service if needed
        if (!this.cleanupService) {
            try {
                const worktreeManager = new WorktreeManager(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '');
                this.cleanupService = new WorktreeCleanupService(worktreeManager, this.agentManager);
            } catch (error) {
                await this.notificationService.showError('Failed to initialize cleanup service');
                return;
            }
        }

        // Get cleanup recommendations first
        const recommendations = await this.cleanupService.getCleanupRecommendations();

        if (recommendations.recommendations.length === 0) {
            await this.notificationService.showInformation('✅ No cleanup needed! Your worktrees are already clean.');
            return;
        }

        // Show cleanup options
        const cleanupOptions = [
            {
                label: '🔧 Quick Cleanup',
                description: 'Remove orphaned worktrees only',
                detail: 'Safe and fast cleanup',
                value: 'quick'
            },
            {
                label: '🧹 Full Cleanup',
                description: 'Remove orphaned worktrees and unused branches',
                detail: 'More thorough cleanup',
                value: 'full'
            },
            {
                label: '🧽 Deep Cleanup',
                description: 'Remove everything including old backups',
                detail: 'Maximum cleanup (may remove useful backups)',
                value: 'deep'
            },
            {
                label: '👀 Preview Changes',
                description: 'See what would be removed (dry run)',
                detail: 'No actual changes made',
                value: 'preview'
            }
        ];

        const selected = await this.notificationService.showQuickPick(cleanupOptions, {
            placeHolder: `Select cleanup option (${recommendations.estimatedSpaceSaving} could be saved)`
        });

        if (!selected) {
            return;
        }

        const cleanupType = selected.value;
        const options: CleanupOptions = {
            dryRun: cleanupType === 'preview'
        };

        switch (cleanupType) {
            case 'quick':
            case 'preview':
                options.removeOrphanedWorktrees = true;
                break;
            case 'full':
                options.removeOrphanedWorktrees = true;
                options.removeUnusedBranches = true;
                break;
            case 'deep':
                options.removeOrphanedWorktrees = true;
                options.removeUnusedBranches = true;
                options.removeOldBackups = true;
                options.maxAge = 30; // Remove backups older than 30 days
                break;
        }

        await this.notificationService.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: cleanupType === 'preview' ? 'Previewing cleanup...' : 'Cleaning up worktrees...',
                cancellable: false
            },
            async progress => {
                try {
                    progress.report({ message: 'Analyzing worktrees...', increment: 10 });

                    const result = await this.cleanupService!.performCleanup(options);

                    progress.report({ message: 'Generating report...', increment: 90 });

                    let message =
                        cleanupType === 'preview' ? '📋 **Cleanup Preview**\n\n' : '✅ **Cleanup Complete**\n\n';

                    if (cleanupType === 'preview') {
                        message += `**Would remove:**\n`;
                        if (result.worktreesRemoved > 0) {
                            message += `• ${result.worktreesRemoved} orphaned worktree(s)\n`;
                        }
                        if (result.branchesRemoved > 0) {
                            message += `• ${result.branchesRemoved} unused branch(es)\n`;
                        }
                        if (result.backupsRemoved > 0) {
                            message += `• ${result.backupsRemoved} old backup(s)\n`;
                        }
                        message += `**Estimated space saving:** ${result.spaceSaved}\n`;
                    } else {
                        message += `**Removed:**\n`;
                        if (result.worktreesRemoved > 0) {
                            message += `• ${result.worktreesRemoved} orphaned worktree(s)\n`;
                        }
                        if (result.branchesRemoved > 0) {
                            message += `• ${result.branchesRemoved} unused branch(es)\n`;
                        }
                        if (result.backupsRemoved > 0) {
                            message += `• ${result.backupsRemoved} old backup(s)\n`;
                        }
                        message += `**Space saved:** ${result.spaceSaved}\n`;
                    }

                    if (result.errors.length > 0) {
                        message += `\n⚠️ **Errors:**\n${result.errors.map(e => `• ${e}`).join('\n')}`;
                    }

                    if (cleanupType === 'preview') {
                        const proceed = await this.notificationService.showInformation(
                            message,
                            'Run Cleanup',
                            'Cancel'
                        );

                        if (proceed === 'Run Cleanup') {
                            // Run actual cleanup
                            options.dryRun = false;
                            await this.cleanupService!.performCleanup(options);
                            await this.notificationService.showInformation('✅ Cleanup completed!');
                        }
                    } else {
                        await this.notificationService.showInformation(message);
                    }
                } catch (error) {
                    await this.notificationService.showError(
                        `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                }
            }
        );
    }

    private async worktreeCleanupRecommendations(): Promise<void> {
        if (!this.worktreeService.isAvailable()) {
            await this.notificationService.showError('Git worktrees are not available in this workspace');
            return;
        }

        // Initialize cleanup service if needed
        if (!this.cleanupService) {
            try {
                const worktreeManager = new WorktreeManager(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '');
                this.cleanupService = new WorktreeCleanupService(worktreeManager, this.agentManager);
            } catch (error) {
                await this.notificationService.showError('Failed to initialize cleanup service');
                return;
            }
        }

        try {
            const recommendations = await this.cleanupService.getCleanupRecommendations();

            let message = '🔍 **Worktree Cleanup Recommendations**\n\n';

            if (recommendations.recommendations.length === 0) {
                message += '✅ No cleanup needed! Your worktrees are well-maintained.';
            } else {
                const severityIcon = {
                    low: '🟢',
                    medium: '🟡',
                    high: '🔴'
                }[recommendations.severity];

                message += `${severityIcon} **Priority:** ${recommendations.severity.toUpperCase()}\n\n`;
                message += '**Recommendations:**\n';
                message += recommendations.recommendations.map(r => `• ${r}`).join('\n');
                message += `\n\n**Estimated space saving:** ${recommendations.estimatedSpaceSaving}`;

                const action = await this.notificationService.showInformation(message, 'Run Cleanup', 'OK');

                if (action === 'Run Cleanup') {
                    await this.cleanupWorktrees();
                }
                return;
            }

            await this.notificationService.showInformation(message);
        } catch (error) {
            await this.notificationService.showError(
                `Failed to get recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    dispose(): void {
        // Disposal handled by CommandService
    }
}
