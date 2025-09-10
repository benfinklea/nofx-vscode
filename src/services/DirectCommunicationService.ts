import * as vscode from 'vscode';
import { IEventEmitter, IEventSubscriber, ILogger, INotificationService } from './interfaces';
import { OrchestratorMessage, MessageType, MessageStatus } from '../orchestration/MessageProtocol';
import { EVENTS } from './EventConstants';

/**
 * Direct Communication Service - Replacement for WebSocket-based OrchestrationServer
 *
 * This service provides all the functionality of the OrchestrationServer but uses
 * VS Code's native EventBus for in-process communication instead of WebSocket.
 *
 * Key improvements:
 * - No network dependencies (no port conflicts)
 * - Better performance (memory-based vs network serialization)
 * - Simpler architecture (direct EventBus communication)
 * - Easier testing (no WebSocket mocking required)
 * - Reduced bundle size (removes 'ws' package dependency)
 */
export class DirectCommunicationService {
    // Helper to adapt between subscribe and on
    private subscribeToEvent(event: string, handler: (data?: any) => void): any {
        if (this.eventBus && 'subscribe' in this.eventBus) {
            return (this.eventBus as any).subscribe(event, handler);
        } else if (this.eventBus && 'on' in this.eventBus) {
            this.eventBus.on(event, handler);
            return { dispose: () => this.eventBus?.off?.(event, handler) };
        }
        return { dispose: () => {} };
    }

    // Helper to publish events
    private publishEvent(event: string, data?: any): void {
        if (this.eventBus && 'publish' in this.eventBus) {
            (this.eventBus as any).publish(event, data);
        } else if (this.eventBus && 'emit' in this.eventBus) {
            this.eventBus.emit(event, data);
        }
    }
    private readonly messageHistory: Map<string, OrchestratorMessage> = new Map();
    private readonly activeConnections: Map<string, ConnectionInfo> = new Map();
    private readonly subscriptions: vscode.Disposable[] = [];
    private readonly messageCallbacks: Set<(message: OrchestratorMessage) => void> = new Set();
    private isStarted = false;
    private messageIdCounter = 0;

    // Performance metrics
    private metrics = {
        totalMessages: 0,
        messagesSent: 0,
        messagesReceived: 0,
        startTime: Date.now(),
        lastActivity: Date.now()
    };

    constructor(
        private eventBus: IEventEmitter & IEventSubscriber,
        private loggingService?: ILogger,
        private notificationService?: INotificationService
    ) {}

    /**
     * Start the direct communication service
     */
    async start(): Promise<void> {
        if (this.isStarted) {
            this.loggingService?.warn('DirectCommunicationService already started');
            return;
        }

        try {
            this.loggingService?.info('Starting DirectCommunicationService...');

            // Subscribe to all orchestration events
            this.subscribeToEvents();

            this.isStarted = true;
            this.metrics.startTime = Date.now();

            // Emit startup event
            this.publishEvent(EVENTS.ORCH_SERVER_STARTED, {
                service: 'DirectCommunicationService',
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            });

            this.loggingService?.info('✅ DirectCommunicationService started successfully');

            // Track metrics
            // Metrics service doesn't have increment method - using recordMetric instead
            // this.metricsService?.increment('direct_communication.service_starts');
        } catch (error) {
            this.loggingService?.error('Failed to start DirectCommunicationService:', error);
            // this.metricsService?.increment('direct_communication.service_start_failures');
            throw error;
        }
    }

    /**
     * Stop the direct communication service
     */
    async stop(): Promise<void> {
        if (!this.isStarted) {
            return;
        }

        try {
            this.loggingService?.info('Stopping DirectCommunicationService...');

            // Dispose of all subscriptions
            for (const disposable of this.subscriptions) {
                disposable.dispose();
            }
            this.subscriptions.length = 0;

            // Clear all state
            this.messageHistory.clear();
            this.activeConnections.clear();
            this.messageCallbacks.clear();

            this.isStarted = false;

            // Emit shutdown event
            this.publishEvent(EVENTS.ORCH_SERVER_STOPPED, {
                service: 'DirectCommunicationService',
                timestamp: new Date().toISOString(),
                uptime: Date.now() - this.metrics.startTime
            });

            this.loggingService?.info('✅ DirectCommunicationService stopped');
        } catch (error) {
            this.loggingService?.error('Error stopping DirectCommunicationService:', error);
            throw error;
        }
    }

    /**
     * Send a message through the EventBus
     */
    sendMessage(message: Partial<OrchestratorMessage>, targetAgent?: string): void {
        const fullMessage: OrchestratorMessage = {
            id: message.id || this.generateMessageId(),
            type: message.type || MessageType.SYSTEM_MESSAGE,
            source: message.source || 'DirectCommunicationService',
            target: message.target || targetAgent || 'broadcast',
            content: message.content || '',
            timestamp: message.timestamp || new Date().toISOString(),
            status: message.status || MessageStatus.PENDING,
            ...message
        };

        try {
            // Store in message history
            this.messageHistory.set(fullMessage.id, fullMessage);

            // Update metrics
            this.metrics.totalMessages++;
            this.metrics.messagesSent++;
            this.metrics.lastActivity = Date.now();

            // Route message based on type and target
            this.routeMessage(fullMessage);

            // Notify all registered callbacks
            for (const callback of this.messageCallbacks) {
                try {
                    callback(fullMessage);
                } catch (error) {
                    this.loggingService?.error('Error in message callback:', error);
                }
            }

            this.loggingService?.debug(`📤 Message sent: ${fullMessage.type} -> ${fullMessage.target}`);
            // this.metricsService?.increment('direct_communication.messages_sent');
        } catch (error) {
            this.loggingService?.error('Error sending message:', error);
            // this.metricsService?.increment('direct_communication.send_failures');
            throw error;
        }
    }

    /**
     * Register a callback for all messages (Dashboard functionality)
     */
    setDashboardCallback(callback: (message: OrchestratorMessage) => void): void {
        this.messageCallbacks.add(callback);
        this.loggingService?.debug('Dashboard callback registered');
    }

    /**
     * Remove a dashboard callback
     */
    removeDashboardCallback(callback: (message: OrchestratorMessage) => void): void {
        this.messageCallbacks.delete(callback);
        this.loggingService?.debug('Dashboard callback removed');
    }

    /**
     * Get message history for dashboard
     */
    getMessageHistory(limit = 100): OrchestratorMessage[] {
        const messages = Array.from(this.messageHistory.values())
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);
        return messages;
    }

    /**
     * Generate test messages for dashboard testing
     */
    generateTestMessages(count = 5): void {
        const testTypes = [
            MessageType.SPAWN_AGENT,
            MessageType.ASSIGN_TASK,
            MessageType.TASK_PROGRESS,
            MessageType.TASK_COMPLETE,
            MessageType.AGENT_STATUS
        ];

        for (let i = 0; i < count; i++) {
            const randomType = testTypes[Math.floor(Math.random() * testTypes.length)];
            const testMessage: Partial<OrchestratorMessage> = {
                type: randomType,
                source: `test-source-${i}`,
                target: `test-target-${i}`,
                content: `Test message ${i} of type ${randomType}`,
                metadata: { test: true, index: i }
            };

            setTimeout(() => {
                this.sendMessage(testMessage);
            }, i * 200); // Stagger messages
        }

        this.loggingService?.info(`📋 Generated ${count} test messages`);
    }

    /**
     * Get current service metrics
     */
    getMetrics(): ServiceMetrics {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime,
            activeConnections: this.activeConnections.size,
            messageHistorySize: this.messageHistory.size,
            isStarted: this.isStarted
        };
    }

    /**
     * Register a logical connection (replaces WebSocket connection tracking)
     */
    registerConnection(connectionId: string, info: Partial<ConnectionInfo>): void {
        const fullInfo: ConnectionInfo = {
            id: connectionId,
            type: info.type || 'agent',
            name: info.name || connectionId,
            connectedAt: new Date(),
            lastSeen: new Date(),
            messageCount: 0,
            ...info
        };

        this.activeConnections.set(connectionId, fullInfo);

        this.publishEvent(EVENTS.ORCH_CLIENT_CONNECTED, {
            connectionId,
            connectionInfo: fullInfo
        });

        this.loggingService?.info(`🔗 Connection registered: ${connectionId} (${fullInfo.type})`);
    }

    /**
     * Unregister a logical connection
     */
    unregisterConnection(connectionId: string): void {
        const connection = this.activeConnections.get(connectionId);
        if (connection) {
            this.activeConnections.delete(connectionId);

            this.publishEvent(EVENTS.ORCH_CLIENT_DISCONNECTED, {
                connectionId,
                connectionInfo: connection,
                duration: Date.now() - connection.connectedAt.getTime()
            });

            this.loggingService?.info(`🔌 Connection unregistered: ${connectionId}`);
        }
    }

    /**
     * Get active connections
     */
    getActiveConnections(): ConnectionInfo[] {
        return Array.from(this.activeConnections.values());
    }

    private subscribeToEvents(): void {
        // Subscribe to message-related events
        const messageEvents = [
            EVENTS.ORCH_MESSAGE_RECEIVED
            // Add other events as needed
        ];

        for (const eventName of messageEvents) {
            const subscription = this.subscribeToEvent(eventName, data => {
                this.handleEventData(eventName, data);
            });
            this.subscriptions.push(subscription);
        }

        // Subscribe to pattern-based events
        // Pattern subscription not supported by simplified interfaces
        // const patternSub = this.eventBus.subscribePattern('orch.*', (event: string, data: any) => {
        //     this.handlePatternEvent(event, data);
        // });
        // this.subscriptions.push(patternSub);
    }

    private handleEventData(eventName: string, data: any): void {
        this.metrics.messagesReceived++;
        this.metrics.lastActivity = Date.now();

        this.loggingService?.debug(`📥 Event received: ${eventName}`, data);

        // Convert event to message format if needed
        if (data && typeof data === 'object') {
            const message: Partial<OrchestratorMessage> = {
                type: this.eventToMessageType(eventName),
                source: data.source || 'EventBus',
                content: JSON.stringify(data),
                metadata: { originalEvent: eventName, ...data }
            };

            // Don't re-route to avoid loops, just notify callbacks
            const fullMessage = this.createFullMessage(message);
            this.messageHistory.set(fullMessage.id, fullMessage);

            for (const callback of this.messageCallbacks) {
                try {
                    callback(fullMessage);
                } catch (error) {
                    this.loggingService?.error('Error in event callback:', error);
                }
            }
        }
    }

    private handlePatternEvent(event: string, data: any): void {
        this.loggingService?.debug(`🎯 Pattern event: ${event}`, data);
        // Handle pattern-matched events
        this.handleEventData(event, data);
    }

    private routeMessage(message: OrchestratorMessage): void {
        // Determine target event based on message type
        let targetEvent: string;

        switch (message.type) {
            case MessageType.SPAWN_AGENT:
            case MessageType.ASSIGN_TASK:
            case MessageType.TERMINATE_AGENT:
            case MessageType.QUERY_STATUS:
                targetEvent = EVENTS.ORCH_MESSAGE_RECEIVED;
                break;
            default:
                targetEvent = EVENTS.ORCH_MESSAGE_RECEIVED;
        }

        // Publish to EventBus
        this.publishEvent(targetEvent, {
            message,
            timestamp: new Date().toISOString(),
            routedBy: 'DirectCommunicationService'
        });
    }

    private eventToMessageType(eventName: string): MessageType {
        // Map event names to message types
        const eventMappings: Record<string, MessageType> = {
            [EVENTS.ORCH_MESSAGE_RECEIVED]: MessageType.SYSTEM_MESSAGE
            // Add more mappings as needed
        };

        return eventMappings[eventName] || MessageType.SYSTEM_MESSAGE;
    }

    private createFullMessage(partial: Partial<OrchestratorMessage>): OrchestratorMessage {
        return {
            id: partial.id || this.generateMessageId(),
            type: partial.type || MessageType.SYSTEM_MESSAGE,
            source: partial.source || 'DirectCommunicationService',
            target: partial.target || 'broadcast',
            content: partial.content || '',
            timestamp: partial.timestamp || new Date().toISOString(),
            status: partial.status || MessageStatus.PENDING,
            ...partial
        };
    }

    private generateMessageId(): string {
        return `msg_${++this.messageIdCounter}_${Date.now()}`;
    }
}

/**
 * Connection information for logical connections (replaces WebSocket connections)
 */
export interface ConnectionInfo {
    id: string;
    type: 'agent' | 'conductor' | 'dashboard' | 'client';
    name: string;
    connectedAt: Date;
    lastSeen: Date;
    messageCount: number;
    metadata?: Record<string, any>;
}

/**
 * Service metrics for monitoring
 */
export interface ServiceMetrics {
    totalMessages: number;
    messagesSent: number;
    messagesReceived: number;
    startTime: number;
    lastActivity: number;
    uptime: number;
    activeConnections: number;
    messageHistorySize: number;
    isStarted: boolean;
}
