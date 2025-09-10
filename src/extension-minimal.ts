import * as vscode from 'vscode';
import { getAppStateStore } from './state/AppStateStore';
import * as selectors from './state/selectors';
import * as actions from './state/actions';
console.log('[NofX Debug] Minimal extension module loading...');

export async function activate(context: vscode.ExtensionContext) {
    console.log('[NofX Debug] Minimal extension activation started');

    try {
        // Create a simple output channel
        const outputChannel = vscode.window.createOutputChannel('NofX');
        outputChannel.appendLine('🎸 NofX Multi-Agent Orchestrator is now active! (Minimal Mode)');

        // Register a simple test command
        const testCommand = vscode.commands.registerCommand('nofx.testCommand', () => {
            console.log('[NofX Debug] Test command executed!');
            vscode.window.showInformationMessage('NofX Test Command Works! 🎉 (Minimal Mode)');
            outputChannel.appendLine('Test command executed successfully');
        });
        context.subscriptions.push(testCommand);

        // Register start conductor command
        const startConductorCommand = vscode.commands.registerCommand('nofx.startConductor', () => {
            console.log('[NofX Debug] Start conductor command executed!');
            vscode.window.showInformationMessage('NofX Conductor Starting... 🎵 (Minimal Mode)');
            outputChannel.appendLine('Conductor command executed successfully');
        });
        context.subscriptions.push(startConductorCommand);

        // Register other basic commands
        const commands = [
            'nofx.openConductorTerminal',
            'nofx.openMessageFlow',
            'nofx.restoreAgents',
            'nofx.addAgent',
            'nofx.browseAgentTemplates',
            'nofx.exportSessions',
            'nofx.clearPersistence',
            'nofx.toggleWorktrees',
            'nofx.mergeAgentWork',
            'nofx.showOrchestrator'
        ];

        commands.forEach(commandId => {
            const command = vscode.commands.registerCommand(commandId, () => {
                console.log(`[NofX Debug] ${commandId} executed!`);
                vscode.window.showInformationMessage(`${commandId} executed! (Minimal Mode)`);
                outputChannel.appendLine(`${commandId} executed successfully`);
            });
            context.subscriptions.push(command);
        });

        // Create a simple status bar item
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.text = '$(organization) NofX (Minimal)';
        statusBarItem.tooltip = 'Multi-Agent Orchestrator (Minimal Mode)';
        statusBarItem.command = 'nofx.showOrchestrator';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        console.log('[NofX Debug] Minimal extension activated successfully');
        outputChannel.appendLine('Extension activated in minimal mode');
    } catch (error) {
        console.error('[NofX Debug] Minimal extension activation failed:', error);
        vscode.window.showErrorMessage(`NofX Extension (Minimal) failed to activate: ${error}`);
        throw error;
    }
}

export async function deactivate(): Promise<void> {
    console.log('[NofX Debug] Minimal extension deactivating...');
}
