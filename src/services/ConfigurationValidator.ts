import { z } from 'zod';
import { IConfigurationValidator, ValidationError, ILoggingService, INotificationService } from './interfaces';

export class ConfigurationValidator implements IConfigurationValidator {
    private validationErrors: ValidationError[] = [];
    private logger: ILoggingService;
    private notificationService: INotificationService;

    constructor(logger: ILoggingService, notificationService: INotificationService) {
        this.logger = logger;
        this.notificationService = notificationService;
    }

    // Comprehensive validation schema for all configuration keys
    private buildValidationSchema() {
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
            }),
            
            autoStart: z.boolean(),
            
            claudeCommandStyle: z.enum(['simple', 'interactive', 'heredoc', 'file'], {
                errorMap: () => ({ message: 'Claude command style must be one of: simple, interactive, heredoc, file' })
            }),
            
            enableMetrics: z.boolean(),
            
            metricsOutputLevel: z.enum(['none', 'basic', 'detailed'], {
                errorMap: () => ({ message: 'Metrics output level must be one of: none, basic, detailed' })
            }),
            
            testMode: z.boolean(),
            
            // Orchestration settings
            orchestration: z.object({
                heartbeatInterval: z.number().int().min(1000).max(60000),
                heartbeatTimeout: z.number().int().min(5000).max(300000),
                historyLimit: z.number().int().min(100).max(10000),
                persistencePath: z.string().min(1),
                maxFileSize: z.number().int().min(1024).max(104857600) // 1KB to 100MB
            }).optional()
        }).refine((data) => {
            // Cross-field validation: if useWorktrees is true, workspace should be a Git repository
            // This is handled at runtime since we can't check Git status in schema validation
            return true;
        });
    }

    validateConfiguration(config: Record<string, any>): { isValid: boolean; errors: ValidationError[] } {
        this.logger.debug('Validating configuration', { configKeys: Object.keys(config) });
        
        try {
            const schema = this.buildValidationSchema();
            const result = schema.safeParse(config);
            
            if (result.success) {
                this.validationErrors = [];
                this.logger.debug('Configuration validation successful');
                return { isValid: true, errors: [] };
            } else {
                this.validationErrors = this.mapZodErrorsToValidationErrors(result.error.errors);
                this.logger.warn('Configuration validation failed', { errors: this.validationErrors });
                return { isValid: false, errors: this.validationErrors };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
            this.logger.error('Configuration validation error', { error: errorMessage });
            
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
        this.logger.debug('Validating configuration key', { key, value });
        
        try {
            const schema = this.buildValidationSchema();
            const partialSchema = schema.pick({ [key]: true } as any);
            const result = partialSchema.safeParse({ [key]: value });
            
            if (result.success) {
                this.logger.debug('Configuration key validation successful', { key });
                return { isValid: true, errors: [] };
            } else {
                const errors = this.mapZodErrorsToValidationErrors(result.error.errors);
                this.logger.warn('Configuration key validation failed', { key, errors });
                return { isValid: false, errors };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
            this.logger.error('Configuration key validation error', { key, error: errorMessage });
            
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
        // This would check if the current workspace is a Git repository
        // For now, return true as a placeholder
        // In a real implementation, this would check for .git directory
        return true;
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
        this.logger.debug('ConfigurationValidator disposed');
    }
}
