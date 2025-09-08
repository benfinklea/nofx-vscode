import { jest } from '@jest/globals';
import {
    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockErrorHandler,
    createMockMetricsService,
    createMockContainer,
    createMockExtensionContext,
    setupVSCodeMocks,
    resetAllMocks
} from './../../helpers/mockFactories';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { TerminalMonitor, ParsedSubAgentRequest } from '../../../services/TerminalMonitor';
import { TaskToolBridge, SubAgentType, TaskResult } from '../../../services/TaskToolBridge';
import { ILoggingService, IConfigurationService } from '../../../services/interfaces';

jest.mock('vscode');

describe('TerminalMonitor', () => {
    let sandbox: sinon.SinonSandbox;
    let terminalMonitor: TerminalMonitor;
    let mockLoggingService: sinon.SinonStubbedInstance<ILoggingService>;
    let mockConfigService: sinon.SinonStubbedInstance<IConfigurationService>;
    let mockTaskToolBridge: sinon.SinonStubbedInstance<TaskToolBridge>;
    let mockTerminal: sinon.SinonStubbedInstance<vscode.Terminal>;
    let onDidCloseTerminalStub: sinon.SinonStub;

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        mockTerminal = createMockTerminal();
        mockConfigService = createMockConfigurationService();
        // Jest handles mock cleanup automatically

        // Create mock services
        mockLoggingService = createMockLoggingService();

        mockConfigService = createMockConfigurationService();

        // Create mock TaskToolBridge
        mockTaskToolBridge = {
            on: jest.fn().mockReturnValueThis(),
            executeTaskForAgent: jest.fn(),
            emit: jest.fn(),
            removeAllListeners: jest.fn(),
            listenerCount: jest.fn().mockReturnValue(0)
        } as any;

        // Create mock terminal
        mockTerminal = {
            name: 'Test Terminal',
            sendText: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Stub VS Code window events
        onDidCloseTerminalStub = jest.fn();
        (vscode.window as any).onDidCloseTerminal = onDidCloseTerminalStub;
        onDidCloseTerminalStub.mockReturnValue({ dispose: jest.fn() });

        // Create TerminalMonitor instance
        terminalMonitor = new TerminalMonitor(mockLoggingService, mockConfigService, mockTaskToolBridge as any);
    });

    afterEach(() => {
        terminalMonitor.dispose();
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        it('should initialize with correct setup', () => {
            expect(terminalMonitor).toBeInstanceOf(TerminalMonitor);
            expect(mockLoggingService.info).toHaveBeenCalledWith('TerminalMonitor initialized', expect.any(Object));
        });

        it('should set up TaskToolBridge listeners', () => {
            expect(mockTaskToolBridge.on).toHaveBeenCalledWith('taskProgress');
            expect(mockTaskToolBridge.on).toHaveBeenCalledWith('taskCompleted');
            expect(mockTaskToolBridge.on).toHaveBeenCalledWith('taskFailed');
        });
    });

    describe('startMonitoring', () => {
        it('should start monitoring a terminal', () => {
            const eventSpy = jest.fn();
            terminalMonitor.on('monitoringStarted', eventSpy);

            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            expect(mockLoggingService.info).toHaveBeenCalledWith('Starting terminal monitoring for agent agent-1');
            expect(eventSpy).toHaveBeenCalledTimes(1);

            const event = eventSpy.mock.calls[0][0];
            expect(event.terminal).toBe(mockTerminal);
            expect(event.agentId).toBe('agent-1');
        });

        it('should warn if terminal already monitored', () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-2');

            expect(mockLoggingService.warn).toHaveBeenCalledWith('Terminal already being monitored for agent agent-2');
        });

        it('should register terminal close listener', () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            expect(onDidCloseTerminalStub).toHaveBeenCalledTimes(1);
        });

        it('should stop monitoring when terminal closes', () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            const closeCallback = onDidCloseTerminalStub.mock.calls[0][0];
            closeCallback(mockTerminal);

            expect(mockLoggingService.info).toHaveBeenCalledWith('Stopping terminal monitoring for agent agent-1');
        });
    });

    describe('stopMonitoring', () => {
        it('should stop monitoring a terminal', () => {
            const eventSpy = jest.fn();
            terminalMonitor.on('monitoringStopped', eventSpy);

            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
            terminalMonitor.stopMonitoring(mockTerminal as any);

            expect(mockLoggingService.info).toHaveBeenCalledWith('Stopping terminal monitoring for agent agent-1');
            expect(eventSpy).toHaveBeenCalledTimes(1);

            const event = eventSpy.mock.calls[0][0];
            expect(event.terminal).toBe(mockTerminal);
            expect(event.agentId).toBe('agent-1');
        });

        it('should do nothing if terminal not monitored', () => {
            terminalMonitor.stopMonitoring(mockTerminal as any);

            expect(mockLoggingService.info).not.toHaveBeenCalledWith('Stopping terminal monitoring');
        });

        it('should dispose of terminal listeners', () => {
            const disposeSpy = jest.fn();
            onDidCloseTerminalStub.mockReturnValue({ dispose: disposeSpy });

            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
            terminalMonitor.stopMonitoring(mockTerminal as any);

            expect(disposeSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('processTerminalData', () => {
        beforeEach(() => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
        });

        it('should detect JSON sub-agent request', async () => {
            const eventSpy = jest.fn();
            terminalMonitor.on('subAgentRequestDetected', eventSpy);

            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Task completed',
                executionTime: 100,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            const data = `
Some terminal output...
SUB_AGENT_REQUEST: {
    "type": "general-purpose",
    "description": "Test task",
    "prompt": "Do something",
    "priority": 8
}
More output...
            `;

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            const event = eventSpy.mock.calls[0][0];
            expect(event.agentId).toBe('agent-1');
            expect(event.request.type).toBe(SubAgentType.GENERAL_PURPOSE);
            expect(event.request.description).toBe('Test task');
            expect(event.request.prompt).toBe('Do something');
            expect(event.request.priority).toBe(8);
        });

        it('should detect code review pattern', async () => {
            const eventSpy = jest.fn();
            terminalMonitor.on('subAgentRequestDetected', eventSpy);

            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.CODE_LEAD_REVIEWER,
                status: 'success',
                result: 'Code reviewed',
                executionTime: 200,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            const data = `
REVIEW_CODE:
function test() {
    return 42;
}
END_REVIEW
            `;

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            const event = eventSpy.mock.calls[0][0];
            expect(event.request.type).toBe(SubAgentType.CODE_LEAD_REVIEWER);
            expect(event.request.description).toBe('Code review request');
        });

        it('should detect research pattern', async () => {
            const eventSpy = jest.fn();
            terminalMonitor.on('subAgentRequestDetected', eventSpy);

            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Research complete',
                executionTime: 300,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            const data = `
RESEARCH:
Find all authentication implementations in the codebase
END_RESEARCH
            `;

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            const event = eventSpy.mock.calls[0][0];
            expect(event.request.type).toBe(SubAgentType.GENERAL_PURPOSE);
            expect(event.request.description).toBe('Research task');
        });

        it('should handle buffer overflow', async () => {
            const longData = 'x'.repeat(15000); // Exceeds 10KB buffer limit

            await terminalMonitor.processTerminalData(mockTerminal as any, longData);

            // Should truncate but not crash
            expect(mockLoggingService.error).not.toHaveBeenCalled;
        });

        it('should clear buffer after processing request', async () => {
            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Done',
                executionTime: 100,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            // First request
            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test1"}'
            );

            // Second request should also work (buffer was cleared)
            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test2"}'
            );

            expect(mockTaskToolBridge.executeTaskForAgent).toHaveBeenCalledTimes(2);
        });

        it('should ignore data from unmonitored terminals', async () => {
            const unmonitoredTerminal = { name: 'Unmonitored' } as any;

            await terminalMonitor.processTerminalData(unmonitoredTerminal, 'SUB_AGENT_REQUEST: {"prompt":"Test"}');

            expect(mockTaskToolBridge.executeTaskForAgent).not.toHaveBeenCalled;
        });
    });

    describe('Sub-agent request handling', () => {
        beforeEach(() => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
        });

        it('should handle successful sub-agent execution', async () => {
            const completeSpy = jest.fn();
            terminalMonitor.on('subAgentRequestCompleted', completeSpy);

            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Task completed successfully',
                executionTime: 150,
                completedAt: new Date(),
                metadata: { key: 'value' }
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test task"}'
            );

            expect(completeSpy).toHaveBeenCalledTimes(1);
            const event = completeSpy.mock.calls[0][0];
            expect(event.result.status).toBe('success');
            expect(event.responseTime).toBeGreaterThan(0);

            // Check result was sent to terminal
            expect(mockTerminal.sendText).toHaveBeenCalled();
            const terminalOutput = mockTerminal.sendText.mock.calls[0][0];
            expect(terminalOutput).toContain('SUB_AGENT_RESULT');
            expect(terminalOutput).toContain('Status: success');
            expect(terminalOutput).toContain('Task completed successfully');
        });

        it('should handle failed sub-agent execution', async () => {
            const failSpy = jest.fn();
            terminalMonitor.on('subAgentRequestFailed', failSpy);

            mockTaskToolBridge.executeTaskForAgent.mockRejectedValue(new Error('Execution failed'));

            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test task"}'
            );

            expect(failSpy).toHaveBeenCalledTimes(1);
            const event = failSpy.mock.calls[0][0];
            expect(event.error).toBe('Execution failed');

            // Check error was sent to terminal
            expect(mockTerminal.sendText).toHaveBeenCalled();
            const terminalOutput = mockTerminal.sendText.mock.calls[0][0];
            expect(terminalOutput).toContain('SUB_AGENT_ERROR');
            expect(terminalOutput).toContain('Execution failed');
        });

        it('should handle task with error status', async () => {
            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'error',
                error: 'Task failed with error',
                executionTime: 100,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test"}'
            );

            const terminalOutput = mockTerminal.sendText.mock.calls[0][0];
            expect(terminalOutput).toContain('Status: error');
            expect(terminalOutput).toContain('Task failed with error');
        });

        it('should track statistics correctly', async () => {
            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Done',
                executionTime: 100,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            // Execute multiple requests
            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test1"}'
            );

            await terminalMonitor.processTerminalData(mockTerminal as any, 'REVIEW_CODE:\ncode here\nEND_REVIEW');

            const stats = terminalMonitor.getStats();
            expect(stats.totalRequestsDetected).toBe(2);
            expect(stats.successfulRequests).toBe(2);
            expect(stats.failedRequests).toBe(0);
            expect(stats.averageResponseTime).toBeGreaterThan(0);
            expect(stats.requestsByType.get(SubAgentType.GENERAL_PURPOSE)).toBe(1);
            expect(stats.requestsByType.get(SubAgentType.CODE_LEAD_REVIEWER)).toBe(1);
        });
    });

    describe('injectSubAgentInstructions', () => {
        it('should inject sub-agent instructions into agent prompt', () => {
            const originalPrompt = 'You are a backend specialist.';
            const injectedPrompt = terminalMonitor.injectSubAgentInstructions(originalPrompt, 'backend');

            expect(injectedPrompt).toContain(originalPrompt);
            expect(injectedPrompt).toContain('Sub-Agent Capabilities');
            expect(injectedPrompt).toContain('REVIEW_CODE');
            expect(injectedPrompt).toContain('RESEARCH');
            expect(injectedPrompt).toContain('SUB_AGENT_REQUEST');
        });
    });

    describe('Monitoring management', () => {
        it('should return list of monitored agents', () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            const terminal2 = { name: 'Terminal 2', sendText: jest.fn() } as any;
            terminalMonitor.startMonitoring(terminal2, 'agent-2');

            const agents = terminalMonitor.getMonitoredAgents();
            expect(agents).toEqual(['agent-1', 'agent-2']);
        });

        it('should check if agent is monitored', () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            expect(terminalMonitor.isAgentMonitored('agent-1')).toBe(true);
            expect(terminalMonitor.isAgentMonitored('agent-2')).toBe(false);
        });
    });

    describe('Pattern detection', () => {
        beforeEach(() => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
        });

        it('should detect "Please review the following code" pattern', async () => {
            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.CODE_LEAD_REVIEWER,
                status: 'success',
                result: 'Reviewed',
                executionTime: 100,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            const data = `
Please review the following code:
function test() {
    return 42;
}
---
            `;

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(mockTaskToolBridge.executeTaskForAgent).toHaveBeenCalledWith(
                'agent-1',
                SubAgentType.CODE_LEAD_REVIEWER,
                'Code review request',
                sinon.match.string
            );
        });

        it('should detect "Find all X in the codebase" pattern', async () => {
            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Found',
                executionTime: 100,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            const data = 'Find all authentication implementations in the codebase';

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(mockTaskToolBridge.executeTaskForAgent).toHaveBeenCalledWith(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Search task',
                'authentication implementations'
            );
        });

        it('should detect ANALYZE pattern', async () => {
            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Analyzed',
                executionTime: 100,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            const data = `
ANALYZE:
The current codebase structure and identify improvements
END_ANALYZE
            `;

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(mockTaskToolBridge.executeTaskForAgent).toHaveBeenCalledWith(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Analysis task',
                sinon.match.string
            );
        });

        it('should handle invalid JSON in SUB_AGENT_REQUEST', async () => {
            const data = 'SUB_AGENT_REQUEST: {invalid json}';

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to parse SUB_AGENT_REQUEST JSON');
            expect(mockTaskToolBridge.executeTaskForAgent).not.toHaveBeenCalled();
        });
    });

    describe('Edge cases', () => {
        it('should handle terminal not found for result delivery', async () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-2', // Different agent
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Done',
                executionTime: 100,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            // Stop monitoring before result delivery
            terminalMonitor.stopMonitoring(mockTerminal as any);

            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test"}'
            );

            // Should not crash
            expect(mockLoggingService.warn).not.toHaveBeenCalled();
        });

        it('should handle multiple rapid requests', async () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            const taskResult: TaskResult = {
                id: 'task-1',
                parentAgentId: 'agent-1',
                type: SubAgentType.GENERAL_PURPOSE,
                status: 'success',
                result: 'Done',
                executionTime: 50,
                completedAt: new Date()
            };

            mockTaskToolBridge.executeTaskForAgent.mockResolvedValue(taskResult);

            // Send multiple requests rapidly
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    terminalMonitor.processTerminalData(
                        mockTerminal as any,
                        `SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test ${i}"}`
                    )
                );
            }

            await Promise.all(promises);

            expect(mockTaskToolBridge.executeTaskForAgent).toHaveBeenCalledTimes(5);

            const stats = terminalMonitor.getStats();
            expect(stats.totalRequestsDetected).toBe(5);
            expect(stats.successfulRequests).toBe(5);
        });
    });

    describe('Disposal', () => {
        it('should clean up all resources', () => {
            const terminal1 = { name: 'T1', sendText: jest.fn() } as any;
            const terminal2 = { name: 'T2', sendText: jest.fn() } as any;

            terminalMonitor.startMonitoring(terminal1, 'agent-1');
            terminalMonitor.startMonitoring(terminal2, 'agent-2');

            terminalMonitor.dispose();

            expect(terminalMonitor.getMonitoredAgents()).toHaveLength(0);
            expect(mockLoggingService.info).toHaveBeenCalledWith('TerminalMonitor disposed');
        });

        it('should remove all event listeners', () => {
            terminalMonitor.on('test', () => {});
            expect(terminalMonitor.listenerCount('test')).toBe(1);

            terminalMonitor.dispose();

            expect(terminalMonitor.listenerCount('test')).toBe(0);
        });
    });
});
