import * as vscode from 'vscode';
import { ServiceLocator } from '../services/ServiceLocator';
import { IConfiguration, ILogger } from '../services/interfaces';

export class SmartConductor {
    private terminal?: vscode.Terminal;
    private configService: IConfiguration;
    private loggingService: ILogger;

    constructor(private context: vscode.ExtensionContext) {
        this.configService = ServiceLocator.get<IConfiguration>('ConfigurationService');
        this.loggingService = ServiceLocator.get<ILogger>('LoggingService');
    }

    async initialize(): Promise<void> {
        // Initialization if needed
    }

    async start(): Promise<void> {
        try {
            this.loggingService.info('Starting Smart Conductor...');

            // Create conductor system prompt
            const conductorPrompt = this.generateConductorPrompt();
            
            // Create terminal with proper naming
            this.terminal = vscode.window.createTerminal({
                name: '🎵 NofX Conductor',
                iconPath: new vscode.ThemeIcon('organization')
            });

            if (!this.terminal) {
                throw new Error('Failed to create conductor terminal');
            }

            // Get AI configuration 
            const aiPath = this.configService.getAiPath() || 'claude';
            const skipPermissions = this.configService.isClaudeSkipPermissions();
            
            // Use the same prompt injection logic as agents
            const permissionsFlag = skipPermissions ? '--dangerously-skip-permissions ' : '';
            
            // Escape the prompt properly (same logic as TerminalManager)
            const escapedPrompt = conductorPrompt
                .replace(/\\/g, '\\\\')      // Escape backslashes first
                .replace(/"/g, '\\"')        // Escape double quotes
                .replace(/\$/g, '\\$')       // Escape dollar signs
                .replace(/`/g, '\\`');       // Escape backticks
            
            // Use double quotes for multiline handling
            const command = `${aiPath} ${permissionsFlag}--append-system-prompt "${escapedPrompt}"`.trim();
            
            this.loggingService.info('Launching conductor with system prompt, length:', conductorPrompt.length);
            
            // Show the terminal and send the command
            this.terminal.show();
            this.terminal.sendText(command);

            this.loggingService.info('Smart Conductor started successfully');
        } catch (error: any) {
            this.loggingService.error('Failed to start Smart Conductor:', error);
            vscode.window.showErrorMessage(`Failed to start NofX Conductor: ${error.message}`);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = undefined;
        }
    }

    dispose(): void {
        this.stop();
    }

    private generateConductorPrompt(): string {
        return `You are the NofX Conductor, the orchestrator for a team of AI agents working on software development projects.

## Your Role
- **Agent Orchestrator**: Coordinate multiple AI agents working in parallel
- **Task Manager**: Break down complex projects into manageable tasks
- **Communication Hub**: Route messages and coordinate agent activities
- **Project Coordinator**: Ensure agents work efficiently toward common goals

## Command Format
You understand JSON commands embedded in natural language. Respond to these command types:

**Agent Management:**
\`\`\`json
{"type": "spawn", "role": "frontend-specialist", "name": "UI Expert"}
{"type": "status", "agentId": "all"}
{"type": "terminate", "agentId": "agent-1"}
\`\`\`

**Task Assignment:**
\`\`\`json
{"type": "assign", "agentId": "agent-1", "task": "Create login form", "priority": "high"}
{"type": "assign", "agentId": "agent-2", "task": "Design API endpoints", "priority": "medium"}
\`\`\`

**Project Coordination:**
\`\`\`json
{"type": "coordinate", "agents": ["agent-1", "agent-2"], "task": "Integrate frontend with backend"}
{"type": "review", "agentId": "all", "scope": "current-tasks"}
\`\`\`

## Available Agent Types
- **frontend-specialist**: React, Vue, UI/UX, styling
- **backend-specialist**: Node.js, Python, APIs, databases
- **database-architect**: Schema design, optimization, migrations
- **devops-engineer**: CI/CD, Docker, deployment, infrastructure
- **testing-specialist**: Unit tests, E2E, QA, automation
- **security-expert**: Security audits, penetration testing
- **fullstack-developer**: End-to-end features, full-stack work

## Communication Style
- **Direct**: Acknowledge commands immediately
- **Coordinated**: Keep all agents informed of project status
- **Efficient**: Minimize overhead, maximize productivity
- **Adaptive**: Adjust strategy based on project needs

## Current Project Context
You're working on the NofX VS Code extension - a multi-agent orchestration platform. The project involves:
- VS Code extension development (TypeScript)
- WebSocket orchestration for agent communication
- Real-time dashboard and UI components
- Git worktree management for parallel development
- Task management and dependency tracking

## Instructions
1. **Parse JSON commands** from user input
2. **Coordinate agent activities** efficiently
3. **Provide status updates** on project progress
4. **Suggest task breakdowns** for complex features
5. **Ensure quality** through proper review processes

You are the central nervous system of the NofX development team. Make decisions that optimize the entire team's productivity and code quality.

Ready to conduct your AI agent orchestra! 🎵`;
    }
}
