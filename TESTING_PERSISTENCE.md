# Testing Agent Persistence

## Steps to Test Persistence:

1. **Reload VS Code Window**
   - Press `Cmd+R` in the VS Code window where you're testing the extension
   - Or use Command Palette: "Developer: Reload Window"

2. **Check Extension Activation**
   - Open the Output panel: View → Output
   - Select "Extension Host" from the dropdown
   - You should now see logs like:
     - `🎸 n of x Multi-Agent Orchestrator is now active!`
     - `[NofX] Workspace folder: /Volumes/Development/nofx-vscode`
     - `[NofX] Persistence initialized`

3. **Test Manual Restore**
   - Press `Cmd+Shift+P`
   - Type "NofX: Restore Saved Agents"
   - It should find the 2 test agents in `.nofx/agents.json`

4. **Alternative: Start Conductor**
   - Press `Cmd+Shift+P`
   - Type "NofX: Start Conductor"
   - It should prompt to restore saved agents automatically

## Test Data Location:
- `/Volumes/Development/nofx-vscode/.nofx/agents.json` - Contains 2 test agents

## If It's Still Not Working:

1. **Check Console for Errors**
   - Open Developer Tools: `Cmd+Option+I` (in the main VS Code window, not the test window)
   - Go to Console tab
   - Look for any errors related to NofX

2. **Verify Compilation**
   - Run: `npm run compile` in the terminal
   - Make sure no TypeScript errors

3. **Check Extension is Installed**
   - Go to Extensions view (`Cmd+Shift+X`)
   - Search for "NofX"
   - Make sure it shows as enabled

## Manual Testing in Terminal:
```bash
cd /Volumes/Development/nofx-vscode
cat .nofx/agents.json  # Verify test data exists
npm run compile        # Compile TypeScript
```

## Expected Behavior:
- On reload, you should get a prompt: "Found 2 saved agent(s). Restore them?"
- Or use manual command: "NofX: Restore Saved Agents"
- Agents should appear in the NofX sidebar with their saved state