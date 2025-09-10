// Mock VS Code API first
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

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => mockWorkspaceConfiguration),
        onDidChangeConfiguration: jest.fn(() => mockDisposable)
    },
    ConfigurationTarget: {
        Workspace: 2,
        Global: 1,
        WorkspaceFolder: 3
    }
}));

import * as vscode from 'vscode';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { IConfigurationValidator, IEventBus, ValidationError } from '../../../services/interfaces';
import { createMockEventBus, setupVSCodeMocks } from './../../helpers/mockFactories';
import { CONFIG_EVENTS } from '../../../services/EventConstants';
import { getAppStateStore } from '../../../state/AppStateStore';
import * as selectors from '../../../state/selectors';
import * as actions from '../../../state/actions';
describe('ConfigurationService', () => {
    let configurationService: ConfigurationService;
    let mockValidator: any;
    let mockEventBus: any;
    let mockOnDidChangeConfiguration: jest.Mock;
    let mockConfiguration: any;

    const mockValidationError: ValidationError = {
        field: 'maxAgents',
        message: 'Must be between 1 and 10',
        severity: 'error'
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock validator
        mockValidator = {
            validateConfiguration: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
            getValidationSchema: jest.fn().mockReturnValue({}),
            dispose: jest.fn(),
            validateNofXConfiguration: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
            validateConfigurationKey: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
            getValidationErrors: jest.fn().mockReturnValue([])
        };

        // Setup mock event bus
        mockEventBus = createMockEventBus();

        // Setup VS Code mocks
        mockConfiguration = mockWorkspaceConfiguration;
        mockOnDidChangeConfiguration = jest.fn().mockReturnValue(mockDisposable);
        (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;

        mockConfigurationChangeEvent.affectsConfiguration.mockReturnValue(true);
        mockConfiguration.get.mockImplementation((key: string) => {
            const values: Record<string, any> = {
                maxAgents: 3,
                aiPath: 'claude',
                autoAssignTasks: true,
                useWorktrees: true,
                logLevel: 'info',
                showAgentTerminalOnSpawn: false,
                templatesPath: '.nofx/templates',
                persistAgents: true
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
            expect(mockEventBus.publish).toHaveBeenCalledWith(CONFIG_EVENTS.CONFIG_CHANGED, { section: 'nofx' });
        });

        it('should not publish config change event for unrelated sections', () => {
            mockConfigurationChangeEvent.affectsConfiguration.mockReturnValue(false);

            const changeHandler = mockOnDidChangeConfiguration.mock.calls[0][0];
            changeHandler(mockConfigurationChangeEvent);

            expect(mockEventBus.publish).not.toHaveBeenCalledWith(CONFIG_EVENTS.CONFIG_CHANGED, expect.anything());
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
            expect(mockEventBus.publish).toHaveBeenCalledWith(CONFIG_EVENTS.CONFIG_VALIDATION_FAILED, {
                key: 'maxAgents',
                errors: [mockValidationError]
            });
            expect(value).toBe(1); // Should return default value for invalid cached value
        });

        it('should handle VS Code API errors gracefully', () => {
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('VS Code API error');
            });

            const value = configurationService.get('errorKey', 'fallback');

            expect(value).toBe('fallback');
            expect(mockEventBus.publish).toHaveBeenCalledWith(CONFIG_EVENTS.CONFIG_API_ERROR, {
                key: 'errorKey',
                error: 'VS Code API error',
                operation: 'get'
            });
        });
    });

    describe('getAll method', () => {
        it('should return all known configuration values', () => {
            const allConfig = configurationService.getAll();

            expect(allConfig).toEqual(
                expect.objectContaining({
                    maxAgents: 3,
                    aiPath: 'claude',
                    autoAssignTasks: true,
                    useWorktrees: true,
                    logLevel: 'info'
                })
            );
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

            expect(allConfig).toEqual({ maxAgents: 3 });
        });
    });

    describe('update method', () => {
        it('should update configuration value successfully', async () => {
            mockWorkspaceConfiguration.update.mockResolvedValue(undefined);

            await configurationService.update('maxAgents', 5);

            expect(mockValidator.validateConfigurationKey).toHaveBeenCalledWith('maxAgents', 5);
            expect(mockWorkspaceConfiguration.update).toHaveBeenCalledWith(
                'maxAgents',
                5,
                vscode.ConfigurationTarget.Workspace
            );
            expect(mockEventBus.publish).toHaveBeenCalledWith(CONFIG_EVENTS.CONFIG_UPDATED, {
                key: 'maxAgents',
                value: 5,
                target: vscode.ConfigurationTarget.Workspace
            });
        });

        it('should validate before updating', async () => {
            mockValidator.validateConfigurationKey.mockReturnValue({
                isValid: false,
                errors: [mockValidationError]
            });

            await expect(configurationService.update('maxAgents', 15)).rejects.toThrow(
                "Configuration validation failed for key 'maxAgents': Must be between 1 and 10"
            );

            expect(mockWorkspaceConfiguration.update).not.toHaveBeenCalled();
        });

        it('should handle VS Code API update errors', async () => {
            mockWorkspaceConfiguration.update.mockRejectedValue(new Error('Update failed'));

            await expect(configurationService.update('maxAgents', 5)).rejects.toThrow(
                "Failed to update configuration key 'maxAgents': Update failed"
            );

            expect(mockEventBus.publish).toHaveBeenCalledWith(CONFIG_EVENTS.CONFIG_UPDATE_FAILED, {
                key: 'maxAgents',
                value: 5,
                target: vscode.ConfigurationTarget.Workspace,
                error: 'Update failed'
            });
        });
    });

    describe('specific configuration methods', () => {
        it('should get max agents with default value', () => {
            expect(configurationService.getMaxAgents()).toBe(3);
        });

        it('should get AI path with default value', () => {
            expect(configurationService.getAiPath()).toBe('claude');
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
            const nofxErrors = [{ field: 'aiPath', message: 'Invalid path', severity: 'error' } as ValidationError];

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
                maxAgents: 5
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

            expect(backup).toEqual(
                expect.objectContaining({
                    maxAgents: 3,
                    aiPath: 'claude',
                    autoAssignTasks: true,
                    useWorktrees: true,
                    logLevel: 'info'
                })
            );

            expect(mockEventBus.publish).toHaveBeenCalledWith(CONFIG_EVENTS.CONFIG_BACKED_UP, {
                keys: Object.keys(backup)
            });
        });

        it('should restore configuration successfully', async () => {
            const backupData = {
                maxAgents: 5,
                aiPath: '/custom/claude',
                logLevel: 'debug'
            };

            mockWorkspaceConfiguration.update.mockResolvedValue(undefined);

            await configurationService.restoreConfiguration(backupData);

            expect(mockValidator.validateConfiguration).toHaveBeenCalled();
            Object.entries(backupData).forEach(([key, value]) => {
                expect(mockWorkspaceConfiguration.update).toHaveBeenCalledWith(
                    key,
                    value,
                    vscode.ConfigurationTarget.Workspace
                );
            });

            expect(mockEventBus.publish).toHaveBeenCalledWith(CONFIG_EVENTS.CONFIG_RESTORED, {
                keys: Object.keys(backupData)
            });
        });

        it('should validate backup before restoring', async () => {
            const invalidBackup = { maxAgents: -1 };

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
                g: 'root'
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

    describe('Orchestration Configuration Methods', () => {
        it('should get orchestration heartbeat interval', () => {
            mockConfiguration.get.mockReturnValue(5000);
            const interval = configurationService.getOrchestrationHeartbeatInterval();
            expect(interval).toBe(5000);
            expect(mockConfiguration.get).toHaveBeenCalledWith('orchestration.heartbeatInterval', 10000);
        });

        it('should get orchestration heartbeat timeout', () => {
            mockConfiguration.get.mockReturnValue(60000);
            const timeout = configurationService.getOrchestrationHeartbeatTimeout();
            expect(timeout).toBe(60000);
            expect(mockConfiguration.get).toHaveBeenCalledWith('orchestration.heartbeatTimeout', 30000);
        });

        it('should get orchestration history limit', () => {
            mockConfiguration.get.mockReturnValue(500);
            const limit = configurationService.getOrchestrationHistoryLimit();
            expect(limit).toBe(500);
            expect(mockConfiguration.get).toHaveBeenCalledWith('orchestration.historyLimit', 1000);
        });

        it('should get orchestration persistence path', () => {
            mockConfiguration.get.mockReturnValue('/custom/path');
            const path = configurationService.getOrchestrationPersistencePath();
            expect(path).toBe('/custom/path');
            expect(mockConfiguration.get).toHaveBeenCalledWith('orchestration.persistencePath', '.nofx/orchestration');
        });

        it('should get orchestration max file size', () => {
            mockConfiguration.get.mockReturnValue(5242880);
            const size = configurationService.getOrchestrationMaxFileSize();
            expect(size).toBe(5242880);
            expect(mockConfiguration.get).toHaveBeenCalledWith('orchestration.maxFileSize', 10485760);
        });

        it('should use default values for orchestration settings', () => {
            mockConfiguration.get.mockImplementation((key: string, defaultValue: any) => defaultValue);

            expect(configurationService.getOrchestrationHeartbeatInterval()).toBe(10000);
            expect(configurationService.getOrchestrationHeartbeatTimeout()).toBe(30000);
            expect(configurationService.getOrchestrationHistoryLimit()).toBe(1000);
            expect(configurationService.getOrchestrationPersistencePath()).toBe('.nofx/orchestration');
            expect(configurationService.getOrchestrationMaxFileSize()).toBe(10485760);
        });
    });

    describe('NofX Configuration Methods', () => {
        it('should get AI provider', () => {
            mockConfiguration.get.mockReturnValue('openai');
            const provider = configurationService.getAiProvider();
            expect(provider).toBe('openai');
            expect(mockConfiguration.get).toHaveBeenCalledWith('aiProvider', 'claude');
        });

        it('should get AI path', () => {
            mockConfiguration.get.mockReturnValue('/usr/bin/ai');
            const path = configurationService.getAiPath();
            expect(path).toBe('/usr/bin/ai');
            expect(mockConfiguration.get).toHaveBeenCalledWith('aiPath', 'claude');
        });

        it('should check auto assign tasks', () => {
            mockConfiguration.get.mockReturnValue(false);
            const autoAssign = configurationService.isAutoAssignTasks();
            expect(autoAssign).toBe(false);
            expect(mockConfiguration.get).toHaveBeenCalledWith('autoAssignTasks', true);
        });

        it('should check use worktrees', () => {
            mockConfiguration.get.mockReturnValue(false);
            const useWorktrees = configurationService.isUseWorktrees();
            expect(useWorktrees).toBe(false);
            expect(mockConfiguration.get).toHaveBeenCalledWith('useWorktrees', true);
        });

        it('should check show agent terminal on spawn', () => {
            mockConfiguration.get.mockReturnValue(true);
            const showTerminal = configurationService.isShowAgentTerminalOnSpawn();
            expect(showTerminal).toBe(true);
            expect(mockConfiguration.get).toHaveBeenCalledWith('showAgentTerminalOnSpawn', false);
        });

        it('should check claude skip permissions', () => {
            mockConfiguration.get.mockReturnValue(true);
            const skipPerms = configurationService.isClaudeSkipPermissions();
            expect(skipPerms).toBe(true);
            expect(mockConfiguration.get).toHaveBeenCalledWith('claudeSkipPermissions', false);
        });

        it('should get templates path', () => {
            mockConfiguration.get.mockReturnValue('/custom/templates');
            const path = configurationService.getTemplatesPath();
            expect(path).toBe('/custom/templates');
            expect(mockConfiguration.get).toHaveBeenCalledWith('templatesPath', '.nofx/templates');
        });

        it('should check persist agents', () => {
            mockConfiguration.get.mockReturnValue(false);
            const persist = configurationService.isPersistAgents();
            expect(persist).toBe(false);
            expect(mockConfiguration.get).toHaveBeenCalledWith('persistAgents', true);
        });

        it('should get log level', () => {
            mockConfiguration.get.mockReturnValue('debug');
            const level = configurationService.getLogLevel();
            expect(level).toBe('debug');
            expect(mockConfiguration.get).toHaveBeenCalledWith('logLevel', 'info');
        });
    });

    describe('Update Configuration', () => {
        it('should update configuration with workspace target', async () => {
            mockConfiguration.update.mockResolvedValue(undefined);
            mockValidator.validateConfigurationKey.mockReturnValue({ isValid: true, errors: [] });

            await configurationService.update('maxAgents', 5, vscode.ConfigurationTarget.Workspace);

            expect(mockConfiguration.update).toHaveBeenCalledWith('maxAgents', 5, vscode.ConfigurationTarget.Workspace);
            expect(mockEventBus.publish).toHaveBeenCalledWith(CONFIG_EVENTS.CONFIG_UPDATED, {
                key: 'maxAgents',
                value: 5,
                target: vscode.ConfigurationTarget.Workspace
            });
        });

        it('should update configuration with global target', async () => {
            mockConfiguration.update.mockResolvedValue(undefined);
            mockValidator.validateConfigurationKey.mockReturnValue({ isValid: true, errors: [] });

            await configurationService.update('logLevel', 'debug', vscode.ConfigurationTarget.Global);

            expect(mockConfiguration.update).toHaveBeenCalledWith(
                'logLevel',
                'debug',
                vscode.ConfigurationTarget.Global
            );
        });

        it('should handle update failure', async () => {
            const updateError = new Error('Update failed');
            mockConfiguration.update.mockRejectedValue(updateError);
            mockValidator.validateConfigurationKey.mockReturnValue({ isValid: true, errors: [] });

            await expect(configurationService.update('maxAgents', 5)).rejects.toThrow(
                "Failed to update configuration key 'maxAgents': Update failed"
            );

            expect(mockEventBus.publish).toHaveBeenCalledWith(CONFIG_EVENTS.CONFIG_UPDATE_FAILED, {
                key: 'maxAgents',
                value: 5,
                target: vscode.ConfigurationTarget.Workspace,
                error: 'Update failed'
            });
        });

        it('should clear validation cache after successful update', async () => {
            mockConfiguration.update.mockResolvedValue(undefined);
            mockValidator.validateConfigurationKey.mockReturnValue({ isValid: true, errors: [] });

            // Update twice with same value - second should call validator if cache was cleared
            await configurationService.update('maxAgents', 5);

            // Clear mock call count
            mockValidator.validateConfigurationKey.mockClear();

            // Update again - should call validator since cache was cleared by previous update
            await configurationService.update('maxAgents', 5);
            expect(mockValidator.validateConfigurationKey).toHaveBeenCalled();
        });
    });

    describe('Configuration Change Monitoring', () => {
        it('should register configuration change callback', () => {
            const callback = jest.fn();
            const mockDisposable = { dispose: jest.fn() };

            (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockReturnValue(mockDisposable);

            const disposable = configurationService.onDidChange(callback);

            expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
            expect(disposable).toBe(mockDisposable);
        });

        it('should trigger callback only for nofx configuration changes', () => {
            const callback = jest.fn();
            let changeHandler: any;

            (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockImplementation(handler => {
                changeHandler = handler;
                return { dispose: jest.fn() };
            });

            configurationService.onDidChange(callback);

            const event = {
                affectsConfiguration: jest.fn().mockReturnValue(true)
            };

            changeHandler(event);

            expect(event.affectsConfiguration).toHaveBeenCalledWith('nofx');
            expect(callback).toHaveBeenCalledWith(event);
        });

        it('should not trigger callback for non-nofx configuration changes', () => {
            const callback = jest.fn();
            let changeHandler: any;

            (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockImplementation(handler => {
                changeHandler = handler;
                return { dispose: jest.fn() };
            });

            configurationService.onDidChange(callback);

            const event = {
                affectsConfiguration: jest.fn().mockReturnValue(false)
            };

            changeHandler(event);

            expect(event.affectsConfiguration).toHaveBeenCalledWith('nofx');
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('Get All Configuration', () => {
        it('should return all configuration values', () => {
            mockConfiguration.get.mockImplementation((key: string) => {
                const values: Record<string, any> = {
                    maxAgents: 5,
                    aiProvider: 'claude',
                    logLevel: 'debug',
                    useWorktrees: true
                };
                return values[key];
            });

            const allConfig = configurationService.getAll();

            expect(allConfig).toMatchObject({
                maxAgents: 5,
                aiProvider: 'claude',
                logLevel: 'debug',
                useWorktrees: true
            });
        });

        it('should exclude undefined values', () => {
            mockConfiguration.get.mockImplementation((key: string) => {
                const values: Record<string, any> = {
                    maxAgents: 5,
                    aiProvider: undefined,
                    logLevel: 'debug'
                };
                return values[key];
            });

            const allConfig = configurationService.getAll();

            expect(allConfig).toHaveProperty('maxAgents', 5);
            expect(allConfig).not.toHaveProperty('aiProvider');
            expect(allConfig).toHaveProperty('logLevel', 'debug');
        });
    });

    describe('Validate All Configuration', () => {
        it('should validate all configuration and return valid result', () => {
            mockValidator.validateConfiguration.mockReturnValue({ isValid: true, errors: [] });
            mockValidator.validateNofXConfiguration.mockReturnValue({ isValid: true, errors: [] });
            mockConfiguration.get.mockReturnValue(5);

            const result = configurationService.validateAll();

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(mockValidator.validateConfiguration).toHaveBeenCalled();
            expect(mockValidator.validateNofXConfiguration).toHaveBeenCalled();
        });

        it('should merge errors from both validators', () => {
            const schemaError: ValidationError = {
                field: 'maxAgents',
                message: 'Must be a number',
                severity: 'error'
            };
            const nofxError: ValidationError = {
                field: 'orchestration',
                message: 'Invalid orchestration config',
                severity: 'error'
            };

            mockValidator.validateConfiguration.mockReturnValue({
                isValid: false,
                errors: [schemaError]
            });
            mockValidator.validateNofXConfiguration.mockReturnValue({
                isValid: false,
                errors: [nofxError]
            });

            const result = configurationService.validateAll();

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(2);
            expect(result.errors).toContainEqual(schemaError);
            expect(result.errors).toContainEqual(nofxError);
        });

        it('should handle warnings without invalidating config', () => {
            const warning: ValidationError = {
                field: 'maxAgents',
                message: 'Consider using a lower value',
                severity: 'warning'
            };

            mockValidator.validateConfiguration.mockReturnValue({
                isValid: true,
                errors: [warning]
            });
            mockValidator.validateNofXConfiguration.mockReturnValue({
                isValid: true,
                errors: []
            });

            const result = configurationService.validateAll();

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].severity).toBe('warning');
        });

        it('should return valid when no validator is set', () => {
            const serviceWithoutValidator = new ConfigurationService(mockEventBus);

            const result = serviceWithoutValidator.validateAll();

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('Get Nested Config', () => {
        it('should convert flat config to nested structure', () => {
            const flat = {
                'orchestration.heartbeatInterval': 5000,
                'orchestration.heartbeatTimeout': 30000,
                maxAgents: 5
            };

            const nested = configurationService.getNestedConfig(flat);

            expect(nested).toEqual({
                orchestration: {
                    heartbeatInterval: 5000,
                    heartbeatTimeout: 30000
                },
                maxAgents: 5
            });
        });
    });
});
