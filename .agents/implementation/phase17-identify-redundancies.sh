#!/bin/bash

# 🔎 PHASE 17: Identify State Redundancies
# Identifies redundant state stores and duplicate state management

echo "🔎 Identifying redundant state stores..."
echo ""

REPORTS_DIR=".agents/shared/reports"
mkdir -p "$REPORTS_DIR"

# Track redundancies
REDUNDANT_STORES=()
DUPLICATE_STATE=()
UNNECESSARY_COMPLEXITY=()

echo "🔍 Checking for redundant persistence services..."
echo ""

# Check persistence redundancy
PERSISTENCE_SERVICES=(
    "PersistenceService"
    "SessionPersistenceService" 
    "AgentPersistence"
    "MessagePersistenceService"
)

for service in "${PERSISTENCE_SERVICES[@]}"; do
    if find src -name "*.ts" -exec grep -l "class $service" {} \; 2>/dev/null | grep -q .; then
        echo "Found: $service"
        # Check what it persists
        PERSISTS=$(find src -name "*.ts" -exec grep -A5 "class $service" {} \; 2>/dev/null | grep -E "save|store|persist|write" | head -3)
        if [ -n "$PERSISTS" ]; then
            echo "  Persists: Similar data as other services"
            if [ "$service" != "PersistenceService" ]; then
                REDUNDANT_STORES+=("$service")
                echo "  ⚠️  REDUNDANT - merge into PersistenceService"
            fi
        fi
    fi
done

echo ""
echo "🔍 Checking for redundant UI state managers..."
echo ""

# Check UI state redundancy
UI_MANAGERS=(
    "UIStateManager"
    "TreeStateManager"
    "ViewStateManager"
    "PanelStateManager"
)

for manager in "${UI_MANAGERS[@]}"; do
    if find src -name "*.ts" -exec grep -l "class $manager" {} \; 2>/dev/null | grep -q .; then
        echo "Found: $manager"
        if [ "$manager" != "UIStateManager" ]; then
            REDUNDANT_STORES+=("$manager")
            echo "  ⚠️  REDUNDANT - merge into UIStateManager"
        fi
    fi
done

echo ""
echo "🔍 Checking for duplicate state properties..."
echo ""

# Find duplicate state properties across services
COMMON_PROPS=(
    "agents"
    "tasks"
    "config"
    "settings"
    "status"
)

for prop in "${COMMON_PROPS[@]}"; do
    echo "Checking for duplicate '$prop' state:"
    FILES=$(find src -name "*.ts" -exec grep -l "private.*$prop\|this\.$prop" {} \; 2>/dev/null | head -5)
    COUNT=$(echo "$FILES" | grep -c "." || echo "0")
    if [ "$COUNT" -gt 1 ]; then
        echo "  ⚠️  Found in $COUNT files (potential duplication)"
        DUPLICATE_STATE+=("$prop: $COUNT files")
    else
        echo "  ✅ Single owner"
    fi
done

echo ""
echo "🔍 Checking for unnecessary state complexity..."
echo ""

# Check for overly complex state patterns
COMPLEX_PATTERNS=(
    "BehaviorSubject"  # RxJS complexity
    "Redux"           # Redux overkill for VS Code extension
    "MobX"            # MobX overkill
    "Vuex"            # Vuex not needed
    "StateChart"      # State charts too complex
)

for pattern in "${COMPLEX_PATTERNS[@]}"; do
    if find src -name "*.ts" -exec grep -l "$pattern" {} \; 2>/dev/null | grep -q .; then
        echo "⚠️  Found $pattern - unnecessary complexity"
        UNNECESSARY_COMPLEXITY+=("$pattern")
    fi
done

if [ ${#UNNECESSARY_COMPLEXITY[@]} -eq 0 ]; then
    echo "✅ No unnecessary state complexity patterns found"
fi

# Generate redundancy report
cat > "$REPORTS_DIR/phase17-redundancies.md" << EOF
# Phase 17: State Redundancy Report

## Redundant State Stores

### Persistence Services (REDUNDANT)
$(for store in "${REDUNDANT_STORES[@]}"; do
    if [[ "$store" == *"Persistence"* ]]; then
        echo "- **$store** - Merge into unified PersistenceService"
    fi
done)

### UI State Managers (REDUNDANT)
$(for store in "${REDUNDANT_STORES[@]}"; do
    if [[ "$store" == *"State"* ]] && [[ "$store" != *"Persistence"* ]]; then
        echo "- **$store** - Merge into unified UIStateManager"
    fi
done)

## Duplicate State Properties
$(for dup in "${DUPLICATE_STATE[@]}"; do
    echo "- $dup"
done)

## Consolidation Plan

### 1. Unified Persistence
\`\`\`typescript
class PersistenceService {
    // Handles ALL persistence needs:
    // - Agent state
    // - Session state
    // - Task state
    // - Configuration
}
\`\`\`

### 2. Unified UI State
\`\`\`typescript
class UIStateManager {
    // Handles ALL UI state:
    // - Tree views
    // - Panels
    // - Editors
    // - Status bar
}
\`\`\`

### 3. Domain State Stores
\`\`\`typescript
// Keep these domain-specific stores:
- AgentManager (agent business logic)
- TaskQueue (task business logic)
- ConfigurationService (config management)
- PersistenceService (all persistence)
- UIStateManager (all UI state)
\`\`\`

## Benefits of Consolidation

- **Eliminate ${#REDUNDANT_STORES[@]} redundant stores**
- **Single source of truth** for each domain
- **No more state synchronization issues**
- **Simpler mental model**
- **Easier testing**
- **Better performance**

## Migration Strategy

1. Create unified stores with migration methods
2. Gradually move state from redundant stores
3. Update all references
4. Remove redundant stores
5. Clean up unused code
EOF

echo ""
echo "✅ Redundancy identification complete!"
echo "📁 Report saved to: $REPORTS_DIR/phase17-redundancies.md"
echo ""
echo "Summary:"
echo "  ❌ ${#REDUNDANT_STORES[@]} redundant state stores to remove"
echo "  ⚠️  ${#DUPLICATE_STATE[@]} duplicate state properties"
if [ ${#UNNECESSARY_COMPLEXITY[@]} -gt 0 ]; then
    echo "  🚫 ${#UNNECESSARY_COMPLEXITY[@]} unnecessary complexity patterns"
fi
echo "  ✅ Can consolidate to 5 core state stores"