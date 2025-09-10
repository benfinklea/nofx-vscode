import * as vscode from 'vscode';

// Essential configuration keys only
const CONFIG_KEYS = {
    AI_PROVIDER: 'aiProvider',
    MAX_AGENTS: 'maxAgents',
    AI_PATH: 'aiPath'
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

    // Auto-detected/hard-coded getters
    isUseWorktrees(): boolean;
    isAutoAssignTasks(): boolean;
    getTemplatesPath(): string;
    isPersistAgents(): boolean;
    getLogLevel(): string;
    isShowAgentTerminalOnSpawn(): boolean;
    getClaudeInitializationDelay(): number;
    getAgentSpawnDelay(): number;
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

    isClaudeSkipPermissions(): boolean {
        // Default to false for safety - don't skip permissions by default
        return this.get('claudeSkipPermissions', false);
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
        // Auto-detect git worktree support
        try {
            require('child_process').execSync('git worktree --help', { stdio: 'ignore' });
            return true;
        } catch {
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

    isShowAgentTerminalOnSpawn(): boolean {
        return DEFAULTS.SHOW_AGENT_TERMINAL_ON_SPAWN;
    }

    getClaudeInitializationDelay(): number {
        return DEFAULTS.CLAUDE_INITIALIZATION_DELAY;
    }

    getAgentSpawnDelay(): number {
        return DEFAULTS.AGENT_SPAWN_DELAY;
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
    }
}
