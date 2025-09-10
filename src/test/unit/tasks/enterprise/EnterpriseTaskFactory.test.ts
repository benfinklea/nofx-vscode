import {
    EnterpriseTaskFactory,
    TaskSystemStrategy,
    MigrationConfig,
    FallbackTaskManager
} from '../../../../tasks/enterprise/EnterpriseTaskFactory';
import { EnterpriseTaskManager } from '../../../../tasks/enterprise/EnterpriseTaskManager';
import { SimpleTaskManager } from '../../../../tasks/SimpleTaskManager';
import { ITaskReader } from '../../../../services/interfaces';
import {
    EnterpriseTask,
    TaskError,
    TaskErrorCode,
    EnterpriseTaskStatus,
    TaskPriority
} from '../../../../tasks/enterprise/EnterpriseTaskTypes';

// Mock the task managers
jest.mock('../../../../tasks/enterprise/EnterpriseTaskManager');
jest.mock('../../../../tasks/SimpleTaskManager');

describe('EnterpriseTaskFactory', () => {
    let factory: EnterpriseTaskFactory;
    let mockConfig: MigrationConfig;

    beforeEach(() => {
        mockConfig = {
            strategy: TaskSystemStrategy.SIMPLE,
            enableGradualRollout: false,
            rolloutPercentage: 0,
            enableFallback: false,
            fallbackStrategy: TaskSystemStrategy.SIMPLE,
            enableABTesting: false,
            abTestingPercentage: 50
        };
        factory = new EnterpriseTaskFactory();

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('Task Manager Creation', () => {
        it('should create SimpleTaskManager for SIMPLE strategy', () => {
            const config = { ...mockConfig, strategy: TaskSystemStrategy.SIMPLE };

            const manager = factory.createTaskManager(config);

            expect(SimpleTaskManager).toHaveBeenCalledTimes(1);
            expect(manager).toBeInstanceOf(SimpleTaskManager);
        });

        it('should create EnterpriseTaskManager for ENTERPRISE strategy', () => {
            const config = { ...mockConfig, strategy: TaskSystemStrategy.ENTERPRISE };

            const manager = factory.createTaskManager(config);

            expect(EnterpriseTaskManager).toHaveBeenCalledTimes(1);
            expect(manager).toBeInstanceOf(EnterpriseTaskManager);
        });

        it('should create FallbackTaskManager when fallback is enabled', () => {
            const config = {
                ...mockConfig,
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableFallback: true,
                fallbackStrategy: TaskSystemStrategy.SIMPLE
            };

            const manager = factory.createTaskManager(config);

            expect(manager).toBeInstanceOf(FallbackTaskManager);
            expect(EnterpriseTaskManager).toHaveBeenCalledTimes(1);
            expect(SimpleTaskManager).toHaveBeenCalledTimes(1);
        });

        it('should throw error for unknown strategy', () => {
            const config = { ...mockConfig, strategy: 'unknown' as TaskSystemStrategy };

            expect(() => factory.createTaskManager(config)).toThrow('Unknown task system strategy: unknown');
        });
    });

    describe('Gradual Rollout', () => {
        it('should respect rollout percentage for enterprise strategy', () => {
            const config = {
                ...mockConfig,
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableGradualRollout: true,
                rolloutPercentage: 0 // 0% should always use fallback
            };

            // Mock Math.random to return 0.5 (50%)
            jest.spyOn(Math, 'random').mockReturnValue(0.5);

            const manager = factory.createTaskManager(config);

            // With 0% rollout, should fall back to simple
            expect(SimpleTaskManager).toHaveBeenCalled();

            Math.random = jest.fn().mockRestore();
        });

        it('should use enterprise system when rollout percentage is met', () => {
            const config = {
                ...mockConfig,
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableGradualRollout: true,
                rolloutPercentage: 75 // 75% should use enterprise
            };

            // Mock Math.random to return 0.5 (50%, below 75%)
            jest.spyOn(Math, 'random').mockReturnValue(0.5);

            const manager = factory.createTaskManager(config);

            expect(EnterpriseTaskManager).toHaveBeenCalled();

            Math.random = jest.fn().mockRestore();
        });

        it('should use fallback when rollout percentage is not met', () => {
            const config = {
                ...mockConfig,
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableGradualRollout: true,
                rolloutPercentage: 25, // 25% rollout
                fallbackStrategy: TaskSystemStrategy.SIMPLE
            };

            // Mock Math.random to return 0.8 (80%, above 25%)
            jest.spyOn(Math, 'random').mockReturnValue(0.8);

            const manager = factory.createTaskManager(config);

            expect(SimpleTaskManager).toHaveBeenCalled();

            Math.random = jest.fn().mockRestore();
        });

        it('should handle 100% rollout correctly', () => {
            const config = {
                ...mockConfig,
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableGradualRollout: true,
                rolloutPercentage: 100
            };

            jest.spyOn(Math, 'random').mockReturnValue(0.99);

            const manager = factory.createTaskManager(config);

            expect(EnterpriseTaskManager).toHaveBeenCalled();

            Math.random = jest.fn().mockRestore();
        });
    });

    describe('A/B Testing', () => {
        it('should select strategy based on A/B testing percentage', () => {
            const config = {
                ...mockConfig,
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableABTesting: true,
                abTestingPercentage: 50
            };

            // Mock Math.random to return 0.3 (30%, should use enterprise)
            jest.spyOn(Math, 'random').mockReturnValue(0.3);

            const manager = factory.createTaskManager(config);

            expect(EnterpriseTaskManager).toHaveBeenCalled();

            Math.random = jest.fn().mockRestore();
        });

        it('should use fallback strategy for A/B testing control group', () => {
            const config = {
                ...mockConfig,
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableABTesting: true,
                abTestingPercentage: 50,
                fallbackStrategy: TaskSystemStrategy.SIMPLE
            };

            // Mock Math.random to return 0.7 (70%, should use fallback)
            jest.spyOn(Math, 'random').mockReturnValue(0.7);

            const manager = factory.createTaskManager(config);

            expect(SimpleTaskManager).toHaveBeenCalled();

            Math.random = jest.fn().mockRestore();
        });

        it('should combine A/B testing with gradual rollout', () => {
            const config = {
                ...mockConfig,
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableGradualRollout: true,
                rolloutPercentage: 80,
                enableABTesting: true,
                abTestingPercentage: 60,
                fallbackStrategy: TaskSystemStrategy.SIMPLE
            };

            // Mock Math.random to return different values for different checks
            let callCount = 0;
            jest.spyOn(Math, 'random').mockImplementation(() => {
                callCount++;
                if (callCount === 1) return 0.5; // 50% for rollout (below 80%)
                if (callCount === 2) return 0.4; // 40% for A/B testing (below 60%)
                return 0.5;
            });

            const manager = factory.createTaskManager(config);

            expect(EnterpriseTaskManager).toHaveBeenCalled();

            Math.random = jest.fn().mockRestore();
        });
    });

    describe('Configuration Validation', () => {
        it('should handle missing fallback strategy', () => {
            const config = {
                ...mockConfig,
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableFallback: true
                // fallbackStrategy not specified
            };

            expect(() => factory.createTaskManager(config)).toThrow();
        });

        it('should validate rollout percentage bounds', () => {
            const invalidConfigs = [
                { ...mockConfig, rolloutPercentage: -10 },
                { ...mockConfig, rolloutPercentage: 150 }
            ];

            invalidConfigs.forEach(config => {
                expect(() => factory.createTaskManager(config)).toThrow();
            });
        });

        it('should validate A/B testing percentage bounds', () => {
            const invalidConfigs = [
                { ...mockConfig, abTestingPercentage: -5 },
                { ...mockConfig, abTestingPercentage: 110 }
            ];

            invalidConfigs.forEach(config => {
                expect(() => factory.createTaskManager(config)).toThrow();
            });
        });
    });

    describe('Strategy Determination Logic', () => {
        it('should determine correct strategy with complex configuration', () => {
            const config = {
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableGradualRollout: true,
                rolloutPercentage: 70,
                enableFallback: true,
                fallbackStrategy: TaskSystemStrategy.SIMPLE,
                enableABTesting: true,
                abTestingPercentage: 50
            };

            const determineStrategy = factory['determineStrategy'].bind(factory);

            // Test various random scenarios
            jest.spyOn(Math, 'random').mockReturnValue(0.3); // 30%
            expect(determineStrategy(config)).toBe(TaskSystemStrategy.ENTERPRISE);

            jest.spyOn(Math, 'random').mockReturnValue(0.8); // 80%
            expect(determineStrategy(config)).toBe(TaskSystemStrategy.SIMPLE);

            Math.random = jest.fn().mockRestore();
        });

        it('should prioritize gradual rollout over A/B testing', () => {
            const config = {
                strategy: TaskSystemStrategy.ENTERPRISE,
                enableGradualRollout: true,
                rolloutPercentage: 30,
                enableABTesting: true,
                abTestingPercentage: 70,
                fallbackStrategy: TaskSystemStrategy.SIMPLE
            };

            // Random value that would pass A/B test but fail rollout
            jest.spyOn(Math, 'random').mockReturnValue(0.5); // 50%

            const strategy = factory['determineStrategy'](config);

            expect(strategy).toBe(TaskSystemStrategy.SIMPLE); // Should use fallback due to rollout

            Math.random = jest.fn().mockRestore();
        });
    });

    describe('Edge Cases', () => {
        it('should handle null configuration gracefully', () => {
            expect(() => factory.createTaskManager(null as any)).toThrow();
        });

        it('should handle undefined configuration gracefully', () => {
            expect(() => factory.createTaskManager(undefined as any)).toThrow();
        });

        it('should handle configuration with missing strategy', () => {
            const config = { ...mockConfig };
            delete (config as any).strategy;

            expect(() => factory.createTaskManager(config as any)).toThrow();
        });
    });
});

describe('FallbackTaskManager', () => {
    let fallbackManager: FallbackTaskManager;
    let mockPrimarySystem: jest.Mocked<ITaskReader>;
    let mockFallbackSystem: jest.Mocked<ITaskReader>;
    let mockTask: EnterpriseTask;

    beforeEach(() => {
        // Create mock task systems
        mockPrimarySystem = {
            addTask: jest.fn(),
            getNextTask: jest.fn(),
            assignNextTask: jest.fn(),
            markTaskCompleted: jest.fn(),
            markTaskFailed: jest.fn(),
            markTaskCancelled: jest.fn(),
            getAllTasks: jest.fn(),
            getTaskById: jest.fn(),
            getTasksByStatus: jest.fn(),
            getQueueSize: jest.fn(),
            dispose: jest.fn()
        } as jest.Mocked<ITaskReader>;

        mockFallbackSystem = {
            addTask: jest.fn(),
            getNextTask: jest.fn(),
            assignNextTask: jest.fn(),
            markTaskCompleted: jest.fn(),
            markTaskFailed: jest.fn(),
            markTaskCancelled: jest.fn(),
            getAllTasks: jest.fn(),
            getTaskById: jest.fn(),
            getTasksByStatus: jest.fn(),
            getQueueSize: jest.fn(),
            dispose: jest.fn()
        } as jest.Mocked<ITaskReader>;

        fallbackManager = new FallbackTaskManager(mockPrimarySystem, mockFallbackSystem, 3);

        mockTask = {
            id: 'task-123',
            title: 'Test Task',
            description: 'A test task',
            status: TaskStatus.QUEUED,
            priority: TaskPriority.MEDIUM,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
            maxRetries: 3,
            retryCount: 0,
            timeoutMs: 30000,
            assignedAgentId: undefined,
            tags: ['test'],
            metadata: {}
        };
    });

    describe('Normal Operations', () => {
        it('should use primary system when it succeeds', async () => {
            const mockResult = { success: true, data: mockTask };
            mockPrimarySystem.addTask.mockResolvedValue(mockResult as any);

            const result = await fallbackManager.addTask({
                title: 'Test Task',
                description: 'Test description',
                priority: TaskPriority.MEDIUM,
                maxRetries: 3,
                timeoutMs: 30000,
                tags: ['test'],
                metadata: {}
            });

            expect(result).toEqual(mockResult);
            expect(mockPrimarySystem.addTask).toHaveBeenCalledTimes(1);
            expect(mockFallbackSystem.addTask).not.toHaveBeenCalled();
        });

        it('should delegate read operations to primary system', async () => {
            const mockTasks = [mockTask];
            mockPrimarySystem.getAllTasks.mockResolvedValue(mockTasks as any);

            const result = await fallbackManager.getAllTasks();

            expect(result).toEqual(mockTasks);
            expect(mockPrimarySystem.getAllTasks).toHaveBeenCalledTimes(1);
            expect(mockFallbackSystem.getAllTasks).not.toHaveBeenCalled();
        });
    });

    describe('Fallback Activation', () => {
        it('should switch to fallback after failure threshold', async () => {
            const primaryError = new TaskError(TaskErrorCode.SERVICE_UNAVAILABLE, 'Service down');
            const fallbackResult = { success: true, data: mockTask };

            // Make primary system fail
            mockPrimarySystem.addTask.mockRejectedValue(primaryError);
            mockFallbackSystem.addTask.mockResolvedValue(fallbackResult as any);

            // Execute operations to reach failure threshold
            const taskConfig = {
                title: 'Test Task',
                description: 'Test description',
                priority: TaskPriority.MEDIUM,
                maxRetries: 3,
                timeoutMs: 30000,
                tags: ['test'],
                metadata: {}
            };

            // First 3 failures should trigger fallback
            for (let i = 0; i < 3; i++) {
                try {
                    await fallbackManager.addTask(taskConfig);
                } catch (error) {
                    // Expected to fail
                }
            }

            // Fourth operation should use fallback
            const result = await fallbackManager.addTask(taskConfig);

            expect(result).toEqual(fallbackResult);
            expect(mockFallbackSystem.addTask).toHaveBeenCalled();
        });

        it('should handle fallback system failures gracefully', async () => {
            const primaryError = new TaskError(TaskErrorCode.SERVICE_UNAVAILABLE, 'Primary down');
            const fallbackError = new TaskError(TaskErrorCode.SERVICE_UNAVAILABLE, 'Fallback down');

            mockPrimarySystem.addTask.mockRejectedValue(primaryError);
            mockFallbackSystem.addTask.mockRejectedValue(fallbackError);

            // Trigger fallback activation
            const taskConfig = {
                title: 'Test Task',
                description: 'Test description',
                priority: TaskPriority.MEDIUM,
                maxRetries: 3,
                timeoutMs: 30000,
                tags: ['test'],
                metadata: {}
            };

            // Exceed failure threshold
            for (let i = 0; i < 4; i++) {
                await expect(fallbackManager.addTask(taskConfig)).rejects.toThrow();
            }

            // Should have tried both systems
            expect(mockPrimarySystem.addTask).toHaveBeenCalled();
            expect(mockFallbackSystem.addTask).toHaveBeenCalled();
        });

        it('should reset failure count on successful primary operation', async () => {
            const primaryError = new TaskError(TaskErrorCode.SERVICE_UNAVAILABLE, 'Temporary failure');
            const primarySuccess = { success: true, data: mockTask };

            const taskConfig = {
                title: 'Test Task',
                description: 'Test description',
                priority: TaskPriority.MEDIUM,
                maxRetries: 3,
                timeoutMs: 30000,
                tags: ['test'],
                metadata: {}
            };

            // Fail twice, then succeed
            mockPrimarySystem.addTask
                .mockRejectedValueOnce(primaryError)
                .mockRejectedValueOnce(primaryError)
                .mockResolvedValueOnce(primarySuccess as any);

            // Two failures
            await expect(fallbackManager.addTask(taskConfig)).rejects.toThrow();
            await expect(fallbackManager.addTask(taskConfig)).rejects.toThrow();

            // Success should reset counter
            const result = await fallbackManager.addTask(taskConfig);
            expect(result).toEqual(primarySuccess);

            // Add two more failures - should not trigger fallback yet
            mockPrimarySystem.addTask.mockRejectedValue(primaryError);
            await expect(fallbackManager.addTask(taskConfig)).rejects.toThrow();
            await expect(fallbackManager.addTask(taskConfig)).rejects.toThrow();

            // Should still be using primary (counter was reset)
            expect(mockFallbackSystem.addTask).not.toHaveBeenCalled();
        });
    });

    describe('Operation Delegation', () => {
        it('should delegate all ITaskReader methods to current system', async () => {
            const methods = [
                'getNextTask',
                'assignNextTask',
                'markTaskCompleted',
                'markTaskFailed',
                'markTaskCancelled',
                'getTaskById',
                'getTasksByStatus',
                'getQueueSize'
            ];

            // Setup mocks for primary system
            methods.forEach(method => {
                (mockPrimarySystem as any)[method].mockResolvedValue(`${method}-result`);
            });

            // Test each method
            for (const method of methods) {
                const result = await (fallbackManager as any)[method]('test-arg');
                expect(result).toBe(`${method}-result`);
                expect((mockPrimarySystem as any)[method]).toHaveBeenCalledWith('test-arg');
            }
        });

        it('should handle method-specific parameters correctly', async () => {
            const agentId = 'agent-123';
            const taskId = 'task-456';
            const status = TaskStatus.IN_PROGRESS;

            mockPrimarySystem.assignNextTask.mockResolvedValue({ success: true, data: mockTask } as any);
            mockPrimarySystem.markTaskCompleted.mockResolvedValue({ success: true } as any);
            mockPrimarySystem.getTaskById.mockResolvedValue(mockTask as any);
            mockPrimarySystem.getTasksByStatus.mockResolvedValue([mockTask] as any);

            await fallbackManager.assignNextTask(agentId);
            expect(mockPrimarySystem.assignNextTask).toHaveBeenCalledWith(agentId);

            await fallbackManager.markTaskCompleted(taskId, 'result');
            expect(mockPrimarySystem.markTaskCompleted).toHaveBeenCalledWith(taskId, 'result');

            await fallbackManager.getTaskById(taskId);
            expect(mockPrimarySystem.getTaskById).toHaveBeenCalledWith(taskId);

            await fallbackManager.getTasksByStatus(status);
            expect(mockPrimarySystem.getTasksByStatus).toHaveBeenCalledWith(status);
        });
    });

    describe('Dispose Operations', () => {
        it('should dispose both systems', async () => {
            await fallbackManager.dispose();

            expect(mockPrimarySystem.dispose).toHaveBeenCalledTimes(1);
            expect(mockFallbackSystem.dispose).toHaveBeenCalledTimes(1);
        });

        it('should handle dispose errors gracefully', async () => {
            const disposeError = new Error('Dispose failed');
            mockPrimarySystem.dispose.mockRejectedValue(disposeError);
            mockFallbackSystem.dispose.mockResolvedValue();

            await expect(fallbackManager.dispose()).resolves.not.toThrow();

            expect(mockPrimarySystem.dispose).toHaveBeenCalledTimes(1);
            expect(mockFallbackSystem.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('State Management', () => {
        it('should track current system state', () => {
            expect(fallbackManager['currentSystem']).toBe(mockPrimarySystem);
            expect(fallbackManager['failureCount']).toBe(0);
        });

        it('should switch current system after failures', async () => {
            const error = new TaskError(TaskErrorCode.SERVICE_UNAVAILABLE, 'Service down');
            mockPrimarySystem.addTask.mockRejectedValue(error);

            const taskConfig = {
                title: 'Test Task',
                description: 'Test description',
                priority: TaskPriority.MEDIUM,
                maxRetries: 3,
                timeoutMs: 30000,
                tags: ['test'],
                metadata: {}
            };

            // Trigger fallback
            for (let i = 0; i < 3; i++) {
                try {
                    await fallbackManager.addTask(taskConfig);
                } catch (e) {
                    // Expected
                }
            }

            expect(fallbackManager['currentSystem']).toBe(mockFallbackSystem);
        });

        it('should handle custom failure threshold', async () => {
            const customFallback = new FallbackTaskManager(mockPrimarySystem, mockFallbackSystem, 1);
            const error = new TaskError(TaskErrorCode.SERVICE_UNAVAILABLE, 'Service down');

            mockPrimarySystem.addTask.mockRejectedValue(error);
            mockFallbackSystem.addTask.mockResolvedValue({ success: true, data: mockTask } as any);

            // With threshold of 1, should switch after first failure
            await expect(
                customFallback.addTask({
                    title: 'Test Task',
                    description: 'Test',
                    priority: TaskPriority.MEDIUM,
                    maxRetries: 3,
                    timeoutMs: 30000,
                    tags: [],
                    metadata: {}
                })
            ).rejects.toThrow();

            // Next call should use fallback
            const result = await customFallback.addTask({
                title: 'Test Task',
                description: 'Test',
                priority: TaskPriority.MEDIUM,
                maxRetries: 3,
                timeoutMs: 30000,
                tags: [],
                metadata: {}
            });

            expect(result.success).toBe(true);
            expect(mockFallbackSystem.addTask).toHaveBeenCalled();
        });
    });
});
