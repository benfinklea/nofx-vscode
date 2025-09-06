#!/bin/bash

# Quick rebuild and install script for NofX
# This is the fastest way to test changes

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

echo "🎸 NofX Quick Rebuild & Install"
echo "================================"

# Build
echo "⚙️  Compiling TypeScript..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed!"
    exit 1
fi

echo "📦 Packaging extension..."
npx vsce package

if [ $? -ne 0 ]; then
    echo "❌ Packaging failed!"
    exit 1
fi

echo "✅ Build complete!"
echo ""

# Quick install without prompts
echo "🔄 Quick installing..."

# Kill Cursor if running
if pgrep -x "Cursor" > /dev/null; then
    osascript -e 'quit app "Cursor"' 2>/dev/null
    sleep 2
fi

# Clean and install
rm -rf ~/.cursor/extensions/$EXT_ID-* 2>/dev/null
cursor --install-extension "$(pwd)/$VSIX_FILE" --force 2>/dev/null

echo "🚀 Reopening Cursor..."
open -a "Cursor"

echo ""
echo "✅ Done! Extension updated and Cursor reopened."