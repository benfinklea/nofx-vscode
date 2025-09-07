import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { TerminalMonitor, ParsedSubAgentRequest } from '../../../services/TerminalMonitor';
import { TaskToolBridge, SubAgentType, TaskResult } from '../../../services/TaskToolBridge';
import { ILoggingService } from '../../../services/interfaces';

describe('TerminalMonitor', () => {
    let sandbox: sinon.SinonSandbox;
    let terminalMonitor: TerminalMonitor;
    let mockLoggingService: sinon.SinonStubbedInstance<ILoggingService>;
    let mockTaskToolBridge: sinon.SinonStubbedInstance<TaskToolBridge>;
    let mockTerminal: sinon.SinonStubbedInstance<vscode.Terminal>;
    let onDidCloseTerminalStub: sinon.SinonStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        // Create mock services
        mockLoggingService = {
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub(),
            debug: sandbox.stub()
        } as any;

        // Create mock TaskToolBridge
        mockTaskToolBridge = sandbox.createStubInstance(TaskToolBridge) as any;
        mockTaskToolBridge.on = sandbox.stub().returns(mockTaskToolBridge);
        mockTaskToolBridge.executeTaskForAgent = sandbox.stub();

        // Create mock terminal
        mockTerminal = {
            name: 'Test Terminal',
            sendText: sandbox.stub(),
            dispose: sandbox.stub()
        } as any;

        // Stub VS Code window events
        onDidCloseTerminalStub = sandbox.stub();
        (vscode.window as any).onDidCloseTerminal = onDidCloseTerminalStub;
        onDidCloseTerminalStub.returns({ dispose: sandbox.stub() });

        // Create TerminalMonitor instance
        terminalMonitor = new TerminalMonitor(mockLoggingService, mockTaskToolBridge as any);
    });

    afterEach(() => {
        terminalMonitor.dispose();
        sandbox.restore();
    });

    describe('Constructor', () => {
        it('should initialize with correct setup', () => {
            expect(terminalMonitor).to.be.instanceof(TerminalMonitor);
            expect(mockLoggingService.info).to.have.been.calledWith('TerminalMonitor initialized');
        });

        it('should set up TaskToolBridge listeners', () => {
            expect(mockTaskToolBridge.on).to.have.been.calledWith('taskProgress');
            expect(mockTaskToolBridge.on).to.have.been.calledWith('taskCompleted');
            expect(mockTaskToolBridge.on).to.have.been.calledWith('taskFailed');
        });
    });

    describe('startMonitoring', () => {
        it('should start monitoring a terminal', () => {
            const eventSpy = sandbox.spy();
            terminalMonitor.on('monitoringStarted', eventSpy);

            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            expect(mockLoggingService.info).to.have.been.calledWith('Starting terminal monitoring for agent agent-1');
            expect(eventSpy).to.have.been.calledOnce;

            const event = eventSpy.getCall(0).args[0];
            expect(event.terminal).to.equal(mockTerminal);
            expect(event.agentId).to.equal('agent-1');
        });

        it('should warn if terminal already monitored', () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-2');

            expect(mockLoggingService.warn).to.have.been.calledWith(
                'Terminal already being monitored for agent agent-2'
            );
        });

        it('should register terminal close listener', () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            expect(onDidCloseTerminalStub).to.have.been.calledOnce;
        });

        it('should stop monitoring when terminal closes', () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            const closeCallback = onDidCloseTerminalStub.getCall(0).args[0];
            closeCallback(mockTerminal);

            expect(mockLoggingService.info).to.have.been.calledWith('Stopping terminal monitoring for agent agent-1');
        });
    });

    describe('stopMonitoring', () => {
        it('should stop monitoring a terminal', () => {
            const eventSpy = sandbox.spy();
            terminalMonitor.on('monitoringStopped', eventSpy);

            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
            terminalMonitor.stopMonitoring(mockTerminal as any);

            expect(mockLoggingService.info).to.have.been.calledWith('Stopping terminal monitoring for agent agent-1');
            expect(eventSpy).to.have.been.calledOnce;

            const event = eventSpy.getCall(0).args[0];
            expect(event.terminal).to.equal(mockTerminal);
            expect(event.agentId).to.equal('agent-1');
        });

        it('should do nothing if terminal not monitored', () => {
            terminalMonitor.stopMonitoring(mockTerminal as any);

            expect(mockLoggingService.info).to.not.have.been.calledWith('Stopping terminal monitoring');
        });

        it('should dispose of terminal listeners', () => {
            const disposeSpy = sandbox.spy();
            onDidCloseTerminalStub.returns({ dispose: disposeSpy });

            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
            terminalMonitor.stopMonitoring(mockTerminal as any);

            expect(disposeSpy).to.have.been.calledOnce;
        });
    });

    describe('processTerminalData', () => {
        beforeEach(() => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
        });

        it('should detect JSON sub-agent request', async () => {
            const eventSpy = sandbox.spy();
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

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

            expect(eventSpy).to.have.been.calledOnce;
            const event = eventSpy.getCall(0).args[0];
            expect(event.agentId).to.equal('agent-1');
            expect(event.request.type).to.equal(SubAgentType.GENERAL_PURPOSE);
            expect(event.request.description).to.equal('Test task');
            expect(event.request.prompt).to.equal('Do something');
            expect(event.request.priority).to.equal(8);
        });

        it('should detect code review pattern', async () => {
            const eventSpy = sandbox.spy();
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

            const data = `
REVIEW_CODE:
function test() {
    return 42;
}
END_REVIEW
            `;

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(eventSpy).to.have.been.calledOnce;
            const event = eventSpy.getCall(0).args[0];
            expect(event.request.type).to.equal(SubAgentType.CODE_LEAD_REVIEWER);
            expect(event.request.description).to.equal('Code review request');
        });

        it('should detect research pattern', async () => {
            const eventSpy = sandbox.spy();
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

            const data = `
RESEARCH:
Find all authentication implementations in the codebase
END_RESEARCH
            `;

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(eventSpy).to.have.been.calledOnce;
            const event = eventSpy.getCall(0).args[0];
            expect(event.request.type).to.equal(SubAgentType.GENERAL_PURPOSE);
            expect(event.request.description).to.equal('Research task');
        });

        it('should handle buffer overflow', async () => {
            const longData = 'x'.repeat(15000); // Exceeds 10KB buffer limit

            await terminalMonitor.processTerminalData(mockTerminal as any, longData);

            // Should truncate but not crash
            expect(mockLoggingService.error).to.not.have.been.called;
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

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

            expect(mockTaskToolBridge.executeTaskForAgent).to.have.been.calledTwice;
        });

        it('should ignore data from unmonitored terminals', async () => {
            const unmonitoredTerminal = { name: 'Unmonitored' } as any;

            await terminalMonitor.processTerminalData(unmonitoredTerminal, 'SUB_AGENT_REQUEST: {"prompt":"Test"}');

            expect(mockTaskToolBridge.executeTaskForAgent).to.not.have.been.called;
        });
    });

    describe('Sub-agent request handling', () => {
        beforeEach(() => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');
        });

        it('should handle successful sub-agent execution', async () => {
            const completeSpy = sandbox.spy();
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test task"}'
            );

            expect(completeSpy).to.have.been.calledOnce;
            const event = completeSpy.getCall(0).args[0];
            expect(event.result.status).to.equal('success');
            expect(event.responseTime).to.be.greaterThan(0);

            // Check result was sent to terminal
            expect(mockTerminal.sendText).to.have.been.called;
            const terminalOutput = mockTerminal.sendText.getCall(0).args[0];
            expect(terminalOutput).to.include('SUB_AGENT_RESULT');
            expect(terminalOutput).to.include('Status: success');
            expect(terminalOutput).to.include('Task completed successfully');
        });

        it('should handle failed sub-agent execution', async () => {
            const failSpy = sandbox.spy();
            terminalMonitor.on('subAgentRequestFailed', failSpy);

            mockTaskToolBridge.executeTaskForAgent.rejects(new Error('Execution failed'));

            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test task"}'
            );

            expect(failSpy).to.have.been.calledOnce;
            const event = failSpy.getCall(0).args[0];
            expect(event.error).to.equal('Execution failed');

            // Check error was sent to terminal
            expect(mockTerminal.sendText).to.have.been.called;
            const terminalOutput = mockTerminal.sendText.getCall(0).args[0];
            expect(terminalOutput).to.include('SUB_AGENT_ERROR');
            expect(terminalOutput).to.include('Execution failed');
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test"}'
            );

            const terminalOutput = mockTerminal.sendText.getCall(0).args[0];
            expect(terminalOutput).to.include('Status: error');
            expect(terminalOutput).to.include('Task failed with error');
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

            // Execute multiple requests
            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test1"}'
            );

            await terminalMonitor.processTerminalData(mockTerminal as any, 'REVIEW_CODE:\ncode here\nEND_REVIEW');

            const stats = terminalMonitor.getStats();
            expect(stats.totalRequestsDetected).to.equal(2);
            expect(stats.successfulRequests).to.equal(2);
            expect(stats.failedRequests).to.equal(0);
            expect(stats.averageResponseTime).to.be.greaterThan(0);
            expect(stats.requestsByType.get(SubAgentType.GENERAL_PURPOSE)).to.equal(1);
            expect(stats.requestsByType.get(SubAgentType.CODE_LEAD_REVIEWER)).to.equal(1);
        });
    });

    describe('injectSubAgentInstructions', () => {
        it('should inject sub-agent instructions into agent prompt', () => {
            const originalPrompt = 'You are a backend specialist.';
            const injectedPrompt = terminalMonitor.injectSubAgentInstructions(originalPrompt, 'backend');

            expect(injectedPrompt).to.include(originalPrompt);
            expect(injectedPrompt).to.include('Sub-Agent Capabilities');
            expect(injectedPrompt).to.include('REVIEW_CODE');
            expect(injectedPrompt).to.include('RESEARCH');
            expect(injectedPrompt).to.include('SUB_AGENT_REQUEST');
        });
    });

    describe('Monitoring management', () => {
        it('should return list of monitored agents', () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            const terminal2 = { name: 'Terminal 2', sendText: sandbox.stub() } as any;
            terminalMonitor.startMonitoring(terminal2, 'agent-2');

            const agents = terminalMonitor.getMonitoredAgents();
            expect(agents).to.deep.equal(['agent-1', 'agent-2']);
        });

        it('should check if agent is monitored', () => {
            terminalMonitor.startMonitoring(mockTerminal as any, 'agent-1');

            expect(terminalMonitor.isAgentMonitored('agent-1')).to.be.true;
            expect(terminalMonitor.isAgentMonitored('agent-2')).to.be.false;
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

            const data = `
Please review the following code:
function test() {
    return 42;
}
---
            `;

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(mockTaskToolBridge.executeTaskForAgent).to.have.been.calledWith(
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

            const data = 'Find all authentication implementations in the codebase';

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(mockTaskToolBridge.executeTaskForAgent).to.have.been.calledWith(
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

            const data = `
ANALYZE:
The current codebase structure and identify improvements
END_ANALYZE
            `;

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(mockTaskToolBridge.executeTaskForAgent).to.have.been.calledWith(
                'agent-1',
                SubAgentType.GENERAL_PURPOSE,
                'Analysis task',
                sinon.match.string
            );
        });

        it('should handle invalid JSON in SUB_AGENT_REQUEST', async () => {
            const data = 'SUB_AGENT_REQUEST: {invalid json}';

            await terminalMonitor.processTerminalData(mockTerminal as any, data);

            expect(mockLoggingService.error).to.have.been.calledWith('Failed to parse SUB_AGENT_REQUEST JSON');
            expect(mockTaskToolBridge.executeTaskForAgent).to.not.have.been.called;
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

            // Stop monitoring before result delivery
            terminalMonitor.stopMonitoring(mockTerminal as any);

            await terminalMonitor.processTerminalData(
                mockTerminal as any,
                'SUB_AGENT_REQUEST: {"type":"general-purpose","prompt":"Test"}'
            );

            // Should not crash
            expect(mockLoggingService.warn).to.not.have.been.called;
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

            mockTaskToolBridge.executeTaskForAgent.resolves(taskResult);

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

            expect(mockTaskToolBridge.executeTaskForAgent).to.have.been.callCount(5);

            const stats = terminalMonitor.getStats();
            expect(stats.totalRequestsDetected).to.equal(5);
            expect(stats.successfulRequests).to.equal(5);
        });
    });

    describe('Disposal', () => {
        it('should clean up all resources', () => {
            const terminal1 = { name: 'T1', sendText: sandbox.stub() } as any;
            const terminal2 = { name: 'T2', sendText: sandbox.stub() } as any;

            terminalMonitor.startMonitoring(terminal1, 'agent-1');
            terminalMonitor.startMonitoring(terminal2, 'agent-2');

            terminalMonitor.dispose();

            expect(terminalMonitor.getMonitoredAgents()).to.have.lengthOf(0);
            expect(mockLoggingService.info).to.have.been.calledWith('TerminalMonitor disposed');
        });

        it('should remove all event listeners', () => {
            terminalMonitor.on('test', () => {});
            expect(terminalMonitor.listenerCount('test')).to.equal(1);

            terminalMonitor.dispose();

            expect(terminalMonitor.listenerCount('test')).to.equal(0);
        });
    });
});
