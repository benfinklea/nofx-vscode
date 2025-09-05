import * as vscode from 'vscode';
import { DashboardViewState } from '../types/ui';
import { IWebviewHost } from '../services/interfaces';

export class DashboardTemplate {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    generateDashboardHTML(state: DashboardViewState, webviewHost: IWebviewHost): string {
        const scriptUri = webviewHost.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dashboard.js')
        );
        const styleUri = webviewHost.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dashboard.css')
        );
        const nonce = webviewHost.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https: data:; style-src 'unsafe-inline' ${webviewHost.webview.cspSource}; script-src 'nonce-${nonce}';">
    <title>NofX Message Flow Dashboard</title>
    <link href="${styleUri}" rel="stylesheet">
    <style>
        .dashboard-container {
            padding: 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            height: 100vh;
            overflow-y: auto;
        }
        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        .dashboard-header h1 {
            margin: 0;
            color: var(--vscode-textLink-foreground);
        }
        .header-controls {
            display: flex;
            gap: 10px;
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
        .control-btn.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .stats-panel {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
        }
        .filter-bar {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            padding: 15px;
            background: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            flex-wrap: wrap;
        }
        .filter-select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 14px;
        }
        .content-area {
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
            margin-bottom: 15px;
            color: var(--vscode-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .agent-cards {
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
        .connection-status {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }
        .status-connected { background: #4CAF50; }
        .status-disconnected { background: #F44336; }
        .flow-container {
            height: 300px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 15px;
            overflow-y: auto;
        }
        .message-item {
            padding: 10px;
            margin-bottom: 8px;
            background: var(--vscode-editor-background);
            border-radius: 6px;
            border-left: 4px solid var(--vscode-panel-border);
        }
        .message-item.request { border-left-color: #2196F3; }
        .message-item.response { border-left-color: #4CAF50; }
        .message-item.error { border-left-color: #F44336; }
        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
        }
        .message-type {
            font-weight: bold;
            font-size: 12px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .message-timestamp {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .message-content {
            font-size: 14px;
            margin-bottom: 5px;
        }
        .message-meta {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .messages-container {
            max-height: 400px;
            overflow-y: auto;
        }
        .full-width {
            grid-column: 1 / -1;
        }
    </style>
</head>
<body>
    <div class="dashboard-container">
        <div class="dashboard-header">
            <h1>📊 NofX Message Flow Dashboard</h1>
            <div class="header-controls">
                <button id="pause-btn" class="control-btn secondary">⏸️ Pause</button>
                <button id="clear-btn" class="control-btn secondary">🗑️ Clear</button>
                <button id="export-btn" class="control-btn">📤 Export</button>
            </div>
        </div>
        
        <!-- Stats Panel -->
        <div class="stats-panel">
            <div class="stat-card">
                <div class="stat-value">${state.stats.activeConnections}</div>
                <div class="stat-label">Active Connections</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${state.stats.totalMessages}</div>
                <div class="stat-label">Total Messages</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${state.stats.successRate.toFixed(1)}%</div>
                <div class="stat-label">Success Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${state.stats.averageResponseTime.toFixed(0)}ms</div>
                <div class="stat-label">Avg Response Time</div>
            </div>
        </div>
        
        <!-- Filter Bar -->
        <div class="filter-bar">
            <select id="type-filter" class="filter-select">
                <option value="all">All Types</option>
                <option value="request">Requests</option>
                <option value="response">Responses</option>
                <option value="error">Errors</option>
            </select>
            
            <select id="source-filter" class="filter-select">
                <option value="all">All Sources</option>
                ${this.generateSourceOptions(state.connections)}
            </select>
            
            <select id="time-filter" class="filter-select">
                <option value="all">All Time</option>
                <option value="5">Last 5 min</option>
                <option value="15">Last 15 min</option>
                <option value="60">Last hour</option>
            </select>
            
            <button class="control-btn secondary" data-command="applyFilters">Apply Filters</button>
        </div>
        
        <!-- Main Content Area -->
        <div class="content-area">
            <!-- Agent Status Grid -->
            <div class="panel">
                <h3>🤖 Connected Agents</h3>
                <div class="agent-cards" id="agent-cards">
                    ${this.generateAgentCards(state.connections)}
                </div>
            </div>
            
            <!-- Message Flow Visualization -->
            <div class="panel">
                <h3>📈 Message Flow</h3>
                <div class="flow-container" id="flow-container">
                    <div style="text-align: center; color: var(--vscode-descriptionForeground); padding: 50px;">
                        Message flow visualization will be displayed here
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Message List -->
        <div class="panel full-width">
            <h3>📋 Recent Messages</h3>
            <div class="messages-container" id="messages-container">
                ${this.generateMessageList(state.messages)}
            </div>
        </div>
    </div>
    
    <script src="${scriptUri}"></script>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let isPaused = false;
        
        // Event delegation for buttons
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target && target.classList.contains('control-btn')) {
                const command = target.getAttribute('data-command');
                
                switch (command) {
                    case 'applyFilters':
                        applyFilters();
                        break;
                }
            }
        });
        
        function applyFilters() {
            const typeFilter = document.getElementById('type-filter').value;
            const sourceFilter = document.getElementById('source-filter').value;
            const timeFilter = document.getElementById('time-filter').value;
            
            vscode.postMessage({
                command: 'applyFilter',
                data: {
                    filter: {
                        messageType: typeFilter,
                        source: sourceFilter,
                        timeRange: timeFilter
                    }
                }
            });
        }
        
        function clearMessages() {
            vscode.postMessage({
                command: 'clearMessages'
            });
        }
        
        function exportMessages() {
            vscode.postMessage({
                command: 'exportMessages'
            });
        }
        
        function pauseUpdates() {
            isPaused = !isPaused;
            const btn = document.getElementById('pause-btn');
            btn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
            
            vscode.postMessage({
                command: isPaused ? 'pauseUpdates' : 'resumeUpdates'
            });
        }
        
        // Event listeners
        document.getElementById('clear-btn').addEventListener('click', clearMessages);
        document.getElementById('export-btn').addEventListener('click', exportMessages);
        document.getElementById('pause-btn').addEventListener('click', pauseUpdates);
        
        // Listen for state updates
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'setState':
                case 'updateState':
                    updateDashboard(message.state);
                    break;
                case 'newMessages':
                    if (!isPaused) {
                        appendMessages(message.messages);
                    }
                    break;
                case 'updateConnections':
                    updateConnections(message.connections);
                    break;
                case 'setMessages':
                    setMessages(message.messages);
                    break;
                case 'clearMessages':
                    clearMessageList();
                    break;
            }
        });
        
        function updateDashboard(state) {
            // Update stats
            const statValues = document.querySelectorAll('.stat-value');
            if (statValues.length >= 4) {
                statValues[0].textContent = state.stats.activeConnections;
                statValues[1].textContent = state.stats.totalMessages;
                statValues[2].textContent = state.stats.successRate.toFixed(1) + '%';
                statValues[3].textContent = state.stats.averageResponseTime.toFixed(0) + 'ms';
            }
            
            // Update connections
            updateConnections(state.connections);
            
            // Update messages
            setMessages(state.messages);
        }
        
        function updateConnections(connections) {
            const agentCards = document.getElementById('agent-cards');
            agentCards.innerHTML = generateAgentCards(connections);
        }
        
        function setMessages(messages) {
            const messagesContainer = document.getElementById('messages-container');
            messagesContainer.innerHTML = generateMessageList(messages);
        }
        
        function appendMessages(messages) {
            const messagesContainer = document.getElementById('messages-container');
            messages.forEach(message => {
                const messageElement = createMessageElement(message);
                messagesContainer.insertBefore(messageElement, messagesContainer.firstChild);
            });
            
            // Limit to 100 messages
            while (messagesContainer.children.length > 100) {
                messagesContainer.removeChild(messagesContainer.lastChild);
            }
        }
        
        function clearMessageList() {
            const messagesContainer = document.getElementById('messages-container');
            messagesContainer.innerHTML = '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No messages</p>';
        }
        
        function generateAgentCards(connections) {
            if (connections.length === 0) {
                return '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No active connections</p>';
            }
            return connections.map(conn => \`
                <div class="agent-card">
                    <div class="agent-info">
                        <div class="connection-status status-\${conn.status}"></div>
                        <div>
                            <strong>\${conn.name}</strong>
                            <br><small>\${conn.status}</small>
                            \${conn.lastMessage ? '<br><small>Last: ' + new Date(conn.lastMessage).toLocaleTimeString() + '</small>' : ''}
                        </div>
                    </div>
                </div>
            \`).join('');
        }
        
        function generateMessageList(messages) {
            if (messages.length === 0) {
                return '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No messages</p>';
            }
            return messages.map(msg => createMessageElement(msg)).join('');
        }
        
        function createMessageElement(message) {
            return \`
                <div class="message-item \${message.type}">
                    <div class="message-header">
                        <span class="message-type">\${message.type.toUpperCase()}</span>
                        <span class="message-timestamp">\${new Date(message.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="message-content">\${message.content}</div>
                    <div class="message-meta">
                        From: \${message.source}\${message.target ? ' → ' + message.target : ''}
                    </div>
                </div>
            \`;
        }
    </script>
</body>
</html>`;
    }

    generateStatsPanel(stats: any): string {
        return `
            <div class="stats-panel">
                <div class="stat-card">
                    <div class="stat-value">${stats.activeConnections}</div>
                    <div class="stat-label">Active Connections</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.totalMessages}</div>
                    <div class="stat-label">Total Messages</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.successRate.toFixed(1)}%</div>
                    <div class="stat-label">Success Rate</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.averageResponseTime.toFixed(0)}ms</div>
                    <div class="stat-label">Avg Response Time</div>
                </div>
            </div>
        `;
    }

    generateFilterBar(filters: any): string {
        return `
            <div class="filter-bar">
                <select id="type-filter" class="filter-select">
                    <option value="all">All Types</option>
                    <option value="request">Requests</option>
                    <option value="response">Responses</option>
                    <option value="error">Errors</option>
                </select>
                
                <select id="source-filter" class="filter-select">
                    <option value="all">All Sources</option>
                </select>
                
                <select id="time-filter" class="filter-select">
                    <option value="all">All Time</option>
                    <option value="5">Last 5 min</option>
                    <option value="15">Last 15 min</option>
                    <option value="60">Last hour</option>
                </select>
                
                <button class="control-btn secondary" data-command="applyFilters">Apply Filters</button>
            </div>
        `;
    }

    generateMessageList(messages: any[]): string {
        if (messages.length === 0) {
            return '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No messages</p>';
        }
        return messages.map(message => `
            <div class="message-item ${message.type}">
                <div class="message-header">
                    <span class="message-type">${message.type.toUpperCase()}</span>
                    <span class="message-timestamp">${new Date(message.timestamp).toLocaleString()}</span>
                </div>
                <div class="message-content">${message.content}</div>
                <div class="message-meta">
                    From: ${message.source}${message.target ? ' → ' + message.target : ''}
                </div>
            </div>
        `).join('');
    }

    generateAgentGrid(connections: any[]): string {
        if (connections.length === 0) {
            return '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No active connections</p>';
        }
        return connections.map(conn => `
            <div class="agent-card">
                <div class="agent-info">
                    <div class="connection-status status-${conn.status}"></div>
                    <div>
                        <strong>${conn.name}</strong>
                        <br><small>${conn.status}</small>
                        ${conn.lastMessage ? '<br><small>Last: ' + new Date(conn.lastMessage).toLocaleTimeString() + '</small>' : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    private generateSourceOptions(connections: any[]): string {
        const sources = new Set(connections.map(conn => conn.name));
        return Array.from(sources).map(source => 
            `<option value="${source}">${source}</option>`
        ).join('');
    }
}
