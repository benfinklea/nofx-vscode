# CLAUDE.md - NofX VS Code Extension

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with the NofX VS Code extension.

## 🎸 Project Overview

NofX is a VS Code extension that orchestrates multiple AI agents (Claude instances) to work collaboratively on development tasks. It features a sophisticated conductor system that can manage agents, assign tasks, and coordinate complex workflows through a modern webview-based chat interface.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package extension (with dependencies)
npx vsce package

# Install in VS Code/Cursor
code --install-extension nofx-0.1.0.vsix --force

# Or for development (watch mode)
npm run watch
```

## 🏗️ Architecture Overview

### Core Components

#### 1. **Conductor System** (`src/conductor/`)
Three levels of conductor intelligence:

- **ConductorChat** - Basic terminal-based conductor
- **IntelligentConductor** - Smart conductor with enhanced capabilities  
- **SuperSmartConductor** - VP-level conductor with architectural decision-making
- **ConductorChatWebview** - Modern webview-based chat interface (PRIMARY)

#### 2. **WebSocket Orchestration** (`src/orchestration/`)
Real-time bi-directional communication system:

```
Conductor ←→ WebSocket Server (7777) ←→ Agents
                    ↓
         Message Flow Dashboard (Live View)
```

- **OrchestrationServer** - WebSocket server for message routing
- **MessageProtocol** - Standardized message types and formats
- **Message Types**: SPAWN_AGENT, ASSIGN_TASK, QUERY_STATUS, etc.

#### 3. **Agent Management** (`src/agents/`)
- **AgentManager** - Lifecycle management for AI agents
- **AgentTemplateManager** - JSON-based template system
- **AgentPersistence** - Save/restore agent state across sessions
- **Agent Types**: frontend, backend, testing, devops, security, database, mobile, AI/ML

#### 4. **Dashboard System** (`src/dashboard/`)
- **MessageFlowDashboard** - Real-time visualization of all orchestration messages
- **Live Message Stream** - See every message between conductor and agents
- **Agent Status Grid** - Visual representation of all connected agents
- **Metrics Panel** - Messages/min, success rate, active agents

#### 5. **Webview Components** (`webview/`)
- **chat.js/css** - Conductor chat interface
- **dashboard.js/css** - Message flow dashboard interface
- Modern, responsive design with VS Code theme integration

### File Structure

```
nofx-vscode/
├── src/
│   ├── conductor/           # Conductor implementations
│   │   ├── ConductorChatWebview.ts  # Main webview chat (PRIMARY)
│   │   ├── SuperSmartConductor.ts   # VP-level conductor
│   │   └── IntelligentConductor.ts  # Smart conductor
│   ├── orchestration/       # WebSocket communication
│   │   ├── OrchestrationServer.ts   # WebSocket server
│   │   └── MessageProtocol.ts       # Message definitions
│   ├── agents/             # Agent management
│   │   ├── AgentManager.ts          # Agent lifecycle
│   │   ├── AgentTemplateManager.ts  # Template system
│   │   └── AgentPersistence.ts      # State persistence
│   ├── dashboard/          # Dashboard components
│   │   └── MessageFlowDashboard.ts  # Live message flow
│   ├── tasks/              # Task management
│   │   └── TaskQueue.ts             # Task queue system
│   ├── views/              # VS Code tree views
│   │   ├── AgentTreeProvider.ts     # Agent sidebar
│   │   └── TaskTreeProvider.ts      # Task sidebar
│   └── extension.ts        # Main extension entry
├── webview/               # Webview UI components
│   ├── chat.js/css        # Conductor chat UI
│   └── dashboard.js/css   # Message flow UI
├── .nofx/                 # Extension data directory
│   ├── agents.json        # Active agents state
│   ├── sessions/          # Agent session logs
│   └── templates/         # Agent template definitions
└── package.json           # Extension manifest
```

## 💬 Conductor Chat System

### How It Works

1. **User Opens Chat**: Click NofX icon → Conductor chat opens automatically
2. **Claude Process**: Attempts to spawn Claude CLI, falls back to mock mode
3. **WebSocket Connection**: Connects to orchestration server on port 7777
4. **Message Handling**: User messages → Claude/Mock → Parse JSON commands → Execute

### Conductor Commands

The conductor understands JSON commands embedded in natural language:

```json
// Spawn a new agent
{"type": "spawn", "role": "frontend-specialist", "name": "UI Expert"}

// Assign a task
{"type": "assign", "agentId": "agent-1", "task": "Create login form", "priority": "high"}

// Query status
{"type": "status", "agentId": "all"}

// Terminate agent
{"type": "terminate", "agentId": "agent-2"}
```

### Mock Mode (Fallback)

When Claude CLI isn't available, the conductor uses intelligent mock responses:
- Detects keywords in user input
- Provides contextual responses
- Maintains conversation flow
- Simulates agent management

## 🔌 WebSocket Orchestration

### Message Flow

1. **Conductor sends command** → WebSocket Server
2. **Server routes message** → Target Agent(s)
3. **Agent processes task** → Sends status updates
4. **Server broadcasts updates** → Dashboard & Conductor
5. **Dashboard visualizes** → Real-time message flow

### Key Message Types

```typescript
enum MessageType {
    // Conductor → Agent
    SPAWN_AGENT = 'spawn_agent',
    ASSIGN_TASK = 'assign_task',
    QUERY_STATUS = 'query_status',
    TERMINATE_AGENT = 'terminate_agent',
    
    // Agent → Conductor
    AGENT_READY = 'agent_ready',
    TASK_PROGRESS = 'task_progress',
    TASK_COMPLETE = 'task_complete',
    AGENT_STATUS = 'agent_status',
    
    // System
    CONNECTION_ESTABLISHED = 'connection_established',
    HEARTBEAT = 'heartbeat'
}
```

## 🤖 Agent Templates

### Template Structure (.nofx/templates/*.json)

```json
{
  "id": "frontend-specialist",
  "name": "Frontend Specialist",
  "icon": "🎨",
  "systemPrompt": "You are a frontend expert...",
  "capabilities": ["React", "Vue", "CSS", "UI/UX"],
  "taskPreferences": {
    "preferred": ["ui", "styling", "components"],
    "avoid": ["backend", "database"]
  }
}
```

### Available Templates

- **frontend-specialist** - React, Vue, UI/UX
- **backend-specialist** - Node.js, Python, APIs
- **fullstack-developer** - End-to-end features
- **testing-specialist** - Unit tests, E2E, QA
- **devops-engineer** - CI/CD, Docker, Kubernetes
- **ai-ml-specialist** - Machine learning, AI integration
- **database-architect** - Schema design, optimization
- **security-expert** - Security audits, penetration testing
- **mobile-developer** - iOS, Android, React Native

## 📊 Message Flow Dashboard

### Features

- **Real-time Updates** - WebSocket connection for instant message display
- **Agent Status Grid** - Visual representation of all agents
- **Message Filtering** - By type, agent, or time range
- **Flow Visualization** - Animated message flow between entities
- **Metrics Panel** - Active agents, messages/min, success rate
- **Export Capability** - Save conversation flows as JSON

### Opening Dashboard

```typescript
// Command: "NofX: Open Message Flow Dashboard"
// Keyboard: Cmd+Shift+P → "NofX: Open Message Flow"
```

## 🔧 Extension Commands

| Command | Description |
|---------|------------|
| `nofx.openConductorChat` | Open conductor chat webview |
| `nofx.openMessageFlow` | Open message flow dashboard |
| `nofx.startConductor` | Start conductor selection |
| `nofx.quickStartChat` | Quick start with 3 agents |
| `nofx.addAgent` | Add new agent |
| `nofx.browseAgentTemplates` | Browse agent templates |
| `nofx.exportSessions` | Export agent sessions |
| `nofx.clearPersistence` | Clear all saved data |

## 🛠️ Development Guidelines

### Building the Extension

```bash
# Development build (watch mode)
npm run watch

# Production build
npm run compile

# Package extension WITH dependencies
npx vsce package

# Package without dependencies (don't use - breaks WebSocket)
npx vsce package --no-dependencies  # ❌ Avoid
```

### Testing

```bash
# Run tests
npm test

# Manual testing in VS Code
1. Press F5 to launch Extension Development Host
2. Click NofX icon in activity bar
3. Test conductor chat and dashboard
```

### Common Issues & Solutions

#### Issue: Conductor not responding
**Solution**: Extension falls back to mock mode when Claude CLI unavailable

#### Issue: WebSocket connection failed
**Solution**: Orchestration server starts automatically on extension activation

#### Issue: Extension not loading in Cursor
**Solution**: Cursor may need full restart (Cmd+Q) after installation

## 📝 Key Implementation Details

### Persistence System
- Agents saved to `.nofx/agents.json`
- Sessions stored in `.nofx/sessions/`
- Templates in `.nofx/templates/`
- Auto-restore on VS Code restart

### Auto-Open Conductor
```typescript
// When NofX icon clicked → Conductor chat opens
agentTreeView.onDidChangeVisibility(async (e) => {
    if (e.visible && !hasShownConductor) {
        await openConductorChatWebview();
    }
});
```

### Mock Claude Responses
```typescript
// Intelligent fallback when Claude CLI unavailable
if (text.includes('test') || text.includes('coverage')) {
    response = "Analyzing project for test coverage...";
}
```

## 🚀 Future Enhancements

### Planned Features
- [ ] Agent-to-agent communication
- [ ] Task dependency graphs
- [ ] Performance metrics tracking
- [ ] Cloud deployment support
- [ ] Multi-workspace support
- [ ] Custom agent creation UI
- [ ] Task templates library
- [ ] Integration with GitHub Projects

### Architecture Improvements
- [ ] Message persistence to database
- [ ] Distributed orchestration
- [ ] Agent pooling for performance
- [ ] WebRTC for P2P agent communication
- [ ] GraphQL API for dashboard

## 📚 Important Notes for Claude

### When Making Changes

1. **Always preserve the WebSocket orchestration** - It's core to agent communication
2. **Maintain mock mode fallback** - Not all users have Claude CLI installed
3. **Test in both VS Code and Cursor** - They handle extensions differently
4. **Include dependencies when packaging** - WebSocket (ws) module required
5. **Update both TypeScript and JavaScript** - Webview uses JS, extension uses TS

### Code Style

- Use TypeScript for all new source files
- Follow existing patterns for consistency
- Add JSDoc comments for public APIs
- Keep webview code vanilla JS (no build step)
- Use VS Code API properly (dispose handlers, etc.)

### Testing Approach

When testing changes:
1. Compile TypeScript: `npm run compile`
2. Package extension: `npx vsce package`
3. Install: `code --install-extension nofx-0.1.0.vsix --force`
4. Reload VS Code/Cursor completely
5. Test all major features:
   - Conductor chat responds
   - Dashboard shows messages
   - Agents can be spawned
   - Persistence works

## 🔗 Related Documentation

- [VS Code Extension API](https://code.visualstudio.com/api)
- [WebView API Guide](https://code.visualstudio.com/api/extension-guides/webview)
- [Tree View Guide](https://code.visualstudio.com/api/extension-guides/tree-view)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)

## 📞 Support & Debugging

### Debug Output Channels
- **NofX Orchestration** - WebSocket server logs
- **NofX Conductor** - Conductor process logs
- **Developer Tools** - Webview console (Help → Toggle Developer Tools)

### Common Debug Commands
```bash
# Check if extension is installed
code --list-extensions | grep nofx

# View extension folder (Cursor)
ls ~/.cursor/extensions/nofx.nofx-0.1.0/

# View extension data
ls .nofx/

# Check WebSocket server
lsof -i :7777
```

---

*This extension orchestrates the future of AI-assisted development. When multiple AI agents work together, amazing things happen! 🎸*