import * as vscode from 'vscode';
import { ServiceLocator } from '../services/ServiceLocator';
import { IConfiguration, ILogger, INotificationService } from '../services/interfaces';
import { ConductorSessionManager, ConductorSession } from '../services/ConductorSessionManager';
import { GitService, GitRepository } from '../services/GitService';

/**
 * NofXConductor - The ultimate AI orchestration conductor
 * Combines all conductor capabilities into one powerful interface
 */
export class NofXConductor {
    private terminal?: vscode.Terminal;
    private configService: IConfiguration;
    private loggingService: ILogger;
    private notificationService: INotificationService;
    private sessionManager: ConductorSessionManager;
    private gitService: GitService;
    private currentSession?: ConductorSession;
    private terminalDisposable?: vscode.Disposable;
    private isAutoRecoveryEnabled: boolean = true;

    constructor(private context: vscode.ExtensionContext) {
        this.configService = ServiceLocator.get<IConfiguration>('ConfigurationService');
        this.loggingService = ServiceLocator.get<ILogger>('LoggingService');
        this.notificationService = ServiceLocator.get<INotificationService>('NotificationService');
        
        this.sessionManager = new ConductorSessionManager(
            this.context,
            this.loggingService,
            this.notificationService
        );
        
        this.gitService = new GitService(this.loggingService);
        
        // Monitor terminal closures for auto-recovery
        this.setupTerminalMonitoring();
    }

    async initialize(): Promise<void> {
        try {
            this.loggingService.info('Initializing NofX Conductor...');
            
            // Clean up old sessions
            await this.sessionManager.cleanupOldSessions();
            
            // Auto-start conductor if workspace is available
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                await this.autoStartForWorkspace(workspaceFolder);
            }
            
            this.loggingService.info('NofX Conductor initialized successfully');
        } catch (error: any) {
            this.loggingService.error('Failed to initialize NofX Conductor:', error);
            this.notificationService.showError(`Failed to initialize NofX Conductor: ${error.message}`);
        }
    }

    async autoStartForWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
        try {
            // Get or create session for this workspace
            this.currentSession = await this.sessionManager.getOrCreateSession(workspaceFolder);
            
            // Auto-start the conductor terminal
            await this.start();
            
            this.loggingService.info('Auto-started NofX Conductor for workspace:', workspaceFolder.name);
        } catch (error: any) {
            this.loggingService.error('Failed to auto-start conductor for workspace:', error);
            // Don't show error to user for auto-start failures - just log them
        }
    }

    async start(): Promise<void> {
        try {
            console.log('[NofXConductor] Starting NofX Conductor...');
            this.loggingService.info('Starting NofX Conductor...');

            // If we already have an active terminal, focus it instead of creating new one
            if (this.terminal && !this.terminal.exitStatus) {
                console.log('[NofXConductor] Focusing existing terminal');
                this.terminal.show();
                this.loggingService.info('Focused existing NofX Conductor terminal');
                return;
            }

            console.log('[NofXConductor] Generating conductor system prompt...');
            // Create conductor system prompt
            let conductorPrompt = this.generateConductorPrompt();
            
            // Ensure prompt stays under command line limits (2500 chars max)
            const maxPromptLength = 2500;
            if (conductorPrompt.length > maxPromptLength) {
                console.log(`[NofXConductor] Truncating conductor prompt from ${conductorPrompt.length} to ${maxPromptLength} characters`);
                let truncated = conductorPrompt.substring(0, maxPromptLength);
                
                // Ensure we don't cut off in the middle of a quote or leave unclosed quotes
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
                
                conductorPrompt = truncated;
            }
            
            console.log('[NofXConductor] System prompt length:', conductorPrompt.length);
            
            console.log('[NofXConductor] Creating terminal...');
            // Create terminal with proper naming
            this.terminal = vscode.window.createTerminal({
                name: '🎵 NofX Conductor',
                iconPath: new vscode.ThemeIcon('organization')
            });

            if (!this.terminal) {
                throw new Error('Failed to create conductor terminal');
            }
            
            console.log('[NofXConductor] Terminal created successfully');

            // Update session with terminal info
            if (this.currentSession) {
                console.log('[NofXConductor] Activating session...');
                await this.sessionManager.activateSession(this.currentSession, 'terminal-id'); // In real impl, get actual terminal ID
            }

            // Get AI configuration 
            const aiPath = this.configService.getAiPath() || 'claude';
            const skipPermissions = this.configService.isClaudeSkipPermissions();
            console.log('[NofXConductor] AI path:', aiPath, 'Skip permissions:', skipPermissions);
            
            // Use the same prompt injection logic as agents
            const permissionsFlag = skipPermissions ? '--dangerously-skip-permissions ' : '';
            
            console.log('[NofXConductor] Escaping system prompt...');
            // Escape the prompt properly (same logic as TerminalManager)
            const escapedPrompt = conductorPrompt
                .replace(/\\/g, '\\\\')      // Escape backslashes first
                .replace(/"/g, '\\"')        // Escape double quotes
                .replace(/\$/g, '\\$')       // Escape dollar signs
                .replace(/`/g, '\\`');       // Escape backticks
            
            // Use double quotes for multiline handling
            const command = `${aiPath} ${permissionsFlag}--append-system-prompt "${escapedPrompt}"`.trim();
            console.log('[NofXConductor] Command length:', command.length);
            console.log('[NofXConductor] AI Path:', aiPath);
            console.log('[NofXConductor] Full command preview:', command.substring(0, 200) + '...');
            
            this.loggingService.info('Launching NofX Conductor with system prompt, length:', conductorPrompt.length);
            
            console.log('[NofXConductor] Showing terminal and sending command...');
            // Show the terminal and send the command
            this.terminal.show();
            
            // Add a small delay to ensure terminal is ready
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.terminal.sendText(command);

            console.log('[NofXConductor] NofX Conductor started successfully');
            this.loggingService.info('NofX Conductor started successfully');
            
            // Force focus on the terminal after a brief delay
            setTimeout(() => {
                if (this.terminal) {
                    console.log('[NofXConductor] Focusing terminal after delay');
                    this.terminal.show();
                }
            }, 1000);
            
        } catch (error: any) {
            console.error('[NofXConductor] Failed to start NofX Conductor:', error);
            this.loggingService.error('Failed to start NofX Conductor:', error);
            vscode.window.showErrorMessage(`Failed to start NofX Conductor: ${error.message}`);
            throw error;
        }
    }

    async stop(): Promise<void> {
        try {
            if (this.terminal) {
                this.terminal.dispose();
                this.terminal = undefined;
            }

            if (this.currentSession) {
                await this.sessionManager.deactivateCurrentSession();
            }

            this.loggingService.info('NofX Conductor stopped');
        } catch (error: any) {
            this.loggingService.error('Error stopping NofX Conductor:', error);
        }
    }

    async restart(): Promise<void> {
        this.loggingService.info('Restarting NofX Conductor...');
        await this.stop();
        await this.start();
    }

    private setupTerminalMonitoring(): void {
        // Monitor terminal closures for auto-recovery
        this.terminalDisposable = vscode.window.onDidCloseTerminal(async (closedTerminal) => {
            if (this.terminal && closedTerminal === this.terminal) {
                this.loggingService.warn('NofX Conductor terminal was closed');
                
                if (this.isAutoRecoveryEnabled) {
                    this.loggingService.info('Auto-recovering NofX Conductor terminal...');
                    
                    // Wait a moment before recovery
                    setTimeout(async () => {
                        try {
                            await this.start();
                            this.notificationService.showInformation('NofX Conductor auto-recovered');
                        } catch (error: any) {
                            this.loggingService.error('Failed to auto-recover conductor:', error);
                            this.notificationService.showWarning('NofX Conductor auto-recovery failed. Please restart manually.');
                        }
                    }, 2000);
                }
                
                this.terminal = undefined;
            }
        });
    }

    private generateConductorPrompt(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const projectContext = workspaceFolder ? ` Project: ${workspaceFolder.name}` : '';

        return `You are the NofX Conductor - coordinate AI development teams using JSON commands.${projectContext}

## Core Commands
**Spawn agents:**
{"type": "spawn", "role": "frontend-specialist", "name": "UI Dev"}
{"type": "spawn", "role": "backend-specialist", "name": "API Dev"}

**Assign tasks:**
{"type": "assign", "agentId": "agent-1", "task": "Create login form", "priority": "high"}
{"type": "status", "agentId": "all"}

## Available Roles
- frontend-specialist: React, Vue, CSS, UI/UX
- backend-specialist: APIs, databases, servers
- fullstack-developer: End-to-end features
- devops-engineer: CI/CD, containers, cloud
- testing-specialist: QA, automation, testing

## Instructions
1. Parse JSON commands from user input
2. Coordinate team of AI agents efficiently  
3. Break down complex tasks into clear assignments
4. Monitor progress and provide status updates
5. Ensure code quality and best practices

Ready to orchestrate your development team! 🎵`;
    }

    getCurrentSession(): ConductorSession | undefined {
        return this.currentSession;
    }

    isActive(): boolean {
        return this.terminal !== undefined && !this.terminal.exitStatus;
    }

    setAutoRecovery(enabled: boolean): void {
        this.isAutoRecoveryEnabled = enabled;
        this.loggingService.info('NofX Conductor auto-recovery:', enabled ? 'enabled' : 'disabled');
    }

    dispose(): void {
        try {
            this.stop();
            
            if (this.terminalDisposable) {
                this.terminalDisposable.dispose();
                this.terminalDisposable = undefined;
            }
            
            this.sessionManager.dispose();
            
            this.loggingService.info('NofX Conductor disposed');
        } catch (error: any) {
            this.loggingService.error('Error disposing NofX Conductor:', error);
        }
    }
}