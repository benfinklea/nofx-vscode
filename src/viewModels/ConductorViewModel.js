"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConductorViewModel = void 0;
const EventConstants_1 = require("../services/EventConstants");
class ConductorViewModel {
    constructor(uiStateManager, commandService, eventBus, loggingService, notificationService) {
        this.collapsibleSections = new Map();
        this.subscriptions = [];
        this.stateChangeCallbacks = [];
        this.uiStateManager = uiStateManager;
        this.commandService = commandService;
        this.eventBus = eventBus;
        this.loggingService = loggingService;
        this.notificationService = notificationService;
        this.initialize();
    }
    initialize() {
        this.loggingService.info('ConductorViewModel: Initializing');
        this.subscriptions.push(this.uiStateManager.subscribe((state) => {
            this.publishViewStateChange();
        }));
    }
    getViewState() {
        return this.uiStateManager.getState();
    }
    async handleCommand(command, data) {
        try {
            this.loggingService.debug('ConductorViewModel: Handling command', { command, data });
            switch (command) {
                case "spawnAgentGroup":
                    await this.spawnAgentGroup(data?.groupName || 'Default Group');
                    break;
                case "spawnCustomAgent":
                    await this.spawnCustomAgent(data?.templateKey || 'default');
                    break;
                case "createTask":
                    await this.createTask();
                    break;
                case "removeAgent":
                    await this.removeAgent(data?.agentId);
                    break;
                case "toggleTheme":
                    await this.toggleTheme(data?.theme || 'light');
                    break;
                case "showAgentPrompt":
                    await this.showAgentPrompt();
                    break;
                default:
                    this.loggingService.warn('ConductorViewModel: Unknown command', command);
            }
        }
        catch (error) {
            this.loggingService.error('ConductorViewModel: Error handling command', error);
            await this.notificationService.showError(`Failed to execute command: ${command}`);
        }
    }
    async spawnAgentGroup(groupName) {
        try {
            this.loggingService.info('ConductorViewModel: Spawning agent group', { groupName });
            await this.commandService.execute('nofx.addAgent', { groupName });
            await this.notificationService.showInformation(`Agent group "${groupName}" spawned successfully`);
        }
        catch (error) {
            this.loggingService.error('ConductorViewModel: Error spawning agent group', error);
            await this.notificationService.showError('Failed to spawn agent group');
        }
    }
    async spawnCustomAgent(templateKey) {
        try {
            this.loggingService.info('ConductorViewModel: Spawning custom agent', { templateKey });
            await this.commandService.execute('nofx.addAgent', { templateKey });
            await this.notificationService.showInformation(`Custom agent with template "${templateKey}" spawned successfully`);
        }
        catch (error) {
            this.loggingService.error('ConductorViewModel: Error spawning custom agent', error);
            await this.notificationService.showError('Failed to spawn custom agent');
        }
    }
    async createTask() {
        try {
            this.loggingService.info('ConductorViewModel: Creating task');
            await this.commandService.execute('nofx.createTask');
            await this.notificationService.showInformation('Task created successfully');
        }
        catch (error) {
            this.loggingService.error('ConductorViewModel: Error creating task', error);
            await this.notificationService.showError('Failed to create task');
        }
    }
    async removeAgent(agentId) {
        if (!agentId) {
            await this.notificationService.showError('Agent ID is required');
            return;
        }
        try {
            this.loggingService.info('ConductorViewModel: Removing agent', { agentId });
            await this.commandService.execute('nofx.deleteAgent', agentId);
            await this.notificationService.showInformation(`Agent ${agentId} removed successfully`);
        }
        catch (error) {
            this.loggingService.error('ConductorViewModel: Error removing agent', error);
            await this.notificationService.showError('Failed to remove agent');
        }
    }
    async toggleTheme(theme) {
        try {
            this.loggingService.info('ConductorViewModel: Toggling theme', { theme });
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.THEME_CHANGED, theme);
            await this.notificationService.showInformation(`Theme changed to ${theme}`);
        }
        catch (error) {
            this.loggingService.error('ConductorViewModel: Error toggling theme', error);
            await this.notificationService.showError('Failed to change theme');
        }
    }
    async showAgentPrompt() {
        try {
            this.loggingService.info('ConductorViewModel: Showing agent prompt');
            await this.commandService.execute('nofx.addAgent');
        }
        catch (error) {
            this.loggingService.error('ConductorViewModel: Error showing agent prompt', error);
            await this.notificationService.showError('Failed to show agent prompt');
        }
    }
    subscribe(callback) {
        this.stateChangeCallbacks.push(callback);
        callback(this.getViewState());
        return {
            dispose: () => {
                const index = this.stateChangeCallbacks.indexOf(callback);
                if (index > -1) {
                    this.stateChangeCallbacks.splice(index, 1);
                }
            }
        };
    }
    publishViewStateChange() {
        const state = this.getViewState();
        this.stateChangeCallbacks.forEach(callback => {
            try {
                callback(state);
            }
            catch (error) {
                this.loggingService.error('ConductorViewModel: Error in state change callback', error);
            }
        });
    }
    dispose() {
        this.loggingService.info('ConductorViewModel: Disposing');
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
        this.stateChangeCallbacks = [];
    }
}
exports.ConductorViewModel = ConductorViewModel;
//# sourceMappingURL=ConductorViewModel.js.map