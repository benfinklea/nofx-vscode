import * as vscode from 'vscode';
import { IEventBus, ILoggingService, IUIStateManager, IAgentReader, ITaskReader } from './interfaces';
import { AgentDTO, TaskDTO, ConductorViewState, toAgentDTO, toTaskDTO, normalizeTaskStatus, normalizeAgentStatus, computeDependencyStatus } from '../types/ui';
import { DOMAIN_EVENTS, UI_EVENTS } from './EventConstants';

export class UIStateManager implements IUIStateManager {
    private eventBus: IEventBus;
    private loggingService: ILoggingService;
    private agentReader: IAgentReader;
    private taskReader: ITaskReader;
    
    // Internal state slices
    private agentStats = {
        total: 0,
        idle: 0,
        working: 0,
        error: 0,
        offline: 0
    };
    
    private taskStats = {
        queued: 0,
        validated: 0,
        ready: 0,
        assigned: 0,
        inProgress: 0,
        completed: 0,
        failed: 0,
        blocked: 0,
        conflicted: 0
    };
    
    private agents: AgentDTO[] = [];
    private tasks: TaskDTO[] = [];
    private dependencyGraph: {taskId: string, dependencies: string[], softDependencies: string[]}[] = [];
    private conflicts: {taskId: string, conflictsWith: string[], reason: string}[] = [];
    private blockedTasks: TaskDTO[] = [];
    private readyTasks: TaskDTO[] = [];
    private theme: 'light' | 'dark' = 'light';
    
    // Caching for performance optimization
    private taskHashCache: Map<string, string> = new Map();
    private dependencyGraphCache: {taskId: string, dependencies: string[], softDependencies: string[]}[] | null = null;
    private blockedAndReadyCache: {blockedTasks: TaskDTO[], readyTasks: TaskDTO[]} | null = null;
    
    // Separate cache keys to avoid unnecessary invalidation
    private lastDependencyGraphHash: string = '';
    private lastBlockedReadyHash: string = '';
    
    // Event subscriptions
    private subscriptions: vscode.Disposable[] = [];
    private stateChangeCallbacks: ((state: ConductorViewState) => void)[] = [];
    private eventBusHandlers: Map<string, Function> = new Map();

    constructor(
        eventBus: IEventBus,
        loggingService: ILoggingService,
        agentReader: IAgentReader,
        taskReader: ITaskReader
    ) {
        this.eventBus = eventBus;
        this.loggingService = loggingService;
        this.agentReader = agentReader;
        this.taskReader = taskReader;
        
        this.initialize();
    }

    private initialize(): void {
        this.loggingService.info('UIStateManager: Initializing');
        
        // Initialize theme from VS Code color theme
        this.theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
        
        // Subscribe to domain events with explicit handler tracking
        const agentCreatedHandler = () => this.updateAgentStats();
        const agentRemovedHandler = () => this.updateAgentStats();
        const agentStatusChangedHandler = () => this.updateAgentStats();
        const taskCreatedHandler = () => this.updateTaskStats();
        const taskAssignedHandler = () => this.updateTaskStats();
        const taskCompletedHandler = () => this.updateTaskStats();
        const taskFailedHandler = () => this.updateTaskStats();
        const taskStateChangedHandler = () => this.updateTaskStats();
        const taskBlockedHandler = () => this.updateTaskStats();
        const taskReadyHandler = () => this.updateTaskStats();
        const taskDependencyAddedHandler = () => this.updateTaskStats();
        const taskDependencyRemovedHandler = () => this.updateTaskStats();
        const taskDependencyResolvedHandler = () => this.updateTaskStats();
        const taskConflictDetectedHandler = () => this.updateTaskStats();
        const taskConflictResolvedHandler = () => this.updateTaskStats();
        const taskMatchScoreHandler = () => this.updateTaskStats();
        const themeChangedHandler = (theme: string) => {
            this.theme = theme as 'light' | 'dark';
            this.publishStateChange();
        };

        this.eventBusHandlers.set(DOMAIN_EVENTS.AGENT_CREATED, agentCreatedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.AGENT_REMOVED, agentRemovedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, agentStatusChangedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_CREATED, taskCreatedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_ASSIGNED, taskAssignedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_COMPLETED, taskCompletedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_FAILED, taskFailedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_STATE_CHANGED, taskStateChangedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_BLOCKED, taskBlockedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_READY, taskReadyHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_DEPENDENCY_ADDED, taskDependencyAddedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED, taskDependencyRemovedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_DEPENDENCY_RESOLVED, taskDependencyResolvedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_CONFLICT_DETECTED, taskConflictDetectedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, taskConflictResolvedHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.TASK_MATCH_SCORE, taskMatchScoreHandler);
        this.eventBusHandlers.set(DOMAIN_EVENTS.THEME_CHANGED, themeChangedHandler);

        this.subscriptions.push(
            this.eventBus.subscribe(DOMAIN_EVENTS.AGENT_CREATED, agentCreatedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.AGENT_REMOVED, agentRemovedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, agentStatusChangedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_CREATED, taskCreatedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_ASSIGNED, taskAssignedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_COMPLETED, taskCompletedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_FAILED, taskFailedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_STATE_CHANGED, taskStateChangedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_BLOCKED, taskBlockedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_READY, taskReadyHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_DEPENDENCY_ADDED, taskDependencyAddedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED, taskDependencyRemovedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_DEPENDENCY_RESOLVED, taskDependencyResolvedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_CONFLICT_DETECTED, taskConflictDetectedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, taskConflictResolvedHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.TASK_MATCH_SCORE, taskMatchScoreHandler),
            this.eventBus.subscribe(DOMAIN_EVENTS.THEME_CHANGED, themeChangedHandler)
        );
        
        // Subscribe to VS Code theme changes
        this.subscriptions.push(
            vscode.window.onDidChangeActiveColorTheme(() => {
                this.theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
                this.publishStateChange();
            })
        );
        
        // Initial state computation
        this.updateAgentStats();
        this.updateTaskStats();
    }

    getState(): ConductorViewState {
        return {
            agentStats: { ...this.agentStats },
            taskStats: { ...this.taskStats },
            agents: [...this.agents],
            tasks: [...this.tasks],
            dependencyGraph: [...this.dependencyGraph],
            conflicts: [...this.conflicts],
            blockedTasks: [...this.blockedTasks],
            readyTasks: [...this.readyTasks],
            theme: this.theme
        };
    }

    subscribe(callback: (state: ConductorViewState) => void): vscode.Disposable {
        this.stateChangeCallbacks.push(callback);
        
        // Immediately call with current state
        callback(this.getState());
        
        return {
            dispose: () => {
                const index = this.stateChangeCallbacks.indexOf(callback);
                if (index > -1) {
                    this.stateChangeCallbacks.splice(index, 1);
                }
            }
        };
    }

    updateAgentStats(): void {
        try {
            const activeAgents = this.agentReader.getActiveAgents();
            this.agents = activeAgents.map(toAgentDTO);
            
            // Compute stats using the dedicated method
            this.computeAgentStats();
            
            this.publishStateChange();
            this.loggingService.debug('UIStateManager: Agent stats updated', this.agentStats);
        } catch (error) {
            this.loggingService.error('UIStateManager: Error updating agent stats', error);
        }
    }

    updateTaskStats(): void {
        try {
            const allTasks = this.taskReader.getTasks();
            this.tasks = allTasks.map(task => toTaskDTO(task, computeDependencyStatus(task, allTasks)));
            
            // Compute stats using the dedicated method
            this.computeTaskStats();
            
            // Compute dependency and conflict information with caching
            this.computeDependencyGraph();
            this.computeConflicts();
            this.computeBlockedAndReadyTasks();
            
            this.publishStateChange();
            this.loggingService.debug('UIStateManager: Task stats updated', this.taskStats);
        } catch (error) {
            this.loggingService.error('UIStateManager: Error updating task stats', error);
        }
    }

    getAgentStats(): { total: number; idle: number; working: number; error: number; offline: number } {
        return { ...this.agentStats };
    }

    getTaskStats(): { queued: number; validated: number; ready: number; assigned: number; inProgress: number; completed: number; failed: number; blocked: number; conflicted: number } {
        return { ...this.taskStats };
    }

    getAgents(): AgentDTO[] {
        return [...this.agents];
    }

    getTasks(): TaskDTO[] {
        return [...this.tasks];
    }

    private computeAgentStats(): void {
        const activeAgents = this.agentReader.getActiveAgents();
        this.agentStats = {
            total: activeAgents.length,
            idle: activeAgents.filter(a => normalizeAgentStatus(a.status) === 'idle').length,
            working: activeAgents.filter(a => normalizeAgentStatus(a.status) === 'working').length,
            error: activeAgents.filter(a => normalizeAgentStatus(a.status) === 'error').length,
            offline: activeAgents.filter(a => normalizeAgentStatus(a.status) === 'offline').length
        };
    }

    private computeTaskStats(): void {
        const allTasks = this.taskReader.getTasks();
        
        const assigned = allTasks.filter(t => t.status === 'assigned').length;
        const inProgress = allTasks.filter(t => t.status === 'in-progress').length;
        
        this.taskStats = {
            queued: allTasks.filter(t => t.status === 'queued').length,
            validated: allTasks.filter(t => t.status === 'validated').length,
            ready: allTasks.filter(t => t.status === 'ready').length,
            assigned: assigned,
            inProgress: inProgress,
            completed: allTasks.filter(t => t.status === 'completed').length,
            failed: allTasks.filter(t => t.status === 'failed').length,
            blocked: allTasks.filter(t => t.status === 'blocked').length,
            conflicted: allTasks.filter(t => t.conflictsWith && t.conflictsWith.length > 0).length
        };
    }

    /**
     * Computes dependency graph for UI visualization
     */
    private computeDependencyGraph(): void {
        const currentHash = this.computeDependencyGraphHash();
        if (this.dependencyGraphCache && currentHash === this.lastDependencyGraphHash) {
            this.dependencyGraph = this.dependencyGraphCache;
            return;
        }
        
        const allTasks = this.taskReader.getTasks();
        this.dependencyGraph = allTasks
            .filter(task => (task.dependsOn && task.dependsOn.length > 0) || (task.prefers && task.prefers.length > 0))
            .map(task => ({
                taskId: task.id,
                dependencies: task.dependsOn || [],
                softDependencies: task.prefers || []
            }));
        
        this.dependencyGraphCache = this.dependencyGraph;
        this.lastDependencyGraphHash = currentHash;
    }

    /**
     * Computes conflict information for UI display
     */
    private computeConflicts(): void {
        const allTasks = this.taskReader.getTasks();
        this.conflicts = allTasks
            .filter(task => task.conflictsWith && task.conflictsWith.length > 0)
            .map(task => ({
                taskId: task.id,
                conflictsWith: task.conflictsWith || [],
                reason: `File overlap with tasks: ${(task.conflictsWith || []).join(', ')}`
            }));
    }

    /**
     * Computes blocked and ready tasks for UI display
     */
    private computeBlockedAndReadyTasks(): void {
        const currentHash = this.computeBlockedAndReadyHash();
        if (this.blockedAndReadyCache && currentHash === this.lastBlockedReadyHash) {
            this.blockedTasks = this.blockedAndReadyCache.blockedTasks;
            this.readyTasks = this.blockedAndReadyCache.readyTasks;
            return;
        }
        
        const allTasks = this.taskReader.getTasks();
        this.blockedTasks = allTasks
            .filter(task => task.status === 'blocked')
            .map(task => toTaskDTO(task, computeDependencyStatus(task, allTasks)));
        
        this.readyTasks = allTasks
            .filter(task => task.status === 'ready')
            .map(task => toTaskDTO(task, computeDependencyStatus(task, allTasks)));
        
        this.blockedAndReadyCache = {
            blockedTasks: this.blockedTasks,
            readyTasks: this.readyTasks
        };
        this.lastBlockedReadyHash = currentHash;
    }

    /**
     * Gets tasks by status for UI queries
     */
    getTasksByStatus(status: string): TaskDTO[] {
        return this.tasks.filter(task => task.status === status);
    }

    /**
     * Gets blocked tasks with reasons
     */
    getBlockedTasksWithReasons(): TaskDTO[] {
        return this.blockedTasks;
    }

    /**
     * Gets dependency chain for a specific task
     */
    getDependencyChain(taskId: string): string[] {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return [];
        
        const chain: string[] = [];
        const visited = new Set<string>();
        
        this.buildDependencyChain(taskId, chain, visited);
        return chain;
    }

    /**
     * Builds dependency chain recursively
     */
    private buildDependencyChain(taskId: string, chain: string[], visited: Set<string>): void {
        if (visited.has(taskId)) return;
        
        visited.add(taskId);
        chain.push(taskId);
        
        const task = this.tasks.find(t => t.id === taskId);
        if (task && task.dependsOn) {
            for (const depId of task.dependsOn) {
                this.buildDependencyChain(depId, chain, visited);
            }
        }
    }

    /**
     * Computes a hash of task state for caching purposes
     */
    private computeTaskHash(): string {
        const allTasks = this.taskReader.getTasks();
        const hashData = allTasks.map(task => 
            `${task.id}:${task.status}:${(task.dependsOn || []).join(',')}:${(task.prefers || []).join(',')}:${(task.conflictsWith || []).join(',')}`
        ).join('|');
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < hashData.length; i++) {
            const char = hashData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    /**
     * Computes a hash specifically for dependency graph caching
     */
    private computeDependencyGraphHash(): string {
        const allTasks = this.taskReader.getTasks();
        const hashData = allTasks.map(task => 
            `${task.id}:${(task.dependsOn || []).join(',')}:${(task.prefers || []).join(',')}`
        ).join('|');
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < hashData.length; i++) {
            const char = hashData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    /**
     * Computes a hash specifically for blocked and ready tasks caching
     */
    private computeBlockedAndReadyHash(): string {
        const allTasks = this.taskReader.getTasks();
        const hashData = allTasks.map(task => 
            `${task.id}:${task.status}:${(task.blockedBy || []).join(',')}:${(task.conflictsWith || []).join(',')}`
        ).join('|');
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < hashData.length; i++) {
            const char = hashData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    private publishStateChange(): void {
        const state = this.getState();
        this.eventBus.publish(UI_EVENTS.UI_STATE_CHANGED, state);
        
        // Notify direct subscribers
        this.stateChangeCallbacks.forEach(callback => {
            try {
                callback(state);
            } catch (error) {
                this.loggingService.error('UIStateManager: Error in state change callback', error);
            }
        });
    }

    dispose(): void {
        this.loggingService.info('UIStateManager: Disposing');
        
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
