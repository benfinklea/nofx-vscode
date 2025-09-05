import { 
    IMessagePersistenceService, 
    ILoggingService, 
    IConfigurationService, 
    IEventBus,
    MessageFilter
} from './interfaces';
import { OrchestratorMessage } from '../orchestration/MessageProtocol';
import { ORCH_EVENTS } from './EventConstants';

export class InMemoryMessagePersistenceService implements IMessagePersistenceService {
    private messages: OrchestratorMessage[] = [];
    private maxMessages: number;
    private isDisposed = false;

    constructor(
        private loggingService: ILoggingService,
        private configService: IConfigurationService,
        private eventBus: IEventBus
    ) {
        this.maxMessages = this.configService.get('orchestration.inMemoryMaxMessages', 1000);
    }

    async save(message: OrchestratorMessage): Promise<void> {
        if (this.isDisposed) {
            this.loggingService.warn('Attempted to save message after disposal');
            return;
        }

        try {
            // Add to in-memory array
            this.messages.push(message);
            
            // Limit array size
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
            const startIndex = Math.max(0, this.messages.length - offset - limit);
            const endIndex = Math.min(this.messages.length, startIndex + limit);
            
            return this.messages.slice(startIndex, endIndex);

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
            const limit = filter.limit || this.maxMessages;
            const offset = filter.offset || 0;
            const startIndex = Math.max(0, filteredMessages.length - offset - limit);
            const endIndex = Math.min(filteredMessages.length, startIndex + limit);
            const paginatedMessages = filteredMessages.slice(startIndex, endIndex);

            this.loggingService.debug('Message history retrieved from in-memory persistence with filter', {
                totalMessages: this.messages.length,
                filteredMessages: filteredMessages.length,
                paginatedMessages: paginatedMessages.length,
                filter,
                offset,
                limit
            });

            return paginatedMessages;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get message history from in-memory persistence with filter', {
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
                ? new Date(this.messages[0].timestamp) 
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
