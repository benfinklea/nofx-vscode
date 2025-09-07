import * as vscode from 'vscode';
import { ConfigurationService } from '../../../services/ConfigurationService';

// Mock interfaces for testing
interface IConfigurationValidator {
    validateConfiguration(config: any): { isValid: boolean; errors: ValidationError[] };
    validateNofXConfiguration(config: any): { isValid: boolean; errors: ValidationError[] };
    validateConfigurationKey(key: string, value: any): { isValid: boolean; errors: ValidationError[] };
    getValidationErrors(): ValidationError[];
}

interface IEventBus {
    publish(event: string, data: any): void;
    subscribe(event: string, handler: Function): void;
    unsubscribe(event: string, handler: Function): void;
}

interface ValidationError {
    key: string;
    message: string;
    severity: 'error' | 'warning';
    value: any;
}

// Mock constants
const CONFIG_EVENTS = {
    CONFIG_CHANGED: 'config.changed',
    CONFIG_UPDATED: 'config.updated',
    CONFIG_UPDATE_FAILED: 'config.updateFailed',
    CONFIG_VALIDATION_FAILED: 'config.validationFailed',
    CONFIG_API_ERROR: 'config.apiError',
    CONFIG_BACKED_UP: 'config.backedUp',
    CONFIG_RESTORED: 'config.restored'
};

// Mock VS Code API
const mockConfigurationChangeEvent = {
    affectsConfiguration: jest.fn()
};

const mockWorkspaceConfiguration = {
    get: jest.fn(),
    update: jest.fn(),
    has: jest.fn(),
    inspect: jest.fn()
};

const mockDisposable = {
    dispose: jest.fn()
};

Object.defineProperty(vscode.workspace, 'getConfiguration', {
    value: jest.fn().mockReturnValue(mockWorkspaceConfiguration),
    configurable: true
});

Object.defineProperty(vscode.workspace, 'onDidChangeConfiguration', {
    value: jest.fn().mockReturnValue(mockDisposable),
    configurable: true
});

Object.defineProperty(vscode.ConfigurationTarget, 'Workspace', {
    value: 2,
    configurable: true
});

Object.defineProperty(vscode.ConfigurationTarget, 'Global', {
    value: 1,
    configurable: true
});

describe('ConfigurationService', () => {
    let configurationService: ConfigurationService;
    let mockValidator: jest.Mocked<IConfigurationValidator>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockOnDidChangeConfiguration: jest.Mock;

    const mockValidationError: ValidationError = {
        key: 'maxAgents',
        message: 'Must be between 1 and 10',
        severity: 'error',
        value: 15
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock validator
        mockValidator = {
            validateConfiguration: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
            validateNofXConfiguration: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
            validateConfigurationKey: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
            getValidationErrors: jest.fn().mockReturnValue([])
        };

        // Setup mock event bus
        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn()
        };

        // Setup VS Code mocks
        mockOnDidChangeConfiguration = jest.fn().mockReturnValue(mockDisposable);
        (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;

        mockConfigurationChangeEvent.affectsConfiguration.mockReturnValue(true);
        mockWorkspaceConfiguration.get.mockImplementation((key: string) => {
            const values: Record<string, any> = {
                'maxAgents': 3,
                'claudePath': 'claude',
                'autoAssignTasks': true,
                'useWorktrees': true,
                'logLevel': 'info',
                'showAgentTerminalOnSpawn': false,
                'templatesPath': '.nofx/templates',
                'persistAgents': true
            };
            return values[key];
        });

        configurationService = new ConfigurationService(mockValidator, mockEventBus);
    });

    afterEach(() => {
        configurationService?.dispose();
    });

    describe('initialization', () => {
        it('should initialize with validator and event bus', () => {
            expect(configurationService).toBeInstanceOf(ConfigurationService);
            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('nofx');
            expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
        });

        it('should initialize without dependencies', () => {
            const serviceWithoutDeps = new ConfigurationService();
            expect(serviceWithoutDeps).toBeInstanceOf(ConfigurationService);
            serviceWithoutDeps.dispose();
        });

        it('should register configuration change listener', () => {
            expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();

            // Simulate configuration change
            const changeHandler = mockOnDidChangeConfiguration.mock.calls[0][0];
            changeHandler(mockConfigurationChangeEvent);

            expect(mockConfigurationChangeEvent.affectsConfiguration).toHaveBeenCalledWith('nofx');
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                CONFIG_EVENTS.CONFIG_CHANGED,
                { section: 'nofx' }
            );
        });

        it('should not publish config change event for unrelated sections', () => {
            mockConfigurationChangeEvent.affectsConfiguration.mockReturnValue(false);

            const changeHandler = mockOnDidChangeConfiguration.mock.calls[0][0];
            changeHandler(mockConfigurationChangeEvent);

            expect(mockEventBus.publish).not.toHaveBeenCalledWith(
                CONFIG_EVENTS.CONFIG_CHANGED,
                expect.anything()
            );
        });
    });

    describe('get method', () => {
        it('should return cached value when available', () => {
            const value = configurationService.get('maxAgents');
            expect(value).toBe(3);
        });

        it('should return default value when configuration key not found', () => {
            mockWorkspaceConfiguration.get.mockReturnValue(undefined);

            const value = configurationService.get('nonExistentKey', 'defaultValue');
            expect(value).toBe('defaultValue');
        });

        it('should validate cached value when validator available', () => {
            mockValidator.validateConfigurationKey.mockReturnValue({
                isValid: false,
                errors: [mockValidationError]
            });

            const value = configurationService.get('maxAgents', 1);

            expect(mockValidator.validateConfigurationKey).toHaveBeenCalledWith('maxAgents', 3);
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                CONFIG_EVENTS.CONFIG_VALIDATION_FAILED,
                { key: 'maxAgents', errors: [mockValidationError] }
            );
            expect(value).toBe(1); // Should return default value for invalid cached value
        });

        it('should handle VS Code API errors gracefully', () => {
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('VS Code API error');
            });

            const value = configurationService.get('errorKey', 'fallback');

            expect(value).toBe('fallback');
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                CONFIG_EVENTS.CONFIG_API_ERROR,
                {
                    key: 'errorKey',
                    error: 'VS Code API error',
                    operation: 'get'
                }
            );
        });
    });

    describe('getAll method', () => {
        it('should return all known configuration values', () => {
            const allConfig = configurationService.getAll();

            expect(allConfig).toEqual(expect.objectContaining({
                'maxAgents': 3,
                'claudePath': 'claude',
                'autoAssignTasks': true,
                'useWorktrees': true,
                'logLevel': 'info'
            }));
        });

        it('should exclude undefined values from result', () => {
            mockWorkspaceConfiguration.get.mockImplementation((key: string) => {
                if (key === 'maxAgents') return 3;
                return undefined;
            });

            // Create fresh service to pick up new mock behavior
            configurationService.dispose();
            configurationService = new ConfigurationService(mockValidator, mockEventBus);

            const allConfig = configurationService.getAll();

            expect(allConfig).toEqual({ 'maxAgents': 3 });
        });
    });

    describe('update method', () => {
        it('should update configuration value successfully', async () => {
            mockWorkspaceConfiguration.update.mockResolvedValue(undefined);

            await configurationService.update('maxAgents', 5);

            expect(mockValidator.validateConfigurationKey).toHaveBeenCalledWith('maxAgents', 5);
            expect(mockWorkspaceConfiguration.update).toHaveBeenCalledWith('maxAgents', 5, vscode.ConfigurationTarget.Workspace);
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                CONFIG_EVENTS.CONFIG_UPDATED,
                { key: 'maxAgents', value: 5, target: vscode.ConfigurationTarget.Workspace }
            );
        });

        it('should validate before updating', async () => {
            mockValidator.validateConfigurationKey.mockReturnValue({
                isValid: false,
                errors: [mockValidationError]
            });

            await expect(configurationService.update('maxAgents', 15)).rejects.toThrow(
                'Configuration validation failed for key \'maxAgents\': Must be between 1 and 10'
            );

            expect(mockWorkspaceConfiguration.update).not.toHaveBeenCalled();
        });

        it('should handle VS Code API update errors', async () => {
            mockWorkspaceConfiguration.update.mockRejectedValue(new Error('Update failed'));

            await expect(configurationService.update('maxAgents', 5)).rejects.toThrow(
                'Failed to update configuration key \'maxAgents\': Update failed'
            );

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                CONFIG_EVENTS.CONFIG_UPDATE_FAILED,
                {
                    key: 'maxAgents',
                    value: 5,
                    target: vscode.ConfigurationTarget.Workspace,
                    error: 'Update failed'
                }
            );
        });
    });

    describe('specific configuration methods', () => {
        it('should get max agents with default value', () => {
            expect(configurationService.getMaxAgents()).toBe(3);
        });

        it('should get Claude path with default value', () => {
            expect(configurationService.getClaudePath()).toBe('claude');
        });

        it('should get auto assign tasks setting', () => {
            expect(configurationService.isAutoAssignTasks()).toBe(true);
        });

        it('should get use worktrees setting', () => {
            expect(configurationService.isUseWorktrees()).toBe(true);
        });

        it('should get orchestration heartbeat interval with default', () => {
            mockWorkspaceConfiguration.get.mockImplementation((key: string) => {
                if (key === 'orchestration.heartbeatInterval') return undefined;
                return undefined;
            });

            expect(configurationService.getOrchestrationHeartbeatInterval()).toBe(10000);
        });

        it('should get orchestration max file size with default', () => {
            mockWorkspaceConfiguration.get.mockImplementation((key: string) => {
                if (key === 'orchestration.maxFileSize') return undefined;
                return undefined;
            });

            expect(configurationService.getOrchestrationMaxFileSize()).toBe(10 * 1024 * 1024);
        });
    });

    describe('configuration validation', () => {
        it('should validate all configuration successfully', () => {
            const result = configurationService.validateAll();

            expect(result.isValid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(mockValidator.validateConfiguration).toHaveBeenCalled();
            expect(mockValidator.validateNofXConfiguration).toHaveBeenCalled();
        });

        it('should return validation errors', () => {
            const schemaErrors = [mockValidationError];
            const nofxErrors = [{ key: 'claudePath', message: 'Invalid path', severity: 'error', value: '' } as ValidationError];

            mockValidator.validateConfiguration.mockReturnValue({ isValid: false, errors: schemaErrors });
            mockValidator.validateNofXConfiguration.mockReturnValue({ isValid: false, errors: nofxErrors });

            const result = configurationService.validateAll();

            expect(result.isValid).toBe(false);
            expect(result.errors).toEqual([...schemaErrors, ...nofxErrors]);
        });

        it('should return valid result when no validator provided', () => {
            const serviceWithoutValidator = new ConfigurationService();

            const result = serviceWithoutValidator.validateAll();

            expect(result.isValid).toBe(true);
            expect(result.errors).toEqual([]);

            serviceWithoutValidator.dispose();
        });

        it('should get nested configuration correctly', () => {
            const flatConfig = {
                'orchestration.heartbeatInterval': 5000,
                'orchestration.persistence.path': '/custom/path',
                'maxAgents': 5
            };

            const nested = configurationService.getNestedConfig(flatConfig);

            expect(nested).toEqual({
                orchestration: {
                    heartbeatInterval: 5000,
                    persistence: {
                        path: '/custom/path'
                    }
                },
                maxAgents: 5
            });
        });
    });

    describe('configuration backup and restore', () => {
        it('should backup configuration successfully', async () => {
            const backup = await configurationService.backupConfiguration();

            expect(backup).toEqual(expect.objectContaining({
                'maxAgents': 3,
                'claudePath': 'claude',
                'autoAssignTasks': true,
                'useWorktrees': true,
                'logLevel': 'info'
            }));

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                CONFIG_EVENTS.CONFIG_BACKED_UP,
                { keys: Object.keys(backup) }
            );
        });

        it('should restore configuration successfully', async () => {
            const backupData = {
                'maxAgents': 5,
                'claudePath': '/custom/claude',
                'logLevel': 'debug'
            };

            mockWorkspaceConfiguration.update.mockResolvedValue(undefined);

            await configurationService.restoreConfiguration(backupData);

            expect(mockValidator.validateConfiguration).toHaveBeenCalled();
            Object.entries(backupData).forEach(([key, value]) => {
                expect(mockWorkspaceConfiguration.update).toHaveBeenCalledWith(key, value, vscode.ConfigurationTarget.Workspace);
            });

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                CONFIG_EVENTS.CONFIG_RESTORED,
                { keys: Object.keys(backupData) }
            );
        });

        it('should validate backup before restoring', async () => {
            const invalidBackup = { 'maxAgents': -1 };

            mockValidator.validateConfiguration.mockReturnValue({
                isValid: false,
                errors: [mockValidationError]
            });

            await expect(configurationService.restoreConfiguration(invalidBackup)).rejects.toThrow(
                'Backup validation failed: Must be between 1 and 10'
            );

            expect(mockWorkspaceConfiguration.update).not.toHaveBeenCalled();
        });
    });

    describe('error handling and resource management', () => {
        it('should handle complex nested key structures', () => {
            const complexFlat = {
                'a.b.c.d.e': 'deep',
                'a.b.f': 'shallow',
                'g': 'root'
            };

            const nested = configurationService.getNestedConfig(complexFlat);

            expect(nested).toEqual({
                a: {
                    b: {
                        c: { d: { e: 'deep' } },
                        f: 'shallow'
                    }
                },
                g: 'root'
            });
        });

        it('should dispose all resources correctly', () => {
            configurationService.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();

            // Should be safe to call multiple times
            expect(() => configurationService.dispose()).not.toThrow();
        });

        it('should handle validator errors gracefully', () => {
            mockValidator.validateConfigurationKey.mockImplementation(() => {
                throw new Error('Validator error');
            });

            // Should not throw, should handle error gracefully
            const value = configurationService.get('maxAgents', 1);
            expect(value).toBe(1);
        });

        it('should refresh cache on configuration change', () => {
            // Initial value
            configurationService.get('maxAgents');

            // Simulate configuration change
            mockWorkspaceConfiguration.get.mockReturnValue(7);
            const changeHandler = mockOnDidChangeConfiguration.mock.calls[0][0];
            changeHandler(mockConfigurationChangeEvent);

            // Should get new value from refreshed cache
            const newValue = configurationService.get('maxAgents');
            expect(newValue).toBe(7);
        });
    });
});
