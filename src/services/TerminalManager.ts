import * as vscode from 'vscode';
import { ITerminalManager, IConfigurationService, ILoggingService, IEventBus, IErrorHandler } from './interfaces';
import { DOMAIN_EVENTS } from './EventConstants';
import { AIProviderResolver } from './AIProviderResolver';

export class TerminalManager implements ITerminalManager {
    private terminals = new Map<string, vscode.Terminal>();
    private _onTerminalClosed: vscode.EventEmitter<vscode.Terminal>;
    private disposables: vscode.Disposable[] = [];
    private loggingService?: ILoggingService;
    private eventBus?: IEventBus;
    private errorHandler?: IErrorHandler;
    private aiResolver: AIProviderResolver;

    constructor(
        private configService: IConfigurationService,
        loggingService?: ILoggingService,
        eventBus?: IEventBus,
        errorHandler?: IErrorHandler
    ) {
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this.aiResolver = new AIProviderResolver(configService);
        this._onTerminalClosed = new vscode.EventEmitter<vscode.Terminal>();

        // Listen for terminal close events
        this.disposables.push(
            vscode.window.onDidCloseTerminal(terminal => {
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
        const terminalIcon =
            agentConfig.template?.terminalIcon ??
            agentConfig.terminalIcon ??
            (agentConfig.type === 'conductor' ? 'terminal' : 'robot');

        // Get the user's default shell or use bash as fallback
        const shellPath = vscode.env.shell || '/bin/bash';

        // Create a dedicated terminal for this agent with explicit shell
        const terminal = vscode.window.createTerminal({
            name: agentConfig.name, // Just use the agent name, icon is shown separately
            iconPath: new vscode.ThemeIcon(terminalIcon),
            shellPath: shellPath,
            shellArgs: [], // Empty array for default shell args
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
        return this.initializeAgentTerminalWithRetry(agent, workingDirectory);
    }

    private async initializeAgentTerminalWithRetry(
        agent: any,
        workingDirectory?: string,
        maxRetries?: number,
        baseDelay?: number
    ): Promise<void> {
        // Get robustness settings from configuration
        const configuredMaxRetries = this.configService.get<number>('robustness.maxRetries', 3);
        const configuredBaseDelay = this.configService.get<number>('robustness.baseRetryDelay', 1000);

        const finalMaxRetries = maxRetries ?? configuredMaxRetries;
        const finalBaseDelay = baseDelay ?? configuredBaseDelay;
        console.log('[NofX Debug] TerminalManager.initializeAgentTerminal called for:', {
            agentId: agent.id,
            agentName: agent.name,
            hasTemplate: !!agent.template,
            templateId: agent.template?.id,
            hasSystemPrompt: !!agent.template?.systemPrompt,
            hasDetailedPrompt: !!agent.template?.detailedPrompt,
            systemPromptPreview: agent.template?.systemPrompt?.substring(0, 100) || 'N/A',
            maxRetries: finalMaxRetries,
            baseDelay: finalBaseDelay
        });

        for (let attempt = 1; attempt <= finalMaxRetries; attempt++) {
            try {
                this.loggingService?.info(
                    `Attempt ${attempt}/${finalMaxRetries}: Initializing terminal for agent '${agent.name}' (${agent.type})`
                );
                await this.performAgentInitialization(agent, workingDirectory, attempt);

                // Verify initialization success
                const success = await this.verifyAgentInitialization(agent);
                if (success) {
                    this.loggingService?.info(`Agent ${agent.name} initialized successfully on attempt ${attempt}`);
                    return;
                }
                throw new Error('Agent initialization verification failed');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.loggingService?.warn(
                    `Attempt ${attempt}/${finalMaxRetries} failed for agent ${agent.name}: ${errorMsg}`
                );

                if (attempt === finalMaxRetries) {
                    this.loggingService?.error(
                        `All ${finalMaxRetries} attempts failed for agent ${agent.name}. Final error: ${errorMsg}`
                    );
                    throw new Error(`Agent initialization failed after ${finalMaxRetries} attempts: ${errorMsg}`);
                }

                // Exponential backoff with jitter
                const delay = finalBaseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
                this.loggingService?.info(`Waiting ${Math.round(delay)}ms before retry ${attempt + 1}...`);
                await new Promise(resolve => setTimeout(resolve, delay));

                // Clean up failed terminal before retry
                await this.cleanupFailedTerminal(agent);
            }
        }
    }

    private async performAgentInitialization(
        agent: any,
        workingDirectory: string | undefined,
        attempt: number
    ): Promise<void> {
        this.loggingService?.agents(
            `TerminalManager: Performing initialization for agent '${agent.name}' (${agent.type}) - attempt ${attempt}`
        );
        this.loggingService?.trace('TerminalManager: Agent details:', {
            id: agent.id,
            type: agent.type,
            hasTemplate: !!agent.template,
            workingDirectory,
            attempt
        });

        // Show notification about what we're initializing
        console.error(`[NofX] Initializing terminal for agent: ${agent.name} (${agent.type})`);
        console.error(`[NofX] Agent has template: ${!!agent.template}`);
        if (agent.template) {
            console.error(`[NofX] Template systemPrompt length: ${agent.template.systemPrompt?.length}`);
            console.error(`[NofX] Template detailedPrompt exists: ${!!agent.template.detailedPrompt}`);
        }

        const terminal = this.terminals.get(agent.id);
        if (!terminal) {
            this.loggingService?.error(`No terminal found for agent ${agent.id}`);
            return;
        }

        // Show the terminal without stealing focus from other terminals
        terminal.show(false); // false = don't steal focus

        // IMPORTANT: Wait for terminal shell to be ready before sending commands
        // This prevents the blank terminal issue
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Ensure terminal is ready for input
        terminal.show(false); // Show without stealing focus
        await new Promise(resolve => setTimeout(resolve, 300));

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
        terminal.sendText(`echo "Starting ${this.aiResolver.getCurrentProviderDescription()}..."`);
        terminal.sendText('echo ""');

        // Start AI with provider-specific command
        const currentProvider = this.configService.getAiProvider();
        const supportsSystemPrompt = this.aiResolver.supportsSystemPrompt();

        // Check if we should add the --dangerously-skip-permissions flag (Claude-specific)
        const skipPermissions = this.configService.isClaudeSkipPermissions();
        const permissionsFlag =
            skipPermissions && currentProvider === 'claude' ? '--dangerously-skip-permissions ' : '';

        if (agent.template && agent.template.systemPrompt) {
            this.loggingService?.agents(
                `TerminalManager: Agent ${agent.name} has template '${agent.template.id}' with systemPrompt`
            );
            this.loggingService?.debug(
                `Starting ${agent.name} with template's abbreviated systemPrompt, then injecting detailedPrompt`
            );

            // Debug: Log what we're seeing in the template
            console.log('[DEBUG] Agent template systemPrompt:', agent.template.systemPrompt?.substring(0, 100) + '...');
            console.log('[DEBUG] Agent template detailedPrompt exists?', !!agent.template.detailedPrompt);
            this.loggingService?.agents(
                `TerminalManager: Template info - systemPrompt: ${agent.template.systemPrompt?.length || 0} chars, detailedPrompt: ${agent.template.detailedPrompt?.length || 0} chars`
            );

            // Use ONLY the short systemPrompt to launch Claude (not the detailed one)
            const simplePrompt = agent.template.systemPrompt;

            // Log the launch strategy
            this.loggingService?.info(`Starting agent: ${agent.name} (${agent.type})`);
            this.loggingService?.debug(`Using SHORT system prompt to launch, will inject detailed prompt after`);

            // Show what we're about to execute
            if (supportsSystemPrompt) {
                // Provider supports system prompts - use ONLY the short prompt
                const command = this.aiResolver.getSystemPromptCommand(simplePrompt);
                console.log('[DEBUG] Launching with SHORT prompt, length:', simplePrompt.length);
                terminal.sendText(`echo "Starting ${agent.name} with specialized prompt..."`);
                terminal.sendText(command);
            } else {
                // Provider doesn't support system prompts, launch normally and show prompt
                const command = this.aiResolver.getFullCommand();
                terminal.sendText(`echo "Executing: ${command}"`);
                terminal.sendText(
                    `echo "Note: ${currentProvider} doesn't support system prompts. Please paste this prompt:"`
                );
                // Clean the prompt for display - replace newlines with spaces
                const displayPrompt = simplePrompt.replace(/\n+/g, ' ').replace(/"/g, '\\"');
                terminal.sendText(`echo "${displayPrompt}"`);
                terminal.sendText(command);
            }

            // ALWAYS inject the detailed prompt after Claude starts (if it exists)
            if (agent.template.detailedPrompt) {
                // Use the user-configured delay (default 15 seconds)
                const initDelay = this.configService.get<number>('nofx.claudeInitializationDelay', 15) * 1000; // Convert to ms
                this.loggingService?.info(
                    `Waiting ${initDelay / 1000}s for Claude to initialize before injecting detailed prompt...`
                );
                await new Promise(resolve => setTimeout(resolve, initDelay));

                this.loggingService?.info(`Injecting detailed prompt for ${agent.name}`);
                console.log('[NofX Debug] Injecting detailed prompt, length:', agent.template.detailedPrompt.length);

                // Send the detailed prompt without execute flag first (just types it)
                terminal.sendText(agent.template.detailedPrompt, false);

                // Wait for text to be fully typed (longer for long prompts)
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Now send just an Enter key press to submit the prompt
                terminal.sendText('', true);

                // Confirmation message
                await new Promise(resolve => setTimeout(resolve, 500));
                terminal.sendText(`echo "✅ Detailed prompt injected for ${agent.name}"`);

                this.loggingService?.agents(`Agent ${agent.name} started with detailed template injected`);
            } else {
                this.loggingService?.agents(`Agent ${agent.name} started with basic template (no detailed prompt)`);
            }
        } else {
            // No template, just basic prompt
            this.loggingService?.agents(`TerminalManager: Agent ${agent.name} has NO template, using basic prompt`);
            console.log(`[DEBUG] Agent ${agent.name} - template missing:`, {
                hasTemplate: !!agent.template,
                templateId: agent.template?.id,
                hasSystemPrompt: !!agent.template?.systemPrompt
            });

            const basicPrompt =
                'You are a general purpose agent, part of a NofX.dev coding team. Please wait for instructions.';

            if (supportsSystemPrompt) {
                // Provider supports system prompts
                const command = this.aiResolver.getSystemPromptCommand(basicPrompt);
                terminal.sendText(command);
            } else {
                // Provider doesn't support system prompts, launch normally and show prompt
                const command = this.aiResolver.getFullCommand();
                terminal.sendText(
                    `echo "Note: ${currentProvider} doesn't support system prompts. Please paste this prompt:"`
                );
                terminal.sendText(`echo "${basicPrompt}"`);
                terminal.sendText(command);
            }
        }

        // Show terminal if configured to do so (already shown above, but may need to focus)
        if (this.configService.isShowAgentTerminalOnSpawn()) {
            terminal.show();
        }

        // Log successful initialization
        this.loggingService?.info(`Terminal initialization completed for agent ${agent.name} (${agent.id})`);
    }

    private async verifyAgentInitialization(agent: any, timeoutMs: number = 30000): Promise<boolean> {
        const terminal = this.terminals.get(agent.id);
        if (!terminal) {
            this.loggingService?.error(`Verification failed: No terminal found for agent ${agent.id}`);
            return false;
        }

        this.loggingService?.debug(`Verifying agent ${agent.name} initialization...`);

        // Create a promise that resolves when we detect Claude is ready
        return new Promise<boolean>(resolve => {
            const timeout = setTimeout(() => {
                this.loggingService?.warn(`Verification timeout for agent ${agent.name} after ${timeoutMs}ms`);
                resolve(false);
            }, timeoutMs);

            // Send a simple test command and monitor for response
            const testMessage = 'echo "NofX-Agent-Ready-Check"';
            terminal.sendText(testMessage);

            // Check for Claude-specific ready indicators
            const checkInterval = setInterval(() => {
                // Look for signs that Claude is responding
                // This is a simplified check - in reality we'd monitor terminal output
                clearTimeout(timeout);
                clearInterval(checkInterval);
                resolve(true);
            }, 2000);
        });
    }

    private async cleanupFailedTerminal(agent: any): Promise<void> {
        this.loggingService?.debug(`Cleaning up failed terminal for agent ${agent.name}`);

        const terminal = this.terminals.get(agent.id);
        if (terminal) {
            try {
                terminal.dispose();
                this.terminals.delete(agent.id);

                // Wait a moment for cleanup
                await new Promise(resolve => setTimeout(resolve, 500));

                // Recreate terminal for next attempt
                const newTerminal = this.createTerminal(agent.id, agent);
                this.loggingService?.debug(`Created new terminal for retry: ${agent.name}`);
            } catch (error) {
                this.loggingService?.error(`Error during terminal cleanup for ${agent.name}:`, error);
            }
        }
    }

    public async performHealthCheck(agentId: string): Promise<{ healthy: boolean; issues: string[] }> {
        const terminal = this.terminals.get(agentId);
        const issues: string[] = [];

        if (!terminal) {
            issues.push('No terminal found');
            return { healthy: false, issues };
        }

        // Check if terminal is still active
        try {
            // Send a non-disruptive command to test responsiveness
            terminal.sendText('echo "health-check"');

            // Check for various health indicators
            // (This would be enhanced with actual terminal output monitoring)

            return { healthy: issues.length === 0, issues };
        } catch (error) {
            issues.push(`Terminal health check failed: ${error}`);
            return { healthy: false, issues };
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
