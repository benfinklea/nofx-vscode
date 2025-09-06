"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionPoolService = void 0;
const ws_1 = require("ws");
const MessageProtocol_1 = require("../orchestration/MessageProtocol");
const EventConstants_1 = require("./EventConstants");
class ConnectionPoolService {
    constructor(loggingService, eventBus, errorHandler, configService, metricsService) {
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.configService = configService;
        this.metricsService = metricsService;
        this.connections = new Map();
        this.logicalAddressRegistry = new Map();
        this.isHeartbeatRunning = false;
        this.heartbeatIntervalMs = this.configService.getOrchestrationHeartbeatInterval();
        this.heartbeatTimeoutMs = this.configService.getOrchestrationHeartbeatTimeout();
    }
    addConnection(ws, clientId, metadata) {
        const now = new Date();
        const connectionMetadata = {
            clientId,
            userAgent: metadata.userAgent,
            connectedAt: metadata.connectedAt || now,
            lastHeartbeat: now,
            messageCount: 0,
            isAgent: metadata.isAgent || false,
            ...metadata
        };
        const managedConnection = {
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
        this.setupConnectionEventListeners(ws, clientId);
        this.sendWelcomeMessage(ws, clientId);
        this.eventBus.publish(EventConstants_1.ORCH_EVENTS.CLIENT_CONNECTED, {
            clientId,
            metadata: connectionMetadata
        });
        if (!this.isHeartbeatRunning) {
            this.startHeartbeat();
        }
    }
    registerLogicalId(clientId, logicalId) {
        this.logicalAddressRegistry.set(logicalId, clientId);
        this.loggingService.debug(`Registered logical ID: ${logicalId} -> ${clientId}`);
        this.eventBus.publish(EventConstants_1.ORCH_EVENTS.LOGICAL_ID_REGISTERED, {
            clientId,
            logicalId,
            timestamp: new Date().toISOString()
        });
    }
    resolveLogicalId(logicalId) {
        return this.logicalAddressRegistry.get(logicalId);
    }
    unregisterLogicalId(logicalId) {
        const clientId = this.logicalAddressRegistry.get(logicalId);
        if (clientId) {
            this.logicalAddressRegistry.delete(logicalId);
            this.loggingService.debug(`Unregistered logical ID: ${logicalId} -> ${clientId}`);
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.LOGICAL_ID_UNREGISTERED, {
                clientId,
                logicalId,
                timestamp: new Date().toISOString()
            });
        }
    }
    removeConnection(clientId) {
        const connection = this.connections.get(clientId);
        if (!connection) {
            this.loggingService.warn(`Attempted to remove non-existent connection: ${clientId}`);
            return;
        }
        if (connection.ws.readyState === ws_1.WebSocket.OPEN) {
            connection.ws.close();
        }
        this.connections.delete(clientId);
        const logicalIdsToUnregister = [];
        for (const [logicalId, registeredClientId] of this.logicalAddressRegistry.entries()) {
            if (registeredClientId === clientId) {
                logicalIdsToUnregister.push(logicalId);
            }
        }
        for (const logicalId of logicalIdsToUnregister) {
            this.logicalAddressRegistry.delete(logicalId);
            this.loggingService.debug(`Unregistered logical ID: ${logicalId} -> ${clientId}`);
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.LOGICAL_ID_UNREGISTERED, {
                clientId,
                logicalId,
                timestamp: new Date().toISOString()
            });
        }
        this.loggingService.info(`Connection removed: ${clientId}`, {
            messageCount: connection.messageCount,
            duration: Date.now() - connection.metadata.connectedAt.getTime(),
            unregisteredLogicalIds: logicalIdsToUnregister.length
        });
        this.eventBus.publish(EventConstants_1.ORCH_EVENTS.CLIENT_DISCONNECTED, {
            clientId,
            metadata: connection.metadata
        });
        if (this.connections.size === 0) {
            this.stopHeartbeat();
        }
    }
    getConnection(clientId) {
        return this.connections.get(clientId);
    }
    getAllConnections() {
        return new Map(this.connections);
    }
    broadcast(message, excludeIds) {
        const excludeSet = new Set(excludeIds || []);
        let sentCount = 0;
        let failedCount = 0;
        this.connections.forEach((connection, clientId) => {
            if (excludeSet.has(clientId)) {
                return;
            }
            if (this.sendToClient(clientId, message)) {
                sentCount++;
            }
            else {
                failedCount++;
            }
        });
        this.loggingService.debug(`Broadcast completed`, {
            totalConnections: this.connections.size,
            sent: sentCount,
            failed: failedCount,
            excluded: excludeSet.size
        });
        this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_BROADCASTED, {
            messageId: message.id,
            sender: message.from,
            sentCount,
            failedCount,
            excludedCount: excludeSet.size,
            timestamp: message.timestamp
        });
    }
    sendToClient(clientId, message) {
        const connection = this.connections.get(clientId);
        if (!connection) {
            this.loggingService.warn(`Attempted to send message to non-existent client: ${clientId}`);
            return false;
        }
        if (connection.ws.readyState !== ws_1.WebSocket.OPEN) {
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
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to send message to client ${clientId}`);
            return false;
        }
    }
    sendToLogical(logicalId, message) {
        const clientId = this.resolveLogicalId(logicalId);
        if (!clientId) {
            this.loggingService.warn(`Failed to resolve logical ID: ${logicalId}`, {
                messageId: message.id,
                messageType: message.type
            });
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_DELIVERY_FAILED, {
                messageId: message.id,
                from: message.from,
                to: logicalId,
                reason: 'Logical ID not found'
            });
            return false;
        }
        this.loggingService.debug(`Resolved logical ID ${logicalId} to client ID ${clientId}`, {
            messageId: message.id
        });
        return this.sendToClient(clientId, message);
    }
    startHeartbeat() {
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
    stopHeartbeat() {
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
    getConnectionSummaries() {
        const summaries = [];
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
    dispose() {
        this.stopHeartbeat();
        this.connections.forEach((connection, clientId) => {
            try {
                if (connection.ws.readyState === ws_1.WebSocket.OPEN) {
                    connection.ws.close();
                }
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.errorHandler.handleError(err, `Error closing connection ${clientId}`);
            }
        });
        this.connections.clear();
        this.loggingService.info('ConnectionPoolService disposed');
    }
    setupConnectionEventListeners(ws, clientId) {
        ws.on('pong', () => {
            const connection = this.connections.get(clientId);
            if (connection) {
                connection.lastHeartbeat = new Date();
                connection.metadata.lastHeartbeat = connection.lastHeartbeat;
                this.metricsService?.incrementCounter('heartbeat_received', {
                    clientId: clientId.substring(0, 8)
                });
                this.eventBus.publish(EventConstants_1.ORCH_EVENTS.HEARTBEAT_RECEIVED, {
                    clientId,
                    timestamp: connection.lastHeartbeat.toISOString()
                });
            }
        });
        ws.on('error', (error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `WebSocket error for client ${clientId}`);
        });
        ws.on('close', () => {
            this.loggingService.info(`WebSocket closed for client: ${clientId}`);
            this.removeConnection(clientId);
        });
    }
    sendWelcomeMessage(ws, clientId) {
        const welcomeMessage = (0, MessageProtocol_1.createMessage)('system', clientId, MessageProtocol_1.MessageType.CONNECTION_ESTABLISHED, {
            clientId,
            serverTime: new Date().toISOString(),
            message: 'Welcome to NofX Orchestration Server'
        });
        try {
            ws.send(JSON.stringify(welcomeMessage));
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.CONNECTION_WELCOME_SENT, { clientId });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to send welcome message to ${clientId}`);
        }
    }
    performHeartbeat() {
        const now = Date.now();
        const timeoutMs = this.heartbeatTimeoutMs;
        const connectionsToRemove = [];
        this.connections.forEach((connection, clientId) => {
            const lastHeartbeat = connection.lastHeartbeat.getTime();
            const timeSinceLastHeartbeat = now - lastHeartbeat;
            if (timeSinceLastHeartbeat > timeoutMs) {
                this.loggingService.warn(`Client ${clientId} timed out`, {
                    lastHeartbeat: connection.lastHeartbeat.toISOString(),
                    timeoutMs
                });
                this.metricsService?.incrementCounter('connection_timeouts', {
                    clientId: clientId.substring(0, 8),
                    timeoutMs: timeoutMs.toString()
                });
                connectionsToRemove.push(clientId);
                this.eventBus.publish(EventConstants_1.ORCH_EVENTS.CONNECTION_TIMEOUT, {
                    clientId,
                    lastHeartbeat: connection.lastHeartbeat.toISOString(),
                    timeoutMs
                });
            }
            else {
                try {
                    connection.ws.ping();
                    this.metricsService?.incrementCounter('heartbeat_sent', {
                        clientId: clientId.substring(0, 8)
                    });
                    this.eventBus.publish(EventConstants_1.ORCH_EVENTS.HEARTBEAT_SENT, {
                        clientId,
                        timestamp: new Date().toISOString()
                    });
                }
                catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.errorHandler.handleError(err, `Failed to ping client ${clientId}`);
                    this.metricsService?.incrementCounter('heartbeat_failures', {
                        clientId: clientId.substring(0, 8),
                        errorType: err.name || 'unknown'
                    });
                    connectionsToRemove.push(clientId);
                }
            }
        });
        connectionsToRemove.forEach(clientId => {
            this.removeConnection(clientId);
        });
    }
}
exports.ConnectionPoolService = ConnectionPoolService;
//# sourceMappingURL=ConnectionPoolService.js.map