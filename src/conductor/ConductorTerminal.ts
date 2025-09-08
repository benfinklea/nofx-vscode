import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { TaskToolBridge, SubAgentType } from '../services/TaskToolBridge';
import { Container } from '../services/Container';
import { SERVICE_TOKENS, IConfigurationService, ILoggingService, IEventBus } from '../services/interfaces';
import { NaturalLanguageService } from '../services/NaturalLanguageService';
import { TerminalCommandRouter } from '../services/TerminalCommandRouter';
import { AgentNotificationService } from '../services/AgentNotificationService';

/**
 * Simple terminal-based conductor that works like regular agents
 */
export class ConductorTerminal {
    private terminal: vscode.Terminal | undefined;
    private agentManager: AgentManager;
    private taskQueue: TaskQueue;
    private taskToolBridge?: TaskToolBridge;
    private aiPath: string;
    private naturalLanguageService?: NaturalLanguageService;
    private commandRouter?: TerminalCommandRouter;
    private notificationService?: AgentNotificationService;
    private inputListener?: vscode.Disposable;
    private loggingService?: ILoggingService;

    constructor(
        agentManager: AgentManager, 
        taskQueue: TaskQueue, 
        taskToolBridge?: TaskToolBridge,
        loggingService?: ILoggingService,
        eventBus?: IEventBus,
        notificationService?: AgentNotificationService
    ) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.taskToolBridge = taskToolBridge;
        this.loggingService = loggingService;
        this.aiPath = vscode.workspace.getConfiguration('nofx').get<string>('aiPath') || 'claude';
        this.notificationService = notificationService;
        
        // Initialize natural language service
        this.naturalLanguageService = new NaturalLanguageService(loggingService);
        
        // Initialize command router
        this.commandRouter = new TerminalCommandRouter(
            agentManager,
            taskQueue,
            loggingService,
            eventBus
        );
    }

    async start() {
        // Create or show the conductor terminal
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal({
                name: '🎸 NofX Conductor',
                iconPath: new vscode.ThemeIcon('audio') // Music/audio icon (closest to guitar)
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
        const command = `${this.aiPath} --append-system-prompt '${escapedPrompt}'`;

        // Show the user what we're doing (simplified message)
        this.terminal.sendText('echo "Running: claude --append-system-prompt \'<conductor system prompt>\'"');
        this.terminal.sendText('echo ""');

        // Execute the actual command
        this.terminal.sendText(command);

        // Wait for AI to initialize using configurable delay
        const container = Container.getInstance();
        const configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
        const initDelay = configService.getClaudeInitializationDelay() * 1000; // Convert to milliseconds
        await new Promise(resolve => setTimeout(resolve, initDelay));

        // Send initial greeting after AI is ready
        const greeting = `Welcome! I am the NofX Conductor. I can orchestrate your AI agents to build software collaboratively.

Tell me what you want to build, and I'll coordinate the team to make it happen.`;
        // Send the greeting text first
        this.terminal.sendText(greeting, false); // false = no newline yet
        
        // Small delay to ensure the text is in the terminal
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Now send Enter to submit it
        this.terminal.sendText('', true); // Send empty string with Enter to submit
        
        // Start monitoring terminal output for commands with error handling
        if (this.commandRouter && this.terminal) {
            try {
                this.commandRouter.startMonitoring(this.terminal);
            } catch (error) {
                this.loggingService?.error('Failed to start command monitoring:', error);
                // Continue anyway - conductor can still function without auto-execution
            }
        }
        
        // Show natural language help
        setTimeout(() => {
            if (this.terminal) {
                this.terminal.sendText('\n# Quick tip: You can use natural language commands like:');
                this.terminal.sendText('# • "add a frontend dev"');
                this.terminal.sendText('# • "what\'s everyone doing?"');
                this.terminal.sendText('# • "assign login form to agent-1"');
                this.terminal.sendText('# Or use JSON: {"type": "spawn", "role": "frontend-specialist"}\n');
            }
        }, 2000);
        
        // Update system status bar
        if (this.notificationService) {
            this.notificationService.updateSystemStatus(
                this.agentManager.getActiveAgents().length,
                this.taskQueue.getAllTasks().length,
                0,
                'healthy'
            );
        }
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

SUB-AGENT COMMANDS:
Agents can spawn sub-agents for parallel task execution:

To spawn a sub-agent from an agent:
{"type": "spawn_sub_agent", "parentAgentId": "agent-1", "subAgentType": "general-purpose", "description": "Research API patterns", "prompt": "Find best REST API patterns..."}

To check sub-agent status:
{"type": "sub_agent_status", "parentAgentId": "agent-1"}

To cancel a sub-agent:
{"type": "cancel_sub_agent", "parentAgentId": "agent-1", "taskId": "task-123"}

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

You are a VP-level technical leader. Make architectural decisions, enforce quality standards, and ensure exceptional software delivery.

SUB-AGENT ORCHESTRATION:
Agents can spawn sub-agents for parallel task execution. Monitor sub-agent progress and ensure efficient task delegation.
Available sub-agent types: general-purpose, code-lead-reviewer
Max concurrent sub-agents per agent: 3
Total system limit: 10 concurrent sub-agents`;
    }

    stop() {
        // Stop monitoring
        if (this.commandRouter) {
            this.commandRouter.stopMonitoring();
        }
        
        // Dispose input listener
        if (this.inputListener) {
            this.inputListener.dispose();
            this.inputListener = undefined;
        }
        
        // Dispose terminal
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = undefined;
        }
        
        // Reset status bar
        if (this.notificationService) {
            this.notificationService.resetSystemMetrics();
        }
    }
}
