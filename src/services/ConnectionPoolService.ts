import { WebSocket } from 'ws';
import { 
    IConnectionPoolService, 
    ILoggingService, 
    IEventBus, 
    IErrorHandler, 
    IConfigurationService,
    IMetricsService,
    ManagedConnection,
    ConnectionMetadata
} from './interfaces';
import { 
    OrchestratorMessage, 
    MessageType, 
    createMessage,
    generateMessageId
} from '../orchestration/MessageProtocol';
import { ORCH_EVENTS, ClientConnectedPayload, ClientDisconnectedPayload, LogicalIdRegisteredPayload, LogicalIdUnregisteredPayload, HeartbeatSentPayload, HeartbeatReceivedPayload, ConnectionTimeoutPayload, MessageBroadcastedPayload, ConnectionWelcomeSentPayload, MessageDeliveryFailedPayload } from './EventConstants';

export class ConnectionPoolService implements IConnectionPoolService {
    private connections: Map<string, ManagedConnection> = new Map();
    private logicalAddressRegistry: Map<string, string> = new Map(); // logicalId -> clientId mapping
    private heartbeatInterval: NodeJS.Timeout | undefined;
    private isHeartbeatRunning = false;
    private heartbeatIntervalMs: number;
    private heartbeatTimeoutMs: number;

    constructor(
        private loggingService: ILoggingService,
        private eventBus: IEventBus,
        private errorHandler: IErrorHandler,
        private configService: IConfigurationService,
        private metricsService?: IMetricsService
    ) {
        this.heartbeatIntervalMs = this.configService.getOrchestrationHeartbeatInterval();
        this.heartbeatTimeoutMs = this.configService.getOrchestrationHeartbeatTimeout();
    }

    addConnection(ws: WebSocket, clientId: string, metadata: Partial<ConnectionMetadata>): void {
        const now = new Date();
        const connectionMetadata: ConnectionMetadata = {
            clientId,
            userAgent: metadata.userAgent,
            connectedAt: metadata.connectedAt || now,
            lastHeartbeat: now,
            messageCount: 0,
            isAgent: metadata.isAgent || false,
            ...metadata
        };

        const managedConnection: ManagedConnection = {
            ws,
            metadata: connectionMetadata,
            lastHeartbeat: now,
            messageCount: 0
        };

        this.connections.set(clientId, managedConnection);

        this.loggingService.info(`Connection added: ${clientId}`, { 
            isAgent: connectionMetadata.isAgent,
            userAgent: connectionMetadata.userAgent 
        });

        // Set up event listeners
        this.setupConnectionEventListeners(ws, clientId);

        // Send welcome message
        this.sendWelcomeMessage(ws, clientId);

        // Publish event
        this.eventBus.publish(ORCH_EVENTS.CLIENT_CONNECTED, { 
            clientId, 
            metadata: connectionMetadata 
        } as ClientConnectedPayload);

        // Start heartbeat if not already running
        if (!this.isHeartbeatRunning) {
            this.startHeartbeat();
        }
    }

    registerLogicalId(clientId: string, logicalId: string): void {
        this.logicalAddressRegistry.set(logicalId, clientId);
        this.loggingService.debug(`Registered logical ID: ${logicalId} -> ${clientId}`);
        
        this.eventBus.publish(ORCH_EVENTS.LOGICAL_ID_REGISTERED, {
            clientId,
            logicalId,
            timestamp: new Date().toISOString()
        } as LogicalIdRegisteredPayload);
    }

    resolveLogicalId(logicalId: string): string | undefined {
        return this.logicalAddressRegistry.get(logicalId);
    }

    unregisterLogicalId(logicalId: string): void {
        const clientId = this.logicalAddressRegistry.get(logicalId);
        if (clientId) {
            this.logicalAddressRegistry.delete(logicalId);
            this.loggingService.debug(`Unregistered logical ID: ${logicalId} -> ${clientId}`);
            
            this.eventBus.publish(ORCH_EVENTS.LOGICAL_ID_UNREGISTERED, {
                clientId,
                logicalId,
                timestamp: new Date().toISOString()
            } as LogicalIdUnregisteredPayload);
        }
    }

    removeConnection(clientId: string): void {
        const connection = this.connections.get(clientId);
        if (!connection) {
            this.loggingService.warn(`Attempted to remove non-existent connection: ${clientId}`);
            return;
        }

        // Clean up WebSocket
        if (connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.close();
        }

        this.connections.delete(clientId);

        // Collect all logical IDs mapped to this client and unregister them
        const logicalIdsToUnregister: string[] = [];
        for (const [logicalId, registeredClientId] of this.logicalAddressRegistry.entries()) {
            if (registeredClientId === clientId) {
                logicalIdsToUnregister.push(logicalId);
            }
        }

        // Unregister each logical ID and publish events
        for (const logicalId of logicalIdsToUnregister) {
            this.logicalAddressRegistry.delete(logicalId);
            this.loggingService.debug(`Unregistered logical ID: ${logicalId} -> ${clientId}`);
            
            this.eventBus.publish(ORCH_EVENTS.LOGICAL_ID_UNREGISTERED, {
                clientId,
                logicalId,
                timestamp: new Date().toISOString()
            } as LogicalIdUnregisteredPayload);
        }

        this.loggingService.info(`Connection removed: ${clientId}`, {
            messageCount: connection.messageCount,
            duration: Date.now() - connection.metadata.connectedAt.getTime(),
            unregisteredLogicalIds: logicalIdsToUnregister.length
        });

        // Publish event
        this.eventBus.publish(ORCH_EVENTS.CLIENT_DISCONNECTED, { 
            clientId,
            metadata: connection.metadata
        } as ClientDisconnectedPayload);

        // Stop heartbeat if no connections left
        if (this.connections.size === 0) {
            this.stopHeartbeat();
        }
    }

    getConnection(clientId: string): ManagedConnection | undefined {
        return this.connections.get(clientId);
    }

    getAllConnections(): Map<string, ManagedConnection> {
        return new Map(this.connections);
    }

    broadcast(message: OrchestratorMessage, excludeIds?: string[]): void {
        const excludeSet = new Set(excludeIds || []);
        let sentCount = 0;
        let failedCount = 0;

        this.connections.forEach((connection, clientId) => {
            if (excludeSet.has(clientId)) {
                return;
            }

            if (this.sendToClient(clientId, message)) {
                sentCount++;
            } else {
                failedCount++;
            }
        });

        this.loggingService.debug(`Broadcast completed`, {
            totalConnections: this.connections.size,
            sent: sentCount,
            failed: failedCount,
            excluded: excludeSet.size
        });

        // Publish event
        this.eventBus.publish(ORCH_EVENTS.MESSAGE_BROADCASTED, {
            messageId: message.id,
            sender: message.from,
            sentCount,
            failedCount,
            excludedCount: excludeSet.size,
            timestamp: message.timestamp
        } as MessageBroadcastedPayload);
    }

    sendToClient(clientId: string, message: OrchestratorMessage): boolean {
        const connection = this.connections.get(clientId);
        if (!connection) {
            this.loggingService.warn(`Attempted to send message to non-existent client: ${clientId}`);
            return false;
        }

        if (connection.ws.readyState !== WebSocket.OPEN) {
            this.loggingService.warn(`Cannot send message to closed connection: ${clientId}`);
            return false;
        }

        try {
            connection.ws.send(JSON.stringify(message));
            connection.messageCount++;
            connection.metadata.messageCount = connection.messageCount;

            this.loggingService.debug(`Message sent to client: ${clientId}`, {
                messageId: message.id,
                type: message.type,
                messageCount: connection.messageCount
            });

            return true;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to send message to client ${clientId}`);
            return false;
        }
    }

    sendToLogical(logicalId: string, message: OrchestratorMessage): boolean {
        const clientId = this.resolveLogicalId(logicalId);
        if (!clientId) {
            this.loggingService.warn(`Failed to resolve logical ID: ${logicalId}`, {
                messageId: message.id,
                messageType: message.type
            });
            
            // Publish delivery failed event
            this.eventBus.publish(ORCH_EVENTS.MESSAGE_DELIVERY_FAILED, {
                messageId: message.id,
                from: message.from,
                to: logicalId,
                reason: 'Logical ID not found'
            } as MessageDeliveryFailedPayload);
            
            return false;
        }

        this.loggingService.debug(`Resolved logical ID ${logicalId} to client ID ${clientId}`, {
            messageId: message.id
        });

        return this.sendToClient(clientId, message);
    }

    startHeartbeat(): void {
        if (this.isHeartbeatRunning) {
            this.loggingService.debug('Heartbeat already running');
            return;
        }

        this.isHeartbeatRunning = true;
        this.heartbeatInterval = setInterval(() => {
            this.performHeartbeat();
        }, this.heartbeatIntervalMs);

        this.loggingService.info('Heartbeat monitoring started', {
            interval: this.heartbeatIntervalMs,
            timeout: this.heartbeatTimeoutMs
        });
    }

    stopHeartbeat(): void {
        if (!this.isHeartbeatRunning) {
            return;
        }

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }

        this.isHeartbeatRunning = false;
        this.loggingService.info('Heartbeat monitoring stopped');
    }

    getConnectionSummaries(): Array<{
        clientId: string;
        isAgent: boolean;
        connectedAt: string;
        lastHeartbeat: string;
        messageCount: number;
        userAgent?: string;
    }> {
        const summaries: Array<{
            clientId: string;
            isAgent: boolean;
            connectedAt: string;
            lastHeartbeat: string;
            messageCount: number;
            userAgent?: string;
        }> = [];

        this.connections.forEach((connection, clientId) => {
            summaries.push({
                clientId,
                isAgent: connection.metadata.isAgent,
                connectedAt: connection.metadata.connectedAt.toISOString(),
                lastHeartbeat: connection.metadata.lastHeartbeat.toISOString(),
                messageCount: connection.metadata.messageCount,
                userAgent: connection.metadata.userAgent
            });
        });

        return summaries;
    }

    dispose(): void {
        this.stopHeartbeat();

        // Close all connections
        this.connections.forEach((connection, clientId) => {
            try {
                if (connection.ws.readyState === WebSocket.OPEN) {
                    connection.ws.close();
                }
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.errorHandler.handleError(err, `Error closing connection ${clientId}`);
            }
        });

        this.connections.clear();
        this.loggingService.info('ConnectionPoolService disposed');
    }

    private setupConnectionEventListeners(ws: WebSocket, clientId: string): void {
        // Handle pong for heartbeat
        ws.on('pong', () => {
            const connection = this.connections.get(clientId);
            if (connection) {
                connection.lastHeartbeat = new Date();
                connection.metadata.lastHeartbeat = connection.lastHeartbeat;
                
                // Record heartbeat received metrics
                this.metricsService?.incrementCounter('heartbeat_received', { 
                    clientId: clientId.substring(0, 8)
                });
                
                this.eventBus.publish(ORCH_EVENTS.HEARTBEAT_RECEIVED, { 
                    clientId,
                    timestamp: connection.lastHeartbeat.toISOString()
                } as HeartbeatReceivedPayload);
            }
        });

        // Handle connection errors
        ws.on('error', (error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `WebSocket error for client ${clientId}`);
        });

        // Handle connection close
        ws.on('close', () => {
            this.loggingService.info(`WebSocket closed for client: ${clientId}`);
            this.removeConnection(clientId);
        });
    }

    private sendWelcomeMessage(ws: WebSocket, clientId: string): void {
        const welcomeMessage = createMessage(
            'system',
            clientId,
            MessageType.CONNECTION_ESTABLISHED,
            { 
                clientId,
                serverTime: new Date().toISOString(),
                message: 'Welcome to NofX Orchestration Server'
            }
        );

        try {
            ws.send(JSON.stringify(welcomeMessage));
            this.eventBus.publish(ORCH_EVENTS.CONNECTION_WELCOME_SENT, { clientId } as ConnectionWelcomeSentPayload);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to send welcome message to ${clientId}`);
        }
    }

    private performHeartbeat(): void {
        const now = Date.now();
        const timeoutMs = this.heartbeatTimeoutMs;
        const connectionsToRemove: string[] = [];

        this.connections.forEach((connection, clientId) => {
            const lastHeartbeat = connection.lastHeartbeat.getTime();
            const timeSinceLastHeartbeat = now - lastHeartbeat;

            if (timeSinceLastHeartbeat > timeoutMs) {
                this.loggingService.warn(`Client ${clientId} timed out`, {
                    lastHeartbeat: connection.lastHeartbeat.toISOString(),
                    timeoutMs
                });

                // Record connection timeout metrics
                this.metricsService?.incrementCounter('connection_timeouts', { 
                    clientId: clientId.substring(0, 8),
                    timeoutMs: timeoutMs.toString()
                });

                connectionsToRemove.push(clientId);
                this.eventBus.publish(ORCH_EVENTS.CONNECTION_TIMEOUT, { 
                    clientId,
                    lastHeartbeat: connection.lastHeartbeat.toISOString(),
                    timeoutMs
                } as ConnectionTimeoutPayload);
            } else {
                // Send ping
                try {
                    connection.ws.ping();
                    
                    // Record heartbeat sent metrics
                    this.metricsService?.incrementCounter('heartbeat_sent', { 
                        clientId: clientId.substring(0, 8)
                    });
                    
                    this.eventBus.publish(ORCH_EVENTS.HEARTBEAT_SENT, { 
                        clientId,
                        timestamp: new Date().toISOString()
                    } as HeartbeatSentPayload);
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.errorHandler.handleError(err, `Failed to ping client ${clientId}`);
                    
                    // Record heartbeat failure metrics
                    this.metricsService?.incrementCounter('heartbeat_failures', { 
                        clientId: clientId.substring(0, 8),
                        errorType: err.name || 'unknown'
                    });
                    
                    connectionsToRemove.push(clientId);
                }
            }
        });

        // Remove timed out connections
        connectionsToRemove.forEach(clientId => {
            this.removeConnection(clientId);
        });
    }
}
