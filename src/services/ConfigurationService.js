"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationService = void 0;
const vscode = __importStar(require("vscode"));
const interfaces_1 = require("./interfaces");
const EventConstants_1 = require("./EventConstants");
class ConfigurationService {
    constructor(validator, eventBus) {
        this.disposables = [];
        this.configCache = new Map();
        this.validationCache = new Map();
        this.validator = validator;
        this.eventBus = eventBus;
        this.config = vscode.workspace.getConfiguration(ConfigurationService.CONFIG_SECTION);
        this.initializeCache();
        const disposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ConfigurationService.CONFIG_SECTION)) {
                this.initializeCache();
                this.eventBus?.publish(EventConstants_1.CONFIG_EVENTS.CONFIG_CHANGED, { section: ConfigurationService.CONFIG_SECTION });
            }
        });
        this.disposables.push(disposable);
    }
    initializeCache() {
        this.configCache.clear();
        this.config = vscode.workspace.getConfiguration(ConfigurationService.CONFIG_SECTION);
        Object.values(interfaces_1.CONFIG_KEYS).forEach(key => {
            const value = this.config.get(key);
            if (value !== undefined) {
                this.configCache.set(key, value);
            }
        });
    }
    get(key, defaultValue) {
        if (this.configCache.has(key)) {
            const cachedValue = this.configCache.get(key);
            if (this.validator) {
                const validation = this.validateConfigurationKey(key, cachedValue);
                if (!validation.isValid) {
                    this.eventBus?.publish(EventConstants_1.CONFIG_EVENTS.CONFIG_VALIDATION_FAILED, { key, errors: validation.errors });
                    this.configCache.delete(key);
                    return defaultValue;
                }
            }
            return cachedValue;
        }
        try {
            const value = this.config.get(key);
            if (value !== undefined) {
                this.configCache.set(key, value);
                if (this.validator) {
                    const validation = this.validateConfigurationKey(key, value);
                    if (!validation.isValid) {
                        this.eventBus?.publish(EventConstants_1.CONFIG_EVENTS.CONFIG_VALIDATION_FAILED, { key, errors: validation.errors });
                        return defaultValue;
                    }
                }
                return value;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.eventBus?.publish(EventConstants_1.CONFIG_EVENTS.CONFIG_API_ERROR, {
                key,
                error: errorMessage,
                operation: 'get'
            });
        }
        return defaultValue;
    }
    getAll() {
        const result = {};
        Object.values(interfaces_1.CONFIG_KEYS).forEach(key => {
            const value = this.get(key);
            if (value !== undefined) {
                result[key] = value;
            }
        });
        return result;
    }
    async update(key, value, target = vscode.ConfigurationTarget.Workspace) {
        if (this.validator) {
            const validation = this.validateConfigurationKey(key, value);
            if (!validation.isValid) {
                const errorMessage = validation.errors.map(e => e.message).join('; ');
                throw new Error(`Configuration validation failed for key '${key}': ${errorMessage}`);
            }
        }
        try {
            await this.config.update(key, value, target);
            this.configCache.set(key, value);
            this.validationCache.delete(key);
            this.eventBus?.publish(EventConstants_1.CONFIG_EVENTS.CONFIG_UPDATED, { key, value, target });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.eventBus?.publish(EventConstants_1.CONFIG_EVENTS.CONFIG_UPDATE_FAILED, {
                key,
                value,
                target,
                error: errorMessage
            });
            throw new Error(`Failed to update configuration key '${key}': ${errorMessage}`);
        }
    }
    onDidChange(callback) {
        return vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ConfigurationService.CONFIG_SECTION)) {
                callback(e);
            }
        });
    }
    getMaxAgents() {
        return this.get(interfaces_1.CONFIG_KEYS.MAX_AGENTS, 3);
    }
    getClaudePath() {
        return this.get(interfaces_1.CONFIG_KEYS.CLAUDE_PATH, 'claude');
    }
    isAutoAssignTasks() {
        return this.get(interfaces_1.CONFIG_KEYS.AUTO_ASSIGN_TASKS, true);
    }
    isUseWorktrees() {
        return this.get(interfaces_1.CONFIG_KEYS.USE_WORKTREES, true);
    }
    isShowAgentTerminalOnSpawn() {
        return this.get(interfaces_1.CONFIG_KEYS.SHOW_AGENT_TERMINAL_ON_SPAWN, false);
    }
    getTemplatesPath() {
        return this.get(interfaces_1.CONFIG_KEYS.TEMPLATES_PATH, '.nofx/templates');
    }
    isPersistAgents() {
        return this.get(interfaces_1.CONFIG_KEYS.PERSIST_AGENTS, true);
    }
    getLogLevel() {
        return this.get(interfaces_1.CONFIG_KEYS.LOG_LEVEL, 'info');
    }
    getOrchestrationHeartbeatInterval() {
        return this.get(interfaces_1.CONFIG_KEYS.ORCH_HEARTBEAT_INTERVAL, 10000);
    }
    getOrchestrationHeartbeatTimeout() {
        return this.get(interfaces_1.CONFIG_KEYS.ORCH_HEARTBEAT_TIMEOUT, 30000);
    }
    getOrchestrationHistoryLimit() {
        return this.get(interfaces_1.CONFIG_KEYS.ORCH_HISTORY_LIMIT, 1000);
    }
    getOrchestrationPersistencePath() {
        return this.get(interfaces_1.CONFIG_KEYS.ORCH_PERSISTENCE_PATH, '.nofx/orchestration');
    }
    getOrchestrationMaxFileSize() {
        return this.get(interfaces_1.CONFIG_KEYS.ORCH_MAX_FILE_SIZE, 10 * 1024 * 1024);
    }
    validateAll() {
        if (!this.validator) {
            return { isValid: true, errors: [] };
        }
        const allConfig = this.getAll();
        const nestedConfig = this.nestKeys(allConfig);
        const schemaValidation = this.validator.validateConfiguration(nestedConfig);
        const nofxValidation = this.validator.validateNofXConfiguration(nestedConfig);
        const allErrors = [...schemaValidation.errors, ...nofxValidation.errors];
        const hasErrors = allErrors.some(error => error.severity === 'error');
        const isValid = !hasErrors;
        return { isValid, errors: allErrors };
    }
    getNestedConfig(flat) {
        return this.nestKeys(flat);
    }
    nestKeys(flat) {
        const nested = {};
        for (const [k, v] of Object.entries(flat)) {
            if (k.includes('.')) {
                const [root, ...rest] = k.split('.');
                nested[root] = nested[root] || {};
                let cur = nested[root];
                for (let i = 0; i < rest.length - 1; i++) {
                    cur = cur[rest[i]] = cur[rest[i]] || {};
                }
                cur[rest[rest.length - 1]] = v;
            }
            else {
                nested[k] = v;
            }
        }
        return nested;
    }
    getValidationErrors() {
        if (!this.validator) {
            return [];
        }
        return this.validator.getValidationErrors();
    }
    validateConfigurationKey(key, value) {
        if (!this.validator) {
            return { isValid: true, errors: [] };
        }
        const cacheKey = `${key}:${JSON.stringify(value)}`;
        if (this.validationCache.has(cacheKey)) {
            return this.validationCache.get(cacheKey);
        }
        const validation = this.validator.validateConfigurationKey(key, value);
        this.validationCache.set(cacheKey, validation);
        return validation;
    }
    async backupConfiguration() {
        const backup = this.getAll();
        this.eventBus?.publish(EventConstants_1.CONFIG_EVENTS.CONFIG_BACKED_UP, { keys: Object.keys(backup) });
        return backup;
    }
    async restoreConfiguration(backup) {
        if (this.validator) {
            const nested = this.nestKeys(backup);
            const validation = this.validator.validateConfiguration(nested);
            if (!validation.isValid) {
                throw new Error(`Backup validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
            }
        }
        for (const [key, value] of Object.entries(backup)) {
            await this.update(key, value);
        }
        this.eventBus?.publish(EventConstants_1.CONFIG_EVENTS.CONFIG_RESTORED, { keys: Object.keys(backup) });
    }
    clearValidationCache() {
        this.validationCache.clear();
    }
    getValidationCacheStats() {
        return { size: this.validationCache.size, hitRate: 0.8 };
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
        this.configCache.clear();
        this.validationCache.clear();
    }
}
exports.ConfigurationService = ConfigurationService;
ConfigurationService.CONFIG_SECTION = 'nofx';
//# sourceMappingURL=ConfigurationService.js.map