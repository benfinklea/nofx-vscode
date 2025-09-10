import * as vscode from 'vscode';
import {
    IUIStateManager,
    ICommandService,
    IEventEmitter,
    IEventSubscriber,
    ILogger,
    INotificationService,
    IConductorViewModel
} from '../services/interfaces';
import { ConductorViewState, WebviewCommand, WEBVIEW_COMMANDS } from '../types/ui';
import { DOMAIN_EVENTS } from '../services/EventConstants';
import { getAppStateStore } from '../state/AppStateStore';
import * as selectors from '../state/selectors';
import * as actions from '../state/actions';
export class ConductorViewModel implements IConductorViewModel {
    private uiStateManager: IUIStateManager;
    private store: IUIStateManager; // Alias for compatibility
    private commandService: ICommandService;
    private eventBus: IEventEmitter & IEventSubscriber;
    private loggingService: ILogger;
    private notificationService: INotificationService;

    // View-specific state
    private collapsibleSections: Map<string, boolean> = new Map();

    // Event subscriptions
    private subscriptions: vscode.Disposable[] = [];
    private stateChangeCallbacks: ((state: ConductorViewState) => void)[] = [];

    constructor(
        uiStateManager: IUIStateManager,
        commandService: ICommandService,
        eventBus: IEventEmitter & IEventSubscriber,
        loggingService: ILogger,
        notificationService: INotificationService
    ) {
        this.store = uiStateManager;
        this.commandService = commandService;
        this.eventBus = eventBus;
        this.loggingService = loggingService;
        this.notificationService = notificationService;

        this.initialize();
    }

    private publishEvent(event: string, data?: any): void {
        if (this.eventBus && 'publish' in this.eventBus) {
            (this.eventBus as any).publish(event, data);
        } else if (this.eventBus && 'emit' in this.eventBus) {
            this.eventBus.emit(event, data);
        }
    }

    private initialize(): void {
        this.loggingService.info('ConductorViewModel: Initializing');

        // Subscribe to UI state changes
        this.subscriptions.push(
            this.store.subscribe(state => {
                this.publishViewStateChange();
            })
        );
    }

    getViewState(): ConductorViewState {
        return this.store.getState();
    }

    async handleCommand(command: string, data?: any): Promise<void> {
        try {
            this.loggingService.debug('ConductorViewModel: Handling command', { command, data });

            switch (command as WebviewCommand) {
                case WEBVIEW_COMMANDS.SPAWN_AGENT_GROUP:
                    await this.spawnAgentGroup(data?.groupName || 'Default Group');
                    break;
                case WEBVIEW_COMMANDS.SPAWN_CUSTOM_AGENT:
                    await this.spawnCustomAgent(data?.templateKey || 'default');
                    break;
                case WEBVIEW_COMMANDS.CREATE_TASK:
                    await this.createTask();
                    break;
                case WEBVIEW_COMMANDS.REMOVE_AGENT:
                    await this.removeAgent(data?.agentId);
                    break;
                case WEBVIEW_COMMANDS.TOGGLE_THEME:
                    await this.toggleTheme(data?.theme || 'light');
                    break;
                case WEBVIEW_COMMANDS.SHOW_AGENT_PROMPT:
                    await this.showAgentPrompt();
                    break;
                default:
                    this.loggingService.warn('ConductorViewModel: Unknown command', command);
            }
        } catch (error) {
            this.loggingService.error('ConductorViewModel: Error handling command', error);
            await this.notificationService.showError(`Failed to execute command: ${command}`);
        }
    }

    async spawnAgentGroup(groupName: string): Promise<void> {
        try {
            this.loggingService.info('ConductorViewModel: Spawning agent group', { groupName });
            // Pass through the groupName parameter to the command
            await this.commandService.execute('nofx.addAgent', { groupName });
            await this.notificationService.showInformation(`Agent group "${groupName}" spawned successfully`);
        } catch (error) {
            this.loggingService.error('ConductorViewModel: Error spawning agent group', error);
            await this.notificationService.showError('Failed to spawn agent group');
        }
    }

    async spawnCustomAgent(templateKey: string): Promise<void> {
        try {
            this.loggingService.info('ConductorViewModel: Spawning custom agent', { templateKey });
            // Pass through the templateKey parameter to the command
            await this.commandService.execute('nofx.addAgent', { templateKey });
            await this.notificationService.showInformation(
                `Custom agent with template "${templateKey}" spawned successfully`
            );
        } catch (error) {
            this.loggingService.error('ConductorViewModel: Error spawning custom agent', error);
            await this.notificationService.showError('Failed to spawn custom agent');
        }
    }

    async createTask(): Promise<void> {
        try {
            this.loggingService.info('ConductorViewModel: Creating task');
            await this.commandService.execute('nofx.createTask');
            await this.notificationService.showInformation('Task created successfully');
        } catch (error) {
            this.loggingService.error('ConductorViewModel: Error creating task', error);
            await this.notificationService.showError('Failed to create task');
        }
    }

    async removeAgent(agentId: string): Promise<void> {
        if (!agentId) {
            await this.notificationService.showError('Agent ID is required');
            return;
        }

        try {
            this.loggingService.info('ConductorViewModel: Removing agent', { agentId });
            // Use the existing deleteAgent command
            await this.commandService.execute('nofx.deleteAgent', agentId);
            await this.notificationService.showInformation(`Agent ${agentId} removed successfully`);
        } catch (error) {
            this.loggingService.error('ConductorViewModel: Error removing agent', error);
            await this.notificationService.showError('Failed to remove agent');
        }
    }

    async toggleTheme(theme: string): Promise<void> {
        try {
            this.loggingService.info('ConductorViewModel: Toggling theme', { theme });
            this.publishEvent(DOMAIN_EVENTS.THEME_CHANGED, theme);
            await this.notificationService.showInformation(`Theme changed to ${theme}`);
        } catch (error) {
            this.loggingService.error('ConductorViewModel: Error toggling theme', error);
            await this.notificationService.showError('Failed to change theme');
        }
    }

    async showAgentPrompt(): Promise<void> {
        try {
            this.loggingService.info('ConductorViewModel: Showing agent prompt');
            // Use the existing addAgent command to show agent selection
            await this.commandService.execute('nofx.addAgent');
        } catch (error) {
            this.loggingService.error('ConductorViewModel: Error showing agent prompt', error);
            await this.notificationService.showError('Failed to show agent prompt');
        }
    }

    subscribe(callback: (state: ConductorViewState) => void): vscode.Disposable {
        this.stateChangeCallbacks.push(callback);

        // Immediately call with current state
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

    private publishViewStateChange(): void {
        const state = this.getViewState();

        // Notify direct subscribers
        this.stateChangeCallbacks.forEach(callback => {
            try {
                callback(state);
            } catch (error) {
                this.loggingService.error('ConductorViewModel: Error in state change callback', error);
            }
        });
    }

    dispose(): void {
        this.loggingService.info('ConductorViewModel: Disposing');

        // Dispose all subscriptions
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];

        // Clear callbacks
        this.stateChangeCallbacks = [];
    }
}
