#!/bin/bash

# Quick rebuild and install script for NofX
# This is the fastest way to test changes

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
npx vsce package --no-dependencies

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
rm -rf ~/.cursor/extensions/nofx.nofx-* 2>/dev/null
cursor --install-extension "$(pwd)/nofx-0.1.0.vsix" --force 2>/dev/null

echo "🚀 Reopening Cursor..."
open -a "Cursor"

echo ""
echo "✅ Done! Extension updated and Cursor reopened."