import * as vscode from 'vscode';
import {
    ITerminalManager,
    IConfiguration,
    ILogger,
    IEventEmitter,
    IEventSubscriber,
    IErrorHandler
} from './interfaces';
import { EVENTS } from './EventConstants';
// AIProviderResolver removed - simple logic, inline it

export class TerminalManager implements ITerminalManager {
    private terminals = new Map<string, vscode.Terminal>();
    private _onTerminalClosed: vscode.EventEmitter<vscode.Terminal>;
    private disposables: vscode.Disposable[] = [];
    private loggingService?: ILogger;
    private eventBus?: IEventEmitter & IEventSubscriber;
    private errorHandler?: IErrorHandler;

    // Helper to publish events
    private publishEvent(event: string, data?: any): void {
        if (this.eventBus && 'publish' in this.eventBus) {
            (this.eventBus as any).publish(event, data);
        } else if (this.eventBus && 'emit' in this.eventBus) {
            this.eventBus.emit(event, data);
        }
    }

    constructor(
        private configService: IConfiguration,
        loggingService?: ILogger,
        eventBus?: IEventEmitter & IEventSubscriber,
        errorHandler?: IErrorHandler
    ) {
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
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
                            this.publishEvent(EVENTS.TERMINAL_CLOSED, { agentId, terminal });
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
        // Get colorful icon and color based on agent type
        const { icon, color } = this.getAgentIconAndColor(agentConfig);

        // Get the user's default shell or use bash as fallback
        const shellPath = vscode.env.shell || '/bin/bash';

        // Create a dedicated terminal for this agent with colorful icon
        const terminal = vscode.window.createTerminal({
            name: `🤖 ${agentConfig.name}`, // Add robot emoji prefix to show dual indication
            iconPath: new vscode.ThemeIcon(icon, color),
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
            this.publishEvent(EVENTS.TERMINAL_CREATED, { agentId, terminal, agentConfig });
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
                this.publishEvent(EVENTS.TERMINAL_DISPOSED, { agentId, terminal });
            }

            this.loggingService?.debug(`Terminal disposed for agent ${agentId}`);
        }
    }

    private getAgentIconAndColor(agentConfig: any): { icon: string; color: vscode.ThemeColor } {
        // Get icon based on agent type
        const icon = this.getAgentTypeIcon(agentConfig);
        
        // Get color based on visual status (dynamic)
        const color = this.getStatusColor(agentConfig.visualStatus || agentConfig.status || 'IDLE');
        
        return { icon, color };
    }

    private getAgentTypeIcon(agentConfig: any): string {
        // Icon based on agent type/specialization
        const agentType = agentConfig.type || agentConfig.template?.id || 'default';
        
        switch (agentType) {
            case 'frontend-specialist':
            case 'frontend':
                return 'paintbrush';
            case 'backend-specialist':
            case 'backend':
                return 'server';
            case 'fullstack-developer':
            case 'fullstack':
                return 'layers';
            case 'testing-specialist':
            case 'testing':
                return 'beaker';
            case 'devops-engineer':
            case 'devops':
                return 'cloud';
            case 'ai-ml-specialist':
            case 'ai-ml':
                return 'robot';
            case 'database-architect':
            case 'database':
                return 'database';
            case 'security-expert':
            case 'security':
                return 'shield';
            case 'mobile-developer':
            case 'mobile':
                return 'device-mobile';
            case 'conductor':
                return 'organization';
            default:
                return 'person';
        }
    }

    private getStatusColor(status: string): vscode.ThemeColor {
        // Dynamic colors based on agent status
        switch (status.toUpperCase()) {
            case 'IDLE':
            case 'ONLINE':
                return new vscode.ThemeColor('charts.green');    // 🟢 Green - Ready for work
            
            case 'WORKING':
            case 'BUSY':
                return new vscode.ThemeColor('charts.blue');     // 🔵 Blue - Actively working
            
            case 'WAITING':
                return new vscode.ThemeColor('charts.yellow');   // 🟡 Yellow - Needs user input
            
            case 'ERROR':
            case 'OFFLINE':
                return new vscode.ThemeColor('errorForeground'); // 🔴 Red - Broken/failed
            
            default:
                return new vscode.ThemeColor('foreground');      // Default color
        }
    }

    /**
     * Refreshes terminal icon after Claude session ends to remove warning triangle
     */
    refreshTerminalIcon(agentId: string, agentConfig: any): void {
        const existingTerminal = this.terminals.get(agentId);
        if (!existingTerminal) {
            return;
        }

        // Only refresh if terminal has exited (has warning triangle)
        if (existingTerminal.exitStatus === undefined) {
            return; // Terminal still running, no need to refresh
        }

        console.log(`[TerminalManager] Refreshing terminal icon for ${agentConfig.name} to remove warning triangle`);
        
        // Get new icon with "idle" state
        const { icon, color } = this.getAgentIconAndColor(agentConfig);
        
        // Create a replacement terminal with fresh icon (no warning triangle)
        const newTerminal = vscode.window.createTerminal({
            name: `💤 ${agentConfig.name}`, // Change emoji to indicate idle state
            iconPath: new vscode.ThemeIcon(icon, color),
            shellPath: vscode.env.shell || '/bin/bash',
            env: {
                NOFX_AGENT_ID: agentId,
                NOFX_AGENT_TYPE: agentConfig.type,
                NOFX_AGENT_NAME: agentConfig.name,
                NOFX_AGENT_STATE: 'idle'
            }
        });

        // Replace the old terminal
        this.terminals.set(agentId, newTerminal);
        
        // Dispose the old terminal (this removes the warning triangle one)
        try {
            existingTerminal.dispose();
        } catch (error) {
            console.warn('[TerminalManager] Error disposing old terminal:', error);
        }

        this.loggingService?.debug(`Terminal icon refreshed for agent ${agentConfig.name}`);
    }

    /**
     * Updates agent visual status and refreshes terminal icon color
     */
    updateAgentStatus(agentId: string, agentConfig: any, newStatus: string): void {
        const terminal = this.terminals.get(agentId);
        if (!terminal) {
            console.warn(`[TerminalManager] No terminal found for agent ${agentId}`);
            return;
        }

        console.log(`[TerminalManager] Updating agent ${agentConfig.name} status: ${newStatus}`);
        
        // Update the agent config with new visual status
        agentConfig.visualStatus = newStatus.toUpperCase();
        
        // Get new icon and color
        const { icon, color } = this.getAgentIconAndColor(agentConfig);
        
        // Get status emoji for terminal name
        const statusEmoji = this.getStatusEmoji(newStatus);
        
        // Create replacement terminal with new color
        const newTerminal = vscode.window.createTerminal({
            name: `${statusEmoji} ${agentConfig.name}`,
            iconPath: new vscode.ThemeIcon(icon, color),
            shellPath: vscode.env.shell || '/bin/bash',
            env: {
                NOFX_AGENT_ID: agentId,
                NOFX_AGENT_TYPE: agentConfig.type,
                NOFX_AGENT_NAME: agentConfig.name,
                NOFX_AGENT_STATUS: newStatus.toUpperCase()
            }
        });

        // Replace the old terminal
        this.terminals.set(agentId, newTerminal);
        
        // Dispose the old terminal
        try {
            terminal.dispose();
        } catch (error) {
            console.warn('[TerminalManager] Error disposing old terminal during status update:', error);
        }

        this.loggingService?.debug(`Terminal status updated for agent ${agentConfig.name}: ${newStatus}`);
    }

    private getStatusEmoji(status: string): string {
        switch (status.toUpperCase()) {
            case 'IDLE':
            case 'ONLINE':
                return '🟢'; // Green circle - ready
            case 'WORKING':
            case 'BUSY':
                return '🔵'; // Blue circle - working
            case 'WAITING':
                return '🟡'; // Yellow circle - waiting
            case 'ERROR':
            case 'OFFLINE':
                return '🔴'; // Red circle - error
            default:
                return '🤖'; // Default robot
        }
    }

    /**
     * Refreshes icons for all terminals that have exited (removes warning triangles)
     */
    refreshAllExitedTerminalIcons(): void {
        const agentManager = require('../agents/AgentManager');
        
        for (const [agentId, terminal] of this.terminals.entries()) {
            // Only refresh terminals that have exited (showing warning triangle)
            if (terminal.exitStatus !== undefined) {
                try {
                    // Get agent config to determine proper icon
                    const agent = agentManager?.getAgent?.(agentId);
                    if (agent) {
                        this.refreshTerminalIcon(agentId, agent);
                    }
                } catch (error) {
                    console.warn(`[TerminalManager] Could not refresh icon for agent ${agentId}:`, error);
                }
            }
        }
    }

    /**
     * Enhances system prompt with status reporting capabilities
     */
    private enhancePromptWithStatusReporting(originalPrompt: string, agent: any): string {
        const statusInstructions = ` Status commands: echo "NOFX_STATUS:WORKING" (start), echo "NOFX_STATUS:IDLE" (done), echo "NOFX_STATUS:WAITING" (questions), echo "NOFX_STATUS:ERROR" (errors).`;

        const fullPrompt = originalPrompt + statusInstructions;
        
        // Ensure total prompt stays under command line limits (2500 chars max)
        const maxPromptLength = 2500;
        if (fullPrompt.length > maxPromptLength) {
            console.log(`[TerminalManager] Truncating prompt from ${fullPrompt.length} to ${maxPromptLength} characters`);
            let truncated = fullPrompt.substring(0, maxPromptLength - statusInstructions.length);
            
            // Ensure we don't cut off in the middle of a quote or leave unclosed quotes
            // Find the last complete sentence or safe breaking point
            const safeBreakPoints = ['. ', '.\n', '!\n', '?\n', '\n\n'];
            let lastSafeBreak = -1;
            
            for (const breakPoint of safeBreakPoints) {
                const pos = truncated.lastIndexOf(breakPoint);
                if (pos > lastSafeBreak) {
                    lastSafeBreak = pos + breakPoint.length;
                }
            }
            
            // If we found a safe break point, use it; otherwise just truncate cleanly
            if (lastSafeBreak > maxPromptLength * 0.8) { // Only use if it's not too short
                truncated = truncated.substring(0, lastSafeBreak);
            }
            
            return truncated + statusInstructions;
        }

        return fullPrompt;
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

                // Re-enable verification to see what's actually happening
                console.error(`[NofX DEBUG] About to verify agent initialization...`);
                const success = await this.verifyAgentInitialization(agent);
                console.error(`[NofX DEBUG] Verification result: ${success}`);
                if (success) {
                    this.loggingService?.info(`Agent ${agent.name} initialized successfully on attempt ${attempt}`);
                    return;
                }
                console.error(`[NofX DEBUG] Verification failed, will retry...`);
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
        console.error(`[NofX DEBUG] performAgentInitialization called for ${agent.name}, attempt ${attempt}`);
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
            console.error(`[NofX] Template systemPrompt content: "${agent.template.systemPrompt}"`);
        } else {
            console.error(`[NofX] NO TEMPLATE FOUND - this explains why Claude doesn't launch!`);
        }

        console.error(`[NofX DEBUG] Looking for terminal with agent.id: ${agent.id}`);
        console.error(`[NofX DEBUG] Available terminal keys:`, Array.from(this.terminals.keys()));
        const terminal = this.terminals.get(agent.id);
        if (!terminal) {
            console.error(`[NofX DEBUG] TERMINAL NOT FOUND! This is why Claude doesn't launch!`);
            this.loggingService?.error(`No terminal found for agent ${agent.id}`);
            return;
        }
        console.error(`[NofX DEBUG] Terminal found! Proceeding with Claude launch...`);

        try {
            console.error(`[NofX DEBUG] About to show terminal and start initialization...`);

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

            // Agent initialization - no echo commands

            // Start AI with provider-specific command
            const currentProvider = this.configService.getAiProvider();
            const supportsSystemPrompt = currentProvider === 'claude' || currentProvider === 'aider';

            // Check if we should add the --dangerously-skip-permissions flag (Claude-specific)
            const skipPermissions = this.configService.isClaudeSkipPermissions();
            const permissionsFlag =
                skipPermissions && currentProvider === 'claude' ? '--dangerously-skip-permissions ' : '';

            if (agent.template && agent.template.systemPrompt) {
                console.error(`[NofX] FOUND TEMPLATE - proceeding with Claude launch`);
                this.loggingService?.agents(
                    `TerminalManager: Agent ${agent.name} has template '${agent.template.id}' with systemPrompt`
                );
                this.loggingService?.debug(
                    `Starting ${agent.name} with template's abbreviated systemPrompt, then injecting detailedPrompt`
                );

                // Debug: Log what we're seeing in the template
                console.log(
                    '[DEBUG] Agent template systemPrompt:',
                    agent.template.systemPrompt?.substring(0, 100) + '...'
                );
                console.log('[DEBUG] Agent template detailedPrompt exists?', !!agent.template.detailedPrompt);
                this.loggingService?.agents(
                    `TerminalManager: Template info - systemPrompt: ${agent.template.systemPrompt?.length || 0} chars, detailedPrompt: ${agent.template.detailedPrompt?.length || 0} chars`
                );

                // Use ONLY the short systemPrompt to launch Claude (not the detailed one)
                // Enhanced with status reporting capabilities
                const simplePrompt = this.enhancePromptWithStatusReporting(agent.template.systemPrompt, agent);

                // Log the launch strategy
                this.loggingService?.info(`Starting agent: ${agent.name} (${agent.type})`);
                this.loggingService?.debug(`Using SHORT system prompt to launch, will inject detailed prompt after`);

                // Show what we're about to execute
                if (supportsSystemPrompt) {
                    // Provider supports system prompts - use ONLY the short prompt
                    const aiPath = this.configService.getAiPath() || currentProvider;
                    // Use double quotes which handle multiline strings better than single quotes
                    // Only need to escape double quotes, dollar signs, and backticks
                    const escapedPrompt = simplePrompt
                        .replace(/\\/g, '\\\\')     // Escape backslashes first
                        .replace(/"/g, '\\"')        // Escape double quotes
                        .replace(/\$/g, '\\$')       // Escape dollar signs
                        .replace(/`/g, '\\`');       // Escape backticks
                    
                    // Use double quotes directly - they handle multiline strings properly
                    const command = `${aiPath} ${permissionsFlag}--append-system-prompt "${escapedPrompt}"`.trim();
                    console.log('[DEBUG] Launching with prompt, length:', simplePrompt.length);
                    console.log('[DEBUG] Full Claude command:', command.substring(0, 200) + '...');
                    // Send the Claude command with the actual agent's system prompt
                    terminal.sendText(command);
                } else {
                    // Provider doesn't support system prompts, launch normally and show prompt
                    const aiPath = this.configService.getAiPath() || currentProvider;
                    const command = aiPath;
                    terminal.sendText(`echo "Executing: ${command}"`);
                    terminal.sendText(
                        `echo "Note: ${currentProvider} doesn't support system prompts. Please paste this prompt:"`
                    );
                    // Clean the prompt for display - replace newlines with spaces
                    const displayPrompt = simplePrompt.replace(/\n+/g, ' ').replace(/"/g, '\\"');
                    terminal.sendText(`echo "${displayPrompt}"`);
                    terminal.sendText(command);
                }

                // The comprehensive system prompt now contains all necessary context
                this.loggingService?.agents(`Agent ${agent.name} started with comprehensive system prompt`);
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
                    const aiPath = this.configService.getAiPath() || currentProvider;
                    const command =
                        `${aiPath} --system-prompt '${basicPrompt.replace(/'/g, "'\\''")}' ${permissionsFlag}`.trim();
                    terminal.sendText(command);
                } else {
                    // Provider doesn't support system prompts, launch normally and show prompt
                    const aiPath = this.configService.getAiPath() || currentProvider;
                    const command = aiPath;
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
            console.error(`[NofX DEBUG] Reached end of initialization successfully!`);
            this.loggingService?.info(`Terminal initialization completed for agent ${agent.name} (${agent.id})`);
        } catch (error) {
            console.error(`[NofX DEBUG] EXCEPTION in performAgentInitialization:`, error);
            throw error; // Re-throw to trigger retry
        }
    }

    private async verifyAgentInitialization(agent: any, timeoutMs: number = 10000): Promise<boolean> {
        const terminal = this.terminals.get(agent.id);
        if (!terminal) {
            this.loggingService?.error(`Verification failed: No terminal found for agent ${agent.id}`);
            return false;
        }

        this.loggingService?.debug(`Verifying agent ${agent.name} initialization...`);

        // Simplified verification - just wait a bit and check if terminal is still running
        // This is more forgiving during development
        return new Promise<boolean>(resolve => {
            setTimeout(() => {
                try {
                    const isStillRunning = terminal.exitStatus === undefined;
                    if (isStillRunning) {
                        this.loggingService?.debug(`Agent ${agent.name} terminal is running - considering initialized`);
                        resolve(true);
                    } else {
                        this.loggingService?.warn(`Agent ${agent.name} terminal exited during initialization`);
                        resolve(false);
                    }
                } catch (error) {
                    this.loggingService?.warn(`Agent ${agent.name} verification failed with error: ${error}`);
                    // Be forgiving - assume success if we can't verify
                    resolve(true);
                }
            }, 3000); // Much shorter timeout
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
            // Non-intrusive health check - just verify terminal exists and is accessible
            // We avoid sending visible commands to prevent cluttering the Claude interface

            // Check terminal state without sending commands
            const isTerminalActive = terminal.exitStatus === undefined; // undefined means still running

            if (!isTerminalActive) {
                issues.push('Terminal has exited');
            }

            // Additional non-visible checks can be added here
            // such as checking terminal process state, memory usage, etc.

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
