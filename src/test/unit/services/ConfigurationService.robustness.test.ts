import { ConfigurationService } from '../../../services/ConfigurationService';
import { IConfigurationValidator, IEventBus } from '../../../services/interfaces';
import * as vscode from 'vscode';

// Mock VS Code
jest.mock('vscode');

describe('ConfigurationService Robustness Settings', () => {
    let configService: ConfigurationService;
    let mockWorkspaceConfig: jest.Mocked<vscode.WorkspaceConfiguration>;
    let mockValidator: jest.Mocked<IConfigurationValidator>;
    let mockEventBus: jest.Mocked<IEventBus>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock workspace configuration
        mockWorkspaceConfig = {
            get: jest.fn(),
            has: jest.fn(),
            inspect: jest.fn(),
            update: jest.fn()
        };

        // Mock vscode.workspace.getConfiguration
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockWorkspaceConfig);

        // Setup mock validator
        mockValidator = {
            validateConfiguration: jest.fn(),
            validateConfigurationKey: jest.fn(),
            validateNofXConfiguration: jest.fn(),
            getValidationErrors: jest.fn().mockReturnValue([])
        };

        // Setup mock event bus
        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn()
        };

        configService = new ConfigurationService(mockValidator, mockEventBus);
    });

    afterEach(() => {
        configService.dispose();
    });

    describe('Robustness Configuration Getters', () => {
        describe('maxRetries setting', () => {
            it('should return configured max retries', () => {
                mockWorkspaceConfig.get.mockReturnValue(5);

                const maxRetries = configService.get('robustness.maxRetries');

                expect(mockWorkspaceConfig.get).toHaveBeenCalledWith('robustness.maxRetries');
                expect(maxRetries).toBe(5);
            });

            it('should return default when not configured', () => {
                mockWorkspaceConfig.get.mockReturnValue(undefined);

                const maxRetries = configService.get('robustness.maxRetries', 3);

                expect(maxRetries).toBe(3);
            });

            it('should validate max retries within bounds', () => {
                mockValidator.validateConfigurationKey.mockReturnValue({
                    isValid: true,
                    errors: []
                });

                mockWorkspaceConfig.get.mockReturnValue(2);
                const result = configService.get('robustness.maxRetries', 3);

                expect(mockValidator.validateConfigurationKey).toHaveBeenCalledWith('robustness.maxRetries', 2);
                expect(result).toBe(2);
            });

            it('should return default for invalid max retries', () => {
                mockValidator.validateConfigurationKey.mockReturnValue({
                    isValid: false,
                    errors: [{ field: 'robustness.maxRetries', message: 'Value too high', severity: 'error' }]
                });

                mockWorkspaceConfig.get.mockReturnValue(15); // Too high
                const result = configService.get('robustness.maxRetries', 3);

                expect(result).toBe(3);
                expect(mockEventBus.publish).toHaveBeenCalledWith(
                    'configuration.validation.failed',
                    expect.objectContaining({
                        key: 'robustness.maxRetries'
                    })
                );
            });
        });

        describe('baseRetryDelay setting', () => {
            it('should return configured base retry delay', () => {
                mockWorkspaceConfig.get.mockReturnValue(2000);

                const delay = configService.get('robustness.baseRetryDelay');

                expect(mockWorkspaceConfig.get).toHaveBeenCalledWith('robustness.baseRetryDelay');
                expect(delay).toBe(2000);
            });

            it('should handle minimum delay validation', () => {
                mockValidator.validateConfigurationKey.mockReturnValue({
                    isValid: false,
                    errors: [{ field: 'robustness.baseRetryDelay', message: 'Below minimum', severity: 'error' }]
                });

                mockWorkspaceConfig.get.mockReturnValue(100); // Too low
                const result = configService.get('robustness.baseRetryDelay', 1000);

                expect(result).toBe(1000);
            });
        });

        describe('healthCheckInterval setting', () => {
            it('should return configured health check interval', () => {
                mockWorkspaceConfig.get.mockReturnValue(60000);

                const interval = configService.get('robustness.healthCheckInterval');

                expect(interval).toBe(60000);
            });

            it('should handle interval bounds validation', () => {
                mockValidator.validateConfigurationKey
                    .mockReturnValueOnce({ isValid: true, errors: [] }) // First call succeeds
                    .mockReturnValueOnce({
                        // Second call fails
                        isValid: false,
                        errors: [
                            { field: 'robustness.healthCheckInterval', message: 'Invalid interval', severity: 'error' }
                        ]
                    });

                mockWorkspaceConfig.get.mockReturnValue(30000);
                let result = configService.get('robustness.healthCheckInterval', 30000);
                expect(result).toBe(30000);

                // Second call with invalid value
                mockWorkspaceConfig.get.mockReturnValue(1000); // Too short
                result = configService.get('robustness.healthCheckInterval', 30000);
                expect(result).toBe(30000); // Should return default
            });
        });

        describe('initializationTimeout setting', () => {
            it('should return configured initialization timeout', () => {
                mockWorkspaceConfig.get.mockReturnValue(60000);

                const timeout = configService.get('robustness.initializationTimeout');

                expect(timeout).toBe(60000);
            });
        });

        describe('responseTimeout setting', () => {
            it('should return configured response timeout', () => {
                mockWorkspaceConfig.get.mockReturnValue(15000);

                const timeout = configService.get('robustness.responseTimeout');

                expect(timeout).toBe(15000);
            });
        });

        describe('maxConsecutiveFailures setting', () => {
            it('should return configured max consecutive failures', () => {
                mockWorkspaceConfig.get.mockReturnValue(5);

                const maxFailures = configService.get('robustness.maxConsecutiveFailures');

                expect(maxFailures).toBe(5);
            });
        });

        describe('enableAutoRecovery setting', () => {
            it('should return configured auto recovery setting', () => {
                mockWorkspaceConfig.get.mockReturnValue(false);

                const enableAutoRecovery = configService.get('robustness.enableAutoRecovery');

                expect(enableAutoRecovery).toBe(false);
            });

            it('should default to true when not configured', () => {
                mockWorkspaceConfig.get.mockReturnValue(undefined);

                const enableAutoRecovery = configService.get('robustness.enableAutoRecovery', true);

                expect(enableAutoRecovery).toBe(true);
            });
        });

        describe('recoveryStrategy setting', () => {
            it('should return configured recovery strategy', () => {
                mockWorkspaceConfig.get.mockReturnValue('aggressive');

                const strategy = configService.get('robustness.recoveryStrategy');

                expect(strategy).toBe('aggressive');
            });

            it('should validate recovery strategy enum', () => {
                mockValidator.validateConfigurationKey.mockReturnValue({
                    isValid: false,
                    errors: [{ field: 'robustness.recoveryStrategy', message: 'Invalid strategy', severity: 'error' }]
                });

                mockWorkspaceConfig.get.mockReturnValue('invalid-strategy');
                const result = configService.get('robustness.recoveryStrategy', 'progressive');

                expect(result).toBe('progressive');
                expect(mockEventBus.publish).toHaveBeenCalledWith(
                    'configuration.validation.failed',
                    expect.objectContaining({
                        key: 'robustness.recoveryStrategy'
                    })
                );
            });
        });
    });

    describe('Configuration Updates', () => {
        it('should update robustness configuration with validation', async () => {
            mockValidator.validateConfigurationKey.mockReturnValue({
                isValid: true,
                errors: []
            });
            mockWorkspaceConfig.update.mockResolvedValue();

            await configService.update('robustness.maxRetries', 4);

            expect(mockValidator.validateConfigurationKey).toHaveBeenCalledWith('robustness.maxRetries', 4);
            expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                'robustness.maxRetries',
                4,
                vscode.ConfigurationTarget.Workspace
            );
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'configuration.updated',
                expect.objectContaining({
                    key: 'robustness.maxRetries',
                    value: 4
                })
            );
        });

        it('should reject invalid robustness configuration updates', async () => {
            mockValidator.validateConfigurationKey.mockReturnValue({
                isValid: false,
                errors: [{ field: 'robustness.maxRetries', message: 'Value too high', severity: 'error' }]
            });

            await expect(configService.update('robustness.maxRetries', 25)).rejects.toThrow(
                "Configuration validation failed for key 'robustness.maxRetries': Value too high"
            );

            expect(mockWorkspaceConfig.update).not.toHaveBeenCalled();
        });

        it('should validate recovery strategy enum values', async () => {
            mockValidator.validateConfigurationKey.mockReturnValue({
                isValid: false,
                errors: [
                    {
                        field: 'robustness.recoveryStrategy',
                        message: 'Must be one of: conservative, progressive, aggressive',
                        severity: 'error'
                    }
                ]
            });

            await expect(configService.update('robustness.recoveryStrategy', 'extreme')).rejects.toThrow(
                'Must be one of: conservative, progressive, aggressive'
            );
        });
    });

    describe('Configuration Caching', () => {
        it('should cache robustness configuration values', () => {
            mockWorkspaceConfig.get.mockReturnValue(7);

            // First call
            const first = configService.get('robustness.maxRetries');
            // Second call
            const second = configService.get('robustness.maxRetries');

            expect(first).toBe(7);
            expect(second).toBe(7);
            // Should only call the underlying config once due to caching
            expect(mockWorkspaceConfig.get).toHaveBeenCalledTimes(1);
        });

        it('should clear cache when configuration changes', () => {
            mockWorkspaceConfig.get.mockReturnValueOnce(3).mockReturnValueOnce(5);

            // First call
            const first = configService.get('robustness.maxRetries');

            // Simulate configuration change
            const configChangeEvent = {
                affectsConfiguration: jest.fn().mockReturnValue(true)
            };

            // Trigger configuration change event
            (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0](configChangeEvent);

            // Second call after change
            const second = configService.get('robustness.maxRetries');

            expect(first).toBe(3);
            expect(second).toBe(5);
            expect(mockWorkspaceConfig.get).toHaveBeenCalledTimes(2);
        });
    });

    describe('Validation Integration', () => {
        it('should validate all robustness settings together', () => {
            const robustnessConfig = {
                'robustness.maxRetries': 3,
                'robustness.baseRetryDelay': 1000,
                'robustness.healthCheckInterval': 30000,
                'robustness.initializationTimeout': 45000,
                'robustness.responseTimeout': 10000,
                'robustness.maxConsecutiveFailures': 3,
                'robustness.enableAutoRecovery': true,
                'robustness.recoveryStrategy': 'progressive'
            };

            // Mock getting all values
            Object.entries(robustnessConfig).forEach(([key, value]) => {
                mockWorkspaceConfig.get.mockImplementation(k => (k === key.split('.')[1] ? value : undefined));
            });

            mockValidator.validateNofXConfiguration.mockReturnValue({
                isValid: true,
                errors: []
            });

            const validation = configService.validateAll();

            expect(validation.isValid).toBe(true);
            expect(mockValidator.validateNofXConfiguration).toHaveBeenCalled();
        });

        it('should detect robustness configuration conflicts', () => {
            mockValidator.validateNofXConfiguration.mockReturnValue({
                isValid: false,
                errors: [
                    {
                        field: 'robustness',
                        message: 'Initialization timeout should be greater than health check interval',
                        severity: 'error'
                    }
                ]
            });

            const validation = configService.validateAll();

            expect(validation.isValid).toBe(false);
            expect(validation.errors).toHaveLength(1);
            expect(validation.errors[0].message).toContain('timeout should be greater than');
        });
    });

    describe('Error Handling', () => {
        it('should handle configuration API errors gracefully', () => {
            mockWorkspaceConfig.get.mockImplementation(() => {
                throw new Error('Configuration API error');
            });

            const result = configService.get('robustness.maxRetries', 3);

            expect(result).toBe(3); // Should return default
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'configuration.api.error',
                expect.objectContaining({
                    key: 'robustness.maxRetries',
                    error: 'Configuration API error',
                    operation: 'get'
                })
            );
        });

        it('should handle validation errors during update', async () => {
            mockValidator.validateConfigurationKey.mockImplementation(() => {
                throw new Error('Validator crashed');
            });

            const result = configService.get('robustness.maxRetries', 3);

            expect(result).toBe(3);
        });

        it('should handle configuration update failures', async () => {
            mockValidator.validateConfigurationKey.mockReturnValue({
                isValid: true,
                errors: []
            });
            mockWorkspaceConfig.update.mockRejectedValue(new Error('Update failed'));

            await expect(configService.update('robustness.maxRetries', 4)).rejects.toThrow(
                "Failed to update configuration key 'robustness.maxRetries': Update failed"
            );

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'configuration.update.failed',
                expect.objectContaining({
                    key: 'robustness.maxRetries',
                    error: 'Update failed'
                })
            );
        });
    });

    describe('Configuration Backup and Restore', () => {
        it('should backup robustness configuration', async () => {
            const robustnessSettings = {
                'robustness.maxRetries': 4,
                'robustness.enableAutoRecovery': false,
                'robustness.recoveryStrategy': 'conservative'
            };

            Object.entries(robustnessSettings).forEach(([key, value]) => {
                mockWorkspaceConfig.get.mockImplementation(k => (k === key ? value : undefined));
            });

            const backup = await configService.backupConfiguration();

            expect(backup).toEqual(expect.objectContaining(robustnessSettings));
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'configuration.backed.up',
                expect.objectContaining({
                    keys: expect.arrayContaining(Object.keys(robustnessSettings))
                })
            );
        });

        it('should restore robustness configuration with validation', async () => {
            const backup = {
                'robustness.maxRetries': 5,
                'robustness.baseRetryDelay': 2000,
                'robustness.recoveryStrategy': 'aggressive'
            };

            mockValidator.validateConfiguration.mockReturnValue({
                isValid: true,
                errors: []
            });

            mockValidator.validateConfigurationKey.mockReturnValue({
                isValid: true,
                errors: []
            });

            mockWorkspaceConfig.update.mockResolvedValue();

            await configService.restoreConfiguration(backup);

            expect(mockValidator.validateConfiguration).toHaveBeenCalled();
            expect(mockWorkspaceConfig.update).toHaveBeenCalledTimes(3);
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'configuration.restored',
                expect.objectContaining({
                    keys: Object.keys(backup)
                })
            );
        });

        it('should reject invalid backup during restore', async () => {
            const invalidBackup = {
                'robustness.maxRetries': 100, // Too high
                'robustness.recoveryStrategy': 'invalid'
            };

            mockValidator.validateConfiguration.mockReturnValue({
                isValid: false,
                errors: [
                    {
                        field: 'robustness.maxRetries',
                        message: 'Value exceeds maximum',
                        severity: 'error'
                    }
                ]
            });

            await expect(configService.restoreConfiguration(invalidBackup)).rejects.toThrow('Backup validation failed');
        });
    });
});
