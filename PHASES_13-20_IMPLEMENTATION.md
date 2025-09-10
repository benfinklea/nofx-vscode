# PHASES 13-20 IMPLEMENTATION INSTRUCTIONS

## **Phase 13: Container → Native DI Replacement**

### **🎯 GOAL:** Replace complex DI Container with simple service locator

### **CURRENT STATE:**
- `src/services/Container.ts` - 164 lines of complex DI with circular dependency detection
- Symbol-based service registration
- Singleton lifecycle management
- Complex resolution stack

### **TARGET STATE:**
- Simple service registry using plain objects
- Direct service instantiation
- VS Code extension context for storage

### **IMPLEMENTATION STEPS:**

#### **Step 1: Create Simple Service Locator**
```typescript
// src/services/ServiceLocator.ts
import * as vscode from 'vscode';

export class ServiceLocator {
    private static services = new Map<string, any>();
    private static context: vscode.ExtensionContext;

    static initialize(context: vscode.ExtensionContext) {
        this.context = context;
        this.services.clear();
    }

    static register<T>(name: string, instance: T): void {
        this.services.set(name, instance);
    }

    static get<T>(name: string): T {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service ${name} not found`);
        }
        return service;
    }

    static tryGet<T>(name: string): T | undefined {
        return this.services.get(name);
    }

    static clear(): void {
        this.services.clear();
    }
}
```

#### **Step 2: Update Extension.ts**
1. Replace `Container` import with `ServiceLocator`
2. Remove all SERVICE_TOKENS symbol usage
3. Replace `container.register()` with `ServiceLocator.register()`
4. Use string names instead of symbols

**Before:**
```typescript
container.register(SERVICE_TOKENS.LoggingService, 
    (c) => new LoggingService(telemetryService), 'singleton');
```

**After:**
```typescript
const loggingService = new LoggingService();
ServiceLocator.register('LoggingService', loggingService);
```

#### **Step 3: Update All Service References**
**Files to update:**
- `src/extension.ts` 
- `src/commands/*.ts`
- `src/agents/AgentManager.ts`
- `src/services/*.ts`

**Find and replace pattern:**
```typescript
// Replace this pattern:
const service = container.resolve<ServiceType>(SERVICE_TOKENS.ServiceName);

// With this:
const service = ServiceLocator.get<ServiceType>('ServiceName');
```

#### **Step 4: Remove Container Infrastructure**
**Delete files:**
- `src/services/Container.ts`
- Remove `SERVICE_TOKENS` from `src/services/interfaces.ts`
- Remove `IContainer` interface

#### **Step 5: Update Tests**
- Replace Container mocks with ServiceLocator mocks
- Simplify dependency injection in tests
- Use `ServiceLocator.register()` for test doubles

---

## **Phase 14: Test Consolidation (151 → 30 files)**

### **🎯 GOAL:** Consolidate 151 test files into 30 domain-focused test suites

### **CURRENT STATE:**
- 151 individual test files
- Scattered across unit/integration/functional
- Many duplicate test utilities
- Over-granular test separation

### **TARGET STATE:**
- 30 consolidated test files organized by domain
- Shared test utilities
- Clear separation: unit/integration/e2e

### **IMPLEMENTATION STEPS:**

#### **Step 1: Create Test Consolidation Map**
```typescript
// New consolidated structure:
src/test/
├── unit/
│   ├── agents.test.ts              // AgentManager, AgentTemplateManager
│   ├── commands.test.ts            // All command handlers
│   ├── conductor.test.ts           // SmartConductor
│   ├── services.test.ts            // Core services (5 files)
│   ├── tasks.test.ts               // TaskQueue, TaskDependencyManager
│   ├── views.test.ts               // All tree providers
│   ├── worktrees.test.ts           // WorktreeManager
│   └── utilities.test.ts           // Helper functions
├── integration/
│   ├── agent-workflows.test.ts     // End-to-end agent scenarios
│   ├── command-integration.test.ts // Command → Service flows
│   ├── task-management.test.ts     // Task lifecycle
│   └── ui-integration.test.ts      // View interactions
├── e2e/
│   ├── extension-lifecycle.test.ts // Activation/deactivation
│   ├── user-scenarios.test.ts      // Real user workflows
│   └── performance.test.ts         // Load testing
└── shared/
    ├── TestHelpers.ts              // Common utilities
    ├── MockServices.ts             // Service mocks
    └── TestData.ts                 // Test fixtures
```

#### **Step 2: Consolidate Unit Tests**

**Create `src/test/unit/agents.test.ts`:**
```typescript
// Combine these files:
// - AgentManager.test.ts
// - AgentTemplateManager.test.ts  
// - AgentLifecycleManager.test.ts
// - AgentPersistence.test.ts

describe('Agent System', () => {
    describe('AgentManager', () => {
        // All AgentManager tests here
    });
    
    describe('AgentTemplateManager', () => {
        // All template tests here
    });
    
    describe('AgentPersistence', () => {
        // All persistence tests here
    });
});
```

**Apply same pattern for:**
- `commands.test.ts` (combine 8 command test files)
- `services.test.ts` (combine 15 service test files)
- `tasks.test.ts` (combine 6 task test files)
- `views.test.ts` (combine 4 view test files)

#### **Step 3: Consolidate Integration Tests**

**Create `src/test/integration/agent-workflows.test.ts`:**
```typescript
// Combine these scenarios:
// - Agent spawning → task assignment → completion
// - Multi-agent coordination
// - Error handling workflows

describe('Agent Workflows', () => {
    describe('Single Agent Lifecycle', () => {
        it('should spawn → assign → complete → cleanup');
    });
    
    describe('Multi-Agent Coordination', () => {
        it('should coordinate multiple agents on related tasks');
    });
});
```

#### **Step 4: Create Shared Test Infrastructure**

**`src/test/shared/TestHelpers.ts`:**
```typescript
export class TestHelpers {
    static createMockAgent(id: string): Agent { ... }
    static createMockTask(priority: TaskPriority): Task { ... }
    static setupTestEnvironment(): void { ... }
    static cleanupTestEnvironment(): void { ... }
}
```

#### **Step 5: Remove Old Test Files**
After consolidation, delete the original 151 individual test files.

#### **Step 6: Update Test Scripts**
```json
// package.json
{
    "scripts": {
        "test:unit": "jest src/test/unit",
        "test:integration": "jest src/test/integration", 
        "test:e2e": "jest src/test/e2e",
        "test:all": "jest src/test"
    }
}
```

---

## **Phase 16: Interface Simplification**

### **🎯 GOAL:** Streamline complex service interfaces to essential contracts

### **CURRENT STATE:**
- `src/services/interfaces.ts` - Overly complex interfaces
- Many unused interface methods
- Enterprise patterns inappropriate for VS Code

### **TARGET STATE:**
- Simple, focused interfaces
- Only essential methods
- VS Code-appropriate contracts

### **IMPLEMENTATION STEPS:**

#### **Step 1: Audit Current Interfaces**
Review `src/services/interfaces.ts` and identify:
- Unused methods
- Enterprise patterns (circuit breakers, health checks)
- Over-abstracted interfaces

#### **Step 2: Create Simplified Interfaces**

**Before (Complex):**
```typescript
interface ILoggingService {
    debug(message: string, context?: any): void;
    info(message: string, context?: any): void;
    warn(message: string, context?: any): void;
    error(message: string, error?: Error, context?: any): void;
    setLevel(level: LogLevel): void;
    isLevelEnabled(level: LogLevel): boolean;
    createLogger(component: string): ILogger;
    flush(): Promise<void>;
    dispose(): Promise<void>;
    getMetrics(): LoggingMetrics;
    enableStructuredLogging(enabled: boolean): void;
}
```

**After (Simple):**
```typescript
interface ILoggingService {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string, error?: Error): void;
}
```

#### **Step 3: Apply Simplification Pattern**

**IEventBus - Remove enterprise features:**
```typescript
// Remove: metrics, health checks, retry logic, dead letter queues
interface IEventBus {
    publish(event: string, data?: any): void;
    subscribe(event: string, handler: (data: any) => void): void;
    unsubscribe(event: string, handler: Function): void;
}
```

**IConfigurationService - Keep VS Code focused:**
```typescript
interface IConfigurationService {
    get<T>(key: string, defaultValue?: T): T;
    update(key: string, value: any): Promise<void>;
}
```

#### **Step 4: Remove Unused Interfaces**
Delete interfaces not used by any implementation:
- `ICircuitBreaker`
- `IRetryManager` 
- `ISelfHealingManager`
- `IHealthCheckProvider`
- `IMetricsCollector`

#### **Step 5: Update Implementations**
Update all service implementations to match simplified interfaces.

---

## **Phase 17: Template System Consolidation**

### **🎯 GOAL:** Unify multiple template systems into single coherent system

### **CURRENT STATE:**
- Multiple template managers
- Inconsistent template interfaces
- Complex template resolution logic

### **TARGET STATE:**
- Single `AgentTemplateManager`
- Simple JSON-based templates
- Consistent template interface

### **IMPLEMENTATION STEPS:**

#### **Step 1: Audit Template Systems**
Identify all template-related files:
- `AgentTemplateManager.ts`
- `SmartTemplateSystem.ts`
- `NaturalLanguageTemplateResolver.ts`
- Template type definitions

#### **Step 2: Design Unified Template Interface**

**Single Template Type:**
```typescript
interface AgentTemplate {
    id: string;
    name: string;
    category: 'developer' | 'architect' | 'quality' | 'process';
    description: string;
    systemPrompt: string;
    capabilities: string[];
    taskPreferences: {
        preferred: string[];
        avoid: string[];
        priority: 'low' | 'medium' | 'high';
    };
}
```

#### **Step 3: Create Unified Template Manager**

**`src/agents/TemplateManager.ts`:**
```typescript
export class TemplateManager {
    private templates = new Map<string, AgentTemplate>();

    async loadTemplates(): Promise<void> {
        // Load from .nofx/templates/*.json
    }

    getTemplate(id: string): AgentTemplate | undefined {
        return this.templates.get(id);
    }

    getAllTemplates(): AgentTemplate[] {
        return Array.from(this.templates.values());
    }

    getByCategory(category: string): AgentTemplate[] {
        return this.getAllTemplates().filter(t => t.category === category);
    }
}
```

#### **Step 4: Migrate Existing Templates**
Convert all existing template files to unified format:
- Keep essential information
- Remove enterprise complexity
- Standardize capability lists

#### **Step 5: Remove Old Template Systems**
Delete files:
- `SmartTemplateSystem.ts`
- `NaturalLanguageTemplateResolver.ts`
- Complex template type definitions

#### **Step 6: Update Dependencies**
Update all references to use new `TemplateManager`.

---

## **Phase 18: Performance Optimization**

### **🎯 GOAL:** Implement lazy loading and memory optimization

### **CURRENT STATE:**
- All services loaded at startup
- No lazy loading
- Potential memory leaks

### **TARGET STATE:**
- Services loaded on-demand
- Memory-efficient patterns
- Optimized startup time

### **IMPLEMENTATION STEPS:**

#### **Step 1: Implement Lazy Service Loading**

**Create Service Factory:**
```typescript
// src/services/ServiceFactory.ts
export class ServiceFactory {
    private static instances = new Map<string, any>();

    static getOrCreate<T>(
        name: string, 
        factory: () => T
    ): T {
        if (!this.instances.has(name)) {
            this.instances.set(name, factory());
        }
        return this.instances.get(name);
    }

    static clear(): void {
        this.instances.clear();
    }
}
```

#### **Step 2: Lazy Load Heavy Services**

**AgentManager - Load on first agent spawn:**
```typescript
// In extension.ts - don't create immediately
let agentManager: AgentManager | undefined;

function getAgentManager(): AgentManager {
    if (!agentManager) {
        agentManager = new AgentManager(
            ServiceLocator.get('LoggingService'),
            ServiceLocator.get('ConfigurationService')
        );
    }
    return agentManager;
}
```

#### **Step 3: Implement Template Lazy Loading**

**Load templates only when needed:**
```typescript
export class TemplateManager {
    private loaded = false;
    private templates = new Map<string, AgentTemplate>();

    private async ensureLoaded(): Promise<void> {
        if (!this.loaded) {
            await this.loadTemplates();
            this.loaded = true;
        }
    }

    async getTemplate(id: string): Promise<AgentTemplate | undefined> {
        await this.ensureLoaded();
        return this.templates.get(id);
    }
}
```

#### **Step 4: Memory Management**

**Add proper disposal patterns:**
```typescript
export class AgentManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }

    private addDisposable(disposable: vscode.Disposable): void {
        this.disposables.push(disposable);
    }
}
```

#### **Step 5: Optimize Dashboard Loading**

**Load dashboard components on-demand:**
```typescript
// Only create dashboard when user opens it
vscode.commands.registerCommand('nofx.dashboard', async () => {
    const dashboard = ServiceFactory.getOrCreate('dashboard', 
        () => new MessageFlowDashboard()
    );
    dashboard.show();
});
```

---

## **Phase 19: Modern Architecture Patterns**

### **🎯 GOAL:** Simplify complex event patterns to direct function calls

### **CURRENT STATE:**
- Complex EventBus for simple operations
- Over-abstracted communication
- Unnecessary indirection

### **TARGET STATE:**
- Direct service communication
- EventBus only for decoupled events
- Clear communication patterns

### **IMPLEMENTATION STEPS:**

#### **Step 1: Identify Event Bus Usage**

**Audit EventBus usage:**
```bash
grep -r "eventBus\|publish\|subscribe" src/ --include="*.ts"
```

Categorize into:
- **Keep**: True decoupled events (UI updates, notifications)
- **Replace**: Service-to-service calls that should be direct

#### **Step 2: Replace Service Communication**

**Before (Over-abstracted):**
```typescript
// AgentManager publishing to TaskQueue via events
eventBus.publish('agent.task.completed', { agentId, taskId });

// TaskQueue subscribing to events
eventBus.subscribe('agent.task.completed', (data) => {
    this.handleTaskCompletion(data.agentId, data.taskId);
});
```

**After (Direct calls):**
```typescript
// Direct service communication
class AgentManager {
    constructor(private taskQueue: TaskQueue) {}

    private onTaskCompleted(agentId: string, taskId: string): void {
        this.taskQueue.handleTaskCompletion(agentId, taskId);
    }
}
```

#### **Step 3: Keep EventBus for UI Events**

**Appropriate EventBus usage:**
```typescript
// UI updates - legitimate decoupled events
eventBus.publish('ui.agent.status.changed', { agentId, status });

// Notifications
eventBus.publish('notification.show', { 
    type: 'info', 
    message: 'Agent spawned successfully' 
});
```

#### **Step 4: Simplify Event Types**

**Reduce event complexity:**
```typescript
// Before: 47 different event types
// After: ~10 essential UI/notification events

enum UIEvent {
    AGENT_STATUS_CHANGED = 'ui.agent.status.changed',
    TASK_PROGRESS_UPDATED = 'ui.task.progress.updated',
    NOTIFICATION_SHOW = 'notification.show',
    DASHBOARD_UPDATE = 'ui.dashboard.update'
}
```

#### **Step 5: Remove Event Infrastructure**

Delete unused event patterns:
- Complex event routing
- Event validation
- Event persistence
- Event replay mechanisms

---

## **Phase 20: Final Optimization**

### **🎯 GOAL:** Bundle optimization and dependency cleanup

### **CURRENT STATE:**
- Unused dependencies in package.json
- No bundle analysis
- Potential bloated output

### **TARGET STATE:**
- Minimal dependencies
- Optimized bundle size
- Tree-shaking enabled

### **IMPLEMENTATION STEPS:**

#### **Step 1: Dependency Audit**

**Analyze package.json dependencies:**
```bash
npm ls --depth=0
npx depcheck  # Find unused dependencies
```

**Remove unused dependencies:**
- Check if `ws` (WebSocket) is still needed after Phase 11
- Remove test-only dependencies from main deps
- Clean up development dependencies

#### **Step 2: Bundle Analysis**

**Add bundle analysis:**
```json
// package.json
{
    "scripts": {
        "analyze": "npx webpack-bundle-analyzer out/extension.js"
    }
}
```

#### **Step 3: Enable Tree Shaking**

**Update tsconfig.json:**
```json
{
    "compilerOptions": {
        "module": "ES2020",
        "moduleResolution": "node",
        "target": "ES2020"
    }
}
```

#### **Step 4: Optimize Imports**

**Use specific imports:**
```typescript
// Before
import * as vscode from 'vscode';

// After (where possible)
import { window, commands, ExtensionContext } from 'vscode';
```

#### **Step 5: Final Cleanup**

**Remove dead code:**
- Unused utility functions
- Commented code blocks  
- Development-only code paths
- Debug console.log statements

**Clean up files:**
```bash
# Remove empty directories
find src -type d -empty -delete

# Remove .js.map files from src (should only be in out/)
find src -name "*.js.map" -delete
```

---

## **IMPLEMENTATION PRIORITY:**

1. **Phase 13** (Container → ServiceLocator) - Foundation for everything else
2. **Phase 14** (Test Consolidation) - Improves development velocity  
3. **Phase 16** (Interface Simplification) - Reduces complexity
4. **Phase 17** (Template Consolidation) - Core functionality
5. **Phase 18** (Performance) - User experience
6. **Phase 19** (Architecture) - Long-term maintainability
7. **Phase 20** (Optimization) - Final polish

Each phase should be completed and tested before moving to the next.