/**
 * Enterprise-Grade Dead Letter Queue (DLQ)
 *
 * Production-ready failed message handling with retry logic,
 * persistence, and automated recovery mechanisms.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DLQMessage<T = any> {
    id: string;
    payload: T;
    error: string;
    errorStack?: string;
    attempts: number;
    firstFailureTime: number;
    lastFailureTime: number;
    source: string;
    metadata?: Record<string, any>;
    retryAfter?: number;
}

export interface DLQConfig {
    maxRetries?: number;
    retryDelayMs?: number;
    retryBackoffMultiplier?: number;
    maxQueueSize?: number;
    persistToDisk?: boolean;
    persistPath?: string;
    processInterval?: number;
    onMessageExpired?: (message: DLQMessage) => void;
    onMessageRecovered?: (message: DLQMessage) => void;
    onQueueFull?: () => void;
}

interface DLQMetrics {
    totalMessages: number;
    processedMessages: number;
    recoveredMessages: number;
    expiredMessages: number;
    currentQueueSize: number;
    averageRetries: number;
    oldestMessageAge: number;
}

type MessageProcessor<T> = (message: T) => Promise<void>;

/**
 * Dead Letter Queue for handling failed messages
 */
export class DeadLetterQueue<T = any> {
    private readonly queue: Map<string, DLQMessage<T>> = new Map();
    private readonly processors: Map<string, MessageProcessor<T>> = new Map();
    private readonly config: Required<DLQConfig>;
    private processIntervalId?: NodeJS.Timeout;
    private isProcessing = false;
    private metrics: DLQMetrics = {
        totalMessages: 0,
        processedMessages: 0,
        recoveredMessages: 0,
        expiredMessages: 0,
        currentQueueSize: 0,
        averageRetries: 0,
        oldestMessageAge: 0
    };

    constructor(
        private readonly name: string,
        config: DLQConfig = {}
    ) {
        this.config = {
            maxRetries: config.maxRetries ?? 5,
            retryDelayMs: config.retryDelayMs ?? 5000,
            retryBackoffMultiplier: config.retryBackoffMultiplier ?? 2,
            maxQueueSize: config.maxQueueSize ?? 1000,
            persistToDisk: config.persistToDisk ?? true,
            persistPath: config.persistPath ?? this.getWorkspacePath('.nofx/dlq'),
            processInterval: config.processInterval ?? 30000, // 30 seconds
            onMessageExpired: config.onMessageExpired ?? (() => {}),
            onMessageRecovered: config.onMessageRecovered ?? (() => {}),
            onQueueFull: config.onQueueFull ?? (() => {})
        };

        // Start processing interval
        this.startProcessing();

        // Load persisted messages
        if (this.config.persistToDisk) {
            this.loadPersistedMessages().catch(console.error);
        }
    }

    /**
     * Add a failed message to the DLQ
     */
    async addMessage(payload: T, error: Error | string, source: string, metadata?: Record<string, any>): Promise<void> {
        // Check queue size
        if (this.queue.size >= this.config.maxQueueSize) {
            console.error(`[DLQ:${this.name}] Queue full (${this.queue.size}/${this.config.maxQueueSize})`);
            this.config.onQueueFull();

            // Remove oldest message if queue is full
            const oldestId = this.findOldestMessage();
            if (oldestId) {
                this.removeMessage(oldestId);
            }
        }

        // Create DLQ message
        const message: DLQMessage<T> = {
            id: this.generateId(),
            payload,
            error: typeof error === 'string' ? error : error.message,
            errorStack: typeof error === 'object' ? error.stack : undefined,
            attempts: 0,
            firstFailureTime: Date.now(),
            lastFailureTime: Date.now(),
            source,
            metadata
        };

        // Add to queue
        this.queue.set(message.id, message);
        this.metrics.totalMessages++;
        this.metrics.currentQueueSize = this.queue.size;

        console.warn(`[DLQ:${this.name}] Added message ${message.id} from ${source}: ${message.error}`);

        // Persist if configured
        if (this.config.persistToDisk) {
            await this.persistMessage(message);
        }

        // Show VS Code notification for critical errors
        if (metadata?.critical) {
            vscode.window
                .showWarningMessage(`⚠️ Critical message failed: ${message.error}`, 'View DLQ')
                .then(selection => {
                    if (selection === 'View DLQ') {
                        this.showDLQView();
                    }
                });
        }
    }

    /**
     * Register a processor for recovering messages
     */
    registerProcessor(source: string, processor: MessageProcessor<T>): void {
        this.processors.set(source, processor);
        console.info(`[DLQ:${this.name}] Registered processor for source: ${source}`);
    }

    /**
     * Start processing messages
     */
    private startProcessing(): void {
        if (this.processIntervalId) {
            return;
        }

        this.processIntervalId = setInterval(() => {
            this.processMessages().catch(console.error);
        }, this.config.processInterval);

        console.info(`[DLQ:${this.name}] Started processing (interval: ${this.config.processInterval}ms)`);
    }

    /**
     * Stop processing messages
     */
    stopProcessing(): void {
        if (this.processIntervalId) {
            clearInterval(this.processIntervalId);
            this.processIntervalId = undefined;
            console.info(`[DLQ:${this.name}] Stopped processing`);
        }
    }

    /**
     * Process messages in the queue
     */
    private async processMessages(): Promise<void> {
        if (this.isProcessing || this.queue.size === 0) {
            return;
        }

        this.isProcessing = true;
        const startTime = Date.now();

        console.debug(`[DLQ:${this.name}] Processing ${this.queue.size} messages...`);

        const messagesToProcess: DLQMessage<T>[] = [];
        const now = Date.now();

        // Find messages ready for retry
        for (const message of this.queue.values()) {
            if (!message.retryAfter || now >= message.retryAfter) {
                messagesToProcess.push(message);
            }
        }

        // Process each message
        for (const message of messagesToProcess) {
            await this.processMessage(message);
        }

        // Update metrics
        this.updateMetrics();

        const duration = Date.now() - startTime;
        console.debug(`[DLQ:${this.name}] Processed ${messagesToProcess.length} messages in ${duration}ms`);

        this.isProcessing = false;
    }

    /**
     * Process individual message
     */
    private async processMessage(message: DLQMessage<T>): Promise<void> {
        const processor = this.processors.get(message.source);

        if (!processor) {
            console.debug(`[DLQ:${this.name}] No processor for source: ${message.source}`);
            return;
        }

        // Check if max retries exceeded
        if (message.attempts >= this.config.maxRetries) {
            console.error(
                `[DLQ:${this.name}] Message ${message.id} exceeded max retries (${message.attempts}/${this.config.maxRetries})`
            );

            // Call expiry handler
            this.config.onMessageExpired(message);

            // Remove from queue
            this.removeMessage(message.id);
            this.metrics.expiredMessages++;

            return;
        }

        try {
            // Attempt to process message
            console.debug(
                `[DLQ:${this.name}] Attempting to process message ${message.id} (attempt ${message.attempts + 1})`
            );

            await processor(message.payload);

            // Success! Remove from queue
            console.info(`[DLQ:${this.name}] Successfully recovered message ${message.id}`);

            this.config.onMessageRecovered(message);
            this.removeMessage(message.id);
            this.metrics.recoveredMessages++;
        } catch (error) {
            // Processing failed again
            message.attempts++;
            message.lastFailureTime = Date.now();
            message.error = error instanceof Error ? error.message : String(error);
            message.errorStack = error instanceof Error ? error.stack : undefined;

            // Calculate next retry time with exponential backoff
            const backoffDelay =
                this.config.retryDelayMs * Math.pow(this.config.retryBackoffMultiplier, message.attempts - 1);
            message.retryAfter = Date.now() + Math.min(backoffDelay, 300000); // Cap at 5 minutes

            console.warn(
                `[DLQ:${this.name}] Message ${message.id} failed again (attempt ${message.attempts}), ` +
                    `retrying after ${new Date(message.retryAfter).toISOString()}`
            );

            // Persist updated message
            if (this.config.persistToDisk) {
                await this.persistMessage(message);
            }
        }

        this.metrics.processedMessages++;
    }

    /**
     * Remove message from queue
     */
    private removeMessage(id: string): void {
        this.queue.delete(id);
        this.metrics.currentQueueSize = this.queue.size;

        // Remove from disk
        if (this.config.persistToDisk) {
            this.deletePersistedMessage(id).catch(console.error);
        }
    }

    /**
     * Find oldest message in queue
     */
    private findOldestMessage(): string | undefined {
        let oldestId: string | undefined;
        let oldestTime = Infinity;

        for (const [id, message] of this.queue.entries()) {
            if (message.firstFailureTime < oldestTime) {
                oldestTime = message.firstFailureTime;
                oldestId = id;
            }
        }

        return oldestId;
    }

    /**
     * Update metrics
     */
    private updateMetrics(): void {
        this.metrics.currentQueueSize = this.queue.size;

        if (this.queue.size > 0) {
            // Calculate average retries
            let totalRetries = 0;
            let oldestTime = Infinity;

            for (const message of this.queue.values()) {
                totalRetries += message.attempts;
                if (message.firstFailureTime < oldestTime) {
                    oldestTime = message.firstFailureTime;
                }
            }

            this.metrics.averageRetries = totalRetries / this.queue.size;
            this.metrics.oldestMessageAge = Date.now() - oldestTime;
        } else {
            this.metrics.averageRetries = 0;
            this.metrics.oldestMessageAge = 0;
        }
    }

    /**
     * Persist message to disk
     */
    private async persistMessage(message: DLQMessage<T>): Promise<void> {
        try {
            const filePath = path.join(this.config.persistPath, this.name, `${message.id}.json`);

            // Ensure directory exists
            await fs.mkdir(path.dirname(filePath), { recursive: true });

            // Write message
            await fs.writeFile(filePath, JSON.stringify(message, null, 2));
        } catch (error) {
            console.error(`[DLQ:${this.name}] Failed to persist message:`, error);
        }
    }

    /**
     * Delete persisted message
     */
    private async deletePersistedMessage(id: string): Promise<void> {
        try {
            const filePath = path.join(this.config.persistPath, this.name, `${id}.json`);
            await fs.unlink(filePath);
        } catch (error) {
            // Ignore if file doesn't exist
            if ((error as any).code !== 'ENOENT') {
                console.error(`[DLQ:${this.name}] Failed to delete persisted message:`, error);
            }
        }
    }

    /**
     * Load persisted messages
     */
    private async loadPersistedMessages(): Promise<void> {
        try {
            const dirPath = path.join(this.config.persistPath, this.name);

            // Check if directory exists
            try {
                await fs.access(dirPath);
            } catch {
                return; // Directory doesn't exist, nothing to load
            }

            // Read all message files
            const files = await fs.readdir(dirPath);

            for (const file of files) {
                if (!file.endsWith('.json')) continue;

                try {
                    const filePath = path.join(dirPath, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const message = JSON.parse(content) as DLQMessage<T>;

                    // Add to queue
                    this.queue.set(message.id, message);
                } catch (error) {
                    console.error(`[DLQ:${this.name}] Failed to load message ${file}:`, error);
                }
            }

            if (this.queue.size > 0) {
                console.info(`[DLQ:${this.name}] Loaded ${this.queue.size} persisted messages`);
                this.metrics.currentQueueSize = this.queue.size;
            }
        } catch (error) {
            console.error(`[DLQ:${this.name}] Failed to load persisted messages:`, error);
        }
    }

    /**
     * Show DLQ view in VS Code
     */
    private showDLQView(): void {
        const output = vscode.window.createOutputChannel(`DLQ: ${this.name}`);

        output.appendLine(`Dead Letter Queue: ${this.name}`);
        output.appendLine('='.repeat(50));
        output.appendLine(`Queue Size: ${this.queue.size}`);
        output.appendLine(`Total Messages: ${this.metrics.totalMessages}`);
        output.appendLine(`Recovered: ${this.metrics.recoveredMessages}`);
        output.appendLine(`Expired: ${this.metrics.expiredMessages}`);
        output.appendLine('');
        output.appendLine('Messages:');
        output.appendLine('-'.repeat(50));

        for (const message of this.queue.values()) {
            output.appendLine(`ID: ${message.id}`);
            output.appendLine(`Source: ${message.source}`);
            output.appendLine(`Error: ${message.error}`);
            output.appendLine(`Attempts: ${message.attempts}`);
            output.appendLine(`First Failure: ${new Date(message.firstFailureTime).toISOString()}`);
            output.appendLine(`Last Failure: ${new Date(message.lastFailureTime).toISOString()}`);
            if (message.retryAfter) {
                output.appendLine(`Retry After: ${new Date(message.retryAfter).toISOString()}`);
            }
            output.appendLine('-'.repeat(50));
        }

        output.show();
    }

    /**
     * Generate unique message ID
     */
    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get workspace-relative path
     */
    private getWorkspacePath(relativePath: string): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            return path.join(workspaceFolder.uri.fsPath, relativePath);
        }
        // Fallback to current working directory
        return path.resolve(relativePath);
    }

    /**
     * Get queue size
     */
    getQueueSize(): number {
        return this.queue.size;
    }

    /**
     * Get metrics
     */
    getMetrics(): Readonly<DLQMetrics> {
        return { ...this.metrics };
    }

    /**
     * Get all messages
     */
    getMessages(): DLQMessage<T>[] {
        return Array.from(this.queue.values());
    }

    /**
     * Clear all messages
     */
    async clear(): Promise<void> {
        this.queue.clear();
        this.metrics.currentQueueSize = 0;

        // Clear persisted messages
        if (this.config.persistToDisk) {
            try {
                const dirPath = path.join(this.config.persistPath, this.name);
                const files = await fs.readdir(dirPath);

                for (const file of files) {
                    if (file.endsWith('.json')) {
                        await fs.unlink(path.join(dirPath, file));
                    }
                }
            } catch (error) {
                console.error(`[DLQ:${this.name}] Failed to clear persisted messages:`, error);
            }
        }

        console.info(`[DLQ:${this.name}] Cleared all messages`);
    }

    /**
     * Manually retry a message
     */
    async retryMessage(id: string): Promise<void> {
        const message = this.queue.get(id);
        if (!message) {
            throw new Error(`Message ${id} not found`);
        }

        // Reset retry delay
        message.retryAfter = Date.now();

        // Process immediately
        await this.processMessage(message);
    }

    /**
     * Export queue state
     */
    exportState(): string {
        const state = {
            name: this.name,
            metrics: this.metrics,
            messages: Array.from(this.queue.values())
        };

        return JSON.stringify(state, null, 2);
    }
}
