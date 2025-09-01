# Quick Claude Testing Guide

## Test the Claude Command

1. **Reload Extension**: Press `Cmd+R` in Extension Development Host

2. **Run Test Command**:
   - `Cmd+Shift+P`
   - Type: "NofX: Test Claude Command"
   - Press Enter

3. **Watch the Terminal**:
   - A "Claude Test" terminal opens
   - Shows the command being used
   - Sends a simple test prompt: "Write a simple hello world function in JavaScript"

## If Test Doesn't Work

1. **Try Different Styles**:
   - Open Settings: `Cmd+,`
   - Search: "nofx.claudeCommandStyle"
   - Try each option:
     - `simple` - Uses: `echo 'prompt' | claude`
     - `interactive` - Starts claude, waits, then sends prompt
     - `heredoc` - Uses: `claude << EOF` syntax
     - `file` - Creates temp file then pipes to claude

2. **After changing style**, run test command again

## Manual Terminal Test

Open a regular terminal and try these:

```bash
# Test 1: Simple pipe
echo 'Write hello world' | claude

# Test 2: Interactive
claude
# Then type: Write hello world

# Test 3: Heredoc
claude << 'EOF'
Write hello world
EOF

# Test 4: File redirect
echo 'Write hello world' > /tmp/test.txt
claude < /tmp/test.txt
```

## Which Style to Use?

- **simple**: If Claude accepts piped input (most Unix-like)
- **interactive**: If Claude only works in interactive mode
- **heredoc**: Good for multi-line prompts
- **file**: Most reliable but slower

## Still Not Working?

Claude might need special flags. Try in terminal:
```bash
claude --help
```

Look for options like:
- `--stdin` to read from stdin
- `-` to read from stdin (common pattern)
- `--prompt` for inline prompts

Then modify the extension code in `AgentManager.ts` line ~227 to add the flag.