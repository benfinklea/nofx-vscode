import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { 
    IMessagePersistenceService, 
    ILoggingService, 
    IConfigurationService, 
    IEventBus,
    MessageFilter
} from './interfaces';
import { OrchestratorMessage } from '../orchestration/MessageProtocol';
import { ORCH_EVENTS } from './EventConstants';

export class MessagePersistenceService implements IMessagePersistenceService {
    private persistenceDir: string;
    private messagesFile: string;
    private maxFileSize: number;
    private historyLimit: number;
    private inMemoryCache: OrchestratorMessage[] = [];
    private cacheSize = 100;
    private isDisposed = false;
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(
        private loggingService: ILoggingService,
        private configService: IConfigurationService,
        private eventBus: IEventBus,
        workspaceRoot: string
    ) {
        this.persistenceDir = path.join(workspaceRoot, '.nofx', 'orchestration');
        this.messagesFile = path.join(this.persistenceDir, 'messages.jsonl');
        this.maxFileSize = this.configService.getOrchestrationMaxFileSize();
        this.historyLimit = this.configService.getOrchestrationHistoryLimit();

        this.ensureDirectories();
        this.loadRecentMessages();
    }

    async save(message: OrchestratorMessage): Promise<void> {
        if (this.isDisposed) {
            this.loggingService.warn('Attempted to save message after disposal');
            return;
        }

        try {
            // Ensure paths exist before writing
            await this.ensurePaths();

            // Add to in-memory cache
            this.inMemoryCache.push(message);
            if (this.inMemoryCache.length > this.cacheSize) {
                this.inMemoryCache = this.inMemoryCache.slice(-this.cacheSize);
            }

            // Append to file using write queue for atomicity
            const messageLine = JSON.stringify(message) + '\n';
            this.writeQueue = this.writeQueue.then(async () => {
                await fsPromises.appendFile(this.messagesFile, messageLine, 'utf8');
            });
            await this.writeQueue;

            // Check if file needs rolling
            await this.checkAndRollFile();

            this.eventBus.publish(ORCH_EVENTS.MESSAGE_PERSISTED, {
                messageId: message.id,
                messageType: message.type,
                timestamp: message.timestamp
            });

            this.loggingService.debug('Message saved to persistence', {
                messageId: message.id,
                type: message.type,
                cacheSize: this.inMemoryCache.length
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to save message to persistence', {
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
            // If requesting recent messages and they're in cache, return from cache
            if (offset === 0 && limit <= this.cacheSize) {
                const fromCache = this.inMemoryCache.slice(-limit);
                if (fromCache.length >= limit) {
                    return fromCache;
                }
            }

            // Read from file
            const messages = await this.readMessagesFromFile(offset, limit);
            return messages;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to load messages from persistence', {
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

            // Determine how many messages to read based on filter
            const limit = filter.limit ?? this.historyLimit;
            const offset = filter.offset ?? 0;
            
            // Read messages from file with proper limit/offset
            const allMessages = await this.readMessagesFromFile(offset, limit);
            
            let filteredMessages = allMessages;

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

            this.loggingService.debug('Message history retrieved with filter', {
                totalMessages: allMessages.length,
                filteredMessages: filteredMessages.length,
                filter,
                offset,
                limit
            });

            return filteredMessages;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get message history with filter', {
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
            // Clear in-memory cache
            this.inMemoryCache = [];

            // Remove all message files
            const files = await fsPromises.readdir(this.persistenceDir);
            const messageFiles = files.filter(file => file.startsWith('messages'));
            
            for (const file of messageFiles) {
                const filePath = path.join(this.persistenceDir, file);
                await fsPromises.unlink(filePath);
            }

            this.loggingService.info('Message persistence cleared', {
                filesRemoved: messageFiles.length
            });

            this.eventBus.publish(ORCH_EVENTS.MESSAGE_STORAGE_CLEANUP, {
                filesRemoved: messageFiles.length
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to clear message persistence', {
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
            const messages = await this.readMessagesFromFile(0, this.historyLimit);
            const totalMessages = messages.length;
            const oldestMessage = messages.length > 0 
                ? new Date(messages[0].timestamp) 
                : new Date();

            return { totalMessages, oldestMessage };

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get persistence stats', {
                error: err.message
            });
            return { totalMessages: 0, oldestMessage: new Date() };
        }
    }

    dispose(): void {
        this.isDisposed = true;
        this.inMemoryCache = [];
        this.loggingService.debug('MessagePersistenceService disposed');
    }

    private ensureDirectories(): void {
        if (!fs.existsSync(this.persistenceDir)) {
            fs.mkdirSync(this.persistenceDir, { recursive: true });
            this.loggingService.info(`Created orchestration persistence directory: ${this.persistenceDir}`);
        }
    }

    private async ensurePaths(): Promise<void> {
        await fsPromises.mkdir(this.persistenceDir, { recursive: true });
        await fsPromises.access(this.messagesFile).catch(() => fsPromises.writeFile(this.messagesFile, '', 'utf8'));
    }

    private async loadRecentMessages(): Promise<void> {
        try {
            if (!fs.existsSync(this.messagesFile)) {
                return;
            }

            const messages = await this.readMessagesFromFile(0, this.cacheSize);
            this.inMemoryCache = messages.slice(-this.cacheSize);

            this.loggingService.debug('Loaded recent messages into cache', {
                count: this.inMemoryCache.length
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.warn('Failed to load recent messages into cache', {
                error: err.message
            });
        }
    }

    private async readMessagesFromFile(offset: number, limit: number): Promise<OrchestratorMessage[]> {
        const messages: OrchestratorMessage[] = [];
        let remainingLimit = limit;
        let currentOffset = offset;

        try {
            // First try to read from current file
            const currentFileMessages = await this.readFromSingleFile(this.messagesFile, currentOffset, remainingLimit);
            messages.push(...currentFileMessages);
            remainingLimit -= currentFileMessages.length;
            currentOffset = Math.max(0, currentOffset - currentFileMessages.length);

            // If we need more messages and there are rolled files, read from them
            if (remainingLimit > 0) {
                const rolledFiles = await this.getRolledFiles();
                for (const rolledFile of rolledFiles) {
                    if (remainingLimit <= 0) break;

                    const rolledMessages = await this.readFromSingleFile(rolledFile, currentOffset, remainingLimit);
                    messages.unshift(...rolledMessages); // Prepend to maintain chronological order
                    remainingLimit -= rolledMessages.length;
                    currentOffset = Math.max(0, currentOffset - rolledMessages.length);
                }
            }

            return messages;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to read messages from files', {
                error: err.message
            });
            return [];
        }
    }

    private async readFromSingleFile(filePath: string, offset: number, limit: number): Promise<OrchestratorMessage[]> {
        if (!fs.existsSync(filePath)) {
            return [];
        }

        try {
            // Use streaming approach to read last N lines
            const stats = await fsPromises.stat(filePath);
            const fileSize = stats.size;
            
            if (fileSize === 0) {
                return [];
            }

            // Read file in chunks from the end
            const chunkSize = Math.min(64 * 1024, fileSize); // 64KB chunks
            const messages: OrchestratorMessage[] = [];
            let position = fileSize;
            let buffer = '';

            while (position > 0 && messages.length < limit) {
                const readSize = Math.min(chunkSize, position);
                position -= readSize;
                
                const fd = await fsPromises.open(filePath, 'r');
                const chunk = Buffer.alloc(readSize);
                await fd.read(chunk, 0, readSize, position);
                await fd.close();
                
                buffer = chunk.toString('utf8') + buffer;
                
                // Process complete lines
                const lines = buffer.split('\n');
                buffer = lines[0]; // Keep incomplete line in buffer
                
                // Process lines in reverse order (newest first)
                for (let i = lines.length - 2; i >= 1; i--) {
                    const line = lines[i].trim();
                    if (line && messages.length < limit) {
                        try {
                            const message = JSON.parse(line) as OrchestratorMessage;
                            messages.unshift(message); // Prepend to maintain order
                        } catch (parseError) {
                            this.loggingService.warn('Failed to parse message line', {
                                file: filePath,
                                lineNumber: i,
                                error: parseError instanceof Error ? parseError.message : String(parseError)
                            });
                        }
                    }
                }
            }

            // Apply offset
            const startIndex = Math.max(0, messages.length - offset - limit);
            const endIndex = Math.min(messages.length, startIndex + limit);
            
            return messages.slice(startIndex, endIndex);

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to read from single file', {
                file: filePath,
                error: err.message
            });
            return [];
        }
    }

    private async getRolledFiles(): Promise<string[]> {
        try {
            const files = await fsPromises.readdir(this.persistenceDir);
            const rolledFiles = files
                .filter(file => file.startsWith('messages-') && file.endsWith('.jsonl'))
                .map(file => path.join(this.persistenceDir, file))
                .map(filePath => ({
                    path: filePath,
                    stats: fs.statSync(filePath)
                }))
                .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime()) // Newest first
                .map(file => file.path);

            return rolledFiles;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get rolled files', {
                error: err.message
            });
            return [];
        }
    }

    private async checkAndRollFile(): Promise<void> {
        try {
            const stats = await fsPromises.stat(this.messagesFile);
            
            if (stats.size > this.maxFileSize) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rolledFile = path.join(this.persistenceDir, `messages-${timestamp}.jsonl`);
                
                // Move current file to rolled file
                await fsPromises.rename(this.messagesFile, rolledFile);
                
                // Create new empty file using write queue
                this.writeQueue = this.writeQueue.then(async () => {
                    await fsPromises.writeFile(this.messagesFile, '', 'utf8');
                });
                await this.writeQueue;

                this.loggingService.info('Message file rolled due to size limit', {
                    originalSize: stats.size,
                    maxSize: this.maxFileSize,
                    rolledFile
                });

                this.eventBus.publish(ORCH_EVENTS.MESSAGE_STORAGE_ROLLED, {
                    originalSize: stats.size,
                    maxSize: this.maxFileSize,
                    rolledFile
                });

                // Clean up old files if we have too many
                await this.cleanupOldFiles();
            }

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to check and roll file', {
                error: err.message
            });
        }
    }

    private async cleanupOldFiles(): Promise<void> {
        try {
            const files = await fsPromises.readdir(this.persistenceDir);
            const messageFiles = files
                .filter(file => file.startsWith('messages-') && file.endsWith('.jsonl'))
                .map(file => ({
                    name: file,
                    path: path.join(this.persistenceDir, file),
                    stats: fs.statSync(path.join(this.persistenceDir, file))
                }))
                .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

            // Keep only the most recent 5 files
            const filesToDelete = messageFiles.slice(5);
            
            for (const file of filesToDelete) {
                await fsPromises.unlink(file.path);
                this.loggingService.debug('Deleted old message file', { fileName: file.name });
            }

            if (filesToDelete.length > 0) {
                this.eventBus.publish(ORCH_EVENTS.MESSAGE_STORAGE_CLEANUP, {
                    filesDeleted: filesToDelete.length
                });
            }

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to cleanup old files', {
                error: err.message
            });
        }
    }
}
