# Testing Claude Integration

## Quick Test

1. **Reload Extension Host**: Press `Cmd+R` in the Extension Development Host window

2. **Open Settings**: `Cmd+,` and search for "nofx"

3. **Try Different Command Styles**:
   - `nofx.claudeCommandStyle`: Try each option:
     - `pipe` (default): Uses `echo "prompt" | claude`
     - `direct`: Uses `claude "prompt"`
     - `heredoc`: Uses `claude << EOF` syntax
     - `file`: Creates temp file, then `claude < /tmp/file.txt`

4. **Test Each Style**:
   - Change the setting
   - Start Conductor (Quick Start)
   - Create a simple task:
     - Title: "test"
     - Description: "write hello world"
     - Priority: Medium
   - Watch the agent's terminal to see if Claude responds

## What Each Style Does

### pipe (default)
```bash
echo "Your prompt here" | claude
```
- Most common Unix pipe pattern
- Should work if Claude accepts stdin

### direct  
```bash
claude "Your prompt here"
```
- Passes prompt as command argument
- Works if Claude accepts prompts as arguments

### heredoc
```bash
claude << 'NOFX_EOF'
Your prompt here
Multiple lines
NOFX_EOF
```
- Best for multi-line prompts
- Standard Unix heredoc syntax

### file
```bash
cat > /tmp/nofx-prompt.txt << 'NOFX_EOF'
Your prompt here
NOFX_EOF
claude < /tmp/nofx-prompt.txt
```
- Creates temp file first
- Then redirects file to Claude stdin
- Most reliable for complex prompts

## Debugging

In the terminal, you should see:
1. Task assignment header
2. The Claude command being executed
3. Claude's response (if it works)

If Claude isn't responding:
1. Try running the command manually in a terminal
2. Check if Claude needs different flags/options
3. Check Claude's documentation for how it accepts input

## Manual Test

Open a regular terminal and test:
```bash
# Test 1: Pipe
echo "Write a hello world function" | claude

# Test 2: Direct (if supported)
claude "Write a hello world function"

# Test 3: Heredoc
claude << 'EOF'
Write a hello world function
EOF

# Test 4: File
echo "Write a hello world function" > /tmp/test.txt
claude < /tmp/test.txt
```

Whichever works in your terminal should work with that setting in the extension.

## If Nothing Works

Claude might require:
- Interactive mode only (won't accept piped input)
- Special flags to accept stdin
- A different invocation pattern

Check Claude's help:
```bash
claude --help
claude -h
man claude
```

Look for options like:
- `--stdin` or `-` to read from stdin
- `--prompt` or `-p` for inline prompts
- `--file` or `-f` for file input

Then update the command in the extension code to match.