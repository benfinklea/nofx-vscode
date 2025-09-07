import { expect } from 'chai';
import * as sinon from 'sinon';
import { EventEmitter } from 'events';
import * as child_process from 'child_process';
import * as vscode from 'vscode';
import {
    TaskToolBridge,
    SubAgentType,
    TaskRequest,
    TaskResult,
    TaskProgress,
    SubAgentStats
} from '../../../services/TaskToolBridge';
import { ILoggingService, IConfigurationService } from '../../../services/interfaces';

describe('TaskToolBridge', () => {
    let sandbox: sinon.SinonSandbox;
    let taskToolBridge: TaskToolBridge;
    let mockLoggingService: sinon.SinonStubbedInstance<ILoggingService>;
    let mockConfigService: sinon.SinonStubbedInstance<IConfigurationService>;
    let mockProcess: any;
    let spawnStub: sinon.SinonStub;
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        clock = sandbox.useFakeTimers();

        // Create mock services
        mockLoggingService = {
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub(),
            debug: sandbox.stub()
        } as any;

        mockConfigService = {
            get: sandbox.stub(),
            onDidChange: sandbox.stub().returns({ dispose: sandbox.stub() })
        } as any;

        // Configure default config values
        mockConfigService.get.withArgs('nofx.subAgents.maxTotal', 10).returns(10);
        mockConfigService.get.withArgs('nofx.subAgents.maxPerAgent', 3).returns(3);
        mockConfigService.get.withArgs('nofx.subAgents.timeout', 300000).returns(300000);
        mockConfigService.get.withArgs('nofx.subAgents.retryAttempts', 2).returns(2);
        mockConfigService.get.withArgs('nofx.subAgents.retryDelay', 1000).returns(1000);
        mockConfigService.get.withArgs('nofx.aiPath').returns(undefined);

        // Create mock process
        mockProcess = new EventEmitter();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = sandbox.stub();

        // Stub spawn
        spawnStub = sandbox.stub(child_process, 'spawn').returns(mockProcess as any);

        // Create TaskToolBridge instance
        taskToolBridge = new TaskToolBridge(mockLoggingService, mockConfigService);
    });

    afterEach(() => {
        taskToolBridge.dispose();
        clock.restore();
        sandbox.restore();
    });

    describe('Constructor', () => {
        it('should initialize with correct configuration', () => {
            expect(taskToolBridge).to.be.instanceof(TaskToolBridge);
            expect(mockLoggingService.info).to.have.been.calledWith('TaskToolBridge initialized');
        });

        it('should register configuration change listener', () => {
            expect(mockConfigService.onDidChange).to.have.been.calledOnce;
        });

        it('should load configuration from config service', () => {
            expect(mockConfigService.get).to.have.been.calledWith('nofx.subAgents.maxTotal', 10);
            expect(mockConfigService.get).to.have.been.calledWith('nofx.subAgents.maxPerAgent', 3);
            expect(mockConfigService.get).to.have.been.calledWith('nofx.subAgents.timeout', 300000);
        });
    });

    describe('executeTaskForAgent', () => {
        it('should execute task successfully', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Test task',
                'Do something'
            );

            // Simulate successful process completion
            process.nextTick(() => {
                mockProcess.stdout.emit('data', JSON.stringify({ result: 'Task completed' }));
                mockProcess.emit('close', 0);
            });

            const result = await taskPromise;

            expect(result.status).to.equal('success');
            expect(result.parentAgentId).to.equal('agent-1');
            expect(result.type).to.equal(SubAgentType.GENERAL_PURPOSE);
            expect(result.result).to.include('Task completed');
        });

        it('should handle task failure', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.CODE_LEAD_REVIEWER,
                'Review code',
                'Review this code'
            );

            // Simulate process failure
            process.nextTick(() => {
                mockProcess.stderr.emit('data', 'Error occurred');
                mockProcess.emit('close', 1);
            });

            const result = await taskPromise;

            expect(result.status).to.equal('error');
            expect(result.error).to.include('Claude process exited with code 1');
        });

        it('should handle task timeout', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Long task',
                'Do something long',
                { timeout: 1000 }
            );

            // Advance time to trigger timeout
            clock.tick(1001);

            const result = await taskPromise;

            expect(result.status).to.equal('timeout');
            expect(result.error).to.include('Task timed out after 1000ms');
            expect(mockProcess.kill).to.have.been.calledWith('SIGTERM');
        });

        it('should queue task if agent has active tasks', async () => {
            // Start first task
            const task1Promise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task 1',
                'Do task 1'
            );

            // Try to start second task (should be queued)
            const task2Promise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task 2',
                'Do task 2'
            );

            // Verify second task is queued
            const queuedTasks = taskToolBridge.getQueuedTasks('agent-1');
            expect(queuedTasks).to.have.lengthOf(1);
            expect(queuedTasks[0].description).to.equal('Task 2');

            // Complete first task
            process.nextTick(() => {
                mockProcess.stdout.emit('data', JSON.stringify({ result: 'Task 1 done' }));
                mockProcess.emit('close', 0);
            });

            await task1Promise;

            // Second task should now execute
            process.nextTick(() => {
                mockProcess.stdout.emit('data', JSON.stringify({ result: 'Task 2 done' }));
                mockProcess.emit('close', 0);
            });

            const result2 = await task2Promise;
            expect(result2.status).to.equal('success');
        });

        it('should respect max tasks per agent limit', async () => {
            // Configure max 2 tasks per agent
            mockConfigService.get.withArgs('nofx.subAgents.maxPerAgent', 3).returns(2);
            taskToolBridge = new TaskToolBridge(mockLoggingService, mockConfigService);

            // Start two tasks
            const task1 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T1', 'P1');
            const task2 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T2', 'P2');

            // Third task should be queued
            const task3 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T3', 'P3');

            const queuedTasks = taskToolBridge.getQueuedTasks('agent-1');
            expect(queuedTasks).to.have.lengthOf(1);
        });

        it('should handle custom priority', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'High priority task',
                'Do this urgently',
                { priority: 10 }
            );

            process.nextTick(() => {
                mockProcess.stdout.emit('data', JSON.stringify({ result: 'Done' }));
                mockProcess.emit('close', 0);
            });

            const result = await taskPromise;
            expect(result.status).to.equal('success');
        });

        it('should pass context to task', async () => {
            const context = { projectId: 'test-project', userId: 'user-123' };

            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Context task',
                'Use context',
                { context }
            );

            // Verify spawn was called with prompt containing context
            const spawnCall = spawnStub.getCall(0);
            const prompt = spawnCall.args[1][2];
            expect(prompt).to.include('Context:');
            expect(prompt).to.include('test-project');

            process.nextTick(() => {
                mockProcess.stdout.emit('data', JSON.stringify({ result: 'Done' }));
                mockProcess.emit('close', 0);
            });

            await taskPromise;
        });
    });

    describe('cancelTask', () => {
        it('should cancel active task', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task to cancel',
                'Do something'
            );

            // Get task ID from active tasks
            const activeTasks = taskToolBridge.getAgentTasks('agent-1');
            expect(activeTasks).to.have.lengthOf(1);
            const taskId = activeTasks[0].id;

            // Cancel task
            await taskToolBridge.cancelTask(taskId);

            // Verify process was killed
            expect(mockProcess.kill).to.have.been.calledWith('SIGTERM');

            // Verify task is no longer active
            const remainingTasks = taskToolBridge.getAgentTasks('agent-1');
            expect(remainingTasks).to.have.lengthOf(0);
        });

        it('should throw error for non-existent task', async () => {
            try {
                await taskToolBridge.cancelTask('non-existent-task');
                expect.fail('Should have thrown error');
            } catch (error: any) {
                expect(error.message).to.include('Task non-existent-task not found');
            }
        });

        it('should emit taskCancelled event', async () => {
            const eventSpy = sandbox.spy();
            taskToolBridge.on('taskCancelled', eventSpy);

            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            const taskId = taskToolBridge.getAgentTasks('agent-1')[0].id;
            await taskToolBridge.cancelTask(taskId);

            expect(eventSpy).to.have.been.calledOnce;
            const event = eventSpy.getCall(0).args[0];
            expect(event.status).to.equal('cancelled');
        });
    });

    describe('cancelAgentTasks', () => {
        it('should cancel all tasks for an agent', async () => {
            // Start multiple tasks
            const task1 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T1', 'P1');
            const task2 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T2', 'P2');
            const task3 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T3', 'P3');

            // Verify tasks are active/queued
            const activeTasks = taskToolBridge.getAgentTasks('agent-1');
            const queuedTasks = taskToolBridge.getQueuedTasks('agent-1');
            expect(activeTasks.length + queuedTasks.length).to.be.greaterThan(0);

            // Cancel all agent tasks
            await taskToolBridge.cancelAgentTasks('agent-1');

            // Verify all tasks are cancelled
            expect(taskToolBridge.getAgentTasks('agent-1')).to.have.lengthOf(0);
            expect(taskToolBridge.getQueuedTasks('agent-1')).to.have.lengthOf(0);
        });

        it('should not affect other agents tasks', async () => {
            // Start tasks for multiple agents
            const task1 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T1', 'P1');
            const task2 = taskToolBridge.executeTaskForAgent('agent-2', SubAgentType.GENERAL_PURPOSE, 'T2', 'P2');

            // Cancel agent-1 tasks
            await taskToolBridge.cancelAgentTasks('agent-1');

            // Verify agent-2 tasks are still active
            expect(taskToolBridge.getAgentTasks('agent-2')).to.have.lengthOf(1);
        });
    });

    describe('Event Emissions', () => {
        it('should emit taskStarted event', async () => {
            const eventSpy = sandbox.spy();
            taskToolBridge.on('taskStarted', eventSpy);

            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            await new Promise(resolve => process.nextTick(resolve));

            expect(eventSpy).to.have.been.calledOnce;
            const emittedTask = eventSpy.getCall(0).args[0];
            expect(emittedTask.parentAgentId).to.equal('agent-1');
            expect(emittedTask.description).to.equal('Task');
        });

        it('should emit taskCompleted event on success', async () => {
            const eventSpy = sandbox.spy();
            taskToolBridge.on('taskCompleted', eventSpy);

            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            process.nextTick(() => {
                mockProcess.stdout.emit('data', JSON.stringify({ result: 'Done' }));
                mockProcess.emit('close', 0);
            });

            await taskPromise;

            expect(eventSpy).to.have.been.calledOnce;
            const result = eventSpy.getCall(0).args[0];
            expect(result.status).to.equal('success');
        });

        it('should emit taskFailed event on error', async () => {
            const eventSpy = sandbox.spy();
            taskToolBridge.on('taskFailed', eventSpy);

            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            process.nextTick(() => {
                mockProcess.emit('error', new Error('Process failed'));
            });

            await taskPromise;

            expect(eventSpy).to.have.been.calledOnce;
            const result = eventSpy.getCall(0).args[0];
            expect(result.status).to.equal('error');
        });

        it('should emit taskTimeout event', async () => {
            const eventSpy = sandbox.spy();
            taskToolBridge.on('taskTimeout', eventSpy);

            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt',
                { timeout: 1000 }
            );

            clock.tick(1001);

            await taskPromise;

            expect(eventSpy).to.have.been.calledOnce;
            const result = eventSpy.getCall(0).args[0];
            expect(result.status).to.equal('timeout');
        });

        it('should emit taskQueued event', async () => {
            const eventSpy = sandbox.spy();
            taskToolBridge.on('taskQueued', eventSpy);

            // Start first task to occupy the agent
            const task1 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T1', 'P1');

            // Second task should be queued
            const task2 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T2', 'P2');

            await new Promise(resolve => process.nextTick(resolve));

            expect(eventSpy).to.have.been.calledOnce;
            const queuedTask = eventSpy.getCall(0).args[0];
            expect(queuedTask.description).to.equal('T2');
        });

        it('should emit taskProgress events', async () => {
            const eventSpy = sandbox.spy();
            taskToolBridge.on('taskProgress', eventSpy);

            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            process.nextTick(() => {
                mockProcess.stdout.emit('data', 'Progress: 50');
                mockProcess.stdout.emit('data', 'Progress: 100');
                mockProcess.emit('close', 0);
            });

            await taskPromise;

            expect(eventSpy).to.have.been.calledTwice;
            expect(eventSpy.getCall(0).args[0].progress).to.equal(50);
            expect(eventSpy.getCall(1).args[0].progress).to.equal(100);
        });
    });

    describe('Statistics', () => {
        it('should track successful tasks', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            process.nextTick(() => {
                mockProcess.stdout.emit('data', JSON.stringify({ result: 'Done' }));
                mockProcess.emit('close', 0);
            });

            await taskPromise;

            const stats = taskToolBridge.getStats();
            expect(stats.totalTasks).to.equal(1);
            expect(stats.successfulTasks).to.equal(1);
            expect(stats.failedTasks).to.equal(0);
        });

        it('should track failed tasks', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            process.nextTick(() => {
                mockProcess.emit('error', new Error('Failed'));
            });

            await taskPromise;

            const stats = taskToolBridge.getStats();
            expect(stats.failedTasks).to.equal(1);
        });

        it('should track timeout tasks', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt',
                { timeout: 100 }
            );

            clock.tick(101);

            await taskPromise;

            const stats = taskToolBridge.getStats();
            expect(stats.timeoutTasks).to.equal(1);
        });

        it('should track cancelled tasks', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            const taskId = taskToolBridge.getAgentTasks('agent-1')[0].id;
            await taskToolBridge.cancelTask(taskId);

            const stats = taskToolBridge.getStats();
            expect(stats.cancelledTasks).to.equal(1);
        });

        it('should calculate average execution time', async () => {
            // Complete multiple tasks with different execution times
            for (let i = 0; i < 3; i++) {
                const taskPromise = taskToolBridge.executeTaskForAgent(
                    'agent-1',
                    SubAgentType.GENERAL_PURPOSE,
                    `Task ${i}`,
                    'Prompt'
                );

                // Simulate different execution times
                setTimeout(
                    () => {
                        mockProcess.stdout.emit('data', JSON.stringify({ result: 'Done' }));
                        mockProcess.emit('close', 0);
                    },
                    (i + 1) * 10
                );

                clock.tick((i + 1) * 10);
                await taskPromise;
            }

            const stats = taskToolBridge.getStats();
            expect(stats.averageExecutionTime).to.be.greaterThan(0);
        });

        it('should track active and queued task counts', async () => {
            // Start multiple tasks
            const task1 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T1', 'P1');
            const task2 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T2', 'P2');
            const task3 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T3', 'P3');

            const stats = taskToolBridge.getStats();
            expect(stats.activeTaskCount).to.be.greaterThan(0);
            expect(stats.queuedTaskCount).to.be.greaterThan(0);
        });
    });

    describe('Agent-specific statistics', () => {
        it('should track per-agent statistics', async () => {
            // Start tasks for different agents
            const task1 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T1', 'P1');
            const task2 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T2', 'P2');
            const task3 = taskToolBridge.executeTaskForAgent('agent-2', SubAgentType.GENERAL_PURPOSE, 'T3', 'P3');

            const agent1Stats = taskToolBridge.getAgentStats('agent-1');
            const agent2Stats = taskToolBridge.getAgentStats('agent-2');

            expect(agent1Stats.activeTasks + agent1Stats.queuedTasks).to.equal(2);
            expect(agent2Stats.activeTasks).to.equal(1);
        });
    });

    describe('Configuration changes', () => {
        it('should update configuration on change', () => {
            const changeCallback = mockConfigService.onDidChange.getCall(0).args[0];

            // Update config values
            mockConfigService.get.withArgs('nofx.subAgents.maxPerAgent', 3).returns(5);

            // Trigger configuration change
            const event = {
                affectsConfiguration: (key: string) => key === 'nofx.subAgents'
            } as vscode.ConfigurationChangeEvent;

            changeCallback(event);

            expect(mockLoggingService.info).to.have.been.calledWith('TaskToolBridge configuration updated');
        });
    });

    describe('Error handling', () => {
        it('should handle process spawn errors', async () => {
            spawnStub.throws(new Error('Cannot spawn process'));

            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            const result = await taskPromise;

            expect(result.status).to.equal('error');
            expect(result.error).to.include('Cannot spawn process');
        });

        it('should handle invalid JSON output', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            process.nextTick(() => {
                mockProcess.stdout.emit('data', 'Not valid JSON output');
                mockProcess.emit('close', 0);
            });

            const result = await taskPromise;

            expect(result.status).to.equal('success');
            expect(result.result).to.equal('Not valid JSON output');
        });

        it('should handle process stderr output', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Task',
                'Prompt'
            );

            process.nextTick(() => {
                mockProcess.stderr.emit('data', 'Warning message');
                mockProcess.stdout.emit('data', JSON.stringify({ result: 'Done' }));
                mockProcess.emit('close', 0);
            });

            const result = await taskPromise;

            expect(result.status).to.equal('success');
        });
    });

    describe('Disposal', () => {
        it('should clean up all resources on dispose', async () => {
            // Start multiple tasks
            const task1 = taskToolBridge.executeTaskForAgent('agent-1', SubAgentType.GENERAL_PURPOSE, 'T1', 'P1');
            const task2 = taskToolBridge.executeTaskForAgent('agent-2', SubAgentType.GENERAL_PURPOSE, 'T2', 'P2');

            // Dispose
            taskToolBridge.dispose();

            // Verify cleanup
            expect(taskToolBridge.getAgentTasks('agent-1')).to.have.lengthOf(0);
            expect(taskToolBridge.getAgentTasks('agent-2')).to.have.lengthOf(0);
            expect(mockProcess.kill).to.have.been.called;
            expect(mockLoggingService.info).to.have.been.calledWith('TaskToolBridge disposed');
        });

        it('should remove all event listeners on dispose', () => {
            const listenerCountBefore = taskToolBridge.listenerCount('taskStarted');
            taskToolBridge.on('taskStarted', () => {});
            taskToolBridge.on('taskCompleted', () => {});

            taskToolBridge.dispose();

            expect(taskToolBridge.listenerCount('taskStarted')).to.equal(0);
            expect(taskToolBridge.listenerCount('taskCompleted')).to.equal(0);
        });
    });

    describe('Edge cases', () => {
        it('should handle rapid task submissions', async () => {
            const promises = [];

            // Submit 10 tasks rapidly
            for (let i = 0; i < 10; i++) {
                promises.push(
                    taskToolBridge.executeTaskForAgent(
                        `agent-${i % 3}`,
                        SubAgentType.GENERAL_PURPOSE,
                        `Task ${i}`,
                        'Prompt'
                    )
                );
            }

            // Complete all tasks
            for (let i = 0; i < 10; i++) {
                process.nextTick(() => {
                    mockProcess.stdout.emit('data', JSON.stringify({ result: `Done ${i}` }));
                    mockProcess.emit('close', 0);
                });
                clock.tick(100);
            }

            const results = await Promise.all(promises);
            expect(results).to.have.lengthOf(10);
            expect(results.every(r => r.status === 'success')).to.be.true;
        });

        it('should handle empty prompt', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Empty prompt task',
                ''
            );

            process.nextTick(() => {
                mockProcess.stdout.emit('data', JSON.stringify({ result: 'Done' }));
                mockProcess.emit('close', 0);
            });

            const result = await taskPromise;
            expect(result.status).to.equal('success');
        });

        it('should handle very long output', async () => {
            const taskPromise = taskToolBridge.executeTaskForAgent(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Long output',
                'Generate long output'
            );

            process.nextTick(() => {
                // Emit output in chunks
                const longText = 'x'.repeat(10000);
                mockProcess.stdout.emit('data', JSON.stringify({ result: longText }));
                mockProcess.emit('close', 0);
            });

            const result = await taskPromise;
            expect(result.status).to.equal('success');
            expect(result.result).to.have.length.greaterThan(9000);
        });
    });
});
