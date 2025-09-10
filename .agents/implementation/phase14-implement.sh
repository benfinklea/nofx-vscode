#!/bin/bash

# 🚀 PHASE 14 MASTER IMPLEMENTATION ORCHESTRATOR
# Test Consolidation with Business Intelligence (151 → 30 files)

echo "🎸 STARTING PHASE 14 TEST CONSOLIDATION & BUSINESS INTELLIGENCE..."
echo "================================================================"

# Setup
IMPL_DIR=".agents/implementation"
REPORTS_DIR=".agents/shared/reports"
mkdir -p "$REPORTS_DIR"

# Track overall progress
TOTAL_STEPS=5
CURRENT_STEP=0
START_TIME=$(date +%s)

# Function to update progress
update_progress() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    echo ""
    echo "📊 Progress: [$CURRENT_STEP/$TOTAL_STEPS] $1"
    echo "⏱️  Elapsed: $(($(date +%s) - START_TIME))s"
    echo ""
}

# Function to check if step succeeded
check_step() {
    if [ $? -eq 0 ]; then
        echo "✅ $1 - SUCCESS"
        return 0
    else
        echo "❌ $1 - FAILED"
        echo "🛑 Aborting implementation..."
        exit 1
    fi
}

echo "🚀 Phase 14: Test Consolidation + Business Intelligence"
echo "Target: 151 → 30 test files with business-focused reporting"
echo ""

# Pre-flight checks
echo "🔍 Pre-flight checks..."
TEST_COUNT=$(find src/test -name "*.test.ts" 2>/dev/null | wc -l)
echo "📋 Found $TEST_COUNT test files to consolidate"

if [ "$TEST_COUNT" -lt 10 ]; then
    echo "❌ Not enough test files found for consolidation"
    exit 1
fi

echo "✅ Pre-flight checks passed"

# Step 1: Analyze Test Structure
update_progress "Analyzing current test structure"
echo "🚀 Executing: Test Analysis Agent"
chmod +x "$IMPL_DIR/phase14-analyze-tests.sh"
"$IMPL_DIR/phase14-analyze-tests.sh"
check_step "Test Structure Analysis"

# Step 2: Create Consolidated Test Suites
update_progress "Creating consolidated test suites"
echo "🚀 Executing: Test Consolidation Agent"
chmod +x "$IMPL_DIR/phase14-consolidate-tests.sh"
"$IMPL_DIR/phase14-consolidate-tests.sh"
check_step "Test Consolidation"

# Step 3: Add Business Intelligence Layer
update_progress "Adding business intelligence reporting"
echo "🚀 Executing: Business Intelligence Agent"
chmod +x "$IMPL_DIR/phase14-business-intelligence.sh"
"$IMPL_DIR/phase14-business-intelligence.sh"
check_step "Business Intelligence Layer"

# Step 4: Performance Optimization
update_progress "Optimizing test performance"
echo "🚀 Executing: Performance Optimization Agent"
chmod +x "$IMPL_DIR/phase14-optimize-performance.sh"
"$IMPL_DIR/phase14-optimize-performance.sh"
check_step "Performance Optimization"

# Step 5: Validation and Reporting
update_progress "Validation and final reporting"
echo "🚀 Executing: Validation Agent"
chmod +x "$IMPL_DIR/phase14-validate.sh"
"$IMPL_DIR/phase14-validate.sh"
check_step "Validation and Reporting"

# Final Summary
TOTAL_TIME=$(($(date +%s) - START_TIME))
echo ""
echo "🎉 PHASE 14 IMPLEMENTATION COMPLETE!"
echo "===================================="
echo "⏱️  Total time: ${TOTAL_TIME}s"
echo "📁 Implementation report: $REPORTS_DIR/phase14-implementation-report.md"
echo ""

# Show the implementation report
if [ -f "$REPORTS_DIR/phase14-implementation-report.md" ]; then
    echo "📊 IMPLEMENTATION SUMMARY:"
    echo "------------------------"
    cat "$REPORTS_DIR/phase14-implementation-report.md" | grep -E "✅|❌|⚠️|Test Reduction|Performance Gain"
    echo ""
fi

# Next steps
echo "🚀 NEXT STEPS:"
echo "1. Review the business intelligence dashboard"
echo "2. Run tests: npm run test"
echo "3. Check business confidence metrics"
echo "4. If successful, proceed to Phase 15"
echo ""
echo "🎸 Ready to rock Phase 15!"