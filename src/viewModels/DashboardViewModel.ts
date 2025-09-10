import * as vscode from 'vscode';
import {
    IUIStateManager,
    IEventEmitter,
    IEventSubscriber,
    ILogger,
    IDashboardViewModel,
    IMessagePersistenceService,
    IConnectionPoolService,
    MessageFilter
} from '../services/interfaces';
import { DashboardViewState, WebviewCommand, WEBVIEW_COMMANDS } from '../types/ui';
import { DirectCommunicationService } from '../services/DirectCommunicationService';
import { OrchestratorMessage, MessageType } from '../orchestration/MessageProtocol';
import { ORCH_EVENTS } from '../services/EventConstants';
import { getAppStateStore } from '../state/AppStateStore';
import * as selectors from '../state/selectors';
import * as actions from '../state/actions';
export class DashboardViewModel implements IDashboardViewModel {
    private store: IUIStateManager; // Alias for compatibility
    private uiStateManager: IUIStateManager;
    private directCommunicationService: DirectCommunicationService;
    private eventBus: IEventEmitter & IEventSubscriber;
    private loggingService: ILogger;
    private messagePersistence: IMessagePersistenceService;
    private connectionPool?: IConnectionPoolService;

    // Dashboard-specific state
    private messageBuffer: OrchestratorMessage[] = [];
    private activeFilters: {
        messageType?: string;
        timeRange?: string;
        source?: string;
        limit?: number;
        offset?: number;
    } = {
        limit: 100,
        offset: 0
    };
    private connectionStatus: Map<string, 'connected' | 'disconnected'> = new Map();
    private clientToLogical = new Map<string, string>();
    private statistics: {
        totalMessages: number;
        successRate: number;
        averageResponseTime: number;
        activeConnections: number;
    } = {
        totalMessages: 0,
        successRate: 0,
        averageResponseTime: 0,
        activeConnections: 0
    };

    // Event subscriptions
    private subscriptions: vscode.Disposable[] = [];
    private stateChangeCallbacks: ((state: DashboardViewState) => void)[] = [];
    private throttledUpdateTimer: NodeJS.Timeout | undefined;
    private isPaused: boolean = false;
    private dashboardCallback?: (message: OrchestratorMessage) => void;

    constructor(
        uiStateManager: IUIStateManager,
        directCommunicationService: DirectCommunicationService,
        eventBus: IEventEmitter & IEventSubscriber,
        loggingService: ILogger,
        messagePersistence: IMessagePersistenceService,
        connectionPool?: IConnectionPoolService
    ) {
        this.store = uiStateManager;
        this.directCommunicationService = directCommunicationService;
        this.eventBus = eventBus;
        this.loggingService = loggingService;
        this.messagePersistence = messagePersistence;
        this.connectionPool = connectionPool;

        this.initialize();
    }

    private initialize(): void {
        this.loggingService.info('DashboardViewModel: Initializing');

        try {
            // Subscribe to orchestration events with error handling
            if (this.eventBus) {
                // Add helper for subscription compatibility
                const subscribeToEvent = (event: string, handler: (data: any) => void) => {
                    if (this.eventBus && 'subscribe' in this.eventBus) {
                        return (this.eventBus as any).subscribe(event, handler);
                    } else if (this.eventBus && 'on' in this.eventBus) {
                        this.eventBus.on(event, handler);
                        return { dispose: () => this.eventBus?.off?.(event, handler) };
                    }
                    return { dispose: () => {} };
                };

                this.subscriptions.push(
                    subscribeToEvent(ORCH_EVENTS.MESSAGE_RECEIVED, data => {
                        try {
                            this.handleNewMessage(data.message);
                        } catch (error) {
                            this.loggingService.error('Error handling MESSAGE_RECEIVED event', error);
                        }
                    }),
                    subscribeToEvent(ORCH_EVENTS.CLIENT_CONNECTED, data => {
                        try {
                            this.updateConnectionStatus(data);
                        } catch (error) {
                            this.loggingService.error('Error handling CLIENT_CONNECTED event', error);
                        }
                    }),
                    subscribeToEvent(ORCH_EVENTS.CLIENT_DISCONNECTED, data => {
                        try {
                            this.connectionStatus.set(data.clientId, 'disconnected');
                            this.publishStateChange();
                        } catch (error) {
                            this.loggingService.error('Error handling CLIENT_DISCONNECTED event', error);
                        }
                    }),
                    subscribeToEvent(ORCH_EVENTS.LOGICAL_ID_REGISTERED, data => {
                        try {
                            this.handleLogicalIdRegistered(data);
                        } catch (error) {
                            this.loggingService.error('Error handling LOGICAL_ID_REGISTERED event', error);
                        }
                    }),
                    subscribeToEvent(ORCH_EVENTS.LOGICAL_ID_UNREGISTERED, data => {
                        try {
                            this.handleLogicalIdUnregistered(data);
                        } catch (error) {
                            this.loggingService.error('Error handling LOGICAL_ID_UNREGISTERED event', error);
                        }
                    }),
                    // Subscribe to persistence events for real-time updates
                    subscribeToEvent(ORCH_EVENTS.MESSAGE_PERSISTED, () => {
                        try {
                            this.handlePersistenceUpdate();
                        } catch (error) {
                            this.loggingService.error('Error handling MESSAGE_PERSISTED event', error);
                        }
                    }),
                    subscribeToEvent(ORCH_EVENTS.MESSAGE_STORAGE_CLEANUP, () => {
                        try {
                            this.handlePersistenceUpdate();
                        } catch (error) {
                            this.loggingService.error('Error handling MESSAGE_STORAGE_CLEANUP event', error);
                        }
                    })
                );
            } else {
                this.loggingService.warn('EventBus not available, dashboard will not receive real-time updates');
            }

            // Register dashboard callback with DirectCommunicationService
            if (this.directCommunicationService) {
                this.dashboardCallback = message => {
                    try {
                        this.handleNewMessage(message);
                    } catch (error) {
                        this.loggingService.error('Error in dashboard callback', error);
                    }
                };
                this.directCommunicationService.setDashboardCallback(this.dashboardCallback);
                this.loggingService.info('Dashboard callback registered with DirectCommunicationService');
            } else {
                this.loggingService.warn(
                    'DirectCommunicationService not available, dashboard will not receive message updates'
                );
            }
        } catch (error) {
            this.loggingService.error('Error during DashboardViewModel initialization', error);
        }
    }

    async getDashboardState(): Promise<DashboardViewState> {
        try {
            // Get connections with error handling
            let connections: any[] = [];
            try {
                connections = await Promise.all(
                    Array.from(this.connectionStatus.entries()).map(async ([id, status]) => {
                        try {
                            return {
                                id,
                                name: id,
                                status,
                                lastMessage: await this.getLastMessageForConnection(id)
                            };
                        } catch (error) {
                            this.loggingService.warn(`Error getting last message for connection ${id}`, error);
                            return {
                                id,
                                name: id,
                                status,
                                lastMessage: undefined
                            };
                        }
                    })
                );
            } catch (error) {
                this.loggingService.error('Error getting connections', error);
                connections = [];
            }

            // Get messages with error handling
            let messages: any[] = [];
            try {
                messages = await this.getFilteredMessages();
            } catch (error) {
                this.loggingService.error('Error getting filtered messages', error);
                messages = [];
            }

            // Ensure statistics are valid
            const stats = {
                activeConnections: this.statistics?.activeConnections ?? 0,
                totalMessages: this.statistics?.totalMessages ?? 0,
                successRate: this.statistics?.successRate ?? 0,
                averageResponseTime: this.statistics?.averageResponseTime ?? 0
            };

            return {
                connections,
                messages,
                stats,
                filters: { ...this.activeFilters }
            };
        } catch (error) {
            this.loggingService.error('Critical error in getDashboardState', error);
            // Return minimal fallback state
            return {
                connections: [],
                messages: [],
                stats: { activeConnections: 0, totalMessages: 0, successRate: 0, averageResponseTime: 0 },
                filters: {}
            };
        }
    }

    async handleCommand(command: string, data?: any): Promise<void> {
        try {
            this.loggingService.debug('DashboardViewModel: Handling command', { command, data });

            switch (command as WebviewCommand) {
                case WEBVIEW_COMMANDS.APPLY_FILTER:
                    this.applyFilter(data?.filter);
                    break;
                case WEBVIEW_COMMANDS.CLEAR_MESSAGES:
                    await this.clearMessages();
                    break;
                case WEBVIEW_COMMANDS.EXPORT_MESSAGES:
                    this.exportMessages();
                    break;
                case WEBVIEW_COMMANDS.PAUSE_UPDATES:
                    this.pauseUpdates();
                    break;
                case WEBVIEW_COMMANDS.RESUME_UPDATES:
                    this.resumeUpdates();
                    break;
                default:
                    this.loggingService.warn('DashboardViewModel: Unknown command', command);
            }
        } catch (error) {
            this.loggingService.error('DashboardViewModel: Error handling command', error);
        }
    }

    applyFilter(filter: any): void {
        this.loggingService.debug('DashboardViewModel: Applying filter', filter);
        this.activeFilters = {
            ...this.activeFilters,
            ...filter
        };
        this.publishStateChange();
    }

    private handlePersistenceUpdate(): void {
        this.loggingService.debug('DashboardViewModel: Persistence updated, refreshing data');
        this.throttledPublishStateChange();
    }

    async clearMessages(): Promise<void> {
        this.loggingService.info('DashboardViewModel: Clearing messages');
        this.messageBuffer = [];

        try {
            await this.messagePersistence.clear();
        } catch (error) {
            this.loggingService.error('Failed to clear message persistence', error);
        }

        this.publishStateChange();
    }

    async exportMessages(): Promise<void> {
        try {
            this.loggingService.info('DashboardViewModel: Exporting messages');

            const history = await this.messagePersistence.getHistory();
            const connections = this.directCommunicationService.getActiveConnections().map(conn => ({
                clientId: conn.id,
                isAgent: conn.type === 'agent',
                connectedAt: conn.connectedAt.toISOString(),
                lastHeartbeat: conn.lastSeen.toISOString(),
                messageCount: conn.messageCount,
                userAgent: conn.metadata?.userAgent
            }));

            const exportData = {
                timestamp: new Date().toISOString(),
                connections,
                messages: history,
                stats: await this.calculateMessageStats()
            };

            const content = JSON.stringify(exportData, null, 2);
            const uri = vscode.Uri.parse(`untitled:nofx-messages-${Date.now()}.json`);

            vscode.workspace.openTextDocument(uri).then(doc => {
                vscode.window.showTextDocument(doc).then(editor => {
                    editor.edit(edit => {
                        edit.insert(new vscode.Position(0, 0), content);
                    });
                });
            });
        } catch (error) {
            this.loggingService.error('DashboardViewModel: Error exporting messages', error);
        }
    }

    calculateMessageStats(): {
        totalMessages: number;
        successRate: number;
        averageResponseTime: number;
        activeConnections: number;
    } {
        // Use cached history for synchronous access
        const history = this.messageBuffer;
        const connections = this.connectionPool?.getAllConnections() || new Map();

        // Calculate success rate (completed tasks / assigned tasks)
        const assigned = history.filter((m: OrchestratorMessage) => m.type === MessageType.ASSIGN_TASK).length;
        const completed = history.filter((m: OrchestratorMessage) => m.type === MessageType.TASK_COMPLETE).length;
        const successRate = assigned > 0 ? (completed / assigned) * 100 : 0;

        // Count agent connections from metadata
        let agentCount = 0;
        connections.forEach(conn => {
            if (conn.metadata.isAgent) {
                agentCount++;
            }
        });

        return {
            totalMessages: history.length,
            successRate,
            averageResponseTime: 0, // Could be enhanced with actual response time tracking
            activeConnections: agentCount
        };
    }

    calculateSuccessRate(): number {
        // Use cached history for synchronous access
        const history = this.messageBuffer;
        const assigned = history.filter((m: OrchestratorMessage) => m.type === MessageType.ASSIGN_TASK).length;
        const completed = history.filter((m: OrchestratorMessage) => m.type === MessageType.TASK_COMPLETE).length;
        return assigned > 0 ? (completed / assigned) * 100 : 0;
    }

    subscribe(callback: (state: DashboardViewState) => void): vscode.Disposable {
        this.stateChangeCallbacks.push(callback);

        // Immediately call with current state
        this.getDashboardState().then(callback);

        return {
            dispose: () => {
                const index = this.stateChangeCallbacks.indexOf(callback);
                if (index > -1) {
                    this.stateChangeCallbacks.splice(index, 1);
                }
            }
        };
    }

    private handleNewMessage(message: OrchestratorMessage): void {
        this.messageBuffer.push(message);

        // Limit buffer size
        if (this.messageBuffer.length > 100) {
            this.messageBuffer.shift();
        }

        // Update connection status using normalized ID
        const normalizedId = this.normalizeId(message.from);
        this.connectionStatus.set(normalizedId, 'connected');

        // Update statistics and publish state change
        this.updateStatistics().then(() => {
            this.throttledPublishStateChange();
        });
    }

    private updateConnectionStatus(data: any): void {
        const normalizedId = this.normalizeId(data.clientId);
        this.connectionStatus.set(normalizedId, 'connected');
        this.publishStateChange();
    }

    private handleLogicalIdRegistered(data: any): void {
        this.clientToLogical.set(data.clientId, data.logicalId);
        this.loggingService.debug('Logical ID registered in dashboard', {
            clientId: data.clientId,
            logicalId: data.logicalId
        });
    }

    private handleLogicalIdUnregistered(data: any): void {
        this.clientToLogical.delete(data.clientId);
        this.loggingService.debug('Logical ID unregistered in dashboard', {
            clientId: data.clientId,
            logicalId: data.logicalId
        });
    }

    private normalizeId(inputId: string): string {
        // If we have a logical ID for this client ID, return the logical ID
        if (this.clientToLogical.has(inputId)) {
            return this.clientToLogical.get(inputId)!;
        }

        // If inputId looks like a logical ID and we can resolve it, use the logical ID
        if (this.connectionPool && this.connectionPool.resolveLogicalId(inputId)) {
            return inputId;
        }

        // Otherwise return the input ID as-is
        return inputId;
    }

    private async getLastMessageForConnection(connectionId: string): Promise<Date | undefined> {
        const history = await this.messagePersistence.getHistory();
        const lastMessage = history
            .filter(m => m.from === connectionId || m.to === connectionId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

        return lastMessage ? new Date(lastMessage.timestamp) : undefined;
    }

    private async getFilteredMessages(): Promise<any[]> {
        try {
            // Build filter object
            const filter: MessageFilter = {
                clientId: this.activeFilters.source,
                type: this.activeFilters.messageType,
                limit: this.activeFilters.limit || 100,
                offset: this.activeFilters.offset || 0
            };

            // Apply time range filter
            if (this.activeFilters.timeRange) {
                const now = new Date();
                const rangeMinutes = parseInt(this.activeFilters.timeRange);
                const fromTime = new Date(now.getTime() - rangeMinutes * 60 * 1000);
                filter.timeRange = {
                    from: fromTime,
                    to: now
                };
            }

            // Get messages from persistence with filters
            const history = await this.messagePersistence.getHistory(filter);

            const messages = history.map(msg => ({
                id: msg.id,
                timestamp: new Date(msg.timestamp),
                type: msg.type,
                content: typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload, null, 2),
                source: msg.from,
                target: msg.to
            }));

            this.loggingService.debug('Retrieved filtered messages', {
                filter,
                messageCount: messages.length
            });

            return messages;
        } catch (error) {
            this.loggingService.error('Failed to get filtered messages from persistence', error);
            // Fallback to in-memory buffer
            return this.messageBuffer
                .map(msg => ({
                    id: msg.id,
                    timestamp: new Date(msg.timestamp),
                    type: msg.type,
                    content: typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload, null, 2),
                    source: msg.from,
                    target: msg.to
                }))
                .slice(-100);
        }
    }

    private async updateStatistics(): Promise<void> {
        const history = await this.messagePersistence.getHistory();
        const connections = this.connectionPool?.getAllConnections() || new Map();

        // Count agent connections from metadata
        let agentCount = 0;
        connections.forEach(conn => {
            if (conn.metadata.isAgent) {
                agentCount++;
            }
        });

        this.statistics = {
            totalMessages: history.length,
            successRate: await this.calculateSuccessRate(),
            averageResponseTime: this.calculateAverageResponseTime(history),
            activeConnections: agentCount
        };
    }

    private calculateAverageResponseTime(messages: OrchestratorMessage[]): number {
        // Simple implementation - could be enhanced with actual response time tracking
        return 0;
    }

    private throttledPublishStateChange(): void {
        if (this.isPaused) {
            return;
        }

        // Clear existing timer
        if (this.throttledUpdateTimer) {
            clearTimeout(this.throttledUpdateTimer);
        }

        // Set new timer to publish state change after a short delay
        this.throttledUpdateTimer = setTimeout(() => {
            this.publishStateChange();
            this.throttledUpdateTimer = undefined;
        }, 100); // 100ms throttle
    }

    private pauseUpdates(): void {
        this.isPaused = true;
        if (this.throttledUpdateTimer) {
            clearTimeout(this.throttledUpdateTimer);
            this.throttledUpdateTimer = undefined;
        }
    }

    private resumeUpdates(): void {
        this.isPaused = false;
        // Immediately publish current state when resuming
        this.publishStateChange();
    }

    private async publishStateChange(): Promise<void> {
        const state = await this.getDashboardState();

        // Notify direct subscribers
        this.stateChangeCallbacks.forEach(callback => {
            try {
                callback(state);
            } catch (error) {
                this.loggingService.error('DashboardViewModel: Error in state change callback', error);
            }
        });
    }

    dispose(): void {
        this.loggingService.info('DashboardViewModel: Disposing');

        // Clear DirectCommunicationService callback
        if (this.directCommunicationService && this.dashboardCallback) {
            this.directCommunicationService.removeDashboardCallback(this.dashboardCallback);
        }

        // Clear throttled update timer
        if (this.throttledUpdateTimer) {
            clearTimeout(this.throttledUpdateTimer);
        }

        // Dispose all subscriptions
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];

        // Clear callbacks
        this.stateChangeCallbacks = [];
    }
}
