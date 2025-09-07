import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';

export class ConductorChat {
    private terminal: vscode.Terminal | undefined;
    private agentManager: AgentManager;
    private taskQueue: TaskQueue;
    private aiPath: string;

    constructor(agentManager: AgentManager, taskQueue: TaskQueue) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.aiPath = vscode.workspace.getConfiguration('nofx').get<string>('aiPath') || 'claude';
    }

    async start() {
        // Create or show conductor terminal
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal({
                name: '🎼 NofX Conductor',
                iconPath: new vscode.ThemeIcon('comment-discussion')
            });
        }

        this.terminal.show();

        // Clear and set up the terminal
        this.terminal.sendText('clear');
        this.terminal.sendText('echo "🎸 NofX Conductor Starting..."');
        this.terminal.sendText('echo "================================================"');
        this.terminal.sendText('echo "I am your conductor. Tell me what you want to build."');
        this.terminal.sendText('echo "I will manage the agents and delegate tasks automatically."');
        this.terminal.sendText('echo "================================================"');
        this.terminal.sendText('echo ""');

        // Start Claude with the conductor system prompt using --append-system-prompt
        const conductorPrompt = this.getConductorSystemPrompt();
        const escapedPrompt = conductorPrompt.replace(/'/g, "'\\''"); // Escape single quotes for shell

        // Start Claude in conductor mode with system prompt
        this.terminal.sendText(`${this.aiPath} --append-system-prompt '${escapedPrompt}'`);

        // Send the initial greeting after Claude starts
        setTimeout(() => {
            if (this.terminal) {
                this.terminal.sendText(
                    'Hello! I am the NofX Conductor. I manage a team of specialized AI agents. Tell me what you want to build or fix, and I will orchestrate the agents to complete your request. What would you like to work on today?'
                );
            }
        }, 2000);

        vscode.window
            .showInformationMessage(
                '🎼 Conductor is ready! Chat with the conductor to manage your development team.',
                'View Conductor'
            )
            .then(selection => {
                if (selection === 'View Conductor') {
                    this.terminal?.show();
                }
            });
    }

    private getConductorSystemPrompt(): string {
        const agents = this.agentManager.getActiveAgents();
        const agentList = agents.map(a => `- ${a.name} (${a.type}): ${a.status}`).join('\n');

        return `You are the NofX Conductor, an orchestration AI that manages a team of specialized agents.

Your role:
1. Understand what the user wants to build or fix
2. Break down complex requests into tasks
3. Delegate tasks to appropriate agents
4. Monitor progress and report back to the user
5. Coordinate between agents when needed

Current team:
${agentList || 'No agents active yet. I can spawn agents as needed.'}

Available agent types:
- Frontend Specialist (React, Vue, UI/UX)
- Backend Specialist (Node.js, APIs, databases)
- DevOps Engineer (Docker, CI/CD, infrastructure)
- Testing Specialist (unit tests, integration tests)
- Documentation Writer (README, API docs, comments)
- AI/ML Engineer (machine learning, data processing)

When the user gives you a request:
1. Acknowledge and understand the request
2. Identify which agents are needed
3. Break down the work into specific tasks
4. Explain your plan to the user
5. Say: "I'll now delegate these tasks to the agents..."

Remember: You are the conductor. The user talks to you, and you manage everything else. Be conversational, helpful, and proactive in managing the development team.`;
    }

    dispose() {
        this.terminal?.dispose();
    }
}
