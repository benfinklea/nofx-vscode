import * as vscode from 'vscode';
import {
    PersistenceService,
    StoredAgent,
    AgentSession,
    ConversationMessage,
    SessionTask
} from '../../../services/PersistenceService';
import { ILoggingService, IEventBus } from '../../../services/interfaces';
import { EVENTS } from '../../../services/EventConstants';
import { Agent } from '../../../agents/types';
import { createMockExtensionContext, createMockLoggingService, createMockEventBus } from '../../helpers/mockFactories';
import { getAppStateStore } from '../../../state/AppStateStore';
import * as selectors from '../../../state/selectors';
import * as actions from '../../../state/actions';
// Mock fs module
const mockFs = {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    readdirSync: jest.fn()
};
jest.mock('fs', () => mockFs);

// Mock path module
const mockPath = {
    join: jest.fn((...paths: string[]) => paths.join('/')),
    resolve: jest.fn((path: string) => path)
};
jest.mock('path', () => mockPath);

// Mock child_process module
const mockExecSync = jest.fn();
jest.mock('child_process', () => ({
    execSync: mockExecSync
}));

// Mock vscode module
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }]
    }
}));

describe('PersistenceService', () => {
    let persistenceService: PersistenceService;
    let mockContext: vscode.ExtensionContext;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockWorkspaceState: any;
    let mockGlobalState: any;

    // Test data builders
    const createTestAgent = (overrides: Partial<Agent> = {}): Agent => ({
        id: 'test-agent-1',
        name: 'Test Agent',
        type: 'test',
        status: 'idle',
        terminal: {} as vscode.Terminal,
        currentTask: null,
        startTime: new Date('2024-01-01T10:00:00Z'),
        tasksCompleted: 5,
        capabilities: ['testing'],
        template: { id: 'test-template', systemPrompt: 'Test prompt' },
        workingDirectory: '/test/dir',
        ...overrides
    });

    const createTestStoredAgent = (overrides: Partial<StoredAgent> = {}): StoredAgent => ({
        id: 'test-agent-1',
        name: 'Test Agent',
        type: 'test',
        status: 'idle',
        templateId: 'test-template',
        tasksCompleted: 5,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        lastActiveAt: new Date('2024-01-01T11:00:00Z'),
        workingDirectory: '/test/dir',
        ...overrides
    });

    const createTestSession = (overrides: Partial<AgentSession> = {}): AgentSession => ({
        id: 'session-test-1',
        name: 'Test Session',
        agentId: 'test-agent-1',
        agentName: 'Test Agent',
        agentType: 'test',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        lastActiveAt: new Date('2024-01-01T11:00:00Z'),
        sessionDuration: 3600000,
        expiresAt: new Date('2024-01-01T15:00:00Z'),
        status: 'active',
        isClaudeSessionActive: true,
        conversationHistory: [],
        completedTasks: [],
        currentTask: undefined,
        workingDirectory: '/test/dir',
        gitBranch: 'main',
        templateId: 'test-template',
        capabilities: ['testing'],
        systemPrompt: 'Test prompt',
        tasksCompleted: 0,
        totalOutputLines: 0,
        ...overrides
    });

    const createTestMessage = (
        overrides: Partial<Omit<ConversationMessage, 'id' | 'timestamp'>> = {}
    ): Omit<ConversationMessage, 'id' | 'timestamp'> => ({
        type: 'user',
        content: 'Test message',
        metadata: { taskId: 'test-task-1' },
        ...overrides
    });

    const createTestTask = (
        overrides: Partial<Omit<SessionTask, 'id' | 'assignedAt' | 'status'>> = {}
    ): Omit<SessionTask, 'id' | 'assignedAt' | 'status'> => ({
        title: 'Test Task',
        description: 'Test task description',
        priority: 'medium',
        filesModified: [],
        commandsExecuted: [],
        ...overrides
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock states
        mockWorkspaceState = {
            get: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
            keys: jest.fn().mockReturnValue([])
        };

        mockGlobalState = {
            get: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
            setKeysForSync: jest.fn(),
            keys: jest.fn().mockReturnValue([])
        };

        mockContext = {
            ...createMockExtensionContext(),
            workspaceState: mockWorkspaceState,
            globalState: mockGlobalState
        };

        mockLoggingService = createMockLoggingService() as jest.Mocked<ILoggingService>;
        mockEventBus = createMockEventBus() as jest.Mocked<IEventBus>;

        // Reset file system mocks
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readFileSync.mockReturnValue('{}');
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('main');

        persistenceService = new PersistenceService(mockContext, mockLoggingService, mockEventBus);
    });

    afterEach(() => {
        persistenceService?.dispose();
    });

    describe('constructor and initialization', () => {
        it('should initialize with dependencies and set up storage', () => {
            expect(persistenceService).toBeInstanceOf(PersistenceService);
            expect(mockGlobalState.get).toHaveBeenCalledWith('nofx.storage.version');
        });

        it('should perform initial migration when no version exists', async () => {
            mockGlobalState.get.mockReturnValue(undefined);

            const service = new PersistenceService(mockContext, mockLoggingService, mockEventBus);

            // Wait for async initialization
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockGlobalState.update).toHaveBeenCalledWith('nofx.storage.version', '2.0.0');
            expect(mockLoggingService.info).toHaveBeenCalledWith('Persistence storage initialized', {
                version: '2.0.0'
            });

            service.dispose();
        });

        it('should perform version migration when version differs', async () => {
            mockGlobalState.get.mockReturnValue('1.0.0');

            const service = new PersistenceService(mockContext, mockLoggingService, mockEventBus);

            // Wait for async initialization
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockLoggingService.info).toHaveBeenCalledWith('Performing version migration', {
                from: '1.0.0',
                to: '2.0.0'
            });

            service.dispose();
        });

        it('should handle initialization errors', async () => {
            mockGlobalState.get.mockImplementation(() => {
                throw new Error('Storage access error');
            });

            const service = new PersistenceService(mockContext, mockLoggingService, mockEventBus);

            // Wait for async initialization to complete
            await new Promise(resolve => setTimeout(resolve, 50));

            // Check that error was logged (async initialization catches errors)
            expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to initialize storage', expect.any(Error));

            service.dispose();
        });
    });

    describe('Agent Lifecycle Management', () => {
        describe('saveAgent', () => {
            it('should save a new agent successfully', async () => {
                const agent = createTestAgent();
                mockWorkspaceState.get.mockResolvedValue([]);

                await persistenceService.saveAgent(agent);

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.agents',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: agent.id,
                            name: agent.name,
                            type: agent.type,
                            status: agent.status,
                            templateId: agent.template?.id,
                            tasksCompleted: agent.tasksCompleted,
                            workingDirectory: agent.workingDirectory
                        })
                    ])
                );

                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.AGENT_SAVED, {
                    agentId: agent.id,
                    agentName: agent.name
                });

                expect(mockLoggingService.debug).toHaveBeenCalledWith('Agent saved to persistent storage', {
                    agentId: agent.id
                });
            });

            it('should update existing agent', async () => {
                const agent = createTestAgent();
                const existingAgents = [createTestStoredAgent()];
                mockWorkspaceState.get.mockResolvedValue(existingAgents);

                await persistenceService.saveAgent(agent);

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.agents',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: agent.id,
                            name: agent.name
                        })
                    ])
                );

                // Should have only one agent (updated, not duplicated)
                const updateCall = mockWorkspaceState.update.mock.calls.find((call: any) => call[0] === 'nofx.agents');
                expect(updateCall[1]).toHaveLength(1);
            });

            it('should handle agents with no template', async () => {
                const agent = createTestAgent({ template: undefined });
                mockWorkspaceState.get.mockResolvedValue([]);

                await persistenceService.saveAgent(agent);

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.agents',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: agent.id,
                            templateId: undefined
                        })
                    ])
                );
            });

            it('should handle agents with no start time', async () => {
                const agent = createTestAgent({ startTime: undefined });
                mockWorkspaceState.get.mockResolvedValue([]);

                await persistenceService.saveAgent(agent);

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.agents',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: agent.id,
                            createdAt: expect.any(Date)
                        })
                    ])
                );
            });

            it('should handle storage errors', async () => {
                const agent = createTestAgent();
                mockWorkspaceState.get.mockResolvedValue([]);
                mockWorkspaceState.update.mockRejectedValue(new Error('Storage error'));

                await expect(persistenceService.saveAgent(agent)).rejects.toThrow('Storage error');
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to save agent', expect.any(Error));
            });

            it('should handle get storage errors', async () => {
                const agent = createTestAgent();
                mockWorkspaceState.get.mockRejectedValue(new Error('Get storage error'));

                await expect(persistenceService.saveAgent(agent)).rejects.toThrow('Get storage error');
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to save agent', expect.any(Error));
            });
        });

        describe('loadAgents', () => {
            it('should load agents successfully', async () => {
                const storedAgents = [createTestStoredAgent()];
                mockWorkspaceState.get.mockResolvedValue(storedAgents);

                const result = await persistenceService.loadAgents();

                expect(result).toEqual(storedAgents);
                expect(mockLoggingService.debug).toHaveBeenCalledWith('Loaded 1 agents from storage');
            });

            it('should return empty array when no agents stored', async () => {
                mockWorkspaceState.get.mockResolvedValue(undefined);

                const result = await persistenceService.loadAgents();

                expect(result).toEqual([]);
            });

            it('should handle storage errors and return empty array', async () => {
                mockWorkspaceState.get.mockRejectedValue(new Error('Storage error'));

                const result = await persistenceService.loadAgents();

                expect(result).toEqual([]);
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to load agents', expect.any(Error));
            });
        });

        describe('removeAgent', () => {
            it('should remove agent successfully', async () => {
                const storedAgents = [
                    createTestStoredAgent({ id: 'agent-1' }),
                    createTestStoredAgent({ id: 'agent-2' })
                ];
                mockWorkspaceState.get
                    .mockResolvedValueOnce(storedAgents) // for getStoredAgents
                    .mockResolvedValueOnce([]); // for removeSession

                await persistenceService.removeAgent('agent-1');

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.agents',
                    expect.arrayContaining([expect.objectContaining({ id: 'agent-2' })])
                );

                // Should not contain the removed agent
                const updateCall = mockWorkspaceState.update.mock.calls.find((call: any) => call[0] === 'nofx.agents');
                expect(updateCall[1]).toHaveLength(1);
                expect(updateCall[1][0].id).toBe('agent-2');

                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.AGENT_REMOVED, { agentId: 'agent-1' });
                expect(mockLoggingService.debug).toHaveBeenCalledWith('Agent removed from storage', {
                    agentId: 'agent-1'
                });
            });

            it('should handle removing non-existent agent', async () => {
                const storedAgents = [createTestStoredAgent({ id: 'agent-1' })];
                mockWorkspaceState.get.mockResolvedValueOnce(storedAgents).mockResolvedValueOnce([]);

                await persistenceService.removeAgent('non-existent');

                expect(mockWorkspaceState.update).toHaveBeenCalledWith('nofx.agents', storedAgents);
            });

            it('should handle storage errors', async () => {
                mockWorkspaceState.get.mockRejectedValue(new Error('Storage error'));

                await expect(persistenceService.removeAgent('agent-1')).rejects.toThrow('Storage error');
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to remove agent', expect.any(Error));
            });
        });
    });

    describe('Session Management', () => {
        describe('createSession', () => {
            it('should create session successfully', async () => {
                const agent = createTestAgent();
                mockWorkspaceState.get.mockResolvedValue([]);

                const session = await persistenceService.createSession(agent);

                expect(session).toMatchObject({
                    agentId: agent.id,
                    agentName: agent.name,
                    agentType: agent.type,
                    status: 'active',
                    isClaudeSessionActive: true,
                    templateId: agent.template?.id,
                    capabilities: agent.capabilities,
                    systemPrompt: agent.template?.systemPrompt,
                    tasksCompleted: 0,
                    totalOutputLines: 0
                });

                expect(session.id).toMatch(/^session-test-agent-1-\d+$/);
                expect(session.name).toMatch(/^Test Agent - /);
                expect(session.createdAt).toBeInstanceOf(Date);
                expect(session.expiresAt).toBeInstanceOf(Date);

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.sessions',
                    expect.arrayContaining([session])
                );

                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.SESSION_CREATED, {
                    sessionId: session.id,
                    agentId: agent.id,
                    agentName: agent.name
                });

                expect(mockLoggingService.info).toHaveBeenCalledWith(
                    expect.stringMatching(/^Session created: session-test-agent-1-\d+ for Test Agent$/)
                );
            });

            it('should create session without template', async () => {
                const agent = createTestAgent({ template: undefined });
                mockWorkspaceState.get.mockResolvedValue([]);

                const session = await persistenceService.createSession(agent);

                expect(session.templateId).toBeUndefined();
                expect(session.systemPrompt).toBe('');
            });

            it('should create session without capabilities', async () => {
                const agent = createTestAgent({ capabilities: undefined });
                mockWorkspaceState.get.mockResolvedValue([]);

                const session = await persistenceService.createSession(agent);

                expect(session.capabilities).toEqual([]);
            });

            it('should handle git branch extraction', async () => {
                mockExecSync.mockReturnValue('feature-branch\n');
                const agent = createTestAgent();
                mockWorkspaceState.get.mockResolvedValue([]);

                const session = await persistenceService.createSession(agent);

                expect(session.gitBranch).toBe('feature-branch');
                expect(mockExecSync).toHaveBeenCalledWith('git branch --show-current', {
                    encoding: 'utf8',
                    cwd: '/test/workspace'
                });
            });

            it('should handle git branch extraction failure', async () => {
                mockExecSync.mockImplementation(() => {
                    throw new Error('Git error');
                });
                const agent = createTestAgent();
                mockWorkspaceState.get.mockResolvedValue([]);

                const session = await persistenceService.createSession(agent);

                expect(session.gitBranch).toBeUndefined();
            });

            it('should handle storage errors', async () => {
                const agent = createTestAgent();
                mockWorkspaceState.get.mockRejectedValue(new Error('Storage error'));

                await expect(persistenceService.createSession(agent)).rejects.toThrow('Storage error');
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to create session', expect.any(Error));
            });
        });

        describe('addMessage', () => {
            it('should add message to existing session', async () => {
                const session = createTestSession();
                mockWorkspaceState.get.mockResolvedValue([session]);
                const message = createTestMessage();

                await persistenceService.addMessage(session.id, message);

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.sessions',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: session.id,
                            conversationHistory: expect.arrayContaining([
                                expect.objectContaining({
                                    id: expect.stringMatching(/^msg-\d+-\w+$/),
                                    timestamp: expect.any(Date),
                                    type: message.type,
                                    content: message.content,
                                    metadata: message.metadata
                                })
                            ]),
                            lastActiveAt: expect.any(Date),
                            totalOutputLines: 1
                        })
                    ])
                );
            });

            it('should limit conversation history to 500 messages', async () => {
                const session = createTestSession({
                    conversationHistory: Array(501)
                        .fill(null)
                        .map((_, i) => ({
                            id: `msg-${i}`,
                            timestamp: new Date(),
                            type: 'user' as const,
                            content: `Message ${i}`
                        }))
                });
                mockWorkspaceState.get.mockResolvedValue([session]);
                const message = createTestMessage();

                await persistenceService.addMessage(session.id, message);

                const updateCall = mockWorkspaceState.update.mock.calls.find(
                    (call: any) => call[0] === 'nofx.sessions'
                );
                const updatedSession = updateCall[1][0];
                expect(updatedSession.conversationHistory).toHaveLength(500);

                // Should keep the latest messages
                expect(updatedSession.conversationHistory[0].content).toBe('Message 2'); // First kept message
                expect(updatedSession.conversationHistory[499].content).toBe(message.content); // Latest message
            });

            it('should handle session not found', async () => {
                mockWorkspaceState.get.mockResolvedValue([]);
                const message = createTestMessage();

                await persistenceService.addMessage('non-existent', message);

                expect(mockWorkspaceState.update).not.toHaveBeenCalled();
                expect(mockLoggingService.warn).toHaveBeenCalledWith('Session non-existent not found for message');
            });

            it('should handle storage errors', async () => {
                const session = createTestSession();
                mockWorkspaceState.get.mockResolvedValue([session]);
                mockWorkspaceState.update.mockRejectedValue(new Error('Storage error'));
                const message = createTestMessage();

                await expect(persistenceService.addMessage(session.id, message)).rejects.toThrow('Storage error');
                expect(mockLoggingService.error).toHaveBeenCalledWith(
                    'Failed to add message to session',
                    expect.any(Error)
                );
            });
        });

        describe('startTask', () => {
            it('should start task successfully', async () => {
                const session = createTestSession();
                mockWorkspaceState.get.mockResolvedValue([session]);
                const task = createTestTask();

                const taskId = await persistenceService.startTask(session.id, task);

                expect(taskId).toMatch(/^task-\d+-\w+$/);

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.sessions',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: session.id,
                            currentTask: expect.objectContaining({
                                id: taskId,
                                title: task.title,
                                description: task.description,
                                priority: task.priority,
                                assignedAt: expect.any(Date),
                                status: 'in_progress',
                                filesModified: [],
                                commandsExecuted: []
                            }),
                            lastActiveAt: expect.any(Date)
                        })
                    ])
                );

                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.SESSION_TASK_STARTED, {
                    sessionId: session.id,
                    taskId,
                    taskTitle: task.title
                });
            });

            it('should handle session not found', async () => {
                mockWorkspaceState.get.mockResolvedValue([]);
                const task = createTestTask();

                await expect(persistenceService.startTask('non-existent', task)).rejects.toThrow(
                    'Session non-existent not found'
                );
            });

            it('should handle storage errors', async () => {
                const session = createTestSession();
                mockWorkspaceState.get.mockResolvedValue([session]);
                mockWorkspaceState.update.mockRejectedValue(new Error('Storage error'));
                const task = createTestTask();

                await expect(persistenceService.startTask(session.id, task)).rejects.toThrow('Storage error');
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to start task', expect.any(Error));
            });
        });

        describe('completeTask', () => {
            it('should complete task successfully', async () => {
                const currentTask: SessionTask = {
                    id: 'task-123',
                    title: 'Test Task',
                    description: 'Test description',
                    assignedAt: new Date('2024-01-01T10:00:00Z'),
                    status: 'in_progress',
                    priority: 'medium',
                    filesModified: [],
                    commandsExecuted: []
                };
                const session = createTestSession({ currentTask, tasksCompleted: 5 });
                mockWorkspaceState.get.mockResolvedValue([session]);

                await persistenceService.completeTask(session.id, 'task-123', true);

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.sessions',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: session.id,
                            currentTask: undefined,
                            completedTasks: expect.arrayContaining([
                                expect.objectContaining({
                                    id: 'task-123',
                                    status: 'completed',
                                    completedAt: expect.any(Date),
                                    duration: expect.any(Number)
                                })
                            ]),
                            tasksCompleted: 6,
                            lastActiveAt: expect.any(Date)
                        })
                    ])
                );

                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.SESSION_TASK_COMPLETED, {
                    sessionId: session.id,
                    taskId: 'task-123',
                    success: true,
                    duration: expect.any(Number)
                });
            });

            it('should fail task when success is false', async () => {
                const currentTask: SessionTask = {
                    id: 'task-123',
                    title: 'Test Task',
                    description: 'Test description',
                    assignedAt: new Date('2024-01-01T10:00:00Z'),
                    status: 'in_progress',
                    priority: 'medium',
                    filesModified: [],
                    commandsExecuted: []
                };
                const session = createTestSession({ currentTask, tasksCompleted: 5 });
                mockWorkspaceState.get.mockResolvedValue([session]);

                await persistenceService.completeTask(session.id, 'task-123', false);

                const updateCall = mockWorkspaceState.update.mock.calls.find(
                    (call: any) => call[0] === 'nofx.sessions'
                );
                const updatedSession = updateCall[1][0];

                expect(updatedSession.completedTasks[0].status).toBe('failed');
                expect(updatedSession.tasksCompleted).toBe(5); // Should not increment for failed tasks

                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.SESSION_TASK_COMPLETED, {
                    sessionId: session.id,
                    taskId: 'task-123',
                    success: false,
                    duration: expect.any(Number)
                });
            });

            it('should handle mismatched task ID', async () => {
                const currentTask: SessionTask = {
                    id: 'task-123',
                    title: 'Test Task',
                    description: 'Test description',
                    assignedAt: new Date(),
                    status: 'in_progress',
                    priority: 'medium',
                    filesModified: [],
                    commandsExecuted: []
                };
                const session = createTestSession({ currentTask });
                mockWorkspaceState.get.mockResolvedValue([session]);

                await persistenceService.completeTask(session.id, 'wrong-task-id', true);

                expect(mockWorkspaceState.update).not.toHaveBeenCalled();
                expect(mockEventBus.publish).not.toHaveBeenCalled();
            });

            it('should handle session not found', async () => {
                mockWorkspaceState.get.mockResolvedValue([]);

                await persistenceService.completeTask('non-existent', 'task-123', true);

                expect(mockWorkspaceState.update).not.toHaveBeenCalled();
            });

            it('should handle no current task', async () => {
                const session = createTestSession({ currentTask: undefined });
                mockWorkspaceState.get.mockResolvedValue([session]);

                await persistenceService.completeTask(session.id, 'task-123', true);

                expect(mockWorkspaceState.update).not.toHaveBeenCalled();
            });

            it('should handle storage errors', async () => {
                const currentTask: SessionTask = {
                    id: 'task-123',
                    title: 'Test Task',
                    description: 'Test description',
                    assignedAt: new Date(),
                    status: 'in_progress',
                    priority: 'medium',
                    filesModified: [],
                    commandsExecuted: []
                };
                const session = createTestSession({ currentTask });
                mockWorkspaceState.get.mockResolvedValue([session]);
                mockWorkspaceState.update.mockRejectedValue(new Error('Storage error'));

                await expect(persistenceService.completeTask(session.id, 'task-123', true)).rejects.toThrow(
                    'Storage error'
                );
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to complete task', expect.any(Error));
            });
        });

        describe('archiveSession', () => {
            it('should archive session successfully', async () => {
                const session = createTestSession();
                mockWorkspaceState.get.mockResolvedValue([session]);

                await persistenceService.archiveSession(session.id);

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.sessions',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: session.id,
                            status: 'archived',
                            isClaudeSessionActive: false
                        })
                    ])
                );

                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.SESSION_ARCHIVED, {
                    sessionId: session.id,
                    agentName: session.agentName
                });
            });

            it('should handle session not found', async () => {
                mockWorkspaceState.get.mockResolvedValue([]);

                await persistenceService.archiveSession('non-existent');

                expect(mockWorkspaceState.update).not.toHaveBeenCalled();
                expect(mockEventBus.publish).not.toHaveBeenCalled();
            });

            it('should handle storage errors', async () => {
                const session = createTestSession();
                mockWorkspaceState.get.mockResolvedValue([session]);
                mockWorkspaceState.update.mockRejectedValue(new Error('Storage error'));

                await expect(persistenceService.archiveSession(session.id)).rejects.toThrow('Storage error');
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to archive session', expect.any(Error));
            });
        });

        describe('getActiveSessions', () => {
            it('should return only active sessions', async () => {
                const sessions = [
                    createTestSession({ id: 'session-1', status: 'active' }),
                    createTestSession({ id: 'session-2', status: 'archived' }),
                    createTestSession({ id: 'session-3', status: 'active' })
                ];
                mockWorkspaceState.get.mockResolvedValue(sessions);

                const result = await persistenceService.getActiveSessions();

                expect(result).toHaveLength(2);
                expect(result[0].id).toBe('session-1');
                expect(result[1].id).toBe('session-3');
            });

            it('should return empty array when no active sessions', async () => {
                const sessions = [createTestSession({ status: 'archived' }), createTestSession({ status: 'expired' })];
                mockWorkspaceState.get.mockResolvedValue(sessions);

                const result = await persistenceService.getActiveSessions();

                expect(result).toHaveLength(0);
            });

            it('should handle storage errors and return empty array', async () => {
                mockWorkspaceState.get.mockRejectedValue(new Error('Storage error'));

                const result = await persistenceService.getActiveSessions();

                expect(result).toEqual([]);
                expect(mockLoggingService.error).toHaveBeenCalledWith(
                    'Failed to get active sessions',
                    expect.any(Error)
                );
            });
        });
    });

    describe('Data Migration & Versioning', () => {
        describe('file persistence migration', () => {
            it('should migrate agents from file storage', async () => {
                // Setup file system mocks
                mockFs.existsSync.mockImplementation((path: string) => {
                    if (path.includes('.nofx')) return true;
                    if (path.includes('agents.json')) return true;
                    return false;
                });

                mockFs.readFileSync.mockImplementation((path: string) => {
                    if (path.includes('agents.json')) {
                        return JSON.stringify({
                            agents: [createTestStoredAgent()]
                        });
                    }
                    return '{}';
                });

                mockFs.readdirSync.mockReturnValue([]);
                mockGlobalState.get.mockReturnValue(undefined); // Trigger initial migration

                const service = new PersistenceService(mockContext, mockLoggingService, mockEventBus);

                // Wait for async initialization
                await new Promise(resolve => setTimeout(resolve, 10));

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.agents',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: 'test-agent-1',
                            name: 'Test Agent'
                        })
                    ])
                );

                expect(mockLoggingService.debug).toHaveBeenCalledWith('Migrated 1 agents from file storage');

                service.dispose();
            });

            it('should migrate sessions from file storage', async () => {
                const legacySession = {
                    id: 'legacy-session-1',
                    name: 'Legacy Session',
                    agentId: 'test-agent-1',
                    agentName: 'Test Agent',
                    agentType: 'test',
                    createdAt: '2024-01-01T10:00:00Z',
                    lastActiveAt: '2024-01-01T11:00:00Z',
                    status: 'active',
                    conversationHistory: [],
                    completedTasks: [],
                    workingDirectory: '/test/dir',
                    gitBranch: 'main',
                    template: { id: 'test-template' },
                    capabilities: ['testing'],
                    systemPrompt: 'Test prompt',
                    tasksCompleted: 0,
                    totalOutputLines: 0
                };

                mockFs.existsSync.mockImplementation((path: string) => {
                    if (path.includes('.nofx')) return true;
                    if (path.includes('sessions')) return true;
                    return false;
                });

                mockFs.readdirSync.mockReturnValue(['session1.json']);
                mockFs.readFileSync.mockReturnValue(JSON.stringify(legacySession));
                mockGlobalState.get.mockReturnValue(undefined);

                const service = new PersistenceService(mockContext, mockLoggingService, mockEventBus);

                await new Promise(resolve => setTimeout(resolve, 10));

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.sessions',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: 'legacy-session-1',
                            name: 'Legacy Session',
                            status: 'archived', // Legacy sessions are archived
                            isClaudeSessionActive: false,
                            templateId: 'test-template' // Template ID extracted
                        })
                    ])
                );

                service.dispose();
            });

            it('should handle malformed session files gracefully', async () => {
                mockFs.existsSync.mockImplementation((path: string) => {
                    if (path.includes('.nofx')) return true;
                    if (path.includes('sessions')) return true;
                    return false;
                });

                mockFs.readdirSync.mockReturnValue(['bad-session.json', 'good-session.json']);
                mockFs.readFileSync.mockImplementation((path: string) => {
                    if (path.includes('bad-session.json')) {
                        return 'invalid json';
                    }
                    return JSON.stringify({
                        id: 'good-session',
                        name: 'Good Session',
                        agentId: 'test-agent',
                        agentName: 'Test Agent',
                        agentType: 'test',
                        createdAt: '2024-01-01T10:00:00Z'
                    });
                });

                mockGlobalState.get.mockReturnValue(undefined);

                const service = new PersistenceService(mockContext, mockLoggingService, mockEventBus);

                await new Promise(resolve => setTimeout(resolve, 10));

                expect(mockLoggingService.warn).toHaveBeenCalledWith(
                    'Failed to migrate session file',
                    expect.objectContaining({
                        file: 'bad-session.json'
                    })
                );

                // Should still migrate the good session
                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.sessions',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: 'good-session'
                        })
                    ])
                );

                service.dispose();
            });

            it('should handle no workspace folder', async () => {
                (vscode.workspace as any).workspaceFolders = undefined;
                mockGlobalState.get.mockReturnValue(undefined);

                const service = new PersistenceService(mockContext, mockLoggingService, mockEventBus);

                await new Promise(resolve => setTimeout(resolve, 10));

                // Should complete without attempting file migration
                expect(mockFs.existsSync).not.toHaveBeenCalled();

                service.dispose();
            });

            it('should handle file system errors gracefully', async () => {
                mockFs.existsSync.mockImplementation(() => {
                    throw new Error('File system error');
                });
                mockGlobalState.get.mockReturnValue(undefined);

                const service = new PersistenceService(mockContext, mockLoggingService, mockEventBus);

                await new Promise(resolve => setTimeout(resolve, 10));

                expect(mockLoggingService.error).toHaveBeenCalledWith(
                    'File persistence migration failed',
                    expect.any(Error)
                );

                // Should still initialize storage version
                expect(mockGlobalState.update).toHaveBeenCalledWith('nofx.storage.version', '2.0.0');

                service.dispose();
            });
        });

        describe('version migration', () => {
            it('should handle unknown version gracefully', async () => {
                mockGlobalState.get.mockReturnValue('999.0.0');

                const service = new PersistenceService(mockContext, mockLoggingService, mockEventBus);

                await new Promise(resolve => setTimeout(resolve, 0));

                expect(mockLoggingService.warn).toHaveBeenCalledWith('Unknown version for migration', {
                    version: '999.0.0'
                });

                service.dispose();
            });

            it('should handle v1 to v2 migration', async () => {
                mockGlobalState.get.mockReturnValue('1.0.0');

                const service = new PersistenceService(mockContext, mockLoggingService, mockEventBus);

                await new Promise(resolve => setTimeout(resolve, 0));

                expect(mockLoggingService.info).toHaveBeenCalledWith('No migration needed from v1 to v2');

                service.dispose();
            });
        });
    });

    describe('Utility & Cleanup Methods', () => {
        describe('clearAllData', () => {
            it('should clear all stored data', async () => {
                await persistenceService.clearAllData();

                expect(mockWorkspaceState.update).toHaveBeenCalledWith('nofx.agents', undefined);
                expect(mockWorkspaceState.update).toHaveBeenCalledWith('nofx.sessions', undefined);
                expect(mockWorkspaceState.update).toHaveBeenCalledWith('nofx.sessions.active', undefined);
                expect(mockWorkspaceState.update).toHaveBeenCalledWith('nofx.templates.cache', undefined);

                expect(mockLoggingService.info).toHaveBeenCalledWith('All persistence data cleared');
            });

            it('should handle storage errors', async () => {
                mockWorkspaceState.update.mockRejectedValue(new Error('Storage error'));

                await expect(persistenceService.clearAllData()).rejects.toThrow('Storage error');
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to clear all data', expect.any(Error));
            });
        });

        describe('getStorageStats', () => {
            it('should return storage statistics', async () => {
                const agents = [createTestStoredAgent()];
                const sessions = [createTestSession(), createTestSession({ id: 'session-2' })];

                mockWorkspaceState.get.mockResolvedValueOnce(agents).mockResolvedValueOnce(sessions);
                mockGlobalState.get.mockReturnValue('2.0.0');

                const stats = await persistenceService.getStorageStats();

                expect(stats).toEqual({
                    agents: 1,
                    sessions: 2,
                    storageVersion: '2.0.0'
                });
            });

            it('should handle missing version', async () => {
                mockWorkspaceState.get.mockResolvedValue([]);
                mockGlobalState.get.mockReturnValue(undefined);

                const stats = await persistenceService.getStorageStats();

                expect(stats.storageVersion).toBe('unknown');
            });

            it('should handle storage errors', async () => {
                mockWorkspaceState.get.mockRejectedValue(new Error('Storage error'));

                const stats = await persistenceService.getStorageStats();

                expect(stats).toEqual({
                    agents: 0,
                    sessions: 0,
                    storageVersion: 'error'
                });
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to get storage stats', expect.any(Error));
            });
        });
    });

    describe('Private Helper Methods', () => {
        describe('session caching', () => {
            it('should cache sessions in memory for fast access', async () => {
                const agent = createTestAgent();
                mockWorkspaceState.get.mockResolvedValue([]);

                const session = await persistenceService.createSession(agent);

                // Add message should use cached session
                mockWorkspaceState.get.mockClear();
                await persistenceService.addMessage(session.id, createTestMessage());

                // Should not call get again - using cache
                expect(mockWorkspaceState.get).not.toHaveBeenCalled();
            });

            it('should load session from storage if not cached', async () => {
                const session = createTestSession();
                mockWorkspaceState.get.mockResolvedValue([session]);

                await persistenceService.addMessage(session.id, createTestMessage());

                expect(mockWorkspaceState.get).toHaveBeenCalledWith('nofx.sessions');
            });
        });

        describe('concurrent operations', () => {
            it('should handle concurrent agent saves', async () => {
                const agent1 = createTestAgent({ id: 'agent-1' });
                const agent2 = createTestAgent({ id: 'agent-2' });
                mockWorkspaceState.get.mockResolvedValue([]);

                // Start both saves concurrently
                const [result1, result2] = await Promise.all([
                    persistenceService.saveAgent(agent1),
                    persistenceService.saveAgent(agent2)
                ]);

                expect(mockWorkspaceState.update).toHaveBeenCalledTimes(2);
                expect(mockEventBus.publish).toHaveBeenCalledTimes(2);
            });

            it('should handle concurrent session operations', async () => {
                const session = createTestSession();
                mockWorkspaceState.get.mockResolvedValue([session]);
                const message1 = createTestMessage({ content: 'Message 1' });
                const message2 = createTestMessage({ content: 'Message 2' });

                await Promise.all([
                    persistenceService.addMessage(session.id, message1),
                    persistenceService.addMessage(session.id, message2)
                ]);

                expect(mockWorkspaceState.update).toHaveBeenCalledTimes(2);
            });
        });

        describe('data validation and edge cases', () => {
            it('should handle null/undefined agent properties', async () => {
                const agent: any = {
                    id: 'test-agent',
                    name: 'Test Agent',
                    type: 'test',
                    status: 'idle',
                    terminal: {},
                    currentTask: null,
                    startTime: null,
                    tasksCompleted: null,
                    capabilities: null,
                    template: null,
                    workingDirectory: undefined
                };
                mockWorkspaceState.get.mockResolvedValue([]);

                await persistenceService.saveAgent(agent);

                expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                    'nofx.agents',
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: 'test-agent',
                            tasksCompleted: 0,
                            templateId: undefined,
                            workingDirectory: undefined
                        })
                    ])
                );
            });

            it('should handle very large conversation histories', async () => {
                const largeHistory = Array(1000)
                    .fill(null)
                    .map((_, i) => ({
                        id: `msg-${i}`,
                        timestamp: new Date(),
                        type: 'user' as const,
                        content: `Message ${i}`.repeat(100) // Large content
                    }));

                const session = createTestSession({ conversationHistory: largeHistory });
                mockWorkspaceState.get.mockResolvedValue([session]);

                const message = createTestMessage();
                await persistenceService.addMessage(session.id, message);

                const updateCall = mockWorkspaceState.update.mock.calls.find(
                    (call: any) => call[0] === 'nofx.sessions'
                );
                const updatedSession = updateCall[1][0];

                expect(updatedSession.conversationHistory).toHaveLength(500);
            });

            it('should handle special characters in session data', async () => {
                const agent = createTestAgent({
                    name: 'Test Agent 🤖',
                    workingDirectory: '/path/with spaces/and-special-chars!@#$%'
                });
                mockWorkspaceState.get.mockResolvedValue([]);

                const session = await persistenceService.createSession(agent);

                expect(session.agentName).toBe('Test Agent 🤖');
                expect(session.workingDirectory).toBe('/path/with spaces/and-special-chars!@#$%');
            });

            it('should handle empty and null message content', async () => {
                const session = createTestSession();
                mockWorkspaceState.get.mockResolvedValue([session]);

                const emptyMessage = createTestMessage({ content: '' });
                const nullMessage = createTestMessage({ content: null as any });

                await persistenceService.addMessage(session.id, emptyMessage);
                await persistenceService.addMessage(session.id, nullMessage);

                expect(mockWorkspaceState.update).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe('Resource Management and Disposal', () => {
        describe('dispose', () => {
            it('should dispose cleanly', () => {
                const mockDisposable = { dispose: jest.fn() };
                (persistenceService as any).disposables = [mockDisposable];

                persistenceService.dispose();

                expect(mockDisposable.dispose).toHaveBeenCalled();
                expect(mockLoggingService.debug).toHaveBeenCalledWith('PersistenceService disposed');
            });

            it('should clear session cache on dispose', () => {
                // Add session to cache
                const session = createTestSession();
                (persistenceService as any).sessionCache.set(session.id, session);

                persistenceService.dispose();

                expect((persistenceService as any).sessionCache.size).toBe(0);
            });

            it('should handle multiple dispose calls', () => {
                persistenceService.dispose();
                expect(() => persistenceService.dispose()).not.toThrow();
            });
        });

        describe('memory management', () => {
            it('should limit session cache size implicitly', async () => {
                const agent = createTestAgent();
                mockWorkspaceState.get.mockResolvedValue([]);

                // Create many sessions
                const sessions = [];
                for (let i = 0; i < 100; i++) {
                    const session = await persistenceService.createSession({
                        ...agent,
                        id: `agent-${i}`
                    });
                    sessions.push(session);
                }

                // All sessions should be cached (no explicit limit in current implementation)
                expect((persistenceService as any).sessionCache.size).toBe(100);
            });

            it('should remove archived sessions from cache', async () => {
                const session = createTestSession();
                mockWorkspaceState.get.mockResolvedValue([session]);

                // Add to cache first
                await persistenceService.addMessage(session.id, createTestMessage());
                expect((persistenceService as any).sessionCache.has(session.id)).toBe(true);

                // Archive should remove from cache
                await persistenceService.archiveSession(session.id);
                expect((persistenceService as any).sessionCache.has(session.id)).toBe(false);
            });
        });
    });

    describe('Error Recovery and Robustness', () => {
        describe('storage quota exceeded scenarios', () => {
            it('should handle storage quota exceeded errors', async () => {
                const agent = createTestAgent();
                mockWorkspaceState.get.mockResolvedValue([]);

                const quotaError = new Error('QuotaExceededError');
                quotaError.name = 'QuotaExceededError';
                mockWorkspaceState.update.mockRejectedValue(quotaError);

                await expect(persistenceService.saveAgent(agent)).rejects.toThrow('QuotaExceededError');
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to save agent', quotaError);
            });
        });

        describe('concurrent access scenarios', () => {
            it('should handle rapid successive operations', async () => {
                const agent = createTestAgent();
                mockWorkspaceState.get.mockResolvedValue([]);

                // Rapid saves
                const promises = Array(10)
                    .fill(null)
                    .map((_, i) => persistenceService.saveAgent({ ...agent, id: `agent-${i}` }));

                await Promise.all(promises);
                expect(mockWorkspaceState.update).toHaveBeenCalledTimes(10);
            });
        });

        describe('data corruption handling', () => {
            it('should handle corrupted agent data', async () => {
                const corruptedData = 'invalid-json-data';
                mockWorkspaceState.get.mockRejectedValue(new SyntaxError('Unexpected token'));

                const result = await persistenceService.loadAgents();

                expect(result).toEqual([]);
                expect(mockLoggingService.error).toHaveBeenCalledWith('Failed to load agents', expect.any(SyntaxError));
            });

            it('should handle partially corrupted session data', async () => {
                const partialSession = { id: 'partial-session' }; // Missing required fields
                mockWorkspaceState.get.mockResolvedValue([partialSession]);

                const sessions = await persistenceService.getActiveSessions();

                expect(sessions).toEqual([]);
            });
        });
    });

    describe('Integration Scenarios', () => {
        describe('end-to-end agent lifecycle', () => {
            it('should handle complete agent lifecycle', async () => {
                // Start with empty storage
                mockWorkspaceState.get.mockResolvedValue([]);

                // 1. Save agent
                const agent = createTestAgent();
                await persistenceService.saveAgent(agent);

                // 2. Create session
                const session = await persistenceService.createSession(agent);

                // 3. Add messages and tasks
                await persistenceService.addMessage(session.id, createTestMessage());
                const taskId = await persistenceService.startTask(session.id, createTestTask());
                await persistenceService.completeTask(session.id, taskId, true);

                // 4. Archive session
                await persistenceService.archiveSession(session.id);

                // 5. Remove agent
                await persistenceService.removeAgent(agent.id);

                // Verify all operations succeeded
                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.AGENT_SAVED, expect.any(Object));
                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.SESSION_CREATED, expect.any(Object));
                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.SESSION_TASK_STARTED, expect.any(Object));
                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.SESSION_TASK_COMPLETED, expect.any(Object));
                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.SESSION_ARCHIVED, expect.any(Object));
                expect(mockEventBus.publish).toHaveBeenCalledWith(EVENTS.AGENT_REMOVED, expect.any(Object));
            });
        });

        describe('multi-agent scenarios', () => {
            it('should handle multiple agents and sessions concurrently', async () => {
                mockWorkspaceState.get.mockResolvedValue([]);

                const agents = [
                    createTestAgent({ id: 'agent-1', name: 'Agent 1' }),
                    createTestAgent({ id: 'agent-2', name: 'Agent 2' }),
                    createTestAgent({ id: 'agent-3', name: 'Agent 3' })
                ];

                // Save all agents
                await Promise.all(agents.map(agent => persistenceService.saveAgent(agent)));

                // Create sessions for all
                const sessions = await Promise.all(agents.map(agent => persistenceService.createSession(agent)));

                // Add messages to all sessions
                await Promise.all(
                    sessions.map(session => persistenceService.addMessage(session.id, createTestMessage()))
                );

                // Start tasks for all sessions
                const taskIds = await Promise.all(
                    sessions.map(session => persistenceService.startTask(session.id, createTestTask()))
                );

                // Complete all tasks
                await Promise.all(
                    sessions.map((session, i) => persistenceService.completeTask(session.id, taskIds[i], true))
                );

                // Verify all operations
                expect(mockWorkspaceState.update).toHaveBeenCalledTimes(12); // 3 agents + 3 sessions + 3 messages + 3 tasks completed
            });
        });
    });
});
