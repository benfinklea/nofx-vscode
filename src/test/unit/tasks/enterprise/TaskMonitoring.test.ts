import {
    PerformanceMonitor,
    StructuredLogger,
    HealthCheckManager,
    DeadLetterQueue,
    TaskMetricsCollector
} from '../../../../tasks/enterprise/TaskMonitoring';
import {
    EnterpriseTask,
    TaskError,
    TaskErrorCode,
    EnterpriseTaskStatus,
    TaskPriority,
    TaskMetrics,
    HealthCheckResult
} from '../../../../tasks/enterprise/EnterpriseTaskTypes';
import { TaskStatus } from '../../../../agents/types';

describe('PerformanceMonitor', () => {
    let performanceMonitor: PerformanceMonitor;

    beforeEach(() => {
        // Reset static state
        PerformanceMonitor['measurements']?.clear();
        PerformanceMonitor['counters']?.clear();
        PerformanceMonitor['histograms']?.clear();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Static Methods', () => {
        it('should have static timer methods', () => {
            expect(typeof PerformanceMonitor.startTimer).toBe('function');
            expect(typeof PerformanceMonitor.endTimer).toBe('function');
        });
    });

    describe('Timer Operations', () => {
        it('should start and end timer correctly', () => {
            const operationId = 'test-operation';
            const startTime = Date.now();

            PerformanceMonitor.startTimer(operationId);

            jest.advanceTimersByTime(1500); // 1.5 seconds

            const duration = PerformanceMonitor.endTimer(operationId);

            expect(duration).toBeCloseTo(1500, -2); // Within 100ms tolerance
            expect(PerformanceMonitor['measurements'].has(operationId)).toBe(false);
        });

        it('should handle ending non-existent timer', () => {
            const duration = PerformanceMonitor.endTimer('non-existent');
            expect(duration).toBe(0);
        });

        it('should handle multiple concurrent timers', () => {
            const op1 = 'operation-1';
            const op2 = 'operation-2';

            PerformanceMonitor.startTimer(op1);
            jest.advanceTimersByTime(500);

            PerformanceMonitor.startTimer(op2);
            jest.advanceTimersByTime(300);

            const duration1 = PerformanceMonitor.endTimer(op1);
            jest.advanceTimersByTime(200);

            const duration2 = PerformanceMonitor.endTimer(op2);

            expect(duration1).toBeCloseTo(800, -2);
            expect(duration2).toBeCloseTo(500, -2);
        });

        it('should clear timer when ended', () => {
            const operationId = 'clear-test';

            PerformanceMonitor.startTimer(operationId);
            expect(PerformanceMonitor['measurements'].has(operationId)).toBe(true);

            PerformanceMonitor.endTimer(operationId);
            expect(PerformanceMonitor['measurements'].has(operationId)).toBe(false);
        });
    });

    describe('Metrics Recording', () => {
        it('should record counter increments', () => {
            const metricName = 'task.completed';

            PerformanceMonitor.incrementCounter(metricName);
            PerformanceMonitor.incrementCounter(metricName);
            PerformanceMonitor.incrementCounter(metricName);

            const metrics = PerformanceMonitor.getMetrics();
            expect(metrics[metricName]).toBe(3);
        });

        it('should record gauge values', () => {
            const metricName = 'queue.size';

            PerformanceMonitor.recordValue(metricName, 10);
            PerformanceMonitor.recordValue(metricName, 15);
            PerformanceMonitor.recordValue(metricName, 8);

            const metrics = PerformanceMonitor.getMetrics();
            expect(metrics[metricName]).toBe(8); // Should be latest value
        });

        it('should handle multiple metric types', () => {
            PerformanceMonitor.incrementCounter('tasks.created');
            PerformanceMonitor.incrementCounter('tasks.created');
            PerformanceMonitor.recordValue('memory.usage', 256);
            PerformanceMonitor.recordValue('cpu.usage', 45);

            const metrics = PerformanceMonitor.getMetrics();

            expect(metrics['tasks.created']).toBe(2);
            expect(metrics['memory.usage']).toBe(256);
            expect(metrics['cpu.usage']).toBe(45);
        });

        it('should provide empty metrics initially', () => {
            const metrics = PerformanceMonitor.getMetrics();
            expect(Object.keys(metrics)).toHaveLength(0);
        });
    });

    describe('Reset Operations', () => {
        it('should reset all metrics', () => {
            PerformanceMonitor.incrementCounter('test.counter');
            PerformanceMonitor.recordValue('test.gauge', 100);
            PerformanceMonitor.startTimer('test.timer');

            expect(Object.keys(PerformanceMonitor.getMetrics())).toHaveLength(2);
            expect(PerformanceMonitor['measurements'].size).toBe(1);

            PerformanceMonitor.reset();

            expect(Object.keys(PerformanceMonitor.getMetrics())).toHaveLength(0);
            expect(PerformanceMonitor['measurements'].size).toBe(0);
        });
    });
});

describe('StructuredLogger', () => {
    let logger: StructuredLogger;
    let consoleLogSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        logger = new StructuredLogger('TestService');
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('Log Level Operations', () => {
        it('should log info messages with structured data', () => {
            const context = { taskId: 'task-123', userId: 'user-456' };

            logger.info('Task created successfully', context);

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('[INFO]'),
                expect.stringContaining('TestService'),
                expect.stringContaining('Task created successfully'),
                expect.objectContaining({
                    ...context,
                    correlationId: expect.any(String),
                    timestamp: expect.any(String)
                })
            );
        });

        it('should log warn messages', () => {
            const context = { retryCount: 2, maxRetries: 3 };

            logger.warn('Task retry attempted', context);

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('[WARN]'),
                expect.stringContaining('TestService'),
                expect.stringContaining('Task retry attempted'),
                expect.objectContaining(context)
            );
        });

        it('should log error messages', () => {
            const error = new Error('Task execution failed');
            const context = { taskId: 'task-789', errorCode: 'TASK_FAILED' };

            logger.error('Critical task failure', error, context);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ERROR]'),
                expect.stringContaining('TestService'),
                expect.stringContaining('Critical task failure'),
                expect.objectContaining({
                    ...context,
                    error: {
                        message: error.message,
                        stack: error.stack,
                        name: error.name
                    }
                })
            );
        });

        it('should handle missing context gracefully', () => {
            logger.info('Simple message');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('[INFO]'),
                expect.stringContaining('TestService'),
                expect.stringContaining('Simple message'),
                expect.objectContaining({
                    correlationId: expect.any(String),
                    timestamp: expect.any(String)
                })
            );
        });
    });

    describe('Correlation ID Management', () => {
        it('should use provided correlation ID', () => {
            const correlationId = 'custom-correlation-123';

            logger.info('Test message', { data: 'test' }, correlationId);

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.objectContaining({ correlationId })
            );
        });

        it('should generate correlation ID when not provided', () => {
            logger.info('Test message');

            const logCall = consoleLogSpy.mock.calls[0];
            const logData = logCall[3];

            expect(logData.correlationId).toBeDefined();
            expect(typeof logData.correlationId).toBe('string');
            expect(logData.correlationId.length).toBeGreaterThan(0);
        });

        it('should generate unique correlation IDs', () => {
            logger.info('Message 1');
            logger.info('Message 2');

            const call1Data = consoleLogSpy.mock.calls[0][3];
            const call2Data = consoleLogSpy.mock.calls[1][3];

            expect(call1Data.correlationId).not.toBe(call2Data.correlationId);
        });
    });

    describe('Timestamp Formatting', () => {
        it('should include ISO timestamp', () => {
            const beforeLog = new Date().toISOString();

            logger.info('Timestamp test');

            const afterLog = new Date().toISOString();
            const logData = consoleLogSpy.mock.calls[0][3];

            expect(logData.timestamp).toBeDefined();
            expect(logData.timestamp >= beforeLog).toBe(true);
            expect(logData.timestamp <= afterLog).toBe(true);
        });
    });

    describe('Error Serialization', () => {
        it('should serialize TaskError properly', () => {
            const taskError = new TaskError(TaskErrorCode.AGENT_UNAVAILABLE, 'Agent is not available', true, 'high', {
                agentId: 'agent-123'
            });

            logger.error('Task error occurred', taskError);

            const logData = consoleErrorSpy.mock.calls[0][3];

            expect(logData.error.message).toBe(taskError.message);
            expect(logData.error.name).toBe('TaskError');
            expect(logData.error.code).toBe(TaskErrorCode.AGENT_UNAVAILABLE);
            expect(logData.error.retryable).toBe(true);
            expect(logData.error.severity).toBe('high');
        });

        it('should handle Error objects without TaskError properties', () => {
            const genericError = new Error('Generic failure');

            logger.error('Generic error occurred', genericError);

            const logData = consoleErrorSpy.mock.calls[0][3];

            expect(logData.error.message).toBe(genericError.message);
            expect(logData.error.name).toBe('Error');
            expect(logData.error.stack).toBe(genericError.stack);
        });
    });
});

describe('HealthCheckManager', () => {
    let healthCheckManager: HealthCheckManager;

    beforeEach(() => {
        healthCheckManager = new HealthCheckManager();
        jest.useFakeTimers();
    });

    afterEach(() => {
        healthCheckManager.stop();
        jest.useRealTimers();
    });

    describe('Health Check Registration', () => {
        it('should register health check', async () => {
            const mockCheck = jest.fn().mockResolvedValue({
                healthy: true,
                component: 'test-component',
                details: { status: 'ok' },
                responseTimeMs: 10
            } as HealthCheckResult);

            healthCheckManager.registerCheck('test', mockCheck);

            const result = await healthCheckManager.runHealthCheck('test');

            expect(result.healthy).toBe(true);
            expect(result.component).toBe('test-component');
            expect(mockCheck).toHaveBeenCalledTimes(1);
        });

        it('should handle health check failure', async () => {
            const mockCheck = jest.fn().mockRejectedValue(new Error('Health check failed'));

            healthCheckManager.registerCheck('failing-test', mockCheck);

            const result = await healthCheckManager.runHealthCheck('failing-test');

            expect(result.healthy).toBe(false);
            expect(result.component).toBe('failing-test');
            expect(result.details.error).toContain('Health check failed');
        });

        it('should measure response time', async () => {
            const mockCheck = jest.fn().mockImplementation(async () => {
                // Simulate some processing time
                await new Promise(resolve => setTimeout(resolve, 100));
                return {
                    healthy: true,
                    component: 'timed-component',
                    details: {},
                    responseTimeMs: 0 // Will be overwritten
                };
            });

            healthCheckManager.registerCheck('timed-test', mockCheck);

            const promise = healthCheckManager.runHealthCheck('timed-test');
            jest.advanceTimersByTime(100);
            const result = await promise;

            expect(result.responseTimeMs).toBeGreaterThan(0);
        });
    });

    describe('All Health Checks', () => {
        it('should run all registered checks', async () => {
            const check1 = jest.fn().mockResolvedValue({
                healthy: true,
                component: 'component-1',
                details: {},
                responseTimeMs: 10
            });

            const check2 = jest.fn().mockResolvedValue({
                healthy: false,
                component: 'component-2',
                details: { error: 'Something wrong' },
                responseTimeMs: 20
            });

            healthCheckManager.registerCheck('check1', check1);
            healthCheckManager.registerCheck('check2', check2);

            const results = await healthCheckManager.runAllHealthChecks();

            expect(results).toHaveLength(2);
            expect(results.find(r => r.component === 'component-1')?.healthy).toBe(true);
            expect(results.find(r => r.component === 'component-2')?.healthy).toBe(false);
            expect(check1).toHaveBeenCalledTimes(1);
            expect(check2).toHaveBeenCalledTimes(1);
        });

        it('should handle empty health checks', async () => {
            const results = await healthCheckManager.runAllHealthChecks();
            expect(results).toHaveLength(0);
        });

        it('should continue running other checks if one fails', async () => {
            const failingCheck = jest.fn().mockRejectedValue(new Error('Check failed'));
            const successCheck = jest.fn().mockResolvedValue({
                healthy: true,
                component: 'success-component',
                details: {},
                responseTimeMs: 5
            });

            healthCheckManager.registerCheck('failing', failingCheck);
            healthCheckManager.registerCheck('success', successCheck);

            const results = await healthCheckManager.runAllHealthChecks();

            expect(results).toHaveLength(2);
            expect(results.find(r => r.component === 'failing')?.healthy).toBe(false);
            expect(results.find(r => r.component === 'success-component')?.healthy).toBe(true);
        });
    });

    describe('Periodic Health Checks', () => {
        it('should start periodic health checks', async () => {
            const mockCheck = jest.fn().mockResolvedValue({
                healthy: true,
                component: 'periodic-component',
                details: {},
                responseTimeMs: 5
            });

            healthCheckManager.registerCheck('periodic', mockCheck);
            healthCheckManager.start(1000); // Every 1 second

            expect(mockCheck).not.toHaveBeenCalled(); // Not called immediately

            jest.advanceTimersByTime(1000);
            await Promise.resolve(); // Allow async execution

            expect(mockCheck).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(mockCheck).toHaveBeenCalledTimes(2);
        });

        it('should stop periodic health checks', async () => {
            const mockCheck = jest.fn().mockResolvedValue({
                healthy: true,
                component: 'stoppable-component',
                details: {},
                responseTimeMs: 5
            });

            healthCheckManager.registerCheck('stoppable', mockCheck);
            healthCheckManager.start(1000);

            jest.advanceTimersByTime(1000);
            await Promise.resolve();
            expect(mockCheck).toHaveBeenCalledTimes(1);

            healthCheckManager.stop();

            jest.advanceTimersByTime(2000);
            await Promise.resolve();
            expect(mockCheck).toHaveBeenCalledTimes(1); // Should not increase
        });
    });

    describe('Error Handling', () => {
        it('should handle non-existent health check', async () => {
            const result = await healthCheckManager.runHealthCheck('non-existent');

            expect(result.healthy).toBe(false);
            expect(result.component).toBe('non-existent');
            expect(result.details.error).toContain('not found');
        });

        it('should handle health check timeout', async () => {
            const slowCheck = jest.fn().mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(
                        () =>
                            resolve({
                                healthy: true,
                                component: 'slow-component',
                                details: {},
                                responseTimeMs: 0
                            }),
                        10000
                    ); // 10 seconds
                });
            });

            healthCheckManager.registerCheck('slow', slowCheck, 1000); // 1 second timeout

            const result = await healthCheckManager.runHealthCheck('slow');

            expect(result.healthy).toBe(false);
            expect(result.details.error).toContain('timeout');
        });
    });
});

describe('DeadLetterQueue', () => {
    let deadLetterQueue: DeadLetterQueue;
    let mockTask: EnterpriseTask;

    beforeEach(() => {
        deadLetterQueue = new DeadLetterQueue(100); // Max 100 items
        mockTask = {
            id: 'task-123',
            title: 'Test Task',
            description: 'A test task',
            status: TaskStatus.FAILED,
            priority: TaskPriority.MEDIUM,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
            maxRetries: 3,
            retryCount: 3,
            timeoutMs: 30000,
            assignedAgentId: 'agent-456',
            tags: ['test'],
            metadata: {}
        };
    });

    describe('Failed Task Management', () => {
        it('should add failed task', () => {
            const error = new TaskError(TaskErrorCode.TIMEOUT, 'Task timed out');

            deadLetterQueue.addFailedTask(mockTask, error);

            const deadTasks = deadLetterQueue.getDeadTasks();
            expect(deadTasks).toHaveLength(1);
            expect(deadTasks[0].task).toEqual(mockTask);
            expect(deadTasks[0].error).toEqual(error);
            expect(deadTasks[0].failedAt).toBeInstanceOf(Date);
        });

        it('should maintain chronological order', () => {
            const error1 = new TaskError(TaskErrorCode.TIMEOUT, 'First error');
            const error2 = new TaskError(TaskErrorCode.AGENT_UNAVAILABLE, 'Second error');

            const task1 = { ...mockTask, id: 'task-1' };
            const task2 = { ...mockTask, id: 'task-2' };

            deadLetterQueue.addFailedTask(task1, error1);
            deadLetterQueue.addFailedTask(task2, error2);

            const deadTasks = deadLetterQueue.getDeadTasks();
            expect(deadTasks).toHaveLength(2);
            expect(deadTasks[0].task.id).toBe('task-1');
            expect(deadTasks[1].task.id).toBe('task-2');
            expect(deadTasks[0].failedAt.getTime()).toBeLessThanOrEqual(deadTasks[1].failedAt.getTime());
        });

        it('should respect capacity limit', () => {
            const smallQueue = new DeadLetterQueue(2);

            for (let i = 1; i <= 5; i++) {
                const task = { ...mockTask, id: `task-${i}` };
                const error = new TaskError(TaskErrorCode.TIMEOUT, `Error ${i}`);
                smallQueue.addFailedTask(task, error);
            }

            const deadTasks = smallQueue.getDeadTasks();
            expect(deadTasks).toHaveLength(2);
            // Should keep the most recent tasks
            expect(deadTasks[0].task.id).toBe('task-4');
            expect(deadTasks[1].task.id).toBe('task-5');
        });

        it('should handle zero capacity gracefully', () => {
            const zeroQueue = new DeadLetterQueue(0);
            const error = new TaskError(TaskErrorCode.TIMEOUT, 'Error');

            zeroQueue.addFailedTask(mockTask, error);

            expect(zeroQueue.getDeadTasks()).toHaveLength(0);
        });
    });

    describe('Filtering and Analysis', () => {
        beforeEach(() => {
            // Add various failed tasks for testing
            const errors = [
                new TaskError(TaskErrorCode.TIMEOUT, 'Timeout error'),
                new TaskError(TaskErrorCode.AGENT_UNAVAILABLE, 'Agent error'),
                new TaskError(TaskErrorCode.TIMEOUT, 'Another timeout'),
                new TaskError(TaskErrorCode.MEMORY_LIMIT_EXCEEDED, 'Memory error')
            ];

            errors.forEach((error, i) => {
                const task = { ...mockTask, id: `task-${i + 1}` };
                deadLetterQueue.addFailedTask(task, error);
            });
        });

        it('should filter by error code', () => {
            const timeoutTasks = deadLetterQueue.getDeadTasksByErrorCode(TaskErrorCode.TIMEOUT);

            expect(timeoutTasks).toHaveLength(2);
            expect(timeoutTasks.every(item => item.error.code === TaskErrorCode.TIMEOUT)).toBe(true);
        });

        it('should filter by time range', () => {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

            const recentTasks = deadLetterQueue.getDeadTasksInTimeRange(oneHourAgo, oneHourLater);

            expect(recentTasks).toHaveLength(4); // All tasks should be in this range

            const futureTasks = deadLetterQueue.getDeadTasksInTimeRange(oneHourLater, oneHourLater);
            expect(futureTasks).toHaveLength(0);
        });

        it('should analyze error patterns', () => {
            const analysis = deadLetterQueue.analyzeErrorPatterns();

            expect(analysis).toHaveProperty(TaskErrorCode.TIMEOUT);
            expect(analysis).toHaveProperty(TaskErrorCode.AGENT_UNAVAILABLE);
            expect(analysis).toHaveProperty(TaskErrorCode.MEMORY_LIMIT_EXCEEDED);

            expect(analysis[TaskErrorCode.TIMEOUT]).toBe(2);
            expect(analysis[TaskErrorCode.AGENT_UNAVAILABLE]).toBe(1);
            expect(analysis[TaskErrorCode.MEMORY_LIMIT_EXCEEDED]).toBe(1);
        });

        it('should handle empty queue analysis', () => {
            const emptyQueue = new DeadLetterQueue(10);
            const analysis = emptyQueue.analyzeErrorPatterns();

            expect(Object.keys(analysis)).toHaveLength(0);
        });
    });

    describe('Cleanup Operations', () => {
        it('should clear all dead tasks', () => {
            const error = new TaskError(TaskErrorCode.TIMEOUT, 'Error');
            deadLetterQueue.addFailedTask(mockTask, error);

            expect(deadLetterQueue.getDeadTasks()).toHaveLength(1);

            deadLetterQueue.clear();

            expect(deadLetterQueue.getDeadTasks()).toHaveLength(0);
        });

        it('should remove tasks older than specified time', () => {
            const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
            const recentDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

            // Mock the failedAt dates
            const error = new TaskError(TaskErrorCode.TIMEOUT, 'Error');
            deadLetterQueue.addFailedTask(mockTask, error);

            // Manually set an old timestamp
            deadLetterQueue['deadTasks'][0].failedAt = oldDate;

            // Add a recent task
            const recentTask = { ...mockTask, id: 'recent-task' };
            deadLetterQueue.addFailedTask(recentTask, error);

            expect(deadLetterQueue.getDeadTasks()).toHaveLength(2);

            // Remove tasks older than 1 hour
            deadLetterQueue.removeTasksOlderThan(60 * 60 * 1000);

            const remainingTasks = deadLetterQueue.getDeadTasks();
            expect(remainingTasks).toHaveLength(1);
            expect(remainingTasks[0].task.id).toBe('recent-task');
        });
    });

    describe('Statistics', () => {
        it('should provide correct statistics', () => {
            const errors = [
                new TaskError(TaskErrorCode.TIMEOUT, 'Timeout 1'),
                new TaskError(TaskErrorCode.TIMEOUT, 'Timeout 2'),
                new TaskError(TaskErrorCode.AGENT_UNAVAILABLE, 'Agent error')
            ];

            errors.forEach((error, i) => {
                const task = { ...mockTask, id: `task-${i + 1}` };
                deadLetterQueue.addFailedTask(task, error);
            });

            const stats = deadLetterQueue.getStatistics();

            expect(stats.totalFailedTasks).toBe(3);
            expect(stats.errorBreakdown[TaskErrorCode.TIMEOUT]).toBe(2);
            expect(stats.errorBreakdown[TaskErrorCode.AGENT_UNAVAILABLE]).toBe(1);
            expect(stats.oldestFailure).toBeInstanceOf(Date);
            expect(stats.newestFailure).toBeInstanceOf(Date);
        });

        it('should handle empty queue statistics', () => {
            const stats = deadLetterQueue.getStatistics();

            expect(stats.totalFailedTasks).toBe(0);
            expect(Object.keys(stats.errorBreakdown)).toHaveLength(0);
            expect(stats.oldestFailure).toBeNull();
            expect(stats.newestFailure).toBeNull();
        });
    });
});

describe('TaskMetricsCollector', () => {
    let metricsCollector: TaskMetricsCollector;

    beforeEach(() => {
        metricsCollector = new TaskMetricsCollector();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Task Metrics Collection', () => {
        it('should track task completion', () => {
            metricsCollector.recordTaskCompleted('task-1', 1500);
            metricsCollector.recordTaskCompleted('task-2', 2300);
            metricsCollector.recordTaskCompleted('task-3', 800);

            const metrics = metricsCollector.getCurrentMetrics();

            expect(metrics.throughputPerMinute).toBeGreaterThan(0);
            expect(metrics.averageExecutionTimeMs).toBeCloseTo(1533, 0); // (1500 + 2300 + 800) / 3
        });

        it('should track task failures', () => {
            metricsCollector.recordTaskCompleted('task-1', 1000);
            metricsCollector.recordTaskFailed('task-2');
            metricsCollector.recordTaskFailed('task-3');

            const metrics = metricsCollector.getCurrentMetrics();

            expect(metrics.errorRate).toBeCloseTo(0.67, 2); // 2 failures out of 3 total
        });

        it('should update queue size history', () => {
            metricsCollector.updateQueueSize(10);
            metricsCollector.updateQueueSize(8);
            metricsCollector.updateQueueSize(6);

            const metrics = metricsCollector.getCurrentMetrics();

            expect(metrics.queueSizeHistory).toContain(10);
            expect(metrics.queueSizeHistory).toContain(8);
            expect(metrics.queueSizeHistory).toContain(6);
        });

        it('should limit queue size history length', () => {
            // Add more than the maximum history length
            for (let i = 0; i < 150; i++) {
                metricsCollector.updateQueueSize(i);
            }

            const metrics = metricsCollector.getCurrentMetrics();

            expect(metrics.queueSizeHistory.length).toBeLessThanOrEqual(100); // Assuming max history of 100
            expect(metrics.queueSizeHistory[metrics.queueSizeHistory.length - 1]).toBe(149); // Most recent value
        });
    });

    describe('Memory Tracking', () => {
        it('should update memory usage', () => {
            metricsCollector.updateMemoryUsage(256);

            const metrics = metricsCollector.getCurrentMetrics();

            expect(metrics.memoryUsageMB).toBe(256);
        });

        it('should track memory over time', () => {
            metricsCollector.updateMemoryUsage(200);
            metricsCollector.updateMemoryUsage(250);
            metricsCollector.updateMemoryUsage(300);

            const metrics = metricsCollector.getCurrentMetrics();

            expect(metrics.memoryUsageMB).toBe(300); // Should be latest value
        });
    });

    describe('Throughput Calculation', () => {
        it('should calculate throughput per minute', () => {
            const startTime = Date.now();

            // Record some completions
            metricsCollector.recordTaskCompleted('task-1', 1000);
            metricsCollector.recordTaskCompleted('task-2', 1000);

            jest.advanceTimersByTime(30000); // 30 seconds

            metricsCollector.recordTaskCompleted('task-3', 1000);
            metricsCollector.recordTaskCompleted('task-4', 1000);

            const metrics = metricsCollector.getCurrentMetrics();

            expect(metrics.throughputPerMinute).toBeGreaterThan(0);
            // Should be roughly 8 tasks per minute (4 tasks in 30 seconds)
            expect(metrics.throughputPerMinute).toBeCloseTo(8, 1);
        });

        it('should handle zero throughput', () => {
            const metrics = metricsCollector.getCurrentMetrics();

            expect(metrics.throughputPerMinute).toBe(0);
        });
    });

    describe('Metrics Reset', () => {
        it('should reset all metrics', () => {
            metricsCollector.recordTaskCompleted('task-1', 1000);
            metricsCollector.recordTaskFailed('task-2');
            metricsCollector.updateQueueSize(10);
            metricsCollector.updateMemoryUsage(256);

            let metrics = metricsCollector.getCurrentMetrics();
            expect(metrics.throughputPerMinute).toBeGreaterThan(0);
            expect(metrics.errorRate).toBeGreaterThan(0);

            metricsCollector.reset();

            metrics = metricsCollector.getCurrentMetrics();
            expect(metrics.throughputPerMinute).toBe(0);
            expect(metrics.errorRate).toBe(0);
            expect(metrics.averageExecutionTimeMs).toBe(0);
            expect(metrics.memoryUsageMB).toBe(0);
            expect(metrics.queueSizeHistory).toHaveLength(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle negative execution times', () => {
            metricsCollector.recordTaskCompleted('task-1', -100);

            const metrics = metricsCollector.getCurrentMetrics();

            // Should handle gracefully - could clamp to 0 or ignore
            expect(metrics.averageExecutionTimeMs).toBeGreaterThanOrEqual(0);
        });

        it('should handle very large execution times', () => {
            metricsCollector.recordTaskCompleted('task-1', 999999999);

            const metrics = metricsCollector.getCurrentMetrics();

            expect(metrics.averageExecutionTimeMs).toBe(999999999);
        });

        it('should handle rapid successive updates', () => {
            for (let i = 0; i < 1000; i++) {
                metricsCollector.recordTaskCompleted(`task-${i}`, 100);
            }

            const metrics = metricsCollector.getCurrentMetrics();

            expect(metrics.averageExecutionTimeMs).toBe(100);
            expect(metrics.throughputPerMinute).toBeGreaterThan(0);
        });
    });
});
