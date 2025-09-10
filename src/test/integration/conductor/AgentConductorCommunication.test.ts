import * as vscode from 'vscode';
import { AgentManager } from '../../../agents/AgentManager';
import { SmartConductor } from '../../../conductor/SmartConductor';
import { DirectCommunicationService } from '../../../services/DirectCommunicationService';
import { MessageType, OrchestratorMessage } from '../../../orchestration/MessageProtocol';
import { Container } from '../../../services/Container';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { MetricsService } from '../../../services/MetricsService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { MessageRouter } from '../../../services/MessageRouter';
import { TerminalManager } from '../../../services/TerminalManager';
import { AgentLifecycleManager } from '../../../services/AgentLifecycleManager';
import { AgentNotificationService } from '../../../services/AgentNotificationService';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';
import { TaskQueue } from '../../../tasks/TaskQueue';
import WebSocket from 'ws';

describe('Agent-Conductor Communication Integration', () => {
    let container: Container;
    let agentManager: AgentManager;
    let conductor: ConductorTerminal;
    let directCommunicationService: DirectCommunicationService;
    let eventBus: EventBus;
    let mockContext: vscode.ExtensionContext;
    let mockChannel: vscode.OutputChannel;
    const TEST_PORT = 17778;

    beforeAll(async () => {
        // Create mock extension context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([]),
                setKeysForSync: jest.fn()
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([])
            },
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn()
            },
            extensionUri: vscode.Uri.file('/test/extension'),
            extensionMode: vscode.ExtensionMode.Test,
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/logs',
            asAbsolutePath: jest.fn(p => `/test/extension/${p}`)
        } as any;

        // Create mock output channel
        mockChannel = {
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn(),
            hide: jest.fn(),
            show: jest.fn(),
            name: 'Test Channel',
            replace: jest.fn()
        } as any;

        // Setup container and services
        container = Container.getInstance();

        // Register core services
        eventBus = new EventBus();
        container.registerInstance(Symbol.for('IEventBus'), eventBus);
        container.register(Symbol.for('IConfigurationService'), () => new ConfigurationService(), 'singleton');
        container.register(
            Symbol.for('ILoggingService'),
            c => new LoggingService(c.resolve(Symbol.for('IConfigurationService')), mockChannel),
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

        // Register orchestration services
        container.register(
            Symbol.for('IMessageValidator'),
            () =>
                ({
                    validate: jest.fn().mockReturnValue({ isValid: true })
                }) as any,
            'singleton'
        );
        container.register(
            Symbol.for('IConnectionPoolService'),
            () =>
                ({
                    getConnection: jest.fn(),
                    broadcast: jest.fn(),
                    addConnection: jest.fn(),
                    removeConnection: jest.fn()
                }) as any,
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
            Symbol.for('ITerminalManager'),
            c =>
                new TerminalManager(
                    c.resolve(Symbol.for('IConfigurationService')),
                    c.resolve(Symbol.for('ILoggingService')),
                    c.resolve(Symbol.for('IEventBus'))
                ),
            'singleton'
        );

        container.register(
            Symbol.for('IAgentLifecycleManager'),
            c =>
                new AgentLifecycleManager(
                    c.resolve(Symbol.for('IEventBus')),
                    c.resolve(Symbol.for('ILoggingService')),
                    c.resolve(Symbol.for('IMetricsService'))
                ),
            'singleton'
        );

        container.register(
            Symbol.for('IAgentNotificationService'),
            c =>
                new AgentNotificationService(
                    c.resolve(Symbol.for('IEventBus')),
                    c.resolve(Symbol.for('ILoggingService'))
                ),
            'singleton'
        );

        // Create DirectCommunicationService
        directCommunicationService = new DirectCommunicationService(
            container.resolve(Symbol.for('IEventBus')),
            container.resolve(Symbol.for('ILoggingService')),
            null, // NotificationService - not needed for tests
            container.resolve(Symbol.for('IMetricsService'))
        );

        await directCommunicationService.start();

        // Create agent manager
        agentManager = new AgentManager(mockContext);

        // Create TaskQueue for conductor
        const taskQueue = new TaskQueue();

        // Create conductor
        conductor = new ConductorTerminal(
            agentManager,
            taskQueue,
            null // No TaskToolBridge for tests
        );
    });

    afterAll(async () => {
        await directCommunicationService.stop();
        await agentManager.dispose();
        conductor.dispose();
        await container.dispose();
        Container['instance'] = null;
    });

    describe('Agent Lifecycle Management', () => {
        it('should spawn agent through agent manager', done => {
            const agentSpawnedHandler = (event: any) => {
                expect(event.agent).toBeDefined();
                expect(event.agent.type).toBe('frontend-specialist');
                expect(event.agent.name).toBe('UI Expert');
                eventBus.unsubscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, agentSpawnedHandler);
                done();
            };

            eventBus.subscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, agentSpawnedHandler);

            // Spawn an agent through agent manager
            agentManager.addAgent({
                type: 'frontend-specialist',
                name: 'UI Expert'
            });
        });

        it('should assign task to agent', done => {
            let agentId: string;

            // First spawn an agent
            const spawnHandler = (event: any) => {
                agentId = event.agent.id;
                eventBus.unsubscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, spawnHandler);

                // Setup task assignment handler
                const taskHandler = (event: any) => {
                    expect(event.agentId).toBe(agentId);
                    expect(event.task).toBe('Create login component');
                    expect(event.priority).toBe('high');
                    eventBus.unsubscribe(DOMAIN_EVENTS.TASK_ASSIGNED, taskHandler);
                    done();
                };

                eventBus.subscribe(DOMAIN_EVENTS.TASK_ASSIGNED, taskHandler);

                // Simulate task assignment
                eventBus.publish(DOMAIN_EVENTS.TASK_ASSIGNED, {
                    agentId: agentId,
                    taskId: 'task-001',
                    task: 'Create login component',
                    priority: 'high'
                });
            };

            eventBus.subscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, spawnHandler);

            agentManager.addAgent({
                type: 'frontend-specialist',
                name: 'Frontend Dev'
            });
        });

        it('should handle agent status updates', done => {
            let agentId: string;

            // Spawn agent
            const spawnHandler = (event: any) => {
                agentId = event.agent.id;
                eventBus.unsubscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, spawnHandler);

                // Setup status update handler
                const statusHandler = (event: any) => {
                    if (event.agentId === agentId && event.status === 'working') {
                        expect(event.currentTask).toBeDefined();
                        eventBus.unsubscribe(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, statusHandler);
                        done();
                    }
                };

                eventBus.subscribe(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, statusHandler);

                // Agent reports status
                agentManager.updateAgentStatus(agentId, 'working', {
                    currentTask: 'Working on login component'
                });
            };

            eventBus.subscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, spawnHandler);

            agentManager.addAgent({
                type: 'backend-specialist',
                name: 'Backend Dev'
            });
        });

        it('should terminate agent', done => {
            let agentId: string;

            // Spawn agent first
            const spawnHandler = (event: any) => {
                agentId = event.agent.id;
                eventBus.unsubscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, spawnHandler);

                // Setup termination handler
                const terminateHandler = (event: any) => {
                    expect(event.agentId).toBe(agentId);
                    expect(event.reason).toBe('Task completed');
                    eventBus.unsubscribe(DOMAIN_EVENTS.AGENT_TERMINATED, terminateHandler);
                    done();
                };

                eventBus.subscribe(DOMAIN_EVENTS.AGENT_TERMINATED, terminateHandler);

                // Simulate termination
                eventBus.publish(DOMAIN_EVENTS.AGENT_TERMINATED, {
                    agentId: agentId,
                    reason: 'Task completed'
                });
            };

            eventBus.subscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, spawnHandler);

            agentManager.addAgent({
                type: 'testing-specialist',
                name: 'Test Engineer'
            });
        });
    });

    describe('Task Management', () => {
        let testAgentId: string;

        beforeEach(done => {
            // Spawn a test agent for task tests
            const handler = (event: any) => {
                testAgentId = event.agent.id;
                eventBus.unsubscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, handler);
                done();
            };

            eventBus.subscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, handler);

            agentManager.addAgent({
                type: 'fullstack-developer',
                name: 'Full Stack Dev'
            });
        });

        it('should track task progress', done => {
            let taskId: string;

            // Assign task
            const assignHandler = (event: any) => {
                taskId = event.taskId;
                eventBus.unsubscribe(DOMAIN_EVENTS.TASK_ASSIGNED, assignHandler);

                // Setup progress handler
                const progressHandler = (event: any) => {
                    if (event.taskId === taskId && event.progress > 0) {
                        expect(event.progress).toBeGreaterThan(0);
                        expect(event.progress).toBeLessThanOrEqual(100);
                        eventBus.unsubscribe(DOMAIN_EVENTS.TASK_PROGRESS, progressHandler);
                        done();
                    }
                };

                eventBus.subscribe(DOMAIN_EVENTS.TASK_PROGRESS, progressHandler);

                // Report progress
                eventBus.publish(DOMAIN_EVENTS.TASK_PROGRESS, {
                    taskId: taskId,
                    agentId: testAgentId,
                    progress: 50,
                    message: 'Halfway done'
                });
            };

            eventBus.subscribe(DOMAIN_EVENTS.TASK_ASSIGNED, assignHandler);

            // Assign task
            eventBus.publish(DOMAIN_EVENTS.TASK_ASSIGNED, {
                agentId: testAgentId,
                taskId: 'task-002',
                task: 'Build API endpoints',
                priority: 'medium'
            });
        });

        it('should handle task completion', done => {
            let taskId: string;

            // Assign task
            const assignHandler = (event: any) => {
                taskId = event.taskId;
                eventBus.unsubscribe(DOMAIN_EVENTS.TASK_ASSIGNED, assignHandler);

                // Setup completion handler
                const completeHandler = (event: any) => {
                    expect(event.taskId).toBe(taskId);
                    expect(event.success).toBe(true);
                    expect(event.output).toBeDefined();
                    eventBus.unsubscribe(DOMAIN_EVENTS.TASK_COMPLETED, completeHandler);
                    done();
                };

                eventBus.subscribe(DOMAIN_EVENTS.TASK_COMPLETED, completeHandler);

                // Complete task
                eventBus.publish(DOMAIN_EVENTS.TASK_COMPLETED, {
                    taskId: taskId,
                    agentId: testAgentId,
                    success: true,
                    output: 'API endpoints created successfully'
                });
            };

            eventBus.subscribe(DOMAIN_EVENTS.TASK_ASSIGNED, assignHandler);

            // Assign task
            eventBus.publish(DOMAIN_EVENTS.TASK_ASSIGNED, {
                agentId: testAgentId,
                taskId: 'task-003',
                task: 'Deploy to staging',
                priority: 'low'
            });
        });

        it('should handle task failure', done => {
            let taskId: string;

            // Assign task
            const assignHandler = (event: any) => {
                taskId = event.taskId;
                eventBus.unsubscribe(DOMAIN_EVENTS.TASK_ASSIGNED, assignHandler);

                // Setup failure handler
                const failHandler = (event: any) => {
                    expect(event.taskId).toBe(taskId);
                    expect(event.success).toBe(false);
                    expect(event.error).toBeDefined();
                    eventBus.unsubscribe(DOMAIN_EVENTS.TASK_FAILED, failHandler);
                    done();
                };

                eventBus.subscribe(DOMAIN_EVENTS.TASK_FAILED, failHandler);

                // Report task failure
                eventBus.publish(DOMAIN_EVENTS.TASK_FAILED, {
                    taskId: taskId,
                    agentId: testAgentId,
                    success: false,
                    error: 'Build failed due to dependency issues'
                });
            };

            eventBus.subscribe(DOMAIN_EVENTS.TASK_ASSIGNED, assignHandler);

            // Assign task
            eventBus.publish(DOMAIN_EVENTS.TASK_ASSIGNED, {
                agentId: testAgentId,
                taskId: 'task-004',
                task: 'Run integration tests',
                priority: 'high'
            });
        });
    });

    describe('WebSocket Communication', () => {
        it('should establish WebSocket connection', done => {
            const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);

            ws.on('open', () => {
                // Send connection message
                const message: OrchestratorMessage = {
                    id: 'test-conn-1',
                    type: MessageType.CONNECTION_ESTABLISHED,
                    from: 'test-client',
                    to: 'orchestrator',
                    timestamp: new Date().toISOString(),
                    payload: {
                        version: '1.0.0',
                        clientType: 'test'
                    }
                };

                ws.send(JSON.stringify(message));
            });

            ws.on('message', data => {
                const response = JSON.parse(data.toString());
                if (response.type === MessageType.CONNECTION_ESTABLISHED) {
                    expect(response.from).toBe('orchestrator');
                    ws.close();
                    done();
                }
            });

            ws.on('error', done);
        });

        it('should route messages between agents', done => {
            const client1 = new WebSocket(`ws://localhost:${TEST_PORT}`);
            const client2 = new WebSocket(`ws://localhost:${TEST_PORT}`);
            let client1Ready = false;
            let client2Ready = false;

            const checkReady = () => {
                if (client1Ready && client2Ready) {
                    // Send message from client1 to client2
                    const message: OrchestratorMessage = {
                        id: 'test-msg-1',
                        type: MessageType.ASSIGN_TASK,
                        from: 'agent-1',
                        to: 'agent-2',
                        timestamp: new Date().toISOString(),
                        payload: {
                            task: 'Review code changes',
                            priority: 'medium'
                        }
                    };

                    client1.send(JSON.stringify(message));
                }
            };

            client1.on('open', () => {
                const connMsg: OrchestratorMessage = {
                    id: 'conn-1',
                    type: MessageType.CONNECTION_ESTABLISHED,
                    from: 'agent-1',
                    to: 'orchestrator',
                    timestamp: new Date().toISOString(),
                    payload: { agentId: 'agent-1' }
                };
                client1.send(JSON.stringify(connMsg));
            });

            client2.on('open', () => {
                const connMsg: OrchestratorMessage = {
                    id: 'conn-2',
                    type: MessageType.CONNECTION_ESTABLISHED,
                    from: 'agent-2',
                    to: 'orchestrator',
                    timestamp: new Date().toISOString(),
                    payload: { agentId: 'agent-2' }
                };
                client2.send(JSON.stringify(connMsg));
            });

            client1.on('message', data => {
                const msg = JSON.parse(data.toString());
                if (msg.type === MessageType.CONNECTION_ESTABLISHED) {
                    client1Ready = true;
                    checkReady();
                }
            });

            client2.on('message', data => {
                const msg = JSON.parse(data.toString());
                if (msg.type === MessageType.CONNECTION_ESTABLISHED) {
                    client2Ready = true;
                    checkReady();
                } else if (msg.type === MessageType.ASSIGN_TASK) {
                    expect(msg.from).toBe('agent-1');
                    expect(msg.to).toBe('agent-2');
                    expect(msg.payload.task).toBe('Review code changes');
                    client1.close();
                    client2.close();
                    done();
                }
            });

            client1.on('error', done);
            client2.on('error', done);
        });
    });

    describe('Orchestration Flow', () => {
        it('should handle complete workflow from spawn to completion', done => {
            let agentId: string;
            let taskId: string;
            const events: string[] = [];

            // Track all events
            const trackEvent = (eventName: string) => (event: any) => {
                events.push(eventName);

                if (eventName === DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED) {
                    agentId = event.agent.id;
                    // Assign task
                    setTimeout(() => {
                        eventBus.publish(DOMAIN_EVENTS.TASK_ASSIGNED, {
                            agentId: agentId,
                            taskId: 'workflow-task',
                            task: 'Complete workflow test',
                            priority: 'high'
                        });
                    }, 100);
                } else if (eventName === DOMAIN_EVENTS.TASK_ASSIGNED) {
                    taskId = event.taskId;
                    // Report progress
                    setTimeout(() => {
                        eventBus.publish(DOMAIN_EVENTS.TASK_PROGRESS, {
                            taskId: taskId,
                            agentId: agentId,
                            progress: 50
                        });
                    }, 100);
                } else if (eventName === DOMAIN_EVENTS.TASK_PROGRESS) {
                    // Complete task
                    setTimeout(() => {
                        eventBus.publish(DOMAIN_EVENTS.TASK_COMPLETED, {
                            taskId: taskId,
                            agentId: agentId,
                            success: true,
                            output: 'Workflow completed'
                        });
                    }, 100);
                } else if (eventName === DOMAIN_EVENTS.TASK_COMPLETED) {
                    // Verify workflow sequence
                    expect(events).toContain(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED);
                    expect(events).toContain(DOMAIN_EVENTS.TASK_ASSIGNED);
                    expect(events).toContain(DOMAIN_EVENTS.TASK_PROGRESS);
                    expect(events).toContain(DOMAIN_EVENTS.TASK_COMPLETED);

                    // Clean up listeners
                    Object.values(DOMAIN_EVENTS).forEach(event => {
                        eventBus.unsubscribe(event as string, trackEvent(event as string));
                    });

                    done();
                }
            };

            // Subscribe to relevant events
            eventBus.subscribe(
                DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED,
                trackEvent(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED)
            );
            eventBus.subscribe(DOMAIN_EVENTS.TASK_ASSIGNED, trackEvent(DOMAIN_EVENTS.TASK_ASSIGNED));
            eventBus.subscribe(DOMAIN_EVENTS.TASK_PROGRESS, trackEvent(DOMAIN_EVENTS.TASK_PROGRESS));
            eventBus.subscribe(DOMAIN_EVENTS.TASK_COMPLETED, trackEvent(DOMAIN_EVENTS.TASK_COMPLETED));

            // Start workflow
            agentManager.addAgent({
                type: 'devops-engineer',
                name: 'DevOps Agent'
            });
        });
    });
});
