import * as vscode from 'vscode';
import { ConductorViewState } from '../types/ui';
import { IWebviewHost } from '../services/interfaces';

export class ConductorTemplate {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    generateConductorHTML(state: ConductorViewState, webviewHost: IWebviewHost): string {
        const scriptUri = webviewHost.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'chat.js')
        );
        const styleUri = webviewHost.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'chat.css')
        );
        const nonce = webviewHost.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https: data:; style-src 'unsafe-inline' ${webviewHost.webview.cspSource}; script-src 'nonce-${nonce}';">
    <title>NofX Conductor</title>
    <link href="${styleUri}" rel="stylesheet">
    <style>
        .conductor-container {
            padding: 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 15px;
            text-align: center;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        .control-section {
            margin-bottom: 20px;
        }
        .control-section h3 {
            margin-bottom: 10px;
            color: var(--vscode-foreground);
        }
        .button-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .control-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .control-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .agent-list, .task-list {
            background: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 15px;
        }
        .agent-item, .task-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .agent-item:last-child, .task-item:last-child {
            border-bottom: none;
        }
        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-idle { background: #4CAF50; }
        .status-working { background: #FF9800; }
        .status-error { background: #F44336; }
        .status-offline { background: #9E9E9E; }
        .priority-high { color: #F44336; }
        .priority-medium { color: #FF9800; }
        .priority-low { color: #4CAF50; }
    </style>
</head>
<body>
    <div class="conductor-container">
        <h1>🎼 NofX Conductor</h1>
        
        <!-- Stats Grid -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${state.agentStats.total}</div>
                <div class="stat-label">Total Agents</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${state.agentStats.idle}</div>
                <div class="stat-label">Idle</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${state.agentStats.working}</div>
                <div class="stat-label">Working</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${state.taskStats.queued}</div>
                <div class="stat-label">Queued Tasks</div>
            </div>
        </div>
        
        <!-- Agent Controls -->
        <div class="control-section">
            <h3>🤖 Agent Management</h3>
            <div class="button-group">
                <button class="control-btn" data-command="spawnAgentGroup">Spawn Agent Group</button>
                <button class="control-btn" data-command="spawnCustomAgent">Spawn Custom Agent</button>
                <button class="control-btn" data-command="showAgentPrompt">Agent Prompt</button>
            </div>
        </div>
        
        <!-- Task Controls -->
        <div class="control-section">
            <h3>📋 Task Management</h3>
            <div class="button-group">
                <button class="control-btn" data-command="createTask">Create Task</button>
            </div>
        </div>
        
        <!-- Theme Controls -->
        <div class="control-section">
            <h3>🎨 Theme</h3>
            <div class="button-group">
                <button class="control-btn" data-command="toggleTheme" data-theme="light">Light</button>
                <button class="control-btn" data-command="toggleTheme" data-theme="dark">Dark</button>
            </div>
        </div>
        
        <!-- Agent List -->
        <div class="agent-list">
            <h3>Active Agents</h3>
            ${this.generateAgentList(state.agents)}
        </div>
        
        <!-- Task List -->
        <div class="task-list">
            <h3>Recent Tasks</h3>
            ${this.generateTaskList(state.tasks)}
        </div>
    </div>
    
    <script src="${scriptUri}"></script>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        // Event delegation for buttons
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target && target.classList.contains('control-btn')) {
                const command = target.getAttribute('data-command');
                const theme = target.getAttribute('data-theme');
                const agentId = target.getAttribute('data-agent-id');
                
                switch (command) {
                    case 'spawnAgentGroup':
                        spawnAgentGroup();
                        break;
                    case 'spawnCustomAgent':
                        spawnCustomAgent();
                        break;
                    case 'createTask':
                        createTask();
                        break;
                    case 'showAgentPrompt':
                        showAgentPrompt();
                        break;
                    case 'toggleTheme':
                        toggleTheme(theme);
                        break;
                    case 'removeAgent':
                        removeAgent(agentId);
                        break;
                }
            }
        });
        
        function spawnAgentGroup() {
            const groupName = prompt('Enter group name:', 'Default Group');
            if (groupName) {
                vscode.postMessage({
                    command: 'spawnAgentGroup',
                    data: { groupName }
                });
            }
        }
        
        function spawnCustomAgent() {
            const templateKey = prompt('Enter template key:', 'default');
            if (templateKey) {
                vscode.postMessage({
                    command: 'spawnCustomAgent',
                    data: { templateKey }
                });
            }
        }
        
        function createTask() {
            vscode.postMessage({
                command: 'createTask'
            });
        }
        
        function showAgentPrompt() {
            vscode.postMessage({
                command: 'showAgentPrompt'
            });
        }
        
        function toggleTheme(theme) {
            vscode.postMessage({
                command: 'toggleTheme',
                data: { theme }
            });
        }
        
        function removeAgent(agentId) {
            if (confirm('Are you sure you want to remove this agent?')) {
                vscode.postMessage({
                    command: 'removeAgent',
                    data: { agentId }
                });
            }
        }
        
        // Listen for state updates
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'setState') {
                updateUI(message.state);
            }
        });
        
        function updateUI(state) {
            // Update stats
            document.querySelector('.stat-card:nth-child(1) .stat-value').textContent = state.agentStats.total;
            document.querySelector('.stat-card:nth-child(2) .stat-value').textContent = state.agentStats.idle;
            document.querySelector('.stat-card:nth-child(3) .stat-value').textContent = state.agentStats.working;
            document.querySelector('.stat-card:nth-child(4) .stat-value').textContent = state.taskStats.queued;
            
            // Update lists
            document.querySelector('.agent-list').innerHTML = '<h3>Active Agents</h3>' + generateAgentList(state.agents);
            document.querySelector('.task-list').innerHTML = '<h3>Recent Tasks</h3>' + generateTaskList(state.tasks);
        }
        
        function generateAgentList(agents) {
            if (agents.length === 0) {
                return '<p>No active agents</p>';
            }
            return agents.map(agent => \`
                <div class="agent-item">
                    <div>
                        <span class="status-indicator status-\${agent.status}"></span>
                        <strong>\${agent.name}</strong> (\${agent.type})
                        \${agent.currentTask ? '<br><small>Working on: ' + agent.currentTask.title + '</small>' : ''}
                    </div>
                    <button class="control-btn" data-command="removeAgent" data-agent-id="\${agent.id}">Remove</button>
                </div>
            \`).join('');
        }
        
        function generateTaskList(tasks) {
            if (tasks.length === 0) {
                return '<p>No tasks</p>';
            }
            return tasks.slice(0, 10).map(task => \`
                <div class="task-item">
                    <div>
                        <strong class="priority-\${task.priority}">\${task.title}</strong>
                        <br><small>\${task.description}</small>
                        <br><small>Status: \${task.status}</small>
                    </div>
                </div>
            \`).join('');
        }
    </script>
</body>
</html>`;
    }

    generateEnhancedConductorHTML(state: ConductorViewState, webviewHost: IWebviewHost): string {
        // Enhanced version with more features
        const scriptUri = webviewHost.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'chat.js')
        );
        const styleUri = webviewHost.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'chat.css')
        );
        const nonce = webviewHost.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https: data:; style-src 'unsafe-inline' ${webviewHost.webview.cspSource}; script-src 'nonce-${nonce}';">
    <title>NofX Enhanced Conductor</title>
    <link href="${styleUri}" rel="stylesheet">
    <style>
        .enhanced-conductor {
            padding: 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        .header h1 {
            margin: 0;
            color: var(--vscode-textLink-foreground);
        }
        .theme-toggle {
            display: flex;
            gap: 10px;
        }
        .main-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .panel {
            background: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
        }
        .panel h3 {
            margin-top: 0;
            color: var(--vscode-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .quick-actions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 10px;
            margin-bottom: 20px;
        }
        .action-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            text-align: center;
            transition: background 0.2s;
        }
        .action-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .action-btn.primary {
            background: var(--vscode-button-background);
        }
        .action-btn.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .stats-overview {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-item {
            text-align: center;
            padding: 15px;
            background: var(--vscode-editor-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }
        .stat-number {
            font-size: 28px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .stat-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        .agent-grid {
            display: grid;
            gap: 10px;
        }
        .agent-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--vscode-editor-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }
        .agent-info {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .agent-status {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }
        .status-idle { background: #4CAF50; }
        .status-working { background: #FF9800; }
        .status-error { background: #F44336; }
        .status-offline { background: #9E9E9E; }
        .task-item {
            padding: 10px;
            background: var(--vscode-editor-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
            margin-bottom: 8px;
        }
        .task-title {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .task-meta {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .priority-high { color: #F44336; }
        .priority-medium { color: #FF9800; }
        .priority-low { color: #4CAF50; }
    </style>
</head>
<body>
    <div class="enhanced-conductor">
        <div class="header">
            <h1>🎼 NofX Enhanced Conductor</h1>
            <div class="theme-toggle">
                <button class="action-btn secondary" data-command="toggleTheme" data-theme="light">☀️ Light</button>
                <button class="action-btn secondary" data-command="toggleTheme" data-theme="dark">🌙 Dark</button>
            </div>
        </div>
        
        <div class="main-content">
            <!-- Left Panel -->
            <div class="panel">
                <h3>📊 Overview</h3>
                <div class="stats-overview">
                    <div class="stat-item">
                        <div class="stat-number">${state.agentStats.total}</div>
                        <div class="stat-text">Total Agents</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${state.agentStats.working}</div>
                        <div class="stat-text">Active</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${state.taskStats.queued}</div>
                        <div class="stat-text">Queued Tasks</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${state.taskStats.completed}</div>
                        <div class="stat-text">Completed</div>
                    </div>
                </div>
                
                <h3>⚡ Quick Actions</h3>
                <div class="quick-actions">
                    <button class="action-btn primary" data-command="spawnAgentGroup">🤖 Spawn Group</button>
                    <button class="action-btn primary" data-command="spawnCustomAgent">➕ Custom Agent</button>
                    <button class="action-btn primary" data-command="createTask">📋 New Task</button>
                    <button class="action-btn secondary" data-command="showAgentPrompt">💬 Prompt</button>
                </div>
            </div>
            
            <!-- Right Panel -->
            <div class="panel">
                <h3>🤖 Active Agents</h3>
                <div class="agent-grid">
                    ${this.generateEnhancedAgentList(state.agents)}
                </div>
            </div>
        </div>
        
        <div class="panel">
            <h3>📋 Recent Tasks</h3>
            ${this.generateEnhancedTaskList(state.tasks)}
        </div>
    </div>
    
    <script src="${scriptUri}"></script>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        // Event delegation for buttons
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target && (target.classList.contains('control-btn') || target.classList.contains('action-btn'))) {
                const command = target.getAttribute('data-command');
                const theme = target.getAttribute('data-theme');
                const agentId = target.getAttribute('data-agent-id');
                
                switch (command) {
                    case 'spawnAgentGroup':
                        spawnAgentGroup();
                        break;
                    case 'spawnCustomAgent':
                        spawnCustomAgent();
                        break;
                    case 'createTask':
                        createTask();
                        break;
                    case 'showAgentPrompt':
                        showAgentPrompt();
                        break;
                    case 'toggleTheme':
                        toggleTheme(theme);
                        break;
                    case 'removeAgent':
                        removeAgent(agentId);
                        break;
                }
            }
        });
        
        // Enhanced functionality
        function spawnAgentGroup() {
            const groupName = prompt('Enter group name:', 'Default Group');
            if (groupName) {
                vscode.postMessage({
                    command: 'spawnAgentGroup',
                    data: { groupName }
                });
            }
        }
        
        function spawnCustomAgent() {
            const templateKey = prompt('Enter template key:', 'default');
            if (templateKey) {
                vscode.postMessage({
                    command: 'spawnCustomAgent',
                    data: { templateKey }
                });
            }
        }
        
        function createTask() {
            vscode.postMessage({
                command: 'createTask'
            });
        }
        
        function showAgentPrompt() {
            vscode.postMessage({
                command: 'showAgentPrompt'
            });
        }
        
        function toggleTheme(theme) {
            vscode.postMessage({
                command: 'toggleTheme',
                data: { theme }
            });
        }
        
        function removeAgent(agentId) {
            if (confirm('Are you sure you want to remove this agent?')) {
                vscode.postMessage({
                    command: 'removeAgent',
                    data: { agentId }
                });
            }
        }
        
        // Enhanced state updates
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'setState') {
                updateEnhancedUI(message.state);
            }
        });
        
        function updateEnhancedUI(state) {
            // Update stats
            const statNumbers = document.querySelectorAll('.stat-number');
            if (statNumbers.length >= 4) {
                statNumbers[0].textContent = state.agentStats.total;
                statNumbers[1].textContent = state.agentStats.working;
                statNumbers[2].textContent = state.taskStats.queued;
                statNumbers[3].textContent = state.taskStats.completed;
            }
            
            // Update agent grid
            const agentGrid = document.querySelector('.agent-grid');
            if (agentGrid) {
                agentGrid.innerHTML = generateEnhancedAgentList(state.agents);
            }
            
            // Update task list
            const taskPanel = document.querySelector('.panel:last-child');
            if (taskPanel) {
                taskPanel.innerHTML = '<h3>📋 Recent Tasks</h3>' + generateEnhancedTaskList(state.tasks);
            }
        }
        
        function generateEnhancedAgentList(agents) {
            if (agents.length === 0) {
                return '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No active agents</p>';
            }
            return agents.map(agent => \`
                <div class="agent-card">
                    <div class="agent-info">
                        <div class="agent-status status-\${agent.status}"></div>
                        <div>
                            <strong>\${agent.name}</strong>
                            <br><small>\${agent.type} • \${agent.tasksCompleted} tasks</small>
                            \${agent.currentTask ? '<br><small>📋 ' + agent.currentTask.title + '</small>' : ''}
                        </div>
                    </div>
                    <button class="action-btn secondary" data-command="removeAgent" data-agent-id="\${agent.id}">Remove</button>
                </div>
            \`).join('');
        }
        
        function generateEnhancedTaskList(tasks) {
            if (tasks.length === 0) {
                return '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No tasks</p>';
            }
            return tasks.slice(0, 15).map(task => \`
                <div class="task-item">
                    <div class="task-title priority-\${task.priority}">\${task.title}</div>
                    <div class="task-meta">
                        Status: \${task.status} • 
                        \${task.assignedTo ? 'Assigned to: ' + task.assignedTo : 'Unassigned'} • 
                        Created: \${new Date(task.createdAt).toLocaleString()}
                    </div>
                </div>
            \`).join('');
        }
    </script>
</body>
</html>`;
    }

    private generateAgentList(agents: any[]): string {
        if (agents.length === 0) {
            return '<p>No active agents</p>';
        }
        return agents.map(agent => `
            <div class="agent-item">
                <div>
                    <span class="status-indicator status-${agent.status}"></span>
                    <strong>${agent.name}</strong> (${agent.type})
                    ${agent.currentTask ? '<br><small>Working on: ' + agent.currentTask.title + '</small>' : ''}
                </div>
                <button class="control-btn" data-command="removeAgent" data-agent-id="${agent.id}">Remove</button>
            </div>
        `).join('');
    }

    private generateTaskList(tasks: any[]): string {
        if (tasks.length === 0) {
            return '<p>No tasks</p>';
        }
        return tasks.slice(0, 10).map(task => `
            <div class="task-item">
                <div>
                    <strong class="priority-${task.priority}">${task.title}</strong>
                    <br><small>${task.description}</small>
                    <br><small>Status: ${task.status}</small>
                </div>
            </div>
        `).join('');
    }

    private generateEnhancedAgentList(agents: any[]): string {
        if (agents.length === 0) {
            return '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No active agents</p>';
        }
        return agents.map(agent => `
            <div class="agent-card">
                <div class="agent-info">
                    <div class="agent-status status-${agent.status}"></div>
                    <div>
                        <strong>${agent.name}</strong>
                        <br><small>${agent.type} • ${agent.tasksCompleted} tasks</small>
                        ${agent.currentTask ? '<br><small>📋 ' + agent.currentTask.title + '</small>' : ''}
                    </div>
                </div>
                <button class="action-btn secondary" data-command="removeAgent" data-agent-id="${agent.id}">Remove</button>
            </div>
        `).join('');
    }

    private generateEnhancedTaskList(tasks: any[]): string {
        if (tasks.length === 0) {
            return '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No tasks</p>';
        }
        return tasks.slice(0, 15).map(task => `
            <div class="task-item">
                <div class="task-title priority-${task.priority}">${task.title}</div>
                <div class="task-meta">
                    Status: ${task.status} • 
                    ${task.assignedTo ? 'Assigned to: ' + task.assignedTo : 'Unassigned'} • 
                    Created: ${new Date(task.createdAt).toLocaleString()}
                </div>
            </div>
        `).join('');
    }
}
