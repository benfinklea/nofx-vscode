/**
 * Integration tests for Sub-Agent capabilities
 * Tests the full workflow of agents spawning and managing sub-agents
 */

import * as vscode from 'vscode';
import { Agent, AgentStatus } from '../../agents/types';
import { TaskToolBridge, SubAgentType } from '../../services/TaskToolBridge';
import { TerminalMonitor } from '../../services/TerminalMonitor';
import { AgentManager } from '../../agents/AgentManager';
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
} from './../helpers/mockFactories';

import {
    MessageType,
    OrchestratorMessage,
    SpawnSubAgentPayload,
    SubAgentResultPayload
} from '../../orchestration/MessageProtocol';

jest.mock('vscode');

jest.setTimeout(10000);

jest.mock('ws');
describe('Sub-Agent Integration', () => {
    let taskToolBridge: TaskToolBridge;
    let terminalMonitor: TerminalMonitor;
    let agentManager: AgentManager;
    let testAgent: Agent;
    let mockTerminal: vscode.Terminal;

    beforeEach(async () => {
        // Initialize services with mocked dependencies
        const mockLoggingService = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        const mockConfigService = createMockConfigurationService();

        // Start monitoring
        terminalMonitor.startMonitoring(mockTerminal, testAgent.id);
    });

    afterEach(() => {
        taskToolBridge.dispose();
        terminalMonitor.dispose();
    });

    describe('Basic Sub-Agent Workflow', () => {
        it('should detect and execute sub-agent request from terminal', async () => {
            const subAgentStartedPromise = new Promise<any>(resolve => {
                terminalMonitor.once('subAgentRequestDetected', resolve);
            });

            const subAgentCompletedPromise = new Promise<any>(resolve => {
                terminalMonitor.once('subAgentRequestCompleted', resolve);
            });

            // Simulate agent requesting a sub-agent
            const terminalData = `
                Working on API implementation...
                I need to analyze the existing code structure first.
                
                SUB_AGENT_REQUEST: {
                    "type": "general-purpose",
                    "description": "Analyze API structure",
                    "prompt": "Analyze all API endpoints in the /api directory and identify patterns",
                    "priority": 8
                }
                
                Waiting for analysis results...
            `;

            // Mock successful task execution
            jest.spyOn(taskToolBridge, 'executeTaskForAgent').mockResolvedValue({
                id: 'task-123',
                parentAgentId: testAgent.id,
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Found 15 API endpoints following RESTful patterns',
                executionTime: 2500,
                completedAt: new Date()
            });

            // Process terminal data
            await terminalMonitor.processTerminalData(mockTerminal, terminalData);

            // Wait for events
            const startedEvent = await subAgentStartedPromise;
            const completedEvent = await subAgentCompletedPromise;

            // Verify request was detected
            expect(startedEvent.agentId).toBe(testAgent.id);
            expect(startedEvent.request.type).toBe(SubAgentType.GENERAL_PURPOSE);
            expect(startedEvent.request.description).toBe('Analyze API structure');

            // Verify completion
            expect(completedEvent.result.status).toBe('success');
            expect(completedEvent.result.result).toContain('15 API endpoints');

            // Verify result was sent back to terminal
            expect(mockTerminal.sendText).toHaveBeenCalled();
            const terminalResponse = (mockTerminal.sendText as jest.Mock).mock.calls[0][0];
            expect(terminalResponse).toContain('SUB_AGENT_RESULT');
            expect(terminalResponse).toContain('Status: success');
        });

        it('should handle parallel sub-agent requests', async () => {
            const requests: any[] = [];
            const completions: any[] = [];

            terminalMonitor.on('subAgentRequestDetected', event => {
                requests.push(event);
            });

            terminalMonitor.on('subAgentRequestCompleted', event => {
                completions.push(event);
            });

            // Mock task execution to return different results
            let taskCounter = 0;
            jest.spyOn(taskToolBridge, 'executeTaskForAgent').mockImplementation(async () => {
                const taskId = `task-${++taskCounter}`;
                return {
                    id: taskId,
                    parentAgentId: testAgent.id,
                    type: SubAgentType.GENERAL_PURPOSE,
                    status: 'success',
                    result: `Result for ${taskId}`,
                    executionTime: 1000 * taskCounter,
                    completedAt: new Date()
                };
            });

            // Send multiple sub-agent requests
            const parallelRequest = `
                PARALLEL_TASKS: [
                    {"type": "general-purpose", "prompt": "Analyze dependencies"},
                    {"type": "general-purpose", "prompt": "Review security"},
                    {"type": "general-purpose", "prompt": "Check test coverage"}
                ]
            `;

            // Process each task as separate request (simulating parsed parallel tasks)
            await terminalMonitor.processTerminalData(
                mockTerminal,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Analyze dependencies"}'
            );
            await terminalMonitor.processTerminalData(
                mockTerminal,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Review security"}'
            );
            await terminalMonitor.processTerminalData(
                mockTerminal,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Check test coverage"}'
            );

            // Verify all requests were processed
            expect(requests).toHaveLength(3);
            expect(completions).toHaveLength(3);

            // Verify statistics
            const stats = terminalMonitor.getStats();
            expect(stats.totalRequestsDetected).toBe(3);
            expect(stats.successfulRequests).toBe(3);
            expect(stats.requestsByType.get(SubAgentType.GENERAL_PURPOSE)).toBe(3);
        });

        it('should enforce max concurrent sub-agents per agent', async () => {
            // Configure max 2 concurrent tasks
            const configService = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    if (key === 'nofx.subAgents.maxPerAgent') return 2;
                    return defaultValue;
                }),
                onDidChange: jest.fn(() => ({ dispose: jest.fn() }))
            };

            const limitedBridge = new TaskToolBridge(
                { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any,
                configService as any
            );

            // Try to execute 3 tasks
            const task1 = limitedBridge.executeTaskForAgent(
                testAgent.id,
                SubAgentType.GENERAL_PURPOSE,
                'Task 1',
                'Do task 1'
            );

            const task2 = limitedBridge.executeTaskForAgent(
                testAgent.id,
                SubAgentType.GENERAL_PURPOSE,
                'Task 2',
                'Do task 2'
            );

            const task3 = limitedBridge.executeTaskForAgent(
                testAgent.id,
                SubAgentType.GENERAL_PURPOSE,
                'Task 3',
                'Do task 3'
            );

            // Task 3 should be queued
            const queuedTasks = limitedBridge.getQueuedTasks(testAgent.id);
            expect(queuedTasks).toHaveLength(1);
            expect(queuedTasks[0].description).toBe('Task 3');

            limitedBridge.dispose();
        });
    });

    describe('Code Review Integration', () => {
        it('should automatically trigger code review after implementation', async () => {
            // Enable auto-review
            testAgent.template!.subAgentCapabilities!.autoReview = true;

            const reviewRequestPromise = new Promise<any>(resolve => {
                terminalMonitor.once('subAgentRequestDetected', event => {
                    if (event.request.type === SubAgentType.CODE_LEAD_REVIEWER) {
                        resolve(event);
                    }
                });
            });

            // Simulate code implementation followed by review request
            const terminalData = `
                Implementation complete. Now requesting code review.
                
                REVIEW_CODE:
                function calculateTotal(items) {
                    let total = 0;
                    for (const item of items) {
                        total += item.price * item.quantity;
                    }
                    return total;
                }
                END_REVIEW
            `;

            // Mock review result
            jest.spyOn(taskToolBridge, 'executeTaskForAgent').mockResolvedValue({
                id: 'review-task-1',
                parentAgentId: testAgent.id,
                type: SubAgentType.CODE_LEAD_REVIEWER,
                status: 'success',
                result: `Code Review Results:
                    - Missing input validation
                    - No error handling for null/undefined items
                    - Consider using reduce() for better readability
                    - Add JSDoc comments
                    - Add unit tests`,
                executionTime: 3000,
                completedAt: new Date()
            });

            await terminalMonitor.processTerminalData(mockTerminal, terminalData);

            const reviewEvent = await reviewRequestPromise;

            // Verify review was triggered
            expect(reviewEvent.request.type).toBe(SubAgentType.CODE_LEAD_REVIEWER);
            expect(reviewEvent.request.description).toBe('Code review request');

            // Verify review results were sent back
            expect(mockTerminal.sendText).toHaveBeenCalled();
            const response = (mockTerminal.sendText as jest.Mock).mock.calls[0][0];
            expect(response).toContain('Code Review Results');
            expect(response).toContain('Missing input validation');
        });
    });

    describe('Error Handling', () => {
        it('should handle sub-agent failures gracefully', async () => {
            const failurePromise = new Promise<any>(resolve => {
                terminalMonitor.once('subAgentRequestFailed', resolve);
            });

            // Mock task failure
            jest.spyOn(taskToolBridge, 'executeTaskForAgent').mockRejectedValue(new Error('Claude process failed'));

            const terminalData = 'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Failing task"}';

            await terminalMonitor.processTerminalData(mockTerminal, terminalData);

            const failureEvent = await failurePromise;

            // Verify failure was handled
            expect(failureEvent.error).toBe('Claude process failed');

            // Verify error was sent to terminal
            expect(mockTerminal.sendText).toHaveBeenCalled();
            const errorMessage = (mockTerminal.sendText as jest.Mock).mock.calls[0][0];
            expect(errorMessage).toContain('SUB_AGENT_ERROR');
            expect(errorMessage).toContain('Claude process failed');

            // Verify statistics
            const stats = terminalMonitor.getStats();
            expect(stats.failedRequests).toBe(1);
        });

        it('should handle sub-agent timeout', async () => {
            jest.useFakeTimers();

            const timeoutPromise = new Promise<any>(resolve => {
                taskToolBridge.once('taskTimeout', resolve);
            });

            // Start task with short timeout
            const taskPromise = taskToolBridge.executeTaskForAgent(
                testAgent.id,
                SubAgentType.GENERAL_PURPOSE,
                'Timeout test',
                'This will timeout',
                { timeout: 1000 }
            );

            // Advance time to trigger timeout
            jest.advanceTimersByTime(1001);

            const result = await taskPromise;

            // Verify timeout occurred
            expect(result.status).toBe('timeout');
            expect(result.error).toContain('timed out after 1000ms');

            // Verify statistics
            const stats = taskToolBridge.getStats();
            expect(stats.timeoutTasks).toBe(1);

            jest.useRealTimers();
        });
    });

    describe('Preset Tasks', () => {
        it('should execute preset task from template', async () => {
            // Get preset task from template
            const presetTask = testAgent.template!.subAgentCapabilities!.presetTasks![0];

            // Mock execution
            jest.spyOn(taskToolBridge, 'executeTaskForAgent').mockResolvedValue({
                id: 'preset-task-1',
                parentAgentId: testAgent.id,
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Dependencies analyzed',
                executionTime: 2000,
                completedAt: new Date()
            });

            // Execute preset task
            const result = await taskToolBridge.executeTaskForAgent(
                testAgent.id,
                SubAgentType.GENERAL_PURPOSE,
                presetTask.description,
                presetTask.prompt
            );

            expect(result.status).toBe('success');
            expect(result.result).toBe('Dependencies analyzed');
        });
    });

    describe('WebSocket Integration', () => {
        it('should send sub-agent messages through WebSocket', async () => {
            const mockWebSocket = {
                send: jest.fn(),
                readyState: 1 // OPEN
            };

            // Create spawn sub-agent message
            const spawnMessage: OrchestratorMessage = {
                id: 'msg-123',
                timestamp: new Date().toISOString(),
                from: testAgent.id,
                to: 'conductor',
                type: MessageType.SPAWN_SUB_AGENT,
                payload: {
                    parentAgentId: testAgent.id,
                    subAgentType: 'general-purpose',
                    taskDescription: 'Research task',
                    prompt: 'Research authentication patterns'
                } as SpawnSubAgentPayload
            };

            // Send through WebSocket
            mockWebSocket.send(JSON.stringify(spawnMessage));

            // Verify message was sent
            expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(spawnMessage));
        });

        it('should handle sub-agent result messages', () => {
            // Create result message
            const resultMessage: OrchestratorMessage = {
                id: 'msg-456',
                timestamp: new Date().toISOString(),
                from: 'system',
                to: testAgent.id,
                type: MessageType.SUB_AGENT_RESULT,
                payload: {
                    parentAgentId: testAgent.id,
                    subAgentId: 'task-789',
                    status: 'success',
                    result: 'Research complete',
                    executionTime: 5000,
                    completedAt: new Date().toISOString()
                } as SubAgentResultPayload
            };

            // Verify message structure
            expect(resultMessage.type).toBe(MessageType.SUB_AGENT_RESULT);
            expect(resultMessage.payload.status).toBe('success');
        });
    });

    describe('Performance and Statistics', () => {
        it('should track sub-agent performance metrics', async () => {
            // Execute multiple tasks with different execution times
            const executionTimes = [1000, 2000, 1500, 3000, 2500];

            for (let i = 0; i < executionTimes.length; i++) {
                jest.spyOn(taskToolBridge, 'executeTaskForAgent').mockResolvedValueOnce({
                    id: `task-${i}`,
                    parentAgentId: testAgent.id,
                    type: SubAgentType.GENERAL_PURPOSE,
                    status: 'success',
                    result: `Result ${i}`,
                    executionTime: executionTimes[i],
                    completedAt: new Date()
                });

                await terminalMonitor.processTerminalData(
                    mockTerminal,
                    `SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Task ${i}"}`
                );
            }

            // Get statistics
            const bridgeStats = taskToolBridge.getStats();
            const monitorStats = terminalMonitor.getStats();

            // Verify bridge statistics
            expect(bridgeStats.totalTasks).toBe(5);
            expect(bridgeStats.successfulTasks).toBe(5);
            expect(bridgeStats.averageExecutionTime).toBeGreaterThan(0);

            // Verify monitor statistics
            expect(monitorStats.totalRequestsDetected).toBe(5);
            expect(monitorStats.successfulRequests).toBe(5);
            expect(monitorStats.averageResponseTime).toBeGreaterThan(0);
        });

        it('should track agent-specific statistics', async () => {
            // Create multiple agents
            const agent1 = { ...testAgent, id: 'agent-1' };
            const agent2 = { ...testAgent, id: 'agent-2', name: 'Frontend Dev' };

            const terminal1 = { ...mockTerminal, name: 'Agent 1' };
            const terminal2 = { ...mockTerminal, name: 'Agent 2' };

            terminalMonitor.startMonitoring(terminal1 as any, agent1.id);
            terminalMonitor.startMonitoring(terminal2 as any, agent2.id);

            // Mock executions
            jest.spyOn(taskToolBridge, 'executeTaskForAgent').mockResolvedValue({
                id: 'task-1',
                parentAgentId: agent1.id,
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Done',
                executionTime: 1000,
                completedAt: new Date()
            });

            // Execute tasks for different agents
            await terminalMonitor.processTerminalData(
                terminal1 as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Agent 1 task"}'
            );

            await terminalMonitor.processTerminalData(
                terminal2 as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Agent 2 task"}'
            );

            // Get agent-specific stats
            const agent1Stats = taskToolBridge.getAgentStats(agent1.id);
            const agent2Stats = taskToolBridge.getAgentStats(agent2.id);

            // Both agents should have their tasks tracked
            expect(agent1Stats.totalTasks).toBeGreaterThan(0);
            expect(agent2Stats.totalTasks).toBeGreaterThan(0);
        });
    });
});
