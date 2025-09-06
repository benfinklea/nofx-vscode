# NofX Build Guide

Comprehensive build instructions for the NofX VS Code extension.

## 🚀 Quick Build

The fastest way to build and test the extension:

```bash
# Build and package only (default)
./build.sh

# Build, package, and install to Cursor (macOS only)
./build.sh --install-cursor

# View available options
./build.sh --help

# Or manual steps
npm run build
cursor --install-extension nofx-0.1.0.vsix --force
```

## 📋 Prerequisites

### Required Software

#### Node.js 18+
```bash
# Check Node.js version
node --version  # Should be v18.0.0 or higher

# Install Node.js (macOS with Homebrew)
brew install node@18

# Install Node.js (using nvm)
nvm install 18
nvm use 18
```

#### TypeScript
```bash
# Install TypeScript globally
npm install -g typescript

# Verify installation
tsc --version  # Should be 5.0.0 or higher
```

#### VS Code or Cursor
```bash
# VS Code
Download from: https://code.visualstudio.com/

# Cursor
Download from: https://cursor.sh/
```

#### Git
```bash
# Verify Git installation
git --version

# Configure Git (if needed)
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

#### Claude CLI (Optional for Testing)
```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

### Environment Setup

```bash
# Clone the repository
git clone https://github.com/nofx/nofx-vscode.git
cd nofx-vscode

# Install dependencies
npm install

# Set up Git hooks
npm run dev:setup
```

## 🔧 Build Scripts Overview

### Core Build Commands

#### `npm run compile`
TypeScript compilation only - generates JavaScript in `out/` directory
```bash
npm run compile
# Equivalent to: tsc -p tsconfig.build.json
```

#### `npm run build`
Complete build with VSIX packaging
```bash
npm run build
# Runs: compile → package
```

#### `npm run build:clean`
Clean build from scratch
```bash
npm run build:clean
# Runs: remove out/ and *.vsix → compile → package
```
**Note**: Use `npm run dev:reset` for a full reset that reinstalls dependencies.

#### `npm run build:validate`
Build with comprehensive validation
```bash
npm run build:validate
# Runs: clean → compile → validate:all → package
```

#### `npm run build:ci`
CI-ready build with full testing
```bash
npm run build:ci
# Runs: clean → install → lint → test:all → compile → package
```

#### `npm run watch`
Development mode with file watching
```bash
npm run watch
# Runs: tsc -watch -p tsconfig.build.json
```

### Utility Scripts

#### Cleaning
```bash
# Remove build artifacts
npm run clean        # Removes out/ and *.vsix

# Deep clean (artifacts only, safe for frequent use)
npm run dev:clean    # Removes out/, coverage/, and *.vsix

# Complete reset (last resort, reinstalls dependencies)
npm run dev:reset    # Removes everything including node_modules and reinstalls
```

#### Validation
```bash
# Validate build output
npm run validate:build

# Validate command registration
npm run validate:commands

# Validate service container
npm run validate:services

# Run all validations
npm run validate:all
```

## 🏗️ Build Process Deep Dive

### Step 1: Pre-build Validation

Before building, ensure your environment is ready:

```bash
# Check for TypeScript errors
npx tsc --noEmit

# Verify dependencies are installed
npm ls

# Check for outdated dependencies
npm outdated
```

### Step 2: TypeScript Compilation

The extension uses multiple TypeScript configurations:

#### Configuration Files

**tsconfig.json** - Base configuration
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "exclude": ["node_modules", ".vscode-test", "out"]
}
```

**tsconfig.build.json** - Production build (excludes tests)
```json
{
  "extends": "./tsconfig.json",
  "exclude": [
    "node_modules",
    ".vscode-test",
    "out",
    "src/test/**/*"
  ]
}
```

**tsconfig.test.json** - Test configuration
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["jest", "node"]
  },
  "include": ["src/test/**/*"]
}
```

#### Compilation Command
```bash
# Standard compilation
npx tsc -p tsconfig.build.json

# Watch mode
npx tsc -watch -p tsconfig.build.json

# With diagnostics
npx tsc -p tsconfig.build.json --listFiles --diagnostics
```

### Step 3: Build Validation

After compilation, validate the build:

```bash
# Check that main entry point exists
test -f out/extension.js || echo "Build failed: missing extension.js"

# Verify all expected directories
for dir in agents commands conductor services; do
  test -d "out/$dir" || echo "Missing directory: out/$dir"
done

# Check file sizes (detect empty files)
find out -name "*.js" -size 0 -print
```

### Step 4: VSIX Packaging

Package the extension for distribution:

```bash
# Standard packaging (includes dependencies)
npx vsce package

# With specific version
npx vsce package --version 0.1.0

# Exclude files (uses .vscodeignore)
npx vsce package --yarn  # If using yarn

# Dry run (show what would be packaged)
npx vsce ls
```

#### .vscodeignore File
```
.vscode/**
.vscode-test/**
src/**
.gitignore
.yarnrc
vsc-extension-quickstart.md
**/tsconfig.json
**/.eslintrc.json
**/*.map
**/*.ts
!webview/**
.github/**
.husky/**
coverage/**
scripts/**
*.vsix
```

### Step 5: Post-build Validation

Verify the package is correct:

```bash
# List package contents
npx vsce ls

# Check package size
ls -lh *.vsix

# Extract and inspect (optional)
unzip -l nofx-0.1.0.vsix

# Validate package.json is included
unzip -p nofx-0.1.0.vsix extension/package.json | jq .version
```

## 🛠️ Development Builds

### Setting Up Watch Mode

For active development:

```bash
# Terminal 1: Watch TypeScript files
npm run watch

# Terminal 2: Watch tests
npm run test:watch

# Terminal 3: Run extension
# Press F5 in VS Code
```

### Development Validation

Run quick checks during development:

```bash
# Quick validation (lint + unit tests)
npm run dev:validate

# Full validation (all checks)
npm run validate:all
```

### Incremental Builds

For faster development cycles:

```bash
# Only compile changed files
npx tsc -p tsconfig.build.json --incremental

# Create build info file for faster subsequent builds
npx tsc -p tsconfig.build.json --tsBuildInfoFile .tsbuildinfo
```

## 🧪 Build Validation

### Automated Validation

The `validate-build.sh` script performs comprehensive checks:

```bash
#!/bin/bash

echo "Validating build..."

# 1. Check output directory exists
if [ ! -d "out" ]; then
  echo "❌ Build output directory missing"
  exit 1
fi

# 2. Check main entry point
if [ ! -f "out/extension.js" ]; then
  echo "❌ Main entry point missing"
  exit 1
fi

# 3. Check critical services
for service in "Container" "AgentManager" "OrchestrationServer"; do
  if [ ! -f "out/services/${service}.js" ]; then
    echo "❌ Missing service: ${service}"
    exit 1
  fi
done

# 4. Check file sizes
empty_files=$(find out -name "*.js" -size 0)
if [ ! -z "$empty_files" ]; then
  echo "❌ Empty JavaScript files found:"
  echo "$empty_files"
  exit 1
fi

# 5. Test loading the extension
node -e "require('./out/extension')" 2>/dev/null
if [ $? -ne 0 ]; then
  echo "❌ Extension fails to load"
  exit 1
fi

echo "✅ Build validation passed"
```

### Command Registration Validation

Verify all commands are properly registered:

```javascript
// scripts/validate-commands.js
const packageJson = require('../package.json');
const fs = require('fs');
const path = require('path');

// Get commands from package.json
const declaredCommands = packageJson.contributes.commands.map(c => c.command);

// Check implementation files
const commandFiles = fs.readdirSync(path.join(__dirname, '../out/commands'));

console.log(`Found ${declaredCommands.length} declared commands`);
console.log(`Found ${commandFiles.length} command implementation files`);

// Verify each command has an implementation
let hasErrors = false;
for (const command of declaredCommands) {
  const commandName = command.replace('nofx.', '');
  // Check if command is likely implemented
  if (!commandFiles.some(f => f.toLowerCase().includes(commandName.toLowerCase()))) {
    console.error(`⚠️  Command may be missing implementation: ${command}`);
    hasErrors = true;
  }
}

if (!hasErrors) {
  console.log('✅ All commands appear to be implemented');
} else {
  process.exit(1);
}
```

### Service Container Validation

Ensure all services are properly registered:

```javascript
// scripts/validate-services.js
const { Container } = require('../out/services/Container');

const requiredServices = [
  'LoggingService',
  'EventBus',
  'AgentManager',
  'TaskQueue',
  'OrchestrationServer',
  'ConfigurationService',
  'MetricsService',
  'NotificationService'
];

console.log('Validating service container...');

const container = Container.getInstance();
let hasErrors = false;

for (const service of requiredServices) {
  try {
    // Don't actually resolve, just check registration
    if (!container.isRegistered(service)) {
      console.error(`❌ Service not registered: ${service}`);
      hasErrors = true;
    } else {
      console.log(`✅ ${service} registered`);
    }
  } catch (error) {
    console.error(`❌ Error checking ${service}: ${error.message}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  process.exit(1);
} else {
  console.log('✅ All services validated');
}
```

### Manual Validation Checklist

After building, manually verify:

- [ ] Extension installs without errors
- [ ] Extension activates properly
- [ ] Commands appear in Command Palette
- [ ] UI components load correctly
- [ ] WebSocket server starts
- [ ] No errors in Output channels
- [ ] No errors in Developer Console

## 🚨 Troubleshooting Build Issues

### Common Build Problems

#### Missing `out/extension.js`

**Problem**: Extension fails to load with "Cannot find module './out/extension'"

**Solution**:
```bash
# The extension must be compiled first
npm run compile

# Verify the file exists
ls out/extension.js

# If still missing, check TypeScript errors
npx tsc --noEmit
```

#### TypeScript Compilation Errors

**Problem**: TypeScript fails to compile

**Solutions**:
```bash
# Check for type errors
npx tsc --noEmit

# Update TypeScript
npm install typescript@latest --save-dev

# Clear TypeScript cache
rm -rf node_modules/.cache/typescript
npm run compile
```

#### VSCE Packaging Failures

**Problem**: `vsce package` fails

**Solutions**:
```bash
# Ensure package.json is valid
npm run validate:package

# Check all required files exist
npx vsce ls

# Update vsce
npm install @vscode/vsce@latest --save-dev

# Package with verbose output
npx vsce package --verbose
```

#### Extension Loading Errors

**Problem**: Extension installs but doesn't activate

**Solutions**:
```bash
# Check activation events in package.json
grep -A 5 "activationEvents" package.json

# Verify main entry point
grep "main" package.json  # Should point to "./out/extension"

# Check for runtime errors
# Install and check Output → NofX Extension
```

#### Command Registration Failures

**Problem**: Commands don't appear in Command Palette

**Solutions**:
```bash
# Validate command registration
npm run validate:commands

# Check package.json commands match implementation
# Each command in package.json must have a corresponding
# registerCommand call in the code
```

#### Service Resolution Errors

**Problem**: "Service not registered" errors

**Solutions**:
```bash
# Validate service container
npm run validate:services

# Check for circular dependencies
# Review service registration order in extension.ts
```

### Platform-Specific Issues

#### macOS

```bash
# Permission issues with shell scripts
chmod +x build.sh rebuild.sh scripts/*.sh

# Gatekeeper issues
xattr -d com.apple.quarantine *.sh

# Path issues
export PATH="/usr/local/bin:$PATH"
```

#### Windows

```powershell
# Use PowerShell instead of Command Prompt
# Run as Administrator if permission issues

# Path separator issues
# Use forward slashes in scripts

# Line ending issues
git config core.autocrlf false
```

#### Linux

```bash
# Permission issues
chmod +x build.sh
sudo npm install -g @vscode/vsce

# Missing dependencies
sudo apt-get install build-essential
```

## 📦 Platform-Specific Instructions

### macOS Build Instructions

```bash
# Using Homebrew
brew install node@18
npm install

# Build with shell script
./build.sh

# Or manual build
npm run build
code --install-extension nofx-0.1.0.vsix
```

### Windows Build Instructions

```powershell
# Using PowerShell
# Install Node.js from nodejs.org

# Clone and build
git clone https://github.com/nofx/nofx-vscode.git
cd nofx-vscode
npm install
npm run build

# Install extension
code --install-extension nofx-0.1.0.vsix
```

### Linux Build Instructions

```bash
# Using package manager
sudo apt-get update
sudo apt-get install nodejs npm

# Or using snap
sudo snap install node --classic

# Build
npm install
npm run build
code --install-extension nofx-0.1.0.vsix
```

### CI/CD Build Instructions

```yaml
# GitHub Actions example
name: Build
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - run: npm ci
      - run: npm run build:ci
      
      - uses: actions/upload-artifact@v3
        with:
          name: vsix
          path: '*.vsix'
```

## 🔍 Build Artifacts

### Output Directory Structure

After a successful build:

```
out/
├── agents/
│   ├── AgentManager.js
│   ├── AgentManager.js.map
│   ├── AgentTemplateManager.js
│   └── types.js
├── commands/
│   ├── AgentCommands.js
│   ├── ConductorCommands.js
│   ├── TaskCommands.js
│   └── *.js
├── conductor/
│   ├── ConductorTerminal.js
│   ├── IntelligentConductor.js
│   └── *.js
├── services/
│   ├── Container.js
│   ├── EventBus.js
│   ├── LoggingService.js
│   └── *.js
├── extension.js          # Main entry point
└── extension.js.map      # Source map
```

### VSIX Package Contents

```
nofx-0.1.0.vsix
├── extension/
│   ├── out/              # Compiled JavaScript
│   ├── node_modules/     # Dependencies
│   ├── webview/          # Webview assets
│   ├── package.json      # Extension manifest
│   ├── README.md         # Extension documentation
│   └── LICENSE           # License file
├── [Content_Types].xml   # Package metadata
└── extension.vsixmanifest # VSIX manifest
```

### Source Maps

Source maps enable debugging TypeScript in VS Code:

```json
// tsconfig.json
{
  "compilerOptions": {
    "sourceMap": true,
    "inlineSources": true  // Include source in maps
  }
}
```

### Build Logs

Keep build logs for debugging:

```bash
# Save build output
npm run build > build.log 2>&1

# Verbose build with timing
time npm run build --verbose

# Build with diagnostics
npx tsc --diagnostics > tsc-diagnostics.log
```

## ⚡ Performance Optimization

### Faster Builds

#### Incremental Compilation
```json
// tsconfig.json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

#### Parallel Compilation
```bash
# Use project references for parallel builds
# Split tsconfig into multiple projects
```

#### Skip Library Checking
```json
{
  "compilerOptions": {
    "skipLibCheck": true  // Skip .d.ts file checking
  }
}
```

### Build Caching

```bash
# Cache dependencies
npm ci --prefer-offline

# Use npm cache
npm config set cache ~/.npm-cache

# Cache TypeScript builds
# The .tsbuildinfo file caches build state
```

### Optimized Packaging

```bash
# Minimize package size
npm prune --production  # Remove dev dependencies

# Use .vscodeignore effectively
# Exclude all non-essential files

# Compress assets
# Minify JavaScript (if needed)
```

## 🔄 Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/build.yml
name: Build and Test

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ${{ matrix.os }}
    
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Run tests
      run: npm run test:ci
    
    - name: Build extension
      run: npm run build
    
    - name: Validate build
      run: npm run validate:all
    
    - name: Package extension
      run: npx vsce package
    
    - name: Upload artifact
      uses: actions/upload-artifact@v3
      with:
        name: vsix-${{ matrix.os }}-node${{ matrix.node-version }}
        path: '*.vsix'
```

### Build Status Badges

```markdown
![Build Status](https://github.com/nofx/nofx-vscode/workflows/Build/badge.svg)
![Coverage](https://codecov.io/gh/nofx/nofx-vscode/branch/main/graph/badge.svg)
```

### Automated Releases

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Build and package
      run: |
        npm ci
        npm run build:ci
        npx vsce package
    
    - name: Create Release
      uses: actions/create-release@v1
      with:
        tag_name: ${{ github.ref }}
        release_name: Release ${{ github.ref }}
        files: '*.vsix'
```

---

*This build guide ensures successful compilation and packaging of the NofX extension across all platforms and scenarios.*