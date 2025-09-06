"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryMessagePersistenceService = void 0;
const EventConstants_1 = require("./EventConstants");
class InMemoryMessagePersistenceService {
    constructor(loggingService, configService, eventBus) {
        this.loggingService = loggingService;
        this.configService = configService;
        this.eventBus = eventBus;
        this.messages = [];
        this.maxMessages = 1000;
        this.isDisposed = false;
        this.maxMessages = this.configService.getOrchestrationHistoryLimit();
        this.loggingService.info('InMemoryMessagePersistenceService initialized (no workspace folder)');
    }
    async save(message) {
        if (this.isDisposed) {
            this.loggingService.warn('Attempted to save message after disposal');
            return;
        }
        try {
            this.messages.push(message);
            if (this.messages.length > this.maxMessages) {
                this.messages = this.messages.slice(-this.maxMessages);
            }
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_PERSISTED, {
                messageId: message.id,
                messageType: message.type,
                timestamp: message.timestamp
            });
            this.loggingService.debug('Message saved to in-memory persistence', {
                messageId: message.id,
                type: message.type,
                totalMessages: this.messages.length
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to save message to in-memory persistence', {
                messageId: message.id,
                error: err.message
            });
            throw err;
        }
    }
    async load(offset = 0, limit = 100) {
        if (this.isDisposed) {
            this.loggingService.warn('Attempted to load messages after disposal');
            return [];
        }
        try {
            const startIndex = Math.max(0, this.messages.length - offset - limit);
            const endIndex = this.messages.length - offset;
            const result = this.messages.slice(startIndex, endIndex).reverse();
            this.loggingService.debug('Messages loaded from in-memory persistence', {
                offset,
                limit,
                returned: result.length,
                total: this.messages.length
            });
            return result;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to load messages from in-memory persistence', {
                offset,
                limit,
                error: err.message
            });
            return [];
        }
    }
    async getHistory(clientIdOrFilter, messageType) {
        if (this.isDisposed) {
            return [];
        }
        try {
            let filter = {};
            if (typeof clientIdOrFilter === 'string') {
                filter = {
                    clientId: clientIdOrFilter,
                    type: messageType
                };
            }
            else if (clientIdOrFilter) {
                filter = clientIdOrFilter;
            }
            let filteredMessages = [...this.messages];
            if (filter.clientId) {
                filteredMessages = filteredMessages.filter(msg => msg.from === filter.clientId || msg.to === filter.clientId);
            }
            if (filter.type) {
                filteredMessages = filteredMessages.filter(msg => msg.type === filter.type);
            }
            if (filter.timeRange) {
                const fromTime = filter.timeRange.from?.getTime();
                const toTime = filter.timeRange.to?.getTime();
                filteredMessages = filteredMessages.filter(msg => {
                    const msgTime = new Date(msg.timestamp).getTime();
                    if (fromTime && msgTime < fromTime)
                        return false;
                    if (toTime && msgTime > toTime)
                        return false;
                    return true;
                });
            }
            const offset = filter.offset ?? 0;
            const limit = filter.limit ?? this.maxMessages;
            const startIndex = Math.max(0, filteredMessages.length - offset - limit);
            const endIndex = filteredMessages.length - offset;
            const result = filteredMessages.slice(startIndex, endIndex).reverse();
            this.loggingService.debug('Message history retrieved with filter from in-memory persistence', {
                totalMessages: this.messages.length,
                filteredMessages: filteredMessages.length,
                returned: result.length,
                filter,
                offset,
                limit
            });
            return result;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get message history with filter from in-memory persistence', {
                clientIdOrFilter,
                messageType,
                error: err.message
            });
            return [];
        }
    }
    async clear() {
        if (this.isDisposed) {
            return;
        }
        try {
            const messageCount = this.messages.length;
            this.messages = [];
            this.loggingService.info('In-memory message persistence cleared', {
                messagesCleared: messageCount
            });
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_STORAGE_CLEANUP, {
                messagesCleared: messageCount
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to clear in-memory message persistence', {
                error: err.message
            });
            throw err;
        }
    }
    async getStats() {
        if (this.isDisposed) {
            return { totalMessages: 0, oldestMessage: new Date() };
        }
        try {
            const totalMessages = this.messages.length;
            const oldestMessage = this.messages.length > 0
                ? new Date(Math.min(...this.messages.map(m => new Date(m.timestamp).getTime())))
                : new Date();
            return { totalMessages, oldestMessage };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get in-memory persistence stats', {
                error: err.message
            });
            return { totalMessages: 0, oldestMessage: new Date() };
        }
    }
    dispose() {
        this.isDisposed = true;
        this.messages = [];
        this.loggingService.debug('InMemoryMessagePersistenceService disposed');
    }
}
exports.InMemoryMessagePersistenceService = InMemoryMessagePersistenceService;
//# sourceMappingURL=InMemoryMessagePersistenceService.js.map