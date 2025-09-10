/**
 * Comprehensive tests for InterfaceAdapter
 * Validates adapter pattern implementation for interface migration
 */

import { InterfaceAdapter } from '../../../services/simplified-interfaces';
import { Task, TaskStatus } from '../../../agents/types';
import * as vscode from 'vscode';

describe('InterfaceAdapter', () => {
    describe('adaptTaskQueue', () => {
        let mockComplexQueue: any;

        beforeEach(() => {
            mockComplexQueue = {
                addTask: jest.fn(),
                getPendingTasks: jest.fn(),
                getActiveTasks: jest.fn(),
                getAllTasks: jest.fn(),
                getTasksForAgent: jest.fn(),
                completeTask: jest.fn(),
                failTask: jest.fn()
            };
        });

        describe('Happy Path', () => {
            it('should adapt addTask method correctly', () => {
                const config = { title: 'Test Task', description: 'Test Description' };
                const expectedTask: Task = {
                    id: 'task-1',
                    title: 'Test Task',
                    description: 'Test Description',
                    priority: 'medium',
                    status: 'queued',
                    createdAt: new Date()
                };

                mockComplexQueue.addTask.mockReturnValue(expectedTask);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.addTask(config);

                expect(mockComplexQueue.addTask).toHaveBeenCalledWith(config);
                expect(result).toBe(expectedTask);
            });

            it('should adapt getNextTask for general case', () => {
                const pendingTask: Task = {
                    id: 'task-1',
                    title: 'Pending Task',
                    description: 'Description',
                    priority: 'high',
                    status: 'queued',
                    createdAt: new Date()
                };

                mockComplexQueue.getPendingTasks.mockReturnValue([pendingTask]);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.getNextTask();

                expect(mockComplexQueue.getPendingTasks).toHaveBeenCalled();
                expect(result).toBe(pendingTask);
            });

            it('should adapt getNextTask for specific agent', () => {
                const agentTask: Task = {
                    id: 'task-2',
                    title: 'Agent Task',
                    description: 'Description',
                    priority: 'medium',
                    status: 'queued',
                    createdAt: new Date(),
                    assignedTo: 'agent-123'
                };

                mockComplexQueue.getTasksForAgent.mockReturnValue([agentTask]);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.getNextTask('agent-123');

                expect(mockComplexQueue.getTasksForAgent).toHaveBeenCalledWith('agent-123');
                expect(result).toBe(agentTask);
            });

            it('should adapt completeTask method', () => {
                mockComplexQueue.completeTask.mockReturnValue(true);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.completeTask('task-1');

                expect(mockComplexQueue.completeTask).toHaveBeenCalledWith('task-1');
                expect(result).toBe(true);
            });

            it('should adapt failTask method', () => {
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                adapted.failTask('task-1', 'Error occurred');

                expect(mockComplexQueue.failTask).toHaveBeenCalledWith('task-1', 'Error occurred');
            });

            it('should adapt getTasks without filter', () => {
                const allTasks: Task[] = [
                    {
                        id: 'task-1',
                        title: 'Task 1',
                        description: '',
                        priority: 'low',
                        status: 'queued',
                        createdAt: new Date()
                    },
                    {
                        id: 'task-2',
                        title: 'Task 2',
                        description: '',
                        priority: 'high',
                        status: 'completed',
                        createdAt: new Date()
                    }
                ];

                mockComplexQueue.getAllTasks.mockReturnValue(allTasks);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.getTasks();

                expect(mockComplexQueue.getAllTasks).toHaveBeenCalled();
                expect(result).toBe(allTasks);
            });

            it('should adapt getTasks with status filter for queued/ready', () => {
                const pendingTasks: Task[] = [
                    {
                        id: 'task-1',
                        title: 'Pending 1',
                        description: '',
                        priority: 'medium',
                        status: 'queued',
                        createdAt: new Date()
                    }
                ];

                mockComplexQueue.getPendingTasks.mockReturnValue(pendingTasks);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result1 = adapted.getTasks({ status: 'queued' });
                const result2 = adapted.getTasks({ status: 'ready' });

                expect(mockComplexQueue.getPendingTasks).toHaveBeenCalledTimes(2);
                expect(result1).toBe(pendingTasks);
                expect(result2).toBe(pendingTasks);
            });

            it('should adapt getTasks with status filter for in-progress/assigned', () => {
                const activeTasks: Task[] = [
                    {
                        id: 'task-1',
                        title: 'Active 1',
                        description: '',
                        priority: 'high',
                        status: 'in-progress',
                        createdAt: new Date()
                    }
                ];

                mockComplexQueue.getActiveTasks.mockReturnValue(activeTasks);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result1 = adapted.getTasks({ status: 'in-progress' });
                const result2 = adapted.getTasks({ status: 'assigned' });

                expect(mockComplexQueue.getActiveTasks).toHaveBeenCalledTimes(2);
                expect(result1).toBe(activeTasks);
                expect(result2).toBe(activeTasks);
            });

            it('should adapt getTasks with agentId filter', () => {
                const agentTasks: Task[] = [
                    {
                        id: 'task-1',
                        title: 'Agent Task',
                        description: '',
                        priority: 'medium',
                        status: 'queued',
                        createdAt: new Date(),
                        assignedTo: 'agent-1'
                    }
                ];

                mockComplexQueue.getTasksForAgent.mockReturnValue(agentTasks);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.getTasks({ agentId: 'agent-1' });

                expect(mockComplexQueue.getTasksForAgent).toHaveBeenCalledWith('agent-1');
                expect(result).toBe(agentTasks);
            });

            it('should adapt getTasks with other status filter', () => {
                const allTasks: Task[] = [
                    {
                        id: 'task-1',
                        title: 'Task',
                        description: '',
                        priority: 'low',
                        status: 'failed',
                        createdAt: new Date()
                    }
                ];

                mockComplexQueue.getAllTasks.mockReturnValue(allTasks);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.getTasks({ status: 'failed' });

                expect(mockComplexQueue.getAllTasks).toHaveBeenCalled();
                expect(result).toBe(allTasks);
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty pending tasks array', () => {
                mockComplexQueue.getPendingTasks.mockReturnValue([]);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.getNextTask();

                expect(result).toBeUndefined();
            });

            it('should handle empty agent tasks array', () => {
                mockComplexQueue.getTasksForAgent.mockReturnValue([]);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.getNextTask('agent-123');

                expect(result).toBeUndefined();
            });

            it('should handle undefined filter', () => {
                const allTasks: Task[] = [];
                mockComplexQueue.getAllTasks.mockReturnValue(allTasks);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.getTasks(undefined);

                expect(mockComplexQueue.getAllTasks).toHaveBeenCalled();
                expect(result).toBe(allTasks);
            });

            it('should handle filter with both status and agentId', () => {
                const agentTasks: Task[] = [
                    {
                        id: 'task-1',
                        title: 'Agent Task',
                        description: '',
                        priority: 'high',
                        status: 'in-progress',
                        createdAt: new Date(),
                        assignedTo: 'agent-1'
                    }
                ];

                mockComplexQueue.getTasksForAgent.mockReturnValue(agentTasks);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                // When both filters present, agentId takes precedence
                const result = adapted.getTasks({ status: 'in-progress', agentId: 'agent-1' });

                expect(mockComplexQueue.getTasksForAgent).toHaveBeenCalledWith('agent-1');
                expect(result).toBe(agentTasks);
            });

            it('should handle failTask without reason', () => {
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                adapted.failTask('task-1');

                expect(mockComplexQueue.failTask).toHaveBeenCalledWith('task-1', undefined);
            });

            it('should handle completeTask returning false', () => {
                mockComplexQueue.completeTask.mockReturnValue(false);
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                const result = adapted.completeTask('non-existent');

                expect(result).toBe(false);
            });
        });

        describe('Error Scenarios', () => {
            it('should propagate errors from addTask', () => {
                mockComplexQueue.addTask.mockImplementation(() => {
                    throw new Error('Add task failed');
                });
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                expect(() => adapted.addTask({ title: 'Test' })).toThrow('Add task failed');
            });

            it('should propagate errors from getPendingTasks', () => {
                mockComplexQueue.getPendingTasks.mockImplementation(() => {
                    throw new Error('Get pending failed');
                });
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                expect(() => adapted.getNextTask()).toThrow('Get pending failed');
            });

            it('should propagate errors from getTasksForAgent', () => {
                mockComplexQueue.getTasksForAgent.mockImplementation(() => {
                    throw new Error('Get agent tasks failed');
                });
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                expect(() => adapted.getNextTask('agent-1')).toThrow('Get agent tasks failed');
            });

            it('should propagate errors from completeTask', () => {
                mockComplexQueue.completeTask.mockImplementation(() => {
                    throw new Error('Complete failed');
                });
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                expect(() => adapted.completeTask('task-1')).toThrow('Complete failed');
            });

            it('should propagate errors from failTask', () => {
                mockComplexQueue.failTask.mockImplementation(() => {
                    throw new Error('Fail task failed');
                });
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                expect(() => adapted.failTask('task-1', 'reason')).toThrow('Fail task failed');
            });

            it('should propagate errors from getAllTasks', () => {
                mockComplexQueue.getAllTasks.mockImplementation(() => {
                    throw new Error('Get all failed');
                });
                const adapted = InterfaceAdapter.adaptTaskQueue(mockComplexQueue);

                expect(() => adapted.getTasks()).toThrow('Get all failed');
            });
        });
    });

    describe('adaptConfiguration', () => {
        let mockComplexConfig: any;
        let mockEvent: any;
        let eventHandlers: Array<(e: string) => void>;

        beforeEach(() => {
            eventHandlers = [];
            mockEvent = jest.fn((handler: (e: string) => void) => {
                eventHandlers.push(handler);
                return {
                    dispose: jest.fn(() => {
                        const index = eventHandlers.indexOf(handler);
                        if (index > -1) {
                            eventHandlers.splice(index, 1);
                        }
                    })
                };
            });

            mockComplexConfig = {
                get: jest.fn(),
                update: jest.fn(),
                has: jest.fn(),
                onDidChangeConfiguration: mockEvent,
                remove: jest.fn(),
                reset: jest.fn()
            };
        });

        afterEach(() => {
            eventHandlers = [];
        });

        describe('Happy Path', () => {
            it('should adapt get method', () => {
                mockComplexConfig.get.mockReturnValue('value');
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                const result = adapted.get('key', 'default');

                expect(mockComplexConfig.get).toHaveBeenCalledWith('key', 'default');
                expect(result).toBe('value');
            });

            it('should adapt set method', async () => {
                mockComplexConfig.update.mockResolvedValue(undefined);
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                await adapted.set('key', 'value');

                expect(mockComplexConfig.update).toHaveBeenCalledWith('key', 'value');
            });

            it('should adapt has method', () => {
                mockComplexConfig.has.mockReturnValue(true);
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                const result = adapted.has('key');

                expect(mockComplexConfig.has).toHaveBeenCalledWith('key');
                expect(result).toBe(true);
            });

            it('should adapt onDidChange event', () => {
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);
                const handler = jest.fn();

                const disposable = adapted.onDidChange(handler);

                // Trigger event through our mock
                eventHandlers.forEach(h => h('config.changed'));

                expect(handler).toHaveBeenCalledWith('config.changed');
                disposable.dispose();
            });

            it('should adapt reset method without key', async () => {
                mockComplexConfig.reset.mockResolvedValue(undefined);
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                await adapted.reset();

                expect(mockComplexConfig.reset).toHaveBeenCalled();
            });

            it('should adapt reset method with key', async () => {
                mockComplexConfig.remove.mockResolvedValue(undefined);
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                await adapted.reset('specific.key');

                expect(mockComplexConfig.remove).toHaveBeenCalledWith('specific.key');
            });
        });

        describe('Edge Cases', () => {
            it('should handle get without default value', () => {
                mockComplexConfig.get.mockReturnValue(undefined);
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                const result = adapted.get('key');

                expect(mockComplexConfig.get).toHaveBeenCalledWith('key', undefined);
                expect(result).toBeUndefined();
            });

            it('should handle has returning false', () => {
                mockComplexConfig.has.mockReturnValue(false);
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                const result = adapted.has('non.existent');

                expect(result).toBe(false);
            });

            it('should handle multiple event listeners', () => {
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);
                const handler1 = jest.fn();
                const handler2 = jest.fn();

                const disposable1 = adapted.onDidChange(handler1);
                const disposable2 = adapted.onDidChange(handler2);

                // Trigger event for all handlers
                eventHandlers.forEach(h => h('test.event'));

                expect(handler1).toHaveBeenCalledWith('test.event');
                expect(handler2).toHaveBeenCalledWith('test.event');

                disposable1.dispose();
                disposable2.dispose();
            });

            it('should handle event listener disposal', () => {
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);
                const handler = jest.fn();

                const disposable = adapted.onDidChange(handler);
                disposable.dispose();

                // After disposal, handler should be removed from array
                eventHandlers.forEach(h => h('after.disposal'));

                expect(handler).not.toHaveBeenCalled();
            });
        });

        describe('Error Scenarios', () => {
            it('should propagate errors from get', () => {
                mockComplexConfig.get.mockImplementation(() => {
                    throw new Error('Get failed');
                });
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                expect(() => adapted.get('key')).toThrow('Get failed');
            });

            it('should propagate errors from set', async () => {
                mockComplexConfig.update.mockRejectedValue(new Error('Update failed'));
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                await expect(adapted.set('key', 'value')).rejects.toThrow('Update failed');
            });

            it('should propagate errors from has', () => {
                mockComplexConfig.has.mockImplementation(() => {
                    throw new Error('Has failed');
                });
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                expect(() => adapted.has('key')).toThrow('Has failed');
            });

            it('should propagate errors from reset without key', async () => {
                mockComplexConfig.reset.mockRejectedValue(new Error('Reset failed'));
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                await expect(adapted.reset()).rejects.toThrow('Reset failed');
            });

            it('should propagate errors from reset with key', async () => {
                mockComplexConfig.remove.mockRejectedValue(new Error('Remove failed'));
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                await expect(adapted.reset('key')).rejects.toThrow('Remove failed');
            });
        });

        describe('Input Validation', () => {
            it('should handle null/undefined values in get', () => {
                mockComplexConfig.get.mockReturnValue(null);
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                const result = adapted.get('null.key', 'default');

                expect(result).toBeNull();
            });

            it('should handle complex objects in set', async () => {
                const complexValue = {
                    nested: {
                        array: [1, 2, 3],
                        bool: true,
                        str: 'test'
                    }
                };
                mockComplexConfig.update.mockResolvedValue(undefined);
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                await adapted.set('complex.key', complexValue);

                expect(mockComplexConfig.update).toHaveBeenCalledWith('complex.key', complexValue);
            });

            it('should handle empty string keys', () => {
                mockComplexConfig.has.mockReturnValue(false);
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                const result = adapted.has('');

                expect(mockComplexConfig.has).toHaveBeenCalledWith('');
                expect(result).toBe(false);
            });

            it('should handle special characters in keys', async () => {
                mockComplexConfig.remove.mockResolvedValue(undefined);
                const adapted = InterfaceAdapter.adaptConfiguration(mockComplexConfig);

                await adapted.reset('key.with.dots[and]brackets');

                expect(mockComplexConfig.remove).toHaveBeenCalledWith('key.with.dots[and]brackets');
            });
        });
    });
});
