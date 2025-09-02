import * as vscode from 'vscode';

/**
 * Simplified Conductor Chat that doesn't require system permissions
 * - No process spawning
 * - No file system access outside workspace
 * - No environment variable copying
 */
export class ConductorChatSimple {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }
    
    public async show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        
        this.panel = vscode.window.createWebviewPanel(
            'nofxConductorSimple',
            '🎸 NofX Conductor (Simple)',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );
        
        this.panel.webview.html = this.getWebviewContent();
        
        this.panel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'sendMessage') {
                    this.handleMessage(message.text);
                }
            },
            undefined,
            this.context.subscriptions
        );
        
        // Send initial greeting
        setTimeout(() => {
            this.sendResponse(`🎸 **NofX Conductor Ready!**

I'm running in simple mode (no system permissions required).

I can help you:
- Plan your development tasks
- Suggest architecture improvements
- Review your code approach
- Coordinate development workflow

What would you like to work on?`);
        }, 500);
    }
    
    private handleMessage(text: string) {
        // Add user message
        this.panel?.webview.postMessage({
            command: 'addMessage',
            message: {
                sender: 'user',
                text: text,
                timestamp: new Date().toISOString()
            }
        });
        
        // Generate response based on input
        setTimeout(() => {
            const response = this.generateResponse(text);
            this.sendResponse(response);
        }, 1000);
    }
    
    private generateResponse(input: string): string {
        const lower = input.toLowerCase();
        
        if (lower.includes('hello') || lower.includes('hi')) {
            return `👋 Hello! How can I help you today?`;
        }
        
        if (lower.includes('test')) {
            return `🧪 For testing, I recommend:
- Unit tests for core components
- Integration tests for the WebSocket system
- E2E tests for the chat interface`;
        }
        
        if (lower.includes('help')) {
            return `I can help you with:
- Architecture planning
- Code review
- Task breakdown
- Development workflow

What specifically would you like help with?`;
        }
        
        return `I understand you want to: "${input}"

Let me help you break this down into actionable steps.`;
    }
    
    private sendResponse(text: string) {
        this.panel?.webview.postMessage({
            command: 'addMessage',
            message: {
                sender: 'conductor',
                text: text,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { 
            padding: 20px; 
            font-family: var(--vscode-font-family);
        }
        .chat-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }
        .message {
            margin: 10px 0;
            padding: 10px;
            border-radius: 8px;
        }
        .message-user {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-left: 20%;
        }
        .message-conductor {
            background: var(--vscode-editor-inactiveSelectionBackground);
            margin-right: 20%;
        }
        .input-area {
            display: flex;
            padding: 10px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        input {
            flex: 1;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        button {
            margin-left: 10px;
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="messages" id="messages"></div>
        <div class="input-area">
            <input type="text" id="input" placeholder="Type a message..." />
            <button onclick="sendMessage()">Send</button>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const messagesEl = document.getElementById('messages');
        const inputEl = document.getElementById('input');
        
        function sendMessage() {
            const text = inputEl.value.trim();
            if (!text) return;
            
            vscode.postMessage({
                command: 'sendMessage',
                text: text
            });
            
            inputEl.value = '';
        }
        
        inputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'addMessage') {
                const msgEl = document.createElement('div');
                msgEl.className = 'message message-' + message.message.sender;
                msgEl.innerHTML = message.message.text.replace(/\\n/g, '<br>');
                messagesEl.appendChild(msgEl);
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }
        });
    </script>
</body>
</html>`;
    }
}