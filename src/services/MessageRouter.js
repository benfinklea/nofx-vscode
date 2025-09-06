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
exports.MessageRouter = void 0;
const MessageProtocol_1 = require("../orchestration/MessageProtocol");
const Destinations_1 = require("../orchestration/Destinations");
const EventConstants_1 = require("./EventConstants");
class MessageRouter {
    constructor(connectionPool, messagePersistence, loggingService, eventBus, errorHandler, agentManager, taskQueue) {
        this.connectionPool = connectionPool;
        this.messagePersistence = messagePersistence;
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.deliveryStats = {
            totalRouted: 0,
            successfulDeliveries: 0,
            failedDeliveries: 0,
            acknowledgments: 0
        };
        this.fallbackBuffer = [];
        this.maxFallbackBufferSize = 100;
        this.persistenceStatus = {
            isHealthy: true,
            lastFailure: null,
            failureCount: 0
        };
        this.retryQueues = new Map();
        this.maxRetries = 3;
        this.baseDelay = 1000;
        this.fallbackFlushInterval = 30000;
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.startRetryProcessor();
        this.startFallbackFlushTimer();
    }
    async route(message) {
        try {
            this.deliveryStats.totalRouted++;
            if (this.messagePersistence) {
                try {
                    await this.messagePersistence.save(message);
                    if (!this.persistenceStatus.isHealthy && this.fallbackBuffer.length > 0) {
                        this.loggingService.info('Persistence recovered, flushing fallback buffer', {
                            bufferSize: this.fallbackBuffer.length
                        });
                        await this.flushFallbackBuffer();
                    }
                    this.persistenceStatus.isHealthy = true;
                    this.persistenceStatus.failureCount = 0;
                }
                catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.persistenceStatus.isHealthy = false;
                    this.persistenceStatus.lastFailure = new Date();
                    this.persistenceStatus.failureCount++;
                    this.loggingService.warn('Failed to persist message, using fallback buffer', {
                        messageId: message.id,
                        error: err.message,
                        failureCount: this.persistenceStatus.failureCount
                    });
                    this.addToFallbackBuffer(message);
                    this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_PERSISTENCE_FAILED, {
                        messageId: message.id,
                        error: err.message,
                        failureCount: this.persistenceStatus.failureCount,
                        lastFailure: this.persistenceStatus.lastFailure
                    });
                }
            }
            if (message.type === MessageProtocol_1.MessageType.SPAWN_AGENT || message.type === MessageProtocol_1.MessageType.ASSIGN_TASK || message.type === MessageProtocol_1.MessageType.QUERY_STATUS || message.type === MessageProtocol_1.MessageType.TERMINATE_AGENT) {
                const handled = await this.routeSystemCommand(message);
                if (handled) {
                    return;
                }
            }
            const { to } = message;
            let deliverySuccess = false;
            if (to === 'all-agents') {
                deliverySuccess = await this.routeToAllAgents(message);
            }
            else if (Destinations_1.DestinationUtil.isBroadcastDestination(to)) {
                deliverySuccess = await this.routeBroadcast(message);
            }
            else if (Destinations_1.DestinationUtil.isDashboardDestination(to)) {
                deliverySuccess = await this.routeToDashboard(message);
            }
            else if (Destinations_1.DestinationUtil.isAgentDestination(to) || Destinations_1.DestinationUtil.isConductorDestination(to)) {
                deliverySuccess = await this.routeDirect(message);
            }
            else {
                this.loggingService.warn(`Unknown destination: ${to}`, { messageId: message.id });
                this.deliveryStats.failedDeliveries++;
                return;
            }
            if (deliverySuccess) {
                this.deliveryStats.successfulDeliveries++;
            }
            else {
                this.deliveryStats.failedDeliveries++;
            }
            if (message.requiresAck && deliverySuccess) {
                await this.sendAcknowledgment(message);
            }
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_ROUTED, {
                messageId: message.id,
                destination: to,
                success: deliverySuccess,
                requiresAck: message.requiresAck
            });
            this.loggingService.debug('Message routed', {
                messageId: message.id,
                destination: to,
                success: deliverySuccess,
                totalRouted: this.deliveryStats.totalRouted
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to route message ${message.id}`);
            this.deliveryStats.failedDeliveries++;
        }
    }
    handleAcknowledgment(clientId, messageId) {
        this.deliveryStats.acknowledgments++;
        this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_ACKNOWLEDGED, {
            clientId,
            messageId,
            timestamp: new Date().toISOString()
        });
        this.loggingService.debug('Message acknowledged', {
            clientId,
            messageId,
            totalAcks: this.deliveryStats.acknowledgments
        });
    }
    setDashboardCallback(callback) {
        this.dashboardCallback = callback;
    }
    getDeliveryStats() {
        return { ...this.deliveryStats };
    }
    getPersistenceStatus() {
        return { ...this.persistenceStatus };
    }
    getFallbackBuffer() {
        return [...this.fallbackBuffer];
    }
    async flushFallbackBuffer() {
        if (!this.messagePersistence || this.fallbackBuffer.length === 0) {
            return;
        }
        const messagesToFlush = [...this.fallbackBuffer];
        this.fallbackBuffer = [];
        for (const message of messagesToFlush) {
            try {
                await this.messagePersistence.save(message);
                this.loggingService.debug('Flushed message from fallback buffer', {
                    messageId: message.id
                });
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.loggingService.error('Failed to flush message from fallback buffer', {
                    messageId: message.id,
                    error: err.message
                });
                this.fallbackBuffer.push(message);
            }
        }
    }
    validateDestination(to) {
        return Destinations_1.DestinationUtil.isValidDestination(to);
    }
    async replayToClient(target, filter, deferUntilRegistered = true) {
        if (!this.messagePersistence) {
            this.loggingService.warn('Message persistence not available for replay');
            return;
        }
        if (!this.connectionPool.resolveLogicalId(target)) {
            if (deferUntilRegistered) {
                this.loggingService.debug(`Logical ID ${target} not resolved, deferring replay until registered`);
                const subscription = this.eventBus.subscribe(EventConstants_1.ORCH_EVENTS.LOGICAL_ID_REGISTERED, (data) => {
                    if (data.logicalId === target) {
                        this.loggingService.debug(`Logical ID ${target} registered, triggering deferred replay`);
                        subscription.dispose();
                        this.replayToClient(target, filter, false);
                    }
                });
                setTimeout(() => {
                    subscription.dispose();
                    this.loggingService.warn(`Timeout waiting for logical ID ${target} to register`);
                }, 30000);
                return;
            }
            else {
                this.loggingService.warn(`Logical ID ${target} not resolved, skipping replay`);
                return;
            }
        }
        try {
            const messages = await this.messagePersistence.getHistory(filter);
            this.loggingService.debug(`Replaying ${messages.length} messages to ${target}`, {
                target,
                filter,
                messageCount: messages.length
            });
            for (const message of messages) {
                const success = this.connectionPool.sendToLogical(target, message);
                if (!success) {
                    this.loggingService.warn(`Failed to replay message ${message.id} to ${target}`);
                }
            }
            this.loggingService.info(`Replay completed for ${target}`, {
                target,
                messageCount: messages.length
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to replay messages to ${target}`);
        }
    }
    dispose() {
        this.dashboardCallback = undefined;
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = undefined;
        }
        if (this.fallbackFlushTimer) {
            clearInterval(this.fallbackFlushTimer);
            this.fallbackFlushTimer = undefined;
        }
        this.loggingService.debug('MessageRouter disposed', {
            finalStats: this.deliveryStats
        });
    }
    startRetryProcessor() {
        this.retryTimer = setInterval(() => {
            this.processRetries();
        }, 1000);
    }
    startFallbackFlushTimer() {
        this.fallbackFlushTimer = setInterval(async () => {
            if (this.persistenceStatus.isHealthy && this.fallbackBuffer.length > 0) {
                this.loggingService.debug('Periodic fallback buffer flush triggered', {
                    bufferSize: this.fallbackBuffer.length
                });
                await this.flushFallbackBuffer();
            }
        }, this.fallbackFlushInterval);
    }
    async processRetries() {
        const now = Date.now();
        for (const [destination, retryQueue] of this.retryQueues.entries()) {
            const readyMessages = retryQueue.filter(item => now >= item.next);
            for (const item of readyMessages) {
                const index = retryQueue.indexOf(item);
                retryQueue.splice(index, 1);
                const success = this.connectionPool.sendToLogical(destination, item.message);
                if (success) {
                    this.deliveryStats.successfulDeliveries++;
                    this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_DELIVERED, {
                        messageId: item.message.id,
                        from: item.message.from,
                        to: item.message.to,
                        resolvedTo: destination,
                        timestamp: item.message.timestamp
                    });
                    this.loggingService.debug('Retry delivery successful', {
                        messageId: item.message.id,
                        destination,
                        attempt: item.attempt
                    });
                }
                else {
                    item.attempt++;
                    if (item.attempt <= this.maxRetries) {
                        item.next = now + (this.baseDelay * Math.pow(2, item.attempt - 1));
                        retryQueue.push(item);
                        this.loggingService.debug('Retry delivery failed, rescheduling', {
                            messageId: item.message.id,
                            destination,
                            attempt: item.attempt,
                            nextRetry: new Date(item.next)
                        });
                    }
                    else {
                        this.deliveryStats.failedDeliveries++;
                        this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_DELIVERY_FAILED, {
                            messageId: item.message.id,
                            from: item.message.from,
                            to: item.message.to,
                            resolvedTo: destination,
                            reason: 'Max retries exceeded'
                        });
                        this.loggingService.warn('Message dropped after max retries', {
                            messageId: item.message.id,
                            destination,
                            maxRetries: this.maxRetries
                        });
                    }
                }
            }
            if (retryQueue.length === 0) {
                this.retryQueues.delete(destination);
            }
        }
    }
    enqueueRetry(destination, message) {
        if (!this.retryQueues.has(destination)) {
            this.retryQueues.set(destination, []);
        }
        const retryQueue = this.retryQueues.get(destination);
        retryQueue.push({
            message,
            attempt: 1,
            next: Date.now() + this.baseDelay
        });
        this.loggingService.debug('Message enqueued for retry', {
            messageId: message.id,
            destination,
            nextRetry: new Date(Date.now() + this.baseDelay)
        });
    }
    addToFallbackBuffer(message) {
        this.fallbackBuffer.push(message);
        if (this.fallbackBuffer.length > this.maxFallbackBufferSize) {
            this.fallbackBuffer = this.fallbackBuffer.slice(-this.maxFallbackBufferSize);
        }
        this.loggingService.debug('Message added to fallback buffer', {
            messageId: message.id,
            bufferSize: this.fallbackBuffer.length
        });
    }
    async routeSystemCommand(message) {
        try {
            this.loggingService.debug('Routing system command', { messageId: message.id, type: message.type });
            switch (message.type) {
                case MessageProtocol_1.MessageType.SPAWN_AGENT:
                    await this.handleSpawnAgent(message);
                    return true;
                case MessageProtocol_1.MessageType.ASSIGN_TASK:
                    await this.handleAssignTask(message);
                    return true;
                case MessageProtocol_1.MessageType.QUERY_STATUS:
                    await this.handleQueryStatus(message);
                    return true;
                case MessageProtocol_1.MessageType.TERMINATE_AGENT:
                    await this.handleTerminateAgent(message);
                    return true;
                default:
                    this.loggingService.warn('Unknown system command type', { messageId: message.id, type: message.type });
                    return false;
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to route system command ${message.id}`);
            return false;
        }
    }
    async handleSpawnAgent(message) {
        if (!this.agentManager) {
            this.loggingService.warn('AgentManager not available for spawn agent command');
            return;
        }
        const { role, name, template } = message.payload;
        try {
            const { AgentTemplateManager } = await Promise.resolve().then(() => __importStar(require('../agents/AgentTemplateManager')));
            const workspaceFolder = require('vscode').workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
                const templates = await templateManager.getTemplates();
                const selectedTemplate = templates.find(t => t.id === role || t.name.toLowerCase().includes(role));
                if (selectedTemplate) {
                    const agent = await this.agentManager.spawnAgent({
                        name: name || `${role}-agent`,
                        type: selectedTemplate.id,
                        template: selectedTemplate
                    });
                    const confirmMessage = {
                        id: Date.now().toString(),
                        timestamp: new Date().toISOString(),
                        from: 'system',
                        to: message.from,
                        type: MessageProtocol_1.MessageType.AGENT_READY,
                        payload: {
                            agentId: agent.id,
                            name: agent.name,
                            role: agent.type
                        }
                    };
                    this.connectionPool.sendToLogical(message.from, confirmMessage);
                }
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, 'Failed to spawn agent');
        }
    }
    async handleAssignTask(message) {
        if (!this.taskQueue) {
            this.loggingService.warn('TaskQueue not available for assign task command');
            return;
        }
        const { agentId, taskId, title, description, priority } = message.payload;
        try {
            const taskConfig = {
                title: title || description,
                description: description || title,
                priority: priority || 'medium',
                files: []
            };
            const task = this.taskQueue.addTask(taskConfig);
            if (agentId) {
                await this.taskQueue.assignTask(task.id, agentId);
            }
            const confirmMessage = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                from: 'system',
                to: message.from,
                type: MessageProtocol_1.MessageType.TASK_ACCEPTED,
                payload: { taskId: task.id, agentId }
            };
            this.connectionPool.sendToLogical(message.from, confirmMessage);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, 'Failed to assign task');
        }
    }
    async handleQueryStatus(message) {
        if (!this.agentManager || !this.taskQueue) {
            this.loggingService.warn('AgentManager or TaskQueue not available for status query');
            return;
        }
        try {
            const agents = this.agentManager.getActiveAgents();
            const statusMessage = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                from: 'system',
                to: message.from,
                type: MessageProtocol_1.MessageType.AGENT_STATUS,
                payload: {
                    agents: agents.map(a => ({
                        id: a.id,
                        name: a.name,
                        status: a.status,
                        role: a.type,
                        currentTask: a.currentTask
                    })),
                    tasks: this.taskQueue.getAllTasks()
                }
            };
            this.connectionPool.sendToLogical(message.from, statusMessage);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, 'Failed to query status');
        }
    }
    async handleTerminateAgent(message) {
        if (!this.agentManager) {
            this.loggingService.warn('AgentManager not available for terminate agent command');
            return;
        }
        const { agentId } = message.payload;
        try {
            if (agentId) {
                await this.agentManager.removeAgent(agentId);
                const confirmMessage = {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    from: 'system',
                    to: message.from,
                    type: MessageProtocol_1.MessageType.AGENT_READY,
                    payload: { agentId, status: 'terminated' }
                };
                this.connectionPool.sendToLogical(message.from, confirmMessage);
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, 'Failed to terminate agent');
        }
    }
    async routeBroadcast(message) {
        try {
            this.connectionPool.broadcast(message, [message.from]);
            return true;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to broadcast message ${message.id}`);
            return false;
        }
    }
    async routeToDashboard(message) {
        try {
            if (!this.dashboardCallback) {
                this.loggingService.warn('Dashboard callback not set, message dropped', {
                    messageId: message.id
                });
                return false;
            }
            this.dashboardCallback(message);
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_TO_DASHBOARD, {
                messageId: message.id,
                sender: message.from,
                timestamp: message.timestamp
            });
            return true;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to route message to dashboard ${message.id}`);
            return false;
        }
    }
    async routeDirect(message) {
        try {
            const { to } = message;
            let targetClientId = to;
            if (to === 'conductor' || to.startsWith('agent-')) {
                const resolvedClientId = this.connectionPool.resolveLogicalId(to);
                if (resolvedClientId) {
                    targetClientId = resolvedClientId;
                    this.loggingService.debug(`Resolved logical ID ${to} to client ID ${targetClientId}`);
                }
            }
            const success = this.connectionPool.sendToClient(targetClientId, message);
            if (success) {
                this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_DELIVERED, {
                    messageId: message.id,
                    from: message.from,
                    to: message.to,
                    resolvedTo: targetClientId,
                    timestamp: message.timestamp
                });
            }
            else {
                if (this.connectionPool.resolveLogicalId(to)) {
                    this.enqueueRetry(to, message);
                    this.loggingService.debug('Message enqueued for retry due to delivery failure', {
                        messageId: message.id,
                        destination: to
                    });
                }
                else {
                    this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_DELIVERY_FAILED, {
                        messageId: message.id,
                        from: message.from,
                        to: message.to,
                        resolvedTo: targetClientId,
                        reason: 'Client not connected'
                    });
                }
            }
            return success;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to route direct message ${message.id}`);
            return false;
        }
    }
    async routeToAllAgents(message) {
        try {
            const connections = this.connectionPool.getAllConnections();
            const agentConnections = [];
            let successCount = 0;
            connections.forEach((connection, clientId) => {
                if (connection.metadata.isAgent) {
                    agentConnections.push(clientId);
                }
            });
            for (const agentId of agentConnections) {
                if (this.connectionPool.sendToClient(agentId, message)) {
                    successCount++;
                }
            }
            const success = successCount > 0;
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_TO_AGENTS, {
                messageId: message.id,
                sender: message.from,
                agentCount: agentConnections.length,
                successCount,
                timestamp: message.timestamp
            });
            return success;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to route message to all agents ${message.id}`);
            return false;
        }
    }
    async sendAcknowledgment(message) {
        try {
            const ackMessage = {
                id: `ack-${message.id}`,
                timestamp: new Date().toISOString(),
                from: 'system',
                to: message.from,
                type: MessageProtocol_1.MessageType.SYSTEM_ACK,
                payload: {
                    type: 'acknowledgment',
                    originalMessageId: message.id,
                    status: 'received'
                },
                correlationId: message.id
            };
            const success = this.connectionPool.sendToLogical(message.from, ackMessage);
            if (success) {
                this.handleAcknowledgment(message.from, message.id);
            }
            else {
                this.loggingService.warn('Failed to send acknowledgment', {
                    originalMessageId: message.id,
                    recipient: message.from
                });
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to send acknowledgment for message ${message.id}`);
        }
    }
}
exports.MessageRouter = MessageRouter;
//# sourceMappingURL=MessageRouter.js.map