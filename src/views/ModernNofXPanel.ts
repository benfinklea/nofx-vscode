import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { AgentConfig, TaskConfig } from '../agents/types';
import {
    ILoggingService,
    INotificationService,
    IContainer,
    SERVICE_TOKENS,
    ICommandService
} from '../services/interfaces';

export class ModernNofXPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'nofx.modernPanel';
    private _view?: vscode.WebviewView;

    private readonly agentManager: AgentManager;
    private readonly taskQueue: TaskQueue;
    private readonly loggingService: ILoggingService;
    private readonly notificationService: INotificationService;
    private readonly commandService: ICommandService;
    private readonly context: vscode.ExtensionContext;

    constructor(private readonly container: IContainer) {
        this.context = container.resolve<vscode.ExtensionContext>(SERVICE_TOKENS.ExtensionContext);
        this.agentManager = container.resolve<AgentManager>(SERVICE_TOKENS.AgentManager);
        this.taskQueue = container.resolve<TaskQueue>(SERVICE_TOKENS.TaskQueue);
        this.loggingService = container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'webview'),
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async data => {
            await this.handleWebviewMessage(data);
        });

        // Update panel when agents or tasks change
        this.setupEventListeners();

        // Send initial state
        this.updateWebview();
    }

    private setupEventListeners() {
        // Listen for agent changes
        // This would integrate with your existing event system

        // For now, update periodically
        setInterval(() => {
            this.updateWebview();
        }, 5000);
    }

    private async handleWebviewMessage(data: any) {
        console.log('[NofX ModernPanel] Received message from webview:', data);
        this.loggingService.info('ModernPanel received message:', data);

        // Show notification for debugging
        if (data.command === 'spawnAgent') {
            await this.notificationService.showInformation(`[DEBUG] Received spawn request for: ${data.agentType}`);
        }

        try {
            switch (data.command) {
                case 'executeCommand':
                    await vscode.commands.executeCommand(data.commandId, ...(data.args || []));
                    break;

                case 'refreshData':
                    this.updateWebview();
                    break;

                case 'openConversationalConductor':
                    await vscode.commands.executeCommand('nofx.openConversationalConductor');
                    break;

                case 'spawnAgent':
                    await this.handleSpawnAgent(data.agentType, data.agentName);
                    break;

                case 'createTask':
                    await this.handleCreateTask(data.taskData);
                    break;

                case 'openMessageFlow':
                    await vscode.commands.executeCommand('nofx.openMessageFlow');
                    break;

                default:
                    this.loggingService.warn('Unknown webview command:', data.command);
            }
        } catch (error) {
            this.loggingService.error('Error handling webview message:', error);
            this.notificationService.showError(`Command failed: ${error}`);
        }
    }

    private async handleSpawnAgent(agentType: string, agentName?: string) {
        try {
            // Show debug notification
            console.log('[NofX Sidebar Debug] handleSpawnAgent called with:', { agentType, agentName });
            await this.notificationService.showInformation(`[DEBUG] Spawning ${agentType} from sidebar...`);

            // Import template manager
            const { AgentTemplateManager } = await import('../agents/AgentTemplateManager');
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

            if (!workspaceFolder) {
                await this.notificationService.showError('No workspace folder open');
                return;
            }

            // Load the actual template
            const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
            const template = await templateManager.getTemplate(agentType);

            console.log('[NofX Sidebar Debug] Template loaded:', {
                agentType,
                templateFound: !!template,
                templateKeys: template ? Object.keys(template) : [],
                hasSystemPrompt: !!template?.systemPrompt,
                hasDetailedPrompt: !!template?.detailedPrompt
            });

            if (!template) {
                this.loggingService.error(`Template not found for agent type: ${agentType}`);
                await this.notificationService.showError(`Template not found: ${agentType}`);
                return;
            }

            // Generate a name if not provided
            const name = agentName || template.name || `${agentType.replace('-', ' ')} Agent`;

            // Debug log to verify template loading
            this.loggingService.info(`[NofX Sidebar] Loading template for sidebar agent:`, {
                agentType,
                templateFound: !!template,
                hasSystemPrompt: !!template.systemPrompt,
                hasDetailedPrompt: !!template.detailedPrompt,
                systemPromptLength: template.systemPrompt?.length || 0,
                detailedPromptLength: template.detailedPrompt?.length || 0
            });

            // Show what we're about to pass
            await this.notificationService.showInformation(
                `[DEBUG] Template loaded: ${template.systemPrompt ? 'YES' : 'NO'}`
            );

            // Create agent config with the loaded template
            const config: AgentConfig = {
                name,
                type: agentType,
                template // Pass the actual template object
            };

            console.log('[NofX Sidebar Debug] Calling agentManager.spawnAgent with config:', {
                name: config.name,
                type: config.type,
                hasTemplate: !!config.template,
                templateType: typeof config.template
            });

            // Use existing agent spawning logic
            await this.agentManager.spawnAgent(config);

            await this.notificationService.showInformation(`🤖 Spawned ${name}`);
            this.updateWebview();
        } catch (error) {
            console.error('[NofX Sidebar Debug] Error in handleSpawnAgent:', error);
            this.loggingService.error('Failed to spawn agent:', error);
            await this.notificationService.showError(`Failed to spawn agent: ${error}`);
        }
    }

    private async handleCreateTask(taskData: any) {
        try {
            // Create a proper TaskConfig with defaults
            const taskConfig: TaskConfig = {
                title: taskData.title || 'New Task',
                description: taskData.description || 'Task created from control panel',
                priority: (taskData.priority as 'high' | 'medium' | 'low') || 'medium',
                files: taskData.files || [],
                tags: taskData.tags || ['ui-created']
            };

            // Use existing task creation logic
            this.taskQueue.addTask(taskConfig);
            await this.notificationService.showInformation(`📋 Created task: ${taskConfig.title}`);
            this.updateWebview();
        } catch (error) {
            this.loggingService.error('Failed to create task:', error);
            await this.notificationService.showError(`Failed to create task: ${error}`);
        }
    }

    private updateWebview() {
        if (!this._view) return;

        const agents = this.agentManager.getActiveAgents();
        const tasks = this.taskQueue.getAllTasks();

        // Get workspace info
        const workspaceName = vscode.workspace.name || 'NofX';

        // Calculate stats
        const stats = {
            activeAgents: agents.length,
            completedTasks: tasks.filter(t => t.status === 'completed').length,
            pendingTasks: tasks.filter(t => t.status === 'queued' || t.status === 'ready').length,
            inProgressTasks: tasks.filter(t => t.status === 'in-progress' || t.status === 'assigned').length
        };

        this._view.webview.postMessage({
            command: 'updateData',
            data: {
                agents,
                tasks,
                stats,
                workspaceName
            }
        });
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'modern-panel.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'modern-panel.css')
        );
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <title>NofX Control Panel</title>
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div class="panel-container">
        <!-- Header with workspace info -->
        <div class="panel-header">
            <div class="workspace-info">
                <span class="workspace-icon">🎸</span>
                <span class="workspace-name" id="workspace-name">NofX</span>
            </div>
            <div class="status-indicators">
                <span class="status-item" id="agent-count" title="Active Agents">
                    <span class="status-icon">🤖</span>
                    <span class="status-value">0</span>
                </span>
                <span class="status-item" id="task-count" title="Active Tasks">
                    <span class="status-icon">📋</span>
                    <span class="status-value">0</span>
                </span>
            </div>
        </div>

        <!-- Tab Navigation -->
        <div class="tab-bar">
            <button class="tab-button active" data-tab="teams">
                <span class="tab-icon">🤖</span>
                <span class="tab-label">Teams</span>
            </button>
            <button class="tab-button" data-tab="tasks">
                <span class="tab-icon">📋</span>
                <span class="tab-label">Tasks</span>
            </button>
            <button class="tab-button" data-tab="control">
                <span class="tab-icon">🎛️</span>
                <span class="tab-label">Control</span>
            </button>
            <button class="tab-button" data-tab="config">
                <span class="tab-icon">⚙️</span>
                <span class="tab-label">Config</span>
            </button>
        </div>

        <!-- Tab Content -->
        <div class="tab-content">
            <!-- Teams Tab -->
            <div class="tab-pane active" id="teams-tab">
                <div class="section">
                    <div class="section-header">
                        <span class="section-title">Quick Start</span>
                    </div>
                    <div class="action-list">
                        <div class="action-item primary" data-command="openConversationalConductor">
                            <span class="action-icon">🎵</span>
                            <span class="action-label">Open Conductor Terminal</span>
                            <span class="action-hint">Terminal-based conductor</span>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-header">
                        <span class="section-title">Active Agents</span>
                        <button class="section-action" data-command="refreshData" title="Refresh">
                            <span class="action-icon">🔄</span>
                        </button>
                    </div>
                    <div id="agents-list" class="item-list">
                        <div class="empty-state">
                            <span class="empty-icon">🤖</span>
                            <span class="empty-text">No active agents</span>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-header">
                        <span class="section-title">Spawn Agent</span>
                    </div>
                    <div class="agent-types">
                        <div class="agent-type-item" data-agent-type="frontend-specialist">
                            <span class="type-icon">🎨</span>
                            <span class="type-label">Frontend</span>
                        </div>
                        <div class="agent-type-item" data-agent-type="backend-specialist">
                            <span class="type-icon">⚙️</span>
                            <span class="type-label">Backend</span>
                        </div>
                        <div class="agent-type-item" data-agent-type="fullstack-developer">
                            <span class="type-icon">🔧</span>
                            <span class="type-label">Fullstack</span>
                        </div>
                        <div class="agent-type-item" data-agent-type="testing-specialist">
                            <span class="type-icon">🧪</span>
                            <span class="type-label">Testing</span>
                        </div>
                        <div class="agent-type-item" data-agent-type="devops-engineer">
                            <span class="type-icon">🚀</span>
                            <span class="type-label">DevOps</span>
                        </div>
                        <div class="agent-type-item" data-agent-type="database-architect">
                            <span class="type-icon">💾</span>
                            <span class="type-label">Database</span>
                        </div>
                        <div class="agent-type-item" data-agent-type="security-expert">
                            <span class="type-icon">🔒</span>
                            <span class="type-label">Security</span>
                        </div>
                        <div class="agent-type-item" data-agent-type="mobile-developer">
                            <span class="type-icon">📱</span>
                            <span class="type-label">Mobile</span>
                        </div>
                        <div class="agent-type-item" data-agent-type="ai-ml-specialist">
                            <span class="type-icon">🤖</span>
                            <span class="type-label">AI/ML</span>
                        </div>
                        <div class="agent-type-item" data-agent-type="algorithm-engineer">
                            <span class="type-icon">🧠</span>
                            <span class="type-label">Algorithms</span>
                        </div>
                        <div class="agent-type-item" data-agent-type="nlp-specialist">
                            <span class="type-icon">🗣️</span>
                            <span class="type-label">NLP</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tasks Tab -->
            <div class="tab-pane" id="tasks-tab">
                <div class="section">
                    <div class="section-header">
                        <span class="section-title">Task Queue</span>
                        <button class="section-action" data-command="createTask" title="Create Task">
                            <span class="action-icon">➕</span>
                        </button>
                    </div>
                    <div id="tasks-list" class="item-list">
                        <div class="empty-state">
                            <span class="empty-icon">📋</span>
                            <span class="empty-text">No tasks</span>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-header">
                        <span class="section-title">Progress</span>
                    </div>
                    <div class="progress-stats">
                        <div class="stat-item">
                            <span class="stat-label">Completed</span>
                            <span class="stat-value" id="completed-count">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">In Progress</span>
                            <span class="stat-value" id="progress-count">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Pending</span>
                            <span class="stat-value" id="pending-count">0</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Control Tab -->
            <div class="tab-pane" id="control-tab">
                <div class="section">
                    <div class="section-header">
                        <span class="section-title">Conductor</span>
                    </div>
                    <div class="action-list">
                        <div class="action-item" data-command="openConversationalConductor">
                            <span class="action-icon">💬</span>
                            <span class="action-label">Conversational Chat</span>
                            <span class="action-hint">Natural conversation</span>
                        </div>
                        <div class="action-item" data-command="nofx.openConductorTerminal">
                            <span class="action-icon">💻</span>
                            <span class="action-label">Terminal Conductor</span>
                            <span class="action-hint">Command-based</span>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-header">
                        <span class="section-title">Monitoring</span>
                    </div>
                    <div class="action-list">
                        <div class="action-item" data-command="openMessageFlow">
                            <span class="action-icon">📊</span>
                            <span class="action-label">Message Flow</span>
                            <span class="action-hint">Real-time dashboard</span>
                        </div>
                        <div class="action-item" data-command="nofx.showOrchestrator">
                            <span class="action-icon">🎛️</span>
                            <span class="action-label">Orchestrator Panel</span>
                            <span class="action-hint">System overview</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Config Tab -->
            <div class="tab-pane" id="config-tab">
                <div class="section">
                    <div class="section-header">
                        <span class="section-title">Templates</span>
                    </div>
                    <div class="action-list">
                        <div class="action-item" data-command="nofx.browseAgentTemplates">
                            <span class="action-icon">📚</span>
                            <span class="action-label">Browse Templates</span>
                            <span class="action-hint">View all templates</span>
                        </div>
                        <div class="action-item" data-command="nofx.createAgentTemplate">
                            <span class="action-icon">✨</span>
                            <span class="action-label">Create Template</span>
                            <span class="action-hint">New agent type</span>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-header">
                        <span class="section-title">Session Management</span>
                    </div>
                    <div class="action-list">
                        <div class="action-item" data-command="nofx.exportSessions">
                            <span class="action-icon">📤</span>
                            <span class="action-label">Export Sessions</span>
                            <span class="action-hint">Save to file</span>
                        </div>
                        <div class="action-item" data-command="nofx.restoreAgents">
                            <span class="action-icon">🔄</span>
                            <span class="action-label">Restore Session</span>
                            <span class="action-hint">Load previous state</span>
                        </div>
                        <div class="action-item warning" data-command="nofx.resetNofX">
                            <span class="action-icon">🗑️</span>
                            <span class="action-label">Reset Everything</span>
                            <span class="action-hint">Clear all data</span>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-header">
                        <span class="section-title">Git Worktrees</span>
                    </div>
                    <div class="action-list">
                        <div class="action-item" data-command="nofx.toggleWorktrees">
                            <span class="action-icon">🌳</span>
                            <span class="action-label">Toggle Worktrees</span>
                            <span class="action-hint">Enable/disable</span>
                        </div>
                        <div class="action-item" data-command="nofx.mergeAgentWork">
                            <span class="action-icon">🔀</span>
                            <span class="action-label">Merge Agent Work</span>
                            <span class="action-hint">Merge branches</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
