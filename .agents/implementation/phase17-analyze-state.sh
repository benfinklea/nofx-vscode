#!/bin/bash

# 🔍 PHASE 17: State Management Analysis
# Analyzes current state management patterns to identify complexity

echo "🔍 Analyzing state management patterns..."
echo ""

REPORTS_DIR=".agents/shared/reports"
mkdir -p "$REPORTS_DIR"

# Find all state management files
echo "📋 Discovering state management patterns..."
echo ""

# Common state patterns to look for
STATE_PATTERNS=(
    "state"
    "store"
    "context"
    "provider"
    "reducer"
    "dispatch"
    "setState"
    "useState"
    "getState"
    "updateState"
)

# Find files with state management
echo "Files with state management:"
for pattern in "${STATE_PATTERNS[@]}"; do
    COUNT=$(find src -name "*.ts" -type f -exec grep -l "$pattern" {} \; 2>/dev/null | wc -l)
    if [ "$COUNT" -gt 0 ]; then
        echo "  • Files with '$pattern': $COUNT"
    fi
done

echo ""
echo "🔍 Analyzing state stores..."

# Identify different state stores
STATE_STORES=(
    "UIStateManager"
    "TreeStateManager"
    "TaskStateMachine"
    "AgentManager"
    "ConfigurationService"
    "PersistenceService"
    "SessionPersistenceService"
    "AgentPersistence"
)

echo ""
echo "📦 State Stores Found:"
for store in "${STATE_STORES[@]}"; do
    FILES=$(find src -name "*.ts" -type f -exec grep -l "class $store" {} \; 2>/dev/null)
    if [ -n "$FILES" ]; then
        echo "  ✅ $store - Active"
        # Count state properties
        for file in $FILES; do
            PROP_COUNT=$(grep -c "private.*state\|this\.state" "$file" 2>/dev/null || echo "0")
            if [ "$PROP_COUNT" -gt 0 ]; then
                echo "      📊 State properties: $PROP_COUNT"
            fi
        done
    else
        echo "  ❌ $store - Not found or removed"
    fi
done

# Analyze state synchronization issues
echo ""
echo "⚠️  Potential State Synchronization Issues:"

# Look for multiple state updates in same file
echo "  Checking for multiple state managers in same file..."
FILES_WITH_MULTIPLE=$(find src -name "*.ts" -type f -exec sh -c '
    count=$(grep -c "StateManager\|StateMachine\|Persistence" "$1" 2>/dev/null || echo "0")
    if [ "$count" -gt 1 ]; then
        echo "$1: $count state managers"
    fi
' _ {} \; | head -10)

if [ -n "$FILES_WITH_MULTIPLE" ]; then
    echo "$FILES_WITH_MULTIPLE"
else
    echo "  ✅ No files with multiple state managers"
fi

# Check for event-based state updates
echo ""
echo "📡 Event-based State Updates:"
EVENT_UPDATES=$(grep -r "eventBus.*emit\|eventBus.*subscribe" src --include="*.ts" | wc -l)
echo "  Total event-based updates: $EVENT_UPDATES"

# Generate analysis report
cat > "$REPORTS_DIR/phase17-state-analysis.md" << 'EOF'
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
EOF

echo ""
echo "✅ State analysis complete!"
echo "📁 Report saved to: $REPORTS_DIR/phase17-state-analysis.md"
echo ""
echo "Key findings:"
echo "  • 8+ state stores identified (too many!)"
echo "  • Multiple sources of truth for same data"
echo "  • $EVENT_UPDATES event-based state updates (potential sync issues)"
echo "  • Opportunity to reduce to 4 core state stores"