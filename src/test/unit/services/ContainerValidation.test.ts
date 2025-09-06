import * as vscode from 'vscode';
import * as path from 'path';
import { Container } from '../../../services/Container';
import { SERVICE_TOKENS } from '../../../services/interfaces';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { ConfigurationValidator } from '../../../services/ConfigurationValidator';
import { ErrorHandler } from '../../../services/ErrorHandler';
import { NotificationService } from '../../../services/NotificationService';
import { MessageRouter } from '../../../services/MessageRouter';
import { MessageValidator } from '../../../services/MessageValidator';
import { MetricsService } from '../../../services/MetricsService';
import { TerminalManager } from '../../../services/TerminalManager';
import { UIStateManager } from '../../../services/UIStateManager';
import { TreeStateManager } from '../../../services/TreeStateManager';
import { WorktreeService } from '../../../services/WorktreeService';
import { ConnectionPoolService } from '../../../services/ConnectionPoolService';
import { AgentLifecycleManager } from '../../../services/AgentLifecycleManager';
import { CommandService } from '../../../services/CommandService';
import { AgentManager } from '../../../agents/AgentManager';
import { AgentTemplateManager } from '../../../agents/AgentTemplateManager';
import { AgentPersistence } from '../../../persistence/AgentPersistence';
import { TaskQueue } from '../../../tasks/TaskQueue';
import { TaskStateMachine } from '../../../tasks/TaskStateMachine';
import { TaskDependencyManager } from '../../../tasks/TaskDependencyManager';
import { CapabilityMatcher } from '../../../tasks/CapabilityMatcher';
import { PriorityTaskQueue } from '../../../tasks/PriorityTaskQueue';
import { OrchestrationServer } from '../../../orchestration/OrchestrationServer';
import { WorktreeManager } from '../../../worktrees/WorktreeManager';
import { ConductorViewModel } from '../../../viewModels/ConductorViewModel';
import { DashboardViewModel } from '../../../viewModels/DashboardViewModel';

describe('Container Validation', () => {
    let container: Container;
    let mockContext: vscode.ExtensionContext;
    const projectRoot = path.resolve(__dirname, '../../../..');

    beforeEach(() => {
        // Set test mode
        process.env.NOFX_TEST_MODE = 'true';
        
        // Create new container
        container = new Container();
        
        // Create mock extension context
        mockContext = {
            subscriptions: [],
            extensionUri: vscode.Uri.file(projectRoot),
            extensionPath: projectRoot,
            globalState: {
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
                keys: jest.fn().mockReturnValue([]),
                setKeysForSync: jest.fn()
            } as any,
            workspaceState: {
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
                keys: jest.fn().mockReturnValue([])
            } as any,
            extensionMode: vscode.ExtensionMode.Test,
            storageUri: vscode.Uri.file(path.join(projectRoot, '.nofx')),
            globalStorageUri: vscode.Uri.file(path.join(projectRoot, '.nofx-global')),
            logUri: vscode.Uri.file(path.join(projectRoot, 'logs')),
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn()
            } as any,
            environmentVariableCollection: {} as any,
            asAbsolutePath: (relativePath: string) => path.join(projectRoot, relativePath)
        } as vscode.ExtensionContext;
    });

    afterEach(() => {
        delete process.env.NOFX_TEST_MODE;
        container.dispose();
    });

    describe('Container Initialization', () => {
        it('should create container instance', () => {
            expect(container).toBeInstanceOf(Container);
        });

        it('should register and resolve services', () => {
            const testToken = Symbol('test');
            const testValue = { test: true };
            
            container.register(testToken, () => testValue);
            const resolved = container.resolve(testToken);
            
            expect(resolved).toBe(testValue);
        });

        it('should support singleton services', () => {
            const testToken = Symbol('singleton');
            let instanceCount = 0;
            
            container.register(testToken, () => {
                instanceCount++;
                return { id: instanceCount };
            }, true);
            
            const first = container.resolve(testToken);
            const second = container.resolve(testToken);
            
            expect(first).toBe(second);
            expect(instanceCount).toBe(1);
        });

        it('should support transient services', () => {
            const testToken = Symbol('transient');
            let instanceCount = 0;
            
            container.register(testToken, () => {
                instanceCount++;
                return { id: instanceCount };
            }, false);
            
            const first = container.resolve(testToken);
            const second = container.resolve(testToken);
            
            expect(first).not.toBe(second);
            expect(instanceCount).toBe(2);
        });
    });

    describe('Service Registration', () => {
        it('should register core services', () => {
            // Register context first
            container.register(SERVICE_TOKENS.ExtensionContext, () => mockContext);
            
            // Register core services
            container.register(SERVICE_TOKENS.EventBus, () => new EventBus(), true);
            container.register(SERVICE_TOKENS.LoggingService, (c) => 
                new LoggingService(c.resolve(SERVICE_TOKENS.ExtensionContext)), true);
            container.register(SERVICE_TOKENS.ConfigurationService, () => 
                new ConfigurationService(), true);
            
            // Verify resolution
            expect(container.resolve(SERVICE_TOKENS.EventBus)).toBeInstanceOf(EventBus);
            expect(container.resolve(SERVICE_TOKENS.LoggingService)).toBeInstanceOf(LoggingService);
            expect(container.resolve(SERVICE_TOKENS.ConfigurationService)).toBeInstanceOf(ConfigurationService);
        });

        it('should register utility services', () => {
            container.register(SERVICE_TOKENS.ExtensionContext, () => mockContext);
            container.register(SERVICE_TOKENS.EventBus, () => new EventBus(), true);
            container.register(SERVICE_TOKENS.LoggingService, (c) => 
                new LoggingService(c.resolve(SERVICE_TOKENS.ExtensionContext)), true);
            
            container.register(SERVICE_TOKENS.ConfigurationValidator, (c) => 
                new ConfigurationValidator(c.resolve(SERVICE_TOKENS.LoggingService)), true);
            container.register(SERVICE_TOKENS.ErrorHandler, () => 
                new ErrorHandler(), true);
            container.register(SERVICE_TOKENS.NotificationService, () => 
                new NotificationService(), true);
            
            expect(container.resolve(SERVICE_TOKENS.ConfigurationValidator)).toBeInstanceOf(ConfigurationValidator);
            expect(container.resolve(SERVICE_TOKENS.ErrorHandler)).toBeInstanceOf(ErrorHandler);
            expect(container.resolve(SERVICE_TOKENS.NotificationService)).toBeInstanceOf(NotificationService);
        });

        it('should register message services', () => {
            container.register(SERVICE_TOKENS.ExtensionContext, () => mockContext);
            container.register(SERVICE_TOKENS.EventBus, () => new EventBus(), true);
            container.register(SERVICE_TOKENS.LoggingService, (c) => 
                new LoggingService(c.resolve(SERVICE_TOKENS.ExtensionContext)), true);
            
            container.register(SERVICE_TOKENS.MessageRouter, (c) => 
                new MessageRouter(c.resolve(SERVICE_TOKENS.EventBus)), true);
            container.register(SERVICE_TOKENS.MessageValidator, () => 
                new MessageValidator(), true);
            
            expect(container.resolve(SERVICE_TOKENS.MessageRouter)).toBeInstanceOf(MessageRouter);
            expect(container.resolve(SERVICE_TOKENS.MessageValidator)).toBeInstanceOf(MessageValidator);
        });

        it('should register UI services', () => {
            container.register(SERVICE_TOKENS.ExtensionContext, () => mockContext);
            container.register(SERVICE_TOKENS.EventBus, () => new EventBus(), true);
            
            container.register(SERVICE_TOKENS.UIStateManager, (c) => 
                new UIStateManager(c.resolve(SERVICE_TOKENS.EventBus)), true);
            container.register(SERVICE_TOKENS.TreeStateManager, () => 
                new TreeStateManager(), true);
            
            expect(container.resolve(SERVICE_TOKENS.UIStateManager)).toBeInstanceOf(UIStateManager);
            expect(container.resolve(SERVICE_TOKENS.TreeStateManager)).toBeInstanceOf(TreeStateManager);
        });
    });

    describe('Service Resolution', () => {
        beforeEach(() => {
            // Setup basic services needed by most tests
            container.register(SERVICE_TOKENS.ExtensionContext, () => mockContext);
            container.register(SERVICE_TOKENS.EventBus, () => new EventBus(), true);
            container.register(SERVICE_TOKENS.LoggingService, (c) => 
                new LoggingService(c.resolve(SERVICE_TOKENS.ExtensionContext)), true);
            container.register(SERVICE_TOKENS.ConfigurationService, () => 
                new ConfigurationService(), true);
        });

        it('should resolve services with dependencies', () => {
            container.register(SERVICE_TOKENS.MetricsService, (c) => 
                new MetricsService(
                    c.resolve(SERVICE_TOKENS.EventBus),
                    c.resolve(SERVICE_TOKENS.LoggingService)
                ), true);
            
            const metrics = container.resolve(SERVICE_TOKENS.MetricsService);
            expect(metrics).toBeInstanceOf(MetricsService);
        });

        it('should resolve optional services', () => {
            const missingToken = Symbol('missing');
            const result = container.resolveOptional(missingToken);
            expect(result).toBeUndefined();
        });

        it('should throw for missing required services', () => {
            const missingToken = Symbol('missing');
            expect(() => container.resolve(missingToken)).toThrow();
        });

        it('should handle circular dependencies', () => {
            const token1 = Symbol('circular1');
            const token2 = Symbol('circular2');
            
            container.register(token1, (c) => ({
                dep: c.resolve(token2)
            }));
            
            container.register(token2, (c) => ({
                dep: c.resolve(token1)
            }));
            
            expect(() => container.resolve(token1)).toThrow();
        });
    });

    describe('Extension Service Integration', () => {
        beforeEach(() => {
            // Register all required services following extension.ts pattern
            container.register(SERVICE_TOKENS.ExtensionContext, () => mockContext);
            container.register(SERVICE_TOKENS.EventBus, () => new EventBus(), true);
            container.register(SERVICE_TOKENS.LoggingService, (c) => 
                new LoggingService(c.resolve(SERVICE_TOKENS.ExtensionContext)), true);
            container.register(SERVICE_TOKENS.ConfigurationService, () => 
                new ConfigurationService(), true);
            container.register(SERVICE_TOKENS.ConfigurationValidator, (c) => 
                new ConfigurationValidator(c.resolve(SERVICE_TOKENS.LoggingService)), true);
        });

        it('should register agent-related services', () => {
            container.register(SERVICE_TOKENS.AgentManager, (c) => 
                new AgentManager(
                    c.resolve(SERVICE_TOKENS.EventBus),
                    c.resolve(SERVICE_TOKENS.LoggingService),
                    c.resolve(SERVICE_TOKENS.ConfigurationService)
                ), true);
            
            container.register(SERVICE_TOKENS.AgentTemplateManager, (c) => 
                new AgentTemplateManager(
                    c.resolve(SERVICE_TOKENS.ExtensionContext),
                    c.resolve(SERVICE_TOKENS.LoggingService)
                ), true);
            
            container.register(SERVICE_TOKENS.AgentPersistence, (c) => 
                new AgentPersistence(
                    c.resolve(SERVICE_TOKENS.ExtensionContext),
                    c.resolve(SERVICE_TOKENS.LoggingService)
                ), true);
            
            expect(container.resolve(SERVICE_TOKENS.AgentManager)).toBeInstanceOf(AgentManager);
            expect(container.resolve(SERVICE_TOKENS.AgentTemplateManager)).toBeInstanceOf(AgentTemplateManager);
            expect(container.resolve(SERVICE_TOKENS.AgentPersistence)).toBeInstanceOf(AgentPersistence);
        });

        it('should register task-related services', () => {
            container.register(SERVICE_TOKENS.TaskQueue, (c) => 
                new TaskQueue(
                    c.resolve(SERVICE_TOKENS.EventBus),
                    c.resolve(SERVICE_TOKENS.LoggingService)
                ), true);
            
            container.register(SERVICE_TOKENS.TaskStateMachine, () => 
                new TaskStateMachine(), true);
            
            container.register(SERVICE_TOKENS.TaskDependencyManager, (c) => 
                new TaskDependencyManager(c.resolve(SERVICE_TOKENS.LoggingService)), true);
            
            container.register(SERVICE_TOKENS.CapabilityMatcher, () => 
                new CapabilityMatcher(), true);
            
            container.register(SERVICE_TOKENS.PriorityTaskQueue, (c) => 
                new PriorityTaskQueue(
                    c.resolve(SERVICE_TOKENS.EventBus),
                    c.resolve(SERVICE_TOKENS.LoggingService)
                ), true);
            
            expect(container.resolve(SERVICE_TOKENS.TaskQueue)).toBeInstanceOf(TaskQueue);
            expect(container.resolve(SERVICE_TOKENS.TaskStateMachine)).toBeInstanceOf(TaskStateMachine);
            expect(container.resolve(SERVICE_TOKENS.TaskDependencyManager)).toBeInstanceOf(TaskDependencyManager);
            expect(container.resolve(SERVICE_TOKENS.CapabilityMatcher)).toBeInstanceOf(CapabilityMatcher);
            expect(container.resolve(SERVICE_TOKENS.PriorityTaskQueue)).toBeInstanceOf(PriorityTaskQueue);
        });

        it('should register infrastructure services', () => {
            container.register(SERVICE_TOKENS.TerminalManager, (c) => 
                new TerminalManager(
                    c.resolve(SERVICE_TOKENS.EventBus),
                    c.resolve(SERVICE_TOKENS.LoggingService)
                ), true);
            
            container.register(SERVICE_TOKENS.WorktreeService, (c) => 
                new WorktreeService(
                    c.resolve(SERVICE_TOKENS.LoggingService),
                    c.resolve(SERVICE_TOKENS.ConfigurationService)
                ), true);
            
            container.register(SERVICE_TOKENS.ConnectionPoolService, (c) => 
                new ConnectionPoolService(c.resolve(SERVICE_TOKENS.LoggingService)), true);
            
            expect(container.resolve(SERVICE_TOKENS.TerminalManager)).toBeInstanceOf(TerminalManager);
            expect(container.resolve(SERVICE_TOKENS.WorktreeService)).toBeInstanceOf(WorktreeService);
            expect(container.resolve(SERVICE_TOKENS.ConnectionPoolService)).toBeInstanceOf(ConnectionPoolService);
        });

        it('should handle test mode configuration', () => {
            // In test mode, certain services should be mocked or disabled
            const isTestMode = process.env.NOFX_TEST_MODE === 'true';
            expect(isTestMode).toBe(true);
            
            // OrchestrationServer should not start in test mode
            container.register(SERVICE_TOKENS.OrchestrationServer, (c) => {
                const server = new OrchestrationServer(
                    c.resolve(SERVICE_TOKENS.EventBus),
                    c.resolve(SERVICE_TOKENS.LoggingService)
                );
                // In test mode, don't start the server
                if (!isTestMode) {
                    server.start();
                }
                return server;
            }, true);
            
            const server = container.resolve(SERVICE_TOKENS.OrchestrationServer);
            expect(server).toBeInstanceOf(OrchestrationServer);
        });
    });

    describe('Service Lifecycle', () => {
        it('should initialize services on first resolution', () => {
            let initialized = false;
            const testToken = Symbol('lifecycle');
            
            container.register(testToken, () => {
                initialized = true;
                return { initialized: true };
            }, true);
            
            expect(initialized).toBe(false);
            container.resolve(testToken);
            expect(initialized).toBe(true);
        });

        it('should dispose services correctly', () => {
            const disposeMethod = jest.fn();
            const testToken = Symbol('disposable');
            
            container.register(testToken, () => ({
                dispose: disposeMethod
            }), true);
            
            container.resolve(testToken);
            container.dispose();
            
            expect(disposeMethod).toHaveBeenCalled();
        });

        it('should handle disposal errors gracefully', () => {
            const testToken = Symbol('errorDispose');
            
            container.register(testToken, () => ({
                dispose: () => {
                    throw new Error('Disposal error');
                }
            }), true);
            
            container.resolve(testToken);
            
            // Should not throw
            expect(() => container.dispose()).not.toThrow();
        });
    });

    describe('Dependency Validation', () => {
        beforeEach(() => {
            // Setup base services
            container.register(SERVICE_TOKENS.ExtensionContext, () => mockContext);
            container.register(SERVICE_TOKENS.EventBus, () => new EventBus(), true);
            container.register(SERVICE_TOKENS.LoggingService, (c) => 
                new LoggingService(c.resolve(SERVICE_TOKENS.ExtensionContext)), true);
            container.register(SERVICE_TOKENS.ConfigurationService, () => 
                new ConfigurationService(), true);
        });

        it('should validate CommandService dependencies', () => {
            container.register(SERVICE_TOKENS.AgentManager, (c) => 
                new AgentManager(
                    c.resolve(SERVICE_TOKENS.EventBus),
                    c.resolve(SERVICE_TOKENS.LoggingService),
                    c.resolve(SERVICE_TOKENS.ConfigurationService)
                ), true);
            
            container.register(SERVICE_TOKENS.CommandService, (c) => 
                new CommandService(
                    c.resolve(SERVICE_TOKENS.ExtensionContext),
                    c
                ), true);
            
            const commandService = container.resolve(SERVICE_TOKENS.CommandService);
            expect(commandService).toBeInstanceOf(CommandService);
        });

        it('should validate view model dependencies', () => {
            container.register(SERVICE_TOKENS.AgentManager, (c) => 
                new AgentManager(
                    c.resolve(SERVICE_TOKENS.EventBus),
                    c.resolve(SERVICE_TOKENS.LoggingService),
                    c.resolve(SERVICE_TOKENS.ConfigurationService)
                ), true);
            
            container.register(SERVICE_TOKENS.TaskQueue, (c) => 
                new TaskQueue(
                    c.resolve(SERVICE_TOKENS.EventBus),
                    c.resolve(SERVICE_TOKENS.LoggingService)
                ), true);
            
            container.register(SERVICE_TOKENS.ConductorViewModel, (c) => 
                new ConductorViewModel(
                    c.resolve(SERVICE_TOKENS.AgentManager),
                    c.resolve(SERVICE_TOKENS.TaskQueue),
                    c.resolve(SERVICE_TOKENS.EventBus),
                    c.resolve(SERVICE_TOKENS.LoggingService)
                ), true);
            
            const viewModel = container.resolve(SERVICE_TOKENS.ConductorViewModel);
            expect(viewModel).toBeInstanceOf(ConductorViewModel);
        });
    });

    describe('Error Handling', () => {
        it('should provide clear error messages for missing services', () => {
            const missingToken = Symbol('missing');
            
            try {
                container.resolve(missingToken);
                fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain('not registered');
            }
        });

        it('should handle factory errors gracefully', () => {
            const errorToken = Symbol('error');
            
            container.register(errorToken, () => {
                throw new Error('Factory error');
            });
            
            expect(() => container.resolve(errorToken)).toThrow('Factory error');
        });

        it('should handle null/undefined factories', () => {
            const nullToken = Symbol('null');
            
            container.register(nullToken, () => null as any);
            const result = container.resolve(nullToken);
            
            expect(result).toBeNull();
        });
    });

    describe('Performance', () => {
        it('should resolve singletons quickly after first resolution', () => {
            const perfToken = Symbol('performance');
            
            container.register(perfToken, () => ({
                data: new Array(1000).fill('test')
            }), true);
            
            // First resolution
            container.resolve(perfToken);
            
            // Measure subsequent resolutions
            const start = Date.now();
            for (let i = 0; i < 1000; i++) {
                container.resolve(perfToken);
            }
            const duration = Date.now() - start;
            
            expect(duration).toBeLessThan(100); // Should be very fast
        });

        it('should handle large dependency graphs', () => {
            // Create a chain of dependencies
            const tokens: symbol[] = [];
            for (let i = 0; i < 10; i++) {
                tokens.push(Symbol(`dep${i}`));
            }
            
            // Register first service
            container.register(tokens[0], () => ({ level: 0 }), true);
            
            // Register chain of dependencies
            for (let i = 1; i < tokens.length; i++) {
                const prevToken = tokens[i - 1];
                container.register(tokens[i], (c) => ({
                    level: i,
                    dependency: c.resolve(prevToken)
                }), true);
            }
            
            // Resolve the last one (which depends on all others)
            const result = container.resolve(tokens[tokens.length - 1]);
            expect(result).toBeDefined();
            expect(result.level).toBe(9);
        });
    });
});