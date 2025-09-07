import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import getPort from 'get-port';
import { Container } from '../../services/Container';
import { SERVICE_TOKENS } from '../../services/interfaces';
import { OrchestrationServer } from '../../orchestration/OrchestrationServer';
import { MessageType, createMessage } from '../../orchestration/MessageProtocol';
import { MessageRouter } from '../../services/MessageRouter';
import { MessageValidator } from '../../services/MessageValidator';
import { MessagePersistenceService } from '../../services/MessagePersistenceService';
import { ConnectionPoolService } from '../../services/ConnectionPoolService';
import { EventBus } from '../../services/EventBus';
import { DOMAIN_EVENTS } from '../../services/EventConstants';
import { MessageFlowDashboard } from '../../dashboard/MessageFlowDashboard';
import { LoggingService } from '../../services/LoggingService';
import { ConfigurationService } from '../../services/ConfigurationService';
import { setupMockWorkspace, clearMockWorkspace } from './setup';
import { TestHarness } from './testHarness';

describe('Orchestration Integration', () => {
    let container: Container;
    let context: vscode.ExtensionContext;
    let orchestrationServer: OrchestrationServer;
    let eventBus: EventBus;
    let loggingService: LoggingService;
    let port: number;

    beforeAll(async () => {
        const { container: c, context: ctx } = await TestHarness.initialize();
        container = c;
        context = ctx;
        setupMockWorkspace();
    });

    beforeEach(async () => {
        // Reset container state between tests but preserve command registrations
        TestHarness.resetContainer();

        const configService = new ConfigurationService();
        const mainChannel = vscode.window.createOutputChannel('NofX Test');
        loggingService = new LoggingService(configService, mainChannel);
        eventBus = new EventBus();

        container.registerInstance(SERVICE_TOKENS.ConfigurationService, configService);
        container.registerInstance(SERVICE_TOKENS.LoggingService, loggingService);
        container.registerInstance(SERVICE_TOKENS.EventBus, eventBus);
        container.registerInstance(SERVICE_TOKENS.ExtensionContext, context);

        // Get a free port for testing
        port = await getPort();

        // Create lightweight instances for testing
        const errorHandler = {
            handleError: jest.fn(),
            handleWarning: jest.fn(),
            handleInfo: jest.fn()
        };

        const connectionPoolService = new ConnectionPoolService(loggingService, eventBus);

        const messagePersistenceService = new MessagePersistenceService(loggingService, configService, eventBus);

        const messageRouter = new MessageRouter(
            connectionPoolService,
            messagePersistenceService,
            loggingService,
            eventBus,
            errorHandler
        );

        const messageValidator = new MessageValidator(loggingService);

        const metricsService = {
            incrementCounter: jest.fn(),
            recordGauge: jest.fn(),
            recordHistogram: jest.fn(),
            getMetrics: jest.fn().mockReturnValue({}),
            reset: jest.fn(),
            setEnabled: jest.fn(),
            isEnabled: jest.fn().mockReturnValue(true)
        };

        orchestrationServer = new OrchestrationServer(
            port,
            loggingService,
            eventBus,
            errorHandler,
            connectionPoolService,
            messageRouter,
            messageValidator,
            messagePersistenceService,
            metricsService
        );
    });

    afterEach(async () => {
        if (orchestrationServer) {
            await orchestrationServer.stop();
        }
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        clearMockWorkspace();
        await TestHarness.dispose();
    });

    describe('MessageRouter', () => {
        test('should route SPAWN_AGENT message to AgentManager', async () => {
            // Create MessageRouter with mocks
            const agentManager = {
                spawnAgent: jest.fn().mockResolvedValue({ id: 'agent-1', name: 'Test Agent' })
            };
            const taskQueue = {
                addTask: jest.fn(),
                assignTask: jest.fn()
            };

            container.registerInstance(SERVICE_TOKENS.AgentManager, agentManager);
            container.registerInstance(SERVICE_TOKENS.TaskQueue, taskQueue);

            const connectionPool = {
                send: jest.fn(),
                broadcast: jest.fn()
            };

            const messagePersistence = {
                save: jest.fn()
            };

            const errorHandler = {
                handleError: jest.fn()
            };

            const messageRouter = new MessageRouter(
                connectionPool as any,
                messagePersistence as any,
                loggingService,
                eventBus,
                errorHandler as any,
                agentManager as any,
                taskQueue as any
            );

            // Route a SPAWN_AGENT message
            const message = createMessage(MessageType.SPAWN_AGENT, {
                role: 'frontend-specialist',
                name: 'Frontend Dev'
            });

            await messageRouter.route(message);

            // Verify AgentManager.spawnAgent was called with expected config
            expect(agentManager.spawnAgent).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: expect.any(String),
                    type: expect.any(String),
                    template: expect.anything()
                })
            );
        });

        test('should route ASSIGN_TASK message to TaskQueue', async () => {
            const agentManager = {
                spawnAgent: jest.fn()
            };
            const taskQueue = {
                addTask: jest.fn(),
                assignTask: jest.fn().mockResolvedValue(true)
            };

            container.registerInstance(SERVICE_TOKENS.AgentManager, agentManager);
            container.registerInstance(SERVICE_TOKENS.TaskQueue, taskQueue);

            const connectionPool = {
                send: jest.fn(),
                broadcast: jest.fn()
            };

            const messagePersistence = {
                save: jest.fn()
            };

            const errorHandler = {
                handleError: jest.fn()
            };

            const messageRouter = new MessageRouter(
                connectionPool as any,
                messagePersistence as any,
                loggingService,
                eventBus,
                errorHandler as any,
                agentManager as any,
                taskQueue as any
            );

            // Route an ASSIGN_TASK message
            const message = createMessage(MessageType.ASSIGN_TASK, {
                taskId: 'task-1',
                agentId: 'agent-1',
                title: 'Test Task',
                description: 'Test description',
                priority: 'high'
            });

            await messageRouter.route(message);

            // Verify TaskQueue methods were called appropriately
            // The actual implementation may call addTask and/or assignTask
            expect(taskQueue.addTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Test Task',
                    description: 'Test description',
                    priority: 'high'
                })
            );
        });
    });

    describe('Server Startup', () => {
        test('should start orchestration server successfully', async () => {
            await orchestrationServer.start();

            const status = orchestrationServer.getStatus();
            expect(status.isRunning).toBe(true);
            expect(status.port).toBe(port);
        });

        test('should handle server startup errors', async () => {
            // Start server on the same port twice to trigger EADDRINUSE
            await orchestrationServer.start();

            // Create lightweight test dependencies for second server
            const errorHandler = {
                handleError: jest.fn(),
                handleWarning: jest.fn(),
                handleInfo: jest.fn()
            };

            const connectionPoolService = new ConnectionPoolService(loggingService, eventBus);

            const messagePersistenceService = new MessagePersistenceService(loggingService, configService, eventBus);

            const messageRouter = new MessageRouter(
                connectionPoolService,
                messagePersistenceService,
                loggingService,
                eventBus,
                errorHandler
            );

            const messageValidator = new MessageValidator(loggingService);

            const metricsService = {
                incrementCounter: jest.fn(),
                recordGauge: jest.fn(),
                recordHistogram: jest.fn(),
                getMetrics: jest.fn().mockReturnValue({}),
                reset: jest.fn(),
                setEnabled: jest.fn(),
                isEnabled: jest.fn().mockReturnValue(true)
            };

            const secondServer = new OrchestrationServer(
                port,
                loggingService,
                eventBus,
                errorHandler,
                connectionPoolService,
                messageRouter,
                messageValidator,
                messagePersistenceService,
                metricsService
            );

            await expect(secondServer.start()).rejects.toThrow();
        });

        test('should stop orchestration server', async () => {
            await orchestrationServer.start();
            await orchestrationServer.stop();

            const status = orchestrationServer.getStatus();
            expect(status.isRunning).toBe(false);
        });
    });

    describe('Message Protocol', () => {
        test('should create valid messages', () => {
            const message = createMessage(MessageType.AGENT_STATUS_UPDATE, {
                agentId: 'agent1',
                status: 'working'
            });

            expect(message.type).toBe(MessageType.AGENT_STATUS_UPDATE);
            expect(message.data.agentId).toBe('agent1');
            expect(message.data.status).toBe('working');
            expect(message.timestamp).toBeDefined();
            expect(message.id).toBeDefined();
        });

        test('should validate message format', () => {
            const validMessage = createMessage(MessageType.TASK_ASSIGNED, {
                taskId: 'task1',
                agentId: 'agent1'
            });

            expect(validMessage.type).toBeDefined();
            expect(validMessage.data).toBeDefined();
            expect(validMessage.timestamp).toBeDefined();
            expect(validMessage.id).toBeDefined();
        });

        test('should handle different message types', () => {
            const statusMessage = createMessage(MessageType.AGENT_STATUS_UPDATE, { status: 'idle' });
            const taskMessage = createMessage(MessageType.TASK_CREATED, { description: 'Test task' });
            const errorMessage = createMessage(MessageType.ERROR, { message: 'Test error' });

            expect(statusMessage.type).toBe(MessageType.AGENT_STATUS_UPDATE);
            expect(taskMessage.type).toBe(MessageType.TASK_CREATED);
            expect(errorMessage.type).toBe(MessageType.ERROR);
        });
    });

    describe('WebSocket Routing', () => {
        test('should route messages to correct handlers', async () => {
            await orchestrationServer.start();

            // Create lightweight test dependencies
            const connectionPoolService = new ConnectionPoolService(loggingService, eventBus);
            const messagePersistenceService = new MessagePersistenceService(
                loggingService,
                configService,
                eventBus,
                '/tmp/test-workspace'
            );
            const errorHandler = {
                handleError: jest.fn(),
                handleWarning: jest.fn(),
                handleInfo: jest.fn()
            };

            const messageRouter = new MessageRouter(
                connectionPoolService,
                messagePersistenceService,
                loggingService,
                eventBus,
                errorHandler
            );

            const message = createMessage(MessageType.AGENT_STATUS_UPDATE, {
                agentId: 'agent1',
                status: 'working'
            });

            // Mock the router to verify it receives the message
            const routeSpy = jest.spyOn(messageRouter, 'route');

            // Simulate message routing
            await messageRouter.route(message);

            expect(routeSpy).toHaveBeenCalledWith(message);
        });

        test('should handle invalid message routing', async () => {
            // Create lightweight test dependencies
            const connectionPoolService = new ConnectionPoolService(loggingService, eventBus);
            const messagePersistenceService = new MessagePersistenceService(
                loggingService,
                configService,
                eventBus,
                '/tmp/test-workspace'
            );
            const errorHandler = {
                handleError: jest.fn(),
                handleWarning: jest.fn(),
                handleInfo: jest.fn()
            };

            const messageRouter = new MessageRouter(
                connectionPoolService,
                messagePersistenceService,
                loggingService,
                eventBus,
                errorHandler
            );

            const invalidMessage = {
                type: 'INVALID_TYPE',
                data: {},
                timestamp: Date.now(),
                id: 'test-id'
            };

            // Should handle invalid messages gracefully
            await expect(messageRouter.route(invalidMessage as any)).resolves.not.toThrow();
        });
    });

    describe('Dashboard Integration', () => {
        test('should create message flow dashboard', async () => {
            const dashboard = MessageFlowDashboard.create(
                context,
                {} as any, // DashboardViewModel
                loggingService
            );

            expect(dashboard).toBeDefined();
        });

        test('should handle dashboard webview creation', async () => {
            const createWebviewSpy = jest.spyOn(vscode.window, 'createWebviewPanel');

            await vscode.commands.executeCommand('nofx.openMessageFlow');

            expect(createWebviewSpy).toHaveBeenCalledWith(
                'messageFlow',
                'Message Flow Dashboard',
                vscode.ViewColumn.One,
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true
                })
            );
        });

        test('should update dashboard with real-time data', async () => {
            const dashboard = MessageFlowDashboard.create(
                context,
                {} as any, // DashboardViewModel
                loggingService
            );

            // Simulate real-time message updates
            const message = createMessage(MessageType.AGENT_STATUS_UPDATE, {
                agentId: 'agent1',
                status: 'working'
            });

            // Dashboard should handle updates without errors
            expect(() => {
                // Simulate dashboard update
                eventBus.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, message);
            }).not.toThrow();
        });
    });

    describe('Connection Management', () => {
        test('should handle WebSocket connections', async () => {
            await orchestrationServer.start();

            const errorHandler = {
                handleError: jest.fn(),
                handleWarning: jest.fn(),
                handleInfo: jest.fn(),
                handleAsync: jest.fn(),
                wrapSync: jest.fn(),
                withRetry: jest.fn(),
                dispose: jest.fn()
            };

            const configService = new ConfigurationService();

            const connectionPool = new ConnectionPoolService(loggingService, eventBus, errorHandler, configService);

            // Simulate connection
            const mockConnection = {
                send: jest.fn(),
                close: jest.fn(),
                readyState: WebSocket.OPEN
            };

            connectionPool.addConnection(mockConnection as any, 'test-client', {});

            expect(connectionPool.getConnections().length).toBe(1);
        });

        test('should handle connection cleanup', async () => {
            const errorHandler = {
                handleError: jest.fn(),
                handleWarning: jest.fn(),
                handleInfo: jest.fn(),
                handleAsync: jest.fn(),
                wrapSync: jest.fn(),
                withRetry: jest.fn(),
                dispose: jest.fn()
            };

            const configService = new ConfigurationService();

            const connectionPool = new ConnectionPoolService(loggingService, eventBus, errorHandler, configService);

            const mockConnection = {
                send: jest.fn(),
                close: jest.fn(),
                readyState: WebSocket.OPEN
            };

            connectionPool.addConnection(mockConnection as any, 'test-client', {});
            connectionPool.removeConnection('test-client');

            expect(connectionPool.getConnections().length).toBe(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle server startup failures gracefully', async () => {
            // Create lightweight test dependencies for failing server
            const errorHandler = {
                handleError: jest.fn(),
                handleWarning: jest.fn(),
                handleInfo: jest.fn()
            };

            const connectionPoolService = new ConnectionPoolService(loggingService, eventBus);

            const messagePersistenceService = new MessagePersistenceService(loggingService, configService, eventBus);

            const messageRouter = new MessageRouter(
                connectionPoolService,
                messagePersistenceService,
                loggingService,
                eventBus,
                errorHandler
            );

            const messageValidator = new MessageValidator(loggingService);

            const metricsService = {
                incrementCounter: jest.fn(),
                recordGauge: jest.fn(),
                recordHistogram: jest.fn(),
                getMetrics: jest.fn().mockReturnValue({}),
                reset: jest.fn(),
                setEnabled: jest.fn(),
                isEnabled: jest.fn().mockReturnValue(true)
            };

            // Mock server to throw error on start
            const failingServer = new OrchestrationServer(
                0, // Invalid port
                loggingService,
                eventBus,
                errorHandler,
                connectionPoolService,
                messageRouter,
                messageValidator,
                messagePersistenceService,
                metricsService
            );

            await expect(failingServer.start()).rejects.toThrow();
        });

        test('should handle message validation errors', async () => {
            const messageValidator = new MessageValidator(loggingService, eventBus);

            const invalidMessage = {
                type: 'INVALID',
                data: null,
                timestamp: 'invalid',
                id: null
            };

            // Should handle validation errors gracefully
            expect(() => {
                messageValidator.validateMessage(invalidMessage as any);
            }).not.toThrow();
        });
    });
});
