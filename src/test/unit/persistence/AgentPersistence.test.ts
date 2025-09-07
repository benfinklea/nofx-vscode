import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { AgentPersistence } from '../../../persistence/AgentPersistence';
import { Agent } from '../../../agents/types';
import { ILoggingService } from '../../../services/interfaces';

jest.mock('fs');
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    promises: {
        readdir: jest.fn(),
        unlink: jest.fn(),
        mkdir: jest.fn(),
        copyFile: jest.fn()
    }
}));

describe('AgentPersistence', () => {
    let agentPersistence: AgentPersistence;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let workspaceRoot: string;

    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;

    beforeEach(() => {
        // Mock logging service
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn().mockReturnValue(false),
            getChannel: jest.fn(),
            time: jest.fn(),
            timeEnd: jest.fn(),
            onDidChangeConfiguration: jest.fn(),
            dispose: jest.fn()
        } as any;

        workspaceRoot = '/test/workspace';

        // Reset all mocks
        jest.clearAllMocks();

        // Mock fs methods
        mockFs.existsSync = jest.fn().mockReturnValue(false);
        mockFs.mkdirSync = jest.fn();
        mockFs.writeFileSync = jest.fn();
        mockFs.readFileSync = jest.fn();
        mockFs.appendFileSync = jest.fn();
        mockFs.unlinkSync = jest.fn();
        mockFs.readdirSync = jest.fn().mockReturnValue([]);
        mockFs.statSync = jest.fn();
        mockFs.renameSync = jest.fn();

        // Mock fs.promises methods
        mockFsPromises.readdir = jest.fn().mockResolvedValue([]);
        mockFsPromises.unlink = jest.fn().mockResolvedValue(undefined);
        mockFsPromises.mkdir = jest.fn().mockResolvedValue(undefined);
        mockFsPromises.copyFile = jest.fn().mockResolvedValue(undefined);

        agentPersistence = new AgentPersistence(workspaceRoot, mockLoggingService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with workspace root and logging service', () => {
            const persistence = new AgentPersistence(workspaceRoot, mockLoggingService);
            expect(persistence).toBeDefined();
        });

        it('should initialize without logging service', () => {
            const persistence = new AgentPersistence(workspaceRoot);
            expect(persistence).toBeDefined();
        });

        it('should create persistence directories on initialization', () => {
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            new AgentPersistence(workspaceRoot, mockLoggingService);

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(path.join(workspaceRoot, '.nofx'), { recursive: true });
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(path.join(workspaceRoot, '.nofx', 'sessions'), {
                recursive: true
            });
        });

        it('should not create directories if they already exist', () => {
            mockFs.existsSync = jest.fn().mockReturnValue(true);

            new AgentPersistence(workspaceRoot, mockLoggingService);

            expect(mockFs.mkdirSync).not.toHaveBeenCalled();
        });

        it('should log directory creation', () => {
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            new AgentPersistence(workspaceRoot, mockLoggingService);

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Created persistence directory')
            );
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Created sessions directory')
            );
        });
    });

    describe('saveAgentState', () => {
        it('should save agent state to JSON file', async () => {
            const agents: Agent[] = [
                {
                    id: 'agent-1',
                    name: 'Test Agent 1',
                    type: 'frontend',
                    status: 'idle',
                    terminal: {} as any,
                    currentTask: null,
                    startTime: new Date('2023-01-01'),
                    tasksCompleted: 5,
                    template: { name: 'frontend-template' }
                },
                {
                    id: 'agent-2',
                    name: 'Test Agent 2',
                    type: 'backend',
                    status: 'working',
                    terminal: {} as any,
                    currentTask: {
                        id: 'task-1',
                        title: 'Test Task',
                        description: 'Test description',
                        priority: 'high',
                        status: 'in-progress',
                        createdAt: new Date()
                    },
                    startTime: new Date('2023-01-02'),
                    tasksCompleted: 3,
                    template: { name: 'backend-template' }
                }
            ];

            await agentPersistence.saveAgentState(agents);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'agents.json'),
                expect.stringContaining('"agents"')
            );
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Saved state for 2 agents');
        });

        it('should save correct agent data structure', async () => {
            const agents: Agent[] = [
                {
                    id: 'test-agent',
                    name: 'Test Agent',
                    type: 'fullstack',
                    status: 'idle',
                    terminal: {} as any,
                    currentTask: null,
                    startTime: new Date('2023-01-01T10:00:00.000Z'),
                    tasksCompleted: 0,
                    template: { name: 'test-template' }
                }
            ];

            await agentPersistence.saveAgentState(agents);

            const savedData = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1]);

            expect(savedData).toMatchObject({
                version: '1.0',
                timestamp: expect.any(String),
                agents: [
                    {
                        id: 'test-agent',
                        name: 'Test Agent',
                        type: 'fullstack',
                        status: 'idle',
                        template: { name: 'test-template' },
                        tasksCompleted: 0,
                        currentTask: null,
                        sessionFile: 'test-agent_session.md',
                        createdAt: '2023-01-01T10:00:00.000Z'
                    }
                ]
            });
        });

        it('should handle empty agent array', async () => {
            await agentPersistence.saveAgentState([]);

            const savedData = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1]);
            expect(savedData.agents).toEqual([]);
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Saved state for 0 agents');
        });

        it('should handle agents with complex current tasks', async () => {
            const agents: Agent[] = [
                {
                    id: 'agent-complex',
                    name: 'Complex Agent',
                    type: 'testing',
                    status: 'working',
                    terminal: {} as any,
                    currentTask: {
                        id: 'complex-task',
                        title: 'Complex Task',
                        description: 'A task with many properties',
                        priority: 'medium',
                        status: 'in-progress',
                        assignedTo: 'agent-complex',
                        files: ['file1.js', 'file2.ts'],
                        createdAt: new Date('2023-01-01'),
                        dependsOn: ['task-dep-1'],
                        tags: ['tag1', 'tag2'],
                        estimatedDuration: 120
                    },
                    startTime: new Date('2023-01-01'),
                    tasksCompleted: 2
                }
            ];

            await agentPersistence.saveAgentState(agents);

            const savedData = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1]);
            expect(savedData.agents[0].currentTask).toMatchObject({
                id: 'complex-task',
                title: 'Complex Task',
                description: 'A task with many properties'
            });
        });
    });

    describe('loadAgentState', () => {
        it('should load agent state from JSON file', async () => {
            const stateData = {
                version: '1.0',
                timestamp: '2023-01-01T10:00:00.000Z',
                agents: [
                    {
                        id: 'agent-1',
                        name: 'Loaded Agent',
                        type: 'frontend',
                        status: 'idle',
                        tasksCompleted: 3
                    }
                ]
            };

            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(stateData));

            const result = await agentPersistence.loadAgentState();

            expect(result).toEqual(stateData.agents);
            expect(mockLoggingService.debug).toHaveBeenCalledWith(expect.stringContaining('Loaded state for 1 agents'));
        });

        it('should return empty array if state file does not exist', async () => {
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            const result = await agentPersistence.loadAgentState();

            expect(result).toEqual([]);
            expect(mockLoggingService.debug).toHaveBeenCalledWith('No state file found');
        });

        it('should handle malformed JSON gracefully', async () => {
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockReturnValue('{ invalid json');

            const result = await agentPersistence.loadAgentState();

            expect(result).toEqual([]);
            expect(mockLoggingService.error).toHaveBeenCalledWith('Error loading state:', expect.any(Error));
        });

        it('should handle read file errors', async () => {
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockImplementation(() => {
                throw new Error('File read error');
            });

            const result = await agentPersistence.loadAgentState();

            expect(result).toEqual([]);
            expect(mockLoggingService.error).toHaveBeenCalledWith('Error loading state:', expect.any(Error));
        });

        it('should handle empty state file', async () => {
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockReturnValue('');

            const result = await agentPersistence.loadAgentState();

            expect(result).toEqual([]);
            expect(mockLoggingService.error).toHaveBeenCalledWith('Error loading state:', expect.any(Error));
        });
    });

    describe('saveAgentSession', () => {
        it('should create new session file', async () => {
            const agentId = 'test-agent';
            const content = 'Test session content';
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            await agentPersistence.saveAgentSession(agentId, content, false);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'sessions', 'test-agent_session.md'),
                expect.stringContaining('# Agent Session: test-agent')
            );
            expect(mockLoggingService.debug).toHaveBeenCalledWith(`Saved session for agent ${agentId}`);
        });

        it('should append to existing session file', async () => {
            const agentId = 'test-agent';
            const content = 'New content to append';
            mockFs.existsSync = jest.fn().mockReturnValue(true);

            await agentPersistence.saveAgentSession(agentId, content, true);

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'sessions', 'test-agent_session.md'),
                expect.stringContaining(content)
            );
            expect(mockLoggingService.debug).toHaveBeenCalledWith(`Saved session for agent ${agentId}`);
        });

        it('should default to append mode', async () => {
            const agentId = 'test-agent';
            const content = 'Content';
            mockFs.existsSync = jest.fn().mockReturnValue(true);

            await agentPersistence.saveAgentSession(agentId, content);

            expect(mockFs.appendFileSync).toHaveBeenCalled();
        });

        it('should create new file when append is true but file does not exist', async () => {
            const agentId = 'test-agent';
            const content = 'Content';
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            await agentPersistence.saveAgentSession(agentId, content, true);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('# Agent Session: test-agent')
            );
        });

        it('should include timestamp when appending', async () => {
            const agentId = 'test-agent';
            const content = 'Content';
            mockFs.existsSync = jest.fn().mockReturnValue(true);

            await agentPersistence.saveAgentSession(agentId, content, true);

            const appendedContent = (mockFs.appendFileSync as jest.Mock).mock.calls[0][1];
            expect(appendedContent).toMatch(/--- \d{4}-\d{2}-\d{2}T.*Z ---/);
        });
    });

    describe('loadAgentSession', () => {
        it('should load existing session file', async () => {
            const agentId = 'test-agent';
            const sessionContent = '# Agent Session\nTest content';
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockReturnValue(sessionContent);

            const result = await agentPersistence.loadAgentSession(agentId);

            expect(result).toBe(sessionContent);
            expect(mockFs.readFileSync).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'sessions', 'test-agent_session.md'),
                'utf-8'
            );
            expect(mockLoggingService.debug).toHaveBeenCalledWith(`Loaded session for agent ${agentId}`);
        });

        it('should return null for non-existent session', async () => {
            const agentId = 'nonexistent-agent';
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            const result = await agentPersistence.loadAgentSession(agentId);

            expect(result).toBeNull();
        });

        it('should handle file read errors', async () => {
            const agentId = 'error-agent';
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockImplementation(() => {
                throw new Error('Read error');
            });

            const result = await agentPersistence.loadAgentSession(agentId);

            expect(result).toBeNull();
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                `Error loading session for ${agentId}:`,
                expect.any(Error)
            );
        });
    });

    describe('saveConversationCheckpoint', () => {
        it('should save conversation checkpoint to file', async () => {
            const agentId = 'test-agent';
            const userMessage = 'User message';
            const agentResponse = 'Agent response';
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            await agentPersistence.saveConversationCheckpoint(agentId, userMessage, agentResponse);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'sessions', 'test-agent_checkpoint.json'),
                expect.stringContaining(userMessage)
            );

            const savedData = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1]);
            expect(savedData).toHaveLength(1);
            expect(savedData[0]).toMatchObject({
                timestamp: expect.any(String),
                user: userMessage,
                agent: agentResponse
            });
        });

        it('should append to existing checkpoints', async () => {
            const agentId = 'test-agent';
            const existingCheckpoints = [
                {
                    timestamp: '2023-01-01T10:00:00.000Z',
                    user: 'Old message',
                    agent: 'Old response'
                }
            ];

            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(existingCheckpoints));

            await agentPersistence.saveConversationCheckpoint(agentId, 'New message', 'New response');

            const savedData = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1]);
            expect(savedData).toHaveLength(2);
            expect(savedData[1].user).toBe('New message');
        });

        it('should limit checkpoints to 100 entries', async () => {
            const agentId = 'test-agent';
            const existingCheckpoints = Array.from({ length: 100 }, (_, i) => ({
                timestamp: `2023-01-01T10:${i.toString().padStart(2, '0')}:00.000Z`,
                user: `Message ${i}`,
                agent: `Response ${i}`
            }));

            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(existingCheckpoints));

            await agentPersistence.saveConversationCheckpoint(agentId, 'New message', 'New response');

            const savedData = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1]);
            expect(savedData).toHaveLength(100);
            expect(savedData[0].user).toBe('Message 1'); // First item removed
            expect(savedData[99].user).toBe('New message'); // New item added
        });

        it('should handle checkpoint file read errors', async () => {
            const agentId = 'error-agent';
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockImplementation(() => {
                throw new Error('Read error');
            });

            await agentPersistence.saveConversationCheckpoint(agentId, 'Message', 'Response');

            expect(mockLoggingService.error).toHaveBeenCalledWith('Error loading checkpoints:', expect.any(Error));

            // Should still save the new checkpoint
            const savedData = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1]);
            expect(savedData).toHaveLength(1);
        });
    });

    describe('getAgentContextSummary', () => {
        it('should return context summary from session', async () => {
            const agentId = 'test-agent';
            const sessionLines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
            const sessionContent = sessionLines.join('\n');

            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockReturnValue(sessionContent);

            const result = await agentPersistence.getAgentContextSummary(agentId);

            expect(result).toContain('Previous session context:');
            expect(result).toContain('Line 51'); // Should include last 50 lines
            expect(result).toContain('Line 100');
            expect(result).not.toContain('Line 50'); // Should not include earlier lines
        });

        it('should return empty string for non-existent session', async () => {
            const agentId = 'nonexistent-agent';
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            const result = await agentPersistence.getAgentContextSummary(agentId);

            expect(result).toBe('');
        });

        it('should handle sessions with fewer than 50 lines', async () => {
            const agentId = 'short-agent';
            const sessionContent = 'Line 1\nLine 2\nLine 3';

            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockReturnValue(sessionContent);

            const result = await agentPersistence.getAgentContextSummary(agentId);

            expect(result).toContain('Line 1');
            expect(result).toContain('Line 2');
            expect(result).toContain('Line 3');
        });
    });

    describe('archiveOldSessions', () => {
        it('should archive files older than specified days', async () => {
            const oldFiles = ['old-session.md', 'recent-session.md'];
            const now = Date.now();
            const oldTime = now - 8 * 24 * 60 * 60 * 1000; // 8 days ago
            const recentTime = now - 5 * 24 * 60 * 60 * 1000; // 5 days ago

            mockFs.existsSync = jest.fn().mockImplementation(path => {
                return !path.includes('archive'); // Archive dir doesn't exist
            });
            mockFs.readdirSync = jest.fn().mockReturnValue(oldFiles);
            mockFs.statSync = jest.fn().mockImplementation(filePath => ({
                mtime: new Date(filePath.includes('old') ? oldTime : recentTime)
            }));

            await agentPersistence.archiveOldSessions(7);

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(path.join(workspaceRoot, '.nofx', 'archive'));
            expect(mockFs.renameSync).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'sessions', 'old-session.md'),
                path.join(workspaceRoot, '.nofx', 'archive', 'old-session.md')
            );
            expect(mockFs.renameSync).not.toHaveBeenCalledWith(
                expect.stringContaining('recent-session.md'),
                expect.any(String)
            );
        });

        it('should use default 7 days if not specified', async () => {
            const files = ['test-session.md'];
            const oldTime = Date.now() - 8 * 24 * 60 * 60 * 1000;

            mockFs.existsSync = jest.fn().mockReturnValue(false);
            mockFs.readdirSync = jest.fn().mockReturnValue(files);
            mockFs.statSync = jest.fn().mockReturnValue({ mtime: new Date(oldTime) });

            await agentPersistence.archiveOldSessions();

            expect(mockFs.renameSync).toHaveBeenCalled();
        });

        it('should log archived sessions', async () => {
            const files = ['archived-session.md'];
            const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000;

            mockFs.existsSync = jest.fn().mockReturnValue(false);
            mockFs.readdirSync = jest.fn().mockReturnValue(files);
            mockFs.statSync = jest.fn().mockReturnValue({ mtime: new Date(oldTime) });

            await agentPersistence.archiveOldSessions(7);

            expect(mockLoggingService.debug).toHaveBeenCalledWith('Archived old session: archived-session.md');
        });
    });

    describe('cleanup', () => {
        it('should remove state file and session files', async () => {
            const sessionFiles = ['agent1_session.md', 'agent2_session.md'];
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readdirSync = jest.fn().mockReturnValue(sessionFiles);

            await agentPersistence.cleanup();

            expect(mockFs.unlinkSync).toHaveBeenCalledWith(path.join(workspaceRoot, '.nofx', 'agents.json'));
            expect(mockFs.unlinkSync).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'sessions', 'agent1_session.md')
            );
            expect(mockFs.unlinkSync).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'sessions', 'agent2_session.md')
            );
            expect(mockLoggingService.info).toHaveBeenCalledWith('Cleaned up all persistence data');
        });

        it('should handle cleanup when state file does not exist', async () => {
            mockFs.existsSync = jest.fn().mockReturnValue(false);
            mockFs.readdirSync = jest.fn().mockReturnValue([]);

            await agentPersistence.cleanup();

            expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(expect.stringContaining('agents.json'));
        });
    });

    describe('exportSessionsAsMarkdown', () => {
        it('should export all sessions as markdown', async () => {
            const mockState = [
                {
                    id: 'agent-1',
                    name: 'Test Agent 1',
                    type: 'frontend',
                    status: 'idle',
                    tasksCompleted: 5
                }
            ];

            const sessionContent = '# Session content\nTest session data';

            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockImplementation(filePath => {
                if (filePath.includes('agents.json')) {
                    return JSON.stringify({ agents: mockState });
                }
                return sessionContent;
            });

            const exportPath = await agentPersistence.exportSessionsAsMarkdown();

            expect(exportPath).toMatch(/export_\d+\.md$/);
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                exportPath,
                expect.stringContaining('# NofX Agent Sessions Export')
            );
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                exportPath,
                expect.stringContaining('## Agent: Test Agent 1')
            );
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(exportPath, expect.stringContaining(sessionContent));
        });

        it('should handle agents without sessions', async () => {
            const mockState = [
                {
                    id: 'agent-no-session',
                    name: 'Agent Without Session',
                    type: 'testing',
                    status: 'idle',
                    tasksCompleted: 0
                }
            ];

            mockFs.existsSync = jest.fn().mockImplementation(filePath => {
                return filePath.includes('agents.json');
            });
            mockFs.readFileSync = jest.fn().mockImplementation(filePath => {
                if (filePath.includes('agents.json')) {
                    return JSON.stringify({ agents: mockState });
                }
                return null; // No session file
            });

            const exportPath = await agentPersistence.exportSessionsAsMarkdown();

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                exportPath,
                expect.stringContaining('## Agent: Agent Without Session')
            );
        });
    });

    describe('clearAll', () => {
        it('should clear agents.json and session files', async () => {
            const sessionFiles = ['agent1_session.md', 'agent2_session.md'];
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFsPromises.readdir = jest.fn().mockResolvedValue(sessionFiles);

            await agentPersistence.clearAll();

            expect(mockFsPromises.unlink).toHaveBeenCalledWith(path.join(workspaceRoot, '.nofx', 'agents.json'));
            expect(mockFsPromises.unlink).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'sessions', 'agent1_session.md')
            );
            expect(mockFsPromises.unlink).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'sessions', 'agent2_session.md')
            );
            expect(mockLoggingService.info).toHaveBeenCalledWith('Cleared all persistence data');
        });

        it('should handle missing agents.json file', async () => {
            mockFs.existsSync = jest.fn().mockReturnValue(false);
            mockFsPromises.readdir = jest.fn().mockResolvedValue([]);

            await agentPersistence.clearAll();

            expect(mockFsPromises.unlink).not.toHaveBeenCalledWith(expect.stringContaining('agents.json'));
        });

        it('should handle errors and log them', async () => {
            const error = new Error('Clear failed');
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFsPromises.unlink = jest.fn().mockRejectedValue(error);

            await expect(agentPersistence.clearAll()).rejects.toThrow('Clear failed');
            expect(mockLoggingService.error).toHaveBeenCalledWith('Error clearing persistence data:', error);
        });
    });

    describe('archiveSessions', () => {
        it('should archive sessions to timestamped directory', async () => {
            const archiveName = 'backup-test';
            const sessionFiles = ['agent1_session.md', 'agent2_session.md'];

            mockFs.existsSync = jest.fn().mockImplementation(path => {
                return path.includes('agents.json');
            });
            mockFsPromises.readdir = jest.fn().mockResolvedValue(sessionFiles);

            const archivePath = await agentPersistence.archiveSessions(archiveName);

            expect(archivePath).toMatch(new RegExp('backup-test_\\d{4}-\\d{2}-\\d{2}T'));
            expect(mockFsPromises.mkdir).toHaveBeenCalledWith(expect.stringContaining('archives'), { recursive: true });
            expect(mockFsPromises.copyFile).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'sessions', 'agent1_session.md'),
                expect.stringContaining('agent1_session.md')
            );
            expect(mockLoggingService.info).toHaveBeenCalledWith(expect.stringContaining('Archived sessions to'));
        });

        it('should copy agents.json if it exists', async () => {
            const archiveName = 'test-archive';
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFsPromises.readdir = jest.fn().mockResolvedValue([]);

            await agentPersistence.archiveSessions(archiveName);

            expect(mockFsPromises.copyFile).toHaveBeenCalledWith(
                path.join(workspaceRoot, '.nofx', 'agents.json'),
                expect.stringContaining('agents.json')
            );
        });

        it('should handle missing session files gracefully', async () => {
            const archiveName = 'empty-archive';
            mockFs.existsSync = jest.fn().mockReturnValue(false);
            mockFsPromises.readdir = jest.fn().mockRejectedValue(new Error('Directory not found'));

            const archivePath = await agentPersistence.archiveSessions(archiveName);

            expect(archivePath).toMatch(/empty-archive_\d{4}-\d{2}-\d{2}T/);
            expect(mockFsPromises.mkdir).toHaveBeenCalled();
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle very long agent IDs', async () => {
            const longAgentId = 'a'.repeat(200);
            const content = 'Test content';

            await agentPersistence.saveAgentSession(longAgentId, content);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining(`${longAgentId}_session.md`),
                expect.any(String)
            );
        });

        it('should handle special characters in agent IDs', async () => {
            const specialAgentId = 'agent-with_special.chars@123!';
            const content = 'Test content';

            await agentPersistence.saveAgentSession(specialAgentId, content);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining(`${specialAgentId}_session.md`),
                expect.any(String)
            );
        });

        it('should handle very large session content', async () => {
            const agentId = 'large-content-agent';
            const largeContent = 'x'.repeat(100000);

            await agentPersistence.saveAgentSession(agentId, largeContent, false);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining(largeContent)
            );
        });

        it('should handle circular references in agent data', async () => {
            const circularAgent: any = {
                id: 'circular-agent',
                name: 'Circular Agent',
                type: 'test',
                status: 'idle',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0
            };
            circularAgent.self = circularAgent;

            // Should not throw due to circular reference
            await expect(agentPersistence.saveAgentState([circularAgent])).not.toThrow();
        });

        it('should handle null and undefined values in agent data', async () => {
            const agentWithNulls: Agent = {
                id: 'null-agent',
                name: 'Agent with nulls',
                type: 'test',
                status: 'idle',
                terminal: {} as any,
                currentTask: null,
                startTime: new Date(),
                tasksCompleted: 0,
                capabilities: undefined,
                template: null
            } as any;

            await agentPersistence.saveAgentState([agentWithNulls]);

            const savedData = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1]);
            expect(savedData.agents[0].currentTask).toBeNull();
        });
    });
});
