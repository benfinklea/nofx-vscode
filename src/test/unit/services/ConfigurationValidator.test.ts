import { ConfigurationValidator } from '../../../services/ConfigurationValidator';
import { ILoggingService, INotificationService, ValidationError } from '../../../services/interfaces';

// Mock VS Code
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [
            { uri: { fsPath: '/test/workspace' } }
        ]
    }
}));

// Mock fs
jest.mock('fs', () => ({
    existsSync: jest.fn()
}));

describe('ConfigurationValidator', () => {
    let validator: ConfigurationValidator;
    let mockLogger: jest.Mocked<ILoggingService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockFs: any;

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn(),
            getChannel: jest.fn(),
            time: jest.fn(),
            timeEnd: jest.fn(),
            dispose: jest.fn()
        };

        mockNotificationService = {
            showInformation: jest.fn(),
            showWarning: jest.fn(),
            showError: jest.fn(),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            withProgress: jest.fn(),
            confirm: jest.fn(),
            confirmDestructive: jest.fn()
        };

        mockFs = require('fs');
        mockFs.existsSync.mockReturnValue(true); // Default to Git repo exists

        validator = new ConfigurationValidator(mockLogger, mockNotificationService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Schema Validation', () => {
        it('should validate valid configuration successfully', () => {
            const validConfig = {
                maxAgents: 5,
                claudePath: 'claude',
                autoAssignTasks: true,
                useWorktrees: false,
                logLevel: 'info',
                autoStart: false,
                claudeCommandStyle: 'simple',
                enableMetrics: true,
                metricsOutputLevel: 'basic',
                testMode: false,
                metricsRetentionHours: 24
            };

            const result = validator.validateConfiguration(validConfig);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject invalid maxAgents values', () => {
            const invalidConfigs = [
                { maxAgents: 0 }, // Too small
                { maxAgents: 11 }, // Too large
                { maxAgents: 'invalid' }, // Wrong type
                { maxAgents: -1 } // Negative
            ];

            invalidConfigs.forEach(config => {
                const result = validator.validateConfiguration(config);
                expect(result.isValid).toBe(false);
                expect(result.errors.some(e => e.field === 'maxAgents')).toBe(true);
            });
        });

        it('should reject invalid claudePath values', () => {
            const invalidConfigs = [
                { claudePath: '' }, // Empty
                { claudePath: '   ' }, // Whitespace only
                { claudePath: null }, // Null
                { claudePath: undefined } // Undefined
            ];

            invalidConfigs.forEach(config => {
                const result = validator.validateConfiguration(config);
                expect(result.isValid).toBe(false);
                expect(result.errors.some(e => e.field === 'claudePath')).toBe(true);
            });
        });

        it('should reject invalid logLevel values', () => {
            const invalidConfig = {
                logLevel: 'invalid'
            };

            const result = validator.validateConfiguration(invalidConfig);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'logLevel')).toBe(true);
        });

        it('should reject invalid claudeCommandStyle values', () => {
            const invalidConfig = {
                claudeCommandStyle: 'invalid'
            };

            const result = validator.validateConfiguration(invalidConfig);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'claudeCommandStyle')).toBe(true);
        });

        it('should reject invalid metricsOutputLevel values', () => {
            const invalidConfig = {
                metricsOutputLevel: 'invalid'
            };

            const result = validator.validateConfiguration(invalidConfig);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.field === 'metricsOutputLevel')).toBe(true);
        });

        it('should reject invalid metricsRetentionHours values', () => {
            const invalidConfigs = [
                { metricsRetentionHours: 0 }, // Too small
                { metricsRetentionHours: 169 }, // Too large
                { metricsRetentionHours: 'invalid' }, // Wrong type
                { metricsRetentionHours: -1 } // Negative
            ];

            invalidConfigs.forEach(config => {
                const result = validator.validateConfiguration(config);
                expect(result.isValid).toBe(false);
                expect(result.errors.some(e => e.field === 'metricsRetentionHours')).toBe(true);
            });
        });

        it('should reject invalid orchestration configuration', () => {
            const invalidConfig = {
                orchestration: {
                    heartbeatInterval: 500, // Too small
                    heartbeatTimeout: 1000, // Too small
                    historyLimit: 50, // Too small
                    persistencePath: '', // Empty
                    maxFileSize: 500 // Too small
                }
            };

            const result = validator.validateConfiguration(invalidConfig);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.some(e => e.field.includes('orchestration'))).toBe(true);
        });
    });

    describe('Key Validation', () => {
        it('should validate individual configuration keys', () => {
            expect(validator.validateConfigurationKey('maxAgents', 5).isValid).toBe(true);
            expect(validator.validateConfigurationKey('claudePath', 'claude').isValid).toBe(true);
            expect(validator.validateConfigurationKey('logLevel', 'info').isValid).toBe(true);
            expect(validator.validateConfigurationKey('enableMetrics', true).isValid).toBe(true);
            expect(validator.validateConfigurationKey('metricsOutputLevel', 'detailed').isValid).toBe(true);
            expect(validator.validateConfigurationKey('metricsRetentionHours', 72).isValid).toBe(true);
        });

        it('should reject invalid individual keys', () => {
            expect(validator.validateConfigurationKey('maxAgents', 0).isValid).toBe(false);
            expect(validator.validateConfigurationKey('claudePath', '').isValid).toBe(false);
            expect(validator.validateConfigurationKey('logLevel', 'invalid').isValid).toBe(false);
            expect(validator.validateConfigurationKey('metricsOutputLevel', 'high').isValid).toBe(false);
            expect(validator.validateConfigurationKey('metricsRetentionHours', 0).isValid).toBe(false);
            expect(validator.validateConfigurationKey('metricsRetentionHours', 200).isValid).toBe(false);
        });

        it('should handle dotted keys for nested configuration', () => {
            expect(validator.validateConfigurationKey('orchestration.heartbeatInterval', 5000).isValid).toBe(true);
            expect(validator.validateConfigurationKey('orchestration.heartbeatTimeout', 30000).isValid).toBe(true);
            expect(validator.validateConfigurationKey('orchestration.historyLimit', 1000).isValid).toBe(true);
            expect(validator.validateConfigurationKey('orchestration.persistencePath', '/path').isValid).toBe(true);
            expect(validator.validateConfigurationKey('orchestration.maxFileSize', 1024000).isValid).toBe(true);
        });

        it('should reject invalid dotted keys', () => {
            expect(validator.validateConfigurationKey('orchestration.heartbeatInterval', 500).isValid).toBe(false);
            expect(validator.validateConfigurationKey('orchestration.heartbeatTimeout', 1000).isValid).toBe(false);
            expect(validator.validateConfigurationKey('orchestration.historyLimit', 50).isValid).toBe(false);
            expect(validator.validateConfigurationKey('orchestration.persistencePath', '').isValid).toBe(false);
            expect(validator.validateConfigurationKey('orchestration.maxFileSize', 500).isValid).toBe(false);
        });

        it('should allow unknown keys to pass through', () => {
            const result = validator.validateConfigurationKey('unknownKey', 'anyValue');
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('Cross-field Validation', () => {
        it('should warn when useWorktrees is enabled but not in Git repository', () => {
            mockFs.existsSync.mockReturnValue(false); // No Git repo

            const config = {
                useWorktrees: true
            };

            const result = validator.validateNofXConfiguration(config);

            expect(result.isValid).toBe(true); // Should still be valid (warning only)
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('useWorktrees');
            expect(result.errors[0].severity).toBe('warning');
            expect(result.errors[0].message).toContain('Git worktrees require a Git repository');
        });

        it('should not warn when useWorktrees is enabled and in Git repository', () => {
            mockFs.existsSync.mockReturnValue(true); // Git repo exists

            const config = {
                useWorktrees: true
            };

            const result = validator.validateNofXConfiguration(config);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should not warn when useWorktrees is disabled', () => {
            mockFs.existsSync.mockReturnValue(false); // No Git repo

            const config = {
                useWorktrees: false
            };

            const result = validator.validateNofXConfiguration(config);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should warn when maxAgents is high', () => {
            const config = {
                maxAgents: 8
            };

            const result = validator.validateNofXConfiguration(config);

            expect(result.isValid).toBe(true); // Should still be valid (info only)
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('maxAgents');
            expect(result.errors[0].severity).toBe('info');
            expect(result.errors[0].message).toContain('High agent count may impact performance');
        });

        it('should not warn when maxAgents is reasonable', () => {
            const config = {
                maxAgents: 3
            };

            const result = validator.validateNofXConfiguration(config);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should warn when metrics are enabled but output level is none', () => {
            const config = {
                enableMetrics: true,
                metricsOutputLevel: 'none'
            };

            const result = validator.validateNofXConfiguration(config);

            expect(result.isValid).toBe(true); // Should still be valid (warning only)
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('metricsOutputLevel');
            expect(result.errors[0].severity).toBe('warning');
            expect(result.errors[0].message).toContain('Metrics are enabled but output level is set to none');
        });

        it('should not warn when metrics are disabled', () => {
            const config = {
                enableMetrics: false,
                metricsOutputLevel: 'none'
            };

            const result = validator.validateNofXConfiguration(config);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should not warn when metrics are enabled with proper output level', () => {
            const config = {
                enableMetrics: true,
                metricsOutputLevel: 'basic'
            };

            const result = validator.validateNofXConfiguration(config);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should handle multiple warnings', () => {
            mockFs.existsSync.mockReturnValue(false); // No Git repo

            const config = {
                useWorktrees: true,
                maxAgents: 8,
                enableMetrics: true,
                metricsOutputLevel: 'none'
            };

            const result = validator.validateNofXConfiguration(config);

            expect(result.isValid).toBe(true); // Should still be valid (warnings only)
            expect(result.errors).toHaveLength(3);
            expect(result.errors.some(e => e.field === 'useWorktrees')).toBe(true);
            expect(result.errors.some(e => e.field === 'maxAgents')).toBe(true);
            expect(result.errors.some(e => e.field === 'metricsOutputLevel')).toBe(true);
        });
    });

    describe('Configuration Migration Validation', () => {
        it('should handle configuration migration validation', () => {
            const oldConfig = {
                oldKey1: 'value1',
                oldKey2: 'value2'
            };

            const newConfig = {
                newKey1: 'value1',
                newKey2: 'value2',
                newKey3: 'value3'
            };

            const result = validator.validateConfigurationMigration(oldConfig, newConfig);

            expect(result.isValid).toBe(true); // Migration validation is informational
            expect(result.errors).toHaveLength(2);
            expect(result.errors.some(e => e.message.includes('Removed configuration keys'))).toBe(true);
            expect(result.errors.some(e => e.message.includes('New configuration keys'))).toBe(true);
        });

        it('should handle identical configurations', () => {
            const config = {
                key1: 'value1',
                key2: 'value2'
            };

            const result = validator.validateConfigurationMigration(config, config);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('Error Handling', () => {
        it('should handle validation errors gracefully', () => {
            // Mock a scenario where validation throws an error
            const originalBuildValidationSchema = validator['buildValidationSchema'];
            validator['buildValidationSchema'] = jest.fn().mockImplementation(() => {
                throw new Error('Schema build failed');
            });

            const result = validator.validateConfiguration({});

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('general');
            expect(result.errors[0].message).toContain('Validation failed: Schema build failed');

            // Restore original method
            validator['buildValidationSchema'] = originalBuildValidationSchema;
        });

        it('should handle key validation errors gracefully', () => {
            // Mock a scenario where key validation throws an error
            const originalBuildValidationSchema = validator['buildValidationSchema'];
            validator['buildValidationSchema'] = jest.fn().mockImplementation(() => {
                throw new Error('Key validation failed');
            });

            const result = validator.validateConfigurationKey('testKey', 'testValue');

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('testKey');
            expect(result.errors[0].message).toContain('Validation failed for testKey: Key validation failed');

            // Restore original method
            validator['buildValidationSchema'] = originalBuildValidationSchema;
        });
    });

    describe('Utility Methods', () => {
        it('should return validation schema', () => {
            const schema = validator.getValidationSchema();
            expect(schema).toBeDefined();
            expect(typeof schema).toBe('object');
        });

        it('should return validation errors', () => {
            // First validate something to generate errors
            validator.validateConfiguration({ maxAgents: 0 });

            const errors = validator.getValidationErrors();
            expect(Array.isArray(errors)).toBe(true);
        });

        it('should dispose properly', () => {
            expect(() => validator.dispose()).not.toThrow();
            expect(mockLogger.debug).toHaveBeenCalledWith('ConfigurationValidator disposed');
        });
    });
});
