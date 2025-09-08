/**
 * Centralized mock factories for all test files
 * This ensures consistent mocking across the entire test suite
 */

import { EventEmitter } from 'events';

/**
 * Creates a complete mock for IConfigurationService
 */
export function createMockConfigurationService(): any {
    return {
        get: jest.fn().mockReturnValue(undefined),
        getAll: jest.fn().mockReturnValue({}),
        update: jest.fn(() => Promise.resolve()),
        onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        validateAll: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
        getAgentDefaults: jest.fn().mockReturnValue({}),
        getTaskDefaults: jest.fn().mockReturnValue({}),
        getOrchestrationDefaults: jest.fn().mockReturnValue({}),
        getSecuritySettings: jest.fn().mockReturnValue({}),
        getPerformanceSettings: jest.fn().mockReturnValue({}),
        getExperimentalFeatures: jest.fn().mockReturnValue({}),
        getUserPreferences: jest.fn().mockReturnValue({}),
        getMaxAgents: jest.fn().mockReturnValue(10),
        getAgentTimeout: jest.fn().mockReturnValue(30000),
        getOrchestrationPort: jest.fn().mockReturnValue(7777),
        getLogLevel: jest.fn().mockReturnValue('info'),
        getOrchestrationMaxFileSize: jest.fn().mockReturnValue(1048576),
        getOrchestrationHistoryLimit: jest.fn().mockReturnValue(1000),
        getAiProvider: jest.fn().mockReturnValue('claude'),
        getAiPath: jest.fn().mockReturnValue('claude'),
        isClaudeSkipPermissions: jest.fn().mockReturnValue(false),
        isAutoAssignTasks: jest.fn().mockReturnValue(true),
        isUseWorktrees: jest.fn().mockReturnValue(false),
        getOrchestrationHeartbeatInterval: jest.fn().mockReturnValue(30000),
        getOrchestrationHeartbeatTimeout: jest.fn().mockReturnValue(60000),
        getOrchestrationMaxRetries: jest.fn().mockReturnValue(3),
        getOrchestrationPersistencePath: jest.fn().mockReturnValue('.nofx/orchestration'),
        getClaudeInitializationDelay: jest.fn().mockReturnValue(2000),
        getTemplatesPath: jest.fn().mockReturnValue('.nofx/templates'),
        getValidationErrors: jest.fn().mockReturnValue([]),
        isShowAgentTerminalOnSpawn: jest.fn().mockReturnValue(true),
        dispose: jest.fn()
    };
}

/**
 * Creates a complete mock for ILoggingService
 */
export function createMockLoggingService(): any {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
        trace: jest.fn(),
        log: jest.fn(),
        isLevelEnabled: jest.fn().mockReturnValue(true),
        setLevel: jest.fn(),
        getLevel: jest.fn().mockReturnValue('info'),
        dispose: jest.fn()
    };
}

/**
 * Creates a complete mock for IEventBus
 */
export function createMockEventBus(): any {
    const emitter = new EventEmitter();
    return {
        publish: jest.fn((event: string | symbol, data: any) => emitter.emit(event, data)),
        subscribe: jest.fn((event: string | symbol, handler: any) => {
            emitter.on(event, handler);
            return { dispose: () => emitter.off(event, handler) };
        }),
        subscribeOnce: jest.fn((event: string | symbol, handler: any) => {
            emitter.once(event, handler);
            return { dispose: () => emitter.off(event, handler) };
        }),
        unsubscribe: jest.fn((event: string | symbol, handler: any) => emitter.off(event, handler)),
        clear: jest.fn(() => emitter.removeAllListeners()),
        dispose: jest.fn(() => emitter.removeAllListeners())
    };
}

/**
 * Creates a complete mock for INotificationService
 */
export function createMockNotificationService(): any {
    return {
        showInformation: jest.fn(() => Promise.resolve()),
        showWarning: jest.fn(() => Promise.resolve()),
        showError: jest.fn(() => Promise.resolve()),
        showProgress: jest.fn().mockImplementation((title: string, task: any) => task()),
        showInputBox: jest.fn(() => Promise.resolve()),
        showQuickPick: jest.fn(() => Promise.resolve()),
        dispose: jest.fn()
    };
}

/**
 * Creates a complete mock for IErrorHandler
 */
export function createMockErrorHandler(): any {
    return {
        handleError: jest.fn(),
        handleWarning: jest.fn(),
        handleInfo: jest.fn(),
        captureException: jest.fn(),
        setContext: jest.fn(),
        clearContext: jest.fn(),
        dispose: jest.fn()
    };
}

/**
 * Creates a complete mock for IMetricsService
 */
export function createMockMetricsService(): any {
    return {
        trackEvent: jest.fn(),
        trackMetric: jest.fn(),
        trackException: jest.fn(),
        trackDuration: jest.fn(),
        incrementCounter: jest.fn(),
        recordDuration: jest.fn(),
        decrementCounter: jest.fn(),
        setGauge: jest.fn(),
        recordGauge: jest.fn(),
        recordLoadBalancingMetric: jest.fn(),
        startTimer: jest.fn(() => `timer-${Date.now()}`),
        endTimer: jest.fn(),
        getMetrics: jest.fn().mockReturnValue([]),
        resetMetrics: jest.fn(),
        exportMetrics: jest.fn(() => '[]'),
        getDashboardData: jest.fn(() => ({})),
        clearMetrics: jest.fn(),
        dispose: jest.fn()
    };
}

/**
 * Creates a mock container for dependency injection
 */
export function createMockContainer(): any {
    const services = new Map();

    return {
        register: jest.fn((token: any, factory: any, lifecycle?: string) => {
            services.set(token, { factory, lifecycle, instance: null });
        }),
        resolve: jest.fn((token: any) => {
            const service = services.get(token);
            if (!service) {
                // Auto-create mocks for common services
                if (String(token).includes('LoggingService')) return createMockLoggingService();
                if (String(token).includes('ConfigurationService')) return createMockConfigurationService();
                if (String(token).includes('EventBus')) return createMockEventBus();
                if (String(token).includes('NotificationService')) return createMockNotificationService();
                if (String(token).includes('ErrorHandler')) return createMockErrorHandler();
                if (String(token).includes('MetricsService')) return createMockMetricsService();

                throw new Error(`Service not found: ${String(token)}`);
            }

            if (service.lifecycle === 'singleton' && service.instance) {
                return service.instance;
            }

            const instance = typeof service.factory === 'function' ? service.factory() : service.factory;
            if (service.lifecycle === 'singleton') {
                service.instance = instance;
            }
            return instance;
        }),
        resolveOptional: jest.fn((token: any) => {
            try {
                return services.get(token)?.factory();
            } catch {
                return undefined;
            }
        }),
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
            get: jest.fn(),
            update: jest.fn(() => Promise.resolve()),
            keys: jest.fn().mockReturnValue([])
        },
        globalState: {
            get: jest.fn(),
            update: jest.fn(() => Promise.resolve()),
            setKeysForSync: jest.fn(),
            keys: jest.fn().mockReturnValue([])
        },
        secrets: {
            get: jest.fn(() => Promise.resolve()),
            store: jest.fn(() => Promise.resolve()),
            delete: jest.fn(() => Promise.resolve())
        },
        extensionPath: '/test/extension',
        extensionUri: { fsPath: '/test/extension', scheme: 'file' },
        environmentVariableCollection: {
            persistent: true,
            description: 'Test',
            replace: jest.fn(),
            append: jest.fn(),
            prepend: jest.fn(),
            get: jest.fn(),
            forEach: jest.fn(),
            delete: jest.fn(),
            clear: jest.fn()
        },
        storagePath: '/test/storage',
        globalStoragePath: '/test/global-storage',
        logPath: '/test/logs',
        extensionMode: 3, // Test mode
        asAbsolutePath: jest.fn((path: string) => `/test/extension/${path}`),
        storageUri: undefined,
        globalStorageUri: undefined,
        logUri: undefined,
        extension: {
            id: 'test.extension',
            extensionUri: { fsPath: '/test/extension', scheme: 'file' },
            extensionPath: '/test/extension',
            isActive: true,
            packageJSON: {},
            exports: undefined,
            activate: jest.fn(() => Promise.resolve()),
            extensionKind: 1
        }
    };
}

/**
 * Creates a mock VS Code OutputChannel
 */
export function createMockOutputChannel(): any {
    const lines: string[] = [];
    return {
        name: 'Test Output',
        append: jest.fn((value: string) => lines.push(value)),
        appendLine: jest.fn((value: string) => lines.push(value + '\n')),
        clear: jest.fn(() => (lines.length = 0)),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn(),
        replace: jest.fn(),
        getLines: () => lines
    };
}

/**
 * Creates a mock VS Code Terminal
 */
export function createMockTerminal(): any {
    return {
        name: 'Test Terminal',
        processId: Promise.resolve(1234),
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
 * Creates a mock EventEmitter for services
 */
export function createMockEventEmitter(): any {
    const emitter = new EventEmitter();
    return {
        event: jest.fn((listener: any) => {
            emitter.on('event', listener);
            return { dispose: () => emitter.off('event', listener) };
        }),
        fire: jest.fn((data: any) => emitter.emit('event', data)),
        dispose: jest.fn(() => emitter.removeAllListeners())
    };
}

/**
 * Creates a mock IAgentManager
 */
export function createMockAgentManager(): any {
    return {
        agents: new Map(),
        onAgentUpdate: createMockEventEmitter(),
        createAgent: jest.fn(() => Promise.resolve({ id: 'agent-1', status: 'ready' })),
        spawnAgent: jest.fn(() => Promise.resolve({ id: 'agent-1', status: 'ready' })),
        getAgent: jest.fn(),
        listAgents: jest.fn().mockReturnValue([]),
        removeAgent: jest.fn(() => Promise.resolve(true)),
        updateAgentStatus: jest.fn(),
        assignTask: jest.fn(),
        completeTask: jest.fn(),
        dispose: jest.fn()
    };
}

/**
 * Creates a mock ITaskQueue
 */
export function createMockTaskQueue(): any {
    return {
        tasks: [],
        onTaskUpdate: createMockEventEmitter(),
        addTask: jest.fn(),
        getTask: jest.fn(),
        updateTask: jest.fn(),
        removeTask: jest.fn(),
        assignTask: jest.fn(() => Promise.resolve(true)),
        completeTask: jest.fn().mockReturnValue(true),
        failTask: jest.fn(),
        getQueuedTasks: jest.fn().mockReturnValue([]),
        getTasksByStatus: jest.fn().mockReturnValue([]),
        clearCompleted: jest.fn(),
        dispose: jest.fn()
    };
}

/**
 * Sets up VS Code API mocks globally
 */
export function setupVSCodeMocks(): void {
    const vscode = {
        window: {
            showInformationMessage: jest.fn(() => Promise.resolve()),
            showWarningMessage: jest.fn(() => Promise.resolve()),
            showErrorMessage: jest.fn(() => Promise.resolve()),
            showInputBox: jest.fn(() => Promise.resolve()),
            showQuickPick: jest.fn(() => Promise.resolve()),
            createOutputChannel: jest.fn(() => createMockOutputChannel()),
            createTerminal: jest.fn(() => createMockTerminal()),
            activeTextEditor: undefined,
            visibleTextEditors: [],
            terminals: [],
            activeTerminal: undefined,
            withProgress: jest.fn((options: any, task: any) => task({ report: jest.fn() })),
            createStatusBarItem: jest.fn(() => ({
                text: '',
                tooltip: '',
                color: undefined,
                backgroundColor: undefined,
                show: jest.fn(),
                hide: jest.fn(),
                dispose: jest.fn()
            })),
            createWebviewPanel: jest.fn(),
            registerWebviewPanelSerializer: jest.fn(),
            onDidChangeActiveTextEditor: jest.fn(),
            onDidChangeVisibleTextEditors: jest.fn(),
            onDidChangeTextEditorSelection: jest.fn(),
            onDidChangeTextEditorVisibleRanges: jest.fn(),
            onDidChangeTextEditorOptions: jest.fn(),
            onDidChangeTextEditorViewColumn: jest.fn(),
            onDidCloseTerminal: jest.fn(),
            onDidOpenTerminal: jest.fn(),
            onDidChangeActiveTerminal: jest.fn(),
            onDidChangeTerminalState: jest.fn()
        },
        workspace: {
            getConfiguration: jest.fn(() => ({
                get: jest.fn(),
                has: jest.fn(),
                inspect: jest.fn(),
                update: jest.fn(() => Promise.resolve())
            })),
            workspaceFolders: [],
            onDidChangeConfiguration: jest.fn(),
            onDidChangeWorkspaceFolders: jest.fn(),
            fs: {
                readFile: jest.fn(() => Promise.resolve(Buffer.from(''))),
                writeFile: jest.fn(() => Promise.resolve()),
                delete: jest.fn(() => Promise.resolve()),
                rename: jest.fn(() => Promise.resolve()),
                copy: jest.fn(() => Promise.resolve()),
                createDirectory: jest.fn(() => Promise.resolve()),
                readDirectory: jest.fn(() => Promise.resolve([]))
            }
        },
        commands: {
            registerCommand: jest.fn(),
            executeCommand: jest.fn(() => Promise.resolve()),
            getCommands: jest.fn(() => Promise.resolve([]))
        },
        Uri: {
            file: jest.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
            parse: jest.fn((uri: string) => ({ fsPath: uri, scheme: 'file' })),
            joinPath: jest.fn()
        },
        EventEmitter: class {
            event = jest.fn();
            fire = jest.fn();
            dispose = jest.fn();
        },
        TreeItem: class {
            constructor(public label: string) {}
        },
        TreeItemCollapsibleState: {
            None: 0,
            Collapsed: 1,
            Expanded: 2
        },
        ThemeIcon: class {
            constructor(public id: string) {}
        },
        ProgressLocation: {
            Notification: 15,
            Window: 10,
            SourceControl: 1
        },
        StatusBarAlignment: {
            Left: 1,
            Right: 2
        },
        ExtensionMode: {
            Production: 1,
            Development: 2,
            Test: 3
        },
        ViewColumn: {
            One: 1,
            Two: 2,
            Three: 3
        },
        Disposable: class {
            static from(...disposables: any[]) {
                return { dispose: jest.fn() };
            }
        }
    };

    // Make it available globally
    (global as any).vscode = vscode;

    // Also set up module mock
    jest.mock('vscode', () => vscode, { virtual: true });
}

/**
 * Creates a test agent configuration
 */
export function createTestAgentConfig(overrides: any = {}): any {
    return {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'General Purpose',
        capabilities: ['general'],
        status: 'idle',
        ...overrides
    };
}

/**
 * Creates a test task configuration
 */
export function createTestTaskConfig(overrides: any = {}): any {
    return {
        id: 'test-task',
        title: 'Test Task',
        description: 'A test task',
        priority: 'medium',
        status: 'pending',
        capabilities: ['general'],
        ...overrides
    };
}
