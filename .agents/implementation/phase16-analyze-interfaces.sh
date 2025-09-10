#!/bin/bash

# 🔍 PHASE 16: Interface Analysis
# Analyzes TypeScript interfaces for complexity and simplification opportunities

echo "🔍 Analyzing TypeScript interfaces for complexity..."
echo ""

REPORTS_DIR=".agents/shared/reports"
mkdir -p "$REPORTS_DIR"

# Find all interface files
echo "📋 Discovering TypeScript interfaces..."
find src -name "*.ts" -type f | xargs grep -l "^export interface" > /tmp/interface_files.txt
TOTAL_INTERFACES=$(wc -l < /tmp/interface_files.txt)

echo "Found $TOTAL_INTERFACES files with interfaces"
echo ""

# Analyze interface complexity
echo "📊 Interface Complexity Analysis:"
echo "================================="

COMPLEX_INTERFACES=()
SIMPLE_INTERFACES=()
OVERLY_COMPLEX=()

# Key interfaces to analyze
KEY_INTERFACES=(
    "ILoggingService"
    "IEventBus"
    "IAgentManager"
    "ITaskQueue"
    "IConfigurationService"
    "INotificationService"
    "ITerminalManager"
    "IOrchestrationServer"
    "IDashboard"
    "IWorkspaceService"
)

echo "🎯 Analyzing key service interfaces:"
echo ""

for interface_name in "${KEY_INTERFACES[@]}"; do
    # Find files containing this interface
    FILES=$(grep -l "interface $interface_name" src/**/*.ts 2>/dev/null || true)
    
    if [ -n "$FILES" ]; then
        for file in $FILES; do
            # Count methods in interface
            METHOD_COUNT=$(grep -c "^[[:space:]]*[a-zA-Z].*(.*)" "$file" 2>/dev/null || echo "0")
            
            # Count optional methods (with ?)
            OPTIONAL_COUNT=$(grep -c "^[[:space:]]*[a-zA-Z].*?(.*)" "$file" 2>/dev/null || echo "0")
            
            # Count complex signatures (multiple parameters)
            COMPLEX_SIGS=$(grep -c "(.*,.*,.*,)" "$file" 2>/dev/null || echo "0")
            
            if [ "$METHOD_COUNT" -gt 10 ]; then
                echo "❌ $interface_name: OVERLY COMPLEX ($METHOD_COUNT methods)"
                OVERLY_COMPLEX+=("$interface_name:$METHOD_COUNT")
            elif [ "$METHOD_COUNT" -gt 5 ]; then
                echo "⚠️  $interface_name: Complex ($METHOD_COUNT methods, $OPTIONAL_COUNT optional)"
                COMPLEX_INTERFACES+=("$interface_name:$METHOD_COUNT")
            else
                echo "✅ $interface_name: Simple ($METHOD_COUNT methods)"
                SIMPLE_INTERFACES+=("$interface_name:$METHOD_COUNT")
            fi
        done
    else
        echo "⚠️  $interface_name: Not found (may need creation)"
    fi
done

echo ""
echo "📊 Complexity Summary:"
echo "====================="
echo "🔴 Overly Complex (>10 methods): ${#OVERLY_COMPLEX[@]} interfaces"
echo "🟡 Complex (5-10 methods): ${#COMPLEX_INTERFACES[@]} interfaces"
echo "🟢 Simple (<5 methods): ${#SIMPLE_INTERFACES[@]} interfaces"

# Identify simplification opportunities
echo ""
echo "💡 Simplification Opportunities:"
echo "================================"

# Pattern 1: Interfaces with too many responsibilities
echo ""
echo "1️⃣ Split by Responsibility:"
for interface in "${OVERLY_COMPLEX[@]}"; do
    name="${interface%%:*}"
    count="${interface##*:}"
    echo "   • $name ($count methods) → Split into 2-3 focused interfaces"
done

# Pattern 2: Optional methods that could be separate
echo ""
echo "2️⃣ Extract Optional Methods:"
echo "   • Move optional methods to extension interfaces"
echo "   • Use composition over large interfaces"

# Pattern 3: Complex method signatures
echo ""
echo "3️⃣ Simplify Method Signatures:"
echo "   • Replace multiple parameters with option objects"
echo "   • Use builder patterns for complex configurations"

# Generate analysis report
cat > "$REPORTS_DIR/phase16-interface-analysis.md" << EOF
# Phase 16: Interface Complexity Analysis

## Current State
- **Total interface files**: $TOTAL_INTERFACES
- **Overly complex**: ${#OVERLY_COMPLEX[@]} interfaces
- **Complex**: ${#COMPLEX_INTERFACES[@]} interfaces  
- **Simple**: ${#SIMPLE_INTERFACES[@]} interfaces

## Interfaces Requiring Simplification

### Critical (>10 methods)
$(for i in "${OVERLY_COMPLEX[@]}"; do echo "- ${i%%:*}: ${i##*:} methods"; done)

### Warning (5-10 methods)
$(for i in "${COMPLEX_INTERFACES[@]}"; do echo "- ${i%%:*}: ${i##*:} methods"; done)

### Good (<5 methods)
$(for i in "${SIMPLE_INTERFACES[@]}"; do echo "- ${i%%:*}: ${i##*:} methods"; done)

## Simplification Strategy

### 1. Interface Segregation
Split large interfaces into focused, single-responsibility interfaces:
- ILoggingService → ILogger + ILogConfiguration + ILogQuery
- IEventBus → IEventEmitter + IEventSubscriber + IEventStore
- IAgentManager → IAgentLifecycle + IAgentQuery + IAgentCoordination

### 2. Method Consolidation
Combine related methods into single operations:
- Multiple getters → Single query method with options
- Multiple setters → Single update method with partial objects
- Multiple event handlers → Single handler with event type

### 3. Parameter Simplification
Replace complex signatures with option objects:
\`\`\`typescript
// Before
method(a: string, b: number, c?: boolean, d?: string, e?: any): void

// After  
method(options: MethodOptions): void
\`\`\`

### 4. Remove Unused Methods
Delete methods that aren't called anywhere in the codebase

## Business Impact
- **Easier to understand**: Simpler interfaces = faster onboarding
- **Easier to implement**: Less methods = quicker development
- **Easier to test**: Focused interfaces = better test coverage
- **Easier to maintain**: Clear responsibilities = less bugs

## Next Steps
1. Create simplified interface definitions
2. Update implementations to match
3. Migrate existing code to use new interfaces
4. Remove old complex interfaces
EOF

echo ""
echo "✅ Interface analysis complete!"
echo "📁 Report saved to: $REPORTS_DIR/phase16-interface-analysis.md"
echo ""
echo "Key findings:"
echo "  • ${#OVERLY_COMPLEX[@]} interfaces need major simplification"
echo "  • ${#COMPLEX_INTERFACES[@]} interfaces need minor simplification"
echo "  • Focus on splitting responsibilities and simplifying signatures"