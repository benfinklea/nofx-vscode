/**
 * Centralized mock factories for all test files
 * This ensures consistent mocking across the entire test suite
 */

import { ILoggingService, IEventBus, IConfiguration, INotificationService } from '../../services/interfaces';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';

/**
 * Creates a complete mock for ILoggingService
 */
export function createMockLoggingService(): any {
    return {
        trace: jest.fn(),
        debug: jest.fn(),
        agents: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        isLevelEnabled: jest.fn().mockReturnValue(true),
        setConfigurationService: jest.fn(),
        getChannel: jest.fn().mockReturnValue({
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        }),
        time: jest.fn(),
        timeEnd: jest.fn(),
        onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        dispose: jest.fn()
    };
}

/**
 * Creates a complete mock for IEventBus
 */
export function createMockEventBus(): any {
    const emitter = new EventEmitter();
    return {
        emit: jest.fn((event: string, data?: any) => emitter.emit(event, data)),
        subscribe: jest.fn((event: string, handler: (...args: any[]) => void) => {
            emitter.on(event, handler);
            return { dispose: jest.fn(() => emitter.off(event, handler)) };
        }),
        unsubscribe: jest.fn(),
        once: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        filter: jest.fn().mockReturnValue({ event: { dispose: jest.fn() }, dispose: jest.fn() }),
        subscribePattern: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        setLoggingService: jest.fn(),
        dispose: jest.fn()
    };
}

/**
 * Creates a complete mock for INotificationService
 */
export function createMockNotificationService(): any {
    return {
        showInformation: jest.fn().mockResolvedValue(undefined),
        showWarning: jest.fn().mockResolvedValue(undefined),
        showError: jest.fn().mockResolvedValue(undefined),
        showQuickPick: jest.fn().mockResolvedValue(undefined),
        showInputBox: jest.fn().mockResolvedValue(undefined),
        withProgress: jest.fn().mockResolvedValue(undefined),
        confirm: jest.fn().mockResolvedValue(false),
        confirmDestructive: jest.fn().mockResolvedValue(false),
        dispose: jest.fn()
    };
}

/**
 * Creates a complete mock for IConfiguration
 */
export function createMockConfigurationService(): any {
    return {
        get: jest.fn().mockReturnValue(undefined),
        getAll: jest.fn().mockReturnValue({}),
        update: jest.fn(() => Promise.resolve()),
        onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        validateAll: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
        getMaxAgents: jest.fn().mockReturnValue(10),
        getAiProvider: jest.fn().mockReturnValue('claude'),
        getAiPath: jest.fn().mockReturnValue('claude'),
        isClaudeSkipPermissions: jest.fn().mockReturnValue(false),
        isAutoAssignTasks: jest.fn().mockReturnValue(true),
        isUseWorktrees: jest.fn().mockReturnValue(false),
        getOrchestrationHeartbeatInterval: jest.fn().mockReturnValue(30000),
        getOrchestrationHeartbeatTimeout: jest.fn().mockReturnValue(60000),
        getOrchestrationPersistencePath: jest.fn().mockReturnValue('.nofx/orchestration'),
        getClaudeInitializationDelay: jest.fn().mockReturnValue(2000),
        getTemplatesPath: jest.fn().mockReturnValue('.nofx/templates'),
        isShowAgentTerminalOnSpawn: jest.fn().mockReturnValue(true),
        isAutoManageWorktrees: jest.fn().mockReturnValue(true),
        getLogLevel: jest.fn().mockReturnValue('info'),
        isPersistAgents: jest.fn().mockReturnValue(true),
        getOrchestrationHistoryLimit: jest.fn().mockReturnValue(1000),
        getOrchestrationMaxFileSize: jest.fn().mockReturnValue(1048576),
        dispose: jest.fn()
    };
}

/**
 * Creates a mock container for dependency injection
 */
export function createMockContainer(): any {
    const services = new Map();
    return {
        get: jest.fn((key: string) => services.get(key)),
        set: jest.fn((key: string, value: any) => services.set(key, value)),
        register: jest.fn((key: string, factory: Function) => services.set(key, factory())),
        dispose: jest.fn()
    };
}

/**
 * Creates a mock VS Code extension context
 */
export function createMockExtensionContext(): any {
    return {
        subscriptions: [],
        workspaceState: {
            get: jest.fn().mockReturnValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
            keys: jest.fn().mockReturnValue([])
        },
        globalState: {
            get: jest.fn().mockReturnValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
            keys: jest.fn().mockReturnValue([]),
            setKeysForSync: jest.fn()
        },
        extensionPath: '/mock/extension/path',
        storagePath: '/mock/storage/path',
        globalStoragePath: '/mock/global/storage/path',
        logPath: '/mock/log/path',
        asAbsolutePath: jest.fn((path: string) => `/mock/extension/path/${path}`),
        extensionUri: vscode.Uri.file('/mock/extension/path'),
        environmentVariableCollection: {
            persistent: true,
            get: jest.fn(),
            set: jest.fn(),
            delete: jest.fn(),
            clear: jest.fn(),
            forEach: jest.fn()
        }
    };
}

/**
 * Creates a mock VS Code output channel
 */
export function createMockOutputChannel(): any {
    return {
        name: 'Mock Channel',
        append: jest.fn(),
        appendLine: jest.fn(),
        clear: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
    };
}

/**
 * Creates a mock VS Code terminal
 */
export function createMockTerminal(): any {
    return {
        name: 'Mock Terminal',
        processId: Promise.resolve(12345),
        creationOptions: {},
        exitStatus: undefined,
        state: { isInteractedWith: false },
        sendText: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
    };
}

/**
 * Sets up common VS Code API mocks
 */
export function setupVSCodeMocks(): void {
    (global as any).vscode = {
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn().mockResolvedValue(undefined)
            }),
            workspaceFolders: [],
            onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() })
        },
        window: {
            createOutputChannel: jest.fn(() => createMockOutputChannel()),
            createTerminal: jest.fn(() => createMockTerminal()),
            showInformationMessage: jest.fn().mockResolvedValue(undefined),
            showWarningMessage: jest.fn().mockResolvedValue(undefined),
            showErrorMessage: jest.fn().mockResolvedValue(undefined),
            terminals: []
        },
        commands: {
            registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            executeCommand: jest.fn().mockResolvedValue(undefined),
            getCommands: jest.fn().mockResolvedValue([])
        },
        extensions: {
            getExtension: jest.fn().mockReturnValue({
                isActive: true,
                packageJSON: { contributes: { commands: [] } },
                activate: jest.fn().mockResolvedValue(undefined)
            })
        },
        Uri: {
            file: jest.fn((path: string) => ({ fsPath: path, toString: () => path })),
            parse: jest.fn((uri: string) => ({ fsPath: uri, toString: () => uri }))
        },
        TreeItemCollapsibleState: {
            None: 0,
            Collapsed: 1,
            Expanded: 2
        },
        Disposable: {
            from: jest.fn((...disposables: any[]) => ({
                dispose: jest.fn(() => disposables.forEach(d => d.dispose?.()))
            }))
        }
    };
}
