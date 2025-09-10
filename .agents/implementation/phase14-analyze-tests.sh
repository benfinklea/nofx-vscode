#!/bin/bash

# 🚀 PHASE 14: Test Analysis Agent
# Analyzes current test structure and identifies consolidation opportunities

echo "🔍 ANALYZING test structure and business impact..."

# Create analysis report
REPORTS_DIR=".agents/shared/reports"
mkdir -p "$REPORTS_DIR"

echo "📋 Discovering test files..."
find src/test -name "*.test.ts" > /tmp/test_files.txt
TOTAL_FILES=$(wc -l < /tmp/test_files.txt)

echo "📊 Test Analysis Results:"
echo "========================"
echo "Total test files: $TOTAL_FILES"

# Categorize tests by business function
echo ""
echo "🏗️ Test Categories:"

# Agent-related tests
AGENT_TESTS=$(find src/test -name "*Agent*.test.ts" -o -name "*agent*.test.ts" | wc -l)
echo "🤖 Agent Coordination: $AGENT_TESTS files"

# Service tests  
SERVICE_TESTS=$(find src/test -name "*Service*.test.ts" -o -name "*service*.test.ts" | wc -l)
echo "⚙️  Platform Services: $SERVICE_TESTS files"

# Command tests
COMMAND_TESTS=$(find src/test -name "*Command*.test.ts" -o -name "*command*.test.ts" | wc -l)
echo "📋 User Commands: $COMMAND_TESTS files"

# Business logic tests
BUSINESS_TESTS=$(find src/test -name "*Task*.test.ts" -o -name "*Business*.test.ts" -o -name "*Workflow*.test.ts" | wc -l)
echo "💼 Business Logic: $BUSINESS_TESTS files"

# Integration tests
INTEGRATION_TESTS=$(find src/test -name "*integration*.test.ts" -o -name "*Integration*.test.ts" | wc -l)
echo "🔗 Integration: $INTEGRATION_TESTS files"

# UI/View tests
UI_TESTS=$(find src/test -name "*View*.test.ts" -o -name "*UI*.test.ts" -o -name "*Panel*.test.ts" | wc -l)
echo "🎨 User Interface: $UI_TESTS files"

# Performance impact analysis
echo ""
echo "⚡ Performance Analysis:"
if [ -f "jest.config.js" ]; then
    echo "📊 Current test runner: Jest"
    # Estimate current test time (rough calculation)
    AVG_TEST_TIME=$((TOTAL_FILES * 2))
    echo "⏱️  Estimated current test time: ${AVG_TEST_TIME}s"
    
    # Calculate potential consolidation impact
    TARGET_FILES=30
    POTENTIAL_TIME=$((TARGET_FILES * 2))
    SAVINGS=$((AVG_TEST_TIME - POTENTIAL_TIME))
    echo "🎯 After consolidation: ${POTENTIAL_TIME}s (${SAVINGS}s faster)"
fi

# Identify duplicate test patterns
echo ""
echo "🔍 Duplicate Pattern Analysis:"

# Look for common test patterns that might be duplicated
COMMON_PATTERNS=("should create" "should initialize" "should handle error" "should return" "should throw")

for pattern in "${COMMON_PATTERNS[@]}"; do
    COUNT=$(find src/test -name "*.test.ts" -exec grep -l "$pattern" {} \; | wc -l)
    if [ "$COUNT" -gt 3 ]; then
        echo "🔄 '$pattern' pattern found in $COUNT files (potential for consolidation)"
    fi
done

# Business impact assessment
echo ""
echo "💼 Business Impact Assessment:"
echo "================================"

# Critical business functions that need testing
CRITICAL_FUNCTIONS=("agent coordination" "task management" "user workflow" "error handling" "performance")

for func in "${CRITICAL_FUNCTIONS[@]}"; do
    COVERAGE=$(find src/test -name "*.test.ts" -exec grep -l -i "$func" {} \; | wc -l)
    if [ "$COVERAGE" -gt 0 ]; then
        echo "✅ $func: $COVERAGE test files"
    else
        echo "⚠️  $func: No dedicated tests found"
    fi
done

# Generate consolidation plan
echo ""
echo "📋 Consolidation Plan:"
echo "====================="

cat > "$REPORTS_DIR/phase14-consolidation-plan.md" << EOF
# Phase 14 Test Consolidation Plan

## Current State
- **Total test files**: $TOTAL_FILES
- **Target after consolidation**: 30 files (80% reduction)
- **Estimated time savings**: ${SAVINGS:-60}s per test run

## Consolidation Strategy

### 1. Agent Coordination Suite (3 files)
Consolidate $AGENT_TESTS agent-related tests into:
- agent-coordination.test.ts
- agent-lifecycle.test.ts  
- agent-communication.test.ts

### 2. Platform Services Suite (5 files)
Consolidate $SERVICE_TESTS service tests into:
- core-services.test.ts
- configuration-services.test.ts
- monitoring-services.test.ts
- persistence-services.test.ts
- orchestration-services.test.ts

### 3. Business Logic Suite (6 files)
Consolidate $BUSINESS_TESTS business tests into:
- task-management.test.ts
- workflow-execution.test.ts
- business-rules.test.ts
- user-scenarios.test.ts
- error-recovery.test.ts
- performance-benchmarks.test.ts

### 4. User Interface Suite (4 files)
Consolidate $UI_TESTS UI tests into:
- command-interface.test.ts
- dashboard-components.test.ts
- user-interactions.test.ts
- accessibility.test.ts

### 5. Integration Suite (6 files)
Consolidate $INTEGRATION_TESTS integration tests into:
- end-to-end-workflows.test.ts
- external-integrations.test.ts
- cross-component.test.ts
- data-flow.test.ts
- error-propagation.test.ts
- performance-integration.test.ts

### 6. Business Confidence Suite (6 files)
New business-focused test suites:
- entrepreneur-workflows.test.ts
- platform-reliability.test.ts
- user-experience.test.ts
- business-metrics.test.ts
- confidence-indicators.test.ts
- success-validation.test.ts

## Business Intelligence Features
- Real-time confidence dashboard
- Business impact reporting
- Performance trend tracking
- User experience metrics
- Failure impact analysis
EOF

echo "✅ Consolidation plan saved to $REPORTS_DIR/phase14-consolidation-plan.md"
echo "🎯 Ready for test consolidation phase"