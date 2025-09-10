import * as vscode from 'vscode';
import * as os from 'os';
import {
    WorktreeConfigurationManager,
    WorktreeConfig,
    PerformanceProfile
} from '../../../worktrees/WorktreeConfiguration';
import { setupVSCodeMocks } from '../../helpers/mockFactories';

// Mock os module
jest.mock('os', () => ({
    cpus: jest.fn(() => Array(4).fill({ model: 'Intel' })),
    totalmem: jest.fn(() => 8 * 1024 * 1024 * 1024) // 8GB
}));

describe('WorktreeConfiguration - 100% Coverage', () => {
    let configManager: WorktreeConfigurationManager;
    let mockWorkspaceConfig: any;
    let mockConfigChangeEvent: vscode.Disposable;

    beforeEach(() => {
        jest.clearAllMocks();
        setupVSCodeMocks();

        // Reset singleton
        (WorktreeConfigurationManager as any).instance = undefined;

        // Setup mock workspace configuration
        mockWorkspaceConfig = {
            get: jest.fn((key: string, defaultValue?: any) => {
                const configMap: any = {
                    performanceProfile: 'balanced'
                };
                return configMap[key] ?? defaultValue;
            }),
            has: jest.fn((key: string) => false),
            update: jest.fn()
        };

        mockConfigChangeEvent = { dispose: jest.fn() };

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockWorkspaceConfig);
        (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockReturnValue(mockConfigChangeEvent);
    });

    afterEach(() => {
        configManager?.dispose();
    });

    describe('Singleton Pattern', () => {
        it('should return same instance', () => {
            const instance1 = WorktreeConfigurationManager.getInstance();
            const instance2 = WorktreeConfigurationManager.getInstance();

            expect(instance1).toBe(instance2);
        });

        it('should initialize on first getInstance', () => {
            configManager = WorktreeConfigurationManager.getInstance();

            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('nofx.worktree');
            expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
        });
    });

    describe('Profile Configurations', () => {
        it('should load conservative profile', () => {
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'conservative';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.performance.profile).toBe('conservative');
            expect(config.performance.maxParallelOperations).toBeLessThanOrEqual(2);
            expect(config.pool.enabled).toBe(false);
            expect(config.cache.enabled).toBe(true);
            expect(config.health.autoRecoveryEnabled).toBe(false);
        });

        it('should load balanced profile', () => {
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'balanced';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.performance.profile).toBe('balanced');
            expect(config.performance.maxParallelOperations).toBeGreaterThanOrEqual(2);
            expect(config.pool.enabled).toBe(true);
            expect(config.pool.size).toBe(3);
            expect(config.health.autoRecoveryEnabled).toBe(true);
        });

        it('should load aggressive profile', () => {
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'aggressive';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.performance.profile).toBe('aggressive');
            expect(config.performance.maxParallelOperations).toBeGreaterThanOrEqual(3);
            expect(config.pool.size).toBe(10);
            expect(config.cache.maxEntries).toBe(500);
            expect(config.advanced.experimentalFeatures).toBe(true);
        });

        it('should load extreme profile', () => {
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'extreme';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.performance.profile).toBe('extreme');
            expect(config.performance.maxParallelOperations).toBe(4); // CPU count
            expect(config.pool.size).toBe(20);
            expect(config.circuitBreaker.enabled).toBe(false);
            expect(config.advanced.useNativeGit).toBe(false);
        });

        it('should load custom profile', () => {
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'custom';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.performance.profile).toBe('balanced'); // Falls back to balanced
        });
    });

    describe('User Settings Override', () => {
        it('should override performance settings', () => {
            mockWorkspaceConfig.has.mockImplementation((key: string) => {
                return key === 'performance.maxParallelOperations';
            });
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'balanced';
                if (key === 'performance.maxParallelOperations') return 8;
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.performance.maxParallelOperations).toBe(8);
        });

        it('should override cache settings', () => {
            mockWorkspaceConfig.has.mockImplementation((key: string) => {
                return key === 'cache.enabled' || key === 'cache.ttlMs';
            });
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'cache.enabled') return false;
                if (key === 'cache.ttlMs') return 120000;
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.cache.enabled).toBe(false);
            expect(config.cache.ttlMs).toBe(120000);
        });

        it('should override pool settings', () => {
            mockWorkspaceConfig.has.mockImplementation((key: string) => {
                return key === 'pool.enabled' || key === 'pool.size';
            });
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'pool.enabled') return true;
                if (key === 'pool.size') return 15;
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.pool.enabled).toBe(true);
            expect(config.pool.size).toBe(15);
        });

        it('should override health settings', () => {
            mockWorkspaceConfig.has.mockImplementation((key: string) => {
                return key === 'health.autoRecoveryEnabled';
            });
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'health.autoRecoveryEnabled') return false;
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.health.autoRecoveryEnabled).toBe(false);
        });

        it('should override advanced settings', () => {
            mockWorkspaceConfig.has.mockImplementation((key: string) => {
                return key === 'advanced.experimentalFeatures';
            });
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'advanced.experimentalFeatures') return true;
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.advanced.experimentalFeatures).toBe(true);
        });
    });

    describe('Configuration Updates', () => {
        it('should update configuration', async () => {
            configManager = WorktreeConfigurationManager.getInstance();

            await configManager.updateConfig({
                performance: {
                    profile: 'aggressive',
                    maxParallelOperations: 10,
                    operationTimeoutMs: 5000,
                    retryAttempts: 5,
                    retryDelayMs: 500,
                    queueSize: 200
                }
            });

            expect(mockWorkspaceConfig.update).toHaveBeenCalledWith('performanceProfile', 'aggressive', true);
        });

        it('should save key settings to VS Code', async () => {
            configManager = WorktreeConfigurationManager.getInstance();

            const updates: Partial<WorktreeConfig> = {
                performance: {
                    profile: 'extreme',
                    maxParallelOperations: 16,
                    operationTimeoutMs: 3000,
                    retryAttempts: 10,
                    retryDelayMs: 100,
                    queueSize: 1000
                },
                cache: {
                    enabled: true,
                    ttlMs: 300000,
                    maxEntries: 1000,
                    preloadOnStartup: true,
                    compressionEnabled: true
                }
            };

            await configManager.updateConfig(updates);

            expect(mockWorkspaceConfig.update).toHaveBeenCalledWith('performanceProfile', 'extreme', true);
            expect(mockWorkspaceConfig.update).toHaveBeenCalledWith('performance.maxParallelOperations', 16, true);
            expect(mockWorkspaceConfig.update).toHaveBeenCalledWith('cache.enabled', true, true);
        });
    });

    describe('Configuration Change Handling', () => {
        it('should reload configuration on change', () => {
            configManager = WorktreeConfigurationManager.getInstance();

            const changeHandler = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0];

            const mockEvent = {
                affectsConfiguration: (section: string) => section === 'nofx.worktree'
            };

            const showInfoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

            changeHandler(mockEvent);

            expect(vscode.workspace.getConfiguration).toHaveBeenCalledTimes(2); // Initial + reload
            expect(showInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Worktree configuration updated'));
        });

        it('should ignore unrelated configuration changes', () => {
            configManager = WorktreeConfigurationManager.getInstance();

            const changeHandler = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0];

            const mockEvent = {
                affectsConfiguration: (section: string) => section === 'editor.fontSize'
            };

            const initialCallCount = (vscode.workspace.getConfiguration as jest.Mock).mock.calls.length;

            changeHandler(mockEvent);

            expect(vscode.workspace.getConfiguration).toHaveBeenCalledTimes(initialCallCount);
        });
    });

    describe('System Resource Detection', () => {
        it('should recommend conservative profile for low resources', () => {
            (os.cpus as jest.Mock).mockReturnValue(Array(2).fill({}));
            (os.totalmem as jest.Mock).mockReturnValue(4 * 1024 * 1024 * 1024); // 4GB

            const profile = WorktreeConfigurationManager.getRecommendedProfile();

            expect(profile).toBe('conservative');
        });

        it('should recommend balanced profile for medium resources', () => {
            (os.cpus as jest.Mock).mockReturnValue(Array(4).fill({}));
            (os.totalmem as jest.Mock).mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB

            const profile = WorktreeConfigurationManager.getRecommendedProfile();

            expect(profile).toBe('balanced');
        });

        it('should recommend aggressive profile for high resources', () => {
            (os.cpus as jest.Mock).mockReturnValue(Array(8).fill({}));
            (os.totalmem as jest.Mock).mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB

            const profile = WorktreeConfigurationManager.getRecommendedProfile();

            expect(profile).toBe('aggressive');
        });

        it('should adjust config based on CPU count', () => {
            (os.cpus as jest.Mock).mockReturnValue(Array(16).fill({}));

            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'aggressive';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.performance.maxParallelOperations).toBeLessThanOrEqual(15); // cpus - 1
        });

        it('should adjust memory limits based on system memory', () => {
            (os.totalmem as jest.Mock).mockReturnValue(32 * 1024 * 1024 * 1024); // 32GB

            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'aggressive';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.resources.maxMemoryMB).toBeLessThanOrEqual(32 * 1024 * 0.3); // 30% of total
        });
    });

    describe('Configuration Validation', () => {
        beforeEach(() => {
            configManager = WorktreeConfigurationManager.getInstance();
        });

        it('should validate parallel operations minimum', () => {
            const errors = configManager.validateConfig({
                performance: {
                    profile: 'custom',
                    maxParallelOperations: 0,
                    operationTimeoutMs: 5000,
                    retryAttempts: 3,
                    retryDelayMs: 1000,
                    queueSize: 50
                }
            });

            expect(errors).toContain('maxParallelOperations must be at least 1');
        });

        it('should validate operation timeout minimum', () => {
            const errors = configManager.validateConfig({
                performance: {
                    profile: 'custom',
                    maxParallelOperations: 4,
                    operationTimeoutMs: 500,
                    retryAttempts: 3,
                    retryDelayMs: 1000,
                    queueSize: 50
                }
            });

            expect(errors).toContain('operationTimeoutMs must be at least 1000ms');
        });

        it('should validate cache max entries minimum', () => {
            const errors = configManager.validateConfig({
                cache: {
                    enabled: true,
                    ttlMs: 60000,
                    maxEntries: 5,
                    preloadOnStartup: false,
                    compressionEnabled: false
                }
            });

            expect(errors).toContain('cache.maxEntries must be at least 10');
        });

        it('should validate pool size maximum', () => {
            const errors = configManager.validateConfig({
                pool: {
                    enabled: true,
                    size: 150,
                    refillThreshold: 10,
                    preAllocateOnStartup: true,
                    maxPoolSize: 200
                }
            });

            expect(errors).toContain('pool.size should not exceed 100');
        });

        it('should return empty array for valid config', () => {
            const errors = configManager.validateConfig({
                performance: {
                    profile: 'balanced',
                    maxParallelOperations: 4,
                    operationTimeoutMs: 10000,
                    retryAttempts: 3,
                    retryDelayMs: 1000,
                    queueSize: 50
                }
            });

            expect(errors).toEqual([]);
        });
    });

    describe('Import/Export', () => {
        beforeEach(() => {
            configManager = WorktreeConfigurationManager.getInstance();
        });

        it('should export configuration as JSON', () => {
            const exported = configManager.exportConfig();
            const parsed = JSON.parse(exported);

            expect(parsed).toHaveProperty('performance');
            expect(parsed).toHaveProperty('cache');
            expect(parsed).toHaveProperty('pool');
            expect(parsed).toHaveProperty('health');
        });

        it('should import valid configuration', async () => {
            const config: WorktreeConfig = {
                performance: {
                    profile: 'custom',
                    maxParallelOperations: 6,
                    operationTimeoutMs: 8000,
                    retryAttempts: 4,
                    retryDelayMs: 750,
                    queueSize: 75
                },
                cache: {
                    enabled: true,
                    ttlMs: 90000,
                    maxEntries: 200,
                    preloadOnStartup: true,
                    compressionEnabled: false
                },
                pool: {
                    enabled: true,
                    size: 5,
                    refillThreshold: 2,
                    preAllocateOnStartup: true,
                    maxPoolSize: 10
                },
                health: {
                    enabled: true,
                    checkIntervalMs: 45000,
                    autoRecoveryEnabled: true,
                    maxRecoveryAttempts: 3,
                    staleThresholdMs: 2700000,
                    healthCheckTimeoutMs: 7500
                },
                circuitBreaker: {
                    enabled: true,
                    failureThreshold: 7,
                    resetTimeoutMs: 45000,
                    halfOpenRequests: 2
                },
                resources: {
                    maxMemoryMB: 768,
                    maxDiskUsageMB: 1500,
                    maxCpuPercent: 60,
                    maxFileHandles: 384
                },
                git: {
                    gcAggressive: false,
                    autoGcEnabled: true,
                    gcIntervalMs: 2400000,
                    pruneOnCleanup: true,
                    shallowClone: false,
                    sparseCheckout: false
                },
                telemetry: {
                    enabled: true,
                    metricsRetentionMs: 5400000,
                    exportIntervalMs: 45000,
                    detailedMetrics: false
                },
                advanced: {
                    useNativeGit: true,
                    experimentalFeatures: false,
                    compressionLevel: 4,
                    asyncOperations: true,
                    predictivePreloading: false,
                    intelligentCaching: true
                }
            };

            await configManager.importConfig(JSON.stringify(config));

            expect(mockWorkspaceConfig.update).toHaveBeenCalled();

            const currentConfig = configManager.getConfig();
            expect(currentConfig.performance.maxParallelOperations).toBe(6);
        });

        it('should reject invalid configuration import', async () => {
            const invalidConfig = {
                performance: {
                    maxParallelOperations: -1 // Invalid
                }
            };

            await expect(configManager.importConfig(JSON.stringify(invalidConfig))).rejects.toThrow(
                'Invalid configuration'
            );
        });

        it('should handle malformed JSON import', async () => {
            await expect(configManager.importConfig('{ invalid json')).rejects.toThrow(
                'Failed to import configuration'
            );
        });
    });

    describe('Profile-Specific Settings', () => {
        it('should configure conservative profile correctly', () => {
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'conservative';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            // Conservative specific checks
            expect(config.performance.retryAttempts).toBe(2);
            expect(config.pool.enabled).toBe(false);
            expect(config.git.shallowClone).toBe(true);
            expect(config.telemetry.enabled).toBe(false);
            expect(config.advanced.experimentalFeatures).toBe(false);
        });

        it('should configure extreme profile correctly', () => {
            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'extreme';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            // Extreme specific checks
            expect(config.performance.retryAttempts).toBe(10);
            expect(config.pool.size).toBe(20);
            expect(config.circuitBreaker.enabled).toBe(false);
            expect(config.advanced.compressionLevel).toBe(9);
            expect(config.advanced.predictivePreloading).toBe(true);
        });
    });

    describe('Disposal', () => {
        it('should dispose configuration watcher', () => {
            configManager = WorktreeConfigurationManager.getInstance();

            configManager.dispose();

            expect(mockConfigChangeEvent.dispose).toHaveBeenCalled();
        });

        it('should handle multiple dispose calls', () => {
            configManager = WorktreeConfigurationManager.getInstance();

            configManager.dispose();
            configManager.dispose(); // Second call

            expect(mockConfigChangeEvent.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing VS Code configuration gracefully', () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn(() => undefined),
                has: jest.fn(() => false),
                update: jest.fn()
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            // Should use defaults
            expect(config.performance.profile).toBe('balanced');
        });

        it('should handle zero CPUs edge case', () => {
            (os.cpus as jest.Mock).mockReturnValue([]);

            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'balanced';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.performance.maxParallelOperations).toBeGreaterThan(0);
        });

        it('should handle very low memory systems', () => {
            (os.totalmem as jest.Mock).mockReturnValue(1024 * 1024 * 1024); // 1GB

            mockWorkspaceConfig.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'performanceProfile') return 'balanced';
                return defaultValue;
            });

            configManager = WorktreeConfigurationManager.getInstance();
            const config = configManager.getConfig();

            expect(config.resources.maxMemoryMB).toBeLessThanOrEqual(512);
        });
    });
});
