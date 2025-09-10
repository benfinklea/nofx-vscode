import * as vscode from 'vscode';
import * as os from 'os';

/**
 * Performance profile for worktree operations
 */
export type PerformanceProfile = 'conservative' | 'balanced' | 'aggressive' | 'extreme' | 'custom';

/**
 * Comprehensive configuration for worktree system optimization
 */
export interface WorktreeConfig {
    // Performance settings
    performance: {
        profile: PerformanceProfile;
        maxParallelOperations: number;
        operationTimeoutMs: number;
        retryAttempts: number;
        retryDelayMs: number;
        queueSize: number;
    };

    // Caching settings
    cache: {
        enabled: boolean;
        ttlMs: number;
        maxEntries: number;
        preloadOnStartup: boolean;
        compressionEnabled: boolean;
    };

    // Pool settings
    pool: {
        enabled: boolean;
        size: number;
        refillThreshold: number;
        preAllocateOnStartup: boolean;
        maxPoolSize: number;
    };

    // Health monitoring
    health: {
        enabled: boolean;
        checkIntervalMs: number;
        autoRecoveryEnabled: boolean;
        maxRecoveryAttempts: number;
        staleThresholdMs: number;
        healthCheckTimeoutMs: number;
    };

    // Circuit breaker
    circuitBreaker: {
        enabled: boolean;
        failureThreshold: number;
        resetTimeoutMs: number;
        halfOpenRequests: number;
    };

    // Resource limits
    resources: {
        maxMemoryMB: number;
        maxDiskUsageMB: number;
        maxCpuPercent: number;
        maxFileHandles: number;
    };

    // Git settings
    git: {
        gcAggressive: boolean;
        autoGcEnabled: boolean;
        gcIntervalMs: number;
        pruneOnCleanup: boolean;
        shallowClone: boolean;
        sparseCheckout: boolean;
    };

    // Telemetry
    telemetry: {
        enabled: boolean;
        metricsRetentionMs: number;
        exportIntervalMs: number;
        detailedMetrics: boolean;
    };

    // Advanced features
    advanced: {
        useNativeGit: boolean;
        experimentalFeatures: boolean;
        compressionLevel: number;
        asyncOperations: boolean;
        predictivePreloading: boolean;
        intelligentCaching: boolean;
    };
}

/**
 * Configuration manager for worktree system
 */
export class WorktreeConfigurationManager {
    private static instance: WorktreeConfigurationManager;
    private config: WorktreeConfig;
    private configWatcher: vscode.Disposable | undefined;

    private constructor() {
        this.config = this.loadConfiguration();
        this.watchConfiguration();
    }

    static getInstance(): WorktreeConfigurationManager {
        if (!WorktreeConfigurationManager.instance) {
            WorktreeConfigurationManager.instance = new WorktreeConfigurationManager();
        }
        return WorktreeConfigurationManager.instance;
    }

    /**
     * Get current configuration
     */
    getConfig(): WorktreeConfig {
        return this.config;
    }

    /**
     * Update configuration
     */
    async updateConfig(updates: Partial<WorktreeConfig>): Promise<void> {
        this.config = { ...this.config, ...updates };
        await this.saveConfiguration();
    }

    /**
     * Load configuration from VS Code settings
     */
    private loadConfiguration(): WorktreeConfig {
        const vsConfig = vscode.workspace.getConfiguration('nofx.worktree');
        const profile = vsConfig.get<PerformanceProfile>('performanceProfile', 'balanced');

        // Get base config from profile
        const baseConfig = this.getProfileConfig(profile);

        // Override with user settings
        return this.mergeWithUserSettings(baseConfig, vsConfig);
    }

    /**
     * Get configuration based on performance profile
     */
    private getProfileConfig(profile: PerformanceProfile): WorktreeConfig {
        const cpuCount = os.cpus().length;
        const totalMemory = os.totalmem() / (1024 * 1024); // MB

        switch (profile) {
            case 'conservative':
                return this.getConservativeConfig(cpuCount, totalMemory);
            case 'balanced':
                return this.getBalancedConfig(cpuCount, totalMemory);
            case 'aggressive':
                return this.getAggressiveConfig(cpuCount, totalMemory);
            case 'extreme':
                return this.getExtremeConfig(cpuCount, totalMemory);
            case 'custom':
            default:
                return this.getBalancedConfig(cpuCount, totalMemory);
        }
    }

    /**
     * Conservative profile - minimal resource usage
     */
    private getConservativeConfig(cpus: number, memoryMB: number): WorktreeConfig {
        return {
            performance: {
                profile: 'conservative',
                maxParallelOperations: Math.min(2, cpus),
                operationTimeoutMs: 30000,
                retryAttempts: 2,
                retryDelayMs: 2000,
                queueSize: 10
            },
            cache: {
                enabled: true,
                ttlMs: 30000,
                maxEntries: 50,
                preloadOnStartup: false,
                compressionEnabled: false
            },
            pool: {
                enabled: false,
                size: 0,
                refillThreshold: 0,
                preAllocateOnStartup: false,
                maxPoolSize: 0
            },
            health: {
                enabled: true,
                checkIntervalMs: 60000,
                autoRecoveryEnabled: false,
                maxRecoveryAttempts: 1,
                staleThresholdMs: 7200000,
                healthCheckTimeoutMs: 10000
            },
            circuitBreaker: {
                enabled: true,
                failureThreshold: 10,
                resetTimeoutMs: 60000,
                halfOpenRequests: 1
            },
            resources: {
                maxMemoryMB: Math.min(256, memoryMB * 0.1),
                maxDiskUsageMB: 500,
                maxCpuPercent: 25,
                maxFileHandles: 100
            },
            git: {
                gcAggressive: false,
                autoGcEnabled: false,
                gcIntervalMs: 3600000,
                pruneOnCleanup: true,
                shallowClone: true,
                sparseCheckout: false
            },
            telemetry: {
                enabled: false,
                metricsRetentionMs: 600000,
                exportIntervalMs: 60000,
                detailedMetrics: false
            },
            advanced: {
                useNativeGit: true,
                experimentalFeatures: false,
                compressionLevel: 1,
                asyncOperations: false,
                predictivePreloading: false,
                intelligentCaching: false
            }
        };
    }

    /**
     * Balanced profile - good performance with reasonable resource usage
     */
    private getBalancedConfig(cpus: number, memoryMB: number): WorktreeConfig {
        return {
            performance: {
                profile: 'balanced',
                maxParallelOperations: Math.min(4, Math.max(2, Math.floor(cpus / 2))),
                operationTimeoutMs: 15000,
                retryAttempts: 3,
                retryDelayMs: 1000,
                queueSize: 50
            },
            cache: {
                enabled: true,
                ttlMs: 60000,
                maxEntries: 100,
                preloadOnStartup: true,
                compressionEnabled: false
            },
            pool: {
                enabled: true,
                size: 3,
                refillThreshold: 1,
                preAllocateOnStartup: true,
                maxPoolSize: 5
            },
            health: {
                enabled: true,
                checkIntervalMs: 30000,
                autoRecoveryEnabled: true,
                maxRecoveryAttempts: 3,
                staleThresholdMs: 3600000,
                healthCheckTimeoutMs: 5000
            },
            circuitBreaker: {
                enabled: true,
                failureThreshold: 5,
                resetTimeoutMs: 30000,
                halfOpenRequests: 2
            },
            resources: {
                maxMemoryMB: Math.min(512, memoryMB * 0.2),
                maxDiskUsageMB: 1000,
                maxCpuPercent: 50,
                maxFileHandles: 256
            },
            git: {
                gcAggressive: false,
                autoGcEnabled: true,
                gcIntervalMs: 1800000,
                pruneOnCleanup: true,
                shallowClone: false,
                sparseCheckout: false
            },
            telemetry: {
                enabled: true,
                metricsRetentionMs: 3600000,
                exportIntervalMs: 30000,
                detailedMetrics: false
            },
            advanced: {
                useNativeGit: true,
                experimentalFeatures: false,
                compressionLevel: 3,
                asyncOperations: true,
                predictivePreloading: false,
                intelligentCaching: true
            }
        };
    }

    /**
     * Aggressive profile - maximum performance
     */
    private getAggressiveConfig(cpus: number, memoryMB: number): WorktreeConfig {
        return {
            performance: {
                profile: 'aggressive',
                maxParallelOperations: Math.min(8, cpus - 1),
                operationTimeoutMs: 10000,
                retryAttempts: 5,
                retryDelayMs: 500,
                queueSize: 100
            },
            cache: {
                enabled: true,
                ttlMs: 120000,
                maxEntries: 500,
                preloadOnStartup: true,
                compressionEnabled: true
            },
            pool: {
                enabled: true,
                size: 10,
                refillThreshold: 3,
                preAllocateOnStartup: true,
                maxPoolSize: 20
            },
            health: {
                enabled: true,
                checkIntervalMs: 15000,
                autoRecoveryEnabled: true,
                maxRecoveryAttempts: 5,
                staleThresholdMs: 1800000,
                healthCheckTimeoutMs: 3000
            },
            circuitBreaker: {
                enabled: true,
                failureThreshold: 3,
                resetTimeoutMs: 15000,
                halfOpenRequests: 3
            },
            resources: {
                maxMemoryMB: Math.min(1024, memoryMB * 0.3),
                maxDiskUsageMB: 2000,
                maxCpuPercent: 75,
                maxFileHandles: 512
            },
            git: {
                gcAggressive: true,
                autoGcEnabled: true,
                gcIntervalMs: 900000,
                pruneOnCleanup: true,
                shallowClone: false,
                sparseCheckout: true
            },
            telemetry: {
                enabled: true,
                metricsRetentionMs: 7200000,
                exportIntervalMs: 15000,
                detailedMetrics: true
            },
            advanced: {
                useNativeGit: true,
                experimentalFeatures: true,
                compressionLevel: 6,
                asyncOperations: true,
                predictivePreloading: true,
                intelligentCaching: true
            }
        };
    }

    /**
     * Extreme profile - no limits (use with caution)
     */
    private getExtremeConfig(cpus: number, memoryMB: number): WorktreeConfig {
        return {
            performance: {
                profile: 'extreme',
                maxParallelOperations: cpus,
                operationTimeoutMs: 5000,
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
            },
            pool: {
                enabled: true,
                size: 20,
                refillThreshold: 5,
                preAllocateOnStartup: true,
                maxPoolSize: 50
            },
            health: {
                enabled: true,
                checkIntervalMs: 5000,
                autoRecoveryEnabled: true,
                maxRecoveryAttempts: 10,
                staleThresholdMs: 600000,
                healthCheckTimeoutMs: 1000
            },
            circuitBreaker: {
                enabled: false, // Disabled for extreme performance
                failureThreshold: 100,
                resetTimeoutMs: 5000,
                halfOpenRequests: 10
            },
            resources: {
                maxMemoryMB: memoryMB * 0.5,
                maxDiskUsageMB: 10000,
                maxCpuPercent: 100,
                maxFileHandles: 1024
            },
            git: {
                gcAggressive: true,
                autoGcEnabled: true,
                gcIntervalMs: 300000,
                pruneOnCleanup: true,
                shallowClone: false,
                sparseCheckout: true
            },
            telemetry: {
                enabled: true,
                metricsRetentionMs: 14400000,
                exportIntervalMs: 5000,
                detailedMetrics: true
            },
            advanced: {
                useNativeGit: false, // Use optimized implementation
                experimentalFeatures: true,
                compressionLevel: 9,
                asyncOperations: true,
                predictivePreloading: true,
                intelligentCaching: true
            }
        };
    }

    /**
     * Merge base config with user settings
     */
    private mergeWithUserSettings(baseConfig: WorktreeConfig, vsConfig: vscode.WorkspaceConfiguration): WorktreeConfig {
        // Deep merge user settings
        const merged = { ...baseConfig };

        // Performance settings
        if (vsConfig.has('performance.maxParallelOperations')) {
            merged.performance.maxParallelOperations = vsConfig.get('performance.maxParallelOperations')!;
        }

        // Cache settings
        if (vsConfig.has('cache.enabled')) {
            merged.cache.enabled = vsConfig.get('cache.enabled')!;
        }
        if (vsConfig.has('cache.ttlMs')) {
            merged.cache.ttlMs = vsConfig.get('cache.ttlMs')!;
        }

        // Pool settings
        if (vsConfig.has('pool.enabled')) {
            merged.pool.enabled = vsConfig.get('pool.enabled')!;
        }
        if (vsConfig.has('pool.size')) {
            merged.pool.size = vsConfig.get('pool.size')!;
        }

        // Health settings
        if (vsConfig.has('health.autoRecoveryEnabled')) {
            merged.health.autoRecoveryEnabled = vsConfig.get('health.autoRecoveryEnabled')!;
        }

        // Advanced settings
        if (vsConfig.has('advanced.experimentalFeatures')) {
            merged.advanced.experimentalFeatures = vsConfig.get('advanced.experimentalFeatures')!;
        }

        return merged;
    }

    /**
     * Save configuration to VS Code settings
     */
    private async saveConfiguration(): Promise<void> {
        const vsConfig = vscode.workspace.getConfiguration('nofx.worktree');

        // Save key settings
        await vsConfig.update('performanceProfile', this.config.performance.profile, true);
        await vsConfig.update('performance.maxParallelOperations', this.config.performance.maxParallelOperations, true);
        await vsConfig.update('cache.enabled', this.config.cache.enabled, true);
        await vsConfig.update('pool.enabled', this.config.pool.enabled, true);
        await vsConfig.update('health.autoRecoveryEnabled', this.config.health.autoRecoveryEnabled, true);
    }

    /**
     * Watch for configuration changes
     */
    private watchConfiguration(): void {
        this.configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('nofx.worktree')) {
                this.config = this.loadConfiguration();
                this.onConfigurationChanged();
            }
        });
    }

    /**
     * Handle configuration changes
     */
    private onConfigurationChanged(): void {
        // Emit event or notify listeners
        vscode.window.showInformationMessage(
            `Worktree configuration updated. Profile: ${this.config.performance.profile}`
        );
    }

    /**
     * Get recommended configuration based on system resources
     */
    static getRecommendedProfile(): PerformanceProfile {
        const cpus = os.cpus().length;
        const memoryGB = os.totalmem() / (1024 * 1024 * 1024);

        if (cpus >= 8 && memoryGB >= 16) {
            return 'aggressive';
        } else if (cpus >= 4 && memoryGB >= 8) {
            return 'balanced';
        } else {
            return 'conservative';
        }
    }

    /**
     * Validate configuration
     */
    validateConfig(config: Partial<WorktreeConfig>): string[] {
        const errors: string[] = [];

        if (config.performance) {
            if (config.performance.maxParallelOperations < 1) {
                errors.push('maxParallelOperations must be at least 1');
            }
            if (config.performance.operationTimeoutMs < 1000) {
                errors.push('operationTimeoutMs must be at least 1000ms');
            }
        }

        if (config.cache) {
            if (config.cache.maxEntries < 10) {
                errors.push('cache.maxEntries must be at least 10');
            }
        }

        if (config.pool) {
            if (config.pool.size > 100) {
                errors.push('pool.size should not exceed 100');
            }
        }

        return errors;
    }

    /**
     * Export configuration
     */
    exportConfig(): string {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Import configuration
     */
    async importConfig(configJson: string): Promise<void> {
        try {
            const imported = JSON.parse(configJson) as WorktreeConfig;
            const errors = this.validateConfig(imported);

            if (errors.length > 0) {
                throw new Error(`Invalid configuration: ${errors.join(', ')}`);
            }

            this.config = imported;
            await this.saveConfiguration();
        } catch (error) {
            throw new Error(`Failed to import configuration: ${error}`);
        }
    }

    /**
     * Dispose
     */
    dispose(): void {
        this.configWatcher?.dispose();
    }
}
