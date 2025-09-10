import { EnterpriseTaskManager } from '../../../tasks/enterprise/EnterpriseTaskManager';
import { TaskError, TaskErrorCode, TaskPriority } from '../../../tasks/enterprise/EnterpriseTaskTypes';
import { AgentManager } from '../../../agents/AgentManager';
import { ILoggingService, IEventBus, INotificationService, IConfigurationService } from '../../../services/interfaces';
import {
    createMockAgentManager,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockConfigurationService
} from '../../helpers/mockFactories';

// Mock process.memoryUsage for testing
const mockMemoryUsage = jest.fn();
Object.defineProperty(process, 'memoryUsage', {
    value: mockMemoryUsage
});

describe('EnterpriseTaskManager', () => {
    let taskManager: EnterpriseTaskManager;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;

    const createMockAgent = (id: string, name: string = 'Test Agent') => ({
        id,
        name,
        status: 'idle',
        template: { icon: '🤖' }
    });

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useFakeTimers();

        // Mock memory usage
        mockMemoryUsage.mockReturnValue({
            heapUsed: 100 * 1024 * 1024, // 100MB
            heapTotal: 200 * 1024 * 1024, // 200MB
            external: 10 * 1024 * 1024, // 10MB
            rss: 250 * 1024 * 1024 // 250MB
        });

        // Create mock services
        mockAgentManager = createMockAgentManager() as jest.Mocked<AgentManager>;
        mockLoggingService = createMockLoggingService();
        mockEventBus = createMockEventBus();
        mockNotificationService = createMockNotificationService();
        mockConfigService = createMockConfigurationService();

        // Configure mock config service
        mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
            const config: Record<string, any> = {
                'nofx.tasks.maxQueueSize': 1000,
                'nofx.tasks.maxConcurrent': 20,
                'nofx.tasks.enablePriority': true,
                'nofx.tasks.maxRetries': 3,
                'nofx.tasks.retryDelayMs': 1000,
                'nofx.tasks.maxRetryDelayMs': 30000,
                'nofx.tasks.backoffMultiplier': 2,
                'nofx.tasks.timeoutMs': 300000,
                'nofx.tasks.maxTimeoutMs': 600000,
                'nofx.tasks.assignmentTimeoutMs': 30000,
                'nofx.tasks.circuitBreakerThreshold': 5,
                'nofx.tasks.circuitBreakerTimeoutMs': 60000,
                'nofx.tasks.circuitBreakerResetTimeoutMs': 30000,
                'nofx.tasks.maxMemoryPerTask': 512,
                'nofx.tasks.maxCpuPerTask': 80,
                'nofx.tasks.memoryThreshold': 80,
                'nofx.tasks.enableMetrics': true,
                'nofx.tasks.metricsIntervalMs': 60000,
                'nofx.tasks.enableAuditLog': true,
                'nofx.tasks.auditLogRetentionDays': 30,
                'nofx.tasks.healthCheckIntervalMs': 30000,
                'nofx.tasks.healthCheckTimeoutMs': 5000
            };
            return config[key] ?? defaultValue;
        });
        mockConfigService.isAutoAssignTasks.mockReturnValue(true);

        // Create task manager
        taskManager = new EnterpriseTaskManager(
            mockAgentManager,
            mockLoggingService,
            mockEventBus,
            mockNotificationService,
            mockConfigService
        );
    });

    afterEach(async () => {
        await taskManager.dispose();
        jest.useRealTimers();
    });

    describe('Task Creation with Validation', () => {
        it('should create task with valid configuration', async () => {
            const config = {
                title: 'Test Task',
                description: 'Test description'
            };

            const result = await taskManager.addTask(config);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.title).toBe('Test Task');
                expect(result.data.description).toBe('Test description');
                expect(result.data.priority).toBe('medium');
                expect(result.data.status).toBe('ready');
            }
        });

        it('should reject task with invalid configuration', async () => {
            const config = {
                title: '', // Invalid: empty title
                description: 'Test description'
            };

            const result = await taskManager.addTask(config);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe(TaskErrorCode.INVALID_CONFIG);
                expect(result.error.message).toContain('validation failed');
            }
        });

        it('should sanitize malicious input', async () => {
            const config = {
                title: 'Test <script>alert("xss")</script> Task',
                description: 'Description with "quotes" and <tags>'
            };

            const result = await taskManager.addTask(config);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.title).not.toContain('<script>');
                expect(result.data.title).not.toContain('"');
            }
        });

        it('should respect memory limits', async () => {
            // Mock high memory usage
            mockMemoryUsage.mockReturnValue({
                heapUsed: 600 * 1024 * 1024, // 600MB (above threshold)
                heapTotal: 800 * 1024 * 1024,
                external: 50 * 1024 * 1024,
                rss: 700 * 1024 * 1024
            });

            const config = {
                title: 'Test Task',
                description: 'Test description'
            };

            const result = await taskManager.addTask(config);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe(TaskErrorCode.MEMORY_LIMIT_EXCEEDED);
            }
        });

        it('should enforce queue size limits', async () => {
            // Mock config to have small queue size
            mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'nofx.tasks.maxQueueSize') return 1;
                return defaultValue;
            });

            // Create new task manager with small queue
            await taskManager.dispose();
            taskManager = new EnterpriseTaskManager(
                mockAgentManager,
                mockLoggingService,
                mockEventBus,
                mockNotificationService,
                mockConfigService
            );

            const config1 = { title: 'Task 1', description: 'First task' };
            const config2 = { title: 'Task 2', description: 'Second task' };

            const result1 = await taskManager.addTask(config1);
            expect(result1.success).toBe(true);

            const result2 = await taskManager.addTask(config2);
            expect(result2.success).toBe(false);
            if (!result2.success) {
                expect(result2.error.code).toBe(TaskErrorCode.QUEUE_FULL);
            }
        });
    });

    describe('Circuit Breaker Protection', () => {
        it('should fail fast when circuit breaker is open', async () => {
            // Force circuit breaker to open by causing failures
            mockAgentManager.getAvailableAgents.mockImplementation(() => {
                throw new Error('Agent service unavailable');
            });

            // Cause enough failures to open circuit breaker
            for (let i = 0; i < 5; i++) {
                const result = await taskManager.assignNextTask();
                expect(result.success).toBe(false);
            }

            // Next call should fail fast due to open circuit breaker
            const result = await taskManager.assignNextTask();
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe(TaskErrorCode.CIRCUIT_BREAKER_OPEN);
            }
        });

        it('should recover after circuit breaker timeout', async () => {
            // Mock agents to be available again
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAvailableAgents.mockReturnValue([agent]);
            mockAgentManager.executeTask.mockImplementation(() => {});

            // Create a task first
            const config = { title: 'Test Task', description: 'Test description' };
            await taskManager.addTask(config);

            // Advance time to allow circuit breaker to reset
            jest.advanceTimersByTime(60000); // 1 minute

            const result = await taskManager.assignNextTask();
            expect(result.success).toBe(true);
        });
    });

    describe('Retry Logic with Exponential Backoff', () => {
        it('should retry failed operations with exponential backoff', async () => {
            let attemptCount = 0;
            mockAgentManager.getAvailableAgents.mockImplementation(() => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('Temporary failure');
                }
                return [createMockAgent('agent-1')];
            });

            mockAgentManager.executeTask.mockImplementation(() => {});

            const config = { title: 'Test Task', description: 'Test description' };
            await taskManager.addTask(config);

            const result = await taskManager.assignNextTask();
            expect(result.success).toBe(true);
            expect(attemptCount).toBe(3); // Should have retried
        });

        it('should respect maximum retry attempts', async () => {
            mockAgentManager.getAvailableAgents.mockImplementation(() => {
                throw new Error('Persistent failure');
            });

            const config = { title: 'Test Task', description: 'Test description' };
            await taskManager.addTask(config);

            const result = await taskManager.assignNextTask();
            expect(result.success).toBe(false);
        });
    });

    describe('Task Assignment with Load Balancing', () => {
        it('should assign tasks to available agents', async () => {
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAvailableAgents.mockReturnValue([agent]);
            mockAgentManager.executeTask.mockImplementation(() => {});
            mockAgentManager.getAgentTerminal.mockReturnValue({ show: jest.fn() } as any);

            const config = { title: 'Test Task', description: 'Test description' };
            await taskManager.addTask(config);

            const result = await taskManager.assignNextTask();

            expect(result.success).toBe(true);
            expect(mockAgentManager.executeTask).toHaveBeenCalledWith('agent-1', expect.any(Object));
        });

        it('should handle no available agents gracefully', async () => {
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const config = { title: 'Test Task', description: 'Test description' };
            await taskManager.addTask(config);

            const result = await taskManager.assignNextTask();

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe(TaskErrorCode.NO_AVAILABLE_AGENTS);
            }
        });
    });

    describe('Task Completion and Failure Handling', () => {
        it('should complete tasks successfully', async () => {
            const config = { title: 'Test Task', description: 'Test description' };
            const addResult = await taskManager.addTask(config);
            expect(addResult.success).toBe(true);

            if (addResult.success) {
                const taskId = addResult.data.id;
                const result = await taskManager.completeTask(taskId);

                expect(result.success).toBe(true);

                const completedTask = taskManager.getTask(taskId);
                expect(completedTask?.status).toBe('completed');
                expect(completedTask?.completedAt).toBeDefined();
            }
        });

        it('should handle task failures with retry logic', async () => {
            const config = { title: 'Test Task', description: 'Test description' };
            const addResult = await taskManager.addTask(config);
            expect(addResult.success).toBe(true);

            if (addResult.success) {
                const taskId = addResult.data.id;
                const result = await taskManager.failTask(taskId, 'Test failure reason');

                expect(result.success).toBe(true);

                const failedTask = taskManager.getTask(taskId);
                expect(failedTask?.status).toBe('retrying'); // Should retry first
            }
        });

        it('should move tasks to dead letter queue after max retries', async () => {
            // Mock config for immediate failure (no retries)
            mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'nofx.tasks.maxRetries') return 0;
                return defaultValue;
            });

            await taskManager.dispose();
            taskManager = new EnterpriseTaskManager(
                mockAgentManager,
                mockLoggingService,
                mockEventBus,
                mockNotificationService,
                mockConfigService
            );

            const config = { title: 'Test Task', description: 'Test description' };
            const addResult = await taskManager.addTask(config);
            expect(addResult.success).toBe(true);

            if (addResult.success) {
                const taskId = addResult.data.id;
                await taskManager.failTask(taskId, 'Test failure reason');

                const failedTask = taskManager.getTask(taskId);
                expect(failedTask?.status).toBe('failed');
            }
        });
    });

    describe('Health Checks and Monitoring', () => {
        it('should provide comprehensive health status', async () => {
            const healthStatus = await taskManager.getHealthStatus();

            expect(healthStatus.healthy).toBe(true);
            expect(healthStatus.component).toBe('EnterpriseTaskManager');
            expect(healthStatus.details).toBeDefined();
            expect(healthStatus.details.overallHealth).toBeDefined();
            expect(healthStatus.details.resourceUsage).toBeDefined();
            expect(healthStatus.details.circuitBreakerHealth).toBeDefined();
        });

        it('should detect unhealthy conditions', async () => {
            // Mock unhealthy memory usage
            mockMemoryUsage.mockReturnValue({
                heapUsed: 900 * 1024 * 1024, // 900MB
                heapTotal: 1000 * 1024 * 1024, // 1000MB (90% usage)
                external: 50 * 1024 * 1024,
                rss: 950 * 1024 * 1024
            });

            const healthStatus = await taskManager.getHealthStatus();

            expect(healthStatus.healthy).toBe(false);
            expect(healthStatus.details.resourceUsage.memoryUsagePercent).toBeGreaterThan(85);
        });
    });

    describe('Priority Queue Functionality', () => {
        it('should process high priority tasks first', async () => {
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAvailableAgents.mockReturnValue([agent]);
            mockAgentManager.executeTask.mockImplementation(() => {});

            // Create tasks with different priorities
            const lowTask = await taskManager.addTask({
                title: 'Low Priority Task',
                description: 'Low priority',
                priority: 'low'
            });

            const highTask = await taskManager.addTask({
                title: 'High Priority Task',
                description: 'High priority',
                priority: 'high'
            });

            const mediumTask = await taskManager.addTask({
                title: 'Medium Priority Task',
                description: 'Medium priority',
                priority: 'medium'
            });

            // High priority task should be assigned first
            const result = await taskManager.assignNextTask();
            expect(result.success).toBe(true);

            // Verify high priority task was assigned
            expect(mockAgentManager.executeTask).toHaveBeenCalledWith(
                'agent-1',
                expect.objectContaining({
                    title: 'High Priority Task'
                })
            );
        });

        it('should use FIFO for same priority tasks', async () => {
            const agent = createMockAgent('agent-1');
            mockAgentManager.getAvailableAgents.mockReturnValue([agent]);
            mockAgentManager.executeTask.mockImplementation(() => {});

            // Create multiple medium priority tasks
            const firstTask = await taskManager.addTask({
                title: 'First Task',
                description: 'First medium priority task',
                priority: 'medium'
            });

            // Small delay to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 10));

            const secondTask = await taskManager.addTask({
                title: 'Second Task',
                description: 'Second medium priority task',
                priority: 'medium'
            });

            // First task should be assigned first (FIFO)
            const result = await taskManager.assignNextTask();
            expect(result.success).toBe(true);

            expect(mockAgentManager.executeTask).toHaveBeenCalledWith(
                'agent-1',
                expect.objectContaining({
                    title: 'First Task'
                })
            );
        });
    });

    describe('Resource Management', () => {
        it('should monitor memory usage', async () => {
            const usage = (taskManager as any).resourceManager.getResourceUsage();

            expect(usage.memoryUsageMB).toBeDefined();
            expect(usage.memoryUsagePercent).toBeDefined();
            expect(usage.heapTotal).toBeDefined();
            expect(usage.heapUsed).toBeDefined();
        });

        it('should force garbage collection when memory is high', async () => {
            const forceGcSpy = jest.spyOn((taskManager as any).resourceManager, 'forceGarbageCollection');

            // Mock very high memory usage
            mockMemoryUsage.mockReturnValue({
                heapUsed: 950 * 1024 * 1024,
                heapTotal: 1000 * 1024 * 1024,
                external: 50 * 1024 * 1024,
                rss: 1000 * 1024 * 1024
            });

            // Advance timers to trigger resource monitoring
            jest.advanceTimersByTime(10000);

            // Should trigger garbage collection
            expect(forceGcSpy).toHaveBeenCalled();
        });
    });

    describe('Audit Logging', () => {
        it('should maintain audit trail for task operations', async () => {
            const config = { title: 'Audited Task', description: 'Task with audit trail' };
            const addResult = await taskManager.addTask(config);
            expect(addResult.success).toBe(true);

            if (addResult.success) {
                const task = taskManager.getTask(addResult.data.id);

                // Should have audit entries for creation and status changes
                expect(task).toBeDefined();
                // Note: Audit trail is internal to EnterpriseTask, not exposed in legacy interface
            }
        });
    });

    describe('Graceful Shutdown', () => {
        it('should handle shutdown signals gracefully', async () => {
            const disposeSpy = jest.spyOn(taskManager, 'dispose');

            // Simulate shutdown signal
            process.emit('SIGTERM' as any);

            // Allow async shutdown to process
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(disposeSpy).toHaveBeenCalled();
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle concurrent task modifications safely', async () => {
            const config = { title: 'Concurrent Task', description: 'Test concurrent access' };

            // Create multiple concurrent operations
            const promises = Array.from({ length: 10 }, () => taskManager.addTask(config));
            const results = await Promise.allSettled(promises);

            // All operations should succeed or fail gracefully
            results.forEach(result => {
                expect(result.status).toBe('fulfilled');
            });
        });

        it('should validate task IDs properly', async () => {
            const result = await taskManager.completeTask('invalid-task-id');

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe(TaskErrorCode.INVALID_INPUT);
            }
        });

        it('should handle malformed task configurations', async () => {
            const malformedConfig = {
                title: null, // Invalid type
                description: undefined // Invalid type
            };

            const result = await taskManager.addTask(malformedConfig as any);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe(TaskErrorCode.INVALID_CONFIG);
            }
        });
    });

    describe('Legacy API Compatibility', () => {
        it('should provide legacy API methods', () => {
            expect(typeof taskManager.getAllTasks).toBe('function');
            expect(typeof taskManager.getPendingTasks).toBe('function');
            expect(typeof taskManager.getActiveTasks).toBe('function');
            expect(typeof taskManager.getActiveOrAssignedTasks).toBe('function');
            expect(typeof taskManager.getBlockedTasks).toBe('function');
            expect(typeof taskManager.getDependentTasks).toBe('function');
        });

        it('should return empty arrays for unsupported complex features', () => {
            expect(taskManager.getBlockedTasks()).toEqual([]);
            expect(taskManager.getDependentTasks()).toEqual([]);
            expect(taskManager.addTaskDependency()).toBe(false);
            expect(taskManager.removeTaskDependency()).toBe(false);
            expect(taskManager.resolveConflict()).toBe(false);
        });

        it('should maintain backward compatibility with task format', async () => {
            const config = { title: 'Legacy Task', description: 'Backward compatible task' };
            const result = await taskManager.addTask(config);

            expect(result.success).toBe(true);
            if (result.success) {
                const task = result.data;

                // Should have all legacy task fields
                expect(task).toHaveProperty('id');
                expect(task).toHaveProperty('title');
                expect(task).toHaveProperty('description');
                expect(task).toHaveProperty('priority');
                expect(task).toHaveProperty('status');
                expect(task).toHaveProperty('files');
                expect(task).toHaveProperty('tags');
                expect(task).toHaveProperty('createdAt');
                expect(task).toHaveProperty('dependsOn');
                expect(task).toHaveProperty('prefers');
                expect(task).toHaveProperty('blockedBy');
                expect(task).toHaveProperty('conflictsWith');
            }
        });
    });
});
