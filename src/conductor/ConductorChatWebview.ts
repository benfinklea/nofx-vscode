import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { WebSocket } from 'ws';
import {
    createMessage,
    MessageType,
    extractJsonFromClaudeOutput,
    OrchestratorMessage
} from '../orchestration/MessageProtocol';
import { ILoggingService, INotificationService } from '../services/interfaces';

export class ConductorChatWebview {
    private panel: vscode.WebviewPanel | undefined;
    private claudeProcess: ChildProcess | undefined;
    private agentManager: AgentManager;
    private taskQueue: TaskQueue;
    private context: vscode.ExtensionContext;
    private chatHistory: ChatMessage[] = [];
    private claudePath: string;
    // Only using VP-level conductor now, no level selection
    private isProcessing = false;
    private currentResponse = '';
    private wsClient: WebSocket | undefined;
    private orchestrationPort: number | undefined;
    private isConnectedToOrchestrator = false;

    constructor(
        context: vscode.ExtensionContext,
        agentManager: AgentManager,
        taskQueue: TaskQueue,
        private loggingService?: ILoggingService,
        private notificationService?: INotificationService
    ) {
        this.context = context;
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        // Try different Claude commands based on environment
        const configPath = vscode.workspace.getConfiguration('nofx').get<string>('claudePath');
        if (configPath) {
            this.claudePath = configPath;
        } else {
            // Auto-detect: try claude-code first (VS Code/Cursor), then claude
            this.claudePath = 'claude-code';
        }

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
                this.loggingService?.debug('[ConductorChat] Webview message:', message);
                switch (message.command) {
                    case 'ready':
                        this.loggingService?.debug('[ConductorChat] Webview ready - sending initial state');
                        // Send initial state
                        this.updateWebview();
                        // Greeting will be sent by startClaude or useMockClaude
                        break;
                    case 'sendMessage':
                        this.loggingService?.debug('[ConductorChat] User message received:', message.text);
                        await this.handleUserMessage(message.text);
                        break;
                    // Level changing removed - only VP level now
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

        // Start Claude process after a short delay
        setTimeout(() => {
            this.startClaude();
        }, 500);
    }

    private async startClaude() {
        // Stop existing process if any
        this.stopClaude();

        const systemPrompt = this.getSystemPrompt();

        this.loggingService?.info('[ConductorChat] Attempting to start Claude process...');
        this.loggingService?.debug('[ConductorChat] Claude path:', this.claudePath);
        this.loggingService?.debug('[ConductorChat] Working directory:', process.cwd());
        this.loggingService?.debug('[ConductorChat] PATH environment:', process.env.PATH);

        // Show user we're attempting to connect
        this.addMessage('conductor', `🔄 Attempting to connect to Claude at: ${this.claudePath}...`);

        // Try to spawn Claude WITHOUT --append-system-prompt flag
        // Instead we'll send the prompt via stdin after it starts
        try {
            this.loggingService?.debug('[ConductorChat] Spawning Claude process without flags...');

            // Just spawn claude directly without any arguments
            this.claudeProcess = spawn(this.claudePath, [], {
                shell: false, // Don't use shell - spawn directly
                env: {
                    ...process.env // Include full environment for Claude to work
                }
            });

            if (!this.claudeProcess || !this.claudeProcess.pid) {
                throw new Error('Failed to spawn Claude process - no PID received');
            }

            // Log process spawn
            this.loggingService?.info('[ConductorChat] Claude process spawned with PID:', this.claudeProcess.pid);
            this.addMessage('conductor', `✅ Claude process started (PID: ${this.claudeProcess.pid}). Sending system prompt...`);

            // Set up handlers immediately
            this.setupClaudeHandlers();

            // Send system prompt after a delay (like regular agents do)
            setTimeout(() => {
                if (this.claudeProcess && this.claudeProcess.stdin && !this.claudeProcess.killed) {
                    this.loggingService?.debug('[ConductorChat] Sending system prompt to Claude...');
                    this.claudeProcess.stdin.write(systemPrompt + '\n\n');
                    this.claudeProcess.stdin.write('Please acknowledge that you understand your role as the NofX Conductor.\n');
                }
            }, 2000); // Give Claude 2 seconds to initialize

            // Mark as NOT simulated
            this.simulatedClaude = false;

        } catch (spawnError: any) {
            this.loggingService?.error('[ConductorChat] Failed to spawn Claude:', spawnError);
            this.loggingService?.error('[ConductorChat] Error stack:', spawnError.stack);

            // Detailed error message for user
            let errorDetails = '❌ Failed to connect to Claude\n\n';
            errorDetails += `**Error:** ${spawnError.message}\n\n`;
            errorDetails += `**Attempted command:** ${this.claudePath}\n\n`;
            errorDetails += '**Troubleshooting:**\n';
            errorDetails += '1. Check if Claude is installed: Run \'which claude\' or \'which claude-code\' in terminal\n';
            errorDetails += '2. Check PATH: Your PATH may not include Claude\'s location\n';
            errorDetails += '3. Try setting full path in settings: e.g., \'/usr/local/bin/claude\'\n';
            errorDetails += '4. For Cursor: Try \'claude-code\' instead of \'claude\'\n\n';
            errorDetails += `**Current PATH:** ${process.env.PATH?.substring(0, 200)}...`;

            this.addMessage('conductor', errorDetails);
            this.simulatedClaude = false;
        }
    }

    private setupClaudeHandlers() {
        if (!this.claudeProcess) {
            this.loggingService?.error('[ConductorChat] No Claude process to set up handlers for');
            return;
        }

        this.loggingService?.debug('[ConductorChat] Setting up Claude handlers');

        // Handle Claude output
        this.claudeProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            this.loggingService?.debug('[ConductorChat] Claude stdout received, length:', text.length);
            this.loggingService?.debug('[ConductorChat] Claude stdout content:', text);

            // Show first output to user for debugging
            if (!this.currentResponse && text.trim()) {
                this.addMessage('conductor', `📝 Claude responding: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
            }

            this.currentResponse += text;

            // Check for JSON commands in the output
            const command = extractJsonFromClaudeOutput(text);
            if (command && this.isConnectedToOrchestrator) {
                this.loggingService?.debug('[ConductorChat] JSON command detected:', command);
                // Send command through WebSocket
                this.sendToOrchestrator(command);
            }

            // If we're processing a user message, collect the response
            if (this.isProcessing) {
                this.loggingService?.debug('[ConductorChat] Processing user message, response so far:', { length: this.currentResponse.length });
            }
        });

        // Handle Claude errors
        this.claudeProcess.stderr?.on('data', (data: Buffer) => {
            const errorText = data.toString();
            this.loggingService?.error('[ConductorChat] Claude stderr received:', errorText);

            // Always show stderr to user for debugging
            this.addMessage('conductor', `⚠️ Claude stderr: ${errorText}`);

            // Don't treat all stderr as errors - Claude may use it for logging
            if (errorText.toLowerCase().includes('error') || errorText.toLowerCase().includes('failed')) {
                this.panel?.webview.postMessage({
                    command: 'error',
                    text: 'Claude error: ' + errorText
                });
            }
        });

        // Handle process exit
        this.claudeProcess.on('exit', (code) => {
            this.loggingService?.info('[ConductorChat] Claude process exited with code:', code);
            this.claudeProcess = undefined;
            // this.simulatedClaude = true; // Fall back to simulation
            this.simulatedClaude = false; // Don't fall back to simulation

            if (code !== 0 && code !== null) {
                this.panel?.webview.postMessage({
                    command: 'error',
                    text: `Claude process exited (code ${code}). No fallback to simulation mode.`
                });
            }

            this.addMessage('conductor', `⚠️ Claude process disconnected (exit code: ${code})`);
        });

        // Handle process errors
        this.claudeProcess.on('error', (error) => {
            this.loggingService?.error('[ConductorChat] Claude process error:', error);
            // this.simulatedClaude = true;
            this.simulatedClaude = false; // Don't use simulation
            this.addMessage('conductor', `❌ Claude process error: ${error.message}`);
        });

        // Don't send greeting here - Claude will greet based on the system prompt
        // Connect to orchestration server
        this.connectToOrchestrator().catch(error => {
            this.loggingService?.error('[ConductorChat] Failed to connect to orchestrator:', error);
        });
    }

    /**
     * Use mock Claude for testing when real Claude is not available
     * COMMENTED OUT - We want to see real connection status
     */
    private useMockClaude() {
        this.loggingService?.debug('Mock Claude disabled - we want to see real connection status');

        // // Send initial greeting
        // const greeting = this.getGreeting();
        // this.addMessage('conductor', greeting);

        // // Create a mock process that responds to messages
        // this.simulatedClaude = true;

        this.simulatedClaude = false;
        this.addMessage('conductor', '🔌 Mock mode disabled. Waiting for real Claude connection...');
    }

    private simulatedClaude = false;

    private stopClaude() {
        if (this.claudeProcess) {
            this.claudeProcess.kill();
            this.claudeProcess = undefined;
        }

        // Disconnect from orchestrator
        this.disconnectFromOrchestrator();
    }

    /**
     * Connect to the orchestration server
     */
    private async connectToOrchestrator(): Promise<void> {
        // Try multiple ports since default might be in use
        const portsToTry = [7777, 7778, 7779, 7780, 8888, 8889, 9999];

        for (const port of portsToTry) {
            try {
                await this.tryConnectToPort(port);
                this.orchestrationPort = port;
                this.loggingService?.info(`Conductor connected to orchestration server on port ${port}`);
                return;
            } catch (error) {
                // Try next port
            }
        }

        this.loggingService?.warn('Could not connect to orchestration server on any port - continuing without orchestration');
    }

    private async tryConnectToPort(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${port}`);
            let connected = false;

            // Set timeout for connection attempt
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

                // Register as conductor
                const registration = {
                    type: 'register',
                    id: 'conductor',
                    name: 'NofX Conductor',
                    clientType: 'conductor',
                    role: 'vp'
                };
                ws.send(JSON.stringify(registration));

                // Notify UI
                this.panel?.webview.postMessage({
                    command: 'orchestratorConnected',
                    status: true
                });

                // Set up handlers
                ws.on('message', (data: Buffer) => {
                    const message = JSON.parse(data.toString());
                    this.handleOrchestratorMessage(message);
                });

                // Handle ping from server (required to avoid timeout)
                ws.on('ping', () => {
                    this.loggingService?.debug('[ConductorChat] Received ping from orchestration server');
                    ws.pong();
                });

                // Send periodic pong to keep connection alive
                const keepAlive = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.pong();
                    } else {
                        clearInterval(keepAlive);
                    }
                }, 20000); // Send pong every 20 seconds

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
                        // Connection failed, will be handled by timeout
                    } else {
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

    /**
     * Disconnect from orchestrator
     */
    private disconnectFromOrchestrator(): void {
        if (this.wsClient) {
            this.wsClient.close();
            this.wsClient = undefined;
            this.isConnectedToOrchestrator = false;
        }
    }

    /**
     * Send message to orchestrator
     */
    private sendToOrchestrator(message: OrchestratorMessage): void {
        if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
            this.wsClient.send(JSON.stringify(message));
        }
    }

    /**
     * Handle message from orchestrator
     */
    private handleOrchestratorMessage(message: any): void {
        // Handle different message types
        switch (message.type) {
            case MessageType.CONNECTION_ESTABLISHED:
                this.loggingService?.info('Conductor registered with orchestrator');
                break;

            case MessageType.AGENT_READY:
                // Inform Claude that an agent is ready
                this.claudeProcess?.stdin?.write(`[AGENT READY] ${message.payload.name} is now available\n`);
                break;

            case MessageType.TASK_COMPLETE:
                // Inform Claude about task completion
                const taskInfo = message.payload;
                this.claudeProcess?.stdin?.write(`[TASK COMPLETE] Agent ${message.from} completed: ${taskInfo.output}\n`);
                break;

            case MessageType.AGENT_STATUS:
                // Forward status to Claude
                this.claudeProcess?.stdin?.write(`[STATUS UPDATE] ${JSON.stringify(message.payload)}\n`);
                break;

            case MessageType.AGENT_QUERY:
                // Agent is asking conductor a question
                const query = message.payload;
                this.claudeProcess?.stdin?.write(`[AGENT QUESTION] ${message.from}: ${query.question}\n`);
                break;
        }
    }

    private async handleUserMessage(text: string) {
        this.loggingService?.debug('[ConductorChat] handleUserMessage called with:', text);

        if (this.isProcessing) {
            this.loggingService?.debug('[ConductorChat] Already processing, ignoring message');
            return;
        }

        // Add user message to chat immediately
        this.addMessage('user', text);

        // Check if we have a real Claude process or using simulation
        if (this.simulatedClaude || !this.claudeProcess) {
            this.loggingService?.warn('[ConductorChat] No Claude process available');
            // this.handleSimulatedResponse(text);
            this.addMessage('conductor', '❌ Claude is not connected. Please restart the conductor.');
            this.isProcessing = false;
            return;
        }

        // Send to actual Claude process
        this.loggingService?.debug('[ConductorChat] Sending to Claude process');
        this.isProcessing = true;
        this.currentResponse = '';

        // Send message to Claude
        if (this.claudeProcess && this.claudeProcess.stdin && !this.claudeProcess.killed) {
            this.loggingService?.debug('[ConductorChat] Writing to Claude stdin:', text);
            try {
                // Write the message and ensure it's flushed
                this.claudeProcess.stdin.write(text + '\n', (error) => {
                    if (error) {
                        this.loggingService?.error('[ConductorChat] Error writing to stdin:', error);
                        this.addMessage('conductor', `❌ Error sending message: ${error.message}`);
                        this.isProcessing = false;
                    } else {
                        this.loggingService?.debug('[ConductorChat] Message sent to Claude stdin successfully');
                    }
                });
            } catch (error: any) {
                this.loggingService?.error('[ConductorChat] Exception writing to stdin:', error);
                this.addMessage('conductor', `❌ Failed to send message: ${error.message}`);
                this.isProcessing = false;
            }
        } else {
            this.loggingService?.error('[ConductorChat] Claude process not available for writing');
            this.addMessage('conductor', '❌ Claude process not available');
            this.isProcessing = false;
        }

        // Wait for response to complete
        // Look for when Claude stops outputting for a second
        let lastResponseLength = 0;
        let checkCount = 0;
        const checkInterval = setInterval(() => {
            checkCount++;

            // Check if response has stopped growing or timeout
            if ((this.currentResponse.length > 0 && this.currentResponse.length === lastResponseLength) || checkCount > 60) {
                // Response complete or timeout after 30 seconds
                if (this.currentResponse) {
                    this.loggingService?.debug('[ConductorChat] Claude response complete, length:', this.currentResponse.length);
                    this.addMessage('conductor', this.currentResponse);
                    this.currentResponse = '';
                } else if (checkCount > 60) {
                    this.loggingService?.warn('[ConductorChat] Claude response timeout');
                    // this.handleSimulatedResponse(text);
                    this.addMessage('conductor', '⏱️ Response timeout - Claude may not be responding.');
                }
                this.isProcessing = false;
                clearInterval(checkInterval);
            }
            lastResponseLength = this.currentResponse.length;
        }, 500);
    }

    /**
     * Handle simulated responses when Claude is not available
     */
    private handleSimulatedResponse(text: string) {
        this.loggingService?.debug('[ConductorChat] handleSimulatedResponse for:', text);
        this.isProcessing = true;

        // Don't show typing indicator - it causes issues
        // Just generate response directly

        // Simulate thinking time
        setTimeout(() => {
            let response = '';

            // Generate appropriate responses based on input
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
            } else if (lowerText.includes('hello') || lowerText.includes('hi')) {
                response = `👋 **Hello! I'm your NofX Conductor.**

I can help you:
- 🤖 Manage AI agents for development tasks
- 📝 Review code and suggest improvements
- 🔄 Coordinate complex workflows
- 🚀 Deploy and scale your projects

What would you like to work on today?`;
            } else if (lowerText.includes('spawn') || lowerText.includes('agent')) {
                response = `🤖 **Let's spawn an agent!**

Available agent types:
- 🎨 **frontend-specialist** - React, Vue, UI/UX
- ⚙️ **backend-specialist** - Node.js, APIs, databases
- 🧪 **testing-specialist** - Unit tests, E2E, QA
- 🚀 **devops-engineer** - CI/CD, Docker, cloud
- 🔒 **security-expert** - Security audits, pen testing
- 💾 **database-architect** - Schema design, optimization

Which type would you like to spawn?`;
            } else if (lowerText.includes('build') || lowerText.includes('create') || lowerText.includes('make')) {
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
            } else if (lowerText.includes('fix') || lowerText.includes('bug') || lowerText.includes('error')) {
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
            } else {
                // Intelligent default response based on context
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
                } else {
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

    // Level changing removed - only using VP level

    private getSystemPrompt(): string {
        // Always use VP-level system prompt
        return this.getVPSystemPrompt();
    }

    // Removed basic and smart prompts - only using VP level

    private getVPSystemPrompt(): string {
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

    private getGreeting(): string {
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

    private addMessage(sender: 'user' | 'conductor', text: string) {
        const message: ChatMessage = {
            id: Date.now().toString(),
            sender,
            text,
            timestamp: new Date().toISOString()
        };

        this.chatHistory.push(message);
        this.saveChatHistory();

        // Ensure panel exists before sending message
        if (this.panel) {
            this.loggingService?.debug('Sending message to webview:', message);
            this.panel.webview.postMessage({
                command: 'addMessage',
                message
            });
        } else {
            this.loggingService?.error('Panel not available to send message');
        }
    }

    private updateWebview() {
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
