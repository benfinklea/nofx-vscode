# NofX - Multi-Agent Orchestrator for VS Code

🎸 **Orchestrate multiple Claude Code agents working in parallel on your codebase, all from within VS Code!**

## ✨ Features

- **🎼 Conductor Panel** - Central orchestration of multiple AI agents
- **🤖 Multiple Agent Types** - Frontend, Backend, Testing, Documentation specialists
- **📋 Task Queue** - Distribute tasks to appropriate agents automatically
- **🔄 Parallel Execution** - Multiple agents work simultaneously
- **📊 Real-time Monitoring** - See what each agent is doing
- **🔗 GitHub Integration** - Agents can create branches and PRs

## 📦 Installation

### Prerequisites
1. **VS Code** 1.85.0 or higher
2. **Claude Code CLI** installed:
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
  "nofx.claudePath": "claude",
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

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built on top of Claude Code CLI by Anthropic
- Inspired by the need for parallel AI development
- Thanks to the VS Code extension API

---

**Made with 🎸 by the NofX team**

*Transform your development workflow with orchestrated AI agents!*