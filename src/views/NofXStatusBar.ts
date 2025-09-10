import * as vscode from 'vscode';
import { getAppStateStore } from '../state/AppStateStore';
import * as selectors from '../state/selectors';

/**
 * Simplified Status Bar - Shows essential NofX status
 */
export class NofXStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private store = getAppStateStore();

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

        // Listen to state changes
        this.store.on('stateChanged', () => {
            this.update();
        });

        this.statusBarItem.command = 'nofx.showQuickPick';
        this.statusBarItem.show();
        this.update();
    }

    private update(): void {
        const state = this.store.getState('agents');
        const agentCount = selectors.getActiveAgents(state as any).length;
        const taskCount = selectors.getActiveTasks(state as any).length;

        this.statusBarItem.text = `$(rocket) NofX: ${agentCount} agents, ${taskCount} tasks`;
        this.statusBarItem.tooltip = 'Click for NofX menu';
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
