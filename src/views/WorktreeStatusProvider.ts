import * as vscode from 'vscode';
import * as path from 'path';
import { WorktreeManager } from '../worktrees/WorktreeManager';
import { AgentManager } from '../agents/AgentManager';
import { ILoggingService } from '../services/interfaces';

export class WorktreeStatusProvider implements vscode.TreeDataProvider<WorktreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WorktreeItem | undefined | null | void> = new vscode.EventEmitter<
        WorktreeItem | undefined | null | void
    >();
    readonly onDidChangeTreeData: vscode.Event<WorktreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private refreshTimer?: NodeJS.Timeout;

    constructor(
        private worktreeManager: WorktreeManager,
        private agentManager: AgentManager,
        private loggingService?: ILoggingService
    ) {
        // Auto-refresh every 10 seconds
        this.startAutoRefresh();

        // Listen to agent changes
        this.agentManager.onAgentUpdate(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private startAutoRefresh(): void {
        this.refreshTimer = setInterval(() => {
            this.refresh();
        }, 10000); // Refresh every 10 seconds
    }

    dispose(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
    }

    getTreeItem(element: WorktreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WorktreeItem): Promise<WorktreeItem[]> {
        if (!element) {
            // Root level - show worktree summary
            return this.getWorktreeRootItems();
        }

        if (element.contextValue === 'worktree-container') {
            // Show individual worktrees
            return this.getWorktreeItems();
        }

        return [];
    }

    private async getWorktreeRootItems(): Promise<WorktreeItem[]> {
        const items: WorktreeItem[] = [];

        try {
            const worktrees = await this.worktreeManager.listWorktreesInfo();
            const agentWorktrees = worktrees.filter(w => w.agentId);

            if (agentWorktrees.length > 0) {
                const containerItem = new WorktreeItem(
                    `Active Worktrees (${agentWorktrees.length})`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'worktree-container'
                );
                containerItem.iconPath = new vscode.ThemeIcon('git-branch');
                containerItem.description = `${agentWorktrees.length} agent${agentWorktrees.length === 1 ? '' : 's'} working`;
                items.push(containerItem);
            } else {
                const noWorktreesItem = new WorktreeItem(
                    'No Active Worktrees',
                    vscode.TreeItemCollapsibleState.None,
                    'no-worktrees'
                );
                noWorktreesItem.iconPath = new vscode.ThemeIcon('circle-outline');
                noWorktreesItem.description = 'All agents using main workspace';
                items.push(noWorktreesItem);
            }
        } catch (error) {
            const errorItem = new WorktreeItem(
                'Error Loading Worktrees',
                vscode.TreeItemCollapsibleState.None,
                'error'
            );
            errorItem.iconPath = new vscode.ThemeIcon('error');
            errorItem.description = error instanceof Error ? error.message : 'Unknown error';
            items.push(errorItem);
        }

        return items;
    }

    private async getWorktreeItems(): Promise<WorktreeItem[]> {
        const items: WorktreeItem[] = [];

        try {
            const worktrees = await this.worktreeManager.listWorktreesInfo();
            const agents = this.agentManager.getActiveAgents();

            for (const worktree of worktrees) {
                if (worktree.agentId) {
                    const agent = agents.find(a => a.id === worktree.agentId);
                    const agentName = agent?.name || 'Unknown Agent';

                    const item = new WorktreeItem(
                        agentName,
                        vscode.TreeItemCollapsibleState.None,
                        'worktree-item',
                        worktree.agentId
                    );

                    // Set icon based on agent status
                    if (agent && (agent.status === 'working' || agent.status === 'online')) {
                        item.iconPath = new vscode.ThemeIcon('loading~spin');
                        item.description = `Working on ${worktree.branch}`;
                    } else {
                        item.iconPath = new vscode.ThemeIcon('circle-filled');
                        item.description = `Idle on ${worktree.branch}`;
                    }

                    // Add tooltip with detailed info
                    item.tooltip = new vscode.MarkdownString(
                        [
                            `**Agent:** ${agentName}`,
                            `**Branch:** ${worktree.branch}`,
                            `**Path:** ${worktree.directory}`,
                            `**Status:** ${agent?.status || 'Unknown'}`,
                            agent?.currentTask ? `**Current Task:** ${agent.currentTask.description}` : ''
                        ]
                            .filter(Boolean)
                            .join('\n\n')
                    );

                    // Add commands
                    item.command = {
                        command: 'nofx.openWorktreeInTerminal',
                        title: 'Open in Terminal',
                        arguments: [worktree.directory]
                    };

                    items.push(item);
                }
            }
        } catch (error) {
            this.loggingService?.error('Error getting worktree items:', error);
        }

        return items.sort((a, b) => a.label!.localeCompare(b.label as string));
    }
}

export class WorktreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly agentId?: string
    ) {
        super(label, collapsibleState);
    }
}
