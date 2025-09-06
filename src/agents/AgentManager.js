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
exports.AgentManager = void 0;
const vscode = __importStar(require("vscode"));
const EventConstants_1 = require("../services/EventConstants");
class AgentManager {
    constructor(context, persistence) {
        this.agents = new Map();
        this._onAgentUpdate = new vscode.EventEmitter();
        this.onAgentUpdate = this._onAgentUpdate.event;
        this.disposables = [];
        this.isDisposing = false;
        this.context = context;
        this.persistence = persistence;
    }
    setDependencies(agentLifecycleManager, terminalManager, worktreeService, configService, notificationService, loggingService, eventBus, errorHandler, metricsService) {
        this.agentLifecycleManager = agentLifecycleManager;
        this.terminalManager = terminalManager;
        this.worktreeService = worktreeService;
        this.configService = configService;
        this.notificationService = notificationService;
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.metricsService = metricsService;
        const terminalCloseDisposable = this.terminalManager.onTerminalClosed((terminal) => {
            if (this.isDisposing) {
                return;
            }
            const agent = this.findAgentByTerminal(terminal);
            if (agent) {
                if (agent.status === 'working' && agent.currentTask) {
                    agent.status = 'idle';
                    const task = agent.currentTask;
                    agent.currentTask = null;
                    this._onAgentUpdate.fire();
                    if (this.eventBus) {
                        this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_STATUS_CHANGED, { agentId: agent.id, status: 'idle' });
                        this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_TASK_INTERRUPTED, { agentId: agent.id, task });
                    }
                    this.notificationService?.showWarning(`⚠️ Agent ${agent.name} stopped. Task "${task.title}" interrupted.`);
                }
                this.removeAgent(agent.id);
            }
        });
        this.disposables.push(terminalCloseDisposable);
    }
    async initialize(showSetupDialog = false) {
        if (!this.agentLifecycleManager || !this.configService) {
            throw new Error('AgentManager dependencies not set. Call setDependencies() first.');
        }
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.loggingService?.debug(`Workspace folder: ${workspaceFolder?.uri.fsPath || 'None'}`);
        if (this.persistence) {
            this.loggingService?.debug('Persistence initialized');
        }
        else {
            this.loggingService?.warn('No persistence available - agent state will not be saved');
        }
        await this.agentLifecycleManager.initialize();
        const claudePath = this.configService.getClaudePath();
        this.loggingService?.info(`AgentManager initialized. Claude path: ${claudePath}`);
        await this.restoreAgentsFromPersistence();
        if (showSetupDialog) {
            const selection = await this.notificationService?.showInformation('🎸 NofX Conductor ready. Using Claude command: ' + claudePath, 'Test Claude', 'Change Path', 'Restore Session');
            if (selection === 'Test Claude') {
                const terminal = this.terminalManager?.createEphemeralTerminal('Claude Test');
                if (terminal) {
                    terminal.show();
                    terminal.sendText(`${claudePath} --version || echo "Claude not found. Please check installation."`);
                }
            }
            else if (selection === 'Change Path') {
                const newPath = await this.notificationService?.showInputBox({
                    prompt: 'Enter Claude command or path',
                    value: claudePath,
                    placeHolder: 'e.g., claude, /usr/local/bin/claude'
                });
                if (newPath) {
                    await this.configService?.update('claudePath', newPath, vscode.ConfigurationTarget.Global);
                    this.notificationService?.showInformation(`Claude path updated to: ${newPath}`);
                }
            }
            else if (selection === 'Restore Session') {
                await this.restoreAgentsFromPersistence(true);
            }
        }
    }
    async restoreAgents() {
        return this.restoreAgentsFromPersistence(true);
    }
    async restoreAgentsFromPersistence(userRequested = false) {
        this.loggingService?.debug('Checking for saved agents to restore...');
        if (!this.persistence) {
            this.loggingService?.warn('No persistence available (no workspace open)');
            if (userRequested) {
                this.notificationService?.showWarning('No workspace open. Cannot restore agents.');
            }
            return 0;
        }
        const savedAgents = await this.persistence.loadAgentState();
        this.loggingService?.info(`Found ${savedAgents.length} saved agent(s)`);
        if (savedAgents.length === 0) {
            if (userRequested) {
                this.notificationService?.showInformation('No saved agents found.');
            }
            return 0;
        }
        const restore = userRequested ? 'Yes, Restore' : await this.notificationService?.showInformation(`Found ${savedAgents.length} saved agent(s). Restore them?`, 'Yes, Restore', 'No, Start Fresh');
        if (restore === 'Yes, Restore' || userRequested) {
            let restoredCount = 0;
            for (const savedAgent of savedAgents) {
                try {
                    const config = {
                        name: savedAgent.name,
                        type: savedAgent.type,
                        template: savedAgent.template
                    };
                    const agent = await this.spawnAgent(config, savedAgent.id);
                    agent.status = savedAgent.status === 'working' ? 'idle' : savedAgent.status;
                    agent.tasksCompleted = savedAgent.tasksCompleted || 0;
                    const sessionContext = await this.persistence.getAgentContextSummary(savedAgent.id);
                    if (sessionContext) {
                        const terminal = this.terminalManager?.getTerminal(agent.id);
                        if (terminal) {
                            terminal.sendText(`# Restored from previous session`);
                            terminal.sendText(`# ${sessionContext.split('\n').slice(0, 5).join('\n# ')}`);
                        }
                    }
                    restoredCount++;
                }
                catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.errorHandler?.handleError(err, `Failed to restore agent ${savedAgent.name}`);
                }
            }
            if (restoredCount > 0) {
                this.notificationService?.showInformation(`✅ Restored ${restoredCount} agent(s) from previous session`);
            }
            return restoredCount;
        }
        return 0;
    }
    async spawnAgent(config, restoredId) {
        if (!this.agentLifecycleManager) {
            throw new Error('AgentLifecycleManager not available');
        }
        const agent = await this.agentLifecycleManager.spawnAgent(config, restoredId);
        this.agents.set(agent.id, agent);
        this.metricsService?.incrementCounter('agents_created', {
            agentType: agent.type,
            totalAgents: this.agents.size.toString()
        });
        this._onAgentUpdate.fire();
        if (this.eventBus) {
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_CREATED, { agentId: agent.id, name: agent.name, type: agent.type });
        }
        await this.saveAgentState();
        this.loggingService?.info(`Agent ${config.name} ready. Total agents: ${this.agents.size}`);
        this.loggingService?.debug(`Agent statuses:`, Array.from(this.agents.values()).map(a => `${a.name}: ${a.status}`));
        return agent;
    }
    async executeTask(agentId, task) {
        this.loggingService?.debug(`Called for agent ${agentId} with task:`, task.title);
        const agent = this.agents.get(agentId);
        if (!agent) {
            const error = new Error(`Agent ${agentId} not found`);
            this.errorHandler?.handleError(error, 'executeTask');
            throw error;
        }
        this.loggingService?.debug(`Found agent: ${agent.name}, status: ${agent.status}`);
        if (!this.terminalManager) {
            const error = new Error('TerminalManager not available');
            this.errorHandler?.handleError(error, 'executeTask');
            throw error;
        }
        const terminal = this.terminalManager.getTerminal(agentId);
        if (!terminal) {
            const error = new Error(`Agent ${agentId} terminal not found`);
            this.errorHandler?.handleError(error, 'executeTask');
            throw error;
        }
        this.loggingService?.debug(`Updating agent status from ${agent.status} to working`);
        const assignmentTimer = this.metricsService?.startTimer('task_assignment_time');
        agent.status = 'working';
        agent.currentTask = task;
        this._onAgentUpdate.fire();
        this.metricsService?.incrementCounter('task_assigned', {
            agentType: agent.type,
            taskPriority: task.priority?.toString() || 'unknown'
        });
        if (assignmentTimer) {
            this.metricsService?.endTimer(assignmentTimer);
        }
        if (this.eventBus) {
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_STATUS_CHANGED, { agentId: agent.id, status: 'working' });
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_TASK_ASSIGNED, { agentId: agent.id, task });
        }
        this.saveAgentState();
        this.loggingService?.info(`Starting task: ${task.title}`);
        this.loggingService?.debug(`Description: ${task.description}`);
        this.loggingService?.debug(`Priority: ${task.priority}`);
        this.loggingService?.debug(`Task ID: ${task.id}`);
        terminal.show();
        const taskPrompt = `${task.title}: ${task.description}`;
        this.loggingService?.debug(`Sending task to agent`);
        terminal.sendText('');
        terminal.sendText(`echo "=== New Task Assignment ==="`);
        terminal.sendText(`echo "Task: ${task.title}"`);
        terminal.sendText(`echo "==========================="`);
        terminal.sendText('');
        terminal.sendText(`Please complete this task: ${taskPrompt}`);
        this.loggingService?.debug(`Sent task directly to already-running Claude instance`);
        if (this.notificationService) {
            this.notificationService.showInformation(`🤖 Task sent to ${agent.name}'s Claude instance. Check terminal for progress.`, 'View Terminal').then(selection => {
                if (selection === 'View Terminal') {
                    terminal.show();
                }
            });
            this.notificationService.showInformation(`🤖 ${agent.name} is working on: ${task.title}`);
        }
        this.loggingService?.info(`Starting Claude Code session...`);
        this.loggingService?.info(`Task: ${task.title}`);
    }
    createDetailedTaskPrompt(agent, task) {
        let prompt = `You are ${agent.name}, a ${agent.type} specialist.\n\n`;
        prompt += `Task: ${task.title}\n`;
        prompt += `Description: ${task.description}\n\n`;
        if (task.files && task.files.length > 0) {
            prompt += `Relevant files:\n`;
            task.files.forEach((file) => {
                prompt += `- ${file}\n`;
            });
            prompt += '\n';
        }
        prompt += `Please complete this task following best practices for ${agent.type} development.\n`;
        prompt += `Make all necessary changes to implement the requested functionality.`;
        return prompt;
    }
    createFullPrompt(agent, task) {
        let prompt = '';
        if (agent.template && agent.template.systemPrompt) {
            prompt += agent.template.systemPrompt + '\n\n';
        }
        else {
            prompt += `You are ${agent.name}, a ${agent.type} specialist.\n\n`;
        }
        prompt += `=== TASK ===\n`;
        prompt += `Title: ${task.title}\n`;
        prompt += `Description: ${task.description}\n`;
        prompt += `Priority: ${task.priority}\n\n`;
        if (task.files && task.files.length > 0) {
            prompt += `=== RELEVANT FILES ===\n`;
            task.files.forEach((file) => {
                prompt += `- ${file}\n`;
            });
            prompt += '\n';
        }
        prompt += `=== INSTRUCTIONS ===\n`;
        prompt += `Please complete this task following best practices.\n`;
        prompt += `Make all necessary changes to implement the requested functionality.\n`;
        prompt += `When you're done, please summarize what you accomplished.`;
        return prompt;
    }
    buildClaudeCommand(prompt, task) {
        const taskDescription = `${task.title}: ${task.description}`;
        return `claude`;
    }
    async completeTask(agentId, task) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return;
        agent.status = 'idle';
        agent.currentTask = null;
        agent.tasksCompleted++;
        this._onAgentUpdate.fire();
        if (this.eventBus) {
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_STATUS_CHANGED, { agentId: agent.id, status: 'idle' });
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_TASK_COMPLETED, { agentId: agent.id, task });
        }
        await this.saveAgentState();
        this.loggingService?.info(`Task completed: ${task.title}`);
        this.loggingService?.info(`Total tasks completed: ${agent.tasksCompleted}`);
        if (this.notificationService) {
            this.notificationService.showInformation(`✅ ${agent.name} completed: ${task.title}`);
        }
    }
    async removeAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return;
        if (!this.agentLifecycleManager) {
            const error = new Error('AgentLifecycleManager not available');
            this.errorHandler?.handleError(error, 'removeAgent');
            throw error;
        }
        const success = await this.agentLifecycleManager.removeAgent(agentId);
        if (success) {
            this.metricsService?.incrementCounter('agents_removed', {
                agentType: agent.type,
                totalAgents: (this.agents.size - 1).toString()
            });
            this.agents.delete(agentId);
            this._onAgentUpdate.fire();
            if (this.eventBus) {
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_REMOVED, { agentId, name: agent.name });
            }
            await this.saveAgentState();
            this.loggingService?.info(`Agent ${agent.name} removed`);
        }
    }
    getActiveAgents() {
        return Array.from(this.agents.values());
    }
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    getIdleAgents() {
        const allAgents = Array.from(this.agents.values());
        const idleAgents = allAgents.filter(agent => agent.status === 'idle');
        this.loggingService?.debug(`Total agents: ${allAgents.length}, Idle: ${idleAgents.length}`);
        if (allAgents.length > 0) {
            this.loggingService?.debug(`Agent statuses:`, allAgents.map(a => `${a.name}(${a.id}): ${a.status}`));
        }
        return idleAgents;
    }
    getAgentTerminal(agentId) {
        if (!this.terminalManager) {
            return undefined;
        }
        return this.terminalManager.getTerminal(agentId);
    }
    getAgentStats() {
        const allAgents = Array.from(this.agents.values());
        return {
            total: allAgents.length,
            idle: allAgents.filter(a => a.status === 'idle').length,
            working: allAgents.filter(a => a.status === 'working').length,
            error: allAgents.filter(a => a.status === 'error').length,
            offline: allAgents.filter(a => a.status === 'offline').length
        };
    }
    findAgentByTerminal(terminal) {
        for (const [agentId, agent] of this.agents.entries()) {
            if (agent.terminal === terminal) {
                return agent;
            }
        }
        return undefined;
    }
    monitorTaskExecution(agentId, task) {
        let lastActivityTime = Date.now();
        const IDLE_THRESHOLD = 30000;
        const checkInterval = setInterval(() => {
            const terminal = this.terminalManager?.getTerminal(agentId);
            const agent = this.agents.get(agentId);
            if (!terminal || !agent || agent.status !== 'working') {
                clearInterval(checkInterval);
                return;
            }
            const currentTime = Date.now();
            if (vscode.window.activeTerminal !== terminal) {
                if (currentTime - lastActivityTime > IDLE_THRESHOLD) {
                    this.notificationService?.showInformation(`Is ${agent.name} done with "${task.title}"?`, 'Yes, Complete', 'Still Working').then(selection => {
                        if (selection === 'Yes, Complete') {
                            this.completeTask(agentId, task);
                            clearInterval(checkInterval);
                        }
                        else {
                            lastActivityTime = Date.now();
                        }
                    });
                }
            }
            else {
                lastActivityTime = Date.now();
            }
        }, 15000);
        const agentData = this.agents.get(agentId);
        if (agentData) {
            agentData.monitorInterval = checkInterval;
        }
    }
    updateAgent(agent) {
        this.agents.set(agent.id, agent);
        this._onAgentUpdate.fire();
        this.saveAgentState();
    }
    renameAgent(id, newName) {
        const agent = this.agents.get(id);
        if (agent) {
            agent.name = newName;
            this.updateAgent(agent);
        }
    }
    updateAgentType(id, newType) {
        const agent = this.agents.get(id);
        if (agent) {
            agent.type = newType;
            this.updateAgent(agent);
        }
    }
    setUseWorktrees(value) {
        this.configService?.update('useWorktrees', value, vscode.ConfigurationTarget.Workspace);
    }
    notifyAgentUpdated() {
        this._onAgentUpdate.fire();
    }
    async saveAgentState() {
        if (!this.persistence)
            return;
        try {
            const agents = Array.from(this.agents.values());
            await this.persistence.saveAgentState(agents);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'saveAgentState');
        }
    }
    async saveAgentSession(agentId, content) {
        if (!this.persistence)
            return;
        try {
            await this.persistence.saveAgentSession(agentId, content);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'saveAgentSession');
        }
    }
    async dispose() {
        this.isDisposing = true;
        await this.saveAgentState();
        await Promise.allSettled([...this.agents.keys()].map(id => this.removeAgent(id)));
        this.agentLifecycleManager?.dispose();
        this.terminalManager?.dispose();
        this.worktreeService?.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this._onAgentUpdate.dispose();
    }
}
exports.AgentManager = AgentManager;
//# sourceMappingURL=AgentManager.js.map