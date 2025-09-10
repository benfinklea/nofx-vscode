import * as vscode from 'vscode';
import { ServiceLocator } from '../services/ServiceLocator';
import { getAppStateStore } from '../state/AppStateStore';
import * as selectors from '../state/selectors';
import * as actions from '../state/actions';

/**
 * Unified Tree Provider - Single tree for all NofX data
 * Combines agents, tasks, and templates into one view
 */
export class UnifiedTreeProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private store = getAppStateStore();

    constructor() {
        // Listen to state changes
        this.store.on('stateChanged', () => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (!element) {
            // Root level - show categories
            return Promise.resolve([
                new CategoryNode('Agents', 'agent-category', vscode.TreeItemCollapsibleState.Expanded),
                new CategoryNode('Tasks', 'task-category', vscode.TreeItemCollapsibleState.Expanded),
                new CategoryNode('Templates', 'template-category', vscode.TreeItemCollapsibleState.Collapsed)
            ]);
        }

        // Get children based on category
        switch (element.contextValue) {
            case 'agent-category':
                return this.getAgents();
            case 'task-category':
                return this.getTasks();
            case 'template-category':
                return this.getTemplates();
            default:
                return Promise.resolve([]);
        }
    }

    private async getAgents(): Promise<TreeNode[]> {
        const agents = selectors.getActiveAgents(this.store.getState('agents') as any);
        return agents.map(agent => new AgentNode(agent));
    }

    private async getTasks(): Promise<TreeNode[]> {
        const tasks = selectors.getActiveTasks(this.store.getState('tasks') as any);
        return tasks.map(task => new TaskNode(task));
    }

    private async getTemplates(): Promise<TreeNode[]> {
        // Get available templates
        return [];
    }
}

// Tree node types
abstract class TreeNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly contextValue: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

class CategoryNode extends TreeNode {
    constructor(label: string, contextValue: string, state: vscode.TreeItemCollapsibleState) {
        super(label, contextValue, state);
        this.iconPath = new vscode.ThemeIcon(this.getIconForCategory());
    }

    private getIconForCategory(): string {
        switch (this.contextValue) {
            case 'agent-category':
                return 'person';
            case 'task-category':
                return 'checklist';
            case 'template-category':
                return 'file-code';
            default:
                return 'folder';
        }
    }
}

class AgentNode extends TreeNode {
    constructor(public agent: any) {
        super(agent.name, 'agent', vscode.TreeItemCollapsibleState.None);
        this.description = agent.status;
        this.iconPath = new vscode.ThemeIcon('person');
        this.command = {
            command: 'nofx.selectAgent',
            title: 'Select Agent',
            arguments: [agent]
        };
    }
}

class TaskNode extends TreeNode {
    constructor(public task: any) {
        super(task.title, 'task', vscode.TreeItemCollapsibleState.None);
        this.description = task.status;
        this.iconPath = new vscode.ThemeIcon('check');
        this.command = {
            command: 'nofx.selectTask',
            title: 'Select Task',
            arguments: [task]
        };
    }
}
