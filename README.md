# NofX - Multi-Agent Orchestrator for VS Code

🎸 **Orchestrate multiple Claude Code agents working in parallel on your codebase, all from within VS Code!**

## 📚 Table of Contents

- [✨ Features](#-features)
- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
- [🎯 Usage Examples](#-usage-examples)
- [⚙️ Configuration](#️-configuration)
- [📝 Scripts Reference](#-scripts-reference)
- [🔧 Development](#-development)
- [📖 Documentation](#-documentation)
- [🐛 Troubleshooting](#-troubleshooting)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## ✨ Features

- **🎼 Conductor Panel** - Central orchestration of multiple AI agents
- **🤖 Multiple Agent Types** - Frontend, Backend, Testing, Documentation specialists
- **📋 Task Queue** - Distribute tasks to appropriate agents automatically
- **🔄 Parallel Execution** - Multiple agents work simultaneously
- **📊 Real-time Monitoring** - See what each agent is doing
- **🔗 GitHub Integration** - Agents can create branches and PRs
- **🧠 Smart Task Prioritization** - Tasks automatically boost priority of their dependencies

## 📦 Installation

### Prerequisites
1. **VS Code** 1.85.0 or higher
2. **Claude Code CLI** (optional for building/testing; required for agent features):
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
3. **Git** installed and configured

### Install Extension
1. Open VS Code
2. Press `Cmd+Shift+X` (Mac) or `Ctrl+Shift+X` (Windows/Linux)
3. Search for "NofX"
4. Click Install

## 🚀 Quick Start

### 1. Start the Conductor
- Click the NofX icon in the Activity Bar (left sidebar)
- Or press `Cmd+Shift+P` and run "NofX: Start Conductor"

### 2. Add Agents
- Click the "+" button in the Agents view
- Select agent type (Frontend, Backend, Testing, etc.)
- Agent spawns in its own terminal

### 3. Create Tasks
- Click the "+" button in the Task Queue view
- Enter task title and description
- Task is automatically assigned to the best available agent

### 4. Watch Agents Work
- Each agent has its own terminal and output channel
- See real-time execution of Claude Code
- Monitor task progress in the Activity view

## 🎯 Usage Examples

### Example 1: Add Dark Mode
```typescript
// Create task
Title: "Add dark mode support"
Description: "Implement a dark mode toggle in the settings page with CSS variables"

// Frontend Specialist agent will:
1. Analyze existing CSS structure
2. Create CSS variables for themes
3. Add toggle component
4. Update settings page
```

### Example 2: API Endpoint
```typescript
// Create task
Title: "Create user profile API"
Description: "Add GET/PUT endpoints for user profile at /api/user/profile"

// Backend Specialist agent will:
1. Create route handlers
2. Add validation
3. Implement database queries
4. Add tests
```

### Example 3: Multiple Agents Working Together
```typescript
// Task 1 -> Frontend Agent
"Create login form component"

// Task 2 -> Backend Agent  
"Create authentication API"

// Task 3 -> Testing Agent
"Add E2E tests for login flow"

// All three work simultaneously!
```

### Example 4: Smart Task Prioritization
```typescript
// High priority deployment task
const deployTask = {
  id: "deploy-to-production",
  priority: 100,
  prefers: ["integration-test"] // Boosts integration test priority
};

// Low priority test task gets automatically boosted
const testTask = {
  id: "integration-test", 
  priority: 10 // Will be boosted to 15 when deploy task is queued
};

// When integration test completes, deploy task gets priority boost!
```

## 🧠 Smart Task Prioritization

NofX includes intelligent dependency-aware prioritization that automatically boosts task priorities based on soft dependencies.

### How It Works

- **Soft Dependencies**: Use the `prefers` field to specify which tasks should be prioritized
- **Automatic Boosting**: When a preferred task completes, dependent tasks get priority boosts
- **Smart Ordering**: High-priority tasks can influence the execution order of their dependencies

### Example Scenario

```typescript
// Low priority integration test
{
  id: "integration-test",
  priority: 10,
  command: "npm test"
}

// High priority deployment that needs the test
{
  id: "deploy-to-production",
  priority: 100,
  prefers: ["integration-test"], // Boosts test priority
  command: "npm run deploy"
}
```

**What happens:**
1. Integration test runs first (lowest priority)
2. When test completes, deploy task gets priority boost (100 → 105)
3. Deploy task moves to front of queue automatically

For detailed configuration and advanced usage, see [DEPENDENCY_PRIORITIZATION.md](DEPENDENCY_PRIORITIZATION.md).

## ⚙️ Configuration

Access settings: `Code > Preferences > Settings > Extensions > NofX`

```json
{
  "nofx.maxAgents": 3,
  "nofx.agentTypes": [
    "Frontend Specialist",
    "Backend Specialist",
    "Testing Specialist",
    "Documentation Writer",
    "General Purpose"
  ],
  "nofx.aiPath": "claude",
  "nofx.autoAssignTasks": true
}
```

## 🏗️ Architecture

```
VS Code Extension
├── Conductor (Main Orchestrator)
│   ├── Task Queue Manager
│   └── Agent Coordinator
├── Agent Manager
│   ├── Agent 1 Terminal (Claude Code Instance)
│   ├── Agent 2 Terminal (Claude Code Instance)
│   └── Agent 3 Terminal (Claude Code Instance)
└── UI Components
    ├── Sidebar Views (Agents, Tasks, Activity)
    ├── Conductor Panel (WebView)
    └── Status Bar Item
```

## 🤖 How It Works

1. **Extension starts** → Initializes conductor
2. **Agents spawn** → Each gets a VS Code terminal
3. **Tasks created** → Added to priority queue
4. **Auto-assignment** → Tasks matched to best agent
5. **Claude Code executes** → Agent runs `claude` CLI with task
6. **Real-time updates** → Progress shown in UI
7. **Task completes** → Agent becomes available for next task

## ⌨️ Keyboard Shortcuts

- `Cmd+Shift+O` / `Ctrl+Shift+O` - Show Orchestrator
- `Cmd+Shift+P` → "NofX" - All commands

## 🔧 Commands

- `NofX: Start Conductor` - Initialize the orchestrator
- `NofX: Add Agent` - Spawn a new agent
- `NofX: Create Task` - Add task to queue
- `NofX: Show Orchestrator` - Open conductor panel

## 📊 Agent Types

### Frontend Specialist
Best for: UI components, styling, React/Vue/Angular, accessibility

### Backend Specialist  
Best for: APIs, databases, server logic, authentication

### Testing Specialist
Best for: Unit tests, integration tests, E2E tests

### Documentation Writer
Best for: README files, API docs, code comments

### General Purpose
Best for: Any task, refactoring, bug fixes

## 🛠️ Development Setup

Setting up the development environment for NofX extension development:

### Prerequisites
- **Node.js 18+** - Required for TypeScript and build tools
- **TypeScript** - `npm install -g typescript`
- **VS Code or Cursor** - Development and testing environment
- **Git** - Version control and Git hooks
- **Claude CLI** (optional) - For building and manual testing; required for agent functionality

### Quick Start Development
```bash
# Clone the repository
git clone https://github.com/nofx/nofx-vscode.git
cd nofx-vscode

# Install dependencies and set up hooks
npm install
npm run dev:setup

# Build the extension
npm run build

# Or use the automated build script
./build.sh                    # Build and package only
./build.sh --install-cursor   # Also install to Cursor (macOS)

# Start development mode with file watching
npm run watch
```

### Development Environment Configuration
```json
// .vscode/settings.json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "eslint.enable": true,
  "editor.formatOnSave": true
}
```

## 🏗️ Building the Extension

Comprehensive build instructions for different scenarios:

### Quick Build
```bash
# Build and package only (default)
./build.sh

# Build, package, and install to Cursor (macOS only)
./build.sh --install-cursor

# View available options
./build.sh --help

# Or manual build
npm run build
```

### Development Builds
```bash
# Compile TypeScript only
npm run compile

# Watch mode for development
npm run watch

# Clean build (removes artifacts first)
npm run build:clean

# Validated build (with comprehensive checks)
npm run build:validate

# CI-ready build (full validation and testing)
npm run build:ci
```

### Build Scripts Overview
- `npm run compile` - TypeScript compilation only
- `npm run build` - Complete build with VSIX packaging
- `npm run build:clean` - Clean build from scratch
- `npm run build:validate` - Build with validation checks
- `npm run watch` - Development mode with auto-rebuild

### VSIX Packaging
```bash
# Package extension with dependencies
npx vsce package

# Install in VS Code
# Install the latest VSIX (replace <version> with actual version)
code --install-extension nofx-*.vsix --force
# Or use the latest file:
VSIX=$(ls -1t nofx-*.vsix 2>/dev/null | head -1)
[ -n "$VSIX" ] && code --install-extension "$VSIX" --force

# Install in Cursor
# For Cursor users (replace <version> with actual version)
cursor --install-extension nofx-*.vsix --force
```

## 🧪 Testing

Comprehensive testing workflow for quality assurance:

### Test Suite Overview
- **Unit Tests** - Service classes and utilities
- **Integration Tests** - Service interactions and workflows
- **Functional Tests** - Extension commands and UI
- **E2E Tests** - Complete user workflows
- **Smoke Tests** - Quick validation checks

### Running Tests
```bash
# Run all tests
npm run test:all

# Specific test suites
npm run test:unit          # Fast unit tests
npm run test:integration   # Service integration tests
npm run test:functional    # Extension functionality
npm run test:e2e           # End-to-end tests
npm run test:smoke         # Quick smoke tests

# Test with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# CI environment testing
npm run test:ci
```

### Manual Testing
```bash
# Run manual testing checklist
npm run test:manual

# Build validation tests
npm run test:build
```

### Test Coverage Requirements
- Minimum 80% code coverage
- All new features must include tests
- Bug fixes must include regression tests

## 🔧 Development Workflow

Best practices for NofX extension development:

### Git Hooks and Validation
```bash
# Set up Git hooks (pre-commit, pre-push)
npm run hooks:install

# Verify hooks are working
npm run hooks:verify

# Fix hooks configuration if needed
npm run hooks:verify:fix

# Test hooks
npm run hooks:test

# Uninstall hooks
npm run hooks:uninstall
```

## 📝 Scripts Reference

*All scripts are sourced from `package.json`. To regenerate this list, run `npm run print:commands` or `node scripts/print-scripts.js`.*

### Build & Compile Scripts
- `npm run compile` - Compile TypeScript to JavaScript (`tsc -p ./tsconfig.build.json`)
- `npm run build` - Compile and package extension as VSIX (`npm run compile && npx vsce package`)
- `npm run build:clean` - Clean artifacts and rebuild (`rimraf out nofx-*.vsix && npm run build`)
- `npm run build:validate` - Build with full validation (`npm run compile && npm run validate:all && npm run build`)
- `npm run build:ci` - CI build with tests and validation (`npm run test:ci && npm run build:validate`)
- `npm run watch` - Watch mode for development (`tsc -watch -p ./tsconfig.build.json`)
- `npm run package` - Package extension (`npx vsce package`)
- `npm run vscode:prepublish` - Pre-publish hook (`npm run compile`)
- `npm run postcompile` - Post-compile validation (`./scripts/validate-build.sh --quiet || true`)
- `npm run prepackage` - Pre-package hook (`npm run compile`)

### Test Scripts
- `npm test` - Run all Jest tests (`jest`)
- `npm run test:unit` - Run unit tests only (`MOCK_FS=true jest --testPathPattern=unit`)
- `npm run test:integration` - Run integration tests (`jest --testPathPattern=integration`)
- `npm run test:functional` - Run functional tests (`MOCK_FS=false tsc -p ./tsconfig.test.json && node ./out/test/functional/runFunctionalTests.js`)
- `npm run test:smoke` - Run smoke tests (`jest --testPathPattern=CommandSmokeTests`)
- `npm run test:e2e` - Run end-to-end tests (`MOCK_FS=false tsc -p ./tsconfig.test.json && node ./out/test/runTests.js`)
- `npm run test:persistence` - Test persistence (`MOCK_FS=false jest --testPathPattern=MetricsAndPersistence`)
- `npm run test:all` - Run all test suites (`npm run test:unit && npm run test:integration && npm run test:functional`)
- `npm run test:ci` - Full CI test pipeline (`npm run compile && npm run lint && npm run test:all`)
- `npm run test:manual` - Open manual test checklist (`echo 'Opening manual test checklist...' && code test-extension.md`)
- `npm run test:watch` - Watch mode for tests (`jest --watch`)
- `npm run test:coverage` - Generate coverage report (`jest --coverage --coverageDirectory=coverage --coverageReporters=text,lcov,html`)
- `npm run test:build` - Test build validation (`npm run compile && jest --testPathPattern=build/BuildValidation`)
- `npm run test:commands` - Test command registration (`jest --testPathPattern=commands/CommandRegistration`)
- `npm run test:services` - Test service container (`jest --testPathPattern=services/ContainerValidation`)
- `npm run pretest` - Pre-test hook (`npm run compile && npm run lint`)

### Validation Scripts
- `npm run validate:build` - Validate build output (`./scripts/validate-build.sh`)
- `npm run validate:commands` - Validate command registration (`node ./scripts/validate-commands.js`)
- `npm run validate:services` - Validate service container via tests (`npm run test:services`)
- `npm run validate:all` - Run all validations (`npm run validate:build && npm run validate:commands && npm run validate:services`)
- `npm run lint` - Run ESLint (`eslint src --ext ts`)

### Development Scripts
- `npm run dev:setup` - Setup development environment (`./scripts/install-hooks.sh`)
- `npm run dev:validate` - Quick validation for development (`npm run compile && npm run validate:build --quiet`)
- `npm run dev:clean` - Clean development artifacts (`rimraf out coverage nofx-*.vsix`)
- `npm run dev:reset` - Full reset (`rimraf out coverage node_modules nofx-*.vsix && npm install && npm run compile`)

### Git Hooks Scripts
- `npm run hooks:install` - Install git hooks (`./scripts/install-hooks.sh`)
- `npm run hooks:uninstall` - Uninstall git hooks (`./scripts/install-hooks.sh uninstall`)
- `npm run hooks:test` - Test git hooks (`./scripts/install-hooks.sh test`)
- `npm run hooks:verify` - Verify hooks configuration (`./scripts/verify-hooks.sh`)
- `npm run hooks:verify:fix` - Fix hooks configuration (`./scripts/verify-hooks.sh --fix`)
- `npm run prepare` - Husky prepare hook (`husky`)

### QA Scripts
- `npm run qa:full` - Full QA pipeline (`npm run compile && npm run lint && npm run test:all && npm run validate:all`)
- `npm run qa:quick` - Quick QA check (`npm run compile && npm run validate:build`)
- `npm run qa:pre-commit` - Pre-commit validation (`npm run compile && npm run validate:build --quiet`)

### Utility Scripts
- `npm run print:commands` - Print all registered commands (`node ./scripts/print-commands.js`)

### Quality Assurance
```bash
# Run full QA suite
npm run qa:full

# Quick QA checks
npm run qa:quick

# Validate all components
npm run validate:all
npm run validate:commands
npm run validate:services  # Runs Jest tests for service validation
npm run validate:build
```

### Code Quality
```bash
# Run linter
npm run lint

# Auto-fix lint issues (not exposed as npm script)
npx eslint src --ext ts --fix

# Format code (if Prettier is configured)
npx prettier . --write
```

### Common Fallback Commands
For functionality not exposed as npm scripts:
- **Clean all including node_modules**: `npx rimraf out coverage nofx-*.vsix node_modules`
- **List VSIX contents**: `npx vsce ls`
- **Install extension**: `code --install-extension nofx-*.vsix --force`

## 🐛 Debugging & Troubleshooting

### Extension Development Debugging
1. Open project in VS Code: `code .`
2. Press `F5` to launch Extension Development Host
3. Set breakpoints in TypeScript source files
4. Open Output panel for debugging information

### Output Channels
Monitor these output channels for debugging:
- **NofX** - Main extension logs and status updates
- **NofX - Orchestration** - WebSocket server and message routing
- **NofX Conductor Brain** - Intelligent conductor decision-making
- **NofX VP Brain 🧠** - Strategic VP-level planning
- **NofX Analyzer** - Codebase analysis and intelligence
- **NofX Command Verification** - Command registration validation
- **NofX Test** - Test execution and debugging

### Common Issues and Solutions

#### Missing `out/extension.js`
```bash
# This is the most common issue - the extension needs to be compiled first
npm run compile
# Then verify the file exists
ls out/extension.js
```

#### TypeScript Compilation Errors
```bash
# Check for TypeScript errors
npx tsc --noEmit
# Clean and rebuild
npm run build:clean
```

#### Extension Won't Install
```bash
# Completely remove old versions
rm -rf ~/.vscode/extensions/nofx.nofx-*
# Force install
# Install the latest VSIX (replace <version> with actual version)
code --install-extension nofx-*.vsix --force
# Or use the latest file:
VSIX=$(ls -1t nofx-*.vsix 2>/dev/null | head -1)
[ -n "$VSIX" ] && code --install-extension "$VSIX" --force
# Restart VS Code/Cursor
```

#### Command Registration Issues
```bash
# Validate commands are properly registered
npm run validate:commands
# Check package.json matches implementation
```

#### Service Container Errors
```bash
# Validate service container setup
npm run validate:services
# Check for circular dependencies
```

#### WebSocket Connection Issues
- Check port availability (uses dynamic port)
- Verify Output → NofX Orchestration for server logs
- Check firewall settings
- Restart extension

#### Build Failures
```bash
# Try cleaning build artifacts first
npm run dev:clean
npm run build:validate

# If issues persist, do a full reset
npm run dev:reset
npm run build:validate
```

### Performance Debugging
- Use VS Code's built-in performance profiler
- Monitor memory usage in Task Manager
- Check for memory leaks with heap snapshots
- Profile extension activation time

## 📖 Documentation

For detailed documentation, see the following guides:

- **[Developer Guide](./DEVELOPER_GUIDE.md)** - Complete development setup and workflow
- **[Build Guide](./BUILD_GUIDE.md)** - Build processes and optimization
- **[Testing Guide](./TESTING_GUIDE.md)** - Testing strategies and best practices
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[Debugging Guide](./DEBUGGING.md)** - Debugging techniques and tools
- **[Contributing Guide](./CONTRIBUTING.md)** - How to contribute to the project
- **[Architecture Overview](./ARCHITECTURE.md)** - System design and components
- **[Security Guidelines](./SECURITY.md)** - Security best practices
- **[Dependency Prioritization](./DEPENDENCY_PRIORITIZATION.md)** - Dependency management strategy

### Debug Commands
The extension includes special debug commands:
- `nofx.debug.verifyCommands` - Validate all command registrations

### Output Channels
The extension creates the following output channels for debugging:

| Channel Name | Purpose | When Created |
|-------------|---------|--------------|
| **NofX** | General extension messages and status updates | Extension activation |
| **NofX - Orchestration** | WebSocket server and message routing logs | First WebSocket connection or server start |
| **NofX Conductor Brain** | Intelligent conductor decision-making and reasoning | Intelligent Conductor initialization |
| **NofX VP Brain 🧠** | Strategic VP-level planning and architecture decisions | VP Conductor initialization |
| **NofX Analyzer** | Codebase analysis and intelligence gathering | First code analysis request |
| **NofX Command Verification** | Command registration validation and verification | Debug command execution |
| **NofX Test** | Test execution and debugging information | Test suite initialization |

Access via: View → Output → Select channel from dropdown

### VS Code CLI Installation
To use the `code` command in your terminal:
1. Open VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "Shell Command: Install 'code' command in PATH"
4. Select the command and press Enter

For Cursor users, the `cursor` command should be available automatically.

## 📁 Project Structure

Understanding the NofX extension architecture:

```
nofx-vscode/
├── src/                      # Source code
│   ├── agents/              # Agent management
│   ├── commands/            # Command implementations
│   ├── conductor/           # Conductor implementations
│   ├── dashboard/           # Dashboard components
│   ├── orchestration/       # WebSocket server
│   ├── panels/              # Webview panels
│   ├── persistence/         # State persistence
│   ├── services/            # Core services
│   ├── tasks/               # Task management
│   ├── templates/           # Templates
│   ├── test/                # Test suites
│   │   ├── unit/           # Unit tests
│   │   ├── integration/    # Integration tests
│   │   └── functional/     # Functional tests
│   ├── types/               # TypeScript types
│   ├── ui/                  # UI components
│   ├── views/               # Tree view providers
│   ├── worktrees/           # Git worktree management
│   └── extension.ts         # Main entry point
├── out/                     # Compiled JavaScript (generated)
├── webview/                 # Webview assets
├── scripts/                 # Build and utility scripts
├── .vscode/                 # VS Code configuration
├── .husky/                  # Git hooks
├── package.json             # Extension manifest
├── tsconfig.json            # TypeScript config
├── jest.config.js           # Jest test config
└── build.sh                 # Build automation script
```

### Key Files
- `src/extension.ts` - Main extension entry point
- `package.json` - Extension manifest and commands
- `tsconfig.json` - TypeScript compilation settings
- `build.sh` - Automated build script (use --install-cursor for optional install)

## 🚀 Deployment

### Creating a Release Build
```bash
# Full release build with validation
npm run build:ci

# Package for distribution
npx vsce package

# Verify package contents
npx vsce ls
```

### Installation Methods
```bash
# Command line installation
code --install-extension nofx-*.vsix

# Manual installation
1. Open VS Code
2. Go to Extensions view (Cmd+Shift+X)
3. Click "..." menu → "Install from VSIX..."
4. Select the .vsix file
```

### Version Management
```json
// Update version in package.json
{
  "version": "0.1.0"
}
```

### Publishing to Marketplace
```bash
# Login to publisher account
npx vsce login <publisher>

# Publish to marketplace
npx vsce publish
```

## 🚨 Troubleshooting

### "Claude Code not found"
```bash
# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

### "No agents available"
- Start the conductor first
- Check terminals - each agent runs in a terminal
- Add agents via the UI or command

### "Tasks not being assigned"
- Enable auto-assign in settings
- Ensure agents are idle (not working on other tasks)
- Check agent specialization matches task type

## 🔮 Roadmap

- [ ] Agent communication/collaboration
- [ ] Visual task dependencies
- [ ] Custom agent types
- [ ] Task templates
- [ ] Performance metrics
- [ ] Multi-repository support
- [ ] Cloud deployment option

## 🤝 Contributing

Contributions welcome! This is an open-source project.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

For detailed contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built on top of Claude Code CLI by Anthropic
- Inspired by the need for parallel AI development
- Thanks to the VS Code extension API

---

**Made with 🎸 by the NofX team**

*Transform your development workflow with orchestrated AI agents!*