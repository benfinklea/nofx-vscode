import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { AGENT_TEMPLATES, AGENT_GROUPS } from '../agents/templates';

export class EnhancedConductorPanel {
    private static currentPanel: EnhancedConductorPanel | undefined;
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
    ): EnhancedConductorPanel {
        const panel = vscode.window.createWebviewPanel(
            'nofxConductor',
            'NofX Conductor - Agent Orchestration Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        EnhancedConductorPanel.currentPanel = new EnhancedConductorPanel(
            panel,
            context,
            agentManager,
            taskQueue
        );
        
        return EnhancedConductorPanel.currentPanel;
    }


    private updateWebview() {
        const agents = this.agentManager.getActiveAgents();
        const tasks = this.taskQueue.getTasks();
        
        this.panel.webview.html = this.getWebviewContent(agents, tasks);
    }

    private handleMessage(message: any) {
        switch (message.command) {
            case 'spawnAgentGroup':
                this.spawnAgentGroup(message.groupName);
                break;
            case 'spawnCustomAgent':
                this.spawnCustomAgent(message.templateKey);
                break;
            case 'createTask':
                vscode.commands.executeCommand('nofx.createTask');
                break;
            case 'removeAgent':
                this.agentManager.removeAgent(message.agentId);
                break;
            case 'viewAgentPrompt':
                this.showAgentPrompt(message.agentId);
                break;
            case 'editAgent':
                vscode.commands.executeCommand('nofx.editAgent', message.agentId);
                break;
            case 'completeTask':
                vscode.commands.executeCommand('nofx.completeTask');
                break;
            case 'toggleTheme':
                this.toggleTheme(message.theme);
                break;
        }
    }

    private async spawnAgentGroup(groupName: string) {
        const group = AGENT_GROUPS[groupName];
        if (!group) return;

        vscode.window.showInformationMessage(`🚀 Spawning ${group.name}...`);
        
        for (const template of group.agents) {
            await this.agentManager.spawnAgent({
                type: template.type,
                name: template.name,
                template: template
            });
        }
    }

    private async spawnCustomAgent(templateKey: string) {
        const template = AGENT_TEMPLATES[templateKey];
        if (!template) return;

        await this.agentManager.spawnAgent({
            type: template.type,
            name: template.name,
            template: template
        });
    }

    private showAgentPrompt(agentId: string) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent || !agent.template) return;

        const prompt = agent.template.systemPrompt;
        const doc = vscode.workspace.openTextDocument({
            content: prompt,
            language: 'markdown'
        });
        
        doc.then(d => vscode.window.showTextDocument(d));
    }

    private toggleTheme(theme: string) {
        this.context.globalState.update('nofxTheme', theme);
        this.updateWebview();
    }

    private getWebviewContent(agents: any[], tasks: any[]): string {
        const idleAgents = agents.filter(a => a.status === 'idle').length;
        const workingAgents = agents.filter(a => a.status === 'working').length;
        const queuedTasks = tasks.filter(t => t.status === 'queued').length;
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const currentTheme = this.context.globalState.get('nofxTheme', 'light') as string;
        const hasActiveAgents = agents.length > 0;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>NofX Conductor Dashboard</title>
            <style>
                :root {
                    --primary-bg: #ffffff;
                    --secondary-bg: #f5f5f5;
                    --panel-bg: #fafafa;
                    --text-primary: #333333;
                    --text-secondary: #666666;
                    --border-color: #e0e0e0;
                    --button-bg: #007acc;
                    --button-hover: #005a9e;
                    --success-color: #4caf50;
                    --warning-color: #ff9800;
                    --card-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                body.dark-theme {
                    --primary-bg: #1e1e1e;
                    --secondary-bg: #252526;
                    --panel-bg: #2d2d30;
                    --text-primary: #d4d4d4;
                    --text-secondary: #969696;
                    --border-color: #3c3c3c;
                    --button-bg: #0e639c;
                    --button-hover: #1177bb;
                    --success-color: #89d185;
                    --warning-color: #ffab40;
                    --card-shadow: 0 2px 8px rgba(0,0,0,0.3);
                }
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    color: var(--text-primary);
                    background-color: var(--primary-bg);
                    padding: 20px;
                    line-height: 1.6;
                    transition: background-color 0.3s ease, color 0.3s ease;
                }
                
                h1 {
                    font-size: 28px;
                    margin-bottom: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .theme-toggle {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 5px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 14px;
                    transition: all 0.3s ease;
                }
                
                .theme-toggle:hover {
                    background: var(--secondary-bg);
                }
                
                .theme-toggle-icon {
                    font-size: 18px;
                }
                
                h2 {
                    font-size: 20px;
                    margin: 30px 0 15px;
                    color: var(--button-bg);
                }
                
                .dashboard-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .stats-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                }
                
                .stat-card {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 15px;
                    text-align: center;
                    box-shadow: var(--card-shadow);
                    transition: all 0.3s ease;
                }
                
                .stat-value {
                    font-size: 32px;
                    font-weight: bold;
                    color: var(--button-bg);
                }
                
                .stat-label {
                    font-size: 12px;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .agent-templates {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 20px;
                    box-shadow: var(--card-shadow);
                    transition: all 0.3s ease;
                }
                
                .template-groups {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 10px;
                    margin-bottom: 20px;
                }
                
                .template-group-btn {
                    background: var(--button-bg);
                    color: white;
                    border: none;
                    padding: 12px;
                    border-radius: 5px;
                    cursor: pointer;
                    text-align: center;
                    transition: all 0.2s;
                }
                
                .template-group-btn:hover {
                    background: var(--button-hover);
                    transform: translateY(-2px);
                }
                
                .template-group-btn .group-name {
                    font-weight: bold;
                    display: block;
                    margin-bottom: 4px;
                }
                
                .template-group-btn .group-desc {
                    font-size: 11px;
                    opacity: 0.8;
                }
                
                .agent-card {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 15px;
                    box-shadow: var(--card-shadow);
                    transition: all 0.3s ease;
                }
                
                .agent-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: start;
                    margin-bottom: 10px;
                }
                
                .agent-info {
                    flex: 1;
                }
                
                .agent-icon {
                    font-size: 24px;
                    margin-right: 10px;
                }
                
                .agent-name {
                    font-size: 16px;
                    font-weight: bold;
                    margin-bottom: 4px;
                }
                
                .agent-type {
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin-bottom: 8px;
                }
                
                .agent-capabilities {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 5px;
                    margin-bottom: 10px;
                }
                
                .capability-tag {
                    background: var(--button-bg);
                    color: white;
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 11px;
                    opacity: 0.8;
                }
                
                .agent-status {
                    padding: 4px 12px;
                    border-radius: 15px;
                    font-size: 12px;
                    font-weight: bold;
                    text-transform: uppercase;
                }
                
                .status-idle {
                    background: var(--success-color);
                    color: white;
                }
                
                .status-working {
                    background: var(--warning-color);
                    color: white;
                }
                
                .agent-task {
                    background: var(--secondary-bg);
                    padding: 10px;
                    border-radius: 5px;
                    margin-top: 10px;
                }
                
                .task-title {
                    font-weight: bold;
                    margin-bottom: 4px;
                }
                
                .task-description {
                    font-size: 12px;
                    color: var(--text-secondary);
                }
                
                .agent-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 10px;
                }
                
                .btn-small {
                    background: var(--secondary-bg);
                    color: var(--text-primary);
                    border: 1px solid var(--border-color);
                    padding: 4px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s;
                }
                
                .btn-small:hover {
                    background: var(--panel-bg);
                }
                
                .individual-templates {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                    gap: 8px;
                    margin-top: 15px;
                }
                
                .template-btn {
                    background: var(--secondary-bg);
                    color: var(--text-primary);
                    border: 1px solid var(--border-color);
                    padding: 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    text-align: center;
                    transition: all 0.2s;
                }
                
                .template-btn:hover {
                    background: var(--panel-bg);
                }
                
                .section-divider {
                    border-top: 1px solid var(--border-color);
                    margin: 30px 0;
                }
                
                .quick-actions {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                
                .btn-primary {
                    background: var(--button-bg);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: all 0.2s;
                }
                
                .btn-primary:hover {
                    background: var(--button-hover);
                }
                
                .collapsible-section {
                    margin-bottom: 20px;
                }
                
                .collapsible-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: pointer;
                    user-select: none;
                    padding: 5px 0;
                }
                
                .collapsible-header:hover {
                    opacity: 0.8;
                }
                
                .collapsible-arrow {
                    transition: transform 0.3s ease;
                    margin-right: 8px;
                }
                
                .collapsible-arrow.collapsed {
                    transform: rotate(-90deg);
                }
                
                .collapsible-content {
                    overflow: hidden;
                    transition: max-height 0.3s ease, opacity 0.3s ease;
                    max-height: 1000px;
                    opacity: 1;
                }
                
                .collapsible-content.collapsed {
                    max-height: 0;
                    opacity: 0;
                }
            </style>
        </head>
        <body class="${currentTheme === 'dark' ? 'dark-theme' : ''}">
            <h1>
                <div class="header-left">🎸 NofX Conductor Dashboard</div>
                <button class="theme-toggle" onclick="toggleTheme()">
                    <span class="theme-toggle-icon">${currentTheme === 'dark' ? '☀️' : '🌙'}</span>
                    <span>${currentTheme === 'dark' ? 'Light' : 'Dark'} Mode</span>
                </button>
            </h1>
            
            <div class="stats-container">
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
                    <div class="stat-label">Available</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${queuedTasks}</div>
                    <div class="stat-label">Queued Tasks</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${completedTasks}</div>
                    <div class="stat-label">Completed</div>
                </div>
            </div>

            <div class="quick-actions">
                <button class="btn-primary" onclick="createTask()">📋 Create New Task</button>
                <button class="btn-primary" onclick="completeTask()">✅ Mark Task Complete</button>
            </div>

            <div class="agent-templates collapsible-section">
                <div class="collapsible-header" onclick="toggleSpawnSection()">
                    <h2 style="margin: 0; display: flex; align-items: center;">
                        <span class="collapsible-arrow ${hasActiveAgents ? 'collapsed' : ''}" id="spawnArrow">▼</span>
                        🚀 Spawn Agent Teams
                    </h2>
                    ${hasActiveAgents ? '<span style="font-size: 12px; color: var(--vscode-descriptionForeground);">Team already spawned</span>' : ''}
                </div>
                <div class="collapsible-content ${hasActiveAgents ? 'collapsed' : ''}" id="spawnContent">
                    <div class="template-groups">
                        ${Object.entries(AGENT_GROUPS).map(([key, group]) => `
                            <button class="template-group-btn" onclick="spawnAgentGroup('${key}')">
                                <span class="group-name">${group.name}</span>
                                <span class="group-desc">${group.description}</span>
                            </button>
                        `).join('')}
                    </div>
                    
                    <h3 style="margin-top: 20px; margin-bottom: 10px;">Individual Agents</h3>
                    <div class="individual-templates">
                        ${Object.entries(AGENT_TEMPLATES).map(([key, template]) => `
                            <button class="template-btn" onclick="spawnCustomAgent('${key}')">
                                ${template.icon} ${template.name.split(' ')[0]}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>

            <div class="section-divider"></div>

            <h2>🤖 Active Agents</h2>
            ${agents.length === 0 ? '<p>No agents running. Spawn a team above!</p>' : ''}
            
            ${agents.map(agent => `
                <div class="agent-card">
                    <div class="agent-header">
                        <div class="agent-info">
                            <div>
                                <span class="agent-icon">${agent.template?.icon || '🤖'}</span>
                                <span class="agent-name">${agent.name}</span>
                            </div>
                            <div class="agent-type">${agent.template?.specialization || agent.type}</div>
                            ${agent.template ? `
                                <div class="agent-capabilities">
                                    ${agent.template.capabilities.map((cap: string) => 
                                        `<span class="capability-tag">${cap}</span>`
                                    ).join('')}
                                </div>
                            ` : ''}
                        </div>
                        <span class="agent-status status-${agent.status}">${agent.status}</span>
                    </div>
                    
                    ${agent.currentTask ? `
                        <div class="agent-task">
                            <div class="task-title">📋 ${agent.currentTask.title}</div>
                            <div class="task-description">${agent.currentTask.description}</div>
                        </div>
                    ` : ''}
                    
                    <div class="agent-actions">
                        <button class="btn-small" onclick="editAgent('${agent.id}')">
                            ✏️ Edit
                        </button>
                        <button class="btn-small" onclick="viewAgentPrompt('${agent.id}')">
                            📄 Prompt
                        </button>
                        <button class="btn-small" onclick="removeAgent('${agent.id}')">
                            ❌ Remove
                        </button>
                    </div>
                </div>
            `).join('')}

            <div class="section-divider"></div>

            <h2>📋 Task Queue</h2>
            ${tasks.length === 0 ? '<p>No tasks in queue. Create a task above!</p>' : ''}
            
            ${tasks.map(task => `
                <div class="agent-card">
                    <div class="agent-header">
                        <div>
                            <div class="task-title">${task.title}</div>
                            <div class="task-description">${task.description}</div>
                            <div style="margin-top: 8px;">
                                <span class="capability-tag">Priority: ${task.priority}</span>
                                <span class="capability-tag">Status: ${task.status}</span>
                                ${task.assignedTo ? `<span class="capability-tag">Assigned</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}

            <script>
                const vscode = acquireVsCodeApi();
                const AGENT_GROUPS = ${JSON.stringify(AGENT_GROUPS)};
                const AGENT_TEMPLATES = ${JSON.stringify(AGENT_TEMPLATES)};
                let currentTheme = '${currentTheme}';

                function spawnAgentGroup(groupName) {
                    vscode.postMessage({ command: 'spawnAgentGroup', groupName });
                }

                function spawnCustomAgent(templateKey) {
                    vscode.postMessage({ command: 'spawnCustomAgent', templateKey });
                }

                function createTask() {
                    vscode.postMessage({ command: 'createTask' });
                }

                function completeTask() {
                    vscode.postMessage({ command: 'completeTask' });
                }

                function viewAgentPrompt(agentId) {
                    vscode.postMessage({ command: 'viewAgentPrompt', agentId });
                }

                function editAgent(agentId) {
                    vscode.postMessage({ command: 'editAgent', agentId });
                }

                function removeAgent(agentId) {
                    vscode.postMessage({ command: 'removeAgent', agentId });
                }

                function toggleTheme() {
                    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
                    document.body.classList.toggle('dark-theme');
                    vscode.postMessage({ command: 'toggleTheme', theme: currentTheme });
                }
                
                function toggleSpawnSection() {
                    const arrow = document.getElementById('spawnArrow');
                    const content = document.getElementById('spawnContent');
                    
                    if (arrow && content) {
                        arrow.classList.toggle('collapsed');
                        content.classList.toggle('collapsed');
                    }
                }
            </script>
        </body>
        </html>`;
    }

    public reveal() {
        this.panel.reveal(vscode.ViewColumn.One);
    }

    public dispose() {
        EnhancedConductorPanel.currentPanel = undefined;
        this.panel.dispose();
        
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}