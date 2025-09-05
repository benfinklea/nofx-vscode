import * as vscode from 'vscode';
import { IUIStateManager, IEventBus, ILoggingService, ITreeStateManager } from './interfaces';
import { TreeViewState, AgentDTO, TaskDTO, normalizeTaskStatus, normalizeAgentStatus } from '../types/ui';

export class TreeStateManager implements ITreeStateManager {
    private uiStateManager: IUIStateManager;
    private eventBus: IEventBus;
    private loggingService: ILoggingService;
    
    // Tree-specific state
    private teamName: string = 'Default Team';
    private expandedSections: Set<string> = new Set();
    private selectedItems: Set<string> = new Set();
    
    // Event subscriptions
    private subscriptions: vscode.Disposable[] = [];
    private stateChangeCallbacks: (() => void)[] = [];
    private eventBusHandlers: Map<string, Function> = new Map();

    constructor(
        uiStateManager: IUIStateManager,
        eventBus: IEventBus,
        loggingService: ILoggingService
    ) {
        this.uiStateManager = uiStateManager;
        this.eventBus = eventBus;
        this.loggingService = loggingService;
        
        this.initialize();
    }

    private initialize(): void {
        this.loggingService.info('TreeStateManager: Initializing');
        
        // Subscribe to UI state changes
        const uiStateChangeHandler = () => {
            this.publishTreeRefresh();
        };
        const teamChangedHandler = (teamName: string) => {
            this.teamName = teamName;
            this.publishTreeRefresh();
        };

        this.eventBusHandlers.set('tree.team.changed', teamChangedHandler);

        this.subscriptions.push(
            this.uiStateManager.subscribe(uiStateChangeHandler),
            this.eventBus.subscribe('tree.team.changed', teamChangedHandler)
        );
    }

    setTeamName(name: string): void {
        this.loggingService.debug('TreeStateManager: Setting team name', { name });
        this.teamName = name;
        this.eventBus.publish('tree.team.changed', name);
        this.publishTreeRefresh();
    }

    toggleSection(sectionId: string): void {
        this.loggingService.debug('TreeStateManager: Toggling section', { sectionId });
        if (this.expandedSections.has(sectionId)) {
            this.expandedSections.delete(sectionId);
        } else {
            this.expandedSections.add(sectionId);
        }
        this.publishTreeRefresh();
    }

    selectItem(itemId: string): void {
        this.loggingService.debug('TreeStateManager: Selecting item', { itemId });
        this.selectedItems.clear();
        this.selectedItems.add(itemId);
        this.eventBus.publish('tree.selection.changed', Array.from(this.selectedItems));
        this.publishTreeRefresh();
    }

    getAgentTreeItems(): any[] {
        const agents = this.uiStateManager.getAgents();
        return agents.map(agent => this.createAgentTreeItem(agent));
    }

    getTaskTreeItems(): any[] {
        const tasks = this.uiStateManager.getTasks();
        return tasks.map(task => this.createTaskTreeItem(task));
    }

    getSectionItems(): any[] {
        const items: any[] = [];
        
        // Get data from UI state manager
        const agents = this.uiStateManager.getAgents();
        const tasks = this.uiStateManager.getTasks();
        
        // Add agents section
        if (agents.length > 0) {
            items.push({
                type: 'teamSection',
                label: this.teamName,
                icon: 'organization',
                agents: agents
            });
        }
        
        // Add tasks section
        if (tasks.length > 0) {
            items.push({
                type: 'section',
                label: 'Tasks',
                icon: 'tasklist'
            });
            
            // Show active tasks first, then pending tasks
            const activeTasks = tasks.filter(t => normalizeTaskStatus(t.status) === 'in-progress' || normalizeTaskStatus(t.status) === 'assigned');
            const pendingTasks = tasks.filter(t => normalizeTaskStatus(t.status) === 'queued');
            
            if (activeTasks.length > 0) {
                items.push(...activeTasks.map(task => ({
                    type: 'task',
                    task: task,
                    isActive: true
                })));
            }
            
            if (pendingTasks.length > 0) {
                items.push(...pendingTasks.map(task => ({
                    type: 'task',
                    task: task,
                    isActive: false
                })));
            }
        }
        
        // Show message if no data
        if (items.length === 0) {
            items.push({
                type: 'message',
                message: 'No agents or tasks available'
            });
        }
        
        return items;
    }

    subscribe(callback: () => void): vscode.Disposable {
        this.stateChangeCallbacks.push(callback);
        
        return {
            dispose: () => {
                const index = this.stateChangeCallbacks.indexOf(callback);
                if (index > -1) {
                    this.stateChangeCallbacks.splice(index, 1);
                }
            }
        };
    }

    private createAgentTreeItem(agent: AgentDTO): any {
        const statusIcon = this.getAgentStatusIcon(agent.status);
        const taskInfo = agent.currentTask ? ` (${agent.currentTask.title})` : '';
        
        return {
            id: `agent-${agent.id}`,
            label: `${statusIcon} ${agent.name}${taskInfo}`,
            description: `${agent.type} • ${agent.tasksCompleted} tasks`,
            tooltip: `Agent: ${agent.name}\nType: ${agent.type}\nStatus: ${agent.status}\nTasks Completed: ${agent.tasksCompleted}`,
            iconPath: new vscode.ThemeIcon('robot'),
            contextValue: 'agent',
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            command: {
                command: 'nofx.selectAgent',
                title: 'Select Agent',
                arguments: [agent.id]
            }
        };
    }

    private createTaskTreeItem(task: TaskDTO): any {
        const priorityIcon = this.getTaskPriorityIcon(task.priority);
        const statusIcon = this.getTaskStatusIcon(task.status);
        
        return {
            id: `task-${task.id}`,
            label: `${priorityIcon} ${statusIcon} ${task.title}`,
            description: task.assignedTo ? `Assigned to: ${task.assignedTo}` : 'Unassigned',
            tooltip: `Task: ${task.title}\nDescription: ${task.description}\nPriority: ${task.priority}\nStatus: ${task.status}`,
            iconPath: new vscode.ThemeIcon('checklist'),
            contextValue: 'task',
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            command: {
                command: 'nofx.selectTask',
                title: 'Select Task',
                arguments: [task.id]
            }
        };
    }

    private getAgentStatusIcon(status: string): string {
        const normalizedStatus = normalizeAgentStatus(status);
        switch (normalizedStatus) {
            case 'idle': return '🟢';
            case 'working': return '🟡';
            case 'error': return '🔴';
            case 'offline': return '⚫';
            default: return '⚪';
        }
    }

    private getTaskStatusIcon(status: string): string {
        const normalizedStatus = normalizeTaskStatus(status);
        switch (normalizedStatus) {
            case 'queued': return '⏳';
            case 'assigned': return '📋';
            case 'in-progress': return '🔄';
            case 'completed': return '✅';
            case 'failed': return '❌';
            default: return '❓';
        }
    }

    private getTaskPriorityIcon(priority: string): string {
        switch (priority) {
            case 'high': return '🔴';
            case 'medium': return '🟡';
            case 'low': return '🟢';
            default: return '⚪';
        }
    }

    private publishTreeRefresh(): void {
        this.eventBus.publish('tree.refresh');
        
        // Notify direct subscribers
        this.stateChangeCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                this.loggingService.error('TreeStateManager: Error in refresh callback', error);
            }
        });
    }

    dispose(): void {
        this.loggingService.info('TreeStateManager: Disposing');
        
        // Explicitly unsubscribe from EventBus handlers
        this.eventBusHandlers.forEach((handler, event) => {
            this.eventBus.unsubscribe(event, handler);
        });
        this.eventBusHandlers.clear();
        
        // Dispose all subscriptions
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
        
        // Clear callbacks
        this.stateChangeCallbacks = [];
    }
}
