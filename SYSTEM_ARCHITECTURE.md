# NofX System Architecture - READ THIS FIRST

⚠️ **MANDATORY FOR ALL CLAUDE CODE SESSIONS** ⚠️
**BEFORE making ANY changes, Claude MUST read this entire document to understand existing systems.**

## Core Principle: DO NOT RECREATE EXISTING SYSTEMS
If a system already exists, FIX it. Don't create a duplicate or replacement.

---

## 🏗️ EXISTING SYSTEMS INVENTORY

### 1. AGENT CREATION & MANAGEMENT
**✅ SYSTEM EXISTS: NofxAgentFactory** (`src/agents/NofxAgentFactory.ts`)
- **Purpose**: Unified agent creation system with 5 core types + specializations
- **Status**: COMPLETE - DO NOT REPLACE
- **Core Types**: frontend, backend, fullstack, testing, devops
- **Features**: Dynamic prompt generation, specializations, singleton pattern
- **Usage**: `NofxAgentFactory.getInstance().createAgent(type, specialization)`

**✅ SYSTEM EXISTS: AgentManager** (`src/agents/AgentManager.ts`)
- **Purpose**: Agent lifecycle management, persistence, restoration
- **Status**: ACTIVE - DO NOT REPLACE
- **Features**: Agent spawning, termination, state tracking, maxAgents limits
- **Integrates with**: NofxAgentFactory, AgentPersistence, WorktreeService

**✅ SYSTEM EXISTS: EnterpriseAgentManager** (`src/agents/EnterpriseAgentManager.ts`)
- **Purpose**: Enterprise version with enhanced features
- **Status**: ACTIVE - DO NOT REPLACE

**❌ DO NOT CREATE**: 
- AgentFactory (we have NofxAgentFactory)
- AgentCreator (we have NofxAgentFactory)
- AgentSpawner (AgentManager handles this)
- AgentBuilder (NofxAgentFactory handles this)

### 2. CONDUCTOR SYSTEM
**✅ SYSTEM EXISTS: Multiple Conductor Implementations**
- `SmartConductor.ts` - Main conductor with VP-level decision making
- `ConductorTerminal.ts` - Terminal-based conductor (PRIMARY)
- `IntelligentConductor.ts` - Enhanced capabilities conductor
- `SuperSmartConductor.ts` - VP-level architectural conductor
- **Status**: COMPLETE - DO NOT REPLACE

**❌ DO NOT CREATE**:
- ConductorManager (we have multiple conductor implementations)
- OrchestrationManager (we have orchestration system)

### 3. TASK MANAGEMENT
**✅ SYSTEM EXISTS: Comprehensive Task System**
- `TaskQueue.ts` - Core task queue with priorities
- `PriorityTaskQueue.ts` - Priority-based task management
- `TaskStateMachine.ts` - State transitions for tasks
- `TaskDependencyManager.ts` - Task dependencies
- `CapabilityMatcher.ts` - Agent-task matching
- `SimpleTaskManager.ts` - Simplified task management
- **Status**: COMPLETE - DO NOT REPLACE

**❌ DO NOT CREATE**:
- TaskManager (we have multiple task management systems)
- TaskScheduler (TaskQueue handles this)
- TaskAssigner (CapabilityMatcher handles this)

### 4. PERSISTENCE SYSTEM
**✅ SYSTEM EXISTS: AgentPersistence** (`src/persistence/AgentPersistence.ts`)
- **Purpose**: Save/restore agent state across sessions
- **Features**: Agent state, session history, checkpoints, archiving
- **Status**: COMPLETE - DO NOT REPLACE

**❌ DO NOT CREATE**:
- PersistenceManager (we have AgentPersistence)
- SessionManager (AgentPersistence handles sessions)

### 5. GIT WORKTREE SYSTEM
**✅ SYSTEM EXISTS: WorktreeManager** (`src/worktrees/WorktreeManager.ts`)
- **Purpose**: Git worktree creation/management for parallel agent work
- **Features**: Isolated workspaces, automatic cleanup, health monitoring
- **Status**: ACTIVE - DO NOT REPLACE

**✅ SYSTEM EXISTS: WorktreeService** (`src/services/WorktreeService.ts`)
- **Purpose**: Service layer for worktree operations
- **Status**: ACTIVE - DO NOT REPLACE

**❌ DO NOT CREATE**:
- GitManager (WorktreeManager handles git operations)
- WorkspaceManager (WorktreeService handles this)

### 6. CONFIGURATION SYSTEM
**✅ SYSTEM EXISTS: ConfigurationService** (`src/services/ConfigurationService.ts`)
- **Purpose**: Unified configuration management
- **Features**: Auto-detection, validation, defaults
- **Status**: ACTIVE - DO NOT REPLACE

**❌ DO NOT CREATE**:
- ConfigManager (we have ConfigurationService)
- SettingsManager (ConfigurationService handles this)

### 7. COMMUNICATION SYSTEM
**✅ SYSTEM EXISTS: WebSocket Orchestration**
- `OrchestrationServer.ts` - WebSocket server for agent communication
- `MessageProtocol.ts` - Standardized message types
- **Status**: ACTIVE - DO NOT REPLACE

**✅ SYSTEM EXISTS: EventBus** (`src/services/EventBus.ts`)
- **Purpose**: Event-driven communication
- **Status**: ACTIVE - DO NOT REPLACE

**❌ DO NOT CREATE**:
- MessageManager (MessageProtocol handles this)
- CommunicationService (we have WebSocket orchestration)

### 8. UI SYSTEMS
**✅ SYSTEM EXISTS: Tree View Providers**
- `AgentTreeProvider.ts` - Agent sidebar view
- `TaskTreeProvider.ts` - Task sidebar view
- `NofxDevTreeProvider.ts` - Development tree view
- **Status**: ACTIVE - DO NOT REPLACE

**✅ SYSTEM EXISTS: Dashboard System**
- `MessageFlowDashboard.ts` - Real-time message visualization
- **Status**: ACTIVE - DO NOT REPLACE

**❌ DO NOT CREATE**:
- UIManager (we have specific providers)
- DashboardManager (we have MessageFlowDashboard)

### 9. TERMINAL MANAGEMENT
**✅ SYSTEM EXISTS: TerminalManager** (`src/services/TerminalManager.ts`)
- **Purpose**: VS Code terminal creation and management
- **Features**: Claude CLI integration, prompt injection
- **Status**: ACTIVE - DO NOT REPLACE

**❌ DO NOT CREATE**:
- TerminalService (we have TerminalManager)
- CLIManager (TerminalManager handles CLI)

### 10. LOGGING & MONITORING
**✅ SYSTEM EXISTS: LoggingService** (`src/services/LoggingService.ts`)
- **Purpose**: Structured logging with levels
- **Status**: ACTIVE - DO NOT REPLACE

**✅ SYSTEM EXISTS: NotificationService** (`src/services/NotificationService.ts`)
- **Purpose**: VS Code notifications
- **Status**: ACTIVE - DO NOT REPLACE

**❌ DO NOT CREATE**:
- Logger (we have LoggingService)
- AlertManager (NotificationService handles this)

---

## 🚨 BEFORE YOU CODE CHECKLIST

**Every Claude session MUST:**

1. ✅ Read this entire SYSTEM_ARCHITECTURE.md file
2. ✅ Check if the system you want to create already exists
3. ✅ If it exists, ENHANCE it instead of replacing it
4. ✅ Only create NEW systems for genuinely new functionality
5. ✅ Update this file when adding truly new systems

**Questions to ask before coding:**
- Does this system already exist?
- Am I duplicating existing functionality?
- Can I enhance an existing system instead?
- Have I checked the existing codebase thoroughly?

---

## 📁 KEY FILE LOCATIONS

### Core Systems
- **Agent Creation**: `src/agents/NofxAgentFactory.ts`
- **Agent Management**: `src/agents/AgentManager.ts`
- **Task Management**: `src/tasks/` (multiple files)
- **Persistence**: `src/persistence/AgentPersistence.ts`
- **Configuration**: `src/services/ConfigurationService.ts`
- **Worktrees**: `src/worktrees/WorktreeManager.ts`

### Services
- **All Services**: `src/services/` directory
- **Service Interfaces**: `src/services/interfaces.ts`

### UI Components
- **Tree Views**: `src/views/` directory
- **Panels**: `src/panels/` directory
- **Dashboard**: `src/dashboard/` directory

### Commands
- **Agent Commands**: `src/commands/AgentCommands.ts`
- **Conductor Commands**: `src/commands/ConductorCommands.ts`
- **Utility Commands**: `src/commands/UtilityCommands.ts`

---

## 🔄 PLANNED SYSTEMS (Don't implement yet)

**These are planned but NOT implemented:**
- Multi-workspace support
- Cloud deployment support
- Agent-to-agent direct communication
- GraphQL API layer
- Custom agent template UI

**If working on these, coordinate with the existing architecture.**

---

## 🛠️ INTEGRATION PATTERNS

### How Systems Connect
```
Extension.ts
    ├── AgentManager (uses NofxAgentFactory)
    ├── ConfigurationService
    ├── WorktreeService (uses WorktreeManager)
    ├── TerminalManager
    ├── LoggingService
    └── NotificationService

AgentManager
    ├── NofxAgentFactory (agent creation)
    ├── AgentPersistence (save/restore)
    ├── WorktreeService (isolation)
    └── TaskQueue (task assignment)
```

### Service Dependencies
- **AgentManager** depends on: NofxAgentFactory, AgentPersistence, WorktreeService
- **WorktreeService** depends on: WorktreeManager, ConfigurationService
- **All Services** depend on: LoggingService, NotificationService

---

## 📝 MODIFICATION GUIDELINES

### When Enhancing Existing Systems
1. Read the existing code thoroughly
2. Understand the current patterns
3. Add features without breaking existing functionality
4. Update tests for your changes
5. Document your enhancements

### When Adding New Features to Existing Systems
1. Follow the existing code style
2. Use existing interfaces and patterns
3. Add new methods/properties instead of replacing
4. Maintain backward compatibility

### Red Flags (Stop and Think)
- "I need to create a new XxxManager/XxxService"
- "This existing system is wrong, I'll rewrite it"
- "I'll create a better version of..."
- "Let me build a new agent factory"

**Instead ask**: "How can I enhance the existing system?"

---

## 🎯 CURRENT SYSTEM STATUS

**✅ WORKING SYSTEMS:**
- Agent creation via NofxAgentFactory
- Agent management and persistence
- Git worktree isolation
- Task queue and assignment
- WebSocket orchestration
- VS Code UI integration

**🔧 RECENTLY FIXED:**
- Agent restoration limits (maxAgents)
- Automatic restoration popup removed
- Worktree warning messages suppressed

**⚠️ KNOWN ISSUES:**
- Some TypeScript compilation warnings
- Console.log statements need cleanup
- Test coverage could be improved

---

## 💡 ANTI-PATTERNS TO AVOID

**❌ Don't Do This:**
```typescript
// Creating duplicate systems
class NewAgentFactory {} // We have NofxAgentFactory!
class TaskManager {} // We have multiple task systems!
class AgentService {} // We have AgentManager!
```

**✅ Do This Instead:**
```typescript
// Enhance existing systems
const factory = NofxAgentFactory.getInstance();
factory.addNewSpecialization(type, config);

// Or extend existing classes
class EnhancedAgentManager extends AgentManager {
    // Add new functionality
}
```

---

**Remember: The goal is to build on what exists, not replace it.**
**This codebase has mature, working systems. Respect and enhance them.**