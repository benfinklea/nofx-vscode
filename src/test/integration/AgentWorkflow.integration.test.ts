import { createIntegrationContainer, createMockAgent, createMockTask, waitForEvent, measureTime } from '../utils/TestHelpers';
import { IContainer, SERVICE_TOKENS } from '../../services/interfaces';
import { createMessage, MessageType } from '../../orchestration/MessageProtocol';

describe('Agent Workflow Integration Tests', () => {
    let container: IContainer;
    let agentManager: any;
    let taskQueue: any;
    let orchestrationServer: any;
    let metricsService: any;

    beforeEach(async () => {
        container = createIntegrationContainer();
        
        // Get real services from container
        agentManager = container.resolve(SERVICE_TOKENS.AgentManager);
        taskQueue = container.resolve(SERVICE_TOKENS.TaskQueue);
        orchestrationServer = container.resolve(SERVICE_TOKENS.OrchestrationServer);
        metricsService = container.resolve(SERVICE_TOKENS.MetricsService);
    });

    afterEach(async () => {
        if (orchestrationServer) {
            await orchestrationServer.stop();
        }
        if (container) {
            container.dispose();
        }
    });

    describe('End-to-End Agent Lifecycle', () => {
        it('should complete full agent workflow from creation to task completion', async () => {
            const { result: workflowResult, duration } = await measureTime(async () => {
                // 1. Spawn agent
                const agentConfig = {
                    name: 'Test Agent',
                    type: 'General Purpose',
                    capabilities: ['general', 'testing']
                };

                const agent = await agentManager.spawnAgent(agentConfig);
                expect(agent).toBeDefined();
                expect(agent.id).toBeTruthy();
                expect(agent.status).toBe('idle');

                // 2. Create task
                const taskConfig = {
                    title: 'Test Task',
                    description: 'A test task for integration testing',
                    priority: 'medium',
                    capabilities: ['general']
                };

                const task = taskQueue.addTask(taskConfig);
                expect(task).toBeDefined();
                expect(task.id).toBeTruthy();
                expect(task.status).toBe('validated'); // Real TaskQueue starts with validated state

                // 3. Assign task to agent
                const assignmentResult = await taskQueue.assignTask(task.id, agent.id);
                expect(assignmentResult).toBe(true);

                // 4. Task should be in-progress after assignment
                expect(taskQueue.getTask(task.id)?.status).toBe('in-progress');

                // 5. Complete task
                const completed = taskQueue.completeTask(task.id);
                expect(completed).toBe(true);
                expect(taskQueue.getTask(task.id)?.status).toBe('completed');

                // 6. Remove agent
                const removalResult = await agentManager.removeAgent(agent.id);
                expect(removalResult).toBe(true);

                return { agent, task };
            });

            expect(workflowResult.agent).toBeDefined();
            expect(workflowResult.task).toBeDefined();
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

            // Verify metrics were recorded
            const metrics = metricsService.getMetrics();
            expect(metrics.length).toBeGreaterThan(0);
            expect(metrics.some((m: any) => m.name === 'agents_created')).toBe(true);
            expect(metrics.some((m: any) => m.name === 'tasks_created')).toBe(true);
            expect(metrics.some((m: any) => m.name === 'tasks_completed')).toBe(true);
        });

        it('should handle multiple agents working on different tasks', async () => {
            const agents = [];
            const tasks = [];

            // Create multiple agents
            for (let i = 0; i < 3; i++) {
                const agent = await agentManager.spawnAgent({
                    name: `Agent ${i + 1}`,
                    type: 'General Purpose',
                    capabilities: ['general']
                });
                agents.push(agent);
            }

            // Create multiple tasks
            for (let i = 0; i < 3; i++) {
                const task = taskQueue.addTask({
                    title: `Task ${i + 1}`,
                    description: `Test task ${i + 1}`,
                    priority: 'medium',
                    capabilities: ['general']
                });
                tasks.push(task);
            }

            // Assign tasks to agents
            for (let i = 0; i < 3; i++) {
                const assignmentResult = await taskQueue.assignTask(tasks[i].id, agents[i].id);
                expect(assignmentResult).toBe(true);
            }

            // Verify all tasks are assigned and in-progress
            for (const task of tasks) {
                const updatedTask = taskQueue.getTask(task.id);
                expect(updatedTask?.assignedTo).toBeTruthy();
                expect(updatedTask?.status).toBe('in-progress');
            }

            // Complete all tasks
            for (const task of tasks) {
                const completed = taskQueue.completeTask(task.id);
                expect(completed).toBe(true);
            }

            // Clean up agents
            for (const agent of agents) {
                await agentManager.removeAgent(agent.id);
            }

            // Verify metrics
            const metrics = metricsService.getMetrics();
            expect(metrics.filter((m: any) => m.name === 'agents_created').length).toBe(3);
            expect(metrics.filter((m: any) => m.name === 'tasks_created').length).toBe(3);
            expect(metrics.filter((m: any) => m.name === 'tasks_completed').length).toBe(3);
        });
    });

    describe('Task Dependencies and Conflicts', () => {
        it('should handle task dependencies correctly', async () => {
            // Create parent task
            const parentTask = taskQueue.addTask({
                title: 'Parent Task',
                description: 'Task that must complete first',
                priority: 'high',
                capabilities: ['general']
            });

            // Create child task with dependency
            const childTask = taskQueue.addTask({
                title: 'Child Task',
                description: 'Task that depends on parent',
                priority: 'medium',
                capabilities: ['general'],
                dependsOn: [parentTask.id]
            });

            // Create agent
            const agent = await agentManager.spawnAgent({
                name: 'Test Agent',
                type: 'General Purpose',
                capabilities: ['general']
            });

            // Child task should be blocked until parent is completed
            const readyTasks = taskQueue.getQueuedTasks();
            expect(readyTasks.find((t: any) => t.id === childTask.id && t.status === 'ready')).toBeUndefined();
            expect(readyTasks.find((t: any) => t.id === parentTask.id && t.status === 'ready')).toBeDefined();

            // Complete parent task first
            await taskQueue.assignTask(parentTask.id, agent.id);
            const completed = taskQueue.completeTask(parentTask.id);
            expect(completed).toBe(true);

            // Now child task should become ready
            const childTaskAfter = taskQueue.getTask(childTask.id);
            expect(childTaskAfter?.status).toBe('ready');

            // Complete child task
            await taskQueue.assignTask(childTask.id, agent.id);
            const childCompleted = taskQueue.completeTask(childTask.id);
            expect(childCompleted).toBe(true);

            // Clean up
            await agentManager.removeAgent(agent.id);
        });

        it('should detect circular dependencies', async () => {
            const task1 = taskQueue.addTask({
                title: 'Task 1',
                description: 'First task in cycle',
                priority: 'high',
                capabilities: ['general']
            });

            const task2 = taskQueue.addTask({
                title: 'Task 2',
                description: 'Second task in cycle',
                priority: 'medium',
                capabilities: ['general'],
                dependsOn: [task1.id]
            });

            // Try to create circular dependency
            const result = taskQueue.addTaskDependency(task1.id, task2.id);
            expect(result).toBe(false); // Should fail due to circular dependency
        });
    });

    describe('Orchestration Integration', () => {
        it('should handle conductor commands through WebSocket', async () => {
            // Start orchestration server
            await orchestrationServer.start(); // Use default port handling
            const status = orchestrationServer.getStatus();
            const port = status.port;

            // Create WebSocket client to simulate conductor
            const WebSocket = require('ws');
            const client = new WebSocket(`ws://localhost:${port}`);

            await new Promise((resolve) => {
                client.on('open', resolve);
            });

            // Send conductor command to spawn agent
            const msg = createMessage('conductor', 'conductor', MessageType.SPAWN_AGENT, { 
                role: 'General Purpose', 
                name: 'Conductor Agent' 
            });

            client.send(JSON.stringify(msg));

            // Wait for response
            const response = await new Promise((resolve) => {
                client.on('message', (data: string) => {
                    const message = JSON.parse(data);
                    if (message.type === MessageType.AGENT_READY) {
                        resolve(message);
                    }
                });
            });

            expect(response).toBeDefined();
            expect((response as any).payload.agentId).toBeDefined();
            expect((response as any).payload.name).toBe('Conductor Agent');

            // Clean up
            client.close();
            await orchestrationServer.stop();
        });

        it('should handle task assignment through WebSocket', async () => {
            await orchestrationServer.start();
            const status = orchestrationServer.getStatus();
            const port = status.port;

            // Create agent first
            const agent = await agentManager.spawnAgent({
                name: 'WebSocket Agent',
                type: 'General Purpose',
                capabilities: ['general']
            });

            // Create WebSocket client
            const WebSocket = require('ws');
            const client = new WebSocket(`ws://localhost:${port}`);

            await new Promise((resolve) => {
                client.on('open', resolve);
            });

            // Generate a task ID and send ASSIGN_TASK command
            const taskId = `task-${Date.now()}`;
            const assignTaskMsg = createMessage('conductor', 'conductor', MessageType.ASSIGN_TASK, {
                agentId: agent.id,
                taskId: taskId,
                title: 'WebSocket Task',
                description: 'Task created via WebSocket',
                priority: 'medium'
            });

            client.send(JSON.stringify(assignTaskMsg));

            // Wait for task acceptance response
            const taskResponse = await new Promise((resolve) => {
                client.on('message', (data: string) => {
                    const message = JSON.parse(data);
                    if (message.type === MessageType.TASK_ACCEPTED) {
                        resolve(message);
                    }
                });
            });

            expect(taskResponse).toBeDefined();
            expect((taskResponse as any).payload.taskId).toBeDefined();
            expect((taskResponse as any).payload.agentId).toBe(agent.id);

            // Clean up
            client.close();
            await agentManager.removeAgent(agent.id);
            await orchestrationServer.stop();
        });

        it('should handle invalid messages and return SYSTEM_ERROR', async () => {
            await orchestrationServer.start();
            const status = orchestrationServer.getStatus();
            const port = status.port;

            const WebSocket = require('ws');
            const client = new WebSocket(`ws://localhost:${port}`);

            await new Promise((resolve) => {
                client.on('open', resolve);
            });

            // Send invalid message (missing required fields)
            const invalidMessage = {
                type: MessageType.SPAWN_AGENT,
                payload: { name: 'Invalid Agent' }
                // Missing id, timestamp, from, to fields
            };

            client.send(JSON.stringify(invalidMessage));

            // Wait for error response
            const errorResponse = await new Promise((resolve) => {
                client.on('message', (data: string) => {
                    const message = JSON.parse(data);
                    if (message.type === MessageType.SYSTEM_ERROR) {
                        resolve(message);
                    }
                });
            });

            expect(errorResponse).toBeDefined();
            expect((errorResponse as any).payload.error).toBeDefined();

            // Clean up
            client.close();
            await orchestrationServer.stop();
        });
    });

    describe('Error Recovery', () => {
        it('should handle agent failures during task execution', async () => {
            const agent = await agentManager.spawnAgent({
                name: 'Failing Agent',
                type: 'General Purpose',
                capabilities: ['general']
            });

            const task = taskQueue.addTask({
                title: 'Failing Task',
                description: 'Task that will fail',
                priority: 'medium',
                capabilities: ['general']
            });

            // Assign task
            await taskQueue.assignTask(task.id, agent.id);

            // Simulate agent failure
            taskQueue.failTask(task.id, 'Simulated failure');
            expect(taskQueue.getTask(task.id)?.status).toBe('failed');

            // Clean up
            await agentManager.removeAgent(agent.id);
        });

        it('should handle network disconnections gracefully', async () => {
            await orchestrationServer.start();
            const status = orchestrationServer.getStatus();
            const port = status.port;

            const WebSocket = require('ws');
            const client = new WebSocket(`ws://localhost:${port}`);

            await new Promise((resolve) => {
                client.on('open', resolve);
            });

            // Simulate disconnection
            client.close();

            // Wait for cleanup
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Server should still be running
            expect(orchestrationServer.getStatus().isRunning).toBe(true);

            await orchestrationServer.stop();
        });
    });

    describe('Performance Testing', () => {
        it('should handle high-frequency task creation', async () => {
            const { duration } = await measureTime(async () => {
                const tasks = [];
                
                // Create 100 tasks quickly
                for (let i = 0; i < 100; i++) {
                    const task = taskQueue.addTask({
                        title: `Performance Task ${i}`,
                        description: `High-frequency task ${i}`,
                        priority: i % 2 === 0 ? 'high' : 'medium',
                        capabilities: ['general']
                    });
                    tasks.push(task);
                }

                expect(tasks).toHaveLength(100);
            });

            expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
        });

        it('should handle concurrent agent operations', async () => {
            const { duration } = await measureTime(async () => {
                const agentPromises = [];
                
                // Spawn 10 agents concurrently
                for (let i = 0; i < 10; i++) {
                    const promise = agentManager.spawnAgent({
                        name: `Concurrent Agent ${i}`,
                        type: 'General Purpose',
                        capabilities: ['general']
                    });
                    agentPromises.push(promise);
                }

                const agents = await Promise.all(agentPromises);
                expect(agents).toHaveLength(10);

                // Clean up all agents
                const cleanupPromises = agents.map(agent => 
                    agentManager.removeAgent(agent.id)
                );
                await Promise.all(cleanupPromises);
            });

            expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
        });
    });

    describe('Configuration Changes During Operation', () => {
        it('should handle configuration changes gracefully', async () => {
            const agent = await agentManager.spawnAgent({
                name: 'Config Test Agent',
                type: 'General Purpose',
                capabilities: ['general']
            });

            // Change configuration
            const configService = container.resolve(SERVICE_TOKENS.ConfigurationService);
            await (configService as any).update('maxAgents', 5);

            // Agent should still be working
            expect(agentManager.getAgent(agent.id)).toBeDefined();

            // Clean up
            await agentManager.removeAgent(agent.id);
        });

        it('should validate configuration changes', async () => {
            const configService = container.resolve(SERVICE_TOKENS.ConfigurationService);

            // Try to set invalid configuration
            await expect((configService as any).update('maxAgents', 15))
                .rejects.toThrow('Configuration validation failed');
        });
    });
});
