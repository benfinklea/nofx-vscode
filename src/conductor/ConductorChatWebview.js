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
exports.ConductorChatWebview = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const ws_1 = require("ws");
const MessageProtocol_1 = require("../orchestration/MessageProtocol");
class ConductorChatWebview {
    constructor(context, agentManager, taskQueue, loggingService, notificationService) {
        this.loggingService = loggingService;
        this.notificationService = notificationService;
        this.chatHistory = [];
        this.isProcessing = false;
        this.currentResponse = '';
        this.isConnectedToOrchestrator = false;
        this.simulatedClaude = false;
        this.context = context;
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        const configPath = vscode.workspace.getConfiguration('nofx').get('claudePath');
        if (configPath) {
            this.claudePath = configPath;
        }
        else {
            this.claudePath = 'claude-code';
        }
        this.loadChatHistory();
    }
    async show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('nofxConductorChat', '🎸 NofX Conductor', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media'),
                vscode.Uri.joinPath(this.context.extensionUri, 'webview')
            ]
        });
        this.panel.webview.html = this.getWebviewContent();
        this.panel.webview.onDidReceiveMessage(async (message) => {
            this.loggingService?.debug('[ConductorChat] Webview message:', message);
            switch (message.command) {
                case 'ready':
                    this.loggingService?.debug('[ConductorChat] Webview ready - sending initial state');
                    this.updateWebview();
                    break;
                case 'sendMessage':
                    this.loggingService?.debug('[ConductorChat] User message received:', message.text);
                    await this.handleUserMessage(message.text);
                    break;
                case 'clearChat':
                    this.clearChat();
                    break;
                case 'exportChat':
                    this.exportChat();
                    break;
            }
        }, undefined, this.context.subscriptions);
        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.stopClaude();
            this.saveChatHistory();
        }, undefined, this.context.subscriptions);
        setTimeout(() => {
            this.startClaude();
        }, 500);
    }
    async startClaude() {
        this.stopClaude();
        const systemPrompt = this.getSystemPrompt();
        this.loggingService?.info('[ConductorChat] Attempting to start Claude process...');
        this.loggingService?.debug('[ConductorChat] Claude path:', this.claudePath);
        this.loggingService?.debug('[ConductorChat] Working directory:', process.cwd());
        this.loggingService?.debug('[ConductorChat] PATH environment:', process.env.PATH);
        this.addMessage('conductor', `🔄 Attempting to connect to Claude at: ${this.claudePath}...`);
        try {
            this.loggingService?.debug('[ConductorChat] Spawning Claude process without flags...');
            this.claudeProcess = (0, child_process_1.spawn)(this.claudePath, [], {
                shell: false,
                env: {
                    ...process.env,
                }
            });
            if (!this.claudeProcess || !this.claudeProcess.pid) {
                throw new Error('Failed to spawn Claude process - no PID received');
            }
            this.loggingService?.info('[ConductorChat] Claude process spawned with PID:', this.claudeProcess.pid);
            this.addMessage('conductor', `✅ Claude process started (PID: ${this.claudeProcess.pid}). Sending system prompt...`);
            this.setupClaudeHandlers();
            setTimeout(() => {
                if (this.claudeProcess && this.claudeProcess.stdin && !this.claudeProcess.killed) {
                    this.loggingService?.debug('[ConductorChat] Sending system prompt to Claude...');
                    this.claudeProcess.stdin.write(systemPrompt + '\n\n');
                    this.claudeProcess.stdin.write('Please acknowledge that you understand your role as the NofX Conductor.\n');
                }
            }, 2000);
            this.simulatedClaude = false;
        }
        catch (spawnError) {
            this.loggingService?.error('[ConductorChat] Failed to spawn Claude:', spawnError);
            this.loggingService?.error('[ConductorChat] Error stack:', spawnError.stack);
            let errorDetails = `❌ Failed to connect to Claude\n\n`;
            errorDetails += `**Error:** ${spawnError.message}\n\n`;
            errorDetails += `**Attempted command:** ${this.claudePath}\n\n`;
            errorDetails += `**Troubleshooting:**\n`;
            errorDetails += `1. Check if Claude is installed: Run 'which claude' or 'which claude-code' in terminal\n`;
            errorDetails += `2. Check PATH: Your PATH may not include Claude's location\n`;
            errorDetails += `3. Try setting full path in settings: e.g., '/usr/local/bin/claude'\n`;
            errorDetails += `4. For Cursor: Try 'claude-code' instead of 'claude'\n\n`;
            errorDetails += `**Current PATH:** ${process.env.PATH?.substring(0, 200)}...`;
            this.addMessage('conductor', errorDetails);
            this.simulatedClaude = false;
        }
    }
    setupClaudeHandlers() {
        if (!this.claudeProcess) {
            this.loggingService?.error('[ConductorChat] No Claude process to set up handlers for');
            return;
        }
        this.loggingService?.debug('[ConductorChat] Setting up Claude handlers');
        this.claudeProcess.stdout?.on('data', (data) => {
            const text = data.toString();
            this.loggingService?.debug('[ConductorChat] Claude stdout received, length:', text.length);
            this.loggingService?.debug('[ConductorChat] Claude stdout content:', text);
            if (!this.currentResponse && text.trim()) {
                this.addMessage('conductor', `📝 Claude responding: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
            }
            this.currentResponse += text;
            const command = (0, MessageProtocol_1.extractJsonFromClaudeOutput)(text);
            if (command && this.isConnectedToOrchestrator) {
                this.loggingService?.debug('[ConductorChat] JSON command detected:', command);
                this.sendToOrchestrator(command);
            }
            if (this.isProcessing) {
                this.loggingService?.debug('[ConductorChat] Processing user message, response so far:', { length: this.currentResponse.length });
            }
        });
        this.claudeProcess.stderr?.on('data', (data) => {
            const errorText = data.toString();
            this.loggingService?.error('[ConductorChat] Claude stderr received:', errorText);
            this.addMessage('conductor', `⚠️ Claude stderr: ${errorText}`);
            if (errorText.toLowerCase().includes('error') || errorText.toLowerCase().includes('failed')) {
                this.panel?.webview.postMessage({
                    command: 'error',
                    text: 'Claude error: ' + errorText
                });
            }
        });
        this.claudeProcess.on('exit', (code) => {
            this.loggingService?.info('[ConductorChat] Claude process exited with code:', code);
            this.claudeProcess = undefined;
            this.simulatedClaude = false;
            if (code !== 0 && code !== null) {
                this.panel?.webview.postMessage({
                    command: 'error',
                    text: `Claude process exited (code ${code}). No fallback to simulation mode.`
                });
            }
            this.addMessage('conductor', `⚠️ Claude process disconnected (exit code: ${code})`);
        });
        this.claudeProcess.on('error', (error) => {
            this.loggingService?.error('[ConductorChat] Claude process error:', error);
            this.simulatedClaude = false;
            this.addMessage('conductor', `❌ Claude process error: ${error.message}`);
        });
        this.connectToOrchestrator().catch(error => {
            this.loggingService?.error('[ConductorChat] Failed to connect to orchestrator:', error);
        });
    }
    useMockClaude() {
        this.loggingService?.debug('Mock Claude disabled - we want to see real connection status');
        this.simulatedClaude = false;
        this.addMessage('conductor', '🔌 Mock mode disabled. Waiting for real Claude connection...');
    }
    stopClaude() {
        if (this.claudeProcess) {
            this.claudeProcess.kill();
            this.claudeProcess = undefined;
        }
        this.disconnectFromOrchestrator();
    }
    async connectToOrchestrator() {
        const portsToTry = [7777, 7778, 7779, 7780, 8888, 8889, 9999];
        for (const port of portsToTry) {
            try {
                await this.tryConnectToPort(port);
                this.orchestrationPort = port;
                this.loggingService?.info(`Conductor connected to orchestration server on port ${port}`);
                return;
            }
            catch (error) {
            }
        }
        this.loggingService?.warn('Could not connect to orchestration server on any port - continuing without orchestration');
    }
    async tryConnectToPort(port) {
        return new Promise((resolve, reject) => {
            const ws = new ws_1.WebSocket(`ws://localhost:${port}`);
            let connected = false;
            const timeout = setTimeout(() => {
                if (!connected) {
                    ws.close();
                    reject(new Error(`Connection timeout on port ${port}`));
                }
            }, 1000);
            ws.on('open', () => {
                clearTimeout(timeout);
                connected = true;
                this.wsClient = ws;
                this.isConnectedToOrchestrator = true;
                const registration = {
                    type: 'register',
                    id: 'conductor',
                    name: 'NofX Conductor',
                    clientType: 'conductor',
                    role: 'vp'
                };
                ws.send(JSON.stringify(registration));
                this.panel?.webview.postMessage({
                    command: 'orchestratorConnected',
                    status: true
                });
                ws.on('message', (data) => {
                    const message = JSON.parse(data.toString());
                    this.handleOrchestratorMessage(message);
                });
                ws.on('ping', () => {
                    this.loggingService?.debug('[ConductorChat] Received ping from orchestration server');
                    ws.pong();
                });
                const keepAlive = setInterval(() => {
                    if (ws.readyState === ws_1.WebSocket.OPEN) {
                        ws.pong();
                    }
                    else {
                        clearInterval(keepAlive);
                    }
                }, 20000);
                ws.on('close', () => {
                    this.loggingService?.info('Conductor disconnected from orchestration server');
                    clearInterval(keepAlive);
                    this.isConnectedToOrchestrator = false;
                    this.panel?.webview.postMessage({
                        command: 'orchestratorConnected',
                        status: false
                    });
                });
                ws.on('error', (error) => {
                    if (!connected) {
                    }
                    else {
                        this.loggingService?.error('WebSocket error:', error);
                        this.isConnectedToOrchestrator = false;
                    }
                });
                resolve();
            });
            ws.on('error', (error) => {
                clearTimeout(timeout);
                if (!connected) {
                    reject(error);
                }
            });
        });
    }
    disconnectFromOrchestrator() {
        if (this.wsClient) {
            this.wsClient.close();
            this.wsClient = undefined;
            this.isConnectedToOrchestrator = false;
        }
    }
    sendToOrchestrator(message) {
        if (this.wsClient && this.wsClient.readyState === ws_1.WebSocket.OPEN) {
            this.wsClient.send(JSON.stringify(message));
        }
    }
    handleOrchestratorMessage(message) {
        switch (message.type) {
            case MessageProtocol_1.MessageType.CONNECTION_ESTABLISHED:
                this.loggingService?.info('Conductor registered with orchestrator');
                break;
            case MessageProtocol_1.MessageType.AGENT_READY:
                this.claudeProcess?.stdin?.write(`[AGENT READY] ${message.payload.name} is now available\n`);
                break;
            case MessageProtocol_1.MessageType.TASK_COMPLETE:
                const taskInfo = message.payload;
                this.claudeProcess?.stdin?.write(`[TASK COMPLETE] Agent ${message.from} completed: ${taskInfo.output}\n`);
                break;
            case MessageProtocol_1.MessageType.AGENT_STATUS:
                this.claudeProcess?.stdin?.write(`[STATUS UPDATE] ${JSON.stringify(message.payload)}\n`);
                break;
            case MessageProtocol_1.MessageType.AGENT_QUERY:
                const query = message.payload;
                this.claudeProcess?.stdin?.write(`[AGENT QUESTION] ${message.from}: ${query.question}\n`);
                break;
        }
    }
    async handleUserMessage(text) {
        this.loggingService?.debug('[ConductorChat] handleUserMessage called with:', text);
        if (this.isProcessing) {
            this.loggingService?.debug('[ConductorChat] Already processing, ignoring message');
            return;
        }
        this.addMessage('user', text);
        if (this.simulatedClaude || !this.claudeProcess) {
            this.loggingService?.warn('[ConductorChat] No Claude process available');
            this.addMessage('conductor', '❌ Claude is not connected. Please restart the conductor.');
            this.isProcessing = false;
            return;
        }
        this.loggingService?.debug('[ConductorChat] Sending to Claude process');
        this.isProcessing = true;
        this.currentResponse = '';
        if (this.claudeProcess && this.claudeProcess.stdin && !this.claudeProcess.killed) {
            this.loggingService?.debug('[ConductorChat] Writing to Claude stdin:', text);
            try {
                this.claudeProcess.stdin.write(text + '\n', (error) => {
                    if (error) {
                        this.loggingService?.error('[ConductorChat] Error writing to stdin:', error);
                        this.addMessage('conductor', `❌ Error sending message: ${error.message}`);
                        this.isProcessing = false;
                    }
                    else {
                        this.loggingService?.debug('[ConductorChat] Message sent to Claude stdin successfully');
                    }
                });
            }
            catch (error) {
                this.loggingService?.error('[ConductorChat] Exception writing to stdin:', error);
                this.addMessage('conductor', `❌ Failed to send message: ${error.message}`);
                this.isProcessing = false;
            }
        }
        else {
            this.loggingService?.error('[ConductorChat] Claude process not available for writing');
            this.addMessage('conductor', '❌ Claude process not available');
            this.isProcessing = false;
        }
        let lastResponseLength = 0;
        let checkCount = 0;
        const checkInterval = setInterval(() => {
            checkCount++;
            if ((this.currentResponse.length > 0 && this.currentResponse.length === lastResponseLength) || checkCount > 60) {
                if (this.currentResponse) {
                    this.loggingService?.debug('[ConductorChat] Claude response complete, length:', this.currentResponse.length);
                    this.addMessage('conductor', this.currentResponse);
                    this.currentResponse = '';
                }
                else if (checkCount > 60) {
                    this.loggingService?.warn('[ConductorChat] Claude response timeout');
                    this.addMessage('conductor', '⏱️ Response timeout - Claude may not be responding.');
                }
                this.isProcessing = false;
                clearInterval(checkInterval);
            }
            lastResponseLength = this.currentResponse.length;
        }, 500);
    }
    handleSimulatedResponse(text) {
        this.loggingService?.debug('[ConductorChat] handleSimulatedResponse for:', text);
        this.isProcessing = true;
        setTimeout(() => {
            let response = '';
            const lowerText = text.toLowerCase();
            if (lowerText.includes('test') || lowerText.includes('coverage')) {
                response = `📊 **Analyzing project for test coverage...**

Based on my analysis of the VS Code extension:

**Current Coverage:**
- Unit test coverage: Minimal (~5%)
- Test infrastructure: Jest configured
- Test files found: Very few

**Recommendations:**
1. Add unit tests for core components (AgentManager, TaskQueue)
2. Create integration tests for WebSocket orchestration
3. Add E2E tests for webview components

Would you like me to help create a comprehensive testing strategy?`;
            }
            else if (lowerText.includes('hello') || lowerText.includes('hi')) {
                response = `👋 **Hello! I'm your NofX Conductor.**

I can help you:
- 🤖 Manage AI agents for development tasks
- 📝 Review code and suggest improvements
- 🔄 Coordinate complex workflows
- 🚀 Deploy and scale your projects

What would you like to work on today?`;
            }
            else if (lowerText.includes('spawn') || lowerText.includes('agent')) {
                response = `🤖 **Let's spawn an agent!**

Available agent types:
- 🎨 **frontend-specialist** - React, Vue, UI/UX
- ⚙️ **backend-specialist** - Node.js, APIs, databases
- 🧪 **testing-specialist** - Unit tests, E2E, QA
- 🚀 **devops-engineer** - CI/CD, Docker, cloud
- 🔒 **security-expert** - Security audits, pen testing
- 💾 **database-architect** - Schema design, optimization

Which type would you like to spawn?`;
            }
            else if (lowerText.includes('build') || lowerText.includes('create') || lowerText.includes('make')) {
                response = `🔨 **Let me help you build that!**

I'll break down your request and coordinate the team. Here's my plan:

1. **Architecture Phase** 🏗️
   - Design the system architecture
   - Define component boundaries
   - Set up project structure

2. **Implementation Phase** 💻
   - Spawn specialized agents for each component
   - Coordinate parallel development
   - Handle dependencies

3. **Quality Phase** ✅
   - Code review and refactoring
   - Testing and validation
   - Performance optimization

To get started, I'll spawn:
{"type": "spawn", "role": "frontend-specialist", "name": "UI Developer"}
{"type": "spawn", "role": "backend-specialist", "name": "API Developer"}
{"type": "spawn", "role": "testing-specialist", "name": "QA Engineer"}

What specific features should we prioritize first?`;
            }
            else if (lowerText.includes('fix') || lowerText.includes('bug') || lowerText.includes('error')) {
                response = `🔧 **I'll help you fix that issue!**

Let me analyze the problem:

1. **Identifying the Issue** 🔍
   - What error messages are you seeing?
   - When did this start happening?
   - What changes were made recently?

2. **Debugging Strategy** 🐞
   - Check error logs and console output
   - Review recent code changes
   - Test in isolation

3. **Solution Approach** 💡
   - I'll spawn a debugging specialist
   - We'll trace through the code path
   - Apply fix and verify

{"type": "spawn", "role": "backend-specialist", "name": "Debug Expert"}

Can you share the error message or describe what's not working?`;
            }
            else {
                const agents = this.agentManager.getActiveAgents();
                const activeCount = agents.length;
                if (activeCount > 0) {
                    const agentStatus = agents.map(a => `- ${a.name}: ${a.status}`).join('\n');
                    response = `📡 **Processing your request...**

**Current Team Status:**
${agentStatus}

**Understanding your request:** "${text}"

I'll coordinate the team to handle this. Here's what I'm thinking:

1. Break down the request into specific tasks
2. Assign tasks to available agents
3. Monitor progress and handle any conflicts
4. Report back with results

{"type": "status", "agentId": "all"}

Would you like me to proceed with task assignment?`;
                }
                else {
                    response = `🎯 **Ready to help with: "${text}"**

I understand you want to work on this. Let me set up the right team:

**Recommended Team Setup:**
- Frontend specialist for UI work
- Backend specialist for server logic
- Testing specialist for quality assurance

I'll spawn the agents and coordinate their work:

{"type": "spawn", "role": "fullstack-developer", "name": "Lead Developer"}

Once the team is ready, I'll break down your request into tasks and get started.

Any specific requirements or constraints I should know about?`;
                }
            }
            this.loggingService?.debug('[ConductorChat] Sending conductor response:', response.substring(0, 50) + '...');
            this.addMessage('conductor', response);
            this.isProcessing = false;
        }, 1000);
    }
    getSystemPrompt() {
        return this.getVPSystemPrompt();
    }
    getVPSystemPrompt() {
        const agents = this.agentManager.getActiveAgents();
        const agentList = agents.map(a => `- ${a.name} (${a.type}): ${a.status}`).join('\n');
        return `You are the NofX Conductor - a senior technical leader with 20+ years of experience managing development teams.

Your role:
1. Understand what the user wants to build or fix
2. Break down the request into tasks
3. Assign tasks to appropriate agents
4. Monitor progress and handle conflicts
5. Report back to the user

ORCHESTRATION COMMANDS:
You can control agents by outputting JSON commands in your responses. Include these naturally in your conversation:

To spawn a new agent:
{"type": "spawn", "role": "frontend-specialist", "name": "Frontend Agent"}

To assign a task to an agent:
{"type": "assign", "agentId": "agent-1", "task": "Create login component", "priority": "high"}

To query agent status:
{"type": "status", "agentId": "all"}

To terminate an agent:
{"type": "terminate", "agentId": "agent-1"}

Example usage:
"I'll spawn a frontend specialist to handle the UI work."
{"type": "spawn", "role": "frontend-specialist", "name": "UI Expert"}
"Now assigning the login form task..."
{"type": "assign", "agentId": "agent-1", "task": "Create a React login form with validation"}

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
    getGreeting() {
        return `🎸 **NofX Conductor ready!**

I'm your senior technical leader, ready to orchestrate a team of specialized AI agents.

I can:
- Architect your entire system before we write code
- Break down complex projects into manageable tasks
- Coordinate multiple agents working in parallel
- Ensure code quality and prevent technical debt
- Monitor progress and handle conflicts

What would you like to build? I'll create a comprehensive plan and manage the team to deliver it.`;
    }
    addMessage(sender, text) {
        const message = {
            id: Date.now().toString(),
            sender,
            text,
            timestamp: new Date().toISOString()
        };
        this.chatHistory.push(message);
        this.saveChatHistory();
        if (this.panel) {
            this.loggingService?.debug('Sending message to webview:', message);
            this.panel.webview.postMessage({
                command: 'addMessage',
                message
            });
        }
        else {
            this.loggingService?.error('Panel not available to send message');
        }
    }
    updateWebview() {
        const agents = this.agentManager.getActiveAgents();
        this.panel?.webview.postMessage({
            command: 'updateState',
            state: {
                agents,
                level: 'vp',
                history: this.chatHistory
            }
        });
    }
    clearChat() {
        this.chatHistory = [];
        this.saveChatHistory();
        this.panel?.webview.postMessage({
            command: 'clearChat'
        });
    }
    exportChat() {
        const content = this.chatHistory.map(msg => `[${msg.timestamp}] ${msg.sender.toUpperCase()}: ${msg.text}`).join('\n\n');
        const uri = vscode.Uri.parse(`untitled:conductor-chat-${Date.now()}.md`);
        vscode.workspace.openTextDocument(uri).then(doc => {
            vscode.window.showTextDocument(doc).then(editor => {
                editor.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), content);
                });
            });
        });
    }
    loadChatHistory() {
        const stored = this.context.globalState.get('conductorChatHistory');
        if (stored) {
            this.chatHistory = stored;
        }
    }
    saveChatHistory() {
        this.context.globalState.update('conductorChatHistory', this.chatHistory);
    }
    getWebviewContent() {
        const scriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'chat.js'));
        const styleUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'chat.css'));
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
exports.ConductorChatWebview = ConductorChatWebview;
//# sourceMappingURL=ConductorChatWebview.js.map