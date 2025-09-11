import * as vscode from 'vscode';

// Essential configuration keys only
const CONFIG_KEYS = {
    AI_PROVIDER: 'aiProvider',
    MAX_AGENTS: 'maxAgents',
    AI_PATH: 'aiPath',
    CLAUDE_SKIP_PERMISSIONS: 'claudeSkipPermissions',
    CLAUDE_INITIALIZATION_DELAY: 'claudeInitializationDelay',
    AGENT_SPAWN_DELAY: 'agentSpawnDelay',
    SHOW_AGENT_TERMINAL_ON_SPAWN: 'showAgentTerminalOnSpawn'
} as const;

// Hard-coded defaults for removed settings
const DEFAULTS = {
    USE_WORKTREES: true,
    AUTO_ASSIGN_TASKS: true,
    TEMPLATES_PATH: '.nofx/templates',
    PERSIST_AGENTS: true,
    LOG_LEVEL: 'info',
    SHOW_AGENT_TERMINAL_ON_SPAWN: false,
    CLAUDE_INITIALIZATION_DELAY: 10,
    AGENT_SPAWN_DELAY: 2000
} as const;

export interface IConfiguration {
    get<T>(key: string, defaultValue?: T): T;
    update(key: string, value: any, target?: vscode.ConfigurationTarget): Promise<void>;
    onDidChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable;

    // Essential getters only
    getAiProvider(): string;
    getMaxAgents(): number;
    getAiPath(): string;
    
    // Configurable settings
    isClaudeSkipPermissions(): boolean;
    getClaudeInitializationDelay(): number;
    getAgentSpawnDelay(): number;
    isShowAgentTerminalOnSpawn(): boolean;

    // Auto-detected/hard-coded getters
    isUseWorktrees(): boolean;
    isAutoAssignTasks(): boolean;
    getTemplatesPath(): string;
    isPersistAgents(): boolean;
    getLogLevel(): string;
}

export class ConfigurationService implements IConfiguration {
    private static readonly CONFIG_SECTION = 'nofx';
    private config: vscode.WorkspaceConfiguration;
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.config = vscode.workspace.getConfiguration(ConfigurationService.CONFIG_SECTION);

        // Listen for configuration changes
        const disposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ConfigurationService.CONFIG_SECTION)) {
                this.config = vscode.workspace.getConfiguration(ConfigurationService.CONFIG_SECTION);
            }
        });
        this.disposables.push(disposable);
    }

    get<T>(key: string, defaultValue?: T): T {
        return this.config.get<T>(key, defaultValue as T);
    }

    set(key: string, value: any): void {
        this.config.update(key, value, vscode.ConfigurationTarget.Workspace);
    }

    has(key: string): boolean {
        return this.config.has(key);
    }

    // Essential configuration getters
    getAiProvider(): string {
        return this.get(CONFIG_KEYS.AI_PROVIDER, 'claude');
    }

    getMaxAgents(): number {
        return this.get(CONFIG_KEYS.MAX_AGENTS, 3);
    }

    getAiPath(): string {
        return this.get(CONFIG_KEYS.AI_PATH, '');
    }

    // Configurable settings (use CONFIG_KEYS)
    isClaudeSkipPermissions(): boolean {
        // Default to true to include --dangerously-skip-permissions flag by default
        return this.get(CONFIG_KEYS.CLAUDE_SKIP_PERMISSIONS, true);
    }

    getClaudeInitializationDelay(): number {
        return this.get(CONFIG_KEYS.CLAUDE_INITIALIZATION_DELAY, DEFAULTS.CLAUDE_INITIALIZATION_DELAY);
    }

    getAgentSpawnDelay(): number {
        return this.get(CONFIG_KEYS.AGENT_SPAWN_DELAY, DEFAULTS.AGENT_SPAWN_DELAY);
    }

    isShowAgentTerminalOnSpawn(): boolean {
        return this.get(CONFIG_KEYS.SHOW_AGENT_TERMINAL_ON_SPAWN, DEFAULTS.SHOW_AGENT_TERMINAL_ON_SPAWN);
    }

    async update(
        key: string,
        value: any,
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
    ): Promise<void> {
        await this.config.update(key, value, target);
    }

    onDidChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ConfigurationService.CONFIG_SECTION)) {
                callback(e);
            }
        });
    }

    // Auto-detected/hard-coded getters (return constants)
    isUseWorktrees(): boolean {
        // Auto-detect git worktree support AND verify we're in a git repository
        try {
            const { execSync } = require('child_process');
            
            console.log('[ConfigurationService] Checking worktree availability...');
            
            // First check if git worktree command exists
            execSync('git worktree --help', { stdio: 'ignore' });
            console.log('[ConfigurationService] Git worktree command available');
            
            // Then check if we're actually in a git repository
            const vscode = require('vscode');
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            console.log(`[ConfigurationService] Workspace path: ${workspacePath}`);
            
            if (workspacePath) {
                execSync('git rev-parse --git-dir', { 
                    cwd: workspacePath, 
                    stdio: 'ignore' 
                });
                console.log('[ConfigurationService] Git repository confirmed');
                return true;
            }
            
            console.log('[ConfigurationService] No workspace path available');
            return false;
        } catch (error) {
            console.log('[ConfigurationService] Worktree check failed:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    isAutoAssignTasks(): boolean {
        return DEFAULTS.AUTO_ASSIGN_TASKS;
    }

    getTemplatesPath(): string {
        return DEFAULTS.TEMPLATES_PATH;
    }

    isPersistAgents(): boolean {
        return DEFAULTS.PERSIST_AGENTS;
    }

    getLogLevel(): string {
        return DEFAULTS.LOG_LEVEL;
    }


    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
    }
}
