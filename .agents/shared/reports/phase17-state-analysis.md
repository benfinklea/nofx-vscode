# Phase 17: State Management Analysis

## Current State Architecture

### State Stores Identified
1. **UIStateManager** - UI component state
2. **TreeStateManager** - Tree view state (possibly redundant with UIStateManager)
3. **TaskStateMachine** - Task workflow state
4. **AgentManager** - Agent state
5. **ConfigurationService** - Configuration state
6. **PersistenceService** - Persistent state
7. **SessionPersistenceService** - Session state (redundant with PersistenceService)
8. **AgentPersistence** - Agent-specific persistence (redundant)

### Problems Identified

#### 1. Multiple Sources of Truth
- UI state split between UIStateManager and TreeStateManager
- Persistence split between 3 different services
- Agent state in both AgentManager and AgentPersistence

#### 2. State Synchronization Issues
- Event-based updates can miss subscribers
- No central state coordination
- Potential race conditions between stores

#### 3. Complexity Issues
- Too many state managers (8+ identified)
- Unclear ownership of state
- Difficult to track state flow

## Simplification Opportunities

### 1. Consolidate UI State
- Merge TreeStateManager into UIStateManager
- Single UI state store for all views

### 2. Unify Persistence
- Single PersistenceService for all persistence needs
- Remove SessionPersistenceService
- Remove AgentPersistence (use PersistenceService)

### 3. Centralize State Management
- Create single AppStateStore
- Implement state slices for different domains
- Use single event bus for all state changes

### 4. Simplify State Updates
- Replace complex event chains with direct updates
- Implement computed properties for derived state
- Use immutable state updates

## Expected Benefits

- **50% fewer state stores** (8 → 4)
- **Single source of truth** for each domain
- **Eliminated race conditions**
- **Easier debugging** with centralized state
- **Better performance** with fewer updates
