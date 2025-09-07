#!/bin/bash

# Build Validation Script for NofX VS Code Extension
# This script performs comprehensive validation of the build output
# to ensure the extension is properly compiled and ready for packaging

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${PROJECT_ROOT}/out"
SRC_DIR="${PROJECT_ROOT}/src"
PACKAGE_JSON="${PROJECT_ROOT}/package.json"
MIN_FILE_SIZE=1024  # 1KB minimum for main extension file
VERBOSE=${VERBOSE:-false}
QUIET=${QUIET:-false}

# Counters for reporting
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# Logging functions
log_info() {
    if [ "$QUIET" != "true" ]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    if [ "$QUIET" != "true" ]; then
        echo -e "${GREEN}[✓]${NC} $1"
    fi
    ((PASSED_CHECKS++)) || true
}

log_error() {
    echo -e "${RED}[✗]${NC} $1" >&2
    ((FAILED_CHECKS++)) || true
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
    ((WARNINGS++)) || true
}

log_verbose() {
    if [ "$VERBOSE" == "true" ] && [ "$QUIET" != "true" ]; then
        echo -e "    $1"
    fi
}

# Check if a file exists and has reasonable size
check_file() {
    local file="$1"
    local min_size="${2:-0}"
    local description="$3"
    
    ((TOTAL_CHECKS++))
    
    if [ ! -f "$file" ]; then
        log_error "$description does not exist: $file"
        return 1
    fi
    
    if [ "$min_size" -gt 0 ]; then
        local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
        if [ "$size" -lt "$min_size" ]; then
            log_error "$description exists but is too small ($size bytes): $file"
            return 1
        fi
        log_verbose "File size: $size bytes"
    fi
    
    log_success "$description exists and is valid"
    return 0
}

# Check TypeScript compilation output
validate_typescript_compilation() {
    log_info "Validating TypeScript compilation..."
    
    # Initialize counters
    local js_count=0
    local ts_count=0
    
    # Check main entry point
    check_file "$OUT_DIR/extension.js" $MIN_FILE_SIZE "Main extension entry point"
    
    # Check if out directory structure matches src directory
    log_info "Checking output directory structure..."
    ((TOTAL_CHECKS++))
    
    local src_structure=$(cd "$SRC_DIR" && find . -type d | sort)
    local out_structure=$(cd "$OUT_DIR" && find . -type d 2>/dev/null | sort)
    
    if [ -z "$out_structure" ]; then
        log_error "Output directory is empty or missing"
    else
        log_success "Output directory structure exists"
        
        # Count JavaScript files
        js_count=$(find "$OUT_DIR" -name "*.js" -type f | wc -l)
        ts_count=$(find "$SRC_DIR" -name "*.ts" -type f | wc -l)
        
        log_verbose "Found $js_count JavaScript files (from $ts_count TypeScript files)"
        
        if [ "$js_count" -eq 0 ]; then
            log_error "No JavaScript files found in output directory"
        elif [ "$js_count" -lt "$ts_count" ]; then
            log_warning "Fewer JavaScript files ($js_count) than TypeScript files ($ts_count)"
        fi
    fi
    
    # Check for TypeScript files in output (should not exist)
    ((TOTAL_CHECKS++))
    local ts_in_out=$(find "$OUT_DIR" -name "*.ts" -type f 2>/dev/null | wc -l)
    if [ "$ts_in_out" -gt 0 ]; then
        log_error "Found TypeScript files in output directory (should only contain JavaScript)"
    else
        log_success "No TypeScript files in output directory"
    fi
    
    # Check for source maps if configured
    local map_count=$(find "$OUT_DIR" -name "*.js.map" -type f 2>/dev/null | wc -l)
    
    # Check if sourceMap is enabled in tsconfig.build.json
    local source_map_enabled=$(node -e "
        const fs = require('fs');
        const path = require('path');
        const tsconfigPath = path.join('$PROJECT_ROOT', 'tsconfig.build.json');
        try {
            const content = fs.readFileSync(tsconfigPath, 'utf8');
            // Remove comments for simple JSON parsing
            const jsonStr = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            const config = JSON.parse(jsonStr);
            console.log(config.compilerOptions?.sourceMap === true ? 'true' : 'false');
        } catch (error) {
            console.log('false');
        }
    ")
    
    ((TOTAL_CHECKS++))
    if [ "$source_map_enabled" == "true" ]; then
        if [ "$map_count" -eq 0 ]; then
            log_error "Source maps are enabled in tsconfig.build.json but none were generated"
        elif [ "$js_count" -gt 0 ] && [ "$map_count" -ne "$js_count" ]; then
            log_warning "Source map count ($map_count) doesn't match JavaScript file count ($js_count)"
        else
            log_success "All JavaScript files have corresponding source maps ($map_count)"
        fi
    else
        if [ "$map_count" -gt 0 ]; then
            log_verbose "Found $map_count source map files (sourceMap not explicitly enabled)"
        else
            log_verbose "No source maps generated (sourceMap not enabled in tsconfig.build.json)"
        fi
    fi
}

# Validate package.json configuration
validate_package_json() {
    log_info "Validating package.json configuration..."
    
    ((TOTAL_CHECKS++))
    if [ ! -f "$PACKAGE_JSON" ]; then
        log_error "package.json not found"
        return 1
    fi
    
    # Check main entry point
    ((TOTAL_CHECKS++))
    local main_entry=$(node -e "console.log(require('$PACKAGE_JSON').main || '')")
    if [ -z "$main_entry" ]; then
        log_error "No main entry point defined in package.json"
    else
        local full_path="${PROJECT_ROOT}/${main_entry#./}"
        if [ -f "$full_path" ]; then
            log_success "Main entry point exists: $main_entry"
        else
            log_error "Main entry point does not exist: $main_entry"
        fi
    fi
    
    # Count and validate commands
    ((TOTAL_CHECKS++))
    local command_count=$(node -e "
        const pkg = require('$PACKAGE_JSON');
        const commands = pkg.contributes?.commands || [];
        console.log(commands.length);
    ")
    
    if [ "$command_count" -eq 0 ]; then
        log_error "No commands found in package.json"
    else
        log_success "Found $command_count commands defined in package.json"
        
        # Optionally validate that activation events reference existing command IDs
        local invalid_events=$(node -e "
            const pkg = require('$PACKAGE_JSON');
            const commands = (pkg.contributes?.commands || []).map(c => c.command);
            const events = pkg.activationEvents || [];
            const commandEvents = events.filter(e => e.startsWith('onCommand:'));
            const invalid = commandEvents.filter(e => {
                const cmd = e.replace('onCommand:', '');
                return !commands.includes(cmd);
            });
            if (invalid.length > 0) {
                console.log(invalid.join(', '));
            }
        ")
        
        if [ -n "$invalid_events" ]; then
            log_warning "Activation events reference non-existent commands: $invalid_events"
        fi
    fi
    
    # Validate activation events
    ((TOTAL_CHECKS++))
    local activation_events=$(node -e "
        const pkg = require('$PACKAGE_JSON');
        const events = pkg.activationEvents || [];
        console.log(events.length);
    ")
    
    if [ "$activation_events" -eq 0 ]; then
        log_warning "No activation events defined"
    else
        log_success "Found $activation_events activation events"
    fi
}

# Validate extension manifest
validate_extension_manifest() {
    log_info "Validating extension manifest..."
    
    # Check for required files
    check_file "$PROJECT_ROOT/README.md" 0 "README.md"
    check_file "$PROJECT_ROOT/package.json" 0 "package.json"
    
    # Validate version format
    ((TOTAL_CHECKS++))
    local version=$(node -e "console.log(require('$PACKAGE_JSON').version || '')")
    if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_success "Version follows semantic versioning: $version"
    else
        log_warning "Version may not follow semantic versioning: $version"
    fi
    
    # Check for required VS Code engine
    ((TOTAL_CHECKS++))
    local vscode_engine=$(node -e "console.log(require('$PACKAGE_JSON').engines?.vscode || '')")
    if [ -z "$vscode_engine" ]; then
        log_error "No VS Code engine version specified"
    else
        log_success "VS Code engine specified: $vscode_engine"
    fi
}

# Runtime validation - attempt to load the extension
validate_runtime() {
    log_info "Validating runtime loading..."
    
    ((TOTAL_CHECKS++))
    
    # Try to require the main extension file
    # Handle the case where vscode module is not available
    local load_result=$(node -e "
        try {
            const ext = require('$OUT_DIR/extension.js');
            if (typeof ext.activate !== 'function') {
                console.error('activate function not found');
                process.exit(1);
            }
            if (typeof ext.deactivate !== 'function') {
                console.error('deactivate function not found');
                process.exit(1);
            }
            console.log('success');
        } catch (error) {
            // Special handling for vscode module not found (expected outside VS Code)
            if (error.message.includes('Cannot find module') && error.message.includes('vscode')) {
                console.log('vscode-module-missing');
            } else {
                console.error('Error loading extension:', error.message);
                process.exit(1);
            }
        }
    " 2>&1) || true
    
    if [[ "$load_result" == "success" ]]; then
        log_success "Extension can be loaded and exports required functions"
    elif [[ "$load_result" == *"vscode-module-missing"* ]]; then
        log_warning "Cannot verify runtime loading (vscode module not available outside VS Code)"
    else
        log_error "Failed to load extension: $load_result"
    fi
}

# Check for common issues
check_common_issues() {
    log_info "Checking for common issues..."
    
    # Check for console.log statements in production code
    ((TOTAL_CHECKS++))
    local console_count=$(grep -r "console\\.log" "$OUT_DIR" --include="*.js" 2>/dev/null | wc -l)
    if [ "$console_count" -gt 0 ]; then
        log_warning "Found $console_count console.log statements in compiled code"
    else
        log_success "No console.log statements in compiled code"
    fi
    
    # Check for TODO/FIXME comments
    ((TOTAL_CHECKS++))
    local todo_count=$(grep -r "TODO\|FIXME" "$OUT_DIR" --include="*.js" 2>/dev/null | wc -l)
    if [ "$todo_count" -gt 0 ]; then
        log_warning "Found $todo_count TODO/FIXME comments in compiled code"
    else
        log_success "No TODO/FIXME comments in compiled code"
    fi
}

# Generate validation report
generate_report() {
    local status="SUCCESS"
    local exit_code=0
    
    if [ "$FAILED_CHECKS" -gt 0 ]; then
        status="FAILED"
        exit_code=1
    elif [ "$WARNINGS" -gt 0 ]; then
        status="SUCCESS WITH WARNINGS"
    fi
    
    if [ "$QUIET" != "true" ]; then
        echo ""
        echo "========================================="
        echo "       BUILD VALIDATION REPORT"
        echo "========================================="
        echo "Status: $status"
        echo "Total Checks: $TOTAL_CHECKS"
        echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
        if [ "$FAILED_CHECKS" -gt 0 ]; then
            echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
        else
            echo "Failed: 0"
        fi
        if [ "$WARNINGS" -gt 0 ]; then
            echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
        else
            echo "Warnings: 0"
        fi
        echo "========================================="
        
        if [ "$exit_code" -eq 0 ]; then
            echo -e "${GREEN}✓ Build validation successful!${NC}"
        else
            echo -e "${RED}✗ Build validation failed!${NC}"
            echo "Please fix the errors above before proceeding."
        fi
    fi
    
    return $exit_code
}

# Main validation flow
main() {
    local start_time=$(date +%s)
    
    if [ "$QUIET" != "true" ]; then
        echo "NofX VS Code Extension - Build Validation"
        echo "========================================="
    fi
    
    # Check if output directory exists
    if [ ! -d "$OUT_DIR" ]; then
        log_error "Output directory does not exist. Please run 'npm run compile' first."
        exit 1
    fi
    
    # Run validation steps
    validate_typescript_compilation
    validate_package_json
    validate_extension_manifest
    validate_runtime
    check_common_issues
    
    # Calculate execution time
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [ "$VERBOSE" == "true" ]; then
        echo ""
        log_info "Validation completed in ${duration} seconds"
    fi
    
    # Generate and return report
    generate_report
    return $?
}

# Handle command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -q|--quiet)
            QUIET=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -v, --verbose  Show detailed output"
            echo "  -q, --quiet    Suppress output (exit code only)"
            echo "  -h, --help     Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use -h for help"
            exit 1
            ;;
    esac
done

# Run main validation
main