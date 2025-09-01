# Testing NofX VS Code Extension

## How to Test

1. **Open the extension in VS Code:**
   ```bash
   cd /Volumes/Development/nofx-vscode
   code .
   ```

2. **Run the extension in development mode:**
   - Press `F5` in VS Code to launch a new Extension Development Host window
   - Or use `Run > Start Debugging`

3. **In the Extension Development Host window:**

   ### Start the Conductor
   - Open Command Palette (`Cmd+Shift+P`)
   - Run `NofX: Start Conductor`
   - Select a team configuration (e.g., "Quick Start" for 3 general agents)
   
   ### Check Agent Status
   - Look at the NofX sidebar panel (left side)
   - You should see agents listed under "Agents"
   - Check the terminal panel - each agent should have its own terminal tab
   
   ### Create a Task
   - Open Command Palette (`Cmd+Shift+P`)
   - Run `NofX: Create Task`
   - Enter task details:
     - Title: "Test task"
     - Description: "Please create a hello world function"
     - Priority: Medium
   
   ### What Should Happen
   When you create a task:
   1. Task appears in the "Task Queue" sidebar
   2. If auto-assign is enabled (default), the task is immediately assigned to an idle agent
   3. You'll see a notification: "📋 Task assigned to [Agent Name]"
   4. The agent's terminal will show the Claude Code command being executed
   5. The agent's status changes from "idle" to "working"
   
   ### Monitor Progress
   - Click on the NofX tab in the bottom panel to see all agent terminals
   - Watch the agent's terminal for Claude Code output
   - The task will complete when Claude finishes

## Debugging

### Check Developer Console
- In the Extension Development Host: `Help > Toggle Developer Tools`
- Look for `[NofX]` prefixed console logs

### Current Flow
1. Task created → added to queue
2. `tryAssignTasks()` called → checks for idle agents
3. `assignNextTask()` → selects best agent
4. `agentManager.executeTask()` → sends prompt to Claude
5. Terminal shows Claude command execution

## Known Issues to Fix

1. **Claude Code CLI Integration:**
   - Currently sends prompt via echo pipe: `echo 'prompt' | claude`
   - May need adjustment based on actual Claude Code CLI syntax
   
2. **Task Completion Detection:**
   - Currently uses a 15-second interval check
   - Prompts user to confirm completion after 30 seconds of inactivity
   
3. **Agent Status:**
   - Agents start as 'idle' and should accept tasks immediately
   - If tasks aren't being assigned, check console for errors

## Quick Commands

```bash
# View compiled output
cat /Volumes/Development/nofx-vscode/out/extension.js

# Check TypeScript compilation
npm run compile

# Watch for changes
npm run watch
```