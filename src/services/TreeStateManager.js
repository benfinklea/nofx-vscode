"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreeStateManager = void 0;
class TreeStateManager {
    constructor(uiStateManager, eventBus, loggingService) {
        this.teamName = 'Default Team';
        this.expandedSections = new Set();
        this.selectedItems = new Set();
        this.subscriptions = [];
        this.stateChangeCallbacks = [];
        this.eventBusHandlers = new Map();
        this.uiStateManager = uiStateManager;
        this.eventBus = eventBus;
        this.loggingService = loggingService;
        this.initialize();
    }
    initialize() {
        this.loggingService.info('TreeStateManager: Initializing');
        const uiStateChangeHandler = () => {
            this.publishTreeRefresh();
        };
        const teamChangedHandler = (teamName) => {
            this.teamName = teamName;
            this.publishTreeRefresh();
        };
        this.eventBusHandlers.set('tree.team.changed', teamChangedHandler);
        this.subscriptions.push(this.uiStateManager.subscribe(uiStateChangeHandler), this.eventBus.subscribe('tree.team.changed', teamChangedHandler));
    }
    setTeamName(name) {
        this.loggingService.debug('TreeStateManager: Setting team name', { name });
        this.teamName = name;
        this.eventBus.publish('tree.team.changed', name);
        this.publishTreeRefresh();
    }
    getTeamName() {
        return this.teamName;
    }
    toggleSection(sectionId) {
        this.loggingService.debug('TreeStateManager: Toggling section', { sectionId });
        if (this.expandedSections.has(sectionId)) {
            this.expandedSections.delete(sectionId);
        }
        else {
            this.expandedSections.add(sectionId);
        }
        this.publishTreeRefresh();
    }
    isSectionExpanded(id) {
        return this.expandedSections.has(id);
    }
    selectItem(itemId) {
        this.loggingService.debug('TreeStateManager: Selecting item', { itemId });
        this.selectedItems.clear();
        this.selectedItems.add(itemId);
        this.eventBus.publish('tree.selection.changed', Array.from(this.selectedItems));
        this.publishTreeRefresh();
    }
    getAgentTreeItems() {
        const agents = this.uiStateManager.getAgents();
        return agents.map(agent => this.createTreeItem(agent));
    }
    getTaskTreeItems() {
        const tasks = this.uiStateManager.getTasks();
        return tasks.map(task => this.createTreeItem(task));
    }
    getSectionItems() {
        const agents = this.uiStateManager.getAgents();
        const tasks = this.uiStateManager.getTasks();
        return {
            teamName: this.teamName,
            agents: agents,
            tasks: tasks,
            hasData: agents.length > 0 || tasks.length > 0
        };
    }
    createTreeItem(item) {
        return item;
    }
    subscribe(callback) {
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
    publishTreeRefresh() {
        this.eventBus.publish('tree.refresh');
        this.stateChangeCallbacks.forEach(callback => {
            try {
                callback();
            }
            catch (error) {
                this.loggingService.error('TreeStateManager: Error in refresh callback', error);
            }
        });
    }
    dispose() {
        this.loggingService.info('TreeStateManager: Disposing');
        this.eventBusHandlers.forEach((handler, event) => {
            this.eventBus.unsubscribe(event, handler);
        });
        this.eventBusHandlers.clear();
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
        this.stateChangeCallbacks = [];
    }
}
exports.TreeStateManager = TreeStateManager;
//# sourceMappingURL=TreeStateManager.js.map