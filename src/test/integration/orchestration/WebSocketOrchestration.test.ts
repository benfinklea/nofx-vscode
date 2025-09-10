import { OrchestrationServer } from '../../../orchestration/OrchestrationServer';
import { MessageType, OrchestratorMessage } from '../../../orchestration/MessageProtocol';
import { Container } from '../../../services/Container';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { MetricsService } from '../../../services/MetricsService';
import { MessageRouter } from '../../../services/MessageRouter';
import { MessagePersistenceService } from '../../../services/MessagePersistenceService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { MessageValidator } from '../../../services/MessageValidator';
import { ConnectionPoolService } from '../../../services/ConnectionPoolService';
import { createMockConfigurationService } from '../../helpers/mockFactories';
import * as vscode from 'vscode';
import { getAppStateStore } from '../../../state/AppStateStore';
import * as selectors from '../../../state/selectors';
import * as actions from '../../../state/actions';
// Mock WebSocket to avoid real network connections
jest.mock('ws', () => {
    const EventEmitter = require('events');

    class MockWebSocket extends EventEmitter {
        readyState = 1; // OPEN
        close = jest.fn();
        send = jest.fn(data => {
            // Simulate message echo for testing
            setTimeout(() => {
                this.emit('message', data);
            }, 0);
        });

        constructor(url: string) {
            super();
            setTimeout(() => {
                this.emit('open');
            }, 0);
        }
    }

    class MockWebSocketServer extends EventEmitter {
        clients = new Set();
        close = jest.fn((callback?: () => void) => {
            if (callback) callback();
        });

        constructor(options: any) {
            super();
            setTimeout(() => {
                this.emit('listening');
            }, 0);
        }

        handleUpgrade = jest.fn();
    }

    MockWebSocket.OPEN = 1;
    MockWebSocket.CLOSED = 3;

    return {
        default: MockWebSocket,
        WebSocket: MockWebSocket,
        WebSocketServer: MockWebSocketServer
    };
});

// Import WebSocket after mocking
const WebSocket = require('ws').WebSocket || require('ws').default;

describe('WebSocket Orchestration Integration', () => {
    let server: OrchestrationServer;
    let container: Container;
    let conductorClient: any;
    let agentClient1: any;
    let agentClient2: any;
    const TEST_PORT = 17777; // Use different port to avoid conflicts

    beforeAll(async () => {
        // Setup dependency injection container
        container = Container.getInstance();

        // Create mock output channel
        const mockChannel = {
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn(),
            hide: jest.fn(),
            show: jest.fn(),
            name: 'Test Channel'
        } as any;

        // Create mock context
        const mockContext = {
            subscriptions: [],
            extensionPath: '/test',
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([])
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([])
            }
        } as any;

        // Register services
        container.register(Symbol.for('IEventBus'), () => new EventBus(), 'singleton');
        container.register(Symbol.for('IConfigurationService'), () => createMockConfigurationService(), 'singleton');
        container.register(
            Symbol.for('ILoggingService'),
            () => ({
                trace: jest.fn(),
                debug: jest.fn(),
                agents: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                isLevelEnabled: jest.fn().mockReturnValue(true),
                getChannel: jest.fn().mockReturnValue(mockChannel),
                time: jest.fn(),
                timeEnd: jest.fn(),
                dispose: jest.fn()
            }),
            'singleton'
        );
        container.register(
            Symbol.for('IMetricsService'),
            c =>
                new MetricsService(
                    c.resolve(Symbol.for('IConfigurationService')),
                    c.resolve(Symbol.for('ILoggingService'))
                ),
            'singleton'
        );
        container.register(
            Symbol.for('IMessageValidator'),
            c => new MessageValidator(c.resolve(Symbol.for('ILoggingService')), c.resolve(Symbol.for('IEventBus'))),
            'singleton'
        );
        // Register missing services for ConnectionPoolService
        container.register(
            Symbol.for('IErrorHandler'),
            () =>
                ({
                    handleError: jest.fn()
                }) as any,
            'singleton'
        );

        container.register(
            Symbol.for('IConnectionPoolService'),
            c =>
                new ConnectionPoolService(
                    c.resolve(Symbol.for('ILoggingService')),
                    c.resolve(Symbol.for('IEventBus')),
                    c.resolve(Symbol.for('IErrorHandler')),
                    c.resolve(Symbol.for('IConfigurationService')),
                    c.resolve(Symbol.for('IMetricsService'))
                ),
            'singleton'
        );
        container.register(
            Symbol.for('IMessageRouter'),
            c =>
                new MessageRouter(
                    c.resolve(Symbol.for('IConnectionPoolService')),
                    c.resolve(Symbol.for('IMessageValidator')),
                    c.resolve(Symbol.for('IMetricsService')),
                    c.resolve(Symbol.for('ILoggingService')),
                    c.resolve(Symbol.for('IEventBus'))
                ),
            'singleton'
        );
        container.register(
            Symbol.for('IMessagePersistenceService'),
            c =>
                new MessagePersistenceService(
                    c.resolve(Symbol.for('ILoggingService')),
                    c.resolve(Symbol.for('IConfigurationService')),
                    c.resolve(Symbol.for('IEventBus')),
                    '/mock/workspace'
                ),
            'singleton'
        );

        // Create and start orchestration server
        server = new OrchestrationServer(
            TEST_PORT,
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IEventBus')),
            container.resolve(Symbol.for('IErrorHandler')),
            container.resolve(Symbol.for('IConnectionPoolService')),
            container.resolve(Symbol.for('IMessageRouter')),
            container.resolve(Symbol.for('IMessageValidator')),
            container.resolve(Symbol.for('IMessagePersistenceService')),
            container.resolve(Symbol.for('IMetricsService'))
        );

        try {
            await server.start(); // start() takes no arguments, port is set in constructor
        } catch (error) {
            console.warn('Failed to start orchestration server:', error);
        }
    });

    afterAll(async () => {
        // Close all connections
        if (conductorClient?.readyState === WebSocket.OPEN) {
            conductorClient?.close();
        }
        if (agentClient1?.readyState === WebSocket.OPEN) {
            agentClient1?.close();
        }
        if (agentClient2?.readyState === WebSocket.OPEN) {
            agentClient2?.close();
        }

        // Stop server
        await server.stop();

        // Cleanup container
        await container.dispose();
        Container['instance'] = null;
    });

    beforeEach(() => {
        // Reset clients for each test
        conductorClient = null;
        agentClient1 = null;
        agentClient2 = null;
    });

    afterEach(() => {
        // Clean up clients after each test
        if (conductorClient?.readyState === WebSocket.OPEN) {
            conductorClient?.close();
        }
        if (agentClient1?.readyState === WebSocket.OPEN) {
            agentClient1?.close();
        }
        if (agentClient2?.readyState === WebSocket.OPEN) {
            agentClient2?.close();
        }
    });

    describe('Connection Management', () => {
        it('should accept conductor connection', done => {
            conductorClient = new WebSocket(`ws://localhost:${TEST_PORT}`);

            conductorClient?.on('open', () => {
                // Send conductor registration
                const message: OrchestratorMessage = {
                    id: 'test-1',
                    type: MessageType.CONNECTION_ESTABLISHED,
                    from: 'conductor',
                    to: 'orchestrator',
                    timestamp: new Date().toISOString(),
                    payload: {
                        version: '1.0.0',
                        capabilities: ['spawn', 'assign', 'terminate']
                    }
                };

                conductorClient?.send(JSON.stringify(message));
            });

            conductorClient?.on('message', data => {
                const response = JSON.parse(data.toString());
                if (response.type === MessageType.CONNECTION_ESTABLISHED) {
                    expect(response.from).toBe('orchestrator');
                    expect(response.to).toBe('conductor');
                    done();
                }
            });

            conductorClient?.on('error', done);
        });

        it('should accept agent connection', done => {
            agentClient1 = new WebSocket(`ws://localhost:${TEST_PORT}`);

            agentClient1?.on('open', () => {
                // Send agent registration
                const message: OrchestratorMessage = {
                    id: 'test-2',
                    type: MessageType.AGENT_READY,
                    from: 'agent-1',
                    to: 'orchestrator',
                    timestamp: new Date().toISOString(),
                    payload: {
                        agentId: 'agent-1',
                        role: 'frontend-specialist',
                        capabilities: ['react', 'vue', 'css']
                    }
                };

                agentClient1?.send(JSON.stringify(message));
            });

            agentClient1?.on('message', data => {
                const response = JSON.parse(data.toString());
                if (response.type === MessageType.AGENT_READY) {
                    expect(response.payload.agentId).toBe('agent-1');
                    done();
                }
            });

            agentClient1?.on('error', done);
        });
    });

    describe('Message Routing', () => {
        beforeEach(done => {
            // Setup conductor and agents for routing tests
            let connectionsReady = 0;
            const checkReady = () => {
                connectionsReady++;
                if (connectionsReady === 3) {
                    done();
                }
            };

            // Connect conductor
            conductorClient = new WebSocket(`ws://localhost:${TEST_PORT}`);
            conductorClient?.on('open', () => {
                conductorClient?.send(
                    JSON.stringify({
                        id: 'setup-1',
                        type: MessageType.CONNECTION_ESTABLISHED,
                        from: 'conductor',
                        to: 'orchestrator',
                        timestamp: new Date().toISOString(),
                        payload: { version: '1.0.0' }
                    })
                );
            });
            conductorClient?.on('message', data => {
                const msg = JSON.parse(data.toString());
                if (msg.type === MessageType.CONNECTION_ESTABLISHED) {
                    checkReady();
                }
            });

            // Connect agent 1
            agentClient1 = new WebSocket(`ws://localhost:${TEST_PORT}`);
            agentClient1?.on('open', () => {
                agentClient1?.send(
                    JSON.stringify({
                        id: 'setup-2',
                        type: MessageType.AGENT_READY,
                        from: 'agent-1',
                        to: 'orchestrator',
                        timestamp: new Date().toISOString(),
                        payload: { agentId: 'agent-1', role: 'frontend' }
                    })
                );
            });
            agentClient1?.on('message', data => {
                const msg = JSON.parse(data.toString());
                if (msg.type === MessageType.AGENT_READY) {
                    checkReady();
                }
            });

            // Connect agent 2
            agentClient2 = new WebSocket(`ws://localhost:${TEST_PORT}`);
            agentClient2?.on('open', () => {
                agentClient2?.send(
                    JSON.stringify({
                        id: 'setup-3',
                        type: MessageType.AGENT_READY,
                        from: 'agent-2',
                        to: 'orchestrator',
                        timestamp: new Date().toISOString(),
                        payload: { agentId: 'agent-2', role: 'backend' }
                    })
                );
            });
            agentClient2?.on('message', data => {
                const msg = JSON.parse(data.toString());
                if (msg.type === MessageType.AGENT_READY) {
                    checkReady();
                }
            });
        });

        it('should route task assignment from conductor to agent', done => {
            // Setup agent listener
            agentClient1?.on('message', data => {
                const msg = JSON.parse(data.toString());
                if (msg.type === MessageType.ASSIGN_TASK) {
                    expect(msg.from).toBe('conductor');
                    expect(msg.to).toBe('agent-1');
                    expect(msg.payload.task).toBe('Create login form');
                    done();
                }
            });

            // Send task assignment from conductor
            conductorClient?.send(
                JSON.stringify({
                    id: 'task-1',
                    type: MessageType.ASSIGN_TASK,
                    from: 'conductor',
                    to: 'agent-1',
                    timestamp: new Date().toISOString(),
                    payload: {
                        taskId: 'task-001',
                        task: 'Create login form',
                        priority: 'high'
                    }
                })
            );
        });
    });
});
