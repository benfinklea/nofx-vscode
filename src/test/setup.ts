import * as vscode from 'vscode';

// Mock VS Code API
const mockVSCode = {
  window: {
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
    showErrorMessage: () => Promise.resolve(undefined),
    showQuickPick: () => Promise.resolve(undefined),
    showInputBox: () => Promise.resolve(undefined),
    createWebviewPanel: () => ({
      webview: {
        html: '',
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        postMessage: () => Promise.resolve(true)
      },
      onDidDispose: () => ({ dispose: () => {} }),
      reveal: () => {},
      dispose: () => {}
    }),
    registerTreeDataProvider: () => {},
    createTreeView: () => ({
      onDidChangeSelection: () => ({ dispose: () => {} }),
      reveal: () => {},
      dispose: () => {}
    })
  },
  workspace: {
    getConfiguration: () => ({
      get: () => {},
      update: () => Promise.resolve(),
      has: () => false,
      inspect: () => undefined
    }),
    workspaceFolders: [],
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
    onDidOpenTextDocument: () => ({ dispose: () => {} }),
    onDidCloseTextDocument: () => ({ dispose: () => {} }),
    onDidSaveTextDocument: () => ({ dispose: () => {} }),
    openTextDocument: () => Promise.resolve({} as vscode.TextDocument),
    saveAll: () => Promise.resolve(false),
    applyEdit: () => Promise.resolve(false),
    asRelativePath: () => ''
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve(undefined),
    getCommands: () => Promise.resolve([])
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' } as vscode.Uri),
    parse: (uri: string) => ({ fsPath: uri, scheme: 'file' } as vscode.Uri),
    joinPath: () => ({} as vscode.Uri)
  },
  Range: () => ({} as vscode.Range),
  Position: () => ({} as vscode.Position),
  Location: () => ({} as vscode.Location),
  Diagnostic: () => ({} as vscode.Diagnostic),
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3
  },
  languages: {
    registerCodeLensProvider: () => ({ dispose: () => {} }),
    registerHoverProvider: () => ({ dispose: () => {} }),
    registerCompletionItemProvider: () => ({ dispose: () => {} }),
    createDiagnosticCollection: () => ({
      set: () => {},
      clear: () => {},
      dispose: () => {}
    })
  },
  env: {
    machineId: 'test-machine-id',
    sessionId: 'test-session-id',
    language: 'en'
  },
  version: '1.85.0',
  extensions: {
    getExtension: () => undefined,
    all: []
  }
};

// Set up global mocks
Object.defineProperty(global, 'vscode', {
  value: mockVSCode,
  writable: true
});

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

// Mock file system operations
const mockFs = {
  readFileSync: () => '',
  writeFileSync: () => {},
  existsSync: () => false,
  mkdirSync: () => {},
  readdirSync: () => [],
  statSync: () => ({ isDirectory: () => true, isFile: () => false }),
  unlinkSync: () => {},
  rmdirSync: () => {}
};

// Mock child_process
const mockChildProcess = {
  spawn: () => ({
    stdout: { on: () => {} },
    stderr: { on: () => {} },
    on: () => {},
    kill: () => {},
    pid: 12345
  }),
  exec: (command: any, callback: any) => {
    if (callback) {
      callback(null, 'mock output', '');
    }
    return { kill: () => {} };
  }
};

// Mock modules
jest.mock('fs', () => mockFs);
jest.mock('child_process', () => mockChildProcess);

// Mock process
Object.defineProperty(global, 'process', {
  value: {
    ...process,
    platform: 'darwin',
    cwd: () => '/test/workspace',
    env: { ...process.env, NODE_ENV: 'test' }
  },
  writable: true
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
    dispose: () => {
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
  jest.restoreAllMocks();
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