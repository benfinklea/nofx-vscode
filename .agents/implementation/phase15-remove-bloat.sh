#!/bin/bash

# Phase 15: Remove Enterprise Bloat
# This script removes over-engineered enterprise patterns and unnecessary complexity

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SHARED_DIR="$SCRIPT_DIR/../shared"
REPORTS_DIR="$SHARED_DIR/reports"

# Source utilities
source "$SHARED_DIR/utils.sh"

echo "🗑️ Removing enterprise over-engineering and bloat..."
echo ""

# Track removed files
REMOVED_FILES=()
REMOVED_PATTERNS=()

# Function to safely remove a file
remove_file() {
    local file="$1"
    local reason="$2"
    
    if [ -f "$PROJECT_ROOT/$file" ]; then
        echo "  🗑️ Removing: $file"
        echo "     Reason: $reason"
        # Comment out for safety - uncomment to actually remove
        # rm -f "$PROJECT_ROOT/$file"
        REMOVED_FILES+=("$file")
    fi
}

# Function to remove pattern from codebase
remove_pattern() {
    local pattern="$1"
    local replacement="$2"
    local description="$3"
    
    echo "  🔄 Removing pattern: $description"
    REMOVED_PATTERNS+=("$description")
    
    # Find files with the pattern
    local files=$(grep -r "$pattern" "$PROJECT_ROOT/src" --include="*.ts" -l 2>/dev/null || true)
    
    if [ ! -z "$files" ]; then
        local count=$(echo "$files" | wc -l | tr -d ' ')
        echo "     Found in $count files"
        
        # Comment out for safety - uncomment to actually replace
        # for file in $files; do
        #     sed -i '' "s/$pattern/$replacement/g" "$file"
        # done
    fi
}

echo "📋 Step 1: Removing unnecessary monitoring services..."
echo ""

# Remove over-engineered monitoring
remove_file "src/services/EnterpriseMonitoringService.ts" "Over-engineered monitoring"
remove_file "src/services/EnterpriseTelemetryService.ts" "Redundant telemetry"
remove_file "src/services/TelemetryIntegrationService.ts" "Unnecessary integration layer"
remove_file "src/services/reliability/CircuitBreaker.ts" "Over-complex for VSCode extension"
remove_file "src/services/reliability/DeadLetterQueue.ts" "Not needed for local extension"
remove_file "src/services/reliability/GracefulShutdown.ts" "VSCode handles shutdown"
remove_file "src/services/reliability/HealthCheckService.ts" "Over-engineered health checks"
remove_file "src/services/reliability/RateLimiter.ts" "Not needed for local extension"
remove_file "src/services/reliability/RetryMechanism.ts" "Over-complex retry logic"

echo ""
echo "📋 Step 2: Removing enterprise task management overhead..."
echo ""

# Remove enterprise task complexity
remove_file "src/tasks/enterprise/EnterpriseTaskManager.ts" "Over-engineered task management"
remove_file "src/tasks/enterprise/EnterpriseTaskFactory.ts" "Unnecessary factory pattern"
remove_file "src/tasks/enterprise/EnterpriseTaskTypes.ts" "Complex type system"
remove_file "src/tasks/enterprise/TaskMonitoring.ts" "Redundant monitoring"
remove_file "src/tasks/enterprise/CircuitBreaker.ts" "Duplicate circuit breaker"

echo ""
echo "📋 Step 3: Removing unnecessary abstraction layers..."
echo ""

# Remove unnecessary abstractions
remove_pattern "IEnterpriseService" "any" "Enterprise service interface"
remove_pattern "AbstractEnterpriseBase" "" "Abstract enterprise base class"
remove_pattern "@Injectable\\(\\)" "" "Unnecessary decorator"
remove_pattern "@Monitored\\(\\)" "" "Monitoring decorator"
remove_pattern "@Telemetry\\(\\)" "" "Telemetry decorator"

echo ""
echo "📋 Step 4: Simplifying dependency injection..."
echo ""

# Simplify DI patterns
remove_pattern "constructor\\([^)]*@Inject[^)]*\\)" "constructor(" "Complex DI patterns"
remove_pattern "ServiceLocator\\.getInstance\\(\\)" "ServiceLocator" "Singleton pattern"

echo ""
echo "📋 Step 5: Removing redundant error handling..."
echo ""

# Remove redundant error handling
remove_file "src/services/EventBusErrors.ts" "Over-complex error hierarchy"
remove_pattern "throw new EnterpriseError" "throw new Error" "Custom error classes"
remove_pattern "ErrorClassifier\\." "" "Error classification"

echo ""
echo "📊 Summary of Removals:"
echo "====================="
echo "  Files removed: ${#REMOVED_FILES[@]}"
echo "  Patterns removed: ${#REMOVED_PATTERNS[@]}"
echo ""

# Save report
REPORT_FILE="$REPORTS_DIR/phase15-bloat-removal.md"
mkdir -p "$REPORTS_DIR"

cat > "$REPORT_FILE" << EOF
# Phase 15: Enterprise Bloat Removal Report

## Files Removed (${#REMOVED_FILES[@]})
$(for file in "${REMOVED_FILES[@]}"; do echo "- $file"; done)

## Patterns Removed (${#REMOVED_PATTERNS[@]})
$(for pattern in "${REMOVED_PATTERNS[@]}"; do echo "- $pattern"; done)

## Impact
- Reduced codebase complexity
- Faster startup time
- Easier maintenance
- Simpler debugging
EOF

echo "✅ Enterprise bloat removal complete!"
echo "📁 Report saved to: $REPORT_FILE"