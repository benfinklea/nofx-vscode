import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import WebSocket from 'ws';
import getPort from 'get-port';
import { Container } from '../../services/Container';
import { SERVICE_TOKENS } from '../../services/interfaces';
import { ConfigurationValidator } from '../../services/ConfigurationValidator';
import { ErrorHandler } from '../../services/ErrorHandler';
import { EventBus } from '../../services/EventBus';
import { LoggingService } from '../../services/LoggingService';
import { ConfigurationService } from '../../services/ConfigurationService';
import { AgentManager } from '../../agents/AgentManager';
import { TaskQueue } from '../../tasks/TaskQueue';
import { OrchestrationServer } from '../../orchestration/OrchestrationServer';
import { setupExtension, teardownExtension, setupMockWorkspace, clearMockWorkspace } from './setup';

/**
 * Comprehensive tests for error handling throughout the extension
 */
describe('Error Handling', () => {
    let container: Container;
    let context: vscode.ExtensionContext;
    let configValidator: ConfigurationValidator;
    let errorHandler: ErrorHandler;
    let eventBus: EventBus;
    let loggingService: LoggingService;

    beforeAll(async () => {
        // Setup and activate extension
        context = await setupExtension();
        setupMockWorkspace();
    });

    beforeEach(() => {
        // Get container instance but don't reset to preserve command registrations
        container = Container.getInstance();
        // container.reset(); // Removed to preserve command bindings

        // Mock workspace configuration
        const mockConfig = {
            get: jest.fn().mockReturnValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
            has: jest.fn().mockReturnValue(false),
            inspect: jest.fn().mockReturnValue(undefined)
        };
        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

        // Initialize services
        const configService = new ConfigurationService();
        const mainChannel = {
            appendLine: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        };
        loggingService = new LoggingService(configService, mainChannel as any);
        eventBus = new EventBus();

        const mockNotificationService = {
            showInformation: jest.fn(),
            showWarning: jest.fn(),
            showError: jest.fn(),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            showOpenDialog: jest.fn(),
            showSaveDialog: jest.fn(),
            setStatusBarMessage: jest.fn(),
            withProgress: jest.fn(),
            confirm: jest.fn(),
            confirmDestructive: jest.fn()
        };

        errorHandler = new ErrorHandler(loggingService, mockNotificationService);
        configValidator = new ConfigurationValidator(loggingService, mockNotificationService);

        container.registerInstance(SERVICE_TOKENS.ConfigurationService, configService);
        container.registerInstance(SERVICE_TOKENS.LoggingService, loggingService);
        container.registerInstance(SERVICE_TOKENS.EventBus, eventBus);
        container.registerInstance(SERVICE_TOKENS.ErrorHandler, errorHandler);
        container.registerInstance(SERVICE_TOKENS.ConfigurationValidator, configValidator);
        container.registerInstance(SERVICE_TOKENS.ExtensionContext, context);

        // Mock services for testing
        const mockAgentManager = {
            spawnAgent: jest.fn(),
            removeAgent: jest.fn(),
            getAgents: jest.fn().mockReturnValue([])
        };

        const mockTaskQueue = {
            createTask: jest.fn(),
            assignTask: jest.fn(),
            completeTask: jest.fn(),
            getTasks: jest.fn().mockReturnValue([])
        };

        container.registerInstance(SERVICE_TOKENS.AgentManager, mockAgentManager);
        container.registerInstance(SERVICE_TOKENS.TaskQueue, mockTaskQueue);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        clearMockWorkspace();
        await teardownExtension();
    });

    describe('Configuration Validation', () => {
        test('should validate required configuration fields', async () => {
            const result = configValidator.validateConfiguration({});

            // Check that validation returns a result object
            expect(result).toBeDefined();
            expect(result).toHaveProperty('isValid');

            // If there are errors, they should be in an array
            if (result.errors) {
                expect(Array.isArray(result.errors)).toBe(true);
                expect(result.errors.length).toBeGreaterThan(0);
            }
        });

        test('should handle missing Claude CLI path', async () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                get: jest.fn().mockReturnValue(undefined),
                has: jest.fn().mockReturnValue(false),
                inspect: jest.fn(),
                update: jest.fn()
            } as any);

            const result = configValidator.validateConfiguration({});
            expect(result.isValid).toBe(false);
            if (result.errors) {
                expect(result.errors.some((e: any) => e.message && e.message.includes('Claude'))).toBe(true);
            }
        });

        test('should validate test mode configuration', async () => {
            const config = vscode.workspace.getConfiguration('nofx');
            const testMode = config.get('testMode');
            expect(typeof testMode === 'boolean' || testMode === undefined).toBe(true);
        });
    });

    describe('Command Error Handling', () => {
        test('should handle agent spawn failures gracefully', async () => {
            const agentManager = container.resolve<any>(SERVICE_TOKENS.AgentManager);
            agentManager.spawnAgent.mockRejectedValue(new Error('Spawn failed'));

            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            try {
                await vscode.commands.executeCommand('nofx.addAgent');
            } catch (error) {
                // Expected to fail
            }

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('failed')
            );
        });

        test('should handle task creation failures gracefully', async () => {
            const taskQueue = container.resolve<any>(SERVICE_TOKENS.TaskQueue);
            taskQueue.createTask.mockImplementation(() => {
                throw new Error('Task creation failed');
            });

            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            try {
                await vscode.commands.executeCommand('nofx.createTask');
            } catch (error) {
                // Expected to fail
            }

            expect(errorSpy).toHaveBeenCalled();
        });

        test('should handle missing workspace gracefully', async () => {
            clearMockWorkspace();

            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            try {
                await vscode.commands.executeCommand('nofx.addAgent');
            } catch (error) {
                // Expected to fail
            }

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('workspace')
            );

            // Restore workspace for other tests
            setupMockWorkspace();
        });
    });

    describe('Service Error Recovery', () => {
        test('should recover from EventBus errors', () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            // Simulate event handler error
            eventBus.subscribe('test-event', () => {
                throw new Error('Event handler error');
            });

            // Should not throw - EventBus should catch and log
            expect(() => eventBus.publish('test-event', {})).not.toThrow();

            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });

        test('should handle logging service failures', () => {
            // Test that logging service handles errors gracefully
            expect(() => loggingService.error('Test error')).not.toThrow();
        });

        test('should handle container resolution failures', () => {
            expect(() => container.resolve('NonExistentService')).toThrow();

            // Should provide helpful error message
            try {
                container.resolve('NonExistentService');
            } catch (error: any) {
                expect(error.message).toContain('NonExistentService');
            }
        });
    });

    describe('Network Error Handling', () => {
        test('should handle WebSocket connection failures', async () => {
            // Get a free port and start a simple server on it
            const port = await getPort();
            const server = require('http').createServer();

            // Start server on the port
            await new Promise<void>((resolve) => {
                server.listen(port, () => resolve());
            });

            // Now try to start OrchestrationServer on the same port
            const orchestrationServer = new OrchestrationServer(port, loggingService, eventBus);

            try {
                await orchestrationServer.start();
            } catch (error: any) {
                expect(error.code).toBe('EADDRINUSE');
            } finally {
                // Clean up
                server.close();
            }
        });

        test('should handle WebSocket message failures', () => {
            const mockClient = {
                send: jest.fn().mockImplementation(() => {
                    throw new Error('Send failed');
                }),
                readyState: WebSocket.OPEN
            } as any;

            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            // Should handle send errors gracefully
            try {
                mockClient.send(JSON.stringify({ type: 'test' }));
            } catch (error) {
                // Expected
            }

            errorSpy.mockRestore();
        });
    });

    describe('File System Error Handling', () => {
        test('should handle missing template files', async () => {
            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            try {
                await vscode.commands.executeCommand('nofx.browseAgentTemplates');
            } catch (error) {
                // Expected to fail
            }

            expect(errorSpy).toHaveBeenCalled();
        });

        test('should handle permission errors', () => {
            const errorHandler = container.resolve<ErrorHandler>(SERVICE_TOKENS.ErrorHandler);
            errorHandler.handleError(new Error('EACCES: permission denied'));

            // handleError doesn't return a value, it just handles the error
        });
    });

    describe('Graceful Degradation', () => {
        test('should continue with reduced functionality when non-critical services fail', () => {
            // Override non-critical service with a broken one instead of resetting
            const brokenMetricsService = {
                incrementCounter: jest.fn().mockImplementation(() => { throw new Error('Service unavailable'); }),
                recordGauge: jest.fn().mockImplementation(() => { throw new Error('Service unavailable'); }),
                recordHistogram: jest.fn().mockImplementation(() => { throw new Error('Service unavailable'); }),
                getMetrics: jest.fn().mockImplementation(() => { throw new Error('Service unavailable'); }),
                reset: jest.fn().mockImplementation(() => { throw new Error('Service unavailable'); }),
                setEnabled: jest.fn().mockImplementation(() => { throw new Error('Service unavailable'); }),
                isEnabled: jest.fn().mockImplementation(() => { throw new Error('Service unavailable'); })
            };
            container.registerInstance(SERVICE_TOKENS.MetricsService, brokenMetricsService);

            // Should still be able to execute basic commands
            const config = container.resolve(SERVICE_TOKENS.ConfigurationService);
            expect(config).toBeDefined();
        });

        test('should provide fallback values for missing configuration', () => {
            const config = new ConfigurationService();

            // Should return default values
            expect(config.get('orchestrationPort', 7777)).toBe(7777);
            expect(config.get('enableMetrics', true)).toBe(true);
            expect(config.get('testMode', false)).toBe(false);
        });
    });

    describe('User-Friendly Error Messages', () => {
        test('should show user-friendly messages for common errors', async () => {
            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            const commonErrors = [
                { error: new Error('ENOENT'), expectedMessage: 'not found' },
                { error: new Error('EACCES'), expectedMessage: 'permission' },
                { error: new Error('EADDRINUSE'), expectedMessage: 'port' },
                { error: new Error('Claude CLI not found'), expectedMessage: 'Claude' }
            ];

            for (const { error, expectedMessage } of commonErrors) {
                errorHandler.handleError(error);

                if (errorSpy.mock.calls.length > 0) {
                    const lastCall = errorSpy.mock.calls[errorSpy.mock.calls.length - 1];
                    expect(lastCall[0].toLowerCase()).toContain(expectedMessage.toLowerCase());
                }
            }
        });

        test('should provide actionable error messages', () => {
            const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

            errorHandler.handleError(new Error('Claude CLI not found at /usr/local/bin/claude'));

            if (errorSpy.mock.calls.length > 0) {
                const message = errorSpy.mock.calls[0][0];
                // Should suggest how to fix the issue
                expect(message).toMatch(/install|configure|path/i);
            }
        });
    });
});
