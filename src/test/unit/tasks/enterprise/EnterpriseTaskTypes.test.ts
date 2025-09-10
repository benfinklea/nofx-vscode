import {
    EnterpriseTask,
    TaskError,
    TaskErrorCode,
    TaskPriority,
    EnterpriseTaskStatus,
    TaskValidator,
    TaskIdGenerator,
    TaskResult,
    TaskResourceUsage,
    HealthCheckResult,
    TaskMetrics
} from '../../../../tasks/enterprise/EnterpriseTaskTypes';

describe('EnterpriseTaskTypes', () => {
    describe('TaskError', () => {
        it('should create TaskError with all properties', () => {
            const context = { userId: '123', operation: 'test' };
            const error = new TaskError(TaskErrorCode.INVALID_INPUT, 'Test error message', context, true, 'high');

            expect(error.code).toBe(TaskErrorCode.INVALID_INPUT);
            expect(error.message).toBe('Test error message');
            expect(error.retryable).toBe(true);
            expect(error.severity).toBe('high');
            expect(error.context).toEqual(context);
            expect(error.name).toBe('TaskError');
            expect(error instanceof Error).toBe(true);
        });

        it('should create TaskError with minimal properties', () => {
            const error = new TaskError(TaskErrorCode.QUEUE_FULL, 'Queue is full');

            expect(error.code).toBe(TaskErrorCode.QUEUE_FULL);
            expect(error.message).toBe('Queue is full');
            expect(error.retryable).toBe(false);
            expect(error.severity).toBe('medium');
            expect(error.context).toEqual({});
        });

        it('should set correct default severity for different error codes', () => {
            const validationError = new TaskError(TaskErrorCode.INVALID_CONFIG, 'Config error');
            expect(validationError.severity).toBe('medium');

            const systemError = new TaskError(TaskErrorCode.SERVICE_UNAVAILABLE, 'Service down');
            expect(systemError.severity).toBe('medium');
        });
    });

    describe('TaskValidator', () => {
        const validConfig = {
            title: 'Test Task',
            description: 'A test task',
            priority: TaskPriority.MEDIUM,
            maxRetries: 3,
            timeoutMs: 30000,
            tags: ['test'],
            metadata: { source: 'unit-test' }
        };

        it('should validate correct task configuration', () => {
            const errors = TaskValidator.validateConfig(validConfig);
            expect(errors).toEqual([]);
        });

        it('should reject missing title', () => {
            const config = { ...validConfig, title: '' };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Title is required and cannot be empty');
        });

        it('should reject whitespace-only title', () => {
            const config = { ...validConfig, title: '   ' };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Title is required and cannot be empty');
        });

        it('should reject title longer than 200 characters', () => {
            const config = { ...validConfig, title: 'a'.repeat(201) };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Title cannot exceed 200 characters');
        });

        it('should reject description longer than 2000 characters', () => {
            const config = { ...validConfig, description: 'a'.repeat(2001) };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Description cannot exceed 2000 characters');
        });

        it('should reject invalid priority values', () => {
            const config = { ...validConfig, priority: 999 as TaskPriority };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Priority must be 1 (LOW), 2 (MEDIUM), or 3 (HIGH)');
        });

        it('should reject negative maxRetries', () => {
            const config = { ...validConfig, maxRetries: -1 };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Max retries must be non-negative');
        });

        it('should reject maxRetries exceeding limit', () => {
            const config = { ...validConfig, maxRetries: 11 };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Max retries cannot exceed 10');
        });

        it('should reject negative timeout', () => {
            const config = { ...validConfig, timeoutMs: -1000 };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Timeout must be positive');
        });

        it('should reject timeout exceeding limit', () => {
            const config = { ...validConfig, timeoutMs: 11 * 60 * 1000 }; // 11 minutes
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Timeout cannot exceed 10 minutes');
        });

        it('should reject too many tags', () => {
            const config = { ...validConfig, tags: Array(11).fill('tag') };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Cannot have more than 10 tags');
        });

        it('should reject empty tags', () => {
            const config = { ...validConfig, tags: ['valid', '', 'another'] };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Tags cannot be empty');
        });

        it('should reject tags that are too long', () => {
            const config = { ...validConfig, tags: ['a'.repeat(51)] };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toBe('Tag length cannot exceed 50 characters');
        });

        it('should collect multiple validation errors', () => {
            const config = {
                title: '',
                description: 'a'.repeat(2001),
                priority: 999 as TaskPriority,
                maxRetries: -1,
                timeoutMs: -1000,
                tags: ['', 'a'.repeat(51)],
                metadata: {}
            };
            const errors = TaskValidator.validateConfig(config);

            expect(errors).toHaveLength(6);
            expect(errors).toContain('Title is required and cannot be empty');
            expect(errors).toContain('Description cannot exceed 2000 characters');
            expect(errors).toContain('Priority must be 1 (LOW), 2 (MEDIUM), or 3 (HIGH)');
            expect(errors).toContain('Max retries must be non-negative');
            expect(errors).toContain('Timeout must be positive');
            expect(errors).toContain('Tags cannot be empty');
        });

        it('should validate EnterpriseTask object', () => {
            const task: EnterpriseTask = {
                id: 'task-123',
                title: 'Test Task',
                description: 'A test task',
                status: EnterpriseTaskStatus.QUEUED,
                priority: TaskPriority.HIGH,
                createdAt: new Date(),
                updatedAt: new Date(),
                version: 1,
                maxRetries: 3,
                retryCount: 0,
                timeoutMs: 30000,
                assignedAgentId: undefined,
                tags: ['test'],
                metadata: { source: 'unit-test' }
            };

            const errors = TaskValidator.validateTask(task);
            expect(errors).toEqual([]);
        });

        it('should reject EnterpriseTask with invalid ID', () => {
            const task = {
                id: '',
                title: 'Test Task',
                description: 'A test task',
                status: EnterpriseTaskStatus.QUEUED,
                priority: TaskPriority.HIGH,
                createdAt: new Date(),
                updatedAt: new Date(),
                version: 1,
                maxRetries: 3,
                retryCount: 0,
                timeoutMs: 30000,
                assignedAgentId: undefined,
                tags: ['test'],
                metadata: {}
            } as EnterpriseTask;

            const errors = TaskValidator.validateTask(task);
            expect(errors).toContain('Task ID is required');
        });

        it('should reject invalid task status', () => {
            const task = {
                id: 'task-123',
                title: 'Test Task',
                description: 'A test task',
                status: 'invalid-status' as EnterpriseTaskStatus,
                priority: TaskPriority.HIGH,
                createdAt: new Date(),
                updatedAt: new Date(),
                version: 1,
                maxRetries: 3,
                retryCount: 0,
                timeoutMs: 30000,
                assignedAgentId: undefined,
                tags: [],
                metadata: {}
            } as EnterpriseTask;

            const errors = TaskValidator.validateTask(task);
            expect(errors).toContain('Invalid task status');
        });
    });

    describe('TaskIdGenerator', () => {
        it('should generate unique IDs', () => {
            const id1 = TaskIdGenerator.generateId();
            const id2 = TaskIdGenerator.generateId();
            const id3 = TaskIdGenerator.generateId();

            expect(id1).not.toBe(id2);
            expect(id2).not.toBe(id3);
            expect(id1).not.toBe(id3);
        });

        it('should generate IDs with correct format', () => {
            const id = TaskIdGenerator.generateId();

            expect(id).toMatch(/^task-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
            expect(id).toStartWith('task-');
        });

        it('should generate IDs that are thread-safe', () => {
            const ids = new Set<string>();
            const promises = Array.from({ length: 100 }, () => Promise.resolve(TaskIdGenerator.generateId()));

            return Promise.all(promises).then(results => {
                results.forEach(id => ids.add(id));
                expect(ids.size).toBe(100); // All IDs should be unique
            });
        });
    });

    describe('TaskResult', () => {
        it('should create successful result', () => {
            const data = { message: 'Task completed' };
            const result = TaskResult.success(data);

            expect(result.success).toBe(true);
            expect(result.data).toEqual(data);
            expect(result.error).toBeUndefined();
        });

        it('should create failed result', () => {
            const error = new TaskError(TaskErrorCode.AGENT_NOT_FOUND, 'No agents available');
            const result = TaskResult.failure(error);

            expect(result.success).toBe(false);
            expect(result.data).toBeUndefined();
            expect(result.error).toBe(error);
        });

        it('should handle success result chaining', () => {
            const result = TaskResult.success('initial');
            expect(result.success).toBe(true);
        });

        it('should handle error result chaining', () => {
            const error = new TaskError(TaskErrorCode.TIMEOUT, 'Operation timed out');
            const result = TaskResult.failure(error);
            expect(result.success).toBe(false);
        });
    });

    describe('Type Guards and Enums', () => {
        it('should validate EnterpriseTaskStatus enum values', () => {
            expect(Object.values(EnterpriseTaskStatus)).toContain('queued');
            expect(Object.values(EnterpriseTaskStatus)).toContain('ready');
            expect(Object.values(EnterpriseTaskStatus)).toContain('assigned');
            expect(Object.values(EnterpriseTaskStatus)).toContain('in-progress');
            expect(Object.values(EnterpriseTaskStatus)).toContain('completed');
            expect(Object.values(EnterpriseTaskStatus)).toContain('failed');
            expect(Object.values(EnterpriseTaskStatus)).toContain('cancelled');
            expect(Object.values(EnterpriseTaskStatus)).toHaveLength(7);
        });

        it('should validate TaskPriority enum values', () => {
            expect(TaskPriority.LOW).toBe(1);
            expect(TaskPriority.MEDIUM).toBe(2);
            expect(TaskPriority.HIGH).toBe(3);
        });

        it('should validate TaskErrorCode enum completeness', () => {
            const errorCodes = Object.values(TaskErrorCode);

            // Validation errors
            expect(errorCodes).toContain('TASK_INVALID_INPUT');
            expect(errorCodes).toContain('TASK_INVALID_CONFIG');

            // Resource errors
            expect(errorCodes).toContain('TASK_QUEUE_FULL');
            expect(errorCodes).toContain('TASK_MEMORY_LIMIT_EXCEEDED');

            // Agent errors
            expect(errorCodes).toContain('TASK_NO_AVAILABLE_AGENTS');
            expect(errorCodes).toContain('TASK_AGENT_COMMUNICATION_FAILED');

            // System errors
            expect(errorCodes).toContain('TASK_SERVICE_UNAVAILABLE');
            expect(errorCodes).toContain('TASK_CIRCUIT_BREAKER_OPEN');

            expect(errorCodes.length).toBeGreaterThanOrEqual(8);
        });
    });

    describe('Interface Compliance', () => {
        it('should create valid TaskResourceUsage object', () => {
            const resourceUsage: TaskResourceUsage = {
                memoryUsageMB: 256,
                memoryUsagePercent: 75,
                cpuUsagePercent: 45,
                heapUsed: 268435456,
                heapTotal: 536870912,
                external: 12345678
            };

            expect(resourceUsage.memoryUsageMB).toBe(256);
            expect(resourceUsage.memoryUsagePercent).toBe(75);
            expect(resourceUsage.cpuUsagePercent).toBe(45);
            expect(typeof resourceUsage.heapUsed).toBe('number');
            expect(typeof resourceUsage.heapTotal).toBe('number');
            expect(typeof resourceUsage.external).toBe('number');
        });

        it('should create valid HealthCheckResult object', () => {
            const healthCheck: HealthCheckResult = {
                healthy: true,
                component: 'task-queue',
                details: { queueSize: 5, processing: 2 },
                responseTimeMs: 15
            };

            expect(healthCheck.healthy).toBe(true);
            expect(healthCheck.component).toBe('task-queue');
            expect(healthCheck.details).toEqual({ queueSize: 5, processing: 2 });
            expect(healthCheck.responseTimeMs).toBe(15);
        });

        it('should create valid TaskMetrics object', () => {
            const metrics: TaskMetrics = {
                throughputPerMinute: 120,
                averageExecutionTimeMs: 2500,
                errorRate: 0.02,
                memoryUsageMB: 180,
                queueSizeHistory: [10, 8, 6, 4, 2]
            };

            expect(metrics.throughputPerMinute).toBe(120);
            expect(metrics.averageExecutionTimeMs).toBe(2500);
            expect(metrics.errorRate).toBe(0.02);
            expect(metrics.memoryUsageMB).toBe(180);
            expect(metrics.queueSizeHistory).toEqual([10, 8, 6, 4, 2]);
        });
    });
});
