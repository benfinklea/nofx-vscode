// Mock VS Code
jest.mock('vscode', () => ({
    window: {
        createTerminal: jest.fn(),
        showInformationMessage: jest.fn(),
        showQuickPick: jest.fn(),
        showInputBox: jest.fn()
    },
    workspace: {
        getConfiguration: jest.fn()
    },
    ExtensionContext: {},
    Disposable: { from: jest.fn() }
}), { virtual: true });

import * as vscode from 'vscode';
import { AgentManager } from '../../../agents/AgentManager';
import {
    IAgentLifecycleManager,
    ITerminalManager,
    IWorktreeService,
    IConfigurationService,
    INotificationService,
    ILoggingService,
    IEventBus,
    IErrorHandler,
    IMetricsService
} from '../../../services/interfaces';
import { Agent, AgentConfig } from '../../../agents/types';
import { createMockAgent, createMockTask } from '../../setup';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';

// Mock VS Code extension context
const mockExtensionContext = {
    subscriptions: [],
    extensionPath: '/test/extension',
    globalState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => [])
    },
    workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => [])
    },
    secrets: {
        get: jest.fn(),
        store: jest.fn(),
        delete: jest.fn(),
        onDidChange: jest.fn()
    },
    extensionUri: vscode.Uri.file('/test/extension'),
    storageUri: vscode.Uri.file('/test/storage'),
    globalStorageUri: vscode.Uri.file('/test/global-storage'),
    logUri: vscode.Uri.file('/test/logs'),
    extensionMode: vscode.ExtensionMode.Production,
    extension: {
        id: 'test.extension',
        extensionPath: '/test/extension',
        isActive: true,
        packageJSON: {},
        extensionKind: vscode.ExtensionKind.Workspace,
        exports: {},
        activate: jest.fn()
    }
} as any;

describe('AgentManager', () => {
    let agentManager: AgentManager;
    let mockAgentLifecycleManager: jest.Mocked<IAgentLifecycleManager>;
    let mockTerminalManager: jest.Mocked<ITerminalManager>;
    let mockWorktreeService: jest.Mocked<IWorktreeService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockMetricsService: jest.Mocked<IMetricsService>;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock services
        mockAgentLifecycleManager = {
            spawnAgent: jest.fn(),
            removeAgent: jest.fn(),
            initialize: jest.fn(),
            dispose: jest.fn()
        };

        mockTerminalManager = {
            createTerminal: jest.fn(),
            getTerminal: jest.fn(),
            disposeTerminal: jest.fn(),
            initializeAgentTerminal: jest.fn(),
            createEphemeralTerminal: jest.fn(),
            onTerminalClosed: jest.fn() as any,
            dispose: jest.fn()
        };

        mockWorktreeService = {
            createForAgent: jest.fn(),
            removeForAgent: jest.fn(),
            mergeForAgent: jest.fn(),
            getWorktreePath: jest.fn(),
            isAvailable: jest.fn(() => true),
            cleanupOrphaned: jest.fn(),
            dispose: jest.fn()
        };

        mockConfigService = {
            get: jest.fn(),
            getAll: jest.fn(),
            update: jest.fn(),
            onDidChange: jest.fn() as any,
            validateAll: jest.fn(() => ({ isValid: true, errors: [] })),
            getMaxAgents: jest.fn(() => 3),
            getClaudePath: jest.fn(() => 'claude'),
            isAutoAssignTasks: jest.fn(() => true),
            isUseWorktrees: jest.fn(() => true),
            isShowAgentTerminalOnSpawn: jest.fn(() => true),
            getTemplatesPath: jest.fn(() => '.nofx/templates'),
            isPersistAgents: jest.fn(() => true),
            getLogLevel: jest.fn(() => 'info'),
            getOrchestrationHeartbeatInterval: jest.fn(() => 10000),
            getOrchestrationHeartbeatTimeout: jest.fn(() => 30000),
            getOrchestrationHistoryLimit: jest.fn(() => 1000),
            getOrchestrationPersistencePath: jest.fn(() => '.nofx/orchestration'),
            getOrchestrationMaxFileSize: jest.fn(() => 10485760)
        };

        mockNotificationService = {
            showInformation: jest.fn().mockResolvedValue(undefined),
            showWarning: jest.fn().mockResolvedValue(undefined),
            showError: jest.fn().mockResolvedValue(undefined),
            showQuickPick: jest.fn().mockResolvedValue(undefined),
            showInputBox: jest.fn().mockResolvedValue(undefined),
            withProgress: jest.fn().mockImplementation((options, task) => task({ report: jest.fn() })),
            confirm: jest.fn().mockResolvedValue(true),
            confirmDestructive: jest.fn().mockResolvedValue(true)
        };

        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn() as any,
            getChannel: jest.fn() as any,
            time: jest.fn(),
            timeEnd: jest.fn(),
            dispose: jest.fn()
        };

        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn() as any,
            unsubscribe: jest.fn(),
            once: jest.fn() as any,
            filter: jest.fn(),
            subscribePattern: jest.fn() as any,
            setLoggingService: jest.fn(),
            dispose: jest.fn()
        };

        mockErrorHandler = {
            handleError: jest.fn(),
            handleAsync: jest.fn(),
            wrapSync: jest.fn(),
            withRetry: jest.fn(),
            dispose: jest.fn()
        };

        mockMetricsService = {
            incrementCounter: jest.fn(),
            recordDuration: jest.fn(),
            setGauge: jest.fn(),
            startTimer: jest.fn() as any,
            endTimer: jest.fn(),
            getMetrics: jest.fn(() => []),
            resetMetrics: jest.fn(),
            exportMetrics: jest.fn(() => '{}'),
            getDashboardData: jest.fn(() => ({})),
            dispose: jest.fn()
        };

        // Create AgentManager instance
        agentManager = new AgentManager(mockExtensionContext);
        agentManager.setDependencies(
            mockAgentLifecycleManager,
            mockTerminalManager,
            mockWorktreeService,
            mockConfigService,
            mockNotificationService,
            mockLoggingService,
            mockEventBus,
            mockErrorHandler,
            mockMetricsService
        );
    });

    afterEach(() => {
        agentManager.dispose();
    });

    describe('Initialization', () => {
        it('should initialize successfully', async () => {
            await agentManager.initialize();

            expect(mockAgentLifecycleManager.initialize).toHaveBeenCalled();
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('AgentManager initialized')
            );
        });

        it('should throw error if dependencies not set', async () => {
            const newAgentManager = new AgentManager(mockExtensionContext);

            await expect(newAgentManager.initialize()).rejects.toThrow(
                'AgentManager dependencies not set. Call setDependencies() first.'
            );
        });

        it('should show setup dialog when requested', async () => {
            mockNotificationService.showInformation.mockResolvedValue('Test Claude');

            await agentManager.initialize(true);

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                expect.stringContaining('NofX Conductor ready'),
                'Test Claude',
                'Change Path',
                'Restore Session'
            );
        });

        it('should handle Test Claude selection', async () => {
            mockNotificationService.showInformation.mockResolvedValue('Test Claude');
            const mockTerminal = { show: jest.fn(), sendText: jest.fn() } as any;
            (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);

            await agentManager.initialize(true);

            expect(vscode.window.createTerminal).toHaveBeenCalledWith('Claude Test');
            expect(mockTerminal.show).toHaveBeenCalled();
            expect(mockTerminal.sendText).toHaveBeenCalledWith(
                expect.stringContaining('claude --version')
            );
        });

        it('should handle Change Path selection', async () => {
            mockNotificationService.showInformation.mockResolvedValue('Change Path');
            mockNotificationService.showInputBox.mockResolvedValue('/new/path/claude');

            await agentManager.initialize(true);

            expect(mockNotificationService.showInputBox).toHaveBeenCalledWith({
                prompt: 'Enter Claude command or path',
                value: 'claude',
                placeHolder: 'e.g., claude, /usr/local/bin/claude'
            });
            expect(mockConfigService.update).toHaveBeenCalledWith(
                'claudePath',
                '/new/path/claude',
                vscode.ConfigurationTarget.Global
            );
        });
    });

    describe('Agent Spawning', () => {
        it('should spawn agent successfully', async () => {
            const agentConfig: AgentConfig = {
                name: 'Test Agent',
                type: 'General Purpose'
            };

            const mockAgent = createMockAgent({
                id: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose'
            });
            mockAgentLifecycleManager.spawnAgent.mockResolvedValue(mockAgent);

            const result = await agentManager.spawnAgent(agentConfig);

            expect(result).toBe(mockAgent);
            expect(mockAgentLifecycleManager.spawnAgent).toHaveBeenCalledWith(agentConfig, undefined);
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('agents_created', {
                agentType: 'General Purpose',
                totalAgents: '1'
            });
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_CREATED, {
                agentId: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose'
            });
        });

        it('should spawn agent with restored ID', async () => {
            const agentConfig: AgentConfig = {
                name: 'Restored Agent',
                type: 'General Purpose'
            };

            const mockAgent = createMockAgent({ id: 'restored-agent-1' });
            mockAgentLifecycleManager.spawnAgent.mockResolvedValue(mockAgent);

            await agentManager.spawnAgent(agentConfig, 'restored-agent-1');

            expect(mockAgentLifecycleManager.spawnAgent).toHaveBeenCalledWith(agentConfig, 'restored-agent-1');
        });

        it('should throw error if AgentLifecycleManager not available', async () => {
            const newAgentManager = new AgentManager(mockExtensionContext);
            const agentConfig: AgentConfig = {
                name: 'Test Agent',
                type: 'General Purpose'
            };

            await expect(newAgentManager.spawnAgent(agentConfig)).rejects.toThrow(
                'AgentLifecycleManager not available'
            );
        });
    });

    describe('Agent Removal', () => {
        it('should remove agent successfully', async () => {
            const mockAgent = createMockAgent({ id: 'agent-1' });
            mockAgentLifecycleManager.removeAgent.mockResolvedValue(true);

            const result = await agentManager.removeAgent('agent-1');

            expect(result).toBe(true);
            expect(mockAgentLifecycleManager.removeAgent).toHaveBeenCalledWith('agent-1');
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('agents_removed', {
                agentType: 'General Purpose',
                totalAgents: '0'
            });
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_REMOVED, {
                agentId: 'agent-1',
                name: 'Test Agent'
            });
        });

        it('should handle removal failure', async () => {
            mockAgentLifecycleManager.removeAgent.mockResolvedValue(false);

            const result = await agentManager.removeAgent('agent-1');

            expect(result).toBe(false);
        });

        it('should throw error if AgentLifecycleManager not available', async () => {
            const newAgentManager = new AgentManager(mockExtensionContext);

            await expect(newAgentManager.removeAgent('agent-1')).rejects.toThrow(
                'AgentLifecycleManager not available'
            );
        });
    });

    describe('Task Execution', () => {
        let mockAgent: Agent;
        let mockTask: any;
        let mockTerminal: any;

        beforeEach(() => {
            mockAgent = createMockAgent({ id: 'agent-1', status: 'idle' });
            mockTask = createMockTask({ id: 'task-1', title: 'Test Task' });
            mockTerminal = {
                show: jest.fn(),
                sendText: jest.fn()
            };

            // Set up agent in manager
            (agentManager as any).agents.set('agent-1', mockAgent);
            mockTerminalManager.getTerminal.mockReturnValue(mockTerminal);
        });

        it('should execute task successfully', async () => {
            await agentManager.executeTask('agent-1', mockTask);

            expect(mockAgent.status).toBe('working');
            expect(mockAgent.currentTask).toBe(mockTask);
            expect(mockTerminal.show).toHaveBeenCalled();
            expect(mockTerminal.sendText).toHaveBeenCalledWith(expect.stringContaining('Test Task'));
            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('task_assigned', {
                agentType: 'General Purpose',
                taskPriority: 'medium'
            });
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, {
                agentId: 'agent-1',
                status: 'working'
            });
        });

        it('should throw error for non-existent agent', async () => {
            await expect(agentManager.executeTask('non-existent', mockTask)).rejects.toThrow(
                'Agent non-existent not found'
            );
            expect(mockErrorHandler.handleError).toHaveBeenCalled();
        });

        it('should throw error if TerminalManager not available', async () => {
            const newAgentManager = new AgentManager(mockExtensionContext);
            (newAgentManager as any).agents.set('agent-1', mockAgent);

            await expect(newAgentManager.executeTask('agent-1', mockTask)).rejects.toThrow(
                'TerminalManager not available'
            );
        });

        it('should throw error if agent terminal not found', async () => {
            mockTerminalManager.getTerminal.mockReturnValue(undefined);

            await expect(agentManager.executeTask('agent-1', mockTask)).rejects.toThrow(
                'Agent agent-1 terminal not found'
            );
        });

        it('should show notification after task assignment', async () => {
            await agentManager.executeTask('agent-1', mockTask);

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                expect.stringContaining('Task sent to Test Agent'),
                'View Terminal'
            );
        });
    });

    describe('Task Completion', () => {
        let mockAgent: Agent;
        let mockTask: any;

        beforeEach(() => {
            mockAgent = createMockAgent({
                id: 'agent-1',
                status: 'working',
                currentTask: createMockTask({ id: 'task-1' }),
                tasksCompleted: 0
            });
            mockTask = createMockTask({ id: 'task-1', title: 'Test Task' });

            (agentManager as any).agents.set('agent-1', mockAgent);
        });

        it('should complete task successfully', async () => {
            await agentManager.completeTask('agent-1', mockTask);

            expect(mockAgent.status).toBe('idle');
            expect(mockAgent.currentTask).toBeNull();
            expect(mockAgent.tasksCompleted).toBe(1);
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, {
                agentId: 'agent-1',
                status: 'idle'
            });
            expect(mockEventBus.publish).toHaveBeenCalledWith('agent.task.completed', {
                agentId: 'agent-1',
                task: mockTask
            });
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '✅ Test Agent completed: Test Task'
            );
        });

        it('should handle non-existent agent gracefully', async () => {
            await agentManager.completeTask('non-existent', mockTask);

            // Should not throw or cause errors
            expect(mockEventBus.publish).not.toHaveBeenCalled();
        });
    });

    describe('Agent Querying', () => {
        beforeEach(() => {
            const agents = [
                createMockAgent({ id: 'agent-1', status: 'idle' }),
                createMockAgent({ id: 'agent-2', status: 'working' }),
                createMockAgent({ id: 'agent-3', status: 'idle' })
            ];

            agents.forEach(agent => {
                (agentManager as any).agents.set(agent.id, agent);
            });
        });

        it('should get all active agents', () => {
            const agents = agentManager.getActiveAgents();

            expect(agents).toHaveLength(3);
            expect(agents.map(a => a.id)).toEqual(['agent-1', 'agent-2', 'agent-3']);
        });

        it('should get specific agent by ID', () => {
            const agent = agentManager.getAgent('agent-1');

            expect(agent).toBeDefined();
            expect(agent?.id).toBe('agent-1');
        });

        it('should return undefined for non-existent agent', () => {
            const agent = agentManager.getAgent('non-existent');

            expect(agent).toBeUndefined();
        });

        it('should get idle agents only', () => {
            const idleAgents = agentManager.getIdleAgents();

            expect(idleAgents).toHaveLength(2);
            expect(idleAgents.every(agent => agent.status === 'idle')).toBe(true);
        });

        it('should get agent terminal', () => {
            const mockTerminal = { show: jest.fn(), sendText: jest.fn() } as any;
            mockTerminalManager.getTerminal.mockReturnValue(mockTerminal);

            const terminal = agentManager.getAgentTerminal('agent-1');

            expect(terminal).toBe(mockTerminal);
            expect(mockTerminalManager.getTerminal).toHaveBeenCalledWith('agent-1');
        });

        it('should return undefined if TerminalManager not available', () => {
            const newAgentManager = new AgentManager(mockExtensionContext);

            const terminal = newAgentManager.getAgentTerminal('agent-1');

            expect(terminal).toBeUndefined();
        });
    });

    describe('Agent Updates', () => {
        it('should update agent successfully', () => {
            const mockAgent = createMockAgent({ id: 'agent-1', name: 'Original Name' });
            (agentManager as any).agents.set('agent-1', mockAgent);

            const updatedAgent = { ...mockAgent, name: 'Updated Name' };
            agentManager.updateAgent(updatedAgent);

            const storedAgent = (agentManager as any).agents.get('agent-1');
            expect(storedAgent.name).toBe('Updated Name');
        });

        it('should rename agent', () => {
            const mockAgent = createMockAgent({ id: 'agent-1', name: 'Original Name' });
            (agentManager as any).agents.set('agent-1', mockAgent);

            agentManager.renameAgent('agent-1', 'New Name');

            const storedAgent = (agentManager as any).agents.get('agent-1');
            expect(storedAgent.name).toBe('New Name');
        });

        it('should update agent type', () => {
            const mockAgent = createMockAgent({ id: 'agent-1', type: 'General Purpose' });
            (agentManager as any).agents.set('agent-1', mockAgent);

            agentManager.updateAgentType('agent-1', 'Frontend Specialist');

            const storedAgent = (agentManager as any).agents.get('agent-1');
            expect(storedAgent.type).toBe('Frontend Specialist');
        });
    });

    describe('Terminal Close Handling', () => {
        it('should handle terminal close for working agent', () => {
            const mockAgent = createMockAgent({
                id: 'agent-1',
                status: 'working',
                currentTask: createMockTask({ id: 'task-1', title: 'Test Task' })
            });
            const mockTerminal = { name: 'agent-1-terminal' } as any;

            (agentManager as any).agents.set('agent-1', mockAgent);
            (agentManager as any).findAgentByTerminal = jest.fn().mockReturnValue(mockAgent);

            // Simulate terminal close
            const terminalCloseCallback = mockTerminalManager.onTerminalClosed.mock.calls[0][0];
            terminalCloseCallback(mockTerminal);

            expect(mockAgent.status).toBe('idle');
            expect(mockAgent.currentTask).toBeNull();
            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, {
                agentId: 'agent-1',
                status: 'idle'
            });
            expect(mockEventBus.publish).toHaveBeenCalledWith('agent.task.interrupted', {
                agentId: 'agent-1',
                task: mockAgent.currentTask
            });
            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                expect.stringContaining('Agent Test Agent stopped')
            );
        });

        it('should handle terminal close for idle agent', () => {
            const mockAgent = createMockAgent({ id: 'agent-1', status: 'idle' });
            const mockTerminal = { name: 'agent-1-terminal' } as any;

            (agentManager as any).agents.set('agent-1', mockAgent);
            (agentManager as any).findAgentByTerminal = jest.fn().mockReturnValue(mockAgent);

            // Simulate terminal close
            const terminalCloseCallback = mockTerminalManager.onTerminalClosed.mock.calls[0][0];
            terminalCloseCallback(mockTerminal);

            expect(mockAgent.status).toBe('idle'); // Should remain idle
            expect(mockEventBus.publish).not.toHaveBeenCalledWith('agent.task.interrupted', expect.any(Object));
        });
    });

    describe('Configuration Management', () => {
        it('should set use worktrees configuration', () => {
            agentManager.setUseWorktrees(true);

            expect(mockConfigService.update).toHaveBeenCalledWith(
                'useWorktrees',
                true,
                vscode.ConfigurationTarget.Workspace
            );
        });
    });

    describe('Event Publishing', () => {
        it('should publish agent created event on spawn', async () => {
            const agentConfig: AgentConfig = {
                name: 'Test Agent',
                type: 'General Purpose'
            };

            const mockAgent = createMockAgent({ id: 'agent-1' });
            mockAgentLifecycleManager.spawnAgent.mockResolvedValue(mockAgent);

            await agentManager.spawnAgent(agentConfig);

            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_CREATED, {
                agentId: 'agent-1',
                name: 'Test Agent',
                type: 'General Purpose'
            });
        });

        it('should publish agent removed event on removal', async () => {
            const mockAgent = createMockAgent({ id: 'agent-1', name: 'Test Agent' });
            mockAgentLifecycleManager.removeAgent.mockResolvedValue(true);

            await agentManager.removeAgent('agent-1');

            expect(mockEventBus.publish).toHaveBeenCalledWith(DOMAIN_EVENTS.AGENT_REMOVED, {
                agentId: 'agent-1',
                name: 'Test Agent'
            });
        });
    });

    describe('Metrics Recording', () => {
        it('should record agent creation metrics', async () => {
            const agentConfig: AgentConfig = {
                name: 'Test Agent',
                type: 'General Purpose'
            };

            const mockAgent = createMockAgent({ id: 'agent-1' });
            mockAgentLifecycleManager.spawnAgent.mockResolvedValue(mockAgent);

            await agentManager.spawnAgent(agentConfig);

            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('agents_created', {
                agentType: 'General Purpose',
                totalAgents: '1'
            });
        });

        it('should record task assignment metrics', async () => {
            const mockAgent = createMockAgent({ id: 'agent-1', status: 'idle' });
            const mockTask = createMockTask({ id: 'task-1' });
            const mockTerminal = { show: jest.fn(), sendText: jest.fn() } as any;

            (agentManager as any).agents.set('agent-1', mockAgent);
            mockTerminalManager.getTerminal.mockReturnValue(mockTerminal);

            await agentManager.executeTask('agent-1', mockTask);

            expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith('task_assigned', {
                agentType: 'General Purpose',
                taskPriority: 'medium'
            });
        });
    });

    describe('Disposal', () => {
        it('should dispose properly', () => {
            const mockAgent = createMockAgent({ id: 'agent-1' });
            (agentManager as any).agents.set('agent-1', mockAgent);

            agentManager.dispose();

            expect(mockAgentLifecycleManager.dispose).toHaveBeenCalled();
            expect(mockTerminalManager.dispose).toHaveBeenCalled();
            expect(mockWorktreeService.dispose).toHaveBeenCalled();
        });
    });
});

