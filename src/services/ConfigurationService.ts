import * as vscode from 'vscode';
import { IConfigurationService, CONFIG_KEYS } from './interfaces';

export class ConfigurationService implements IConfigurationService {
    private static readonly CONFIG_SECTION = 'nofx';
    private config: vscode.WorkspaceConfiguration;
    private readonly disposables: vscode.Disposable[] = [];
    private configCache: Map<string, any> = new Map();

    constructor() {
        this.config = vscode.workspace.getConfiguration(ConfigurationService.CONFIG_SECTION);
        this.initializeCache();
        
        // Listen for configuration changes
        const disposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ConfigurationService.CONFIG_SECTION)) {
                this.initializeCache();
            }
        });
        this.disposables.push(disposable);
    }

    private initializeCache(): void {
        this.configCache.clear();
        // Refresh the configuration reference
        this.config = vscode.workspace.getConfiguration(ConfigurationService.CONFIG_SECTION);
        
        // Cache all known configuration keys
        Object.values(CONFIG_KEYS).forEach(key => {
            const value = this.config.get(key);
            if (value !== undefined) {
                this.configCache.set(key, value);
            }
        });
    }

    get<T>(key: string, defaultValue?: T): T {
        // Check cache first
        if (this.configCache.has(key)) {
            return this.configCache.get(key) as T;
        }

        // Fall back to configuration API
        const value = this.config.get<T>(key);
        if (value !== undefined) {
            this.configCache.set(key, value);
            return value;
        }

        return defaultValue as T;
    }

    getAll(): Record<string, any> {
        const result: Record<string, any> = {};
        
        // Iterate through all known configuration keys
        Object.values(CONFIG_KEYS).forEach(key => {
            const value = this.get(key);
            if (value !== undefined) {
                result[key] = value;
            }
        });

        return result;
    }

    async update(key: string, value: any, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace): Promise<void> {
        await this.config.update(key, value, target);
        this.configCache.set(key, value);
    }

    onDidChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ConfigurationService.CONFIG_SECTION)) {
                callback(e);
            }
        });
    }

    // NofX specific configuration methods
    getMaxAgents(): number {
        return this.get<number>(CONFIG_KEYS.MAX_AGENTS, 5);
    }

    getClaudePath(): string {
        return this.get<string>(CONFIG_KEYS.CLAUDE_PATH, 'claude');
    }

    isAutoAssignTasks(): boolean {
        return this.get<boolean>(CONFIG_KEYS.AUTO_ASSIGN_TASKS, true);
    }

    isUseWorktrees(): boolean {
        return this.get<boolean>(CONFIG_KEYS.USE_WORKTREES, false);
    }

    getTemplatesPath(): string {
        return this.get<string>(CONFIG_KEYS.TEMPLATES_PATH, '.nofx/templates');
    }

    isPersistAgents(): boolean {
        return this.get<boolean>(CONFIG_KEYS.PERSIST_AGENTS, true);
    }

    getLogLevel(): string {
        return this.get<string>(CONFIG_KEYS.LOG_LEVEL, 'info');
    }

    // Orchestration service configuration methods
    getOrchestrationHeartbeatInterval(): number {
        return this.get<number>(CONFIG_KEYS.ORCH_HEARTBEAT_INTERVAL, 10000);
    }

    getOrchestrationHeartbeatTimeout(): number {
        return this.get<number>(CONFIG_KEYS.ORCH_HEARTBEAT_TIMEOUT, 30000);
    }

    getOrchestrationHistoryLimit(): number {
        return this.get<number>(CONFIG_KEYS.ORCH_HISTORY_LIMIT, 1000);
    }

    getOrchestrationPersistencePath(): string {
        return this.get<string>(CONFIG_KEYS.ORCH_PERSISTENCE_PATH, '.nofx/orchestration');
    }

    getOrchestrationMaxFileSize(): number {
        return this.get<number>(CONFIG_KEYS.ORCH_MAX_FILE_SIZE, 10 * 1024 * 1024); // 10MB
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
        this.configCache.clear();
    }
}