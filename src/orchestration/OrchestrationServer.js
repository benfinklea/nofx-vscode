"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrchestrationServer = void 0;
const ws_1 = require("ws");
const MessageProtocol_1 = require("./MessageProtocol");
const EventConstants_1 = require("../services/EventConstants");
class OrchestrationServer {
    constructor(port = 7777, loggingService, eventBus, errorHandler, connectionPool, messageRouter, messageValidator, messagePersistence, metricsService) {
        this.actualPort = 0;
        this.isRunning = false;
        this.concurrentConnectionsPeak = 0;
        this.msgTimestamps = [];
        this.maxTimestamps = 300;
        this.bytesInTotal = 0;
        this.bytesOutTotal = 0;
        this.prevBytesInTotal = 0;
        this.prevBytesOutTotal = 0;
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
    async start() {
        if (this.isRunning) {
            this.loggingService?.info('Server already running on port ' + this.actualPort);
            return;
        }
        await this.errorHandler?.handleAsync(async () => {
            await this.tryStartOnPort(this.port);
            this.isRunning = true;
            this.metricsService?.incrementCounter('server_started', {
                port: this.actualPort.toString()
            });
            this.loggingService?.info(`Orchestration server started on port ${this.actualPort}`);
            this.orchChannel?.appendLine(`[STARTED] port ${this.actualPort}`);
            this.eventBus?.publish(EventConstants_1.ORCH_EVENTS.SERVER_STARTED, { port: this.actualPort });
            this.startMetricsCollection();
        }, 'Failed to start orchestration server');
    }
    async stop() {
        if (!this.isRunning) {
            this.loggingService?.info('Server not running');
            return;
        }
        await this.errorHandler?.handleAsync(async () => {
            const stoppedPort = this.actualPort;
            this.connectionPool?.stopHeartbeat();
            this.connectionPool?.dispose();
            this.stopMetricsCollection();
            if (this.wss) {
                this.wss.close();
                this.wss = undefined;
            }
            this.isRunning = false;
            this.actualPort = 0;
            this.loggingService?.info('Orchestration server stopped');
            this.orchChannel?.appendLine('[STOPPED]');
            this.eventBus?.publish(EventConstants_1.ORCH_EVENTS.SERVER_STOPPED, {});
            this.metricsService?.incrementCounter('server_stopped', {
                port: stoppedPort.toString()
            });
        }, 'Failed to stop orchestration server');
    }
    async tryStartOnPort(port) {
        const maxAttempts = 10;
        let currentPort = port;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                await this.startOnPort(currentPort);
                this.actualPort = currentPort;
                return;
            }
            catch (error) {
                if (attempt === maxAttempts - 1) {
                    throw error;
                }
                currentPort++;
                this.loggingService?.warn(`Port ${currentPort - 1} unavailable, trying ${currentPort}`);
            }
        }
    }
    async startOnPort(port) {
        return new Promise((resolve, reject) => {
            this.wss = new ws_1.WebSocketServer({ port });
            this.wss.on('listening', () => {
                this.loggingService?.info(`WebSocket server listening on port ${port}`);
                this.orchChannel?.appendLine(`[LISTENING] port ${port}`);
                resolve();
            });
            this.wss.on('error', (error) => {
                reject(error);
            });
            this.wss.on('connection', (ws, req) => {
                this.handleConnection(ws, req);
            });
        });
    }
    handleConnection(ws, req) {
        const clientId = (0, MessageProtocol_1.generateMessageId)();
        const clientIp = req.socket.remoteAddress;
        this.loggingService?.info(`New connection from ${clientIp} (assigned ID: ${clientId})`);
        const userAgent = req.headers['user-agent'] || '';
        const isAgent = userAgent.includes('nofx-agent') || userAgent.includes('claude');
        this.orchChannel?.appendLine(`New connection ${clientId} (${isAgent ? 'agent' : 'client'})`);
        this.connectionPool?.addConnection(ws, clientId, {
            clientId,
            userAgent,
            connectedAt: new Date(),
            lastHeartbeat: new Date(),
            messageCount: 0,
            isAgent
        });
        this.metricsService?.incrementCounter('connections_established', {
            clientType: isAgent ? 'agent' : 'client',
            userAgent: userAgent.substring(0, 50)
        });
        ws.on('message', (data) => {
            this.handleMessage(clientId, data.toString());
        });
        ws.on('close', () => {
            this.metricsService?.incrementCounter('connections_closed', {
                clientType: isAgent ? 'agent' : 'client'
            });
        });
        ws.on('error', (error) => {
            this.metricsService?.incrementCounter('connection_errors', {
                clientType: isAgent ? 'agent' : 'client',
                errorType: error.name || 'unknown'
            });
        });
    }
    async handleMessage(clientId, rawMessage) {
        const startTime = Date.now();
        try {
            this.loggingService?.debug(`Received message from ${clientId}: ${rawMessage.substring(0, 100)}...`);
            const messagePreview = rawMessage.substring(0, 100);
            const messageType = this.extractMessageType(rawMessage);
            this.orchChannel?.appendLine(`Message from ${clientId}: ${messageType} - ${messagePreview}...`);
            this.msgTimestamps.push(Date.now());
            if (this.msgTimestamps.length > this.maxTimestamps) {
                this.msgTimestamps.shift();
            }
            const messageBytes = Buffer.byteLength(rawMessage, 'utf8');
            this.bytesInTotal += messageBytes;
            this.metricsService?.incrementCounter('messages_received', {
                clientId: clientId.substring(0, 8)
            });
            this.metricsService?.incrementCounter('bytes_in_total', {
                clientId: clientId.substring(0, 8),
                bytes: messageBytes.toString()
            });
            const validationResult = this.messageValidator?.validate(rawMessage);
            if (!validationResult?.isValid) {
                this.loggingService?.warn(`Invalid message from ${clientId}:`, validationResult?.errors);
                const errorResponse = this.messageValidator?.createErrorResponse(`Validation failed: ${validationResult?.errors.join(', ')}`, clientId);
                if (errorResponse) {
                    this.connectionPool?.sendToClient(clientId, errorResponse);
                }
                return;
            }
            const message = validationResult.result;
            this.eventBus?.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_RECEIVED, { message });
            if (message.from && message.from !== 'system') {
                const connection = this.connectionPool?.getConnection(clientId);
                if (connection) {
                    const existingClientId = this.connectionPool?.resolveLogicalId(message.from);
                    if (!existingClientId) {
                        this.connectionPool?.registerLogicalId(clientId, message.from);
                        await this.replayToClient(message.from);
                    }
                    else if (existingClientId !== clientId) {
                        this.loggingService?.warn(`Duplicate logical ID registration detected`, {
                            logicalId: message.from,
                            previousClientId: existingClientId,
                            newClientId: clientId
                        });
                        this.connectionPool?.unregisterLogicalId(message.from);
                        this.connectionPool?.registerLogicalId(clientId, message.from);
                        this.eventBus?.publish(EventConstants_1.ORCH_EVENTS.LOGICAL_ID_REASSIGNED, {
                            logicalId: message.from,
                            previousClientId: existingClientId,
                            newClientId: clientId,
                            timestamp: new Date().toISOString()
                        });
                        await this.replayToClient(message.from);
                    }
                }
            }
            try {
                await this.messageRouter?.route(message);
                this.metricsService?.incrementCounter('messages_sent', {
                    clientId: clientId.substring(0, 8),
                    messageType: message.type || 'unknown'
                });
            }
            catch (routingError) {
                this.metricsService?.incrementCounter('routing_failures', {
                    clientId: clientId.substring(0, 8),
                    messageType: message.type || 'unknown',
                    errorType: routingError instanceof Error ? routingError.name : 'unknown'
                });
                throw routingError;
            }
            const processingTime = Date.now() - startTime;
            this.metricsService?.recordDuration('message_processing_duration', processingTime, {
                clientId: clientId.substring(0, 8),
                messageType: message.type || 'unknown'
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, `Error handling message from ${clientId}`);
            const errorResponse = this.messageValidator?.createErrorResponse('Internal server error', clientId);
            if (errorResponse) {
                this.connectionPool?.sendToClient(clientId, errorResponse);
            }
        }
    }
    setDashboardCallback(callback) {
        this.messageRouter?.setDashboardCallback(callback);
    }
    clearDashboardCallback() {
        this.messageRouter?.setDashboardCallback(undefined);
    }
    getConnections() {
        const connections = new Map();
        const managedConnections = this.connectionPool?.getAllConnections();
        if (managedConnections) {
            managedConnections.forEach((connection, clientId) => {
                connections.set(clientId, connection.ws);
            });
        }
        return connections;
    }
    getConnectionSummaries() {
        return this.connectionPool?.getConnectionSummaries() || [];
    }
    async getMessageHistory() {
        return await this.messagePersistence?.load(0, 100) || [];
    }
    registerClient(clientId, type) {
        this.loggingService?.debug(`Client registered: ${clientId} (${type})`);
    }
    sendToClient(clientId, message) {
        const success = this.connectionPool?.sendToClient(clientId, message) || false;
        if (success) {
            this.trackOutboundBytes(message);
        }
        return success;
    }
    broadcast(message, excludeIds) {
        this.connectionPool?.broadcast(message, excludeIds);
        this.trackOutboundBytes(message);
    }
    trackOutboundBytes(message) {
        const messageBytes = Buffer.byteLength(JSON.stringify(message), 'utf8');
        this.bytesOutTotal += messageBytes;
        this.metricsService?.incrementCounter('bytes_out_total', {
            messageType: message.type || 'unknown',
            bytes: messageBytes.toString()
        });
    }
    async replayToClient(logicalId) {
        if (!this.messageRouter) {
            return;
        }
        try {
            const filter = {
                timeRange: {
                    from: new Date(Date.now() - 10 * 60 * 1000),
                    to: new Date()
                },
                limit: 100
            };
            await this.messageRouter.replayToClient(logicalId, filter);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, `Failed to replay messages to ${logicalId}`);
        }
    }
    getStatus() {
        const connectionCount = this.connectionPool?.getAllConnections().size || 0;
        return {
            isRunning: this.isRunning,
            port: this.actualPort,
            connectionCount
        };
    }
    startMetricsCollection() {
        this.metricsInterval = setInterval(() => {
            this.collectPeriodicMetrics();
        }, 30000);
    }
    stopMetricsCollection() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = undefined;
        }
    }
    collectPeriodicMetrics() {
        if (!this.metricsService)
            return;
        const connections = this.connectionPool?.getAllConnections();
        const currentConnections = connections?.size || 0;
        if (currentConnections > this.concurrentConnectionsPeak) {
            this.concurrentConnectionsPeak = currentConnections;
        }
        this.metricsService.setGauge('concurrent_connections', currentConnections);
        this.metricsService.setGauge('concurrent_connections_peak', this.concurrentConnectionsPeak);
        const now = Date.now();
        const thirtySecondsAgo = now - 30000;
        const recentMessages = this.msgTimestamps.filter(timestamp => timestamp > thirtySecondsAgo);
        const messagesPerSecond = recentMessages.length / 30;
        this.metricsService.setGauge('messages_per_second', messagesPerSecond);
        this.metricsService.setGauge('bytes_in_total', this.bytesInTotal);
        this.metricsService.setGauge('bytes_out_total', this.bytesOutTotal);
        const bytesInDelta = this.bytesInTotal - this.prevBytesInTotal;
        const bytesInRate = bytesInDelta / 30;
        this.metricsService.setGauge('bytes_in_rate', bytesInRate);
        const bytesOutDelta = this.bytesOutTotal - this.prevBytesOutTotal;
        const bytesOutRate = bytesOutDelta / 30;
        this.metricsService.setGauge('bytes_out_rate', bytesOutRate);
        this.prevBytesInTotal = this.bytesInTotal;
        this.prevBytesOutTotal = this.bytesOutTotal;
    }
    extractMessageType(rawMessage) {
        try {
            const parsed = JSON.parse(rawMessage);
            return parsed.type || 'unknown';
        }
        catch {
            return 'invalid-json';
        }
    }
    async dispose() {
        await this.stop();
        this.loggingService?.debug('OrchestrationServer disposed');
    }
}
exports.OrchestrationServer = OrchestrationServer;
//# sourceMappingURL=OrchestrationServer.js.map