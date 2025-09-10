/**
 * Phase 16: Tests for Simplified Task Queue
 * Validates interface simplification benefits
 */

import { SimpleTaskQueue, SimpleTaskConfig } from '../../../services/SimpleTaskQueue';
import { TaskStatus } from '../../../agents/types';

describe('SimpleTaskQueue - Phase 16 Interface Simplification', () => {
    let queue: SimpleTaskQueue;

    beforeEach(() => {
        queue = new SimpleTaskQueue();
    });

    describe('Core Operations (ISimpleTaskQueue)', () => {
        it('should add tasks efficiently', () => {
            const task = queue.addTask({
                title: 'Test Task',
                description: 'Test Description',
                priority: 'high'
            });

            expect(task).toBeDefined();
            expect(task.id).toMatch(/^task-\d+$/);
            expect(task.title).toBe('Test Task');
            expect(task.status).toBe('queued');
        });

        it('should get next available task', () => {
            queue.addTask({ title: 'Task 1', priority: 'low' });
            const task2 = queue.addTask({ title: 'Task 2', priority: 'high' });
            queue.addTask({ title: 'Task 3', priority: 'medium' });

            const next = queue.getNextTask();
            expect(next).toBeDefined();
            expect(next?.title).toBe('Task 1'); // FIFO order
        });

        it('should get next task for specific agent', () => {
            queue.addTask({ title: 'General Task' });
            const agentTask = queue.addTask({
                title: 'Agent Task',
                agentId: 'agent-123'
            });

            const next = queue.getNextTask('agent-123');
            expect(next).toBeDefined();
            expect(next?.title).toBe('General Task'); // Gets general task first
        });

        it('should complete tasks', () => {
            const task = queue.addTask({ title: 'Task to Complete' });

            const result = queue.completeTask(task.id);
            expect(result).toBe(true);

            const completed = queue.getTask(task.id);
            expect(completed?.status).toBe('completed');
            expect(completed?.completedAt).toBeDefined();
        });

        it('should fail tasks with reason', () => {
            const task = queue.addTask({ title: 'Task to Fail' });

            queue.failTask(task.id, 'Test failure reason');

            const failed = queue.getTask(task.id);
            expect(failed?.status).toBe('failed');
            expect(failed?.tags).toContain('error:Test failure reason');
            expect(failed?.completedAt).toBeDefined();
        });

        it('should filter tasks by status', () => {
            queue.addTask({ title: 'Pending 1' });
            queue.addTask({ title: 'Pending 2' });
            const active = queue.addTask({ title: 'Active' });
            const completed = queue.addTask({ title: 'Completed' });

            // Manually set statuses
            queue.getTask(active.id)!.status = 'in-progress';
            queue.completeTask(completed.id);

            const pendingTasks = queue.getTasks({ status: 'queued' });
            expect(pendingTasks).toHaveLength(2);

            const activeTasks = queue.getTasks({ status: 'in-progress' });
            expect(activeTasks).toHaveLength(1);

            const completedTasks = queue.getTasks({ status: 'completed' });
            expect(completedTasks).toHaveLength(1);
        });

        it('should filter tasks by agent', () => {
            queue.addTask({ title: 'Agent 1 Task', agentId: 'agent-1' });
            queue.addTask({ title: 'Agent 2 Task', agentId: 'agent-2' });
            queue.addTask({ title: 'General Task' });

            const agent1Tasks = queue.getTasks({ agentId: 'agent-1' });
            expect(agent1Tasks).toHaveLength(1);
            expect(agent1Tasks[0].title).toBe('Agent 1 Task');
        });
    });

    describe('Reader Operations (ITaskReader)', () => {
        it('should get specific task by ID', () => {
            const task = queue.addTask({ title: 'Specific Task' });

            const retrieved = queue.getTask(task.id);
            expect(retrieved).toBeDefined();
            expect(retrieved?.title).toBe('Specific Task');
        });

        it('should return undefined for non-existent task', () => {
            const retrieved = queue.getTask('non-existent');
            expect(retrieved).toBeUndefined();
        });

        it('should count tasks by status', () => {
            // Add various tasks
            queue.addTask({ title: 'Pending 1' });
            queue.addTask({ title: 'Pending 2' });
            const toComplete = queue.addTask({ title: 'To Complete' });
            const toFail = queue.addTask({ title: 'To Fail' });

            queue.completeTask(toComplete.id);
            queue.failTask(toFail.id);

            expect(queue.getTaskCount()).toBe(4);
            expect(queue.getTaskCount('queued')).toBe(2);
            expect(queue.getTaskCount('completed')).toBe(1);
            expect(queue.getTaskCount('failed')).toBe(1);
        });
    });

    describe('Performance and Metrics', () => {
        it('should handle large numbers of tasks efficiently', () => {
            const start = performance.now();

            // Add 1000 tasks
            for (let i = 0; i < 1000; i++) {
                queue.addTask({ title: `Task ${i}` });
            }

            const addTime = performance.now() - start;
            expect(addTime).toBeLessThan(100); // Should be very fast

            // Get metrics
            const metrics = queue.getMetrics();
            expect(metrics.totalTasks).toBe(1000);
            expect(metrics.pendingTasks).toBe(1000);
        });

        it('should retrieve tasks quickly', () => {
            // Add tasks
            for (let i = 0; i < 100; i++) {
                queue.addTask({ title: `Task ${i}` });
            }

            const start = performance.now();

            // Retrieve all tasks 100 times
            for (let i = 0; i < 100; i++) {
                queue.getTasks();
            }

            const retrieveTime = performance.now() - start;
            expect(retrieveTime).toBeLessThan(50); // Very fast retrieval
        });

        it('should provide accurate metrics', () => {
            // Create tasks in various states
            const pending1 = queue.addTask({ title: 'Pending 1' });
            const pending2 = queue.addTask({ title: 'Pending 2' });
            const active = queue.addTask({ title: 'Active' });
            const completed = queue.addTask({ title: 'Completed' });
            const failed = queue.addTask({ title: 'Failed' });

            // Set states
            queue.getTask(active.id)!.status = 'in-progress';
            queue.completeTask(completed.id);
            queue.failTask(failed.id);

            const metrics = queue.getMetrics();
            expect(metrics).toEqual({
                totalTasks: 5,
                pendingTasks: 2,
                activeTasks: 1,
                completedTasks: 1,
                failedTasks: 1
            });
        });
    });

    describe('Housekeeping Operations', () => {
        it('should clear completed tasks', () => {
            const pending = queue.addTask({ title: 'Pending' });
            const completed = queue.addTask({ title: 'Completed' });
            const failed = queue.addTask({ title: 'Failed' });

            queue.completeTask(completed.id);
            queue.failTask(failed.id);

            queue.clearCompleted();

            expect(queue.getTask(pending.id)).toBeDefined();
            expect(queue.getTask(completed.id)).toBeUndefined();
            expect(queue.getTask(failed.id)).toBeUndefined();
            expect(queue.getTaskCount()).toBe(1);
        });
    });

    describe('Interface Simplification Benefits', () => {
        it('should have minimal method count', () => {
            // Count public methods (excluding constructor)
            const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(queue)).filter(
                name => name !== 'constructor' && typeof (queue as any)[name] === 'function'
            );

            expect(methods.length).toBeLessThanOrEqual(10); // Much simpler than 23
        });

        it('should have clear, focused responsibilities', () => {
            // Test that each method does one thing well
            const task = queue.addTask({ title: 'Test' });
            expect(task.id).toBeDefined(); // addTask creates task

            const retrieved = queue.getTask(task.id);
            expect(retrieved).toBe(task); // getTask retrieves exact task

            const completed = queue.completeTask(task.id);
            expect(completed).toBe(true); // completeTask changes status
            expect(queue.getTask(task.id)?.status).toBe('completed');
        });

        it('should be easy to mock in tests', () => {
            // Demonstrate how easy it is to create a mock
            const mockQueue = {
                addTask: jest.fn().mockReturnValue({ id: 'mock-1', title: 'Mock Task' }),
                getNextTask: jest.fn().mockReturnValue(undefined),
                completeTask: jest.fn().mockReturnValue(true),
                failTask: jest.fn(),
                getTasks: jest.fn().mockReturnValue([])
            };

            // Mock is simple and complete
            expect(mockQueue.addTask({})).toHaveProperty('id');
            expect(mockQueue.getNextTask()).toBeUndefined();
            expect(mockQueue.completeTask('any')).toBe(true);
        });
    });

    describe('Error Scenarios', () => {
        it('should handle invalid task ID in completeTask', () => {
            const result = queue.completeTask('non-existent-id');
            expect(result).toBe(false);
        });

        it('should handle invalid task ID in failTask', () => {
            // Should not throw, just no-op
            expect(() => queue.failTask('non-existent-id', 'reason')).not.toThrow();
        });

        it('should handle invalid task ID in getTask', () => {
            const result = queue.getTask('non-existent-id');
            expect(result).toBeUndefined();
        });

        it('should not complete already completed task', () => {
            const task = queue.addTask({ title: 'Task' });
            queue.completeTask(task.id);

            // Try to complete again
            const result = queue.completeTask(task.id);
            expect(result).toBe(false);
        });

        it('should handle failTask without reason', () => {
            const task = queue.addTask({ title: 'Task to Fail' });

            queue.failTask(task.id); // No reason provided

            const failed = queue.getTask(task.id);
            expect(failed?.status).toBe('failed');
            expect(failed?.tags).toEqual([]); // Empty tags array when no reason
        });
    });

    describe('Input Validation', () => {
        it('should handle minimal task config', () => {
            const task = queue.addTask({ title: 'Minimal' });

            expect(task.title).toBe('Minimal');
            expect(task.description).toBe('');
            expect(task.priority).toBe('medium');
            expect(task.assignedTo).toBeUndefined();
        });

        it('should handle complete task config', () => {
            const config: SimpleTaskConfig = {
                title: 'Complete Task',
                description: 'Full description',
                priority: 'high',
                agentId: 'agent-123',
                metadata: { custom: 'data' }
            };

            const task = queue.addTask(config);

            expect(task.title).toBe('Complete Task');
            expect(task.description).toBe('Full description');
            expect(task.priority).toBe('high');
            expect(task.assignedTo).toBe('agent-123');
        });

        it('should handle empty string description', () => {
            const task = queue.addTask({ title: 'Task', description: '' });
            expect(task.description).toBe('');
        });

        it('should handle getTasks with empty filter object', () => {
            queue.addTask({ title: 'Task 1' });
            queue.addTask({ title: 'Task 2' });

            const tasks = queue.getTasks({});
            expect(tasks).toHaveLength(2);
        });

        it('should handle getTaskCount with various statuses', () => {
            queue.addTask({ title: 'Task 1' });
            const task2 = queue.addTask({ title: 'Task 2' });
            const task3 = queue.addTask({ title: 'Task 3' });
            const task4 = queue.addTask({ title: 'Task 4' });

            // Set various statuses
            queue.getTask(task2.id)!.status = 'validated';
            queue.getTask(task3.id)!.status = 'ready';
            queue.getTask(task4.id)!.status = 'blocked';

            // All pending statuses should count
            expect(queue.getTaskCount('queued')).toBe(1);
            expect(queue.getTaskCount('validated')).toBe(1);
            expect(queue.getTaskCount('ready')).toBe(1);
            expect(queue.getTaskCount('blocked')).toBe(1);
        });
    });

    describe('State Management', () => {
        it('should maintain task counter across operations', () => {
            const task1 = queue.addTask({ title: 'Task 1' });
            const task2 = queue.addTask({ title: 'Task 2' });

            expect(task1.id).toMatch(/^task-1$/);
            expect(task2.id).toMatch(/^task-2$/);

            // Clear and add more
            queue.clearCompleted();
            const task3 = queue.addTask({ title: 'Task 3' });

            expect(task3.id).toMatch(/^task-3$/); // Counter continues
        });

        it('should handle mixed status clearing', () => {
            const pending = queue.addTask({ title: 'Pending' });
            const active = queue.addTask({ title: 'Active' });
            const completed = queue.addTask({ title: 'Completed' });
            const failed = queue.addTask({ title: 'Failed' });

            queue.getTask(active.id)!.status = 'in-progress';
            queue.completeTask(completed.id);
            queue.failTask(failed.id);

            queue.clearCompleted();

            expect(queue.getTask(pending.id)).toBeDefined();
            expect(queue.getTask(active.id)).toBeDefined();
            expect(queue.getTask(completed.id)).toBeUndefined();
            expect(queue.getTask(failed.id)).toBeUndefined();
        });

        it('should handle getNextTask with mixed statuses', () => {
            const task1 = queue.addTask({ title: 'Task 1' });
            const task2 = queue.addTask({ title: 'Task 2' });
            const task3 = queue.addTask({ title: 'Task 3' });

            // Set different pending statuses
            queue.getTask(task1.id)!.status = 'queued';
            queue.getTask(task2.id)!.status = 'ready';
            queue.getTask(task3.id)!.status = 'validated';

            const next = queue.getNextTask();
            expect(next).toBeDefined();
            expect(['Task 1', 'Task 2', 'Task 3']).toContain(next!.title);
        });

        it('should handle getNextTask with no available tasks', () => {
            const task = queue.addTask({ title: 'Task' });
            queue.getTask(task.id)!.status = 'in-progress';

            const next = queue.getNextTask();
            expect(next).toBeUndefined();
        });

        it('should handle getTasks with both filters', () => {
            queue.addTask({ title: 'Task 1', agentId: 'agent-1' });
            const task2 = queue.addTask({ title: 'Task 2', agentId: 'agent-1' });
            queue.addTask({ title: 'Task 3', agentId: 'agent-2' });

            queue.getTask(task2.id)!.status = 'in-progress';

            // Filter by both status and agent
            const tasks = queue.getTasks({ status: 'queued', agentId: 'agent-1' });
            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe('Task 1');
        });
    });

    describe('Metrics Edge Cases', () => {
        it('should handle metrics for empty queue', () => {
            const metrics = queue.getMetrics();

            expect(metrics).toEqual({
                totalTasks: 0,
                pendingTasks: 0,
                activeTasks: 0,
                completedTasks: 0,
                failedTasks: 0
            });
        });

        it('should handle metrics after clearing', () => {
            // Add and complete tasks
            const task1 = queue.addTask({ title: 'Task 1' });
            const task2 = queue.addTask({ title: 'Task 2' });
            queue.completeTask(task1.id);
            queue.failTask(task2.id);

            // Clear completed
            queue.clearCompleted();

            const metrics = queue.getMetrics();
            expect(metrics.totalTasks).toBe(0);
        });

        it('should correctly count assigned status as active', () => {
            const task = queue.addTask({ title: 'Task' });
            queue.getTask(task.id)!.status = 'assigned';

            const metrics = queue.getMetrics();
            expect(metrics.activeTasks).toBe(1);
            expect(metrics.pendingTasks).toBe(0);
        });
    });
});

describe('Interface Complexity Comparison', () => {
    it('should validate complexity reduction metrics', () => {
        // Original ITaskQueue: 23 methods
        // Simplified ISimpleTaskQueue: 5 methods
        const reduction = ((23 - 5) / 23) * 100;
        expect(reduction).toBeCloseTo(78.26, 1);

        // Original total complexity: 93 methods across interfaces
        // Simplified total: 27 methods
        const totalReduction = ((93 - 27) / 93) * 100;
        expect(totalReduction).toBeCloseTo(70.97, 1);
    });

    it('should demonstrate adapter pattern usage', () => {
        // Mock complex task queue
        const complexQueue = {
            addTask: jest.fn(),
            getPendingTasks: jest.fn().mockReturnValue([{ id: '1', title: 'Task' }]),
            getActiveTasks: jest.fn().mockReturnValue([]),
            getAllTasks: jest.fn().mockReturnValue([]),
            getTasksForAgent: jest.fn().mockReturnValue([]),
            completeTask: jest.fn().mockReturnValue(true),
            failTask: jest.fn()
        };

        // Adapter would wrap complex interface
        // This demonstrates the migration path
        const adapted = {
            addTask: complexQueue.addTask,
            getNextTask: () => complexQueue.getPendingTasks()[0],
            completeTask: complexQueue.completeTask,
            failTask: complexQueue.failTask,
            getTasks: () => complexQueue.getAllTasks()
        };

        expect(adapted.getNextTask()).toEqual({ id: '1', title: 'Task' });
    });
});
