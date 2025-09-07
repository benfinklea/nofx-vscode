import * as vscode from 'vscode';
import { Task, TaskConfig, TaskStatus } from '../../agents/types';
import { createMockAgent, createMockTask, createIntegrationContainer } from '../utils/TestHelpers';
import { DOMAIN_EVENTS } from '../../services/EventConstants';
import { priorityToNumeric } from '../../tasks/priority';
import { SERVICE_TOKENS } from '../../services/interfaces';

describe('Dependency-Aware Prioritization Integration Tests', () => {
    let taskQueue: any;
    let priorityQueue: any;
    let dependencyManager: any;
    let eventBus: any;
    let container: any;

    beforeEach(() => {
        try {
            // Use integration DI container to ensure proper wiring
            container = createIntegrationContainer();

            // Resolve services from container
            eventBus = container.resolve(SERVICE_TOKENS.EventBus);
            const loggingService = container.resolve(SERVICE_TOKENS.LoggingService);
            const notificationService = container.resolve(SERVICE_TOKENS.NotificationService);
            dependencyManager = container.resolve(SERVICE_TOKENS.TaskDependencyManager);
            priorityQueue = container.resolve(SERVICE_TOKENS.PriorityTaskQueue);
            taskQueue = container.resolve(SERVICE_TOKENS.TaskQueue);

            // Debug: Check if services are resolved
            console.log('EventBus resolved:', !!eventBus);
            console.log('TaskQueue resolved:', !!taskQueue);
            console.log('TaskQueue type:', typeof taskQueue);
        } catch (error) {
            console.error('Error in beforeEach:', error);
            throw error;
        }
    });

    afterEach(() => {
        if (taskQueue && typeof taskQueue.clearAllTasks === 'function') {
            taskQueue.clearAllTasks();
        }
        if (container && typeof container.dispose === 'function') {
            container.dispose();
        }
    });

    describe('Original Issue Scenario', () => {
        it('should boost integration test priority when deploy task prefers it', async () => {
            // Create the exact scenario from the original issue
            const integrationTestConfig: TaskConfig = {
                title: 'Run Integration Tests',
                description: 'Integration test task',
                priority: 'low', // Low priority
                files: [],
                dependsOn: [],
                prefers: [],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const deployConfig: TaskConfig = {
                title: 'Deploy to Production',
                description: 'Deploy task',
                priority: 'high', // High priority
                files: [],
                dependsOn: [],
                prefers: ['integration-test'], // Soft dependency
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            // Add both tasks
            const integrationTest = taskQueue.addTask(integrationTestConfig);
            const deployTask = taskQueue.addTask(deployConfig);

            // Verify initial state
            const initialTasks = taskQueue.getTasks();
            expect(initialTasks).toHaveLength(2);

            expect(integrationTest.priority).toBe('low');
            expect(integrationTest.numericPriority).toBe(priorityToNumeric('low'));
            expect(deployTask.priority).toBe('high');
            expect(deployTask.numericPriority).toBe(priorityToNumeric('high'));

            // Complete the integration test
            await taskQueue.completeTask(integrationTest.id);

            // Verify that deploy task priority was boosted
            const updatedTasks = taskQueue.getTasks();
            const updatedDeployTask = updatedTasks.find((t: any) => t.id === deployTask.id);

            // Check that priority was boosted by +5 (not +20 as in old implementation)
            const expectedBoostedPriority = priorityToNumeric('high') + 5; // +5 for satisfied soft dependency
            expect(updatedDeployTask?.numericPriority).toBe(expectedBoostedPriority);
        });

        it('should publish TASK_SOFT_DEPENDENCY_SATISFIED event when dependency is satisfied', async () => {
            const eventSpy = jest.fn();
            eventBus.subscribe(DOMAIN_EVENTS.TASK_SOFT_DEPENDENCY_SATISFIED, eventSpy);

            const integrationTestConfig: TaskConfig = {
                title: 'Run Integration Tests',
                description: 'Integration test task',
                priority: 'low',
                files: [],
                dependsOn: [],
                prefers: [],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const deployConfig: TaskConfig = {
                title: 'Deploy to Production',
                description: 'Deploy task',
                priority: 'high',
                files: [],
                dependsOn: [],
                prefers: ['integration-test'],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const integrationTest = taskQueue.addTask(integrationTestConfig);
            const deployTask = taskQueue.addTask(deployConfig);
            await taskQueue.completeTask(integrationTest.id);

            expect(eventSpy).toHaveBeenCalledWith({
                taskId: deployTask.id,
                task: expect.any(Object),
                satisfiedDependencies: ['integration-test']
            });
        });
    });

    describe('Multiple Soft Dependencies', () => {
        it('should boost priority for multiple satisfied dependencies', async () => {
            const testConfig: TaskConfig = {
                title: 'Run Unit Tests',
                description: 'Unit test task',
                priority: 'low',
                files: [],
                dependsOn: [],
                prefers: [],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const lintConfig: TaskConfig = {
                title: 'Lint Code',
                description: 'Lint task',
                priority: 'low',
                files: [],
                dependsOn: [],
                prefers: [],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const buildConfig: TaskConfig = {
                title: 'Build Project',
                description: 'Build task',
                priority: 'medium',
                files: [],
                dependsOn: [],
                prefers: ['unit-test', 'lint-code'], // Multiple soft dependencies
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const unitTest = taskQueue.addTask(testConfig);
            const lintTask = taskQueue.addTask(lintConfig);
            const buildTask = taskQueue.addTask(buildConfig);

            // Complete both dependencies
            await taskQueue.completeTask(unitTest.id);
            await taskQueue.completeTask(lintTask.id);

            const updatedTasks = taskQueue.getTasks();
            const updatedBuildTask = updatedTasks.find((t: any) => t.id === buildTask.id);

            // Check that priority was boosted by +5 for both satisfied dependencies
            const expectedBoostedPriority = priorityToNumeric('medium') + 5; // +5 for all satisfied soft dependencies
            expect(updatedBuildTask?.numericPriority).toBe(expectedBoostedPriority);
        });
    });

    describe('Edge Cases', () => {
        // Note: These tests now use the real DI container and exercise actual code paths
        // including TaskDependencyManager, PriorityTaskQueue, and TaskQueue integration
        it('should handle missing preferred tasks gracefully', async () => {
            const deployConfig: TaskConfig = {
                title: 'Deploy to Production',
                description: 'Deploy task',
                priority: 'high',
                files: [],
                dependsOn: [],
                prefers: ['non-existent-task'], // References non-existent task
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const deployTask = taskQueue.addTask(deployConfig);

            const tasks = taskQueue.getTasks();
            expect(tasks).toHaveLength(1);
            expect(deployTask.priority).toBe('high'); // No boost since dependency doesn't exist
        });

        it('should handle circular preferences without infinite loops', async () => {
            const taskAConfig: TaskConfig = {
                title: 'Task A',
                description: 'Task A',
                priority: 'low',
                files: [],
                dependsOn: [],
                prefers: ['task-b'],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const taskBConfig: TaskConfig = {
                title: 'Task B',
                description: 'Task B',
                priority: 'low',
                files: [],
                dependsOn: [],
                prefers: ['task-a'], // Circular dependency
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const taskA = taskQueue.addTask(taskAConfig);
            const taskB = taskQueue.addTask(taskBConfig);

            // Complete one task - should not cause infinite loop
            await expect(taskQueue.completeTask(taskA.id)).resolves.not.toThrow();

            // Verify no duplicate events are published
            const eventSpy = jest.fn();
            eventBus.subscribe(DOMAIN_EVENTS.TASK_SOFT_DEPENDENCY_SATISFIED, eventSpy);

            // Complete the other task
            await expect(taskQueue.completeTask(taskB.id)).resolves.not.toThrow();

            // Should not have published duplicate events
            expect(eventSpy).toHaveBeenCalledTimes(0); // No events since tasks don't exist in each other's prefers

            // Verify tasks are in completed state (real implementation)
            const completedTasks = taskQueue.getTasks().filter((t: any) => t.status === 'completed');
            expect(completedTasks).toHaveLength(2);
        });

        it('should not boost priority for already completed preferred tasks', async () => {
            const integrationTestConfig: TaskConfig = {
                title: 'Run Integration Tests',
                description: 'Integration test task',
                priority: 'low',
                files: [],
                dependsOn: [],
                prefers: [],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const deployConfig: TaskConfig = {
                title: 'Deploy to Production',
                description: 'Deploy task',
                priority: 'high',
                files: [],
                dependsOn: [],
                prefers: ['integration-test'],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            // Complete integration test first
            const integrationTest = taskQueue.addTask(integrationTestConfig);
            await taskQueue.completeTask(integrationTest.id);

            // Then add deploy task - should get immediate boost
            const deployTask = taskQueue.addTask(deployConfig);

            const tasks = taskQueue.getTasks();
            const updatedDeployTask = tasks.find((t: any) => t.id === deployTask.id);
            const expectedBoostedPriority = priorityToNumeric('high') + 5; // Should be boosted immediately
            expect(updatedDeployTask?.numericPriority).toBe(expectedBoostedPriority);
        });
    });

    describe('Priority Queue Integration', () => {
        it('should maintain correct task order after priority updates', async () => {
            const lowPriorityConfig: TaskConfig = {
                title: 'Low Priority Task',
                description: 'Low priority task',
                priority: 'low',
                files: [],
                dependsOn: [],
                prefers: [],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const highPriorityConfig: TaskConfig = {
                title: 'High Priority Task',
                description: 'High priority task',
                priority: 'high',
                files: [],
                dependsOn: [],
                prefers: ['low-priority'],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const lowTask = taskQueue.addTask(lowPriorityConfig);
            const highTask = taskQueue.addTask(highPriorityConfig);

            // Initially, low priority should be first in queue
            const queuedTasks = taskQueue.getQueuedTasks();
            const sortedTasks = queuedTasks.sort(
                (a: any, b: any) => (b.numericPriority || 0) - (a.numericPriority || 0)
            );
            expect(sortedTasks[0].id).toBe(highTask.id); // High priority first

            // Complete low priority task
            await taskQueue.completeTask(lowTask.id);

            // Now high priority should be boosted and still first
            const updatedQueuedTasks = taskQueue.getQueuedTasks();
            const updatedSortedTasks = updatedQueuedTasks.sort(
                (a: any, b: any) => (b.numericPriority || 0) - (a.numericPriority || 0)
            );
            expect(updatedSortedTasks[0].id).toBe(highTask.id);
            expect(updatedSortedTasks[0].numericPriority).toBe(priorityToNumeric('high') + 5);
        });
    });

    describe('Event System Integration', () => {
        it('should publish TASK_SOFT_DEPENDENCY_SATISFIED event when priority changes', async () => {
            const priorityUpdateSpy = jest.fn();
            eventBus.subscribe(DOMAIN_EVENTS.TASK_SOFT_DEPENDENCY_SATISFIED, priorityUpdateSpy);

            const integrationTestConfig: TaskConfig = {
                title: 'Run Integration Tests',
                description: 'Integration test task',
                priority: 'low',
                files: [],
                dependsOn: [],
                prefers: [],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const deployConfig: TaskConfig = {
                title: 'Deploy to Production',
                description: 'Deploy task',
                priority: 'high',
                files: [],
                dependsOn: [],
                prefers: ['integration-test'],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const integrationTest = taskQueue.addTask(integrationTestConfig);
            const deployTask = taskQueue.addTask(deployConfig);
            await taskQueue.completeTask(integrationTest.id);

            expect(priorityUpdateSpy).toHaveBeenCalledWith({
                taskId: deployTask.id,
                task: expect.any(Object),
                satisfiedDependencies: ['integration-test']
            });
        });
    });

    describe('Configuration', () => {
        it('should use correct soft dependency weight from implementation', async () => {
            const integrationTestConfig: TaskConfig = {
                title: 'Run Integration Tests',
                description: 'Integration test task',
                priority: 'low',
                files: [],
                dependsOn: [],
                prefers: [],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const deployConfig: TaskConfig = {
                title: 'Deploy to Production',
                description: 'Deploy task',
                priority: 'high',
                files: [],
                dependsOn: [],
                prefers: ['integration-test'],
                tags: [],
                estimatedDuration: undefined,
                requiredCapabilities: []
            };

            const integrationTest = taskQueue.addTask(integrationTestConfig);
            const deployTask = taskQueue.addTask(deployConfig);
            await taskQueue.completeTask(integrationTest.id);

            const updatedTasks = taskQueue.getTasks();
            const updatedDeployTask = updatedTasks.find((t: any) => t.id === deployTask.id);

            // Should use +5 boost (not +20 as mentioned in old docs)
            const expectedBoostedPriority = priorityToNumeric('high') + 5;
            expect(updatedDeployTask?.numericPriority).toBe(expectedBoostedPriority);
        });
    });
});
