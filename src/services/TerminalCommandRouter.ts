import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { extractJsonFromClaudeOutput } from '../orchestration/MessageProtocol';
import { ILoggingService, IEventBus } from './interfaces';
import { AGENT_EVENTS, TASK_EVENTS } from './EventConstants';

/**
 * Routes and executes commands from conductor terminal output
 */
export class TerminalCommandRouter {
    private terminal: vscode.Terminal | undefined;
    private disposables: vscode.Disposable[] = [];
    private outputBuffer: string = '';
    private bufferTimeout: NodeJS.Timeout | undefined;
    private isProcessing = false;

    constructor(
        private agentManager: AgentManager,
        private taskQueue: TaskQueue,
        private loggingService?: ILoggingService,
        private eventBus?: IEventBus
    ) {}

    /**
     * Start monitoring a terminal for conductor commands
     */
    public startMonitoring(terminal: vscode.Terminal): void {
        this.terminal = terminal;
        this.loggingService?.info('TerminalCommandRouter: Starting command monitoring');

        // Monitor terminal output
        const writeEmitter = (vscode.window as any).onDidWriteTerminalData;
        if (writeEmitter) {
            this.disposables.push(
                writeEmitter((e: any) => {
                    if (e.terminal === this.terminal) {
                        this.handleTerminalOutput(e.data);
                    }
                })
            );
        } else {
            // Fallback: VS Code API might not have this event yet
            this.loggingService?.warn('Terminal data monitoring not available in this VS Code version');
        }
    }

    /**
     * Handle terminal output data
     */
    private handleTerminalOutput(data: string): void {
        // Add to buffer
        this.outputBuffer += data;

        // Clear existing timeout
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }

        // Set new timeout to process buffer
        this.bufferTimeout = setTimeout(() => {
            this.processBuffer();
        }, 500); // Wait 500ms for complete output
    }

    /**
     * Process buffered output for commands
     */
    private async processBuffer(): Promise<void> {
        if (this.isProcessing || !this.outputBuffer.trim()) {
            return;
        }

        this.isProcessing = true;
        const buffer = this.outputBuffer;
        this.outputBuffer = '';

        try {
            // Extract JSON commands from Claude's output
            const command = extractJsonFromClaudeOutput(buffer);
            
            if (command) {
                this.loggingService?.info('Detected conductor command:', command);
                await this.executeCommand(command);
            }
        } catch (error) {
            this.loggingService?.error('Error processing terminal output:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Execute a conductor command
     */
    private async executeCommand(command: any): Promise<void> {
        try {
            let result: string | undefined;

            switch (command.type) {
                case 'spawn':
                case 'spawn_agent':
                    result = await this.handleSpawnAgent(command);
                    break;

                case 'assign':
                case 'assign_task':
                    result = await this.handleAssignTask(command);
                    break;

                case 'status':
                case 'query_status':
                    result = await this.handleQueryStatus(command);
                    break;

                case 'terminate':
                case 'terminate_agent':
                    result = await this.handleTerminateAgent(command);
                    break;

                case 'spawn_team':
                    result = await this.handleSpawnTeam(command);
                    break;

                case 'help':
                    result = this.handleHelp();
                    break;

                default:
                    this.loggingService?.warn(`Unknown command type: ${command.type}`);
                    result = `⚠️ Unknown command type: ${command.type}`;
            }

            // Send result back to terminal if available
            if (result && this.terminal) {
                this.sendToTerminal(result);
            }

        } catch (error) {
            const errorMsg = `❌ Command execution failed: ${error}`;
            this.loggingService?.error(errorMsg);
            this.sendToTerminal(errorMsg);
        }
    }

    /**
     * Handle spawn agent command
     */
    private async handleSpawnAgent(command: any): Promise<string> {
        const { role, name } = command;
        
        this.loggingService?.info(`Spawning agent: ${role} (${name || 'unnamed'})`);
        
        // Use AgentManager to spawn the agent
        const agent = await this.agentManager.spawnAgent({
            type: role,
            name: name || undefined
        });

        if (agent) {
            this.eventBus?.publish(AGENT_EVENTS.AGENT_CREATED, { agent });
            return `✅ Spawned ${role} agent: ${agent.name} (${agent.id})`;
        } else {
            return `❌ Failed to spawn ${role} agent`;
        }
    }

    /**
     * Handle assign task command
     */
    private async handleAssignTask(command: any): Promise<string> {
        const { task, agentId, priority = 'normal' } = command;
        
        this.loggingService?.info(`Assigning task to ${agentId}: ${task}`);

        // Add task to queue
        const taskItem = this.taskQueue.addTask({
            title: task,
            description: task,
            priority
        });

        if (taskItem) {
            this.eventBus?.publish(TASK_EVENTS.TASK_CREATED, { task: taskItem });
            
            // If specific agent, assign the task to them
            if (agentId && agentId !== 'auto') {
                await this.taskQueue.assignTask(taskItem.id, agentId);
                
                const agent = this.agentManager.getAgent(agentId);
                if (agent?.terminal) {
                    // Send task to agent's terminal
                    agent.terminal.sendText(`\n# New Task Assigned:\n${task}\nPriority: ${priority}\n`);
                }
                
                return `✅ Task assigned: "${task}" to ${agentId} (priority: ${priority})`;
            } else {
                // Auto-assign will be handled by task queue
                return `✅ Task created: "${task}" (priority: ${priority}, auto-assignment pending)`;
            }
        } else {
            return `❌ Failed to create task: ${task}`;
        }
    }

    /**
     * Handle query status command
     */
    private async handleQueryStatus(command: any): Promise<string> {
        const { agentId } = command;
        
        if (agentId === 'all') {
            const agents = this.agentManager.getActiveAgents();
            if (agents.length === 0) {
                return '📊 No active agents';
            }
            
            let status = '📊 Agent Status:\n';
            for (const agent of agents) {
                const tasks = this.taskQueue.getTasksForAgent(agent.id);
                const taskInfo = tasks.length > 0 
                    ? `working on ${tasks.length} task(s)` 
                    : 'idle';
                status += `  • ${agent.name} (${agent.type}): ${agent.status} - ${taskInfo}\n`;
            }
            return status;
        } else {
            const agent = this.agentManager.getAgent(agentId);
            if (!agent) {
                return `❌ Agent ${agentId} not found`;
            }
            
            const tasks = this.taskQueue.getTasksForAgent(agent.id);
            const taskInfo = tasks.length > 0 
                ? `Working on: ${tasks.map(t => t.title).join(', ')}` 
                : 'No active tasks';
            
            return `📊 ${agent.name} (${agent.type}):\n  Status: ${agent.status}\n  ${taskInfo}`;
        }
    }

    /**
     * Handle terminate agent command
     */
    private async handleTerminateAgent(command: any): Promise<string> {
        const { agentId } = command;
        
        if (agentId === 'all') {
            const agents = this.agentManager.getActiveAgents();
            for (const agent of agents) {
                await this.agentManager.removeAgent(agent.id);
            }
            this.eventBus?.publish(AGENT_EVENTS.ALL_TERMINATED, {});
            return `✅ Terminated all ${agents.length} agents`;
        } else {
            const agent = this.agentManager.getAgent(agentId);
            if (!agent) {
                return `❌ Agent ${agentId} not found`;
            }
            
            await this.agentManager.removeAgent(agentId);
            this.eventBus?.publish(AGENT_EVENTS.AGENT_TERMINATED, { agentId });
            return `✅ Terminated ${agent.name} (${agentId})`;
        }
    }

    /**
     * Handle spawn team command
     */
    private async handleSpawnTeam(command: any): Promise<string> {
        const { preset } = command;
        
        this.loggingService?.info(`Spawning team preset: ${preset}`);
        
        // Define team presets
        const presets: Record<string, string[]> = {
            'small-team': ['frontend-specialist', 'backend-specialist'],
            'standard-team': ['frontend-specialist', 'backend-specialist', 'testing-specialist'],
            'large-team': ['frontend-specialist', 'backend-specialist', 'testing-specialist', 'devops-engineer', 'database-architect'],
            'fullstack-team': ['fullstack-developer', 'testing-specialist', 'devops-engineer'],
            'custom-team': ['frontend-specialist', 'backend-specialist'] // Default for custom
        };

        const roles = presets[preset] || presets['standard-team'];
        const spawned: string[] = [];

        for (const role of roles) {
            const agent = await this.agentManager.spawnAgent({ 
                type: role,
                name: `${role}-${Date.now().toString(36).substr(-4)}`
            });
            if (agent) {
                spawned.push(`${agent.name} (${role})`);
            }
        }

        if (spawned.length > 0) {
            return `✅ Spawned ${preset}:\n${spawned.map(s => `  • ${s}`).join('\n')}`;
        } else {
            return `❌ Failed to spawn ${preset}`;
        }
    }

    /**
     * Handle help command
     */
    private handleHelp(): string {
        return `📚 Conductor Commands:
        
Natural Language:
  • "add a frontend dev" - Spawn an agent
  • "what's everyone doing?" - Check all status
  • "assign login form to agent-1" - Assign task
  • "terminate agent-2" - Remove agent
  • "start a small team" - Spawn team preset

JSON Commands:
  • {"type": "spawn", "role": "frontend-specialist"}
  • {"type": "status", "agentId": "all"}
  • {"type": "assign", "task": "...", "agentId": "agent-1"}
  • {"type": "terminate", "agentId": "agent-1"}
  
Team Presets: small-team, standard-team, large-team, fullstack-team`;
    }

    /**
     * Send message to terminal
     */
    private sendToTerminal(message: string): void {
        if (this.terminal) {
            // Format message with newlines and prefix
            const formatted = `\n[System] ${message}\n`;
            
            // Note: We can't directly write to terminal, but we can show notification
            // and log the result
            vscode.window.showInformationMessage(message);
            this.loggingService?.info(`Command result: ${message}`);
        }
    }

    /**
     * Stop monitoring
     */
    public stopMonitoring(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }
        
        this.terminal = undefined;
        this.outputBuffer = '';
        this.loggingService?.info('TerminalCommandRouter: Stopped monitoring');
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stopMonitoring();
    }
}