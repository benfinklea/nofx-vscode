import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';
import {
    OrchestratorMessage,
    MessageType,
    ClientConnection,
    createMessage,
    generateMessageId
} from './MessageProtocol';
import {
    ILoggingService,
    IEventBus,
    IErrorHandler,
    IConnectionPoolService,
    IMessageRouter,
    IMessageValidator,
    IMessagePersistenceService,
    IMetricsService
} from '../services/interfaces';
import { ORCH_EVENTS, MessageReceivedPayload, ServerStartedPayload, ServerStoppedPayload, LogicalIdReassignedPayload } from '../services/EventConstants';

export class OrchestrationServer {
    private wss: WebSocketServer | undefined;
    private port: number;
    private actualPort: number = 0;
    private orchChannel?: vscode.OutputChannel;
    private isRunning = false;
    private loggingService?: ILoggingService;
    private eventBus?: IEventBus;
    private errorHandler?: IErrorHandler;

    // New service dependencies
    private connectionPool?: IConnectionPoolService;
    private messageRouter?: IMessageRouter;
    private messageValidator?: IMessageValidator;
    private messagePersistence?: IMessagePersistenceService;
    private metricsService?: IMetricsService;

    // Metrics tracking
    private metricsInterval?: NodeJS.Timeout;
    private concurrentConnectionsPeak = 0;

    // Throughput metrics tracking
    private msgTimestamps: number[] = [];
    private readonly maxTimestamps = 300; // 5 minutes at 1-second intervals
    private bytesInTotal = 0;
    private bytesOutTotal = 0;
    private prevBytesInTotal = 0;
    private prevBytesOutTotal = 0;

    constructor(
        port: number = 7777,
        loggingService?: ILoggingService,
        eventBus?: IEventBus,
        errorHandler?: IErrorHandler,
        connectionPool?: IConnectionPoolService,
        messageRouter?: IMessageRouter,
        messageValidator?: IMessageValidator,
        messagePersistence?: IMessagePersistenceService,
        metricsService?: IMetricsService
    ) {
        this.port = port;
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.connectionPool = connectionPool;
        this.messageRouter = messageRouter;
        this.messageValidator = messageValidator;
        this.messagePersistence = messagePersistence;
        this.metricsService = metricsService;
        this.orchChannel = loggingService?.getChannel('Orchestration');
    }

    /**
     * Start the WebSocket server
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            this.loggingService?.info('Server already running on port ' + this.actualPort);
            return;
        }

        await this.errorHandler?.handleAsync(async () => {
            await this.tryStartOnPort(this.port);
            this.isRunning = true;

            // Record server start metrics
            this.metricsService?.incrementCounter('server_started', {
                port: this.actualPort.toString()
            });

            this.loggingService?.info(`Orchestration server started on port ${this.actualPort}`);
            this.orchChannel?.appendLine(`[STARTED] port ${this.actualPort}`);
            this.eventBus?.publish(ORCH_EVENTS.SERVER_STARTED, { port: this.actualPort } as ServerStartedPayload);

            // Start periodic metrics collection
            this.startMetricsCollection();
        }, 'Failed to start orchestration server');
    }

    /**
     * Stop the WebSocket server
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            this.loggingService?.info('Server not running');
            return;
        }

        await this.errorHandler?.handleAsync(async () => {
            // Store the actual port before resetting it
            const stoppedPort = this.actualPort;

            // Stop heartbeat monitoring
            this.connectionPool?.stopHeartbeat();

            // Close all connections
            this.connectionPool?.dispose();

            // Stop metrics collection
            this.stopMetricsCollection();

            // Close WebSocket server
            if (this.wss) {
                this.wss.close();
                this.wss = undefined;
            }

            this.isRunning = false;
            this.actualPort = 0;

            this.loggingService?.info('Orchestration server stopped');
            this.orchChannel?.appendLine('[STOPPED]');
            this.eventBus?.publish(ORCH_EVENTS.SERVER_STOPPED, {} as ServerStoppedPayload);

            // Record server stop metrics with the correct port
            this.metricsService?.incrementCounter('server_stopped', {
                port: stoppedPort.toString()
            });
        }, 'Failed to stop orchestration server');
    }

    /**
     * Try to start server on specified port, with fallback to other ports
     */
    private async tryStartOnPort(port: number): Promise<void> {
        const maxAttempts = 10;
        let currentPort = port;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                await this.startOnPort(currentPort);
                this.actualPort = currentPort;
                return;
            } catch (error) {
                if (attempt === maxAttempts - 1) {
                    throw error;
                }
                currentPort++;
                this.loggingService?.warn(`Port ${currentPort - 1} unavailable, trying ${currentPort}`);
            }
        }
    }

    /**
     * Start server on specific port
     */
    private async startOnPort(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.wss = new WebSocketServer({ port });

            this.wss.on('listening', () => {
                this.loggingService?.info(`WebSocket server listening on port ${port}`);
                this.orchChannel?.appendLine(`[LISTENING] port ${port}`);
                resolve();
            });

            this.wss.on('error', (error) => {
                reject(error);
            });

            this.wss.on('connection', (ws: WebSocket, req: any) => {
                this.handleConnection(ws, req);
            });
        });
    }

    /**
     * Handle new WebSocket connection
     */
    private handleConnection(ws: WebSocket, req: any): void {
        const clientId = generateMessageId();
        const clientIp = req.socket.remoteAddress;

        this.loggingService?.info(`New connection from ${clientIp} (assigned ID: ${clientId})`);

        // Determine if this is an agent connection based on user agent or other headers
        const userAgent = req.headers['user-agent'] || '';
        const isAgent = userAgent.includes('nofx-agent') || userAgent.includes('claude');

        // Log connection summary to orchestration channel
        this.orchChannel?.appendLine(`New connection ${clientId} (${isAgent ? 'agent' : 'client'})`);

        // Add connection to pool
        this.connectionPool?.addConnection(ws, clientId, {
            clientId,
            userAgent,
            connectedAt: new Date(),
            lastHeartbeat: new Date(),
            messageCount: 0,
            isAgent
        });

        // Record connection metrics
        this.metricsService?.incrementCounter('connections_established', {
            clientType: isAgent ? 'agent' : 'client',
            userAgent: userAgent.substring(0, 50) // Truncate for storage
        });

        // Set up message handling
        ws.on('message', (data: Buffer) => {
            this.handleMessage(clientId, data.toString());
        });

        // Set up connection close handling
        ws.on('close', () => {
            this.metricsService?.incrementCounter('connections_closed', {
                clientType: isAgent ? 'agent' : 'client'
            });
        });

        // Set up connection error handling
        ws.on('error', (error) => {
            this.metricsService?.incrementCounter('connection_errors', {
                clientType: isAgent ? 'agent' : 'client',
                errorType: error.name || 'unknown'
            });
        });
    }

    /**
     * Handle incoming message from a client
     */
    private async handleMessage(clientId: string, rawMessage: string): Promise<void> {
        const startTime = Date.now();

        try {
            this.loggingService?.debug(`Received message from ${clientId}: ${rawMessage.substring(0, 100)}...`);

            // Log message summary to orchestration channel (first 100 chars, message type)
            const messagePreview = rawMessage.substring(0, 100);
            const messageType = this.extractMessageType(rawMessage);
            this.orchChannel?.appendLine(`Message from ${clientId}: ${messageType} - ${messagePreview}...`);

            // Track message timestamp for throughput calculation
            this.msgTimestamps.push(Date.now());
            if (this.msgTimestamps.length > this.maxTimestamps) {
                this.msgTimestamps.shift(); // Remove oldest timestamp
            }

            // Track bytes transferred
            const messageBytes = Buffer.byteLength(rawMessage, 'utf8');
            this.bytesInTotal += messageBytes;

            // Record message received metrics
            this.metricsService?.incrementCounter('messages_received', {
                clientId: clientId.substring(0, 8) // Truncate for storage
            });

            // Record bytes in metrics
            this.metricsService?.incrementCounter('bytes_in_total', {
                clientId: clientId.substring(0, 8),
                bytes: messageBytes.toString()
            });

            // Validate message
            const validationResult = this.messageValidator?.validate(rawMessage);
            if (!validationResult?.isValid) {
                this.loggingService?.warn(`Invalid message from ${clientId}:`, validationResult?.errors);

                // Send error response
                const errorResponse = this.messageValidator?.createErrorResponse(
                    `Validation failed: ${validationResult?.errors.join(', ')}`,
                    clientId
                );

                if (errorResponse) {
                    this.connectionPool?.sendToClient(clientId, errorResponse);
                }
                return;
            }

            // Use parsed message from validation result
            const message: OrchestratorMessage = validationResult.result;

            // Publish MESSAGE_RECEIVED event
            this.eventBus?.publish(ORCH_EVENTS.MESSAGE_RECEIVED, { message } as MessageReceivedPayload);

            // Register logical ID if this is the first message from a client
            if (message.from && message.from !== 'system') {
                const connection = this.connectionPool?.getConnection(clientId);
                if (connection) {
                    const existingClientId = this.connectionPool?.resolveLogicalId(message.from);
                    if (!existingClientId) {
                        // No existing mapping, register normally
                        this.connectionPool?.registerLogicalId(clientId, message.from);

                        // Replay recent messages to newly registered client
                        await this.replayToClient(message.from);
                    } else if (existingClientId !== clientId) {
                        // Duplicate logical ID registration - warn and reassign
                        this.loggingService?.warn('Duplicate logical ID registration detected', {
                            logicalId: message.from,
                            previousClientId: existingClientId,
                            newClientId: clientId
                        });

                        // Unregister the previous mapping
                        this.connectionPool?.unregisterLogicalId(message.from);

                        // Register the new mapping
                        this.connectionPool?.registerLogicalId(clientId, message.from);

                        // Publish reassignment event
                        this.eventBus?.publish(ORCH_EVENTS.LOGICAL_ID_REASSIGNED, {
                            logicalId: message.from,
                            previousClientId: existingClientId,
                            newClientId: clientId,
                            timestamp: new Date().toISOString()
                        } as LogicalIdReassignedPayload);

                        // Replay recent messages to newly registered client
                        await this.replayToClient(message.from);
                    }
                    // If existingClientId === clientId, it's already correctly mapped, do nothing
                }
            }

            // Route message
            try {
                await this.messageRouter?.route(message);

                // Record successful message routing
                this.metricsService?.incrementCounter('messages_sent', {
                    clientId: clientId.substring(0, 8),
                    messageType: message.type || 'unknown'
                });
            } catch (routingError) {
                // Record routing failure
                this.metricsService?.incrementCounter('routing_failures', {
                    clientId: clientId.substring(0, 8),
                    messageType: message.type || 'unknown',
                    errorType: routingError instanceof Error ? routingError.name : 'unknown'
                });
                throw routingError; // Re-throw to be handled by outer catch
            }

            // Record message processing duration
            const processingTime = Date.now() - startTime;
            this.metricsService?.recordDuration('message_processing_duration', processingTime, {
                clientId: clientId.substring(0, 8),
                messageType: message.type || 'unknown'
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, `Error handling message from ${clientId}`);

            // Send error response
            const errorResponse = this.messageValidator?.createErrorResponse(
                'Internal server error',
                clientId
            );

            if (errorResponse) {
                this.connectionPool?.sendToClient(clientId, errorResponse);
            }
        }
    }

    /**
     * Set dashboard callback for receiving messages
     */
    setDashboardCallback(callback: (message: OrchestratorMessage) => void): void {
        // Delegate to message router
        this.messageRouter?.setDashboardCallback(callback);
    }

    /**
     * Clear dashboard callback
     */
    clearDashboardCallback(): void {
        // Delegate to message router
        this.messageRouter?.setDashboardCallback(undefined);
    }

    /**
     * Get current connections (for backward compatibility)
     */
    getConnections(): Map<string, WebSocket> {
        const connections = new Map<string, WebSocket>();
        const managedConnections = this.connectionPool?.getAllConnections();

        if (managedConnections) {
            managedConnections.forEach((connection, clientId) => {
                connections.set(clientId, connection.ws);
            });
        }

        return connections;
    }

    /**
     * Get connection summaries for JSON export
     */
    getConnectionSummaries(): Array<{
        clientId: string;
        isAgent: boolean;
        connectedAt: string;
        lastHeartbeat: string;
        messageCount: number;
        userAgent?: string;
    }> {
        return this.connectionPool?.getConnectionSummaries() || [];
    }

    /**
     * Get message history (for backward compatibility)
     */
    async getMessageHistory(): Promise<OrchestratorMessage[]> {
        return await this.messagePersistence?.load(0, 100) || [];
    }

    /**
     * Register client (for backward compatibility)
     */
    registerClient(clientId: string, type: 'agent' | 'conductor'): void {
        // This is now handled automatically by the connection pool
        this.loggingService?.debug(`Client registered: ${clientId} (${type})`);
    }

    /**
     * Send message to specific client (for backward compatibility)
     */
    sendToClient(clientId: string, message: OrchestratorMessage): boolean {
        const success = this.connectionPool?.sendToClient(clientId, message) || false;
        if (success) {
            this.trackOutboundBytes(message);
        }
        return success;
    }

    /**
     * Broadcast message to all clients (for backward compatibility)
     */
    broadcast(message: OrchestratorMessage, excludeIds?: string[]): void {
        this.connectionPool?.broadcast(message, excludeIds);
        this.trackOutboundBytes(message);
    }

    /**
     * Track outbound bytes for metrics
     */
    private trackOutboundBytes(message: OrchestratorMessage): void {
        const messageBytes = Buffer.byteLength(JSON.stringify(message), 'utf8');
        this.bytesOutTotal += messageBytes;

        this.metricsService?.incrementCounter('bytes_out_total', {
            messageType: message.type || 'unknown',
            bytes: messageBytes.toString()
        });
    }

    /**
     * Replay messages to a client
     */
    private async replayToClient(logicalId: string): Promise<void> {
        if (!this.messageRouter) {
            return;
        }

        try {
            // Replay last 10 minutes of messages by default
            const filter = {
                timeRange: {
                    from: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
                    to: new Date()
                },
                limit: 100
            };

            await this.messageRouter.replayToClient(logicalId, filter);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, `Failed to replay messages to ${logicalId}`);
        }
    }

    /**
     * Get server status
     */
    getStatus(): { isRunning: boolean; port: number; connectionCount: number } {
        const connectionCount = this.connectionPool?.getAllConnections().size || 0;
        return {
            isRunning: this.isRunning,
            port: this.actualPort,
            connectionCount
        };
    }

    /**
     * Start periodic metrics collection
     */
    private startMetricsCollection(): void {
        // Collect metrics every 30 seconds
        this.metricsInterval = setInterval(() => {
            this.collectPeriodicMetrics();
        }, 30000);
    }

    /**
     * Stop periodic metrics collection
     */
    private stopMetricsCollection(): void {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = undefined;
        }
    }

    /**
     * Collect periodic metrics
     */
    private collectPeriodicMetrics(): void {
        if (!this.metricsService) return;

        const connections = this.connectionPool?.getAllConnections();
        const currentConnections = connections?.size || 0;

        // Update peak concurrent connections
        if (currentConnections > this.concurrentConnectionsPeak) {
            this.concurrentConnectionsPeak = currentConnections;
        }

        // Record current concurrent connections
        this.metricsService.setGauge('concurrent_connections', currentConnections);
        this.metricsService.setGauge('concurrent_connections_peak', this.concurrentConnectionsPeak);

        // Calculate messages per second from ring buffer
        const now = Date.now();
        const thirtySecondsAgo = now - 30000; // 30 seconds ago

        // Count messages in the last 30 seconds
        const recentMessages = this.msgTimestamps.filter(timestamp => timestamp > thirtySecondsAgo);
        const messagesPerSecond = recentMessages.length / 30; // Messages per second over last 30 seconds

        this.metricsService.setGauge('messages_per_second', messagesPerSecond);

        // Record bytes transferred metrics
        this.metricsService.setGauge('bytes_in_total', this.bytesInTotal);
        this.metricsService.setGauge('bytes_out_total', this.bytesOutTotal);

        // Calculate bytes per second rates as deltas between intervals
        const bytesInDelta = this.bytesInTotal - this.prevBytesInTotal;
        const bytesInRate = bytesInDelta / 30; // Bytes per second over last 30 seconds
        this.metricsService.setGauge('bytes_in_rate', bytesInRate);

        const bytesOutDelta = this.bytesOutTotal - this.prevBytesOutTotal;
        const bytesOutRate = bytesOutDelta / 30; // Bytes per second over last 30 seconds
        this.metricsService.setGauge('bytes_out_rate', bytesOutRate);

        // Update previous totals for next calculation
        this.prevBytesInTotal = this.bytesInTotal;
        this.prevBytesOutTotal = this.bytesOutTotal;
    }

    /**
     * Extract message type from raw message for logging
     */
    private extractMessageType(rawMessage: string): string {
        try {
            const parsed = JSON.parse(rawMessage);
            return parsed.type || 'unknown';
        } catch {
            return 'invalid-json';
        }
    }

    /**
     * Dispose of resources
     */
    async dispose(): Promise<void> {
        await this.stop();
        // Note: orchChannel is managed by LoggingService, no need to dispose here
        this.loggingService?.debug('OrchestrationServer disposed');
    }
}
