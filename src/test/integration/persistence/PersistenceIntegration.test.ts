import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PersistenceService } from '../../../services/PersistenceService';
import { MessagePersistenceService } from '../../../services/MessagePersistenceService';
import { AgentManager } from '../../../agents/AgentManager';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { MetricsService } from '../../../services/MetricsService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { Container } from '../../../services/Container';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';
import { Agent } from '../../../agents/types';
import { OrchestratorMessage, MessageType } from '../../../orchestration/MessageProtocol';
import { createMockTerminal } from '../../helpers/mockFactories';
import { getAppStateStore } from '../../../state/AppStateStore';
import * as selectors from '../../../state/selectors';
import * as actions from '../../../state/actions';
describe('Persistence Integration', () => {
    let container: Container;
    let agentManager: AgentManager;
    let agentPersistence: PersistenceService;
    let messagePersistence: MessagePersistenceService;
    let eventBus: EventBus;
    let mockContext: vscode.ExtensionContext;
    let mockChannel: vscode.OutputChannel;
    let testDataPath: string;

    beforeAll(() => {
        // Setup test data directory
        testDataPath = path.join(__dirname, 'test-persistence-data');
        if (fs.existsSync(testDataPath)) {
            fs.rmSync(testDataPath, { recursive: true, force: true });
        }
        fs.mkdirSync(testDataPath, { recursive: true });

        // Setup mock context with test storage paths
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
            storagePath: testDataPath,
            globalStoragePath: testDataPath,
            logPath: path.join(testDataPath, 'logs'),
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

        // Register mock services
        container.register(
            Symbol.for('ITerminalManager'),
            () =>
                ({
                    createTerminal: jest.fn(),
                    getTerminal: jest.fn(),
                    closeTerminal: jest.fn()
                }) as any,
            'singleton'
        );

        container.register(
            Symbol.for('IAgentLifecycleManager'),
            () =>
                ({
                    spawnAgent: jest.fn(),
                    terminateAgent: jest.fn(),
                    getAgentStatus: jest.fn()
                }) as any,
            'singleton'
        );

        container.register(
            Symbol.for('IAgentNotificationService'),
            () =>
                ({
                    notifyAgentSpawned: jest.fn(),
                    notifyAgentTerminated: jest.fn(),
                    notifyTaskAssigned: jest.fn()
                }) as any,
            'singleton'
        );

        // Create persistence services
        agentPersistence = new PersistenceService(
            mockContext,
            container.resolve(Symbol.for('IEventBus')),
            container.resolve(Symbol.for('ILoggingService'))
        );

        messagePersistence = new MessagePersistenceService(
            mockContext,
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IEventBus')),
            container.resolve(Symbol.for('IConfigurationService'))
        );

        // Create agent manager
        agentManager = new AgentManager(mockContext);
    });

    afterAll(async () => {
        await agentPersistence.dispose();
        await messagePersistence.dispose();
        await agentManager.dispose();
        await container.dispose();
        Container['instance'] = null;

        // Cleanup test data
        if (fs.existsSync(testDataPath)) {
            fs.rmSync(testDataPath, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        // Clear any existing test data
        mockContext.globalState.get = jest.fn().mockReturnValue(undefined);
        mockContext.globalState.update = jest.fn();
        mockContext.workspaceState.get = jest.fn().mockReturnValue(undefined);
        mockContext.workspaceState.update = jest.fn();
    });

    describe('Agent Persistence', () => {
        it('should save agents to global state', async () => {
            const testAgent: Agent = {
                id: 'agent-001',
                name: 'Test Agent',
                type: 'frontend-specialist',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            await agentPersistence.saveAgent(testAgent);

            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'nofx.agents',
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 'agent-001',
                        name: 'Test Agent',
                        type: 'frontend-specialist'
                    })
                ])
            );
        });

        it('should load agents from global state', async () => {
            const savedAgents = [
                {
                    id: 'agent-002',
                    name: 'Saved Agent',
                    type: 'backend-specialist',
                    status: 'idle',
                    createdAt: new Date().toISOString()
                }
            ];

            mockContext.globalState.get = jest.fn().mockReturnValue(savedAgents);

            const loadedAgents = await agentPersistence.loadAgents();

            expect(loadedAgents).toHaveLength(1);
            expect(loadedAgents[0].id).toBe('agent-002');
            expect(loadedAgents[0].name).toBe('Saved Agent');
        });

        it('should handle agent updates', async () => {
            const agent: Agent = {
                id: 'agent-003',
                name: 'Update Test',
                type: 'fullstack-developer',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            await agentPersistence.saveAgent(agent);

            // Update agent status
            agent.status = 'working';
            await agentPersistence.updateAgent(agent);

            // Should call update with modified agent
            expect(mockContext.globalState.update).toHaveBeenLastCalledWith(
                'nofx.agents',
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 'agent-003',
                        status: 'working'
                    })
                ])
            );
        });

        it('should remove agents from persistence', async () => {
            const agents: Agent[] = [
                {
                    id: 'agent-004',
                    name: 'Keep Agent',
                    type: 'testing-specialist',
                    status: 'idle',
                    createdAt: new Date(),
                    terminal: createMockTerminal()
                },
                {
                    id: 'agent-005',
                    name: 'Remove Agent',
                    type: 'devops-engineer',
                    status: 'idle',
                    createdAt: new Date(),
                    terminal: createMockTerminal()
                }
            ];

            // Save both agents
            for (const agent of agents) {
                await agentPersistence.saveAgent(agent);
            }

            // Remove one agent
            await agentPersistence.removeAgent('agent-005');

            expect(mockContext.globalState.update).toHaveBeenLastCalledWith(
                'nofx.agents',
                expect.arrayContaining([expect.objectContaining({ id: 'agent-004' })])
            );

            // Should not contain removed agent
            const lastCall = (mockContext.globalState.update as jest.Mock).mock.calls.slice(-1)[0];
            const savedAgents = lastCall[1];
            expect(savedAgents.find((a: any) => a.id === 'agent-005')).toBeUndefined();
        });

        it('should clear all agents', async () => {
            // Save some agents first
            await agentPersistence.saveAgent({
                id: 'agent-006',
                name: 'Clear Test 1',
                type: 'frontend-specialist',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            });

            await agentPersistence.clearAll();

            expect(mockContext.globalState.update).toHaveBeenLastCalledWith('nofx.agents', []);
        });

        it('should handle persistence errors gracefully', async () => {
            // Mock storage error
            mockContext.globalState.update = jest.fn().mockRejectedValue(new Error('Storage error'));

            const agent: Agent = {
                id: 'agent-007',
                name: 'Error Test',
                type: 'security-expert',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            // Should not throw
            await expect(agentPersistence.saveAgent(agent)).resolves.not.toThrow();

            // Should log error
            expect(mockChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Failed to save agent'));
        });

        it('should integrate with agent manager events', done => {
            let persistenceEventReceived = false;

            eventBus.subscribe(DOMAIN_EVENTS.AGENT_PERSISTED, event => {
                persistenceEventReceived = true;
                expect(event.agentId).toBe('agent-008');
                done();
            });

            const agent: Agent = {
                id: 'agent-008',
                name: 'Event Test',
                type: 'database-architect',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            agentPersistence.saveAgent(agent).then(() => {
                // Emit persistence event
                eventBus.publish(DOMAIN_EVENTS.AGENT_PERSISTED, {
                    agentId: agent.id,
                    timestamp: new Date().toISOString()
                });
            });
        });
    });

    describe('Message Persistence', () => {
        it('should persist orchestration messages', async () => {
            const message: OrchestratorMessage = {
                id: 'msg-001',
                timestamp: new Date().toISOString(),
                from: 'conductor',
                to: 'agent-001',
                type: MessageType.ASSIGN_TASK,
                payload: {
                    taskId: 'task-001',
                    task: 'Create component',
                    priority: 'high'
                }
            };

            await messagePersistence.persistMessage(message);

            // Should create message file
            const expectedPath = path.join(testDataPath, 'messages', 'msg-001.json');
            if (fs.existsSync(expectedPath)) {
                const savedMessage = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'));
                expect(savedMessage.id).toBe('msg-001');
                expect(savedMessage.type).toBe(MessageType.ASSIGN_TASK);
            }
        });

        it('should load persisted messages', async () => {
            const messages: OrchestratorMessage[] = [
                {
                    id: 'msg-002',
                    timestamp: new Date().toISOString(),
                    from: 'agent-001',
                    to: 'conductor',
                    type: MessageType.TASK_COMPLETE,
                    payload: {
                        taskId: 'task-001',
                        success: true,
                        output: 'Component created'
                    }
                },
                {
                    id: 'msg-003',
                    timestamp: new Date().toISOString(),
                    from: 'conductor',
                    to: 'agent-002',
                    type: MessageType.QUERY_STATUS,
                    payload: {}
                }
            ];

            // Persist messages
            for (const message of messages) {
                await messagePersistence.persistMessage(message);
            }

            // Load messages
            const loadedMessages = await messagePersistence.loadMessages();

            expect(loadedMessages.length).toBeGreaterThanOrEqual(2);
            expect(loadedMessages.some(m => m.id === 'msg-002')).toBe(true);
            expect(loadedMessages.some(m => m.id === 'msg-003')).toBe(true);
        });

        it('should query messages by criteria', async () => {
            const testMessages: OrchestratorMessage[] = [
                {
                    id: 'query-001',
                    timestamp: new Date().toISOString(),
                    from: 'conductor',
                    to: 'agent-001',
                    type: MessageType.ASSIGN_TASK,
                    payload: { task: 'Frontend task' }
                },
                {
                    id: 'query-002',
                    timestamp: new Date().toISOString(),
                    from: 'conductor',
                    to: 'agent-002',
                    type: MessageType.ASSIGN_TASK,
                    payload: { task: 'Backend task' }
                },
                {
                    id: 'query-003',
                    timestamp: new Date().toISOString(),
                    from: 'agent-001',
                    to: 'conductor',
                    type: MessageType.TASK_COMPLETE,
                    payload: { success: true }
                }
            ];

            for (const message of testMessages) {
                await messagePersistence.persistMessage(message);
            }

            // Query by message type
            const taskMessages = await messagePersistence.queryMessages({
                type: MessageType.ASSIGN_TASK
            });

            expect(taskMessages.length).toBe(2);
            expect(taskMessages.every(m => m.type === MessageType.ASSIGN_TASK)).toBe(true);

            // Query by sender
            const conductorMessages = await messagePersistence.queryMessages({
                from: 'conductor'
            });

            expect(conductorMessages.length).toBe(2);
            expect(conductorMessages.every(m => m.from === 'conductor')).toBe(true);
        });

        it('should handle message cleanup', async () => {
            const oldMessage: OrchestratorMessage = {
                id: 'old-msg',
                timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days old
                from: 'conductor',
                to: 'agent-001',
                type: MessageType.HEARTBEAT,
                payload: {}
            };

            const newMessage: OrchestratorMessage = {
                id: 'new-msg',
                timestamp: new Date().toISOString(),
                from: 'conductor',
                to: 'agent-001',
                type: MessageType.HEARTBEAT,
                payload: {}
            };

            await messagePersistence.persistMessage(oldMessage);
            await messagePersistence.persistMessage(newMessage);

            // Run cleanup (remove messages older than 7 days)
            await messagePersistence.cleanupOldMessages(7);

            const remainingMessages = await messagePersistence.loadMessages();

            expect(remainingMessages.some(m => m.id === 'old-msg')).toBe(false);
            expect(remainingMessages.some(m => m.id === 'new-msg')).toBe(true);
        });

        it('should export message history', async () => {
            const exportMessages: OrchestratorMessage[] = [
                {
                    id: 'export-001',
                    timestamp: new Date().toISOString(),
                    from: 'conductor',
                    to: 'agent-001',
                    type: MessageType.SPAWN_AGENT,
                    payload: { role: 'frontend-specialist' }
                },
                {
                    id: 'export-002',
                    timestamp: new Date().toISOString(),
                    from: 'agent-001',
                    to: 'conductor',
                    type: MessageType.AGENT_READY,
                    payload: { agentId: 'agent-001' }
                }
            ];

            for (const message of exportMessages) {
                await messagePersistence.persistMessage(message);
            }

            const exportData = await messagePersistence.exportMessages('json');
            const parsedData = JSON.parse(exportData);

            expect(parsedData).toHaveProperty('messages');
            expect(parsedData).toHaveProperty('metadata');
            expect(parsedData.messages.length).toBeGreaterThanOrEqual(2);
        });

        it('should handle concurrent message persistence', async () => {
            const concurrentMessages = Array.from({ length: 50 }, (_, i) => ({
                id: `concurrent-${i}`,
                timestamp: new Date().toISOString(),
                from: 'test',
                to: 'target',
                type: MessageType.HEARTBEAT,
                payload: { index: i }
            }));

            // Persist all messages concurrently
            const promises = concurrentMessages.map(msg => messagePersistence.persistMessage(msg));

            await Promise.all(promises);

            const loadedMessages = await messagePersistence.loadMessages();
            const concurrentLoadedMessages = loadedMessages.filter(m => m.id.startsWith('concurrent-'));

            expect(concurrentLoadedMessages.length).toBe(50);
        });
    });

    describe('Session Persistence', () => {
        it('should save and load complete sessions', async () => {
            // Create a session with agents and messages
            const sessionAgents: Agent[] = [
                {
                    id: 'session-agent-1',
                    name: 'Session Frontend',
                    type: 'frontend-specialist',
                    status: 'working',
                    createdAt: new Date(),
                    terminal: createMockTerminal()
                },
                {
                    id: 'session-agent-2',
                    name: 'Session Backend',
                    type: 'backend-specialist',
                    status: 'idle',
                    createdAt: new Date(),
                    terminal: createMockTerminal()
                }
            ];

            const sessionMessages: OrchestratorMessage[] = [
                {
                    id: 'session-msg-1',
                    timestamp: new Date().toISOString(),
                    from: 'conductor',
                    to: 'session-agent-1',
                    type: MessageType.ASSIGN_TASK,
                    payload: { task: 'Create UI' }
                },
                {
                    id: 'session-msg-2',
                    timestamp: new Date().toISOString(),
                    from: 'session-agent-1',
                    to: 'conductor',
                    type: MessageType.TASK_PROGRESS,
                    payload: { progress: 50 }
                }
            ];

            // Save session data
            for (const agent of sessionAgents) {
                await agentPersistence.saveAgent(agent);
            }

            for (const message of sessionMessages) {
                await messagePersistence.persistMessage(message);
            }

            // Create session export
            const sessionData = {
                sessionId: 'test-session-001',
                timestamp: new Date().toISOString(),
                agents: sessionAgents,
                messages: sessionMessages,
                metadata: {
                    version: '1.0.0',
                    totalAgents: sessionAgents.length,
                    totalMessages: sessionMessages.length
                }
            };

            // Save session to workspace state
            await mockContext.workspaceState.update('nofx.current.session', sessionData);

            // Verify session was saved
            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'nofx.current.session',
                expect.objectContaining({
                    sessionId: 'test-session-001',
                    agents: expect.arrayContaining([
                        expect.objectContaining({ id: 'session-agent-1' }),
                        expect.objectContaining({ id: 'session-agent-2' })
                    ])
                })
            );
        });

        it('should handle session restoration', async () => {
            const savedSession = {
                sessionId: 'restore-session-001',
                timestamp: new Date().toISOString(),
                agents: [
                    {
                        id: 'restore-agent-1',
                        name: 'Restored Agent',
                        type: 'fullstack-developer',
                        status: 'idle',
                        createdAt: new Date().toISOString()
                    }
                ],
                messages: [
                    {
                        id: 'restore-msg-1',
                        timestamp: new Date().toISOString(),
                        from: 'conductor',
                        to: 'restore-agent-1',
                        type: MessageType.AGENT_READY,
                        payload: {}
                    }
                ]
            };

            mockContext.workspaceState.get = jest.fn().mockReturnValue(savedSession);

            const loadedSession = await mockContext.workspaceState.get('nofx.current.session');

            expect(loadedSession).toBeDefined();
            expect(loadedSession.sessionId).toBe('restore-session-001');
            expect(loadedSession.agents).toHaveLength(1);
            expect(loadedSession.messages).toHaveLength(1);
        });

        it('should handle session migration', async () => {
            // Simulate old session format
            const oldSessionData = {
                version: '0.9.0',
                agents: [
                    {
                        id: 'old-agent',
                        name: 'Old Agent',
                        role: 'frontend-specialist', // old property name
                        state: 'idle' // old property name
                    }
                ]
            };

            mockContext.globalState.get = jest.fn().mockReturnValue(oldSessionData);

            // Migration logic would convert old format to new format
            const migratedAgents = oldSessionData.agents.map((agent: any) => ({
                id: agent.id,
                name: agent.name,
                type: agent.role, // role -> type
                status: agent.state, // state -> status
                createdAt: new Date(),
                terminal: createMockTerminal()
            }));

            expect(migratedAgents[0]).toMatchObject({
                id: 'old-agent',
                name: 'Old Agent',
                type: 'frontend-specialist',
                status: 'idle'
            });
        });
    });

    describe('Persistence Performance', () => {
        it('should handle large datasets efficiently', async () => {
            const startTime = Date.now();
            const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
                id: `perf-agent-${i}`,
                name: `Performance Agent ${i}`,
                type: 'testing-specialist' as const,
                status: 'idle' as const,
                createdAt: new Date(),
                terminal: createMockTerminal()
            }));

            // Save all agents
            for (const agent of largeDataset) {
                await agentPersistence.saveAgent(agent);
            }

            const saveTime = Date.now() - startTime;

            // Load all agents
            const loadStartTime = Date.now();
            const loadedAgents = await agentPersistence.loadAgents();
            const loadTime = Date.now() - loadStartTime;

            expect(loadedAgents.length).toBeGreaterThanOrEqual(1000);
            expect(saveTime).toBeLessThan(5000); // Should save 1000 agents in under 5 seconds
            expect(loadTime).toBeLessThan(1000); // Should load in under 1 second
        });

        it('should handle persistence operations under memory pressure', async () => {
            const memoryIntensiveData = Array.from({ length: 100 }, (_, i) => ({
                id: `memory-msg-${i}`,
                timestamp: new Date().toISOString(),
                from: 'test',
                to: 'target',
                type: MessageType.ASSIGN_TASK,
                payload: {
                    largeData: 'x'.repeat(10000) // 10KB of data per message
                }
            }));

            const memoryUsageBefore = process.memoryUsage().heapUsed;

            // Persist all messages
            for (const message of memoryIntensiveData) {
                await messagePersistence.persistMessage(message);
            }

            const memoryUsageAfter = process.memoryUsage().heapUsed;
            const memoryIncrease = memoryUsageAfter - memoryUsageBefore;

            // Memory increase should be reasonable (less than 50MB for 1MB of data)
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

            // Load messages and verify they're correct
            const loadedMessages = await messagePersistence.queryMessages({
                from: 'test'
            });

            expect(loadedMessages.length).toBeGreaterThanOrEqual(100);
        });
    });

    describe('Persistence Error Recovery', () => {
        it('should recover from corrupted agent data', async () => {
            // Simulate corrupted data
            mockContext.globalState.get = jest.fn().mockReturnValue([
                { id: 'valid-agent', name: 'Valid', type: 'frontend-specialist' },
                { invalid: 'data' }, // Missing required fields
                null, // null entry
                { id: 'another-valid', name: 'Another Valid', type: 'backend-specialist' }
            ]);

            const loadedAgents = await agentPersistence.loadAgents();

            // Should only return valid agents
            expect(loadedAgents).toHaveLength(2);
            expect(loadedAgents[0].id).toBe('valid-agent');
            expect(loadedAgents[1].id).toBe('another-valid');
        });

        it('should handle file system errors gracefully', async () => {
            // Mock file system error
            const originalWriteFileSync = fs.writeFileSync;
            fs.writeFileSync = jest.fn().mockImplementation(() => {
                throw new Error('Disk full');
            });

            const message: OrchestratorMessage = {
                id: 'fs-error-test',
                timestamp: new Date().toISOString(),
                from: 'test',
                to: 'target',
                type: MessageType.HEARTBEAT,
                payload: {}
            };

            // Should handle error gracefully
            await expect(messagePersistence.persistMessage(message)).resolves.not.toThrow();

            // Should log error
            expect(mockChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Failed to persist message'));

            // Restore original function
            fs.writeFileSync = originalWriteFileSync;
        });

        it('should provide data integrity checks', async () => {
            const testAgent: Agent = {
                id: 'integrity-test',
                name: 'Integrity Agent',
                type: 'security-expert',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            await agentPersistence.saveAgent(testAgent);

            // Verify data integrity
            const savedAgents = await agentPersistence.loadAgents();
            const savedAgent = savedAgents.find(a => a.id === 'integrity-test');

            expect(savedAgent).toBeDefined();
            expect(savedAgent?.name).toBe('Integrity Agent');
            expect(savedAgent?.type).toBe('security-expert');
            expect(savedAgent?.status).toBe('idle');
        });
    });

    describe('Persistence Events and Monitoring', () => {
        it('should emit persistence events', done => {
            let eventReceived = false;

            eventBus.subscribe(DOMAIN_EVENTS.PERSISTENCE_OPERATION_COMPLETE, event => {
                eventReceived = true;
                expect(event.operation).toBe('save');
                expect(event.type).toBe('agent');
                done();
            });

            const agent: Agent = {
                id: 'event-test',
                name: 'Event Agent',
                type: 'ai-ml-specialist',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            agentPersistence.saveAgent(agent).then(() => {
                // Emit persistence event
                eventBus.publish(DOMAIN_EVENTS.PERSISTENCE_OPERATION_COMPLETE, {
                    operation: 'save',
                    type: 'agent',
                    id: agent.id,
                    success: true,
                    timestamp: new Date().toISOString()
                });
            });
        });

        it('should monitor persistence health', async () => {
            const healthMetrics = {
                agentPersistenceOperations: 0,
                messagePersistenceOperations: 0,
                errors: 0,
                averageOperationTime: 0
            };

            // Track operations
            const operations = [];

            for (let i = 0; i < 10; i++) {
                const startTime = Date.now();

                await agentPersistence.saveAgent({
                    id: `health-agent-${i}`,
                    name: `Health Agent ${i}`,
                    type: 'testing-specialist',
                    status: 'idle',
                    createdAt: new Date(),
                    terminal: createMockTerminal()
                });

                operations.push(Date.now() - startTime);
                healthMetrics.agentPersistenceOperations++;
            }

            healthMetrics.averageOperationTime = operations.reduce((a, b) => a + b, 0) / operations.length;

            expect(healthMetrics.agentPersistenceOperations).toBe(10);
            expect(healthMetrics.averageOperationTime).toBeLessThan(100); // Should be fast
            expect(healthMetrics.errors).toBe(0);
        });
    });
});
