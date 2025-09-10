import * as vscode from 'vscode';
import { Agent } from '../agents/types';
import { ServiceLocator } from '../services/ServiceLocator';

export class AgentTreeProvider implements vscode.TreeDataProvider<AgentTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<AgentTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private uiStateManager?: any,
        private agentStateManager?: any,
        private taskToolBridge?: any
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AgentTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AgentTreeItem): Thenable<AgentTreeItem[]> {
        if (!element) {
            // Root level - show agents
            const agentManager = ServiceLocator.tryGet('AgentManager') as any;
            if (!agentManager) {
                return Promise.resolve([]);
            }

            const agents = agentManager.getActiveAgents();
            return Promise.resolve(
                agents.map(
                    (agent: Agent) =>
                        new AgentTreeItem(agent.name, agent.status, vscode.TreeItemCollapsibleState.None, agent)
                )
            );
        }
        return Promise.resolve([]);
    }
}

class AgentTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly status: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly agent?: Agent
    ) {
        super(label, collapsibleState);
        this.description = status;
        this.iconPath = new vscode.ThemeIcon('person');
        this.contextValue = 'agent';

        if (agent) {
            this.command = {
                command: 'nofx.focusAgentTerminal',
                title: 'Focus Terminal',
                arguments: [agent.id]
            };
        }
    }
}
