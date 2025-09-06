# NofX VS Code Extension Testing Guide

## 🚀 Automated Testing

### Running Test Suites

```bash
# Run all tests
npm run test:all

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:functional    # Functional tests only
npm run test:smoke         # Quick smoke tests
npm run test:e2e           # End-to-end tests

# Run tests in CI environment
npm run test:ci

# Generate test coverage report
npm run test:coverage
```

### Test File Organization

```
src/test/
├── functional/             # Comprehensive functional tests
│   ├── CommandSmokeTests.test.ts       # All package.json commands
│   ├── ConductorWorkflows.test.ts      # Conductor operations
│   ├── AgentLifecycle.test.ts          # Agent management
│   ├── TaskManagement.test.ts          # Task operations
│   ├── UIComponents.test.ts            # UI testing
│   ├── OrchestrationIntegration.test.ts # WebSocket & messaging
│   ├── ErrorHandling.test.ts           # Error scenarios
│   └── MetricsAndPersistence.test.ts   # Metrics & data
├── integration/            # Integration tests
├── unit/                   # Unit tests
└── utils/
    ├── TestHelpers.ts      # Existing test utilities
    └── ExtensionTestHelpers.ts # Extension-specific utilities
```

## ✅ Manual Testing Checklist

### Extension Installation and Activation

- [ ] **Install VSIX package in VS Code/Cursor**
  ```bash
  npx vsce package
  code --install-extension nofx-0.1.0.vsix --force
  ```
- [ ] **Verify NofX activity bar icon appears**
- [ ] **Check that all views are registered** (nofx.dev, nofx.agents, nofx.tasks)
- [ ] **Confirm extension activates without errors** in output channel
- [ ] **Verify status bar item appears** with NofX branding

### Command Palette Integration

- [ ] **Open command palette** (Cmd/Ctrl+Shift+P)
- [ ] **Search for "NofX" commands**
- [ ] **Verify all package.json commands are available** (37 commands)
- [ ] **Test command descriptions and icons** display correctly
- [ ] **Confirm commands execute** without throwing errors

### Conductor Workflows

- [ ] **Execute `NofX: Start Conductor`** command
- [ ] **Test team preset selection** (Full-Stack, Testing, Mobile, AI/ML, Startup)
  - [ ] Full-Stack Development Team (4 agents)
  - [ ] Testing & QA Team (3 agents)
  - [ ] Mobile Development Team (3 agents)
  - [ ] AI/ML Team (3 agents)
  - [ ] Startup MVP Team (2 agents)
  - [ ] Custom Team (individual selection)
- [ ] **Verify agents are created** according to preset
- [ ] **Confirm conductor terminal opens** with correct system prompt
- [ ] **Test `NofX: Quick Start with Conductor Chat`** workflow
  - [ ] Web Application
  - [ ] Backend API
  - [ ] Mobile App
  - [ ] Full-Stack Application
  - [ ] Library/Package
- [ ] **Verify project type selection** creates appropriate agents

### Agent Management

- [ ] **Test `NofX: Add Agent`** with individual agent selection
  - [ ] Frontend Specialist
  - [ ] Backend Specialist
  - [ ] Full-Stack Developer
  - [ ] Testing Specialist
  - [ ] DevOps Engineer
  - [ ] Mobile Developer
  - [ ] AI/ML Specialist
  - [ ] Database Architect
  - [ ] Security Expert
- [ ] **Verify agent template selection** and creation
- [ ] **Test agent editing** (name, role, capabilities)
  - [ ] Rename Agent
  - [ ] Change Agent Type
  - [ ] Edit Capabilities (verify warning)
- [ ] **Confirm agent deletion** with confirmation dialog
- [ ] **Test agent terminal focus** functionality
- [ ] **Verify agent restoration** from previous sessions

### Task Management

- [ ] **Test `NofX: Create Task`** with full configuration
  - [ ] Task description input
  - [ ] Priority selection (High/Medium/Low)
  - [ ] Tags input (comma-separated)
  - [ ] Required capabilities selection
  - [ ] Estimated duration input
  - [ ] Dependencies selection
  - [ ] File context gathering
- [ ] **Verify task priority**, tags, and capabilities input
- [ ] **Test task dependency creation** and validation
  - [ ] Add dependency
  - [ ] Remove dependency
  - [ ] View dependencies
  - [ ] Circular dependency prevention
- [ ] **Confirm task completion** and status updates
- [ ] **Test task conflict resolution** workflows
  - [ ] Keep Blocked
  - [ ] Force Allow
  - [ ] Merge Tasks
  - [ ] Retry blocked task
  - [ ] Resolve all conflicts
- [ ] **Verify task batch creation** functionality (1-10 tasks)

### UI Components

- [ ] **Verify agent tree displays** active agents correctly
- [ ] **Test agent tree expand/collapse** functionality
- [ ] **Confirm task tree shows** tasks grouped by status
  - [ ] Validated
  - [ ] Ready
  - [ ] In-Progress
  - [ ] Blocked
  - [ ] Assigned
  - [ ] Queued
  - [ ] Completed
  - [ ] Failed
- [ ] **Test task tree drag-and-drop** for dependencies
- [ ] **Verify context menus** work on tree items
- [ ] **Test tree refresh** on data changes

### Conductor Interfaces

- [ ] **Test conductor terminal** with Claude CLI integration
  - [ ] Basic Conductor (1-3 agents)
  - [ ] Intelligent Conductor (4-7 agents)
  - [ ] SuperSmart Conductor (8+ agents)
- [ ] **Verify conductor chat webview** functionality
- [ ] **Test conductor panel** creation and interaction
- [ ] **Confirm conductor system prompt** generation
- [ ] **Test different conductor types** based on team size

### Orchestration and Messaging

- [ ] **Test message flow dashboard** opening
- [ ] **Verify WebSocket connection** status (check the Orchestration server status for the actual port)
- [ ] **Test message routing** and validation
- [ ] **Confirm orchestration server** startup/shutdown
- [ ] **Test error handling** for network issues
- [ ] **Verify message types**:
  - [ ] SPAWN_AGENT
  - [ ] ASSIGN_TASK
  - [ ] TASK_ACCEPTED/REJECTED
  - [ ] TASK_PROGRESS/COMPLETE
  - [ ] AGENT_READY/STATUS
  - [ ] QUERY_STATUS
  - [ ] TERMINATE_AGENT
  - [ ] SYSTEM_ERROR
  - [ ] HEARTBEAT

### Configuration and Settings

- [ ] **Test NofX configuration options** in VS Code settings
  - [ ] claudePath
  - [ ] testMode
  - [ ] useWorktrees
  - [ ] enableMetrics
- [ ] **Verify configuration validation** and error reporting
- [ ] **Test workspace-specific configuration**
- [ ] **Confirm configuration changes** take effect
- [ ] **Test test mode configuration** (disables noisy services)

### Git Worktrees (if enabled)

- [ ] **Toggle worktrees** with `NofX: Toggle Git Worktrees`
- [ ] **Verify worktree creation** for each agent
- [ ] **Test agent work isolation** in separate branches
- [ ] **Merge agent work** with `NofX: Merge Agent Work`
- [ ] **Clean up worktrees** with `NofX: Cleanup Worktrees`

### Metrics and Persistence

- [ ] **Test metrics dashboard** display
- [ ] **Verify metrics export** functionality
  - [ ] Counter metrics (agents created, tasks completed)
  - [ ] Gauge metrics (active agents, queued tasks)
  - [ ] Histogram metrics (operation durations)
- [ ] **Test session export** and archiving
- [ ] **Confirm agent and task persistence** across restarts
- [ ] **Test persistence data clearing** with confirmation

### Error Scenarios

- [ ] **Test behavior with no workspace open**
- [ ] **Verify error handling for missing Claude CLI**
- [ ] **Test graceful degradation** with network issues
- [ ] **Confirm error messages** are user-friendly
- [ ] **Test recovery** from various error states:
  - [ ] Service initialization failures
  - [ ] Agent creation errors
  - [ ] Task validation errors
  - [ ] File system errors
  - [ ] WebSocket connection errors

### Performance and Stability

- [ ] **Test extension with large numbers** of agents/tasks (10+)
- [ ] **Verify memory usage** remains reasonable
- [ ] **Test concurrent operations** (multiple commands)
- [ ] **Confirm extension deactivation** cleans up resources
- [ ] **Test extension behavior** during VS Code shutdown

### Integration Testing

- [ ] **Test extension with real Claude CLI** if available
- [ ] **Verify git worktree integration** (if enabled)
- [ ] **Test file context gathering** from active editors
- [ ] **Confirm terminal integration** works correctly
- [ ] **Test extension with different** workspace configurations

## 🔍 Debugging

### Development Mode

1. **Open the extension in VS Code:**
   ```bash
   cd /Volumes/Development/nofx-vscode
   code .
   ```

2. **Run the extension in development mode:**
   - Press `F5` in VS Code to launch Extension Development Host
   - Or use `Run > Start Debugging`

### Developer Console

- In Extension Development Host: `Help > Toggle Developer Tools`
- Look for `[NofX]` prefixed console logs
- Check for errors in:
  - Console tab
  - Network tab (for WebSocket connections)
  - Sources tab (for breakpoints)

### Output Channels

- **NofX Orchestration**: WebSocket server logs
- **NofX Conductor**: Conductor process logs
- **NofX Extension**: General extension logs

### Common Debug Commands

```bash
# Check if extension is installed
code --list-extensions | grep nofx

# View extension folder
ls ~/.vscode/extensions/nofx.nofx-*/

# View extension data
ls .nofx/

# Check WebSocket server (check logs for the actual port)
# The server uses a dynamic port reported in the Orchestration server status

# View compiled output
cat out/extension.js | grep -A 10 "activate"

# Check TypeScript compilation
npm run compile

# Watch for changes
npm run watch

# Run linter
npm run lint

# Check types
npm run typecheck
```

## 📊 Test Coverage Goals

- **Unit Tests**: 80% coverage minimum
- **Integration Tests**: Core workflows covered
- **Functional Tests**: All commands tested
- **E2E Tests**: Critical user journeys
- **Performance Tests**: < 3s activation time

## 🐛 Known Issues & Workarounds

### Claude CLI Integration
- **Issue**: System prompt may not submit properly
- **Workaround**: Use `--append-system-prompt` flag
- **Status**: Fixed in current implementation

### Task Completion Detection
- **Issue**: 15-second interval check may be slow
- **Workaround**: Manual completion confirmation after 30s
- **Status**: Acceptable for current use

### WebSocket Reconnection
- **Issue**: Client may not auto-reconnect
- **Workaround**: Restart orchestration server
- **Status**: Reconnection logic implemented

### Worktree Conflicts
- **Issue**: Multiple agents modifying same files
- **Workaround**: Use git worktrees (enabled by default)
- **Status**: Resolved with worktree implementation

## 📝 Test Reporting

### After Testing

1. **Document any issues found** in GitHub Issues
2. **Update this checklist** with new test cases
3. **Record performance metrics** for comparison
4. **Note any error messages** or unexpected behavior
5. **Suggest improvements** to testing process

### Test Results Format

```markdown
## Test Run: [Date]
- **Environment**: VS Code [version] / Cursor [version]
- **OS**: macOS/Windows/Linux [version]
- **Extension Version**: [version]
- **Tests Passed**: X/Y
- **Issues Found**: [list]
- **Performance**: Activation time: Xms
- **Notes**: [observations]
```

## 🎯 Quick Test Scenarios

### Scenario 1: Basic Agent Creation
1. Start Conductor → Select "Startup MVP Team"
2. Verify 2 agents created
3. Check terminals opened
4. Confirm agents appear in tree view

### Scenario 2: Task Flow
1. Create task "Build a TODO app"
2. Set priority: High
3. Add tags: "frontend, react"
4. Verify task assigned to Frontend Specialist
5. Monitor terminal for Claude execution

### Scenario 3: Error Recovery
1. Disconnect network
2. Try to create agent
3. Verify error message appears
4. Reconnect network
5. Retry agent creation
6. Confirm success

### Scenario 4: Performance Test
1. Create 10 agents
2. Create 50 tasks
3. Monitor memory usage
4. Verify UI remains responsive
5. Clean up all resources