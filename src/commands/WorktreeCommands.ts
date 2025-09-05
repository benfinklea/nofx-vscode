import * as vscode from 'vscode';
import {
    ICommandHandler,
    IContainer,
    ICommandService,
    INotificationService,
    IConfigurationService,
    SERVICE_TOKENS,
    CONFIG_KEYS
} from '../services/interfaces';
import { PickItem } from '../types/ui';
import { AgentManager } from '../agents/AgentManager';
import { WorktreeManager } from '../worktrees/WorktreeManager';

export class WorktreeCommands implements ICommandHandler {
    private readonly agentManager: AgentManager;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;

    constructor(container: IContainer) {
        this.agentManager = container.resolve<AgentManager>(SERVICE_TOKENS.AgentManager);
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
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

        const worktreeManager = new WorktreeManager(workspaceFolder.uri.fsPath);
        const agentWorktrees = await worktreeManager.listWorktreesInfo();

        if (agentWorktrees.length === 0) {
            await this.notificationService.showInformation('No agent worktrees found');
            return;
        }

        // Let user select which agent work to merge
        const items: PickItem<{ agentId: string; directory: string; branch: string }>[] = agentWorktrees.map(w => {
            const agent = w.agentId ? this.agentManager.getAgent(w.agentId) : null;
            const agentName = agent?.name || w.branch.replace(/^agent-/, '').split('-')[0];
            return {
                label: agentName,
                description: w.branch,
                detail: `Path: ${w.directory}`,
                value: { agentId: w.agentId || '', directory: w.directory, branch: w.branch }
            };
        });

        const selected = await this.notificationService.showQuickPick(items, {
            placeHolder: 'Select agent work to merge'
        });

        if (!selected) {
            return;
        }

        const worktree = selected.value;

        await this.notificationService.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Merging work from ${worktree.branch}...`,
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Merging agent work...', increment: 50 });
                
                if (worktree.agentId) {
                    // Merge the agent's work
                    await worktreeManager.mergeAgentWork(worktree.agentId);
                    
                    progress.report({ message: 'Cleaning up worktree...', increment: 25 });
                    
                    // Optionally remove the worktree after successful merge
                    const cleanup = await this.notificationService.confirm(
                        'Successfully merged! Remove the agent worktree?',
                        'Remove'
                    );
                    
                    if (cleanup) {
                        await worktreeManager.removeWorktreeForAgent(worktree.agentId);
                        
                        // Also remove the agent from the manager
                        const agent = this.agentManager.getAgent(worktree.agentId);
                        if (agent) {
                            await this.agentManager.removeAgent(agent.id);
                        }
                    }
                    
                    await this.notificationService.showInformation('Agent work successfully merged!');
                } else {
                    await this.notificationService.showError(
                        'Cannot merge: Agent ID not found for this worktree'
                    );
                }
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