import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';

export class ConductorChatWebview {
    private panel: vscode.WebviewPanel | undefined;
    private claudeProcess: ChildProcess | undefined;
    private agentManager: AgentManager;
    private taskQueue: TaskQueue;
    private context: vscode.ExtensionContext;
    private chatHistory: ChatMessage[] = [];
    private claudePath: string;
    private conductorLevel: 'basic' | 'smart' | 'vp' = 'smart';
    private isProcessing = false;
    private currentResponse = '';

    constructor(
        context: vscode.ExtensionContext,
        agentManager: AgentManager,
        taskQueue: TaskQueue
    ) {
        this.context = context;
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.claudePath = vscode.workspace.getConfiguration('nofx').get<string>('claudePath') || 'claude';
        
        // Load chat history from storage
        this.loadChatHistory();
    }

    public async show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        // Create webview panel
        this.panel = vscode.window.createWebviewPanel(
            'nofxConductorChat',
            '🎸 NofX Conductor',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media'),
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
                    case 'sendMessage':
                        await this.handleUserMessage(message.text);
                        break;
                    case 'changeLevel':
                        await this.changeConductorLevel(message.level);
                        break;
                    case 'clearChat':
                        this.clearChat();
                        break;
                    case 'exportChat':
                        this.exportChat();
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
                this.stopClaude();
                this.saveChatHistory();
            },
            undefined,
            this.context.subscriptions
        );

        // Start Claude process
        await this.startClaude();

        // Send initial state to webview
        this.updateWebview();
    }

    private async startClaude() {
        // Stop existing process if any
        this.stopClaude();

        const systemPrompt = this.getSystemPrompt();
        
        // Spawn Claude process with system prompt
        this.claudeProcess = spawn(this.claudePath, [
            '--append-system-prompt',
            systemPrompt
        ], {
            shell: true
        });

        // Handle Claude output
        this.claudeProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            this.currentResponse += text;
            
            // Send partial response to webview
            this.panel?.webview.postMessage({
                command: 'streamResponse',
                text: this.currentResponse
            });
        });

        // Handle Claude errors
        this.claudeProcess.stderr?.on('data', (data: Buffer) => {
            console.error('Claude error:', data.toString());
            this.panel?.webview.postMessage({
                command: 'error',
                text: 'Claude encountered an error: ' + data.toString()
            });
        });

        // Handle process exit
        this.claudeProcess.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                this.panel?.webview.postMessage({
                    command: 'error',
                    text: `Claude process exited with code ${code}`
                });
            }
        });

        // Send initial greeting
        const greeting = this.getGreeting();
        this.addMessage('conductor', greeting);
    }

    private stopClaude() {
        if (this.claudeProcess) {
            this.claudeProcess.kill();
            this.claudeProcess = undefined;
        }
    }

    private async handleUserMessage(text: string) {
        if (this.isProcessing || !this.claudeProcess) {
            return;
        }

        this.isProcessing = true;
        this.currentResponse = '';

        // Add user message to history
        this.addMessage('user', text);

        // Send message to Claude
        this.claudeProcess.stdin?.write(text + '\n');

        // Wait for response to complete (simplified - in production would need better detection)
        setTimeout(() => {
            if (this.currentResponse) {
                this.addMessage('conductor', this.currentResponse);
                this.currentResponse = '';
            }
            this.isProcessing = false;
        }, 3000);
    }

    private async changeConductorLevel(level: 'basic' | 'smart' | 'vp') {
        this.conductorLevel = level;
        await this.startClaude();
        
        this.panel?.webview.postMessage({
            command: 'levelChanged',
            level: level
        });
    }

    private getSystemPrompt(): string {
        const agents = this.agentManager.getActiveAgents();
        const agentList = agents.map(a => `- ${a.name} (${a.type}): ${a.status}`).join('\n');

        switch (this.conductorLevel) {
            case 'vp':
                return this.getVPSystemPrompt();
            case 'smart':
                return this.getSmartSystemPrompt();
            default:
                return this.getBasicSystemPrompt();
        }
    }

    private getBasicSystemPrompt(): string {
        const agents = this.agentManager.getActiveAgents();
        const agentList = agents.map(a => `- ${a.name} (${a.type}): ${a.status}`).join('\n');
        
        return `You are the NofX Conductor, an orchestration AI that manages a team of specialized agents.

Your role:
1. Understand what the user wants to build or fix
2. Break down the request into tasks
3. Assign tasks to appropriate agents
4. Monitor progress and handle conflicts
5. Report back to the user

Current agents:
${agentList}

Available agent types:
- frontend-specialist: React, Vue, UI/UX
- backend-specialist: Node.js, Python, databases  
- fullstack-developer: End-to-end features
- devops-engineer: CI/CD, Docker, cloud
- testing-specialist: Unit tests, E2E, QA
- ai-ml-specialist: Machine learning, AI integration
- mobile-developer: iOS, Android, React Native
- security-expert: Security audits, penetration testing
- database-architect: Schema design, optimization

Always be helpful, clear, and proactive in managing the development team.`;
    }

    private getSmartSystemPrompt(): string {
        // Smart conductor prompt with more intelligence
        return `You are the NofX Intelligent Conductor v2.0 - a smart orchestration system with enhanced capabilities.

${this.getBasicSystemPrompt()}

Additional Intelligence:
- Proactive conflict detection and resolution
- Task dependency management
- Parallel task optimization
- Resource allocation strategies
- Quality gate enforcement
- Performance monitoring

You can see code, understand context, and make intelligent decisions about task distribution.`;
    }

    private getVPSystemPrompt(): string {
        // VP-level conductor prompt
        return `You are the VP of Engineering for NofX - a senior technical leader with 20+ years of experience.

${this.getSmartSystemPrompt()}

VP-Level Capabilities:
- Architectural decision making
- Technical debt assessment
- Risk analysis and mitigation
- Team performance optimization
- Strategic planning
- Code quality enforcement
- Mentorship and guidance

You don't just coordinate - you LEAD. Make architectural decisions, enforce quality standards, and ensure exceptional software delivery.`;
    }

    private getGreeting(): string {
        switch (this.conductorLevel) {
            case 'vp':
                return `🧠 **VP of Engineering here!**

I'm your senior technical leader. I will:
- Architect your entire system before we write code
- Ensure quality and prevent technical debt
- Coordinate complex multi-agent workflows
- Learn and improve from every interaction

What would you like to build? I'll create a comprehensive plan.`;
            
            case 'smart':
                return `🎸 **Intelligent Conductor v2.0 ready!**

I can:
- See all active agents and their status
- Create and assign tasks automatically
- Monitor for conflicts between agents
- Coordinate complex multi-agent workflows

Tell me what you want to build, and I'll orchestrate the team!`;
            
            default:
                return `🎼 **NofX Conductor ready!**

I manage a team of specialized AI agents. Tell me what you want to build or fix, and I will orchestrate the agents to complete your request.

What would you like to work on today?`;
        }
    }

    private addMessage(sender: 'user' | 'conductor', text: string) {
        const message: ChatMessage = {
            id: Date.now().toString(),
            sender,
            text,
            timestamp: new Date().toISOString()
        };

        this.chatHistory.push(message);
        this.saveChatHistory();

        this.panel?.webview.postMessage({
            command: 'addMessage',
            message
        });
    }

    private updateWebview() {
        const agents = this.agentManager.getActiveAgents();
        
        this.panel?.webview.postMessage({
            command: 'updateState',
            state: {
                agents,
                level: this.conductorLevel,
                history: this.chatHistory
            }
        });
    }

    private clearChat() {
        this.chatHistory = [];
        this.saveChatHistory();
        this.panel?.webview.postMessage({
            command: 'clearChat'
        });
    }

    private exportChat() {
        const content = this.chatHistory.map(msg => 
            `[${msg.timestamp}] ${msg.sender.toUpperCase()}: ${msg.text}`
        ).join('\n\n');

        const uri = vscode.Uri.parse(`untitled:conductor-chat-${Date.now()}.md`);
        vscode.workspace.openTextDocument(uri).then(doc => {
            vscode.window.showTextDocument(doc).then(editor => {
                editor.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), content);
                });
            });
        });
    }

    private loadChatHistory() {
        const stored = this.context.globalState.get<ChatMessage[]>('conductorChatHistory');
        if (stored) {
            this.chatHistory = stored;
        }
    }

    private saveChatHistory() {
        this.context.globalState.update('conductorChatHistory', this.chatHistory);
    }

    private getWebviewContent(): string {
        const scriptUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'chat.js')
        );
        const styleUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'chat.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NofX Conductor Chat</title>
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <div class="header-left">
                <span class="header-title">🎸 NofX Conductor</span>
                <select id="conductor-level" class="level-selector">
                    <option value="basic">Basic</option>
                    <option value="smart" selected>Smart</option>
                    <option value="vp">VP Level</option>
                </select>
            </div>
            <div class="header-actions">
                <button id="clear-chat" class="header-button" title="Clear Chat">🗑️</button>
                <button id="export-chat" class="header-button" title="Export Chat">📤</button>
            </div>
        </div>
        
        <div class="chat-main">
            <div class="chat-messages" id="chat-messages">
                <!-- Messages will be added here -->
            </div>
            <div class="chat-sidebar">
                <div class="sidebar-title">Active Agents</div>
                <div id="agent-list" class="agent-list">
                    <!-- Agent status will be shown here -->
                </div>
            </div>
        </div>
        
        <div class="chat-input-container">
            <textarea 
                id="chat-input" 
                class="chat-input" 
                placeholder="Tell the conductor what you want to build..."
                rows="3"
            ></textarea>
            <button id="send-button" class="send-button">Send</button>
        </div>
    </div>
    
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}

interface ChatMessage {
    id: string;
    sender: 'user' | 'conductor';
    text: string;
    timestamp: string;
}