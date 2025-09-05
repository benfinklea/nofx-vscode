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
    private lockFile: string;
    private maxFileSize: number;
    private historyLimit: number;
    private inMemoryCache: OrchestratorMessage[] = [];
    private cacheSize = 100;
    private isDisposed = false;
    private writeQueue: Promise<void> = Promise.resolve();
    private lockFd: fsPromises.FileHandle | null = null;

    constructor(
        private loggingService: ILoggingService,
        private configService: IConfigurationService,
        private eventBus: IEventBus,
        workspaceRoot: string
    ) {
        const configured = this.configService.getOrchestrationPersistencePath();
        this.persistenceDir = path.isAbsolute(configured)
            ? configured
            : path.join(workspaceRoot, configured);
        this.messagesFile = path.join(this.persistenceDir, 'messages.jsonl');
        this.lockFile = path.join(this.persistenceDir, 'messages.lock');
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
                await this.acquireLock();
                try {
                    await fsPromises.appendFile(this.messagesFile, messageLine, 'utf8');
                } finally {
                    await this.releaseLock();
                }
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

            // Determine pagination parameters
            const limit = filter.limit ?? this.historyLimit;
            const offset = filter.offset ?? 0;
            
            // Read a larger batch to account for filtering, with a reasonable max scan window
            const maxScanWindow = Math.max(limit * 10, 1000); // Scan up to 10x the limit or 1000 messages
            const allMessages = await this.readMessagesFromFile(0, maxScanWindow);
            
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

            // Apply pagination after filtering
            const paginatedMessages = filteredMessages.slice(offset, offset + limit);

            this.loggingService.debug('Message history retrieved with filter', {
                totalMessages: allMessages.length,
                filteredMessages: filteredMessages.length,
                paginatedMessages: paginatedMessages.length,
                filter,
                offset,
                limit
            });

            return paginatedMessages;

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
                ? new Date(Math.min(...messages.map(m => new Date(m.timestamp).getTime())))
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
        this.releaseLock();
        this.loggingService.debug('MessagePersistenceService disposed');
    }

    private async acquireLock(): Promise<void> {
        const maxRetries = 20;
        const retryDelay = 25; // 25ms
        const timeout = 5000; // 5 seconds

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Check for stale locks
                if (fs.existsSync(this.lockFile)) {
                    const stats = await fsPromises.stat(this.lockFile);
                    const age = Date.now() - stats.mtime.getTime();
                    if (age > timeout) {
                        this.loggingService.warn('Removing stale lock file', {
                            lockFile: this.lockFile,
                            age: age
                        });
                        await fsPromises.unlink(this.lockFile);
                    }
                }

                // Try to create lock file exclusively
                this.lockFd = await fsPromises.open(this.lockFile, 'wx');
                this.loggingService.debug('Acquired file lock', { lockFile: this.lockFile });
                return;
            } catch (error) {
                if (attempt === maxRetries - 1) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.loggingService.error('Failed to acquire file lock after maximum retries', {
                        lockFile: this.lockFile,
                        attempts: maxRetries,
                        error: err.message
                    });
                    throw err;
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    private async releaseLock(): Promise<void> {
        if (this.lockFd) {
            try {
                await this.lockFd.close();
                await fsPromises.unlink(this.lockFile);
                this.lockFd = null;
                this.loggingService.debug('Released file lock', { lockFile: this.lockFile });
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.loggingService.warn('Failed to release file lock', {
                    lockFile: this.lockFile,
                    error: err.message
                });
            }
        }
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
        let skipped = 0;
        let collected: OrchestratorMessage[] = [];

        try {
            // Build ordered list of files (newest first)
            const files = [this.messagesFile, ...(await this.getRolledFiles())];

            // Process each file in order (newest first)
            for (const filePath of files) {
                if (collected.length >= limit) break;

                await this.readFromSingleFile(filePath, (message) => {
                    if (skipped < offset) {
                        skipped++;
                        return;
                    }
                    
                    if (collected.length < limit) {
                        collected.push(message);
                    }
                });
            }

            return collected;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to read messages from files', {
                error: err.message
            });
            return [];
        }
    }

    private async readFromSingleFile(filePath: string, onLine: (message: OrchestratorMessage) => void): Promise<void> {
        if (!fs.existsSync(filePath)) {
            return;
        }

        let fd: fsPromises.FileHandle | null = null;

        try {
            // Use streaming approach with readline for forward reading
            const readline = require('readline');
            fd = await fsPromises.open(filePath, 'r');
            
            const rl = readline.createInterface({
                input: fd.createReadStream(),
                crlfDelay: Infinity
            });

            const messages: OrchestratorMessage[] = [];

            // Read all lines and collect messages
            for await (const line of rl) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    try {
                        const message = JSON.parse(trimmedLine) as OrchestratorMessage;
                        messages.push(message);
                    } catch (parseError) {
                        this.loggingService.warn('Failed to parse message line', {
                            file: filePath,
                            line: trimmedLine.substring(0, 100),
                            error: parseError instanceof Error ? parseError.message : String(parseError)
                        });
                    }
                }
            }

            // Process messages in reverse chronological order (newest first)
            for (let i = messages.length - 1; i >= 0; i--) {
                onLine(messages[i]);
            }

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to read from single file', {
                file: filePath,
                error: err.message
            });
        } finally {
            if (fd) {
                await fd.close();
            }
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
                    await this.acquireLock();
                    try {
                        await fsPromises.writeFile(this.messagesFile, '', 'utf8');
                    } finally {
                        await this.releaseLock();
                    }
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
