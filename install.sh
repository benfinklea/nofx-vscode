#!/bin/bash

# Install script for NofX VS Code Extension
# This installs the already built extension

# Platform detection
UNAME=$(uname)
if [[ "$UNAME" != "Darwin" ]]; then
  echo "This installer currently supports macOS only. Use manual VSIX install on your platform."
  exit 1
fi

# Check for cursor CLI
if ! command -v cursor >/dev/null 2>&1; then
  echo "'cursor' CLI not found. Install Cursor or add it to PATH, or use VS Code's GUI Install from VSIX."
  echo ""
  echo "To install with VS Code, run: code --install-extension \$(pwd)/\$VSIX_FILE --force"
  exit 1
fi

# Get package information dynamically
PKG_NAME=$(node -p "require('./package.json').name")
PKG_VERSION=$(node -p "require('./package.json').version")
PUBLISHER=$(node -p "require('./package.json').publisher")
VSIX_FILE="$PKG_NAME-$PKG_VERSION.vsix"
EXT_ID="$PUBLISHER.$PKG_NAME"

echo "🎸 NofX Extension Installer"
echo "=============================="

# Check if VSIX exists
if [ ! -f "$VSIX_FILE" ]; then
    echo "❌ $VSIX_FILE not found!"
    echo "Run ./build.sh first to build the extension"
    exit 1
fi

echo "📦 Found extension: $VSIX_FILE"
echo ""

# Check if Cursor is running
if pgrep -x "Cursor" > /dev/null; then
    echo "⏹️  Cursor is running. It needs to be closed for installation."
    read -p "Close Cursor now? (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Closing Cursor..."
        osascript -e 'quit app "Cursor"'
        sleep 3
    else
        echo "❌ Please close Cursor manually and run this script again"
        exit 1
    fi
fi

# Remove old extension
echo "🗑️  Removing old extension versions..."
rm -rf ~/.cursor/extensions/$EXT_ID-*

# Install new extension
echo "📦 Installing new extension..."
cursor --install-extension "$(pwd)/$VSIX_FILE" --force

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Extension installed successfully!"
    echo ""
    read -p "Open Cursor now? (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🚀 Opening Cursor..."
        open -a "Cursor"
    fi
else
    echo "❌ Installation failed."
    echo ""
    echo "Try manual installation:"
    echo "  1. Make sure Cursor is completely closed"
    echo "  2. Run: rm -rf ~/.cursor/extensions/$EXT_ID-*"
    echo "  3. Run: cursor --install-extension $(pwd)/$VSIX_FILE"
    echo "  4. Open Cursor"
fi