import * as vscode from 'vscode';
import { AgentManager } from '../../../agents/AgentManager';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { MetricsService } from '../../../services/MetricsService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { Container } from '../../../services/Container';
import { SERVICE_TOKENS } from '../../../services/interfaces';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';

describe('Command Integration', () => {
    let container: Container;
    let agentManager: AgentManager;
    let eventBus: EventBus;
    let mockContext: vscode.ExtensionContext;
    let mockChannel: vscode.OutputChannel;
    const registeredCommands: Map<string, vscode.Disposable> = new Map();

    beforeAll(() => {
        // Setup mock context
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

        // Mock VS Code commands
        (vscode.commands as any).registerCommand = jest.fn((command: string, callback: (...args: any[]) => any) => {
            const disposable = { dispose: jest.fn() };
            registeredCommands.set(command, disposable);
            return disposable;
        });

        (vscode.commands as any).executeCommand = jest.fn();

        // Mock workspace folders
        (vscode.workspace as any).workspaceFolders = [
            {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'Test Workspace',
                index: 0
            }
        ];

        // Setup container and services
        container = Container.getInstance();
        eventBus = new EventBus();

        container.registerInstance(SERVICE_TOKENS.EventBus, eventBus);
        container.register(SERVICE_TOKENS.ConfigurationService, () => new ConfigurationService(), 'singleton');
        container.register(
            SERVICE_TOKENS.LoggingService,
            c => new LoggingService(c.resolve(SERVICE_TOKENS.ConfigurationService), mockChannel),
            'singleton'
        );
        container.register(
            SERVICE_TOKENS.MetricsService,
            c =>
                new MetricsService(
                    c.resolve(SERVICE_TOKENS.ConfigurationService),
                    c.resolve(SERVICE_TOKENS.LoggingService)
                ),
            'singleton'
        );

        // Register mock services
        container.register(
            SERVICE_TOKENS.TerminalManager,
            () =>
                ({
                    createTerminal: jest.fn(),
                    getTerminal: jest.fn(),
                    closeTerminal: jest.fn()
                }) as any,
            'singleton'
        );

        container.register(
            SERVICE_TOKENS.AgentLifecycleManager,
            () =>
                ({
                    spawnAgent: jest.fn(),
                    terminateAgent: jest.fn(),
                    getAgentStatus: jest.fn()
                }) as any,
            'singleton'
        );

        // NotificationService mock (AgentNotificationService doesn't exist as a token)
        container.register(
            SERVICE_TOKENS.NotificationService,
            () =>
                ({
                    showInformation: jest.fn(),
                    showWarning: jest.fn(),
                    showError: jest.fn(),
                    showQuickPick: jest.fn(),
                    showInputBox: jest.fn(),
                    notifyAgentSpawned: jest.fn(),
                    notifyAgentTerminated: jest.fn(),
                    notifyTaskAssigned: jest.fn()
                }) as any,
            'singleton'
        );

        // Register WorktreeManager mock
        container.register(
            SERVICE_TOKENS.WorktreeManager,
            () =>
                ({
                    isEnabled: jest.fn().mockReturnValue(false),
                    createWorktree: jest.fn(),
                    removeWorktree: jest.fn(),
                    listWorktrees: jest.fn().mockResolvedValue([]),
                    hasWorktree: jest.fn().mockReturnValue(false),
                    getWorktreePath: jest.fn(),
                    mergeWorktree: jest.fn(),
                    enable: jest.fn(),
                    disable: jest.fn(),
                    dispose: jest.fn()
                }) as any,
            'singleton'
        );

        // Create agent manager - only takes context parameter now
        agentManager = new AgentManager(mockContext);
    });

    afterAll(async () => {
        await agentManager.dispose();
        await container.dispose();
        Container['instance'] = null;
    });

    describe('Core Extension Commands', () => {
        it('should register nofx.openConductorTerminal command', () => {
            // Import and activate extension
            const { activate } = require('../../../extension');
            activate(mockContext);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'nofx.openConductorTerminal',
                expect.any(Function)
            );
            expect(registeredCommands.has('nofx.openConductorTerminal')).toBe(true);
        });

        it('should register nofx.startConductor command', () => {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nofx.startConductor', expect.any(Function));
            expect(registeredCommands.has('nofx.startConductor')).toBe(true);
        });

        it('should register nofx.addAgent command', () => {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nofx.addAgent', expect.any(Function));
            expect(registeredCommands.has('nofx.addAgent')).toBe(true);
        });

        it('should register nofx.openMessageFlow command', () => {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nofx.openMessageFlow', expect.any(Function));
            expect(registeredCommands.has('nofx.openMessageFlow')).toBe(true);
        });

        it('should register nofx.restoreAgents command', () => {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nofx.restoreAgents', expect.any(Function));
            expect(registeredCommands.has('nofx.restoreAgents')).toBe(true);
        });

        it('should register nofx.clearPersistence command', () => {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nofx.clearPersistence', expect.any(Function));
            expect(registeredCommands.has('nofx.clearPersistence')).toBe(true);
        });

        it('should register nofx.browseAgentTemplates command', () => {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'nofx.browseAgentTemplates',
                expect.any(Function)
            );
            expect(registeredCommands.has('nofx.browseAgentTemplates')).toBe(true);
        });

        it('should register nofx.exportSessions command', () => {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nofx.exportSessions', expect.any(Function));
            expect(registeredCommands.has('nofx.exportSessions')).toBe(true);
        });
    });

    describe('Worktree Commands', () => {
        it('should register nofx.toggleWorktrees command', () => {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nofx.toggleWorktrees', expect.any(Function));
            expect(registeredCommands.has('nofx.toggleWorktrees')).toBe(true);
        });

        it('should register nofx.mergeAgentWork command', () => {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nofx.mergeAgentWork', expect.any(Function));
            expect(registeredCommands.has('nofx.mergeAgentWork')).toBe(true);
        });

        it('should register nofx.createWorktree command', () => {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nofx.createWorktree', expect.any(Function));
            expect(registeredCommands.has('nofx.createWorktree')).toBe(true);
        });
    });

    describe('Agent Management Commands', () => {
        it('should handle addAgent command execution', async () => {
            const addAgentHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.addAgent'
            )?.[1];

            expect(addAgentHandler).toBeDefined();

            // Mock quick pick
            (vscode.window as any).showQuickPick = jest.fn().mockResolvedValue({
                label: 'Frontend Specialist',
                detail: 'React, Vue, CSS expert',
                value: 'frontend-specialist'
            });

            // Mock input box
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue('Test Agent');

            const agentSpawnPromise = new Promise(resolve => {
                eventBus.subscribe(DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, resolve);
            });

            // Execute command
            await addAgentHandler();

            // Wait for agent spawn event
            const spawnEvent = await Promise.race([
                agentSpawnPromise,
                new Promise(resolve => setTimeout(() => resolve('timeout'), 1000))
            ]);

            expect(spawnEvent).not.toBe('timeout');
        });

        it('should handle restoreAgents command execution', async () => {
            const restoreHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.restoreAgents'
            )?.[1];

            expect(restoreHandler).toBeDefined();

            // Mock saved agents
            mockContext.globalState.get = jest.fn().mockReturnValue([
                {
                    id: 'agent-001',
                    type: 'frontend-specialist',
                    name: 'Frontend Dev',
                    status: 'idle',
                    createdAt: new Date().toISOString()
                }
            ]);

            // Execute command
            await restoreHandler();

            // Should attempt to restore agents
            expect(mockContext.globalState.get).toHaveBeenCalledWith('nofx.agents', []);
        });

        it('should handle clearPersistence command execution', async () => {
            const clearHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.clearPersistence'
            )?.[1];

            expect(clearHandler).toBeDefined();

            // Mock confirmation
            (vscode.window as any).showWarningMessage = jest.fn().mockResolvedValue('Yes');

            // Execute command
            await clearHandler();

            // Should clear global state
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'This will clear all saved agents and session data. Are you sure?',
                'Yes',
                'No'
            );
        });
    });

    describe('Conductor Commands', () => {
        it('should handle openConductorTerminal command execution', async () => {
            const openHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.openConductorTerminal'
            )?.[1];

            expect(openHandler).toBeDefined();

            // Mock terminal creation
            const mockTerminal = {
                show: jest.fn(),
                sendText: jest.fn(),
                dispose: jest.fn()
            };

            (vscode.window as any).createTerminal = jest.fn().mockReturnValue(mockTerminal);

            // Execute command
            await openHandler();

            // Should create terminal
            expect(vscode.window.createTerminal).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: expect.stringContaining('Conductor')
                })
            );
        });

        it('should handle startConductor command execution', async () => {
            const startHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.startConductor'
            )?.[1];

            expect(startHandler).toBeDefined();

            // Mock team selection
            (vscode.window as any).showQuickPick = jest.fn().mockResolvedValue({
                label: 'Full Stack Team',
                detail: 'Frontend + Backend + Testing',
                value: 'fullstack'
            });

            // Execute command
            await startHandler();

            // Should show team selection
            expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        label: expect.stringContaining('Team')
                    })
                ]),
                expect.objectContaining({
                    placeHolder: expect.stringContaining('team')
                })
            );
        });
    });

    describe('Dashboard Commands', () => {
        it('should handle openMessageFlow command execution', async () => {
            const dashboardHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.openMessageFlow'
            )?.[1];

            expect(dashboardHandler).toBeDefined();

            // Mock webview creation
            const mockWebview = {
                html: '',
                postMessage: jest.fn(),
                onDidReceiveMessage: jest.fn()
            };

            const mockPanel = {
                webview: mockWebview,
                reveal: jest.fn(),
                dispose: jest.fn(),
                onDidDispose: jest.fn()
            };

            (vscode.window as any).createWebviewPanel = jest.fn().mockReturnValue(mockPanel);

            // Execute command
            await dashboardHandler();

            // Should create webview panel
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'nofx-message-flow',
                'NofX Message Flow',
                expect.any(Number),
                expect.objectContaining({
                    enableScripts: true
                })
            );
        });

        it('should handle exportSessions command execution', async () => {
            const exportHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.exportSessions'
            )?.[1];

            expect(exportHandler).toBeDefined();

            // Mock file save dialog
            (vscode.window as any).showSaveDialog = jest.fn().mockResolvedValue(vscode.Uri.file('/test/export.json'));

            // Mock writeFile
            (vscode.workspace as any).fs = {
                writeFile: jest.fn()
            };

            // Execute command
            await exportHandler();

            // Should show save dialog
            expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
                expect.objectContaining({
                    defaultUri: expect.any(Object),
                    filters: expect.objectContaining({
                        'JSON Files': ['json']
                    })
                })
            );
        });
    });

    describe('Template Commands', () => {
        it('should handle browseAgentTemplates command execution', async () => {
            const browseHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.browseAgentTemplates'
            )?.[1];

            expect(browseHandler).toBeDefined();

            // Mock webview creation for template browser
            const mockWebview = {
                html: '',
                postMessage: jest.fn(),
                onDidReceiveMessage: jest.fn()
            };

            const mockPanel = {
                webview: mockWebview,
                reveal: jest.fn(),
                dispose: jest.fn(),
                onDidDispose: jest.fn()
            };

            (vscode.window as any).createWebviewPanel = jest.fn().mockReturnValue(mockPanel);

            // Execute command
            await browseHandler();

            // Should create webview panel for templates
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'nofx-templates',
                'NofX Agent Templates',
                expect.any(Number),
                expect.objectContaining({
                    enableScripts: true
                })
            );
        });
    });

    describe('Command Error Handling', () => {
        it('should handle command execution errors gracefully', async () => {
            const addAgentHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.addAgent'
            )?.[1];

            // Mock error in quick pick
            (vscode.window as any).showQuickPick = jest.fn().mockRejectedValue(new Error('User cancelled'));

            // Mock error notification
            (vscode.window as any).showErrorMessage = jest.fn();

            // Execute command (should not throw)
            await expect(addAgentHandler()).resolves.not.toThrow();

            // Should show error message
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Failed'));
        });

        it('should handle workspace not available errors', async () => {
            // Mock no workspace
            (vscode.workspace as any).workspaceFolders = undefined;

            const startHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.startConductor'
            )?.[1];

            (vscode.window as any).showWarningMessage = jest.fn();

            await startHandler();

            // Should show workspace warning
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('workspace'));
        });

        it('should handle invalid agent types gracefully', async () => {
            const addAgentHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.addAgent'
            )?.[1];

            // Mock invalid selection
            (vscode.window as any).showQuickPick = jest.fn().mockResolvedValue(undefined);

            // Execute command (should not throw)
            await expect(addAgentHandler()).resolves.not.toThrow();

            // Should handle gracefully without creating agent
            const agents = agentManager.getActiveAgents();
            expect(agents.length).toBe(0);
        });
    });

    describe('Command Context Integration', () => {
        it('should integrate with extension context subscriptions', () => {
            const { activate } = require('../../../extension');
            activate(mockContext);

            // All registered commands should be added to subscriptions
            expect(mockContext.subscriptions.length).toBeGreaterThan(0);

            // Each registered command should be in subscriptions
            registeredCommands.forEach(disposable => {
                expect(mockContext.subscriptions).toContain(disposable);
            });
        });

        it('should dispose commands when extension deactivates', async () => {
            const { deactivate } = require('../../../extension');

            if (deactivate) {
                await deactivate();
            }

            // All disposables should be called
            registeredCommands.forEach(disposable => {
                expect(disposable.dispose).toHaveBeenCalled();
            });
        });

        it('should handle commands when extension is not active', async () => {
            // Simulate extension not fully activated
            const addAgentHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.addAgent'
            )?.[1];

            (vscode.window as any).showWarningMessage = jest.fn();

            // Execute command before activation completes
            await addAgentHandler();

            // Should handle gracefully
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalledWith(expect.stringContaining('error'));
        });
    });

    describe('Command Performance', () => {
        it('should execute commands within reasonable time', async () => {
            const startTime = Date.now();

            const openHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.openConductorTerminal'
            )?.[1];

            await openHandler();

            const executionTime = Date.now() - startTime;
            expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
        });

        it('should handle concurrent command executions', async () => {
            const handlers = ['nofx.openConductorTerminal', 'nofx.addAgent', 'nofx.openMessageFlow'].map(
                cmd => (vscode.commands.registerCommand as jest.Mock).mock.calls.find(call => call[0] === cmd)?.[1]
            );

            // Mock all user interactions to resolve immediately
            (vscode.window as any).showQuickPick = jest.fn().mockResolvedValue({ value: 'test' });
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue('Test');
            (vscode.window as any).createWebviewPanel = jest.fn().mockReturnValue({
                webview: { html: '', postMessage: jest.fn(), onDidReceiveMessage: jest.fn() },
                reveal: jest.fn(),
                dispose: jest.fn(),
                onDidDispose: jest.fn()
            });

            // Execute all commands concurrently
            const promises = handlers.filter(h => h).map(handler => handler());

            // Should not throw and all should complete
            const results = await Promise.allSettled(promises);
            const failures = results.filter(r => r.status === 'rejected');

            expect(failures.length).toBe(0);
        });
    });

    describe('Command State Management', () => {
        it('should maintain command state across executions', async () => {
            // Add an agent
            const addAgentHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.addAgent'
            )?.[1];

            (vscode.window as any).showQuickPick = jest.fn().mockResolvedValue({
                label: 'Frontend Specialist',
                value: 'frontend-specialist'
            });
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue('Test Agent');

            await addAgentHandler();

            // Check state is maintained
            const agents = agentManager.getActiveAgents();
            expect(agents.length).toBeGreaterThan(0);

            // Export sessions should include the agent
            const exportHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.exportSessions'
            )?.[1];

            (vscode.window as any).showSaveDialog = jest.fn().mockResolvedValue(vscode.Uri.file('/test/export.json'));
            (vscode.workspace as any).fs = {
                writeFile: jest.fn()
            };

            await exportHandler();

            // Should have written agent data
            expect((vscode.workspace as any).fs.writeFile).toHaveBeenCalledWith(
                expect.any(Object),
                expect.stringContaining('agent')
            );
        });

        it('should handle state persistence across command invocations', async () => {
            // Clear and restore agents
            const clearHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.clearPersistence'
            )?.[1];

            (vscode.window as any).showWarningMessage = jest.fn().mockResolvedValue('Yes');

            await clearHandler();

            // State should be cleared
            expect(mockContext.globalState.update).toHaveBeenCalledWith('nofx.agents', []);

            // Restore should work with empty state
            const restoreHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                call => call[0] === 'nofx.restoreAgents'
            )?.[1];

            mockContext.globalState.get = jest.fn().mockReturnValue([]);

            await restoreHandler();

            // Should handle empty state gracefully
            const agents = agentManager.getActiveAgents();
            expect(agents.length).toBe(0);
        });
    });
});
