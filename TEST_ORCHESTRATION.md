# Testing the NofX Orchestration System

## Overview
This guide provides commands and scenarios to test the conductor-agent communication system with real file changes.

## Prerequisites
1. Install the extension: `npx vsce package && code --install-extension nofx-0.1.0.vsix --force`
2. Reload VS Code/Cursor
3. Ensure Claude CLI is installed and accessible

## Test Scenarios

### Scenario 1: Basic Team Setup with File Creation
**Objective**: Test conductor creating a team and agents creating files

1. **Start a Frontend Team**:
   - Click the NofX icon in the activity bar
   - Click "Start New Session"
   - Select "Frontend Team (3 agents)"
   - The conductor terminal should open with a 🎸 icon

2. **In the Conductor Terminal**, type these commands:
```
Please create a simple React todo app with the following structure:
- src/App.js - main application
- src/components/TodoList.js - todo list component
- src/components/TodoItem.js - individual todo item
- src/styles/App.css - basic styling

Assign tasks as follows:
{"type": "spawn", "role": "frontend-specialist", "name": "React Developer"}
{"type": "spawn", "role": "frontend-specialist", "name": "CSS Designer"}
{"type": "spawn", "role": "testing-specialist", "name": "Test Engineer"}

{"type": "assign", "agentId": "all", "task": "Create the React todo app structure"}
```

3. **Monitor Progress**:
   - Open Message Flow Dashboard: `Cmd+Shift+P` → "NofX: Open Message Flow"
   - Watch messages flow between conductor and agents
   - Check agent terminals to see them working

4. **Verify File Creation**:
   - Check if files are created in the project
   - If using worktrees, each agent works in their own branch
   - Run `git status` to see changes

### Scenario 2: Backend API Development
**Objective**: Test backend team creating an API

1. **Start a Backend Team**:
   ```
   Please create a REST API for a todo application with:
   - Express.js server
   - Routes for CRUD operations
   - MongoDB integration
   - Authentication middleware
   
   {"type": "spawn", "role": "backend-specialist", "name": "API Developer"}
   {"type": "spawn", "role": "database-architect", "name": "Database Expert"}
   {"type": "spawn", "role": "security-expert", "name": "Security Specialist"}
   
   {"type": "assign", "agentId": "agent-1", "task": "Create Express server with routes"}
   {"type": "assign", "agentId": "agent-2", "task": "Design MongoDB schema"}
   {"type": "assign", "agentId": "agent-3", "task": "Implement JWT authentication"}
   ```

2. **Check Agent Work**:
   - Click on agent names in sidebar to open their terminals
   - Watch them create files and write code
   - Check the output in their respective directories/worktrees

### Scenario 3: Full-Stack Development
**Objective**: Test coordinated full-stack development

1. **Complex Task Assignment**:
   ```
   Build a full-stack blog application:
   
   {"type": "spawn", "role": "fullstack-developer", "name": "Lead Developer"}
   {"type": "spawn", "role": "frontend-specialist", "name": "UI Developer"}
   {"type": "spawn", "role": "backend-specialist", "name": "API Developer"}
   {"type": "spawn", "role": "database-architect", "name": "Database Designer"}
   
   {"type": "assign", "agentId": "agent-1", "task": "Create project structure and setup build tools"}
   {"type": "assign", "agentId": "agent-2", "task": "Build React components for blog posts"}
   {"type": "assign", "agentId": "agent-3", "task": "Create Node.js API endpoints"}
   {"type": "assign", "agentId": "agent-4", "task": "Design database schema for posts and comments"}
   ```

### Scenario 4: Testing Worktree Integration
**Objective**: Test git worktrees for parallel development

1. **Enable Worktrees**:
   - `Cmd+Shift+P` → "NofX: Toggle Git Worktrees"
   - Restart VS Code

2. **Start Agents with Worktrees**:
   ```
   {"type": "spawn", "role": "frontend-specialist", "name": "Feature A Dev"}
   {"type": "spawn", "role": "backend-specialist", "name": "Feature B Dev"}
   
   {"type": "assign", "agentId": "agent-1", "task": "Add user profile page"}
   {"type": "assign", "agentId": "agent-2", "task": "Create user settings API"}
   ```

3. **Verify Worktrees**:
   - Run `git worktree list` in terminal
   - Check `.nofx-worktrees/` directory
   - Each agent should have their own branch

4. **Merge Agent Work**:
   - `Cmd+Shift+P` → "NofX: Merge Agent Work"
   - Select an agent
   - Check `git log` to see the merge

### Scenario 5: Real File Modifications
**Objective**: Test agents modifying existing files

1. **Create a test file** `test.js`:
   ```javascript
   function hello() {
       console.log("Hello World");
   }
   ```

2. **Ask agents to modify it**:
   ```
   {"type": "spawn", "role": "frontend-specialist", "name": "Code Improver"}
   
   {"type": "assign", "agentId": "agent-1", "task": "Refactor test.js to use ES6 syntax and add error handling"}
   ```

3. **Verify Changes**:
   - Open `test.js` to see modifications
   - Check git diff to see what changed

## Debugging Commands

### Check WebSocket Connection
```bash
# In VS Code terminal
lsof -i :7777  # Should show the WebSocket server
```

### View Agent Status
- Open the Message Flow Dashboard
- Check the Agents & Tasks sidebar
- Look for status indicators (idle/working)

### Monitor Conductor Output
- Open Output panel (`View` → `Output`)
- Select "NofX Conductor" from dropdown

### Check Worktree Status
```bash
git worktree list
ls -la .nofx-worktrees/
```

## Expected Behaviors

1. **Conductor Terminal**:
   - Shows with 🎸 icon
   - Accepts JSON commands embedded in natural language
   - Responds to task assignments

2. **Agent Terminals**:
   - Show with appropriate icons (frontend=🎨, backend=⚙️, etc.)
   - Display "Waiting for instructions" initially
   - Execute tasks when assigned

3. **File Changes**:
   - Agents create/modify files in their working directory
   - With worktrees: changes happen in separate branches
   - Without worktrees: changes happen in main workspace

4. **Message Flow Dashboard**:
   - Shows real-time message passing
   - Displays agent status changes
   - Tracks task assignments and completions

## Troubleshooting

### Agents Not Responding
- Check Claude CLI is installed: `claude --version`
- Verify terminal shows Claude prompt
- Check Output panel for errors

### Worktrees Not Creating
- Ensure you're in a git repository
- Check git version supports worktrees: `git worktree -h`
- Verify worktrees are enabled in settings

### Files Not Being Created
- Check agent has proper permissions
- Verify working directory is correct
- Look for errors in agent terminal

### WebSocket Not Connecting
- Check port 7777 is not in use
- Restart VS Code
- Check Output → "NofX Orchestration"

## Advanced Testing

### Stress Test
```
# Spawn maximum agents
{"type": "spawn", "role": "frontend-specialist", "name": "Agent 1"}
{"type": "spawn", "role": "backend-specialist", "name": "Agent 2"}
{"type": "spawn", "role": "testing-specialist", "name": "Agent 3"}
{"type": "spawn", "role": "devops-engineer", "name": "Agent 4"}
{"type": "spawn", "role": "database-architect", "name": "Agent 5"}

# Assign multiple tasks
{"type": "assign", "agentId": "all", "task": "Create a microservice"}
```

### Coordination Test
```
# Test agent coordination
{"type": "assign", "agentId": "agent-1", "task": "Create API specification"}
Wait for completion...
{"type": "assign", "agentId": "agent-2", "task": "Implement API based on agent-1's specification"}
```

## Success Criteria

✅ Conductor terminal opens and accepts commands
✅ Agents spawn in separate terminals
✅ Tasks are assigned and visible in agent terminals
✅ Files are created/modified in the workspace
✅ Message flow dashboard shows communication
✅ Worktrees create separate branches (if enabled)
✅ Agent work can be merged back to main branch
✅ WebSocket server runs on port 7777
✅ Agent status updates (idle → working → idle)
✅ Persistence saves/restores agent state

---

**Note**: The conductor uses Claude's ability to parse JSON from natural language, so you can mix instructions with commands naturally. The system is designed to handle real development tasks with actual file creation and modification.