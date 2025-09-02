import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { Agent, Task } from '../agents/types';
import { TaskQueue } from '../tasks/TaskQueue';

export class AgentTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private teamName: string = 'Active Agents';

    constructor(
        private agentManager: AgentManager,
        private taskQueue?: TaskQueue
    ) {
        agentManager.onAgentUpdate(() => {
            this._onDidChangeTreeData.fire();
        });
        
        if (taskQueue) {
            taskQueue.onTaskUpdate(() => {
                this._onDidChangeTreeData.fire();
            });
        }
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        if (!element) {
            // Return root level items - sections for agents and tasks
            const items: TreeItem[] = [];
            
            // Add agents section with team name
            const agents = this.agentManager.getActiveAgents();
            if (agents.length > 0) {
                // Get team name from global variable
                const teamName = (global as any).currentTeamName || this.teamName;
                items.push(new TeamSectionItem(teamName, 'organization', agents));
            }
            
            // Add tasks section if we have a task queue
            if (this.taskQueue) {
                const pendingTasks = this.taskQueue.getPendingTasks();
                const activeTasks = this.taskQueue.getActiveTasks();
                
                if (pendingTasks.length > 0 || activeTasks.length > 0) {
                    items.push(new SectionItem('Tasks', 'tasklist'));
                    
                    // Show active tasks first
                    if (activeTasks.length > 0) {
                        items.push(...activeTasks.map(task => new TaskItem(task, true)));
                    }
                    
                    // Then pending tasks
                    if (pendingTasks.length > 0) {
                        items.push(...pendingTasks.map(task => new TaskItem(task, false)));
                    }
                }
            }
            
            // Don't show any message when empty - the welcome view will show instead
            
            return Promise.resolve(items);
        }
        
        // Handle expanding team section
        if (element instanceof TeamSectionItem) {
            return Promise.resolve(element.agents.map(agent => new AgentItem(agent)));
        }
        
        return Promise.resolve([]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    setTeamName(name: string): void {
        this.teamName = name;
        (global as any).currentTeamName = name;
        this.refresh();
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
    constructor(label: string, icon: string, public readonly agents: Agent[]) {
        super(label, vscode.TreeItemCollapsibleState.Expanded); // Default to expanded
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
    constructor(public readonly agent: Agent) {
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
    constructor(public readonly task: Task, isActive: boolean) {
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