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
exports.MessagePersistenceService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
const EventConstants_1 = require("./EventConstants");
class MessagePersistenceService {
    constructor(loggingService, configService, eventBus, workspaceRoot) {
        this.loggingService = loggingService;
        this.configService = configService;
        this.eventBus = eventBus;
        this.inMemoryCache = [];
        this.cacheSize = 100;
        this.isDisposed = false;
        this.writeQueue = Promise.resolve();
        this.lockFd = null;
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
    async save(message) {
        if (this.isDisposed) {
            this.loggingService.warn('Attempted to save message after disposal');
            return;
        }
        try {
            await this.ensurePaths();
            this.inMemoryCache.push(message);
            if (this.inMemoryCache.length > this.cacheSize) {
                this.inMemoryCache = this.inMemoryCache.slice(-this.cacheSize);
            }
            const messageLine = JSON.stringify(message) + '\n';
            this.writeQueue = this.writeQueue.then(async () => {
                await this.acquireLock();
                try {
                    await fs_1.promises.appendFile(this.messagesFile, messageLine, 'utf8');
                }
                finally {
                    await this.releaseLock();
                }
            });
            await this.writeQueue;
            await this.checkAndRollFile();
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_PERSISTED, {
                messageId: message.id,
                messageType: message.type,
                timestamp: message.timestamp
            });
            this.loggingService.debug('Message saved to persistence', {
                messageId: message.id,
                type: message.type,
                cacheSize: this.inMemoryCache.length
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to save message to persistence', {
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
            if (offset === 0 && limit <= this.cacheSize) {
                const fromCache = this.inMemoryCache.slice(-limit);
                if (fromCache.length >= limit) {
                    return fromCache;
                }
            }
            const messages = await this.readMessagesFromFile(offset, limit);
            return messages;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to load messages from persistence', {
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
            const limit = filter.limit ?? this.historyLimit;
            const offset = filter.offset ?? 0;
            const maxScanWindow = Math.max(limit * 10, 1000);
            const allMessages = await this.readMessagesFromFile(0, maxScanWindow);
            let filteredMessages = allMessages;
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
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get message history with filter', {
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
            this.inMemoryCache = [];
            const files = await fs_1.promises.readdir(this.persistenceDir);
            const messageFiles = files.filter(file => file.startsWith('messages'));
            for (const file of messageFiles) {
                const filePath = path.join(this.persistenceDir, file);
                await fs_1.promises.unlink(filePath);
            }
            this.loggingService.info('Message persistence cleared', {
                filesRemoved: messageFiles.length
            });
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_STORAGE_CLEANUP, {
                filesRemoved: messageFiles.length
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to clear message persistence', {
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
            const messages = await this.readMessagesFromFile(0, this.historyLimit);
            const totalMessages = messages.length;
            const oldestMessage = messages.length > 0
                ? new Date(Math.min(...messages.map(m => new Date(m.timestamp).getTime())))
                : new Date();
            return { totalMessages, oldestMessage };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get persistence stats', {
                error: err.message
            });
            return { totalMessages: 0, oldestMessage: new Date() };
        }
    }
    dispose() {
        this.isDisposed = true;
        this.inMemoryCache = [];
        this.releaseLock();
        this.loggingService.debug('MessagePersistenceService disposed');
    }
    async acquireLock() {
        const maxRetries = 20;
        const retryDelay = 25;
        const timeout = 5000;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (fs.existsSync(this.lockFile)) {
                    const stats = await fs_1.promises.stat(this.lockFile);
                    const age = Date.now() - stats.mtime.getTime();
                    if (age > timeout) {
                        this.loggingService.warn('Removing stale lock file', {
                            lockFile: this.lockFile,
                            age: age
                        });
                        await fs_1.promises.unlink(this.lockFile);
                    }
                }
                this.lockFd = await fs_1.promises.open(this.lockFile, 'wx');
                this.loggingService.debug('Acquired file lock', { lockFile: this.lockFile });
                return;
            }
            catch (error) {
                if (attempt === maxRetries - 1) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.loggingService.error('Failed to acquire file lock after maximum retries', {
                        lockFile: this.lockFile,
                        attempts: maxRetries,
                        error: err.message
                    });
                    throw err;
                }
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }
    async releaseLock() {
        if (this.lockFd) {
            try {
                await this.lockFd.close();
                await fs_1.promises.unlink(this.lockFile);
                this.lockFd = null;
                this.loggingService.debug('Released file lock', { lockFile: this.lockFile });
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.loggingService.warn('Failed to release file lock', {
                    lockFile: this.lockFile,
                    error: err.message
                });
            }
        }
    }
    ensureDirectories() {
        if (!fs.existsSync(this.persistenceDir)) {
            fs.mkdirSync(this.persistenceDir, { recursive: true });
            this.loggingService.info(`Created orchestration persistence directory: ${this.persistenceDir}`);
        }
    }
    async ensurePaths() {
        await fs_1.promises.mkdir(this.persistenceDir, { recursive: true });
        await fs_1.promises.access(this.messagesFile).catch(() => fs_1.promises.writeFile(this.messagesFile, '', 'utf8'));
    }
    async loadRecentMessages() {
        try {
            if (!fs.existsSync(this.messagesFile)) {
                return;
            }
            const messages = await this.readMessagesFromFile(0, this.cacheSize);
            this.inMemoryCache = messages.slice(-this.cacheSize);
            this.loggingService.debug('Loaded recent messages into cache', {
                count: this.inMemoryCache.length
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.warn('Failed to load recent messages into cache', {
                error: err.message
            });
        }
    }
    async readMessagesFromFile(offset, limit) {
        const messages = [];
        let skipped = 0;
        let collected = [];
        try {
            const files = [this.messagesFile, ...(await this.getRolledFiles())];
            for (const filePath of files) {
                if (collected.length >= limit)
                    break;
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
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to read messages from files', {
                error: err.message
            });
            return [];
        }
    }
    async readFromSingleFile(filePath, onLine) {
        if (!fs.existsSync(filePath)) {
            return;
        }
        let fd = null;
        try {
            const readline = require('readline');
            fd = await fs_1.promises.open(filePath, 'r');
            const rl = readline.createInterface({
                input: fd.createReadStream(),
                crlfDelay: Infinity
            });
            const messages = [];
            for await (const line of rl) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    try {
                        const message = JSON.parse(trimmedLine);
                        messages.push(message);
                    }
                    catch (parseError) {
                        this.loggingService.warn('Failed to parse message line', {
                            file: filePath,
                            line: trimmedLine.substring(0, 100),
                            error: parseError instanceof Error ? parseError.message : String(parseError)
                        });
                    }
                }
            }
            for (let i = messages.length - 1; i >= 0; i--) {
                onLine(messages[i]);
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to read from single file', {
                file: filePath,
                error: err.message
            });
        }
        finally {
            if (fd) {
                await fd.close();
            }
        }
    }
    async getRolledFiles() {
        try {
            const files = await fs_1.promises.readdir(this.persistenceDir);
            const rolledFiles = files
                .filter(file => file.startsWith('messages-') && file.endsWith('.jsonl'))
                .map(file => path.join(this.persistenceDir, file))
                .map(filePath => ({
                path: filePath,
                stats: fs.statSync(filePath)
            }))
                .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())
                .map(file => file.path);
            return rolledFiles;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to get rolled files', {
                error: err.message
            });
            return [];
        }
    }
    async checkAndRollFile() {
        try {
            const stats = await fs_1.promises.stat(this.messagesFile);
            if (stats.size > this.maxFileSize) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rolledFile = path.join(this.persistenceDir, `messages-${timestamp}.jsonl`);
                await fs_1.promises.rename(this.messagesFile, rolledFile);
                this.writeQueue = this.writeQueue.then(async () => {
                    await this.acquireLock();
                    try {
                        await fs_1.promises.writeFile(this.messagesFile, '', 'utf8');
                    }
                    finally {
                        await this.releaseLock();
                    }
                });
                await this.writeQueue;
                this.loggingService.info('Message file rolled due to size limit', {
                    originalSize: stats.size,
                    maxSize: this.maxFileSize,
                    rolledFile
                });
                this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_STORAGE_ROLLED, {
                    originalSize: stats.size,
                    maxSize: this.maxFileSize,
                    rolledFile
                });
                await this.cleanupOldFiles();
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to check and roll file', {
                error: err.message
            });
        }
    }
    async cleanupOldFiles() {
        try {
            const files = await fs_1.promises.readdir(this.persistenceDir);
            const messageFiles = files
                .filter(file => file.startsWith('messages-') && file.endsWith('.jsonl'))
                .map(file => ({
                name: file,
                path: path.join(this.persistenceDir, file),
                stats: fs.statSync(path.join(this.persistenceDir, file))
            }))
                .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
            const filesToDelete = messageFiles.slice(5);
            for (const file of filesToDelete) {
                await fs_1.promises.unlink(file.path);
                this.loggingService.debug('Deleted old message file', { fileName: file.name });
            }
            if (filesToDelete.length > 0) {
                this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_STORAGE_CLEANUP, {
                    filesDeleted: filesToDelete.length
                });
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to cleanup old files', {
                error: err.message
            });
        }
    }
}
exports.MessagePersistenceService = MessagePersistenceService;
//# sourceMappingURL=MessagePersistenceService.js.map