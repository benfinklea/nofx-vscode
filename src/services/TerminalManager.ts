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
        // Use provided terminal icon or fallback to type-based icon
        const terminalIcon = agentConfig.terminalIcon ?? (agentConfig.type === 'conductor' ? 'terminal' : 'robot');

        // Create a dedicated terminal for this agent
        const terminal = vscode.window.createTerminal({
            name: `${agentConfig.template?.icon || '🤖'} ${agentConfig.name}`,
            iconPath: new vscode.ThemeIcon(terminalIcon),
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
        if (!terminal) return;

        // Set up the agent's working environment
        if (workingDirectory) {
            terminal.sendText(`cd "${workingDirectory}"`);
        }

        // Show agent info
        terminal.sendText(`echo "🤖 Initializing ${agent.name} (${agent.type})"`);
        terminal.sendText(`echo "Agent ID: ${agent.id}"`);
        terminal.sendText('echo "Starting Claude with agent specialization..."');
        terminal.sendText('echo ""');

        // Start Claude with --append-system-prompt flag
        const claudePath = this.configService.getClaudePath();

        if (agent.template && agent.template.systemPrompt) {
            this.loggingService?.debug(`Starting ${agent.name} with system prompt`);
            // Combine the template prompt with team instructions
            const fullPrompt = agent.template.systemPrompt + '\n\nYou are part of a NofX.dev coding team. Please wait for further instructions. Don\'t do anything yet. Just wait.';
            // Handle platform-specific quoting
            const quotedPrompt = this.quotePromptForShell(fullPrompt);
            // Start Claude with the system prompt - quote the claudePath
            terminal.sendText(`"${claudePath}" --append-system-prompt ${quotedPrompt}`);
        } else {
            // No template, just basic prompt
            const basicPrompt = 'You are a general purpose agent, part of a NofX.dev coding team. Please wait for instructions.';
            const quotedPrompt = this.quotePromptForShell(basicPrompt);
            terminal.sendText(`"${claudePath}" --append-system-prompt ${quotedPrompt}`);
        }

        // Show terminal if configured to do so
        if (this.configService.isShowAgentTerminalOnSpawn()) {
            terminal.show();
        }
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
