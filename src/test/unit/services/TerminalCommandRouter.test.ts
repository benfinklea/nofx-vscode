import * as vscode from 'vscode';
import { TerminalCommandRouter } from '../../../services/TerminalCommandRouter';
import { AgentManager } from '../../../agents/AgentManager';
import { TaskQueue } from '../../../tasks/TaskQueue';
import { ILoggingService, IEventBus } from '../../../services/interfaces';
import { AGENT_EVENTS, TASK_EVENTS } from '../../../services/EventConstants';
import * as MessageProtocol from '../../../orchestration/MessageProtocol';

// Mock vscode module
jest.mock('vscode', () => ({
    window: {
        terminals: [],
        showInformationMessage: jest.fn(),
        onDidWriteTerminalData: jest.fn()
    },
    Disposable: class {
        dispose = jest.fn();
    }
}));

// Mock MessageProtocol
jest.mock('../../../orchestration/MessageProtocol', () => ({
    extractJsonFromClaudeOutput: jest.fn()
}));

describe('TerminalCommandRouter', () => {
    let router: TerminalCommandRouter;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockTaskQueue: jest.Mocked<TaskQueue>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockTerminal: jest.Mocked<vscode.Terminal>;
    let mockWriteDataHandler: (e: any) => void;

    beforeEach(() => {
        // Create mocks
        mockAgentManager = {
            spawnAgent: jest.fn(),
            getAgent: jest.fn(),
            getActiveAgents: jest.fn(),
            removeAgent: jest.fn()
        } as any;

        mockTaskQueue = {
            addTask: jest.fn(),
            assignTask: jest.fn(),
            getTasksForAgent: jest.fn(),
            getAllTasks: jest.fn()
        } as any;

        mockLoggingService = {
            trace: jest.fn(),
            debug: jest.fn(),
            agents: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn().mockReturnValue(true),
            setConfigurationService: jest.fn(),
            getChannel: jest.fn(),
            time: jest.fn(),
            timeEnd: jest.fn(),
            onDidChangeConfiguration: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn()
        } as any;

        mockTerminal = {
            sendText: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Setup onDidWriteTerminalData mock
        (vscode.window as any).onDidWriteTerminalData = jest.fn(handler => {
            mockWriteDataHandler = handler;
            return { dispose: jest.fn() };
        });

        // Create router
        router = new TerminalCommandRouter(mockAgentManager, mockTaskQueue, mockLoggingService, mockEventBus);

        // Clear all mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        router.dispose();
        jest.clearAllMocks();
    });

    describe('startMonitoring', () => {
        it('should start monitoring terminal successfully', () => {
            router.startMonitoring(mockTerminal);

            expect(mockLoggingService.info).toHaveBeenCalledWith('TerminalCommandRouter: Starting command monitoring');
            expect((vscode.window as any).onDidWriteTerminalData).toHaveBeenCalled();
        });

        it('should handle VS Code version without onDidWriteTerminalData', () => {
            (vscode.window as any).onDidWriteTerminalData = undefined;

            router.startMonitoring(mockTerminal);

            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                'Terminal data monitoring not available in this VS Code version'
            );
            expect(mockLoggingService.info).toHaveBeenCalledWith('Setting up alternative terminal monitoring');
        });

        it('should handle errors during monitoring setup', () => {
            (vscode.window as any).onDidWriteTerminalData = jest.fn(() => {
                throw new Error('Mock error');
            });

            expect(() => router.startMonitoring(mockTerminal)).toThrow('Mock error');
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Failed to start terminal monitoring:',
                expect.any(Error)
            );
        });
    });

    describe('terminal output handling', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should process spawn command from terminal output', async () => {
            const command = { type: 'spawn', role: 'frontend-specialist', name: 'UI Dev' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockAgentManager.spawnAgent.mockResolvedValue({
                id: 'agent-1',
                name: 'UI Dev',
                type: 'frontend-specialist',
                status: 'active'
            } as any);

            // Simulate terminal output
            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockAgentManager.spawnAgent).toHaveBeenCalledWith({
                type: 'frontend-specialist',
                name: 'UI Dev'
            });
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                AGENT_EVENTS.AGENT_CREATED,
                expect.objectContaining({ agent: expect.any(Object) })
            );
        });

        it('should process assign task command', async () => {
            const command = {
                type: 'assign',
                task: 'Create login form',
                agentId: 'agent-1',
                priority: 'high'
            };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            const mockTask = {
                id: 'task-1',
                title: 'Create login form',
                description: 'Create login form',
                priority: 'high'
            };
            mockTaskQueue.addTask.mockReturnValue(mockTask as any);
            mockAgentManager.getAgent.mockReturnValue({
                id: 'agent-1',
                terminal: mockTerminal
            } as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockTaskQueue.addTask).toHaveBeenCalledWith({
                title: 'Create login form',
                description: 'Create login form',
                priority: 'high'
            });
            expect(mockTaskQueue.assignTask).toHaveBeenCalledWith('task-1', 'agent-1');
            expect(mockTerminal.sendText).toHaveBeenCalledWith(expect.stringContaining('New Task Assigned'));
        });

        it('should process status query command', async () => {
            const command = { type: 'status', agentId: 'all' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockAgentManager.getActiveAgents.mockReturnValue([
                { id: 'agent-1', name: 'Frontend Dev', type: 'frontend-specialist', status: 'active' },
                { id: 'agent-2', name: 'Backend Dev', type: 'backend-specialist', status: 'idle' }
            ] as any);
            mockTaskQueue.getTasksForAgent.mockReturnValue([]);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockAgentManager.getActiveAgents).toHaveBeenCalled();
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('Agent Status'));
        });

        it('should process terminate command', async () => {
            const command = { type: 'terminate', agentId: 'agent-1' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockAgentManager.getAgent.mockReturnValue({
                id: 'agent-1',
                name: 'Frontend Dev'
            } as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockAgentManager.removeAgent).toHaveBeenCalledWith('agent-1');
            expect(mockEventBus.publish).toHaveBeenCalledWith(AGENT_EVENTS.AGENT_TERMINATED, { agentId: 'agent-1' });
        });

        it('should handle invalid terminal data type', () => {
            mockWriteDataHandler({ terminal: mockTerminal, data: 123 });

            expect(mockLoggingService.warn).toHaveBeenCalledWith('Invalid terminal data type:', 'number');
        });

        it('should handle buffer overflow', async () => {
            // Create very large data
            const largeData = 'x'.repeat(100001);

            mockWriteDataHandler({ terminal: mockTerminal, data: largeData });

            expect(mockLoggingService.warn).toHaveBeenCalledWith('Terminal buffer overflow, processing and clearing');
        });
    });

    describe('command execution with retry', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should retry failed commands with exponential backoff', async () => {
            jest.setTimeout(10000); // Set timeout for this test
            const command = { type: 'spawn', role: 'frontend-specialist' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            // First two calls fail, third succeeds
            mockAgentManager.spawnAgent
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce({ id: 'agent-1', name: 'Agent 1' } as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });

            // Wait for retries (exponential backoff: 1s, 2s, 4s)
            await new Promise(resolve => setTimeout(resolve, 4000));

            expect(mockAgentManager.spawnAgent).toHaveBeenCalledTimes(3);
            expect(mockLoggingService.warn).toHaveBeenCalledWith(expect.stringContaining('retry 1/3'));
            expect(mockLoggingService.warn).toHaveBeenCalledWith(expect.stringContaining('retry 2/3'));
        });

        it('should fail after MAX_RETRIES', async () => {
            jest.setTimeout(10000); // Set timeout for this test
            const command = { type: 'spawn', role: 'frontend-specialist' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            // All calls fail
            mockAgentManager.spawnAgent.mockRejectedValue(new Error('Persistent error'));

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });

            // Wait for all retries
            await new Promise(resolve => setTimeout(resolve, 8000));

            expect(mockAgentManager.spawnAgent).toHaveBeenCalledTimes(4); // Original + 3 retries
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Failed to execute command after retries:',
                expect.any(Error)
            );
        });
    });

    describe('command queue management', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should queue multiple commands and process them sequentially', async () => {
            const commands = [
                { type: 'spawn', role: 'frontend-specialist' },
                { type: 'spawn', role: 'backend-specialist' },
                { type: 'status', agentId: 'all' }
            ];

            mockAgentManager.spawnAgent.mockResolvedValue({ id: 'agent-1' } as any);
            mockAgentManager.getActiveAgents.mockReturnValue([]);

            // Send multiple commands quickly
            for (const cmd of commands) {
                (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValueOnce(cmd);
                mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(cmd) });
            }

            await new Promise(resolve => setTimeout(resolve, 1000));

            expect(mockAgentManager.spawnAgent).toHaveBeenCalledTimes(2);
            expect(mockAgentManager.getActiveAgents).toHaveBeenCalled();
        });

        it('should limit queue size and remove oldest commands', async () => {
            // Fill queue beyond MAX_QUEUE_SIZE (50)
            for (let i = 0; i < 55; i++) {
                const cmd = { type: 'status', agentId: 'all' };
                (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValueOnce(cmd);
                mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(cmd) });
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockLoggingService.warn).toHaveBeenCalledWith(expect.stringContaining('Command queue full'));
        });
    });

    describe('team spawning', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should spawn small team preset', async () => {
            const command = { type: 'spawn_team', preset: 'small-team' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockAgentManager.spawnAgent.mockResolvedValue({
                id: 'agent-1',
                name: 'frontend-specialist-abc1'
            } as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            // Small team has 2 agents
            expect(mockAgentManager.spawnAgent).toHaveBeenCalledTimes(2);
            expect(mockAgentManager.spawnAgent).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'frontend-specialist' })
            );
            expect(mockAgentManager.spawnAgent).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'backend-specialist' })
            );
        });

        it('should spawn large team preset', async () => {
            const command = { type: 'spawn_team', preset: 'large-team' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockAgentManager.spawnAgent.mockResolvedValue({
                id: 'agent-1',
                name: 'agent'
            } as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            // Large team has 5 agents
            expect(mockAgentManager.spawnAgent).toHaveBeenCalledTimes(5);
        });

        it('should default to standard team for unknown preset', async () => {
            const command = { type: 'spawn_team', preset: 'unknown-preset' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockAgentManager.spawnAgent.mockResolvedValue({
                id: 'agent-1',
                name: 'agent'
            } as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            // Standard team has 3 agents
            expect(mockAgentManager.spawnAgent).toHaveBeenCalledTimes(3);
        });
    });

    describe('help command', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should provide help information', async () => {
            const command = { type: 'help' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Conductor Commands')
            );
        });
    });

    describe('health monitoring', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should report health status', () => {
            const health = router.getHealthStatus();

            expect(health).toEqual({
                isHealthy: true,
                queueSize: 0,
                failedCommands: 0,
                lastHealthCheck: expect.any(Date)
            });
        });

        it('should perform health checks periodically', () => {
            jest.useFakeTimers();

            router.startMonitoring(mockTerminal);

            // Fast-forward 30 seconds (HEALTH_CHECK_INTERVAL)
            jest.advanceTimersByTime(30000);

            const health = router.getHealthStatus();
            expect(health.lastHealthCheck).toBeDefined();

            jest.useRealTimers();
        });

        it('should mark unhealthy after multiple failures', async () => {
            jest.setTimeout(10000); // Set timeout for this test
            const command = { type: 'spawn', role: 'invalid' };
            mockAgentManager.spawnAgent.mockRejectedValue(new Error('Invalid role'));

            // Send multiple failing commands
            for (let i = 0; i < 6; i++) {
                (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValueOnce(command);
                mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            await new Promise(resolve => setTimeout(resolve, 8000));

            const health = router.getHealthStatus();
            expect(health.failedCommands).toBeGreaterThan(5);
        });

        it('should attempt self-healing when unhealthy', () => {
            jest.useFakeTimers();

            // Force unhealthy state
            (router as any).isHealthy = false;

            // Trigger health check
            (router as any).performHealthCheck();

            expect(mockLoggingService.info).toHaveBeenCalledWith('Attempting self-healing of terminal monitoring');

            jest.useRealTimers();
        });
    });

    describe('command validation', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should reject invalid command structure', async () => {
            const invalidCommands = [
                null,
                undefined,
                'string',
                123,
                {
                    /* no type */
                },
                { type: null }
            ];

            for (const cmd of invalidCommands) {
                (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValueOnce(cmd);
                mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(cmd) });
            }

            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Command execution failed'),
                expect.any(String)
            );
        });

        it('should handle unknown command types', async () => {
            const command = { type: 'unknown_command' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockLoggingService.warn).toHaveBeenCalledWith('Unknown command type: unknown_command');
        });
    });

    describe('alternative command types', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should handle spawn_agent as alias for spawn', async () => {
            const command = { type: 'spawn_agent', role: 'frontend-specialist' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockAgentManager.spawnAgent.mockResolvedValue({ id: 'agent-1' } as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockAgentManager.spawnAgent).toHaveBeenCalled();
        });

        it('should handle assign_task as alias for assign', async () => {
            const command = { type: 'assign_task', task: 'Test', agentId: 'agent-1' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockTaskQueue.addTask.mockReturnValue({ id: 'task-1' } as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockTaskQueue.addTask).toHaveBeenCalled();
        });

        it('should handle query_status as alias for status', async () => {
            const command = { type: 'query_status', agentId: 'all' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockAgentManager.getActiveAgents.mockReturnValue([]);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockAgentManager.getActiveAgents).toHaveBeenCalled();
        });

        it('should handle terminate_agent as alias for terminate', async () => {
            const command = { type: 'terminate_agent', agentId: 'agent-1' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockAgentManager.getAgent.mockReturnValue({ id: 'agent-1' } as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockAgentManager.removeAgent).toHaveBeenCalled();
        });
    });

    describe('auto-assign tasks', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should handle auto-assignment for priority tasks', async () => {
            const command = {
                type: 'assign',
                task: 'Critical fix',
                agentId: 'auto',
                priority: 'high'
            };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            mockTaskQueue.addTask.mockReturnValue({ id: 'task-1' } as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockTaskQueue.addTask).toHaveBeenCalledWith({
                title: 'Critical fix',
                description: 'Critical fix',
                priority: 'high'
            });
            // Should not call assignTask for auto-assignment
            expect(mockTaskQueue.assignTask).not.toHaveBeenCalled();
        });
    });

    describe('extractAllCommands', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should extract multiple JSON commands from buffer', async () => {
            const buffer = `
                Some text
                {"type": "spawn", "role": "frontend-specialist"}
                More text
                {"type": "status", "agentId": "all"}
                End
            `;

            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(null);
            mockAgentManager.spawnAgent.mockResolvedValue({ id: 'agent-1' } as any);
            mockAgentManager.getActiveAgents.mockReturnValue([]);

            mockWriteDataHandler({ terminal: mockTerminal, data: buffer });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockAgentManager.spawnAgent).toHaveBeenCalled();
            expect(mockAgentManager.getActiveAgents).toHaveBeenCalled();
        });

        it('should deduplicate identical commands', async () => {
            const buffer = `
                {"type": "status", "agentId": "all"}
                {"type": "status", "agentId": "all"}
            `;

            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(null);
            mockAgentManager.getActiveAgents.mockReturnValue([]);

            mockWriteDataHandler({ terminal: mockTerminal, data: buffer });
            await new Promise(resolve => setTimeout(resolve, 600));

            // Should only be called once due to deduplication
            expect(mockAgentManager.getActiveAgents).toHaveBeenCalledTimes(1);
        });
    });

    describe('stopMonitoring', () => {
        it('should clean up resources when stopping', () => {
            router.startMonitoring(mockTerminal);
            router.stopMonitoring();

            expect(mockLoggingService.info).toHaveBeenCalledWith('TerminalCommandRouter: Stopped monitoring');

            const health = router.getHealthStatus();
            expect(health.queueSize).toBe(0);
            expect(health.failedCommands).toBe(0);
        });

        it('should clear timers when stopping', () => {
            jest.useFakeTimers();
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            router.startMonitoring(mockTerminal);
            router.stopMonitoring();

            expect(clearIntervalSpy).toHaveBeenCalled();

            jest.useRealTimers();
        });
    });

    describe('dispose', () => {
        it('should call stopMonitoring on dispose', () => {
            const stopSpy = jest.spyOn(router, 'stopMonitoring');

            router.dispose();

            expect(stopSpy).toHaveBeenCalled();
        });
    });

    describe('terminate all agents', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should terminate all agents when agentId is "all"', async () => {
            const command = { type: 'terminate', agentId: 'all' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);

            const agents = [
                { id: 'agent-1', name: 'Agent 1' },
                { id: 'agent-2', name: 'Agent 2' }
            ];
            mockAgentManager.getActiveAgents.mockReturnValue(agents as any);

            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(mockAgentManager.removeAgent).toHaveBeenCalledWith('agent-1');
            expect(mockAgentManager.removeAgent).toHaveBeenCalledWith('agent-2');
            expect(mockEventBus.publish).toHaveBeenCalledWith(AGENT_EVENTS.ALL_TERMINATED, {});
        });
    });

    describe('error handling in terminal output', () => {
        beforeEach(() => {
            router.startMonitoring(mockTerminal);
        });

        it('should continue monitoring after terminal data event error', () => {
            // First event throws error
            mockWriteDataHandler({ terminal: mockTerminal, data: null });

            // Should log error but continue
            expect(mockLoggingService.warn).toHaveBeenCalled();

            // Second event should still be processed
            const command = { type: 'help' };
            (MessageProtocol.extractJsonFromClaudeOutput as jest.Mock).mockReturnValue(command);
            mockWriteDataHandler({ terminal: mockTerminal, data: JSON.stringify(command) });

            // Verify router is still working
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('Detected conductor command'),
                command
            );
        });
    });
});
