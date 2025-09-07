# NofX Troubleshooting Guide

Comprehensive troubleshooting guide for common issues with the NofX VS Code extension.

## 🚨 Emergency Recovery

### Quick Fixes for Critical Issues

#### Extension Won't Activate
```bash
# Check Output panel for errors
View → Output → Select "NofX" from dropdown

# Force reload VS Code
Cmd+Shift+P → "Developer: Reload Window"

# Reinstall extension
code --uninstall-extension nofx.nofx
# Install the latest VSIX
VSIX=$(ls -1t nofx-*.vsix | head -1)
code --install-extension "$VSIX" --force
```

#### Commands Not Found
```bash
# Verify extension is activated
Cmd+Shift+P → "NofX" # Should show all NofX commands

# Check extension is enabled
Extensions → Search "NofX" → Ensure enabled

# Rebuild and reinstall
npm run build
# Install the latest VSIX
VSIX=$(ls -1t nofx-*.vsix | head -1)
code --install-extension "$VSIX" --force
```

#### Build Failures
```bash
# First try cleaning artifacts only
npm run dev:clean
npm run build:validate

# If issues persist, do a complete reset
npm run dev:reset
npm run build:validate
```

#### Missing `out/extension.js`
```bash
# This is the most common issue - compile TypeScript first
npm run compile

# Verify file exists
ls out/extension.js

# If still missing, check for TypeScript errors
npx tsc --noEmit
```

## 🏗️ Build Issues

### TypeScript Compilation Errors

#### Syntax Errors
```bash
# Check for TypeScript errors
npx tsc --noEmit

# Common fixes:
# 1. Update TypeScript
npm install typescript@latest --save-dev

# 2. Clear TypeScript cache
rm -rf node_modules/.cache/typescript

# 3. Check tsconfig.json
cat tsconfig.json  # Ensure valid JSON
```

#### Type Definition Errors
```bash
# Update type definitions
npm update @types/node @types/vscode

# Install missing types
npm install --save-dev @types/[package-name]

# Check for conflicting types
npm ls @types/node  # Should show single version
```

#### Module Resolution Errors
```bash
# Check module resolution
npx tsc --traceResolution > resolution.log

# Common fixes:
# 1. Check imports use correct paths
# 2. Ensure baseUrl and paths in tsconfig.json
# 3. Clear node_modules and reinstall
```

### VSIX Packaging Failures

#### Package.json Issues
```bash
# Validate package.json
npx vsce ls  # Shows what would be packaged

# Check required fields
node -e "const p = require('./package.json'); console.log(p.name, p.version, p.publisher, p.engines.vscode)"

# Fix common issues:
# - Ensure "main" points to "./out/extension"
# - Check "engines.vscode" version compatibility
# - Verify all command IDs are unique
```

#### Missing Dependencies
```bash
# IMPORTANT: Include dependencies in package
npx vsce package  # Includes node_modules

# DO NOT use --no-dependencies flag
# npx vsce package --no-dependencies  # ❌ Breaks WebSocket

# Check package contents
# Check if dependencies are included
VSIX=$(ls -1t nofx-*.vsix | head -1)
unzip -l "$VSIX" | grep node_modules
```

#### File Size Issues
```bash
# Check package size
ls -lh *.vsix

# If too large (>100MB), check .vscodeignore
cat .vscodeignore

# Add unnecessary files to .vscodeignore:
# - test files
# - source maps (optional)
# - documentation
# - build scripts
```

### Missing Dependencies

#### NPM Install Failures
```bash
# Clear npm cache
npm cache clean --force

# Delete lock file and reinstall
rm package-lock.json
npm install

# Use specific npm version
npm install -g npm@9
npm install
```

#### Peer Dependency Warnings
```bash
# Install peer dependencies explicitly
npm install [peer-dependency] --save-dev

# Or use --legacy-peer-deps flag
npm install --legacy-peer-deps
```

#### Node Version Issues
```bash
# Check Node version
node --version  # Should be 18+

# Use nvm to switch versions
nvm install 18
nvm use 18

# Or use n for version management
n 18
```

## 🔧 Extension Issues

### Extension Won't Install

#### CLI 'code' Command Not Found

If the `code` or `cursor` command is not recognized:

**VS Code:**
1. Open VS Code
2. Open Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux)
3. Type and run: "Shell Command: Install 'code' command in PATH"
4. Restart your terminal

**Cursor:**
- Cursor typically adds itself to PATH during installation
- Use `cursor` command instead of `code`
- If not available, check Cursor's installation directory

**Manual PATH Setup:**
```bash
# macOS/Linux - Add to ~/.bashrc or ~/.zshrc
export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"

# Windows - Add to System PATH via Environment Variables
# C:\Users\{username}\AppData\Local\Programs\Microsoft VS Code\bin
```

#### Installation Failures
```bash
# Completely remove old versions
rm -rf ~/.vscode/extensions/nofx.nofx-*
rm -rf ~/.cursor/extensions/nofx.nofx-*

# Install with force flag
# Install the latest VSIX
VSIX=$(ls -1t nofx-*.vsix | head -1)
code --install-extension "$VSIX" --force

# For Cursor
# For Cursor users
VSIX=$(ls -1t nofx-*.vsix | head -1)
cursor --install-extension "$VSIX" --force

# Manual installation
1. Open VS Code
2. Extensions view (Cmd+Shift+X)
3. "..." menu → "Install from VSIX..."
4. Select the nofx-*.vsix file
```

#### Permission Issues
```bash
# macOS/Linux: Fix permissions
VSIX=$(ls -1t nofx-*.vsix | head -1)
chmod 644 "$VSIX"
sudo code --install-extension "$VSIX" --force

# Windows: Run as Administrator
# Right-click VS Code → Run as Administrator
# Then install extension
```

#### Corrupt Installation
```bash
# Remove all extension data
rm -rf ~/.vscode/extensions/nofx.nofx-*
rm -rf ~/Library/Application\ Support/Code/User/globalStorage/nofx.nofx
rm -rf ~/Library/Application\ Support/Code/User/workspaceStorage/*nofx*

# Restart VS Code and reinstall
```

### Commands Not Registered

#### Command Palette Issues
```bash
# Validate command registration
npm run validate:commands

# Check package.json commands
grep -A 2 '"command":' package.json

# Verify implementation exists
grep -r "registerCommand.*nofx\." src/
```

#### Command ID Mismatches
```typescript
// Check command IDs match between:
// 1. package.json
{
  "contributes": {
    "commands": [{
      "command": "nofx.myCommand",  // This ID
      "title": "NofX: My Command"
    }]
  }
}

// 2. Implementation
vscode.commands.registerCommand('nofx.myCommand', () => {
  // Must match exactly
});
```

#### Activation Event Issues
```json
// Ensure proper activation events in package.json
{
  "activationEvents": [
    "onCommand:nofx.startConductor",
    "onView:nofx-sidebar",
    "onStartupFinished"  // Ensures extension loads
  ]
}
```

### Service Container Errors

#### Service Not Registered
```typescript
// Check service registration order
// Services must be registered before resolution

// ❌ Wrong order
const service = container.resolve('MyService');
container.register('MyService', () => new MyService());

// ✅ Correct order
container.register('MyService', () => new MyService());
const service = container.resolve('MyService');
```

#### Circular Dependencies
```typescript
// Identify circular dependencies
// A → B → C → A

// Fix using lazy resolution
container.register('ServiceA', () => {
  return new ServiceA(() => container.resolve('ServiceB'));
});
```

#### Container Validation
```bash
# Run container validation
npm run validate:services

# Debug container state
node -e "
const { Container } = require('./out/services/Container');
const container = Container.getInstance();
console.log(container.listServices());
"
```

## 🌐 Network and Connectivity

### WebSocket Connection Failures

#### Port Issues
```bash
# Check if port is in use
lsof -i :7777  # macOS/Linux
netstat -ano | findstr :7777  # Windows

# Kill process using port
kill -9 [PID]  # macOS/Linux
taskkill /PID [PID] /F  # Windows

# Extension uses dynamic port allocation
# Check Output → NofX - Orchestration for actual port
```

#### Firewall Blocking
```bash
# macOS: Allow through firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /Applications/Visual\ Studio\ Code.app

# Windows: Add firewall exception
netsh advfirewall firewall add rule name="VS Code" dir=in action=allow program="C:\Path\To\Code.exe"

# Linux: UFW
sudo ufw allow 7777/tcp
```

#### WebSocket Server Not Starting
```typescript
// Check orchestration server logs
// Output → NofX - Orchestration

// Common issues:
// 1. Port binding failed
// 2. Missing ws dependency
// 3. Server initialization error

// Verify ws is installed
npm ls ws  // Should show ws package
```

### Claude CLI Integration

#### Claude Not Found
```bash
# Install Claude CLI globally
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
which claude  # Should show path

# Add to PATH if needed
export PATH="$PATH:$(npm prefix -g)/bin"
```

#### Claude CLI Errors
```bash
# Check Claude configuration
claude config

# Test Claude directly
echo "Hello" | claude

# Common issues:
# - Missing API key
# - Network connectivity
# - Rate limiting
```

#### System Prompt Issues
```bash
# Verify --append-system-prompt flag works
claude --append-system-prompt "You are a test" --help

# Update Claude CLI
npm update -g @anthropic-ai/claude-code
```

## 🧪 Testing Issues

### Test Failures

#### Unit Test Failures
```bash
# Run tests individually
npm test -- --testNamePattern="specific test name"

# Debug specific test file
npm test -- path/to/test.ts --verbose

# Common fixes:
# 1. Clear test cache
npm test -- --clearCache

# 2. Update test snapshots
npm test -- -u

# 3. Check mock configuration
```

#### Integration Test Failures
```bash
# Isolate integration tests
npm run test:integration -- --runInBand

# Check service initialization
npm test -- --detectOpenHandles

# Common issues:
# - Services not properly mocked
# - Async operations not awaited
# - Test environment not clean
```

#### VS Code Extension Test Failures
```bash
# Clear VS Code test instance
rm -rf .vscode-test

# Download fresh VS Code
npx @vscode/test-electron --version 1.85.0

# Run with specific VS Code version
npm run test:functional -- --vscode-version=1.85.0
```

### Coverage Issues

#### Low Coverage
```bash
# Generate detailed coverage report
npm run test:coverage -- --verbose

# Find uncovered lines
open coverage/index.html

# Common issues:
# - Missing test files
# - Excluded files in jest.config.js
# - Unreachable code
```

#### Coverage Data Corruption
```bash
# Clear coverage data
rm -rf coverage .nyc_output

# Regenerate fresh coverage
npm run test:coverage -- --no-cache
```

## 🎯 Performance Issues

### Slow Extension Activation

#### Profiling Activation
```typescript
// Add timing to activation
export function activate(context: vscode.ExtensionContext) {
  console.time('NofX Activation');
  
  // ... initialization code
  
  console.timeEnd('NofX Activation');
}

// Check Output → NofX for timing
```

#### Optimization Steps
```typescript
// 1. Lazy load services
container.registerLazy('HeavyService', () => {
  return import('./HeavyService').then(m => new m.HeavyService());
});

// 2. Defer non-critical initialization
setTimeout(() => {
  initializeNonCriticalServices();
}, 1000);

// 3. Use activation events wisely
// Only activate when needed, not onStartupFinished
```

### Memory Leaks

#### Identifying Leaks
```typescript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  console.log(`Memory: ${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
}, 5000);

// Use VS Code memory profiler
Cmd+Shift+P → "Developer: Show Running Extensions"
```

#### Common Leak Sources
```typescript
// 1. Event listeners not cleaned up
const disposable = vscode.workspace.onDidChangeConfiguration(handler);
context.subscriptions.push(disposable);  // ✅ Proper cleanup

// 2. Timers not cleared
const timer = setInterval(callback, 1000);
context.subscriptions.push({
  dispose: () => clearInterval(timer)
});

// 3. Large objects in closures
// Avoid capturing large objects unnecessarily
```

### High CPU Usage

#### CPU Profiling
```bash
# Use VS Code CPU profiler
Cmd+Shift+P → "Developer: Start Extension Host Profile"
# Reproduce issue
Cmd+Shift+P → "Developer: Stop Extension Host Profile"
```

#### Common CPU Issues
```typescript
// 1. Polling instead of events
// ❌ Bad: Polling
setInterval(() => checkForChanges(), 100);

// ✅ Good: Event-driven
vscode.workspace.onDidChangeTextDocument(handleChange);

// 2. Inefficient algorithms
// Use appropriate data structures
// Cache computed values
// Debounce rapid events
```

## 🔍 Debugging Techniques

### Extension Development Debugging

#### Launch Configuration Issues
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--disable-extensions"  // Disable other extensions
      ],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: watch",
      "env": {
        "NOFX_DEBUG": "true"  // Enable debug mode
      }
    }
  ]
}
```

#### Breakpoint Issues
```typescript
// Breakpoints not hitting?

// 1. Ensure source maps are generated
// tsconfig.json
{
  "compilerOptions": {
    "sourceMap": true
  }
}

// 2. Check outFiles in launch.json matches compiled output

// 3. Use debugger statement as fallback
debugger;  // Will break here
```

### Service Container Debugging

#### Debug Logging
```typescript
// Enable verbose logging
export class Container {
  private debug = process.env.NOFX_DEBUG === 'true';
  
  register(token: string, factory: () => any): void {
    if (this.debug) {
      console.log(`[Container] Registering: ${token}`);
    }
    // ... registration logic
  }
  
  resolve(token: string): any {
    if (this.debug) {
      console.log(`[Container] Resolving: ${token}`);
    }
    // ... resolution logic
  }
}
```

#### Service Validation
```typescript
// Validate all services on activation
function validateServices(container: Container): void {
  const required = [
    'LoggingService',
    'EventBus',
    'AgentManager',
    // ... other services
  ];
  
  const missing = required.filter(service => {
    try {
      container.resolve(service);
      return false;
    } catch {
      return true;
    }
  });
  
  if (missing.length > 0) {
    throw new Error(`Missing services: ${missing.join(', ')}`);
  }
}
```

### WebSocket Debugging

#### Connection Debugging
```typescript
// Enable WebSocket debug logging
const WebSocket = require('ws');

const wss = new WebSocket.Server({
  port: 7777,
  verifyClient: (info) => {
    console.log('Client connecting:', info.origin);
    return true;
  }
});

wss.on('connection', (ws, req) => {
  console.log('Client connected from:', req.socket.remoteAddress);
  
  ws.on('message', (data) => {
    console.log('Received:', data.toString());
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});
```

#### Message Flow Debugging
```typescript
// Log all messages
export class MessageRouter {
  route(message: Message): void {
    console.log(`[Router] Type: ${message.type}, From: ${message.from}, To: ${message.to}`);
    console.log(`[Router] Payload:`, JSON.stringify(message.payload, null, 2));
    
    // ... routing logic
  }
}
```

## 📱 Platform-Specific Issues

### macOS Issues

#### Gatekeeper Blocking
```bash
# Remove quarantine attribute from VSIX
VSIX=$(ls -1t nofx-*.vsix | head -1)
xattr -d com.apple.quarantine "$VSIX"

# Allow unsigned extensions
sudo spctl --master-disable  # Use with caution
```

#### Permission Issues
```bash
# Fix script permissions
chmod +x build.sh rebuild.sh scripts/*.sh

# Fix extension permissions
chmod -R 755 ~/.vscode/extensions/nofx.nofx-*
```

#### Path Issues
```bash
# Add to PATH in .zshrc or .bash_profile
export PATH="/usr/local/bin:$PATH"
export PATH="$HOME/.npm-global/bin:$PATH"

# Reload shell
source ~/.zshrc
```

### Windows Issues

#### PowerShell Execution Policy
```powershell
# Check execution policy
Get-ExecutionPolicy

# Set to allow scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or bypass for single session
powershell -ExecutionPolicy Bypass -File build.ps1
```

#### Path Length Issues
```powershell
# Windows has 260 character path limit
# Enable long paths in Windows 10+

# Via Group Policy
# Computer Configuration → Administrative Templates 
# → System → Filesystem → Enable Win32 long paths

# Or via Registry
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
  -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

#### Line Ending Issues
```bash
# Configure Git for Windows line endings
git config core.autocrlf true

# Or use .gitattributes
echo "* text=auto" > .gitattributes
echo "*.ts text eol=lf" >> .gitattributes
echo "*.json text eol=lf" >> .gitattributes
```

### Linux Issues

#### Missing Dependencies
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install build-essential
sudo apt-get install libx11-dev libxkbfile-dev

# Fedora/RHEL
sudo dnf groupinstall "Development Tools"
sudo dnf install libX11-devel libxkbfile-devel

# Arch
sudo pacman -S base-devel
```

#### Permission Issues
```bash
# Fix npm global permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

#### Display Issues
```bash
# If running headless
export DISPLAY=:0

# Or use xvfb for testing
sudo apt-get install xvfb
xvfb-run -a npm test
```

## 🔄 Recovery Procedures

### Complete Reset

#### Full Extension Reset
```bash
# 1. Uninstall extension
code --uninstall-extension nofx.nofx

# 2. Remove all extension data
rm -rf ~/.vscode/extensions/nofx.nofx-*
rm -rf ~/Library/Application\ Support/Code/User/globalStorage/nofx.nofx
rm -rf ~/Library/Application\ Support/Code/User/workspaceStorage/*nofx*

# 3. Clear VS Code cache
rm -rf ~/Library/Application\ Support/Code/Cache/*
rm -rf ~/Library/Application\ Support/Code/CachedData/*

# 4. Rebuild and reinstall
npm run dev:reset
npm run build
# Install the latest VSIX
VSIX=$(ls -1t nofx-*.vsix | head -1)
code --install-extension "$VSIX" --force

# 5. Restart VS Code
```

### Configuration Reset

#### Reset Extension Settings
```bash
# Reset VS Code settings for NofX
Cmd+Shift+P → "Preferences: Open Settings (JSON)"

# Remove all nofx.* settings
# Or reset to defaults:
{
  "nofx.maxAgents": 3,
  "nofx.autoAssignTasks": true,
  "nofx.claudePath": "claude",
  "nofx.useWorktrees": false
}
```

#### Clear Extension Data
```bash
# Remove persisted data
rm -rf .nofx/
rm -rf .nofx-worktrees/

# This removes:
# - Saved agents
# - Session history
# - Templates
# - Task queue
```

### Development Environment Reset

#### Complete Repository Reset
```bash
# WARNING: This removes all local changes
git clean -fdx  # Remove all untracked files
git reset --hard HEAD  # Reset to last commit

# Reinstall everything
npm install
npm run dev:setup
npm run build:validate

# Test basic functionality
npm run test:smoke
```

#### Dependency Reset
```bash
# Use the reset script for complete dependency refresh
npm run dev:reset

# If still having issues, manually clear npm cache
npm cache clean --force
npm install

# Verify installation
npm ls  # Check for errors
```

## 📊 Diagnostic Commands

### Extension Diagnostics

```typescript
// Add diagnostic command to extension
vscode.commands.registerCommand('nofx.diagnostics', async () => {
  const diagnostics = {
    version: packageJson.version,
    vscodeVersion: vscode.version,
    nodeVersion: process.version,
    platform: process.platform,
    extensionPath: context.extensionPath,
    globalStoragePath: context.globalStorageUri.fsPath,
    workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    activeAgents: agentManager.getAgents().length,
    wsServerRunning: orchestrationServer.isRunning(),
    commandsRegistered: await vscode.commands.getCommands(true)
      .then(cmds => cmds.filter(c => c.startsWith('nofx.')).length),
  };
  
  const output = vscode.window.createOutputChannel('NofX Command Verification');
  output.appendLine(JSON.stringify(diagnostics, null, 2));
  output.show();
});
```

### System Information

```bash
# Collect system info for bug reports
cat << EOF > system-info.txt
Date: $(date)
OS: $(uname -a)
Node: $(node --version)
NPM: $(npm --version)
VS Code: $(code --version)
Claude CLI: $(claude --version 2>/dev/null || echo "not installed")
Extension Version: $(grep version package.json | head -1)
EOF

cat system-info.txt
```

### Log Collection

```bash
# Collect all logs for debugging
mkdir -p nofx-debug-logs
cp -r .nofx/sessions/* nofx-debug-logs/
cp ~/Library/Application\ Support/Code/logs/*nofx* nofx-debug-logs/

# Create debug archive
tar -czf nofx-debug-$(date +%Y%m%d-%H%M%S).tar.gz nofx-debug-logs/
```

---

*This troubleshooting guide covers all common issues and their solutions. For additional help, please file an issue on GitHub with diagnostic information.*