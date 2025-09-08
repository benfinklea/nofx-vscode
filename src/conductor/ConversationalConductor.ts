import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { ILoggingService, INotificationService, IContainer, SERVICE_TOKENS } from '../services/interfaces';
import { OrchestrationServer } from '../orchestration/OrchestrationServer';
import {
    createMessage,
    MessageType,
    extractJsonFromClaudeOutput,
    OrchestratorMessage
} from '../orchestration/MessageProtocol';

export interface ConversationMessage {
    id: string;
    sender: 'user' | 'conductor' | 'system';
    text: string;
    timestamp: string;
    type: 'message' | 'notification' | 'command' | 'advice';
    metadata?: any;
}

export class ConversationalConductor {
    private static currentPanel: ConversationalConductor | undefined;
    private panel: vscode.WebviewPanel | undefined;
    private claudeProcess: ChildProcess | undefined;

    private conversation: ConversationMessage[] = [];
    private isActive = false;
    private isProcessing = false;
    private currentResponse = '';

    private readonly agentManager: AgentManager;
    private readonly taskQueue: TaskQueue;
    private readonly loggingService: ILoggingService;
    private readonly notificationService: INotificationService;
    private readonly context: vscode.ExtensionContext;
    private readonly orchestrationServer: OrchestrationServer;
    private readonly aiPath: string;

    constructor(container: IContainer) {
        this.context = container.resolve<vscode.ExtensionContext>(SERVICE_TOKENS.ExtensionContext);
        this.agentManager = container.resolve<AgentManager>(SERVICE_TOKENS.AgentManager);
        this.taskQueue = container.resolve<TaskQueue>(SERVICE_TOKENS.TaskQueue);
        this.loggingService = container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.orchestrationServer = container.resolve<OrchestrationServer>(SERVICE_TOKENS.OrchestrationServer);

        // Get AI path from configuration
        const configPath = vscode.workspace.getConfiguration('nofx').get<string>('aiPath');
        this.aiPath = configPath || 'claude-code';

        // Load conversation history
        this.loadConversation();

        // Set up orchestration listeners
        this.setupOrchestrationListeners();
    }

    public static createOrShow(container: IContainer): ConversationalConductor {
        if (ConversationalConductor.currentPanel) {
            ConversationalConductor.currentPanel.reveal();
            return ConversationalConductor.currentPanel;
        }

        ConversationalConductor.currentPanel = new ConversationalConductor(container);
        ConversationalConductor.currentPanel.show();
        return ConversationalConductor.currentPanel;
    }

    public async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        // Create webview panel with modern styling
        this.panel = vscode.window.createWebviewPanel(
            'nofxConversationalConductor',
            '💬 NofX Conversational Conductor',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'webview'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'media')
                ]
            }
        );

        // Set webview content
        this.panel.webview.html = this.getWebviewContent();

        // Handle webview messages
        this.panel.webview.onDidReceiveMessage(
            async message => {
                await this.handleWebviewMessage(message);
            },
            undefined,
            this.context.subscriptions
        );

        // Handle panel disposal
        this.panel.onDidDispose(
            () => {
                this.cleanup();
            },
            undefined,
            this.context.subscriptions
        );

        // Start the conductor AI
        await this.startConductorAI();
    }

    public reveal(): void {
        this.panel?.reveal();
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        this.loggingService.debug('Received webview message:', message);

        switch (message.command) {
            case 'ready':
                await this.sendInitialState();
                break;

            case 'sendMessage':
                await this.handleUserMessage(message.text);
                break;

            case 'clearConversation':
                this.clearConversation();
                break;

            case 'exportConversation':
                await this.exportConversation();
                break;

            case 'getAdvice':
                await this.provideAdvice(message.topic);
                break;
        }
    }

    private async startConductorAI(): Promise<void> {
        if (this.claudeProcess) {
            this.stopConductorAI();
        }

        try {
            this.addMessage('system', '🔄 Starting conversational conductor...', 'notification');

            // Create enhanced system prompt for conversational conductor
            const systemPrompt = this.createConversationalSystemPrompt();

            // Escape system prompt for shell safety
            const escapedPrompt = systemPrompt.replace(/'/g, "'\\''");

            // Start Claude with conversational setup
            this.claudeProcess = spawn('sh', ['-c', `${this.aiPath} --append-system-prompt '${escapedPrompt}'`], {
                env: { ...process.env }
            });

            if (!this.claudeProcess.pid) {
                throw new Error('Failed to start conductor AI');
            }

            this.setupClaudeHandlers();
            this.isActive = true;

            this.addMessage('system', '✅ Conversational conductor is ready!', 'notification');

            // Send welcome message
            setTimeout(() => {
                this.addMessage('conductor', this.getWelcomeMessage(), 'message');
            }, 1000);
        } catch (error) {
            this.loggingService.error('Failed to start conductor AI:', error);
            this.addMessage('system', `❌ Failed to start conductor: ${error}`, 'notification');
        }
    }

    private createConversationalSystemPrompt(): string {
        const agents = this.agentManager.getActiveAgents();
        const agentList = agents.map(a => `- ${a.name} (${a.type}): ${a.status}`).join('\n');

        return `You are the NofX Conversational Conductor - an expert AI development partner and technical advisor.

Your personality and approach:
- Conversational and friendly, like a skilled tech lead colleague
- Proactive in offering insights and advice
- Ask clarifying questions to better understand needs
- Provide strategic guidance beyond just task execution
- Think out loud about technical decisions and trade-offs

Your core capabilities:
1. **Conversational Partner**: Engage in natural dialogue about technical challenges, architecture decisions, and project planning
2. **Strategic Advisor**: Provide insights on best practices, potential issues, and optimization opportunities
3. **Team Orchestrator**: Coordinate AI agents to execute tasks while maintaining conversation flow
4. **Proactive Monitor**: Keep track of project progress and proactively communicate important updates

ORCHESTRATION COMMANDS:
When you decide to spawn agents or assign tasks, embed these JSON commands naturally in your responses:

Spawn agent: {"type": "spawn", "role": "frontend-specialist", "name": "UI Expert"}
Assign task: {"type": "assign", "agentId": "agent-1", "task": "Create login form", "priority": "high"}
Query status: {"type": "status", "agentId": "all"}
Terminate agent: {"type": "terminate", "agentId": "agent-1"}

CONVERSATION STYLE:
- Be conversational and natural - avoid formal or robotic language
- Ask follow-up questions to understand context better
- Offer multiple approaches when discussing solutions
- Share your reasoning process - "I'm thinking..." or "Here's what I'd recommend..."
- Be proactive - suggest improvements or considerations the user might not have thought of

Current team status:
${agentList || 'No active agents yet'}

Available agent types:
- frontend-specialist: React, Vue, UI/UX, styling
- backend-specialist: Node.js, Python, APIs, databases
- fullstack-developer: End-to-end features and integration
- testing-specialist: Unit tests, E2E testing, QA processes
- devops-engineer: CI/CD, Docker, cloud deployment
- ai-ml-specialist: Machine learning, AI integration
- mobile-developer: iOS, Android, React Native
- security-expert: Security audits, penetration testing
- database-architect: Schema design, query optimization

Your goal is to be the technical partner they can bounce ideas off of, get advice from, and who proactively manages the development process while keeping them informed and engaged.

Start each session by understanding what they're working on and what kind of help they need today.`;
    }

    private getWelcomeMessage(): string {
        return `Hey there! 👋 I'm your conversational conductor - think of me as your AI technical partner and team lead.

I'm here to:
🤔 **Discuss and brainstorm** technical approaches with you
💡 **Offer insights and advice** on architecture and best practices  
🤖 **Coordinate AI agents** to execute tasks while we chat
📊 **Keep you updated** on progress and important developments
🔧 **Help solve problems** collaboratively

What are you working on today? I'd love to hear about your current project or any challenges you're facing. We can discuss the approach together, and when we're ready, I can spin up specialized agents to handle the implementation while we continue our conversation.`;
    }

    private setupClaudeHandlers(): void {
        if (!this.claudeProcess) return;

        this.claudeProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            this.loggingService.debug('Claude output:', text);

            // Accumulate response
            this.currentResponse += text;

            // Look for complete response (Claude CLI typically ends with a prompt or newline pattern)
            if (this.isProcessing && (text.includes('Human:') || text.includes('\n> ') || text.trim().endsWith('\n'))) {
                this.finalizeResponse();
            }
        });

        this.claudeProcess.stderr?.on('data', (data: Buffer) => {
            const error = data.toString();
            this.loggingService.error('Conductor AI error:', error);

            // If we get an error, show it and reset processing
            if (this.isProcessing) {
                this.addMessage('system', `AI Error: ${error.trim()}`, 'notification');
                this.isProcessing = false;
                this.currentResponse = '';
            }
        });

        this.claudeProcess.on('exit', code => {
            this.loggingService.info(`Conductor AI exited with code ${code}`);
            this.isActive = false;
            this.isProcessing = false;

            if (code !== 0) {
                this.addMessage('system', '⚠️ Conductor AI disconnected. Click to restart...', 'notification');
                // Don't auto-restart to avoid loops
            }
        });
    }

    private finalizeResponse(): void {
        if (!this.isProcessing || !this.currentResponse) return;

        // Clean up the response
        let response = this.currentResponse.trim();

        // Remove Claude CLI artifacts like prompts
        response = response.replace(/Human:\s*$/g, '');
        response = response.replace(/\n>\s*$/g, '');
        response = response.replace(/^\s*Assistant:\s*/g, '');
        response = response.trim();

        if (response && response !== 'undefined' && response.length > 0) {
            // Extract and handle JSON commands
            const command = this.extractJsonCommand(response);
            if (command) {
                this.handleOrchestrationCommand(command);
            }

            this.addMessage('conductor', response, 'message');
        } else {
            this.loggingService.warn('Empty or invalid response from Claude:', this.currentResponse);
            this.addMessage('system', 'Conductor is thinking...', 'notification');
        }

        this.currentResponse = '';
        this.isProcessing = false;
    }

    private extractJsonCommand(text: string): any {
        try {
            // Look for JSON commands in the text
            const jsonMatch = text.match(/\{[^}]*"type":\s*"[^"]*"[^}]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            this.loggingService.debug('No valid JSON command found in response');
        }
        return null;
    }

    private async handleUserMessage(text: string): Promise<void> {
        if (this.isProcessing) return;

        // Add user message to conversation
        this.addMessage('user', text, 'message');

        if (!this.claudeProcess || !this.isActive) {
            this.addMessage(
                'conductor',
                "I'm not fully connected right now. Let me restart my AI system...",
                'message'
            );
            await this.startConductorAI();
            return;
        }

        // Send to Claude
        this.isProcessing = true;
        this.currentResponse = '';

        try {
            this.claudeProcess.stdin?.write(`${text}\n`);
        } catch (error) {
            this.loggingService.error('Failed to send message to Claude:', error);
            this.addMessage('system', 'Failed to send message. Restarting conductor...', 'notification');
            this.isProcessing = false;
            await this.startConductorAI();
        }
    }

    private async provideAdvice(topic: string): Promise<void> {
        const advicePrompt = `The user is asking for advice about: ${topic}. 
        
Please provide strategic technical advice and insights about this topic. Consider:
- Best practices and common pitfalls
- Architecture considerations
- Performance implications
- Maintenance and scalability aspects
- Any relevant industry trends or standards

Be conversational and practical in your advice.`;

        await this.handleUserMessage(advicePrompt);
    }

    private handleOrchestrationCommand(command: OrchestratorMessage): void {
        this.loggingService.info('Handling orchestration command:', command);

        // For now, just add visual notification about the command
        // The actual orchestration will be handled via the embedded JSON commands
        // that Claude will output, which will be picked up by the existing system

        let actionMessage = '';
        switch (command.type) {
            case MessageType.SPAWN_AGENT:
                actionMessage = `🤖 Processing request to spawn ${command.payload?.role} agent named "${command.payload?.name}"`;
                break;
            case MessageType.ASSIGN_TASK:
                actionMessage = `📋 Processing request to assign task: ${command.payload?.task}`;
                break;
            case MessageType.QUERY_STATUS:
                actionMessage = `📊 Processing request to check agent status`;
                break;
            case MessageType.TERMINATE_AGENT:
                actionMessage = `🔴 Processing request to terminate agent ${command.payload?.agentId}`;
                break;
            default:
                actionMessage = `⚡ Processing orchestration command: ${command.type}`;
        }

        this.addMessage('system', actionMessage, 'command');
    }

    private setupOrchestrationListeners(): void {
        // Register with orchestration server for proactive notifications
        if (this.orchestrationServer) {
            this.orchestrationServer.setDashboardCallback((message: OrchestratorMessage) => {
                this.handleOrchestrationEvent(message);
            });
            this.loggingService.info('ConversationalConductor registered for orchestration events');
        } else {
            this.loggingService.warn('OrchestrationServer not available for conductor notifications');
        }
    }

    private handleOrchestrationEvent(message: any): void {
        // Proactively notify user about important events
        let notification = '';

        switch (message.type) {
            case MessageType.AGENT_READY:
                notification = `🟢 Agent "${message.payload?.name}" is now ready and connected!`;
                this.addMessage('system', notification, 'notification');
                // Also tell the conductor AI
                if (this.claudeProcess && this.isActive) {
                    this.claudeProcess.stdin?.write(
                        `[SYSTEM] Agent ${message.payload?.name} is now ready and available for tasks.\n`
                    );
                }
                break;

            case MessageType.TASK_COMPLETE:
                notification = `✅ Task completed by ${message.from}: ${message.payload?.output}`;
                this.addMessage('system', notification, 'notification');
                // Notify conductor AI
                if (this.claudeProcess && this.isActive) {
                    this.claudeProcess.stdin?.write(
                        `[SYSTEM] Task completed by ${message.from}: ${message.payload?.output}\n`
                    );
                }
                break;

            case MessageType.AGENT_STATUS:
                // Handle status updates silently unless critical
                if (message.payload?.status === 'error' || message.payload?.status === 'failed') {
                    notification = `⚠️ Agent ${message.from} encountered an issue: ${message.payload?.message}`;
                    this.addMessage('system', notification, 'notification');
                }
                break;
        }
    }

    private addMessage(
        sender: 'user' | 'conductor' | 'system',
        text: string,
        type: 'message' | 'notification' | 'command' | 'advice'
    ): void {
        const message: ConversationMessage = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            sender,
            text,
            timestamp: new Date().toISOString(),
            type,
            metadata: {}
        };

        this.conversation.push(message);
        this.saveConversation();

        // Send to webview
        this.panel?.webview.postMessage({
            command: 'addMessage',
            message
        });

        // Limit conversation history
        if (this.conversation.length > 200) {
            this.conversation = this.conversation.slice(-150);
        }
    }

    private clearConversation(): void {
        this.conversation = [];
        this.saveConversation();
        this.panel?.webview.postMessage({ command: 'clearConversation' });
    }

    private async exportConversation(): Promise<void> {
        const content = this.conversation
            .map(msg => {
                const timestamp = new Date(msg.timestamp).toLocaleString();
                const icon = msg.sender === 'user' ? '👤' : msg.sender === 'conductor' ? '🤖' : '⚙️';
                return `[${timestamp}] ${icon} ${msg.sender.toUpperCase()}: ${msg.text}`;
            })
            .join('\n\n');

        const uri = vscode.Uri.parse(`untitled:nofx-conversation-${Date.now()}.md`);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        await editor.edit(edit => {
            edit.insert(new vscode.Position(0, 0), `# NofX Conversational Conductor Chat Export\n\n${content}`);
        });
    }

    private async sendInitialState(): Promise<void> {
        const agents = this.agentManager.getActiveAgents();
        const state = {
            conversation: this.conversation,
            agents: agents.map(agent => ({
                id: agent.id,
                name: agent.name,
                type: agent.type,
                status: agent.status
            })),
            isActive: this.isActive
        };

        this.panel?.webview.postMessage({
            command: 'initialState',
            state
        });
    }

    private loadConversation(): void {
        const stored = this.context.globalState.get<ConversationMessage[]>('conversationalConductorHistory');
        if (stored && stored.length > 0) {
            this.conversation = stored.slice(-50); // Keep only recent messages
        }
    }

    private saveConversation(): void {
        this.context.globalState.update('conversationalConductorHistory', this.conversation.slice(-100));
    }

    private stopConductorAI(): void {
        if (this.claudeProcess) {
            this.claudeProcess.kill();
            this.claudeProcess = undefined;
        }
        this.isActive = false;

        // Clear orchestration server callback
        if (this.orchestrationServer) {
            this.orchestrationServer.clearDashboardCallback();
        }
    }

    private cleanup(): void {
        ConversationalConductor.currentPanel = undefined;
        this.stopConductorAI();
        this.panel = undefined;
        this.saveConversation();
    }

    private getWebviewContent(): string {
        const styleUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'conversational-conductor-modern.css')
        );
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel!.webview.cspSource} https: data:; style-src 'unsafe-inline' ${this.panel!.webview.cspSource}; script-src 'nonce-${nonce}';">
    <title>Conversational Conductor</title>
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div class="conductor-container">
        <!-- Header -->
        <div class="conductor-header">
            <div class="header-title">
                <span class="title-icon">💬</span>
                <span class="title-text">Conversational Conductor</span>
                <span class="connection-status" id="connection-status">🔴</span>
            </div>
            <div class="header-actions">
                <button id="advice-btn" class="header-btn" title="Get Technical Advice">💡</button>
                <button id="clear-btn" class="header-btn" title="Clear Conversation">🗑️</button>
                <button id="export-btn" class="header-btn" title="Export Conversation">📤</button>
            </div>
        </div>

        <!-- Main content area -->
        <div class="main-content">
            <!-- Conversation area -->
            <div class="conversation-area">
                <div id="messages" class="messages-container">
                    <!-- Messages will be added here -->
                </div>
                
                <!-- Input area -->
                <div class="input-area">
                    <div class="input-container">
                        <textarea 
                            id="message-input" 
                            class="message-input" 
                            placeholder="Tell me about your project, ask for advice, or describe what you'd like to build..."
                            rows="3"
                        ></textarea>
                        <button id="send-btn" class="send-button" title="Send message">
                            <span class="send-icon">➤</span>
                        </button>
                    </div>
                    <div class="input-suggestions">
                        <button class="suggestion-btn" data-suggestion="What do you think about this architecture approach?">💭 Architecture advice</button>
                        <button class="suggestion-btn" data-suggestion="Let's build a new feature for user authentication">🚀 Build feature</button>
                        <button class="suggestion-btn" data-suggestion="Can you help me review and improve this code?">🔍 Code review</button>
                        <button class="suggestion-btn" data-suggestion="What are the current agents working on?">📊 Agent status</button>
                        <button class="suggestion-btn" data-suggestion="Help me optimize performance in this application">⚡ Performance</button>
                        <button class="suggestion-btn" data-suggestion="I need help with testing strategies">🧪 Testing help</button>
                    </div>
                </div>
            </div>

            <!-- Sidebar -->
            <div class="sidebar">
                <div class="sidebar-section">
                    <h3 class="section-title">🤖 Active Agents</h3>
                    <div id="agents-list" class="agents-list">
                        <div class="empty-state">No agents active</div>
                    </div>
                </div>
                
                <div class="sidebar-section">
                    <h3 class="section-title">⚡ Quick Actions</h3>
                    <div class="quick-actions">
                        <button class="action-btn" data-action="spawn-frontend">Add Frontend Agent</button>
                        <button class="action-btn" data-action="spawn-backend">Add Backend Agent</button>
                        <button class="action-btn" data-action="spawn-testing">Add Testing Agent</button>
                        <button class="action-btn" data-action="check-status">Check All Status</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        console.log('Conductor script loading...');
        
        const vscode = acquireVsCodeApi();
        let elements = {};
        
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM loaded, initializing conductor...');
            
            // Get all the elements we need
            elements = {
                messageInput: document.getElementById('message-input'),
                sendButton: document.getElementById('send-btn'),
                messagesContainer: document.getElementById('messages'),
                connectionStatus: document.getElementById('connection-status'),
                adviceButton: document.getElementById('advice-btn'),
                clearButton: document.getElementById('clear-btn')
            };
            
            // Check if elements exist
            console.log('Elements found:', Object.keys(elements).filter(key => elements[key]));
            
            // Add event listeners
            if (elements.sendButton) {
                elements.sendButton.addEventListener('click', sendMessage);
                console.log('Send button click listener added');
            }
            
            if (elements.messageInput) {
                elements.messageInput.addEventListener('keydown', function(e) {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        sendMessage();
                    }
                });
            }
            
            if (elements.adviceButton) {
                elements.adviceButton.addEventListener('click', function() {
                    elements.messageInput.value = "I need some technical advice and guidance on my current project. Can you help?";
                    sendMessage();
                });
            }
            
            if (elements.clearButton) {
                elements.clearButton.addEventListener('click', function() {
                    if (confirm('Clear conversation history?')) {
                        elements.messagesContainer.innerHTML = '';
                        vscode.postMessage({ command: 'clearConversation' });
                    }
                });
            }
            
            // Add suggestion button listeners
            document.querySelectorAll('.suggestion-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const suggestion = this.getAttribute('data-suggestion');
                    elements.messageInput.value = suggestion;
                    sendMessage();
                });
            });
            
            console.log('Conductor initialization complete');
        });
        
        function sendMessage() {
            console.log('sendMessage called');
            const text = elements.messageInput.value.trim();
            console.log('Message text:', text);
            
            if (!text) return;
            
            // Add user message immediately
            addMessage('user', text);
            
            // Clear input and show thinking indicator
            elements.messageInput.value = '';
            updateConnectionStatus('thinking');
            
            // Send to extension
            vscode.postMessage({
                command: 'sendMessage',
                text: text
            });
            
            console.log('Message sent to extension');
        }
        
        function addMessage(sender, text, type = 'message') {
            console.log('Adding message:', sender, text);
            
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${sender}\`;
            
            const timestamp = new Date().toLocaleTimeString();
            
            messageDiv.innerHTML = \`
                <div class="message-header">
                    <span class="message-sender">\${sender === 'user' ? '👤 You' : '🤖 Conductor'}</span>
                    <span class="message-timestamp">\${timestamp}</span>
                </div>
                <div class="message-content">\${text}</div>
            \`;
            
            elements.messagesContainer.appendChild(messageDiv);
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
        }
        
        function updateConnectionStatus(status) {
            console.log('Updating connection status:', status);
            if (!elements.connectionStatus) return;
            
            switch (status) {
                case 'connected':
                    elements.connectionStatus.textContent = '🟢';
                    elements.connectionStatus.title = 'Connected';
                    break;
                case 'thinking':
                    elements.connectionStatus.textContent = '🔴';
                    elements.connectionStatus.title = 'AI thinking...';
                    elements.connectionStatus.style.animation = 'pulse 1.5s infinite';
                    break;
                case 'error':
                    elements.connectionStatus.textContent = '🔴';
                    elements.connectionStatus.title = 'Error';
                    elements.connectionStatus.style.animation = '';
                    break;
                default:
                    elements.connectionStatus.textContent = '🔴';
                    elements.connectionStatus.title = 'Disconnected';
                    elements.connectionStatus.style.animation = '';
            }
        }
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('Received message from extension:', message);
            
            switch (message.command) {
                case 'addMessage':
                    addMessage(message.sender, message.text, message.type);
                    updateConnectionStatus('connected');
                    break;
                case 'updateStatus':
                    updateConnectionStatus(message.status);
                    break;
                case 'clearConversation':
                    elements.messagesContainer.innerHTML = '';
                    break;
            }
        });
        
        // Initialize connection status
        updateConnectionStatus('connected');
        
        console.log('Conductor script loaded successfully');
    </script>
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
