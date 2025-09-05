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
    IMessagePersistenceService
} from '../services/interfaces';
import { ORCH_EVENTS, MessageReceivedPayload, ServerStartedPayload, ServerStoppedPayload } from '../services/EventConstants';

export class OrchestrationServer {
    private wss: WebSocketServer | undefined;
    private port: number;
    private actualPort: number = 0;
    private outputChannel: vscode.OutputChannel;
    private isRunning = false;
    private loggingService?: ILoggingService;
    private eventBus?: IEventBus;
    private errorHandler?: IErrorHandler;
    
    // New service dependencies
    private connectionPool?: IConnectionPoolService;
    private messageRouter?: IMessageRouter;
    private messageValidator?: IMessageValidator;
    private messagePersistence?: IMessagePersistenceService;
    
    constructor(
        port: number = 7777,
        loggingService?: ILoggingService,
        eventBus?: IEventBus,
        errorHandler?: IErrorHandler,
        connectionPool?: IConnectionPoolService,
        messageRouter?: IMessageRouter,
        messageValidator?: IMessageValidator,
        messagePersistence?: IMessagePersistenceService
    ) {
        this.port = port;
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.connectionPool = connectionPool;
        this.messageRouter = messageRouter;
        this.messageValidator = messageValidator;
        this.messagePersistence = messagePersistence;
        this.outputChannel = vscode.window.createOutputChannel('NofX Orchestration');
    }
    
    /**
     * Start the WebSocket server
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            this.loggingService?.info('Server already running on port ' + this.actualPort);
            return;
        }

        try {
            await this.tryStartOnPort(this.port);
            this.isRunning = true;
            
            this.loggingService?.info(`Orchestration server started on port ${this.actualPort}`);
            this.eventBus?.publish(ORCH_EVENTS.SERVER_STARTED, { port: this.actualPort } as ServerStartedPayload);
            
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'Failed to start orchestration server');
            throw err;
        }
    }
    
    /**
     * Stop the WebSocket server
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            this.loggingService?.info('Server not running');
            return;
        }

        try {
            // Stop heartbeat monitoring
            this.connectionPool?.stopHeartbeat();
            
            // Close all connections
            this.connectionPool?.dispose();
            
            // Close WebSocket server
            if (this.wss) {
                this.wss.close();
                this.wss = undefined;
            }
            
            this.isRunning = false;
            this.actualPort = 0;
            
            this.loggingService?.info('Orchestration server stopped');
            this.eventBus?.publish(ORCH_EVENTS.SERVER_STOPPED, {} as ServerStoppedPayload);
            
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'Failed to stop orchestration server');
            throw err;
        }
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
        
        // Add connection to pool
        this.connectionPool?.addConnection(ws, clientId, {
            clientId,
            userAgent,
            connectedAt: new Date(),
            lastHeartbeat: new Date(),
            messageCount: 0,
            isAgent
        });
        
        // Set up message handling
        ws.on('message', (data: Buffer) => {
            this.handleMessage(clientId, data.toString());
        });
    }
    
    /**
     * Handle incoming message from a client
     */
    private async handleMessage(clientId: string, rawMessage: string): Promise<void> {
        try {
            this.loggingService?.debug(`Received message from ${clientId}: ${rawMessage.substring(0, 100)}...`);
            
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
                if (connection && !this.connectionPool?.resolveLogicalId(message.from)) {
                    this.connectionPool?.registerLogicalId(clientId, message.from);
                    
                    // Replay recent messages to newly registered client
                    await this.replayToClient(message.from);
                }
            }
            
            // Route message
            await this.messageRouter?.route(message);
            
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
        return this.connectionPool?.sendToClient(clientId, message) || false;
    }

    /**
     * Broadcast message to all clients (for backward compatibility)
     */
    broadcast(message: OrchestratorMessage, excludeIds?: string[]): void {
        this.connectionPool?.broadcast(message, excludeIds);
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
     * Dispose of resources
     */
    dispose(): void {
        this.stop();
        this.outputChannel.dispose();
        this.loggingService?.debug('OrchestrationServer disposed');
    }
}