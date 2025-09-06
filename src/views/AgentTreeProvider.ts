import * as vscode from 'vscode';
import { ITreeStateManager, IUIStateManager } from '../services/interfaces';
import { normalizeAgentStatus, normalizeTaskStatus } from '../types/ui';

export class AgentTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private treeStateManager: ITreeStateManager,
        private uiStateManager: IUIStateManager
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
            return Promise.resolve(element.agents.map(agent => new AgentItem(agent)));
        }
        
        return Promise.resolve([]);
    }

    private createTreeItemsFromData(data: any): TreeItem[] {
        const items: TreeItem[] = [];
        
        // Add agents section
        if (data.agents && data.agents.length > 0) {
            const isExpanded = this.treeStateManager.isSectionExpanded('teamSection');
            items.push(new TeamSectionItem(data.teamName, 'organization', data.agents, isExpanded));
        }
        
        // Add tasks section
        if (data.tasks && data.tasks.length > 0) {
            items.push(new SectionItem('Tasks', 'tasklist'));
            
            // Show active tasks first, then pending tasks
            const activeTasks = data.tasks.filter((t: any) => normalizeTaskStatus(t.status) === 'in-progress' || normalizeTaskStatus(t.status) === 'assigned');
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
    constructor(label: string, icon: string, public readonly agents: any[], isExpanded: boolean = true) {
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
    constructor(public readonly agent: any) {
        super(`  ${agent.name}`, vscode.TreeItemCollapsibleState.None);
        
        this.tooltip = `${agent.name} (${agent.type})`;
        
        // Normalize agent status for consistent display
        const normalizedStatus = normalizeAgentStatus(agent.status);
        this.description = normalizedStatus === 'working' 
            ? `Working on: ${agent.currentTask?.title}`
            : normalizedStatus;
        
        // Set icon based on normalized status
        this.iconPath = new vscode.ThemeIcon(
            normalizedStatus === 'working' ? 'debug-start' : 
            normalizedStatus === 'idle' ? 'check' : 
            normalizedStatus === 'error' ? 'error' : 'circle-outline'
        );
        
        // Set context value for context menu
        this.contextValue = 'agent';
        
        // Add command to open terminal when clicking agent
        this.command = {
            command: 'nofx.focusAgentTerminal',
            title: 'Focus Agent Terminal',
            arguments: [agent.id]
        };
    }
}

// Task item
class TaskItem extends TreeItem {
    constructor(public readonly task: any, isActive: boolean) {
        super(`  ${task.title}`, vscode.TreeItemCollapsibleState.None);
        
        this.tooltip = task.description || task.title;
        this.description = isActive ? 'In Progress' : `Priority: ${task.priority}`;
        
        // Set icon based on status
        this.iconPath = new vscode.ThemeIcon(
            isActive ? 'sync~spin' : 
            task.priority === 'high' ? 'warning' :
            task.priority === 'medium' ? 'circle-filled' : 'circle-outline'
        );
        
        this.contextValue = 'task';
    }
}