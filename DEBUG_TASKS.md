# Debugging Task Assignment Issues

## What Should Happen When You Create a Task

1. **Task Creation Flow:**
   - Enter title, description, priority
   - Task gets unique ID and added to queue
   - Console shows: `[NofX] Task created with ID: task-xxxxx`
   - Output Channel "NofX Debug" opens showing details

2. **Auto-Assignment Flow:**
   - System checks for idle agents
   - Console shows: `[NofX TaskQueue.tryAssignTasks] Auto-assign: true, Queue: 1, Idle agents: X`
   - If agents available, assigns task to best match
   - Console shows: `[NofX AgentManager.executeTask] Called for agent...`

3. **Claude Execution:**
   - Agent terminal opens
   - `claude` command is sent
   - System prompt sent (if template exists)
   - Task prompt sent after 2 seconds
   - Agent status changes to "working"

## How to Debug

### 1. Open Developer Console
In the Extension Development Host window:
- **Help → Toggle Developer Tools**
- Go to **Console** tab
- Filter by `[NofX]` to see extension logs

### 2. Check These Points

**A. After Starting Conductor:**
Look for:
```
[NofX AgentManager] Agent General Agent 1 ready. Total agents: 3
[NofX AgentManager] Agent statuses: ["General Agent 1: idle", "General Agent 2: idle", "General Agent 3: idle"]
```

**B. After Creating Task:**
Look for:
```
[NofX] Creating task...
[NofX] Task title: Your Title
[NofX] Active agents: 3, Idle agents: 3
[NofX TaskQueue] Creating task task-xxxxx
[NofX TaskQueue] Queue length: 1
[NofX TaskQueue.tryAssignTasks] Auto-assign: true, Queue: 1, Idle agents: 3
```

**C. During Assignment:**
Look for:
```
[NofX TaskQueue] Assigning task: Your Title
[NofX TaskQueue] About to execute task on agent agent-xxxxx
[NofX AgentManager.executeTask] Called for agent agent-xxxxx with task: Your Title
[NofX AgentManager.executeTask] Starting Claude with command: claude
```

### 3. Common Issues

**Issue: "Task added but not assigned"**
- Check console for idle agent count
- Verify agents show as "idle" in sidebar
- Check auto-assign is enabled in settings

**Issue: No console logs appear**
- Make sure you're in Extension Development Host
- Reload the window (Cmd+R)
- Check Developer Tools console for errors

**Issue: Task assigned but Claude doesn't start**
- Check agent's terminal for errors
- Verify `claude` command is available in PATH
- Try running `claude` manually in terminal

### 4. Output Channels

Check these VS Code output channels:
- **"NofX Debug"** - Shows task creation details
- **"n of x: [Agent Name]"** - Shows individual agent logs

### 5. Quick Test Sequence

1. Open Developer Tools Console
2. Start Conductor (Quick Start - 3 agents)
3. Wait for agents to initialize
4. Create a simple task:
   - Title: "Test task"
   - Description: "Create a hello world function"
   - Priority: Medium
5. Check console for full log sequence

### 6. Manual Task Assignment

If auto-assign isn't working:
1. Disable auto-assign in settings
2. Create task
3. In console, run: `taskQueue.assignNextTask()`
4. Check console for errors

## Expected Console Output

Full successful flow should show:
```
[NofX] Creating task...
[NofX] Task title: Test task
[NofX] Active agents: 3, Idle agents: 3
[NofX TaskQueue] Creating task task-1234567890-abc
[NofX TaskQueue] Queue length: 1
[NofX TaskQueue.tryAssignTasks] Auto-assign: true, Queue: 1, Idle agents: 3
[NofX TaskQueue] Assignment attempt 1
[NofX TaskQueue] Assigning task: Test task
[NofX AgentManager.executeTask] Called for agent agent-xxx with task: Test task
[NofX AgentManager.executeTask] Starting Claude with command: claude
[NofX AgentManager.executeTask] Sending initial prompt to Claude
[NofX AgentManager.executeTask] Sending task prompt: Please complete this task...
```

If you don't see this sequence, note where it stops and what error appears.