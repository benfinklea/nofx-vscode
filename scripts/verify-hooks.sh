#!/bin/bash

# Verify Git Hooks Health Check Script
# Performs quick validation of Git hooks installation and configuration

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="${PROJECT_ROOT}/.husky"

# Exit codes
EXIT_SUCCESS=0
EXIT_WARNING=1
EXIT_ERROR=2

# Track overall status
OVERALL_STATUS=$EXIT_SUCCESS
ISSUES_FOUND=()

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1" >&2
    OVERALL_STATUS=$EXIT_ERROR
    ISSUES_FOUND+=("ERROR: $1")
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
    if [ $OVERALL_STATUS -ne $EXIT_ERROR ]; then
        OVERALL_STATUS=$EXIT_WARNING
    fi
    ISSUES_FOUND+=("WARNING: $1")
}

# Check if Husky directory exists
check_husky_directory() {
    if [ -d "$HOOKS_DIR" ]; then
        log_success "Husky directory exists at $HOOKS_DIR"
        return 0
    else
        log_error "Husky directory not found at $HOOKS_DIR"
        return 1
    fi
}

# Check if Git is configured for hooks
check_git_config() {
    local hooks_path=$(git config core.hooksPath 2>/dev/null || echo "")
    
    if [ -n "$hooks_path" ]; then
        if [ "$hooks_path" = ".husky" ] || [ "$hooks_path" = "$HOOKS_DIR" ]; then
            log_success "Git hooks path correctly configured: $hooks_path"
        else
            log_warning "Git hooks path set to unexpected location: $hooks_path"
        fi
    else
        # Check if using default hooks
        local git_dir=$(git rev-parse --git-dir 2>/dev/null || echo "")
        if [ -n "$git_dir" ] && [ -d "$git_dir/hooks" ]; then
            log_info "Using default Git hooks directory"
        else
            log_warning "Git hooks path not configured"
        fi
    fi
}

# Check individual hook files
check_hook_file() {
    local hook_name=$1
    local hook_file="$HOOKS_DIR/$hook_name"
    
    if [ ! -f "$hook_file" ]; then
        log_error "$hook_name hook not found"
        return 1
    fi
    
    if [ ! -x "$hook_file" ]; then
        log_error "$hook_name hook exists but is not executable"
        return 1
    fi
    
    # Check if hook has content
    if [ ! -s "$hook_file" ]; then
        log_warning "$hook_name hook exists but is empty"
        return 1
    fi
    
    log_success "$hook_name hook is properly configured"
    return 0
}

# Check all expected hooks
check_all_hooks() {
    local expected_hooks=("pre-commit" "pre-push")
    local hooks_ok=true
    
    for hook in "${expected_hooks[@]}"; do
        if ! check_hook_file "$hook"; then
            hooks_ok=false
        fi
    done
    
    if [ "$hooks_ok" = true ]; then
        log_success "All expected hooks are properly configured"
    fi
}

# Check Husky installation in package.json
check_package_json() {
    local package_json="${PROJECT_ROOT}/package.json"
    
    if [ ! -f "$package_json" ]; then
        log_error "package.json not found"
        return 1
    fi
    
    # Check if Husky is in devDependencies
    local has_husky=$(node -e "
        const pkg = require('$package_json');
        const husky = pkg.devDependencies?.husky || pkg.dependencies?.husky;
        console.log(husky ? 'true' : 'false');
    " 2>/dev/null || echo "false")
    
    if [ "$has_husky" = "true" ]; then
        log_success "Husky is installed as a dependency"
    else
        log_error "Husky is not installed in package.json"
    fi
    
    # Check prepare script
    local prepare_script=$(node -e "
        const pkg = require('$package_json');
        console.log(pkg.scripts?.prepare || '');
    " 2>/dev/null || echo "")
    
    if [[ "$prepare_script" == *"husky"* ]]; then
        log_success "Prepare script is configured for Husky"
    else
        log_warning "Prepare script may not be properly configured for Husky"
    fi
}

# Try to fix common issues
attempt_fixes() {
    if [ ${#ISSUES_FOUND[@]} -eq 0 ]; then
        return 0
    fi
    
    echo ""
    log_info "Attempting to fix issues..."
    
    local fixed_count=0
    
    # Fix executable permissions
    for hook in "pre-commit" "pre-push"; do
        if [ -f "$HOOKS_DIR/$hook" ] && [ ! -x "$HOOKS_DIR/$hook" ]; then
            chmod +x "$HOOKS_DIR/$hook"
            if [ -x "$HOOKS_DIR/$hook" ]; then
                log_success "Fixed executable permission for $hook"
                ((fixed_count++))
            fi
        fi
    done
    
    # Fix Git hooks path
    if ! git config core.hooksPath | grep -q "husky" 2>/dev/null; then
        git config core.hooksPath .husky
        log_success "Set Git hooks path to .husky"
        ((fixed_count++))
    fi
    
    if [ $fixed_count -gt 0 ]; then
        echo ""
        log_success "Fixed $fixed_count issue(s)"
        echo "Please run verification again to confirm all issues are resolved"
    fi
}

# Print summary
print_summary() {
    echo ""
    echo "==============================================="
    
    case $OVERALL_STATUS in
        $EXIT_SUCCESS)
            log_success "Git hooks verification completed successfully!"
            echo "All hooks are properly configured and ready to use."
            ;;
        $EXIT_WARNING)
            log_warning "Git hooks verification completed with warnings"
            echo "Hooks may work but some issues were detected:"
            for issue in "${ISSUES_FOUND[@]}"; do
                echo "  • $issue"
            done
            ;;
        $EXIT_ERROR)
            log_error "Git hooks verification failed"
            echo "Critical issues were found:"
            for issue in "${ISSUES_FOUND[@]}"; do
                echo "  • $issue"
            done
            echo ""
            echo "To install/reinstall hooks, run:"
            echo "  npm run hooks:install"
            ;;
    esac
    
    echo "==============================================="
}

# Main verification flow
main() {
    echo "NofX VS Code Extension - Git Hooks Verification"
    echo "==============================================="
    echo ""
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    # Run checks
    check_husky_directory
    check_git_config
    check_all_hooks
    check_package_json
    
    # Print summary
    print_summary
    
    # Return appropriate exit code
    exit $OVERALL_STATUS
}

# Handle command line arguments
case "${1:-}" in
    --fix)
        # Run verification first
        check_husky_directory
        check_git_config
        check_all_hooks
        check_package_json
        
        # Attempt fixes
        attempt_fixes
        
        # Print summary
        print_summary
        
        exit $OVERALL_STATUS
        ;;
    --quiet|-q)
        # Quiet mode - only return exit code
        check_husky_directory > /dev/null 2>&1
        check_git_config > /dev/null 2>&1
        check_all_hooks > /dev/null 2>&1
        check_package_json > /dev/null 2>&1
        exit $OVERALL_STATUS
        ;;
    --help|-h)
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --fix      Attempt to fix common issues"
        echo "  --quiet    Quiet mode (only return exit code)"
        echo "  --help     Show this help message"
        echo ""
        echo "Exit codes:"
        echo "  0 - All hooks are properly configured"
        echo "  1 - Warnings found but hooks should work"
        echo "  2 - Critical errors found, hooks may not work"
        ;;
    *)
        main
        ;;
esac