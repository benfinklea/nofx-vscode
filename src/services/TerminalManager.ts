import * as vscode from 'vscode';
import { ITerminalManager, IConfigurationService, ILoggingService, IEventBus, IErrorHandler } from './interfaces';
import { DOMAIN_EVENTS } from './EventConstants';

export class TerminalManager implements ITerminalManager {
    private terminals = new Map<string, vscode.Terminal>();
    private _onTerminalClosed: vscode.EventEmitter<vscode.Terminal>;
    private disposables: vscode.Disposable[] = [];
    private loggingService?: ILoggingService;
    private eventBus?: IEventBus;
    private errorHandler?: IErrorHandler;

    constructor(
        private configService: IConfigurationService,
        loggingService?: ILoggingService,
        eventBus?: IEventBus,
        errorHandler?: IErrorHandler
    ) {
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this._onTerminalClosed = new vscode.EventEmitter<vscode.Terminal>();

        // Listen for terminal close events
        this.disposables.push(
            vscode.window.onDidCloseTerminal((terminal) => {
                // Check if this is one of our agent terminals
                for (const [agentId, agentTerminal] of this.terminals.entries()) {
                    if (agentTerminal === terminal) {
                        this.terminals.delete(agentId);
                        this._onTerminalClosed.fire(terminal);

                        // Publish event to EventBus
                        if (this.eventBus) {
                            this.eventBus.publish(DOMAIN_EVENTS.TERMINAL_CLOSED, { agentId, terminal });
                        }

                        this.loggingService?.debug(`Terminal closed for agent ${agentId}`);
                        break;
                    }
                }
            })
        );
    }

    get onTerminalClosed(): vscode.Event<vscode.Terminal> {
        return this._onTerminalClosed.event;
    }

    createTerminal(agentId: string, agentConfig: any): vscode.Terminal {
        // Use terminal icon from template, config, or fallback
        const terminalIcon = agentConfig.template?.terminalIcon ??
                            agentConfig.terminalIcon ??
                            (agentConfig.type === 'conductor' ? 'terminal' : 'robot');

        // Get the user's default shell or use bash as fallback
        const shellPath = vscode.env.shell || '/bin/bash';

        // Create a dedicated terminal for this agent with explicit shell
        const terminal = vscode.window.createTerminal({
            name: `${agentConfig.template?.icon || '🤖'} ${agentConfig.name}`,
            iconPath: new vscode.ThemeIcon(terminalIcon),
            shellPath: shellPath,
            shellArgs: [],  // Empty array for default shell args
            env: {
                NOFX_AGENT_ID: agentId,
                NOFX_AGENT_TYPE: agentConfig.type,
                NOFX_AGENT_NAME: agentConfig.name
            }
        });

        this.terminals.set(agentId, terminal);

        // Publish event to EventBus
        if (this.eventBus) {
            this.eventBus.publish(DOMAIN_EVENTS.TERMINAL_CREATED, { agentId, terminal, agentConfig });
        }

        this.loggingService?.debug(`Terminal created for agent ${agentId}`);
        return terminal;
    }

    getTerminal(agentId: string): vscode.Terminal | undefined {
        return this.terminals.get(agentId);
    }

    disposeTerminal(agentId: string): void {
        const terminal = this.terminals.get(agentId);
        if (terminal) {
            terminal.dispose();
            this.terminals.delete(agentId);

            // Publish event to EventBus
            if (this.eventBus) {
                this.eventBus.publish(DOMAIN_EVENTS.TERMINAL_DISPOSED, { agentId, terminal });
            }

            this.loggingService?.debug(`Terminal disposed for agent ${agentId}`);
        }
    }

    async initializeAgentTerminal(agent: any, workingDirectory?: string): Promise<void> {
        const terminal = this.terminals.get(agent.id);
        if (!terminal) {
            this.loggingService?.error(`No terminal found for agent ${agent.id}`);
            return;
        }

        // Show and focus the terminal to ensure it's active and receives commands
        terminal.show(true); // true = preserveFocus, keeps focus on the terminal

        // IMPORTANT: Wait for terminal shell to be ready before sending commands
        // This prevents the blank terminal issue
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify terminal is still active
        if (vscode.window.activeTerminal !== terminal) {
            this.loggingService?.warn(`Terminal for agent ${agent.id} is not active, attempting to refocus`);
            terminal.show(true);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Send an initial newline to ensure the shell is responsive
        terminal.sendText('');

        // Small additional delay
        await new Promise(resolve => setTimeout(resolve, 200));

        // Set up the agent's working environment
        if (workingDirectory) {
            terminal.sendText(`cd "${workingDirectory}"`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Show agent info
        terminal.sendText(`echo "🤖 Initializing ${agent.name} (${agent.type})"`);
        terminal.sendText(`echo "Agent ID: ${agent.id}"`);
        terminal.sendText('echo "Starting Claude with agent specialization..."');
        terminal.sendText('echo ""');

        // Start Claude with --append-system-prompt flag
        const claudePath = this.configService.getClaudePath();

        // Check if we should add the --dangerously-skip-permissions flag
        const skipPermissions = this.configService.isClaudeSkipPermissions();
        const permissionsFlag = skipPermissions ? '--dangerously-skip-permissions ' : '';

        if (agent.template && agent.template.systemPrompt) {
            this.loggingService?.debug(`Starting ${agent.name} with system prompt`);

            // For complex agents with templates, use a simplified prompt
            // The full prompt is too long for terminal.sendText() to handle reliably
            // Clean up the type name (remove hyphens, make it readable)
            const cleanType = agent.type.replace(/-/g, ' ').replace(/specialist/g, 'expert');
            const simplePrompt = `You are ${agent.name}. You are an expert in ${cleanType}. You are part of a NofX.dev coding team. Please wait for instructions.`;

            // Escape the prompt for shell
            const escapedPrompt = this.quotePromptForShell(simplePrompt);

            // Log the full command for debugging
            this.loggingService?.info(`Starting agent: ${agent.name} (${agent.type})`);
            this.loggingService?.debug(`Claude command: ${claudePath} ${permissionsFlag}--append-system-prompt ${escapedPrompt}`);

            // Show what we're about to execute
            terminal.sendText(`echo "Executing: claude ${permissionsFlag}--append-system-prompt '...'"`);

            // Send the command with optional permissions flag
            terminal.sendText(`${claudePath} ${permissionsFlag}--append-system-prompt ${escapedPrompt}`);
        } else {
            // No template, just basic prompt
            const basicPrompt = 'You are a general purpose agent, part of a NofX.dev coding team. Please wait for instructions.';
            // For simple prompts without newlines, we can use direct quoting
            const quotedPrompt = this.quotePromptForShell(basicPrompt);
            terminal.sendText(`${claudePath} ${permissionsFlag}--append-system-prompt ${quotedPrompt}`);
        }

        // Show terminal if configured to do so (already shown above, but may need to focus)
        if (this.configService.isShowAgentTerminalOnSpawn()) {
            terminal.show();
        }

        // Log successful initialization
        this.loggingService?.info(`Terminal initialized for agent ${agent.name} (${agent.id})`);
    }

    createEphemeralTerminal(name: string): vscode.Terminal {
        return vscode.window.createTerminal(name);
    }

    private quotePromptForShell(prompt: string): string {
        const platform = process.platform;
        const shell = vscode.env.shell;

        // Detect Windows shells
        const isWindows = platform === 'win32';
        const isPowerShell = shell?.includes('powershell') || shell?.includes('pwsh');
        const isCmd = shell?.includes('cmd.exe');

        if (isWindows) {
            if (isPowerShell) {
                // PowerShell: Use double quotes and escape internal double quotes
                const escaped = prompt.replace(/"/g, '""');
                return `"${escaped}"`;
            } else if (isCmd) {
                // CMD: Use double quotes and escape internal double quotes
                const escaped = prompt.replace(/"/g, '\\"');
                return `"${escaped}"`;
            } else {
                // Fallback for other Windows shells
                const escaped = prompt.replace(/"/g, '\\"');
                return `"${escaped}"`;
            }
        } else {
            // POSIX shells (bash, zsh, etc.): Use single quotes and escape internal single quotes
            const escaped = prompt.replace(/'/g, "'\\''");
            return `'${escaped}'`;
        }
    }

    dispose(): void {
        // Dispose all terminals
        for (const terminal of this.terminals.values()) {
            terminal.dispose();
        }
        this.terminals.clear();

        // Dispose event emitters and listeners
        this._onTerminalClosed.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
