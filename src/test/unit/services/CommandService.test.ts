import * as vscode from 'vscode';
import { CommandService } from '../../../services/CommandService';
import { ILoggingService, IErrorHandler } from '../../../services/interfaces';

jest.mock('vscode');

describe('CommandService', () => {
    let commandService: CommandService;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockDisposable: jest.Mocked<vscode.Disposable>;
    let mockCommands: jest.Mocked<typeof vscode.commands>;
    let mockWorkspace: jest.Mocked<typeof vscode.workspace>;
    let mockWindow: jest.Mocked<typeof vscode.window>;
    let mockExtensions: jest.Mocked<typeof vscode.extensions>;

    beforeEach(() => {
        // Mock logging service
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn().mockReturnValue(false),
            getChannel: jest.fn(),
            time: jest.fn(),
            timeEnd: jest.fn(),
            onDidChangeConfiguration: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Mock error handler
        mockErrorHandler = {
            handleError: jest.fn(),
            handleAsync: jest.fn(),
            wrapSync: jest.fn(),
            withRetry: jest.fn(),
            dispose: jest.fn()
        };

        // Mock disposable
        mockDisposable = {
            dispose: jest.fn()
        };

        // Mock VS Code commands
        mockCommands = {
            registerCommand: jest.fn().mockReturnValue(mockDisposable),
            registerTextEditorCommand: jest.fn().mockReturnValue(mockDisposable),
            executeCommand: jest.fn(),
            getCommands: jest.fn()
        } as any;

        // Mock workspace
        mockWorkspace = {
            getConfiguration: jest.fn(),
            fs: {
                readFile: jest.fn()
            }
        } as any;

        // Mock window
        mockWindow = {
            showWarningMessage: jest.fn(),
            showInformationMessage: jest.fn(),
            showErrorMessage: jest.fn()
        } as any;

        // Mock extensions
        mockExtensions = {
            getExtension: jest.fn().mockReturnValue({
                extensionPath: '/mock/extension/path'
            })
        } as any;

        // Apply mocks to vscode module
        (vscode.commands as any) = mockCommands;
        (vscode.workspace as any) = mockWorkspace;
        (vscode.window as any) = mockWindow;
        (vscode.extensions as any) = mockExtensions;

        commandService = new CommandService(mockLoggingService, mockErrorHandler);
    });

    afterEach(() => {
        jest.clearAllMocks();
        commandService.dispose();
    });

    describe('constructor', () => {
        it('should initialize with logging service and error handler', () => {
            const service = new CommandService(mockLoggingService, mockErrorHandler);
            expect(service).toBeDefined();
            expect(service.getRegisteredCommands()).toEqual([]);
            service.dispose();
        });

        it('should initialize without logging service', () => {
            const service = new CommandService();
            expect(service).toBeDefined();
            service.dispose();
        });

        it('should initialize without error handler', () => {
            const service = new CommandService(mockLoggingService);
            expect(service).toBeDefined();
            service.dispose();
        });
    });

    describe('register', () => {
        it('should register command and return disposable', () => {
            const commandId = 'test.command';
            const handler = jest.fn();

            const disposable = commandService.register(commandId, handler);

            expect(mockCommands.registerCommand).toHaveBeenCalledWith(commandId, handler, undefined);
            expect(disposable).toBe(mockDisposable);
            expect(commandService.getRegisteredCommands()).toContain(commandId);
            expect(commandService.hasCommand(commandId)).toBe(true);
            expect(mockLoggingService.debug).toHaveBeenCalledWith(`Command registered: ${commandId}`);
        });

        it('should register command with thisArg', () => {
            const commandId = 'test.command';
            const handler = jest.fn();
            const thisArg = { context: 'test' };

            commandService.register(commandId, handler, thisArg);

            expect(mockCommands.registerCommand).toHaveBeenCalledWith(commandId, handler, thisArg);
        });

        it('should handle duplicate command registration', () => {
            const commandId = 'test.duplicate';
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            const disposable1 = commandService.register(commandId, handler1);
            const disposable2 = commandService.register(commandId, handler2);

            expect(disposable1).toBe(disposable2);
            expect(mockCommands.registerCommand).toHaveBeenCalledTimes(1);
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                `Command ${commandId} is already registered, returning existing disposable`
            );
        });

        it('should track multiple different commands', () => {
            commandService.register('command1', jest.fn());
            commandService.register('command2', jest.fn());
            commandService.register('command3', jest.fn());

            const registered = commandService.getRegisteredCommands();
            expect(registered).toContain('command1');
            expect(registered).toContain('command2');
            expect(registered).toContain('command3');
            expect(registered).toHaveLength(3);
        });

        it('should handle special characters in command IDs', () => {
            const commandId = 'test.command-with_special.chars123';
            const handler = jest.fn();

            commandService.register(commandId, handler);

            expect(mockCommands.registerCommand).toHaveBeenCalledWith(commandId, handler, undefined);
            expect(commandService.hasCommand(commandId)).toBe(true);
        });
    });

    describe('registerTextEditorCommand', () => {
        it('should register text editor command and return disposable', () => {
            const commandId = 'test.textEditorCommand';
            const handler = jest.fn();

            const disposable = commandService.registerTextEditorCommand(commandId, handler);

            expect(mockCommands.registerTextEditorCommand).toHaveBeenCalledWith(commandId, handler, undefined);
            expect(disposable).toBe(mockDisposable);
            expect(commandService.getRegisteredCommands()).toContain(commandId);
            expect(mockLoggingService.debug).toHaveBeenCalledWith(`Text editor command registered: ${commandId}`);
        });

        it('should register text editor command with thisArg', () => {
            const commandId = 'test.textEditorCommand';
            const handler = jest.fn();
            const thisArg = { context: 'editor' };

            commandService.registerTextEditorCommand(commandId, handler, thisArg);

            expect(mockCommands.registerTextEditorCommand).toHaveBeenCalledWith(commandId, handler, thisArg);
        });

        it('should handle duplicate text editor command registration', () => {
            const commandId = 'test.duplicate.editor';
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            const disposable1 = commandService.registerTextEditorCommand(commandId, handler1);
            const disposable2 = commandService.registerTextEditorCommand(commandId, handler2);

            expect(disposable1).toBe(disposable2);
            expect(mockCommands.registerTextEditorCommand).toHaveBeenCalledTimes(1);
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                `Text editor command ${commandId} is already registered, returning existing disposable`
            );
        });

        it('should work with typical text editor command handler signature', () => {
            const commandId = 'test.formatCode';
            const handler = jest.fn((textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
                // Typical text editor command logic
            });

            commandService.registerTextEditorCommand(commandId, handler);

            expect(mockCommands.registerTextEditorCommand).toHaveBeenCalledWith(commandId, handler, undefined);
        });
    });

    describe('execute', () => {
        it('should execute command without arguments', async () => {
            const commandId = 'test.execute';
            const expectedResult = 'command result';
            mockCommands.executeCommand.mockResolvedValue(expectedResult);

            const result = await commandService.execute(commandId);

            expect(mockCommands.executeCommand).toHaveBeenCalledWith(commandId);
            expect(result).toBe(expectedResult);
            expect(mockLoggingService.debug).toHaveBeenCalledWith(`Executing command: ${commandId}`);
        });

        it('should execute command with arguments', async () => {
            const commandId = 'test.execute';
            const args = ['arg1', { param: 'value' }, 42];
            const expectedResult = { success: true };
            mockCommands.executeCommand.mockResolvedValue(expectedResult);

            const result = await commandService.execute(commandId, ...args);

            expect(mockCommands.executeCommand).toHaveBeenCalledWith(commandId, ...args);
            expect(result).toBe(expectedResult);
        });

        it('should handle command execution errors', async () => {
            const commandId = 'test.failing';
            const error = new Error('Command failed');
            mockCommands.executeCommand.mockRejectedValue(error);

            await expect(commandService.execute(commandId)).rejects.toThrow('Command failed');
            expect(mockErrorHandler.handleError).toHaveBeenCalledWith(error, `Error executing command ${commandId}`);
        });

        it('should handle non-Error exceptions', async () => {
            const commandId = 'test.stringError';
            const errorString = 'String error';
            mockCommands.executeCommand.mockRejectedValue(errorString);

            await expect(commandService.execute(commandId)).rejects.toBe(errorString);
            expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
                new Error(errorString),
                `Error executing command ${commandId}`
            );
        });

        it('should handle undefined return values', async () => {
            const commandId = 'test.undefined';
            mockCommands.executeCommand.mockResolvedValue(undefined);

            const result = await commandService.execute(commandId);

            expect(result).toBeUndefined();
        });
    });

    describe('getCommands', () => {
        it('should get all commands with internal filtering enabled', async () => {
            const allCommands = ['command1', 'command2', 'vscode.internal'];
            mockCommands.getCommands.mockResolvedValue(allCommands);

            const result = await commandService.getCommands(true);

            expect(mockCommands.getCommands).toHaveBeenCalledWith(true);
            expect(result).toBe(allCommands);
        });

        it('should get all commands with internal filtering disabled', async () => {
            const allCommands = ['command1', 'command2', 'vscode.internal'];
            mockCommands.getCommands.mockResolvedValue(allCommands);

            const result = await commandService.getCommands(false);

            expect(mockCommands.getCommands).toHaveBeenCalledWith(false);
            expect(result).toBe(allCommands);
        });

        it('should use default filtering when no parameter provided', async () => {
            const allCommands = ['command1', 'command2'];
            mockCommands.getCommands.mockResolvedValue(allCommands);

            const result = await commandService.getCommands();

            expect(mockCommands.getCommands).toHaveBeenCalledWith(true);
            expect(result).toBe(allCommands);
        });

        it('should handle empty command list', async () => {
            mockCommands.getCommands.mockResolvedValue([]);

            const result = await commandService.getCommands();

            expect(result).toEqual([]);
        });
    });

    describe('getRegisteredCommands', () => {
        it('should return empty array initially', () => {
            const registered = commandService.getRegisteredCommands();
            expect(registered).toEqual([]);
        });

        it('should return registered command IDs', () => {
            commandService.register('command1', jest.fn());
            commandService.register('command2', jest.fn());

            const registered = commandService.getRegisteredCommands();
            expect(registered).toContain('command1');
            expect(registered).toContain('command2');
            expect(registered).toHaveLength(2);
        });

        it('should not include duplicates', () => {
            commandService.register('duplicate', jest.fn());
            commandService.register('duplicate', jest.fn());

            const registered = commandService.getRegisteredCommands();
            expect(registered.filter(cmd => cmd === 'duplicate')).toHaveLength(1);
        });
    });

    describe('hasCommand', () => {
        it('should return false for unregistered command', () => {
            expect(commandService.hasCommand('nonexistent')).toBe(false);
        });

        it('should return true for registered command', () => {
            commandService.register('exists', jest.fn());
            expect(commandService.hasCommand('exists')).toBe(true);
        });

        it('should return true for registered text editor command', () => {
            commandService.registerTextEditorCommand('editor.exists', jest.fn());
            expect(commandService.hasCommand('editor.exists')).toBe(true);
        });

        it('should handle empty command ID', () => {
            expect(commandService.hasCommand('')).toBe(false);
        });
    });

    describe('unregister', () => {
        it('should unregister existing command', () => {
            const commandId = 'test.unregister';
            commandService.register(commandId, jest.fn());

            expect(commandService.hasCommand(commandId)).toBe(true);

            commandService.unregister(commandId);

            expect(mockDisposable.dispose).toHaveBeenCalled();
            expect(commandService.hasCommand(commandId)).toBe(false);
            expect(commandService.getRegisteredCommands()).not.toContain(commandId);
        });

        it('should handle unregistering non-existent command', () => {
            expect(() => commandService.unregister('nonexistent')).not.toThrow();
            expect(mockDisposable.dispose).not.toHaveBeenCalled();
        });

        it('should remove command from disposables array', () => {
            const commandId = 'test.remove';
            commandService.register(commandId, jest.fn());

            commandService.unregister(commandId);

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });

        it('should handle multiple unregister calls for same command', () => {
            const commandId = 'test.multiple';
            commandService.register(commandId, jest.fn());

            commandService.unregister(commandId);
            commandService.unregister(commandId); // Second call should not error

            expect(mockDisposable.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('verifyCommands', () => {
        beforeEach(() => {
            // Mock workspace configuration
            const mockConfig = {
                get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
                    if (key === 'testMode') return false;
                    return defaultValue;
                })
            };
            mockWorkspace.getConfiguration.mockReturnValue(mockConfig as any);

            // Mock file system
            const mockPackageJson = {
                contributes: {
                    commands: [
                        { command: 'nofx.command1', title: 'Command 1' },
                        { command: 'nofx.command2', title: 'Command 2' }
                    ]
                }
            };
            const mockFileContent = Buffer.from(JSON.stringify(mockPackageJson));
            mockWorkspace.fs.readFile = jest.fn().mockResolvedValue(mockFileContent);

            // Mock Uri.joinPath
            (vscode.Uri.joinPath as jest.Mock) = jest.fn().mockReturnValue(vscode.Uri.file('/mock/path'));
            (vscode.Uri.file as jest.Mock) = jest.fn().mockReturnValue({ fsPath: '/mock/path' });
        });

        it('should skip verification when not in test or dev mode', async () => {
            process.env.NODE_ENV = 'production';

            await commandService.verifyCommands();

            expect(mockLoggingService.debug).toHaveBeenCalledWith('Command verification skipped (not in test/dev mode)');
            expect(mockCommands.getCommands).not.toHaveBeenCalled();
        });

        it('should verify commands in test mode', async () => {
            const mockConfig = {
                get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
                    if (key === 'testMode') return true;
                    return defaultValue;
                })
            };
            mockWorkspace.getConfiguration.mockReturnValue(mockConfig as any);
            mockCommands.getCommands.mockResolvedValue(['nofx.command1', 'nofx.command2', 'other.command']);

            await commandService.verifyCommands();

            expect(mockCommands.getCommands).toHaveBeenCalledWith(true);
            expect(mockLoggingService.info).toHaveBeenCalledWith('All 2 expected commands are registered');
        });

        it('should detect missing commands', async () => {
            const mockConfig = {
                get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
                    if (key === 'testMode') return true;
                    return defaultValue;
                })
            };
            mockWorkspace.getConfiguration.mockReturnValue(mockConfig as any);
            mockCommands.getCommands.mockResolvedValue(['nofx.command1', 'other.command']); // Missing command2

            await commandService.verifyCommands();

            expect(mockLoggingService.warn).toHaveBeenCalledWith('Missing commands detected: nofx.command2');
            expect(mockWindow.showWarningMessage).toHaveBeenCalledWith(
                'NofX: 1 commands are not registered. Check the NofX output channel for details.'
            );
        });

        it('should detect extra commands', async () => {
            const mockConfig = {
                get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
                    if (key === 'testMode') return true;
                    return defaultValue;
                })
            };
            mockWorkspace.getConfiguration.mockReturnValue(mockConfig as any);
            mockCommands.getCommands.mockResolvedValue(['nofx.command1', 'nofx.command2', 'nofx.extra']);

            await commandService.verifyCommands();

            expect(mockLoggingService.debug).toHaveBeenCalledWith('Extra commands registered: nofx.extra');
        });

        it('should verify commands in development mode', async () => {
            process.env.NODE_ENV = 'development';
            mockCommands.getCommands.mockResolvedValue(['nofx.command1', 'nofx.command2']);

            await commandService.verifyCommands();

            expect(mockCommands.getCommands).toHaveBeenCalled();
        });

        it('should handle package.json read errors', async () => {
            const mockConfig = {
                get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
                    if (key === 'testMode') return true;
                    return defaultValue;
                })
            };
            mockWorkspace.getConfiguration.mockReturnValue(mockConfig as any);
            const error = new Error('File not found');
            mockWorkspace.fs.readFile = jest.fn().mockRejectedValue(error);

            await commandService.verifyCommands();

            expect(mockErrorHandler.handleError).toHaveBeenCalledWith(error, 'Error verifying commands');
            expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
                'NofX: Failed to verify commands - File not found'
            );
        });

        it('should handle malformed package.json', async () => {
            const mockConfig = {
                get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
                    if (key === 'testMode') return true;
                    return defaultValue;
                })
            };
            mockWorkspace.getConfiguration.mockReturnValue(mockConfig as any);
            const invalidJson = Buffer.from('{ invalid json');
            mockWorkspace.fs.readFile = jest.fn().mockResolvedValue(invalidJson);

            await commandService.verifyCommands();

            expect(mockErrorHandler.handleError).toHaveBeenCalled();
        });

        it('should handle missing contributes section', async () => {
            const mockConfig = {
                get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
                    if (key === 'testMode') return true;
                    return defaultValue;
                })
            };
            mockWorkspace.getConfiguration.mockReturnValue(mockConfig as any);
            const packageJsonWithoutContributes = { name: 'test' };
            const mockFileContent = Buffer.from(JSON.stringify(packageJsonWithoutContributes));
            mockWorkspace.fs.readFile = jest.fn().mockResolvedValue(mockFileContent);
            mockCommands.getCommands.mockResolvedValue([]);

            await commandService.verifyCommands();

            expect(mockLoggingService.info).toHaveBeenCalledWith('All 0 expected commands are registered');
        });
    });

    describe('dispose', () => {
        it('should dispose all registered commands', () => {
            commandService.register('command1', jest.fn());
            commandService.register('command2', jest.fn());
            commandService.registerTextEditorCommand('editor.command', jest.fn());

            commandService.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalledTimes(3);
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Disposing CommandService with 3 commands');
        });

        it('should clear all internal state', () => {
            commandService.register('command1', jest.fn());
            commandService.register('command2', jest.fn());

            commandService.dispose();

            expect(commandService.getRegisteredCommands()).toEqual([]);
            expect(commandService.hasCommand('command1')).toBe(false);
            expect(commandService.hasCommand('command2')).toBe(false);
        });

        it('should handle multiple dispose calls', () => {
            commandService.register('command', jest.fn());

            commandService.dispose();
            commandService.dispose(); // Second call should not error

            // First dispose should dispose the command, second should be no-op
            expect(mockDisposable.dispose).toHaveBeenCalledTimes(1);
        });

        it('should dispose empty command service', () => {
            expect(() => commandService.dispose()).not.toThrow();
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Disposing CommandService with 0 commands');
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle null command handlers', () => {
            const commandId = 'test.null';
            
            expect(() => commandService.register(commandId, null as any)).not.toThrow();
            expect(mockCommands.registerCommand).toHaveBeenCalledWith(commandId, null, undefined);
        });

        it('should handle undefined command handlers', () => {
            const commandId = 'test.undefined';
            
            expect(() => commandService.register(commandId, undefined as any)).not.toThrow();
            expect(mockCommands.registerCommand).toHaveBeenCalledWith(commandId, undefined, undefined);
        });

        it('should handle very long command IDs', () => {
            const longCommandId = 'a'.repeat(1000);
            
            expect(() => commandService.register(longCommandId, jest.fn())).not.toThrow();
            expect(commandService.hasCommand(longCommandId)).toBe(true);
        });

        it('should handle command IDs with special characters', () => {
            const specialCommandId = 'test.command-with_special.chars123!@#$%';
            
            commandService.register(specialCommandId, jest.fn());
            expect(commandService.hasCommand(specialCommandId)).toBe(true);
        });

        it('should handle execution of commands that return promises', async () => {
            const commandId = 'test.async';
            const asyncResult = Promise.resolve('async result');
            mockCommands.executeCommand.mockResolvedValue(asyncResult);

            const result = await commandService.execute(commandId);

            expect(result).toBe(asyncResult);
        });

        it('should handle command execution with complex argument types', async () => {
            const commandId = 'test.complex';
            const complexArgs = [
                { nested: { object: true } },
                [1, 2, 3],
                new Date(),
                /regex/g,
                function() {}
            ];

            await commandService.execute(commandId, ...complexArgs);

            expect(mockCommands.executeCommand).toHaveBeenCalledWith(commandId, ...complexArgs);
        });

        it('should handle VS Code API errors gracefully', async () => {
            const commandId = 'test.vscodeerror';
            const vscodeError = new Error('VS Code API error');
            vscodeError.name = 'VSCodeError';
            mockCommands.executeCommand.mockRejectedValue(vscodeError);

            await expect(commandService.execute(commandId)).rejects.toThrow('VS Code API error');
            expect(mockErrorHandler.handleError).toHaveBeenCalledWith(vscodeError, `Error executing command ${commandId}`);
        });
    });
});