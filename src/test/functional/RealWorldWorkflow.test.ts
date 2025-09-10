/**
 * Real-world functional tests that verify NofX actually works
 * These tests focus on actual functionality rather than mocking everything
 */

import * as path from 'path';
import * as fs from 'fs';
import { TaskQueue } from '../../tasks/TaskQueue';
import { TaskStateMachine } from '../../tasks/TaskStateMachine';
import { EventEmitter } from 'events';
import {
import { getAppStateStore } from '../../state/AppStateStore';
import * as selectors from '../../state/selectors';
import * as actions from '../../state/actions';    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockContainer,
    createMockExtensionContext,
    createMockOutputChannel,
    createMockTerminal,
    setupVSCodeMocks
} from './../helpers/mockFactories';

describe('NofX Real-World Functionality', () => {
    let tempDir: string;

    beforeAll(() => {
        // Create temp directory for test files
        tempDir = path.join(__dirname, 'temp-test-workspace');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
    });

    afterAll(() => {
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('Task Management Workflow', () => {
        it('should create and manage tasks with realistic data', () => {
            // Create a real task queue without mocking
            const taskQueue = new TaskQueue();

            // Add a realistic task
            const task = taskQueue.addTask({
                title: 'Fix authentication bug in login system',
                description:
                    'Users cannot log in after the recent security update. Need to investigate JWT token validation.',
                priority: 'high',
                type: 'bug-fix',
                capabilities: ['backend', 'authentication', 'security'],
                estimatedHours: 4
            });

            // Verify task was created correctly
            expect(task).toBeDefined();
            expect(task.id).toBeTruthy();
            expect(task.title).toBe('Fix authentication bug in login system');
            expect(task.priority).toBe('high');
            expect(task.status).toBe('pending'); // Initial state
            expect(Array.isArray(task.capabilities)).toBe(true);
            expect(task.capabilities).toContain('backend');
            expect(task.capabilities).toContain('authentication');

            // Verify task appears in queue
            const allTasks = taskQueue.getAllTasks();
            expect(allTasks.length).toBe(1);
            expect(allTasks[0].id).toBe(task.id);

            // Update task status
            taskQueue.updateTaskStatus(task.id, 'in-progress');
            const updatedTask = taskQueue.getTask(task.id);
            expect(updatedTask?.status).toBe('in-progress');

            // Complete the task
            taskQueue.updateTaskStatus(task.id, 'completed');
            const completedTask = taskQueue.getTask(task.id);
            expect(completedTask?.status).toBe('completed');
        });

        it('should handle task priorities correctly', () => {
            const taskQueue = new TaskQueue();

            // Add tasks with different priorities
            const highPriorityTask = taskQueue.addTask({
                title: 'Critical security vulnerability',
                description: 'CVE-2024-1234 needs immediate patching',
                priority: 'critical',
                capabilities: ['security']
            });

            const mediumPriorityTask = taskQueue.addTask({
                title: 'Refactor user service',
                description: 'Clean up technical debt in user management',
                priority: 'medium',
                capabilities: ['backend']
            });

            const lowPriorityTask = taskQueue.addTask({
                title: 'Update documentation',
                description: 'Add JSDoc comments to API endpoints',
                priority: 'low',
                capabilities: ['documentation']
            });

            // Get tasks by priority
            const criticalTasks = taskQueue.getTasksByPriority('critical');
            const mediumTasks = taskQueue.getTasksByPriority('medium');
            const lowTasks = taskQueue.getTasksByPriority('low');

            expect(criticalTasks.length).toBe(1);
            expect(criticalTasks[0].id).toBe(highPriorityTask.id);
            expect(mediumTasks.length).toBe(1);
            expect(mediumTasks[0].id).toBe(mediumPriorityTask.id);
            expect(lowTasks.length).toBe(1);
            expect(lowTasks[0].id).toBe(lowPriorityTask.id);
        });

        it('should validate task dependencies work correctly', () => {
            const taskQueue = new TaskQueue();

            // Create parent task
            const setupTask = taskQueue.addTask({
                title: 'Set up database schema',
                description: 'Create tables and indexes',
                priority: 'high',
                capabilities: ['database']
            });

            // Create dependent task
            const dependentTask = taskQueue.addTask({
                title: 'Implement user registration',
                description: 'Add user signup functionality',
                priority: 'medium',
                capabilities: ['backend', 'database'],
                dependsOn: [setupTask.id]
            });

            // Verify dependency was set
            expect(dependentTask.dependsOn).toContain(setupTask.id);

            // Check that dependent task cannot be started until parent is complete
            const readyTasks = taskQueue.getReadyTasks();
            expect(readyTasks.find(t => t.id === setupTask.id)).toBeDefined();
            expect(readyTasks.find(t => t.id === dependentTask.id)).toBeUndefined();

            // Complete parent task
            taskQueue.updateTaskStatus(setupTask.id, 'completed');

            // Now dependent task should be ready
            const newReadyTasks = taskQueue.getReadyTasks();
            expect(newReadyTasks.find(t => t.id === dependentTask.id)).toBeDefined();
        });
    });

    describe('Task State Machine', () => {
        it('should handle valid state transitions', () => {
            const stateMachine = new TaskStateMachine();

            // Test valid transitions
            expect(stateMachine.canTransition('pending', 'in-progress')).toBe(true);
            expect(stateMachine.canTransition('in-progress', 'completed')).toBe(true);
            expect(stateMachine.canTransition('in-progress', 'failed')).toBe(true);
            expect(stateMachine.canTransition('failed', 'in-progress')).toBe(true); // Retry

            // Test invalid transitions
            expect(stateMachine.canTransition('completed', 'in-progress')).toBe(false);
            expect(stateMachine.canTransition('pending', 'completed')).toBe(false);
        });

        it('should track state history', () => {
            const stateMachine = new TaskStateMachine();
            const taskId = 'test-task-123';

            // Track state changes
            stateMachine.transition(taskId, 'pending', 'in-progress');
            stateMachine.transition(taskId, 'in-progress', 'failed');
            stateMachine.transition(taskId, 'failed', 'in-progress'); // Retry
            stateMachine.transition(taskId, 'in-progress', 'completed');

            const history = stateMachine.getStateHistory(taskId);
            expect(history.length).toBe(4);
            expect(history[0].from).toBe('pending');
            expect(history[0].to).toBe('in-progress');
            expect(history[3].from).toBe('in-progress');
            expect(history[3].to).toBe('completed');
        });
    });

    describe('Agent Template Loading', () => {
        it('should load and validate testing specialist template', () => {
            const templatePath = path.join(__dirname, '../../agents/templates/testing-specialist.json');

            // This test verifies the actual template file exists and is valid
            expect(fs.existsSync(templatePath)).toBe(true);

            const templateContent = fs.readFileSync(templatePath, 'utf8');
            const template = JSON.parse(templateContent);

            // Validate required fields
            expect(template.id).toBe('testing-specialist');
            expect(template.name).toContain('Testing');
            expect(template.systemPrompt).toBeTruthy();
            expect(template.systemPrompt.length).toBeGreaterThan(100); // Should be substantial

            // Validate testing-specific content
            expect(template.systemPrompt.toLowerCase()).toMatch(/test|testing|qa/);
            expect(template.capabilities).toBeDefined();
        });

        it('should load all agent templates without errors', () => {
            const templatesDir = path.join(__dirname, '../../agents/templates');

            if (!fs.existsSync(templatesDir)) {
                // If templates dir doesn't exist, skip this test
                return;
            }

            const templateFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
            expect(templateFiles.length).toBeGreaterThan(0);

            templateFiles.forEach(filename => {
                const filePath = path.join(templatesDir, filename);
                const content = fs.readFileSync(filePath, 'utf8');

                expect(() => JSON.parse(content)).not.toThrow();

                const template = JSON.parse(content);
                expect(template.id).toBeTruthy();
                expect(template.name).toBeTruthy();
                expect(template.systemPrompt).toBeTruthy();
            });
        });
    });

    describe('File System Operations', () => {
        it('should create and read test files', () => {
            const testFile = path.join(tempDir, 'test-output.txt');
            const testContent = 'This is test output from NofX agent';

            // Write file
            fs.writeFileSync(testFile, testContent);
            expect(fs.existsSync(testFile)).toBe(true);

            // Read file
            const readContent = fs.readFileSync(testFile, 'utf8');
            expect(readContent).toBe(testContent);
        });

        it('should handle directory creation', () => {
            const testSubDir = path.join(tempDir, 'subdir', 'nested');

            // Create nested directory
            fs.mkdirSync(testSubDir, { recursive: true });
            expect(fs.existsSync(testSubDir)).toBe(true);

            // Verify it's a directory
            const stats = fs.statSync(testSubDir);
            expect(stats.isDirectory()).toBe(true);
        });
    });

    describe('Event System', () => {
        it('should handle events correctly', done => {
            const eventBus = new EventEmitter();

            // Set up event listener
            eventBus.subscribe('task-completed', data => {
                expect(data.taskId).toBe('test-123');
                expect(data.result).toBe('success');
                done();
            });

            // Emit event
            eventBus.emit('task-completed', {
                taskId: 'test-123',
                result: 'success'
            });
        });

        it('should handle multiple listeners', () => {
            const eventBus = new EventEmitter();
            let listener1Called = false;
            let listener2Called = false;

            eventBus.subscribe('test-event', () => {
                listener1Called = true;
            });
            eventBus.subscribe('test-event', () => {
                listener2Called = true;
            });

            eventBus.emit('test-event');

            expect(listener1Called).toBe(true);
            expect(listener2Called).toBe(true);
        });
    });

    describe('Data Validation and Edge Cases', () => {
        it('should handle invalid task data gracefully', () => {
            const taskQueue = new TaskQueue();

            // Test with minimal data
            expect(() => {
                taskQueue.addTask({
                    title: 'Minimal Task',
                    description: 'Just title and description'
                });
            }).not.toThrow();

            // Test with empty title (should handle gracefully)
            expect(() => {
                taskQueue.addTask({
                    title: '',
                    description: 'Empty title test'
                });
            }).not.toThrow(); // Should handle gracefully, not crash
        });

        it('should handle task queue operations on empty queue', () => {
            const taskQueue = new TaskQueue();

            // Operations on empty queue should not crash
            expect(taskQueue.getAllTasks()).toEqual([]);
            expect(taskQueue.getReadyTasks()).toEqual([]);
            expect(taskQueue.getTask('non-existent')).toBeUndefined();
            expect(() => taskQueue.updateTaskStatus('non-existent', 'completed')).not.toThrow();
        });

        it('should generate unique task IDs', () => {
            const taskQueue = new TaskQueue();
            const ids = new Set();

            // Create multiple tasks and verify IDs are unique
            for (let i = 0; i < 10; i++) {
                const task = taskQueue.addTask({
                    title: `Task ${i}`,
                    description: `Description ${i}`
                });

                expect(ids.has(task.id)).toBe(false);
                ids.add(task.id);
            }

            expect(ids.size).toBe(10);
        });
    });

    describe('Performance and Scalability', () => {
        it('should handle moderate task loads efficiently', () => {
            const taskQueue = new TaskQueue();
            const startTime = Date.now();

            // Create 100 tasks
            for (let i = 0; i < 100; i++) {
                taskQueue.addTask({
                    title: `Performance Test Task ${i}`,
                    description: `Task for performance testing ${i}`,
                    priority: i % 3 === 0 ? 'high' : 'medium',
                    capabilities: ['general']
                });
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Should complete within reasonable time (less than 1 second)
            expect(duration).toBeLessThan(1000);
            expect(taskQueue.getAllTasks().length).toBe(100);
        });

        it('should handle task retrieval efficiently', () => {
            const taskQueue = new TaskQueue();

            // Add tasks
            const taskIds: string[] = [];
            for (let i = 0; i < 50; i++) {
                const task = taskQueue.addTask({
                    title: `Retrieval Test Task ${i}`,
                    description: `Task ${i}`
                });
                taskIds.push(task.id);
            }

            const startTime = Date.now();

            // Retrieve all tasks by ID
            taskIds.forEach(id => {
                const task = taskQueue.getTask(id);
                expect(task).toBeDefined();
                expect(task!.id).toBe(id);
            });

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Should be very fast (less than 100ms)
            expect(duration).toBeLessThan(100);
        });
    });
});
