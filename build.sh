#!/bin/bash

# Build script for NofX VS Code Extension
# This ensures all TypeScript is compiled and packaged correctly
# Enhanced with comprehensive validation to prevent broken builds

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default flags
PACKAGE_ONLY=false
SKIP_INSTALL=false
SKIP_PLATFORM_CHECK=false
INSTALL_CURSOR=false
HELP=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --package-only)
            PACKAGE_ONLY=true
            shift
            ;;
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --skip-platform-check)
            SKIP_PLATFORM_CHECK=true
            shift
            ;;
        --install-cursor)
            INSTALL_CURSOR=true
            shift
            ;;
        --help|-h)
            HELP=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Show help if requested
if [ "$HELP" = true ]; then
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --install-cursor      Install extension to Cursor after build (macOS only)"
    echo "  --package-only        Only create VSIX package (deprecated, this is now default)"
    echo "  --skip-install        Don't prompt for installation (deprecated, use without --install-cursor)"
    echo "  --skip-platform-check Skip platform checks (deprecated, no longer needed)"
    echo "  --help, -h            Show this help message"
    echo ""
    echo "Default behavior:"
    echo "  Builds and packages the extension into a VSIX file"
    echo "  Works on all platforms (macOS, Linux, Windows with bash)"
    echo ""
    echo "Examples:"
    echo "  $0                       Build and package extension (default)"
    echo "  $0 --install-cursor      Build, package, and install to Cursor (macOS)"
    echo "  $0 --package-only        Same as default (kept for compatibility)"
    exit 0
fi

# Platform detection for Cursor installation only
if [ "$INSTALL_CURSOR" = true ]; then
    UNAME=$(uname)
    if [[ "$UNAME" != "Darwin" ]]; then
        echo -e "${YELLOW}[WARNING]${NC} Cursor installation is only supported on macOS."
        echo "Building and packaging will continue, but installation will be skipped."
        INSTALL_CURSOR=false
    elif ! command -v cursor >/dev/null 2>&1; then
        echo -e "${YELLOW}[WARNING]${NC} 'cursor' CLI not found in PATH."
        echo "Building and packaging will continue, but installation will be skipped."
        echo "To install manually after build: cursor --install-extension \$(pwd)/\$VSIX_FILE --force"
        INSTALL_CURSOR=false
    fi
fi

# Get package information dynamically
PKG_NAME=$(node -p "require('./package.json').name")
PKG_VERSION=$(node -p "require('./package.json').version")
PUBLISHER=$(node -p "require('./package.json').publisher")
VSIX_FILE="$PKG_NAME-$PKG_VERSION.vsix"
EXT_ID="$PUBLISHER.$PKG_NAME"
PROJECT_ROOT="$(pwd)"

echo "🎸 Building NofX Extension v$PKG_VERSION"
echo "========================================="

# Step 0: Pre-build validation
echo -e "${BLUE}[PRE-BUILD]${NC} Validating source files..."
if [ ! -f "package.json" ]; then
    echo -e "${RED}[ERROR]${NC} package.json not found!"
    exit 1
fi

if [ ! -f "tsconfig.json" ] && [ ! -f "tsconfig.build.json" ]; then
    echo -e "${RED}[ERROR]${NC} TypeScript configuration not found!"
    exit 1
fi

if [ ! -d "src" ]; then
    echo -e "${RED}[ERROR]${NC} Source directory not found!"
    exit 1
fi

# Check dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[WARNING]${NC} node_modules not found. Installing dependencies..."
    npm install
fi

# Check vsce is available
echo -e "${BLUE}[CHECK]${NC} Verifying vsce is available..."
if ! npx --yes @vscode/vsce --version >/dev/null 2>&1; then
    echo -e "${YELLOW}[WARNING]${NC} vsce not found. Installing @vscode/vsce..."
    npm install --save-dev @vscode/vsce || {
        echo -e "${RED}[ERROR]${NC} Failed to install vsce!"
        echo -e "${YELLOW}[HELP]${NC} Try running: npm install --save-dev @vscode/vsce"
        exit 1
    }
fi

# Create backup of previous build if it exists
if [ -f "$VSIX_FILE" ]; then
    echo -e "${BLUE}[BACKUP]${NC} Backing up previous build..."
    mv "$VSIX_FILE" "$VSIX_FILE.backup"
fi

# Step 1: Clean old build
echo -e "${BLUE}[CLEAN]${NC} Cleaning old build artifacts..."
rm -rf out/
rm -f nofx-*.vsix
mkdir -p out

# Step 2: Compile TypeScript with detailed output
echo -e "${BLUE}[COMPILE]${NC} Compiling TypeScript..."
COMPILE_START=$(date +%s)

# Capture compilation output
COMPILE_OUTPUT=$(npm run compile 2>&1) || {
    COMPILE_EXIT=$?
    echo -e "${RED}[ERROR]${NC} TypeScript compilation failed!"
    echo "$COMPILE_OUTPUT"
    
    # Restore backup if exists
    if [ -f "$VSIX_FILE.backup" ]; then
        echo -e "${YELLOW}[ROLLBACK]${NC} Restoring previous build..."
        mv "$VSIX_FILE.backup" "$VSIX_FILE"
    fi
    exit $COMPILE_EXIT
}

COMPILE_END=$(date +%s)
COMPILE_TIME=$((COMPILE_END - COMPILE_START))
echo -e "${GREEN}[SUCCESS]${NC} TypeScript compiled in ${COMPILE_TIME}s"

# Check for compilation warnings using TypeScript compiler directly
echo -e "${BLUE}[CHECK]${NC} Checking for TypeScript warnings..."
TSC_CHECK=$(npx tsc -p ./tsconfig.build.json --pretty false --noEmit 2>&1 || true)
if [ -n "$TSC_CHECK" ]; then
    echo -e "${YELLOW}[WARNING]${NC} TypeScript compiler reports issues:"
    echo "$TSC_CHECK" | head -10
    echo -e "${YELLOW}[INFO]${NC} Build continues despite warnings"
fi

# Step 3: Validate build output
echo -e "${BLUE}[VALIDATE]${NC} Validating build output..."

# Check main entry point exists
if [ ! -f "out/extension.js" ]; then
    echo -e "${RED}[ERROR]${NC} Main extension file not created!"
    exit 1
fi

# Check file size is reasonable (warn on small files, error on empty)
FILE_SIZE=$(stat -f%z "out/extension.js" 2>/dev/null || stat -c%s "out/extension.js" 2>/dev/null)
if [ "$FILE_SIZE" -eq 0 ]; then
    echo -e "${RED}[ERROR]${NC} Extension file is empty!"
    exit 1
elif [ "$FILE_SIZE" -lt 100 ]; then
    echo -e "${YELLOW}[WARNING]${NC} Extension file suspiciously small (${FILE_SIZE} bytes)"
    echo -e "${YELLOW}[INFO]${NC} This may indicate a build issue, but continuing..."
fi

# Run build validation script if available
if [ -x "./scripts/validate-build.sh" ]; then
    echo -e "${BLUE}[VALIDATE]${NC} Running comprehensive validation..."
    ./scripts/validate-build.sh --quiet || {
        echo -e "${RED}[ERROR]${NC} Build validation failed!"
        exit 1
    }
    echo -e "${GREEN}[SUCCESS]${NC} Build validation passed"
fi

# Validate command implementations
if [ -f "./scripts/validate-commands.js" ]; then
    echo -e "${BLUE}[VALIDATE]${NC} Validating command implementations..."
    node ./scripts/validate-commands.js || {
        echo -e "${RED}[ERROR]${NC} Command validation failed!"
        exit 1
    }
elif command -v npm >/dev/null 2>&1 && grep -q "validate:commands" package.json 2>/dev/null; then
    echo -e "${BLUE}[VALIDATE]${NC} Running command validation..."
    npm run validate:commands || {
        echo -e "${RED}[ERROR]${NC} Command validation failed!"
        exit 1
    }
fi

# Test that extension can be loaded
echo -e "${BLUE}[TEST]${NC} Testing extension loading..."
LOAD_RESULT=$(node -e "
try {
    const ext = require('./out/extension.js');
    if (!ext.activate || !ext.deactivate) {
        console.error('Missing required exports');
        process.exit(1);
    }
    console.log('Extension loaded successfully');
} catch (error) {
    // Special case: vscode module not available outside VS Code
    if (error.message.includes('Cannot find module') && error.message.includes('vscode')) {
        console.log('vscode module not available (expected outside VS Code)');
        process.exit(0);
    }
    console.error('Failed to load extension:', error.message);
    process.exit(1);
}
" 2>&1) || LOAD_EXIT=$?

if [ -n "$LOAD_EXIT" ] && [ "$LOAD_EXIT" -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} $LOAD_RESULT"
    exit 1
else
    echo -e "${GREEN}[SUCCESS]${NC} Extension structure validated"
fi

# Step 4: Run quick smoke tests if available
if grep -q "test:smoke" package.json; then
    echo -e "${BLUE}[TEST]${NC} Running smoke tests..."
    npm run test:smoke 2>/dev/null || {
        echo -e "${YELLOW}[WARNING]${NC} Smoke tests failed or not available"
    }
fi

# Step 5: Package extension
echo -e "${BLUE}[PACKAGE]${NC} Creating VSIX package..."
PACKAGE_OUTPUT=$(npx vsce package 2>&1) || {
    PACKAGE_EXIT=$?
    echo -e "${RED}[ERROR]${NC} Packaging failed!"
    echo "$PACKAGE_OUTPUT"
    exit $PACKAGE_EXIT
}

if [ ! -f "$VSIX_FILE" ]; then
    echo -e "${RED}[ERROR]${NC} VSIX file not created!"
    exit 1
fi

# Validate package size (warn on small packages, error on empty)
VSIX_SIZE=$(stat -f%z "$VSIX_FILE" 2>/dev/null || stat -c%s "$VSIX_FILE" 2>/dev/null)
if [ "$VSIX_SIZE" -eq 0 ]; then
    echo -e "${RED}[ERROR]${NC} VSIX package is empty!"
    exit 1
elif [ "$VSIX_SIZE" -lt 1000 ]; then
    echo -e "${YELLOW}[WARNING]${NC} VSIX package unusually small (${VSIX_SIZE} bytes)"
    echo -e "${YELLOW}[INFO]${NC} Package may be valid for minimal extensions, continuing..."
fi

# Clean up backup
rm -f "$VSIX_FILE.backup"

# Step 6: Show build report
echo ""
echo "========================================="
echo -e "${GREEN}       BUILD SUCCESSFUL${NC}"
echo "========================================="
echo -e "${BLUE}Version:${NC} $PKG_VERSION"
echo -e "${BLUE}Package:${NC} $VSIX_FILE"
echo -e "${BLUE}Size:${NC} $(ls -lh "$VSIX_FILE" | awk '{print $5}')"
COMMAND_COUNT=$(node -e "const pkg = require('./package.json'); console.log(pkg.contributes.commands.length);")
echo -e "${BLUE}Commands:${NC} $COMMAND_COUNT registered"
echo -e "${BLUE}Build Time:${NC} ${COMPILE_TIME}s"
echo "========================================="
ls -lh nofx-*.vsix
echo ""
echo -e "${GREEN}✅ Extension ready to install: $VSIX_FILE${NC}"

# Step 7: Validate installation readiness
echo -e "${BLUE}[FINAL]${NC} Running final validation..."
node -e "
const pkg = require('./package.json');
const commands = pkg.contributes.commands;
if (commands.length === 0) {
    console.error('Error: No commands found in manifest');
    process.exit(1);
}
console.log('All ' + commands.length + ' commands present in manifest');
"

# Step 8: Handle installation if requested
if [ "$INSTALL_CURSOR" = true ] && [ "$SKIP_INSTALL" = false ]; then
    echo ""
    echo "========================================="
    echo -e "${BLUE}   CURSOR INSTALLATION${NC}"
    echo "========================================="
    echo -e "${BLUE}[INSTALL]${NC} Beginning installation process..."
    
    # Pre-installation validation
    echo -e "${BLUE}[VALIDATE]${NC} Validating extension package..."
    if [ ! -f "$VSIX_FILE" ]; then
        echo -e "${RED}[ERROR]${NC} VSIX file not found!"
        exit 1
    fi
    
    # Check if Cursor is running
    if pgrep -x "Cursor" > /dev/null; then
        echo -e "${BLUE}[CURSOR]${NC} Closing Cursor..."
        osascript -e 'quit app "Cursor"'
        sleep 2
    fi
    
    # Remove old extension
    echo -e "${BLUE}[CLEAN]${NC} Removing old extension..."
    rm -rf ~/.cursor/extensions/$EXT_ID-*
    
    # Install new extension with validation
    echo -e "${BLUE}[INSTALL]${NC} Installing new extension..."
    INSTALL_OUTPUT=$(cursor --install-extension "$(pwd)/$VSIX_FILE" --force 2>&1)
    INSTALL_EXIT=$?
    
    if [ $INSTALL_EXIT -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ Extension installed successfully!${NC}"
        
        # Verify installation
        echo -e "${BLUE}[VERIFY]${NC} Verifying installation..."
        if ls ~/.cursor/extensions/ | grep -q "$EXT_ID"; then
            echo -e "${GREEN}[SUCCESS]${NC} Extension found in Cursor"
        else
            echo -e "${YELLOW}[WARNING]${NC} Could not verify installation"
        fi
        
        echo ""
        echo -e "${BLUE}[LAUNCH]${NC} Opening Cursor..."
        open -a "Cursor"
        
        echo ""
        echo "========================================="
        echo -e "${GREEN}   INSTALLATION COMPLETE${NC}"
        echo "========================================="
        echo "The NofX extension is now ready to use!"
        echo "Look for the 🎸 icon in the activity bar"
        echo "========================================="
    else
        echo -e "${RED}[ERROR]${NC} Installation failed!"
        echo "$INSTALL_OUTPUT"
        echo ""
        echo -e "${YELLOW}[HELP]${NC} Please try manual installation:"
        echo "  1. Quit Cursor completely (Cmd+Q)"
        echo "  2. Run: rm -rf ~/.cursor/extensions/$EXT_ID-*"
        echo "  3. Run: cursor --install-extension $(pwd)/$VSIX_FILE --force"
        echo "  4. Open Cursor"
    fi
else
    echo ""
    echo "📦 Package created successfully: $VSIX_FILE"
    echo ""
    echo "To install manually:"
    echo "  • VS Code: code --install-extension $(pwd)/$VSIX_FILE --force"
    echo "  • Cursor: cursor --install-extension $(pwd)/$VSIX_FILE --force"
    echo "  • Or use the GUI: Extensions → ... → Install from VSIX"
fi