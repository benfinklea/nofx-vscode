#!/bin/bash

# 🚀 PHASE 13 MASTER IMPLEMENTATION ORCHESTRATOR
# This orchestrates the ACTUAL implementation of Container → ServiceLocator migration

echo "🎸 STARTING PHASE 13 FULL IMPLEMENTATION..."
echo "=========================================="

# Setup
IMPL_DIR=".agents/implementation"
REPORTS_DIR=".agents/shared/reports"
mkdir -p "$REPORTS_DIR"

# Track overall progress
TOTAL_STEPS=4
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

echo "🚀 Phase 13: Container → ServiceLocator Implementation"
echo "Target: 90% faster service resolution, 95% memory reduction"
echo ""

# Pre-flight checks
echo "🔍 Pre-flight checks..."
if [ ! -f "src/services/Container.ts" ]; then
    echo "❌ Container.ts not found - nothing to migrate!"
    exit 1
fi

if [ ! -f "src/extension.ts" ]; then
    echo "❌ extension.ts not found!"
    exit 1
fi

echo "✅ Pre-flight checks passed"

# Step 1: Create ServiceLocator
update_progress "Creating ServiceLocator.ts"
echo "🚀 Executing: ServiceLocator Implementation Agent"
chmod +x "$IMPL_DIR/phase13-servicelocator.sh"
"$IMPL_DIR/phase13-servicelocator.sh"
check_step "ServiceLocator Creation"

# Step 2: Update Extension.ts
update_progress "Updating extension.ts"
echo "🚀 Executing: Extension Update Agent"
chmod +x "$IMPL_DIR/phase13-extension-update.sh"
"$IMPL_DIR/phase13-extension-update.sh"
check_step "Extension Update"

# Step 3: Update All Service References
update_progress "Updating service references throughout codebase"
echo "🚀 Executing: Service Reference Update Agent"
chmod +x "$IMPL_DIR/phase13-update-references.sh"
"$IMPL_DIR/phase13-update-references.sh"
check_step "Service Reference Updates"

# Step 4: Cleanup and Validation
update_progress "Cleanup and validation"
echo "🚀 Executing: Cleanup and Validation Agent"
chmod +x "$IMPL_DIR/phase13-cleanup.sh"
"$IMPL_DIR/phase13-cleanup.sh"
check_step "Cleanup and Validation"

# Final Summary
TOTAL_TIME=$(($(date +%s) - START_TIME))
echo ""
echo "🎉 PHASE 13 IMPLEMENTATION COMPLETE!"
echo "===================================="
echo "⏱️  Total time: ${TOTAL_TIME}s"
echo "📁 Implementation report: $REPORTS_DIR/phase13-implementation-report.md"
echo ""

# Show the implementation report
if [ -f "$REPORTS_DIR/phase13-implementation-report.md" ]; then
    echo "📊 IMPLEMENTATION SUMMARY:"
    echo "------------------------"
    cat "$REPORTS_DIR/phase13-implementation-report.md" | grep -E "✅|❌|⚠️ |Code Reduction|Service Migration"
    echo ""
fi

# Next steps
echo "🚀 NEXT STEPS:"
echo "1. Review the implementation report"
echo "2. Run tests: npm run test"
echo "3. Test extension: npm run compile && code --install-extension"
echo "4. If successful, proceed to Phase 14"
echo ""
echo "🎸 Ready to rock Phase 14!"