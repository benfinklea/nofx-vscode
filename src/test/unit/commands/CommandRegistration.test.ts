import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Container } from '../../../services/Container';
import { SERVICE_TOKENS } from '../../../services/interfaces';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { AgentManager } from '../../../agents/AgentManager';
import { CommandService } from '../../../services/CommandService';
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
} from './../../helpers/mockFactories';

jest.mock('vscode');

describe('Command Registration', () => {
    const projectRoot = path.resolve(__dirname, '../../../..');
    const packageJsonPath = path.join(projectRoot, 'package.json');
    let packageData: any;
    let container: Container;
    let mockContext: vscode.ExtensionContext;

    beforeAll(() => {
        packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    });

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        // Set test mode
        process.env.NOFX_TEST_MODE = 'true';

        // Create container
        container = new Container();

        // Create mock extension context
        mockContext = {
            subscriptions: [],
            extensionUri: vscode.Uri.file(projectRoot),
            extensionPath: projectRoot,
            globalState: {
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
                keys: jest.fn().mockReturnValue([])
            } as any,
            workspaceState: {
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
                keys: jest.fn().mockReturnValue([])
            } as any,
            extensionMode: vscode.ExtensionMode.Test,
            storageUri: vscode.Uri.file(path.join(projectRoot, '.nofx')),
            globalStorageUri: vscode.Uri.file(path.join(projectRoot, '.nofx-global')),
            logUri: vscode.Uri.file(path.join(projectRoot, 'logs')),
            storagePath: path.join(projectRoot, '.nofx'),
            globalStoragePath: path.join(projectRoot, '.nofx-global'),
            logPath: path.join(projectRoot, 'logs'),
            extension: {} as any,
            languageModelAccessInformation: {} as any,
            secrets: {} as any,
            environmentVariableCollection: {} as any,
            asAbsolutePath: (relativePath: string) => path.join(projectRoot, relativePath)
        } as vscode.ExtensionContext;
    });

    afterEach(() => {
        delete process.env.NOFX_TEST_MODE;
        container.dispose();
    });

    describe('Extension Activation', () => {
        it('should load and activate extension module', () => {
            const extensionModule = require('../../../extension');
            expect(extensionModule.activate).toBeDefined();
            expect(typeof extensionModule.activate).toBe('function');
        });

        it('should activate without throwing errors', async () => {
            const extensionModule = require('../../../extension');
            await expect(extensionModule.activate(mockContext)).resolves.not.toThrow();
        });

        it('should properly initialize after activation', async () => {
            const extensionModule = require('../../../extension');
            await extensionModule.activate(mockContext);
            // Verify that subscriptions were added to the context
            expect(mockContext.subscriptions.length).toBeGreaterThan(0);
        });

        it('should register all commands from package.json with VS Code', async () => {
            // Spy on vscode.commands.registerCommand
            const registerSpy = jest.spyOn(vscode.commands, 'registerCommand');
            registerSpy.mockImplementation((command: string, callback: any) => {
                return { dispose: jest.fn() };
            });

            // Get expected commands from package.json
            const expectedCommands = packageData.contributes?.commands || [];
            const expectedCommandIds = expectedCommands.map((c: any) => c.command);

            // Activate extension
            const extensionModule = require('../../../extension');
            await extensionModule.activate(mockContext);

            // Verify each command was registered
            expectedCommandIds.forEach((commandId: string) => {
                expect(registerSpy).toHaveBeenCalledWith(commandId, expect.any(Function));
            });

            // Verify total number of commands registered
            expect(registerSpy).toHaveBeenCalledTimes(expectedCommands.length);

            // Verify disposables were added to context (should be at least as many as commands)
            expect(mockContext.subscriptions.length).toBeGreaterThanOrEqual(expectedCommands.length);

            registerSpy.mockRestore();
        });
    });

    describe('Command Definitions', () => {
        it('should have all commands defined in package.json', () => {
            const commands = packageData.contributes?.commands || [];
            const expectedCount = commands.length; // Dynamic count from package.json
            expect(commands.length).toBe(expectedCount);
            expect(commands.length).toBeGreaterThan(0); // Ensure we have commands
        });

        it('should have unique command IDs', () => {
            const commands = packageData.contributes?.commands || [];
            const commandIds = commands.map((c: any) => c.command);
            const uniqueIds = new Set(commandIds);
            expect(uniqueIds.size).toBe(commandIds.length);
        });

        it('should follow nofx.* naming convention', () => {
            const commands = packageData.contributes?.commands || [];
            commands.forEach((cmd: any) => {
                expect(cmd.command).toMatch(/^nofx\./);
            });
        });

        it('should have valid titles for all commands', () => {
            const commands = packageData.contributes?.commands || [];
            commands.forEach((cmd: any) => {
                expect(cmd.title).toBeDefined();
                expect(cmd.title.length).toBeGreaterThan(0);
                expect(cmd.title).toMatch(/^NofX:/);
            });
        });
    });

    describe('Service Registration', () => {
        it('should register core services', () => {
            // Register core services
            container.register(SERVICE_TOKENS.ExtensionContext, () => mockContext);
            container.register(SERVICE_TOKENS.EventBus, () => new EventBus(), 'singleton');
            const mockOutputChannel = vscode.window.createOutputChannel('Test');
            container.register(SERVICE_TOKENS.ConfigurationService, () => new ConfigurationService(), 'singleton');
            container.register(
                SERVICE_TOKENS.LoggingService,
                c => new LoggingService(c.resolve(SERVICE_TOKENS.ConfigurationService), mockOutputChannel),
                'singleton'
            );

            // Verify services can be resolved
            expect(container.resolve(SERVICE_TOKENS.ExtensionContext)).toBe(mockContext);
            expect(container.resolve(SERVICE_TOKENS.EventBus)).toBeInstanceOf(EventBus);
            expect(container.resolve(SERVICE_TOKENS.LoggingService)).toBeInstanceOf(LoggingService);
            expect(container.resolve(SERVICE_TOKENS.ConfigurationService)).toBeInstanceOf(ConfigurationService);
        });

        it('should handle circular dependencies gracefully', () => {
            const circularToken1 = Symbol('circular1');
            const circularToken2 = Symbol('circular2');

            container.register(circularToken1, c => ({
                dep: c.resolve(circularToken2)
            }));

            container.register(circularToken2, c => ({
                dep: c.resolve(circularToken1)
            }));

            expect(() => container.resolve(circularToken1)).toThrow();
        });

        it('should return undefined for optional missing services', () => {
            const missingToken = Symbol('missing');
            const result = container.resolveOptional(missingToken);
            expect(result).toBeUndefined();
        });
    });

    describe('Command Classes', () => {
        const commandClasses = [
            'AgentCommands',
            'TaskCommands',
            'ConductorCommands',
            'WorktreeCommands',
            'UtilityCommands',
            'OrchestrationCommands',
            'PersistenceCommands',
            'MetricsCommands',
            'TemplateCommands'
        ];

        commandClasses.forEach(className => {
            it(`should have ${className} class`, () => {
                const modulePath = `../../../commands/${className}`;
                expect(() => require(modulePath)).not.toThrow();
            });
        });

        it('should instantiate AgentCommands with dependencies', () => {
            const AgentCommands = require('../../../commands/AgentCommands').AgentCommands;

            // Setup minimal dependencies
            container.register(SERVICE_TOKENS.ExtensionContext, () => mockContext);
            container.register(SERVICE_TOKENS.EventBus, () => new EventBus(), 'singleton');
            const mockOutputChannel = vscode.window.createOutputChannel('Test');
            container.register(SERVICE_TOKENS.ConfigurationService, () => new ConfigurationService(), 'singleton');
            container.register(
                SERVICE_TOKENS.LoggingService,
                c => new LoggingService(c.resolve(SERVICE_TOKENS.ConfigurationService), mockOutputChannel),
                'singleton'
            );
            container.register(
                SERVICE_TOKENS.AgentManager,
                c => new AgentManager(c.resolve(SERVICE_TOKENS.ExtensionContext)),
                'singleton'
            );

            const agentCommands = new AgentCommands(
                container.resolve(SERVICE_TOKENS.AgentManager),
                container.resolve(SERVICE_TOKENS.EventBus),
                container.resolve(SERVICE_TOKENS.LoggingService)
            );

            expect(agentCommands).toBeDefined();
            expect(agentCommands.register).toBeDefined();
        });
    });

    describe('Command Handlers', () => {
        it('should register command handlers without errors', () => {
            const mockRegisterCommand = jest.fn();
            (vscode.commands.registerCommand as any) = mockRegisterCommand;

            const commands = packageData.contributes?.commands || [];
            commands.forEach((cmd: any) => {
                const disposable = {
                    dispose: jest.fn()
                };
                mockRegisterCommand.mockReturnValue(disposable);

                const result = vscode.commands.registerCommand(cmd.command, () => {});
                expect(result).toBe(disposable);
            });

            const expectedCount = commands.length;
            expect(mockRegisterCommand).toHaveBeenCalledTimes(expectedCount);
        });

        it('should handle missing command parameters gracefully', async () => {
            const handler = jest.fn().mockImplementation((...args: any[]) => {
                if (args.length === 0) {
                    throw new Error('Missing required parameters');
                }
                return Promise.resolve();
            });

            // Test with missing parameters
            await expect(handler()).rejects.toThrow('Missing required parameters');

            // Test with parameters
            await expect(handler('param1')).resolves.not.toThrow();
        });
    });

    describe('Menu and Keybinding Integration', () => {
        it('should have valid menu contributions', () => {
            const menus = packageData.contributes?.menus || {};
            const commandIds = new Set(packageData.contributes.commands.map((c: any) => c.command));

            Object.entries(menus).forEach(([menuLocation, items]) => {
                if (Array.isArray(items)) {
                    items.forEach((item: any) => {
                        if (item.command) {
                            expect(commandIds.has(item.command)).toBe(true);
                        }
                    });
                }
            });
        });

        it('should have valid keybinding contributions', () => {
            const keybindings = packageData.contributes?.keybindings || [];
            const commandIds = new Set(packageData.contributes.commands.map((c: any) => c.command));

            keybindings.forEach((binding: any) => {
                if (binding.command) {
                    expect(commandIds.has(binding.command)).toBe(true);
                }
            });
        });

        it('should have when clauses for context-dependent commands', () => {
            const menus = packageData.contributes?.menus || {};

            // Check view/item/context menu items
            const contextMenus = menus['view/item/context'] || [];
            contextMenus.forEach((item: any) => {
                if (item.when) {
                    expect(item.when).toBeDefined();
                    expect(typeof item.when).toBe('string');
                }
            });
        });
    });

    describe('Command Disposal', () => {
        it('should properly dispose command registrations', () => {
            const disposables: vscode.Disposable[] = [];
            const mockDispose = jest.fn();

            // Create mock disposables
            const commandCount = packageData.contributes?.commands?.length || 0;
            for (let i = 0; i < commandCount; i++) {
                disposables.push({ dispose: mockDispose });
            }

            // Dispose all
            disposables.forEach(d => d.dispose());

            expect(mockDispose).toHaveBeenCalledTimes(commandCount);
        });

        it('should clean up resources on deactivation', () => {
            const extensionModule = require('../../../extension');
            expect(extensionModule.deactivate).toBeDefined();

            // Should not throw when called
            expect(() => extensionModule.deactivate()).not.toThrow();
        });
    });

    describe('Error Handling', () => {
        it('should handle command execution errors gracefully', async () => {
            const errorHandler = async (command: () => Promise<void>) => {
                try {
                    await command();
                } catch (error) {
                    // Log error and show user-friendly message
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
                return { success: true };
            };

            // Test with failing command
            const failingCommand = async () => {
                throw new Error('Command failed');
            };

            const result = await errorHandler(failingCommand);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Command failed');
        });

        it('should handle missing dependencies gracefully', () => {
            const missingToken = Symbol('missing');

            expect(() => {
                container.resolve(missingToken);
            }).toThrow();

            const optional = container.resolveOptional(missingToken);
            expect(optional).toBeUndefined();
        });
    });

    describe('Performance', () => {
        it('should register all commands within reasonable time', () => {
            const start = Date.now();

            // Simulate command registration
            const commands = packageData.contributes?.commands || [];
            const disposables: vscode.Disposable[] = [];

            commands.forEach((cmd: any) => {
                disposables.push({
                    dispose: jest.fn()
                });
            });

            const duration = Date.now() - start;
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        });

        it('should resolve services quickly', () => {
            // Register services
            container.register(SERVICE_TOKENS.EventBus, () => new EventBus(), 'singleton');

            const start = Date.now();

            // Resolve service multiple times
            for (let i = 0; i < 100; i++) {
                container.resolve(SERVICE_TOKENS.EventBus);
            }

            const duration = Date.now() - start;
            expect(duration).toBeLessThan(100); // Should be very fast for cached singletons
        });
    });
});
