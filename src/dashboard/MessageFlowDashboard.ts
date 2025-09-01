import * as vscode from 'vscode';
import { OrchestrationServer } from '../orchestration/OrchestrationServer';
import { OrchestratorMessage, MessageType, ClientConnection } from '../orchestration/MessageProtocol';

export class MessageFlowDashboard {
    private panel: vscode.WebviewPanel | undefined;
    private orchestrationServer: OrchestrationServer;
    private context: vscode.ExtensionContext;
    private messageBuffer: OrchestratorMessage[] = [];
    private updateInterval: NodeJS.Timeout | undefined;
    
    constructor(
        context: vscode.ExtensionContext,
        orchestrationServer: OrchestrationServer
    ) {
        this.context = context;
        this.orchestrationServer = orchestrationServer;
        
        // Register for message updates
        this.orchestrationServer.setDashboardCallback((message) => {
            this.handleNewMessage(message);
        });
    }
    
    public async show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        
        // Create webview panel
        this.panel = vscode.window.createWebviewPanel(
            'nofxMessageFlow',
            '📊 NofX Message Flow',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'webview')
                ]
            }
        );
        
        // Set webview content
        this.panel.webview.html = this.getWebviewContent();
        
        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'ready':
                        this.sendInitialState();
                        break;
                    case 'filter':
                        this.applyFilter(message.filter);
                        break;
                    case 'clear':
                        this.clearMessages();
                        break;
                    case 'export':
                        this.exportMessages();
                        break;
                    case 'pause':
                        this.pauseUpdates();
                        break;
                    case 'resume':
                        this.resumeUpdates();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
        
        // Handle panel disposal
        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
                if (this.updateInterval) {
                    clearInterval(this.updateInterval);
                }
            },
            undefined,
            this.context.subscriptions
        );
        
        // Start update loop
        this.startUpdateLoop();
    }
    
    private handleNewMessage(message: OrchestratorMessage): void {
        this.messageBuffer.push(message);
        
        // Limit buffer size
        if (this.messageBuffer.length > 100) {
            this.messageBuffer.shift();
        }
    }
    
    private startUpdateLoop(): void {
        // Send buffered messages to dashboard every 100ms
        this.updateInterval = setInterval(() => {
            if (this.messageBuffer.length > 0 && this.panel) {
                this.panel.webview.postMessage({
                    command: 'newMessages',
                    messages: [...this.messageBuffer]
                });
                this.messageBuffer = [];
            }
            
            // Also update connections periodically
            this.updateConnections();
        }, 100);
    }
    
    private sendInitialState(): void {
        if (!this.panel) return;
        
        const history = this.orchestrationServer.getMessageHistory();
        const connections = this.orchestrationServer.getConnections();
        
        this.panel.webview.postMessage({
            command: 'setState',
            state: {
                messages: history.slice(-100), // Last 100 messages
                connections,
                stats: this.calculateStats(history)
            }
        });
    }
    
    private updateConnections(): void {
        if (!this.panel) return;
        
        const connections = this.orchestrationServer.getConnections();
        
        this.panel.webview.postMessage({
            command: 'updateConnections',
            connections
        });
    }
    
    private calculateStats(messages: OrchestratorMessage[]): any {
        const stats = {
            totalMessages: messages.length,
            messagesByType: {} as Record<string, number>,
            messagesByAgent: {} as Record<string, number>,
            avgResponseTime: 0,
            successRate: 0,
            activeAgents: 0
        };
        
        // Count messages by type
        messages.forEach(msg => {
            stats.messagesByType[msg.type] = (stats.messagesByType[msg.type] || 0) + 1;
            
            if (msg.from.startsWith('agent-')) {
                stats.messagesByAgent[msg.from] = (stats.messagesByAgent[msg.from] || 0) + 1;
            }
        });
        
        // Calculate success rate (completed tasks / assigned tasks)
        const assigned = stats.messagesByType[MessageType.ASSIGN_TASK] || 0;
        const completed = stats.messagesByType[MessageType.TASK_COMPLETE] || 0;
        stats.successRate = assigned > 0 ? (completed / assigned) * 100 : 0;
        
        // Count active agents
        const connections = this.orchestrationServer.getConnections();
        stats.activeAgents = connections.filter(c => c.type === 'agent').length;
        
        return stats;
    }
    
    private applyFilter(filter: any): void {
        // Re-send filtered data
        const history = this.orchestrationServer.getMessageHistory();
        let filtered = history;
        
        if (filter.type && filter.type !== 'all') {
            filtered = filtered.filter(m => m.type === filter.type);
        }
        
        if (filter.agent && filter.agent !== 'all') {
            filtered = filtered.filter(m => 
                m.from === filter.agent || m.to === filter.agent
            );
        }
        
        if (filter.timeRange) {
            const now = Date.now();
            const range = parseInt(filter.timeRange) * 60 * 1000; // Convert minutes to ms
            filtered = filtered.filter(m => 
                now - new Date(m.timestamp).getTime() < range
            );
        }
        
        this.panel?.webview.postMessage({
            command: 'setMessages',
            messages: filtered.slice(-100)
        });
    }
    
    private clearMessages(): void {
        this.messageBuffer = [];
        this.panel?.webview.postMessage({
            command: 'clearMessages'
        });
    }
    
    private pauseUpdates(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }
    }
    
    private resumeUpdates(): void {
        if (!this.updateInterval) {
            this.startUpdateLoop();
        }
    }
    
    private exportMessages(): void {
        const history = this.orchestrationServer.getMessageHistory();
        const connections = this.orchestrationServer.getConnections();
        
        const exportData = {
            timestamp: new Date().toISOString(),
            connections,
            messages: history,
            stats: this.calculateStats(history)
        };
        
        const content = JSON.stringify(exportData, null, 2);
        const uri = vscode.Uri.parse(`untitled:nofx-messages-${Date.now()}.json`);
        
        vscode.workspace.openTextDocument(uri).then(doc => {
            vscode.window.showTextDocument(doc).then(editor => {
                editor.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), content);
                });
            });
        });
    }
    
    private getWebviewContent(): string {
        const scriptUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dashboard.js')
        );
        const styleUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dashboard.css')
        );
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NofX Message Flow Dashboard</title>
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div class="dashboard-container">
        <div class="dashboard-header">
            <h1>📊 NofX Message Flow</h1>
            <div class="header-controls">
                <button id="pause-btn" class="control-btn">⏸️ Pause</button>
                <button id="clear-btn" class="control-btn">🗑️ Clear</button>
                <button id="export-btn" class="control-btn">📤 Export</button>
            </div>
        </div>
        
        <div class="dashboard-main">
            <!-- Stats Panel -->
            <div class="stats-panel">
                <div class="stat-card">
                    <div class="stat-label">Active Agents</div>
                    <div class="stat-value" id="active-agents">0</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Messages</div>
                    <div class="stat-value" id="total-messages">0</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Success Rate</div>
                    <div class="stat-value" id="success-rate">0%</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Msg/Min</div>
                    <div class="stat-value" id="message-rate">0</div>
                </div>
            </div>
            
            <!-- Filter Bar -->
            <div class="filter-bar">
                <select id="type-filter" class="filter-select">
                    <option value="all">All Types</option>
                    <option value="assign_task">Task Assignment</option>
                    <option value="task_complete">Task Complete</option>
                    <option value="agent_status">Status Updates</option>
                    <option value="system">System</option>
                </select>
                
                <select id="agent-filter" class="filter-select">
                    <option value="all">All Agents</option>
                    <option value="conductor">Conductor</option>
                </select>
                
                <select id="time-filter" class="filter-select">
                    <option value="all">All Time</option>
                    <option value="5">Last 5 min</option>
                    <option value="15">Last 15 min</option>
                    <option value="60">Last hour</option>
                </select>
            </div>
            
            <!-- Main Content Area -->
            <div class="content-area">
                <!-- Agent Status Grid -->
                <div class="agents-grid" id="agents-grid">
                    <h3>Connected Agents</h3>
                    <div class="agent-cards" id="agent-cards">
                        <!-- Agent cards will be inserted here -->
                    </div>
                </div>
                
                <!-- Message Flow Visualization -->
                <div class="message-flow" id="message-flow">
                    <h3>Message Flow</h3>
                    <div class="flow-container" id="flow-container">
                        <!-- Flow visualization will be here -->
                    </div>
                </div>
                
                <!-- Message List -->
                <div class="message-list" id="message-list">
                    <h3>Recent Messages</h3>
                    <div class="messages-container" id="messages-container">
                        <!-- Messages will be inserted here -->
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}