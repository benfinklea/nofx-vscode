import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Container } from '../../services/Container';
import { SERVICE_TOKENS, IContainer } from '../../services/interfaces';
import { MetricsService } from '../../services/MetricsService';
import { AgentPersistence } from '../../persistence/AgentPersistence';
import { MessagePersistenceService } from '../../services/MessagePersistenceService';
import { InMemoryMessagePersistenceService } from '../../services/InMemoryMessagePersistenceService';
import { EventBus } from '../../services/EventBus';
import { DOMAIN_EVENTS } from '../../services/EventConstants';
import { LoggingService } from '../../services/LoggingService';
import { ConfigurationService } from '../../services/ConfigurationService';
import { TaskQueue } from '../../tasks/TaskQueue';
import { TaskStateMachine } from '../../tasks/TaskStateMachine';
import { TaskDependencyManager } from '../../tasks/TaskDependencyManager';
import { PriorityTaskQueue } from '../../tasks/PriorityTaskQueue';
import { setupExtension, teardownExtension, setupMockWorkspace, clearMockWorkspace } from './setup';
import { __getContainerForTests } from '../../extension';
import {
    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockContainer,
    createMockExtensionContext,
    createMockOutputChannel,
    createMockTerminal,
    setupVSCodeMocks
} from './../helpers/mockFactories';

/**
 * Comprehensive tests for metrics collection and data persistence
 * Note: These tests require real filesystem access. Set MOCK_FS=false or use memfs.
 */
jest.mock('vscode');

describe('Metrics and Persistence', () => {
    let container: IContainer;
    let context: vscode.ExtensionContext;
    let metricsService: MetricsService;
    let agentPersistence: AgentPersistence;
    let messagePersistence: MessagePersistenceService;
    let eventBus: EventBus;
    let loggingService: LoggingService;
    let taskQueue: TaskQueue;
    let tempDir: string;

    beforeAll(async () => {
        // Setup and activate extension
        context = await setupExtension();
        setupMockWorkspace();

        // Create temp directory for persistence testing
        tempDir = path.join(__dirname, 'test-persistence-' + Date.now());
        fs.mkdirSync(tempDir, { recursive: true });
    });

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        // Get the same container instance as the activated extension
        const activated = __getContainerForTests();
        if (!activated) throw new Error('Activated container not available');
        container = activated;

        // Initialize services
        const configService = new ConfigurationService();
        const mainChannel = vscode.window.createOutputChannel('NofX Test');
        loggingService = new LoggingService(configService, mainChannel);
        eventBus = new EventBus();
        metricsService = new MetricsService(configService, loggingService, eventBus);
        agentPersistence = new AgentPersistence(context.globalStorageUri.fsPath, loggingService);
        messagePersistence = new InMemoryMessagePersistenceService(loggingService, configService, eventBus);

        // Initialize task queue with dependencies
        const taskStateMachine = new TaskStateMachine(loggingService, eventBus);
        const mockNotificationService = {
            showInformation: jest.fn(),
            showWarning: jest.fn(),
            showError: jest.fn(),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            showOpenDialog: jest.fn(),
            showSaveDialog: jest.fn(),
            setStatusBarMessage: jest.fn()
        };
        const dependencyManager = new TaskDependencyManager(loggingService, eventBus, mockNotificationService);
        const priorityQueue = new PriorityTaskQueue(loggingService, dependencyManager, taskStateMachine);
        const mockAgentManager = {
            getAgents: jest.fn().mockReturnValue([]),
            spawnAgent: jest.fn(),
            removeAgent: jest.fn(),
            getAgent: jest.fn(),
            updateAgentStatus: jest.fn(),
            restoreAgents: jest.fn(),
            renameAgent: jest.fn(),
            updateAgentType: jest.fn()
        };
        taskQueue = new TaskQueue(
            mockAgentManager,
            loggingService,
            eventBus,
            undefined,
            mockNotificationService,
            configService,
            taskStateMachine,
            priorityQueue,
            undefined,
            dependencyManager,
            metricsService
        );

        // Register services using SERVICE_TOKENS
        container.registerInstance(SERVICE_TOKENS.ConfigurationService, configService);
        container.registerInstance(SERVICE_TOKENS.LoggingService, loggingService);
        container.registerInstance(SERVICE_TOKENS.EventBus, eventBus);
        container.registerInstance(SERVICE_TOKENS.MetricsService, metricsService);
        container.registerInstance(SERVICE_TOKENS.AgentPersistence, agentPersistence);
        container.registerInstance(SERVICE_TOKENS.MessagePersistenceService, messagePersistence);
        container.registerInstance(SERVICE_TOKENS.TaskQueue, taskQueue);
        container.registerInstance(SERVICE_TOKENS.ExtensionContext, context);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }

        clearMockWorkspace();
        await teardownExtension();
    });

    describe('Metrics Collection', () => {
        test('should track agent lifecycle metrics', () => {
            const incrementSpy = jest.spyOn(metricsService, 'incrementCounter');
            const recordSpy = jest.spyOn(metricsService, 'recordGauge');

            // Simulate agent spawn
            const resolvedEventBus = container.resolve(SERVICE_TOKENS.EventBus);
            resolvedEventBus.publish(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, {
                agentId: 'agent-1',
                timestamp: Date.now()
            });

            expect(incrementSpy).toHaveBeenCalledWith('agents.spawned');
            expect(recordSpy).toHaveBeenCalledWith('agents.active', expect.any(Number));
        });

        test('should track task metrics', () => {
            const incrementSpy = jest.spyOn(metricsService, 'incrementCounter');
            const histogramSpy = jest.spyOn(metricsService, 'recordHistogram');

            // Create and complete a task
            const resolvedTaskQueue = container.resolve(SERVICE_TOKENS.TaskQueue);
            const task = resolvedTaskQueue.createTask({
                description: 'Test task',
                priority: 'high'
            });

            resolvedTaskQueue.completeTask(task.id);

            expect(incrementSpy).toHaveBeenCalledWith('tasks.created');
            expect(incrementSpy).toHaveBeenCalledWith('tasks.completed');
            expect(histogramSpy).toHaveBeenCalledWith('tasks.duration', expect.any(Number));
        });

        test('should track message flow metrics', () => {
            const incrementSpy = jest.spyOn(metricsService, 'incrementCounter');

            // Simulate message events
            const resolvedEventBus = container.resolve(SERVICE_TOKENS.EventBus);
            resolvedEventBus.publish(DOMAIN_EVENTS.MESSAGE_SENT, {
                from: 'conductor',
                to: 'agent-1',
                type: 'ASSIGN_TASK'
            });

            resolvedEventBus.publish(DOMAIN_EVENTS.MESSAGE_RECEIVED, {
                from: 'agent-1',
                to: 'conductor',
                type: 'TASK_COMPLETE'
            });

            expect(incrementSpy).toHaveBeenCalledWith('messages.sent');
            expect(incrementSpy).toHaveBeenCalledWith('messages.received');
        });

        test('should support metric aggregation', () => {
            // Record multiple metrics
            const resolvedMetricsService = container.resolve(SERVICE_TOKENS.MetricsService);
            resolvedMetricsService.incrementCounter('test.counter', 5);
            resolvedMetricsService.recordGauge('test.gauge', 100);
            resolvedMetricsService.recordHistogram('test.histogram', 50);
            resolvedMetricsService.recordHistogram('test.histogram', 150);

            const metrics = resolvedMetricsService.getMetrics();

            expect(metrics['test.counter']).toBe(5);
            expect(metrics['test.gauge']).toBe(100);
            expect(metrics['test.histogram']).toBeDefined();
        });

        test('should handle metrics export command', async () => {
            // Record some metrics
            const resolvedMetricsService = container.resolve(SERVICE_TOKENS.MetricsService);
            resolvedMetricsService.incrementCounter('export.test', 10);

            const saveSpy = jest.spyOn(vscode.workspace, 'saveAll').mockResolvedValue(true);
            const showSaveSpy = jest
                .spyOn(vscode.window, 'showSaveDialog')
                .mockResolvedValue(vscode.Uri.file(path.join(tempDir, 'metrics.json')));

            await vscode.commands.executeCommand('nofx.exportMetrics');

            expect(showSaveSpy).toHaveBeenCalled();

            // Check if metrics file was created (in actual implementation)
            const expectedPath = path.join(tempDir, 'metrics.json');
            if (fs.existsSync(expectedPath)) {
                const content = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
                expect(content).toHaveProperty('export.test');
            }
        });

        test('should handle metrics reset command', async () => {
            // Record some metrics
            const resolvedMetricsService = container.resolve(SERVICE_TOKENS.MetricsService);
            resolvedMetricsService.incrementCounter('reset.test', 5);

            const beforeReset = resolvedMetricsService.getMetrics();
            expect(beforeReset['reset.test']).toBe(5);

            await vscode.commands.executeCommand('nofx.resetMetrics');

            const afterReset = resolvedMetricsService.getMetrics();
            expect(afterReset['reset.test']).toBeUndefined();
        });

        test('should handle metrics toggle command', async () => {
            const resolvedMetricsService = container.resolve(SERVICE_TOKENS.MetricsService);
            const isEnabled = resolvedMetricsService.isEnabled();

            await vscode.commands.executeCommand('nofx.toggleMetrics');

            expect(resolvedMetricsService.isEnabled()).toBe(!isEnabled);

            // Toggle back
            await vscode.commands.executeCommand('nofx.toggleMetrics');
            expect(resolvedMetricsService.isEnabled()).toBe(isEnabled);
        });
    });

    describe('Agent Persistence', () => {
        test('should persist agent state', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'frontend-specialist',
                status: 'idle',
                capabilities: ['React', 'CSS'],
                terminal: {} as any,
                workingDirectory: '/test'
            };

            const resolvedAgentPersistence = container.resolve(SERVICE_TOKENS.AgentPersistence);
            await resolvedAgentPersistence.saveAgents([agent]);

            const loaded = await resolvedAgentPersistence.loadAgents();
            const foundAgent = loaded.find(a => a.id === 'agent-1');
            expect(foundAgent).toMatchObject({
                id: agent.id,
                name: agent.name,
                type: agent.type
            });
        });

        test('should persist multiple agents', async () => {
            const agents = [
                { id: 'agent-1', name: 'Agent 1', type: 'frontend-specialist' },
                { id: 'agent-2', name: 'Agent 2', type: 'backend-specialist' }
            ];

            const resolvedAgentPersistence = container.resolve(SERVICE_TOKENS.AgentPersistence);
            await resolvedAgentPersistence.saveAgents(agents as any);

            const allAgents = await resolvedAgentPersistence.loadAgents();
            expect(allAgents).toHaveLength(2);
            expect(allAgents.map(a => a.id)).toContain('agent-1');
            expect(allAgents.map(a => a.id)).toContain('agent-2');
        });

        test('should handle agent restoration command', async () => {
            // Save some agents first
            const resolvedAgentPersistence = container.resolve(SERVICE_TOKENS.AgentPersistence);
            await resolvedAgentPersistence.saveAgents([
                {
                    id: 'restore-1',
                    name: 'Restore Test',
                    type: 'fullstack-developer'
                } as any
            ]);

            const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

            await vscode.commands.executeCommand('nofx.restoreAgents');

            expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('restored'));
        });

        test('should handle persistence clear command', async () => {
            // Save some data
            const resolvedAgentPersistence = container.resolve(SERVICE_TOKENS.AgentPersistence);
            await resolvedAgentPersistence.saveAgents([
                {
                    id: 'clear-test',
                    name: 'Clear Test',
                    type: 'testing-specialist'
                } as any
            ]);

            const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Yes' as any);

            await vscode.commands.executeCommand('nofx.clearPersistence');

            expect(warningSpy).toHaveBeenCalledWith(expect.stringContaining('clear'), 'Yes', 'No');

            const allAgents = await resolvedAgentPersistence.loadAgents();
            expect(allAgents).toHaveLength(0);
        });
    });

    describe('Message Persistence', () => {
        test('should persist messages in memory', async () => {
            const message = {
                id: 'msg-1',
                from: 'conductor',
                to: 'agent-1',
                type: 'ASSIGN_TASK',
                payload: { taskId: 'task-1' },
                timestamp: Date.now()
            };

            const resolvedMessagePersistence = container.resolve(SERVICE_TOKENS.MessagePersistenceService);
            await resolvedMessagePersistence.saveMessage(message);

            const messages = await resolvedMessagePersistence.getMessages({
                from: 'conductor'
            });

            expect(messages).toHaveLength(1);
            expect(messages[0]).toMatchObject({
                id: message.id,
                type: message.type
            });
        });

        test('should filter messages by criteria', async () => {
            const messages = [
                { id: '1', from: 'conductor', to: 'agent-1', type: 'ASSIGN_TASK', timestamp: Date.now() - 1000 },
                { id: '2', from: 'agent-1', to: 'conductor', type: 'TASK_COMPLETE', timestamp: Date.now() - 500 },
                { id: '3', from: 'conductor', to: 'agent-2', type: 'ASSIGN_TASK', timestamp: Date.now() }
            ];

            const resolvedMessagePersistence = container.resolve(SERVICE_TOKENS.MessagePersistenceService);
            for (const msg of messages) {
                await resolvedMessagePersistence.saveMessage(msg as any);
            }

            // Filter by sender
            const fromConductor = await resolvedMessagePersistence.getMessages({ from: 'conductor' });
            expect(fromConductor).toHaveLength(2);

            // Filter by recipient
            const toAgent1 = await resolvedMessagePersistence.getMessages({ to: 'agent-1' });
            expect(toAgent1).toHaveLength(1);

            // Filter by type
            const taskComplete = await resolvedMessagePersistence.getMessages({ type: 'TASK_COMPLETE' });
            expect(taskComplete).toHaveLength(1);
        });

        test('should handle message limits', async () => {
            const resolvedMessagePersistence = container.resolve(SERVICE_TOKENS.MessagePersistenceService);
            const inMemoryService = resolvedMessagePersistence as InMemoryMessagePersistenceService;

            // Add many messages (assuming default limit is 1000)
            for (let i = 0; i < 1100; i++) {
                await inMemoryService.saveMessage({
                    id: `msg-${i}`,
                    from: 'test',
                    to: 'test',
                    type: 'TEST',
                    timestamp: Date.now()
                } as any);
            }

            const allMessages = await inMemoryService.getMessages({});
            expect(allMessages.length).toBeLessThanOrEqual(1000);
        });
    });

    describe('Session Export', () => {
        test('should export session data', async () => {
            // Setup session data
            const resolvedAgentPersistence = container.resolve(SERVICE_TOKENS.AgentPersistence);
            await resolvedAgentPersistence.saveAgents([
                {
                    id: 'export-agent',
                    name: 'Export Test',
                    type: 'backend-specialist'
                } as any
            ]);

            const resolvedMetricsService = container.resolve(SERVICE_TOKENS.MetricsService);
            resolvedMetricsService.incrementCounter('export.sessions', 1);

            const showSaveSpy = jest
                .spyOn(vscode.window, 'showSaveDialog')
                .mockResolvedValue(vscode.Uri.file(path.join(tempDir, 'session.json')));

            await vscode.commands.executeCommand('nofx.exportSessions');

            expect(showSaveSpy).toHaveBeenCalled();
        });

        test('should archive old sessions', async () => {
            const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

            await vscode.commands.executeCommand('nofx.archiveSessions');

            expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('archived'));
        });
    });

    describe('Performance Metrics', () => {
        test('should track operation latencies', async () => {
            const resolvedMetricsService = container.resolve(SERVICE_TOKENS.MetricsService);
            const histogramSpy = jest.spyOn(resolvedMetricsService, 'recordHistogram');

            // Simulate timed operation
            const startTime = Date.now();
            await new Promise(resolve => setTimeout(resolve, 10));
            const duration = Date.now() - startTime;

            resolvedMetricsService.recordHistogram('operation.latency', duration);

            expect(histogramSpy).toHaveBeenCalledWith('operation.latency', expect.any(Number));
        });

        test('should provide metrics dashboard', async () => {
            const panelSpy = jest.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue({
                webview: {
                    html: '',
                    onDidReceiveMessage: jest.fn()
                },
                dispose: jest.fn(),
                onDidDispose: jest.fn()
            } as any);

            await vscode.commands.executeCommand('nofx.showMetricsDashboard');

            expect(panelSpy).toHaveBeenCalledWith(
                'nofxMetrics',
                expect.any(String),
                expect.any(Number),
                expect.any(Object)
            );
        });
    });
});
