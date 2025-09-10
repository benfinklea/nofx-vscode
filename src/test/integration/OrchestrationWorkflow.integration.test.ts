// Mock VS Code - removed to rely on mapper mock

import { OrchestrationServer } from '../../orchestration/OrchestrationServer';
import {
    ILoggingService,
    IEventBus,
    IErrorHandler,
    IConnectionPoolService,
    IMessageRouter,
    IMessageValidator,
    IMessagePersistenceService,
    IMetricsService,
    ValidationResult,
    ManagedConnection,
    MessageFilter
} from '../../services/interfaces';
import {
    OrchestratorMessage,
    MessageType,
    createMessage,
    generateMessageId
} from '../../orchestration/MessageProtocol';
import { ORCH_EVENTS } from '../../services/EventConstants';
import { createTestContainer, createMockAgent, waitForEvent, measureTime } from '../setup';
import {
import { getAppStateStore } from '../../state/AppStateStore';
import * as selectors from '../../state/selectors';
import * as actions from '../../state/actions';    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockContainer,
    createMockExtensionContext,
    createMockOutputChannel,
    createMockTerminal,
    setupVSCodeMocks
} from './../helpers/mockFactories';

// Mock WebSocket for integration testing
class MockWebSocketClient {
    public readyState = 1; // WebSocket.OPEN
    public onopen: ((event: any) => void) | null = null;
    public onclose: ((event: any) => void) | null = null;
    public onmessage: ((event: any) => void) | null = null;
    public onerror: ((event: any) => void) | null = null;
    public url: string;
    public send = jest.fn();
    public close = jest.fn();
    public addEventListener = jest.fn();
    public removeEventListener = jest.fn();
    private messageHandlers: Array<(data: any) => void> = [];

    constructor(url: string) {
        this.url = url;
        setTimeout(() => {
            if (this.onopen) {
                this.onopen({ type: 'open' });
            }
        }, 0);
    }

    // Simulate receiving a message
    simulateMessage(data: any) {
        this.messageHandlers.forEach(handler => handler({ data: JSON.stringify(data) }));
    }

    // Add message handler
    on(event: string, handler: (data: any) => void) {
        if (event === 'message') {
            this.messageHandlers.push(handler);
        }
        return this;
    }
}

jest.setTimeout(10000);

jest.mock('ws', () => ({
    WebSocketServer: jest.fn().mockImplementation(() => ({
        on: jest.fn((event: string, callback: any) => {
            if (event === 'listening') {
                // Immediately call listening callback to simulate successful start
                setTimeout(() => callback(), 0);
            }
        }),
        close: jest.fn()
    })),
    WebSocket: jest.fn()
}));
describe('Orchestration Workflow Integration Tests', () => {
    let orchestrationServer: OrchestrationServer;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockConnectionPool: jest.Mocked<IConnectionPoolService>;
    let mockMessageRouter: jest.Mocked<IMessageRouter>;
    let mockMessageValidator: jest.Mocked<IMessageValidator>;
    let mockMessagePersistence: jest.Mocked<IMessagePersistenceService>;
    let mockMetricsService: jest.Mocked<IMetricsService>;
    let mockWebSocketClient: MockWebSocketClient;

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        // Reset all mocks
        jest.clearAllMocks();

        // Create comprehensive mock services
        mockLoggingService = {
            trace: jest.fn(),
            debug: jest.fn(),
            agents: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn() as any,
            getChannel: jest.fn() as any,
            time: jest.fn(),
            timeEnd: jest.fn(),
            dispose: jest.fn()
        };

        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn() as any,
            unsubscribe: jest.fn(),
            once: jest.fn() as any,
            filter: jest.fn(),
            subscribePattern: jest.fn() as any,
            setLoggingService: jest.fn(),
            dispose: jest.fn()
        };

        mockErrorHandler = {
            handleError: jest.fn(),
            handleAsync: jest.fn(async (operation: () => Promise<any>, context?: string) => {
                // Actually execute the operation for tests to work
                return await operation();
            }),
            wrapSync: jest.fn((operation: () => any) => operation()),
            withRetry: jest.fn(async (operation: () => Promise<any>) => await operation()),
            dispose: jest.fn()
        };

        // Mock connection pool with realistic behavior
        const connections = new Map<string, ManagedConnection>();
        mockConnectionPool = {
            addConnection: jest.fn((ws, clientId, metadata) => {
                connections.set(clientId, {
                    ws,
                    metadata: {
                        clientId,
                        userAgent: metadata.userAgent || 'test-client',
                        connectedAt: metadata.connectedAt || new Date(),
                        lastHeartbeat: metadata.lastHeartbeat || new Date(),
                        messageCount: 0,
                        isAgent: metadata.isAgent || false
                    },
                    lastHeartbeat: new Date(),
                    messageCount: 0
                });
            }),
            removeConnection: jest.fn(clientId => {
                connections.delete(clientId);
            }),
            getConnection: jest.fn(clientId => connections.get(clientId)),
            getAllConnections: jest.fn(() => connections),
            broadcast: jest.fn((message, excludeIds = []) => {
                connections.forEach((connection, clientId) => {
                    if (!excludeIds.includes(clientId)) {
                        connection.ws.send(JSON.stringify(message));
                    }
                });
            }),
            sendToClient: jest.fn((clientId, message) => {
                const connection = connections.get(clientId);
                if (connection) {
                    connection.ws.send(JSON.stringify(message));
                    return true;
                }
                return false;
            }),
            sendToLogical: jest.fn((logicalId, message) => {
                // Simple implementation for testing
                return mockConnectionPool.sendToClient(logicalId, message);
            }),
            registerLogicalId: jest.fn(),
            resolveLogicalId: jest.fn(),
            unregisterLogicalId: jest.fn(),
            getConnectionSummaries: jest.fn(() =>
                Array.from(connections.values()).map(conn => ({
                    clientId: conn.metadata.clientId,
                    isAgent: conn.metadata.isAgent,
                    connectedAt: conn.metadata.connectedAt.toISOString(),
                    lastHeartbeat: conn.metadata.lastHeartbeat.toISOString(),
                    messageCount: conn.metadata.messageCount,
                    userAgent: conn.metadata.userAgent
                }))
            ),
            startHeartbeat: jest.fn(),
            stopHeartbeat: jest.fn(),
            dispose: jest.fn()
        };

        // Mock message router with realistic behavior
        const messageHistory: OrchestratorMessage[] = [];
        mockMessageRouter = {
            route: jest.fn(async (message: OrchestratorMessage) => {
                messageHistory.push(message);
                // Simulate routing logic
                if (message.to === 'broadcast') {
                    mockConnectionPool.broadcast(message);
                } else if (message.to && message.to !== 'server') {
                    mockConnectionPool.sendToClient(message.to, message);
                }
            }),
            validateDestination: jest.fn((to: string) => to !== 'invalid'),
            handleAcknowledgment: jest.fn(),
            replayToClient: jest.fn(async (target: string, filter?: MessageFilter) => {
                const filteredMessages = messageHistory.filter(msg => {
                    if (filter?.clientId && msg.from !== filter.clientId) return false;
                    if (filter?.type && msg.type !== filter.type) return false;
                    if (filter?.timeRange) {
                        const msgTime = new Date(msg.timestamp);
                        if (filter.timeRange.from && msgTime < filter.timeRange.from) return false;
                        if (filter.timeRange.to && msgTime > filter.timeRange.to) return false;
                    }
                    return true;
                });

                const limitedMessages = filter?.limit
                    ? filteredMessages.slice(filter.offset || 0, (filter.offset || 0) + filter.limit)
                    : filteredMessages.slice(filter?.offset || 0);

                limitedMessages.forEach(msg => {
                    mockConnectionPool.sendToClient(target, msg);
                });
            }),
            setDashboardCallback: jest.fn(),
            clearDashboardCallback: jest.fn(),
            getDeliveryStats: jest.fn(() => ({
                totalSent: 0,
                totalDelivered: 0,
                failureRate: 0
            })),
            dispose: jest.fn()
        };

        // Mock message validator with realistic behavior
        mockMessageValidator = {
            validate: jest.fn((rawMessage: string): ValidationResult => {
                try {
                    const message = JSON.parse(rawMessage);
                    if (!message.id || !message.type || !message.from) {
                        return {
                            isValid: false,
                            errors: ['Missing required fields: id, type, or from'],
                            warnings: [],
                            result: undefined
                        };
                    }
                    return {
                        isValid: true,
                        errors: [],
                        warnings: [],
                        result: message
                    };
                } catch (error) {
                    return {
                        isValid: false,
                        errors: ['Invalid JSON format'],
                        warnings: [],
                        result: undefined
                    };
                }
            }),
            validatePayload: jest.fn((type: string, payload: any): ValidationResult => {
                return {
                    isValid: true,
                    errors: [],
                    warnings: [],
                    result: payload
                };
            }),
            createErrorResponse: jest.fn(
                (error: string, clientId: string): OrchestratorMessage => ({
                    id: generateMessageId(),
                    type: MessageType.SYSTEM_ERROR,
                    from: 'server',
                    to: clientId,
                    payload: { error },
                    timestamp: new Date().toISOString()
                })
            ),
            dispose: jest.fn()
        };

        // Mock message persistence with realistic behavior
        const persistedMessages: OrchestratorMessage[] = [];
        mockMessagePersistence = {
            save: jest.fn(async (message: OrchestratorMessage) => {
                persistedMessages.push(message);
            }),
            load: jest.fn(async (offset = 0, limit = 100) => {
                return persistedMessages.slice(offset, offset + limit);
            }),
            getHistory: jest.fn() as any,
            clear: jest.fn(async () => {
                persistedMessages.length = 0;
            }),
            getStats: jest.fn(async () => ({
                totalMessages: persistedMessages.length,
                oldestMessage: persistedMessages[0]?.timestamp ? new Date(persistedMessages[0].timestamp) : new Date()
            })),
            dispose: jest.fn()
        };

        mockMetricsService = {
            incrementCounter: jest.fn(),
            recordDuration: jest.fn(),
            setGauge: jest.fn(),
            startTimer: jest.fn() as any,
            endTimer: jest.fn(),
            getMetrics: jest.fn(() => []),
            resetMetrics: jest.fn(),
            exportMetrics: jest.fn(() => '{}'),
            getDashboardData: jest.fn(() => ({})),
            dispose: jest.fn()
        };

        // Create orchestration server
        orchestrationServer = new OrchestrationServer(
            0, // Use random port
            mockLoggingService,
            mockEventBus,
            mockErrorHandler,
            mockConnectionPool,
            mockMessageRouter,
            mockMessageValidator,
            mockMessagePersistence,
            mockMetricsService
        );

        // Create mock WebSocket client
        mockWebSocketClient = new MockWebSocketClient('ws://localhost:7777');
    });

    afterEach(async () => {
        if (orchestrationServer) {
            await orchestrationServer.stop();
        }
    });

    describe('Server Lifecycle Integration', () => {
        it('should start and stop server successfully', async () => {
            const { duration } = await measureTime(async () => {
                await orchestrationServer.start();
                expect(orchestrationServer.getStatus().isRunning).toBe(true);

                await orchestrationServer.stop();
                expect(orchestrationServer.getStatus().isRunning).toBe(false);
            });

            expect(duration).toBeLessThan(1000); // Should complete within 1 second
            expect(mockEventBus.publish).toHaveBeenCalledWith(ORCH_EVENTS.SERVER_STARTED, expect.any(Object));
            expect(mockEventBus.publish).toHaveBeenCalledWith(ORCH_EVENTS.SERVER_STOPPED, expect.any(Object));
        });

        it('should handle multiple start/stop cycles', async () => {
            for (let i = 0; i < 3; i++) {
                await orchestrationServer.start();
                expect(orchestrationServer.getStatus().isRunning).toBe(true);

                await orchestrationServer.stop();
                expect(orchestrationServer.getStatus().isRunning).toBe(false);
            }

            expect(mockEventBus.publish).toHaveBeenCalledTimes(6); // 3 starts + 3 stops
        });
    });

    describe('Connection Management Integration', () => {
        it('should handle client connections and disconnections', async () => {
            await orchestrationServer.start();

            // Simulate client connection
            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocketClient, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            });

            expect(mockConnectionPool.addConnection).toHaveBeenCalled();
            expect(mockConnectionPool.getAllConnections().size).toBe(1);

            // Simulate client disconnection
            mockConnectionPool.removeConnection('client-1');
            expect(mockConnectionPool.getAllConnections().size).toBe(0);
        });

        it('should identify agent connections correctly', async () => {
            await orchestrationServer.start();

            const agentWebSocket = new MockWebSocketClient('ws://localhost:7777');
            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);

            handleConnection(agentWebSocket, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'nofx-agent/1.0.0' }
            });

            expect(mockConnectionPool.addConnection).toHaveBeenCalledWith(
                agentWebSocket,
                expect.any(String),
                expect.objectContaining({
                    isAgent: true,
                    userAgent: 'nofx-agent/1.0.0'
                })
            );
        });

        it('should track connection metrics', async () => {
            await orchestrationServer.start();

            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocketClient, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            });

            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('connections_established', {
                clientType: 'client',
                userAgent: 'test-client'
            });
        });
    });

    describe('Message Flow Integration', () => {
        beforeEach(async () => {
            await orchestrationServer.start();
        });

        it('should handle complete message flow from client to server', async () => {
            const testMessage: OrchestratorMessage = {
                id: generateMessageId(),
                type: MessageType.AGENT_QUERY,
                from: 'test-client',
                to: 'server',
                payload: { action: 'test_action', data: 'test_data' },
                timestamp: new Date().toISOString()
            };

            // Simulate client connection
            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocketClient, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            });

            // Simulate message handling
            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', JSON.stringify(testMessage));

            expect(mockMessageValidator.validate).toHaveBeenCalledWith(JSON.stringify(testMessage));
            expect(mockEventBus.publish).toHaveBeenCalledWith(ORCH_EVENTS.MESSAGE_RECEIVED, {
                message: testMessage
            });
            expect(mockMessageRouter.route).toHaveBeenCalledWith(testMessage);
            expect(mockMessagePersistence.save).toHaveBeenCalledWith(testMessage);
        });

        it('should handle broadcast messages to all connected clients', async () => {
            // Create multiple mock clients
            const client1 = new MockWebSocketClient('ws://localhost:7777');
            const client2 = new MockWebSocketClient('ws://localhost:7777');
            const client3 = new MockWebSocketClient('ws://localhost:7777');

            // Connect all clients
            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(client1, { socket: { remoteAddress: '127.0.0.1' }, headers: {} });
            handleConnection(client2, { socket: { remoteAddress: '127.0.0.1' }, headers: {} });
            handleConnection(client3, { socket: { remoteAddress: '127.0.0.1' }, headers: {} });

            // Send broadcast message
            const broadcastMessage: OrchestratorMessage = {
                id: generateMessageId(),
                type: MessageType.BROADCAST,
                from: 'server',
                to: 'broadcast',
                payload: { announcement: 'Server maintenance in 5 minutes' },
                timestamp: new Date().toISOString()
            };

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('server', JSON.stringify(broadcastMessage));

            expect(mockConnectionPool.broadcast).toHaveBeenCalledWith(broadcastMessage);
        });

        it('should handle invalid messages and send error responses', async () => {
            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocketClient, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            });

            // Send invalid message
            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', 'invalid json message');

            expect(mockMessageValidator.createErrorResponse).toHaveBeenCalledWith(
                'Validation failed: Invalid JSON format',
                'client-1'
            );
            expect(mockConnectionPool.sendToClient).toHaveBeenCalled();
        });

        it('should handle message routing errors gracefully', async () => {
            mockMessageRouter.route.mockRejectedValue(new Error('Routing failed'));

            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocketClient, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            });

            const testMessage: OrchestratorMessage = {
                id: generateMessageId(),
                type: MessageType.AGENT_QUERY,
                from: 'test-client',
                to: 'server',
                payload: { action: 'test' },
                timestamp: new Date().toISOString()
            };

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', JSON.stringify(testMessage));

            expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
                expect.any(Error),
                'Error handling message from client-1'
            );
        });
    });

    describe('Logical ID Management Integration', () => {
        beforeEach(async () => {
            await orchestrationServer.start();
        });

        it('should register and resolve logical IDs', async () => {
            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocketClient, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            });

            const messageWithLogicalId: OrchestratorMessage = {
                id: generateMessageId(),
                type: MessageType.AGENT_QUERY,
                from: 'logical-agent-1',
                to: 'server',
                payload: { action: 'register' },
                timestamp: new Date().toISOString()
            };

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', JSON.stringify(messageWithLogicalId));

            expect(mockConnectionPool.registerLogicalId).toHaveBeenCalledWith('client-1', 'logical-agent-1');
            expect(mockMessageRouter.replayToClient).toHaveBeenCalledWith('logical-agent-1');
        });

        it('should handle duplicate logical ID registration', async () => {
            mockConnectionPool.resolveLogicalId.mockReturnValue('old-client-1');

            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocketClient, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            });

            const messageWithLogicalId: OrchestratorMessage = {
                id: generateMessageId(),
                type: MessageType.AGENT_QUERY,
                from: 'logical-agent-1',
                to: 'server',
                payload: { action: 'register' },
                timestamp: new Date().toISOString()
            };

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', JSON.stringify(messageWithLogicalId));

            expect(mockConnectionPool.unregisterLogicalId).toHaveBeenCalledWith('logical-agent-1');
            expect(mockConnectionPool.registerLogicalId).toHaveBeenCalledWith('client-1', 'logical-agent-1');
            expect(mockEventBus.publish).toHaveBeenCalledWith(ORCH_EVENTS.LOGICAL_ID_REASSIGNED, {
                logicalId: 'logical-agent-1',
                previousClientId: 'old-client-1',
                newClientId: 'client-1',
                timestamp: expect.any(String)
            });
        });
    });

    describe('Message Persistence Integration', () => {
        beforeEach(async () => {
            await orchestrationServer.start();
        });

        it('should persist all valid messages', async () => {
            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocketClient, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            });

            const messages = [
                createMessage('client-1', 'server', MessageType.AGENT_QUERY, { action: 'test1' }),
                createMessage('server', 'client-1', MessageType.AGENT_STATUS, { result: 'success1' }),
                createMessage('client-1', 'server', MessageType.AGENT_QUERY, { action: 'test2' })
            ];

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            for (const message of messages) {
                await handleMessage('client-1', JSON.stringify(message));
            }

            expect(mockMessagePersistence.save).toHaveBeenCalledTimes(3);
            messages.forEach(message => {
                expect(mockMessagePersistence.save).toHaveBeenCalledWith(message);
            });
        });

        it('should retrieve message history with filters', async () => {
            const history = await orchestrationServer.getMessageHistory();
            expect(mockMessagePersistence.load).toHaveBeenCalledWith(0, 100);
            expect(Array.isArray(history)).toBe(true);
        });
    });

    describe('Dashboard Integration', () => {
        beforeEach(async () => {
            await orchestrationServer.start();
        });

        it('should set and clear dashboard callback', () => {
            const mockCallback = jest.fn();

            orchestrationServer.setDashboardCallback(mockCallback);
            expect(mockMessageRouter.setDashboardCallback).toHaveBeenCalledWith(mockCallback);

            orchestrationServer.clearDashboardCallback();
            expect(mockMessageRouter.setDashboardCallback).toHaveBeenCalledWith(undefined);
        });

        it('should provide connection summaries for dashboard', () => {
            const summaries = orchestrationServer.getConnectionSummaries();
            expect(Array.isArray(summaries)).toBe(true);
            expect(mockConnectionPool.getConnectionSummaries).toHaveBeenCalled();
        });
    });

    describe('Performance and Load Testing', () => {
        beforeEach(async () => {
            await orchestrationServer.start();
        });

        it('should handle high-frequency message processing', async () => {
            const { duration } = await measureTime(async () => {
                const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
                handleConnection(mockWebSocketClient, {
                    socket: { remoteAddress: '127.0.0.1' },
                    headers: { 'user-agent': 'test-client' }
                });

                const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);

                // Send 100 messages rapidly
                const promises = [];
                for (let i = 0; i < 100; i++) {
                    const message = createMessage('client-1', 'server', MessageType.AGENT_QUERY, {
                        action: 'test',
                        index: i
                    });
                    promises.push(handleMessage('client-1', JSON.stringify(message)));
                }

                await Promise.all(promises);
            });

            expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
            expect(mockMessageValidator.validate).toHaveBeenCalledTimes(100);
            expect(mockMessageRouter.route).toHaveBeenCalledTimes(100);
            expect(mockMessagePersistence.save).toHaveBeenCalledTimes(100);
        });

        it('should handle multiple concurrent clients', async () => {
            const { duration } = await measureTime(async () => {
                const clients = [];
                const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);

                // Create 10 concurrent clients
                for (let i = 0; i < 10; i++) {
                    const client = new MockWebSocketClient('ws://localhost:7777');
                    handleConnection(client, {
                        socket: { remoteAddress: `127.0.0.${i + 1}` },
                        headers: { 'user-agent': `test-client-${i}` }
                    });
                    clients.push(client);
                }

                // Each client sends 10 messages
                const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
                const promises = [];

                for (let clientIndex = 0; clientIndex < 10; clientIndex++) {
                    for (let msgIndex = 0; msgIndex < 10; msgIndex++) {
                        const message = createMessage(`client-${clientIndex}`, 'server', MessageType.AGENT_QUERY, {
                            action: 'test',
                            client: clientIndex,
                            message: msgIndex
                        });
                        promises.push(handleMessage(`client-${clientIndex}`, JSON.stringify(message)));
                    }
                }

                await Promise.all(promises);
            });

            expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
            expect(mockConnectionPool.addConnection).toHaveBeenCalledTimes(10);
            expect(mockMessageValidator.validate).toHaveBeenCalledTimes(100);
        });
    });

    describe('Error Recovery and Resilience', () => {
        beforeEach(async () => {
            await orchestrationServer.start();
        });

        it('should continue operating after message processing errors', async () => {
            mockMessageRouter.route.mockRejectedValueOnce(new Error('Temporary routing error'));

            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocketClient, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            });

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);

            // Send message that will cause error
            const errorMessage = createMessage('client-1', 'server', MessageType.AGENT_QUERY, { action: 'error' });
            await handleMessage('client-1', JSON.stringify(errorMessage));

            // Send another message that should succeed
            mockMessageRouter.route.mockResolvedValue(undefined);
            const successMessage = createMessage('client-1', 'server', MessageType.AGENT_QUERY, { action: 'success' });
            await handleMessage('client-1', JSON.stringify(successMessage));

            expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
                expect.any(Error),
                'Error handling message from client-1'
            );
            expect(mockMessageRouter.route).toHaveBeenCalledTimes(2);
        });

        it('should handle validation service failures gracefully', async () => {
            mockMessageValidator.validate.mockImplementation(() => {
                throw new Error('Validation service unavailable');
            });

            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocketClient, {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            });

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', 'test message');

            expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
                expect.any(Error),
                'Error handling message from client-1'
            );
        });
    });
});
