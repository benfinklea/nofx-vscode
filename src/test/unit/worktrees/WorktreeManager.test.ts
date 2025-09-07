import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { WorktreeManager } from '../../../worktrees/WorktreeManager';
import { Agent } from '../../../agents/types';
import { ILoggingService, INotificationService } from '../../../services/interfaces';

jest.mock('fs');
jest.mock('child_process');
jest.mock('path');

describe('WorktreeManager', () => {
    let worktreeManager: WorktreeManager;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let workspacePath: string;

    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
    const mockPath = path as jest.Mocked<typeof path>;

    const mockAgent: Agent = {
        id: 'test-agent-123',
        name: 'Test Agent',
        type: 'frontend',
        status: 'idle',
        terminal: {} as any,
        currentTask: null,
        startTime: new Date('2023-01-01T10:00:00.000Z'),
        tasksCompleted: 0
    };

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

        // Mock notification service
        mockNotificationService = {
            showInformation: jest.fn(),
            showWarning: jest.fn(),
            showError: jest.fn(),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            withProgress: jest.fn(),
            confirm: jest.fn(),
            confirmDestructive: jest.fn()
        };

        workspacePath = '/test/workspace';

        // Mock fs methods
        mockFs.existsSync = jest.fn().mockReturnValue(true);
        mockFs.mkdirSync = jest.fn();
        mockFs.writeFileSync = jest.fn();
        mockFs.readFileSync = jest.fn();
        mockFs.appendFileSync = jest.fn();
        mockFs.rmSync = jest.fn();

        // Mock execSync
        mockExecSync.mockReturnValue('mock output' as any);

        // Mock path methods
        mockPath.join = jest.fn().mockImplementation((...args) => args.join('/'));
        mockPath.dirname = jest.fn().mockImplementation((p) => {
            const parts = p.split('/');
            return parts.slice(0, -1).join('/');
        });

        jest.clearAllMocks();

        worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with workspace path and services', () => {
            const manager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            expect(manager).toBeDefined();
        });

        it('should initialize without logging service', () => {
            const manager = new WorktreeManager(workspacePath);
            expect(manager).toBeDefined();
        });

        it('should create worktrees directory if it does not exist', () => {
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(
                '/test/.nofx-worktrees',
                { recursive: true }
            );
        });

        it('should not create directory if it already exists', () => {
            mockFs.existsSync = jest.fn().mockReturnValue(true);

            new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);

            expect(mockFs.mkdirSync).not.toHaveBeenCalled();
        });

        it('should set correct base directory path', () => {
            mockPath.dirname.mockReturnValue('/test');
            mockPath.join.mockImplementation((a, b) => `${a}/${b}`);

            const manager = new WorktreeManager('/test/workspace', mockLoggingService, mockNotificationService);

            expect(mockPath.dirname).toHaveBeenCalledWith('/test/workspace');
            expect(mockPath.join).toHaveBeenCalledWith('/test', '.nofx-worktrees');
        });
    });

    describe('createWorktreeForAgent', () => {
        beforeEach(() => {
            Date.now = jest.fn(() => 1672574400000); // Mock timestamp
            mockExecSync.mockReturnValue('main\n' as any);
        });

        it('should create worktree for new agent', async () => {
            const expectedBranchName = 'agent-test-agent-1672574400000';
            const expectedWorktreePath = '/test/.nofx-worktrees/test-agent-123';

            const result = await worktreeManager.createWorktreeForAgent(mockAgent);

            expect(mockExecSync).toHaveBeenCalledWith('git branch --show-current', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });

            expect(mockExecSync).toHaveBeenCalledWith(
                `git worktree add -b ${expectedBranchName} "${expectedWorktreePath}" main`,
                {
                    cwd: workspacePath,
                    encoding: 'utf-8'
                }
            );

            expect(result).toBe(expectedWorktreePath);
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                `Created worktree for ${mockAgent.name} at ${expectedWorktreePath}`
            );
        });

        it('should create marker file with agent information', async () => {
            const expectedMarkerPath = '/test/.nofx-worktrees/test-agent-123/.nofx-agent';
            const expectedMarkerData = {
                agentId: mockAgent.id,
                agentName: mockAgent.name,
                agentType: mockAgent.type,
                branchName: 'agent-test-agent-1672574400000',
                createdAt: expect.any(String)
            };

            await worktreeManager.createWorktreeForAgent(mockAgent);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expectedMarkerPath,
                JSON.stringify(expectedMarkerData, null, 2)
            );
        });

        it('should add marker to gitignore if gitignore exists', async () => {
            const gitignoreContent = '*.log\n*.tmp\n';
            mockFs.existsSync = jest.fn().mockImplementation((filePath) => {
                return filePath.includes('.gitignore') ? true : !filePath.includes('.nofx-worktrees');
            });
            mockFs.readFileSync = jest.fn().mockReturnValue(gitignoreContent);

            await worktreeManager.createWorktreeForAgent(mockAgent);

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/test/.nofx-worktrees/test-agent-123/.gitignore',
                '\n# NofX agent worktree marker\n.nofx-agent\n'
            );
        });

        it('should not add marker to gitignore if already present', async () => {
            const gitignoreContent = '*.log\n.nofx-agent\n';
            mockFs.existsSync = jest.fn().mockImplementation((filePath) => {
                return filePath.includes('.gitignore') ? true : !filePath.includes('.nofx-worktrees');
            });
            mockFs.readFileSync = jest.fn().mockReturnValue(gitignoreContent);

            await worktreeManager.createWorktreeForAgent(mockAgent);

            expect(mockFs.appendFileSync).not.toHaveBeenCalled();
        });

        it('should create gitignore if it does not exist', async () => {
            mockFs.existsSync = jest.fn().mockImplementation((filePath) => {
                return filePath.includes('.gitignore') ? false : !filePath.includes('.nofx-worktrees');
            });

            await worktreeManager.createWorktreeForAgent(mockAgent);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                '/test/.nofx-worktrees/test-agent-123/.gitignore',
                '# NofX agent worktree marker\n.nofx-agent\n'
            );
        });

        it('should return existing worktree path if agent already has one', async () => {
            const expectedPath = '/test/.nofx-worktrees/test-agent-123';

            // Create worktree first time
            await worktreeManager.createWorktreeForAgent(mockAgent);

            // Clear mocks
            jest.clearAllMocks();

            // Create worktree second time
            const result = await worktreeManager.createWorktreeForAgent(mockAgent);

            expect(result).toBe(expectedPath);
            expect(mockExecSync).not.toHaveBeenCalled();
        });

        it('should handle agent names with spaces and special characters', async () => {
            const specialAgent = {
                ...mockAgent,
                name: 'Special Agent With Spaces & Symbols!'
            };

            await worktreeManager.createWorktreeForAgent(specialAgent);

            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('agent-special-agent-with-spaces-&-symbols!-'),
                expect.any(Object)
            );
        });

        it('should use HEAD when no current branch', async () => {
            mockExecSync.mockReturnValueOnce('' as any);

            await worktreeManager.createWorktreeForAgent(mockAgent);

            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining(' HEAD'),
                expect.any(Object)
            );
        });

        it('should handle git command errors', async () => {
            const gitError = new Error('Git command failed');
            mockExecSync.mockImplementation((command) => {
                if (command.toString().includes('worktree add')) {
                    throw gitError;
                }
                return 'main\n' as any;
            });

            await expect(worktreeManager.createWorktreeForAgent(mockAgent)).rejects.toThrow('Git command failed');
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                `Error creating worktree for ${mockAgent.name}:`,
                gitError
            );
        });
    });

    describe('removeWorktreeForAgent', () => {
        beforeEach(async () => {
            // Create a worktree first
            await worktreeManager.createWorktreeForAgent(mockAgent);
            jest.clearAllMocks();
        });

        it('should remove worktree for agent', async () => {
            await worktreeManager.removeWorktreeForAgent(mockAgent.id);

            expect(mockExecSync).toHaveBeenCalledWith(
                'git worktree remove "/test/.nofx-worktrees/test-agent-123" --force',
                {
                    cwd: workspacePath,
                    encoding: 'utf-8'
                }
            );

            expect(mockLoggingService.info).toHaveBeenCalledWith(`Removed worktree for agent ${mockAgent.id}`);
        });

        it('should handle non-existent worktree gracefully', async () => {
            await worktreeManager.removeWorktreeForAgent('non-existent-agent');

            expect(mockLoggingService.debug).toHaveBeenCalledWith('No worktree found for agent non-existent-agent');
            expect(mockExecSync).not.toHaveBeenCalled();
        });

        it('should clean up directory manually on git command failure', async () => {
            const gitError = new Error('Git remove failed');
            mockExecSync.mockImplementation(() => {
                throw gitError;
            });

            await worktreeManager.removeWorktreeForAgent(mockAgent.id);

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                `Error removing worktree for ${mockAgent.id}:`,
                gitError
            );
            expect(mockFs.rmSync).toHaveBeenCalledWith(
                '/test/.nofx-worktrees/test-agent-123',
                { recursive: true, force: true }
            );
        });

        it('should handle manual cleanup errors', async () => {
            const gitError = new Error('Git remove failed');
            const cleanupError = new Error('Manual cleanup failed');
            mockExecSync.mockImplementation(() => {
                throw gitError;
            });
            mockFs.rmSync.mockImplementation(() => {
                throw cleanupError;
            });

            await worktreeManager.removeWorktreeForAgent(mockAgent.id);

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Error cleaning up worktree directory:',
                cleanupError
            );
        });

        it('should not attempt cleanup if directory does not exist', async () => {
            const gitError = new Error('Git remove failed');
            mockExecSync.mockImplementation(() => {
                throw gitError;
            });
            mockFs.existsSync.mockReturnValue(false);

            await worktreeManager.removeWorktreeForAgent(mockAgent.id);

            expect(mockFs.rmSync).not.toHaveBeenCalled();
        });
    });

    describe('listWorktrees', () => {
        it('should return list of worktree paths', () => {
            const mockOutput = `worktree /path/to/main
HEAD abcd1234

worktree /path/to/worktree1
branch refs/heads/feature-branch

worktree /path/to/worktree2
branch refs/heads/another-branch
`;

            mockExecSync.mockReturnValue(mockOutput as any);

            const result = worktreeManager.listWorktrees();

            expect(mockExecSync).toHaveBeenCalledWith('git worktree list --porcelain', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });

            expect(result).toEqual([
                '/path/to/main',
                '/path/to/worktree1',
                '/path/to/worktree2'
            ]);
        });

        it('should return empty array on git command error', () => {
            mockExecSync.mockImplementation(() => {
                throw new Error('Git command failed');
            });

            const result = worktreeManager.listWorktrees();

            expect(result).toEqual([]);
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Error listing worktrees:',
                expect.any(Error)
            );
        });

        it('should handle empty worktree list', () => {
            mockExecSync.mockReturnValue('' as any);

            const result = worktreeManager.listWorktrees();

            expect(result).toEqual([]);
        });

        it('should parse malformed worktree list output', () => {
            const malformedOutput = `worktree /path/to/main
invalid line
worktree /path/to/worktree1
`;

            mockExecSync.mockReturnValue(malformedOutput as any);

            const result = worktreeManager.listWorktrees();

            expect(result).toEqual([
                '/path/to/main',
                '/path/to/worktree1'
            ]);
        });
    });

    describe('cleanupOrphanedWorktrees', () => {
        it('should prune worktrees and remove orphaned agent worktrees', async () => {
            const mockWorktrees = ['/test/.nofx-worktrees/agent-1', '/test/.nofx-worktrees/agent-2'];
            const mockMarkerData1 = { agentId: 'orphaned-agent-1', agentName: 'Orphaned Agent 1' };
            const mockMarkerData2 = { agentId: 'orphaned-agent-2', agentName: 'Orphaned Agent 2' };

            jest.spyOn(worktreeManager, 'listWorktrees').mockReturnValue(mockWorktrees);
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockImplementation((filePath) => {
                if (filePath.includes('agent-1')) {
                    return JSON.stringify(mockMarkerData1);
                }
                return JSON.stringify(mockMarkerData2);
            });

            await worktreeManager.cleanupOrphanedWorktrees();

            expect(mockExecSync).toHaveBeenCalledWith('git worktree prune', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });

            expect(mockExecSync).toHaveBeenCalledWith(
                'git worktree remove "/test/.nofx-worktrees/agent-1" --force',
                {
                    cwd: workspacePath,
                    encoding: 'utf-8'
                }
            );

            expect(mockExecSync).toHaveBeenCalledWith(
                'git worktree remove "/test/.nofx-worktrees/agent-2" --force',
                {
                    cwd: workspacePath,
                    encoding: 'utf-8'
                }
            );

            expect(mockLoggingService.info).toHaveBeenCalledWith(
                'Found orphaned worktree for agent Orphaned Agent 1, cleaning up...'
            );
        });

        it('should skip worktrees without marker files', async () => {
            const mockWorktrees = ['/path/to/regular-worktree'];
            jest.spyOn(worktreeManager, 'listWorktrees').mockReturnValue(mockWorktrees);
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            await worktreeManager.cleanupOrphanedWorktrees();

            expect(mockExecSync).toHaveBeenCalledWith('git worktree prune', expect.any(Object));
            expect(mockExecSync).not.toHaveBeenCalledWith(
                expect.stringContaining('worktree remove'),
                expect.any(Object)
            );
        });

        it('should handle errors during orphaned worktree removal', async () => {
            const mockWorktrees = ['/test/.nofx-worktrees/agent-1'];
            const mockMarkerData = { agentId: 'orphaned-agent', agentName: 'Orphaned Agent' };
            const removeError = new Error('Failed to remove worktree');

            jest.spyOn(worktreeManager, 'listWorktrees').mockReturnValue(mockWorktrees);
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockMarkerData));
            mockExecSync.mockImplementation((command) => {
                if (command.toString().includes('worktree remove')) {
                    throw removeError;
                }
                return '' as any;
            });

            await worktreeManager.cleanupOrphanedWorktrees();

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Error removing orphaned worktree:',
                removeError
            );
        });

        it('should handle prune command errors', async () => {
            const pruneError = new Error('Prune failed');
            mockExecSync.mockImplementation((command) => {
                if (command.toString().includes('prune')) {
                    throw pruneError;
                }
                return '' as any;
            });

            await worktreeManager.cleanupOrphanedWorktrees();

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Error cleaning up orphaned worktrees:',
                pruneError
            );
        });

        it('should not remove active agent worktrees', async () => {
            // Create an active agent worktree first
            await worktreeManager.createWorktreeForAgent(mockAgent);

            const mockWorktrees = ['/test/.nofx-worktrees/test-agent-123'];
            const mockMarkerData = {
                agentId: mockAgent.id,
                agentName: mockAgent.name
            };

            jest.spyOn(worktreeManager, 'listWorktrees').mockReturnValue(mockWorktrees);
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockMarkerData));

            // Clear previous mocks
            jest.clearAllMocks();
            mockExecSync.mockReturnValue('' as any);

            await worktreeManager.cleanupOrphanedWorktrees();

            expect(mockExecSync).toHaveBeenCalledWith('git worktree prune', expect.any(Object));
            expect(mockExecSync).not.toHaveBeenCalledWith(
                expect.stringContaining('worktree remove'),
                expect.any(Object)
            );
        });
    });

    describe('getWorktreePath', () => {
        it('should return worktree path for existing agent', async () => {
            await worktreeManager.createWorktreeForAgent(mockAgent);

            const result = worktreeManager.getWorktreePath(mockAgent.id);

            expect(result).toBe('/test/.nofx-worktrees/test-agent-123');
        });

        it('should return undefined for non-existent agent', () => {
            const result = worktreeManager.getWorktreePath('non-existent-agent');

            expect(result).toBeUndefined();
        });
    });

    describe('isWorktreeAvailable static method', () => {
        it('should return true when git and worktree are available', () => {
            mockExecSync.mockReturnValue('' as any);

            const result = WorktreeManager.isWorktreeAvailable(workspacePath);

            expect(result).toBe(true);
            expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --git-dir', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });
            expect(mockExecSync).toHaveBeenCalledWith('git worktree -h', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });
        });

        it('should return false when git repository check fails', () => {
            mockExecSync.mockImplementation((command) => {
                if (command.toString().includes('rev-parse')) {
                    throw new Error('Not a git repository');
                }
                return '' as any;
            });

            const result = WorktreeManager.isWorktreeAvailable(workspacePath);

            expect(result).toBe(false);
        });

        it('should return false when worktree command is not available', () => {
            mockExecSync.mockImplementation((command) => {
                if (command.toString().includes('worktree -h')) {
                    throw new Error('Worktree command not found');
                }
                return '' as any;
            });

            const result = WorktreeManager.isWorktreeAvailable(workspacePath);

            expect(result).toBe(false);
        });
    });

    describe('listWorktreesInfo', () => {
        it('should return worktree info with agent IDs', async () => {
            const mockOutput = `worktree /test/.nofx-worktrees/agent-1
branch refs/heads/agent-feature-1

worktree /test/.nofx-worktrees/agent-2
branch refs/heads/agent-feature-2

worktree /test/main
HEAD abcd1234
`;

            const mockMarkerData1 = { agentId: 'agent-1' };
            const mockMarkerData2 = { agentId: 'agent-2' };

            mockExecSync.mockReturnValue(mockOutput as any);
            mockFs.existsSync = jest.fn().mockImplementation((filePath) => {
                return filePath.includes('.nofx-agent');
            });
            mockFs.readFileSync = jest.fn().mockImplementation((filePath) => {
                if (filePath.includes('agent-1')) {
                    return JSON.stringify(mockMarkerData1);
                }
                if (filePath.includes('agent-2')) {
                    return JSON.stringify(mockMarkerData2);
                }
                return '{}';
            });

            const result = await worktreeManager.listWorktreesInfo();

            expect(result).toEqual([
                {
                    directory: '/test/.nofx-worktrees/agent-1',
                    branch: 'agent-feature-1',
                    agentId: 'agent-1'
                },
                {
                    directory: '/test/.nofx-worktrees/agent-2',
                    branch: 'agent-feature-2',
                    agentId: 'agent-2'
                }
            ]);
        });

        it('should filter out non-agent branches', async () => {
            const mockOutput = `worktree /test/.nofx-worktrees/agent-1
branch refs/heads/agent-feature-1

worktree /test/feature-branch
branch refs/heads/feature-branch
`;

            mockExecSync.mockReturnValue(mockOutput as any);
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            const result = await worktreeManager.listWorktreesInfo();

            expect(result).toEqual([
                {
                    directory: '/test/.nofx-worktrees/agent-1',
                    branch: 'agent-feature-1'
                }
            ]);
        });

        it('should handle marker file read errors gracefully', async () => {
            const mockOutput = `worktree /test/.nofx-worktrees/agent-1
branch refs/heads/agent-feature-1
`;

            mockExecSync.mockReturnValue(mockOutput as any);
            mockFs.existsSync = jest.fn().mockReturnValue(true);
            mockFs.readFileSync = jest.fn().mockImplementation(() => {
                throw new Error('Cannot read marker file');
            });

            const result = await worktreeManager.listWorktreesInfo();

            expect(result).toEqual([
                {
                    directory: '/test/.nofx-worktrees/agent-1',
                    branch: 'agent-feature-1'
                }
            ]);
        });

        it('should handle git command errors', async () => {
            mockExecSync.mockImplementation(() => {
                throw new Error('Git list failed');
            });

            const result = await worktreeManager.listWorktreesInfo();

            expect(result).toEqual([]);
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Error listing worktrees:',
                expect.any(Error)
            );
        });
    });

    describe('mergeAgentWork', () => {
        beforeEach(async () => {
            // Create a worktree first
            await worktreeManager.createWorktreeForAgent(mockAgent);
            jest.clearAllMocks();
        });

        it('should merge agent work to main branch', async () => {
            const mockMarkerData = {
                agentId: mockAgent.id,
                agentName: mockAgent.name,
                branchName: 'agent-test-branch'
            };

            mockFs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockMarkerData));
            mockExecSync.mockReturnValue('main\n' as any);

            await worktreeManager.mergeAgentWork(mockAgent.id);

            // Should commit any uncommitted changes
            expect(mockExecSync).toHaveBeenCalledWith('git add -A', {
                cwd: '/test/.nofx-worktrees/test-agent-123'
            });

            expect(mockExecSync).toHaveBeenCalledWith(
                `git commit -m "Agent ${mockAgent.name} work - auto-commit before merge"`,
                { cwd: '/test/.nofx-worktrees/test-agent-123' }
            );

            // Should get current branch
            expect(mockExecSync).toHaveBeenCalledWith('git branch --show-current', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });

            // Should merge the branch
            expect(mockExecSync).toHaveBeenCalledWith(
                `git merge agent-test-branch --no-ff -m "Merge agent ${mockAgent.name} work from agent-test-branch"`,
                {
                    cwd: workspacePath,
                    encoding: 'utf-8'
                }
            );

            expect(mockLoggingService.info).toHaveBeenCalledWith(
                `Merged agent ${mockAgent.name} work from agent-test-branch`
            );

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                `✅ Merged ${mockAgent.name}'s work from branch agent-test-branch`
            );
        });

        it('should handle case with no changes to commit', async () => {
            const mockMarkerData = {
                agentId: mockAgent.id,
                agentName: mockAgent.name,
                branchName: 'agent-test-branch'
            };

            mockFs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockMarkerData));
            mockExecSync.mockImplementation((command) => {
                if (command.toString().includes('commit')) {
                    throw new Error('Nothing to commit');
                }
                return 'main\n' as any;
            });

            await worktreeManager.mergeAgentWork(mockAgent.id);

            expect(mockLoggingService.debug).toHaveBeenCalledWith('No changes to commit in worktree');

            // Should still proceed with merge
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('git merge'),
                expect.any(Object)
            );
        });

        it('should throw error for non-existent agent worktree', async () => {
            await expect(worktreeManager.mergeAgentWork('non-existent-agent'))
                .rejects.toThrow('No worktree found for agent non-existent-agent');
        });

        it('should handle merge errors', async () => {
            const mockMarkerData = {
                agentId: mockAgent.id,
                agentName: mockAgent.name,
                branchName: 'agent-test-branch'
            };

            mockFs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockMarkerData));
            mockExecSync.mockImplementation((command) => {
                if (command.toString().includes('merge')) {
                    throw new Error('Merge conflict');
                }
                return 'main\n' as any;
            });

            await expect(worktreeManager.mergeAgentWork(mockAgent.id))
                .rejects.toThrow('Merge conflict');

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Error merging agent work:',
                expect.any(Error)
            );
        });

        it('should handle marker file read errors', async () => {
            mockFs.readFileSync = jest.fn().mockImplementation(() => {
                throw new Error('Cannot read marker file');
            });

            await expect(worktreeManager.mergeAgentWork(mockAgent.id))
                .rejects.toThrow('Cannot read marker file');
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle very long agent names', async () => {
            const longNameAgent = {
                ...mockAgent,
                name: 'a'.repeat(200)
            };

            await worktreeManager.createWorktreeForAgent(longNameAgent);

            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('agent-' + 'a'.repeat(200).toLowerCase()),
                expect.any(Object)
            );
        });

        it('should handle agent IDs with special characters', async () => {
            const specialAgent = {
                ...mockAgent,
                id: 'agent-with-special@chars_123'
            };

            const result = await worktreeManager.createWorktreeForAgent(specialAgent);

            expect(result).toContain('agent-with-special@chars_123');
        });

        it('should handle file system permission errors', async () => {
            const permissionError = new Error('Permission denied');
            mockFs.mkdirSync = jest.fn().mockImplementation(() => {
                throw permissionError;
            });
            mockFs.existsSync = jest.fn().mockReturnValue(false);

            await expect(new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService))
                .toThrow('Permission denied');
        });

        it('should handle network drive paths', async () => {
            const networkPath = '//server/share/project';
            const manager = new WorktreeManager(networkPath, mockLoggingService, mockNotificationService);

            expect(manager).toBeDefined();
            expect(mockPath.dirname).toHaveBeenCalledWith(networkPath);
        });

        it('should handle Unicode characters in paths', async () => {
            const unicodeAgent = {
                ...mockAgent,
                name: 'Agent 中文 ñáéíóú'
            };

            await worktreeManager.createWorktreeForAgent(unicodeAgent);

            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('agent-agent-中文-ñáéíóú'),
                expect.any(Object)
            );
        });

        it('should handle concurrent worktree operations', async () => {
            const agent1 = { ...mockAgent, id: 'agent-1', name: 'Agent 1' };
            const agent2 = { ...mockAgent, id: 'agent-2', name: 'Agent 2' };

            const promises = [
                worktreeManager.createWorktreeForAgent(agent1),
                worktreeManager.createWorktreeForAgent(agent2)
            ];

            const results = await Promise.all(promises);

            expect(results[0]).toContain('agent-1');
            expect(results[1]).toContain('agent-2');
            expect(mockExecSync).toHaveBeenCalledTimes(4); // 2 branch checks + 2 worktree creates
        });

        it('should clean up properly on partial failures', async () => {
            mockExecSync.mockImplementation((command) => {
                if (command.toString().includes('worktree add')) {
                    throw new Error('Worktree creation failed');
                }
                return 'main\n' as any;
            });

            await expect(worktreeManager.createWorktreeForAgent(mockAgent))
                .rejects.toThrow('Worktree creation failed');

            // Verify agent is not tracked in internal map
            expect(worktreeManager.getWorktreePath(mockAgent.id)).toBeUndefined();
        });
    });
});
