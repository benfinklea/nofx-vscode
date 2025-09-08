// Modern NofX Panel - Interactive JavaScript
(function() {
    'use strict';

    // Get VS Code API
    const vscode = acquireVsCodeApi();
    
    // State management
    let currentData = {
        agents: [],
        tasks: [],
        stats: {
            activeAgents: 0,
            completedTasks: 0,
            pendingTasks: 0,
            inProgressTasks: 0
        },
        workspaceName: 'NofX'
    };

    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        initializeTabs();
        initializeCommands();
        initializeAgentSpawning();
        
        // Request initial data
        vscode.postMessage({ command: 'refreshData' });
        
        // Auto-refresh every 10 seconds
        setInterval(() => {
            vscode.postMessage({ command: 'refreshData' });
        }, 10000);
    });

    // Tab system
    function initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.getAttribute('data-tab');
                switchTab(tabId);
            });
        });
    }

    function switchTab(tabId) {
        // Update buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

        // Update panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(`${tabId}-tab`).classList.add('active');

        // Save tab state
        vscode.setState({ activeTab: tabId });
    }

    // Command handling
    function initializeCommands() {
        document.addEventListener('click', (event) => {
            const element = event.target.closest('[data-command]');
            if (element) {
                const command = element.getAttribute('data-command');
                executeCommand(command, element);
            }
        });
    }

    function executeCommand(command, element) {
        // Visual feedback
        element.style.opacity = '0.6';
        setTimeout(() => {
            element.style.opacity = '1';
        }, 150);

        // Execute command
        switch (command) {
            case 'refreshData':
                vscode.postMessage({ command: 'refreshData' });
                break;
            
            case 'openConversationalConductor':
                vscode.postMessage({ command: 'openConversationalConductor' });
                break;
            
            case 'openMessageFlow':
                vscode.postMessage({ command: 'openMessageFlow' });
                break;
            
            default:
                // For VS Code commands, pass through
                vscode.postMessage({
                    command: 'executeCommand',
                    commandId: command
                });
        }
    }

    // Agent spawning
    function initializeAgentSpawning() {
        document.addEventListener('click', (event) => {
            const agentType = event.target.closest('[data-agent-type]');
            if (agentType) {
                const type = agentType.getAttribute('data-agent-type');
                spawnAgent(type);
            }
        });
    }

    function spawnAgent(agentType) {
        const agentNames = {
            'frontend-specialist': 'Frontend Expert',
            'backend-specialist': 'Backend Specialist',
            'fullstack-developer': 'Fullstack Developer',
            'testing-specialist': 'QA Engineer',
            'devops-engineer': 'DevOps Engineer',
            'database-architect': 'Database Architect',
            'security-expert': 'Security Expert',
            'mobile-developer': 'Mobile Developer',
            'ai-ml-specialist': 'AI/ML Specialist',
            'algorithm-engineer': 'Algorithm Engineer',
            'nlp-specialist': 'NLP Specialist'
        };

        vscode.postMessage({
            command: 'spawnAgent',
            agentType: agentType,
            agentName: agentNames[agentType] || `${agentType} Agent`
        });

        // Show visual feedback
        const element = document.querySelector(`[data-agent-type="${agentType}"]`);
        if (element) {
            element.style.background = 'var(--success-color)';
            element.style.color = 'white';
            setTimeout(() => {
                element.style.background = '';
                element.style.color = '';
            }, 1000);
        }
    }

    // Listen for messages from extension
    window.addEventListener('message', (event) => {
        const message = event.data;
        
        switch (message.command) {
            case 'updateData':
                updateUI(message.data);
                break;
            
            default:
                console.log('Unknown message command:', message.command);
        }
    });

    // UI Updates
    function updateUI(data) {
        currentData = data;
        
        updateHeader(data);
        updateAgentsList(data.agents);
        updateTasksList(data.tasks);
        updateStats(data.stats);
    }

    function updateHeader(data) {
        const workspaceName = document.getElementById('workspace-name');
        const agentCount = document.getElementById('agent-count').querySelector('.status-value');
        const taskCount = document.getElementById('task-count').querySelector('.status-value');

        if (workspaceName) workspaceName.textContent = data.workspaceName;
        if (agentCount) agentCount.textContent = data.stats.activeAgents;
        if (taskCount) taskCount.textContent = data.stats.pendingTasks + data.stats.inProgressTasks;
    }

    function updateAgentsList(agents) {
        const agentsList = document.getElementById('agents-list');
        if (!agentsList) return;

        if (agents.length === 0) {
            agentsList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">🤖</span>
                    <span class="empty-text">No active agents</span>
                </div>
            `;
            return;
        }

        const html = agents.map(agent => `
            <div class="list-item" title="${agent.name} - ${agent.status}">
                <span class="status-dot ${agent.status}"></span>
                <span class="item-icon">${getAgentIcon(agent.type)}</span>
                <span class="item-label">${agent.name}</span>
                <span class="item-status">${formatStatus(agent.status)}</span>
            </div>
        `).join('');

        agentsList.innerHTML = html;
    }

    function updateTasksList(tasks) {
        const tasksList = document.getElementById('tasks-list');
        if (!tasksList) return;

        if (tasks.length === 0) {
            tasksList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📋</span>
                    <span class="empty-text">No tasks</span>
                </div>
            `;
            return;
        }

        const html = tasks.map(task => `
            <div class="list-item" title="${task.description || task.title}">
                <span class="status-dot ${task.status}"></span>
                <span class="item-icon">📋</span>
                <span class="item-label">${task.title}</span>
                <span class="item-status">${formatStatus(task.status)}</span>
            </div>
        `).join('');

        tasksList.innerHTML = html;
    }

    function updateStats(stats) {
        const elements = {
            completed: document.getElementById('completed-count'),
            progress: document.getElementById('progress-count'),
            pending: document.getElementById('pending-count')
        };

        if (elements.completed) elements.completed.textContent = stats.completedTasks || 0;
        if (elements.progress) elements.progress.textContent = stats.inProgressTasks || 0;
        if (elements.pending) elements.pending.textContent = stats.pendingTasks || 0;
    }

    // Helper functions
    function getAgentIcon(type) {
        const icons = {
            'frontend-specialist': '🎨',
            'backend-specialist': '⚙️',
            'fullstack-developer': '🔧',
            'testing-specialist': '🧪',
            'devops-engineer': '🚀',
            'database-architect': '💾',
            'security-expert': '🔒',
            'mobile-developer': '📱',
            'ai-ml-specialist': '🤖',
            'algorithm-engineer': '🧠',
            'nlp-specialist': '🗣️'
        };
        return icons[type] || '👤';
    }

    function formatStatus(status) {
        const statusMap = {
            'active': 'Active',
            'busy': 'Busy',
            'idle': 'Idle',
            'error': 'Error',
            'pending': 'Pending',
            'in_progress': 'Working',
            'completed': 'Done',
            'failed': 'Failed'
        };
        return statusMap[status] || status;
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Alt + 1-4 to switch tabs
        if (event.altKey && event.key >= '1' && event.key <= '4') {
            event.preventDefault();
            const tabs = ['teams', 'tasks', 'control', 'config'];
            const tabIndex = parseInt(event.key) - 1;
            if (tabs[tabIndex]) {
                switchTab(tabs[tabIndex]);
            }
        }
    });

    // Auto-refresh on visibility change
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            vscode.postMessage({ command: 'refreshData' });
        }
    });

    // Restore saved state
    const state = vscode.getState();
    if (state && state.activeTab) {
        setTimeout(() => {
            switchTab(state.activeTab);
        }, 100);
    }

    // Smooth interactions
    function addInteractionFeedback() {
        // Add subtle scale effect on click
        document.addEventListener('mousedown', (event) => {
            const clickable = event.target.closest('.action-item, .agent-type-item, .tab-button');
            if (clickable) {
                clickable.style.transform = 'scale(0.98)';
                clickable.style.transition = 'transform 0.1s ease';
            }
        });

        document.addEventListener('mouseup', (event) => {
            const clickable = event.target.closest('.action-item, .agent-type-item, .tab-button');
            if (clickable) {
                setTimeout(() => {
                    clickable.style.transform = '';
                    clickable.style.transition = '';
                }, 100);
            }
        });

        // Add hover sound effect (if desired)
        const hoverElements = document.querySelectorAll('.action-item, .agent-type-item');
        hoverElements.forEach(element => {
            element.addEventListener('mouseenter', () => {
                // Could add subtle sound effect here
            });
        });
    }

    // Initialize interaction feedback
    setTimeout(addInteractionFeedback, 100);

    // Error handling
    window.addEventListener('error', (event) => {
        console.error('Panel error:', event.error);
        vscode.postMessage({
            command: 'error',
            message: event.error.message,
            stack: event.error.stack
        });
    });

})();