import { TaskDependencyManager } from '../../../tasks/TaskDependencyManager';
import { ILoggingService, IEventBus, INotificationService } from '../../../services/interfaces';
import { Task } from '../../../agents/types';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';
import {
    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockContainer,
    createMockExtensionContext,
    createMockOutputChannel,
    createMockTerminal,
    setupVSCodeMocks
} from './../../helpers/mockFactories';

describe('TaskDependencyManager', () => {
    let manager: TaskDependencyManager;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockNotificationService: jest.Mocked<INotificationService>;

    const createMockTask = (id: string, status: string = 'pending', dependencies: string[] = []): Task => ({
        id,
        title: `Task ${id}`,
        description: `Description for task ${id}`,
        priority: 'medium',
        status: status as any,
        files: [],
        tags: [],
        dependsOn: dependencies,
        requiredCapabilities: [],
        createdAt: new Date(),
        updatedAt: new Date()
    });

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        jest.clearAllMocks();

        // Mock services
        mockLoggingService = createMockLoggingService();

        mockNotificationService = createMockNotificationService();

        manager = new TaskDependencyManager(mockLoggingService, mockEventBus, mockNotificationService);
    });

    describe('addDependency', () => {
        it('should add a dependency between two tasks', () => {
            const result = manager.addDependency('task-1', 'task-2');

            expect(result).toBe(true);
            expect(mockLoggingService.info).toHaveBeenCalledWith('Added dependency: task-1 -> task-2');
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.TASK_DEPENDENCY_ADDED, {
                taskId: 'task-1',
                dependsOnTaskId: 'task-2'
            });
        });

        it('should prevent self-dependencies', () => {
            const result = manager.addDependency('task-1', 'task-1');

            expect(result).toBe(false);
            expect(mockLoggingService.warn).toHaveBeenCalledWith('Cannot add self-dependency for task task-1');
            expect(mockEventBus.publish).not.toHaveBeenCalled();
        });

        it('should handle duplicate dependencies gracefully', () => {
            manager.addDependency('task-1', 'task-2');
            const result = manager.addDependency('task-1', 'task-2');

            expect(result).toBe(true);
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Dependency already exists: task-1 -> task-2');
        });

        it('should prevent circular dependencies', () => {
            manager.addDependency('task-1', 'task-2');
            manager.addDependency('task-2', 'task-3');
            const result = manager.addDependency('task-3', 'task-1');

            expect(result).toBe(false);
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                'Dependency task-3 -> task-1 creates cycle, not added'
            );
        });
    });

    describe('removeDependency', () => {
        it('should remove an existing dependency', () => {
            manager.addDependency('task-1', 'task-2');
            manager.removeDependency('task-1', 'task-2');

            expect(mockLoggingService.info).toHaveBeenCalledWith('Removed dependency: task-1 -> task-2');
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED, {
                taskId: 'task-1',
                dependsOnTaskId: 'task-2'
            });
        });

        it('should handle removing non-existent dependency gracefully', () => {
            manager.removeDependency('task-1', 'task-2');

            expect(mockLoggingService.info).not.toHaveBeenCalled();
            expect(mockEventBus.publish).not.toHaveBeenCalledWith(
                DOMAIN_EVENTS.TASK_DEPENDENCY_REMOVED,
                expect.any(Object)
            );
        });
    });

    describe('validateDependencies', () => {
        it('should validate task dependencies successfully', () => {
            const task1 = createMockTask('task-1', 'pending', ['task-2']);
            const task2 = createMockTask('task-2', 'pending');
            const tasks = [task1, task2];

            const errors = manager.validateDependencies(task1, tasks);

            expect(errors).toEqual([]);
        });

        it('should detect missing dependencies', () => {
            const task1 = createMockTask('task-1', 'pending', ['task-3']);
            const task2 = createMockTask('task-2', 'pending');
            const tasks = [task1, task2];

            const errors = manager.validateDependencies(task1, tasks);

            expect(errors).toContainEqual({
                field: 'dependsOn',
                message: 'Referenced task task-3 does not exist',
                code: 'MISSING_DEPENDENCY'
            });
        });

        it('should detect circular dependencies', () => {
            const task1 = createMockTask('task-1', 'pending', ['task-2']);
            const task2 = createMockTask('task-2', 'pending', ['task-1']);
            const tasks = [task1, task2];

            // Build the graph first
            manager.addDependency('task-1', 'task-2');
            manager.addDependency('task-2', 'task-1');

            const errors = manager.validateDependencies(task1, tasks);

            expect(errors).toContainEqual({
                field: 'dependsOn',
                message: 'Task task-1 is part of a circular dependency',
                code: 'CIRCULAR_DEPENDENCY'
            });
        });
    });

    describe('getReadyTasks', () => {
        it('should return tasks with no dependencies', () => {
            const task1 = createMockTask('task-1', 'pending');
            const task2 = createMockTask('task-2', 'pending');
            const tasks = [task1, task2];

            const readyTasks = manager.getReadyTasks(tasks);

            expect(readyTasks).toContain(task1);
            expect(readyTasks).toContain(task2);
        });

        it('should return tasks with completed dependencies', () => {
            const task1 = createMockTask('task-1', 'completed');
            const task2 = createMockTask('task-2', 'pending', ['task-1']);
            const tasks = [task1, task2];

            const readyTasks = manager.getReadyTasks(tasks);

            expect(readyTasks).toContain(task2);
            expect(readyTasks).not.toContain(task1); // Completed tasks are not "ready"
        });

        it('should not return tasks with incomplete dependencies', () => {
            const task1 = createMockTask('task-1', 'pending');
            const task2 = createMockTask('task-2', 'pending', ['task-1']);
            const tasks = [task1, task2];

            const readyTasks = manager.getReadyTasks(tasks);

            expect(readyTasks).toContain(task1);
            expect(readyTasks).not.toContain(task2);
        });

        it('should publish event when blocked task becomes ready', () => {
            const task1 = createMockTask('task-1', 'completed');
            const task2 = createMockTask('task-2', 'blocked', ['task-1']);
            const tasks = [task1, task2];

            manager.getReadyTasks(tasks);

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                DOMAIN_EVENTS.TASK_DEPENDENCY_RESOLVED,
                expect.objectContaining({
                    taskId: 'task-2',
                    resolvedDependencies: ['task-1']
                })
            );
        });
    });

    describe('detectCycles', () => {
        it('should detect simple cycles', () => {
            const task1 = createMockTask('task-1', 'pending', ['task-2']);
            const task2 = createMockTask('task-2', 'pending', ['task-1']);
            const tasks = [task1, task2];

            const cycles = manager.detectCycles(tasks);

            expect(cycles).toHaveLength(1);
            expect(cycles[0]).toContain('task-1');
            expect(cycles[0]).toContain('task-2');
        });

        it('should detect complex cycles', () => {
            const task1 = createMockTask('task-1', 'pending', ['task-2']);
            const task2 = createMockTask('task-2', 'pending', ['task-3']);
            const task3 = createMockTask('task-3', 'pending', ['task-1']);
            const tasks = [task1, task2, task3];

            const cycles = manager.detectCycles(tasks);

            expect(cycles).toHaveLength(1);
            expect(cycles[0]).toContain('task-1');
            expect(cycles[0]).toContain('task-2');
            expect(cycles[0]).toContain('task-3');
        });

        it('should return empty array when no cycles exist', () => {
            const task1 = createMockTask('task-1', 'pending', ['task-2']);
            const task2 = createMockTask('task-2', 'pending', ['task-3']);
            const task3 = createMockTask('task-3', 'pending');
            const tasks = [task1, task2, task3];

            const cycles = manager.detectCycles(tasks);

            expect(cycles).toEqual([]);
        });
    });

    describe('getTopologicalSort', () => {
        it('should sort tasks in dependency order', () => {
            const task1 = createMockTask('task-1', 'pending', ['task-2']);
            const task2 = createMockTask('task-2', 'pending', ['task-3']);
            const task3 = createMockTask('task-3', 'pending');
            const tasks = [task1, task2, task3];

            const sorted = manager.getTopologicalSort(tasks);

            // task-3 should come before task-2, and task-2 before task-1
            const index1 = sorted.indexOf('task-1');
            const index2 = sorted.indexOf('task-2');
            const index3 = sorted.indexOf('task-3');

            expect(index3).toBeLessThan(index2);
            expect(index2).toBeLessThan(index1);
        });

        it('should handle independent tasks', () => {
            const task1 = createMockTask('task-1', 'pending');
            const task2 = createMockTask('task-2', 'pending');
            const task3 = createMockTask('task-3', 'pending');
            const tasks = [task1, task2, task3];

            const sorted = manager.getTopologicalSort(tasks);

            expect(sorted).toHaveLength(3);
            expect(sorted).toContain('task-1');
            expect(sorted).toContain('task-2');
            expect(sorted).toContain('task-3');
        });

        it('should return empty array for cyclic dependencies', () => {
            const task1 = createMockTask('task-1', 'pending', ['task-2']);
            const task2 = createMockTask('task-2', 'pending', ['task-1']);
            const tasks = [task1, task2];

            const sorted = manager.getTopologicalSort(tasks);

            expect(sorted).toEqual([]);
        });
    });

    describe('checkConflicts', () => {
        it('should detect file conflicts between tasks', () => {
            const task1 = createMockTask('task-1', 'in-progress');
            task1.files = ['file1.ts', 'file2.ts'];

            const task2 = createMockTask('task-2', 'pending');
            task2.files = ['file2.ts', 'file3.ts'];

            const activeTasks = [task1];
            const conflicts = manager.checkConflicts(task2, activeTasks);

            expect(conflicts).toContain('task-1');
        });

        it('should not report conflicts for non-overlapping files', () => {
            const task1 = createMockTask('task-1', 'in-progress');
            task1.files = ['file1.ts', 'file2.ts'];

            const task2 = createMockTask('task-2', 'pending');
            task2.files = ['file3.ts', 'file4.ts'];

            const activeTasks = [task1];
            const conflicts = manager.checkConflicts(task2, activeTasks);

            expect(conflicts).toEqual([]);
        });

        it('should skip self when checking conflicts', () => {
            const task1 = createMockTask('task-1', 'in-progress');
            task1.files = ['file1.ts', 'file2.ts'];

            const activeTasks = [task1];
            const conflicts = manager.checkConflicts(task1, activeTasks);

            expect(conflicts).toEqual([]);
        });
    });

    describe('addSoftDependency', () => {
        it('should add a soft dependency between tasks', () => {
            const result = manager.addSoftDependency('task-1', 'task-2');

            expect(result).toBe(true);
            expect(mockLoggingService.info).toHaveBeenCalledWith('Added soft dependency: task-1 prefers task-2');
        });

        it('should prevent self soft dependencies', () => {
            const result = manager.addSoftDependency('task-1', 'task-1');

            expect(result).toBe(false);
            expect(mockLoggingService.warn).toHaveBeenCalledWith('Cannot add self-soft-dependency for task task-1');
        });

        it('should handle duplicate soft dependencies', () => {
            manager.addSoftDependency('task-1', 'task-2');
            const result = manager.addSoftDependency('task-1', 'task-2');

            expect(result).toBe(true);
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                'Soft dependency already exists: task-1 prefers task-2'
            );
        });
    });
});
