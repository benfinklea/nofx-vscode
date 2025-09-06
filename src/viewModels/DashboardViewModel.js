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
exports.DashboardViewModel = void 0;
const vscode = __importStar(require("vscode"));
const MessageProtocol_1 = require("../orchestration/MessageProtocol");
const EventConstants_1 = require("../services/EventConstants");
class DashboardViewModel {
    constructor(uiStateManager, orchestrationServer, eventBus, loggingService, messagePersistence, connectionPool) {
        this.messageBuffer = [];
        this.activeFilters = {
            limit: 100,
            offset: 0
        };
        this.connectionStatus = new Map();
        this.clientToLogical = new Map();
        this.statistics = {
            totalMessages: 0,
            successRate: 0,
            averageResponseTime: 0,
            activeConnections: 0
        };
        this.subscriptions = [];
        this.stateChangeCallbacks = [];
        this.isPaused = false;
        this.uiStateManager = uiStateManager;
        this.orchestrationServer = orchestrationServer;
        this.eventBus = eventBus;
        this.loggingService = loggingService;
        this.messagePersistence = messagePersistence;
        this.connectionPool = connectionPool;
        this.initialize();
    }
    initialize() {
        this.loggingService.info('DashboardViewModel: Initializing');
        this.subscriptions.push(this.eventBus.subscribe(EventConstants_1.ORCH_EVENTS.MESSAGE_RECEIVED, (data) => this.handleNewMessage(data.message)), this.eventBus.subscribe(EventConstants_1.ORCH_EVENTS.CLIENT_CONNECTED, (data) => this.updateConnectionStatus(data)), this.eventBus.subscribe(EventConstants_1.ORCH_EVENTS.CLIENT_DISCONNECTED, (data) => {
            this.connectionStatus.set(data.clientId, 'disconnected');
            this.publishStateChange();
        }), this.eventBus.subscribe(EventConstants_1.ORCH_EVENTS.LOGICAL_ID_REGISTERED, (data) => this.handleLogicalIdRegistered(data)), this.eventBus.subscribe(EventConstants_1.ORCH_EVENTS.LOGICAL_ID_UNREGISTERED, (data) => this.handleLogicalIdUnregistered(data)), this.eventBus.subscribe(EventConstants_1.ORCH_EVENTS.MESSAGE_PERSISTED, () => this.handlePersistenceUpdate()), this.eventBus.subscribe(EventConstants_1.ORCH_EVENTS.MESSAGE_STORAGE_CLEANUP, () => this.handlePersistenceUpdate()));
        this.orchestrationServer.setDashboardCallback((message) => {
            this.handleNewMessage(message);
        });
    }
    async getDashboardState() {
        const connections = await Promise.all(Array.from(this.connectionStatus.entries()).map(async ([id, status]) => ({
            id,
            name: id,
            status,
            lastMessage: await this.getLastMessageForConnection(id)
        })));
        const messages = await this.getFilteredMessages();
        return {
            connections,
            messages,
            stats: { ...this.statistics },
            filters: { ...this.activeFilters }
        };
    }
    async handleCommand(command, data) {
        try {
            this.loggingService.debug('DashboardViewModel: Handling command', { command, data });
            switch (command) {
                case "applyFilter":
                    this.applyFilter(data?.filter);
                    break;
                case "clearMessages":
                    await this.clearMessages();
                    break;
                case "exportMessages":
                    this.exportMessages();
                    break;
                case "pauseUpdates":
                    this.pauseUpdates();
                    break;
                case "resumeUpdates":
                    this.resumeUpdates();
                    break;
                default:
                    this.loggingService.warn('DashboardViewModel: Unknown command', command);
            }
        }
        catch (error) {
            this.loggingService.error('DashboardViewModel: Error handling command', error);
        }
    }
    applyFilter(filter) {
        this.loggingService.debug('DashboardViewModel: Applying filter', filter);
        this.activeFilters = {
            ...this.activeFilters,
            ...filter
        };
        this.publishStateChange();
    }
    handlePersistenceUpdate() {
        this.loggingService.debug('DashboardViewModel: Persistence updated, refreshing data');
        this.throttledPublishStateChange();
    }
    async clearMessages() {
        this.loggingService.info('DashboardViewModel: Clearing messages');
        this.messageBuffer = [];
        try {
            await this.messagePersistence.clear();
        }
        catch (error) {
            this.loggingService.error('Failed to clear message persistence', error);
        }
        this.publishStateChange();
    }
    async exportMessages() {
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
        }
        catch (error) {
            this.loggingService.error('DashboardViewModel: Error exporting messages', error);
        }
    }
    calculateMessageStats() {
        const history = this.messageBuffer;
        const connections = this.connectionPool?.getAllConnections() || new Map();
        const assigned = history.filter((m) => m.type === MessageProtocol_1.MessageType.ASSIGN_TASK).length;
        const completed = history.filter((m) => m.type === MessageProtocol_1.MessageType.TASK_COMPLETE).length;
        const successRate = assigned > 0 ? (completed / assigned) * 100 : 0;
        let agentCount = 0;
        connections.forEach((conn) => {
            if (conn.metadata.isAgent) {
                agentCount++;
            }
        });
        return {
            totalMessages: history.length,
            successRate,
            averageResponseTime: 0,
            activeConnections: agentCount
        };
    }
    calculateSuccessRate() {
        const history = this.messageBuffer;
        const assigned = history.filter((m) => m.type === MessageProtocol_1.MessageType.ASSIGN_TASK).length;
        const completed = history.filter((m) => m.type === MessageProtocol_1.MessageType.TASK_COMPLETE).length;
        return assigned > 0 ? (completed / assigned) * 100 : 0;
    }
    subscribe(callback) {
        this.stateChangeCallbacks.push(callback);
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
    handleNewMessage(message) {
        this.messageBuffer.push(message);
        if (this.messageBuffer.length > 100) {
            this.messageBuffer.shift();
        }
        const normalizedId = this.normalizeId(message.from);
        this.connectionStatus.set(normalizedId, 'connected');
        this.updateStatistics().then(() => {
            this.throttledPublishStateChange();
        });
    }
    updateConnectionStatus(data) {
        const normalizedId = this.normalizeId(data.clientId);
        this.connectionStatus.set(normalizedId, 'connected');
        this.publishStateChange();
    }
    handleLogicalIdRegistered(data) {
        this.clientToLogical.set(data.clientId, data.logicalId);
        this.loggingService.debug('Logical ID registered in dashboard', {
            clientId: data.clientId,
            logicalId: data.logicalId
        });
    }
    handleLogicalIdUnregistered(data) {
        this.clientToLogical.delete(data.clientId);
        this.loggingService.debug('Logical ID unregistered in dashboard', {
            clientId: data.clientId,
            logicalId: data.logicalId
        });
    }
    normalizeId(inputId) {
        if (this.clientToLogical.has(inputId)) {
            return this.clientToLogical.get(inputId);
        }
        if (this.connectionPool && this.connectionPool.resolveLogicalId(inputId)) {
            return inputId;
        }
        return inputId;
    }
    async getLastMessageForConnection(connectionId) {
        const history = await this.messagePersistence.getHistory();
        const lastMessage = history
            .filter(m => m.from === connectionId || m.to === connectionId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
        return lastMessage ? new Date(lastMessage.timestamp) : undefined;
    }
    async getFilteredMessages() {
        try {
            const filter = {
                clientId: this.activeFilters.source,
                type: this.activeFilters.messageType,
                limit: this.activeFilters.limit || 100,
                offset: this.activeFilters.offset || 0
            };
            if (this.activeFilters.timeRange) {
                const now = new Date();
                const rangeMinutes = parseInt(this.activeFilters.timeRange);
                const fromTime = new Date(now.getTime() - (rangeMinutes * 60 * 1000));
                filter.timeRange = {
                    from: fromTime,
                    to: now
                };
            }
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
        }
        catch (error) {
            this.loggingService.error('Failed to get filtered messages from persistence', error);
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
    async updateStatistics() {
        const history = await this.messagePersistence.getHistory();
        const connections = this.connectionPool?.getAllConnections() || new Map();
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
    calculateAverageResponseTime(messages) {
        return 0;
    }
    throttledPublishStateChange() {
        if (this.isPaused) {
            return;
        }
        if (this.throttledUpdateTimer) {
            clearTimeout(this.throttledUpdateTimer);
        }
        this.throttledUpdateTimer = setTimeout(() => {
            this.publishStateChange();
            this.throttledUpdateTimer = undefined;
        }, 100);
    }
    pauseUpdates() {
        this.isPaused = true;
        if (this.throttledUpdateTimer) {
            clearTimeout(this.throttledUpdateTimer);
            this.throttledUpdateTimer = undefined;
        }
    }
    resumeUpdates() {
        this.isPaused = false;
        this.publishStateChange();
    }
    async publishStateChange() {
        const state = await this.getDashboardState();
        this.stateChangeCallbacks.forEach(callback => {
            try {
                callback(state);
            }
            catch (error) {
                this.loggingService.error('DashboardViewModel: Error in state change callback', error);
            }
        });
    }
    dispose() {
        this.loggingService.info('DashboardViewModel: Disposing');
        this.orchestrationServer.clearDashboardCallback();
        if (this.throttledUpdateTimer) {
            clearTimeout(this.throttledUpdateTimer);
        }
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
        this.stateChangeCallbacks = [];
    }
}
exports.DashboardViewModel = DashboardViewModel;
//# sourceMappingURL=DashboardViewModel.js.map