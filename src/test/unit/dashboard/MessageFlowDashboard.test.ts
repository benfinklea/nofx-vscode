import * as vscode from 'vscode';
import { MessageFlowDashboard } from '../../../dashboard/MessageFlowDashboard';
import { IDashboardViewModel, ILoggingService, IWebviewHost } from '../../../services/interfaces';
import { DashboardTemplate } from '../../../templates/DashboardTemplate';
import { DashboardViewState } from '../../../types/ui';

jest.mock('vscode');
jest.mock('../../../templates/DashboardTemplate');
jest.mock('../../../ui/WebviewHost');

describe('MessageFlowDashboard', () => {
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockViewModel: jest.Mocked<IDashboardViewModel>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockWebviewHost: jest.Mocked<IWebviewHost>;
    let mockTemplate: jest.Mocked<DashboardTemplate>;
    let mockDisposable: jest.Mocked<vscode.Disposable>;
    let mockWebviewPanel: jest.Mocked<vscode.WebviewPanel>;

    const mockDashboardState: DashboardViewState = {
        connections: [
            {
                id: 'connection-1',
                name: 'Test Connection',
                status: 'connected',
                lastMessage: new Date('2023-01-01T10:00:00.000Z')
            }
        ],
        messages: [
            {
                id: 'message-1',
                timestamp: new Date('2023-01-01T10:00:00.000Z'),
                type: 'request',
                content: 'Test message',
                source: 'conductor',
                target: 'agent-1'
            }
        ],
        stats: {
            totalMessages: 1,
            successRate: 100,
            averageResponseTime: 150,
            activeConnections: 1
        },
        filters: {
            messageType: 'all',
            timeRange: '1h'
        }
    };

    beforeEach(() => {
        // Mock extension context
        mockContext = {
            extensionUri: vscode.Uri.file('/mock/extension/path')
        } as any;

        // Mock disposable
        mockDisposable = {
            dispose: jest.fn()
        };

        // Mock webview host
        mockWebviewHost = {
            postMessage: jest.fn().mockResolvedValue(true),
            onDidReceiveMessage: jest.fn().mockReturnValue(mockDisposable),
            onDidDispose: jest.fn().mockReturnValue(mockDisposable),
            setHtml: jest.fn(),
            reveal: jest.fn(),
            dispose: jest.fn(),
            webview: {} as any,
            asWebviewUri: jest.fn(),
            getNonce: jest.fn().mockReturnValue('mock-nonce')
        };

        // Mock view model
        mockViewModel = {
            subscribe: jest.fn().mockReturnValue(mockDisposable),
            handleCommand: jest.fn(),
            getDashboardState: jest.fn().mockResolvedValue(mockDashboardState),
            dispose: jest.fn()
        } as any;

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

        // Mock template
        mockTemplate = {
            generateDashboardHTML: jest.fn().mockReturnValue('<html>Mock Dashboard HTML</html>')
        } as any;

        (DashboardTemplate as jest.Mock).mockImplementation(() => mockTemplate);

        // Mock webview panel
        mockWebviewPanel = {
            title: 'Test Dashboard',
            viewType: 'nofxMessageFlow',
            webview: {
                html: '',
                postMessage: jest.fn(),
                onDidReceiveMessage: jest.fn()
            },
            onDidDispose: jest.fn(),
            reveal: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Mock VS Code window
        (vscode.window.createWebviewPanel as jest.Mock) = jest.fn().mockReturnValue(mockWebviewPanel);
        (vscode.Uri.joinPath as jest.Mock) = jest.fn().mockReturnValue(vscode.Uri.file('/mock/webview/path'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with webview host, context, view model, and logging service', () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );

            expect(dashboard).toBeDefined();
            expect(DashboardTemplate).toHaveBeenCalledWith(mockContext);
        });

        it('should create DashboardTemplate instance', () => {
            new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );

            expect(DashboardTemplate).toHaveBeenCalledWith(mockContext);
        });
    });

    describe('create static method', () => {
        it('should create webview panel with correct configuration', () => {
            MessageFlowDashboard.create(mockContext, mockViewModel, mockLoggingService);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'nofxMessageFlow',
                '📊 NofX Message Flow',
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(mockContext.extensionUri, 'webview')
                    ]
                }
            );
        });

        it('should create dashboard instance and call show', async () => {
            const mockCreateWebviewHost = jest.fn().mockReturnValue(mockWebviewHost);

            const dashboard = MessageFlowDashboard.create(
                mockContext,
                mockViewModel,
                mockLoggingService,
                mockCreateWebviewHost
            );

            expect(mockCreateWebviewHost).toHaveBeenCalledWith(mockWebviewPanel, mockLoggingService);
            expect(mockViewModel.subscribe).toHaveBeenCalled();
            expect(mockWebviewHost.onDidReceiveMessage).toHaveBeenCalled();
            expect(mockWebviewHost.setHtml).toHaveBeenCalled();
        });

        it('should set current panel instance', () => {
            const dashboard = MessageFlowDashboard.create(mockContext, mockViewModel, mockLoggingService);

            // Verify currentPanel is set by creating another instance
            const dashboard2 = MessageFlowDashboard.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect(dashboard2).toBe(dashboard);
        });

        it('should use default webview host factory when not provided', () => {
            MessageFlowDashboard.create(mockContext, mockViewModel, mockLoggingService);

            // Should not throw and should create instance
            expect(DashboardTemplate).toHaveBeenCalled();
        });
    });

    describe('createOrShow static method', () => {
        it('should create new dashboard when current panel does not exist', () => {
            const dashboard = MessageFlowDashboard.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect(dashboard).toBeDefined();
            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
        });

        it('should reveal existing dashboard when current panel exists', () => {
            // Create first dashboard
            const dashboard1 = MessageFlowDashboard.create(mockContext, mockViewModel, mockLoggingService);

            // Clear mock calls
            jest.clearAllMocks();

            // Create/show second dashboard
            const dashboard2 = MessageFlowDashboard.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect(dashboard2).toBe(dashboard1);
            expect(mockWebviewHost.reveal).toHaveBeenCalled();
            expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
        });

        it('should return same instance for multiple createOrShow calls', () => {
            const dashboard1 = MessageFlowDashboard.createOrShow(mockContext, mockViewModel, mockLoggingService);
            const dashboard2 = MessageFlowDashboard.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect(dashboard1).toBe(dashboard2);
        });
    });

    describe('show method', () => {
        let dashboard: MessageFlowDashboard;

        beforeEach(async () => {
            dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();
        });

        it('should subscribe to view model state changes', () => {
            expect(mockViewModel.subscribe).toHaveBeenCalled();
        });

        it('should handle view model state updates', async () => {
            const stateUpdateCallback = (mockViewModel.subscribe as jest.Mock).mock.calls[0][0];

            await stateUpdateCallback(mockDashboardState);

            expect(mockWebviewHost.postMessage).toHaveBeenCalledWith({
                command: 'updateState',
                state: mockDashboardState
            });
        });

        it('should log error when posting message fails', async () => {
            mockWebviewHost.postMessage.mockResolvedValue(false);
            const stateUpdateCallback = (mockViewModel.subscribe as jest.Mock).mock.calls[0][0];

            await stateUpdateCallback(mockDashboardState);

            expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to post message to webview');
        });

        it('should handle messages from webview', () => {
            const messageHandler = (mockWebviewHost.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
            const testMessage = { command: 'clearMessages', data: {} };

            messageHandler(testMessage);

            expect(mockViewModel.handleCommand).toHaveBeenCalledWith('clearMessages', {});
        });

        it('should set initial HTML content', () => {
            expect(mockViewModel.getDashboardState).toHaveBeenCalled();
            expect(mockTemplate.generateDashboardHTML).toHaveBeenCalledWith(mockDashboardState, mockWebviewHost);
            expect(mockWebviewHost.setHtml).toHaveBeenCalledWith('<html>Mock Dashboard HTML</html>');
        });

        it('should handle webview disposal', () => {
            const disposeHandler = (mockWebviewHost.onDidDispose as jest.Mock).mock.calls[0][0];

            disposeHandler();

            expect(mockViewModel.dispose).toHaveBeenCalled();
        });

        it('should handle webview disposal when view model does not have dispose method', () => {
            mockViewModel.dispose = undefined as any;
            const disposeHandler = (mockWebviewHost.onDidDispose as jest.Mock).mock.calls[0][0];

            expect(() => disposeHandler()).not.toThrow();
        });
    });

    describe('reveal method', () => {
        it('should call webview host reveal', () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );

            dashboard.reveal();

            expect(mockWebviewHost.reveal).toHaveBeenCalled();
        });
    });

    describe('dispose method', () => {
        it('should dispose all resources and clear current panel', async () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            dashboard.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
            expect(mockWebviewHost.dispose).toHaveBeenCalled();

            // Verify currentPanel is cleared
            const newDashboard = MessageFlowDashboard.createOrShow(mockContext, mockViewModel, mockLoggingService);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
        });

        it('should handle multiple dispose calls gracefully', async () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            dashboard.dispose();
            dashboard.dispose(); // Second call should not error

            // Dispose should only be called once per disposable
            expect(mockWebviewHost.dispose).toHaveBeenCalledTimes(1);
        });

        it('should dispose disposables in correct order', async () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            const disposeOrder: string[] = [];
            mockDisposable.dispose.mockImplementation(() => {
                disposeOrder.push('subscription');
            });
            mockWebviewHost.dispose.mockImplementation(() => {
                disposeOrder.push('webviewHost');
            });

            dashboard.dispose();

            expect(disposeOrder).toEqual(['subscription', 'subscription', 'subscription', 'webviewHost']);
        });

        it('should handle dispose when already disposed', async () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            dashboard.dispose();

            // Clear mocks and call dispose again
            jest.clearAllMocks();
            dashboard.dispose();

            expect(mockDisposable.dispose).not.toHaveBeenCalled();
            expect(mockWebviewHost.dispose).not.toHaveBeenCalled();
        });
    });

    describe('state management integration', () => {
        it('should handle dashboard state updates with complex data', async () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            const complexState: DashboardViewState = {
                connections: [
                    { id: 'conn1', name: 'Connection 1', status: 'connected', lastMessage: new Date() },
                    { id: 'conn2', name: 'Connection 2', status: 'disconnected' }
                ],
                messages: [
                    {
                        id: 'msg1',
                        timestamp: new Date(),
                        type: 'request',
                        content: 'Complex message with data',
                        source: 'conductor',
                        target: 'agent-1'
                    },
                    {
                        id: 'msg2',
                        timestamp: new Date(),
                        type: 'response',
                        content: 'Response message',
                        source: 'agent-1'
                    }
                ],
                stats: {
                    totalMessages: 2,
                    successRate: 95.5,
                    averageResponseTime: 250,
                    activeConnections: 1
                },
                filters: {
                    messageType: 'request',
                    timeRange: '30m',
                    source: 'conductor'
                }
            };

            const stateUpdateCallback = (mockViewModel.subscribe as jest.Mock).mock.calls[0][0];
            await stateUpdateCallback(complexState);

            expect(mockWebviewHost.postMessage).toHaveBeenCalledWith({
                command: 'updateState',
                state: complexState
            });
        });

        it('should handle webview commands with different data types', async () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            const messageHandler = (mockWebviewHost.onDidReceiveMessage as jest.Mock).mock.calls[0][0];

            // Test different command types
            const commands = [
                { command: 'clearMessages', data: null },
                { command: 'applyFilter', data: { messageType: 'error', timeRange: '1h' } },
                { command: 'exportMessages', data: { format: 'json', includeStats: true } },
                { command: 'pauseUpdates', data: {} }
            ];

            commands.forEach(cmd => {
                messageHandler(cmd);
                expect(mockViewModel.handleCommand).toHaveBeenCalledWith(cmd.command, cmd.data);
            });
        });
    });

    describe('error handling', () => {
        it('should handle view model getDashboardState errors', async () => {
            const error = new Error('Failed to get dashboard state');
            mockViewModel.getDashboardState.mockRejectedValue(error);

            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );

            await expect(dashboard.show()).rejects.toThrow('Failed to get dashboard state');
        });

        it('should handle template generation errors', async () => {
            mockTemplate.generateDashboardHTML.mockImplementation(() => {
                throw new Error('Template generation failed');
            });

            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );

            await expect(dashboard.show()).rejects.toThrow('Template generation failed');
        });

        it('should handle webview host postMessage failures', async () => {
            mockWebviewHost.postMessage.mockRejectedValue(new Error('Post message failed'));

            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            const stateUpdateCallback = (mockViewModel.subscribe as jest.Mock).mock.calls[0][0];

            // Should not throw, but should handle the error internally
            await expect(stateUpdateCallback(mockDashboardState)).resolves.toBeUndefined();
        });

        it('should handle subscription errors during dispose', async () => {
            const error = new Error('Dispose error');
            mockDisposable.dispose.mockImplementation(() => {
                throw error;
            });

            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            // Should handle dispose errors gracefully
            expect(() => dashboard.dispose()).not.toThrow();
        });

        it('should handle webview host disposal errors', async () => {
            const error = new Error('Webview dispose error');
            mockWebviewHost.dispose.mockImplementation(() => {
                throw error;
            });

            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            expect(() => dashboard.dispose()).not.toThrow();
        });
    });

    describe('memory management', () => {
        it('should clean up all subscriptions on dispose', async () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            // Verify subscriptions are created
            expect(mockViewModel.subscribe).toHaveBeenCalled();
            expect(mockWebviewHost.onDidReceiveMessage).toHaveBeenCalled();
            expect(mockWebviewHost.onDidDispose).toHaveBeenCalled();

            dashboard.dispose();

            // All disposables should be disposed
            expect(mockDisposable.dispose).toHaveBeenCalledTimes(3);
        });

        it('should prevent memory leaks from state updates after disposal', async () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            const stateUpdateCallback = (mockViewModel.subscribe as jest.Mock).mock.calls[0][0];

            dashboard.dispose();

            // Clear mocks after disposal
            jest.clearAllMocks();

            // State update after disposal should not cause issues
            await stateUpdateCallback(mockDashboardState);

            expect(mockWebviewHost.postMessage).not.toHaveBeenCalled();
        });
    });

    describe('concurrent operations', () => {
        it('should handle multiple simultaneous state updates', async () => {
            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            const stateUpdateCallback = (mockViewModel.subscribe as jest.Mock).mock.calls[0][0];

            // Simulate multiple concurrent state updates
            const updatePromises = [
                stateUpdateCallback({ ...mockDashboardState, stats: { ...mockDashboardState.stats, totalMessages: 1 } }),
                stateUpdateCallback({ ...mockDashboardState, stats: { ...mockDashboardState.stats, totalMessages: 2 } }),
                stateUpdateCallback({ ...mockDashboardState, stats: { ...mockDashboardState.stats, totalMessages: 3 } })
            ];

            await Promise.all(updatePromises);

            expect(mockWebviewHost.postMessage).toHaveBeenCalledTimes(3);
        });

        it('should handle disposal during state update', async () => {
            let resolvePostMessage: (value: boolean) => void;
            const postMessagePromise = new Promise<boolean>((resolve) => {
                resolvePostMessage = resolve;
            });

            mockWebviewHost.postMessage.mockReturnValue(postMessagePromise);

            const dashboard = new MessageFlowDashboard(
                mockWebviewHost,
                mockContext,
                mockViewModel,
                mockLoggingService
            );
            await dashboard.show();

            const stateUpdateCallback = (mockViewModel.subscribe as jest.Mock).mock.calls[0][0];

            // Start state update
            const updatePromise = stateUpdateCallback(mockDashboardState);

            // Dispose while update is in progress
            dashboard.dispose();

            // Complete the post message
            resolvePostMessage!(true);

            // Should complete without error
            await expect(updatePromise).resolves.toBeUndefined();
        });
    });
});