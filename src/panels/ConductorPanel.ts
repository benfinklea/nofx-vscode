import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';

export class ConductorPanel {
    private static currentPanel: ConductorPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    public constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private agentManager: AgentManager,
        private taskQueue: TaskQueue
    ) {
        this.panel = panel;

        // Update content
        this.updateWebview();

        // Listen for agent and task updates
        this.agentManager.onAgentUpdate(() => this.updateWebview());
        this.taskQueue.onTaskUpdate(() => this.updateWebview());

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this.disposables
        );

        // Dispose on close
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static create(
        context: vscode.ExtensionContext,
        agentManager: AgentManager,
        taskQueue: TaskQueue
    ) {
        const panel = vscode.window.createWebviewPanel(
            'nofxConductor',
            'NofX Conductor',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ConductorPanel.currentPanel = new ConductorPanel(
            panel,
            context,
            agentManager,
            taskQueue
        );
    }

    public reveal() {
        this.panel.reveal();
    }

    private updateWebview() {
        const agents = this.agentManager.getActiveAgents();
        const tasks = this.taskQueue.getTasks();
        
        this.panel.webview.html = this.getWebviewContent(agents, tasks);
    }

    private handleMessage(message: any) {
        switch (message.command) {
            case 'addAgent':
                vscode.commands.executeCommand('nofx.addAgent');
                break;
            case 'createTask':
                vscode.commands.executeCommand('nofx.createTask');
                break;
            case 'removeAgent':
                this.agentManager.removeAgent(message.agentId);
                break;
        }
    }

    private getWebviewContent(agents: any[], tasks: any[]): string {
        const idleAgents = agents.filter(a => a.status === 'idle').length;
        const workingAgents = agents.filter(a => a.status === 'working').length;
        const queuedTasks = tasks.filter(t => t.status === 'queued').length;
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        
        // Generate detailed agent cards (removed - using inline HTML below)

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>NofX Conductor</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    margin: 0;
                }
                h1 {
                    color: var(--vscode-foreground);
                    border-bottom: 2px solid var(--vscode-panel-border);
                    padding-bottom: 10px;
                }
                .stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin: 20px 0;
                }
                .stat-card {
                    background: var(--vscode-panel-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 5px;
                    padding: 15px;
                }
                .stat-value {
                    font-size: 2em;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                .stat-label {
                    color: var(--vscode-descriptionForeground);
                    margin-top: 5px;
                }
                .agent-list, .task-list {
                    margin: 20px 0;
                }
                .agent-item, .task-item {
                    background: var(--vscode-panel-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 5px;
                    padding: 10px;
                    margin: 10px 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .agent-status, .task-status {
                    display: inline-block;
                    padding: 3px 8px;
                    border-radius: 3px;
                    font-size: 0.9em;
                }
                .status-idle {
                    background: var(--vscode-testing-iconPassed);
                    color: white;
                }
                .status-working {
                    background: var(--vscode-testing-iconQueued);
                    color: white;
                }
                .status-completed {
                    background: var(--vscode-testing-iconPassed);
                    color: white;
                }
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 15px;
                    border-radius: 3px;
                    cursor: pointer;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .actions {
                    margin: 20px 0;
                    display: flex;
                    gap: 10px;
                }
            </style>
        </head>
        <body>
            <h1>🎸 NofX Conductor</h1>
            
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-value">${agents.length}</div>
                    <div class="stat-label">Total Agents</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${workingAgents}</div>
                    <div class="stat-label">Working</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${idleAgents}</div>
                    <div class="stat-label">Idle</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${queuedTasks}</div>
                    <div class="stat-label">Queued Tasks</div>
                </div>
            </div>

            <div class="actions">
                <button onclick="addAgent()">➕ Add Agent</button>
                <button onclick="createTask()">📋 Create Task</button>
            </div>

            <h2>🤖 Active Agents</h2>
            <div class="agent-list">
                ${agents.map(agent => `
                    <div class="agent-item">
                        <div>
                            <strong>${agent.name}</strong> (${agent.type})
                            ${agent.currentTask ? `<br><small>Working on: ${agent.currentTask.title}</small>` : ''}
                        </div>
                        <div>
                            <span class="agent-status status-${agent.status}">${agent.status}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <h2>📋 Tasks</h2>
            <div class="task-list">
                ${tasks.slice(0, 10).map(task => `
                    <div class="task-item">
                        <div>
                            <strong>${task.title}</strong>
                            <br><small>${task.description.substring(0, 100)}...</small>
                        </div>
                        <div>
                            <span class="task-status status-${task.status}">${task.status}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function addAgent() {
                    vscode.postMessage({ command: 'addAgent' });
                }

                function createTask() {
                    vscode.postMessage({ command: 'createTask' });
                }
            </script>
        </body>
        </html>`;
    }

    public dispose() {
        ConductorPanel.currentPanel = undefined;
        this.panel.dispose();
        
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}