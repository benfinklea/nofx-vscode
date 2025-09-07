import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { Agent } from '../agents/types';
import { OUTPUT_CHANNELS } from '../constants/outputChannels';

/**
 * The REAL Conductor - Actually manages agents and tasks
 * This is the brain of the operation
 */
export class IntelligentConductor {
    private agentManager: AgentManager;
    private taskQueue: TaskQueue;
    private terminal: vscode.Terminal | undefined;
    private outputChannel: vscode.OutputChannel;
    private claudePath: string;
    private isProcessingCommand: boolean = false;

    constructor(agentManager: AgentManager, taskQueue: TaskQueue) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.claudePath = vscode.workspace.getConfiguration('nofx').get<string>('claudePath') || 'claude';
        this.outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNELS.CONDUCTOR_BRAIN);

        // Monitor agent updates
        this.agentManager.onAgentUpdate(() => {
            this.logStatus();
        });
    }

    /**
     * Start the intelligent conductor
     */
    async start() {
        this.outputChannel.show();
        this.outputChannel.appendLine('🎼 Intelligent Conductor Starting...');

        // Create conductor terminal
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal({
                name: '🎼 NofX Conductor (Smart)',
                iconPath: new vscode.ThemeIcon('robot')
            });
        }

        this.terminal.show();

        // Initialize the conductor with enhanced capabilities
        this.initializeConductor();
    }

    private initializeConductor() {
        if (!this.terminal) return;

        this.terminal.sendText('clear');
        this.terminal.sendText('echo "🎸 NofX Intelligent Conductor v2.0"');
        this.terminal.sendText('echo "========================================"');
        this.terminal.sendText('echo "I can actually control agents and tasks!"');
        this.terminal.sendText('echo "========================================"');
        this.terminal.sendText('echo ""');

        // Start Claude with the enhanced conductor prompt using --append-system-prompt
        const systemPrompt = this.getEnhancedSystemPrompt().replace(/'/g, "'\\''"); // Escape single quotes for shell
        this.terminal.sendText(`${this.claudePath} --append-system-prompt '${systemPrompt}'`);

        // Send the initial greeting
        setTimeout(() => {
            if (this.terminal) {
                this.terminal.sendText('Hello! I am the NofX Intelligent Conductor. I can:');
                this.terminal.sendText('- See all active agents and their status');
                this.terminal.sendText('- Create and assign tasks automatically');
                this.terminal.sendText('- Monitor for conflicts between agents');
                this.terminal.sendText('- Coordinate complex multi-agent workflows');
                this.terminal.sendText('');
                this.terminal.sendText('Tell me what you want to build, and I will orchestrate everything!');

                // Start monitoring for commands
                this.startCommandMonitoring();
            }
        }, 3000);
    }

    private getEnhancedSystemPrompt(): string {
        const agents = this.agentManager.getActiveAgents();
        const idleAgents = this.agentManager.getIdleAgents();

        return `You are the NofX Intelligent Conductor v2.0 - an advanced orchestration system.

CURRENT SYSTEM STATUS:
- Active Agents: ${agents.length}
- Idle Agents: ${idleAgents.length}
- Agents: ${agents.map(a => `${a.name} (${a.type}): ${a.status}`).join(', ')}

YOUR CAPABILITIES:
1. Real-time agent status monitoring
2. Automatic task creation and delegation
3. Conflict detection and resolution
4. Multi-agent workflow coordination

WHEN USER REQUESTS SOMETHING:
1. Break it down into specific tasks
2. Identify which agents are needed
3. Say: "CONDUCTOR_COMMAND: CREATE_TASK [title] | [description] | [agent_type]"
4. Say: "CONDUCTOR_COMMAND: ASSIGN_AGENT [agent_id] | [task_id]"
5. Monitor progress and report back

CONFLICT DETECTION:
- Watch for multiple agents editing the same files
- Coordinate database schema changes
- Prevent style conflicts in frontend components
- Manage git conflicts

IMPORTANT: When you need to execute a command, always prefix it with "CONDUCTOR_COMMAND:" so the system can intercept and execute it.

You are a senior engineering manager with deep technical knowledge. Be proactive in preventing problems and ensuring smooth collaboration.`;
    }

    /**
     * Monitor conductor terminal for special commands
     */
    private startCommandMonitoring() {
        // In a real implementation, we'd monitor terminal output
        // For now, we'll use a periodic status check
        setInterval(() => {
            this.checkForConflicts();
            this.optimizeTaskAssignment();
        }, 10000); // Check every 10 seconds
    }

    /**
     * Process conductor commands (would be triggered by terminal monitoring)
     */
    public async processConductorCommand(command: string) {
        this.outputChannel.appendLine(`Processing command: ${command}`);

        if (command.startsWith('CREATE_TASK')) {
            const parts = command.replace('CREATE_TASK', '').split('|').map(s => s.trim());
            const [title, description, agentType] = parts;

            // Actually create the task
            const task = this.taskQueue.addTask({
                title,
                description,
                priority: 'high'
            });

            this.outputChannel.appendLine(`✅ Created task: ${task.id} - ${title}`);

            // Find best agent and assign
            const agent = this.findBestAgent(agentType);
            if (agent) {
                this.assignTaskToAgent(task, agent);
            }
        }
    }

    /**
     * Find the best available agent for a task type
     */
    private findBestAgent(type: string): Agent | null {
        const idleAgents = this.agentManager.getIdleAgents();

        // First, try to find an exact match
        let agent = idleAgents.find(a => a.type.toLowerCase().includes(type.toLowerCase()));

        // If no exact match, find one with matching capabilities
        if (!agent && idleAgents.length > 0) {
            agent = idleAgents.find(a =>
                a.template?.capabilities?.some((c: string) =>
                    c.toLowerCase().includes(type.toLowerCase())
                )
            );
        }

        // Fallback to any idle agent
        return agent || idleAgents[0] || null;
    }

    /**
     * Assign a task to a specific agent
     */
    private assignTaskToAgent(task: any, agent: Agent) {
        this.outputChannel.appendLine(`📋 Assigning "${task.title}" to ${agent.name}`);

        // This would call the actual task assignment
        // this.agentManager.executeTask(agent.id, task);

        // Update task status
        task.status = 'assigned';
        task.assignedTo = agent.id;
    }

    /**
     * Check for potential conflicts between agents
     */
    private checkForConflicts() {
        const workingAgents = this.agentManager.getActiveAgents().filter(a => a.status === 'working');

        if (workingAgents.length > 1) {
            // Check if multiple agents are working on related areas
            const frontendAgents = workingAgents.filter(a => a.type.includes('frontend'));
            const backendAgents = workingAgents.filter(a => a.type.includes('backend'));

            if (frontendAgents.length > 1) {
                this.outputChannel.appendLine('⚠️ Potential conflict: Multiple frontend agents active');
                this.notifyConflict('Multiple frontend agents working - potential style conflicts');
            }

            // Check for file conflicts (would need file monitoring in real implementation)
            this.checkFileConflicts(workingAgents);
        }
    }

    /**
     * Check if agents are editing the same files
     */
    private checkFileConflicts(agents: Agent[]) {
        // In a real implementation, we'd monitor file access
        // For now, this is a placeholder
        this.outputChannel.appendLine('Checking for file conflicts...');
    }

    /**
     * Optimize task assignment based on agent performance
     */
    private optimizeTaskAssignment() {
        const agents = this.agentManager.getActiveAgents();
        const queuedTasks = this.taskQueue.getQueuedTasks();

        if (queuedTasks.length > 0) {
            this.outputChannel.appendLine(`📊 Optimizing assignment for ${queuedTasks.length} queued tasks`);

            // Smart assignment based on agent specialization and workload
            for (const task of queuedTasks) {
                const bestAgent = this.findOptimalAgent(task);
                if (bestAgent) {
                    this.assignTaskToAgent(task, bestAgent);
                }
            }
        }
    }

    /**
     * Find the optimal agent for a task using smart matching
     */
    private findOptimalAgent(task: any): Agent | null {
        const agents = this.agentManager.getIdleAgents();
        if (agents.length === 0) return null;

        // Score each agent based on task fit
        const scores = agents.map(agent => {
            let score = 0;
            const taskText = `${task.title} ${task.description}`.toLowerCase();

            // Check type match
            if (agent.type && taskText.includes(agent.type.toLowerCase())) {
                score += 10;
            }

            // Check capability matches
            if (agent.template?.capabilities) {
                for (const capability of agent.template.capabilities) {
                    if (taskText.includes(capability.toLowerCase())) {
                        score += 5;
                    }
                }
            }

            // Check specialization match
            if (agent.template?.specialization &&
                taskText.includes(agent.template.specialization.toLowerCase())) {
                score += 8;
            }

            // Prefer agents with fewer completed tasks (load balancing)
            score -= agent.tasksCompleted * 0.5;

            return { agent, score };
        });

        // Sort by score and return best match
        scores.sort((a, b) => b.score - a.score);
        return scores[0]?.score > 0 ? scores[0].agent : agents[0];
    }

    /**
     * Notify about conflicts
     */
    private notifyConflict(message: string) {
        vscode.window.showWarningMessage(`⚠️ Conductor Alert: ${message}`);
        this.outputChannel.appendLine(`⚠️ CONFLICT: ${message}`);
    }

    /**
     * Get current system status
     */
    public getStatus(): string {
        const agents = this.agentManager.getActiveAgents();
        const idle = agents.filter(a => a.status === 'idle').length;
        const working = agents.filter(a => a.status === 'working').length;
        const tasks = this.taskQueue.getTasks();
        const queued = tasks.filter(t => t.status === 'queued').length;

        return `System Status:
- Agents: ${agents.length} total (${idle} idle, ${working} working)
- Tasks: ${tasks.length} total (${queued} queued)`;
    }

    /**
     * Log current status to output channel
     */
    private logStatus() {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${this.getStatus()}`);
    }

    /**
     * Spawn recommended agents for a project type
     */
    public async spawnRecommendedTeam(projectType: string) {
        this.outputChannel.appendLine(`🚀 Spawning recommended team for ${projectType} project`);

        // Logic to spawn appropriate agents based on project type
        // This would use the agent templates
    }

    dispose() {
        this.terminal?.dispose();
        this.outputChannel.dispose();
    }
}
