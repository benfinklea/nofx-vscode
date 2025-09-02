#!/bin/bash

# Build script for NofX VS Code Extension
# This ensures all TypeScript is compiled and packaged correctly

echo "🎸 Building NofX Extension..."
echo "=============================="

# Step 1: Clean old build
echo "📦 Cleaning old build..."
rm -f nofx-*.vsix

# Step 2: Compile TypeScript
echo "⚙️  Compiling TypeScript..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ TypeScript compilation failed!"
    exit 1
fi

# Step 3: Package extension
echo "📦 Packaging extension..."
npx vsce package

if [ $? -ne 0 ]; then
    echo "❌ Packaging failed!"
    exit 1
fi

# Step 4: Show result
echo ""
echo "✅ Build successful!"
echo "=============================="
ls -lh nofx-*.vsix
echo ""
echo "📦 Extension ready to install: nofx-0.1.0.vsix"

# Step 5: Offer to install
echo ""
echo "Would you like to install the extension now?"
echo "This will:"
echo "  1. Close Cursor"
echo "  2. Remove old extension"
echo "  3. Install new version"
echo "  4. Reopen Cursor"
echo ""
read -p "Install now? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 Installing extension..."
    
    # Check if Cursor is running
    if pgrep -x "Cursor" > /dev/null; then
        echo "⏹️  Closing Cursor..."
        osascript -e 'quit app "Cursor"'
        sleep 2
    fi
    
    # Remove old extension
    echo "🗑️  Removing old extension..."
    rm -rf ~/.cursor/extensions/nofx.nofx-*
    
    # Install new extension
    echo "📦 Installing new extension..."
    cursor --install-extension "$(pwd)/nofx-0.1.0.vsix" --force
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Extension installed successfully!"
        echo ""
        echo "🚀 Opening Cursor..."
        open -a "Cursor"
    else
        echo "❌ Installation failed. Please try manual installation:"
        echo "  1. Quit Cursor completely (Cmd+Q)"
        echo "  2. Run: rm -rf ~/.cursor/extensions/nofx.nofx-*"
        echo "  3. Run: cursor --install-extension $(pwd)/nofx-0.1.0.vsix"
        echo "  4. Open Cursor"
    fi
else
    echo ""
    echo "📝 Manual installation steps:"
    echo "  1. Quit Cursor completely (Cmd+Q)"
    echo "  2. Run: rm -rf ~/.cursor/extensions/nofx.nofx-*"
    echo "  3. Run: cursor --install-extension $(pwd)/nofx-0.1.0.vsix"
    echo "  4. Open Cursor"
fi