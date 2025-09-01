(function() {
    const vscode = acquireVsCodeApi();
    
    // DOM elements
    const messagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const conductorLevel = document.getElementById('conductor-level');
    const clearButton = document.getElementById('clear-chat');
    const exportButton = document.getElementById('export-chat');
    const agentList = document.getElementById('agent-list');
    
    let isProcessing = false;
    let currentTypingIndicator = null;
    
    // Initialize
    function init() {
        // Set up event listeners
        sendButton.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', handleKeyDown);
        conductorLevel.addEventListener('change', changeLevel);
        clearButton.addEventListener('click', clearChat);
        exportButton.addEventListener('click', exportChat);
        
        // Request initial state
        vscode.postMessage({ command: 'ready' });
    }
    
    // Handle keyboard input
    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }
    
    // Send message to conductor
    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || isProcessing) return;
        
        isProcessing = true;
        sendButton.disabled = true;
        
        // Clear input
        chatInput.value = '';
        chatInput.style.height = 'auto';
        
        // Send to extension
        vscode.postMessage({
            command: 'sendMessage',
            text: text
        });
        
        // Show typing indicator
        showTypingIndicator();
    }
    
    // Change conductor level
    function changeLevel() {
        const level = conductorLevel.value;
        vscode.postMessage({
            command: 'changeLevel',
            level: level
        });
    }
    
    // Clear chat
    function clearChat() {
        if (confirm('Clear all chat history?')) {
            vscode.postMessage({ command: 'clearChat' });
            messagesContainer.innerHTML = '';
        }
    }
    
    // Export chat
    function exportChat() {
        vscode.postMessage({ command: 'exportChat' });
    }
    
    // Add message to chat
    function addMessage(sender, text, timestamp) {
        // Remove typing indicator if present
        if (currentTypingIndicator) {
            currentTypingIndicator.remove();
            currentTypingIndicator = null;
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${sender}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Parse markdown (simple implementation)
        const html = parseMarkdown(text);
        contentDiv.innerHTML = html;
        
        // Add timestamp
        if (timestamp) {
            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = new Date(timestamp).toLocaleTimeString();
            contentDiv.appendChild(timeDiv);
        }
        
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Re-enable input if conductor message
        if (sender === 'conductor') {
            isProcessing = false;
            sendButton.disabled = false;
            chatInput.focus();
        }
    }
    
    // Show typing indicator
    function showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'message message-conductor';
        indicator.innerHTML = `
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        currentTypingIndicator = indicator;
        messagesContainer.appendChild(indicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Parse markdown to HTML (simplified)
    function parseMarkdown(text) {
        // Escape HTML
        text = text.replace(/&/g, '&amp;')
                   .replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;');
        
        // Code blocks
        text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // Inline code
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Lists
        text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
        text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Line breaks
        text = text.replace(/\n/g, '<br>');
        
        return text;
    }
    
    // Update agent list
    function updateAgentList(agents) {
        if (!agents || agents.length === 0) {
            agentList.innerHTML = '<div class="agent-item">No active agents</div>';
            return;
        }
        
        agentList.innerHTML = agents.map(agent => `
            <div class="agent-item">
                <div class="agent-name">${agent.name}</div>
                <div class="agent-status ${agent.status}">${agent.status}</div>
            </div>
        `).join('');
    }
    
    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'addMessage':
                addMessage(
                    message.message.sender,
                    message.message.text,
                    message.message.timestamp
                );
                break;
                
            case 'streamResponse':
                // Update typing indicator with partial response
                if (currentTypingIndicator) {
                    const content = currentTypingIndicator.querySelector('.typing-indicator');
                    if (content) {
                        content.className = 'message-content';
                        content.innerHTML = parseMarkdown(message.text);
                    }
                }
                break;
                
            case 'updateState':
                // Update UI with state
                if (message.state.agents) {
                    updateAgentList(message.state.agents);
                }
                if (message.state.level) {
                    conductorLevel.value = message.state.level;
                }
                if (message.state.history) {
                    messagesContainer.innerHTML = '';
                    message.state.history.forEach(msg => {
                        addMessage(msg.sender, msg.text, msg.timestamp);
                    });
                }
                break;
                
            case 'levelChanged':
                conductorLevel.value = message.level;
                break;
                
            case 'clearChat':
                messagesContainer.innerHTML = '';
                break;
                
            case 'error':
                // Show error message
                addMessage('conductor', `⚠️ Error: ${message.text}`, new Date().toISOString());
                isProcessing = false;
                sendButton.disabled = false;
                break;
        }
    });
    
    // Auto-resize textarea
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    
    // Initialize on load
    init();
})();