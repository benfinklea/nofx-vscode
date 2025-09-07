import {
    IContainer,
    SERVICE_TOKENS,
    IMetricsService,
    IConfigurationService,
    ILoggingService,
    IEventBus,
    IConfigurationValidator,
    INotificationService
} from '../../services/interfaces';
import { Agent, Task, TaskConfig } from '../../agents/types';
import {
    createMockAgent,
    createMockTask,
    createMockConfiguration,
    createTestContainer,
    waitForEvent,
    measureTime
} from '../setup';
import * as vscode from 'vscode';

// Re-export commonly used test utilities
export { createMockAgent, createMockTask, waitForEvent, measureTime };

/**
 * Enhanced test utilities and helpers for comprehensive testing
 */

// Factory functions for creating test objects
export const createMockAgentWithOverrides = (overrides: Partial<Agent> = {}): Agent => ({
    id: `test-agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Agent',
    type: 'General Purpose',
    status: 'idle',
    terminal: {} as any, // Mock terminal for testing
    currentTask: null,
    startTime: new Date(),
    tasksCompleted: 0,
    template: {
        name: 'Test Template',
        description: 'A test agent template',
        icon: '🤖',
        capabilities: ['general'],
        commands: []
    },
    ...overrides
});

export const createMockTaskWithOverrides = (overrides: Partial<Task> = {}): Task => ({
    id: `test-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: 'Test Task',
    description: 'A test task',
    priority: 'medium',
    numericPriority: 5,
    status: 'ready',
    assignedTo: undefined,
    files: [],
    createdAt: new Date(),
    completedAt: undefined,
    dependsOn: [],
    prefers: [],
    blockedBy: [],
    tags: [],
    estimatedDuration: undefined,
    requiredCapabilities: [],
    conflictsWith: [],
    agentMatchScore: undefined,
    ...overrides
});

export const createMockConfigurationWithOverrides = (overrides: Record<string, any> = {}): Record<string, any> => ({
    maxAgents: 3,
    aiPath: 'claude',
    autoAssignTasks: true,
    useWorktrees: true,
    logLevel: 'info',
    autoStart: false,
    claudeCommandStyle: 'simple',
    enableMetrics: false,
    metricsOutputLevel: 'basic',
    testMode: false,
    ...overrides
});

// DI Container test utilities
export const createTestContainerWithMocks = (): IContainer => {
    const container = createTestContainer();

    // Mock all services with realistic implementations
    container.registerInstance(SERVICE_TOKENS.ConfigurationService, {
        get: jest.fn((key: string, defaultValue?: any) => {
            const config = createMockConfigurationWithOverrides();
            return config[key] ?? defaultValue;
        }),
        getAll: jest.fn(() => createMockConfigurationWithOverrides()),
        update: jest.fn().mockResolvedValue(undefined),
        onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
        validateAll: jest.fn(() => ({ isValid: true, errors: [] })),
        getMaxAgents: jest.fn(() => 3),
        getAiPath: jest.fn(() => 'claude'),
        isAutoAssignTasks: jest.fn(() => true),
        isUseWorktrees: jest.fn(() => true),
        isShowAgentTerminalOnSpawn: jest.fn(() => true),
        getTemplatesPath: jest.fn(() => '.nofx/templates'),
        isPersistAgents: jest.fn(() => true),
        getLogLevel: jest.fn(() => 'info'),
        getOrchestrationHeartbeatInterval: jest.fn(() => 10000),
        getOrchestrationHeartbeatTimeout: jest.fn(() => 30000),
        getOrchestrationHistoryLimit: jest.fn(() => 1000),
        getOrchestrationPersistencePath: jest.fn(() => '.nofx/orchestration'),
        getOrchestrationMaxFileSize: jest.fn(() => 10485760),
        dispose: jest.fn()
    });

    container.registerInstance(SERVICE_TOKENS.LoggingService, {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        isLevelEnabled: jest.fn(() => true),
        getChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn() })),
        time: jest.fn(),
        timeEnd: jest.fn(),
        dispose: jest.fn()
    });

    container.registerInstance(SERVICE_TOKENS.EventBus, {
        publish: jest.fn(),
        subscribe: jest.fn(() => ({ dispose: jest.fn() })),
        unsubscribe: jest.fn(),
        once: jest.fn(() => ({ dispose: jest.fn() })),
        filter: jest.fn(),
        subscribePattern: jest.fn(() => ({ dispose: jest.fn() })),
        setLoggingService: jest.fn(),
        dispose: jest.fn()
    });

    container.registerInstance(SERVICE_TOKENS.NotificationService, {
        showInformation: jest.fn().mockResolvedValue(undefined),
        showWarning: jest.fn().mockResolvedValue(undefined),
        showError: jest.fn().mockResolvedValue(undefined),
        showQuickPick: jest.fn().mockResolvedValue(undefined),
        showInputBox: jest.fn().mockResolvedValue(undefined),
        withProgress: jest.fn().mockImplementation((options, task) => task({ report: jest.fn() })),
        confirm: jest.fn().mockResolvedValue(true),
        confirmDestructive: jest.fn().mockResolvedValue(true)
    });

    container.registerInstance(SERVICE_TOKENS.MetricsService, {
        incrementCounter: jest.fn(),
        recordDuration: jest.fn(),
        setGauge: jest.fn(),
        startTimer: jest.fn(() => `timer-${Date.now()}`),
        endTimer: jest.fn(),
        getMetrics: jest.fn(() => []),
        resetMetrics: jest.fn(),
        exportMetrics: jest.fn(() => '{}'),
        dispose: jest.fn()
    });

    container.registerInstance(SERVICE_TOKENS.ConfigurationValidator, {
        validateConfiguration: jest.fn(() => ({ isValid: true, errors: [] })),
        validateConfigurationKey: jest.fn(() => ({ isValid: true, errors: [] })),
        getValidationSchema: jest.fn(() => ({})),
        getValidationErrors: jest.fn(() => []),
        dispose: jest.fn()
    });

    return container;
};

export const createIntegrationContainer = (): IContainer => {
    const container = createTestContainer();

    // Register real service implementations (not mocks) for integration testing
    // Only stub external I/O (file system, terminals) but keep core services real

    // Mock external dependencies first
    const mockVsCodeConfigForIntegration = {
        get: jest.fn((key: string, defaultValue?: any) => {
            const config = createMockConfigurationWithOverrides();
            return config[key] ?? defaultValue;
        }),
        update: jest.fn().mockResolvedValue(undefined),
        has: jest.fn(() => true),
        inspect: jest.fn()
    };

    // Register real ConfigurationService
    const { ConfigurationService } = require('../../services/ConfigurationService');
    const { ConfigurationValidator } = require('../../services/ConfigurationValidator');
    const { LoggingService } = require('../../services/LoggingService');
    const { EventBus } = require('../../services/EventBus');
    const { NotificationService } = require('../../services/NotificationService');
    const { MetricsService } = require('../../services/MetricsService');
    const { TaskStateMachine } = require('../../tasks/TaskStateMachine');
    const { PriorityTaskQueue } = require('../../tasks/PriorityTaskQueue');
    const { CapabilityMatcher } = require('../../tasks/CapabilityMatcher');
    const { TaskDependencyManager } = require('../../tasks/TaskDependencyManager');
    const { AgentManager } = require('../../agents/AgentManager');
    const { TaskQueue } = require('../../tasks/TaskQueue');
    const { OrchestrationServer } = require('../../orchestration/OrchestrationServer');
    const { ConnectionPoolService } = require('../../services/ConnectionPoolService');
    const { MessageRouter } = require('../../services/MessageRouter');
    const { MessageValidator } = require('../../services/MessageValidator');
    const { InMemoryMessagePersistenceService } = require('../../services/InMemoryMessagePersistenceService');

    // Create mock VS Code workspace for ConfigurationService
    const mockVsCodeConfig = {
        get: jest.fn((key: string, defaultValue?: any) => {
            const config = createMockConfigurationWithOverrides();
            return config[key] ?? defaultValue;
        }),
        update: jest.fn().mockResolvedValue(undefined),
        has: jest.fn(() => true),
        inspect: jest.fn()
    };
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockVsCodeConfigForIntegration);

    // Register real services
    const eventBus = new EventBus();
    container.registerInstance(SERVICE_TOKENS.EventBus, eventBus);

    const notificationService = new NotificationService();
    container.registerInstance(SERVICE_TOKENS.NotificationService, notificationService);

    // Create mock output channel for LoggingService
    const mockOutputChannel = {
        appendLine: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
    };
    container.registerInstance(SERVICE_TOKENS.OutputChannel, mockOutputChannel);

    const configValidator = new ConfigurationValidator(createMockLoggingService(), notificationService);
    container.registerInstance(SERVICE_TOKENS.ConfigurationValidator, configValidator);

    const configService = new ConfigurationService(configValidator, eventBus);
    container.registerInstance(SERVICE_TOKENS.ConfigurationService, configService);

    const loggingService = new LoggingService(configService, mockOutputChannel);
    container.registerInstance(SERVICE_TOKENS.LoggingService, loggingService);

    const metricsService = new MetricsService(configService, loggingService, eventBus);
    container.registerInstance(SERVICE_TOKENS.MetricsService, metricsService);

    const taskStateMachine = new TaskStateMachine(loggingService, eventBus);
    container.registerInstance(SERVICE_TOKENS.TaskStateMachine, taskStateMachine);

    const taskDependencyManager = new TaskDependencyManager(loggingService, eventBus, notificationService);
    container.registerInstance(SERVICE_TOKENS.TaskDependencyManager, taskDependencyManager);

    const priorityTaskQueue = new PriorityTaskQueue(loggingService, taskDependencyManager);
    container.registerInstance(SERVICE_TOKENS.PriorityTaskQueue, priorityTaskQueue);

    const capabilityMatcher = new CapabilityMatcher(loggingService, configService);
    container.registerInstance(SERVICE_TOKENS.CapabilityMatcher, capabilityMatcher);

    // Create mock extension context for AgentManager
    const mockContext = {
        subscriptions: [],
        workspaceState: {
            get: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
            keys: jest.fn(() => [])
        },
        globalState: {
            get: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
            keys: jest.fn(() => [])
        },
        extensionPath: '/mock/extension/path',
        extensionUri: { fsPath: '/mock/extension/path' } as any,
        storageUri: { fsPath: '/mock/storage/path' } as any,
        globalStorageUri: { fsPath: '/mock/global/storage/path' } as any,
        logUri: { fsPath: '/mock/log/path' } as any
    };

    const agentManager = new AgentManager(mockContext);

    // Create mock dependencies for AgentManager
    const mockAgentLifecycleManager = {
        initialize: jest.fn().mockResolvedValue(undefined),
        spawnAgent: jest.fn().mockImplementation(async (config: any, restoredId?: string) => {
            const agent = createMockAgentWithOverrides({
                id: restoredId || `test-agent-${Date.now()}`,
                name: config.name,
                type: config.type,
                template: config.template
            });
            return agent;
        }),
        removeAgent: jest.fn().mockResolvedValue(true),
        dispose: jest.fn()
    };

    const mockTerminalManager = {
        getTerminal: jest.fn().mockReturnValue({
            show: jest.fn(),
            sendText: jest.fn(),
            dispose: jest.fn()
        }),
        onTerminalClosed: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        dispose: jest.fn()
    };

    const mockWorktreeService = {
        createWorktree: jest.fn().mockResolvedValue({ path: '/mock/worktree' }),
        removeWorktree: jest.fn().mockResolvedValue(undefined),
        listWorktrees: jest.fn().mockResolvedValue([]),
        dispose: jest.fn()
    };

    // Set dependencies for AgentManager
    agentManager.setDependencies(
        mockAgentLifecycleManager,
        mockTerminalManager,
        mockWorktreeService,
        configService,
        notificationService,
        loggingService,
        eventBus,
        createMockErrorHandler(),
        metricsService
    );

    container.registerInstance(SERVICE_TOKENS.AgentManager, agentManager);

    const taskQueue = new TaskQueue(
        agentManager,
        loggingService,
        eventBus,
        createMockErrorHandler(),
        notificationService,
        configService,
        taskStateMachine,
        priorityTaskQueue,
        capabilityMatcher,
        taskDependencyManager,
        metricsService
    );
    container.registerInstance(SERVICE_TOKENS.TaskQueue, taskQueue);

    // Set task reader for state machine
    taskStateMachine.setTaskReader(taskQueue);

    // Register real orchestration services instead of mocks
    const errorHandler = createMockErrorHandler();

    const connectionPoolService = new ConnectionPoolService(loggingService, eventBus, errorHandler, configService);
    container.registerInstance(SERVICE_TOKENS.ConnectionPoolService, connectionPoolService);

    const messageValidator = new MessageValidator(loggingService, eventBus);
    container.registerInstance(SERVICE_TOKENS.MessageValidator, messageValidator);

    const messagePersistenceService = new InMemoryMessagePersistenceService(loggingService, configService, eventBus);
    container.registerInstance(SERVICE_TOKENS.MessagePersistenceService, messagePersistenceService);

    const messageRouter = new MessageRouter(
        connectionPoolService,
        messagePersistenceService,
        loggingService,
        eventBus,
        errorHandler,
        agentManager,
        taskQueue
    );
    container.registerInstance(SERVICE_TOKENS.MessageRouter, messageRouter);

    const orchestrationServer = new OrchestrationServer(
        0, // Use random port
        loggingService,
        eventBus,
        errorHandler,
        connectionPoolService,
        messageRouter,
        messageValidator,
        messagePersistenceService,
        metricsService
    );
    container.registerInstance(SERVICE_TOKENS.OrchestrationServer, orchestrationServer);

    return container;
};

// Helper functions for creating mock services that are still external dependencies
function createMockLoggingService() {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        isLevelEnabled: jest.fn(() => true),
        getChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        })),
        time: jest.fn(),
        timeEnd: jest.fn(),
        dispose: jest.fn()
    };
}

function createMockErrorHandler() {
    return {
        handleError: jest.fn(),
        handleAsync: jest.fn().mockImplementation(async op => await op()),
        wrapSync: jest.fn().mockImplementation(op => op()),
        withRetry: jest.fn().mockImplementation(async op => await op()),
        dispose: jest.fn()
    };
}

function createMockConnectionPoolService() {
    return {
        addConnection: jest.fn(),
        removeConnection: jest.fn(),
        getConnection: jest.fn(),
        getAllConnections: jest.fn(() => new Map()),
        broadcast: jest.fn(),
        sendToClient: jest.fn(),
        sendToLogical: jest.fn(),
        registerLogicalId: jest.fn(),
        resolveLogicalId: jest.fn(),
        unregisterLogicalId: jest.fn(),
        getConnectionSummaries: jest.fn(() => []),
        startHeartbeat: jest.fn(),
        stopHeartbeat: jest.fn(),
        dispose: jest.fn()
    };
}

function createMockMessageRouter() {
    return {
        route: jest.fn(),
        validateDestination: jest.fn(() => true),
        handleAcknowledgment: jest.fn(),
        replayToClient: jest.fn(),
        setDashboardCallback: jest.fn(),
        dispose: jest.fn()
    };
}

function createMockMessageValidator() {
    return {
        validate: jest.fn(() => ({ isValid: true, errors: [], warnings: [], result: {} })),
        validatePayload: jest.fn(() => ({ isValid: true, errors: [], warnings: [] })),
        createErrorResponse: jest.fn(() => ({})),
        dispose: jest.fn()
    };
}

function createMockMessagePersistenceService() {
    return {
        save: jest.fn(),
        load: jest.fn(() => Promise.resolve([])),
        getHistory: jest.fn(() => Promise.resolve([])),
        clear: jest.fn(),
        getStats: jest.fn(() => Promise.resolve({ totalMessages: 0, oldestMessage: new Date() })),
        dispose: jest.fn()
    };
}

// VS Code API mocking utilities
export const mockVSCodeWorkspace = {
    getConfiguration: jest.fn(() => ({
        get: jest.fn(),
        update: jest.fn(),
        has: jest.fn(),
        inspect: jest.fn()
    })),
    workspaceFolders: [],
    onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeWorkspaceFolders: jest.fn(() => ({ dispose: jest.fn() })),
    onDidOpenTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    onDidCloseTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    onDidSaveTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    openTextDocument: jest.fn(),
    saveAll: jest.fn(),
    applyEdit: jest.fn(),
    asRelativePath: jest.fn()
};

export const mockVSCodeWindow = {
    createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
    })),
    createTerminal: jest.fn(() => ({
        show: jest.fn(),
        hide: jest.fn(),
        sendText: jest.fn(),
        dispose: jest.fn()
    })),
    showInformationMessage: jest.fn().mockResolvedValue(undefined),
    showWarningMessage: jest.fn().mockResolvedValue(undefined),
    showErrorMessage: jest.fn().mockResolvedValue(undefined),
    showQuickPick: jest.fn().mockResolvedValue(undefined),
    showInputBox: jest.fn().mockResolvedValue(undefined),
    createWebviewPanel: jest.fn(() => ({
        webview: {
            html: '',
            onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
            postMessage: jest.fn()
        },
        onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
        reveal: jest.fn(),
        dispose: jest.fn()
    })),
    registerTreeDataProvider: jest.fn(),
    createTreeView: jest.fn(() => ({
        onDidChangeSelection: jest.fn(() => ({ dispose: jest.fn() })),
        reveal: jest.fn(),
        dispose: jest.fn()
    }))
};

// WebSocket testing utilities
export const createMockWebSocketServer = () => ({
    on: jest.fn(),
    close: jest.fn(),
    clients: new Set(),
    broadcast: jest.fn(),
    send: jest.fn()
});

export const createMockWebSocketClient = () => ({
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1, // WebSocket.OPEN
    on: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
});

export const simulateWebSocketMessage = (client: any, message: any) => {
    const messageEvent = {
        data: JSON.stringify(message),
        type: 'message'
    };
    client.on.mock.calls
        .filter(([event]: [string, any]) => event === 'message')
        .forEach(([, handler]: [string, any]) => handler(messageEvent));
};

// Temporary workspace utilities
export const createTempWorkspace = async (): Promise<{ path: string; cleanup: () => void }> => {
    const tmp = require('tmp');
    return new Promise((resolve, reject) => {
        tmp.dir({ unsafeCleanup: true }, (err: any, path: string, cleanup: () => void) => {
            if (err) reject(err);
            else resolve({ path, cleanup });
        });
    });
};

export const createTempFile = async (
    content: string,
    extension: string = '.txt'
): Promise<{ path: string; cleanup: () => void }> => {
    const tmp = require('tmp');
    return new Promise((resolve, reject) => {
        tmp.file({ postfix: extension }, (err: any, path: string, fd: number, cleanup: () => void) => {
            if (err) {
                reject(err);
                return;
            }

            require('fs').writeFileSync(path, content);
            resolve({ path, cleanup });
        });
    });
};

// Assertion helpers
export const expectAgentState = (agent: Agent, expectedState: Partial<Agent>) => {
    expect(agent.status).toBe(expectedState.status);
    if (expectedState.name !== undefined) {
        expect(agent.name).toBe(expectedState.name);
    }
    if (expectedState.type !== undefined) {
        expect(agent.type).toBe(expectedState.type);
    }
};

export const expectTaskState = (task: Task, expectedState: Partial<Task>) => {
    expect(task.status).toBe(expectedState.status);
    if (expectedState.assignedTo !== undefined) {
        expect(task.assignedTo).toBe(expectedState.assignedTo);
    }
    if (expectedState.priority) {
        expect(task.priority).toBe(expectedState.priority);
    }
    if (expectedState.dependsOn) {
        expect(task.dependsOn).toEqual(expect.arrayContaining(expectedState.dependsOn));
    }
};

export const expectMetricsRecorded = (
    metricsService: IMetricsService,
    expectedMetrics: Array<{ name: string; type?: string; value?: number }>
) => {
    const metrics = metricsService.getMetrics();

    expectedMetrics.forEach(expected => {
        const matchingMetrics = metrics.filter(m => m.name === expected.name);
        expect(matchingMetrics.length).toBeGreaterThan(0);

        if (expected.type) {
            expect(matchingMetrics.some(m => m.type === expected.type)).toBe(true);
        }
        if (expected.value !== undefined) {
            expect(matchingMetrics.some(m => m.value === expected.value)).toBe(true);
        }
    });
};

export const expectConfigurationValid = (configService: IConfigurationService, key: string, value: any) => {
    const result = configService.get(key);
    expect(result).toBe(value);
};

export const expectValidationErrors = (
    validator: IConfigurationValidator,
    expectedErrors: Array<{ field: string; message: string }>
) => {
    const errors = validator.getValidationErrors();

    expectedErrors.forEach(expected => {
        const matchingError = errors.find(e => e.field === expected.field);
        expect(matchingError).toBeDefined();
        expect(matchingError?.message).toContain(expected.message);
    });
};

// Async testing utilities
export const waitForCondition = async (
    condition: () => boolean,
    timeout: number = 5000,
    interval: number = 100
): Promise<void> => {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        if (condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
};

export const waitForMetrics = async (
    metricsService: IMetricsService,
    expectedCount: number,
    timeout: number = 5000
): Promise<void> => {
    await waitForCondition(() => {
        const metrics = metricsService.getMetrics();
        return metrics.length >= expectedCount;
    }, timeout);
};

export const retryOperation = async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 100
): Promise<T> => {
    let lastError: Error;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError!;
};

// Performance testing utilities
export const measureExecutionTime = async <T>(
    operation: () => Promise<T>
): Promise<{ result: T; duration: number }> => {
    const start = process.hrtime.bigint();
    const result = await operation();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds

    return { result, duration };
};

export const measureMemoryUsage = (): { heapUsed: number; heapTotal: number; external: number } => {
    const usage = process.memoryUsage();
    return {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external
    };
};

export const generateLoad = async (
    operation: () => Promise<void>,
    concurrency: number = 10,
    duration: number = 1000
): Promise<void> => {
    const startTime = Date.now();
    const promises: Promise<void>[] = [];

    while (Date.now() - startTime < duration) {
        if (promises.length < concurrency) {
            promises.push(operation());
        } else {
            await Promise.race(promises);
            promises.splice(
                promises.findIndex(p => p === Promise.race(promises)),
                1
            );
        }
    }

    await Promise.all(promises);
};

// Debugging utilities
export const enableTestLogging = () => {
    process.env.ENABLE_TEST_LOGGING = 'true';
};

export const disableTestLogging = () => {
    delete process.env.ENABLE_TEST_LOGGING;
};

export const logTestState = (message: string, data?: any) => {
    if (process.env.ENABLE_TEST_LOGGING) {
        console.log(`[TEST] ${message}`, data || '');
    }
};

export const inspectObject = (obj: any, maxDepth: number = 3): string => {
    return JSON.stringify(obj, null, 2);
};

// Test data generators
export const generateTestAgents = (count: number): Agent[] => {
    return Array.from({ length: count }, (_, i) =>
        createMockAgentWithOverrides({
            id: `agent-${i}`,
            name: `Test Agent ${i}`,
            type: i % 2 === 0 ? 'Frontend Specialist' : 'Backend Specialist'
        })
    );
};

export const generateTestTasks = (count: number): Task[] => {
    return Array.from({ length: count }, (_, i) =>
        createMockTaskWithOverrides({
            id: `task-${i}`,
            title: `Test Task ${i}`,
            description: `Description for task ${i}`,
            priority: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
            numericPriority: i % 3 === 0 ? 8 : i % 3 === 1 ? 5 : 2
        })
    );
};

export const generateTestConfiguration = (overrides: Record<string, any> = {}): Record<string, any> => {
    return createMockConfigurationWithOverrides(overrides);
};

// Cleanup utilities
export const cleanupTestData = async (container: IContainer) => {
    // Dispose all services
    container.dispose();

    // Clear any global state
    jest.clearAllMocks();
    jest.restoreAllMocks();
};

export const resetAllMocks = () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.resetAllMocks();
};

// Test environment setup
export const setupTestEnvironment = () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.CI = 'true';

    // Mock console methods to reduce noise
    if (!process.env.ENABLE_TEST_LOGGING) {
        console.log = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();
    }
};

export const teardownTestEnvironment = () => {
    // Restore console methods
    jest.restoreAllMocks();

    // Clear environment variables
    delete process.env.NODE_ENV;
    delete process.env.CI;
    delete process.env.ENABLE_TEST_LOGGING;
};
