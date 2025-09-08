import * as vscode from 'vscode';
import { ITreeStateManager, IUIStateManager } from '../services/interfaces';
import { normalizeAgentStatus, normalizeTaskStatus } from '../types/ui';
import { TaskToolBridge, TaskRequest } from '../services/TaskToolBridge';

export class AgentTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private treeStateManager: ITreeStateManager,
        private uiStateManager: IUIStateManager,
        private taskToolBridge?: TaskToolBridge
    ) {
        // Subscribe to tree state changes
        this.disposables.push(
            this.treeStateManager.subscribe(() => {
                this._onDidChangeTreeData.fire();
            })
        );

        // Subscribe to UI state changes
        this.disposables.push(
            this.uiStateManager.subscribe(() => {
                this._onDidChangeTreeData.fire();
            })
        );

        // Subscribe to sub-agent task changes
        if (this.taskToolBridge) {
            const refreshTreeView = () => this._onDidChangeTreeData.fire();

            this.taskToolBridge.on('taskStarted', refreshTreeView);
            this.taskToolBridge.on('taskCompleted', refreshTreeView);
            this.taskToolBridge.on('taskCancelled', refreshTreeView);
            this.taskToolBridge.on('taskFailed', refreshTreeView);

            // Clean up event listeners on dispose
            this.disposables.push({
                dispose: () => {
                    if (this.taskToolBridge) {
                        this.taskToolBridge.removeListener('taskStarted', refreshTreeView);
                        this.taskToolBridge.removeListener('taskCompleted', refreshTreeView);
                        this.taskToolBridge.removeListener('taskCancelled', refreshTreeView);
                        this.taskToolBridge.removeListener('taskFailed', refreshTreeView);
                    }
                }
            });
        }
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        if (!element) {
            // Get pure data from TreeStateManager and handle presentation here
            const data = this.treeStateManager.getSectionItems();
            return Promise.resolve(this.createTreeItemsFromData(data));
        }

        // Handle expanding team section
        if (element instanceof TeamSectionItem) {
            return Promise.resolve(
                element.agents.map(agent => {
                    const subAgents = this.taskToolBridge ? this.taskToolBridge.getAgentTasks(agent.id) : [];
                    return new AgentItem(agent, subAgents);
                })
            );
        }

        // Handle expanding agent to show sub-agents
        if (element instanceof AgentItem) {
            return Promise.resolve(element.subAgentTasks.map(task => new SubAgentItem(task)));
        }

        return Promise.resolve([]);
    }

    private createTreeItemsFromData(data: any): TreeItem[] {
        const items: TreeItem[] = [];

        // Add agents section with sub-agent information
        if (data.agents && data.agents.length > 0) {
            const isExpanded = this.treeStateManager.isSectionExpanded('teamSection');
            // Enhance agents with sub-agent information
            const agentsWithSubAgents = data.agents.map((agent: any) => {
                const subAgents = this.taskToolBridge ? this.taskToolBridge.getAgentTasks(agent.id) : [];
                return { ...agent, subAgentCount: subAgents.length };
            });
            items.push(new TeamSectionItem(data.teamName, 'organization', agentsWithSubAgents, isExpanded));
        }

        // Add tasks section
        if (data.tasks && data.tasks.length > 0) {
            items.push(new SectionItem('Tasks', 'tasklist'));

            // Show active tasks first, then pending tasks
            const activeTasks = data.tasks.filter(
                (t: any) =>
                    normalizeTaskStatus(t.status) === 'in-progress' || normalizeTaskStatus(t.status) === 'assigned'
            );
            const pendingTasks = data.tasks.filter((t: any) => normalizeTaskStatus(t.status) === 'queued');

            if (activeTasks.length > 0) {
                items.push(...activeTasks.map((task: any) => new TaskItem(task, true)));
            }

            if (pendingTasks.length > 0) {
                items.push(...pendingTasks.map((task: any) => new TaskItem(task, false)));
            }
        }

        // Show message if no data
        if (!data.hasData) {
            items.push(new MessageItem('No agents or tasks available'));
        }

        return items;
    }

    private createTreeItem(item: any): TreeItem {
        // Legacy method - kept for backward compatibility
        if (item.type === 'teamSection') {
            const isExpanded = this.treeStateManager.isSectionExpanded('teamSection');
            return new TeamSectionItem(item.label, item.icon, item.agents, isExpanded);
        } else if (item.type === 'section') {
            return new SectionItem(item.label, item.icon);
        } else if (item.type === 'agent') {
            return new AgentItem(item.agent);
        } else if (item.type === 'task') {
            return new TaskItem(item.task, item.isActive);
        } else if (item.type === 'message') {
            return new MessageItem(item.message);
        }

        // Fallback
        return new SectionItem(item.label || 'Unknown', 'question');
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setTeamName(name: string): void {
        this.treeStateManager.setTeamName(name);
    }

    dispose(): void {
        // Dispose all subscriptions
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Dispose event emitter
        this._onDidChangeTreeData.dispose();
    }
}

// Base class for tree items
abstract class TreeItem extends vscode.TreeItem {}

// Section header item
class SectionItem extends TreeItem {
    constructor(label: string, icon: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'section';
    }
}

// Team section header item (collapsible)
class TeamSectionItem extends TreeItem {
    constructor(
        label: string,
        icon: string,
        public readonly agents: any[],
        isExpanded: boolean = true
    ) {
        super(label, isExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'teamSection';
        this.tooltip = `${label} (${agents.length} agents)`;

        // Add command to open conductor when clicking team name
        this.command = {
            command: 'nofx.openConductorTerminal',
            title: 'Open Conductor',
            arguments: []
        };
    }
}

// Message item for empty states
class MessageItem extends TreeItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('info');
        this.contextValue = 'message';
    }
}

// Agent item
class AgentItem extends TreeItem {
    constructor(
        public readonly agent: any,
        public readonly subAgentTasks: TaskRequest[] = []
    ) {
        // Determine collapsible state based on sub-agents
        const collapsibleState =
            subAgentTasks.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;

        // Call super first
        super(`  ${agent.name}`, collapsibleState);

        // Then update label with activity status indicator
        const statusIndicator = this.getActivityStatusIndicator(agent.activityStatus);
        this.label = `  ${statusIndicator} ${agent.name}`;

        // Enhanced tooltip with activity status and sub-agents info
        const activityStatusText = this.getActivityStatusText(agent.activityStatus);
        const subAgentInfo = subAgentTasks.length > 0 ? `\nSub-agents: ${subAgentTasks.length}` : '';
        this.tooltip = `${agent.name} (${agent.type})\nStatus: ${activityStatusText}${subAgentInfo}`;

        // Normalize agent status for consistent display
        console.log(`[NofX Debug] Agent ${agent.name} raw status: ${agent.status}, activity: ${agent.activityStatus}`);
        const normalizedStatus = normalizeAgentStatus(agent.status);
        console.log(`[NofX Debug] Agent ${agent.name} normalized status: ${normalizedStatus}`);

        // Enhanced description based on both operational and activity status
        this.description = this.getAgentDescription(normalizedStatus, agent.activityStatus, agent.currentTask);

        // Set icon based on activity status (priority) or operational status
        this.iconPath = this.getAgentIcon(agent.activityStatus || normalizedStatus);

        // Set context value for context menu
        this.contextValue = 'agent';

        // Add command to open terminal when clicking agent
        this.command = {
            command: 'nofx.focusAgentTerminal',
            title: 'Focus Agent Terminal',
            arguments: [agent.id]
        };
    }

    private getActivityStatusIndicator(activityStatus?: string): string {
        const indicators: { [key: string]: string } = {
            active: '🟢', // Currently working (output detected)
            waiting: '🟡', // Awaiting user input/permission
            thinking: '🔵', // No output but recently active
            inactive: '🟠', // No activity for 30+ seconds
            stuck: '🔴', // Needs immediate attention (2+ minutes)
            permission: '⚠️', // Claude asking for permission
            completed: '✅', // Task completed
            error: '❌' // Error detected
        };
        return indicators[activityStatus || ''] || '';
    }

    private getActivityStatusText(activityStatus?: string): string {
        const statusTexts: { [key: string]: string } = {
            active: 'Active - Currently working',
            waiting: 'Waiting - Awaiting user input',
            thinking: 'Thinking - Processing',
            inactive: 'Inactive - No activity for 30+ seconds',
            stuck: 'Stuck - Needs immediate attention',
            permission: 'Permission Required',
            completed: 'Task Completed',
            error: 'Error Detected'
        };
        return statusTexts[activityStatus || ''] || 'Unknown';
    }

    private getAgentDescription(normalizedStatus: string, activityStatus?: string, currentTask?: any): string {
        // Priority: Show activity status if critical, otherwise operational status
        if (activityStatus === 'stuck' || activityStatus === 'error' || activityStatus === 'permission') {
            return this.getActivityStatusText(activityStatus);
        }

        if (normalizedStatus === 'working' && currentTask) {
            return `Working on: ${currentTask.title}`;
        }

        if (activityStatus === 'inactive' || activityStatus === 'waiting') {
            return this.getActivityStatusText(activityStatus);
        }

        return normalizedStatus === 'offline'
            ? 'Offline'
            : normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
    }

    private getAgentIcon(status: string): vscode.ThemeIcon {
        // Map activity statuses to appropriate theme icons
        const iconMap: { [key: string]: string } = {
            active: 'debug-start',
            working: 'debug-start',
            waiting: 'watch',
            thinking: 'loading~spin',
            inactive: 'warning',
            stuck: 'error',
            permission: 'shield',
            completed: 'pass',
            error: 'error',
            idle: 'check',
            offline: 'circle-outline'
        };

        return new vscode.ThemeIcon(iconMap[status] || 'circle-outline');
    }
}

// Sub-Agent item
class SubAgentItem extends TreeItem {
    constructor(public readonly task: TaskRequest) {
        const shortDescription =
            task.description.length > 40 ? task.description.substring(0, 37) + '...' : task.description;

        super(`    🤖 ${shortDescription}`, vscode.TreeItemCollapsibleState.None);

        this.tooltip = `Sub-Agent Task\nType: ${task.type}\nDescription: ${task.description}\nCreated: ${task.createdAt.toLocaleTimeString()}`;

        // Set icon based on sub-agent type
        this.iconPath = this.getSubAgentIcon(task.type);

        // Add subtle description for task status
        this.description = this.getTaskStatusDescription(task);

        this.contextValue = 'subAgent';
    }

    private getSubAgentIcon(type: string): vscode.ThemeIcon {
        const iconMap: { [key: string]: string } = {
            'general-purpose': 'tools',
            'code-lead-reviewer': 'checklist',
            'statusline-setup': 'settings-gear',
            'output-style-setup': 'paintcan'
        };

        return new vscode.ThemeIcon(iconMap[type] || 'robot');
    }

    private getTaskStatusDescription(task: TaskRequest): string {
        const elapsed = Date.now() - task.createdAt.getTime();
        const seconds = Math.floor(elapsed / 1000);

        if (seconds < 60) {
            return `${seconds}s ago`;
        } else {
            const minutes = Math.floor(seconds / 60);
            return `${minutes}m ago`;
        }
    }
}

// Task item
class TaskItem extends TreeItem {
    constructor(
        public readonly task: any,
        isActive: boolean
    ) {
        super(`  ${task.title}`, vscode.TreeItemCollapsibleState.None);

        this.tooltip = task.description || task.title;
        this.description = isActive ? 'In Progress' : `Priority: ${task.priority}`;

        // Set icon based on status
        this.iconPath = new vscode.ThemeIcon(
            isActive
                ? 'sync~spin'
                : task.priority === 'high'
                  ? 'warning'
                  : task.priority === 'medium'
                    ? 'circle-filled'
                    : 'circle-outline'
        );

        this.contextValue = 'task';
    }
}
