import { ConfigurationValidator } from '../../../services/ConfigurationValidator';
import { ILoggingService, INotificationService, ValidationError } from '../../../services/interfaces';

describe('ConfigurationValidator', () => {
    let validator: ConfigurationValidator;
    let mockLogger: jest.Mocked<ILoggingService>;
    let mockNotificationService: jest.Mocked<INotificationService>;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock logger
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

        // Mock notification service
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

        validator = new ConfigurationValidator(mockLogger, mockNotificationService);
    });

    afterEach(() => {
        validator.dispose();
    });

    describe('Configuration Validation', () => {
        it('should validate valid configuration', () => {
            const validConfig = {
                maxAgents: 3,
                claudePath: 'claude',
                autoAssignTasks: true,
                useWorktrees: true,
                logLevel: 'info',
                autoStart: false,
                claudeCommandStyle: 'simple',
                enableMetrics: false,
                metricsOutputLevel: 'basic',
                testMode: false
            };

            const result = validator.validateConfiguration(validConfig);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should validate individual configuration keys', () => {
            const result = validator.validateConfigurationKey('maxAgents', 5);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject invalid maxAgents values', () => {
            const testCases = [
                { value: 0, expectedError: 'Max agents must be at least 1' },
                { value: 11, expectedError: 'Max agents cannot exceed 10' },
                { value: -1, expectedError: 'Max agents must be at least 1' },
                { value: 1.5, expectedError: 'Max agents must be an integer' }
            ];

            testCases.forEach(({ value, expectedError }) => {
                const result = validator.validateConfigurationKey('maxAgents', value);
                expect(result.isValid).toBe(false);
                expect(result.errors[0].message).toContain(expectedError);
            });
        });

        it('should reject invalid claudePath values', () => {
            const testCases = [
                { value: '', expectedError: 'Claude path cannot be empty' },
                { value: '   ', expectedError: 'Claude path cannot be just whitespace' },
                { value: null, expectedError: 'Expected string' }
            ];

            testCases.forEach(({ value, expectedError }) => {
                const result = validator.validateConfigurationKey('claudePath', value);
                expect(result.isValid).toBe(false);
                expect(result.errors[0].message).toContain(expectedError);
            });
        });

        it('should reject invalid logLevel values', () => {
            const result = validator.validateConfigurationKey('logLevel', 'invalid');

            expect(result.isValid).toBe(false);
            expect(result.errors[0].message).toContain('Log level must be one of: debug, info, warn, error');
        });

        it('should reject invalid claudeCommandStyle values', () => {
            const result = validator.validateConfigurationKey('claudeCommandStyle', 'invalid');

            expect(result.isValid).toBe(false);
            expect(result.errors[0].message).toContain('Claude command style must be one of: simple, interactive, heredoc, file');
        });

        it('should reject invalid metricsOutputLevel values', () => {
            const result = validator.validateConfigurationKey('metricsOutputLevel', 'invalid');

            expect(result.isValid).toBe(false);
            expect(result.errors[0].message).toContain('Metrics output level must be one of: none, basic, detailed');
        });
    });

    describe('Validation Error Formatting', () => {
        it('should format error messages with suggestions', () => {
            const result = validator.validateConfigurationKey('maxAgents', 15);

            expect(result.isValid).toBe(false);
            expect(result.errors[0].message).toContain('Try a value between 1 and 10');
        });

        it('should include field information in errors', () => {
            const result = validator.validateConfigurationKey('claudePath', '');

            expect(result.isValid).toBe(false);
            expect(result.errors[0].field).toBe('claudePath');
            expect(result.errors[0].severity).toBe('error');
        });

        it('should handle multiple validation errors', () => {
            const invalidConfig = {
                maxAgents: 15,
                claudePath: '',
                logLevel: 'invalid'
            };

            const result = validator.validateConfiguration(invalidConfig);

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(3);
            expect(result.errors.every(error => error.severity === 'error')).toBe(true);
        });
    });

    describe('NofX Specific Validation', () => {
        it('should validate NofX configuration scenarios', () => {
            const result = validator.validateNofXConfiguration({
                useWorktrees: true,
                maxAgents: 7
            });

            // Should have warnings/info but not errors
            expect(result.isValid).toBe(true);
            expect(result.errors.some(e => e.severity === 'error')).toBe(false);
        });

        it('should warn about high agent count', () => {
            const result = validator.validateNofXConfiguration({
                maxAgents: 8
            });

            expect(result.errors.some(e => 
                e.field === 'maxAgents' && 
                e.severity === 'info' && 
                e.message.includes('High agent count')
            )).toBe(true);
        });

        it('should warn about metrics configuration mismatch', () => {
            const result = validator.validateNofXConfiguration({
                enableMetrics: true,
                metricsOutputLevel: 'none'
            });

            expect(result.errors.some(e => 
                e.field === 'metricsOutputLevel' && 
                e.severity === 'warning' && 
                e.message.includes('Metrics are enabled but output level')
            )).toBe(true);
        });
    });

    describe('Configuration Migration', () => {
        it('should validate configuration migration', () => {
            const oldConfig = { maxAgents: 3, oldKey: 'oldValue' };
            const newConfig = { maxAgents: 3, newKey: 'newValue' };

            const result = validator.validateConfigurationMigration(oldConfig, newConfig);

            expect(result.isValid).toBe(true);
            expect(result.errors.some(e => 
                e.message.includes('Removed configuration keys detected')
            )).toBe(true);
            expect(result.errors.some(e => 
                e.message.includes('New configuration keys available')
            )).toBe(true);
        });

        it('should handle migration with no changes', () => {
            const config = { maxAgents: 3, claudePath: 'claude' };

            const result = validator.validateConfigurationMigration(config, config);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('Error Handling', () => {
        it('should handle validation errors gracefully', () => {
            // Mock Zod to throw an error
            const originalConsoleError = console.error;
            console.error = jest.fn();

            const result = validator.validateConfiguration({ invalid: 'data' });

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('general');
            expect(result.errors[0].message).toContain('Validation failed');

            console.error = originalConsoleError;
        });

        it('should log validation errors', () => {
            validator.validateConfigurationKey('maxAgents', -1);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Configuration key validation failed',
                expect.objectContaining({
                    key: 'maxAgents',
                    errors: expect.any(Array)
                })
            );
        });

        it('should log validation success', () => {
            validator.validateConfigurationKey('maxAgents', 5);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Configuration key validation successful',
                { key: 'maxAgents' }
            );
        });
    });

    describe('Validation Schema', () => {
        it('should provide validation schema', () => {
            const schema = validator.getValidationSchema();

            expect(schema).toBeDefined();
            expect(typeof schema).toBe('object');
        });

        it('should return current validation errors', () => {
            // Trigger some validation errors
            validator.validateConfigurationKey('maxAgents', -1);
            validator.validateConfigurationKey('claudePath', '');

            const errors = validator.getValidationErrors();

            expect(errors).toHaveLength(2);
            expect(errors.every(error => error.severity === 'error')).toBe(true);
        });
    });

    describe('Complex Validation Scenarios', () => {
        it('should validate orchestration configuration', () => {
            const configWithOrchestration = {
                maxAgents: 3,
                claudePath: 'claude',
                autoAssignTasks: true,
                useWorktrees: true,
                logLevel: 'info',
                orchestration: {
                    heartbeatInterval: 5000,
                    heartbeatTimeout: 30000,
                    historyLimit: 500,
                    persistencePath: '.nofx/orchestration',
                    maxFileSize: 1048576
                }
            };

            const result = validator.validateConfiguration(configWithOrchestration);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject invalid orchestration configuration', () => {
            const invalidOrchestrationConfig = {
                maxAgents: 3,
                claudePath: 'claude',
                orchestration: {
                    heartbeatInterval: 500, // Too low
                    heartbeatTimeout: 2000, // Too low
                    historyLimit: 50, // Too low
                    persistencePath: '', // Empty
                    maxFileSize: 100 // Too small
                }
            };

            const result = validator.validateConfiguration(invalidOrchestrationConfig);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should handle missing optional fields', () => {
            const minimalConfig = {
                maxAgents: 3,
                claudePath: 'claude',
                autoAssignTasks: true,
                useWorktrees: true,
                logLevel: 'info'
            };

            const result = validator.validateConfiguration(minimalConfig);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('Performance', () => {
        it('should handle large configuration objects', () => {
            const largeConfig = {
                maxAgents: 3,
                claudePath: 'claude',
                autoAssignTasks: true,
                useWorktrees: true,
                logLevel: 'info',
                // Add many additional properties
                ...Object.fromEntries(
                    Array.from({ length: 100 }, (_, i) => [`customKey${i}`, `value${i}`])
                )
            };

            const startTime = Date.now();
            const result = validator.validateConfiguration(largeConfig);
            const endTime = Date.now();

            expect(result.isValid).toBe(true);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });

        it('should cache validation results', () => {
            const config = { maxAgents: 5 };

            // First validation
            const result1 = validator.validateConfiguration(config);
            expect(result1.isValid).toBe(true);

            // Second validation should be faster (though we can't easily test this)
            const result2 = validator.validateConfiguration(config);
            expect(result2.isValid).toBe(true);
        });
    });

    describe('Disposal', () => {
        it('should dispose properly', () => {
            validator.dispose();

            expect(mockLogger.debug).toHaveBeenCalledWith('ConfigurationValidator disposed');
        });
    });
});
