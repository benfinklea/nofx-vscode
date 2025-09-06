import { ConfigurationService } from '../../../services/ConfigurationService';
import { IConfigurationValidator, ValidationError, IEventBus } from '../../../services/interfaces';
import { createMockConfiguration } from '../../setup';
import * as vscode from 'vscode';

describe('ConfigurationService', () => {
    let configService: ConfigurationService;
    let mockValidator: jest.Mocked<IConfigurationValidator>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockConfig: any;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock configuration
        mockConfig = {
            get: jest.fn(),
            update: jest.fn(),
            has: jest.fn(),
            inspect: jest.fn()
        };

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
        (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockReturnValue({
            dispose: jest.fn()
        });

        // Mock validator
        mockValidator = {
            validateConfiguration: jest.fn(),
            validateConfigurationKey: jest.fn(),
            validateNofXConfiguration: jest.fn(),
            getValidationSchema: jest.fn(),
            getValidationErrors: jest.fn(),
            dispose: jest.fn()
        };

        // Mock event bus
        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            once: jest.fn(),
            filter: jest.fn(),
            subscribePattern: jest.fn(),
            setLoggingService: jest.fn(),
            dispose: jest.fn()
        };

        configService = new ConfigurationService(mockValidator, mockEventBus);
    });

    afterEach(() => {
        configService.dispose();
    });

    describe('Basic Configuration Operations', () => {
        it('should get configuration value with default', () => {
            mockConfig.get.mockReturnValue(undefined);

            const result = configService.get('testKey', 'defaultValue');

            expect(result).toBe('defaultValue');
            expect(mockConfig.get).toHaveBeenCalledWith('testKey');
        });

        it('should get configuration value from cache', () => {
            mockConfig.get.mockReturnValue('cachedValue');

            // First call should cache the value
            const result1 = configService.get('testKey', 'defaultValue');
            expect(result1).toBe('cachedValue');

            // Second call should use cache
            const result2 = configService.get('testKey', 'defaultValue');
            expect(result2).toBe('cachedValue');
            expect(mockConfig.get).toHaveBeenCalledTimes(1);
        });

        it('should get all configuration values', () => {
            mockConfig.get.mockImplementation((key: string) => {
                const values: Record<string, any> = {
                    maxAgents: 5,
                    claudePath: 'claude',
                    autoAssignTasks: true
                };
                return values[key];
            });

            const result = configService.getAll();

            expect(result).toHaveProperty('maxAgents', 5);
            expect(result).toHaveProperty('claudePath', 'claude');
            expect(result).toHaveProperty('autoAssignTasks', true);
        });

        it('should update configuration value', async () => {
            mockConfig.update.mockResolvedValue(undefined);
            mockValidator.validateConfigurationKey.mockReturnValue({ isValid: true, errors: [] });

            await configService.update('testKey', 'newValue');

            expect(mockValidator.validateConfigurationKey).toHaveBeenCalledWith('testKey', 'newValue');
            expect(mockConfig.update).toHaveBeenCalledWith('testKey', 'newValue', 1); // Workspace target
            expect(mockEventBus.publish).toHaveBeenCalledWith('configuration.updated', {
                key: 'testKey',
                value: 'newValue',
                target: 1
            });
        });

        it('should reject invalid configuration updates', async () => {
            const validationErrors: ValidationError[] = [{
                field: 'testKey',
                message: 'Invalid value',
                severity: 'error'
            }];

            mockValidator.validateConfigurationKey.mockReturnValue({ isValid: false, errors: validationErrors });

            await expect(configService.update('testKey', 'invalidValue'))
                .rejects.toThrow('Configuration validation failed for key \'testKey\': Invalid value');

            expect(mockConfig.update).not.toHaveBeenCalled();
        });
    });

    describe('Configuration Validation Integration', () => {
        it('should validate cached values on retrieval', () => {
            mockConfig.get.mockReturnValue('invalidValue');
            mockValidator.validateConfigurationKey.mockReturnValue({
                isValid: false,
                errors: [{ field: 'testKey', message: 'Invalid value', severity: 'error' }]
            });

            const result = configService.get('testKey', 'defaultValue');

            expect(result).toBe('defaultValue');
            expect(mockValidator.validateConfigurationKey).toHaveBeenCalledWith('testKey', 'invalidValue');
            expect(mockEventBus.publish).toHaveBeenCalledWith('configuration.validation.failed', {
                key: 'testKey',
                errors: [{ field: 'testKey', message: 'Invalid value', severity: 'error' }]
            });
        });

        it('should validate new values on retrieval', () => {
            mockConfig.get.mockReturnValue('newValue');
            mockValidator.validateConfigurationKey.mockReturnValue({ isValid: true, errors: [] });

            const result = configService.get('testKey', 'defaultValue');

            expect(result).toBe('newValue');
            expect(mockValidator.validateConfigurationKey).toHaveBeenCalledWith('testKey', 'newValue');
        });

        it('should validate all configuration', () => {
            const mockConfig = { maxAgents: 5, claudePath: 'claude' };
            mockValidator.validateConfiguration.mockReturnValue({ isValid: true, errors: [] });

            // Mock getAll to return test config
            jest.spyOn(configService, 'getAll').mockReturnValue(mockConfig);

            const result = configService.validateAll();

            expect(mockValidator.validateConfiguration).toHaveBeenCalledWith(mockConfig);
            expect(result.isValid).toBe(true);
        });

        it('should get validation errors', () => {
            const errors: ValidationError[] = [{
                field: 'maxAgents',
                message: 'Value too high',
                severity: 'warning'
            }];

            mockValidator.getValidationErrors.mockReturnValue(errors);

            const result = configService.getValidationErrors();

            expect(result).toEqual(errors);
            expect(mockValidator.getValidationErrors).toHaveBeenCalled();
        });
    });

    describe('NofX Specific Configuration Methods', () => {
        beforeEach(() => {
            mockConfig.get.mockImplementation((key: string) => {
                const values: Record<string, any> = {
                    maxAgents: 3,
                    claudePath: 'claude',
                    autoAssignTasks: true,
                    useWorktrees: true,
                    templatesPath: '.nofx/templates',
                    persistAgents: true,
                    logLevel: 'info'
                };
                return values[key];
            });
        });

        it('should get max agents', () => {
            const result = configService.getMaxAgents();
            expect(result).toBe(3);
        });

        it('should get claude path', () => {
            const result = configService.getClaudePath();
            expect(result).toBe('claude');
        });

        it('should check auto assign tasks', () => {
            const result = configService.isAutoAssignTasks();
            expect(result).toBe(true);
        });

        it('should check use worktrees', () => {
            const result = configService.isUseWorktrees();
            expect(result).toBe(true);
        });

        it('should get templates path', () => {
            const result = configService.getTemplatesPath();
            expect(result).toBe('.nofx/templates');
        });

        it('should check persist agents', () => {
            const result = configService.isPersistAgents();
            expect(result).toBe(true);
        });

        it('should get log level', () => {
            const result = configService.getLogLevel();
            expect(result).toBe('info');
        });
    });

    describe('Orchestration Configuration Methods', () => {
        beforeEach(() => {
            mockConfig.get.mockImplementation((key: string) => {
                const values: Record<string, any> = {
                    'orchestration.heartbeatInterval': 10000,
                    'orchestration.heartbeatTimeout': 30000,
                    'orchestration.historyLimit': 1000,
                    'orchestration.persistencePath': '.nofx/orchestration',
                    'orchestration.maxFileSize': 10485760
                };
                return values[key];
            });
        });

        it('should get orchestration heartbeat interval', () => {
            const result = configService.getOrchestrationHeartbeatInterval();
            expect(result).toBe(10000);
        });

        it('should get orchestration heartbeat timeout', () => {
            const result = configService.getOrchestrationHeartbeatTimeout();
            expect(result).toBe(30000);
        });

        it('should get orchestration history limit', () => {
            const result = configService.getOrchestrationHistoryLimit();
            expect(result).toBe(1000);
        });

        it('should get orchestration persistence path', () => {
            const result = configService.getOrchestrationPersistencePath();
            expect(result).toBe('.nofx/orchestration');
        });

        it('should get orchestration max file size', () => {
            const result = configService.getOrchestrationMaxFileSize();
            expect(result).toBe(10485760);
        });
    });

    describe('Configuration Backup and Restore', () => {
        it('should backup configuration', async () => {
            const mockConfig = { maxAgents: 5, claudePath: 'claude' };
            jest.spyOn(configService, 'getAll').mockReturnValue(mockConfig);

            const result = await configService.backupConfiguration();

            expect(result).toEqual(mockConfig);
            expect(mockEventBus.publish).toHaveBeenCalledWith('configuration.backed.up', {
                keys: ['maxAgents', 'claudePath']
            });
        });

        it('should restore configuration with validation', async () => {
            const backup = { maxAgents: 5, claudePath: 'claude' };
            mockValidator.validateConfiguration.mockReturnValue({ isValid: true, errors: [] });
            mockConfig.update.mockResolvedValue(undefined);

            await configService.restoreConfiguration(backup);

            expect(mockValidator.validateConfiguration).toHaveBeenCalledWith(backup);
            expect(mockConfig.update).toHaveBeenCalledWith('maxAgents', 5);
            expect(mockConfig.update).toHaveBeenCalledWith('claudePath', 'claude');
            expect(mockEventBus.publish).toHaveBeenCalledWith('configuration.restored', {
                keys: ['maxAgents', 'claudePath']
            });
        });

        it('should reject invalid backup during restore', async () => {
            const backup = { maxAgents: 15 }; // Invalid value
            const validationErrors: ValidationError[] = [{
                field: 'maxAgents',
                message: 'Value too high',
                severity: 'error'
            }];

            mockValidator.validateConfiguration.mockReturnValue({ isValid: false, errors: validationErrors });

            await expect(configService.restoreConfiguration(backup))
                .rejects.toThrow('Backup validation failed: Value too high');
        });
    });

    describe('Configuration Change Events', () => {
        it('should listen for configuration changes', () => {
            const callback = jest.fn();
            const mockDisposable = { dispose: jest.fn() };

            (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockReturnValue(mockDisposable);

            const disposable = configService.onDidChange(callback);

            expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
            expect(disposable).toBe(mockDisposable);
        });

        it('should handle configuration change events', () => {
            const mockEvent = {
                affectsConfiguration: jest.fn().mockReturnValue(true)
            };

            // Simulate configuration change
            const changeHandler = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0];
            changeHandler(mockEvent);

            expect(mockEvent.affectsConfiguration).toHaveBeenCalledWith('nofx');
            expect(mockEventBus.publish).toHaveBeenCalledWith('configuration.changed', {
                section: 'nofx'
            });
        });
    });

    describe('Error Scenarios', () => {
        it('should handle VS Code API failures gracefully', () => {
            mockConfig.get.mockImplementation(() => {
                throw new Error('VS Code API error');
            });

            const result = configService.get('testKey', 'defaultValue');

            expect(result).toBe('defaultValue');
        });

        it('should handle validation service unavailability', () => {
            const configServiceWithoutValidator = new ConfigurationService();

            const result = configServiceWithoutValidator.get('testKey', 'defaultValue');

            expect(result).toBe('defaultValue');
        });

        it('should handle malformed configuration values', () => {
            mockConfig.get.mockReturnValue(null);
            mockValidator.validateConfigurationKey.mockReturnValue({
                isValid: false,
                errors: [{ field: 'testKey', message: 'Invalid type', severity: 'error' }]
            });

            const result = configService.get('testKey', 'defaultValue');

            expect(result).toBe('defaultValue');
        });
    });

    describe('Performance', () => {
        it('should cache validation results', () => {
            mockConfig.get.mockReturnValue('testValue');
            mockValidator.validateConfigurationKey.mockReturnValue({ isValid: true, errors: [] });

            // First call
            configService.get('testKey', 'defaultValue');
            expect(mockValidator.validateConfigurationKey).toHaveBeenCalledTimes(1);

            // Second call should use cache
            configService.get('testKey', 'defaultValue');
            expect(mockValidator.validateConfigurationKey).toHaveBeenCalledTimes(1);
        });

        it('should clear validation cache on update', async () => {
            mockConfig.get.mockReturnValue('testValue');
            mockValidator.validateConfigurationKey.mockReturnValue({ isValid: true, errors: [] });
            mockConfig.update.mockResolvedValue(undefined);

            // Get value to populate cache
            configService.get('testKey', 'defaultValue');

            // Update value
            await configService.update('testKey', 'newValue');

            // Next get should validate again
            configService.get('testKey', 'defaultValue');
            expect(mockValidator.validateConfigurationKey).toHaveBeenCalledTimes(3); // Initial, update, and final get
        });
    });

    describe('Disposal', () => {
        it('should dispose properly', () => {
            const mockDisposable = { dispose: jest.fn() };
            (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockReturnValue(mockDisposable);

            configService.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });
});
