import * as vscode from 'vscode';
import { ConductorPanel } from '../../../panels/ConductorPanel';

// Import actual interfaces
import { IConductorViewModel, ILoggingService } from '../../../services/interfaces';
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

interface IWebviewHost {
    webview: vscode.Webview;
    setHtml(content: string): void;
    postMessage(data: any): Thenable<boolean>;
    onDidReceiveMessage(callback: Function): vscode.Disposable;
    reveal(): void;
    dispose(): void;
    asWebviewUri(uri: vscode.Uri): vscode.Uri;
    getNonce(): string;
}

interface WebviewHostFactory {
    (panel: vscode.WebviewPanel, loggingService: ILoggingService): IWebviewHost;
}

// Mock ConductorTemplate
class MockConductorTemplate {
    constructor(private context: vscode.ExtensionContext) {}

    generateConductorHTML = jest.fn().mockReturnValue('<html><body>Mock HTML</body></html>');
}

// Mock PanelBinder
class MockPanelBinder {
    static create = jest.fn().mockReturnValue(new MockPanelBinder());

    bindWebviewToViewModel = jest.fn();
    dispose = jest.fn();
}

// Mock the imported classes
jest.mock('../../../templates/ConductorTemplate', () => ({
    ConductorTemplate: MockConductorTemplate
}));

jest.mock('../../../panels/panelBinder', () => ({
    PanelBinder: MockPanelBinder
}));

// Mock createWebviewHost function
const mockCreateWebviewHost = jest.fn();
jest.mock('../../../ui/WebviewHost', () => ({
    createWebviewHost: mockCreateWebviewHost
}));

// Mock VS Code API
const mockWebview = {
    html: '',
    postMessage: jest.fn().mockResolvedValue(true),
    onDidReceiveMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    asWebviewUri: jest.fn().mockImplementation((uri: vscode.Uri) => uri),
    cspSource: 'vscode-webview:'
} as unknown as vscode.Webview;

const mockWebviewPanel = {
    webview: mockWebview,
    title: 'NofX Conductor',
    viewType: 'nofxConductor',
    viewColumn: vscode.ViewColumn.One,
    active: true,
    visible: true,
    reveal: jest.fn(),
    dispose: jest.fn(),
    onDidDispose: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    onDidChangeViewState: jest.fn().mockReturnValue({ dispose: jest.fn() })
} as unknown as vscode.WebviewPanel;

const mockWebviewHost = {
    webview: mockWebview,
    setHtml: jest.fn(),
    postMessage: jest.fn().mockResolvedValue(true),
    onDidReceiveMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    reveal: jest.fn(),
    dispose: jest.fn(),
    asWebviewUri: jest.fn().mockImplementation((uri: vscode.Uri) => uri),
    getNonce: jest.fn().mockReturnValue('mock-nonce-123')
} as unknown as IWebviewHost;

Object.defineProperty(vscode.window, 'createWebviewPanel', {
    value: jest.fn().mockReturnValue(mockWebviewPanel),
    configurable: true
});

Object.defineProperty(vscode.ViewColumn, 'One', {
    value: 1,
    configurable: true
});

Object.defineProperty(vscode.Uri, 'joinPath', {
    value: jest.fn().mockImplementation((base: vscode.Uri, ...paths: string[]) => ({
        ...base,
        path: base.path + '/' + paths.join('/')
    })),
    configurable: true
});

jest.mock('vscode');

describe('ConductorPanel', () => {
    let conductorPanel: ConductorPanel;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockViewModel: jest.Mocked<IConductorViewModel>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockWebviewHostFactory: jest.Mocked<WebviewHostFactory>;

    const mockViewState = {
        agentStats: { total: 3, idle: 2, working: 1 },
        taskStats: { queued: 5, inProgress: 2, completed: 10 },
        messages: ['Message 1', 'Message 2'],
        isConnected: true
    };

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        jest.clearAllMocks();

        // Reset static currentPanel
        (ConductorPanel as any).currentPanel = undefined;

        // Setup mock context
        mockContext = {
            subscriptions: [],
            extensionUri: vscode.Uri.file('/extension/path'),
            globalState: {} as any,
            workspaceState: {} as any,
            extensionPath: '/extension/path'
        } as any;

        // Setup mock view model
        mockViewModel = {
            getViewState: jest.fn().mockReturnValue(mockViewState),
            handleCommand: jest.fn().mockResolvedValue(undefined),
            spawnAgentGroup: jest.fn().mockResolvedValue(undefined),
            spawnCustomAgent: jest.fn().mockResolvedValue(undefined),
            createTask: jest.fn().mockResolvedValue(undefined),
            removeAgent: jest.fn().mockResolvedValue(undefined),
            toggleTheme: jest.fn().mockResolvedValue(undefined),
            subscribe: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            dispose: jest.fn()
        } as jest.Mocked<IConductorViewModel>;

        // Setup mock logging service
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        // Setup mock webview host factory
        mockWebviewHostFactory = jest.fn().mockReturnValue(mockWebviewHost);

        // Setup default createWebviewHost mock
        mockCreateWebviewHost.mockReturnValue(mockWebviewHost);

        conductorPanel = new ConductorPanel(mockWebviewHost, mockContext, mockViewModel, mockLoggingService);
    });

    afterEach(() => {
        conductorPanel?.dispose();
    });

    describe('constructor', () => {
        it('should initialize with all dependencies', () => {
            expect(conductorPanel).toBeInstanceOf(ConductorPanel);
            expect(MockConductorTemplate).toHaveBeenCalledWith(mockContext);
            expect(MockPanelBinder.create).toHaveBeenCalledWith(mockLoggingService);
        });

        it('should bind webview to view model', () => {
            expect(MockPanelBinder.prototype.bindWebviewToViewModel).toHaveBeenCalledWith(
                mockWebviewHost,
                mockViewModel,
                expect.any(Function),
                expect.objectContaining({
                    onDispose: expect.any(Function)
                })
            );
        });

        it('should set up disposal callback correctly', () => {
            const bindCall = MockPanelBinder.prototype.bindWebviewToViewModel.mock.calls[0];
            const options = bindCall[3];

            // Simulate disposal
            options.onDispose();

            expect((ConductorPanel as any).currentPanel).toBeUndefined();
            expect(mockViewModel.dispose).toHaveBeenCalled();
        });

        it('should handle view model without dispose method', () => {
            const viewModelWithoutDispose = {
                getViewState: jest.fn().mockReturnValue(mockViewState),
                subscribe: jest.fn().mockReturnValue({ dispose: jest.fn() })
            };

            const panel = new ConductorPanel(
                mockWebviewHost,
                mockContext,
                viewModelWithoutDispose as any,
                mockLoggingService
            );

            const bindCall = MockPanelBinder.prototype.bindWebviewToViewModel.mock.calls[1];
            const options = bindCall[3];

            // Should not throw when view model has no dispose method
            expect(() => options.onDispose()).not.toThrow();

            panel.dispose();
        });

        it('should generate HTML using template', () => {
            const bindCall = MockPanelBinder.prototype.bindWebviewToViewModel.mock.calls[0];
            const htmlGenerator = bindCall[2];

            const html = htmlGenerator(mockViewState, mockWebviewHost);

            expect(MockConductorTemplate.prototype.generateConductorHTML).toHaveBeenCalledWith(
                mockViewState,
                mockWebviewHost
            );
            expect(html).toBe('<html><body>Mock HTML</body></html>');
        });
    });

    describe('create static method', () => {
        it('should create new webview panel with correct configuration', () => {
            const panel = ConductorPanel.create(mockContext, mockViewModel, mockLoggingService);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'nofxConductor',
                'NofX Conductor',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [vscode.Uri.joinPath(mockContext.extensionUri, 'webview')]
                }
            );

            panel.dispose();
        });

        it('should use default webview host factory', () => {
            const panel = ConductorPanel.create(mockContext, mockViewModel, mockLoggingService);

            expect(mockCreateWebviewHost).toHaveBeenCalledWith(mockWebviewPanel, mockLoggingService);
            expect(panel).toBeInstanceOf(ConductorPanel);

            panel.dispose();
        });

        it('should use custom webview host factory', () => {
            const customFactory = jest.fn().mockReturnValue(mockWebviewHost);
            const panel = ConductorPanel.create(mockContext, mockViewModel, mockLoggingService, customFactory);

            expect(customFactory).toHaveBeenCalledWith(mockWebviewPanel, mockLoggingService);
            expect(mockCreateWebviewHost).not.toHaveBeenCalled();

            panel.dispose();
        });

        it('should set currentPanel static reference', () => {
            const panel = ConductorPanel.create(mockContext, mockViewModel, mockLoggingService);

            expect((ConductorPanel as any).currentPanel).toBe(panel);

            panel.dispose();
        });

        it('should return the created panel instance', () => {
            const panel = ConductorPanel.create(mockContext, mockViewModel, mockLoggingService);

            expect(panel).toBeInstanceOf(ConductorPanel);
            expect(panel).toBe((ConductorPanel as any).currentPanel);

            panel.dispose();
        });

        it('should create webview panel with proper resource roots', () => {
            ConductorPanel.create(mockContext, mockViewModel, mockLoggingService);

            expect(vscode.Uri.joinPath).toHaveBeenCalledWith(mockContext.extensionUri, 'webview');

            const createPanelCall = (vscode.window.createWebviewPanel as jest.Mock).mock.calls[0];
            const options = createPanelCall[3];

            expect(options.localResourceRoots).toHaveLength(1);
        });
    });

    describe('createOrShow static method', () => {
        it('should create new panel when none exists', () => {
            const panel = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
            expect(panel).toBeInstanceOf(ConductorPanel);
            expect((ConductorPanel as any).currentPanel).toBe(panel);

            panel.dispose();
        });

        it('should reveal existing panel when it exists', () => {
            const firstPanel = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);
            jest.clearAllMocks();

            const secondPanel = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
            expect(mockWebviewHost.reveal).toHaveBeenCalled();
            expect(firstPanel).toBe(secondPanel);
            expect((ConductorPanel as any).currentPanel).toBe(firstPanel);

            firstPanel.dispose();
        });

        it('should return same instance for multiple calls', () => {
            const panel1 = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);
            const panel2 = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);
            const panel3 = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect(panel1).toBe(panel2);
            expect(panel2).toBe(panel3);
            expect(mockWebviewHost.reveal).toHaveBeenCalledTimes(2);

            panel1.dispose();
        });

        it('should create new panel after previous one is disposed', () => {
            const firstPanel = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);
            firstPanel.dispose();

            jest.clearAllMocks();
            const secondPanel = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
            expect(firstPanel).not.toBe(secondPanel);

            secondPanel.dispose();
        });
    });

    describe('reveal method', () => {
        it('should call reveal on webview host', () => {
            conductorPanel.reveal();

            expect(mockWebviewHost.reveal).toHaveBeenCalled();
        });

        it('should work with static instance', () => {
            const panel = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);
            jest.clearAllMocks();

            panel.reveal();

            expect(mockWebviewHost.reveal).toHaveBeenCalled();

            panel.dispose();
        });
    });

    describe('dispose method', () => {
        it('should dispose all resources', () => {
            conductorPanel.dispose();

            expect(MockPanelBinder.prototype.dispose).toHaveBeenCalled();
            expect(mockWebviewHost.dispose).toHaveBeenCalled();
            expect((ConductorPanel as any).currentPanel).toBeUndefined();
        });

        it('should be idempotent', () => {
            conductorPanel.dispose();
            jest.clearAllMocks();

            // Should not throw or call dispose methods again
            conductorPanel.dispose();

            expect(MockPanelBinder.prototype.dispose).not.toHaveBeenCalled();
            expect(mockWebviewHost.dispose).not.toHaveBeenCalled();
        });

        it('should clear static currentPanel reference', () => {
            const panel = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect((ConductorPanel as any).currentPanel).toBe(panel);

            panel.dispose();

            expect((ConductorPanel as any).currentPanel).toBeUndefined();
        });

        it('should handle disposal when already disposed', () => {
            conductorPanel.dispose();

            expect(() => conductorPanel.dispose()).not.toThrow();
        });

        it('should dispose in correct order', () => {
            const disposeCalls: string[] = [];

            MockPanelBinder.prototype.dispose.mockImplementation(() => {
                disposeCalls.push('panelBinder');
            });

            mockWebviewHost.dispose = jest.fn().mockImplementation(() => {
                disposeCalls.push('webviewHost');
            });

            conductorPanel.dispose();

            expect(disposeCalls).toEqual(['panelBinder', 'webviewHost']);
        });
    });

    describe('integration with webview lifecycle', () => {
        it('should handle webview panel disposal', () => {
            const panel = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);

            // Simulate webview panel disposal through onDispose callback
            const bindCall = MockPanelBinder.prototype.bindWebviewToViewModel.mock.calls[0];
            const options = bindCall[3];
            options.onDispose();

            expect((ConductorPanel as any).currentPanel).toBeUndefined();
            expect(mockViewModel.dispose).toHaveBeenCalled();

            // Subsequent calls should create new panel
            jest.clearAllMocks();
            const newPanel = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
            expect(newPanel).not.toBe(panel);

            newPanel.dispose();
        });

        it('should handle view state changes', () => {
            const htmlGenerator = MockPanelBinder.prototype.bindWebviewToViewModel.mock.calls[0][2];
            const newState = { ...mockViewState, agentStats: { total: 5, idle: 3, working: 2 } };

            const html = htmlGenerator(newState, mockWebviewHost);

            expect(MockConductorTemplate.prototype.generateConductorHTML).toHaveBeenCalledWith(
                newState,
                mockWebviewHost
            );
            expect(html).toBe('<html><body>Mock HTML</body></html>');
        });
    });

    describe('error handling', () => {
        it('should handle template generation errors gracefully', () => {
            MockConductorTemplate.prototype.generateConductorHTML.mockImplementation(() => {
                throw new Error('Template generation failed');
            });

            const htmlGenerator = MockPanelBinder.prototype.bindWebviewToViewModel.mock.calls[0][2];

            expect(() => htmlGenerator(mockViewState, mockWebviewHost)).toThrow('Template generation failed');
        });

        it('should handle webview host creation errors', () => {
            const errorFactory = jest.fn().mockImplementation(() => {
                throw new Error('WebviewHost creation failed');
            });

            expect(() => {
                ConductorPanel.create(mockContext, mockViewModel, mockLoggingService, errorFactory);
            }).toThrow('WebviewHost creation failed');
        });

        it('should handle panel binder creation errors', () => {
            MockPanelBinder.create.mockImplementation(() => {
                throw new Error('PanelBinder creation failed');
            });

            expect(() => {
                new ConductorPanel(mockWebviewHost, mockContext, mockViewModel, mockLoggingService);
            }).toThrow('PanelBinder creation failed');
        });

        it('should handle disposal errors gracefully', () => {
            MockPanelBinder.prototype.dispose.mockImplementation(() => {
                throw new Error('PanelBinder disposal failed');
            });

            // Should not propagate the error
            expect(() => conductorPanel.dispose()).not.toThrow();
        });

        it('should handle webview host disposal errors gracefully', () => {
            mockWebviewHost.dispose = jest.fn().mockImplementation(() => {
                throw new Error('WebviewHost disposal failed');
            });

            // Should not propagate the error
            expect(() => conductorPanel.dispose()).not.toThrow();
        });
    });

    describe('concurrent access patterns', () => {
        it('should handle multiple concurrent createOrShow calls', () => {
            const panels = Array.from({ length: 5 }, () =>
                ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService)
            );

            expect(panels.every(panel => panel === panels[0])).toBe(true);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);

            panels[0].dispose();
        });

        it('should handle rapid create and dispose cycles', () => {
            for (let i = 0; i < 3; i++) {
                const panel = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);
                panel.dispose();
                expect((ConductorPanel as any).currentPanel).toBeUndefined();
            }

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(3);
        });

        it('should maintain consistency during disposal', () => {
            const panel1 = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);

            // Start disposal
            panel1.dispose();

            // Try to create new panel during disposal
            const panel2 = ConductorPanel.createOrShow(mockContext, mockViewModel, mockLoggingService);

            expect(panel1).not.toBe(panel2);
            expect((ConductorPanel as any).currentPanel).toBe(panel2);

            panel2.dispose();
        });
    });

    describe('webview configuration', () => {
        it('should configure webview with correct options', () => {
            ConductorPanel.create(mockContext, mockViewModel, mockLoggingService);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'nofxConductor',
                'NofX Conductor',
                vscode.ViewColumn.One,
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: expect.arrayContaining([
                        expect.objectContaining({
                            path: expect.stringContaining('webview')
                        })
                    ])
                })
            );
        });

        it('should use correct view type and title', () => {
            ConductorPanel.create(mockContext, mockViewModel, mockLoggingService);

            const createCall = (vscode.window.createWebviewPanel as jest.Mock).mock.calls[0];
            expect(createCall[0]).toBe('nofxConductor');
            expect(createCall[1]).toBe('NofX Conductor');
            expect(createCall[2]).toBe(vscode.ViewColumn.One);
        });

        it('should configure local resource roots correctly', () => {
            const customContext = {
                ...mockContext,
                extensionUri: vscode.Uri.file('/custom/extension/path')
            };

            ConductorPanel.create(customContext, mockViewModel, mockLoggingService);

            expect(vscode.Uri.joinPath).toHaveBeenCalledWith(customContext.extensionUri, 'webview');
        });
    });
});
