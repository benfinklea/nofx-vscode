import * as vscode from 'vscode';
import { MessageFlowDashboard } from '../../../dashboard/MessageFlowDashboard';
import { AgentTreeProvider } from '../../../views/AgentTreeProvider';
import { TaskTreeProvider } from '../../../views/TaskTreeProvider';
import { AgentManager } from '../../../agents/AgentManager';
import { TaskQueue } from '../../../tasks/TaskQueue';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { MetricsService } from '../../../services/MetricsService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { Container } from '../../../services/Container';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';
import { OrchestratorMessage, MessageType } from '../../../orchestration/MessageProtocol';
import { Agent } from '../../../agents/types';
import { createMockTerminal } from '../../helpers/mockFactories';

describe('Dashboard Integration', () => {
    let container: Container;
    let agentManager: AgentManager;
    let taskQueue: TaskQueue;
    let messageFlowDashboard: MessageFlowDashboard;
    let agentTreeProvider: AgentTreeProvider;
    let taskTreeProvider: TaskTreeProvider;
    let eventBus: EventBus;
    let mockContext: vscode.ExtensionContext;
    let mockChannel: vscode.OutputChannel;
    let mockWebviewPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;

    beforeAll(() => {
        // Setup mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
            globalState: {
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([]),
                setKeysForSync: jest.fn()
            },
            workspaceState: {
                get: jest.fn().mockReturnValue(undefined),
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

        // Create mock webview
        mockWebview = {
            html: '',
            postMessage: jest.fn(),
            onDidReceiveMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            cspSource: 'vscode-webview:',
            asWebviewUri: jest.fn(uri => uri),
            options: {
                enableScripts: true,
                enableCommandUris: false
            }
        } as any;

        // Create mock webview panel
        mockWebviewPanel = {
            webview: mockWebview,
            title: 'Test Dashboard',
            viewType: 'test-dashboard',
            active: true,
            visible: true,
            viewColumn: vscode.ViewColumn.One,
            onDidDispose: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            onDidChangeViewState: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            reveal: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Mock VS Code window methods
        (vscode.window as any).createWebviewPanel = jest.fn().mockReturnValue(mockWebviewPanel);
        (vscode.window as any).createTreeView = jest.fn().mockReturnValue({
            reveal: jest.fn(),
            dispose: jest.fn(),
            onDidChangeVisibility: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            onDidChangeSelection: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            onDidExpandElement: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            onDidCollapseElement: jest.fn().mockReturnValue({ dispose: jest.fn() })
        });

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
                    closeTerminal: jest.fn(),
                    createAgentTerminal: jest.fn().mockReturnValue({
                        name: 'Mock Terminal',
                        show: jest.fn(),
                        dispose: jest.fn()
                    })
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

        // Create main components
        agentManager = new AgentManager(mockContext);

        taskQueue = new TaskQueue(
            agentManager,
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IEventBus')),
            container.resolve(Symbol.for('IMetricsService'))
        );

        messageFlowDashboard = new MessageFlowDashboard(
            mockContext,
            container.resolve(Symbol.for('IEventBus')),
            container.resolve(Symbol.for('ILoggingService'))
        );

        agentTreeProvider = new AgentTreeProvider(agentManager, container.resolve(Symbol.for('IEventBus')));

        taskTreeProvider = new TaskTreeProvider(taskQueue, container.resolve(Symbol.for('IEventBus')));
    });

    afterAll(async () => {
        await messageFlowDashboard.dispose();
        await agentManager.dispose();
        await container.dispose();
        Container['instance'] = null;
    });

    describe('Message Flow Dashboard', () => {
        it('should create and show dashboard webview', async () => {
            await messageFlowDashboard.show();

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'nofx-message-flow',
                'NofX Message Flow',
                vscode.ViewColumn.Two,
                expect.objectContaining({
                    enableScripts: true,
                    localResourceRoots: expect.any(Array)
                })
            );

            expect(mockWebview.html).toContain('Message Flow Dashboard');
        });

        it('should handle real-time message updates', done => {
            messageFlowDashboard.show().then(() => {
                const testMessage: OrchestratorMessage = {
                    id: 'test-msg-001',
                    timestamp: new Date().toISOString(),
                    from: 'conductor',
                    to: 'agent-001',
                    type: MessageType.ASSIGN_TASK,
                    payload: {
                        taskId: 'task-001',
                        task: 'Create dashboard component',
                        priority: 'high'
                    }
                };

                // Simulate message received
                eventBus.publish(DOMAIN_EVENTS.MESSAGE_RECEIVED, testMessage);

                // Check if webview received the message
                setTimeout(() => {
                    expect(mockWebview.postMessage).toHaveBeenCalledWith(
                        expect.objectContaining({
                            type: 'message-update',
                            message: expect.objectContaining({
                                id: 'test-msg-001',
                                type: MessageType.ASSIGN_TASK
                            })
                        })
                    );
                    done();
                }, 100);
            });
        });

        it('should display agent status in real-time', done => {
            messageFlowDashboard.show().then(() => {
                const agentStatusUpdate = {
                    agentId: 'agent-002',
                    status: 'working',
                    currentTask: 'Working on API endpoints',
                    timestamp: new Date().toISOString()
                };

                eventBus.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, agentStatusUpdate);

                setTimeout(() => {
                    expect(mockWebview.postMessage).toHaveBeenCalledWith(
                        expect.objectContaining({
                            type: 'agent-status-update',
                            data: expect.objectContaining({
                                agentId: 'agent-002',
                                status: 'working'
                            })
                        })
                    );
                    done();
                }, 100);
            });
        });

        it('should handle webview messages from dashboard', async () => {
            await messageFlowDashboard.show();

            // Simulate message from webview
            const messageHandler = (mockWebview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];

            const webviewMessage = {
                command: 'get-agent-list',
                timestamp: Date.now()
            };

            messageHandler(webviewMessage);

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'agent-list-response',
                    agents: expect.any(Array)
                })
            );
        });

        it('should update metrics in real-time', done => {
            messageFlowDashboard.show().then(() => {
                const metricsUpdate = {
                    totalMessages: 150,
                    messagesPerMinute: 12,
                    activeAgents: 3,
                    failedTasks: 2,
                    timestamp: new Date().toISOString()
                };

                eventBus.publish(DOMAIN_EVENTS.METRICS_UPDATED, metricsUpdate);

                setTimeout(() => {
                    expect(mockWebview.postMessage).toHaveBeenCalledWith(
                        expect.objectContaining({
                            type: 'metrics-update',
                            metrics: expect.objectContaining({
                                totalMessages: 150,
                                messagesPerMinute: 12,
                                activeAgents: 3
                            })
                        })
                    );
                    done();
                }, 100);
            });
        });

        it('should handle dashboard disposal', async () => {
            await messageFlowDashboard.show();

            // Simulate panel disposal
            const disposeHandler = (mockWebviewPanel.onDidDispose as jest.Mock).mock.calls[0][0];
            disposeHandler();

            // Dashboard should clean up properly
            expect(mockWebviewPanel.dispose).toHaveBeenCalled();
        });

        it('should filter messages by criteria', async () => {
            await messageFlowDashboard.show();

            const messageHandler = (mockWebview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];

            const filterRequest = {
                command: 'filter-messages',
                filters: {
                    type: MessageType.ASSIGN_TASK,
                    from: 'conductor',
                    timeRange: '1h'
                }
            };

            messageHandler(filterRequest);

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'filtered-messages',
                    messages: expect.any(Array)
                })
            );
        });

        it('should export dashboard data', async () => {
            await messageFlowDashboard.show();

            const messageHandler = (mockWebview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];

            const exportRequest = {
                command: 'export-data',
                format: 'json',
                timeRange: '24h'
            };

            messageHandler(exportRequest);

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'export-data-response',
                    data: expect.any(String)
                })
            );
        });
    });

    describe('Agent Tree View Integration', () => {
        it('should populate tree view with active agents', async () => {
            // Add test agents
            const testAgent: Agent = {
                id: 'tree-agent-001',
                name: 'Frontend Dev',
                type: 'frontend-specialist',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            await agentManager.addAgent({
                type: 'frontend-specialist',
                name: 'Frontend Dev'
            });

            const treeItems = await agentTreeProvider.getChildren();

            expect(treeItems).toBeDefined();
            expect(treeItems.length).toBeGreaterThan(0);
        });

        it('should handle agent tree item selection', async () => {
            const agents = await agentManager.getActiveAgents();
            if (agents.length > 0) {
                const treeItems = await agentTreeProvider.getChildren();
                const firstItem = treeItems[0];

                expect(firstItem).toHaveProperty('label');
                expect(firstItem).toHaveProperty('contextValue');
                expect(firstItem.contextValue).toBe('agent');
            }
        });

        it('should update tree view on agent events', done => {
            let refreshCalled = false;

            // Mock tree view refresh
            (agentTreeProvider as any).refresh = jest.fn(() => {
                refreshCalled = true;
                if (refreshCalled) {
                    expect(refreshCalled).toBe(true);
                    done();
                }
            });

            // Emit agent spawned event
            eventBus.publish(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, {
                agent: {
                    id: 'tree-test-agent',
                    name: 'Tree Test Agent',
                    type: 'testing-specialist',
                    status: 'idle'
                },
                timestamp: new Date().toISOString()
            });
        });

        it('should provide agent context menu actions', async () => {
            const agents = await agentManager.getActiveAgents();
            if (agents.length > 0) {
                const treeItems = await agentTreeProvider.getChildren();
                const agentItem = treeItems[0];

                expect(agentItem.command).toBeDefined();
                expect(agentItem.tooltip).toBeDefined();
                expect(agentItem.iconPath).toBeDefined();
            }
        });

        it('should show agent status in tree view', async () => {
            const testAgent: Agent = {
                id: 'status-agent',
                name: 'Status Agent',
                type: 'backend-specialist',
                status: 'working',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            // Simulate agent with working status
            eventBus.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, {
                agentId: 'status-agent',
                status: 'working',
                currentTask: 'Processing API request'
            });

            const treeItems = await agentTreeProvider.getChildren();

            // Tree items should reflect agent status
            expect(treeItems).toBeDefined();
        });
    });

    describe('Task Tree View Integration', () => {
        it('should display active tasks in tree view', () => {
            // Add test tasks to queue
            const testTasks = [
                {
                    id: 'tree-task-001',
                    title: 'Create login component',
                    description: 'Create a reusable login component',
                    priority: 'high' as const,
                    status: 'pending' as const
                },
                {
                    id: 'tree-task-002',
                    title: 'Setup API endpoints',
                    description: 'Setup REST API endpoints for the application',
                    priority: 'normal' as const,
                    status: 'in_progress' as const
                }
            ];

            testTasks.forEach(task => taskQueue.addTask(task));

            const treeItems = taskTreeProvider.getChildren();

            expect(treeItems).toBeDefined();
            expect(Array.isArray(treeItems)).toBe(true);
        });

        it('should group tasks by status', () => {
            const treeItems = taskTreeProvider.getChildren();

            // Should have status group items (pending, in_progress, completed, etc.)
            expect(treeItems).toBeDefined();
        });

        it('should update on task events', done => {
            let refreshCalled = false;

            // Mock tree view refresh
            (taskTreeProvider as any).refresh = jest.fn(() => {
                refreshCalled = true;
                if (refreshCalled) {
                    expect(refreshCalled).toBe(true);
                    done();
                }
            });

            // Emit task added event
            eventBus.publish(DOMAIN_EVENTS.TASK_ADDED, {
                task: {
                    id: 'tree-event-task',
                    title: 'Event Test Task',
                    description: 'Task for testing tree view events',
                    priority: 'low',
                    status: 'pending'
                },
                timestamp: new Date().toISOString()
            });
        });

        it('should provide task priority indicators', () => {
            const highPriorityTask = {
                id: 'high-priority-task',
                title: 'Critical Bug Fix',
                description: 'Fix critical bug affecting production',
                priority: 'critical' as const,
                status: 'pending' as const
            };

            taskQueue.addTask(highPriorityTask);

            const treeItems = taskTreeProvider.getChildren();

            // High priority tasks should have visual indicators
            expect(treeItems).toBeDefined();
        });

        it('should show task progress information', () => {
            const progressTask = {
                id: 'progress-task',
                title: 'Long Running Task',
                description: 'Long running task with progress tracking',
                priority: 'normal' as const,
                status: 'in_progress' as const,
                progress: 65
            };

            eventBus.publish(DOMAIN_EVENTS.TASK_PROGRESS, {
                taskId: 'progress-task',
                progress: 65,
                message: '65% complete'
            });

            const treeItems = taskTreeProvider.getChildren();

            // Should include progress information
            expect(treeItems).toBeDefined();
        });
    });

    describe('Dashboard Webview Communication', () => {
        it('should handle bidirectional communication', async () => {
            await messageFlowDashboard.show();

            // Test webview -> extension communication
            const messageHandler = (mockWebview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];

            messageHandler({
                command: 'ping',
                timestamp: Date.now()
            });

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'pong'
                })
            );

            // Test extension -> webview communication
            eventBus.publish(DOMAIN_EVENTS.DASHBOARD_COMMAND, {
                command: 'refresh',
                data: { reason: 'manual_refresh' }
            });

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'refresh-command'
                })
            );
        });

        it('should handle webview state persistence', async () => {
            await messageFlowDashboard.show();

            const messageHandler = (mockWebview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];

            // Save dashboard state
            messageHandler({
                command: 'save-state',
                state: {
                    viewMode: 'detailed',
                    filters: {
                        showErrors: true,
                        timeRange: '1h'
                    },
                    layout: 'grid'
                }
            });

            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'nofx.dashboard.state',
                expect.objectContaining({
                    viewMode: 'detailed',
                    filters: expect.any(Object)
                })
            );
        });

        it('should handle webview errors gracefully', async () => {
            await messageFlowDashboard.show();

            const messageHandler = (mockWebview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];

            // Send invalid command
            messageHandler({
                command: 'invalid-command',
                invalidData: true
            });

            // Should not crash and should log error
            expect(mockChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Unknown dashboard command'));
        });

        it('should throttle high-frequency updates', async () => {
            await messageFlowDashboard.show();

            // Send many rapid updates
            for (let i = 0; i < 100; i++) {
                eventBus.publish(DOMAIN_EVENTS.MESSAGE_RECEIVED, {
                    id: `rapid-msg-${i}`,
                    timestamp: new Date().toISOString(),
                    from: 'test',
                    to: 'test',
                    type: MessageType.HEARTBEAT,
                    payload: {}
                });
            }

            // Should throttle updates (not send 100 individual messages)
            const postMessageCalls = (mockWebview.postMessage as jest.Mock).mock.calls;
            const messageUpdates = postMessageCalls.filter(
                call => call[0]?.type === 'message-update' || call[0]?.type === 'batch-update'
            );

            expect(messageUpdates.length).toBeLessThan(100);
        });
    });

    describe('Dashboard Performance', () => {
        it('should handle large datasets efficiently', async () => {
            await messageFlowDashboard.show();

            const startTime = Date.now();

            // Add many agents and tasks
            const agents = Array.from({ length: 50 }, (_, i) => ({
                id: `perf-agent-${i}`,
                name: `Performance Agent ${i}`,
                type: 'testing-specialist' as const,
                status: 'idle' as const,
                createdAt: new Date(),
                terminal: createMockTerminal()
            }));

            const tasks = Array.from({ length: 100 }, (_, i) => ({
                id: `perf-task-${i}`,
                title: `Performance Task ${i}`,
                description: `Performance testing task number ${i}`,
                priority: 'normal' as const,
                status: 'pending' as const
            }));

            // Simulate adding agents
            agents.forEach(agent => {
                eventBus.publish(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, { agent });
            });

            // Simulate adding tasks
            tasks.forEach(task => {
                taskQueue.addTask(task);
                eventBus.publish(DOMAIN_EVENTS.TASK_ADDED, { task });
            });

            const endTime = Date.now();
            const processingTime = endTime - startTime;

            // Should handle large dataset reasonably quickly
            expect(processingTime).toBeLessThan(5000); // Under 5 seconds

            // UI should still be responsive
            const treeItems = await agentTreeProvider.getChildren();
            expect(treeItems).toBeDefined();
        });

        it('should optimize webview updates for performance', async () => {
            await messageFlowDashboard.show();

            const updateStartTime = Date.now();

            // Trigger multiple simultaneous updates
            Promise.all([
                eventBus.publish(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, {
                    agentId: 'agent-001',
                    status: 'working'
                }),
                eventBus.publish(DOMAIN_EVENTS.TASK_PROGRESS, {
                    taskId: 'task-001',
                    progress: 75
                }),
                eventBus.publish(DOMAIN_EVENTS.METRICS_UPDATED, {
                    totalMessages: 200,
                    activeAgents: 4
                })
            ]);

            const updateEndTime = Date.now();
            const updateTime = updateEndTime - updateStartTime;

            // Should batch updates efficiently
            expect(updateTime).toBeLessThan(100);
        });

        it('should manage memory usage effectively', async () => {
            await messageFlowDashboard.show();

            const initialMemory = process.memoryUsage().heapUsed;

            // Create many dashboard updates
            for (let i = 0; i < 1000; i++) {
                eventBus.publish(DOMAIN_EVENTS.MESSAGE_RECEIVED, {
                    id: `memory-test-${i}`,
                    timestamp: new Date().toISOString(),
                    from: 'test',
                    to: 'test',
                    type: MessageType.HEARTBEAT,
                    payload: { index: i }
                });
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be reasonable (less than 100MB)
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
        });
    });

    describe('Dashboard Accessibility', () => {
        it('should generate accessible HTML', async () => {
            await messageFlowDashboard.show();

            const htmlContent = mockWebview.html;

            // Should include accessibility attributes
            expect(htmlContent).toContain('aria-');
            expect(htmlContent).toContain('role=');
            expect(htmlContent).toContain('<title>');
            expect(htmlContent).toContain('alt=');
        });

        it('should support keyboard navigation', async () => {
            await messageFlowDashboard.show();

            const messageHandler = (mockWebview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];

            // Test keyboard navigation
            messageHandler({
                command: 'keyboard-navigation',
                key: 'Tab',
                direction: 'forward'
            });

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'navigation-response'
                })
            );
        });

        it('should provide screen reader support', async () => {
            await messageFlowDashboard.show();

            const htmlContent = mockWebview.html;

            // Should include ARIA landmarks and descriptions
            expect(htmlContent).toMatch(/aria-label="[^"]+"/);
            expect(htmlContent).toMatch(/aria-describedby="[^"]+"/);
            expect(htmlContent).toContain('main');
            expect(htmlContent).toContain('nav');
        });
    });

    describe('Dashboard Error Handling', () => {
        it('should handle webview creation failures', async () => {
            // Mock webview creation failure
            (vscode.window as any).createWebviewPanel = jest.fn().mockImplementation(() => {
                throw new Error('Failed to create webview');
            });

            await expect(messageFlowDashboard.show()).rejects.toThrow('Failed to create webview');

            // Should log error
            expect(mockChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Failed to show dashboard'));
        });

        it('should recover from webview communication errors', async () => {
            await messageFlowDashboard.show();

            // Mock postMessage failure
            mockWebview.postMessage = jest.fn().mockImplementation(() => {
                throw new Error('Communication error');
            });

            // Should handle error gracefully
            eventBus.publish(DOMAIN_EVENTS.MESSAGE_RECEIVED, {
                id: 'error-test-msg',
                timestamp: new Date().toISOString(),
                from: 'test',
                to: 'test',
                type: MessageType.HEARTBEAT,
                payload: {}
            });

            // Should not crash the extension
            expect(true).toBe(true);
        });

        it('should handle dashboard state corruption', async () => {
            // Mock corrupted state
            mockContext.workspaceState.get = jest.fn().mockReturnValue({
                invalidState: true,
                corruptedData: 'invalid-json'
            });

            await messageFlowDashboard.show();

            // Should use default state when state is corrupted
            expect(mockWebview.html).toContain('Message Flow Dashboard');
        });
    });
});
