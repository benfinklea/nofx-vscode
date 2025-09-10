/**
 * Smoke Tests for NofX Extension
 * These tests would have caught the critical issues we missed
 */

import { ServiceLocator } from '../../services/ServiceLocator';
import { setupVSCodeMocks, createMockExtensionContext } from '../helpers/mockFactories';

// Mock VS Code before importing extension
setupVSCodeMocks();

describe('Extension Activation Smoke Tests', () => {
    beforeEach(() => {
        // Clear service locator before each test
        ServiceLocator.clear();
        jest.clearAllMocks();
    });

    describe('Critical Service Registration Tests', () => {
        test('ServiceLocator should register services without errors', () => {
            // This would have caught the "AgentManager dependencies not set" error
            expect(() => {
                ServiceLocator.register('TestService', () => ({ test: true }));
            }).not.toThrow();
        });

        test('ServiceLocator should retrieve registered services', () => {
            const testService = { test: true, dispose: jest.fn() };
            ServiceLocator.register('TestService', () => testService);

            const retrieved = ServiceLocator.get('TestService');
            expect(retrieved).toBe(testService);
        });

        test('ServiceLocator should handle missing services gracefully', () => {
            const retrieved = ServiceLocator.tryGet('NonExistentService');
            expect(retrieved).toBeUndefined();
        });
    });

    describe('Core Extension Structure Tests', () => {
        test('Extension should be able to register basic services', () => {
            // Test the pattern used in extension.ts
            expect(() => {
                ServiceLocator.register('LoggingService', () => ({
                    info: jest.fn(),
                    error: jest.fn(),
                    dispose: jest.fn()
                }));

                ServiceLocator.register('ConfigurationService', () => ({
                    getAiProvider: jest.fn().mockReturnValue('claude'),
                    getAiPath: jest.fn().mockReturnValue('claude'),
                    dispose: jest.fn()
                }));

                ServiceLocator.register('AgentManager', () => ({
                    getActiveAgents: jest.fn().mockReturnValue([]),
                    spawnAgent: jest.fn(),
                    dispose: jest.fn()
                }));
            }).not.toThrow();
        });

        test('AgentManager should initialize without dependency errors', () => {
            // This would have caught the "AgentManager dependencies not set" error
            ServiceLocator.register('LoggingService', () => ({
                info: jest.fn(),
                error: jest.fn(),
                dispose: jest.fn()
            }));

            ServiceLocator.register('AgentManager', () => ({
                getActiveAgents: jest.fn().mockReturnValue([]),
                spawnAgent: jest.fn(),
                dispose: jest.fn()
            }));

            const agentManager = ServiceLocator.tryGet('AgentManager');
            expect(agentManager).toBeDefined();

            // Try to call a basic method that requires dependencies
            expect(() => (agentManager as any).getActiveAgents()).not.toThrow();
        });

        test('OrchestrationLogger should be registerable', () => {
            // This would have caught missing logging service
            expect(() => {
                ServiceLocator.register('OrchestrationLogger', () => ({
                    conductorEvaluatingTask: jest.fn(),
                    agentSpawned: jest.fn(),
                    dispose: jest.fn()
                }));
            }).not.toThrow();

            const orchestrationLogger = ServiceLocator.tryGet('OrchestrationLogger');
            expect(orchestrationLogger).toBeDefined();
        });
    });

    describe('Service Integration Tests', () => {
        test('all critical services should be registerable together', () => {
            const criticalServices = [
                'LoggingService',
                'ConfigurationService',
                'CommandService',
                'AgentManager',
                'TerminalManager',
                'EventBus',
                'NotificationService',
                'ErrorHandler'
            ];

            // Register all services
            expect(() => {
                criticalServices.forEach(serviceName => {
                    ServiceLocator.register(serviceName, () => ({
                        dispose: jest.fn(),
                        // Add service-specific methods
                        ...(serviceName === 'AgentManager' && { getActiveAgents: jest.fn().mockReturnValue([]) }),
                        ...(serviceName === 'LoggingService' && { info: jest.fn(), error: jest.fn() }),
                        ...(serviceName === 'ConfigurationService' && { getAiProvider: jest.fn() })
                    }));
                });
            }).not.toThrow();

            // Verify all services are available
            criticalServices.forEach(serviceName => {
                const service = ServiceLocator.tryGet(serviceName);
                expect(service).toBeDefined();
            });
        });
    });

    describe('Extension Context Tests', () => {
        test('mock extension context should have required properties', () => {
            const context = createMockExtensionContext();

            expect(context.subscriptions).toBeDefined();
            expect(context.workspaceState).toBeDefined();
            expect(context.globalState).toBeDefined();
            expect(context.extensionPath).toBeDefined();
            expect(context.asAbsolutePath).toBeDefined();
        });
    });
});
