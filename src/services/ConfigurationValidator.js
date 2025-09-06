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
exports.ConfigurationValidator = void 0;
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
class ConfigurationValidator {
    constructor(logger, notificationService) {
        this.validationErrors = [];
        this.logger = logger;
        this.notificationService = notificationService;
    }
    buildBaseSchema() {
        return zod_1.z.object({
            maxAgents: zod_1.z.number()
                .int('Max agents must be an integer')
                .min(1, 'Max agents must be at least 1')
                .max(10, 'Max agents cannot exceed 10'),
            claudePath: zod_1.z.string()
                .min(1, 'Claude path cannot be empty')
                .refine((path) => path.trim().length > 0, 'Claude path cannot be just whitespace'),
            autoAssignTasks: zod_1.z.boolean(),
            useWorktrees: zod_1.z.boolean(),
            logLevel: zod_1.z.enum(['debug', 'info', 'warn', 'error'], {
                errorMap: () => ({ message: 'Log level must be one of: debug, info, warn, error' })
            }).optional(),
            autoStart: zod_1.z.boolean(),
            claudeCommandStyle: zod_1.z.enum(['simple', 'interactive', 'heredoc', 'file'], {
                errorMap: () => ({ message: 'Claude command style must be one of: simple, interactive, heredoc, file' })
            }),
            enableMetrics: zod_1.z.boolean(),
            metricsOutputLevel: zod_1.z.enum(['none', 'basic', 'detailed'], {
                errorMap: () => ({ message: 'Metrics output level must be one of: none, basic, detailed' })
            }),
            testMode: zod_1.z.boolean(),
            metricsRetentionHours: zod_1.z.number()
                .int('Metrics retention hours must be an integer')
                .min(1, 'Metrics retention must be at least 1 hour')
                .max(168, 'Metrics retention cannot exceed 168 hours (1 week)')
                .optional(),
            orchestration: zod_1.z.object({
                heartbeatInterval: zod_1.z.number().int().min(1000).max(60000),
                heartbeatTimeout: zod_1.z.number().int().min(5000).max(300000),
                historyLimit: zod_1.z.number().int().min(100).max(10000),
                persistencePath: zod_1.z.string().min(1),
                maxFileSize: zod_1.z.number().int().min(1024).max(104857600)
            }).optional()
        });
    }
    buildValidationSchema() {
        return this.buildBaseSchema().refine((data) => {
            return true;
        });
    }
    validateConfiguration(config) {
        this.logger?.debug('Validating configuration', { configKeys: Object.keys(config) });
        try {
            const schema = this.buildValidationSchema();
            const result = schema.safeParse(config);
            if (result.success) {
                this.validationErrors = [];
                this.logger?.debug('Configuration validation successful');
                return { isValid: true, errors: [] };
            }
            else {
                this.validationErrors = this.mapZodErrorsToValidationErrors(result.error.errors);
                this.logger?.warn('Configuration validation failed', { errors: this.validationErrors });
                return { isValid: false, errors: this.validationErrors };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
            this.logger?.error('Configuration validation error', { error: errorMessage });
            const validationError = {
                field: 'general',
                message: `Validation failed: ${errorMessage}`,
                severity: 'error'
            };
            this.validationErrors = [validationError];
            return { isValid: false, errors: this.validationErrors };
        }
    }
    validateConfigurationKey(key, value) {
        this.logger?.debug('Validating configuration key', { key, value });
        try {
            const schema = this.buildValidationSchema();
            if (key.includes('.')) {
                const parts = key.split('.');
                const nestedObj = this.buildNestedObject(parts, value);
                const baseSchema = this.buildBaseSchema();
                const partialResult = baseSchema.partial().safeParse(nestedObj);
                if (partialResult.success) {
                    this.logger?.debug('Configuration key validation successful', { key });
                    return { isValid: true, errors: [] };
                }
                else {
                    const errors = this.mapZodErrorsToValidationErrors(partialResult.error.errors);
                    this.logger?.warn('Configuration key validation failed', { key, errors });
                    return { isValid: false, errors };
                }
            }
            else {
                const baseSchema = this.buildBaseSchema();
                const schemaShape = baseSchema.shape;
                if (key in schemaShape) {
                    const partialSchema = baseSchema.pick({ [key]: true });
                    const result = partialSchema.safeParse({ [key]: value });
                    if (result.success) {
                        this.logger?.debug('Configuration key validation successful', { key });
                        return { isValid: true, errors: [] };
                    }
                    else {
                        const errors = this.mapZodErrorsToValidationErrors(result.error.errors);
                        this.logger?.warn('Configuration key validation failed', { key, errors });
                        return { isValid: false, errors };
                    }
                }
                else {
                    this.logger?.debug('Unknown configuration key detected, allowing through', { key });
                    return { isValid: true, errors: [] };
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
            this.logger?.error('Configuration key validation error', { key, error: errorMessage });
            const validationError = {
                field: key,
                message: `Validation failed for ${key}: ${errorMessage}`,
                severity: 'error'
            };
            return { isValid: false, errors: [validationError] };
        }
    }
    getValidationSchema() {
        return this.buildValidationSchema();
    }
    getValidationErrors() {
        return [...this.validationErrors];
    }
    mapZodErrorsToValidationErrors(zodErrors) {
        return zodErrors.map(error => {
            const field = error.path.join('.');
            const message = error.message;
            let severity = 'error';
            if (error.code === 'custom' && error.message.includes('recommendation')) {
                severity = 'info';
            }
            else if (error.code === 'too_small' || error.code === 'too_big') {
                severity = 'warning';
            }
            return {
                field,
                message: this.formatErrorMessage(field, message),
                severity
            };
        });
    }
    formatErrorMessage(field, message) {
        const suggestions = {
            'maxAgents': 'Try a value between 1 and 10. Consider your system resources.',
            'claudePath': 'Ensure the path points to a valid Claude CLI executable.',
            'logLevel': 'Choose from: debug (most verbose), info (default), warn, error (least verbose).',
            'claudeCommandStyle': 'Choose from: simple (echo | claude), interactive (claude then prompt), heredoc (claude << EOF), file (via temp file).',
            'metricsOutputLevel': 'Choose from: none (disabled), basic (essential metrics), detailed (all metrics).'
        };
        const suggestion = suggestions[field];
        return suggestion ? `${message} ${suggestion}` : message;
    }
    buildNestedObject(parts, value) {
        const result = {};
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
            current[parts[i]] = {};
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
        return result;
    }
    validateNofXConfiguration(config) {
        const errors = [];
        if (config.useWorktrees && !this.isGitRepository()) {
            errors.push({
                field: 'useWorktrees',
                message: 'Git worktrees require a Git repository. Initialize Git or disable worktrees.',
                severity: 'warning'
            });
        }
        if (config.maxAgents && config.maxAgents > 5) {
            errors.push({
                field: 'maxAgents',
                message: 'High agent count may impact performance. Monitor system resources.',
                severity: 'info'
            });
        }
        if (config.enableMetrics && config.metricsOutputLevel === 'none') {
            errors.push({
                field: 'metricsOutputLevel',
                message: 'Metrics are enabled but output level is set to none. Consider basic or detailed.',
                severity: 'warning'
            });
        }
        return {
            isValid: errors.filter(e => e.severity === 'error').length === 0,
            errors
        };
    }
    isGitRepository() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }
        const root = workspaceFolders[0].uri.fsPath;
        const gitPath = path.join(root, '.git');
        return fs.existsSync(gitPath);
    }
    validateConfigurationMigration(oldConfig, newConfig) {
        const errors = [];
        const removedKeys = Object.keys(oldConfig).filter(key => !(key in newConfig));
        if (removedKeys.length > 0) {
            errors.push({
                field: 'migration',
                message: `Removed configuration keys detected: ${removedKeys.join(', ')}. These will be ignored.`,
                severity: 'info'
            });
        }
        const newRequiredKeys = Object.keys(newConfig).filter(key => !(key in oldConfig));
        if (newRequiredKeys.length > 0) {
            errors.push({
                field: 'migration',
                message: `New configuration keys available: ${newRequiredKeys.join(', ')}. Review and configure as needed.`,
                severity: 'info'
            });
        }
        return {
            isValid: true,
            errors
        };
    }
    dispose() {
        this.validationErrors = [];
        this.logger?.debug('ConfigurationValidator disposed');
    }
}
exports.ConfigurationValidator = ConfigurationValidator;
//# sourceMappingURL=ConfigurationValidator.js.map