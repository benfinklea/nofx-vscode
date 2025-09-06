"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UIStateManager = void 0;
const vscode = __importStar(require("vscode"));
const ui_1 = require("../types/ui");
const EventConstants_1 = require("./EventConstants");
class UIStateManager {
    constructor(eventBus, loggingService, agentReader, taskReader) {
        this.agentStats = {
            total: 0,
            idle: 0,
            working: 0,
            error: 0,
            offline: 0
        };
        this.taskStats = {
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
        this.agents = [];
        this.tasks = [];
        this.dependencyGraph = [];
        this.conflicts = [];
        this.blockedTasks = [];
        this.readyTasks = [];
        this.theme = 'light';
        this.taskHashCache = new Map();
        this.dependencyGraphCache = null;
        this.blockedAndReadyCache = null;
        this.lastDependencyGraphHash = '';
        this.lastBlockedReadyHash = '';
        this.subscriptions = [];
        this.stateChangeCallbacks = [];
        this.eventBusHandlers = new Map();
        this.eventBus = eventBus;
        this.loggingService = loggingService;
        this.agentReader = agentReader;
        this.taskReader = taskReader;
        this.initialize();
    }
    initialize() {
        this.loggingService.info('UIStateManager: Initializing');
        this.theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
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
        const themeChangedHandler = (theme) => {
            this.theme = theme;
            this.publishStateChange();
        };
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.AGENT_CREATED, agentCreatedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.AGENT_REMOVED, agentRemovedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.AGENT_STATUS_CHANGED, agentStatusChangedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_CREATED, taskCreatedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_ASSIGNED, taskAssignedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_COMPLETED, taskCompletedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_FAILED, taskFailedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_STATE_CHANGED, taskStateChangedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_BLOCKED, taskBlockedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_READY, taskReadyHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_ADDED, taskDependencyAddedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED, taskDependencyRemovedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_RESOLVED, taskDependencyResolvedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_CONFLICT_DETECTED, taskConflictDetectedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, taskConflictResolvedHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.TASK_MATCH_SCORE, taskMatchScoreHandler);
        this.eventBusHandlers.set(EventConstants_1.DOMAIN_EVENTS.THEME_CHANGED, themeChangedHandler);
        this.subscriptions.push(this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.AGENT_CREATED, agentCreatedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.AGENT_REMOVED, agentRemovedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.AGENT_STATUS_CHANGED, agentStatusChangedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_CREATED, taskCreatedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_ASSIGNED, taskAssignedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_COMPLETED, taskCompletedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_FAILED, taskFailedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_STATE_CHANGED, taskStateChangedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_BLOCKED, taskBlockedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_READY, taskReadyHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_ADDED, taskDependencyAddedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED, taskDependencyRemovedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_DEPENDENCY_RESOLVED, taskDependencyResolvedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_CONFLICT_DETECTED, taskConflictDetectedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, taskConflictResolvedHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_MATCH_SCORE, taskMatchScoreHandler), this.eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.THEME_CHANGED, themeChangedHandler));
        this.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
            this.theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
            this.publishStateChange();
        }));
        this.updateAgentStats();
        this.updateTaskStats();
    }
    getState() {
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
    subscribe(callback) {
        this.stateChangeCallbacks.push(callback);
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
    updateAgentStats() {
        try {
            const activeAgents = this.agentReader.getActiveAgents();
            this.agents = activeAgents.map(ui_1.toAgentDTO);
            this.computeAgentStats();
            this.publishStateChange();
            this.loggingService.debug('UIStateManager: Agent stats updated', this.agentStats);
        }
        catch (error) {
            this.loggingService.error('UIStateManager: Error updating agent stats', error);
        }
    }
    updateTaskStats() {
        try {
            const allTasks = this.taskReader.getTasks();
            this.tasks = allTasks.map(task => (0, ui_1.toTaskDTO)(task, (0, ui_1.computeDependencyStatus)(task, allTasks)));
            this.computeTaskStats();
            this.computeDependencyGraph();
            this.computeConflicts();
            this.computeBlockedAndReadyTasks();
            this.publishStateChange();
            this.loggingService.debug('UIStateManager: Task stats updated', this.taskStats);
        }
        catch (error) {
            this.loggingService.error('UIStateManager: Error updating task stats', error);
        }
    }
    getAgentStats() {
        return { ...this.agentStats };
    }
    getTaskStats() {
        return { ...this.taskStats };
    }
    getAgents() {
        return [...this.agents];
    }
    getTasks() {
        return [...this.tasks];
    }
    computeAgentStats() {
        const activeAgents = this.agentReader.getActiveAgents();
        this.agentStats = {
            total: activeAgents.length,
            idle: activeAgents.filter(a => (0, ui_1.normalizeAgentStatus)(a.status) === 'idle').length,
            working: activeAgents.filter(a => (0, ui_1.normalizeAgentStatus)(a.status) === 'working').length,
            error: activeAgents.filter(a => (0, ui_1.normalizeAgentStatus)(a.status) === 'error').length,
            offline: activeAgents.filter(a => (0, ui_1.normalizeAgentStatus)(a.status) === 'offline').length
        };
    }
    computeTaskStats() {
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
    computeDependencyGraph() {
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
    computeConflicts() {
        const allTasks = this.taskReader.getTasks();
        this.conflicts = allTasks
            .filter(task => task.conflictsWith && task.conflictsWith.length > 0)
            .map(task => ({
            taskId: task.id,
            conflictsWith: task.conflictsWith || [],
            reason: `File overlap with tasks: ${(task.conflictsWith || []).join(', ')}`
        }));
    }
    computeBlockedAndReadyTasks() {
        const currentHash = this.computeBlockedAndReadyHash();
        if (this.blockedAndReadyCache && currentHash === this.lastBlockedReadyHash) {
            this.blockedTasks = this.blockedAndReadyCache.blockedTasks;
            this.readyTasks = this.blockedAndReadyCache.readyTasks;
            return;
        }
        const allTasks = this.taskReader.getTasks();
        this.blockedTasks = allTasks
            .filter(task => task.status === 'blocked')
            .map(task => (0, ui_1.toTaskDTO)(task, (0, ui_1.computeDependencyStatus)(task, allTasks)));
        this.readyTasks = allTasks
            .filter(task => task.status === 'ready')
            .map(task => (0, ui_1.toTaskDTO)(task, (0, ui_1.computeDependencyStatus)(task, allTasks)));
        this.blockedAndReadyCache = {
            blockedTasks: this.blockedTasks,
            readyTasks: this.readyTasks
        };
        this.lastBlockedReadyHash = currentHash;
    }
    getTasksByStatus(status) {
        return this.tasks.filter(task => task.status === status);
    }
    getBlockedTasksWithReasons() {
        return this.blockedTasks;
    }
    getDependencyChain(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task)
            return [];
        const chain = [];
        const visited = new Set();
        this.buildDependencyChain(taskId, chain, visited);
        return chain;
    }
    buildDependencyChain(taskId, chain, visited) {
        if (visited.has(taskId))
            return;
        visited.add(taskId);
        chain.push(taskId);
        const task = this.tasks.find(t => t.id === taskId);
        if (task && task.dependsOn) {
            for (const depId of task.dependsOn) {
                this.buildDependencyChain(depId, chain, visited);
            }
        }
    }
    computeTaskHash() {
        const allTasks = this.taskReader.getTasks();
        const hashData = allTasks.map(task => `${task.id}:${task.status}:${(task.dependsOn || []).join(',')}:${(task.prefers || []).join(',')}:${(task.conflictsWith || []).join(',')}`).join('|');
        let hash = 0;
        for (let i = 0; i < hashData.length; i++) {
            const char = hashData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString();
    }
    computeDependencyGraphHash() {
        const allTasks = this.taskReader.getTasks();
        const hashData = allTasks.map(task => `${task.id}:${(task.dependsOn || []).join(',')}:${(task.prefers || []).join(',')}`).join('|');
        let hash = 0;
        for (let i = 0; i < hashData.length; i++) {
            const char = hashData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString();
    }
    computeBlockedAndReadyHash() {
        const allTasks = this.taskReader.getTasks();
        const hashData = allTasks.map(task => `${task.id}:${task.status}:${(task.blockedBy || []).join(',')}:${(task.conflictsWith || []).join(',')}`).join('|');
        let hash = 0;
        for (let i = 0; i < hashData.length; i++) {
            const char = hashData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString();
    }
    publishStateChange() {
        const state = this.getState();
        this.eventBus.publish(EventConstants_1.UI_EVENTS.UI_STATE_CHANGED, state);
        this.stateChangeCallbacks.forEach(callback => {
            try {
                callback(state);
            }
            catch (error) {
                this.loggingService.error('UIStateManager: Error in state change callback', error);
            }
        });
    }
    dispose() {
        this.loggingService.info('UIStateManager: Disposing');
        this.eventBusHandlers.forEach((handler, event) => {
            this.eventBus.unsubscribe(event, handler);
        });
        this.eventBusHandlers.clear();
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
        this.stateChangeCallbacks = [];
    }
}
exports.UIStateManager = UIStateManager;
//# sourceMappingURL=UIStateManager.js.map