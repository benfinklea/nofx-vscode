import * as vscode from 'vscode';
import { IUIStateManager, IEventBus, ILoggingService, IDashboardViewModel, IMessagePersistenceService, IConnectionPoolService, MessageFilter } from '../services/interfaces';
import { DashboardViewState, WebviewCommand } from '../types/ui';
import { OrchestrationServer } from '../orchestration/OrchestrationServer';
import { OrchestratorMessage, MessageType } from '../orchestration/MessageProtocol';
import { ORCH_EVENTS } from '../services/EventConstants';

export class DashboardViewModel implements IDashboardViewModel {
    private uiStateManager: IUIStateManager;
    private orchestrationServer: OrchestrationServer;
    private eventBus: IEventBus;
    private loggingService: ILoggingService;
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

    constructor(
        uiStateManager: IUIStateManager,
        orchestrationServer: OrchestrationServer,
        eventBus: IEventBus,
        loggingService: ILoggingService,
        messagePersistence: IMessagePersistenceService,
        connectionPool?: IConnectionPoolService
    ) {
        this.uiStateManager = uiStateManager;
        this.orchestrationServer = orchestrationServer;
        this.eventBus = eventBus;
        this.loggingService = loggingService;
        this.messagePersistence = messagePersistence;
        this.connectionPool = connectionPool;
        
        this.initialize();
    }

    private initialize(): void {
        this.loggingService.info('DashboardViewModel: Initializing');
        
        // Subscribe to orchestration events
        this.subscriptions.push(
            this.eventBus.subscribe(ORCH_EVENTS.MESSAGE_RECEIVED, (data) => this.handleNewMessage(data.message)),
            this.eventBus.subscribe(ORCH_EVENTS.CLIENT_CONNECTED, (data) => this.updateConnectionStatus(data)),
            this.eventBus.subscribe(ORCH_EVENTS.CLIENT_DISCONNECTED, (data) => { 
                this.connectionStatus.set(data.clientId, 'disconnected'); 
                this.publishStateChange(); 
            }),
            this.eventBus.subscribe(ORCH_EVENTS.LOGICAL_ID_REGISTERED, (data) => this.handleLogicalIdRegistered(data)),
            this.eventBus.subscribe(ORCH_EVENTS.LOGICAL_ID_UNREGISTERED, (data) => this.handleLogicalIdUnregistered(data)),
            // Subscribe to persistence events for real-time updates
            this.eventBus.subscribe(ORCH_EVENTS.MESSAGE_PERSISTED, () => this.handlePersistenceUpdate()),
            this.eventBus.subscribe(ORCH_EVENTS.MESSAGE_STORAGE_CLEANUP, () => this.handlePersistenceUpdate())
        );
        
        // Register dashboard callback with orchestration server
        this.orchestrationServer.setDashboardCallback((message) => {
            this.handleNewMessage(message);
        });
    }

    async getDashboardState(): Promise<DashboardViewState> {
        const connections = await Promise.all(
            Array.from(this.connectionStatus.entries()).map(async ([id, status]) => ({
                id,
                name: id,
                status,
                lastMessage: await this.getLastMessageForConnection(id)
            }))
        );
        
        const messages = await this.getFilteredMessages();
        
        return {
            connections,
            messages,
            stats: { ...this.statistics },
            filters: { ...this.activeFilters }
        };
    }

    async handleCommand(command: string, data?: any): Promise<void> {
        try {
            this.loggingService.debug('DashboardViewModel: Handling command', { command, data });
            
            switch (command as WebviewCommand) {
                case 'applyFilter':
                    this.applyFilter(data?.filter);
                    break;
                case 'clearMessages':
                    await this.clearMessages();
                    break;
                case 'exportMessages':
                    this.exportMessages();
                    break;
                case 'pauseUpdates':
                    this.pauseUpdates();
                    break;
                case 'resumeUpdates':
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
            const connections = this.orchestrationServer.getConnectionSummaries();
            
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

    async calculateMessageStats(): Promise<{ totalMessages: number; successRate: number; averageResponseTime: number; activeConnections: number }> {
        const history = await this.messagePersistence.getHistory();
        const connections = this.connectionPool?.getAllConnections() || new Map();
        
        // Calculate success rate (completed tasks / assigned tasks)
        const assigned = history.filter(m => m.type === MessageType.ASSIGN_TASK).length;
        const completed = history.filter(m => m.type === MessageType.TASK_COMPLETE).length;
        const successRate = assigned > 0 ? (completed / assigned) * 100 : 0;
        
        // Count agent connections from metadata
        let agentCount = 0;
        connections.forEach((conn) => {
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

    async calculateSuccessRate(): Promise<number> {
        const history = await this.messagePersistence.getHistory();
        const assigned = history.filter(m => m.type === MessageType.ASSIGN_TASK).length;
        const completed = history.filter(m => m.type === MessageType.TASK_COMPLETE).length;
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
                const fromTime = new Date(now.getTime() - (rangeMinutes * 60 * 1000));
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
                content: msg.payload,
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
            return this.messageBuffer.map(msg => ({
                id: msg.id,
                timestamp: new Date(msg.timestamp),
                type: msg.type,
                content: msg.payload,
                source: msg.from,
                target: msg.to
            })).slice(-100);
        }
    }

    private async updateStatistics(): Promise<void> {
        const history = await this.messagePersistence.getHistory();
        const connections = this.connectionPool?.getAllConnections() || new Map();
        
        // Count agent connections from metadata
        let agentCount = 0;
        connections.forEach((conn) => {
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
        
        // Clear orchestration callback
        this.orchestrationServer.clearDashboardCallback();
        
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
