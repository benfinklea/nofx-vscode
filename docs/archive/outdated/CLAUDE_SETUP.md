# NofX Claude Integration

## Current Status

✅ **Working:**
- Task creation and queueing
- Task assignment to agents  
- Agent status tracking
- Terminal creation for each agent

⚠️ **Issue:** The `claude` command execution in terminals

## How It Works Now

When you create a task:
1. Task is added to queue ✅
2. Task is assigned to an idle agent ✅
3. Agent's terminal opens ✅
4. Terminal shows task info ✅
5. Terminal runs `claude` command ⚠️

## The Claude Command Issue

The extension sends the `claude` command to the terminal, but:
- If Claude CLI is not installed, the command fails
- If Claude CLI is installed but not in PATH, it fails
- Even with Claude installed, interactive mode might not accept piped input

## Manual Workaround

After creating a task:

1. **Look at the agent's terminal** - It will show:
   ```
   === NofX Task Assignment ===
   Agent: Agent-1
   Task: your task title
   Starting Claude Code...
   ```

2. **If `claude` command failed**, manually start Claude:
   - Click in the terminal
   - Type `claude` (or full path if needed)
   - Press Enter

3. **Copy the task prompt** that appears after 2 seconds and paste it into Claude

## Permanent Solutions

### Option 1: Install Claude CLI
```bash
# If Claude Code CLI is available via npm (check Anthropic docs)
npm install -g @anthropic-ai/claude-code

# Or download from Anthropic's official source
```

### Option 2: Update Claude Path
1. When starting conductor, click "Change Path" 
2. Enter the full path to Claude executable
3. Or enter a different command that works on your system

### Option 3: Use Alternative Commands
In VS Code settings (Cmd+,), search for "nofx.aiPath" and set it to:
- `cursor` - if using Cursor's AI
- `/usr/local/bin/claude` - full path
- Custom script that accepts prompts

## What Should Happen

When everything is configured correctly:
1. Task assigned to agent
2. Terminal opens and clears
3. Shows task assignment info
4. Runs `claude` command
5. After 2 seconds, sends the full prompt to Claude
6. Claude processes the task and makes code changes

## Testing

1. **Check if Claude is available:**
   ```bash
   which claude
   # or
   claude --version
   ```

2. **Test in a regular terminal first:**
   ```bash
   echo "Write a hello world function" | claude
   ```

3. **If that works**, the extension should work too

## Current Behavior

The extension is successfully:
- Managing agents ✅
- Creating and assigning tasks ✅  
- Opening terminals ✅
- Sending commands ✅

The only issue is the `claude` command itself not being found or not accepting input.

## Debug Output

When you create a task, you should see in the console:
```
[NofX AgentManager.executeTask] Sending prompt to terminal
[NofX AgentManager.executeTask] Claude command sent: claude
[NofX AgentManager.executeTask] Sending prompt to Claude
```

And a notification: "📝 Task prompt sent to Agent-1. Check the terminal to see Claude's response."