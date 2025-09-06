# NofX Testing Guide

Comprehensive testing documentation for the NofX VS Code extension.

## 🧪 Testing Overview

### Testing Philosophy

The NofX extension follows a comprehensive testing strategy based on the testing pyramid:

```
        /\
       /E2E\        <- End-to-end user workflows
      /------\
     /Functional\   <- Extension features & commands  
    /------------\
   /Integration   \ <- Service interactions
  /----------------\
 /    Unit Tests    \ <- Individual components
/____________________\
```

### Coverage Requirements

- **Minimum Coverage**: 80% across all metrics
- **Critical Services**: 100% coverage required
- **New Features**: Must include comprehensive tests
- **Bug Fixes**: Must include regression tests

### Test Categories

1. **Unit Tests** - Fast, isolated component tests
2. **Integration Tests** - Service interaction tests
3. **Functional Tests** - Extension feature tests
4. **E2E Tests** - Complete user workflow tests
5. **Smoke Tests** - Quick validation tests
6. **Manual Tests** - User interaction tests

## 🚀 Quick Testing

### Running Tests

```bash
# Run all tests
npm run test:all

# Quick smoke test (< 30 seconds)
npm run test:smoke

# Development testing with watch mode
npm run test:watch
```

### Test Scripts

```bash
# Unit tests only (fastest)
npm run test:unit

# Integration tests
npm run test:integration  

# Functional tests
npm run test:functional

# End-to-end tests
npm run test:e2e

# Coverage report
npm run test:coverage

# CI environment
npm run test:ci
```

## 📋 Test Suite Organization

### Directory Structure

```
src/test/
├── unit/                    # Unit tests
│   ├── agents/
│   │   ├── AgentManager.test.ts
│   │   └── AgentTemplateManager.test.ts
│   ├── commands/
│   │   ├── AgentCommands.test.ts
│   │   └── TaskCommands.test.ts
│   ├── services/
│   │   ├── Container.test.ts
│   │   ├── EventBus.test.ts
│   │   └── LoggingService.test.ts
│   └── tasks/
│       ├── TaskQueue.test.ts
│       └── TaskStateMachine.test.ts
├── integration/             # Integration tests
│   ├── AgentWorkflow.integration.test.ts
│   ├── OrchestrationWorkflow.integration.test.ts
│   └── TaskManagement.integration.test.ts
├── functional/              # Functional tests
│   ├── CommandExecution.test.ts
│   ├── UIComponents.test.ts
│   └── ExtensionActivation.test.ts
├── e2e/                     # End-to-end tests
│   ├── CompleteWorkflow.e2e.test.ts
│   └── UserScenarios.e2e.test.ts
├── setup.ts                 # Test environment setup
├── runTests.ts             # VS Code test runner
└── utils/                   # Test utilities
    ├── TestHelpers.ts
    ├── MockFactory.ts
    └── ExtensionTestHelpers.ts
```

## 🔧 Test Scripts Reference

### Core Test Scripts

#### `npm run test:unit`
```json
{
  "script": "jest --testMatch='**/*.test.ts' --testPathIgnorePatterns='integration|functional|e2e'"
}
```
- Runs only unit tests
- Fastest test suite (< 10 seconds)
- No external dependencies
- Run frequently during development

#### `npm run test:integration`
```json
{
  "script": "jest --testMatch='**/*.integration.test.ts'"
}
```
- Tests service interactions
- May use real services
- Slower than unit tests (< 1 minute)
- Run before commits

#### `npm run test:functional`
```json
{
  "script": "node ./out/test/runTests.js"
}
```
- Tests VS Code extension features
- Requires Extension Development Host
- Tests commands, UI, and activation
- Run before pull requests

#### `npm run test:e2e`
```json
{
  "script": "jest --testMatch='**/*.e2e.test.ts' --runInBand"
}
```
- Complete user workflows
- Full extension environment
- Slowest tests (2-5 minutes)
- Run before releases

#### `npm run test:smoke`
```json
{
  "script": "jest --testMatch='**/smoke/*.test.ts' --bail"
}
```
- Quick validation tests
- Critical path verification
- Fails fast on first error
- Run after builds

#### `npm run test:coverage`
```json
{
  "script": "jest --coverage --coverageReporters=text-lcov html"
}
```
- Generates coverage reports
- HTML report in `coverage/index.html`
- Enforces coverage thresholds
- Run in CI pipeline

#### `npm run test:watch`
```json
{
  "script": "jest --watch"
}
```
- Watches for file changes
- Reruns affected tests
- Interactive test runner
- Use during development

#### `npm run test:ci`
```json
{
  "script": "jest --ci --coverage --maxWorkers=2"
}
```
- Optimized for CI environment
- Generates coverage reports
- Limited parallelization
- Non-interactive mode

## 🏗️ Test Infrastructure

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  
  // TypeScript transformation
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/test/**',
    '!src/**/*.d.ts',
    '!src/extension.ts', // Tested separately
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  
  // Module name mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  
  // Globals
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },
};
```

### VS Code Extension Testing

```typescript
// src/test/runTests.ts
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // Extension root
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    
    // Test suite location
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    
    // Download VS Code and run tests
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions', // Disable other extensions
        '--disable-gpu',        // Disable GPU acceleration
      ],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
```

### Test Setup

```typescript
// src/test/setup.ts
import * as vscode from 'vscode';

// Mock VS Code API
jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    createTreeView: jest.fn(),
    createWebviewPanel: jest.fn(),
    createTerminal: jest.fn(),
    createOutputChannel: jest.fn(),
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
    getCommands: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
  },
  ExtensionContext: jest.fn(),
  EventEmitter: jest.fn(),
  TreeItem: jest.fn(),
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
}));

// Global test timeout
jest.setTimeout(10000);

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
```

### Mock Strategies

#### Mock Factory

```typescript
// src/test/utils/MockFactory.ts
export class MockFactory {
  static createExtensionContext(): vscode.ExtensionContext {
    return {
      subscriptions: [],
      workspaceState: new MockMemento(),
      globalState: new MockMemento(),
      extensionPath: '/mock/extension/path',
      extensionUri: vscode.Uri.file('/mock/extension/path'),
      environmentVariableCollection: new MockEnvironmentVariableCollection(),
      storagePath: '/mock/storage',
      globalStoragePath: '/mock/global/storage',
      logPath: '/mock/logs',
      extensionMode: vscode.ExtensionMode.Test,
      asAbsolutePath: (relativePath: string) => `/mock/extension/${relativePath}`,
    } as any;
  }

  static createOutputChannel(): vscode.OutputChannel {
    return {
      append: jest.fn(),
      appendLine: jest.fn(),
      clear: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    } as any;
  }

  static createTerminal(): vscode.Terminal {
    return {
      sendText: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      processId: Promise.resolve(1234),
      creationOptions: {},
      exitStatus: undefined,
      state: { isInteractedWith: false },
    } as any;
  }
}
```

#### Service Mocks

```typescript
// src/test/utils/ServiceMocks.ts
export const createMockLoggingService = () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
});

export const createMockEventBus = () => ({
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  once: jest.fn(),
});

export const createMockAgentManager = () => ({
  createAgent: jest.fn(),
  removeAgent: jest.fn(),
  getAgents: jest.fn(() => []),
  getAgent: jest.fn(),
  assignTask: jest.fn(),
});
```

### Test Utilities

```typescript
// src/test/utils/TestHelpers.ts
export class TestHelpers {
  /**
   * Wait for a condition to be true
   */
  static async waitFor(
    condition: () => boolean,
    timeout = 5000,
    interval = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (!condition()) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for condition');
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  /**
   * Create a test agent
   */
  static createTestAgent(overrides?: Partial<Agent>): Agent {
    return {
      id: 'test-agent-1',
      name: 'Test Agent',
      type: 'general',
      status: 'idle',
      terminal: MockFactory.createTerminal(),
      ...overrides,
    };
  }

  /**
   * Create a test task
   */
  static createTestTask(overrides?: Partial<Task>): Task {
    return {
      id: 'test-task-1',
      title: 'Test Task',
      description: 'Test task description',
      priority: 50,
      status: 'pending',
      ...overrides,
    };
  }

  /**
   * Setup test environment
   */
  static async setupTestEnvironment(): Promise<void> {
    // Clear any existing state
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    
    // Reset configuration
    const config = vscode.workspace.getConfiguration('nofx');
    await config.update('maxAgents', undefined, true);
    await config.update('autoAssignTasks', undefined, true);
  }
}
```

## ✅ Manual Testing Checklist

### Extension Installation and Activation

- [ ] Extension installs without errors
- [ ] Extension activates on first command
- [ ] Extension icon appears in Activity Bar
- [ ] All views load in sidebar
- [ ] No errors in Output → NofX Extension
- [ ] Status bar item appears

### Command Palette Integration (All NofX Commands)

#### Agent Commands
- [ ] `NofX: Add Agent` - Opens agent selection
- [ ] `NofX: Add Agent (Individual)` - Adds single agent
- [ ] `NofX: Add Team Preset` - Shows team presets
- [ ] `NofX: Remove Agent` - Removes selected agent
- [ ] `NofX: List Agents` - Shows all agents
- [ ] `NofX: Restore Previous Session` - Restores agents

#### Conductor Commands
- [ ] `NofX: Start Conductor` - Opens conductor with team selection
- [ ] `NofX: Open Conductor Terminal` - Opens conductor terminal
- [ ] `NofX: Send Message to Conductor` - Sends conductor message

#### Task Commands
- [ ] `NofX: Create Task` - Creates new task
- [ ] `NofX: View Task Queue` - Shows task queue
- [ ] `NofX: Assign Task` - Assigns task to agent
- [ ] `NofX: Complete Task` - Marks task complete
- [ ] `NofX: Cancel Task` - Cancels task

#### Orchestration Commands
- [ ] `NofX: Start Orchestration Server` - Starts WebSocket server
- [ ] `NofX: Stop Orchestration Server` - Stops server
- [ ] `NofX: View Orchestration Status` - Shows server status
- [ ] `NofX: Open Message Flow Dashboard` - Opens dashboard

#### Worktree Commands
- [ ] `NofX: Toggle Git Worktrees` - Enables/disables worktrees
- [ ] `NofX: Merge Agent Work` - Merges worktree changes
- [ ] `NofX: View Worktrees` - Lists active worktrees

#### Template Commands
- [ ] `NofX: Browse Agent Templates` - Shows template browser
- [ ] `NofX: Create Agent Template` - Creates new template
- [ ] `NofX: Edit Agent Template` - Edits existing template

#### Persistence Commands
- [ ] `NofX: Save Session` - Saves current session
- [ ] `NofX: Load Session` - Loads saved session
- [ ] `NofX: Export Sessions` - Exports to file
- [ ] `NofX: Clear All Data` - Clears persistence

#### Metrics Commands
- [ ] `NofX: View Metrics` - Shows metrics dashboard
- [ ] `NofX: Export Metrics` - Exports metrics data
- [ ] `NofX: Reset Metrics` - Clears metrics

#### Utility Commands
- [ ] `NofX: Show Extension Info` - Shows version info
- [ ] `NofX: Open Settings` - Opens extension settings
- [ ] `NofX: View Logs` - Opens log viewer
- [ ] `NofX: Report Issue` - Opens issue reporter

#### Debug Commands
- [ ] `NofX: Verify Commands` - Validates registration
- [ ] `NofX: Validate Services` - Checks container
- [ ] `NofX: Test WebSocket` - Tests connection
- [ ] `NofX: Debug Mode` - Toggles debug mode

### Conductor Workflows

#### Team Presets
- [ ] "Small Team" preset creates 2 agents
- [ ] "Standard Team" preset creates 3 agents
- [ ] "Large Team" preset creates 5 agents
- [ ] "Full Stack Team" creates appropriate specialists
- [ ] "Custom Team" allows agent selection

#### Conductor Terminal
- [ ] Terminal opens with 🎵 icon
- [ ] Claude CLI launches with system prompt
- [ ] JSON commands are recognized
- [ ] Agent spawn commands work
- [ ] Task assignment commands work
- [ ] Status query commands work

### Agent Lifecycle

#### Agent Creation
- [ ] Agent terminal opens
- [ ] Claude CLI starts with system prompt
- [ ] Agent appears in sidebar
- [ ] Agent status shows "ready"
- [ ] Terminal has correct naming

#### Agent Management
- [ ] Can remove individual agents
- [ ] Can restart failed agents
- [ ] Agent status updates correctly
- [ ] Multiple agents work simultaneously
- [ ] Agents persist across restarts

#### Agent Communication
- [ ] Agents receive tasks from conductor
- [ ] Status updates appear in UI
- [ ] Task completion is tracked
- [ ] Errors are properly reported

### Task Management

#### Task Creation
- [ ] Can create tasks via UI
- [ ] Can create tasks via command
- [ ] Tasks appear in queue
- [ ] Priority is assigned correctly

#### Task Assignment
- [ ] Auto-assignment works
- [ ] Manual assignment works
- [ ] Capability matching works
- [ ] Task dependencies respected

#### Task Execution
- [ ] Tasks execute in priority order
- [ ] Progress updates appear
- [ ] Completion is tracked
- [ ] Failed tasks can be retried

### UI Components

#### Sidebar Views
- [ ] Agent tree view updates
- [ ] Task queue view updates
- [ ] Team sections are collapsible
- [ ] Context menus work
- [ ] Icons display correctly

#### Webview Panels
- [ ] Conductor panel loads
- [ ] Dashboard loads
- [ ] Message flow displays
- [ ] Metrics display correctly
- [ ] No console errors

#### Tree Providers
- [ ] Agent tree refreshes on changes
- [ ] Task tree refreshes on changes
- [ ] Worktree view updates
- [ ] Template browser works

### Orchestration System

#### WebSocket Server
- [ ] Server starts on extension activation
- [ ] Dynamic port allocation works
- [ ] Multiple connections supported
- [ ] Messages route correctly
- [ ] Connection recovery works

#### Message Flow
- [ ] Dashboard shows real-time messages
- [ ] Message filtering works
- [ ] Agent status grid updates
- [ ] Metrics panel shows data
- [ ] Export functionality works

### Configuration

#### Extension Settings
- [ ] Settings appear in VS Code settings
- [ ] Changes take effect immediately
- [ ] Default values are sensible
- [ ] Validation works correctly

#### Persistence
- [ ] Sessions save correctly
- [ ] Sessions restore on restart
- [ ] Agent state persists
- [ ] Task queue persists
- [ ] Templates persist

### Error Scenarios

#### Recovery
- [ ] Extension recovers from crashes
- [ ] Agents can be restarted
- [ ] Tasks can be retried
- [ ] WebSocket reconnects

#### Error Messages
- [ ] Clear error messages shown
- [ ] Errors logged to output
- [ ] User guidance provided
- [ ] No silent failures

### Performance

#### Responsiveness
- [ ] Commands execute quickly
- [ ] UI updates are smooth
- [ ] No blocking operations
- [ ] Terminal creation is fast

#### Resource Usage
- [ ] Memory usage acceptable
- [ ] CPU usage reasonable
- [ ] No memory leaks
- [ ] Cleanup on deactivation

### Platform Testing

#### macOS
- [ ] Extension installs and runs
- [ ] Shell scripts work
- [ ] Terminals function correctly
- [ ] No platform-specific issues

#### Windows
- [ ] Extension installs and runs
- [ ] PowerShell integration works
- [ ] Path handling correct
- [ ] No platform-specific issues

#### Linux
- [ ] Extension installs and runs
- [ ] Terminal integration works
- [ ] Permissions handled correctly
- [ ] No platform-specific issues

## 🔍 Test Development

### Writing Unit Tests

```typescript
// src/test/unit/services/AgentManager.test.ts
import { AgentManager } from '../../../agents/AgentManager';
import { createMockLoggingService, createMockEventBus } from '../../utils/ServiceMocks';

describe('AgentManager', () => {
  let agentManager: AgentManager;
  let mockLogger: ReturnType<typeof createMockLoggingService>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    mockLogger = createMockLoggingService();
    mockEventBus = createMockEventBus();
    agentManager = new AgentManager(mockLogger, mockEventBus);
  });

  describe('createAgent', () => {
    it('should create a new agent', async () => {
      const agent = await agentManager.createAgent('frontend');
      
      expect(agent).toBeDefined();
      expect(agent.type).toBe('frontend');
      expect(mockEventBus.emit).toHaveBeenCalledWith('agent-created', agent);
    });

    it('should enforce max agent limit', async () => {
      // Create max agents
      for (let i = 0; i < 5; i++) {
        await agentManager.createAgent('general');
      }
      
      // Try to create one more
      await expect(agentManager.createAgent('general'))
        .rejects.toThrow('Maximum agent limit reached');
    });
  });

  describe('removeAgent', () => {
    it('should remove an existing agent', async () => {
      const agent = await agentManager.createAgent('backend');
      
      await agentManager.removeAgent(agent.id);
      
      expect(agentManager.getAgent(agent.id)).toBeUndefined();
      expect(mockEventBus.emit).toHaveBeenCalledWith('agent-removed', agent.id);
    });

    it('should throw error for non-existent agent', async () => {
      await expect(agentManager.removeAgent('non-existent'))
        .rejects.toThrow('Agent not found');
    });
  });
});
```

### Writing Integration Tests

```typescript
// src/test/integration/AgentWorkflow.integration.test.ts
import { Container } from '../../services/Container';
import { AgentManager } from '../../agents/AgentManager';
import { TaskQueue } from '../../tasks/TaskQueue';
import { TestHelpers } from '../utils/TestHelpers';

describe('Agent Workflow Integration', () => {
  let container: Container;
  let agentManager: AgentManager;
  let taskQueue: TaskQueue;

  beforeEach(async () => {
    container = new Container();
    
    // Register real services
    container.register('LoggingService', () => new LoggingService());
    container.register('EventBus', () => new EventBus());
    container.register('AgentManager', () => 
      new AgentManager(
        container.resolve('LoggingService'),
        container.resolve('EventBus')
      )
    );
    container.register('TaskQueue', () => 
      new TaskQueue(
        container.resolve('AgentManager'),
        container.resolve('EventBus')
      )
    );
    
    agentManager = container.resolve('AgentManager');
    taskQueue = container.resolve('TaskQueue');
  });

  it('should complete full agent task workflow', async () => {
    // Create agent
    const agent = await agentManager.createAgent('frontend');
    expect(agent.status).toBe('ready');
    
    // Create task
    const task = await taskQueue.addTask({
      title: 'Create login form',
      description: 'Build a responsive login form',
      type: 'frontend',
    });
    
    // Wait for assignment
    await TestHelpers.waitFor(() => task.assignedTo === agent.id);
    
    // Simulate task completion
    await taskQueue.completeTask(task.id);
    
    // Verify final state
    expect(task.status).toBe('completed');
    expect(agent.status).toBe('ready');
  });

  it('should handle task reassignment on agent failure', async () => {
    const agent1 = await agentManager.createAgent('backend');
    const agent2 = await agentManager.createAgent('backend');
    
    const task = await taskQueue.addTask({
      title: 'Create API endpoint',
      type: 'backend',
    });
    
    // Simulate agent1 failure
    await agentManager.setAgentStatus(agent1.id, 'error');
    
    // Task should be reassigned to agent2
    await TestHelpers.waitFor(() => task.assignedTo === agent2.id);
    
    expect(task.assignedTo).toBe(agent2.id);
  });
});
```

### Writing Functional Tests

```typescript
// src/test/functional/CommandExecution.test.ts
import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestHelpers } from '../utils/TestHelpers';

suite('Command Execution Tests', () => {
  suiteSetup(async () => {
    await TestHelpers.setupTestEnvironment();
  });

  test('Should register all commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    const nofxCommands = commands.filter(cmd => cmd.startsWith('nofx.'));
    
    // Dynamically verify command count from package.json
    const pkg = require('../../../package.json');
    const expectedCommands = pkg.contributes.commands.length;
    
    assert.strictEqual(nofxCommands.length, expectedCommands, 
      `Should have ${expectedCommands} commands registered`);
  });

  test('Should execute add agent command', async () => {
    // Execute command
    await vscode.commands.executeCommand('nofx.addAgent');
    
    // Verify agent was created
    const agents = await vscode.commands.executeCommand('nofx.listAgents');
    assert.strictEqual(Array.isArray(agents), true);
  });

  test('Should show conductor panel', async () => {
    await vscode.commands.executeCommand('nofx.startConductor');
    
    // Verify panel is visible
    // Note: This is simplified, actual test would check panel state
    assert.ok(true, 'Command executed without error');
  });
});
```

### Writing E2E Tests

```typescript
// src/test/e2e/CompleteWorkflow.e2e.test.ts
import * as vscode from 'vscode';
import { TestHelpers } from '../utils/TestHelpers';

describe('Complete User Workflow E2E', () => {
  beforeAll(async () => {
    // Ensure extension is activated
    const ext = vscode.extensions.getExtension('nofx.nofx');
    await ext?.activate();
  });

  it('should complete full user workflow', async () => {
    // 1. Start conductor with team
    await vscode.commands.executeCommand('nofx.startConductor');
    
    // Select "Small Team" preset
    // This would involve UI automation in a real E2E test
    
    // 2. Wait for agents to be created
    await TestHelpers.waitFor(async () => {
      const agents = await vscode.commands.executeCommand('nofx.listAgents');
      return agents.length === 2;
    });
    
    // 3. Create a task
    await vscode.commands.executeCommand('nofx.createTask', {
      title: 'Build login page',
      description: 'Create a responsive login page with validation',
      priority: 'high',
    });
    
    // 4. Verify task assignment
    await TestHelpers.waitFor(async () => {
      const tasks = await vscode.commands.executeCommand('nofx.viewTaskQueue');
      return tasks[0]?.assignedTo !== null;
    });
    
    // 5. Simulate task completion
    // In real scenario, this would involve agent interaction
    
    // 6. Verify final state
    const finalTasks = await vscode.commands.executeCommand('nofx.viewTaskQueue');
    expect(finalTasks[0]?.status).toBe('completed');
  }, 30000); // 30 second timeout for E2E test
});
```

## 🐛 Debugging Tests

### Running Individual Tests

```bash
# Run single test file
npm test -- AgentManager.test.ts

# Run single test suite
npm test -- --testNamePattern="AgentManager"

# Run single test
npm test -- --testNamePattern="should create a new agent"
```

### VS Code Test Debugging

1. **Set Breakpoints**: Click in the gutter next to test code
2. **Open Test File**: Open the test file in editor
3. **Run Debug**: Press F5 with test file open
4. **Debug Configuration**:

```json
// .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Jest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": [
    "--runInBand",
    "--no-cache",
    "--watchAll=false",
    "${relativeFile}"
  ],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Test Output Analysis

```bash
# Verbose output
npm test -- --verbose

# Show individual test results
npm test -- --verbose --expand

# Debug mode with full stack traces
npm test -- --detectOpenHandles --forceExit
```

### Common Test Issues

#### Timeout Issues
```typescript
// Increase timeout for slow tests
jest.setTimeout(30000); // 30 seconds

// Or per test
it('slow test', async () => {
  // test code
}, 30000);
```

#### Async Test Issues
```typescript
// Always use async/await
it('async test', async () => {
  const result = await someAsyncFunction();
  expect(result).toBe(expected);
});

// Or return promise
it('promise test', () => {
  return expect(somePromise()).resolves.toBe(expected);
});
```

#### Mock Issues
```typescript
// Clear mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});

// Reset modules if needed
afterEach(() => {
  jest.resetModules();
});
```

## 📊 Coverage and Quality

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report
open coverage/index.html  # macOS
start coverage/index.html  # Windows
xdg-open coverage/index.html  # Linux
```

### Coverage Metrics

```
File                  | % Stmts | % Branch | % Funcs | % Lines |
----------------------|---------|----------|---------|---------|
All files            |   85.23 |    82.14 |   87.50 |   85.23 |
 agents/             |   92.31 |    88.89 |   94.44 |   92.31 |
  AgentManager.ts    |   93.75 |    90.00 |   95.00 |   93.75 |
 services/           |   83.33 |    80.00 |   85.71 |   83.33 |
  Container.ts       |   88.89 |    85.71 |   90.00 |   88.89 |
  EventBus.ts        |   80.00 |    75.00 |   83.33 |   80.00 |
 tasks/              |   82.35 |    78.57 |   84.62 |   82.35 |
  TaskQueue.ts       |   85.71 |    82.35 |   87.50 |   85.71 |
```

### Quality Gates

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
  // Specific thresholds for critical files
  './src/services/Container.ts': {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  },
}
```

### Test Quality Metrics

- **Test Execution Time**: < 2 minutes for all tests
- **Test Flakiness**: < 1% failure rate
- **Test Coverage**: > 80% for all metrics
- **Test Maintainability**: Clear naming, good structure

## 🚨 Troubleshooting Tests

### Test Failures

#### Environment Issues
```bash
# Clean test environment
rm -rf node_modules/.cache
npm run test -- --clearCache

# Reset VS Code test instance
rm -rf .vscode-test
```

#### Dependency Issues
```bash
# Update test dependencies
npm update @types/jest @types/node jest ts-jest

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Coverage Issues

#### Missing Coverage
```bash
# Check which files are excluded
npm run test:coverage -- --listTests

# Force include files
# Update jest.config.js collectCoverageFrom
```

#### Invalid Coverage Data
```bash
# Clear coverage cache
rm -rf coverage .nyc_output

# Regenerate coverage
npm run test:coverage -- --no-cache
```

### VS Code Extension Test Issues

#### Extension Won't Activate
```typescript
// Force activation in tests
const ext = vscode.extensions.getExtension('nofx.nofx');
if (!ext?.isActive) {
  await ext?.activate();
}
```

#### Missing Mock Data
```typescript
// Ensure mocks are properly set up
beforeEach(() => {
  // Reset VS Code mocks
  (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
  (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
});
```

## 🔄 Continuous Testing

### Pre-commit Testing

```bash
# .husky/pre-commit
#!/bin/sh
npm run test:unit -- --bail
npm run lint
```

### Pre-push Testing

```bash
# .husky/pre-push
#!/bin/sh
npm run test:all
npm run test:coverage -- --coverageReporters=text
```

### CI Pipeline Testing

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20]
    
    steps:
    - uses: actions/checkout@v3
    
    - uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node }}
    
    - run: npm ci
    - run: npm run test:ci
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

### Test Monitoring

```typescript
// Track test metrics
class TestMetrics {
  static trackTestRun(results: TestResults) {
    console.log('Test Metrics:');
    console.log(`- Total: ${results.total}`);
    console.log(`- Passed: ${results.passed}`);
    console.log(`- Failed: ${results.failed}`);
    console.log(`- Duration: ${results.duration}ms`);
    console.log(`- Coverage: ${results.coverage}%`);
  }
}
```

---

*This testing guide ensures comprehensive quality assurance for the NofX extension through automated and manual testing strategies.*