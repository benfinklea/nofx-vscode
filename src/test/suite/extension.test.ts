import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('nofx.nofx'));
  });

  test('Extension should activate and register commands', async () => {
    const ext = vscode.extensions.getExtension('nofx.nofx');
    assert.ok(ext);
    
    await ext.activate();
    
    // Check that a contributed command is registered
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('nofx.addAgent'), 'nofx.addAgent command should be registered');
  });
});