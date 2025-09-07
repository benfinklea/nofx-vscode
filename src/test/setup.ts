// The vscode module is now mocked via jest.config.js moduleNameMapper
// pointing to src/test/__mocks__/vscode.ts

// Mock WebSocket
class MockWebSocket {
    public readyState = 1; // WebSocket.OPEN
    public onopen: ((event: any) => void) | null = null;
    public onclose: ((event: any) => void) | null = null;
    public onmessage: ((event: any) => void) | null = null;
    public onerror: ((event: any) => void) | null = null;
    public url: string;

    constructor(url: string) {
        this.url = url;
        setTimeout(() => {
            if (this.onopen) {
                this.onopen({ type: 'open' });
            }
        }, 0);
    }

    send(data: string) {
    // Mock implementation
    }

    close() {
        this.readyState = 3; // WebSocket.CLOSED
        if (this.onclose) {
            this.onclose({ type: 'close' });
        }
    }

    addEventListener() {}
    removeEventListener() {}
}

Object.defineProperty(global, 'WebSocket', {
    value: MockWebSocket,
    writable: true
});

// Conditionally mock file system operations
// Only mock fs when explicitly enabled - default is to use real filesystem
if (process.env.MOCK_FS === 'true') {
    const mockFs = {
        readFileSync: jest.fn(() => ''),
        writeFileSync: jest.fn(),
        existsSync: jest.fn(() => false),
        mkdirSync: jest.fn(),
        readdirSync: jest.fn(() => []),
        statSync: jest.fn(() => ({ isDirectory: () => true, isFile: () => false })),
        unlinkSync: jest.fn(),
        rmdirSync: jest.fn(),
        rmSync: jest.fn(),
        promises: {
            readFile: jest.fn(() => Promise.resolve('')),
            writeFile: jest.fn(() => Promise.resolve()),
            mkdir: jest.fn(() => Promise.resolve()),
            readdir: jest.fn(() => Promise.resolve([])),
            stat: jest.fn(() => Promise.resolve({ isDirectory: () => true, isFile: () => false })),
            unlink: jest.fn(() => Promise.resolve()),
            rmdir: jest.fn(() => Promise.resolve())
        }
    };

    jest.mock('fs', () => mockFs);
}

// Mock child_process
const mockChildProcess = {
    spawn: jest.fn(() => ({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        pid: 12345
    })),
    exec: jest.fn((command: any, options: any, callback: any) => {
        if (typeof options === 'function') {
            // Called with (command, callback)
            callback = options;
            options = {};
        }
        if (callback && typeof callback === 'function') {
            callback(null, 'mock output', '');
        }
        return { kill: jest.fn() };
    })
};

jest.mock('child_process', () => mockChildProcess);

// Mock process properties without overriding the entire object
const originalProcess = process;
let processSpy: jest.SpyInstance;

beforeAll(() => {
    // Set environment variables
    process.env.NODE_ENV = 'test';
    process.env.CI = 'true';

    // Mock process.cwd() instead of overriding the entire process object
    processSpy = jest.spyOn(process, 'cwd').mockReturnValue('/test/workspace');
});

afterAll(() => {
    // Restore original process.cwd
    if (processSpy) {
        processSpy.mockRestore();
    }

    // Restore environment variables
    delete process.env.NODE_ENV;
    delete process.env.CI;
});

// Test utilities
export const createMockAgent = (overrides: any = {}) => ({
    id: 'test-agent-1',
    name: 'Test Agent',
    type: 'General Purpose',
    status: 'idle' as const,
    terminal: {
        show: () => {},
        hide: () => {},
        sendText: () => {},
        dispose: () => {}
    } as any,
    currentTask: null,
    startTime: new Date(),
    tasksCompleted: 0,
    template: null,
    ...overrides
});

export const createMockTask = (overrides: any = {}) => ({
    id: 'test-task-1',
    title: 'Test Task',
    description: 'A test task',
    priority: 'medium' as const,
    numericPriority: 5,
    status: 'queued' as const,
    assignedTo: undefined,
    files: [],
    dependsOn: [],
    prefers: [],
    blockedBy: [],
    conflictsWith: [],
    requiredCapabilities: ['general'],
    tags: [],
    createdAt: new Date(),
    completedAt: undefined,
    estimatedDuration: undefined,
    agentMatchScore: undefined,
    ...overrides
});

export const createMockConfiguration = (overrides: any = {}) => ({
    maxAgents: 3,
    claudePath: 'claude',
    autoAssignTasks: true,
    useWorktrees: true,
    logLevel: 'info',
    ...overrides
});

// DI Container test utilities
export const createTestContainer = () => {
    const services = new Map();
    let loggingService: any = null;

    return {
        resolve: (token: any) => {
            if (services.has(token)) {
                return services.get(token);
            }
            throw new Error(`Service not found: ${token.toString()}`);
        },
        registerInstance: (token: any, instance: any) => {
            services.set(token, instance);
        },
        register: (token: any, factory: any, lifetime?: string) => {
            const instance = factory({ resolve: (t: any) => services.get(t) });
            services.set(token, instance);
        },
        resolveOptional: (token: any) => {
            return services.get(token) || undefined;
        },
        has: (token: any) => services.has(token),
        createScope: () => createTestContainer(),
        setLoggingService: (service: any) => {
            loggingService = service;
        },
        dispose: async () => {
            services.clear();
            loggingService = null;
        }
    };
};

// VS Code API mocking utilities
export const mockWorkspace = {
    getConfiguration: () => ({
        get: () => {},
        update: () => Promise.resolve(),
        has: () => false,
        inspect: () => undefined
    }),
    workspaceFolders: [],
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose: () => {} })
};

export const mockWindow = {
    createOutputChannel: () => ({
        appendLine: () => {},
        show: () => {},
        hide: () => {},
        dispose: () => {}
    }),
    createTerminal: () => ({
        show: () => {},
        hide: () => {},
        sendText: () => {},
        dispose: () => {}
    }),
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined)
};

// WebSocket testing utilities
export const createMockWebSocketServer = () => ({
    on: () => {},
    close: () => {},
    clients: new Set()
});

export const createMockWebSocketClient = () => ({
    send: () => {},
    close: () => {},
    readyState: 1, // WebSocket.OPEN
    on: () => {}
});

// Temporary workspace utilities
export const createTempWorkspace = async () => {
    const tmp = require('tmp');
    return new Promise((resolve, reject) => {
        tmp.dir({ unsafeCleanup: true }, (err: any, path: string, cleanup: () => void) => {
            if (err) reject(err);
            else resolve({ path, cleanup });
        });
    });
};

// Assertion helpers
export const expectAgentState = (agent: any, expectedState: any) => {
    expect(agent.status).toBe(expectedState.status);
    if (expectedState.assignedTask) {
        expect(agent.assignedTask).toBe(expectedState.assignedTask);
    }
};

export const expectTaskState = (task: any, expectedState: any) => {
    expect(task.status).toBe(expectedState.status);
    if (expectedState.assignedAgent) {
        expect(task.assignedAgent).toBe(expectedState.assignedAgent);
    }
};

// Async testing utilities
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const waitForEvent = (emitter: any, event: string, timeout = 5000) => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Event ${event} did not fire within ${timeout}ms`));
        }, timeout);

        emitter.once(event, (...args: any[]) => {
            clearTimeout(timer);
            resolve(args);
        });
    });
};

// Performance testing utilities
export const measureTime = async (fn: () => Promise<any>) => {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    return { result, duration };
};

// Cleanup after each test
afterEach(() => {
    jest.clearAllMocks();
    // Don't restore all mocks here as it would interfere with process.cwd spy
    // jest.restoreAllMocks();
});

// Suppress console output during tests unless explicitly enabled
const originalConsole = { ...console };
beforeAll(() => {
    if (!process.env.ENABLE_TEST_LOGGING) {
        console.log = () => {};
        console.warn = () => {};
        console.error = () => {};
    }
});

afterAll(() => {
    Object.assign(console, originalConsole);
});
