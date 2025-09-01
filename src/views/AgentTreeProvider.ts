import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { Agent } from '../agents/types';

export class AgentTreeProvider implements vscode.TreeDataProvider<AgentItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<AgentItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private agentManager: AgentManager) {
        agentManager.onAgentUpdate(() => {
            this._onDidChangeTreeData.fire();
        });
    }

    getTreeItem(element: AgentItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AgentItem): Thenable<AgentItem[]> {
        if (!element) {
            // Return root level items (agents)
            const agents = this.agentManager.getActiveAgents();
            return Promise.resolve(
                agents.map(agent => new AgentItem(agent))
            );
        }
        return Promise.resolve([]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

class AgentItem extends vscode.TreeItem {
    constructor(public readonly agent: Agent) {
        super(agent.name, vscode.TreeItemCollapsibleState.None);
        
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
        
        // Add command to handle clicks
        this.command = {
            command: 'nofx.editAgent',
            title: 'Edit Agent',
            arguments: [agent.id]
        };
    }
}