import {
    IMessagePersistenceService,
    ILoggingService,
    IConfigurationService,
    IEventBus,
    MessageFilter
} from './interfaces';
import { OrchestratorMessage } from '../orchestration/MessageProtocol';
import { ORCH_EVENTS } from './EventConstants';

/**
 * In-memory implementation of IMessagePersistenceService
 * Used as fallback when no workspace folder is available
 */
export class InMemoryMessagePersistenceService implements IMessagePersistenceService {
    private messages: OrchestratorMessage[] = [];
    private maxMessages = 1000; // Configurable limit
    private isDisposed = false;

    constructor(
        private loggingService: ILoggingService,
        private configService: IConfigurationService,
        private eventBus: IEventBus
    ) {
        this.maxMessages = this.configService.getOrchestrationHistoryLimit();
        this.loggingService.info('InMemoryMessagePersistenceService initialized (no workspace folder)');
    }

    async save(message: OrchestratorMessage): Promise<void> {
        if (this.isDisposed) {
            this.loggingService.warn('Attempted to save message after disposal');
            return;
        }

        try {
            // Add message to in-memory array
            this.messages.push(message);

            // Maintain size limit by removing oldest messages
            if (this.messages.length > this.maxMessages) {
                this.messages = this.messages.slice(-this.maxMessages);
            }

            this.eventBus.publish(ORCH_EVENTS.MESSAGE_PERSISTED, {
                messageId: message.id,
                messageType: message.type,
                timestamp: message.timestamp
            });

            this.loggingService.debug('Message saved to in-memory persistence', {
                messageId: message.id,
                type: message.type,
                totalMessages: this.messages.length
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to save message to in-memory persistence', {
                messageId: message.id,
                error: err.message
            });
            throw err;
        }
    }

    async load(offset: number = 0, limit: number = 100): Promise<OrchestratorMessage[]> {
        if (this.isDisposed) {
            this.loggingService.warn('Attempted to load messages after disposal');
            return [];
        }

        try {
            // Return messages in reverse chronological order (newest first)
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

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to load messages from in-memory persistence', {
                offset,
                limit,
                error: err.message
            });
            return [];
        }
    }

    async getHistory(clientId?: string, messageType?: string): Promise<OrchestratorMessage[]>;
    async getHistory(filter?: MessageFilter): Promise<OrchestratorMessage[]>;
    async getHistory(clientIdOrFilter?: string | MessageFilter, messageType?: string): Promise<OrchestratorMessage[]> {
        if (this.isDisposed) {
            return [];
        }

        try {
            // Handle overloaded method calls
            let filter: MessageFilter = {};
            if (typeof clientIdOrFilter === 'string') {
                // Legacy call with clientId and messageType
                filter = {
                    clientId: clientIdOrFilter,
                    type: messageType
                };
            } else if (clientIdOrFilter) {
                // New call with filter object
                filter = clientIdOrFilter;
            }

            // Start with all messages
            let filteredMessages = [...this.messages];

            // Apply client ID filter
            if (filter.clientId) {
                filteredMessages = filteredMessages.filter(msg =>
                    msg.from === filter.clientId || msg.to === filter.clientId
                );
            }

            // Apply message type filter
            if (filter.type) {
                filteredMessages = filteredMessages.filter(msg =>
                    msg.type === filter.type
                );
            }

            // Apply time range filter
            if (filter.timeRange) {
                const fromTime = filter.timeRange.from?.getTime();
                const toTime = filter.timeRange.to?.getTime();

                filteredMessages = filteredMessages.filter(msg => {
                    const msgTime = new Date(msg.timestamp).getTime();
                    if (fromTime && msgTime < fromTime) return false;
                    if (toTime && msgTime > toTime) return false;
                    return true;
                });
            }

            // Apply pagination
            const offset = filter.offset ?? 0;
            const limit = filter.limit ?? this.maxMessages;

            // Return in reverse chronological order (newest first)
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

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get message history with filter from in-memory persistence', {
                clientIdOrFilter,
                messageType,
                error: err.message
            });
            return [];
        }
    }

    async clear(): Promise<void> {
        if (this.isDisposed) {
            return;
        }

        try {
            const messageCount = this.messages.length;
            this.messages = [];

            this.loggingService.info('In-memory message persistence cleared', {
                messagesCleared: messageCount
            });

            this.eventBus.publish(ORCH_EVENTS.MESSAGE_STORAGE_CLEANUP, {
                messagesCleared: messageCount
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to clear in-memory message persistence', {
                error: err.message
            });
            throw err;
        }
    }

    async getStats(): Promise<{totalMessages: number, oldestMessage: Date}> {
        if (this.isDisposed) {
            return { totalMessages: 0, oldestMessage: new Date() };
        }

        try {
            const totalMessages = this.messages.length;
            const oldestMessage = this.messages.length > 0
                ? new Date(Math.min(...this.messages.map(m => new Date(m.timestamp).getTime())))
                : new Date();

            return { totalMessages, oldestMessage };

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get in-memory persistence stats', {
                error: err.message
            });
            return { totalMessages: 0, oldestMessage: new Date() };
        }
    }

    dispose(): void {
        this.isDisposed = true;
        this.messages = [];
        this.loggingService.debug('InMemoryMessagePersistenceService disposed');
    }
}
