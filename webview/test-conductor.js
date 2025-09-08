// Minimal test script
console.log('TEST: Script is loading');

document.addEventListener('DOMContentLoaded', function() {
    console.log('TEST: DOM loaded');
    
    const sendBtn = document.getElementById('send-btn');
    console.log('TEST: Send button found:', !!sendBtn);
    
    if (sendBtn) {
        sendBtn.addEventListener('click', function() {
            console.log('TEST: Button clicked');
            const input = document.getElementById('message-input');
            const text = input.value.trim();
            console.log('TEST: Message text:', text);
            
            if (text) {
                // Add message to chat immediately
                const messages = document.getElementById('messages');
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message user';
                messageDiv.innerHTML = `
                    <div class="message-header">
                        <span class="message-sender">👤 You</span>
                        <span class="message-timestamp">${new Date().toLocaleTimeString()}</span>
                    </div>
                    <div class="message-content">${text}</div>
                `;
                messages.appendChild(messageDiv);
                
                // Clear input
                input.value = '';
                
                // Scroll to bottom
                messages.scrollTop = messages.scrollHeight;
                
                // Try to send to extension
                try {
                    const vscode = acquireVsCodeApi();
                    vscode.postMessage({
                        command: 'sendMessage',
                        text: text
                    });
                    console.log('TEST: Message sent to extension');
                } catch (error) {
                    console.error('TEST: Failed to send message:', error);
                }
            }
        });
    }
});