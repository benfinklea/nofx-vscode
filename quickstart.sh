#!/bin/bash

echo "🎸 n of x VS Code Extension Quick Start"
echo "======================================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Check Claude Code
if ! command -v claude &> /dev/null; then
    echo "⚠️  Claude Code CLI not found"
    echo "Installing Claude Code..."
    npm install -g @anthropic-ai/claude-code
else
    echo "✅ Claude Code found: $(claude --version)"
fi

# Check VS Code
if ! command -v code &> /dev/null; then
    echo "❌ VS Code CLI not found. Please install VS Code"
    exit 1
fi

echo "✅ All prerequisites met!"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile

# Package extension
echo "📦 Packaging extension..."
npm install -g vsce
vsce package

echo ""
echo "✅ Extension built successfully!"
echo ""
echo "🚀 To install in VS Code:"
echo "1. Open VS Code"
echo "2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)"
echo "3. Run: 'Extensions: Install from VSIX...'"
echo "4. Select: nofx-0.1.0.vsix"
echo ""
echo "Or install directly:"
echo "code --install-extension nofx-0.1.0.vsix"
echo ""
echo "🎸 Happy orchestrating!"