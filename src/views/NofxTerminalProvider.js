"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NofxTerminalProvider = void 0;
const vscode = __importStar(require("vscode"));
class NofxTerminalProvider {
    constructor(_extensionUri, agentManager) {
        this._extensionUri = _extensionUri;
        this.agentManager = agentManager;
        agentManager.onAgentUpdate(() => {
            if (this._view) {
                this.updateView();
            }
        });
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'focusTerminal':
                    this.focusAgentTerminal(data.agentId);
                    break;
                case 'stopAgent':
                    this.agentManager.removeAgent(data.agentId);
                    break;
                case 'newTask':
                    vscode.commands.executeCommand('nofx.createTask');
                    break;
                case 'startConductor':
                    vscode.commands.executeCommand('nofx.startConductor');
                    break;
            }
        });
        this.updateView();
    }
    focusAgentTerminal(agentId) {
        const terminal = this.agentManager.getAgentTerminal(agentId);
        if (terminal) {
            terminal.show();
        }
    }
    updateView() {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateAgents',
                agents: this.getAgentData()
            });
        }
    }
    getAgentData() {
        return this.agentManager.getActiveAgents().map(agent => ({
            id: agent.id,
            name: agent.name,
            type: agent.type,
            status: agent.status,
            icon: agent.template?.icon || '🤖',
            specialization: agent.template?.specialization || 'General',
            currentTask: agent.currentTask?.title || null
        }));
    }
    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>NofX Agents</title>
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-panel-background);
                }
                
                .terminal-tabs {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                }
                
                .tabs-container {
                    display: flex;
                    background: var(--vscode-tab-activeBackground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    overflow-x: auto;
                    min-height: 35px;
                }
                
                .tab {
                    display: flex;
                    align-items: center;
                    padding: 6px 12px;
                    cursor: pointer;
                    border-right: 1px solid var(--vscode-tab-border);
                    background: var(--vscode-tab-inactiveBackground);
                    white-space: nowrap;
                    gap: 6px;
                    min-width: 120px;
                    max-width: 200px;
                }
                
                .tab:hover {
                    background: var(--vscode-tab-hoverBackground);
                }
                
                .tab.active {
                    background: var(--vscode-tab-activeBackground);
                    border-bottom: 2px solid var(--vscode-focusBorder);
                }
                
                .tab-icon {
                    font-size: 16px;
                    flex-shrink: 0;
                }
                
                .tab-name {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    font-size: 12px;
                }
                
                .tab-status {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                
                .status-idle {
                    background: #4caf50;
                }
                
                .status-working {
                    background: #ff9800;
                    animation: pulse 1.5s infinite;
                }
                
                .status-error {
                    background: #f44336;
                }
                
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                
                .terminal-content {
                    flex: 1;
                    padding: 12px;
                    overflow-y: auto;
                }
                
                .agent-info {
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 12px;
                    margin-bottom: 8px;
                }
                
                .agent-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 8px;
                }
                
                .agent-title {
                    font-weight: bold;
                    flex: 1;
                }
                
                .agent-specialization {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 4px;
                }
                
                .agent-task {
                    font-size: 12px;
                    padding: 4px 8px;
                    background: var(--vscode-textBlockQuote-background);
                    border-left: 3px solid var(--vscode-textLink-foreground);
                    margin-top: 8px;
                }
                
                .no-agents {
                    padding: 20px;
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                }
                
                .action-buttons {
                    display: flex;
                    gap: 4px;
                }
                
                .action-btn {
                    background: transparent;
                    border: 1px solid var(--vscode-panel-border);
                    color: var(--vscode-foreground);
                    padding: 2px 6px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 11px;
                }
                
                .action-btn:hover {
                    background: var(--vscode-toolbar-hoverBackground);
                }
                
                .quick-actions {
                    padding: 8px;
                    border-top: 1px solid var(--vscode-panel-border);
                    display: flex;
                    gap: 8px;
                }
                
                .quick-btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 12px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                }
                
                .quick-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="terminal-tabs">
                <div class="tabs-container" id="tabs">
                    <!-- Tabs will be inserted here -->
                </div>
                <div class="terminal-content" id="content">
                    <div class="no-agents">
                        <p>No NofX agents running</p>
                        <p style="margin-top: 12px;">
                            <button class="quick-btn" onclick="startConductor()">
                                🎸 Start Conductor
                            </button>
                        </p>
                    </div>
                </div>
                <div class="quick-actions">
                    <button class="quick-btn" onclick="createTask()">📋 New Task</button>
                    <button class="quick-btn" onclick="startConductor()">🎸 Start Conductor</button>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                let agents = [];
                let activeAgentId = null;
                
                function startConductor() {
                    vscode.postMessage({ command: 'startConductor' });
                }
                
                function createTask() {
                    vscode.postMessage({ command: 'newTask' });
                }
                
                function selectAgent(agentId) {
                    activeAgentId = agentId;
                    vscode.postMessage({ command: 'focusTerminal', agentId });
                    renderAgents();
                }
                
                function stopAgent(agentId) {
                    vscode.postMessage({ command: 'stopAgent', agentId });
                }
                
                function renderAgents() {
                    const tabsContainer = document.getElementById('tabs');
                    const contentContainer = document.getElementById('content');
                    
                    if (agents.length === 0) {
                        tabsContainer.innerHTML = '';
                        contentContainer.innerHTML = \`
                            <div class="no-agents">
                                <p>No NofX agents running</p>
                                <p style="margin-top: 12px;">
                                    <button class="quick-btn" onclick="startConductor()">
                                        🎸 Start Conductor
                                    </button>
                                </p>
                            </div>
                        \`;
                        return;
                    }
                    
                    // Render tabs
                    tabsContainer.innerHTML = agents.map(agent => \`
                        <div class="tab \${agent.id === activeAgentId ? 'active' : ''}" 
                             onclick="selectAgent('\${agent.id}')">
                            <span class="tab-icon">\${agent.icon}</span>
                            <span class="tab-name">\${agent.name}</span>
                            <span class="tab-status status-\${agent.status}"></span>
                        </div>
                    \`).join('');
                    
                    // Render content for active agent
                    const activeAgent = agents.find(a => a.id === activeAgentId) || agents[0];
                    if (activeAgent) {
                        contentContainer.innerHTML = \`
                            <div class="agent-info">
                                <div class="agent-header">
                                    <span style="font-size: 24px;">\${activeAgent.icon}</span>
                                    <div class="agent-title">\${activeAgent.name}</div>
                                    <div class="action-buttons">
                                        <button class="action-btn" onclick="selectAgent('\${activeAgent.id}')">
                                            Show Terminal
                                        </button>
                                        <button class="action-btn" onclick="stopAgent('\${activeAgent.id}')">
                                            Stop
                                        </button>
                                    </div>
                                </div>
                                <div class="agent-specialization">\${activeAgent.specialization}</div>
                                <div class="agent-specialization">Status: \${activeAgent.status}</div>
                                \${activeAgent.currentTask ? \`
                                    <div class="agent-task">
                                        📋 Working on: \${activeAgent.currentTask}
                                    </div>
                                \` : ''}
                            </div>
                            <div style="padding: 8px; color: var(--vscode-descriptionForeground); font-size: 12px;">
                                Terminal output is shown in the main terminal panel.
                                Click "Show Terminal" to focus on this agent's terminal.
                            </div>
                        \`;
                        
                        if (!activeAgentId) {
                            activeAgentId = activeAgent.id;
                        }
                    }
                }
                
                // Listen for updates from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'updateAgents':
                            agents = message.agents;
                            renderAgents();
                            break;
                    }
                });
                
                // Initial render
                renderAgents();
            </script>
        </body>
        </html>`;
    }
}
exports.NofxTerminalProvider = NofxTerminalProvider;
NofxTerminalProvider.viewType = 'nofx.terminalView';
//# sourceMappingURL=NofxTerminalProvider.js.map