import * as vscode from 'vscode';
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

export class WorktreeCommands implements ICommandHandler {
    private readonly agentManager: AgentManager;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;
    private readonly worktreeService: IWorktreeService;

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

        await this.notificationService.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Merging work from ${worktree.agentName}...`,
            cancellable: false
        }, async (progress) => {
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
        });
    }

    dispose(): void {
        // Disposal handled by CommandService
    }
}
