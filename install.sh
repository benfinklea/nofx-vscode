#!/bin/bash

# Install script for NofX VS Code Extension
# This installs the already built extension

echo "🎸 NofX Extension Installer"
echo "=============================="

# Check if VSIX exists
if [ ! -f "nofx-0.1.0.vsix" ]; then
    echo "❌ nofx-0.1.0.vsix not found!"
    echo "Run ./build.sh first to build the extension"
    exit 1
fi

echo "📦 Found extension: nofx-0.1.0.vsix"
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
rm -rf ~/.cursor/extensions/nofx.nofx-*

# Install new extension
echo "📦 Installing new extension..."
cursor --install-extension "$(pwd)/nofx-0.1.0.vsix" --force

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
    echo "  2. Run: rm -rf ~/.cursor/extensions/nofx.nofx-*"
    echo "  3. Run: cursor --install-extension $(pwd)/nofx-0.1.0.vsix"
    echo "  4. Open Cursor"
fi