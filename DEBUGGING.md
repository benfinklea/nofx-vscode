# NofX Debugging Guide

Comprehensive debugging guide for the NofX VS Code extension development.

## 🐛 Quick Debug Setup

### Start Debugging in 30 Seconds

1. **Open Project in VS Code**
   ```bash
   code .
   ```

2. **Start Watch Mode**
   ```bash
   npm run watch
   ```

3. **Launch Debugger**
   - Press `F5` to launch Extension Development Host
   - New VS Code window opens with extension loaded

4. **Set Breakpoints**
   - Click in the gutter next to any TypeScript line
   - Breakpoints work in `.ts` files (not compiled `.js`)

5. **Monitor Output**
   - View → Output → Select "NofX Extension"

## 🔧 Development Environment Debugging

### VS Code Extension Development Host

#### Launch Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--disable-extensions"  // Disable other extensions for isolation
      ],
      "outFiles": [
        "${workspaceFolder}/out/**/*.js"
      ],
      "preLaunchTask": "npm: watch",
      "env": {
        "NOFX_DEBUG": "true",
        "NODE_ENV": "development"
      },
      "sourceMaps": true,
      "smartStep": true
    },
    {
      "name": "Debug Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
      ],
      "outFiles": [
        "${workspaceFolder}/out/test/**/*.js"
      ],
      "preLaunchTask": "npm: test-compile"
    }
  ]
}
```

#### Debug Console Usage

```typescript
// Use debug console for runtime evaluation
// While debugging, open Debug Console (Cmd+Shift+Y)

// Evaluate expressions:
agentManager.getAgents()
container.resolve('LoggingService')
vscode.window.activeTextEditor?.document.uri

// Call functions:
await vscode.commands.executeCommand('nofx.listAgents')

// Modify variables:
config.maxAgents = 5
```

### Output Channels

#### Creating Debug Output Channels

```typescript
// src/services/LoggingService.ts
export class LoggingService {
  private outputChannel: vscode.OutputChannel;
  private debugChannel: vscode.OutputChannel;
  
  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('NofX Extension');
    this.debugChannel = vscode.window.createOutputChannel('NofX Debug');
  }
  
  log(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] ${message}`;
    
    this.outputChannel.appendLine(formatted);
    
    if (args.length > 0) {
      this.outputChannel.appendLine(JSON.stringify(args, null, 2));
    }
  }
  
  debug(message: string, data?: any): void {
    if (process.env.NOFX_DEBUG === 'true') {
      this.debugChannel.appendLine(`[DEBUG] ${message}`);
      if (data) {
        this.debugChannel.appendLine(JSON.stringify(data, null, 2));
      }
    }
  }
}
```

#### Channel Organization

```typescript
// Separate channels for different components
const channels = {
  main: vscode.window.createOutputChannel('NofX Extension'),
  orchestration: vscode.window.createOutputChannel('NofX Orchestration'),
  conductor: vscode.window.createOutputChannel('NofX Conductor'),
  metrics: vscode.window.createOutputChannel('NofX Metrics'),
  debug: vscode.window.createOutputChannel('NofX Debug')
};

// Use appropriate channel for each component
class OrchestrationServer {
  private log(message: string): void {
    channels.orchestration.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}
```

### Developer Tools

#### Accessing Developer Tools

```bash
# In Extension Development Host window:
Help → Toggle Developer Tools
# Or press Cmd+Option+I (Mac) / Ctrl+Shift+I (Windows/Linux)
```

#### Console Tab
```javascript
// Use console for debugging webviews
console.log('[NofX]', 'Debug message');
console.table(agentData);
console.time('operation');
// ... code to measure
console.timeEnd('operation');

// Advanced console methods
console.group('Agent Creation');
console.log('Creating agent:', agentType);
console.log('Template:', template);
console.groupEnd();

// Conditional logging
console.assert(agents.length > 0, 'No agents available');
```

#### Network Tab
```javascript
// Monitor WebSocket connections
// Filter by WS to see WebSocket traffic
// Click on connection to see messages

// Debug WebSocket messages
ws.addEventListener('message', (event) => {
  console.log('WS Message:', JSON.parse(event.data));
});
```

#### Sources Tab
```javascript
// Set breakpoints in webview code
// Navigate to webpack:// → . → webview → [file]
// Click line number to set breakpoint

// Use conditional breakpoints
// Right-click line number → Add conditional breakpoint
// Enter condition: message.type === 'SPAWN_AGENT'
```

#### Performance Tab
```javascript
// Profile extension performance
// Click Record → Perform actions → Stop

// Analyze:
// - Scripting time
// - Rendering time
// - Memory usage
// - Call tree
```

## 🏗️ Extension Architecture Debugging

### Service Container Debugging

#### Debug Service Registration

```typescript
// src/services/Container.ts
export class Container {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();
  private debug = process.env.NOFX_DEBUG === 'true';
  
  register<T>(token: string, factory: () => T): void {
    if (this.debug) {
      console.log(`[Container] Registering service: ${token}`);
      console.trace('Registration stack trace');
    }
    
    if (this.factories.has(token)) {
      console.warn(`[Container] Service already registered: ${token}`);
    }
    
    this.factories.set(token, factory);
  }
  
  resolve<T>(token: string): T {
    const startTime = performance.now();
    
    if (this.debug) {
      console.log(`[Container] Resolving service: ${token}`);
    }
    
    if (!this.factories.has(token)) {
      const available = Array.from(this.factories.keys());
      throw new Error(
        `Service not registered: ${token}\n` +
        `Available services: ${available.join(', ')}`
      );
    }
    
    if (!this.services.has(token)) {
      const factory = this.factories.get(token)!;
      try {
        this.services.set(token, factory());
      } catch (error) {
        console.error(`[Container] Failed to create service: ${token}`, error);
        throw error;
      }
    }
    
    const duration = performance.now() - startTime;
    if (this.debug) {
      console.log(`[Container] Resolved ${token} in ${duration.toFixed(2)}ms`);
    }
    
    return this.services.get(token);
  }
  
  // Debug helper methods
  listServices(): string[] {
    return Array.from(this.factories.keys());
  }
  
  isRegistered(token: string): boolean {
    return this.factories.has(token);
  }
  
  isResolved(token: string): boolean {
    return this.services.has(token);
  }
  
  getDependencyGraph(): Map<string, string[]> {
    // Analyze dependencies for circular reference detection
    const graph = new Map<string, string[]>();
    // Implementation...
    return graph;
  }
}
```

#### Circular Dependency Detection

```typescript
// src/services/DependencyValidator.ts
export class DependencyValidator {
  static validateNoCycles(container: Container): void {
    const graph = container.getDependencyGraph();
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    function hasCycle(node: string): boolean {
      visited.add(node);
      recursionStack.add(node);
      
      const dependencies = graph.get(node) || [];
      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          if (hasCycle(dep)) {
            console.error(`Cycle detected: ${node} → ${dep}`);
            return true;
          }
        } else if (recursionStack.has(dep)) {
          console.error(`Cycle detected: ${node} → ${dep} (already in stack)`);
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    }
    
    for (const service of graph.keys()) {
      if (!visited.has(service)) {
        if (hasCycle(service)) {
          throw new Error('Circular dependency detected');
        }
      }
    }
  }
}
```

### Command Registration Debugging

#### Debug Command Registration

```typescript
// src/commands/CommandDebugger.ts
export class CommandDebugger {
  private registeredCommands = new Set<string>();
  
  registerCommand(
    context: vscode.ExtensionContext,
    commandId: string,
    handler: (...args: any[]) => any
  ): void {
    console.log(`[Commands] Registering: ${commandId}`);
    
    // Check for duplicate registration
    if (this.registeredCommands.has(commandId)) {
      console.warn(`[Commands] Duplicate registration: ${commandId}`);
    }
    
    // Wrap handler for debugging
    const debugHandler = async (...args: any[]) => {
      console.log(`[Commands] Executing: ${commandId}`);
      console.log(`[Commands] Arguments:`, args);
      
      const startTime = performance.now();
      
      try {
        const result = await handler(...args);
        const duration = performance.now() - startTime;
        console.log(`[Commands] Completed ${commandId} in ${duration.toFixed(2)}ms`);
        return result;
      } catch (error) {
        console.error(`[Commands] Failed: ${commandId}`, error);
        throw error;
      }
    };
    
    const disposable = vscode.commands.registerCommand(commandId, debugHandler);
    context.subscriptions.push(disposable);
    this.registeredCommands.add(commandId);
  }
  
  async validateCommands(): Promise<void> {
    const allCommands = await vscode.commands.getCommands(true);
    const nofxCommands = allCommands.filter(cmd => cmd.startsWith('nofx.'));
    
    console.log(`[Commands] Found ${nofxCommands.length} NofX commands`);
    
    // Check package.json declarations
    const packageJson = require('../../package.json');
    const declaredCommands = packageJson.contributes.commands.map((c: any) => c.command);
    
    // Find missing implementations
    const missing = declaredCommands.filter((cmd: string) => !nofxCommands.includes(cmd));
    if (missing.length > 0) {
      console.error('[Commands] Missing implementations:', missing);
    }
    
    // Find undeclared commands
    const undeclared = nofxCommands.filter(cmd => !declaredCommands.includes(cmd));
    if (undeclared.length > 0) {
      console.warn('[Commands] Undeclared commands:', undeclared);
    }
  }
}
```

#### Command Execution Tracing

```typescript
// Trace command execution flow
export function traceCommand(commandId: string): void {
  const originalExecute = vscode.commands.executeCommand;
  
  vscode.commands.executeCommand = async function(...args: any[]) {
    if (args[0] === commandId || args[0].startsWith('nofx.')) {
      console.group(`[Trace] Command: ${args[0]}`);
      console.log('Arguments:', args.slice(1));
      console.trace('Call stack');
      
      const result = await originalExecute.apply(this, args);
      
      console.log('Result:', result);
      console.groupEnd();
      
      return result;
    }
    return originalExecute.apply(this, args);
  };
}
```

### Event Bus Debugging

#### Event Flow Visualization

```typescript
// src/services/EventBusDebugger.ts
export class EventBusDebugger extends EventBus {
  private eventLog: Array<{
    timestamp: Date;
    event: string;
    data: any;
    listeners: number;
  }> = [];
  
  emit(event: string, data?: any): void {
    const listeners = this.events.get(event)?.size || 0;
    
    console.group(`[EventBus] Emit: ${event}`);
    console.log('Data:', data);
    console.log('Listeners:', listeners);
    console.groupEnd();
    
    this.eventLog.push({
      timestamp: new Date(),
      event,
      data,
      listeners
    });
    
    super.emit(event, data);
  }
  
  on(event: string, handler: EventHandler): void {
    console.log(`[EventBus] Subscribe: ${event}`);
    super.on(event, handler);
  }
  
  getEventLog(): typeof this.eventLog {
    return this.eventLog;
  }
  
  printEventFlow(): void {
    console.table(this.eventLog.map(log => ({
      time: log.timestamp.toISOString(),
      event: log.event,
      listeners: log.listeners,
      hasData: !!log.data
    })));
  }
}
```

### UI Component Debugging

#### Tree Provider Debugging

```typescript
// src/views/DebugTreeProvider.ts
export class DebugTreeProvider<T> implements vscode.TreeDataProvider<T> {
  private refreshCount = 0;
  private _onDidChangeTreeData = new vscode.EventEmitter<T | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  constructor(private baseProvider: vscode.TreeDataProvider<T>) {}
  
  refresh(): void {
    this.refreshCount++;
    console.log(`[TreeProvider] Refresh #${this.refreshCount}`);
    console.trace('Refresh triggered from');
    this._onDidChangeTreeData.fire(undefined);
  }
  
  getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem> {
    console.log('[TreeProvider] getTreeItem:', element);
    return this.baseProvider.getTreeItem(element);
  }
  
  getChildren(element?: T): vscode.ProviderResult<T[]> {
    console.log('[TreeProvider] getChildren:', element);
    
    const startTime = performance.now();
    const result = this.baseProvider.getChildren(element);
    
    if (result instanceof Promise) {
      return result.then(children => {
        const duration = performance.now() - startTime;
        console.log(`[TreeProvider] Loaded ${children?.length || 0} children in ${duration.toFixed(2)}ms`);
        return children;
      });
    }
    
    return result;
  }
  
  getParent?(element: T): vscode.ProviderResult<T> {
    if (this.baseProvider.getParent) {
      console.log('[TreeProvider] getParent:', element);
      return this.baseProvider.getParent(element);
    }
    return undefined;
  }
}
```

#### Webview Debugging

```typescript
// src/panels/WebviewDebugger.ts
export class WebviewDebugger {
  static attachToPanel(panel: vscode.WebviewPanel): void {
    // Log all messages
    panel.webview.onDidReceiveMessage(
      message => {
        console.group('[Webview] Message received');
        console.log('Type:', message.type);
        console.log('Data:', message.data);
        console.groupEnd();
      }
    );
    
    // Monitor visibility changes
    panel.onDidChangeViewState(e => {
      console.log('[Webview] Visibility changed:', e.webviewPanel.visible);
    });
    
    // Inject debug script
    const debugScript = `
      <script>
        // Override console methods to send to extension
        const originalLog = console.log;
        console.log = function(...args) {
          originalLog.apply(console, args);
          vscode.postMessage({
            type: 'console',
            level: 'log',
            args: args.map(arg => JSON.stringify(arg))
          });
        };
        
        // Monitor errors
        window.addEventListener('error', (event) => {
          vscode.postMessage({
            type: 'error',
            message: event.message,
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
            stack: event.error?.stack
          });
        });
        
        // Monitor performance
        window.addEventListener('load', () => {
          const perfData = performance.getEntriesByType('navigation')[0];
          vscode.postMessage({
            type: 'performance',
            data: perfData
          });
        });
      </script>
    `;
    
    // Inject debug script into HTML
    let html = panel.webview.html;
    html = html.replace('</body>', `${debugScript}</body>`);
    panel.webview.html = html;
  }
}
```

## 🌐 WebSocket and Orchestration Debugging

### WebSocket Server Debugging

```typescript
// src/orchestration/WebSocketDebugger.ts
import * as WebSocket from 'ws';

export class WebSocketDebugger {
  private messageLog: Array<{
    timestamp: Date;
    direction: 'in' | 'out';
    clientId: string;
    message: any;
  }> = [];
  
  attachToServer(wss: WebSocket.Server): void {
    console.log('[WebSocket] Server starting on port', wss.options.port);
    
    wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      const clientIp = req.socket.remoteAddress;
      
      console.group(`[WebSocket] New connection: ${clientId}`);
      console.log('IP:', clientIp);
      console.log('Headers:', req.headers);
      console.groupEnd();
      
      // Monitor messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          console.group(`[WebSocket] Message from ${clientId}`);
          console.log('Type:', message.type);
          console.log('Payload:', message.payload);
          console.groupEnd();
          
          this.messageLog.push({
            timestamp: new Date(),
            direction: 'in',
            clientId,
            message
          });
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      });
      
      // Monitor errors
      ws.on('error', (error) => {
        console.error(`[WebSocket] Error from ${clientId}:`, error);
      });
      
      // Monitor close
      ws.on('close', (code, reason) => {
        console.log(`[WebSocket] Connection closed: ${clientId}`);
        console.log('Code:', code, 'Reason:', reason);
      });
      
      // Monitor pong (keepalive)
      ws.on('pong', () => {
        console.log(`[WebSocket] Pong from ${clientId}`);
      });
    });
    
    wss.on('error', (error) => {
      console.error('[WebSocket] Server error:', error);
    });
  }
  
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getMessageLog(): typeof this.messageLog {
    return this.messageLog;
  }
  
  printMessageFlow(): void {
    console.table(this.messageLog.map(log => ({
      time: log.timestamp.toISOString(),
      direction: log.direction,
      client: log.clientId.substr(0, 16),
      type: log.message.type,
      hasPayload: !!log.message.payload
    })));
  }
}
```

### Message Protocol Debugging

```typescript
// src/orchestration/MessageDebugger.ts
export class MessageDebugger {
  static validateMessage(message: any): boolean {
    const required = ['type', 'from', 'timestamp'];
    const missing = required.filter(field => !message[field]);
    
    if (missing.length > 0) {
      console.error('[Message] Missing required fields:', missing);
      console.error('[Message] Received:', message);
      return false;
    }
    
    // Validate message type
    const validTypes = [
      'SPAWN_AGENT',
      'ASSIGN_TASK',
      'QUERY_STATUS',
      'AGENT_READY',
      'TASK_PROGRESS',
      'TASK_COMPLETE'
    ];
    
    if (!validTypes.includes(message.type)) {
      console.warn('[Message] Unknown message type:', message.type);
    }
    
    return true;
  }
  
  static traceMessageFlow(message: any): void {
    console.group(`[Message] ${message.type}`);
    console.log('From:', message.from);
    console.log('To:', message.to || 'broadcast');
    console.log('Timestamp:', new Date(message.timestamp).toISOString());
    
    if (message.payload) {
      console.log('Payload:', JSON.stringify(message.payload, null, 2));
    }
    
    console.trace('Message origin');
    console.groupEnd();
  }
}
```

### Agent Communication Debugging

```typescript
// src/agents/AgentDebugger.ts
export class AgentDebugger {
  private agentLogs = new Map<string, Array<{
    timestamp: Date;
    event: string;
    data: any;
  }>>();
  
  logAgentEvent(agentId: string, event: string, data?: any): void {
    if (!this.agentLogs.has(agentId)) {
      this.agentLogs.set(agentId, []);
    }
    
    this.agentLogs.get(agentId)!.push({
      timestamp: new Date(),
      event,
      data
    });
    
    console.log(`[Agent:${agentId}] ${event}`, data || '');
  }
  
  getAgentHistory(agentId: string): void {
    const logs = this.agentLogs.get(agentId) || [];
    
    console.group(`[Agent:${agentId}] History`);
    console.table(logs.map(log => ({
      time: log.timestamp.toISOString(),
      event: log.event,
      hasData: !!log.data
    })));
    console.groupEnd();
  }
  
  compareAgents(agentId1: string, agentId2: string): void {
    const logs1 = this.agentLogs.get(agentId1) || [];
    const logs2 = this.agentLogs.get(agentId2) || [];
    
    console.group('Agent Comparison');
    console.log(`Agent 1 (${agentId1}): ${logs1.length} events`);
    console.log(`Agent 2 (${agentId2}): ${logs2.length} events`);
    
    // Find common events
    const events1 = new Set(logs1.map(l => l.event));
    const events2 = new Set(logs2.map(l => l.event));
    const common = [...events1].filter(e => events2.has(e));
    
    console.log('Common events:', common);
    console.groupEnd();
  }
}
```

## 🧪 Testing and Validation Debugging

### Test Debugging

```typescript
// src/test/TestDebugger.ts
export class TestDebugger {
  static setupTestDebugging(): void {
    // Enhanced test logging
    beforeEach(() => {
      const testName = expect.getState().currentTestName;
      console.log(`\n[Test] Starting: ${testName}`);
      console.time(testName);
    });
    
    afterEach(() => {
      const testName = expect.getState().currentTestName;
      console.timeEnd(testName);
      
      // Log test result
      const { assertionCalls, numPassingAsserts } = expect.getState();
      console.log(`[Test] Assertions: ${numPassingAsserts}/${assertionCalls}`);
    });
  }
  
  static captureTestState(): any {
    return {
      testName: expect.getState().currentTestName,
      testPath: expect.getState().testPath,
      assertions: expect.getState().assertionCalls,
      snapshot: {
        // Capture relevant state
        services: Container.getInstance().listServices(),
        agents: AgentManager.getInstance().getAgents(),
        tasks: TaskQueue.getInstance().getTasks()
      }
    };
  }
  
  static mockWithLogging<T extends object>(obj: T): jest.Mocked<T> {
    const mock = jest.fn() as any;
    
    return new Proxy(mock, {
      get(target, prop) {
        if (typeof obj[prop as keyof T] === 'function') {
          return jest.fn((...args) => {
            console.log(`[Mock] ${String(prop)} called with:`, args);
            return (obj[prop as keyof T] as any)(...args);
          });
        }
        return obj[prop as keyof T];
      }
    });
  }
}
```

### Validation Debugging

```typescript
// src/validation/ValidationDebugger.ts
export class ValidationDebugger {
  static validateExtensionState(): void {
    console.group('[Validation] Extension State');
    
    // Check activation
    const ext = vscode.extensions.getExtension('nofx.nofx');
    console.log('Installed:', !!ext);
    console.log('Active:', ext?.isActive);
    
    // Check commands
    vscode.commands.getCommands(true).then(commands => {
      const nofxCommands = commands.filter(c => c.startsWith('nofx.'));
      console.log('Commands registered:', nofxCommands.length);
    });
    
    // Check services
    const container = Container.getInstance();
    console.log('Services registered:', container.listServices().length);
    
    // Check configuration
    const config = vscode.workspace.getConfiguration('nofx');
    console.log('Configuration:', {
      maxAgents: config.get('maxAgents'),
      autoAssign: config.get('autoAssignTasks'),
      useWorktrees: config.get('useWorktrees')
    });
    
    console.groupEnd();
  }
  
  static async performHealthCheck(): Promise<boolean> {
    const checks = [
      { name: 'Extension Active', check: () => vscode.extensions.getExtension('nofx.nofx')?.isActive },
      { name: 'Commands Available', check: async () => (await vscode.commands.getCommands(true)).some(c => c.startsWith('nofx.')) },
      { name: 'Services Ready', check: () => Container.getInstance().listServices().length > 0 },
      { name: 'WebSocket Running', check: () => OrchestrationServer.getInstance().isRunning() }
    ];
    
    let allPassed = true;
    
    console.group('[HealthCheck]');
    for (const { name, check } of checks) {
      try {
        const result = await check();
        console.log(`✅ ${name}: ${result ? 'PASS' : 'FAIL'}`);
        if (!result) allPassed = false;
      } catch (error) {
        console.log(`❌ ${name}: ERROR -`, error);
        allPassed = false;
      }
    }
    console.groupEnd();
    
    return allPassed;
  }
}
```

## 📊 Performance Debugging

### Performance Profiling

```typescript
// src/debug/PerformanceProfiler.ts
export class PerformanceProfiler {
  private static measurements = new Map<string, number[]>();
  
  static measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result.then(value => {
          this.recordMeasurement(name, performance.now() - start);
          return value;
        }) as any;
      }
      
      this.recordMeasurement(name, performance.now() - start);
      return result;
    } catch (error) {
      this.recordMeasurement(name, performance.now() - start);
      throw error;
    }
  }
  
  private static recordMeasurement(name: string, duration: number): void {
    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    
    this.measurements.get(name)!.push(duration);
    
    // Log slow operations
    if (duration > 100) {
      console.warn(`[Performance] Slow operation: ${name} took ${duration.toFixed(2)}ms`);
    }
  }
  
  static getStats(name: string): {
    count: number;
    total: number;
    average: number;
    min: number;
    max: number;
  } | undefined {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) {
      return undefined;
    }
    
    return {
      count: measurements.length,
      total: measurements.reduce((a, b) => a + b, 0),
      average: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements)
    };
  }
  
  static printReport(): void {
    console.group('[Performance] Report');
    
    const table: any[] = [];
    for (const [name, measurements] of this.measurements) {
      const stats = this.getStats(name)!;
      table.push({
        Operation: name,
        Count: stats.count,
        'Avg (ms)': stats.average.toFixed(2),
        'Min (ms)': stats.min.toFixed(2),
        'Max (ms)': stats.max.toFixed(2),
        'Total (ms)': stats.total.toFixed(2)
      });
    }
    
    console.table(table);
    console.groupEnd();
  }
}
```

### Memory Debugging

```typescript
// src/debug/MemoryDebugger.ts
export class MemoryDebugger {
  private static baseline: NodeJS.MemoryUsage | undefined;
  private static snapshots: Array<{
    timestamp: Date;
    usage: NodeJS.MemoryUsage;
    label: string;
  }> = [];
  
  static captureBaseline(): void {
    if (global.gc) {
      global.gc(); // Force garbage collection if available
    }
    
    this.baseline = process.memoryUsage();
    console.log('[Memory] Baseline captured:', this.formatMemory(this.baseline));
  }
  
  static captureSnapshot(label: string): void {
    const usage = process.memoryUsage();
    this.snapshots.push({
      timestamp: new Date(),
      usage,
      label
    });
    
    console.log(`[Memory] Snapshot '${label}':`, this.formatMemory(usage));
    
    if (this.baseline) {
      const diff = this.diffMemory(this.baseline, usage);
      console.log(`[Memory] Diff from baseline:`, this.formatMemory(diff));
    }
  }
  
  private static formatMemory(usage: NodeJS.MemoryUsage): string {
    return `Heap: ${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB, ` +
           `RSS: ${(usage.rss / 1024 / 1024).toFixed(2)}MB, ` +
           `External: ${(usage.external / 1024 / 1024).toFixed(2)}MB`;
  }
  
  private static diffMemory(baseline: NodeJS.MemoryUsage, current: NodeJS.MemoryUsage): NodeJS.MemoryUsage {
    return {
      rss: current.rss - baseline.rss,
      heapTotal: current.heapTotal - baseline.heapTotal,
      heapUsed: current.heapUsed - baseline.heapUsed,
      external: current.external - baseline.external,
      arrayBuffers: current.arrayBuffers - baseline.arrayBuffers
    };
  }
  
  static detectLeaks(): void {
    const threshold = 50 * 1024 * 1024; // 50MB
    
    if (this.snapshots.length < 2) {
      console.log('[Memory] Need at least 2 snapshots to detect leaks');
      return;
    }
    
    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const diff = last.usage.heapUsed - first.usage.heapUsed;
    
    if (diff > threshold) {
      console.warn(`[Memory] Potential leak detected: ${(diff / 1024 / 1024).toFixed(2)}MB increase`);
      console.warn(`[Memory] From '${first.label}' to '${last.label}'`);
    } else {
      console.log('[Memory] No significant leaks detected');
    }
  }
  
  static startMonitoring(interval = 5000): NodeJS.Timer {
    return setInterval(() => {
      const usage = process.memoryUsage();
      console.log(`[Memory] Current:`, this.formatMemory(usage));
      
      // Alert on high memory
      if (usage.heapUsed > 500 * 1024 * 1024) {
        console.error('[Memory] High memory usage detected!');
      }
    }, interval);
  }
}
```

## 🔍 Common Debugging Scenarios

### Debugging Extension Won't Activate

```typescript
// Debug activation issues
export function debugActivation(context: vscode.ExtensionContext): void {
  console.group('[Activation] Starting');
  console.log('Extension Path:', context.extensionPath);
  console.log('Storage Path:', context.globalStorageUri.fsPath);
  console.log('Extension Mode:', context.extensionMode);
  
  try {
    // Step 1: Container setup
    console.log('[Activation] Setting up container...');
    const container = Container.getInstance();
    
    // Step 2: Service registration
    console.log('[Activation] Registering services...');
    registerServices(container);
    console.log('[Activation] Services registered:', container.listServices());
    
    // Step 3: Command registration
    console.log('[Activation] Registering commands...');
    registerCommands(context, container);
    
    // Step 4: UI setup
    console.log('[Activation] Setting up UI...');
    setupUI(context, container);
    
    console.log('[Activation] ✅ Success');
  } catch (error) {
    console.error('[Activation] ❌ Failed:', error);
    console.error('[Activation] Stack:', (error as Error).stack);
    
    // Show user-friendly error
    vscode.window.showErrorMessage(
      `NofX activation failed: ${(error as Error).message}`
    );
    
    throw error;
  } finally {
    console.groupEnd();
  }
}
```

### Debugging Commands Not Working

```typescript
// Debug command execution
export async function debugCommand(commandId: string): Promise<void> {
  console.group(`[Command] Debugging: ${commandId}`);
  
  // Check if registered
  const commands = await vscode.commands.getCommands(true);
  const isRegistered = commands.includes(commandId);
  console.log('Registered:', isRegistered);
  
  if (!isRegistered) {
    console.error('Command not registered!');
    console.log('Available NofX commands:', commands.filter(c => c.startsWith('nofx.')));
    console.groupEnd();
    return;
  }
  
  // Try to execute
  try {
    console.log('Executing command...');
    const result = await vscode.commands.executeCommand(commandId);
    console.log('Result:', result);
  } catch (error) {
    console.error('Execution failed:', error);
    console.error('Stack:', (error as Error).stack);
  }
  
  console.groupEnd();
}
```

### Debugging WebSocket Issues

```typescript
// Debug WebSocket connection
export function debugWebSocket(): void {
  const ws = new WebSocket('ws://localhost:7777');
  
  ws.on('open', () => {
    console.log('[WS Debug] Connected');
    
    // Send test message
    ws.send(JSON.stringify({
      type: 'TEST',
      from: 'debugger',
      timestamp: Date.now()
    }));
  });
  
  ws.on('message', (data) => {
    console.log('[WS Debug] Received:', data.toString());
  });
  
  ws.on('error', (error) => {
    console.error('[WS Debug] Error:', error);
  });
  
  ws.on('close', (code, reason) => {
    console.log('[WS Debug] Closed:', code, reason);
  });
  
  // Test ping
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
      console.log('[WS Debug] Ping sent');
    }
  }, 5000);
}
```

### Debugging Agent Issues

```typescript
// Debug agent lifecycle
export async function debugAgent(agentId: string): Promise<void> {
  const agentManager = Container.getInstance().resolve<AgentManager>('AgentManager');
  
  console.group(`[Agent] Debugging: ${agentId}`);
  
  // Get agent state
  const agent = agentManager.getAgent(agentId);
  if (!agent) {
    console.error('Agent not found!');
    console.log('Available agents:', agentManager.getAgents().map(a => a.id));
    console.groupEnd();
    return;
  }
  
  console.log('Agent State:', {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    status: agent.status,
    terminal: !!agent.terminal,
    createdAt: agent.createdAt,
    tasks: agent.assignedTasks
  });
  
  // Check terminal
  if (agent.terminal) {
    console.log('Terminal State:', {
      processId: await agent.terminal.processId,
      exitStatus: agent.terminal.exitStatus,
      state: agent.terminal.state
    });
  }
  
  // Check capabilities
  console.log('Capabilities:', agent.capabilities);
  
  // Check message history
  const messages = agentManager.getAgentMessages(agentId);
  console.log('Recent Messages:', messages.slice(-5));
  
  console.groupEnd();
}
```

## 📋 Debug Commands and Utilities

### Interactive Debug Commands

```typescript
// Register debug commands for development
export function registerDebugCommands(context: vscode.ExtensionContext): void {
  // Debug menu command
  context.subscriptions.push(
    vscode.commands.registerCommand('nofx.debug.menu', async () => {
      const choice = await vscode.window.showQuickPick([
        'Show Extension State',
        'Validate Services',
        'Check WebSocket',
        'Memory Snapshot',
        'Performance Report',
        'Export Debug Logs'
      ], { placeHolder: 'Select debug action' });
      
      switch (choice) {
        case 'Show Extension State':
          ValidationDebugger.validateExtensionState();
          break;
        case 'Validate Services':
          await validateServices();
          break;
        case 'Check WebSocket':
          debugWebSocket();
          break;
        case 'Memory Snapshot':
          MemoryDebugger.captureSnapshot('manual');
          break;
        case 'Performance Report':
          PerformanceProfiler.printReport();
          break;
        case 'Export Debug Logs':
          await exportDebugLogs();
          break;
      }
    })
  );
  
  // Container inspection
  context.subscriptions.push(
    vscode.commands.registerCommand('nofx.debug.container', () => {
      const container = Container.getInstance();
      const services = container.listServices();
      
      vscode.window.showQuickPick(services, {
        placeHolder: 'Select service to inspect'
      }).then(service => {
        if (service) {
          console.log(`[Debug] Inspecting service: ${service}`);
          console.log(container.resolve(service));
        }
      });
    })
  );
}
```

### Debug Output Export

```typescript
// Export debug information
export async function exportDebugLogs(): Promise<void> {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    extension: {
      version: vscode.extensions.getExtension('nofx.nofx')?.packageJSON.version,
      mode: vscode.ExtensionMode[vscode.env.appRoot]
    },
    environment: {
      vscode: vscode.version,
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    state: {
      services: Container.getInstance().listServices(),
      agents: AgentManager.getInstance().getAgents().map(a => ({
        id: a.id,
        type: a.type,
        status: a.status
      })),
      tasks: TaskQueue.getInstance().getTasks().map(t => ({
        id: t.id,
        status: t.status,
        assignedTo: t.assignedTo
      }))
    },
    performance: PerformanceProfiler.getAllStats(),
    memory: process.memoryUsage()
  };
  
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`nofx-debug-${Date.now()}.json`),
    filters: { 'JSON': ['json'] }
  });
  
  if (uri) {
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(JSON.stringify(debugInfo, null, 2))
    );
    
    vscode.window.showInformationMessage(`Debug logs exported to ${uri.fsPath}`);
  }
}
```

---

*This debugging guide provides comprehensive tools and techniques for debugging every aspect of the NofX extension during development.*