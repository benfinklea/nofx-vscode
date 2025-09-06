#!/bin/bash

# Git Hooks Installation Script for NofX VS Code Extension
# This script installs and configures Git hooks using Husky

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
PACKAGE_JSON="${PROJECT_ROOT}/package.json"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check if npm is available
check_npm() {
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install Node.js and npm first."
        exit 1
    fi
    log_success "npm is available"
}

# Check if Git is available
check_git() {
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed. Please install Git first."
        exit 1
    fi
    
    # Check if we're in a Git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not in a Git repository. Please initialize Git first."
        exit 1
    fi
    
    log_success "Git is available and repository is initialized"
}

# Install Husky
install_husky() {
    log_info "Installing Husky v9..."
    
    # Check if Husky is already installed
    if [ -d "$HOOKS_DIR" ]; then
        log_warning "Husky is already installed. Skipping installation..."
        return 0
    fi
    
    # Install Husky as a dev dependency if not present
    if ! npm list husky --depth=0 &> /dev/null; then
        log_info "Installing Husky package..."
        npm install --save-dev husky@^9.0.0
    else
        log_success "Husky package is already installed"
    fi
    
    # Initialize Husky (v9 approach)
    log_info "Initializing Husky v9..."
    npx husky init
    
    log_success "Husky v9 installed successfully"
}

# Create pre-commit hook
create_pre_commit_hook() {
    log_info "Creating pre-commit hook..."
    
    local hook_file="$HOOKS_DIR/pre-commit"
    
    # Check if hook already exists and ensure it's executable
    if [ -f "$hook_file" ]; then
        log_warning "Pre-commit hook already exists. Ensuring it's executable..."
        chmod +x "$hook_file"
        log_success "Pre-commit hook is ready"
        return 0
    fi
    
    # Hook doesn't exist - this shouldn't happen if Husky init worked
    log_error "Pre-commit hook not found at: $hook_file"
    log_error "Please ensure Husky is properly initialized"
    exit 1
}

# Create pre-push hook
create_pre_push_hook() {
    log_info "Creating pre-push hook..."
    
    local hook_file="$HOOKS_DIR/pre-push"
    
    # Check if hook already exists and ensure it's executable
    if [ -f "$hook_file" ]; then
        log_warning "Pre-push hook already exists. Ensuring it's executable..."
        chmod +x "$hook_file"
        log_success "Pre-push hook is ready"
        return 0
    fi
    
    # Hook doesn't exist - this shouldn't happen if Husky init worked
    log_error "Pre-push hook not found at: $hook_file"
    log_error "Please ensure Husky is properly initialized"
    exit 1
}

# Update package.json with prepare script
update_package_json() {
    log_info "Updating package.json for Husky v9..."
    
    # Check if prepare script already exists
    local has_prepare=$(node -e "
        const pkg = require('$PACKAGE_JSON');
        console.log(pkg.scripts?.prepare ? 'true' : 'false');
    ")
    
    if [ "$has_prepare" == "true" ]; then
        # Update prepare script for Husky v9
        local current_prepare=$(node -e "
            const pkg = require('$PACKAGE_JSON');
            console.log(pkg.scripts?.prepare || '');
        ")
        
        if [ "$current_prepare" == "husky" ]; then
            log_success "Prepare script already configured for Husky v9"
        else
            node -e "
                const fs = require('fs');
                const pkg = require('$PACKAGE_JSON');
                pkg.scripts = pkg.scripts || {};
                pkg.scripts.prepare = 'husky';
                fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\\n');
            "
            log_success "Updated prepare script for Husky v9"
        fi
    else
        # Add prepare script for Husky v9
        node -e "
            const fs = require('fs');
            const pkg = require('$PACKAGE_JSON');
            pkg.scripts = pkg.scripts || {};
            pkg.scripts.prepare = 'husky';
            fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\\n');
        "
        log_success "Added prepare script for Husky v9 to package.json"
    fi
}

# Test hooks
test_hooks() {
    log_info "Testing Git hooks..."
    
    # Test if hooks are executable
    if [ -x "$HOOKS_DIR/pre-commit" ]; then
        log_success "Pre-commit hook is executable"
    else
        log_error "Pre-commit hook is not executable"
        return 1
    fi
    
    if [ -x "$HOOKS_DIR/pre-push" ]; then
        log_success "Pre-push hook is executable"
    else
        log_error "Pre-push hook is not executable"
        return 1
    fi
    
    # Test if hooks are registered with Git
    local git_hooks_dir="$(git rev-parse --git-dir)/hooks"
    if [ -d "$git_hooks_dir" ]; then
        log_success "Git hooks are properly configured"
    else
        log_warning "Git hooks directory not found"
    fi
    
    return 0
}

# Create documentation
create_documentation() {
    log_info "Creating hooks documentation..."
    
    cat > "$HOOKS_DIR/README.md" << 'EOF'
# Git Hooks for NofX VS Code Extension

This directory contains Git hooks managed by Husky to ensure code quality and prevent broken builds.

## Installed Hooks

### Pre-commit Hook
Runs before each commit to validate:
- TypeScript compilation succeeds
- Build output is valid
- Command registration tests pass (if available)
- No console.log statements in source code

### Pre-push Hook
Runs before pushing to remote to validate:
- Full build succeeds
- All tests pass
- Code coverage meets thresholds
- VSIX package can be created
- Linting passes (if configured)
- Final build validation passes

## Usage

### Normal Operation
Hooks run automatically when you commit or push. No action required.

### Bypassing Hooks (Emergency Only)
If you need to bypass hooks in an emergency:

```bash
# Bypass pre-commit hook
git commit --no-verify -m "Emergency fix"

# Bypass pre-push hook  
git push --no-verify
```

⚠️ **Warning**: Only bypass hooks in genuine emergencies. Bypassing validation can lead to broken builds.

### Troubleshooting

#### Hook Not Running
1. Ensure Husky is installed: `npm install`
2. Reinstall hooks: `npx husky install`
3. Check hook permissions: `ls -la .husky/`

#### Hook Failing
1. Read the error message carefully
2. Fix the reported issue
3. Try the operation again

#### Slow Hook Execution
Pre-push hooks intentionally run comprehensive validation and may take 1-2 minutes.
For faster feedback, rely on pre-commit hooks and run tests manually.

### Uninstalling Hooks
To temporarily disable hooks:
```bash
git config --unset core.hooksPath
```

To permanently remove hooks:
```bash
rm -rf .husky
npm uninstall husky
```

## Contributing
When modifying hooks:
1. Edit the hook file in `.husky/`
2. Test the hook manually
3. Commit your changes
4. Document any new validations

For questions or issues, please contact the development team.
EOF
    
    log_success "Documentation created at $HOOKS_DIR/README.md"
}

# Main installation flow
main() {
    echo "NofX VS Code Extension - Git Hooks Installation"
    echo "==============================================="
    echo ""
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    # Run checks
    check_npm
    check_git
    
    # Install and configure
    install_husky
    create_pre_commit_hook
    create_pre_push_hook
    update_package_json
    test_hooks
    create_documentation
    
    echo ""
    echo "==============================================="
    log_success "Git hooks installation completed successfully!"
    echo ""
    echo "Hooks are now active for:"
    echo "  • Pre-commit: Quick validation before commits"
    echo "  • Pre-push: Comprehensive validation before pushing"
    echo ""
    echo "To bypass hooks in emergencies, use --no-verify flag"
    echo "See .husky/README.md for more information"
}

# Handle command line arguments
case "${1:-}" in
    uninstall)
        log_info "Uninstalling Git hooks..."
        rm -rf "$HOOKS_DIR"
        git config --unset core.hooksPath 2>/dev/null || true
        log_success "Git hooks uninstalled"
        ;;
    test)
        test_hooks
        ;;
    help|--help|-h)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  install    Install Git hooks (default)"
        echo "  uninstall  Remove Git hooks"
        echo "  test       Test if hooks are working"
        echo "  help       Show this help message"
        ;;
    install|"")
        main
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac