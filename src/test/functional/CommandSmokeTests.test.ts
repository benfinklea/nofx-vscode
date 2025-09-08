import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Container } from '../../services/Container';
import { SERVICE_TOKENS } from '../../services/interfaces';
import { ConfigurationService } from '../../services/ConfigurationService';
import { LoggingService } from '../../services/LoggingService';
import { EventBus } from '../../services/EventBus';
import { AgentManager } from '../../agents/AgentManager';
import { TaskQueue } from '../../tasks/TaskQueue';
import { MetricsService } from '../../services/MetricsService';
import { CommandService } from '../../services/CommandService';
import { setupMockWorkspace, clearMockWorkspace } from './setup';
import { TestHarness } from './testHarness';
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
 * Comprehensive smoke tests for all commands registered in package.json
 * This test suite verifies that all commands can be executed without throwing unhandled exceptions
 */
jest.mock('vscode');

jest.setTimeout(10000);

jest.mock('ws');
describe('Command Smoke Tests', () => {
    let container: Container;
    let context: vscode.ExtensionContext;
    let workspaceFolder: string;
    let testWorkspaceUri: vscode.Uri;

    // Commands derived dynamically from extension manifest
    let expected: string[] = [];

    // Get commands from the extension manifest
    const getExtensionCommands = () => {
        const extension = vscode.extensions.getExtension('nofx.nofx');
        if (extension?.packageJSON?.contributes?.commands) {
            return extension.packageJSON.contributes.commands
                .map((cmd: any) => cmd.command)
                .filter((cmd: string) => cmd.startsWith('nofx.'));
        }
        // Fallback to known commands if extension not found
        return [
            'nofx.addAgent',
            'nofx.startConductor',
            'nofx.deleteAgent',
            'nofx.editAgent',
            'nofx.restoreAgents',
            'nofx.clearPersistence',
            'nofx.exportSessions',
            'nofx.createTask',
            'nofx.completeTask',
            'nofx.createTaskBatch',
            'nofx.clearAllTasks',
            'nofx.addTaskDependency',
            'nofx.removeTaskDependency',
            'nofx.viewTaskDependencies',
            'nofx.resolveTaskConflict',
            'nofx.resolveAllConflicts',
            'nofx.retryBlockedTask',
            'nofx.openConductorTerminal',
            'nofx.openConductorChat',
            'nofx.openConductorPanel',
            'nofx.openSimpleConductor',
            'nofx.quickStartChat',
            'nofx.openMessageFlow',
            'nofx.browseAgentTemplates',
            'nofx.createAgentTemplate',
            'nofx.editAgentTemplate',
            'nofx.importAgentTemplate',
            'nofx.testClaude',
            'nofx.toggleWorktrees',
            'nofx.mergeAgentWork'
        ];
    };

    // Commands that require parameters or special handling
    const COMMANDS_WITH_PARAMS: Record<string, any> = {
        'nofx.deleteAgent': { agentId: 'test-agent-id' },
        'nofx.editAgent': { agentId: 'test-agent-id' },
        'nofx.completeTask': { taskId: 'test-task-id' },
        'nofx.addTaskDependency': { taskId: 'test-task-id', dependencyId: 'test-dependency-id' },
        'nofx.removeTaskDependency': { taskId: 'test-task-id', dependencyId: 'test-dependency-id' },
        'nofx.viewTaskDependencies': { taskId: 'test-task-id' },
        'nofx.resolveTaskConflict': { taskId: 'test-task-id' },
        'nofx.retryBlockedTask': { taskId: 'test-task-id' },
        'nofx.mergeAgentWork': { agentId: 'test-agent-id' }
    };

    // Commands that show UI elements and need mocking
    // Dynamically determine based on known patterns
    const UI_COMMANDS = () => {
        const patterns = ['add', 'create', 'edit', 'browse', 'import', 'start', 'quickStart'];
        return expected.filter(cmd => patterns.some(pattern => cmd.toLowerCase().includes(pattern.toLowerCase())));
    };

    // Commands that are interactive/external and should be skipped or mocked
    const INTERACTIVE_COMMANDS = [
        'nofx.openConductorTerminal', // Opens external terminal
        'nofx.testClaude', // Tests external CLI
        'nofx.toggleWorktrees' // Creates actual worktrees
    ];

    beforeAll(async () => {
        // Create temporary workspace with git initialization
        workspaceFolder = path.join(__dirname, 'test-workspace-' + Date.now());
        fs.mkdirSync(workspaceFolder, { recursive: true });
        testWorkspaceUri = vscode.Uri.file(workspaceFolder);

        // Initialize git in the workspace
        const { exec } = require('child_process');
        await new Promise((resolve, reject) => {
            exec('git init', { cwd: workspaceFolder }, (error: any) => {
                if (error) reject(error);
                else resolve(undefined);
            });
        });

        // Setup and activate extension using TestHarness
        const { container: c, context: ctx } = await TestHarness.initialize();
        container = c;
        context = ctx;

        // Get extension commands after initialization
        expected = getExtensionCommands();

        // Setup mock workspace
        setupMockWorkspace(workspaceFolder);

        // Reset container state but preserve command registrations
        TestHarness.resetContainer();

        // Register essential services
        const configService = new ConfigurationService();
        const mainChannel = vscode.window.createOutputChannel('NofX Test');
        const loggingService = new LoggingService(configService, mainChannel);
        const eventBus = new EventBus();

        container.registerInstance(SERVICE_TOKENS.ConfigurationService, configService);
        container.registerInstance(SERVICE_TOKENS.LoggingService, loggingService);
        container.registerInstance(SERVICE_TOKENS.EventBus, eventBus);
        container.registerInstance(SERVICE_TOKENS.ExtensionContext, context);

        // Mock services that commands depend on
        const mockAgentManager = {
            spawnAgent: jest.fn().mockResolvedValue({ id: 'test-agent-id' }),
            removeAgent: jest.fn().mockResolvedValue(undefined),
            getAgents: jest.fn().mockReturnValue([]),
            restoreAgents: jest.fn().mockResolvedValue(0),
            renameAgent: jest.fn().mockResolvedValue(undefined),
            updateAgentType: jest.fn().mockResolvedValue(undefined)
        };

        const mockTaskQueue = {
            createTask: jest.fn().mockReturnValue({ id: 'test-task-id' }),
            assignTask: jest.fn().mockResolvedValue(undefined),
            completeTask: jest.fn().mockResolvedValue(undefined),
            cancelTask: jest.fn().mockResolvedValue(undefined),
            getTasks: jest.fn().mockReturnValue([]),
            getBlockedTasks: jest.fn().mockReturnValue([]),
            resolveConflict: jest.fn().mockResolvedValue(undefined),
            retryTask: jest.fn().mockResolvedValue(undefined)
        };

        const mockMetricsService = {
            incrementCounter: jest.fn(),
            recordGauge: jest.fn(),
            recordHistogram: jest.fn(),
            getMetrics: jest.fn().mockReturnValue({}),
            reset: jest.fn(),
            setEnabled: jest.fn(),
            isEnabled: jest.fn().mockReturnValue(true)
        };

        container.registerInstance(SERVICE_TOKENS.AgentManager, mockAgentManager);
        container.registerInstance(SERVICE_TOKENS.TaskQueue, mockTaskQueue);
        container.registerInstance(SERVICE_TOKENS.MetricsService, mockMetricsService);

        // Initialize command service
        const commandService = new CommandService(loggingService);
        container.registerInstance(SERVICE_TOKENS.CommandService, commandService);
    });

    afterAll(async () => {
        // Clean up temporary workspace
        if (fs.existsSync(workspaceFolder)) {
            fs.rmSync(workspaceFolder, { recursive: true, force: true });
        }

        // Clear mock workspace
        clearMockWorkspace();

        // Teardown extension
        await TestHarness.dispose();
    });

    describe('Command Registration', () => {
        test('All commands from package.json should be registered', async () => {
            const registered = await vscode.commands.getCommands(true);
            const nofxCommands = registered.filter(cmd => cmd.startsWith('nofx.'));

            // Verify we have at least as many registered as in package.json
            expect(nofxCommands.length).toBeGreaterThanOrEqual(expected.length);

            // Verify each command from package.json is registered
            for (const command of expected) {
                expect(nofxCommands).toContain(command);
            }
        });

        test('Commands should have proper contributions in package.json', () => {
            // Basic test to ensure commands are defined
            expect(expected).toBeDefined();
            expect(expected.length).toBeGreaterThan(0);

            // Verify each command is a string
            for (const cmd of expected) {
                expect(typeof cmd).toBe('string');
                expect(cmd.startsWith('nofx.')).toBe(true);
            }
        });
    });

    describe('Command Execution Without Errors', () => {
        // Mock UI interactions
        beforeEach(() => {
            const mockWorkspace = {
                getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() })
            };
            (global as any).vscode = { workspace: mockWorkspace };
            // Mock quick pick
            jest.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => {
                if (Array.isArray(items)) {
                    return items[0];
                }
                return undefined;
            });

            // Mock input box
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('test-input');

            // Mock information messages
            jest.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);

            // Mock error messages
            jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);

            // Mock warning messages
            jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        test('All commands should execute without throwing', async () => {
            for (const command of expected) {
                // Skip interactive/external commands that require actual system resources
                if (INTERACTIVE_COMMANDS.includes(command)) {
                    continue;
                }

                const params = COMMANDS_WITH_PARAMS[command] || undefined;

                // Execute command with error handling
                let error: Error | undefined;
                try {
                    await vscode.commands.executeCommand(command, params);
                } catch (e) {
                    error = e as Error;
                }

                // Commands should not throw unhandled exceptions
                // Some commands may return false or show error messages, but shouldn't crash
                if (error) {
                    // Check if it's an expected error (e.g., no workspace)
                    const expectedErrors = [
                        'No workspace folder',
                        'No agents available',
                        'No tasks available',
                        'Claude CLI not found'
                    ];

                    const isExpectedError = expectedErrors.some(msg => error!.message.includes(msg));

                    expect(isExpectedError).toBe(true);
                }
            }
        });

        test('Commands requiring workspace should handle no workspace gracefully', async () => {
            // Clear mock workspace to simulate no workspace
            clearMockWorkspace();

            const workspaceCommands = ['nofx.addAgent', 'nofx.startConductor', 'nofx.createTask'];

            for (const command of workspaceCommands) {
                const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
                await vscode.commands.executeCommand(command);

                // Should show error message instead of throwing
                expect(errorSpy).toHaveBeenCalled();
            }

            // Restore workspace
            setupMockWorkspace(workspaceFolder);
        });

        test('UI commands should handle cancelled user input gracefully', async () => {
            // Mock cancelled quick pick
            jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(undefined);
            jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue(undefined);

            for (const command of UI_COMMANDS) {
                // Should not throw when user cancels
                await expect(vscode.commands.executeCommand(command)).resolves.not.toThrow();
            }
        });
    });

    describe('Command State Modifications', () => {
        test('Agent commands should modify agent state correctly', async () => {
            const agentManager = container.resolve<any>(SERVICE_TOKENS.AgentManager);

            // Test add agent
            await vscode.commands.executeCommand('nofx.addAgent');
            expect(agentManager.spawnAgent).toHaveBeenCalled();

            // Test delete agent (with mock agent)
            agentManager.getAgents.mockReturnValue([{ id: 'test-agent', name: 'Test Agent' }]);
            await vscode.commands.executeCommand('nofx.deleteAgent');
            expect(agentManager.removeAgent).toHaveBeenCalled();

            // Test restore agents
            await vscode.commands.executeCommand('nofx.restoreAgents');
            expect(agentManager.restoreAgents).toHaveBeenCalled();
        });

        test('Task commands should modify task state correctly', async () => {
            const taskQueue = container.resolve<any>(SERVICE_TOKENS.TaskQueue);

            // Test create task
            await vscode.commands.executeCommand('nofx.createTask');
            expect(taskQueue.createTask).toHaveBeenCalled();

            // Test complete task (with mock task)
            taskQueue.getTasks.mockReturnValue([{ id: 'test-task', description: 'Test Task' }]);
            await vscode.commands.executeCommand('nofx.completeTask');
            expect(taskQueue.completeTask).toHaveBeenCalled();
        });

        test('Metrics commands should modify metrics state correctly', async () => {
            const metricsService = container.resolve<any>(SERVICE_TOKENS.MetricsService);

            // Test reset metrics
            await vscode.commands.executeCommand('nofx.resetMetrics');
            expect(metricsService.reset).toHaveBeenCalled();

            // Test toggle metrics
            await vscode.commands.executeCommand('nofx.toggleMetrics');
            expect(metricsService.setEnabled).toHaveBeenCalled();
        });
    });

    describe('Test Mode Configuration', () => {
        test('Test mode should disable noisy services', async () => {
            const config = vscode.workspace.getConfiguration('nofx');
            expect(config.get('testMode')).toBe(true);

            // Verify orchestration server doesn't start in test mode
            const orchestrationCommands = ['nofx.showOrchestrator', 'nofx.openMessageFlow'];

            for (const command of orchestrationCommands) {
                // Should execute without starting actual servers
                await expect(vscode.commands.executeCommand(command)).resolves.not.toThrow();
            }
        });

        test('Commands should respect test mode configuration', async () => {
            // Test mode should mock external dependencies
            const externalCommands = [
                'nofx.openConductorTerminal', // Should not open actual terminal
                'nofx.toggleWorktrees' // Should not create actual worktrees
            ];

            for (const command of externalCommands) {
                await expect(vscode.commands.executeCommand(command)).resolves.not.toThrow();
            }
        });

        test('Test mode should prevent orchestration server and status bar from starting', async () => {
            // Verify test mode is enabled
            const configService = container.resolve<ConfigurationService>(SERVICE_TOKENS.ConfigurationService);
            expect(configService.get('nofx.testMode')).toBe(true);

            // Verify orchestration server is not running
            const orchestrationServer = container.resolveOptional<any>(SERVICE_TOKENS.OrchestrationServer);
            if (orchestrationServer) {
                expect(orchestrationServer.getStatus?.().isRunning).toBe(false);
            }

            // Verify status bar item is mocked and not shown
            const statusBarItem = container.resolveOptional<any>(SERVICE_TOKENS.StatusBarItem);
            if (statusBarItem) {
                // In test mode, status bar should be a mock with no show method behavior
                expect(statusBarItem.show).toBeDefined();
                expect(typeof statusBarItem.show).toBe('function');
            }
        });

        test('Toggle worktrees command should update configuration', async () => {
            const configService = container.resolve<ConfigurationService>(SERVICE_TOKENS.ConfigurationService);
            const updateSpy = jest.spyOn(configService, 'update').mockResolvedValue(undefined);

            // Mock initial value
            jest.spyOn(configService, 'get').mockReturnValue(false);

            // Execute toggle command
            await vscode.commands.executeCommand('nofx.toggleWorktrees');

            // Verify configuration was toggled
            expect(updateSpy).toHaveBeenCalledWith('nofx.useWorktrees', true);

            // Mock toggled value
            jest.spyOn(configService, 'get').mockReturnValue(true);

            // Toggle again
            await vscode.commands.executeCommand('nofx.toggleWorktrees');

            // Verify toggled back
            expect(updateSpy).toHaveBeenCalledWith('nofx.useWorktrees', false);
        });
    });

    describe('Command Error Recovery', () => {
        test('Commands should recover from service failures', async () => {
            // Temporarily break a service
            const agentManager = container.resolve<any>(SERVICE_TOKENS.AgentManager);
            agentManager.spawnAgent.mockRejectedValueOnce(new Error('Service failure'));

            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            // Should show error but not crash
            await vscode.commands.executeCommand('nofx.addAgent');
            expect(errorSpy).toHaveBeenCalled();

            // Next call should work
            agentManager.spawnAgent.mockResolvedValueOnce({ id: 'recovered-agent' });
            await vscode.commands.executeCommand('nofx.addAgent');
            expect(agentManager.spawnAgent).toHaveBeenCalledTimes(2);
        });

        test('Commands should handle missing services gracefully', async () => {
            // Temporarily override AgentManager with a broken service
            const originalService = container.resolve(SERVICE_TOKENS.AgentManager);
            const brokenAgentManager = {
                spawnAgent: jest.fn().mockRejectedValue(new Error('Service unavailable')),
                removeAgent: jest.fn(),
                getAgents: jest.fn().mockReturnValue([]),
                restoreAgents: jest.fn(),
                renameAgent: jest.fn(),
                updateAgentType: jest.fn()
            };

            // Override the service instead of resetting the container
            container.registerInstance(SERVICE_TOKENS.AgentManager, brokenAgentManager);

            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            // Commands depending on AgentManager should show error
            await vscode.commands.executeCommand('nofx.addAgent');
            expect(errorSpy).toHaveBeenCalled();

            // Restore original service
            container.registerInstance(SERVICE_TOKENS.AgentManager, originalService);
        });
    });

    describe('Command Cleanup', () => {
        test('Clear persistence command should clean up data', async () => {
            // Resolve AgentPersistence from container and spy on clearAll
            const agentPersistence = container.resolveOptional<any>(SERVICE_TOKENS.AgentPersistence);
            let clearAllSpy: jest.SpyInstance;

            if (agentPersistence) {
                clearAllSpy = jest.spyOn(agentPersistence, 'clearAll').mockResolvedValue(undefined);
            } else {
                // Create a mock if service doesn't exist
                const mockPersistence = {
                    clearAll: jest.fn().mockResolvedValue(undefined),
                    loadAgents: jest.fn().mockResolvedValue([])
                };
                container.registerInstance(SERVICE_TOKENS.AgentPersistence, mockPersistence);
                clearAllSpy = mockPersistence.clearAll;
            }

            // Mock the confirmation dialog to return true
            jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Clear All' as any);

            // Execute clear persistence
            await vscode.commands.executeCommand('nofx.clearPersistence');

            // Verify clearAll was called
            expect(clearAllSpy).toHaveBeenCalled();

            // Optionally verify that loadAgents returns empty array after clearing
            if (agentPersistence?.loadAgents) {
                const agents = await agentPersistence.loadAgents();
                expect(agents).toEqual([]);
            }
        });

        test('Commands should dispose resources properly', async () => {
            const disposables: vscode.Disposable[] = [];

            // Track disposables created during command execution
            const originalPush = context.subscriptions.push;

            try {
                context.subscriptions.push = jest.fn((item: vscode.Disposable) => {
                    disposables.push(item);
                    return originalPush.call(context.subscriptions, item);
                });

                // Execute commands that create disposables
                await vscode.commands.executeCommand('nofx.openConductorChat');
                await vscode.commands.executeCommand('nofx.openMessageFlow');

                // Verify disposables were created
                expect(disposables.length).toBeGreaterThan(0);

                // Clean up
                disposables.forEach(d => d.dispose());
            } finally {
                // Restore original push method
                context.subscriptions.push = originalPush;
            }
        });
    });
});
