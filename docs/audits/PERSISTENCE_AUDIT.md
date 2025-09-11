# PERSISTENCE_AUDIT.md

## Executive Summary

The NofX extension currently has **three separate persistence services** with significant overlap, inefficiency, and architectural issues. Consolidation is urgently needed to reduce complexity, improve performance, and eliminate duplicate storage responsibilities.

**Current Storage Usage**: 780KB in `.nofx/` directory with 45+ session files averaging 592-736 lines each.

## 1. Current Persistence Services Analysis

### 1.1 AgentPersistence (`src/persistence/AgentPersistence.ts`)
- **Purpose**: Agent state management and session history
- **Storage Location**: `.nofx/agents.json` + `.nofx/sessions/{agentId}_session.md`
- **Responsibilities**:
  - Agent metadata (id, name, type, status, tasks completed)
  - Claude session history as markdown files
  - Conversation checkpoints as JSON
  - Session archiving and cleanup
- **File Size**: 305 lines of code

**Key Methods**:
- `saveAgentState()` - Saves agent metadata to agents.json
- `saveAgentSession()` - Appends to markdown session files
- `saveConversationCheckpoint()` - JSON checkpoint storage
- `loadAgentState()` / `loadAgentSession()` - Load persisted data

### 1.2 SessionPersistenceService (`src/services/SessionPersistenceService.ts`)
- **Purpose**: Advanced session lifecycle management with timeouts and restoration
- **Storage Location**: `.nofx/sessions/{sessionId}.json` + `.nofx/archives/{sessionId}.json`
- **Responsibilities**:
  - Session creation with 5-hour timeouts
  - Conversation history with structured messages
  - Task tracking with duration and status
  - Session archiving and restoration
  - Git branch tracking
- **File Size**: 541 lines of code

**Key Data Structures**:
- `AgentSession` - Complex session object with conversation history
- `ConversationMessage` - Structured message format
- `SessionTask` - Task lifecycle tracking
- `SessionSummary` - UI display format

### 1.3 MessagePersistenceService (`src/services/MessagePersistenceService.ts`)
- **Purpose**: Orchestration message persistence with high-performance requirements
- **Storage Location**: `.nofx/orchestration/messages.jsonl` + rolled files
- **Responsibilities**:
  - WebSocket message logging in JSONL format
  - File rolling based on size limits
  - Message filtering and pagination
  - Lock-based concurrent access
- **File Size**: 547 lines of code

**Advanced Features**:
- File locking mechanism with stale lock detection
- Automatic file rolling when size exceeds limits
- In-memory cache for recent messages
- Batch filtering and pagination

### 1.4 InMemoryMessagePersistenceService (`src/services/InMemoryMessagePersistenceService.ts`)
- **Purpose**: Fallback when no workspace available
- **Storage Location**: Memory only
- **Responsibilities**: Same interface as MessagePersistenceService but in-memory
- **File Size**: 228 lines of code

## 2. Overlapping Storage Responsibilities

### 2.1 Agent State Duplication
```
AgentPersistence.agents.json:
{
  "agents": [{
    "id": "agent-123",
    "name": "Frontend Specialist", 
    "status": "active",
    "tasksCompleted": 5
  }]
}

SessionPersistenceService session files:
{
  "agentId": "agent-123",
  "agentName": "Frontend Specialist",
  "status": "active", 
  "tasksCompleted": 5
}
```

**ISSUE**: Agent basic info stored in both places with potential inconsistency.

### 2.2 Conversation History Redundancy
- **AgentPersistence**: Stores as markdown in `{agentId}_session.md`
- **SessionPersistenceService**: Stores as structured JSON in `conversationHistory[]`

**ISSUE**: Same conversation data in two different formats, consuming 2x storage.

### 2.3 Task Tracking Overlap
- **AgentPersistence**: Simple `tasksCompleted` counter
- **SessionPersistenceService**: Detailed task objects with duration, status, files modified

**ISSUE**: Two different granularities of task tracking causing confusion.

## 3. Duplicate Data Storage Patterns

### 3.1 Session Files Analysis
Current `.nofx/sessions/` contains 45+ files:
- Average file size: 592-736 lines (18-24KB each)
- Total storage: ~780KB
- Growth rate: ~1 file per agent spawn

**Example Duplicate Data**:
```json
// Stored in every session file
"template": {
  "id": "frontend-specialist",
  "name": "Frontend Specialist", 
  "capabilities": { /* 100+ lines of template data */ }
}
```

**WASTE**: Template data repeated in every session instead of referencing template ID.

### 3.2 Message Storage Inefficiency
- **MessagePersistenceService**: Designed for high-throughput orchestration messages
- **Current Reality**: No active message persistence files found (no .jsonl files)
- **Code Impact**: 775 lines of complex persistence code with locking, rolling, caching - unused!

## 4. Actual vs Theoretical Persistence Needs

### 4.1 What's Actually Being Used
✅ **AgentPersistence**:
- `agents.json` - Lightweight agent state (5 lines, mostly empty)
- Session markdown files - Used for Claude context restoration
- Archive functionality - Working as designed

✅ **SessionPersistenceService**:
- Individual session JSON files - Detailed tracking
- Session timeout monitoring - Active feature
- Archive/restore workflow - UI integration

❌ **MessagePersistenceService**:
- No .jsonl files found in filesystem
- Complex infrastructure for orchestration messages not being persisted
- High-performance features (locking, rolling, caching) unnecessary

### 4.2 Theoretical Over-Engineering
- **File Locking**: Implemented for concurrent access that doesn't occur
- **Message Rolling**: For high-volume data that doesn't exist
- **In-Memory Caching**: For frequently accessed messages that aren't persisted
- **Complex Filtering**: Advanced query capabilities not used by UI

## 5. Performance Impact Assessment

### 5.1 Current Performance Issues

**Memory Overhead**:
- 3 separate persistence services loaded simultaneously
- Duplicate data structures for same information
- Unused caching mechanisms consuming memory

**I/O Inefficiency**:
- Multiple writes to different files for same agent action
- Redundant file format conversions (JSON ↔ Markdown)
- Unnecessary file locking overhead

**Code Complexity**:
- 1,621 lines of persistence code (305 + 541 + 547 + 228)
- 3 different APIs for similar operations
- Multiple error handling paths for same failures

### 5.2 Performance Metrics
- **Startup Time**: 3x service initialization overhead
- **Agent Creation**: 2-3 file writes per agent spawn
- **Session Restore**: Multiple file reads + format conversions
- **Memory Usage**: ~780KB disk + duplicate in-memory structures

## 6. Consolidation Plan

### Phase 1: Immediate Cleanup
1. **Remove Unused MessagePersistenceService**
   - No actual message persistence occurring
   - 775 lines of dead code with complex infrastructure
   - Keep interface for future orchestration needs

2. **Merge AgentPersistence into SessionPersistenceService**
   - SessionPersistenceService already has superior session management
   - Migrate markdown session storage to structured JSON
   - Eliminate agents.json redundancy

### Phase 2: Unified Architecture
3. **Single Persistence Service Design**:
   ```typescript
   interface UnifiedPersistenceService {
     // Agent lifecycle
     createAgentSession(agent: Agent): Promise<Session>
     archiveSession(sessionId: string): Promise<void>
     
     // Data access
     getActiveSessions(): Promise<Session[]>
     getSessionHistory(sessionId: string): Promise<Message[]>
     
     // Cleanup
     cleanup(): Promise<void>
   }
   ```

4. **Optimized Storage Structure**:
   ```
   .nofx/
   ├── sessions/
   │   ├── active/           # Current sessions
   │   └── archived/         # Completed sessions
   ├── templates/            # Referenced, not duplicated
   └── config.json          # Global settings
   ```

### Phase 3: Performance Optimization
5. **Template Reference System**
   - Store template ID only, not full template data
   - Reduce session file sizes by 70-80%

6. **Lazy Loading**
   - Load conversation history on demand
   - Keep lightweight session metadata in memory

## 7. Implementation Recommendations

### 7.1 Migration Strategy
1. Create new `UnifiedPersistenceService` 
2. Implement data migration utility
3. Update all consumers to use unified API
4. Remove old services in separate PR

### 7.2 Breaking Changes
- Session file format will change (one-time migration)
- Some advanced MessagePersistence features removed
- AgentPersistence markdown format deprecated

### 7.3 Benefits After Consolidation
- **50% reduction** in persistence code (1,621 → ~800 lines)
- **70% reduction** in storage per session (template deduplication)  
- **Unified API** for all persistence operations
- **Simplified debugging** with single persistence path
- **Better performance** with optimized data structures

## 8. Immediate Actions Required

1. **Audit Usage**: Confirm MessagePersistenceService truly unused
2. **Create Migration Plan**: Preserve existing session data
3. **API Design**: Define unified persistence interface
4. **Timeline**: Plan for breaking changes in next major version

**PRIORITY**: High - Technical debt significantly impacting maintainability and performance.