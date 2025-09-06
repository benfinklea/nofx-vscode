import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IConfigurationValidator, ValidationError, ILoggingService, INotificationService } from './interfaces';

export class ConfigurationValidator implements IConfigurationValidator {
    private validationErrors: ValidationError[] = [];
    private logger?: ILoggingService;
    private notificationService: INotificationService;

    constructor(logger: ILoggingService | undefined, notificationService: INotificationService) {
        this.logger = logger;
        this.notificationService = notificationService;
    }

    // Base schema without refinements
    private buildBaseSchema() {
        return z.object({
            maxAgents: z.number()
                .int('Max agents must be an integer')
                .min(1, 'Max agents must be at least 1')
                .max(10, 'Max agents cannot exceed 10'),

            claudePath: z.string()
                .min(1, 'Claude path cannot be empty')
                .refine((path) => path.trim().length > 0, 'Claude path cannot be just whitespace'),

            autoAssignTasks: z.boolean(),

            useWorktrees: z.boolean(),

            logLevel: z.enum(['debug', 'info', 'warn', 'error'], {
                errorMap: () => ({ message: 'Log level must be one of: debug, info, warn, error' })
            }).optional(),

            autoStart: z.boolean(),

            claudeCommandStyle: z.enum(['simple', 'interactive', 'heredoc', 'file'], {
                errorMap: () => ({ message: 'Claude command style must be one of: simple, interactive, heredoc, file' })
            }),

            enableMetrics: z.boolean(),

            metricsOutputLevel: z.enum(['none', 'basic', 'detailed'], {
                errorMap: () => ({ message: 'Metrics output level must be one of: none, basic, detailed' })
            }),

            testMode: z.boolean(),

            metricsRetentionHours: z.number()
                .int('Metrics retention hours must be an integer')
                .min(1, 'Metrics retention must be at least 1 hour')
                .max(168, 'Metrics retention cannot exceed 168 hours (1 week)')
                .optional(),

            // Orchestration settings
            orchestration: z.object({
                heartbeatInterval: z.number().int().min(1000).max(60000),
                heartbeatTimeout: z.number().int().min(5000).max(300000),
                historyLimit: z.number().int().min(100).max(10000),
                persistencePath: z.string().min(1),
                maxFileSize: z.number().int().min(1024).max(104857600) // 1KB to 100MB
            }).optional()
        });
    }

    // Comprehensive validation schema for all configuration keys
    private buildValidationSchema() {
        return this.buildBaseSchema().refine((data) => {
            // Cross-field validation: if useWorktrees is true, workspace should be a Git repository
            // This is handled at runtime since we can't check Git status in schema validation
            return true;
        });
    }

    validateConfiguration(config: Record<string, any>): { isValid: boolean; errors: ValidationError[] } {
        this.logger?.debug('Validating configuration', { configKeys: Object.keys(config) });

        try {
            const schema = this.buildValidationSchema();
            const result = schema.safeParse(config);

            if (result.success) {
                this.validationErrors = [];
                this.logger?.debug('Configuration validation successful');
                return { isValid: true, errors: [] };
            } else {
                this.validationErrors = this.mapZodErrorsToValidationErrors(result.error.errors);
                this.logger?.warn('Configuration validation failed', { errors: this.validationErrors });
                return { isValid: false, errors: this.validationErrors };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
            this.logger?.error('Configuration validation error', { error: errorMessage });

            const validationError: ValidationError = {
                field: 'general',
                message: `Validation failed: ${errorMessage}`,
                severity: 'error'
            };

            this.validationErrors = [validationError];
            return { isValid: false, errors: this.validationErrors };
        }
    }

    validateConfigurationKey(key: string, value: any): { isValid: boolean; errors: ValidationError[] } {
        this.logger?.debug('Validating configuration key', { key, value });

        try {
            const schema = this.buildValidationSchema();

            // Handle dotted keys (e.g., orchestration.heartbeatInterval)
            if (key.includes('.')) {
                const parts = key.split('.');
                const nestedObj = this.buildNestedObject(parts, value);

                // Use partial base schema to validate just the nested structure
                const baseSchema = this.buildBaseSchema();
                const partialResult = baseSchema.partial().safeParse(nestedObj);

                if (partialResult.success) {
                    this.logger?.debug('Configuration key validation successful', { key });
                    return { isValid: true, errors: [] };
                } else {
                    const errors = this.mapZodErrorsToValidationErrors(partialResult.error.errors);
                    this.logger?.warn('Configuration key validation failed', { key, errors });
                    return { isValid: false, errors };
                }
            } else {
                // Handle non-dotted keys - check if key exists in schema first
                const baseSchema = this.buildBaseSchema();
                const schemaShape = baseSchema.shape;
                if (key in schemaShape) {
                    // Known key - validate normally
                    const partialSchema = baseSchema.pick({ [key]: true } as any);
                    const result = partialSchema.safeParse({ [key]: value });

                    if (result.success) {
                        this.logger?.debug('Configuration key validation successful', { key });
                        return { isValid: true, errors: [] };
                    } else {
                        const errors = this.mapZodErrorsToValidationErrors(result.error.errors);
                        this.logger?.warn('Configuration key validation failed', { key, errors });
                        return { isValid: false, errors };
                    }
                } else {
                    // Unknown key - allow it to pass through
                    this.logger?.debug('Unknown configuration key detected, allowing through', { key });
                    return { isValid: true, errors: [] };
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
            this.logger?.error('Configuration key validation error', { key, error: errorMessage });

            const validationError: ValidationError = {
                field: key,
                message: `Validation failed for ${key}: ${errorMessage}`,
                severity: 'error'
            };

            return { isValid: false, errors: [validationError] };
        }
    }

    getValidationSchema(): any {
        return this.buildValidationSchema();
    }

    getValidationErrors(): ValidationError[] {
        return [...this.validationErrors];
    }

    private mapZodErrorsToValidationErrors(zodErrors: any[]): ValidationError[] {
        return zodErrors.map(error => {
            const field = error.path.join('.');
            const message = error.message;

            // Determine severity based on error type
            let severity: 'error' | 'warning' | 'info' = 'error';
            if (error.code === 'custom' && error.message.includes('recommendation')) {
                severity = 'info';
            } else if (error.code === 'too_small' || error.code === 'too_big') {
                severity = 'warning';
            }

            return {
                field,
                message: this.formatErrorMessage(field, message),
                severity
            };
        });
    }

    private formatErrorMessage(field: string, message: string): string {
        // Provide user-friendly error messages with suggestions
        const suggestions: Record<string, string> = {
            'maxAgents': 'Try a value between 1 and 10. Consider your system resources.',
            'claudePath': 'Ensure the path points to a valid Claude CLI executable.',
            'logLevel': 'Choose from: debug (most verbose), info (default), warn, error (least verbose).',
            'claudeCommandStyle': 'Choose from: simple (echo | claude), interactive (claude then prompt), heredoc (claude << EOF), file (via temp file).',
            'metricsOutputLevel': 'Choose from: none (disabled), basic (essential metrics), detailed (all metrics).'
        };

        const suggestion = suggestions[field];
        return suggestion ? `${message} ${suggestion}` : message;
    }

    /**
     * Build a nested object from dotted key parts
     * e.g., ['orchestration', 'heartbeatInterval'] with value 5000
     * becomes { orchestration: { heartbeatInterval: 5000 } }
     */
    private buildNestedObject(parts: string[], value: any): Record<string, any> {
        const result: Record<string, any> = {};
        let current = result;

        for (let i = 0; i < parts.length - 1; i++) {
            current[parts[i]] = {};
            current = current[parts[i]];
        }

        // Set the final value
        current[parts[parts.length - 1]] = value;

        return result;
    }

    // Validate specific NofX configuration scenarios
    validateNofXConfiguration(config: Record<string, any>): { isValid: boolean; errors: ValidationError[] } {
        const errors: ValidationError[] = [];

        // Check if useWorktrees is enabled but workspace is not a Git repository
        if (config.useWorktrees && !this.isGitRepository()) {
            errors.push({
                field: 'useWorktrees',
                message: 'Git worktrees require a Git repository. Initialize Git or disable worktrees.',
                severity: 'warning'
            });
        }

        // Check if maxAgents is too high for system resources
        if (config.maxAgents && config.maxAgents > 5) {
            errors.push({
                field: 'maxAgents',
                message: 'High agent count may impact performance. Monitor system resources.',
                severity: 'info'
            });
        }

        // Check if metrics are enabled but output level is none
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

    private isGitRepository(): boolean {
        // Get the first workspace folder path
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        const root = workspaceFolders[0].uri.fsPath;

        // Check if .git directory exists
        const gitPath = path.join(root, '.git');
        return fs.existsSync(gitPath);
    }

    // Validate configuration migration between versions
    validateConfigurationMigration(oldConfig: Record<string, any>, newConfig: Record<string, any>): { isValid: boolean; errors: ValidationError[] } {
        const errors: ValidationError[] = [];

        // Check for removed configuration keys
        const removedKeys = Object.keys(oldConfig).filter(key => !(key in newConfig));
        if (removedKeys.length > 0) {
            errors.push({
                field: 'migration',
                message: `Removed configuration keys detected: ${removedKeys.join(', ')}. These will be ignored.`,
                severity: 'info'
            });
        }

        // Check for new required configuration keys
        const newRequiredKeys = Object.keys(newConfig).filter(key => !(key in oldConfig));
        if (newRequiredKeys.length > 0) {
            errors.push({
                field: 'migration',
                message: `New configuration keys available: ${newRequiredKeys.join(', ')}. Review and configure as needed.`,
                severity: 'info'
            });
        }

        return {
            isValid: true, // Migration validation is informational
            errors
        };
    }

    dispose(): void {
        this.validationErrors = [];
        this.logger?.debug('ConfigurationValidator disposed');
    }
}
