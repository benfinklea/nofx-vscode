import * as vscode from 'vscode';
import { IUIStateManager, IEventBus, ILoggingService, ITreeStateManager } from './interfaces';
import { TreeViewState } from '../types/ui';

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

    getTeamName(): string {
        return this.teamName;
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

    isSectionExpanded(id: string): boolean {
        return this.expandedSections.has(id);
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
        return agents.map(agent => this.createTreeItem(agent));
    }

    getTaskTreeItems(): any[] {
        const tasks = this.uiStateManager.getTasks();
        return tasks.map(task => this.createTreeItem(task));
    }

    getSectionItems(): any {
        // Return pure data without presentation concerns
        const agents = this.uiStateManager.getAgents();
        const tasks = this.uiStateManager.getTasks();
        
        return {
            teamName: this.teamName,
            agents: agents,
            tasks: tasks,
            hasData: agents.length > 0 || tasks.length > 0
        };
    }

    private createTreeItem(item: any): any {
        // Simple passthrough for now - can be extended later
        return item;
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

    // Presentation logic moved to AgentTreeProvider to decouple UI state from presentation
    // This keeps TreeStateManager focused on pure data management

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
