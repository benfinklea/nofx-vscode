import {
    IMessageRouter,
    IConnectionPoolService,
    IMessagePersistenceService,
    ILoggingService,
    IEventBus,
    IErrorHandler,
    MessageFilter
} from './interfaces';
import { OrchestratorMessage, MessageType } from '../orchestration/MessageProtocol';
import { DestinationUtil } from '../orchestration/Destinations';
import { ORCH_EVENTS, MessagePersistenceFailedPayload, MessageBroadcastedPayload, MessageToDashboardPayload, MessageDeliveredPayload, MessageDeliveryFailedPayload, MessageToAgentsPayload, MessageAcknowledgedPayload, MessageRoutedPayload } from './EventConstants';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';

export class MessageRouter implements IMessageRouter {
    private dashboardCallback?: (message: OrchestratorMessage) => void;
    private deliveryStats = {
        totalRouted: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        acknowledgments: 0
    };
    private agentManager?: AgentManager;
    private taskQueue?: TaskQueue;
    private fallbackBuffer: OrchestratorMessage[] = [];
    private maxFallbackBufferSize = 100;
    private persistenceStatus = {
        isHealthy: true,
        lastFailure: null as Date | null,
        failureCount: 0
    };
    private retryQueues: Map<string, Array<{message: OrchestratorMessage, attempt: number, next: number}>> = new Map();
    private retryTimer?: NodeJS.Timeout;
    private fallbackFlushTimer?: NodeJS.Timeout;
    private maxRetries = 3;
    private baseDelay = 1000; // 1 second
    private fallbackFlushInterval = 30000; // 30 seconds

    constructor(
        private connectionPool: IConnectionPoolService,
        private messagePersistence: IMessagePersistenceService | undefined,
        private loggingService: ILoggingService,
        private eventBus: IEventBus,
        private errorHandler: IErrorHandler,
        agentManager?: AgentManager,
        taskQueue?: TaskQueue
    ) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.startRetryProcessor();
        this.startFallbackFlushTimer();
    }

    async route(message: OrchestratorMessage): Promise<void> {
        try {
            this.deliveryStats.totalRouted++;

            // Persist message before routing (if persistence is available)
            if (this.messagePersistence) {
                try {
                    await this.messagePersistence.save(message);

                    // Check if persistence recovered and flush fallback buffer
                    if (!this.persistenceStatus.isHealthy && this.fallbackBuffer.length > 0) {
                        this.loggingService.info('Persistence recovered, flushing fallback buffer', {
                            bufferSize: this.fallbackBuffer.length
                        });
                        await this.flushFallbackBuffer();
                    }

                    this.persistenceStatus.isHealthy = true;
                    this.persistenceStatus.failureCount = 0;
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.persistenceStatus.isHealthy = false;
                    this.persistenceStatus.lastFailure = new Date();
                    this.persistenceStatus.failureCount++;

                    this.loggingService.warn('Failed to persist message, using fallback buffer', {
                        messageId: message.id,
                        error: err.message,
                        failureCount: this.persistenceStatus.failureCount
                    });

                    // Add to fallback buffer
                    this.addToFallbackBuffer(message);

                    // Publish persistence status event
                    this.eventBus.publish(ORCH_EVENTS.MESSAGE_PERSISTENCE_FAILED, {
                        messageId: message.id,
                        error: err.message,
                        failureCount: this.persistenceStatus.failureCount,
                        lastFailure: this.persistenceStatus.lastFailure
                    } as MessagePersistenceFailedPayload);
                }
            }

            // Check if this is a system command first
            if (message.type === MessageType.SPAWN_AGENT || message.type === MessageType.ASSIGN_TASK || message.type === MessageType.QUERY_STATUS || message.type === MessageType.TERMINATE_AGENT) {
                const handled = await this.routeSystemCommand(message);
                if (handled) {
                    return;
                }
                // If not handled by system command, fall through to normal routing
            }

            // Route based on destination
            const { to } = message;
            let deliverySuccess = false;

            if (to === 'all-agents') {
                deliverySuccess = await this.routeToAllAgents(message);
            } else if (DestinationUtil.isBroadcastDestination(to)) {
                deliverySuccess = await this.routeBroadcast(message);
            } else if (DestinationUtil.isDashboardDestination(to)) {
                deliverySuccess = await this.routeToDashboard(message);
            } else if (DestinationUtil.isAgentDestination(to) || DestinationUtil.isConductorDestination(to)) {
                deliverySuccess = await this.routeDirect(message);
            } else {
                this.loggingService.warn(`Unknown destination: ${to}`, { messageId: message.id });
                this.deliveryStats.failedDeliveries++;
                return;
            }

            // Update delivery stats
            if (deliverySuccess) {
                this.deliveryStats.successfulDeliveries++;
            } else {
                this.deliveryStats.failedDeliveries++;
            }

            // Handle acknowledgment if required
            if (message.requiresAck && deliverySuccess) {
                await this.sendAcknowledgment(message);
            }

            // Publish routing event
            this.eventBus.publish(ORCH_EVENTS.MESSAGE_ROUTED, {
                messageId: message.id,
                destination: to,
                success: deliverySuccess,
                requiresAck: message.requiresAck
            } as MessageRoutedPayload);

            this.loggingService.debug('Message routed', {
                messageId: message.id,
                destination: to,
                success: deliverySuccess,
                totalRouted: this.deliveryStats.totalRouted
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to route message ${message.id}`);
            this.deliveryStats.failedDeliveries++;
        }
    }


    handleAcknowledgment(clientId: string, messageId: string): void {
        this.deliveryStats.acknowledgments++;

        this.eventBus.publish(ORCH_EVENTS.MESSAGE_ACKNOWLEDGED, {
            clientId,
            messageId,
            timestamp: new Date().toISOString()
        } as MessageAcknowledgedPayload);

        this.loggingService.debug('Message acknowledged', {
            clientId,
            messageId,
            totalAcks: this.deliveryStats.acknowledgments
        });
    }

    setDashboardCallback(callback: (message: OrchestratorMessage) => void): void {
        this.dashboardCallback = callback;
    }

    getDeliveryStats() {
        return { ...this.deliveryStats };
    }

    getPersistenceStatus() {
        return { ...this.persistenceStatus };
    }

    getFallbackBuffer(): OrchestratorMessage[] {
        return [...this.fallbackBuffer];
    }

    async flushFallbackBuffer(): Promise<void> {
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
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.loggingService.error('Failed to flush message from fallback buffer', {
                    messageId: message.id,
                    error: err.message
                });
                // Re-add to buffer if flush fails
                this.fallbackBuffer.push(message);
            }
        }
    }

    validateDestination(to: string): boolean {
        return DestinationUtil.isValidDestination(to);
    }

    async replayToClient(target: string, filter?: MessageFilter, deferUntilRegistered: boolean = true): Promise<void> {
        if (!this.messagePersistence) {
            this.loggingService.warn('Message persistence not available for replay');
            return;
        }

        // Check if logical ID is resolved
        if (!this.connectionPool.resolveLogicalId(target)) {
            if (deferUntilRegistered) {
                this.loggingService.debug(`Logical ID ${target} not resolved, deferring replay until registered`);

                // Subscribe to logical ID registration event
                const subscription = this.eventBus.subscribe(ORCH_EVENTS.LOGICAL_ID_REGISTERED, (data) => {
                    if (data.logicalId === target) {
                        this.loggingService.debug(`Logical ID ${target} registered, triggering deferred replay`);
                        subscription.dispose();
                        this.replayToClient(target, filter, false); // Don't defer again
                    }
                });

                // Set a timeout to avoid indefinite waiting
                setTimeout(() => {
                    subscription.dispose();
                    this.loggingService.warn(`Timeout waiting for logical ID ${target} to register`);
                }, 30000); // 30 second timeout

                return;
            } else {
                this.loggingService.warn(`Logical ID ${target} not resolved, skipping replay`);
                return;
            }
        }

        try {
            // Get message history with filter
            const messages = await this.messagePersistence.getHistory(filter);

            this.loggingService.debug(`Replaying ${messages.length} messages to ${target}`, {
                target,
                filter,
                messageCount: messages.length
            });

            // Send each message to the target
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

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to replay messages to ${target}`);
        }
    }

    dispose(): void {
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

    private startRetryProcessor(): void {
        this.retryTimer = setInterval(() => {
            this.processRetries();
        }, 1000); // Process retries every second
    }

    private startFallbackFlushTimer(): void {
        this.fallbackFlushTimer = setInterval(async () => {
            if (this.persistenceStatus.isHealthy && this.fallbackBuffer.length > 0) {
                this.loggingService.debug('Periodic fallback buffer flush triggered', {
                    bufferSize: this.fallbackBuffer.length
                });
                await this.flushFallbackBuffer();
            }
        }, this.fallbackFlushInterval);
    }

    private async processRetries(): Promise<void> {
        const now = Date.now();

        for (const [destination, retryQueue] of this.retryQueues.entries()) {
            const readyMessages = retryQueue.filter(item => now >= item.next);

            for (const item of readyMessages) {
                // Remove from queue
                const index = retryQueue.indexOf(item);
                retryQueue.splice(index, 1);

                // Try to deliver
                const success = this.connectionPool.sendToLogical(destination, item.message);

                if (success) {
                    this.deliveryStats.successfulDeliveries++;
                    this.eventBus.publish(ORCH_EVENTS.MESSAGE_DELIVERED, {
                        messageId: item.message.id,
                        from: item.message.from,
                        to: item.message.to,
                        resolvedTo: destination,
                        timestamp: item.message.timestamp
                    } as MessageDeliveredPayload);

                    this.loggingService.debug('Retry delivery successful', {
                        messageId: item.message.id,
                        destination,
                        attempt: item.attempt
                    });
                } else {
                    // Increment attempt and reschedule
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
                    } else {
                        // Max retries exceeded, drop message
                        this.deliveryStats.failedDeliveries++;
                        this.eventBus.publish(ORCH_EVENTS.MESSAGE_DELIVERY_FAILED, {
                            messageId: item.message.id,
                            from: item.message.from,
                            to: item.message.to,
                            resolvedTo: destination,
                            reason: 'Max retries exceeded'
                        } as MessageDeliveryFailedPayload);

                        this.loggingService.warn('Message dropped after max retries', {
                            messageId: item.message.id,
                            destination,
                            maxRetries: this.maxRetries
                        });
                    }
                }
            }

            // Clean up empty queues
            if (retryQueue.length === 0) {
                this.retryQueues.delete(destination);
            }
        }
    }

    private enqueueRetry(destination: string, message: OrchestratorMessage): void {
        if (!this.retryQueues.has(destination)) {
            this.retryQueues.set(destination, []);
        }

        const retryQueue = this.retryQueues.get(destination)!;
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

    private addToFallbackBuffer(message: OrchestratorMessage): void {
        this.fallbackBuffer.push(message);

        // Maintain buffer size limit
        if (this.fallbackBuffer.length > this.maxFallbackBufferSize) {
            this.fallbackBuffer = this.fallbackBuffer.slice(-this.maxFallbackBufferSize);
        }

        this.loggingService.debug('Message added to fallback buffer', {
            messageId: message.id,
            bufferSize: this.fallbackBuffer.length
        });
    }

    private async routeSystemCommand(message: OrchestratorMessage): Promise<boolean> {
        try {
            this.loggingService.debug('Routing system command', { messageId: message.id, type: message.type });

            switch (message.type) {
                case MessageType.SPAWN_AGENT:
                    await this.handleSpawnAgent(message);
                    return true;
                case MessageType.ASSIGN_TASK:
                    await this.handleAssignTask(message);
                    return true;
                case MessageType.QUERY_STATUS:
                    await this.handleQueryStatus(message);
                    return true;
                case MessageType.TERMINATE_AGENT:
                    await this.handleTerminateAgent(message);
                    return true;
                default:
                    this.loggingService.warn('Unknown system command type', { messageId: message.id, type: message.type });
                    return false;
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to route system command ${message.id}`);
            return false;
        }
    }

    private async handleSpawnAgent(message: OrchestratorMessage): Promise<void> {
        if (!this.agentManager) {
            this.loggingService.warn('AgentManager not available for spawn agent command');
            return;
        }

        const { role, name, template } = message.payload;

        try {
            // Find the template
            const { AgentTemplateManager } = await import('../agents/AgentTemplateManager');
            const workspaceFolder = require('vscode').workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
                const templates = await templateManager.getTemplates();
                const selectedTemplate = templates.find(t => t.id === role || t.name.toLowerCase().includes(role));

                if (selectedTemplate) {
                    // Create the agent
                    const agent = await this.agentManager.spawnAgent({
                        name: name || `${role}-agent`,
                        type: selectedTemplate.id,
                        template: selectedTemplate
                    });

                    // Send confirmation back
                    const confirmMessage: OrchestratorMessage = {
                        id: Date.now().toString(),
                        timestamp: new Date().toISOString(),
                        from: 'system',
                        to: message.from,
                        type: MessageType.AGENT_READY,
                        payload: {
                            agentId: agent.id,
                            name: agent.name,
                            role: agent.type
                        }
                    };

                    this.connectionPool.sendToLogical(message.from, confirmMessage);
                }
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, 'Failed to spawn agent');
        }
    }

    private async handleAssignTask(message: OrchestratorMessage): Promise<void> {
        if (!this.taskQueue) {
            this.loggingService.warn('TaskQueue not available for assign task command');
            return;
        }

        const { agentId, taskId, title, description, priority } = message.payload;

        try {
            // Create task config and add to queue
            const taskConfig = {
                title: title || description,
                description: description || title,
                priority: priority || 'medium' as const,
                files: []
            };

            const task = this.taskQueue.addTask(taskConfig);

            if (agentId) {
                await this.taskQueue.assignTask(task.id, agentId);
            }

            // Send confirmation
            const confirmMessage: OrchestratorMessage = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                from: 'system',
                to: message.from,
                type: MessageType.TASK_ACCEPTED,
                payload: { taskId: task.id, agentId }
            };

            this.connectionPool.sendToLogical(message.from, confirmMessage);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, 'Failed to assign task');
        }
    }

    private async handleQueryStatus(message: OrchestratorMessage): Promise<void> {
        if (!this.agentManager || !this.taskQueue) {
            this.loggingService.warn('AgentManager or TaskQueue not available for status query');
            return;
        }

        try {
            const agents = this.agentManager.getActiveAgents();
            const statusMessage: OrchestratorMessage = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                from: 'system',
                to: message.from,
                type: MessageType.AGENT_STATUS,
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
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, 'Failed to query status');
        }
    }

    private async handleTerminateAgent(message: OrchestratorMessage): Promise<void> {
        if (!this.agentManager) {
            this.loggingService.warn('AgentManager not available for terminate agent command');
            return;
        }

        const { agentId } = message.payload;

        try {
            if (agentId) {
                await this.agentManager.removeAgent(agentId);

                // Send confirmation
                const confirmMessage: OrchestratorMessage = {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    from: 'system',
                    to: message.from,
                    type: MessageType.AGENT_READY, // Using AGENT_READY as a generic response
                    payload: { agentId, status: 'terminated' }
                };

                this.connectionPool.sendToLogical(message.from, confirmMessage);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, 'Failed to terminate agent');
        }
    }

    private async routeBroadcast(message: OrchestratorMessage): Promise<boolean> {
        try {
            // Send to all connections except sender
            this.connectionPool.broadcast(message, [message.from]);

            // Note: MESSAGE_BROADCASTED event is emitted by ConnectionPoolService.broadcast()

            return true;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to broadcast message ${message.id}`);
            return false;
        }
    }

    private async routeToDashboard(message: OrchestratorMessage): Promise<boolean> {
        try {
            if (!this.dashboardCallback) {
                this.loggingService.warn('Dashboard callback not set, message dropped', {
                    messageId: message.id
                });
                return false;
            }

            this.dashboardCallback(message);

            this.eventBus.publish(ORCH_EVENTS.MESSAGE_TO_DASHBOARD, {
                messageId: message.id,
                sender: message.from,
                timestamp: message.timestamp
            } as MessageToDashboardPayload);

            return true;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to route message to dashboard ${message.id}`);
            return false;
        }
    }

    private async routeDirect(message: OrchestratorMessage): Promise<boolean> {
        try {
            const { to } = message;

            // Resolve logical ID to client ID if needed
            let targetClientId = to;
            if (to === 'conductor' || to.startsWith('agent-')) {
                // Check if this is a logical ID that needs resolution
                const resolvedClientId = this.connectionPool.resolveLogicalId(to);
                if (resolvedClientId) {
                    targetClientId = resolvedClientId;
                    this.loggingService.debug(`Resolved logical ID ${to} to client ID ${targetClientId}`);
                }
            }

            const success = this.connectionPool.sendToClient(targetClientId, message);

            if (success) {
                this.eventBus.publish(ORCH_EVENTS.MESSAGE_DELIVERED, {
                    messageId: message.id,
                    from: message.from,
                    to: message.to,
                    resolvedTo: targetClientId,
                    timestamp: message.timestamp
                } as MessageDeliveredPayload);
            } else {
                // If destination resolved but send failed, enqueue for retry
                if (this.connectionPool.resolveLogicalId(to)) {
                    this.enqueueRetry(to, message);
                    this.loggingService.debug('Message enqueued for retry due to delivery failure', {
                        messageId: message.id,
                        destination: to
                    });
                } else {
                    this.eventBus.publish(ORCH_EVENTS.MESSAGE_DELIVERY_FAILED, {
                        messageId: message.id,
                        from: message.from,
                        to: message.to,
                        resolvedTo: targetClientId,
                        reason: 'Client not connected'
                    } as MessageDeliveryFailedPayload);
                }
            }

            return success;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to route direct message ${message.id}`);
            return false;
        }
    }

    private async routeToAllAgents(message: OrchestratorMessage): Promise<boolean> {
        try {
            const connections = this.connectionPool.getAllConnections();
            const agentConnections: string[] = [];
            let successCount = 0;

            // Find all agent connections
            connections.forEach((connection, clientId) => {
                if (connection.metadata.isAgent) {
                    agentConnections.push(clientId);
                }
            });

            // Send to all agents
            for (const agentId of agentConnections) {
                if (this.connectionPool.sendToClient(agentId, message)) {
                    successCount++;
                }
            }

            const success = successCount > 0;

            this.eventBus.publish(ORCH_EVENTS.MESSAGE_TO_AGENTS, {
                messageId: message.id,
                sender: message.from,
                agentCount: agentConnections.length,
                successCount,
                timestamp: message.timestamp
            } as MessageToAgentsPayload);

            return success;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to route message to all agents ${message.id}`);
            return false;
        }
    }

    private async sendAcknowledgment(message: OrchestratorMessage): Promise<void> {
        try {
            const ackMessage: OrchestratorMessage = {
                id: `ack-${message.id}`,
                timestamp: new Date().toISOString(),
                from: 'system',
                to: message.from,
                type: MessageType.SYSTEM_ACK,
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
            } else {
                this.loggingService.warn('Failed to send acknowledgment', {
                    originalMessageId: message.id,
                    recipient: message.from
                });
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(err, `Failed to send acknowledgment for message ${message.id}`);
        }
    }
}
