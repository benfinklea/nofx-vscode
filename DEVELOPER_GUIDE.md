# NofX Developer Guide

A comprehensive guide for developers working on the NofX VS Code extension.

## 🎯 Quick Start for Developers

Get up and running with NofX development in 5 minutes:

### 1. Clone and Install
```bash
# Clone the repository
git clone https://github.com/nofx/nofx-vscode.git
cd nofx-vscode

# Install dependencies
npm install
```

### 2. Set Up Development Environment
```bash
# Install Git hooks for code quality
npm run dev:setup

# Verify setup
npm run validate:all
```

### 3. Build the Extension
```bash
# Build and package
./build.sh

# Or build with auto-install to Cursor (macOS)
./build.sh --install-cursor

# Or manual build
npm run build
```

### 4. Install for Testing
```bash
# Install in VS Code
# Install the latest VSIX
VSIX=$(ls -1t nofx-*.vsix | head -1)
code --install-extension "$VSIX" --force

# Or in Cursor
# For Cursor users
VSIX=$(ls -1t nofx-*.vsix | head -1)
cursor --install-extension "$VSIX" --force
```

### 5. Start Development
```bash
# Watch mode for auto-rebuild
npm run watch

# In VS Code, press F5 to launch Extension Development Host
```

## 🏗️ Build System Deep Dive

### TypeScript Compilation

The extension uses multiple TypeScript configurations for different purposes:

#### Configuration Files
- **`tsconfig.json`** - Base configuration for all TypeScript files
- **`tsconfig.build.json`** - Production build configuration (excludes tests)
- **`tsconfig.test.json`** - Test-specific configuration

#### Compilation Process
```bash
# Standard compilation
npx tsc -p tsconfig.build.json

# Watch mode compilation
npx tsc -w -p tsconfig.build.json

# Type checking without emit
npx tsc --noEmit
```

### Build Scripts Breakdown

#### `build.sh`
Automated build script with optional installation:

**Usage:**
```bash
./build.sh                    # Build and package only (default)
./build.sh --install-cursor   # Build, package, and install to Cursor (macOS only)
./build.sh --help            # Show available options
```

**Supported Options:**
- `--install-cursor` - Install to Cursor after building (macOS only)
- `--help` - Display usage information
- `--install-vscode` (deprecated) - Use `code --install-extension` manually instead

The script performs the following steps:
1. Cleans previous builds (out/ and *.vsix)
2. Installs dependencies
3. Compiles TypeScript
4. Packages extension with vsce
5. Optionally installs to Cursor (with --install-cursor flag)

#### `rebuild.sh`
Complete rebuild from scratch:
```bash
#!/bin/bash
# Use the reset script for complete rebuild
npm run dev:reset

# Then build with validation
npm run build:validate
```

### Validation Pipeline

The validation system ensures code quality and correctness:

#### `scripts/validate-build.sh`
```bash
# 1. Check compiled output exists
test -f out/extension.js

# 2. Verify package.json is valid
npx vsce ls

# 3. Check all commands are registered
node scripts/validate-commands.js

# 4. Verify service container (via Jest tests)
npm run validate:services  # Runs test:services
```

### Package Creation with VSCE

#### Standard Packaging
```bash
# Package with dependencies
npx vsce package

# Package without dependencies (avoid - breaks WebSocket)
npx vsce package --no-dependencies  # ❌ Don't use
```

#### Package Contents
```
nofx-<version>.vsix
├── extension/
│   ├── out/           # Compiled JavaScript
│   ├── node_modules/  # Dependencies
│   ├── webview/       # Webview assets
│   └── package.json   # Manifest
└── [Content_Types].xml
```

### Build Artifacts

#### Output Structure
```
out/
├── agents/
├── commands/
├── conductor/
├── dashboard/
├── orchestration/
├── panels/
├── persistence/
├── services/
├── tasks/
├── templates/
├── test/
├── types/
├── ui/
├── views/
├── worktrees/
├── extension.js       # Main entry point
└── *.js.map          # Source maps
```

## 🧪 Testing Strategy

### Test Architecture

```
src/test/
├── unit/              # Isolated unit tests
│   ├── agents/
│   ├── commands/
│   ├── services/
│   └── tasks/
├── integration/       # Service integration tests
│   ├── AgentWorkflow.integration.test.ts
│   ├── OrchestrationWorkflow.integration.test.ts
│   └── TaskManagement.integration.test.ts
├── functional/        # Extension functionality tests
│   ├── CommandExecution.test.ts
│   └── UIComponents.test.ts
├── e2e/              # End-to-end tests
│   └── CompleteWorkflow.e2e.test.ts
├── setup.ts          # Test environment setup
└── utils/            # Test utilities
    ├── TestHelpers.ts
    └── ExtensionTestHelpers.ts
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/test/**',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
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
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions'],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
```

### Mock Strategies

```typescript
// Test utilities for mocking VS Code API
export class MockExtensionContext implements vscode.ExtensionContext {
  subscriptions: vscode.Disposable[] = [];
  workspaceState = new MockMemento();
  globalState = new MockMemento();
  extensionPath = '/mock/path';
  // ... other required properties
}

// Mock VS Code window
jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createTreeView: jest.fn(),
  },
  commands: {
    registerCommand: jest.fn(),
  },
}));
```

### Coverage Requirements

- **Minimum Coverage**: 80% across all metrics
- **Critical Paths**: 100% coverage for core services
- **New Code**: All new code must include tests
- **Bug Fixes**: Must include regression tests

## 🔧 Development Tools

### Git Hooks

Managed by Husky for automatic code quality checks:

#### Pre-commit Hook
```bash
#!/bin/sh
# .husky/pre-commit

# Run linter
npm run lint

# Check TypeScript
npx tsc --noEmit

# Run fast tests
npm run test:unit
```

#### Pre-push Hook
```bash
#!/bin/sh
# .husky/pre-push

# Full validation
npm run validate:all

# Run all tests
npm run test:all

# Check coverage
npm run test:coverage
```

### ESLint Configuration

```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

### TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "exclude": [
    "node_modules",
    ".vscode-test",
    "out"
  ]
}
```

### VS Code Debugging Setup

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: watch"
    },
    {
      "name": "Extension Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
      ],
      "outFiles": ["${workspaceFolder}/out/test/**/*.js"],
      "preLaunchTask": "npm: test-compile"
    }
  ]
}
```

### Development Scripts

```json
// package.json scripts (canonical list)
// For the complete list of scripts, see package.json or run: npm run print:commands
{
  "scripts": {
    "watch": "tsc -watch -p ./tsconfig.build.json",
    "dev:validate": "npm run compile && npm run validate:build --quiet",
    "dev:clean": "rimraf out coverage nofx-*.vsix",
    "dev:setup": "./scripts/install-hooks.sh",
    "dev:reset": "rimraf out coverage node_modules nofx-*.vsix && npm install && npm run compile"
  }
}
```

## 🏛️ Architecture Overview

### Dependency Injection Container

The extension uses a custom dependency injection container for service management:

```typescript
// src/services/Container.ts
export class Container {
  private static instance: Container;
  private services: Map<string, any> = new Map();
  private factories: Map<string, () => any> = new Map();

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  register<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }

  resolve<T>(token: string): T {
    if (!this.services.has(token)) {
      const factory = this.factories.get(token);
      if (!factory) {
        throw new Error(`Service ${token} not registered`);
      }
      this.services.set(token, factory());
    }
    return this.services.get(token);
  }
}
```

### Service Registration and Lifecycle

```typescript
// src/extension.ts
export function activate(context: vscode.ExtensionContext) {
  const container = Container.getInstance();

  // Register services
  container.register('LoggingService', () => new LoggingService());
  container.register('EventBus', () => new EventBus());
  container.register('AgentManager', () => 
    new AgentManager(
      container.resolve('LoggingService'),
      container.resolve('EventBus')
    )
  );

  // Initialize services
  const agentManager = container.resolve<AgentManager>('AgentManager');
  
  // Register commands
  registerCommands(context, container);
}
```

### Command Registration and Handling

```typescript
// src/commands/AgentCommands.ts
export class AgentCommands {
  constructor(
    private agentManager: AgentManager,
    private logger: LoggingService
  ) {}

  registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('nofx.addAgent', 
        () => this.addAgent()),
      vscode.commands.registerCommand('nofx.removeAgent', 
        (agent: Agent) => this.removeAgent(agent)),
      vscode.commands.registerCommand('nofx.listAgents', 
        () => this.listAgents())
    );
  }

  private async addAgent(): Promise<void> {
    const agentType = await vscode.window.showQuickPick(
      ['Frontend', 'Backend', 'Testing', 'General'],
      { placeHolder: 'Select agent type' }
    );
    
    if (agentType) {
      await this.agentManager.createAgent(agentType);
    }
  }
}
```

### Event Bus and Messaging

```typescript
// src/services/EventBus.ts
export class EventBus {
  private events: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(handler);
  }

  emit(event: string, data?: any): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }
}
```

### UI Components and Tree Providers

```typescript
// src/views/AgentTreeProvider.ts
export class AgentTreeProvider implements vscode.TreeDataProvider<AgentItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private agentManager: AgentManager) {
    agentManager.onAgentChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AgentItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AgentItem): Thenable<AgentItem[]> {
    if (!element) {
      return Promise.resolve(
        this.agentManager.getAgents().map(agent => 
          new AgentItem(agent))
      );
    }
    return Promise.resolve([]);
  }
}
```

### WebSocket Orchestration Server

```typescript
// src/orchestration/OrchestrationServer.ts
import * as WebSocket from 'ws';

export class OrchestrationServer {
  private wss: WebSocket.Server;
  private clients: Map<string, WebSocket> = new Map();

  start(port: number = 0): void {
    this.wss = new WebSocket.Server({ port });
    
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);
        this.handleMessage(clientId, message);
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
      });
    });
  }

  private handleMessage(clientId: string, message: any): void {
    switch (message.type) {
      case 'SPAWN_AGENT':
        this.spawnAgent(message.payload);
        break;
      case 'ASSIGN_TASK':
        this.assignTask(message.payload);
        break;
      // ... other message handlers
    }
  }

  broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}
```

### Persistence and State Management

```typescript
// src/persistence/AgentPersistence.ts
export class AgentPersistence {
  private storagePath: string;

  constructor(context: vscode.ExtensionContext) {
    this.storagePath = path.join(
      context.globalStorageUri.fsPath, 
      'agents.json'
    );
  }

  async saveAgents(agents: Agent[]): Promise<void> {
    const data = JSON.stringify(agents, null, 2);
    await fs.promises.writeFile(this.storagePath, data, 'utf8');
  }

  async loadAgents(): Promise<Agent[]> {
    try {
      const data = await fs.promises.readFile(this.storagePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }
}
```

## 🐛 Debugging Guide

### Extension Development Host Setup

1. **Open the Project**
   ```bash
   code .
   ```

2. **Start Debugging**
   - Press `F5` to launch Extension Development Host
   - A new VS Code window opens with the extension loaded
   - Set breakpoints in TypeScript source files

3. **Monitor Output**
   - Open Output panel (View → Output)
   - Select "NofX Extension" from dropdown
   - Watch for logs and errors

### Service Container Debugging

```typescript
// Debug service registration
container.register('TestService', () => {
  console.log('[NofX] Creating TestService');
  return new TestService();
});

// Debug service resolution
const service = container.resolve('TestService');
console.log('[NofX] Resolved service:', service);

// Validate all services
function validateContainer(): void {
  const requiredServices = [
    'LoggingService',
    'EventBus',
    'AgentManager',
    'TaskQueue',
    'OrchestrationServer'
  ];

  requiredServices.forEach(service => {
    try {
      container.resolve(service);
      console.log(`✓ ${service} registered`);
    } catch (error) {
      console.error(`✗ ${service} missing:`, error);
    }
  });
}
```

### Command Registration Debugging

```typescript
// Validate command registration
export async function validateCommands(): Promise<void> {
  const commands = await vscode.commands.getCommands(true);
  const nofxCommands = commands.filter(cmd => cmd.startsWith('nofx.'));
  
  console.log('[NofX] Registered commands:', nofxCommands);
  
  // Test command execution
  for (const cmd of nofxCommands) {
    try {
      await vscode.commands.executeCommand(cmd);
      console.log(`✓ ${cmd} works`);
    } catch (error) {
      console.error(`✗ ${cmd} failed:`, error);
    }
  }
}
```

### WebSocket Connection Debugging

```typescript
// Enable debug logging for WebSocket
export class OrchestrationServer {
  private debug = true;

  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[OrchestrationServer] ${message}`, ...args);
    }
  }

  start(port: number = 0): void {
    this.log('Starting server on port', port);
    // ... server setup
  }

  private handleMessage(clientId: string, message: any): void {
    this.log('Received message from', clientId, ':', message);
    // ... message handling
  }
}
```

### Performance Profiling

```typescript
// Measure extension activation time
export function activate(context: vscode.ExtensionContext) {
  const startTime = Date.now();
  
  // ... initialization code
  
  const activationTime = Date.now() - startTime;
  console.log(`[NofX] Extension activated in ${activationTime}ms`);
  
  // Report to telemetry if enabled
  if (vscode.env.isTelemetryEnabled) {
    // Send activation metrics
  }
}

// Profile service initialization
function profileService(name: string, factory: () => any): any {
  const start = performance.now();
  const service = factory();
  const duration = performance.now() - start;
  console.log(`[NofX] ${name} initialized in ${duration.toFixed(2)}ms`);
  return service;
}
```

## 📋 Common Development Tasks

### Adding New Commands

1. **Define Command in package.json**
```json
{
  "contributes": {
    "commands": [
      {
        "command": "nofx.myNewCommand",
        "title": "NofX: My New Command",
        "category": "NofX"
      }
    ]
  }
}
```

2. **Implement Command Handler**
```typescript
// src/commands/MyCommands.ts
export function registerMyCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'nofx.myNewCommand',
    async () => {
      // Command implementation
      vscode.window.showInformationMessage('Command executed!');
    }
  );
  
  context.subscriptions.push(disposable);
}
```

3. **Register in Extension**
```typescript
// src/extension.ts
import { registerMyCommand } from './commands/MyCommands';

export function activate(context: vscode.ExtensionContext) {
  registerMyCommand(context);
}
```

### Creating New Services

1. **Define Service Interface**
```typescript
// src/services/interfaces.ts
export interface IMyService {
  doSomething(): Promise<void>;
  getSomething(): string;
}
```

2. **Implement Service**
```typescript
// src/services/MyService.ts
export class MyService implements IMyService {
  constructor(
    private logger: LoggingService,
    private eventBus: EventBus
  ) {}

  async doSomething(): Promise<void> {
    this.logger.log('Doing something...');
    this.eventBus.emit('something-done');
  }

  getSomething(): string {
    return 'something';
  }
}
```

3. **Register in Container**
```typescript
// src/extension.ts
container.register('MyService', () => 
  new MyService(
    container.resolve('LoggingService'),
    container.resolve('EventBus')
  )
);
```

### Adding UI Components

1. **Create Tree Provider**
```typescript
// src/views/MyTreeProvider.ts
export class MyTreeProvider implements vscode.TreeDataProvider<MyItem> {
  getTreeItem(element: MyItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MyItem): Thenable<MyItem[]> {
    // Return children items
    return Promise.resolve([]);
  }
}
```

2. **Register Tree View**
```typescript
// src/extension.ts
const myProvider = new MyTreeProvider();
vscode.window.createTreeView('nofxMyView', {
  treeDataProvider: myProvider
});
```

3. **Add to package.json**
```json
{
  "contributes": {
    "views": {
      "nofx-sidebar": [
        {
          "id": "nofxMyView",
          "name": "My View",
          "icon": "$(symbol-misc)"
        }
      ]
    }
  }
}
```

### Implementing New Agent Types

1. **Create Agent Template**
```json
// .nofx/templates/my-specialist.json
{
  "id": "my-specialist",
  "name": "My Specialist",
  "icon": "🔧",
  "systemPrompt": "You are a specialist in...",
  "capabilities": ["capability1", "capability2"],
  "taskPreferences": {
    "preferred": ["task-type-1"],
    "avoid": ["task-type-2"]
  }
}
```

2. **Register Agent Type**
```typescript
// src/agents/AgentManager.ts
export class AgentManager {
  registerAgentType(template: AgentTemplate): void {
    this.templates.set(template.id, template);
  }
}
```

### Adding Configuration Options

1. **Define in package.json**
```json
{
  "contributes": {
    "configuration": {
      "title": "NofX",
      "properties": {
        "nofx.myOption": {
          "type": "boolean",
          "default": false,
          "description": "Enable my feature"
        }
      }
    }
  }
}
```

2. **Read Configuration**
```typescript
const config = vscode.workspace.getConfiguration('nofx');
const myOption = config.get<boolean>('myOption', false);

if (myOption) {
  // Feature enabled
}
```

### Writing Tests

1. **Unit Test**
```typescript
// src/test/unit/services/MyService.test.ts
describe('MyService', () => {
  let service: MyService;
  let logger: jest.Mocked<LoggingService>;
  let eventBus: jest.Mocked<EventBus>;

  beforeEach(() => {
    logger = createMock<LoggingService>();
    eventBus = createMock<EventBus>();
    service = new MyService(logger, eventBus);
  });

  test('should do something', async () => {
    await service.doSomething();
    
    expect(logger.log).toHaveBeenCalledWith('Doing something...');
    expect(eventBus.emit).toHaveBeenCalledWith('something-done');
  });
});
```

2. **Integration Test**
```typescript
// src/test/integration/MyWorkflow.test.ts
describe('My Workflow', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    registerServices(container);
  });

  test('should complete workflow', async () => {
    const service = container.resolve<MyService>('MyService');
    const result = await service.doSomething();
    
    expect(result).toBeDefined();
  });
});
```

### Debugging Issues

1. **Enable Debug Logging**
```typescript
// Add debug flag to services
export class MyService {
  private debug = process.env.NOFX_DEBUG === 'true';

  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[MyService]', ...args);
    }
  }
}
```

2. **Add Debug Commands**
```typescript
// Register debug command
vscode.commands.registerCommand('nofx.debug.myService', () => {
  const service = container.resolve<MyService>('MyService');
  console.log('Service state:', service.getState());
});
```

## 🚨 Troubleshooting

### Build Failures

#### TypeScript Compilation Errors
```bash
# Check for errors
npx tsc --noEmit

# Clean and rebuild
rm -rf out/
npm run compile
```

#### Missing Dependencies
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Extension Activation Issues

#### Check Activation Events
```json
// package.json
{
  "activationEvents": [
    "onCommand:nofx.startConductor",
    "onView:nofx-sidebar",
    "onStartupFinished"
  ]
}
```

#### Debug Activation
```typescript
export function activate(context: vscode.ExtensionContext) {
  console.log('[NofX] Activating extension...');
  
  try {
    // Initialization code
  } catch (error) {
    console.error('[NofX] Activation failed:', error);
    vscode.window.showErrorMessage(
      `NofX activation failed: ${error.message}`
    );
  }
}
```

### Command Registration Problems

#### Validate Commands
```bash
# Use the validation script
npm run validate:commands
```

#### Check Command Conflicts
```typescript
// Check if command already exists
const commands = await vscode.commands.getCommands();
if (commands.includes('nofx.myCommand')) {
  console.warn('Command already registered');
}
```

### Service Resolution Errors

#### Debug Container
```typescript
// List all registered services
container.listServices().forEach(service => {
  console.log(`- ${service}`);
});

// Check for circular dependencies
container.validateDependencies();
```

### WebSocket Connection Issues

#### Check Port Availability
```bash
# Check if port is in use
lsof -i :7777
```

#### Enable WebSocket Debug Logging
```typescript
const wss = new WebSocket.Server({ 
  port: 7777,
  verifyClient: (info) => {
    console.log('Client connecting from:', info.origin);
    return true;
  }
});
```

### Performance Problems

#### Profile Extension
```typescript
// Measure operation time
const measure = (name: string, fn: () => void) => {
  const start = performance.now();
  fn();
  const duration = performance.now() - start;
  console.log(`${name}: ${duration.toFixed(2)}ms`);
};

measure('Service initialization', () => {
  container.resolve('MyService');
});
```

#### Memory Leak Detection
```typescript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory:', {
    heap: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`
  });
}, 5000);
```

## 📦 Release Process

### Version Management

1. **Update Version**
```bash
# Update package.json version
npm version patch  # or minor/major
```

2. **Update Changelog**
```markdown
## [0.1.1] - 2024-01-15
### Added
- New feature X
### Fixed
- Bug Y
### Changed
- Behavior Z
```

### Build Validation

```bash
# Run full validation
npm run build:ci

# This runs:
# - Clean build
# - All tests
# - Coverage check
# - Linting
# - Package validation
```

### Testing Requirements

1. **Automated Tests**
   - All tests must pass
   - Coverage must meet threshold (80%)
   - No linting errors

2. **Manual Testing**
   - Complete manual test checklist
   - Test on VS Code and Cursor
   - Test on all supported platforms

### VSIX Packaging

```bash
# Create release package
npx vsce package

# Verify package
npx vsce ls
```

### Distribution Methods

1. **VS Code Marketplace**
```bash
# Publish to marketplace
npx vsce publish
```

2. **GitHub Releases**
   - Create GitHub release
   - Attach VSIX file
   - Include changelog

3. **Direct Distribution**
   - Share VSIX file directly
   - Provide installation instructions

### Post-Release Verification

1. **Install from Marketplace**
```bash
code --install-extension nofx.nofx
```

2. **Verify Functionality**
   - Run smoke tests
   - Check critical features
   - Monitor error reports

3. **Monitor Metrics**
   - Installation count
   - User ratings
   - Issue reports

---

*This developer guide is a living document. Please update it as the extension evolves.*