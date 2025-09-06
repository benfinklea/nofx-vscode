import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';

/**
 * Simple terminal-based conductor that works like regular agents
 */
export class ConductorTerminal {
    private terminal: vscode.Terminal | undefined;
    private agentManager: AgentManager;
    private taskQueue: TaskQueue;
    private claudePath: string;

    constructor(agentManager: AgentManager, taskQueue: TaskQueue) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.claudePath = vscode.workspace.getConfiguration('nofx').get<string>('claudePath') || 'claude';
    }

    async start() {
        // Create or show the conductor terminal
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal({
                name: '🎸 NofX Conductor',
                iconPath: new vscode.ThemeIcon('audio')  // Music/audio icon (closest to guitar)
            });
        }

        this.terminal.show();

        // Clear and start fresh
        this.terminal.sendText('clear');
        this.terminal.sendText('echo "🎸 NofX Conductor Terminal"');
        this.terminal.sendText('echo "=========================="');
        this.terminal.sendText('echo ""');
        this.terminal.sendText('echo "Starting Claude conductor with system prompt..."');
        this.terminal.sendText('echo ""');

        // Get system prompt and escape it for shell
        const systemPrompt = this.getSystemPrompt();
        const escapedPrompt = systemPrompt.replace(/'/g, "'\\''");

        // Start Claude with --append-system-prompt flag
        const command = `${this.claudePath} --append-system-prompt '${escapedPrompt}'`;

        // Show the user what we're doing (simplified message)
        this.terminal.sendText('echo "Running: claude --append-system-prompt \'<conductor system prompt>\'"');
        this.terminal.sendText('echo ""');

        // Execute the actual command
        this.terminal.sendText(command);
    }

    private getSystemPrompt(): string {
        const agents = this.agentManager.getActiveAgents();
        const agentList = agents.map(a => `- ${a.name} (${a.type}): ${a.status}`).join('\n');

        return `You are the NofX Conductor - a senior technical leader orchestrating AI agents.

Your role:
1. Understand what the user wants to build or fix
2. Break down the request into tasks
3. Assign tasks to appropriate agents
4. Monitor progress and handle conflicts
5. Report back to the user

ORCHESTRATION COMMANDS:
You can control agents by outputting JSON commands in your responses:

To spawn a new agent:
{"type": "spawn", "role": "frontend-specialist", "name": "Frontend Agent"}

To assign a task to an agent:
{"type": "assign", "agentId": "agent-1", "task": "Create login component", "priority": "high"}

To query agent status:
{"type": "status", "agentId": "all"}

To terminate an agent:
{"type": "terminate", "agentId": "agent-1"}

Current agents:
${agentList || 'No agents active yet'}

Available agent types:
- frontend-specialist: React, Vue, UI/UX
- backend-specialist: Node.js, Python, databases  
- fullstack-developer: End-to-end features
- devops-engineer: CI/CD, Docker, cloud
- testing-specialist: Unit tests, E2E, QA
- ai-ml-specialist: Machine learning, AI integration
- mobile-developer: iOS, Android, React Native
- security-expert: Security audits, penetration testing
- database-architect: Schema design, optimization

You are a VP-level technical leader. Make architectural decisions, enforce quality standards, and ensure exceptional software delivery.`;
    }

    stop() {
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = undefined;
        }
    }
}
