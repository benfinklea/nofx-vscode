import * as vscode from 'vscode';
import { ITreeStateManager, IUIStateManager } from '../services/interfaces';

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
            // Delegate to TreeStateManager for root items
            const sectionItems = this.treeStateManager.getSectionItems();
            return Promise.resolve(sectionItems.map(item => this.createTreeItem(item)));
        }
        
        // Handle expanding team section
        if (element instanceof TeamSectionItem) {
            return Promise.resolve(element.agents.map(agent => new AgentItem(agent)));
        }
        
        return Promise.resolve([]);
    }

    private createTreeItem(item: any): TreeItem {
        // Convert TreeStateManager items to TreeItems
        if (item.type === 'teamSection') {
            const isExpanded = this.treeStateManager.expandedSections?.has('teamSection') ?? true;
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
        this.description = agent.status === 'working' 
            ? `Working on: ${agent.currentTask?.title}`
            : agent.status;
        
        // Set icon based on status
        this.iconPath = new vscode.ThemeIcon(
            agent.status === 'working' ? 'debug-start' : 
            agent.status === 'idle' ? 'check' : 
            agent.status === 'error' ? 'error' : 'circle-outline'
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