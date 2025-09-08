import { test, expect } from '@playwright/test';
import { setupTestEnvironment, generateTestTask } from '../helpers/test-helpers';
import { MessageType } from '../../../orchestration/MessageProtocol';

test.describe('Task Assignment and Completion E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:7778/dashboard');
        await page.waitForLoadState('networkidle');
    });

    test('should assign and complete simple task', async ({ page }) => {
        const env = await setupTestEnvironment(page);
        const task = generateTestTask('simple');

        try {
            const agentId = await env.agent.spawnAgent('fullstack-developer', 'Dev Agent');

            await env.agent.assignTask(agentId, task.description, 'high');

            const progressMsg = await env.ws.waitForMessage(MessageType.TASK_PROGRESS);
            expect(progressMsg.payload.status).toBe('in_progress');
            expect(progressMsg.payload.agentId).toBe(agentId);

            const completeMsg = await env.ws.waitForMessage(MessageType.TASK_COMPLETE, task.timeout);
            expect(completeMsg.payload.success).toBe(true);
            expect(completeMsg.payload.agentId).toBe(agentId);

            const status = await env.agent.getAgentStatus(agentId);
            expect(status.completedTasks).toBe(1);
            expect(status.failedTasks).toBe(0);
        } finally {
            await env.cleanup();
        }
    });

    test('should handle complex multi-step task', async ({ page }) => {
        const env = await setupTestEnvironment(page);
        const task = generateTestTask('complex');

        try {
            const agentId = await env.agent.spawnAgent('backend-specialist', 'Refactor Expert');

            await env.agent.assignTask(agentId, task.description, 'critical');

            const updates = [];
            env.ws.onMessage(MessageType.TASK_PROGRESS, msg => {
                updates.push(msg.payload);
            });

            const completeMsg = await env.ws.waitForMessage(MessageType.TASK_COMPLETE, task.timeout);

            expect(updates.length).toBeGreaterThan(1);
            expect(updates[0].status).toBe('in_progress');
            expect(updates.some(u => u.progress > 0 && u.progress < 100)).toBe(true);

            expect(completeMsg.payload.success).toBe(true);
        } finally {
            await env.cleanup();
        }
    });

    test('should handle task dependencies and ordering', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agentId = await env.agent.spawnAgent('fullstack-developer', 'Dependency Handler');

            await env.ws.sendMessage({
                type: MessageType.CREATE_TASK_CHAIN,
                payload: {
                    tasks: [
                        { id: 'task-1', description: 'Setup database', dependencies: [] },
                        { id: 'task-2', description: 'Create models', dependencies: ['task-1'] },
                        { id: 'task-3', description: 'Create API', dependencies: ['task-2'] },
                        { id: 'task-4', description: 'Create UI', dependencies: ['task-3'] }
                    ],
                    agentId
                }
            });

            const completionOrder = [];
            env.ws.onMessage(MessageType.TASK_COMPLETE, msg => {
                completionOrder.push(msg.payload.taskId);
            });

            await new Promise(resolve => setTimeout(resolve, 15000));

            expect(completionOrder).toEqual(['task-1', 'task-2', 'task-3', 'task-4']);
        } finally {
            await env.cleanup();
        }
    });

    test('should handle task prioritization correctly', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agent1 = await env.agent.spawnAgent('testing-specialist', 'Priority Tester');

            const tasks = [
                { id: 'low-1', priority: 'low', description: 'Low priority task' },
                { id: 'critical-1', priority: 'critical', description: 'Critical task' },
                { id: 'medium-1', priority: 'medium', description: 'Medium priority task' },
                { id: 'high-1', priority: 'high', description: 'High priority task' },
                { id: 'low-2', priority: 'low', description: 'Another low priority' }
            ];

            for (const task of tasks) {
                await env.ws.sendMessage({
                    type: MessageType.QUEUE_TASK,
                    payload: {
                        taskId: task.id,
                        description: task.description,
                        priority: task.priority,
                        agentId: agent1
                    }
                });
            }

            await env.ws.sendMessage({
                type: MessageType.PROCESS_QUEUE,
                payload: { agentId: agent1 }
            });

            const startOrder = [];
            env.ws.onMessage(MessageType.TASK_PROGRESS, msg => {
                if (msg.payload.status === 'in_progress') {
                    startOrder.push(msg.payload.taskId);
                }
            });

            await new Promise(resolve => setTimeout(resolve, 10000));

            expect(startOrder[0]).toBe('critical-1');
            expect(startOrder[1]).toBe('high-1');
            expect(startOrder[2]).toBe('medium-1');
        } finally {
            await env.cleanup();
        }
    });

    test('should handle task cancellation and rollback', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agentId = await env.agent.spawnAgent('backend-specialist', 'Cancellation Handler');

            await env.ws.sendMessage({
                type: MessageType.ASSIGN_TASK,
                payload: {
                    agentId,
                    taskId: 'long-task',
                    task: 'Perform long-running database migration',
                    estimatedDuration: 30000
                }
            });

            await env.ws.waitForMessage(MessageType.TASK_PROGRESS);

            await new Promise(resolve => setTimeout(resolve, 2000));

            await env.ws.sendMessage({
                type: MessageType.CANCEL_TASK,
                payload: {
                    taskId: 'long-task',
                    reason: 'User requested cancellation'
                }
            });

            const cancelledMsg = await env.ws.waitForMessage(MessageType.TASK_CANCELLED);
            expect(cancelledMsg.payload.taskId).toBe('long-task');
            expect(cancelledMsg.payload.rollbackComplete).toBe(true);

            const status = await env.agent.getAgentStatus(agentId);
            expect(status.status).toBe('idle');
            expect(status.cancelledTasks).toBe(1);
        } finally {
            await env.cleanup();
        }
    });

    test('should handle parallel task execution by single agent', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agentId = await env.agent.spawnAgent('fullstack-developer', 'Parallel Worker');

            const parallelTasks = [
                'Read configuration file',
                'Check database connection',
                'Validate environment variables',
                'Load cached data'
            ];

            const taskPromises = parallelTasks.map(task =>
                env.ws.sendMessage({
                    type: MessageType.ASSIGN_TASK,
                    payload: {
                        agentId,
                        task,
                        parallel: true
                    }
                })
            );

            await Promise.all(taskPromises);

            const progressMessages = [];
            env.ws.onMessage(MessageType.TASK_PROGRESS, msg => {
                progressMessages.push({
                    task: msg.payload.task,
                    timestamp: msg.payload.timestamp
                });
            });

            await new Promise(resolve => setTimeout(resolve, 5000));

            const startTimes = progressMessages.map(m => m.timestamp);
            const timeDifference = Math.max(...startTimes) - Math.min(...startTimes);

            expect(timeDifference).toBeLessThan(1000);
        } finally {
            await env.cleanup();
        }
    });

    test('should retry failed tasks with exponential backoff', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agentId = await env.agent.spawnAgent('backend-specialist', 'Retry Handler');

            await env.ws.sendMessage({
                type: MessageType.ASSIGN_TASK,
                payload: {
                    agentId,
                    taskId: 'flaky-task',
                    task: 'Connect to unreliable service',
                    retryConfig: {
                        maxRetries: 3,
                        backoffMultiplier: 2,
                        initialDelay: 1000
                    }
                }
            });

            const retryAttempts = [];
            env.ws.onMessage(MessageType.TASK_RETRY, msg => {
                retryAttempts.push({
                    attempt: msg.payload.attemptNumber,
                    timestamp: msg.payload.timestamp
                });
            });

            await new Promise(resolve => setTimeout(resolve, 10000));

            expect(retryAttempts.length).toBeGreaterThanOrEqual(1);

            if (retryAttempts.length > 1) {
                const delay1 = retryAttempts[1].timestamp - retryAttempts[0].timestamp;
                expect(delay1).toBeGreaterThanOrEqual(1000);

                if (retryAttempts.length > 2) {
                    const delay2 = retryAttempts[2].timestamp - retryAttempts[1].timestamp;
                    expect(delay2).toBeGreaterThanOrEqual(delay1 * 1.5);
                }
            }
        } finally {
            await env.cleanup();
        }
    });

    test('should handle task result persistence and retrieval', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agentId = await env.agent.spawnAgent('database-architect', 'Data Agent');

            const taskData = {
                input: { query: 'SELECT * FROM users' },
                expectedOutput: { rowCount: 42 }
            };

            await env.ws.sendMessage({
                type: MessageType.ASSIGN_TASK,
                payload: {
                    agentId,
                    taskId: 'data-task',
                    task: 'Execute database query',
                    data: taskData
                }
            });

            const completeMsg = await env.ws.waitForMessage(MessageType.TASK_COMPLETE);
            expect(completeMsg.payload.taskId).toBe('data-task');

            await env.ws.sendMessage({
                type: MessageType.GET_TASK_RESULT,
                payload: { taskId: 'data-task' }
            });

            const resultMsg = await env.ws.waitForMessage(MessageType.TASK_RESULT);
            expect(resultMsg.payload.taskId).toBe('data-task');
            expect(resultMsg.payload.result).toBeDefined();
            expect(resultMsg.payload.input).toEqual(taskData.input);
        } finally {
            await env.cleanup();
        }
    });
});
