import { ActivityMonitor, AgentActivityStatus } from '../../../services/ActivityMonitor';
import { Agent } from '../../../agents/types';
import * as vscode from 'vscode';

describe('ActivityMonitor', () => {
    let monitor: ActivityMonitor;
    let mockAgent: Agent;
    let mockTerminal: vscode.Terminal;

    beforeEach(() => {
        monitor = new ActivityMonitor();

        mockTerminal = {
            name: 'Test Terminal',
            processId: Promise.resolve(123),
            creationOptions: {},
            exitStatus: undefined,
            state: { isInteractedWith: false },
            sendText: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockAgent = {
            id: 'test-agent-1',
            name: 'Test Agent',
            type: 'frontend',
            status: 'idle',
            terminal: mockTerminal,
            currentTask: null,
            startTime: new Date(),
            tasksCompleted: 0
        };
    });

    afterEach(() => {
        monitor.dispose();
    });

    describe('Agent Monitoring', () => {
        it('should start monitoring an agent', () => {
            monitor.startMonitoring(mockAgent, mockTerminal);

            const status = monitor.getAgentStatus(mockAgent.id);
            expect(status).toBe('active');
        });

        it('should track agent metrics', () => {
            monitor.startMonitoring(mockAgent, mockTerminal);

            const metrics = monitor.getAgentMetrics(mockAgent.id);
            expect(metrics).toBeDefined();
            expect(metrics?.agentId).toBe(mockAgent.id);
            expect(metrics?.taskCompletionCount).toBe(0);
            expect(metrics?.errorCount).toBe(0);
        });

        it('should stop monitoring an agent', () => {
            monitor.startMonitoring(mockAgent, mockTerminal);
            monitor.stopMonitoring(mockAgent.id);

            const status = monitor.getAgentStatus(mockAgent.id);
            expect(status).toBeUndefined();
        });
    });

    describe('Status Management', () => {
        it('should get all agent statuses', () => {
            const agent2: Agent = {
                ...mockAgent,
                id: 'test-agent-2',
                name: 'Test Agent 2'
            };

            monitor.startMonitoring(mockAgent, mockTerminal);
            monitor.startMonitoring(agent2, mockTerminal);

            const statuses = monitor.getAllAgentStatuses();
            expect(statuses.size).toBe(2);
            expect(statuses.get(mockAgent.id)).toBe('active');
            expect(statuses.get(agent2.id)).toBe('active');
        });
    });

    describe('Activity Log', () => {
        it('should maintain activity log', () => {
            monitor.startMonitoring(mockAgent, mockTerminal);

            const log = monitor.getActivityLog();
            expect(log).toBeInstanceOf(Array);
            expect(log.length).toBeGreaterThan(0);
        });

        it('should filter activity log by agent', () => {
            const agent2: Agent = {
                ...mockAgent,
                id: 'test-agent-2',
                name: 'Test Agent 2'
            };

            monitor.startMonitoring(mockAgent, mockTerminal);
            monitor.startMonitoring(agent2, mockTerminal);

            const log = monitor.getActivityLog(mockAgent.id);
            log.forEach(event => {
                expect(event.agentId).toBe(mockAgent.id);
            });
        });
    });

    describe('Event Emission', () => {
        it('should emit monitoring events', done => {
            let eventReceived = false;

            monitor.on('monitoring-event', event => {
                if (!eventReceived) {
                    eventReceived = true;
                    expect(event.agentId).toBe(mockAgent.id);
                    expect(event.type).toBe('status-change');
                    done();
                }
            });

            monitor.startMonitoring(mockAgent, mockTerminal);
        });

        it('should emit agent status change events', done => {
            let eventReceived = false;

            monitor.on('agent-status-changed', data => {
                if (!eventReceived && data.newStatus === 'active') {
                    eventReceived = true;
                    expect(data.agentId).toBe(mockAgent.id);
                    expect(data.newStatus).toBe('active');
                    done();
                }
            });

            monitor.startMonitoring(mockAgent, mockTerminal);
        });
    });
});
