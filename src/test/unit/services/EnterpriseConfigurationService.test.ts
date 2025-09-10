import {
    EnterpriseConfigurationService,
    ConfigurationError,
    ValidationError,
    TimeoutError
} from '../../../services/EnterpriseConfigurationService';
import * as vscode from 'vscode';

// Mock VS Code API
const mockWorkspaceConfiguration = {
    get: jest.fn(),
    update: jest.fn(),
    has: jest.fn(),
    inspect: jest.fn()
};

const mockWorkspace = {
    getConfiguration: jest.fn(() => mockWorkspaceConfiguration),
    onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() }))
};

const mockDisposable = {
    dispose: jest.fn()
};

// Mock vscode module
jest.mock('vscode', () => ({
    workspace: mockWorkspace,
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3
    }
}));

// Mock child_process for git worktree detection
jest.mock('child_process', () => ({
    exec: jest.fn()
}));

describe('EnterpriseConfigurationService', () => {
    let service: EnterpriseConfigurationService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockWorkspaceConfiguration.get.mockReturnValue(undefined);
        mockWorkspaceConfiguration.update.mockResolvedValue(undefined);
        mockWorkspace.onDidChangeConfiguration.mockReturnValue(mockDisposable);
    });

    afterEach(async () => {
        if (service) {
            await service.dispose();
        }
    });

    describe('Initialization', () => {
        it('should initialize successfully with valid configuration', () => {
            expect(() => {
                service = new EnterpriseConfigurationService();
            }).not.toThrow();
        });

        it('should handle VS Code API errors during initialization gracefully', () => {
            mockWorkspace.getConfiguration.mockImplementation(() => {
                throw new Error('VS Code API error');
            });

            expect(() => {
                service = new EnterpriseConfigurationService();
            }).toThrow(ConfigurationError);
        });

        it('should register configuration change listeners', () => {
            service = new EnterpriseConfigurationService();
            expect(mockWorkspace.onDidChangeConfiguration).toHaveBeenCalled();
        });
    });

    describe('Error Handling and Validation', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        describe('Input Validation', () => {
            it('should reject null or undefined keys', async () => {
                await expect(service.get(null as any)).rejects.toThrow(ValidationError);
                await expect(service.get(undefined as any)).rejects.toThrow(ValidationError);
                await expect(service.get('')).rejects.toThrow(ValidationError);
            });

            it('should reject keys with dangerous patterns', async () => {
                const dangerousKeys = ['../config', 'key<script>', 'key"injection', 'key\x00null', 'key\x1fcontrol'];

                for (const key of dangerousKeys) {
                    await expect(service.get(key)).rejects.toThrow(ValidationError);
                }
            });

            it('should sanitize AI provider values', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue('CLAUDE  ');
                const result = await service.getAiProvider();
                expect(result).toBe('claude');
            });

            it('should reject invalid AI provider values', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue('invalid-provider');
                const result = await service.getAiProvider();
                expect(result).toBe('claude'); // Falls back to default
            });

            it('should validate maxAgents range', async () => {
                // Test various invalid values
                const testCases = [
                    { input: -1, expected: 3 },
                    { input: 0, expected: 3 },
                    { input: 51, expected: 3 },
                    { input: 'invalid', expected: 3 },
                    { input: null, expected: 3 }
                ];

                for (const testCase of testCases) {
                    mockWorkspaceConfiguration.get.mockReturnValue(testCase.input);
                    const result = await service.getMaxAgents();
                    expect(result).toBe(testCase.expected);
                }
            });

            it('should sanitize AI path for security', async () => {
                const dangerousPaths = [
                    '../../../etc/passwd',
                    'path\x00null',
                    'path<script>alert()</script>',
                    'path|rm -rf /',
                    'path*wildcard'
                ];

                for (const path of dangerousPaths) {
                    mockWorkspaceConfiguration.get.mockReturnValue(path);
                    const result = await service.getAiPath();
                    expect(result).toBe(''); // Should be sanitized to empty
                }
            });
        });

        describe('Error Recovery', () => {
            it('should handle VS Code API errors gracefully', async () => {
                mockWorkspaceConfiguration.get.mockImplementation(() => {
                    throw new Error('VS Code API error');
                });

                await expect(service.get('maxAgents')).rejects.toThrow(ConfigurationError);
            });

            it('should provide fallback values when configuration is unavailable', async () => {
                mockWorkspaceConfiguration.get.mockImplementation(() => {
                    throw new Error('Configuration unavailable');
                });

                // Should use hard-coded defaults
                expect(service.isAutoAssignTasks()).toBe(true);
                expect(service.getTemplatesPath()).toBe('.nofx/templates');
                expect(service.getLogLevel()).toBe('info');
            });
        });
    });

    describe('Circuit Breaker Pattern', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should open circuit breaker after failure threshold', async () => {
            // Mock consecutive failures
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Persistent failure');
            });

            // Execute operations until circuit breaker opens
            for (let i = 0; i < 5; i++) {
                try {
                    await service.get('maxAgents');
                } catch (error) {
                    // Expected to fail
                }
            }

            // Next operation should fail immediately due to open circuit breaker
            const start = Date.now();
            await expect(service.get('maxAgents')).rejects.toThrow(/circuit breaker/i);
            const duration = Date.now() - start;

            // Should fail fast (under 100ms) instead of retrying
            expect(duration).toBeLessThan(100);
        });

        it('should attempt recovery after timeout', async () => {
            // Force circuit breaker open
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Initial failure');
            });

            for (let i = 0; i < 5; i++) {
                try {
                    await service.get('maxAgents');
                } catch (error) {
                    // Expected to fail
                }
            }

            // Simulate passage of time by mocking Date.now()
            const originalNow = Date.now;
            Date.now = jest.fn(() => originalNow() + 61000); // 61 seconds later

            // Mock recovery success
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Should attempt recovery and succeed
            const result = await service.get('maxAgents', 3);
            expect(result).toBe(3);

            // Restore Date.now
            Date.now = originalNow;
        });
    });

    describe('Retry Logic', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should retry failed operations with exponential backoff', async () => {
            let attemptCount = 0;
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('Temporary failure');
                }
                return 3; // Success on third attempt
            });

            const result = await service.get('maxAgents', 1);
            expect(result).toBe(3);
            expect(attemptCount).toBe(3);
        });

        it('should fail after max retry attempts', async () => {
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Persistent failure');
            });

            await expect(service.get('maxAgents')).rejects.toThrow(/failed after.*attempts/i);
        });
    });

    describe('Timeout Handling', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should timeout long-running operations', async () => {
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve(3), 10000); // 10 second delay
                });
            });

            await expect(service.get('maxAgents')).rejects.toThrow(TimeoutError);
        });

        it('should complete operations within timeout', async () => {
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve(3), 100); // 100ms delay
                });
            });

            const result = await service.get('maxAgents', 1);
            expect(result).toBe(3);
        });
    });

    describe('Performance Metrics', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should track operation metrics', async () => {
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            await service.get('maxAgents');
            await service.get('aiProvider');

            const metrics = service.getMetrics();
            expect(metrics.operationCount).toBe(2);
            expect(metrics.successCount).toBe(2);
            expect(metrics.errorCount).toBe(0);
            expect(metrics.averageLatency).toBeGreaterThan(0);
        });

        it('should track error metrics', async () => {
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Test error');
            });

            try {
                await service.get('maxAgents');
            } catch (error) {
                // Expected to fail
            }

            const metrics = service.getMetrics();
            expect(metrics.errorCount).toBe(1);
            expect(metrics.lastErrorTime).toBeInstanceOf(Date);
        });

        it('should reset metrics', async () => {
            mockWorkspaceConfiguration.get.mockReturnValue(3);
            await service.get('maxAgents');

            service.resetMetrics();

            const metrics = service.getMetrics();
            expect(metrics.operationCount).toBe(0);
            expect(metrics.successCount).toBe(0);
            expect(metrics.errorCount).toBe(0);
        });
    });

    describe('Health Checks', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should report healthy status when all checks pass', async () => {
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            const health = await service.healthCheck();
            expect(health.healthy).toBe(true);
            expect(health.status).toBe('healthy');
            expect(health.checks).toHaveLength(4); // vscode-api, config-access, circuit-breaker, resource-usage
        });

        it('should report unhealthy status when checks fail', async () => {
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Configuration unavailable');
            });

            const health = await service.healthCheck();
            expect(health.healthy).toBe(false);
            expect(health.status).toBe('unhealthy');

            const failedCheck = health.checks.find(c => c.status === 'fail');
            expect(failedCheck).toBeDefined();
        });

        it('should cache health check results', async () => {
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            const health1 = await service.healthCheck();
            const health2 = await service.healthCheck();

            // Should return the same cached result
            expect(health1.timestamp).toEqual(health2.timestamp);
        });
    });

    describe('Concurrency and Race Conditions', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should handle concurrent read operations safely', async () => {
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            const promises = Array.from({ length: 10 }, () => service.get('maxAgents'));
            const results = await Promise.all(promises);

            expect(results).toHaveLength(10);
            expect(results.every(r => r === 3)).toBe(true);
        });

        it('should handle concurrent update operations safely', async () => {
            mockWorkspaceConfiguration.update.mockResolvedValue(undefined);

            const promises = Array.from({ length: 5 }, (_, i) => service.update('maxAgents', i + 1));

            await expect(Promise.all(promises)).resolves.not.toThrow();
            expect(mockWorkspaceConfiguration.update).toHaveBeenCalledTimes(5);
        });
    });

    describe('Git Worktree Detection', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should detect git worktree availability', async () => {
            const { exec } = require('child_process');
            exec.mockImplementation((cmd: string, options: any, callback: Function) => {
                callback(null, 'git worktree help', '');
            });

            const result = await service.isUseWorktrees();
            expect(result).toBe(true);
        });

        it('should handle git worktree unavailability', async () => {
            const { exec } = require('child_process');
            exec.mockImplementation((cmd: string, options: any, callback: Function) => {
                callback(new Error('git command not found'), '', 'command not found');
            });

            const result = await service.isUseWorktrees();
            expect(result).toBe(false);
        });
    });

    describe('Resource Management and Cleanup', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should dispose resources properly', async () => {
            // Register some event handlers
            service.onDidChange(() => {});
            service.onDidChange(() => {});

            await service.dispose();

            // Verify disposables were called
            expect(mockDisposable.dispose).toHaveBeenCalled();
        });

        it('should handle disposal errors gracefully', async () => {
            mockDisposable.dispose.mockImplementation(() => {
                throw new Error('Disposal error');
            });

            // Should not throw even if individual disposables fail
            await expect(service.dispose()).rejects.toThrow(ConfigurationError);
        });

        it('should prevent operations after disposal', async () => {
            await service.dispose();

            await expect(service.get('maxAgents')).rejects.toThrow(/disposed/i);
            await expect(service.update('maxAgents', 3)).rejects.toThrow(/disposed/i);
        });

        it('should handle double disposal gracefully', async () => {
            await service.dispose();
            await expect(service.dispose()).resolves.not.toThrow();
        });
    });

    describe('Edge Cases and Boundary Conditions', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should handle extremely large maxAgents values', async () => {
            mockWorkspaceConfiguration.get.mockReturnValue(Number.MAX_SAFE_INTEGER);
            const result = await service.getMaxAgents();
            expect(result).toBe(3); // Should fallback to default
        });

        it('should handle negative maxAgents values', async () => {
            mockWorkspaceConfiguration.get.mockReturnValue(-100);
            const result = await service.getMaxAgents();
            expect(result).toBe(3); // Should fallback to default
        });

        it('should handle non-string AI provider types', async () => {
            mockWorkspaceConfiguration.get.mockReturnValue(12345);
            const result = await service.getAiProvider();
            expect(result).toBe('claude'); // Should fallback to default
        });

        it('should handle circular reference in configuration', async () => {
            const circularObj: any = { value: 3 };
            circularObj.self = circularObj;

            mockWorkspaceConfiguration.get.mockReturnValue(circularObj);

            // Should handle gracefully without infinite loops
            await expect(service.get('maxAgents')).resolves.toBeDefined();
        });

        it('should handle very long AI path values', async () => {
            const longPath = 'a'.repeat(10000);
            mockWorkspaceConfiguration.get.mockReturnValue(longPath);

            const result = await service.getAiPath();
            // Should be sanitized due to length
            expect(result.length).toBeLessThan(longPath.length);
        });
    });

    describe('Event Handling', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should register configuration change callbacks', () => {
            const callback = jest.fn();
            const disposable = service.onDidChange(callback);

            expect(mockWorkspace.onDidChangeConfiguration).toHaveBeenCalled();
            expect(disposable).toHaveProperty('dispose');
        });

        it('should reject invalid callbacks', () => {
            expect(() => {
                service.onDidChange(null as any);
            }).toThrow(ValidationError);

            expect(() => {
                service.onDidChange('not a function' as any);
            }).toThrow(ValidationError);
        });

        it('should handle callback errors gracefully', () => {
            const errorCallback = jest.fn(() => {
                throw new Error('Callback error');
            });

            // Should not throw when registering
            expect(() => {
                service.onDidChange(errorCallback);
            }).not.toThrow();

            // Simulate configuration change
            const changeEvent = { affectsConfiguration: jest.fn(() => true) };
            const registeredCallback = mockWorkspace.onDidChangeConfiguration.mock.calls[0][0];

            // Should handle callback error gracefully
            expect(() => {
                registeredCallback(changeEvent);
            }).not.toThrow();
        });
    });
});
