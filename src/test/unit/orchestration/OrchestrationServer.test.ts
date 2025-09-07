// VS Code is mocked via jest.config.js moduleNameMapper

// Mock WebSocket classes need to be defined before the jest.mock call
class MockWebSocket {
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
    public on = jest.fn();
    public off = jest.fn();
    public emit = jest.fn();
    public ping = jest.fn();
    public pong = jest.fn();
    public terminate = jest.fn();
    public CONNECTING = 0;
    public OPEN = 1;
    public CLOSING = 2;
    public CLOSED = 3;

    constructor(url: string) {
        this.url = url;
        setTimeout(() => {
            if (this.onopen) {
                this.onopen({ type: 'open' });
            }
        }, 0);
    }
}

// Mock WebSocketServer
class MockWebSocketServer {
    public on = jest.fn();
    public close = jest.fn();
    public clients = new Set();

    constructor(options: { port: number }) {
        // Simulate server setup
        setTimeout(() => {
            const listeningHandler = this.on.mock.calls.find(([event]) => event === 'listening')?.[1];
            if (listeningHandler) {
                listeningHandler();
            }
        }, 0);
    }
}

// Factory pattern for WebSocketServer mock
let currentWebSocketServerImpl = MockWebSocketServer;

// Mock the ws module with factory pattern - defined before imports
jest.mock('ws', () => ({
    WebSocketServer: class {
        constructor(...args: any[]) {
            return new currentWebSocketServerImpl(...(args as [any]));
        }
    },
    WebSocket: MockWebSocket
}));

import { OrchestrationServer } from '../../../orchestration/OrchestrationServer';
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
    ManagedConnection
} from '../../../services/interfaces';
import { OrchestratorMessage, MessageType } from '../../../orchestration/MessageProtocol';
import { ORCH_EVENTS } from '../../../services/EventConstants';

describe('OrchestrationServer', () => {
    let orchestrationServer: OrchestrationServer;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockConnectionPool: jest.Mocked<IConnectionPoolService>;
    let mockMessageRouter: jest.Mocked<IMessageRouter>;
    let mockMessageValidator: jest.Mocked<IMessageValidator>;
    let mockMessagePersistence: jest.Mocked<IMessagePersistenceService>;
    let mockMetricsService: jest.Mocked<IMetricsService>;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock services
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn() as any,
            getChannel: jest.fn(() => ({
                appendLine: jest.fn(),
                append: jest.fn(),
                clear: jest.fn(),
                dispose: jest.fn(),
                hide: jest.fn(),
                show: jest.fn()
            })) as any,
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
            handleAsync: jest.fn().mockImplementation(async (operation: () => Promise<any>, context?: string) => {
                try {
                    return await operation();
                } catch (error) {
                    // Call handleError and then re-throw
                    mockErrorHandler.handleError(error instanceof Error ? error : new Error(String(error)), context);
                    throw error;
                }
            }),
            wrapSync: jest.fn(),
            withRetry: jest.fn(),
            dispose: jest.fn()
        };

        mockConnectionPool = {
            addConnection: jest.fn(),
            removeConnection: jest.fn(),
            getConnection: jest.fn(),
            getAllConnections: jest.fn(() => new Map()),
            broadcast: jest.fn(),
            sendToClient: jest.fn(),
            sendToLogical: jest.fn(),
            registerLogicalId: jest.fn(),
            resolveLogicalId: jest.fn(),
            unregisterLogicalId: jest.fn(),
            getConnectionSummaries: jest.fn(() => []),
            startHeartbeat: jest.fn(),
            stopHeartbeat: jest.fn(),
            dispose: jest.fn()
        };

        mockMessageRouter = {
            route: jest.fn(),
            validateDestination: jest.fn() as any,
            handleAcknowledgment: jest.fn(),
            replayToClient: jest.fn(),
            setDashboardCallback: jest.fn(),
            dispose: jest.fn()
        };

        mockMessageValidator = {
            validate: jest.fn(),
            validatePayload: jest.fn(),
            createErrorResponse: jest.fn(),
            dispose: jest.fn()
        };

        mockMessagePersistence = {
            save: jest.fn(),
            load: jest.fn(),
            getHistory: jest.fn(),
            clear: jest.fn(),
            getStats: jest.fn(),
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

        // Create OrchestrationServer instance
        orchestrationServer = new OrchestrationServer(
            7777,
            mockLoggingService,
            mockEventBus,
            mockErrorHandler,
            mockConnectionPool,
            mockMessageRouter,
            mockMessageValidator,
            mockMessagePersistence,
            mockMetricsService
        );
    });

    afterEach(async () => {
        await orchestrationServer.dispose();
    });

    describe('Server Lifecycle', () => {
        it('should start server successfully', async () => {
            await orchestrationServer.start();

            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('Orchestration server started')
            );
            expect(mockEventBus.publish).toHaveBeenCalledWith(ORCH_EVENTS.SERVER_STARTED, {
                port: 7777
            });
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('server_started', {
                port: '7777'
            });
        });

        it('should not start if already running', async () => {
            await orchestrationServer.start();
            await orchestrationServer.start();

            expect(mockLoggingService.info).toHaveBeenCalledWith('Server already running on port 7777');
        });

        it('should try alternative ports if primary port is unavailable', async () => {
            // Mock port conflict by making the first attempt fail
            let attemptCount = 0;
            const originalImpl = currentWebSocketServerImpl;

            currentWebSocketServerImpl = class MockFailingWebSocketServer {
                public on = jest.fn();
                public close = jest.fn();
                public clients = new Set();

                constructor(options: { port: number }) {
                    attemptCount++;
                    if (attemptCount === 1) {
                        // First attempt fails immediately
                        setTimeout(() => {
                            const errorHandler = this.on.mock.calls.find(([event]) => event === 'error')?.[1];
                            if (errorHandler) {
                                errorHandler(new Error('Port in use'));
                            }
                        }, 0);
                    } else {
                        // Second attempt succeeds
                        setTimeout(() => {
                            const listeningHandler = this.on.mock.calls.find(([event]) => event === 'listening')?.[1];
                            if (listeningHandler) {
                                listeningHandler();
                            }
                        }, 0);
                    }
                }
            };

            await orchestrationServer.start();

            expect(attemptCount).toBe(2);
            expect(mockLoggingService.warn).toHaveBeenCalledWith('Port 7777 unavailable, trying 7778');

            // Restore original implementation
            currentWebSocketServerImpl = originalImpl;
        });

        it('should stop server successfully', async () => {
            await orchestrationServer.start();
            await orchestrationServer.stop();

            expect(mockConnectionPool.stopHeartbeat).toHaveBeenCalled();
            expect(mockConnectionPool.dispose).toHaveBeenCalled();
            expect(mockLoggingService.info).toHaveBeenCalledWith('Orchestration server stopped');
            expect(mockEventBus.publish).toHaveBeenCalledWith(ORCH_EVENTS.SERVER_STOPPED, {});
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('server_stopped', {
                port: '7777'
            });
        });

        it('should handle stop when not running', async () => {
            await orchestrationServer.stop();

            expect(mockLoggingService.info).toHaveBeenCalledWith('Server not running');
        });

        it('should handle start errors', async () => {
            const originalImpl = currentWebSocketServerImpl;

            currentWebSocketServerImpl = class MockErrorWebSocketServer {
                public on = jest.fn();
                public close = jest.fn();
                public clients = new Set();

                constructor(options: { port: number }) {
                    // Always trigger error immediately
                    setTimeout(() => {
                        const errorHandler = this.on.mock.calls.find(([event]) => event === 'error')?.[1];
                        if (errorHandler) {
                            errorHandler(new Error('Startup failed'));
                        }
                    }, 0);
                }
            };

            await expect(orchestrationServer.start()).rejects.toThrow('Startup failed');
            expect(mockErrorHandler.handleError).toHaveBeenCalled();

            // Restore original implementation
            currentWebSocketServerImpl = originalImpl;
        });
    });

    describe('Connection Handling', () => {
        let mockWebSocket: MockWebSocket;
        let mockRequest: any;

        beforeEach(() => {
            mockWebSocket = new MockWebSocket('ws://localhost:7777');
            mockRequest = {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'test-client' }
            };
        });

        it('should handle new connection', () => {
            // Access private method for testing
            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocket, mockRequest);

            expect(mockConnectionPool.addConnection).toHaveBeenCalledWith(
                mockWebSocket,
                expect.any(String),
                expect.objectContaining({
                    clientId: expect.any(String),
                    userAgent: 'test-client',
                    connectedAt: expect.any(Date),
                    lastHeartbeat: expect.any(Date),
                    messageCount: 0,
                    isAgent: false
                })
            );
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('connections_established', {
                clientType: 'client',
                userAgent: 'test-client'
            });
        });

        it('should identify agent connections', () => {
            mockRequest.headers['user-agent'] = 'nofx-agent/1.0.0';

            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocket, mockRequest);

            expect(mockConnectionPool.addConnection).toHaveBeenCalledWith(
                mockWebSocket,
                expect.any(String),
                expect.objectContaining({
                    isAgent: true
                })
            );
        });

        it('should set up message handling on connection', () => {
            const handleConnection = (orchestrationServer as any).handleConnection.bind(orchestrationServer);
            handleConnection(mockWebSocket, mockRequest);

            expect(mockWebSocket.onmessage).toBeDefined();
        });
    });

    describe('Message Handling', () => {
        let mockWebSocket: MockWebSocket;
        let mockConnection: ManagedConnection;

        beforeEach(() => {
            mockWebSocket = new MockWebSocket('ws://localhost:7777');
            mockConnection = {
                ws: mockWebSocket,
                metadata: {
                    clientId: 'client-1',
                    userAgent: 'test-client',
                    connectedAt: new Date(),
                    lastHeartbeat: new Date(),
                    messageCount: 0,
                    isAgent: false
                },
                lastHeartbeat: new Date(),
                messageCount: 0
            };

            mockConnectionPool.getConnection.mockReturnValue(mockConnection);
        });

        it('should handle valid message successfully', async () => {
            const validMessage: OrchestratorMessage = {
                id: 'msg-1',
                type: MessageType.AGENT_QUERY,
                from: 'client-1',
                to: 'server',
                payload: { action: 'test' },
                timestamp: new Date().toISOString()
            };

            const validationResult: ValidationResult = {
                isValid: true,
                errors: [],
                warnings: [],
                result: validMessage
            };

            mockMessageValidator.validate.mockReturnValue(validationResult);
            mockMessageRouter.route.mockResolvedValue(undefined);

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', JSON.stringify(validMessage));

            expect(mockMessageValidator.validate).toHaveBeenCalledWith(JSON.stringify(validMessage));
            expect(mockEventBus.publish).toHaveBeenCalledWith(ORCH_EVENTS.MESSAGE_RECEIVED, {
                message: validMessage
            });
            expect(mockMessageRouter.route).toHaveBeenCalledWith(validMessage);
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('messages_received', {
                clientId: 'client-1'
            });
        });

        it('should handle invalid message and send error response', async () => {
            const invalidMessage = 'invalid json';
            const validationResult: ValidationResult = {
                isValid: false,
                errors: ['Invalid JSON format'],
                warnings: [],
                result: undefined
            };

            const errorResponse = {
                id: 'error-1',
                type: MessageType.SYSTEM_ERROR,
                from: 'server',
                to: 'client-1',
                payload: { error: 'Validation failed: Invalid JSON format' },
                timestamp: expect.any(String)
            };

            mockMessageValidator.validate.mockReturnValue(validationResult);
            mockMessageValidator.createErrorResponse.mockReturnValue(errorResponse);

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', invalidMessage);

            expect(mockMessageValidator.createErrorResponse).toHaveBeenCalledWith(
                'Validation failed: Invalid JSON format',
                'client-1'
            );
            expect(mockConnectionPool.sendToClient).toHaveBeenCalledWith('client-1', errorResponse);
        });

        it('should register logical ID for new client', async () => {
            const message: OrchestratorMessage = {
                id: 'msg-1',
                type: MessageType.AGENT_QUERY,
                from: 'logical-client-1',
                to: 'server',
                payload: { action: 'test' },
                timestamp: new Date().toISOString()
            };

            const validationResult: ValidationResult = {
                isValid: true,
                errors: [],
                warnings: [],
                result: message
            };

            mockMessageValidator.validate.mockReturnValue(validationResult);
            mockConnectionPool.resolveLogicalId.mockReturnValue(undefined);
            mockMessageRouter.route.mockResolvedValue(undefined);

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', JSON.stringify(message));

            expect(mockConnectionPool.registerLogicalId).toHaveBeenCalledWith('client-1', 'logical-client-1');
            expect(mockMessageRouter.replayToClient).toHaveBeenCalledWith('logical-client-1', {
                timeRange: {
                    from: expect.any(Date),
                    to: expect.any(Date)
                },
                limit: 100
            });
        });

        it('should handle duplicate logical ID registration', async () => {
            const message: OrchestratorMessage = {
                id: 'msg-1',
                type: MessageType.AGENT_QUERY,
                from: 'logical-client-1',
                to: 'server',
                payload: { action: 'test' },
                timestamp: new Date().toISOString()
            };

            const validationResult: ValidationResult = {
                isValid: true,
                errors: [],
                warnings: [],
                result: message
            };

            mockMessageValidator.validate.mockReturnValue(validationResult);
            mockConnectionPool.resolveLogicalId.mockReturnValue('old-client-1');
            mockMessageRouter.route.mockResolvedValue(undefined);

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', JSON.stringify(message));

            expect(mockConnectionPool.unregisterLogicalId).toHaveBeenCalledWith('logical-client-1');
            expect(mockConnectionPool.registerLogicalId).toHaveBeenCalledWith('client-1', 'logical-client-1');
            expect(mockEventBus.publish).toHaveBeenCalledWith(ORCH_EVENTS.LOGICAL_ID_REASSIGNED, {
                logicalId: 'logical-client-1',
                previousClientId: 'old-client-1',
                newClientId: 'client-1',
                timestamp: expect.any(String)
            });
        });

        it('should handle message processing errors', async () => {
            mockMessageValidator.validate.mockImplementation(() => {
                throw new Error('Validation service error');
            });

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', 'test message');

            expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
                expect.any(Error),
                'Error handling message from client-1'
            );
            expect(mockMessageValidator.createErrorResponse).toHaveBeenCalledWith('Internal server error', 'client-1');
        });

        it('should record message processing duration', async () => {
            const message: OrchestratorMessage = {
                id: 'msg-1',
                type: MessageType.AGENT_QUERY,
                from: 'client-1',
                to: 'server',
                payload: { action: 'test' },
                timestamp: new Date().toISOString()
            };

            const validationResult: ValidationResult = {
                isValid: true,
                errors: [],
                warnings: [],
                result: message
            };

            mockMessageValidator.validate.mockReturnValue(validationResult);
            mockMessageRouter.route.mockResolvedValue(undefined);

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', JSON.stringify(message));

            expect(mockMetricsService.recordDuration).toHaveBeenCalledWith(
                'message_processing_duration',
                expect.any(Number),
                {
                    clientId: 'client-1',
                    messageType: 'agent_query'
                }
            );
        });

        it('should track bytes in metrics', async () => {
            const message: OrchestratorMessage = {
                id: 'msg-1',
                type: MessageType.AGENT_QUERY,
                from: 'client-1',
                to: 'server',
                payload: { action: 'test' },
                timestamp: new Date().toISOString()
            };

            const validationResult: ValidationResult = {
                isValid: true,
                errors: [],
                warnings: [],
                result: message
            };

            mockMessageValidator.validate.mockReturnValue(validationResult);
            mockMessageRouter.route.mockResolvedValue(undefined);

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', JSON.stringify(message));

            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('bytes_in_total', {
                clientId: 'client-1',
                bytes: expect.any(String)
            });
        });

        it('should track message timestamps for throughput calculation', async () => {
            const message: OrchestratorMessage = {
                id: 'msg-1',
                type: MessageType.AGENT_QUERY,
                from: 'client-1',
                to: 'server',
                payload: { action: 'test' },
                timestamp: new Date().toISOString()
            };

            const validationResult: ValidationResult = {
                isValid: true,
                errors: [],
                warnings: [],
                result: message
            };

            mockMessageValidator.validate.mockReturnValue(validationResult);
            mockMessageRouter.route.mockResolvedValue(undefined);

            const handleMessage = (orchestrationServer as any).handleMessage.bind(orchestrationServer);
            await handleMessage('client-1', JSON.stringify(message));

            // Check that msgTimestamps array has been updated
            const msgTimestamps = (orchestrationServer as any).msgTimestamps;
            expect(msgTimestamps).toHaveLength(1);
            expect(msgTimestamps[0]).toBeCloseTo(Date.now(), -2); // Within 100ms
        });
    });

    describe('Dashboard Integration', () => {
        it('should set dashboard callback', () => {
            const mockCallback = jest.fn();

            orchestrationServer.setDashboardCallback(mockCallback);

            expect(mockMessageRouter.setDashboardCallback).toHaveBeenCalledWith(mockCallback);
        });

        it('should clear dashboard callback', () => {
            orchestrationServer.clearDashboardCallback();

            expect(mockMessageRouter.setDashboardCallback).toHaveBeenCalledWith(undefined);
        });
    });

    describe('Connection Management', () => {
        it('should get connections for backward compatibility', () => {
            const mockConnection1 = { ws: new MockWebSocket('ws://localhost:7777') };
            const mockConnection2 = { ws: new MockWebSocket('ws://localhost:7777') };
            const mockConnections = new Map([
                ['client-1', mockConnection1],
                ['client-2', mockConnection2]
            ]);

            mockConnectionPool.getAllConnections.mockReturnValue(mockConnections as any);

            const connections = orchestrationServer.getConnections();

            expect(connections.size).toBe(2);
            expect(connections.get('client-1')).toBeDefined();
            expect(connections.get('client-2')).toBeDefined();
        });

        it('should get connection summaries', () => {
            const mockSummaries = [
                {
                    clientId: 'client-1',
                    isAgent: false,
                    connectedAt: '2023-01-01T00:00:00Z',
                    lastHeartbeat: '2023-01-01T00:01:00Z',
                    messageCount: 5,
                    userAgent: 'test-client'
                }
            ];

            mockConnectionPool.getConnectionSummaries.mockReturnValue(mockSummaries);

            const summaries = orchestrationServer.getConnectionSummaries();

            expect(summaries).toEqual(mockSummaries);
        });

        it('should get message history', async () => {
            const mockHistory = [
                { id: 'msg-1', type: 'request' },
                { id: 'msg-2', type: 'response' }
            ];

            mockMessagePersistence.load.mockResolvedValue(mockHistory);

            const history = await orchestrationServer.getMessageHistory();

            expect(history).toEqual(mockHistory);
            expect(mockMessagePersistence.load).toHaveBeenCalledWith(0, 100);
        });
    });

    describe('Backward Compatibility Methods', () => {
        it('should register client', () => {
            orchestrationServer.registerClient('client-1', 'agent');

            expect(mockLoggingService.debug).toHaveBeenCalledWith('Client registered: client-1 (agent)');
        });

        it('should send message to specific client', () => {
            const message: OrchestratorMessage = {
                id: 'msg-1',
                type: MessageType.AGENT_QUERY,
                from: 'server',
                to: 'client-1',
                payload: { action: 'test' },
                timestamp: new Date().toISOString()
            };

            mockConnectionPool.sendToClient.mockReturnValue(true);

            const result = orchestrationServer.sendToClient('client-1', message);

            expect(result).toBe(true);
            expect(mockConnectionPool.sendToClient).toHaveBeenCalledWith('client-1', message);
        });

        it('should broadcast message to all clients', () => {
            const message: OrchestratorMessage = {
                id: 'msg-1',
                type: MessageType.BROADCAST,
                from: 'server',
                to: 'all',
                payload: { action: 'announcement' },
                timestamp: new Date().toISOString()
            };

            orchestrationServer.broadcast(message, ['client-1']);

            expect(mockConnectionPool.broadcast).toHaveBeenCalledWith(message, ['client-1']);
        });

        it('should track outbound bytes when sending to client', () => {
            const message: OrchestratorMessage = {
                id: 'msg-1',
                type: MessageType.AGENT_QUERY,
                from: 'server',
                to: 'client-1',
                payload: { action: 'test' },
                timestamp: new Date().toISOString()
            };

            mockConnectionPool.sendToClient.mockReturnValue(true);

            orchestrationServer.sendToClient('client-1', message);

            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('bytes_out_total', {
                messageType: 'agent_query',
                bytes: expect.any(String)
            });
        });

        it('should track outbound bytes when broadcasting', () => {
            const message: OrchestratorMessage = {
                id: 'msg-1',
                type: MessageType.BROADCAST,
                from: 'server',
                to: 'all',
                payload: { action: 'announcement' },
                timestamp: new Date().toISOString()
            };

            orchestrationServer.broadcast(message);

            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('bytes_out_total', {
                messageType: 'broadcast',
                bytes: expect.any(String)
            });
        });
    });

    describe('Server Status', () => {
        it('should return server status', () => {
            mockConnectionPool.getAllConnections.mockReturnValue(
                new Map([
                    ['client-1', {} as any],
                    ['client-2', {} as any]
                ])
            );

            const status = orchestrationServer.getStatus();

            expect(status).toEqual({
                isRunning: false,
                port: 0,
                connectionCount: 2
            });
        });
    });

    describe('Message Replay', () => {
        it('should replay messages to client', async () => {
            const replayToClient = (orchestrationServer as any).replayToClient.bind(orchestrationServer);

            await replayToClient('logical-client-1');

            expect(mockMessageRouter.replayToClient).toHaveBeenCalledWith('logical-client-1', {
                timeRange: {
                    from: expect.any(Date),
                    to: expect.any(Date)
                },
                limit: 100
            });
        });

        it('should handle replay errors', async () => {
            mockMessageRouter.replayToClient.mockRejectedValue(new Error('Replay failed'));

            const replayToClient = (orchestrationServer as any).replayToClient.bind(orchestrationServer);

            await replayToClient('logical-client-1');

            expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
                expect.any(Error),
                'Failed to replay messages to logical-client-1'
            );
        });
    });

    describe('Periodic Metrics Collection', () => {
        beforeEach(() => {
            // Mock the server as running
            (orchestrationServer as any).isRunning = true;
            (orchestrationServer as any).actualPort = 7777;
        });

        it('should collect periodic metrics and calculate messages per second', () => {
            // Add some message timestamps to simulate recent activity
            const now = Date.now();
            const msgTimestamps = (orchestrationServer as any).msgTimestamps;
            msgTimestamps.push(now - 10000); // 10 seconds ago
            msgTimestamps.push(now - 5000); // 5 seconds ago
            msgTimestamps.push(now - 2000); // 2 seconds ago

            // Mock connection pool
            mockConnectionPool.getAllConnections.mockReturnValue(
                new Map([
                    ['client-1', {} as any],
                    ['client-2', {} as any]
                ])
            );

            // Call collectPeriodicMetrics directly
            const collectPeriodicMetrics = (orchestrationServer as any).collectPeriodicMetrics.bind(
                orchestrationServer
            );
            collectPeriodicMetrics();

            expect(mockMetricsService.setGauge).toHaveBeenCalledWith('concurrent_connections', 2);
            expect(mockMetricsService.setGauge).toHaveBeenCalledWith('concurrent_connections_peak', 2);
            expect(mockMetricsService.setGauge).toHaveBeenCalledWith('messages_per_second', expect.any(Number));
            expect(mockMetricsService.setGauge).toHaveBeenCalledWith('bytes_in_total', expect.any(Number));
            expect(mockMetricsService.setGauge).toHaveBeenCalledWith('bytes_out_total', expect.any(Number));
            expect(mockMetricsService.setGauge).toHaveBeenCalledWith('bytes_in_rate', expect.any(Number));
        });

        it('should update peak concurrent connections', () => {
            // Set initial peak
            (orchestrationServer as any).concurrentConnectionsPeak = 1;

            mockConnectionPool.getAllConnections.mockReturnValue(
                new Map([
                    ['client-1', {} as any],
                    ['client-2', {} as any],
                    ['client-3', {} as any]
                ])
            );

            const collectPeriodicMetrics = (orchestrationServer as any).collectPeriodicMetrics.bind(
                orchestrationServer
            );
            collectPeriodicMetrics();

            expect(mockMetricsService.setGauge).toHaveBeenCalledWith('concurrent_connections_peak', 3);
        });

        it('should handle empty message timestamps', () => {
            mockConnectionPool.getAllConnections.mockReturnValue(new Map());

            const collectPeriodicMetrics = (orchestrationServer as any).collectPeriodicMetrics.bind(
                orchestrationServer
            );
            collectPeriodicMetrics();

            expect(mockMetricsService.setGauge).toHaveBeenCalledWith('messages_per_second', 0);
        });
    });

    describe('Disposal', () => {
        it('should dispose properly', async () => {
            await orchestrationServer.dispose();

            expect(mockLoggingService.debug).toHaveBeenCalledWith('OrchestrationServer disposed');
        });
    });
});
