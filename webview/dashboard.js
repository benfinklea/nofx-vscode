(function() {
    const vscode = acquireVsCodeApi();
    
    // State
    let messages = [];
    let connections = [];
    let isPaused = false;
    let messageRate = 0;
    let lastMessageTime = Date.now();
    
    // DOM elements
    const pauseBtn = document.getElementById('pause-btn');
    const clearBtn = document.getElementById('clear-btn');
    const exportBtn = document.getElementById('export-btn');
    const typeFilter = document.getElementById('type-filter');
    const agentFilter = document.getElementById('agent-filter');
    const timeFilter = document.getElementById('time-filter');
    const agentCards = document.getElementById('agent-cards');
    const flowContainer = document.getElementById('flow-container');
    const messagesContainer = document.getElementById('messages-container');
    
    // Stats elements
    const activeAgentsEl = document.getElementById('active-agents');
    const totalMessagesEl = document.getElementById('total-messages');
    const successRateEl = document.getElementById('success-rate');
    const messageRateEl = document.getElementById('message-rate');
    
    // Initialize
    function init() {
        // Set up event listeners
        pauseBtn.addEventListener('click', togglePause);
        clearBtn.addEventListener('click', clearMessages);
        exportBtn.addEventListener('click', exportData);
        typeFilter.addEventListener('change', applyFilters);
        agentFilter.addEventListener('change', applyFilters);
        timeFilter.addEventListener('change', applyFilters);
        
        // Request initial state
        vscode.postMessage({ command: 'ready' });
        
        // Start message rate calculation
        setInterval(updateMessageRate, 1000);
    }
    
    // Toggle pause
    function togglePause() {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
        vscode.postMessage({ command: isPaused ? 'pause' : 'resume' });
    }
    
    // Clear messages
    function clearMessages() {
        messages = [];
        updateMessageList();
        updateFlowVisualization();
        vscode.postMessage({ command: 'clear' });
    }
    
    // Export data
    function exportData() {
        vscode.postMessage({ command: 'export' });
    }
    
    // Apply filters
    function applyFilters() {
        const filter = {
            type: typeFilter.value,
            agent: agentFilter.value,
            timeRange: timeFilter.value
        };
        vscode.postMessage({ command: 'filter', filter });
    }
    
    // Update agent cards
    function updateAgentCards() {
        agentCards.innerHTML = '';
        
        connections.forEach(conn => {
            if (conn.type === 'conductor') {
                createAgentCard(conn, 'conductor');
            }
        });
        
        connections.forEach(conn => {
            if (conn.type === 'agent') {
                createAgentCard(conn, conn.status === 'working' ? 'active' : 'online');
            }
        });
        
        // Update agent filter options
        updateAgentFilterOptions();
    }
    
    // Create agent card
    function createAgentCard(conn, status) {
        const card = document.createElement('div');
        card.className = `agent-card ${status}`;
        card.innerHTML = `
            <span class="status-dot ${status === 'working' ? 'working' : 'online'}"></span>
            <div class="agent-name">${conn.name}</div>
            <div class="agent-role">${conn.role || conn.type}</div>
            <div class="agent-stats">
                Messages: ${conn.messageCount || 0}
            </div>
        `;
        agentCards.appendChild(card);
    }
    
    // Update agent filter options
    function updateAgentFilterOptions() {
        const currentValue = agentFilter.value;
        agentFilter.innerHTML = '<option value="all">All Agents</option>';
        agentFilter.innerHTML += '<option value="conductor">Conductor</option>';
        
        connections.forEach(conn => {
            if (conn.type === 'agent') {
                agentFilter.innerHTML += `<option value="${conn.id}">${conn.name}</option>`;
            }
        });
        
        agentFilter.value = currentValue;
    }
    
    // Update flow visualization
    function updateFlowVisualization() {
        if (isPaused) return;
        
        flowContainer.innerHTML = '';
        
        // Show last 20 messages as flow
        const recentMessages = messages.slice(-20).reverse();
        
        recentMessages.forEach(msg => {
            const flowMsg = document.createElement('div');
            flowMsg.className = 'flow-message';
            
            const fromName = getConnectionName(msg.from);
            const toName = getConnectionName(msg.to);
            
            flowMsg.innerHTML = `
                <div class="flow-type">${formatMessageType(msg.type)}</div>
                <div class="flow-from">${fromName}</div>
                <div class="flow-arrow">→</div>
                <div class="flow-to">${toName}</div>
            `;
            
            flowContainer.appendChild(flowMsg);
        });
    }
    
    // Update message list
    function updateMessageList() {
        if (isPaused) return;
        
        messagesContainer.innerHTML = '';
        
        // Show last 50 messages
        const recentMessages = messages.slice(-50).reverse();
        
        recentMessages.forEach(msg => {
            const msgEl = document.createElement('div');
            msgEl.className = 'message-item';
            msgEl.innerHTML = `
                <div class="message-header">
                    <span class="message-type">${formatMessageType(msg.type)}</span>
                    <span class="message-time">${formatTime(msg.timestamp)}</span>
                </div>
                <div class="message-route">${getConnectionName(msg.from)} → ${getConnectionName(msg.to)}</div>
                <div class="message-payload">${formatPayload(msg.payload)}</div>
            `;
            
            msgEl.addEventListener('click', () => showMessageDetails(msg));
            messagesContainer.appendChild(msgEl);
        });
    }
    
    // Update stats
    function updateStats(stats) {
        if (stats.activeAgents !== undefined) {
            activeAgentsEl.textContent = stats.activeAgents;
        }
        if (stats.totalMessages !== undefined) {
            totalMessagesEl.textContent = stats.totalMessages;
        }
        if (stats.successRate !== undefined) {
            successRateEl.textContent = Math.round(stats.successRate) + '%';
        }
    }
    
    // Update message rate
    function updateMessageRate() {
        const now = Date.now();
        const timeDiff = (now - lastMessageTime) / 1000 / 60; // Convert to minutes
        
        if (timeDiff > 0) {
            const rate = Math.round(messageRate / timeDiff);
            messageRateEl.textContent = rate.toString();
        }
        
        // Reset counter every minute
        if (timeDiff > 1) {
            messageRate = 0;
            lastMessageTime = now;
        }
    }
    
    // Get connection name
    function getConnectionName(id) {
        if (id === 'broadcast') return '📢 All';
        if (id === 'system') return '⚙️ System';
        if (id === 'dashboard') return '📊 Dashboard';
        
        const conn = connections.find(c => c.id === id);
        return conn ? conn.name : id;
    }
    
    // Format message type
    function formatMessageType(type) {
        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    // Format timestamp
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }
    
    // Format payload
    function formatPayload(payload) {
        if (typeof payload === 'string') {
            return payload;
        }
        return JSON.stringify(payload, null, 2);
    }
    
    // Show message details
    function showMessageDetails(message) {
        // Could open a modal or expand the message
        console.log('Message details:', message);
    }
    
    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'setState':
                messages = message.state.messages || [];
                connections = message.state.connections || [];
                updateAgentCards();
                updateFlowVisualization();
                updateMessageList();
                updateStats(message.state.stats || {});
                break;
                
            case 'newMessages':
                if (!isPaused) {
                    messages.push(...message.messages);
                    messageRate += message.messages.length;
                    
                    // Keep only last 200 messages
                    if (messages.length > 200) {
                        messages = messages.slice(-200);
                    }
                    
                    updateFlowVisualization();
                    updateMessageList();
                    
                    // Update total messages stat
                    totalMessagesEl.textContent = messages.length.toString();
                }
                break;
                
            case 'updateConnections':
                connections = message.connections;
                updateAgentCards();
                activeAgentsEl.textContent = connections.filter(c => c.type === 'agent').length.toString();
                break;
                
            case 'setMessages':
                messages = message.messages;
                updateFlowVisualization();
                updateMessageList();
                break;
                
            case 'clearMessages':
                messages = [];
                updateFlowVisualization();
                updateMessageList();
                break;
        }
    });
    
    // Initialize on load
    init();
})();