import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { WorktreeManager } from '../../../worktrees/WorktreeManager';
import { Agent } from '../../../agents/types';
import { ILoggingService, INotificationService } from '../../../services/interfaces';
import {
    createMockLoggingService,
    createMockNotificationService
} from '../../helpers/mockFactories';
import { createMockAgent, createMockTerminal } from '../../helpers/testAgentFactory';

// Mock all external dependencies
jest.mock('fs');
jest.mock('fs/promises');
jest.mock('child_process');
jest.mock('path');
jest.mock('util', () => ({
    promisify: jest.fn((fn) => fn)
}));

describe('WorktreeManager - Comprehensive Tests', () => {
    let worktreeManager: WorktreeManager;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let workspacePath: string;
    
    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;
    const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
    const mockExec = exec as jest.MockedFunction<typeof exec>;
    const mockPath = path as jest.Mocked<typeof path>;
    
    const mockTerminal = createMockTerminal();
    const mockAgent: Agent = createMockAgent();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        
        // Setup workspace path
        workspacePath = '/test/workspace';
        
        // Setup mock services
        mockLoggingService = createMockLoggingService();
        mockNotificationService = createMockNotificationService();
        
        // Setup path mocks
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.dirname.mockImplementation((p) => {
            const parts = p.split('/');
            return parts.slice(0, -1).join('/');
        });
        
        // Setup fs mocks
        mockFsPromises.access.mockResolvedValue(undefined);
        mockFsPromises.mkdir.mockResolvedValue(undefined);
        mockFsPromises.readFile.mockResolvedValue('[]');
        mockFsPromises.writeFile.mockResolvedValue(undefined);
        mockFsPromises.unlink.mockResolvedValue(undefined);
        mockFsPromises.rm.mockResolvedValue(undefined);
        
        // Setup execSync mocks
        mockExecSync.mockReturnValue(Buffer.from(''));
        mockExec.mockImplementation((cmd, options, callback) => {
            if (callback) {
                callback(null, '', '');
            }
            return {} as any;
        });
    });

    afterEach(() => {
        // Clean up timers
        jest.clearAllTimers();
        if (worktreeManager) {
            (worktreeManager as any).dispose?.();
        }
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with proper paths', async () => {
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            
            // Allow async initialization to complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockPath.dirname).toHaveBeenCalledWith(workspacePath);
            expect(mockPath.join).toHaveBeenCalledWith('/test', '.nofx-worktrees');
        });

        it('should create necessary directories during initialization', async () => {
            mockFsPromises.access.mockRejectedValue(new Error('Not found'));
            
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('.nofx-worktrees'),
                { recursive: true }
            );
            expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('.backups'),
                { recursive: true }
            );
        });

        it('should load existing state on initialization', async () => {
            const existingState = JSON.stringify([
                {
                    agentId: 'existing-agent',
                    agentName: 'Existing',
                    agentType: 'backend',
                    branchName: 'agent-existing',
                    worktreePath: '/test/.nofx-worktrees/existing',
                    createdAt: new Date().toISOString(),
                    status: 'active',
                    errorCount: 0
                }
            ]);
            mockFsPromises.readFile.mockResolvedValue(existingState);
            
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockFsPromises.readFile).toHaveBeenCalledWith(
                expect.stringContaining('.worktree-state.json'),
                'utf-8'
            );
        });

        it('should handle initialization errors gracefully', async () => {
            mockFsPromises.access.mockRejectedValue(new Error('Permission denied'));
            mockFsPromises.mkdir.mockRejectedValue(new Error('Permission denied'));
            
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Failed to initialize WorktreeManager:',
                expect.any(Error)
            );
        });

        it('should start health monitoring on initialization', () => {
            jest.useFakeTimers();
            
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            
            expect(setInterval).toHaveBeenCalledWith(
                expect.any(Function),
                30000 // Health check interval
            );
            
            jest.useRealTimers();
        });
    });

    describe('createWorktreeForAgent', () => {
        beforeEach(async () => {
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        it('should create a new worktree for an agent', async () => {
            mockExecSync.mockReturnValue(Buffer.from(''));
            mockFsPromises.access.mockRejectedValue(new Error('Not found')); // Worktree doesn't exist
            
            const result = await worktreeManager.createWorktreeForAgent(mockAgent);
            
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('git worktree add'),
                expect.objectContaining({ encoding: 'utf-8' })
            );
            expect(result).toContain('.nofx-worktrees');
            expect(result).toContain('test-agent-123');
        });

        it('should handle duplicate worktree creation attempts', async () => {
            // First creation
            mockExecSync.mockReturnValue(Buffer.from(''));
            const firstPath = await worktreeManager.createWorktreeForAgent(mockAgent);
            
            // Mock that worktree now exists
            mockFsPromises.access.mockResolvedValue(undefined);
            
            // Second creation attempt
            const secondPath = await worktreeManager.createWorktreeForAgent(mockAgent);
            
            expect(secondPath).toBe(firstPath);
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('Worktree already exists')
            );
        });

        it('should retry on transient git errors', async () => {
            mockExecSync
                .mockImplementationOnce(() => { throw new Error('fatal: worktree locked'); })
                .mockImplementationOnce(() => { throw new Error('fatal: worktree locked'); })
                .mockReturnValueOnce(Buffer.from(''));
            
            const result = await worktreeManager.createWorktreeForAgent(mockAgent);
            
            expect(mockExecSync).toHaveBeenCalledTimes(3);
            expect(result).toContain('.nofx-worktrees');
        });

        it('should create marker file for agent identification', async () => {
            mockExecSync.mockReturnValue(Buffer.from(''));
            
            await worktreeManager.createWorktreeForAgent(mockAgent);
            
            expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.nofx-agent'),
                expect.stringContaining(mockAgent.id),
                'utf-8'
            );
        });

        it('should update gitignore in worktree', async () => {
            mockExecSync.mockReturnValue(Buffer.from(''));
            mockFsPromises.readFile.mockResolvedValue('# Existing gitignore\n');
            
            await worktreeManager.createWorktreeForAgent(mockAgent);
            
            expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.gitignore'),
                expect.stringContaining('.nofx-agent'),
                'utf-8'
            );
        });

        it('should handle git command execution errors', async () => {
            mockExecSync.mockImplementation(() => {
                throw new Error('fatal: not a git repository');
            });
            
            await expect(worktreeManager.createWorktreeForAgent(mockAgent))
                .rejects.toThrow('Failed to create worktree');
            
            expect(mockLoggingService.error).toHaveBeenCalled();
        });

        it('should save state after successful creation', async () => {
            mockExecSync.mockReturnValue(Buffer.from(''));
            
            await worktreeManager.createWorktreeForAgent(mockAgent);
            
            expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.worktree-state.json'),
                expect.any(String),
                'utf-8'
            );
        });
    });

    describe('removeWorktreeForAgent', () => {
        beforeEach(async () => {
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Create a worktree first
            mockExecSync.mockReturnValue(Buffer.from(''));
            await worktreeManager.createWorktreeForAgent(mockAgent);
        });

        it('should remove an existing worktree', async () => {
            await worktreeManager.removeWorktreeForAgent(mockAgent.id);
            
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('git worktree remove'),
                expect.any(Object)
            );
        });

        it('should force remove if normal removal fails', async () => {
            mockExecSync
                .mockImplementationOnce(() => { throw new Error('worktree is dirty'); })
                .mockReturnValueOnce(Buffer.from(''));
            
            await worktreeManager.removeWorktreeForAgent(mockAgent.id);
            
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('--force'),
                expect.any(Object)
            );
        });

        it('should prune worktree references after removal', async () => {
            await worktreeManager.removeWorktreeForAgent(mockAgent.id);
            
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('git worktree prune'),
                expect.any(Object)
            );
        });

        it('should clean up directories if git removal fails', async () => {
            mockExecSync.mockImplementation(() => {
                throw new Error('git worktree remove failed');
            });
            
            await worktreeManager.removeWorktreeForAgent(mockAgent.id);
            
            expect(mockFsPromises.rm).toHaveBeenCalledWith(
                expect.stringContaining(mockAgent.id),
                { recursive: true, force: true }
            );
        });

        it('should handle non-existent worktree removal gracefully', async () => {
            await worktreeManager.removeWorktreeForAgent('non-existent-agent');
            
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('No worktree found')
            );
        });

        it('should update state after removal', async () => {
            await worktreeManager.removeWorktreeForAgent(mockAgent.id);
            
            expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.worktree-state.json'),
                expect.any(String),
                'utf-8'
            );
            
            const state = await worktreeManager.getWorktreePath(mockAgent.id);
            expect(state).toBeUndefined();
        });
    });

    describe('mergeAgentWork', () => {
        beforeEach(async () => {
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Create a worktree with some work
            mockExecSync.mockReturnValue(Buffer.from(''));
            await worktreeManager.createWorktreeForAgent(mockAgent);
        });

        it('should merge agent work back to main branch', async () => {
            mockExecSync.mockReturnValue(Buffer.from('* modified:   src/file.ts\n'));
            
            await worktreeManager.mergeAgentWork(mockAgent.id);
            
            // Should check for changes
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('git status --porcelain'),
                expect.any(Object)
            );
            
            // Should commit changes
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('git add -A'),
                expect.any(Object)
            );
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('git commit'),
                expect.any(Object)
            );
            
            // Should merge to main
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('git merge'),
                expect.any(Object)
            );
        });

        it('should handle merge with no changes', async () => {
            mockExecSync.mockReturnValue(Buffer.from('')); // No changes
            
            await worktreeManager.mergeAgentWork(mockAgent.id);
            
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('No changes to merge')
            );
        });

        it('should handle merge conflicts', async () => {
            mockExecSync
                .mockReturnValueOnce(Buffer.from('* modified:   src/file.ts\n'))
                .mockImplementationOnce(() => Buffer.from('')) // add
                .mockImplementationOnce(() => Buffer.from('')) // commit
                .mockImplementationOnce(() => Buffer.from('')) // checkout main
                .mockImplementationOnce(() => { throw new Error('CONFLICT'); }); // merge fails
            
            await expect(worktreeManager.mergeAgentWork(mockAgent.id))
                .rejects.toThrow('Failed to merge');
            
            expect(mockNotificationService.showError).toHaveBeenCalledWith(
                expect.stringContaining('Failed to merge')
            );
        });

        it('should handle non-existent worktree merge attempt', async () => {
            await expect(worktreeManager.mergeAgentWork('non-existent'))
                .rejects.toThrow('No worktree found');
        });
    });

    describe('cleanupOrphanedWorktrees', () => {
        beforeEach(async () => {
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        it('should clean up orphaned worktrees', async () => {
            mockExecSync.mockReturnValue(Buffer.from(
                'worktree /test/.nofx-worktrees/orphan\n' +
                'branch refs/heads/agent-orphan\n\n'
            ));
            
            mockFsPromises.readFile.mockRejectedValue(new Error('No marker file'));
            
            await worktreeManager.cleanupOrphanedWorktrees();
            
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('git worktree remove'),
                expect.any(Object)
            );
        });

        it('should preserve valid agent worktrees', async () => {
            mockExecSync.mockReturnValue(Buffer.from(
                `worktree /test/.nofx-worktrees/${mockAgent.id}\n` +
                `branch refs/heads/agent-${mockAgent.name}\n\n`
            ));
            
            // Mock that marker file exists and contains valid agent data
            mockFsPromises.readFile.mockResolvedValue(JSON.stringify({
                agentId: mockAgent.id,
                agentName: mockAgent.name
            }));
            
            await worktreeManager.cleanupOrphanedWorktrees();
            
            // Should not remove valid worktree
            expect(mockExecSync).not.toHaveBeenCalledWith(
                expect.stringContaining(`remove.*${mockAgent.id}`),
                expect.any(Object)
            );
        });

        it('should handle cleanup errors gracefully', async () => {
            mockExecSync
                .mockReturnValueOnce(Buffer.from('worktree /test/.nofx-worktrees/error\n'))
                .mockImplementationOnce(() => { throw new Error('Cleanup failed'); });
            
            await worktreeManager.cleanupOrphanedWorktrees();
            
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to cleanup'),
                expect.any(Error)
            );
        });
    });

    describe('Health Monitoring', () => {
        beforeEach(async () => {
            jest.useFakeTimers();
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should perform health checks periodically', async () => {
            // Create a worktree
            mockExecSync.mockReturnValue(Buffer.from(''));
            await worktreeManager.createWorktreeForAgent(mockAgent);
            
            // Fast-forward time to trigger health check
            jest.advanceTimersByTime(30000);
            
            // Allow async health check to complete
            await Promise.resolve();
            
            expect(mockFsPromises.access).toHaveBeenCalledWith(
                expect.stringContaining(mockAgent.id)
            );
        });

        it('should mark unhealthy worktrees as error status', async () => {
            // Create a worktree
            mockExecSync.mockReturnValue(Buffer.from(''));
            await worktreeManager.createWorktreeForAgent(mockAgent);
            
            // Mock that worktree no longer exists
            mockFsPromises.access.mockRejectedValue(new Error('Not found'));
            
            // Trigger health check
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Worktree health check failed')
            );
        });
    });

    describe('Lock Management', () => {
        beforeEach(async () => {
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        it('should prevent concurrent operations on same agent', async () => {
            let callCount = 0;
            mockExecSync.mockImplementation(() => {
                // Simulate slow operation for first call only
                if (callCount++ === 0) {
                    // Block synchronously for a short time to simulate delay
                    const start = Date.now();
                    while (Date.now() - start < 10) {
                        // Busy wait
                    }
                }
                return Buffer.from('');
            });
            
            // Start two operations concurrently
            const promise1 = worktreeManager.createWorktreeForAgent(mockAgent);
            const promise2 = worktreeManager.createWorktreeForAgent(mockAgent);
            
            const results = await Promise.all([promise1, promise2]);
            
            // Both should return same path (second waits for first)
            expect(results[0]).toBe(results[1]);
        });

        it('should release locks after operation completes', async () => {
            mockExecSync.mockReturnValue(Buffer.from(''));
            
            await worktreeManager.createWorktreeForAgent(mockAgent);
            
            // Lock should be released, allowing new operation
            await worktreeManager.removeWorktreeForAgent(mockAgent.id);
            
            expect(mockLoggingService.error).not.toHaveBeenCalledWith(
                expect.stringContaining('lock')
            );
        });
    });

    describe('Error Recovery', () => {
        beforeEach(async () => {
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        it('should recover from incomplete creation on initialization', async () => {
            // Setup state with incomplete creation
            const incompleteState = JSON.stringify([{
                agentId: 'incomplete-agent',
                agentName: 'Incomplete',
                agentType: 'backend',
                branchName: 'agent-incomplete',
                worktreePath: '/test/.nofx-worktrees/incomplete',
                createdAt: new Date().toISOString(),
                status: 'creating',
                errorCount: 0
            }]);
            
            mockFsPromises.readFile.mockResolvedValue(incompleteState);
            mockFsPromises.access.mockRejectedValue(new Error('Not found')); // Worktree doesn't exist
            
            // Create new manager to trigger recovery
            const newManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 50));
            
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Recovering incomplete')
            );
        });

        it('should recover from incomplete removal on initialization', async () => {
            // Setup state with incomplete removal
            const incompleteState = JSON.stringify([{
                agentId: 'removing-agent',
                agentName: 'Removing',
                agentType: 'backend',
                branchName: 'agent-removing',
                worktreePath: '/test/.nofx-worktrees/removing',
                createdAt: new Date().toISOString(),
                status: 'removing',
                errorCount: 0
            }]);
            
            mockFsPromises.readFile.mockResolvedValue(incompleteState);
            
            // Create new manager to trigger recovery
            const newManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 50));
            
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.stringContaining('git worktree remove'),
                expect.any(Object)
            );
        });
    });

    describe('Statistics and Information', () => {
        beforeEach(async () => {
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        it('should provide worktree statistics', async () => {
            // Create multiple worktrees
            const agent1 = createMockAgent({ id: 'agent-1' });
            const agent2 = createMockAgent({ id: 'agent-2', status: 'error' });
            
            mockExecSync.mockReturnValue(Buffer.from(''));
            await worktreeManager.createWorktreeForAgent(agent1);
            await worktreeManager.createWorktreeForAgent(agent2);
            
            const stats = worktreeManager.getWorktreeStats();
            
            expect(stats.totalWorktrees).toBe(2);
            expect(stats.activeAgents).toBeGreaterThan(0);
        });

        it('should list worktree information', async () => {
            mockExecSync.mockReturnValue(Buffer.from(
                'worktree /test/.nofx-worktrees/agent1\n' +
                'branch refs/heads/agent-1\n\n' +
                'worktree /test/.nofx-worktrees/agent2\n' +
                'branch refs/heads/agent-2\n'
            ));
            
            const info = await worktreeManager.listWorktreesInfo();
            
            expect(info).toHaveLength(2);
            expect(info[0]).toHaveProperty('directory');
            expect(info[0]).toHaveProperty('branch');
        });

        it('should get all worktree paths', () => {
            mockExecSync.mockReturnValue(Buffer.from(
                'worktree /test/workspace\n' +
                'worktree /test/.nofx-worktrees/agent1\n' +
                'worktree /test/.nofx-worktrees/agent2\n'
            ));
            
            const paths = worktreeManager.listWorktrees();
            
            expect(paths).toContain('/test/.nofx-worktrees/agent1');
            expect(paths).toContain('/test/.nofx-worktrees/agent2');
        });
    });

    describe('Edge Cases and Boundary Conditions', () => {
        beforeEach(async () => {
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        it('should handle empty agent name', async () => {
            const emptyNameAgent = createMockAgent({ name: '' });
            mockExecSync.mockReturnValue(Buffer.from(''));
            
            const result = await worktreeManager.createWorktreeForAgent(emptyNameAgent);
            
            expect(result).toContain(emptyNameAgent.id);
        });

        it('should handle very long agent names', async () => {
            const longNameAgent = createMockAgent({ 
                name: 'a'.repeat(256) // Very long name
            });
            mockExecSync.mockReturnValue(Buffer.from(''));
            
            const result = await worktreeManager.createWorktreeForAgent(longNameAgent);
            
            expect(result).toBeDefined();
            // Branch name should be truncated or handled appropriately
        });

        it('should handle special characters in agent names', async () => {
            const specialAgent = createMockAgent({
                name: 'Test@Agent#2024$%^&*()'
            });
            mockExecSync.mockReturnValue(Buffer.from(''));
            
            const result = await worktreeManager.createWorktreeForAgent(specialAgent);
            
            expect(result).toBeDefined();
            // Special characters should be sanitized
        });

        it('should handle corrupted state file', async () => {
            mockFsPromises.readFile.mockResolvedValue('{ invalid json ');
            
            const newManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            await new Promise(resolve => setTimeout(resolve, 50));
            
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to load state'),
                expect.any(Error)
            );
        });

        it('should handle file system full errors', async () => {
            mockFsPromises.writeFile.mockRejectedValue(new Error('ENOSPC: no space left on device'));
            mockExecSync.mockReturnValue(Buffer.from(''));
            
            await expect(worktreeManager.createWorktreeForAgent(mockAgent))
                .rejects.toThrow();
            
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ message: expect.stringContaining('ENOSPC') })
            );
        });

        it('should handle permission errors', async () => {
            mockExecSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });
            
            await expect(worktreeManager.createWorktreeForAgent(mockAgent))
                .rejects.toThrow('Failed to create worktree');
            
            expect(mockNotificationService.showError).toHaveBeenCalled();
        });
    });

    describe('Disposal and Cleanup', () => {
        it('should clean up resources on disposal', () => {
            jest.useFakeTimers();
            
            worktreeManager = new WorktreeManager(workspacePath, mockLoggingService, mockNotificationService);
            
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
            
            // Call dispose if it exists
            (worktreeManager as any).dispose?.();
            
            expect(clearIntervalSpy).toHaveBeenCalled();
            
            jest.useRealTimers();
        });
    });
});

describe('WorktreeManager - Security Tests', () => {
    let worktreeManager: WorktreeManager;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    
    beforeEach(() => {
        jest.clearAllMocks();
        mockLoggingService = createMockLoggingService();
    });

    describe('Command Injection Protection', () => {
        it('should sanitize agent names to prevent command injection', async () => {
            const maliciousAgent = createMockAgent({
                id: 'test-id',
                name: 'test; rm -rf /'
            });

            worktreeManager = new WorktreeManager('/test/workspace', mockLoggingService);
            
            const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
            mockExecSync.mockReturnValue(Buffer.from(''));
            
            await worktreeManager.createWorktreeForAgent(maliciousAgent);
            
            // Check that the command doesn't contain the malicious part
            expect(mockExecSync).toHaveBeenCalled();
            const calls = mockExecSync.mock.calls;
            calls.forEach(call => {
                const command = call[0] as string;
                expect(command).not.toContain('rm -rf');
            });
        });

        it('should validate branch names against git requirements', async () => {
            const invalidBranchAgent = createMockAgent({
                id: 'test',
                name: '../../../etc/passwd',
                type: 'backend'
            });

            worktreeManager = new WorktreeManager('/test/workspace', mockLoggingService);
            
            const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
            mockExecSync.mockReturnValue(Buffer.from(''));
            
            await worktreeManager.createWorktreeForAgent(invalidBranchAgent);
            
            // Branch name should be sanitized
            const calls = mockExecSync.mock.calls;
            calls.forEach(call => {
                const command = call[0] as string;
                expect(command).not.toContain('../');
                expect(command).not.toContain('etc/passwd');
            });
        });

        it('should prevent path traversal attacks', async () => {
            const pathTraversalAgent = createMockAgent({
                id: '../../outside',
                name: 'PathTraversal',
                type: 'backend'
            });

            worktreeManager = new WorktreeManager('/test/workspace', mockLoggingService);
            
            const result = await worktreeManager.createWorktreeForAgent(pathTraversalAgent);
            
            // Path should be contained within the worktree directory
            expect(result).toContain('.nofx-worktrees');
            expect(result).not.toContain('../..');
        });
    });
});

describe('WorktreeManager - Performance Tests', () => {
    let worktreeManager: WorktreeManager;
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should handle concurrent creation of multiple worktrees', async () => {
        worktreeManager = new WorktreeManager('/test/workspace');
        
        const agents: Agent[] = Array.from({ length: 10 }, (_, i) => createMockAgent({
            id: `agent-${i}`,
            name: `Agent ${i}`,
            type: 'backend'
        }));

        const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
        mockExecSync.mockReturnValue(Buffer.from(''));

        const startTime = Date.now();
        
        // Create all worktrees concurrently
        const promises = agents.map(agent => 
            worktreeManager.createWorktreeForAgent(agent)
        );
        
        const results = await Promise.all(promises);
        
        const duration = Date.now() - startTime;
        
        // All should complete
        expect(results).toHaveLength(10);
        results.forEach(result => {
            expect(result).toContain('.nofx-worktrees');
        });
        
        // Should complete in reasonable time (under 5 seconds for 10 agents)
        expect(duration).toBeLessThan(5000);
    });

    it('should handle rapid creation and removal cycles', async () => {
        worktreeManager = new WorktreeManager('/test/workspace');
        
        const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
        mockExecSync.mockReturnValue(Buffer.from(''));

        const agent = createMockAgent({
            id: 'cycle-agent',
            name: 'Cycle Agent',
            type: 'frontend'
        });

        // Perform multiple create/remove cycles
        for (let i = 0; i < 5; i++) {
            await worktreeManager.createWorktreeForAgent(agent);
            await worktreeManager.removeWorktreeForAgent(agent.id);
        }

        // Should handle all cycles without error
        expect(mockExecSync).toHaveBeenCalled();
    });

    it('should efficiently handle large state files', async () => {
        // Create a large state with many agents
        const largeState = Array.from({ length: 100 }, (_, i) => ({
            agentId: `agent-${i}`,
            agentName: `Agent ${i}`,
            agentType: 'backend',
            branchName: `agent-${i}-branch`,
            worktreePath: `/test/.nofx-worktrees/agent-${i}`,
            createdAt: new Date().toISOString(),
            status: 'active',
            errorCount: 0
        }));

        const mockFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;
        mockFsPromises.readFile.mockResolvedValue(JSON.stringify(largeState));

        const startTime = Date.now();
        
        worktreeManager = new WorktreeManager('/test/workspace');
        
        // Allow initialization to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const duration = Date.now() - startTime;
        
        // Should load large state quickly (under 1 second)
        expect(duration).toBeLessThan(1000);
    });
});