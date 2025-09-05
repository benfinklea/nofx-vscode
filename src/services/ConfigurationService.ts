import * as vscode from 'vscode';
import { IConfigurationService, CONFIG_KEYS, IConfigurationValidator, ValidationError, IEventBus } from './interfaces';

export class ConfigurationService implements IConfigurationService {
    private static readonly CONFIG_SECTION = 'nofx';
    private config: vscode.WorkspaceConfiguration;
    private readonly disposables: vscode.Disposable[] = [];
    private configCache: Map<string, any> = new Map();
    private validator?: IConfigurationValidator;
    private eventBus?: IEventBus;
    private validationCache: Map<string, { isValid: boolean; errors: ValidationError[] }> = new Map();

    constructor(validator?: IConfigurationValidator, eventBus?: IEventBus) {
        this.validator = validator;
        this.eventBus = eventBus;
        this.config = vscode.workspace.getConfiguration(ConfigurationService.CONFIG_SECTION);
        this.initializeCache();
        
        // Listen for configuration changes
        const disposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ConfigurationService.CONFIG_SECTION)) {
                this.initializeCache();
                this.eventBus?.publish('configuration.changed', { section: ConfigurationService.CONFIG_SECTION });
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
            const cachedValue = this.configCache.get(key) as T;
            
            // Validate cached value if validator is available
            if (this.validator) {
                const validation = this.validateConfigurationKey(key, cachedValue);
                if (!validation.isValid) {
                    this.eventBus?.publish('configuration.validation.failed', { key, errors: validation.errors });
                    // Remove invalid value from cache and return default
                    this.configCache.delete(key);
                    return defaultValue as T;
                }
            }
            
            return cachedValue;
        }

        // Fall back to configuration API
        const value = this.config.get<T>(key);
        if (value !== undefined) {
            this.configCache.set(key, value);
            
            // Validate the value if validator is available
            if (this.validator) {
                const validation = this.validateConfigurationKey(key, value);
                if (!validation.isValid) {
                    this.eventBus?.publish('configuration.validation.failed', { key, errors: validation.errors });
                    // Don't cache invalid values, return default
                    return defaultValue as T;
                }
            }
            
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
        // Validate the new value before applying
        if (this.validator) {
            const validation = this.validateConfigurationKey(key, value);
            if (!validation.isValid) {
                const errorMessage = validation.errors.map(e => e.message).join('; ');
                throw new Error(`Configuration validation failed for key '${key}': ${errorMessage}`);
            }
        }
        
        await this.config.update(key, value, target);
        this.configCache.set(key, value);
        
        // Clear validation cache for this key
        this.validationCache.delete(key);
        
        // Publish configuration update event
        this.eventBus?.publish('configuration.updated', { key, value, target });
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

    // Configuration validation methods
    validateAll(): { isValid: boolean; errors: ValidationError[] } {
        if (!this.validator) {
            return { isValid: true, errors: [] };
        }
        
        const allConfig = this.getAll();
        return this.validator.validateConfiguration(allConfig);
    }

    getValidationErrors(): ValidationError[] {
        if (!this.validator) {
            return [];
        }
        
        return this.validator.getValidationErrors();
    }

    private validateConfigurationKey(key: string, value: any): { isValid: boolean; errors: ValidationError[] } {
        if (!this.validator) {
            return { isValid: true, errors: [] };
        }
        
        // Check validation cache first
        const cacheKey = `${key}:${JSON.stringify(value)}`;
        if (this.validationCache.has(cacheKey)) {
            return this.validationCache.get(cacheKey)!;
        }
        
        const validation = this.validator.validateConfigurationKey(key, value);
        this.validationCache.set(cacheKey, validation);
        
        return validation;
    }

    // Configuration migration and backup methods
    async backupConfiguration(): Promise<Record<string, any>> {
        const backup = this.getAll();
        this.eventBus?.publish('configuration.backed.up', { keys: Object.keys(backup) });
        return backup;
    }

    async restoreConfiguration(backup: Record<string, any>): Promise<void> {
        // Validate the backup before restoring
        if (this.validator) {
            const validation = this.validator.validateConfiguration(backup);
            if (!validation.isValid) {
                throw new Error(`Backup validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
            }
        }
        
        // Restore each configuration value
        for (const [key, value] of Object.entries(backup)) {
            await this.update(key, value);
        }
        
        this.eventBus?.publish('configuration.restored', { keys: Object.keys(backup) });
    }

    // Performance optimization methods
    private clearValidationCache(): void {
        this.validationCache.clear();
    }

    private getValidationCacheStats(): { size: number; hitRate: number } {
        // This would track cache hit rates in a real implementation
        return { size: this.validationCache.size, hitRate: 0.8 }; // Placeholder
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
        this.configCache.clear();
        this.validationCache.clear();
    }
}