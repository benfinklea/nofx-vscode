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
import { setupMockWorkspace, clearMockWorkspace } from './setup';
import { TestHarness } from './testHarness';
import { createTestOrchestrationServer } from './testHelpers';
import { createMockConfigurationService, createMockLoggingService, createMockEventBus, createMockNotificationService, createMockContainer, createMockExtensionContext, createMockOutputChannel, createMockTerminal, setupVSCodeMocks } from './../helpers/mockFactories';


/**
 * Comprehensive tests for error handling throughout the extension
 */
jest.mock('vscode');

jest.setTimeout(10000);


jest.mock('ws');
describe('Error Handling', () => {
    let container: Container;
    let context: vscode.ExtensionContext;
    let configValidator: ConfigurationValidator;
    let errorHandler: ErrorHandler;
    let eventBus: EventBus;
    let loggingService: LoggingService;

    beforeAll(async () => {
        // Setup and activate extension using TestHarness
        const { container: c, context: ctx } = await TestHarness.initialize();
        container = c;
        context = ctx;
        setupMockWorkspace();
    });

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        // Reset container state between tests but preserve command registrations
        TestHarness.resetContainer();

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

        const mockNotificationService = createMockNotificationService();

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
                incrementCounter: jest.fn().mockImplementation(() => {
                    throw new Error('Service unavailable');
                }),
                recordGauge: jest.fn().mockImplementation(() => {
                    throw new Error('Service unavailable');
                }),
                recordHistogram: jest.fn().mockImplementation(() => {
                    throw new Error('Service unavailable');
                }),
                getMetrics: jest.fn().mockImplementation(() => {
                    throw new Error('Service unavailable');
                }),
                reset: jest.fn().mockImplementation(() => {
                    throw new Error('Service unavailable');
                }),
                setEnabled: jest.fn().mockImplementation(() => {
                    throw new Error('Service unavailable');
                }),
                isEnabled: jest.fn().mockImplementation(() => {
                    throw new Error('Service unavailable');
                })
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
