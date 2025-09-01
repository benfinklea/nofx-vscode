import * as vscode from 'vscode';
import { Agent, AgentConfig, AgentStatus } from './types';

export class AgentManager {
    private agents: Map<string, Agent> = new Map();
    private terminals: Map<string, vscode.Terminal> = new Map();
    private outputChannels: Map<string, vscode.OutputChannel> = new Map();
    private context: vscode.ExtensionContext;
    private _onAgentUpdate = new vscode.EventEmitter<void>();
    public readonly onAgentUpdate = this._onAgentUpdate.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;

        // Listen for terminal close events
        vscode.window.onDidCloseTerminal((terminal) => {
            const agent = this.findAgentByTerminal(terminal);
            if (agent) {
                // If agent was working, mark as idle and task as interrupted
                if (agent.status === 'working' && agent.currentTask) {
                    agent.status = 'idle';
                    const task = agent.currentTask;
                    agent.currentTask = null;
                    this._onAgentUpdate.fire();
                    
                    vscode.window.showWarningMessage(
                        `⚠️ Agent ${agent.name} stopped. Task "${task.title}" interrupted.`
                    );
                }
                this.removeAgent(agent.id);
            }
        });
    }

    async initialize() {
        // Check if Claude Code is available
        const claudePath = vscode.workspace.getConfiguration('nofx').get<string>('claudePath') || 'claude';
        
        console.log(`[NofX] AgentManager initialized. Claude path: ${claudePath}`);
        
        // Show instructions for Claude setup
        const selection = await vscode.window.showInformationMessage(
            '🎸 NofX Conductor ready. Using Claude command: ' + claudePath,
            'Test Claude',
            'Change Path'
        );
        
        if (selection === 'Test Claude') {
            const terminal = vscode.window.createTerminal('Claude Test');
            terminal.show();
            terminal.sendText(`${claudePath} --version || echo "Claude not found. Please check installation."`);            
        } else if (selection === 'Change Path') {
            const newPath = await vscode.window.showInputBox({
                prompt: 'Enter Claude command or path',
                value: claudePath,
                placeHolder: 'e.g., claude, /usr/local/bin/claude'
            });
            if (newPath) {
                await vscode.workspace.getConfiguration('nofx').update('claudePath', newPath, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Claude path updated to: ${newPath}`);
            }
        }
    }

    async spawnAgent(config: AgentConfig): Promise<Agent> {
        const agentId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Get icon based on agent type/template
        const iconMap: { [key: string]: string } = {
            'frontend': 'symbol-color',
            'backend': 'server',
            'fullstack': 'layers',
            'mobile': 'device-mobile',
            'database': 'database',
            'devops': 'cloud',
            'testing': 'beaker',
            'ai': 'hubot',
            'general': 'person'
        };
        
        const terminalIcon = iconMap[config.type] || 'person';
        
        // Create a dedicated terminal for this agent
        const terminal = vscode.window.createTerminal({
            name: `${config.template?.icon || '🤖'} ${config.name}`,
            iconPath: new vscode.ThemeIcon(terminalIcon),
            env: {
                NOFX_AGENT_ID: agentId,
                NOFX_AGENT_TYPE: config.type,
                NOFX_AGENT_NAME: config.name
            }
        });

        // Create output channel for agent logs
        const outputChannel = vscode.window.createOutputChannel(
            `n of x: ${config.name}`,
            'nofx-agent'
        );

        // Create agent object
        const agent: Agent = {
            id: agentId,
            name: config.name,
            type: config.type,
            status: 'idle' as AgentStatus,
            terminal: terminal,
            currentTask: null,
            startTime: new Date(),
            tasksCompleted: 0,
            template: config.template // Store template for prompts and capabilities
        };

        console.log(`[NofX AgentManager] Created agent ${agentId} with status: ${agent.status}`);

        // Store agent and associated resources
        this.agents.set(agentId, agent);
        this.terminals.set(agentId, terminal);
        this.outputChannels.set(agentId, outputChannel);

        // Initialize agent in terminal
        this.initializeAgentTerminal(agent);

        // Notify listeners
        this._onAgentUpdate.fire();

        outputChannel.appendLine(`✅ Agent ${config.name} (${config.type}) initialized`);
        outputChannel.appendLine(`ID: ${agentId}`);
        outputChannel.appendLine(`Status: ${agent.status}`);
        outputChannel.appendLine(`Ready to receive tasks...`);

        console.log(`[NofX AgentManager] Agent ${config.name} ready. Total agents: ${this.agents.size}`);
        console.log(`[NofX AgentManager] Agent statuses:`, Array.from(this.agents.values()).map(a => `${a.name}: ${a.status}`));

        return agent;
    }

    private initializeAgentTerminal(agent: Agent) {
        const terminal = this.terminals.get(agent.id);
        if (!terminal) return;

        // Set up the agent's working environment
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            terminal.sendText(`cd "${workspaceFolder.uri.fsPath}"`);
        }

        // Show agent info
        terminal.sendText(`echo "🤖 Initializing ${agent.name} (${agent.type})"`);
        terminal.sendText(`echo "Agent ID: ${agent.id}"`);
        terminal.sendText(`echo "Starting Claude with agent specialization..."`);
        terminal.sendText(`echo ""`);
        
        // Start Claude immediately with the agent's system prompt
        const claudePath = vscode.workspace.getConfiguration('nofx').get<string>('claudePath') || 'claude';
        terminal.sendText(claudePath);
        
        // Send the system prompt after Claude starts
        setTimeout(() => {
            if (agent.template && agent.template.systemPrompt) {
                console.log(`[NofX] Sending system prompt to ${agent.name}`);
                terminal.sendText(agent.template.systemPrompt);
                terminal.sendText(''); // Empty line
                terminal.sendText(`I am ${agent.name}, ready to help with ${agent.template.specialization || agent.type} tasks. What would you like me to work on?`);
            } else {
                terminal.sendText(`I am ${agent.name}, a ${agent.type} specialist. Ready for tasks.`);
            }
        }, 3000); // Give Claude time to initialize
    }

    async executeTask(agentId: string, task: any) {
        console.log(`[NofX AgentManager.executeTask] Called for agent ${agentId} with task:`, task.title);
        
        const agent = this.agents.get(agentId);
        if (!agent) {
            console.error(`[NofX AgentManager.executeTask] Agent ${agentId} not found!`);
            throw new Error(`Agent ${agentId} not found`);
        }
        console.log(`[NofX AgentManager.executeTask] Found agent: ${agent.name}, status: ${agent.status}`);

        const terminal = this.terminals.get(agentId);
        const outputChannel = this.outputChannels.get(agentId);
        
        if (!terminal || !outputChannel) {
            console.error(`[NofX AgentManager.executeTask] Agent ${agentId} resources not found!`);
            throw new Error(`Agent ${agentId} resources not found`);
        }

        console.log(`[NofX AgentManager.executeTask] Updating agent status from ${agent.status} to working`);
        
        // Update agent status
        agent.status = 'working';
        agent.currentTask = task;
        this._onAgentUpdate.fire();

        outputChannel.appendLine(`\n📋 Starting task: ${task.title}`);
        outputChannel.appendLine(`Description: ${task.description}`);
        outputChannel.appendLine(`Priority: ${task.priority}`);
        outputChannel.appendLine(`Task ID: ${task.id}`);
        outputChannel.show(true);
        
        console.log(`[NofX AgentManager.executeTask] Task details written to output channel`);

        // Prepare task for Claude Code (using detailed prompt method if needed)
        // const detailedPrompt = this.createDetailedTaskPrompt(agent, task);

        // Execute with Claude Code in the terminal
        terminal.show();
        
        // Build a simple, clean prompt
        const taskPrompt = `${task.title}: ${task.description}`;
        
        console.log(`[NofX AgentManager.executeTask] Sending task to agent`);
        
        // Show task assignment
        terminal.sendText(''); // Empty line for clarity
        terminal.sendText(`echo "=== New Task Assignment ==="`);
        terminal.sendText(`echo "Task: ${task.title}"`);
        terminal.sendText(`echo "==========================="`);
        terminal.sendText('');
        
        // Since Claude is already running in the agent's terminal with system prompt,
        // we can just send the task directly
        terminal.sendText(`Please complete this task: ${taskPrompt}`);
        console.log(`[NofX AgentManager.executeTask] Sent task directly to already-running Claude instance`);
        
        // Show notification
        vscode.window.showInformationMessage(
            `🤖 Task sent to ${agent.name}'s Claude instance. Check terminal for progress.`,
            'View Terminal'
        ).then(selection => {
            if (selection === 'View Terminal') {
                terminal.show();
            }
        });

        // Log execution
        outputChannel.appendLine(`\n🧠 Starting Claude Code session...`);
        outputChannel.appendLine(`Task: ${task.title}`);
        
        // Show notification
        vscode.window.showInformationMessage(
            `🤖 ${agent.name} is working on: ${task.title}`
        );

        // Don't monitor - let the conductor or user decide when tasks are done
        // this.monitorTaskExecution(agentId, task);
    }

    private createDetailedTaskPrompt(agent: Agent, task: any): string {
        let prompt = `You are ${agent.name}, a ${agent.type} specialist.\n\n`;
        prompt += `Task: ${task.title}\n`;
        prompt += `Description: ${task.description}\n\n`;
        
        if (task.files && task.files.length > 0) {
            prompt += `Relevant files:\n`;
            task.files.forEach((file: string) => {
                prompt += `- ${file}\n`;
            });
            prompt += '\n';
        }

        prompt += `Please complete this task following best practices for ${agent.type} development.\n`;
        prompt += `Make all necessary changes to implement the requested functionality.`;

        return prompt;
    }

    private createFullPrompt(agent: Agent, task: any): string {
        let prompt = '';
        
        // Add system prompt if available
        if (agent.template && agent.template.systemPrompt) {
            prompt += agent.template.systemPrompt + '\n\n';
        } else {
            prompt += `You are ${agent.name}, a ${agent.type} specialist.\n\n`;
        }
        
        // Add task details
        prompt += `=== TASK ===\n`;
        prompt += `Title: ${task.title}\n`;
        prompt += `Description: ${task.description}\n`;
        prompt += `Priority: ${task.priority}\n\n`;
        
        // Add file context if available
        if (task.files && task.files.length > 0) {
            prompt += `=== RELEVANT FILES ===\n`;
            task.files.forEach((file: string) => {
                prompt += `- ${file}\n`;
            });
            prompt += '\n';
        }
        
        // Add instructions
        prompt += `=== INSTRUCTIONS ===\n`;
        prompt += `Please complete this task following best practices.\n`;
        prompt += `Make all necessary changes to implement the requested functionality.\n`;
        prompt += `When you're done, please summarize what you accomplished.`;
        
        return prompt;
    }

    private buildClaudeCommand(prompt: string, task: any): string {
        // Start an interactive Claude session with initial context
        // This allows the user to continue giving commands to Claude
        const taskDescription = `${task.title}: ${task.description}`;
        
        // Start Claude in interactive mode
        // The initial prompt sets context, then Claude stays open for more commands
        return `claude`; // Just start Claude - user can type commands
    }

    public completeTask(agentId: string, task: any) {
        const agent = this.agents.get(agentId);
        const outputChannel = this.outputChannels.get(agentId);
        
        if (!agent || !outputChannel) return;

        // Update agent status
        agent.status = 'idle';
        agent.currentTask = null;
        agent.tasksCompleted++;
        this._onAgentUpdate.fire();

        outputChannel.appendLine(`\n✅ Task completed: ${task.title}`);
        outputChannel.appendLine(`Total tasks completed: ${agent.tasksCompleted}`);

        // Show completion message
        vscode.window.showInformationMessage(
            `✅ ${agent.name} completed: ${task.title}`
        );
    }

    removeAgent(agentId: string) {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        // Clean up resources
        const terminal = this.terminals.get(agentId);
        const outputChannel = this.outputChannels.get(agentId);

        if (terminal) {
            terminal.dispose();
            this.terminals.delete(agentId);
        }

        if (outputChannel) {
            outputChannel.dispose();
            this.outputChannels.delete(agentId);
        }

        this.agents.delete(agentId);
        this._onAgentUpdate.fire();

        vscode.window.showInformationMessage(
            `Agent ${agent.name} removed`
        );
    }

    getActiveAgents(): Agent[] {
        return Array.from(this.agents.values());
    }

    getAgent(agentId: string): Agent | undefined {
        return this.agents.get(agentId);
    }

    getIdleAgents(): Agent[] {
        const allAgents = Array.from(this.agents.values());
        const idleAgents = allAgents.filter(agent => agent.status === 'idle');
        
        console.log(`[NofX AgentManager.getIdleAgents] Total agents: ${allAgents.length}, Idle: ${idleAgents.length}`);
        if (allAgents.length > 0) {
            console.log(`[NofX AgentManager.getIdleAgents] Agent statuses:`, allAgents.map(a => `${a.name}(${a.id}): ${a.status}`));
        }
        
        return idleAgents;
    }

    getAgentTerminal(agentId: string): vscode.Terminal | undefined {
        return this.terminals.get(agentId);
    }

    private findAgentByTerminal(terminal: vscode.Terminal): Agent | undefined {
        for (const [agentId, agentTerminal] of this.terminals.entries()) {
            if (agentTerminal === terminal) {
                return this.agents.get(agentId);
            }
        }
        return undefined;
    }

    private monitorTaskExecution(agentId: string, task: any) {
        let lastActivityTime = Date.now();
        const IDLE_THRESHOLD = 30000; // 30 seconds of inactivity
        
        const checkInterval = setInterval(() => {
            const terminal = this.terminals.get(agentId);
            const agent = this.agents.get(agentId);
            
            if (!terminal || !agent || agent.status !== 'working') {
                clearInterval(checkInterval);
                return;
            }
            
            // Check if terminal exists and is still active
            // VS Code doesn't expose terminal output directly, but we can check state
            const currentTime = Date.now();
            
            // If terminal was closed, it will be handled by onDidCloseTerminal
            // Here we check for idle state (Claude might have finished)
            if (vscode.window.activeTerminal !== terminal) {
                // Terminal is not active, check if it's been idle too long
                if (currentTime - lastActivityTime > IDLE_THRESHOLD) {
                    // Prompt user to confirm if task is complete
                    vscode.window.showInformationMessage(
                        `Is ${agent.name} done with "${task.title}"?`,
                        'Yes, Complete', 'Still Working'
                    ).then(selection => {
                        if (selection === 'Yes, Complete') {
                            this.completeTask(agentId, task);
                            clearInterval(checkInterval);
                        } else {
                            lastActivityTime = Date.now(); // Reset timer
                        }
                    });
                }
            } else {
                // Terminal is active, reset activity time
                lastActivityTime = Date.now();
            }
        }, 15000); // Check every 15 seconds
        
        // Store interval for cleanup
        const agentData = this.agents.get(agentId);
        if (agentData) {
            (agentData as any).monitorInterval = checkInterval;
        }
    }

    dispose() {
        // Clean up all agents
        for (const agentId of this.agents.keys()) {
            this.removeAgent(agentId);
        }
        
        this._onAgentUpdate.dispose();
    }
}