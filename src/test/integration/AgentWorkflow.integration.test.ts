import { createTestContainer, createMockAgent, createMockTask, waitForEvent, measureTime } from '../setup';
import { IContainer, SERVICE_TOKENS } from '../../services/interfaces';

describe('Agent Workflow Integration Tests', () => {
    let container: IContainer;
    let agentManager: any;
    let taskQueue: any;
    let orchestrationServer: any;
    let metricsService: any;

    beforeEach(async () => {
        container = createTestContainer();
        
        // Create mock services and register them in container
        const mockAgentManager = { 
            spawnAgent: jest.fn().mockResolvedValue(createMockAgent()),
            removeAgent: jest.fn(),
            getAgent: jest.fn(),
            getIdleAgents: jest.fn(() => [])
        };
        const mockTaskQueue = { 
            addTask: jest.fn().mockReturnValue(createMockTask()),
            createTask: jest.fn().mockResolvedValue(createMockTask()),
            getTask: jest.fn(),
            updateTaskStatus: jest.fn()
        };
        const mockOrchestrationServer = { start: jest.fn(), stop: jest.fn(), getStatus: jest.fn(() => ({ isRunning: false })) };
        const mockMetricsService = { getMetrics: jest.fn(() => []), incrementCounter: jest.fn(), dispose: jest.fn() };
        const mockConfigService = { update: jest.fn().mockResolvedValue(undefined), get: jest.fn() };
        
        container.registerInstance(SERVICE_TOKENS.AgentManager, mockAgentManager);
        container.registerInstance(SERVICE_TOKENS.TaskQueue, mockTaskQueue);
        container.registerInstance(SERVICE_TOKENS.OrchestrationServer, mockOrchestrationServer);
        container.registerInstance(SERVICE_TOKENS.MetricsService, mockMetricsService);
        container.registerInstance(SERVICE_TOKENS.ConfigurationService, mockConfigService);
        
        // Get services from container
        agentManager = container.resolve(SERVICE_TOKENS.AgentManager);
        taskQueue = container.resolve(SERVICE_TOKENS.TaskQueue);
        orchestrationServer = container.resolve(SERVICE_TOKENS.OrchestrationServer);
        metricsService = container.resolve(SERVICE_TOKENS.MetricsService);
    });

    afterEach(async () => {
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
                    priority: 5,
                    capabilities: ['general']
                };

                const task = await taskQueue.createTask(taskConfig);
                expect(task).toBeDefined();
                expect(task.id).toBeTruthy();
                expect(task.status).toBe('pending');

                // 3. Assign task to agent
                const assignmentResult = await taskQueue.assignTask(task.id, agent.id);
                expect(assignmentResult.success).toBe(true);

                // 4. Simulate task execution
                await taskQueue.updateTaskStatus(task.id, 'inProgress');
                expect(taskQueue.getTask(task.id)?.status).toBe('inProgress');

                // 5. Complete task
                await taskQueue.updateTaskStatus(task.id, 'completed');
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
                const task = await taskQueue.createTask({
                    title: `Task ${i + 1}`,
                    description: `Test task ${i + 1}`,
                    priority: i + 1,
                    capabilities: ['general']
                });
                tasks.push(task);
            }

            // Assign tasks to agents
            for (let i = 0; i < 3; i++) {
                const assignmentResult = await taskQueue.assignTask(tasks[i].id, agents[i].id);
                expect(assignmentResult.success).toBe(true);
            }

            // Verify all tasks are assigned
            for (const task of tasks) {
                const updatedTask = taskQueue.getTask(task.id);
                expect(updatedTask?.assignedAgent).toBeTruthy();
                expect(updatedTask?.status).toBe('assigned');
            }

            // Complete all tasks
            for (const task of tasks) {
                await taskQueue.updateTaskStatus(task.id, 'completed');
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
            const parentTask = await taskQueue.createTask({
                title: 'Parent Task',
                description: 'Task that must complete first',
                priority: 1,
                capabilities: ['general']
            });

            // Create child task with dependency
            const childTask = await taskQueue.createTask({
                title: 'Child Task',
                description: 'Task that depends on parent',
                priority: 2,
                capabilities: ['general'],
                dependencies: [parentTask.id]
            });

            // Create agent
            const agent = await agentManager.spawnAgent({
                name: 'Test Agent',
                type: 'General Purpose',
                capabilities: ['general']
            });

            // Child task should not be ready until parent is completed
            const readyTasks = taskQueue.getReadyTasks();
            expect(readyTasks.find((t: any) => t.id === childTask.id)).toBeUndefined();
            expect(readyTasks.find((t: any) => t.id === parentTask.id)).toBeDefined();

            // Complete parent task
            await taskQueue.updateTaskStatus(parentTask.id, 'completed');

            // Now child task should be ready
            const readyTasksAfter = taskQueue.getReadyTasks();
            expect(readyTasksAfter.find((t: any) => t.id === childTask.id)).toBeDefined();

            // Complete child task
            await taskQueue.updateTaskStatus(childTask.id, 'completed');

            // Clean up
            await agentManager.removeAgent(agent.id);
        });

        it('should detect circular dependencies', async () => {
            const task1 = await taskQueue.createTask({
                title: 'Task 1',
                description: 'First task in cycle',
                priority: 1,
                capabilities: ['general']
            });

            const task2 = await taskQueue.createTask({
                title: 'Task 2',
                description: 'Second task in cycle',
                priority: 2,
                capabilities: ['general'],
                dependencies: [task1.id]
            });

            // Try to create circular dependency
            const result = await taskQueue.addDependency(task1.id, task2.id);
            expect(result.success).toBe(false);
            expect(result.errors).toContain('Circular dependency detected');
        });
    });

    describe('Orchestration Integration', () => {
        it('should handle conductor commands through WebSocket', async () => {
            // Start orchestration server
            await orchestrationServer.start(0); // Use random port
            const port = orchestrationServer.getPort();

            // Create WebSocket client to simulate conductor
            const WebSocket = require('ws');
            const client = new WebSocket(`ws://localhost:${port}`);

            await new Promise((resolve) => {
                client.on('open', resolve);
            });

            // Send conductor command to spawn agent
            const spawnCommand = {
                type: 'spawn_agent',
                payload: {
                    name: 'Conductor Agent',
                    type: 'General Purpose',
                    capabilities: ['general']
                }
            };

            client.send(JSON.stringify(spawnCommand));

            // Wait for response
            const response = await new Promise((resolve) => {
                client.on('message', (data: string) => {
                    const message = JSON.parse(data);
                    if (message.type === 'agent_spawned') {
                        resolve(message);
                    }
                });
            });

            expect(response).toBeDefined();
            expect((response as any).payload.agent).toBeDefined();

            // Clean up
            client.close();
            await orchestrationServer.stop();
        });

        it('should handle task assignment through WebSocket', async () => {
            await orchestrationServer.start(0);
            const port = orchestrationServer.getPort();

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

            // Send task creation command
            const createTaskCommand = {
                type: 'create_task',
                payload: {
                    title: 'WebSocket Task',
                    description: 'Task created via WebSocket',
                    priority: 5,
                    capabilities: ['general']
                }
            };

            client.send(JSON.stringify(createTaskCommand));

            // Wait for task creation response
            const taskResponse = await new Promise((resolve) => {
                client.on('message', (data: string) => {
                    const message = JSON.parse(data);
                    if (message.type === 'task_created') {
                        resolve(message);
                    }
                });
            });

            expect(taskResponse).toBeDefined();
            expect((taskResponse as any).payload.task).toBeDefined();

            // Send task assignment command
            const assignCommand = {
                type: 'assign_task',
                payload: {
                    taskId: (taskResponse as any).payload.task.id,
                    agentId: agent.id
                }
            };

            client.send(JSON.stringify(assignCommand));

            // Wait for assignment response
            const assignResponse = await new Promise((resolve) => {
                client.on('message', (data: string) => {
                    const message = JSON.parse(data);
                    if (message.type === 'task_assigned') {
                        resolve(message);
                    }
                });
            });

            expect(assignResponse).toBeDefined();
            expect((assignResponse as any).payload.success).toBe(true);

            // Clean up
            client.close();
            await agentManager.removeAgent(agent.id);
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

            const task = await taskQueue.createTask({
                title: 'Failing Task',
                description: 'Task that will fail',
                priority: 5,
                capabilities: ['general']
            });

            // Assign task
            await taskQueue.assignTask(task.id, agent.id);

            // Simulate agent failure
            await taskQueue.updateTaskStatus(task.id, 'failed');
            expect(taskQueue.getTask(task.id)?.status).toBe('failed');

            // Agent should be marked as error
            expect(agentManager.getAgent(agent.id)?.status).toBe('error');

            // Clean up
            await agentManager.removeAgent(agent.id);
        });

        it('should handle network disconnections gracefully', async () => {
            await orchestrationServer.start(0);
            const port = orchestrationServer.getPort();

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
            expect(orchestrationServer.isRunning()).toBe(true);

            await orchestrationServer.stop();
        });
    });

    describe('Performance Testing', () => {
        it('should handle high-frequency task creation', async () => {
            const { duration } = await measureTime(async () => {
                const tasks = [];
                
                // Create 100 tasks quickly
                for (let i = 0; i < 100; i++) {
                    const task = await taskQueue.createTask({
                        title: `Performance Task ${i}`,
                        description: `High-frequency task ${i}`,
                        priority: Math.floor(Math.random() * 10) + 1,
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
