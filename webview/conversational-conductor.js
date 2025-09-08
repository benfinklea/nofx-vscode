// Conversational Conductor WebView JavaScript
console.log('Conversational Conductor JS starting to load...');
(function() {
    'use strict';
    console.log('Inside IIFE - JavaScript is executing');

    // Get VS Code API
    const vscode = acquireVsCodeApi();
    
    // State management
    let currentState = {
        conversation: [],
        agents: [],
        isActive: false
    };

    // Sound Design System
    class SoundManager {
        constructor() {
            this.audioContext = null;
            this.enabled = true;
            this.volume = 0.3;
            this.initAudio();
        }

        initAudio() {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.log('Web Audio API not supported');
                this.enabled = false;
            }
        }

        async resumeContext() {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
        }

        createTone(frequency, duration, type = 'sine') {
            if (!this.enabled || !this.audioContext) return;
            
            this.resumeContext();
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;
            
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(this.volume, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        }

        playMessageSent() {
            // Soft "whoosh" - ascending tone
            this.createTone(400, 0.15, 'sine');
            setTimeout(() => this.createTone(600, 0.1, 'sine'), 50);
        }

        playMessageReceived() {
            // Gentle "ding" - descending harmonics
            this.createTone(800, 0.2, 'sine');
            setTimeout(() => this.createTone(600, 0.15, 'sine'), 100);
        }

        playAgentSpawned(agentType) {
            // Unique pitch per agent type
            const pitches = {
                'frontend': 660,
                'backend': 440,
                'testing': 550,
                'devops': 330,
                'security': 880,
                'database': 370,
                'mobile': 770,
                'ai-ml': 990,
                'nlp': 850,
                'algorithm': 480,
                'fullstack': 520
            };
            
            const pitch = pitches[agentType] || 500;
            this.createTone(pitch, 0.3, 'triangle');
            setTimeout(() => this.createTone(pitch * 1.5, 0.2, 'sine'), 150);
        }

        playTaskComplete() {
            // Satisfying completion - ascending triad
            this.createTone(440, 0.15, 'sine');
            setTimeout(() => this.createTone(554, 0.15, 'sine'), 100);
            setTimeout(() => this.createTone(659, 0.2, 'sine'), 200);
        }

        playError() {
            // Gentle "thud" - low frequency
            this.createTone(150, 0.25, 'sawtooth');
        }

        playHover() {
            // Subtle UI feedback
            this.createTone(800, 0.05, 'sine');
        }

        toggle() {
            this.enabled = !this.enabled;
            return this.enabled;
        }

        setVolume(level) {
            this.volume = Math.max(0, Math.min(1, level));
        }
    }

    const soundManager = new SoundManager();

    // Hover Preview System
    class HoverPreviewManager {
        constructor() {
            this.tooltip = null;
            this.showDelay = 600;
            this.hideDelay = 200;
            this.showTimeout = null;
            this.hideTimeout = null;
            this.isVisible = false;
            this.agentCapabilities = {
                'frontend': {
                    icon: '🎨',
                    description: 'UI/UX specialist with React, Vue, CSS expertise',
                    capabilities: ['React Components', 'Vue.js', 'CSS/SCSS', 'UI Design', 'Responsive Design', 'Animation'],
                    strength: 'Building beautiful, interactive user interfaces'
                },
                'backend': {
                    icon: '⚙️',
                    description: 'Server-side expert specializing in APIs and databases',
                    capabilities: ['Node.js', 'Python', 'REST APIs', 'Database Design', 'Authentication', 'Performance'],
                    strength: 'Robust server architecture and data management'
                },
                'testing': {
                    icon: '🧪',
                    description: 'Quality assurance expert for comprehensive testing',
                    capabilities: ['Unit Testing', 'E2E Testing', 'Jest', 'Playwright', 'Test Strategy', 'QA'],
                    strength: 'Ensuring code quality and reliability'
                },
                'devops': {
                    icon: '🚀',
                    description: 'Infrastructure and deployment automation specialist',
                    capabilities: ['CI/CD', 'Docker', 'Kubernetes', 'AWS', 'Monitoring', 'Deployment'],
                    strength: 'Scalable infrastructure and smooth deployments'
                },
                'security': {
                    icon: '🔒',
                    description: 'Security expert for vulnerability assessment',
                    capabilities: ['Security Audits', 'Penetration Testing', 'OWASP', 'Encryption', 'Auth', 'Compliance'],
                    strength: 'Protecting applications from security threats'
                },
                'database': {
                    icon: '🗃️',
                    description: 'Database architect and optimization specialist',
                    capabilities: ['SQL', 'NoSQL', 'Schema Design', 'Performance Tuning', 'Migrations', 'Analytics'],
                    strength: 'Efficient data storage and retrieval systems'
                },
                'mobile': {
                    icon: '📱',
                    description: 'Mobile development expert for iOS and Android',
                    capabilities: ['React Native', 'iOS', 'Android', 'Mobile UI', 'Performance', 'App Store'],
                    strength: 'Native and cross-platform mobile applications'
                },
                'ai-ml': {
                    icon: '🤖',
                    description: 'AI/ML specialist for intelligent features',
                    capabilities: ['Machine Learning', 'TensorFlow', 'PyTorch', 'Data Science', 'AI Integration', 'Models'],
                    strength: 'Adding intelligence to applications'
                },
                'nlp': {
                    icon: '💬',
                    description: 'Natural language processing and AI communication',
                    capabilities: ['NLP', 'Text Processing', 'Language Models', 'Chatbots', 'Translation', 'Sentiment'],
                    strength: 'Understanding and generating human language'
                },
                'algorithm': {
                    icon: '🧮',
                    description: 'Algorithm and data structure optimization expert',
                    capabilities: ['Algorithms', 'Data Structures', 'Optimization', 'Performance', 'Complexity', 'Math'],
                    strength: 'Efficient problem-solving and optimization'
                },
                'fullstack': {
                    icon: '🌐',
                    description: 'Full-stack developer handling end-to-end features',
                    capabilities: ['Frontend', 'Backend', 'Databases', 'APIs', 'Integration', 'Architecture'],
                    strength: 'Complete feature development from UI to data'
                }
            };
        }

        show(element, content, type = 'default') {
            this.clearTimeouts();
            
            this.showTimeout = setTimeout(() => {
                this.createTooltip(element, content, type);
                this.isVisible = true;
            }, this.showDelay);
        }

        hide() {
            this.clearTimeouts();
            
            if (this.isVisible) {
                this.hideTimeout = setTimeout(() => {
                    this.removeTooltip();
                    this.isVisible = false;
                }, this.hideDelay);
            }
        }

        clearTimeouts() {
            if (this.showTimeout) {
                clearTimeout(this.showTimeout);
                this.showTimeout = null;
            }
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
        }

        createTooltip(element, content, type) {
            this.removeTooltip();
            
            this.tooltip = document.createElement('div');
            this.tooltip.className = `hover-tooltip ${type}`;
            this.tooltip.innerHTML = content;
            
            document.body.appendChild(this.tooltip);
            this.positionTooltip(element);
            
            // Animate in
            requestAnimationFrame(() => {
                this.tooltip.style.opacity = '1';
                this.tooltip.style.transform = 'translateY(0) scale(1)';
            });
        }

        positionTooltip(element) {
            const rect = element.getBoundingClientRect();
            const tooltipRect = this.tooltip.getBoundingClientRect();
            
            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            let top = rect.top - tooltipRect.height - 8;
            
            // Boundary checks
            if (left < 8) left = 8;
            if (left + tooltipRect.width > window.innerWidth - 8) {
                left = window.innerWidth - tooltipRect.width - 8;
            }
            if (top < 8) {
                top = rect.bottom + 8;
            }
            
            this.tooltip.style.left = `${left}px`;
            this.tooltip.style.top = `${top}px`;
        }

        removeTooltip() {
            if (this.tooltip) {
                this.tooltip.remove();
                this.tooltip = null;
            }
        }

        createAgentTooltip(agentType, agentName, status) {
            const info = this.agentCapabilities[agentType] || {
                icon: '🤖',
                description: 'Specialized development agent',
                capabilities: ['Custom Development'],
                strength: 'Tailored solutions for your needs'
            };

            return `
                <div class="tooltip-header">
                    <span class="tooltip-icon">${info.icon}</span>
                    <div class="tooltip-title-group">
                        <div class="tooltip-title">${agentName}</div>
                        <div class="tooltip-subtitle">${info.description}</div>
                    </div>
                    <div class="tooltip-status ${status}"></div>
                </div>
                <div class="tooltip-content">
                    <div class="tooltip-strength">
                        <strong>Specialization:</strong> ${info.strength}
                    </div>
                    <div class="tooltip-capabilities">
                        <strong>Capabilities:</strong>
                        <div class="capability-tags">
                            ${info.capabilities.map(cap => `<span class="capability-tag">${cap}</span>`).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

        createTaskTooltip(task) {
            const priority = task.priority || 'medium';
            const progress = task.progress || 0;
            
            return `
                <div class="tooltip-header">
                    <span class="tooltip-icon">📋</span>
                    <div class="tooltip-title-group">
                        <div class="tooltip-title">Task Details</div>
                        <div class="tooltip-subtitle">Priority: ${priority}</div>
                    </div>
                </div>
                <div class="tooltip-content">
                    <div class="task-description">${task.description}</div>
                    <div class="task-progress">
                        <div class="progress-label">Progress: ${progress}%</div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    ${task.agent ? `<div class="task-agent">Assigned to: ${task.agent}</div>` : ''}
                </div>
            `;
        }

        createStatusTooltip(status, details) {
            const statusInfo = {
                'connected': { icon: '🟢', text: 'Connected to conductor AI', color: 'var(--success-color)' },
                'disconnected': { icon: '🔴', text: 'Disconnected from conductor AI', color: 'var(--error-color)' },
                'ready': { icon: '✅', text: 'Agent is ready for tasks', color: 'var(--success-color)' },
                'busy': { icon: '⏳', text: 'Agent is currently working', color: 'var(--warning-color)' },
                'error': { icon: '❌', text: 'Agent encountered an error', color: 'var(--error-color)' }
            };
            
            const info = statusInfo[status] || { icon: '⚪', text: 'Unknown status', color: 'var(--text-muted)' };
            
            return `
                <div class="tooltip-header">
                    <span class="tooltip-icon">${info.icon}</span>
                    <div class="tooltip-title-group">
                        <div class="tooltip-title" style="color: ${info.color}">${info.text}</div>
                        ${details ? `<div class="tooltip-subtitle">${details}</div>` : ''}
                    </div>
                </div>
            `;
        }
    }

    const hoverPreview = new HoverPreviewManager();

    // Command Palette & Keyboard Shortcuts System
    class CommandPaletteManager {
        constructor() {
            this.isVisible = false;
            this.overlay = null;
            this.palette = null;
            this.searchInput = null;
            this.commandList = null;
            this.selectedIndex = 0;
            this.filteredCommands = [];
            
            this.commands = [
                {
                    id: 'spawn-frontend',
                    label: 'Spawn Frontend Agent',
                    description: 'Create a new UI/UX specialist agent',
                    icon: '🎨',
                    keywords: ['spawn', 'frontend', 'ui', 'react', 'vue'],
                    action: () => this.spawnAgent('frontend-specialist', 'Frontend Dev')
                },
                {
                    id: 'spawn-backend',
                    label: 'Spawn Backend Agent',
                    description: 'Create a new server-side specialist agent',
                    icon: '⚙️',
                    keywords: ['spawn', 'backend', 'api', 'server', 'database'],
                    action: () => this.spawnAgent('backend-specialist', 'Backend Dev')
                },
                {
                    id: 'spawn-testing',
                    label: 'Spawn Testing Agent',
                    description: 'Create a new quality assurance specialist agent',
                    icon: '🧪',
                    keywords: ['spawn', 'testing', 'qa', 'jest', 'playwright'],
                    action: () => this.spawnAgent('testing-specialist', 'Test Engineer')
                },
                {
                    id: 'spawn-devops',
                    label: 'Spawn DevOps Agent',
                    description: 'Create a new infrastructure specialist agent',
                    icon: '🚀',
                    keywords: ['spawn', 'devops', 'ci', 'cd', 'docker', 'kubernetes'],
                    action: () => this.spawnAgent('devops-engineer', 'DevOps Engineer')
                },
                {
                    id: 'status-all',
                    label: 'Check All Agent Status',
                    description: 'Get status update from all active agents',
                    icon: '📊',
                    keywords: ['status', 'agents', 'check', 'update'],
                    action: () => this.sendMessage('What is the current status of all active agents?')
                },
                {
                    id: 'clear-chat',
                    label: 'Clear Conversation',
                    description: 'Clear the entire chat history',
                    icon: '🗑️',
                    keywords: ['clear', 'delete', 'clean', 'reset'],
                    action: () => clearConversation()
                },
                {
                    id: 'export-chat',
                    label: 'Export Conversation',
                    description: 'Export chat history to file',
                    icon: '📤',
                    keywords: ['export', 'save', 'download'],
                    action: () => exportConversation()
                },
                {
                    id: 'get-advice',
                    label: 'Ask for Advice',
                    description: 'Get strategic guidance from the conductor',
                    icon: '💡',
                    keywords: ['advice', 'help', 'guidance', 'strategy'],
                    action: () => showAdviceDialog()
                },
                {
                    id: 'focus-input',
                    label: 'Focus Message Input',
                    description: 'Jump to the message input field',
                    icon: '✏️',
                    keywords: ['focus', 'input', 'type', 'message'],
                    action: () => elements.messageInput.focus()
                },
                {
                    id: 'toggle-sound',
                    label: 'Toggle Sound Effects',
                    description: 'Enable or disable audio feedback',
                    icon: '🔊',
                    keywords: ['sound', 'audio', 'mute', 'toggle'],
                    action: () => this.toggleSound()
                }
            ];
        }

        show() {
            if (this.isVisible) return;
            
            this.createPalette();
            this.isVisible = true;
            this.filteredCommands = [...this.commands];
            this.selectedIndex = 0;
            this.renderCommands();
            
            setTimeout(() => this.searchInput.focus(), 100);
        }

        hide() {
            if (!this.isVisible) return;
            
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }
            
            this.isVisible = false;
            this.palette = null;
            this.searchInput = null;
            this.commandList = null;
        }

        createPalette() {
            this.overlay = document.createElement('div');
            this.overlay.className = 'command-palette-overlay';
            
            this.palette = document.createElement('div');
            this.palette.className = 'command-palette';
            
            this.palette.innerHTML = `
                <div class="palette-header">
                    <div class="palette-icon">⌘</div>
                    <input type="text" class="palette-search" placeholder="Type a command or search...">
                    <div class="palette-shortcut">Esc</div>
                </div>
                <div class="palette-results">
                    <div class="command-list"></div>
                </div>
                <div class="palette-footer">
                    <div class="palette-hint">
                        <kbd>↑↓</kbd> navigate <kbd>⏎</kbd> execute <kbd>esc</kbd> close
                    </div>
                </div>
            `;
            
            this.searchInput = this.palette.querySelector('.palette-search');
            this.commandList = this.palette.querySelector('.command-list');
            
            this.overlay.appendChild(this.palette);
            document.body.appendChild(this.overlay);
            
            this.setupPaletteListeners();
            
            // Animate in
            requestAnimationFrame(() => {
                this.overlay.style.opacity = '1';
                this.palette.style.transform = 'translateY(0) scale(1)';
            });
        }

        setupPaletteListeners() {
            this.searchInput.addEventListener('input', (e) => {
                this.filterCommands(e.target.value);
            });
            
            this.searchInput.addEventListener('keydown', (e) => {
                switch (e.key) {
                    case 'ArrowDown':
                        e.preventDefault();
                        this.selectNext();
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        this.selectPrevious();
                        break;
                    case 'Enter':
                        e.preventDefault();
                        this.executeSelected();
                        break;
                    case 'Escape':
                        e.preventDefault();
                        this.hide();
                        break;
                }
            });
            
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.hide();
                }
            });
        }

        filterCommands(query) {
            const lowerQuery = query.toLowerCase();
            
            this.filteredCommands = this.commands.filter(cmd => 
                cmd.label.toLowerCase().includes(lowerQuery) ||
                cmd.description.toLowerCase().includes(lowerQuery) ||
                cmd.keywords.some(keyword => keyword.toLowerCase().includes(lowerQuery))
            );
            
            this.selectedIndex = 0;
            this.renderCommands();
        }

        renderCommands() {
            if (this.filteredCommands.length === 0) {
                this.commandList.innerHTML = '<div class="no-commands">No commands found</div>';
                return;
            }
            
            const commandsHTML = this.filteredCommands.map((cmd, index) => `
                <div class="command-item ${index === this.selectedIndex ? 'selected' : ''}" 
                     onclick="commandPalette.executeCommand('${cmd.id}')">
                    <div class="command-icon">${cmd.icon}</div>
                    <div class="command-info">
                        <div class="command-label">${cmd.label}</div>
                        <div class="command-description">${cmd.description}</div>
                    </div>
                </div>
            `).join('');
            
            this.commandList.innerHTML = commandsHTML;
        }

        selectNext() {
            if (this.filteredCommands.length === 0) return;
            this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
            this.renderCommands();
            this.scrollToSelected();
        }

        selectPrevious() {
            if (this.filteredCommands.length === 0) return;
            this.selectedIndex = this.selectedIndex === 0 ? 
                this.filteredCommands.length - 1 : 
                this.selectedIndex - 1;
            this.renderCommands();
            this.scrollToSelected();
        }

        scrollToSelected() {
            const selectedElement = this.commandList.querySelector('.command-item.selected');
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }

        executeSelected() {
            if (this.filteredCommands.length === 0) return;
            const selected = this.filteredCommands[this.selectedIndex];
            this.executeCommand(selected.id);
        }

        executeCommand(commandId) {
            const command = this.commands.find(cmd => cmd.id === commandId);
            if (command) {
                this.hide();
                command.action();
                soundManager.playTaskComplete();
            }
        }

        spawnAgent(type, name) {
            const message = `Please spawn a ${type} agent named "${name}"`;
            this.sendMessage(message);
        }

        sendMessage(text) {
            elements.messageInput.value = text;
            sendMessage();
        }

        toggleSound() {
            const enabled = soundManager.toggle();
            const message = `Sound effects ${enabled ? 'enabled' : 'disabled'}`;
            this.showToast(message);
        }

        showToast(message) {
            const toast = document.createElement('div');
            toast.className = 'command-toast';
            toast.textContent = message;
            document.body.appendChild(toast);
            
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });
            
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-10px)';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        }
    }

    const commandPalette = new CommandPaletteManager();
    window.commandPalette = commandPalette; // Make globally accessible

    // Smart Contextual Suggestions Engine
    class ContextualSuggestionsEngine {
        constructor() {
            this.suggestionsContainer = null;
            this.currentSuggestions = [];
            this.analysisTimeout = null;
            
            // Keywords that trigger specific suggestions
            this.triggerPatterns = {
                'spawn': {
                    keywords: ['spawn', 'create', 'add', 'new agent', 'bring in'],
                    suggestions: [
                        { text: 'Spawn frontend specialist', icon: '🎨' },
                        { text: 'Spawn backend specialist', icon: '⚙️' },
                        { text: 'Spawn testing specialist', icon: '🧪' },
                        { text: 'Spawn full team for this project', icon: '👥' }
                    ]
                },
                'status': {
                    keywords: ['status', 'how are', 'what\'s happening', 'update', 'progress'],
                    suggestions: [
                        { text: 'What is the status of all agents?', icon: '📊' },
                        { text: 'Show me recent task completions', icon: '✅' },
                        { text: 'Which agents are currently working?', icon: '⏳' }
                    ]
                },
                'architecture': {
                    keywords: ['architecture', 'design', 'structure', 'patterns', 'best practices'],
                    suggestions: [
                        { text: 'Review current architecture patterns', icon: '🏗️' },
                        { text: 'Suggest improvements for scalability', icon: '📈' },
                        { text: 'Analyze code organization', icon: '📋' }
                    ]
                },
                'performance': {
                    keywords: ['performance', 'slow', 'optimize', 'speed', 'bottleneck'],
                    suggestions: [
                        { text: 'Run performance analysis', icon: '⚡' },
                        { text: 'Identify optimization opportunities', icon: '🔍' },
                        { text: 'Suggest caching strategies', icon: '💾' }
                    ]
                },
                'testing': {
                    keywords: ['test', 'testing', 'qa', 'quality', 'bug', 'error'],
                    suggestions: [
                        { text: 'Create comprehensive test plan', icon: '🧪' },
                        { text: 'Review test coverage', icon: '📊' },
                        { text: 'Set up automated testing', icon: '🤖' }
                    ]
                },
                'deployment': {
                    keywords: ['deploy', 'deployment', 'production', 'release', 'ci/cd'],
                    suggestions: [
                        { text: 'Setup deployment pipeline', icon: '🚀' },
                        { text: 'Review production readiness', icon: '✔️' },
                        { text: 'Configure monitoring and alerts', icon: '📡' }
                    ]
                }
            };
        }

        analyzePage() {
            // Look at recent messages and current context
            const recentMessages = this.getRecentMessages(5);
            const currentInput = elements.messageInput.value.toLowerCase();
            const allText = (recentMessages.join(' ') + ' ' + currentInput).toLowerCase();
            
            this.generateSuggestions(allText);
        }

        getRecentMessages(count) {
            const messageElements = elements.messages.querySelectorAll('.message .message-content');
            const messages = Array.from(messageElements)
                .slice(-count)
                .map(el => el.textContent.toLowerCase());
            return messages;
        }

        generateSuggestions(text) {
            const newSuggestions = [];
            
            // Check each pattern against the text
            Object.entries(this.triggerPatterns).forEach(([category, pattern]) => {
                const matches = pattern.keywords.some(keyword => 
                    text.includes(keyword.toLowerCase())
                );
                
                if (matches) {
                    // Add some suggestions from this category
                    const categorySuggestions = pattern.suggestions
                        .slice(0, 2) // Limit to 2 per category
                        .map(sugg => ({ ...sugg, category }));
                    newSuggestions.push(...categorySuggestions);
                }
            });

            // Add contextual suggestions based on current agents
            if (currentState.agents.length > 0) {
                newSuggestions.push({
                    text: 'Coordinate work between active agents',
                    icon: '🤝',
                    category: 'coordination'
                });
            } else {
                newSuggestions.push({
                    text: 'Start by spawning your first agent',
                    icon: '🌟',
                    category: 'getting-started'
                });
            }

            // Add time-based suggestions
            const hour = new Date().getHours();
            if (hour >= 17) {
                newSuggestions.push({
                    text: 'Prepare end-of-day status summary',
                    icon: '🌅',
                    category: 'time-based'
                });
            } else if (hour >= 9 && hour <= 12) {
                newSuggestions.push({
                    text: 'Plan today\'s development priorities',
                    icon: '📋',
                    category: 'time-based'
                });
            }

            // Update suggestions if they've changed
            if (!this.arraysEqual(newSuggestions, this.currentSuggestions)) {
                this.currentSuggestions = newSuggestions.slice(0, 4); // Limit to 4 suggestions
                this.renderSuggestions();
            }
        }

        renderSuggestions() {
            if (!this.suggestionsContainer) {
                this.createSuggestionsContainer();
            }

            if (this.currentSuggestions.length === 0) {
                this.suggestionsContainer.innerHTML = '';
                return;
            }

            const suggestionsHTML = this.currentSuggestions.map(suggestion => `
                <button class="contextual-suggestion-btn" 
                        data-suggestion="${suggestion.text}"
                        title="${suggestion.category}">
                    <span class="suggestion-icon">${suggestion.icon}</span>
                    <span class="suggestion-text">${suggestion.text}</span>
                </button>
            `).join('');

            this.suggestionsContainer.innerHTML = suggestionsHTML;

            // Add click handlers
            this.suggestionsContainer.querySelectorAll('.contextual-suggestion-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const suggestion = btn.getAttribute('data-suggestion');
                    elements.messageInput.value = suggestion;
                    elements.messageInput.focus();
                    autoResizeTextarea.call(elements.messageInput);
                    soundManager.playHover();
                });

                btn.addEventListener('mouseenter', () => soundManager.playHover());
            });
        }

        createSuggestionsContainer() {
            this.suggestionsContainer = document.createElement('div');
            this.suggestionsContainer.className = 'contextual-suggestions';
            
            // Insert before the input container
            const inputArea = document.querySelector('.input-area');
            const inputContainer = inputArea.querySelector('.input-container');
            inputArea.insertBefore(this.suggestionsContainer, inputContainer);
        }

        arraysEqual(a, b) {
            if (a.length !== b.length) return false;
            return a.every((val, i) => val.text === b[i]?.text);
        }

        startAnalysis() {
            // Clear existing timeout
            if (this.analysisTimeout) {
                clearTimeout(this.analysisTimeout);
            }

            // Debounced analysis
            this.analysisTimeout = setTimeout(() => {
                this.analyzePage();
            }, 500);
        }
    }

    const contextualSuggestions = new ContextualSuggestionsEngine();

    // UI elements
    const elements = {
        messages: null,
        messageInput: null,
        sendButton: null,
        connectionStatus: null,
        agentsList: null,
        clearBtn: null,
        exportBtn: null,
        adviceBtn: null
    };

    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, initializing...');
        initializeElements();
        setupEventListeners();
        
        // Test if send button exists and is clickable
        const testBtn = document.getElementById('send-btn');
        console.log('Send button found:', !!testBtn);
        if (testBtn) {
            console.log('Send button element:', testBtn);
            // Add a simple test click handler
            testBtn.addEventListener('click', function(e) {
                console.log('Send button clicked! Event:', e);
            });
        }
        
        // Let the extension know we're ready
        vscode.postMessage({ command: 'ready' });
    });

    function initializeElements() {
        elements.messages = document.getElementById('messages');
        elements.messageInput = document.getElementById('message-input');
        elements.sendButton = document.getElementById('send-btn');
        elements.connectionStatus = document.getElementById('connection-status');
        elements.agentsList = document.getElementById('agents-list');
        elements.clearBtn = document.getElementById('clear-btn');
        elements.exportBtn = document.getElementById('export-btn');
        elements.adviceBtn = document.getElementById('advice-btn');
        
        // Debug log to check if elements are found
        console.log('Elements initialized:', {
            messages: !!elements.messages,
            messageInput: !!elements.messageInput,
            sendButton: !!elements.sendButton,
            connectionStatus: !!elements.connectionStatus,
            agentsList: !!elements.agentsList,
            clearBtn: !!elements.clearBtn,
            exportBtn: !!elements.exportBtn,
            adviceBtn: !!elements.adviceBtn
        });
    }

    function setupEventListeners() {
        // Send message
        elements.sendButton.addEventListener('click', sendMessage);
        elements.sendButton.addEventListener('mouseenter', () => soundManager.playHover());
        elements.messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Auto-resize textarea and trigger contextual suggestions
        elements.messageInput.addEventListener('input', function() {
            autoResizeTextarea.call(this);
            contextualSuggestions.startAnalysis();
        });

        // Header actions with hover sounds
        elements.clearBtn.addEventListener('click', clearConversation);
        elements.clearBtn.addEventListener('mouseenter', () => soundManager.playHover());
        elements.exportBtn.addEventListener('click', exportConversation);
        elements.exportBtn.addEventListener('mouseenter', () => soundManager.playHover());
        elements.adviceBtn.addEventListener('click', showAdviceDialog);
        elements.adviceBtn.addEventListener('mouseenter', () => soundManager.playHover());

        // Suggestion buttons
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('suggestion-btn')) {
                const suggestion = e.target.getAttribute('data-suggestion');
                if (suggestion) {
                    elements.messageInput.value = suggestion;
                    elements.messageInput.focus();
                    autoResizeTextarea.call(elements.messageInput);
                }
            }
        });

        // Quick action buttons
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('action-btn')) {
                const action = e.target.getAttribute('data-action');
                handleQuickAction(action);
            }
        });

        // Listen for messages from extension
        window.addEventListener('message', handleExtensionMessage);
    }

    function sendMessage() {
        const text = elements.messageInput.value.trim();
        console.log('sendMessage called with text:', text);
        if (!text) return;

        // Play send sound
        soundManager.playMessageSent();

        // Add user message immediately for better UX
        addMessage({
            sender: 'user',
            text: text,
            timestamp: Date.now(),
            type: 'message'
        });

        // Clear input and reset height
        elements.messageInput.value = '';
        elements.messageInput.style.height = 'auto';
        
        // Show typing indicator briefly
        showTypingIndicator();

        // Send to extension
        try {
            vscode.postMessage({
                command: 'sendMessage',
                text: text
            });
            console.log('Message sent to extension');
        } catch (error) {
            console.error('Failed to send message to extension:', error);
            // Show error message
            addMessage({
                sender: 'system',
                text: 'Failed to send message to conductor. Please try again.',
                timestamp: Date.now(),
                type: 'error'
            });
        }
    }

    function autoResizeTextarea() {
        this.style.height = 'auto';
        const newHeight = Math.min(this.scrollHeight, 120); // Max 120px
        this.style.height = newHeight + 'px';
    }

    function handleExtensionMessage(event) {
        const message = event.data;
        
        switch (message.command) {
            case 'initialState':
                currentState = message.state;
                renderInitialState();
                break;
            
            case 'addMessage':
                addMessage(message.message);
                break;
            
            case 'clearConversation':
                clearMessages();
                break;
            
            case 'updateAgents':
                updateAgents(message.agents);
                break;
            
            case 'updateConnectionStatus':
                updateConnectionStatus(message.connected);
                break;
        }
    }

    function renderInitialState() {
        // Render existing conversation
        clearMessages();
        currentState.conversation.forEach(msg => addMessage(msg));
        
        // Update agents
        updateAgents(currentState.agents);
        
        // Update connection status
        updateConnectionStatus(currentState.isActive);
        
        // Scroll to bottom
        scrollToBottom();
    }

    function addMessage(message) {
        hideTypingIndicator();
        
        // Play appropriate sound based on message type
        if (message.sender === 'conductor') {
            soundManager.playMessageReceived();
        } else if (message.sender === 'system') {
            if (message.type === 'notification') {
                soundManager.playTaskComplete();
            } else if (message.type === 'error') {
                soundManager.playError();
            }
        }
        
        const messageElement = createMessageElement(message);
        elements.messages.appendChild(messageElement);
        
        // Trigger contextual analysis after new message
        contextualSuggestions.startAnalysis();
        
        // Scroll to bottom
        scrollToBottom();
        
        // Save state
        vscode.setState(currentState);
    }

    function createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.sender} ${message.type || 'message'}`;
        
        // Create header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        
        const senderSpan = document.createElement('span');
        senderSpan.className = 'message-sender';
        
        const senderIcon = getSenderIcon(message.sender, message.type);
        senderSpan.innerHTML = `${senderIcon} ${formatSender(message.sender)}`;
        
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'message-timestamp';
        timestampSpan.textContent = formatTimestamp(message.timestamp);
        
        headerDiv.appendChild(senderSpan);
        headerDiv.appendChild(timestampSpan);
        
        // Create content with enhanced formatting
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = formatMessageContent(message.text);
        
        // Add subtle entrance animation
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(20px)';
        
        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        
        // Add actions for non-system messages
        if (message.sender !== 'system') {
            const actionsDiv = createMessageActions(message);
            messageDiv.appendChild(actionsDiv);
        }
        
        // Animate in
        requestAnimationFrame(() => {
            messageDiv.style.transition = 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        });
        
        return messageDiv;
    }

    function getSenderIcon(sender, type) {
        if (sender === 'system') {
            switch (type) {
                case 'notification': return '🔔';
                case 'command': return '⚡';
                default: return '⚙️';
            }
        }
        return sender === 'user' ? '👤' : '🤖';
    }

    function formatSender(sender) {
        switch (sender) {
            case 'user': return 'You';
            case 'conductor': return 'Conductor';
            case 'system': return 'System';
            default: return sender.charAt(0).toUpperCase() + sender.slice(1);
        }
    }

    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatMessageContent(text) {
        // Convert markdown-like formatting
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/```([\\s\\S]*?)```/g, '<pre>$1</pre>');
        
        // Convert URLs to links
        formatted = formatted.replace(
            /(https?:\\/\\/[\\S]+)/g,
            '<a href="$1" target="_blank" rel="noopener">$1</a>'
        );
        
        // Convert newlines to <br> tags
        formatted = formatted.replace(/\\n/g, '<br>');
        
        return formatted;
    }

    function createMessageActions(message) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        // Copy action
        const copyBtn = document.createElement('button');
        copyBtn.className = 'message-action';
        copyBtn.textContent = '📋';
        copyBtn.title = 'Copy message';
        copyBtn.onclick = () => copyToClipboard(message.text);
        actionsDiv.appendChild(copyBtn);
        
        // For conductor messages, add followup action
        if (message.sender === 'conductor') {
            const followupBtn = document.createElement('button');
            followupBtn.className = 'message-action';
            followupBtn.textContent = '↩️';
            followupBtn.title = 'Follow up on this';
            followupBtn.onclick = () => followUpOnMessage(message);
            actionsDiv.appendChild(followupBtn);
        }
        
        return actionsDiv;
    }

    function showTypingIndicator() {
        hideTypingIndicator(); // Remove any existing one
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator enhanced';
        typingDiv.id = 'typing-indicator';
        
        typingDiv.innerHTML = `
            <div class="message-skeleton">
                <div class="skeleton-header">
                    <div class="skeleton-avatar"></div>
                    <div class="skeleton-name"></div>
                    <div class="skeleton-timestamp"></div>
                </div>
                <div class="skeleton-content">
                    <div class="skeleton-line long"></div>
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line short"></div>
                </div>
            </div>
            <div class="typing-status">
                <span class="typing-text">Conductor is thinking</span>
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        
        // Add with animation
        typingDiv.style.opacity = '0';
        typingDiv.style.transform = 'translateY(10px)';
        elements.messages.appendChild(typingDiv);
        
        requestAnimationFrame(() => {
            typingDiv.style.transition = 'all 0.3s ease-out';
            typingDiv.style.opacity = '1';
            typingDiv.style.transform = 'translateY(0)';
        });
        
        scrollToBottom();
    }

    function showLoadingSkeleton() {
        const skeletonDiv = document.createElement('div');
        skeletonDiv.className = 'loading-skeleton';
        skeletonDiv.id = 'loading-skeleton';
        
        skeletonDiv.innerHTML = `
            <div class="message-skeleton">
                <div class="skeleton-header">
                    <div class="skeleton-avatar shimmer"></div>
                    <div class="skeleton-name shimmer"></div>
                    <div class="skeleton-timestamp shimmer"></div>
                </div>
                <div class="skeleton-content">
                    <div class="skeleton-line long shimmer"></div>
                    <div class="skeleton-line medium shimmer"></div>
                    <div class="skeleton-line short shimmer"></div>
                </div>
            </div>
        `;
        
        elements.messages.appendChild(skeletonDiv);
        scrollToBottom();
        
        return skeletonDiv;
    }

    function hideLoadingSkeleton() {
        const skeleton = document.getElementById('loading-skeleton');
        if (skeleton) {
            skeleton.remove();
        }
    }

    function hideTypingIndicator() {
        const existing = document.getElementById('typing-indicator');
        if (existing) {
            existing.remove();
        }
    }

    function scrollToBottom() {
        setTimeout(() => {
            elements.messages.scrollTop = elements.messages.scrollHeight;
        }, 100);
    }

    function clearMessages() {
        elements.messages.innerHTML = '';
    }

    function clearConversation() {
        if (confirm('Clear the entire conversation? This cannot be undone.')) {
            vscode.postMessage({ command: 'clearConversation' });
        }
    }

    function exportConversation() {
        vscode.postMessage({ command: 'exportConversation' });
    }

    function showAdviceDialog() {
        const topic = prompt('What topic would you like advice about?\\n\\nExamples:\\n- Architecture patterns\\n- Code review best practices\\n- Testing strategies\\n- Performance optimization');
        
        if (topic && topic.trim()) {
            vscode.postMessage({
                command: 'getAdvice',
                topic: topic.trim()
            });
        }
    }

    function handleQuickAction(action) {
        let message = '';
        
        switch (action) {
            case 'spawn-frontend':
                message = 'Please spawn a frontend specialist agent to help with UI development';
                break;
            case 'spawn-backend':
                message = 'Please spawn a backend specialist agent to help with server-side development';
                break;
            case 'spawn-testing':
                message = 'Please spawn a testing specialist agent to help with quality assurance';
                break;
            case 'check-status':
                message = 'What is the current status of all active agents?';
                break;
            default:
                return;
        }
        
        // Set message and focus input
        elements.messageInput.value = message;
        elements.messageInput.focus();
        autoResizeTextarea.call(elements.messageInput);
    }

    function updateAgents(agents) {
        const previousCount = currentState.agents.length;
        currentState.agents = agents || [];
        
        // Play sound for new agents
        if (agents.length > previousCount) {
            const newAgent = agents[agents.length - 1];
            soundManager.playAgentSpawned(newAgent.type);
        }
        
        if (!elements.agentsList) return;
        
        if (agents.length === 0) {
            elements.agentsList.innerHTML = '<div class="empty-state">No agents active</div>';
            return;
        }
        
        const agentsHTML = agents.map(agent => `
            <div class="agent-item" 
                 onmouseenter="soundManager.playHover(); handleAgentHover(this, '${agent.type}', '${agent.name}', '${agent.status}')" 
                 onmouseleave="hoverPreview.hide()">
                <div class="agent-status ${agent.status}" 
                     onmouseenter="handleStatusHover(this, '${agent.status}', '${agent.lastActivity || ''}')"
                     onmouseleave="hoverPreview.hide()"></div>
                <div class="agent-info">
                    <div class="agent-name">${agent.name}</div>
                    <div class="agent-type">${agent.type}</div>
                </div>
            </div>
        `).join('');
        
        elements.agentsList.innerHTML = agentsHTML;
    }

    function updateConnectionStatus(connected) {
        if (!elements.connectionStatus) return;
        
        currentState.isActive = connected;
        
        if (connected) {
            elements.connectionStatus.textContent = '🟢';
            elements.connectionStatus.className = 'connection-status connected';
            elements.connectionStatus.title = 'Connected to conductor AI';
        } else {
            elements.connectionStatus.textContent = '🔴';
            elements.connectionStatus.className = 'connection-status disconnected';
            elements.connectionStatus.title = 'Disconnected from conductor AI';
        }
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            // Could show a toast notification here
            console.log('Message copied to clipboard');
        }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
        });
    }

    function followUpOnMessage(message) {
        const followUp = `Regarding your previous message: "${message.text.substring(0, 50)}${message.text.length > 50 ? '...' : '}", I'd like to `;
        elements.messageInput.value = followUp;
        elements.messageInput.focus();
        // Position cursor at the end
        elements.messageInput.setSelectionRange(followUp.length, followUp.length);
        autoResizeTextarea.call(elements.messageInput);
    }

    // Auto-save state periodically
    setInterval(() => {
        if (currentState.conversation.length > 0) {
            vscode.setState(currentState);
        }
    }, 30000); // Save every 30 seconds

    // Handle visibility change to save state
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            vscode.setState(currentState);
        }
    });

    // Enhanced Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Command Palette - Cmd/Ctrl + K (unless input is focused)
        if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            commandPalette.show();
            return;
        }
        
        // Focus input - Cmd/Ctrl + I
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            elements.messageInput.focus();
        }
        
        // Clear conversation - Cmd/Ctrl + L
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault();
            clearConversation();
        }
        
        // Export - Cmd/Ctrl + E
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            exportConversation();
        }
        
        // Toggle sound - Cmd/Ctrl + M
        if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
            e.preventDefault();
            soundManager.toggle();
        }
        
        // Help/Command Palette - F1 or Cmd/Ctrl + Shift + P
        if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P')) {
            e.preventDefault();
            commandPalette.show();
        }
        
        // Close overlays - Escape
        if (e.key === 'Escape') {
            if (commandPalette.isVisible) {
                commandPalette.hide();
                e.preventDefault();
            }
        }
    });

    // Global hover handlers
    window.handleAgentHover = function(element, agentType, agentName, status) {
        const tooltip = hoverPreview.createAgentTooltip(agentType, agentName, status);
        hoverPreview.show(element, tooltip, 'agent');
    };

    window.handleStatusHover = function(element, status, details) {
        const tooltip = hoverPreview.createStatusTooltip(status, details);
        hoverPreview.show(element, tooltip, 'status');
    };

    window.handleTaskHover = function(element, task) {
        const tooltip = hoverPreview.createTaskTooltip(task);
        hoverPreview.show(element, tooltip, 'task');
    };

})();