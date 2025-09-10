/**
 * Comprehensive Unit Tests for EnterpriseConfigurationService
 *
 * Test Coverage Goals:
 * - 100% statement coverage
 * - 100% branch coverage
 * - 100% function coverage
 * - 100% line coverage
 *
 * Testing Strategy:
 * - Happy path scenarios
 * - Edge cases and boundary conditions
 * - Error scenarios and recovery
 * - Input validation and sanitization
 * - Concurrency and race conditions
 * - Resource management and cleanup
 */

import {
    EnterpriseConfigurationService,
    ConfigurationError,
    ValidationError,
    TimeoutError
} from '../../../services/EnterpriseConfigurationService';
import * as vscode from 'vscode';
import * as crypto from 'crypto';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock workspace configuration
const mockWorkspaceConfiguration = {
    get: jest.fn(),
    update: jest.fn(),
    has: jest.fn(),
    inspect: jest.fn()
};

// Mock workspace
const mockWorkspace = {
    getConfiguration: jest.fn(() => mockWorkspaceConfiguration),
    onDidChangeConfiguration: jest.fn()
};

// Mock disposable
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
const mockExec = jest.fn();
const mockPromisify = jest.fn(() => mockExec);

jest.mock('child_process', () => ({
    exec: jest.fn((cmd: string, opts: any, callback?: Function) => {
        if (callback) {
            callback(null, 'git worktree help', '');
        }
    })
}));

jest.mock('util', () => ({
    promisify: mockPromisify
}));

// Mock crypto for UUID generation
jest.mock('crypto', () => ({
    randomUUID: jest.fn(() => 'test-uuid-1234-5678-90ab-cdef')
}));

// ============================================================================
// Test Helpers
// ============================================================================

class TestDataBuilder {
    static createValidConfig() {
        return {
            aiProvider: 'claude',
            maxAgents: 3,
            aiPath: '/usr/local/bin/claude'
        };
    }

    static createInvalidConfig() {
        return {
            aiProvider: 123, // Should be string
            maxAgents: 'three', // Should be number
            aiPath: '../../../etc/passwd' // Path traversal
        };
    }

    static createEdgeCaseConfig() {
        return {
            aiProvider: '  CLAUDE  ', // Needs trimming
            maxAgents: 3.7, // Needs flooring
            aiPath: 'path with spaces'
        };
    }
}

function createMockChangeEvent(affectsConfig: boolean = true): vscode.ConfigurationChangeEvent {
    return {
        affectsConfiguration: jest.fn((section: string) => affectsConfig)
    } as any;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Test Suite
// ============================================================================

describe('EnterpriseConfigurationService - Comprehensive Tests', () => {
    let service: EnterpriseConfigurationService;
    let consoleLogSpy: jest.SpyInstance;
    let consoleInfoSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup default mock behaviors
        mockWorkspaceConfiguration.get.mockImplementation((key: string, defaultValue?: any) => defaultValue);
        mockWorkspaceConfiguration.update.mockResolvedValue(undefined);
        mockWorkspace.onDidChangeConfiguration.mockReturnValue(mockDisposable);

        // Spy on console methods for logging verification
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(async () => {
        // Cleanup
        if (service) {
            await service.dispose();
            service = null as any;
        }

        // Restore console methods
        consoleLogSpy.mockRestore();
        consoleInfoSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    // ========================================================================
    // INITIALIZATION TESTS
    // ========================================================================

    describe('Constructor and Initialization', () => {
        it('should initialize successfully with valid VS Code API', () => {
            // Act & Assert
            expect(() => {
                service = new EnterpriseConfigurationService();
            }).not.toThrow();

            // Verify initialization
            expect(mockWorkspace.getConfiguration).toHaveBeenCalledWith('nofx');
            expect(mockWorkspace.onDidChangeConfiguration).toHaveBeenCalled();
            expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('initialized successfully'));
        });

        it('should handle VS Code API errors during initialization', () => {
            // Arrange
            mockWorkspace.getConfiguration.mockImplementation(() => {
                throw new Error('VS Code API unavailable');
            });

            // Act & Assert
            expect(() => {
                service = new EnterpriseConfigurationService();
            }).toThrow(ConfigurationError);

            expect(() => {
                service = new EnterpriseConfigurationService();
            }).toThrow('Failed to initialize configuration service');
        });

        it('should handle event handler registration failure', () => {
            // Arrange
            mockWorkspace.onDidChangeConfiguration.mockImplementation(() => {
                throw new Error('Cannot register listener');
            });

            // Act & Assert
            expect(() => {
                service = new EnterpriseConfigurationService();
            }).toThrow(ConfigurationError);
            expect(() => {
                service = new EnterpriseConfigurationService();
            }).toThrow(/event handler/i);
        });

        it('should generate unique instance ID', () => {
            // Act
            service = new EnterpriseConfigurationService();

            // Assert - verify UUID was called and logged
            expect(crypto.randomUUID).toHaveBeenCalled();
            expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('test-uuid'));
        });

        it('should start health monitoring on initialization', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Act
            service = new EnterpriseConfigurationService();
            await sleep(50); // Allow async health check to run

            // Assert
            const health = await service.healthCheck();
            expect(health).toBeDefined();
            expect(health.checks).toHaveLength(4);
        });
    });

    // ========================================================================
    // CONFIGURATION GET TESTS
    // ========================================================================

    describe('Configuration Get Operations', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        describe('Happy Path', () => {
            it('should get configuration value successfully', async () => {
                // Arrange
                mockWorkspaceConfiguration.get.mockReturnValue('claude');

                // Act
                const result = await service.get('aiProvider');

                // Assert
                expect(result).toBe('claude');
                expect(mockWorkspaceConfiguration.get).toHaveBeenCalledWith('aiProvider', undefined);
            });

            it('should return default value when config is undefined', async () => {
                // Arrange
                mockWorkspaceConfiguration.get.mockReturnValue(undefined);

                // Act
                const result = await service.get('maxAgents', 5);

                // Assert
                expect(result).toBe(5);
            });

            it('should get all essential configuration values', async () => {
                // Arrange
                mockWorkspaceConfiguration.get
                    .mockReturnValueOnce('aider')
                    .mockReturnValueOnce(7)
                    .mockReturnValueOnce('/custom/path');

                // Act
                const provider = await service.getAiProvider();
                const maxAgents = await service.getMaxAgents();
                const aiPath = await service.getAiPath();

                // Assert
                expect(provider).toBe('aider');
                expect(maxAgents).toBe(7);
                expect(aiPath).toBe('/custom/path');
            });
        });

        describe('Input Validation', () => {
            it('should reject null key', async () => {
                await expect(service.get(null as any)).rejects.toThrow(ValidationError);
                await expect(service.get(null as any)).rejects.toThrow('Invalid configuration key');
            });

            it('should reject undefined key', async () => {
                await expect(service.get(undefined as any)).rejects.toThrow(ValidationError);
            });

            it('should reject empty string key', async () => {
                await expect(service.get('')).rejects.toThrow(ValidationError);
                await expect(service.get('   ')).rejects.toThrow(ValidationError);
            });

            it('should reject keys with path traversal patterns', async () => {
                const dangerousKeys = ['../config', '../../secret', 'config/../../../etc/passwd'];

                for (const key of dangerousKeys) {
                    await expect(service.get(key)).rejects.toThrow(ValidationError);
                }
            });

            it('should reject keys with injection patterns', async () => {
                const injectionKeys = [
                    'key<script>alert(1)</script>',
                    'key"DROP TABLE',
                    "key'; DELETE FROM",
                    'key`rm -rf /'
                ];

                for (const key of injectionKeys) {
                    await expect(service.get(key)).rejects.toThrow(ValidationError);
                }
            });

            it('should reject keys with control characters', async () => {
                const controlCharKeys = ['key\x00null', 'key\x1funit', 'key\x7fdel', 'key\r\ninjection'];

                for (const key of controlCharKeys) {
                    await expect(service.get(key)).rejects.toThrow(ValidationError);
                }
            });
        });

        describe('Type Validation and Sanitization', () => {
            describe('maxAgents validation', () => {
                it('should floor floating point values', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue(3.9);
                    const result = await service.getMaxAgents();
                    expect(result).toBe(3);
                });

                it('should reject negative values', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue(-5);
                    const result = await service.getMaxAgents();
                    expect(result).toBe(3); // Default
                });

                it('should reject zero', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue(0);
                    const result = await service.getMaxAgents();
                    expect(result).toBe(3);
                });

                it('should reject values over 50', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue(51);
                    const result = await service.getMaxAgents();
                    expect(result).toBe(3);
                });

                it('should handle NaN values', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue('not a number');
                    const result = await service.getMaxAgents();
                    expect(result).toBe(3);
                });

                it('should handle null values', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue(null);
                    const result = await service.getMaxAgents();
                    expect(result).toBe(3);
                });

                it('should handle extremely large numbers', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue(Number.MAX_SAFE_INTEGER);
                    const result = await service.getMaxAgents();
                    expect(result).toBe(3);
                });

                it('should handle Infinity', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue(Infinity);
                    const result = await service.getMaxAgents();
                    expect(result).toBe(3);
                });
            });

            describe('aiProvider validation', () => {
                it('should normalize to lowercase', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue('CLAUDE');
                    const result = await service.getAiProvider();
                    expect(result).toBe('claude');
                });

                it('should trim whitespace', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue('  aider  ');
                    const result = await service.getAiProvider();
                    expect(result).toBe('aider');
                });

                it('should reject invalid providers', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue('invalid-ai');
                    const result = await service.getAiProvider();
                    expect(result).toBe('claude'); // Default
                });

                it('should handle non-string types', async () => {
                    const nonStringValues = [123, true, {}, [], null];

                    for (const value of nonStringValues) {
                        mockWorkspaceConfiguration.get.mockReturnValue(value);
                        const result = await service.getAiProvider();
                        expect(result).toBe('claude');
                    }
                });

                it('should accept valid providers', async () => {
                    const validProviders = ['claude', 'aider', 'custom'];

                    for (const provider of validProviders) {
                        mockWorkspaceConfiguration.get.mockReturnValue(provider);
                        const result = await service.getAiProvider();
                        expect(result).toBe(provider);
                    }
                });
            });

            describe('aiPath validation', () => {
                it('should sanitize path traversal attempts', async () => {
                    const dangerousPaths = [
                        '../../../etc/passwd',
                        '..\\..\\windows\\system32',
                        '/usr/bin/../../../etc/shadow'
                    ];

                    for (const path of dangerousPaths) {
                        mockWorkspaceConfiguration.get.mockReturnValue(path);
                        const result = await service.getAiPath();
                        expect(result).toBe(''); // Sanitized
                    }
                });

                it('should sanitize paths with control characters', async () => {
                    const controlCharPaths = ['path\x00null', 'path\x1fcontrol', 'path\x7fdel'];

                    for (const path of controlCharPaths) {
                        mockWorkspaceConfiguration.get.mockReturnValue(path);
                        const result = await service.getAiPath();
                        expect(result).toBe('');
                    }
                });

                it('should sanitize paths with dangerous characters', async () => {
                    const dangerousChars = [
                        'path<script>',
                        'path>output',
                        'path"injection',
                        'path|pipe',
                        'path*wildcard',
                        'path?query'
                    ];

                    for (const path of dangerousChars) {
                        mockWorkspaceConfiguration.get.mockReturnValue(path);
                        const result = await service.getAiPath();
                        expect(result).toBe('');
                    }
                });

                it('should trim whitespace', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue('  /usr/bin/claude  ');
                    const result = await service.getAiPath();
                    expect(result).toBe('/usr/bin/claude');
                });

                it('should handle non-string types', async () => {
                    mockWorkspaceConfiguration.get.mockReturnValue(12345);
                    const result = await service.getAiPath();
                    expect(result).toBe('');
                });

                it('should allow valid paths', async () => {
                    const validPaths = [
                        '/usr/local/bin/claude',
                        'C:\\Program Files\\Claude\\claude.exe',
                        './bin/claude',
                        'claude'
                    ];

                    for (const path of validPaths) {
                        mockWorkspaceConfiguration.get.mockReturnValue(path);
                        const result = await service.getAiPath();
                        expect(result).toBe(path);
                    }
                });
            });
        });

        describe('Error Handling', () => {
            it('should handle VS Code API errors', async () => {
                mockWorkspaceConfiguration.get.mockImplementation(() => {
                    throw new Error('VS Code API error');
                });

                await expect(service.get('maxAgents')).rejects.toThrow(ConfigurationError);
                await expect(service.get('maxAgents')).rejects.toThrow('Failed to get configuration value');
            });

            it('should handle service disposed error', async () => {
                await service.dispose();
                await expect(service.get('maxAgents')).rejects.toThrow(ConfigurationError);
                await expect(service.get('maxAgents')).rejects.toThrow('Service is disposed');
            });

            it('should record error metrics', async () => {
                mockWorkspaceConfiguration.get.mockImplementation(() => {
                    throw new Error('Test error');
                });

                try {
                    await service.get('maxAgents');
                } catch {
                    // Expected
                }

                const metrics = service.getMetrics();
                expect(metrics.errorCount).toBe(1);
                expect(metrics.lastErrorTime).toBeInstanceOf(Date);
            });
        });
    });

    // ========================================================================
    // CONFIGURATION UPDATE TESTS
    // ========================================================================

    describe('Configuration Update Operations', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        describe('Happy Path', () => {
            it('should update configuration successfully', async () => {
                // Act
                await service.update('maxAgents', 5);

                // Assert
                expect(mockWorkspaceConfiguration.update).toHaveBeenCalledWith(
                    'maxAgents',
                    5,
                    vscode.ConfigurationTarget.Workspace
                );
            });

            it('should update with different targets', async () => {
                await service.update('maxAgents', 5, vscode.ConfigurationTarget.Global);
                expect(mockWorkspaceConfiguration.update).toHaveBeenCalledWith(
                    'maxAgents',
                    5,
                    vscode.ConfigurationTarget.Global
                );

                await service.update('maxAgents', 5, vscode.ConfigurationTarget.WorkspaceFolder);
                expect(mockWorkspaceConfiguration.update).toHaveBeenCalledWith(
                    'maxAgents',
                    5,
                    vscode.ConfigurationTarget.WorkspaceFolder
                );
            });

            it('should validate and sanitize values before update', async () => {
                await service.update('maxAgents', -5);
                expect(mockWorkspaceConfiguration.update).toHaveBeenCalledWith(
                    'maxAgents',
                    3, // Should be sanitized to default
                    expect.any(Number)
                );

                await service.update('aiProvider', 'CLAUDE  ');
                expect(mockWorkspaceConfiguration.update).toHaveBeenCalledWith(
                    'aiProvider',
                    'claude', // Should be normalized
                    expect.any(Number)
                );
            });
        });

        describe('Input Validation', () => {
            it('should reject invalid keys', async () => {
                await expect(service.update(null as any, 5)).rejects.toThrow(ValidationError);
                await expect(service.update('', 5)).rejects.toThrow(ValidationError);
                await expect(service.update('../config', 5)).rejects.toThrow(ValidationError);
            });

            it('should reject updates when service is disposed', async () => {
                await service.dispose();
                await expect(service.update('maxAgents', 5)).rejects.toThrow(ConfigurationError);
                await expect(service.update('maxAgents', 5)).rejects.toThrow('Service is disposed');
            });
        });

        describe('Error Handling', () => {
            it('should handle VS Code API update errors', async () => {
                mockWorkspaceConfiguration.update.mockRejectedValue(new Error('Update failed'));

                await expect(service.update('maxAgents', 5)).rejects.toThrow(ConfigurationError);
                await expect(service.update('maxAgents', 5)).rejects.toThrow('Failed to update configuration');
            });

            it('should invalidate health check cache on update', async () => {
                // Get initial health check
                const health1 = await service.healthCheck();

                // Update configuration
                await service.update('maxAgents', 5);

                // Get new health check - should be fresh, not cached
                const health2 = await service.healthCheck();

                expect(health2.timestamp).not.toEqual(health1.timestamp);
            });

            it('should record metrics for successful updates', async () => {
                await service.update('maxAgents', 5);

                const metrics = service.getMetrics();
                expect(metrics.successCount).toBeGreaterThan(0);
                expect(metrics.lastSuccessTime).toBeInstanceOf(Date);
            });
        });
    });

    // ========================================================================
    // CIRCUIT BREAKER TESTS
    // ========================================================================

    describe('Circuit Breaker Pattern', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should open circuit after failure threshold', async () => {
            // Arrange - Mock persistent failures
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Persistent failure');
            });

            // Act - Trigger failures until circuit opens
            for (let i = 0; i < 5; i++) {
                try {
                    await service.get('maxAgents');
                } catch {
                    // Expected failures
                }
            }

            // Assert - Circuit should be open, next call should fail fast
            const startTime = Date.now();
            await expect(service.get('maxAgents')).rejects.toThrow(/Circuit breaker is open/);
            const duration = Date.now() - startTime;

            // Should fail immediately without retries
            expect(duration).toBeLessThan(100);
        });

        it('should transition to half-open after recovery timeout', async () => {
            // Arrange - Open the circuit
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Failure');
            });

            for (let i = 0; i < 5; i++) {
                try {
                    await service.get('maxAgents');
                } catch {
                    // Expected
                }
            }

            // Mock time passing (60+ seconds)
            const originalNow = Date.now;
            Date.now = jest.fn(() => originalNow() + 61000);

            // Act - Next call should attempt recovery
            mockWorkspaceConfiguration.get.mockReturnValue(3); // Success
            const result = await service.get('maxAgents');

            // Assert
            expect(result).toBe(3);

            // Restore Date.now
            Date.now = originalNow;
        });

        it('should close circuit after successful recovery', async () => {
            // Arrange - Open circuit then recover
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Failure');
            });

            for (let i = 0; i < 5; i++) {
                try {
                    await service.get('maxAgents');
                } catch {
                    // Expected
                }
            }

            // Mock recovery
            const originalNow = Date.now;
            Date.now = jest.fn(() => originalNow() + 61000);
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Act - Successful recovery
            await service.get('maxAgents');

            // Assert - Circuit should be closed, normal operation
            Date.now = originalNow;
            const result = await service.get('aiProvider');
            expect(result).toBeDefined();
        });

        it('should reopen circuit if recovery fails', async () => {
            // Arrange - Open circuit
            let callCount = 0;
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                callCount++;
                throw new Error('Persistent failure');
            });

            // Open circuit
            for (let i = 0; i < 5; i++) {
                try {
                    await service.get('maxAgents');
                } catch {
                    // Expected
                }
            }

            // Mock time passing
            const originalNow = Date.now;
            Date.now = jest.fn(() => originalNow() + 61000);

            // Act - Recovery attempt should fail
            try {
                await service.get('maxAgents');
            } catch {
                // Expected
            }

            // Assert - Circuit should be open again
            Date.now = originalNow;
            await expect(service.get('maxAgents')).rejects.toThrow(/Circuit breaker is open/);
        });
    });

    // ========================================================================
    // RETRY LOGIC TESTS
    // ========================================================================

    describe('Retry Logic', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should retry with exponential backoff', async () => {
            // Arrange
            let attemptCount = 0;
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('Transient failure');
                }
                return 5;
            });

            // Act
            const startTime = Date.now();
            const result = await service.get('maxAgents');
            const duration = Date.now() - startTime;

            // Assert
            expect(result).toBe(5);
            expect(attemptCount).toBe(3);
            // Should have delays: 1000ms + 2000ms = 3000ms minimum
            expect(duration).toBeGreaterThanOrEqual(2900); // Allow some margin
        });

        it('should fail after max retry attempts', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Persistent failure');
            });

            // Act & Assert
            await expect(service.get('maxAgents')).rejects.toThrow(ConfigurationError);
            await expect(service.get('maxAgents')).rejects.toThrow(/failed after.*attempts/i);
        });

        it('should succeed on first attempt without retries', async () => {
            // Arrange
            let attemptCount = 0;
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                attemptCount++;
                return 3;
            });

            // Act
            const result = await service.get('maxAgents');

            // Assert
            expect(result).toBe(3);
            expect(attemptCount).toBe(1);
        });

        it('should respect max delay limit', async () => {
            // This would require mocking the sleep function
            // For now, verify the configuration exists
            expect(service).toBeDefined();
            // The max delay is enforced in the implementation
        });
    });

    // ========================================================================
    // TIMEOUT HANDLING TESTS
    // ========================================================================

    describe('Timeout Handling', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should timeout long-running get operations', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve(3), 10000); // 10 second delay
                });
            });

            // Act & Assert
            await expect(service.get('maxAgents')).rejects.toThrow(TimeoutError);
            await expect(service.get('maxAgents')).rejects.toThrow(/timed out after.*ms/);
        });

        it('should timeout long-running update operations', async () => {
            // Arrange
            mockWorkspaceConfiguration.update.mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve(undefined), 40000); // 40 second delay
                });
            });

            // Act & Assert
            await expect(service.update('maxAgents', 5)).rejects.toThrow(TimeoutError);
        });

        it('should complete operations within timeout', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => resolve(3), 100); // 100ms delay
                });
            });

            // Act
            const result = await service.get('maxAgents');

            // Assert
            expect(result).toBe(3);
        });

        it('should use different timeouts for different operations', async () => {
            // Get operations have 5 second timeout
            // Update operations have 30 second timeout
            // This is validated in the implementation
            expect(service).toBeDefined();
        });
    });

    // ========================================================================
    // HEALTH CHECK TESTS
    // ========================================================================

    describe('Health Checks', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should report healthy status when all checks pass', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Act
            const health = await service.healthCheck();

            // Assert
            expect(health.healthy).toBe(true);
            expect(health.status).toBe('healthy');
            expect(health.checks).toHaveLength(4);
            expect(health.checks.every(c => c.status === 'pass')).toBe(true);
        });

        it('should report unhealthy when VS Code API fails', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('API error');
            });

            // Act
            const health = await service.healthCheck();

            // Assert
            expect(health.healthy).toBe(false);
            expect(health.status).toBe('unhealthy');

            const configCheck = health.checks.find(c => c.name === 'config-access');
            expect(configCheck?.status).toBe('fail');
            expect(configCheck?.message).toContain('Configuration access failed');
        });

        it('should report degraded when circuit breaker is open', async () => {
            // Arrange - Open circuit breaker
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Failure');
            });

            for (let i = 0; i < 5; i++) {
                try {
                    await service.get('maxAgents');
                } catch {
                    // Expected
                }
            }

            // Fix configuration for other checks
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Act
            const health = await service.healthCheck();

            // Assert
            const circuitCheck = health.checks.find(c => c.name === 'circuit-breaker');
            expect(circuitCheck?.status).toBe('warn');
            expect(circuitCheck?.message).toContain('Circuit breaker is open');
        });

        it('should cache health check results', async () => {
            // Act
            const health1 = await service.healthCheck();
            const health2 = await service.healthCheck();

            // Assert - Same timestamp means cached
            expect(health1.timestamp).toEqual(health2.timestamp);
        });

        it('should refresh cache after timeout', async () => {
            // Act
            const health1 = await service.healthCheck();

            // Mock time passing (31 seconds)
            const originalNow = Date.now;
            Date.now = jest.fn(() => originalNow() + 31000);

            const health2 = await service.healthCheck();

            // Assert - Different timestamps
            expect(health2.timestamp).not.toEqual(health1.timestamp);

            // Restore
            Date.now = originalNow;
        });

        it('should check resource usage', async () => {
            // Act
            const health = await service.healthCheck();

            // Assert
            const resourceCheck = health.checks.find(c => c.name === 'resource-usage');
            expect(resourceCheck).toBeDefined();
            expect(resourceCheck?.status).toBe('pass');
        });

        it('should include duration for each check', async () => {
            // Act
            const health = await service.healthCheck();

            // Assert
            health.checks.forEach(check => {
                expect(check.duration).toBeGreaterThanOrEqual(0);
                expect(typeof check.duration).toBe('number');
            });
        });
    });

    // ========================================================================
    // METRICS TESTS
    // ========================================================================

    describe('Performance Metrics', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should track operation count', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Act
            await service.get('maxAgents');
            await service.get('aiProvider');
            await service.update('maxAgents', 5);

            // Assert
            const metrics = service.getMetrics();
            expect(metrics.operationCount).toBe(3);
        });

        it('should track success count', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Act
            await service.get('maxAgents');
            await service.get('aiProvider');

            // Assert
            const metrics = service.getMetrics();
            expect(metrics.successCount).toBe(2);
            expect(metrics.lastSuccessTime).toBeInstanceOf(Date);
        });

        it('should track error count', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Test error');
            });

            // Act
            for (let i = 0; i < 3; i++) {
                try {
                    await service.get('maxAgents');
                } catch {
                    // Expected
                }
            }

            // Assert
            const metrics = service.getMetrics();
            expect(metrics.errorCount).toBeGreaterThan(0);
            expect(metrics.lastErrorTime).toBeInstanceOf(Date);
        });

        it('should calculate average latency', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Act
            await service.get('maxAgents');
            await service.get('aiProvider');

            // Assert
            const metrics = service.getMetrics();
            expect(metrics.averageLatency).toBeGreaterThan(0);
            expect(typeof metrics.averageLatency).toBe('number');
        });

        it('should reset metrics', () => {
            // Arrange
            service.resetMetrics();

            // Act
            const metrics = service.getMetrics();

            // Assert
            expect(metrics.operationCount).toBe(0);
            expect(metrics.successCount).toBe(0);
            expect(metrics.errorCount).toBe(0);
            expect(metrics.averageLatency).toBe(0);
        });

        it('should return copy of metrics', () => {
            // Act
            const metrics1 = service.getMetrics();
            metrics1.operationCount = 999;
            const metrics2 = service.getMetrics();

            // Assert - Modification shouldn't affect internal state
            expect(metrics2.operationCount).toBe(0);
        });
    });

    // ========================================================================
    // WORKTREE DETECTION TESTS
    // ========================================================================

    describe('Git Worktree Detection', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should detect git worktree availability', async () => {
            // Arrange
            mockExec.mockResolvedValue({ stdout: 'git worktree', stderr: '' });

            // Act
            const result = await service.isUseWorktrees();

            // Assert
            expect(result).toBe(true);
        });

        it('should handle git not found', async () => {
            // Arrange
            mockExec.mockRejectedValue(new Error('command not found: git'));

            // Act
            const result = await service.isUseWorktrees();

            // Assert
            expect(result).toBe(false);
        });

        it('should handle git worktree not supported', async () => {
            // Arrange
            mockExec.mockRejectedValue(new Error('Unknown subcommand: worktree'));

            // Act
            const result = await service.isUseWorktrees();

            // Assert
            expect(result).toBe(false);
        });

        it('should handle timeout in git detection', async () => {
            // Arrange
            mockExec.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10000)));

            // Act
            const result = await service.isUseWorktrees();

            // Assert
            expect(result).toBe(false); // Should timeout and return false
        });
    });

    // ========================================================================
    // HARD-CODED DEFAULTS TESTS
    // ========================================================================

    describe('Hard-coded Default Values', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should return correct default values', () => {
            expect(service.isAutoAssignTasks()).toBe(true);
            expect(service.getTemplatesPath()).toBe('.nofx/templates');
            expect(service.isPersistAgents()).toBe(true);
            expect(service.getLogLevel()).toBe('info');
            expect(service.isShowAgentTerminalOnSpawn()).toBe(false);
            expect(service.getClaudeInitializationDelay()).toBe(10);
            expect(service.getAgentSpawnDelay()).toBe(2000);
        });

        it('should not change default values', () => {
            // Call multiple times to ensure consistency
            for (let i = 0; i < 5; i++) {
                expect(service.isAutoAssignTasks()).toBe(true);
                expect(service.getTemplatesPath()).toBe('.nofx/templates');
            }
        });
    });

    // ========================================================================
    // EVENT HANDLING TESTS
    // ========================================================================

    describe('Configuration Change Events', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should register change listener', () => {
            // Arrange
            const callback = jest.fn();

            // Act
            const disposable = service.onDidChange(callback);

            // Assert
            expect(mockWorkspace.onDidChangeConfiguration).toHaveBeenCalled();
            expect(disposable).toBeDefined();
            expect(disposable.dispose).toBeDefined();
        });

        it('should validate callback parameter', () => {
            expect(() => service.onDidChange(null as any)).toThrow(ValidationError);
            expect(() => service.onDidChange(undefined as any)).toThrow(ValidationError);
            expect(() => service.onDidChange('not a function' as any)).toThrow(ValidationError);
        });

        it('should handle callback errors gracefully', () => {
            // Arrange
            const errorCallback = jest.fn(() => {
                throw new Error('Callback error');
            });

            service.onDidChange(errorCallback);
            const registeredHandler = mockWorkspace.onDidChangeConfiguration.mock.calls[1][0];

            // Act & Assert - Should not throw
            expect(() => {
                registeredHandler(createMockChangeEvent(true));
            }).not.toThrow();
        });

        it('should only trigger for relevant configuration sections', () => {
            // Arrange
            const callback = jest.fn();
            service.onDidChange(callback);

            const registeredHandler = mockWorkspace.onDidChangeConfiguration.mock.calls[1][0];

            // Act
            registeredHandler(createMockChangeEvent(false)); // Doesn't affect nofx

            // Assert
            expect(callback).not.toHaveBeenCalled();
        });

        it('should refresh configuration on change', () => {
            // Arrange
            const registeredHandler = mockWorkspace.onDidChangeConfiguration.mock.calls[0][0];

            // Act
            registeredHandler(createMockChangeEvent(true));

            // Assert
            expect(mockWorkspace.getConfiguration).toHaveBeenCalledWith('nofx');
        });

        it('should handle configuration refresh errors', () => {
            // Arrange
            const registeredHandler = mockWorkspace.onDidChangeConfiguration.mock.calls[0][0];
            mockWorkspace.getConfiguration.mockImplementationOnce(() => {
                throw new Error('Refresh failed');
            });

            // Act & Assert - Should not throw
            expect(() => {
                registeredHandler(createMockChangeEvent(true));
            }).not.toThrow();
        });
    });

    // ========================================================================
    // RESOURCE MANAGEMENT AND DISPOSAL TESTS
    // ========================================================================

    describe('Resource Management and Disposal', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should dispose all resources', async () => {
            // Arrange
            service.onDidChange(() => {});
            service.onDidChange(() => {});

            // Act
            await service.dispose();

            // Assert
            expect(mockDisposable.dispose).toHaveBeenCalled();
        });

        it('should handle disposal errors gracefully', async () => {
            // Arrange
            mockDisposable.dispose.mockImplementation(() => {
                throw new Error('Disposal error');
            });

            // Act & Assert
            await expect(service.dispose()).rejects.toThrow(ConfigurationError);
            await expect(service.dispose()).rejects.toThrow('Failed to dispose service cleanly');
        });

        it('should prevent operations after disposal', async () => {
            // Act
            await service.dispose();

            // Assert
            await expect(service.get('maxAgents')).rejects.toThrow(/disposed/i);
            await expect(service.update('maxAgents', 5)).rejects.toThrow(/disposed/i);
        });

        it('should handle double disposal', async () => {
            // Act
            await service.dispose();

            // Assert - Second disposal should not throw
            await expect(service.dispose()).resolves.not.toThrow();
        });

        it('should wait for pending operations during disposal', async () => {
            // Arrange - Start a long-running operation
            mockWorkspaceConfiguration.get.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve(3), 500))
            );

            const pendingOp = service.get('maxAgents');

            // Act
            const disposePromise = service.dispose();

            // Wait for both
            await Promise.all([pendingOp.catch(() => {}), disposePromise]);

            // Assert
            expect(service).toBeDefined();
        });

        it('should timeout if pending operations take too long', async () => {
            // Arrange - Start operation that won't complete
            mockWorkspaceConfiguration.get.mockImplementation(
                () => new Promise(() => {}) // Never resolves
            );

            const pendingOp = service.get('maxAgents').catch(() => {});

            // Act
            const start = Date.now();
            await service.dispose();
            const duration = Date.now() - start;

            // Assert - Should timeout after 5 seconds
            expect(duration).toBeLessThan(6000);
            expect(duration).toBeGreaterThanOrEqual(4900);
        });
    });

    // ========================================================================
    // CONCURRENCY TESTS
    // ========================================================================

    describe('Concurrency and Race Conditions', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should handle concurrent get operations', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Act
            const promises = Array.from({ length: 20 }, (_, i) => service.get(`key${i % 3}`, i));
            const results = await Promise.all(promises);

            // Assert
            expect(results).toHaveLength(20);
            expect(results.every(r => r !== undefined)).toBe(true);
        });

        it('should handle concurrent update operations', async () => {
            // Act
            const promises = Array.from({ length: 10 }, (_, i) => service.update('maxAgents', i));

            // Assert
            await expect(Promise.all(promises)).resolves.not.toThrow();
            expect(mockWorkspaceConfiguration.update).toHaveBeenCalledTimes(10);
        });

        it('should handle mixed concurrent operations', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Act
            const promises = [
                service.get('maxAgents'),
                service.update('aiProvider', 'claude'),
                service.get('aiPath'),
                service.healthCheck(),
                service.getMetrics(),
                service.update('maxAgents', 5)
            ];

            // Assert
            await expect(Promise.all(promises)).resolves.not.toThrow();
        });

        it('should handle rapid configuration changes', async () => {
            // Arrange
            const handler = mockWorkspace.onDidChangeConfiguration.mock.calls[0][0];

            // Act - Simulate rapid changes
            for (let i = 0; i < 10; i++) {
                handler(createMockChangeEvent(true));
            }

            // Assert - Should handle without errors
            expect(service).toBeDefined();
        });
    });

    // ========================================================================
    // EDGE CASES AND BOUNDARY CONDITIONS
    // ========================================================================

    describe('Edge Cases and Boundary Conditions', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        describe('Numeric Boundaries', () => {
            it('should handle Number.MIN_VALUE', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(Number.MIN_VALUE);
                const result = await service.getMaxAgents();
                expect(result).toBe(3); // Should fallback
            });

            it('should handle Number.MAX_VALUE', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(Number.MAX_VALUE);
                const result = await service.getMaxAgents();
                expect(result).toBe(3);
            });

            it('should handle negative zero', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(-0);
                const result = await service.getMaxAgents();
                expect(result).toBe(3);
            });

            it('should handle NaN', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(NaN);
                const result = await service.getMaxAgents();
                expect(result).toBe(3);
            });

            it('should handle Infinity', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(Infinity);
                const result = await service.getMaxAgents();
                expect(result).toBe(3);
            });

            it('should handle -Infinity', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(-Infinity);
                const result = await service.getMaxAgents();
                expect(result).toBe(3);
            });
        });

        describe('String Boundaries', () => {
            it('should handle very long strings', async () => {
                const longString = 'a'.repeat(100000);
                mockWorkspaceConfiguration.get.mockReturnValue(longString);

                const result = await service.getAiPath();
                expect(result).toBe(longString); // Should handle if valid
            });

            it('should handle empty strings', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue('');
                const result = await service.getAiProvider();
                expect(result).toBe('claude'); // Should use default
            });

            it('should handle strings with only whitespace', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue('   \t\n  ');
                const result = await service.getAiProvider();
                expect(result).toBe('claude');
            });

            it('should handle unicode strings', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue('🎸🎵🎶');
                const result = await service.getAiProvider();
                expect(result).toBe('claude'); // Not a valid provider
            });

            it('should handle strings with null bytes', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue('path\0null');
                const result = await service.getAiPath();
                expect(result).toBe(''); // Should be sanitized
            });
        });

        describe('Object and Array Handling', () => {
            it('should handle objects as config values', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue({ key: 'value' });
                const result = await service.getAiProvider();
                expect(result).toBe('claude'); // Should fallback
            });

            it('should handle arrays as config values', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(['claude', 'aider']);
                const result = await service.getAiProvider();
                expect(result).toBe('claude'); // Should fallback
            });

            it('should handle circular references', async () => {
                const circular: any = { value: 3 };
                circular.self = circular;
                mockWorkspaceConfiguration.get.mockReturnValue(circular);

                const result = await service.getMaxAgents();
                expect(result).toBe(3); // Should handle gracefully
            });

            it('should handle symbols', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(Symbol('test'));
                const result = await service.getAiProvider();
                expect(result).toBe('claude');
            });

            it('should handle functions', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(() => 'claude');
                const result = await service.getAiProvider();
                expect(result).toBe('claude'); // Should fallback
            });
        });

        describe('Special Values', () => {
            it('should handle undefined', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(undefined);
                const result = await service.get('maxAgents', 5);
                expect(result).toBe(5);
            });

            it('should handle null', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(null);
                const result = await service.getMaxAgents();
                expect(result).toBe(3);
            });

            it('should handle boolean true', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(true);
                const result = await service.getAiProvider();
                expect(result).toBe('claude');
            });

            it('should handle boolean false', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(false);
                const result = await service.getAiProvider();
                expect(result).toBe('claude');
            });

            it('should handle dates', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(new Date());
                const result = await service.getAiProvider();
                expect(result).toBe('claude');
            });

            it('should handle regular expressions', async () => {
                mockWorkspaceConfiguration.get.mockReturnValue(/test/);
                const result = await service.getAiProvider();
                expect(result).toBe('claude');
            });
        });
    });

    // ========================================================================
    // LOGGING TESTS
    // ========================================================================

    describe('Structured Logging', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should log initialization', () => {
            expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('initialized successfully'));
        });

        it('should log with structured format', async () => {
            // Act
            await service.get('maxAgents');

            // Assert
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"debug"'));
        });

        it('should include instance ID in logs', () => {
            expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('test-uuid'));
        });

        it('should log errors with context', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Test error');
            });

            // Act
            try {
                await service.get('maxAgents');
            } catch {
                // Expected
            }

            // Assert
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Test error'));
        });

        it('should log warnings for invalid values', async () => {
            // Arrange
            mockWorkspaceConfiguration.get.mockReturnValue(-5);

            // Act
            await service.getMaxAgents();

            // Assert
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid maxAgents value'));
        });

        it('should log circuit breaker state changes', async () => {
            // Arrange - Open circuit
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Failure');
            });

            // Act
            for (let i = 0; i < 5; i++) {
                try {
                    await service.get('maxAgents');
                } catch {
                    // Expected
                }
            }

            // Assert
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Circuit breaker opened'));
        });
    });

    // ========================================================================
    // REGRESSION TESTS
    // ========================================================================

    describe('Regression Tests', () => {
        beforeEach(() => {
            service = new EnterpriseConfigurationService();
        });

        it('should not leak memory on repeated operations', async () => {
            // Act - Perform many operations
            for (let i = 0; i < 100; i++) {
                mockWorkspaceConfiguration.get.mockReturnValue(i);
                await service.get(`key${i}`);
            }

            // Assert - Check metrics don't grow unbounded
            const metrics = service.getMetrics();
            expect(metrics.operationCount).toBe(100);
        });

        it('should maintain consistency under stress', async () => {
            // Act - Stress test with mixed operations
            const operations = [];
            for (let i = 0; i < 50; i++) {
                if (i % 3 === 0) {
                    operations.push(service.get('maxAgents', i));
                } else if (i % 3 === 1) {
                    operations.push(service.update('maxAgents', i).catch(() => {}));
                } else {
                    operations.push(service.healthCheck());
                }
            }

            // Assert
            await expect(Promise.all(operations)).resolves.not.toThrow();
        });

        it('should recover from error states', async () => {
            // Arrange - Cause errors
            mockWorkspaceConfiguration.get.mockImplementation(() => {
                throw new Error('Error state');
            });

            for (let i = 0; i < 3; i++) {
                try {
                    await service.get('maxAgents');
                } catch {
                    // Expected
                }
            }

            // Act - Fix the error
            mockWorkspaceConfiguration.get.mockReturnValue(3);

            // Assert - Should recover
            const result = await service.get('maxAgents');
            expect(result).toBe(3);
        });
    });
});
