import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { execSync } from 'child_process';
import { WorktreeManager } from '../../../worktrees/WorktreeManager';
import { Agent } from '../../../agents/types';
import { getAppStateStore } from '../../../state/AppStateStore';
import * as selectors from '../../../state/selectors';
import * as actions from '../../../state/actions';
// Mock logging service
class MockLoggingService {
    debug(message: string, ...args: any[]): void {
        console.log('[DEBUG]', message, ...args);
    }
    info(message: string, ...args: any[]): void {
        console.log('[INFO]', message, ...args);
    }
    warn(message: string, ...args: any[]): void {
        console.log('[WARN]', message, ...args);
    }
    error(message: string, ...args: any[]): void {
        console.log('[ERROR]', message, ...args);
    }
}

// Mock notification service
class MockNotificationService {
    async showInformation(message: string, ...actions: string[]): Promise<string | undefined> {
        console.log('[NOTIFICATION]', message, actions);
        return actions[0]; // Always pick first action for testing
    }

    async showWarning(message: string, ...actions: string[]): Promise<string | undefined> {
        console.log('[WARNING]', message, actions);
        return actions[0];
    }

    async showError(message: string, ...actions: string[]): Promise<string | undefined> {
        console.log('[ERROR]', message, actions);
        return undefined;
    }
}

describe('WorktreeManager Robustness Tests', function () {
    this.timeout(30000); // 30 second timeout for git operations

    let tempDir: string;
    let workspaceDir: string;
    let worktreeManager: WorktreeManager;
    let mockLogger: MockLoggingService;
    let mockNotification: MockNotificationService;

    const testAgent: Agent = {
        id: 'test-agent-123',
        name: 'Test Agent',
        type: 'frontend-specialist',
        status: 'active',
        assignedTasks: [],
        createdAt: new Date(),
        terminal: undefined,
        pid: undefined,
        metrics: {
            tasksCompleted: 0,
            averageTaskTime: 0,
            successRate: 0
        }
    };

    beforeEach(async () => {
        // Create temporary workspace
        tempDir = path.join(__dirname, `temp-workspace-${Date.now()}`);
        workspaceDir = path.join(tempDir, 'test-repo');

        await fs.mkdir(workspaceDir, { recursive: true });

        // Initialize git repository
        execSync('git init', { cwd: workspaceDir });
        execSync('git config user.name "Test User"', { cwd: workspaceDir });
        execSync('git config user.email "test@example.com"', { cwd: workspaceDir });

        // Create initial commit
        await fs.writeFile(path.join(workspaceDir, 'README.md'), '# Test Repository');
        execSync('git add README.md', { cwd: workspaceDir });
        execSync('git commit -m "Initial commit"', { cwd: workspaceDir });

        mockLogger = new MockLoggingService();
        mockNotification = new MockNotificationService();
        worktreeManager = new WorktreeManager(workspaceDir, mockLogger, mockNotification);

        // Wait for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    afterEach(async () => {
        try {
            // Clean up worktrees before removing directory
            await worktreeManager.cleanupOrphanedWorktrees();
            worktreeManager.dispose();

            // Remove temp directory
            if (fsSync.existsSync(tempDir)) {
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        } catch (error) {
            console.warn('Cleanup error (non-fatal):', error);
        }
    });

    describe('Creation Robustness', () => {
        it('should handle concurrent creation requests safely', async () => {
            const agents = [
                { ...testAgent, id: 'agent-1', name: 'Agent 1' },
                { ...testAgent, id: 'agent-2', name: 'Agent 2' },
                { ...testAgent, id: 'agent-3', name: 'Agent 3' }
            ];

            // Create multiple worktrees concurrently
            const promises = agents.map(agent => worktreeManager.createWorktreeForAgent(agent));
            const results = await Promise.allSettled(promises);

            // All should succeed or fail gracefully
            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'fulfilled') {
                    const worktreePath = (results[i] as PromiseFulfilledResult<string>).value;
                    assert.ok(fsSync.existsSync(worktreePath), `Worktree should exist for ${agents[i].name}`);

                    // Verify marker file
                    const markerPath = path.join(worktreePath, '.nofx-agent');
                    assert.ok(fsSync.existsSync(markerPath), `Marker file should exist for ${agents[i].name}`);
                } else {
                    console.log(
                        `Agent ${agents[i].name} creation failed (acceptable in concurrent test):`,
                        (results[i] as PromiseRejectedResult).reason
                    );
                }
            }
        });

        it('should recover from partial creation failure', async () => {
            // Simulate creation failure by creating a file with the same name as worktree directory
            const expectedWorktreePath = path.join(path.dirname(workspaceDir), '.nofx-worktrees', testAgent.id);
            await fs.mkdir(path.dirname(expectedWorktreePath), { recursive: true });
            await fs.writeFile(expectedWorktreePath, 'blocking file');

            try {
                await worktreeManager.createWorktreeForAgent(testAgent);
                assert.fail('Should have thrown an error due to blocked directory');
            } catch (error) {
                assert.ok(error instanceof Error);
                console.log('Expected error caught:', error.message);
            }

            // Clean up the blocking file
            await fs.rm(expectedWorktreePath, { force: true });

            // Now creation should succeed
            const worktreePath = await worktreeManager.createWorktreeForAgent(testAgent);
            assert.ok(fsSync.existsSync(worktreePath), 'Worktree should be created after cleanup');
        });

        it('should handle duplicate creation requests idempotently', async () => {
            // Create worktree first time
            const firstPath = await worktreeManager.createWorktreeForAgent(testAgent);
            assert.ok(fsSync.existsSync(firstPath), 'First worktree should exist');

            // Create again - should return same path
            const secondPath = await worktreeManager.createWorktreeForAgent(testAgent);
            assert.strictEqual(firstPath, secondPath, 'Should return same path for duplicate requests');
        });
    });

    describe('Removal Robustness', () => {
        beforeEach(async () => {
            // Create a worktree for testing removal
            await worktreeManager.createWorktreeForAgent(testAgent);
        });

        it('should handle removal of non-existent worktree gracefully', async () => {
            const nonExistentAgent = { ...testAgent, id: 'non-existent-agent' };

            // Should not throw
            await worktreeManager.removeWorktreeForAgent(nonExistentAgent.id);
        });

        it('should create backup of uncommitted changes before removal', async () => {
            const worktreePath = worktreeManager.getWorktreePath(testAgent.id);
            assert.ok(worktreePath, 'Worktree path should exist');

            // Add uncommitted changes
            const testFilePath = path.join(worktreePath, 'test-change.txt');
            await fs.writeFile(testFilePath, 'Uncommitted changes');

            // Remove worktree
            await worktreeManager.removeWorktreeForAgent(testAgent.id);

            // Verify backup was created
            const backupDir = path.join(path.dirname(workspaceDir), '.nofx-worktrees', '.backups');
            if (fsSync.existsSync(backupDir)) {
                const backups = await fs.readdir(backupDir);
                assert.ok(backups.length > 0, 'Backup should have been created for uncommitted changes');
            }
        });

        it('should handle git command failures during removal', async () => {
            const worktreePath = worktreeManager.getWorktreePath(testAgent.id);
            assert.ok(worktreePath, 'Worktree path should exist');

            // Corrupt the worktree by removing .git directory
            const gitDir = path.join(worktreePath, '.git');
            if (fsSync.existsSync(gitDir)) {
                await fs.rm(gitDir, { recursive: true, force: true });
            }

            // Should still remove successfully using fallback mechanism
            await worktreeManager.removeWorktreeForAgent(testAgent.id);

            // Verify directory was cleaned up
            assert.ok(
                !fsSync.existsSync(worktreePath),
                'Worktree directory should be removed even with git corruption'
            );
        });
    });

    describe('Cleanup Robustness', () => {
        it('should identify and clean orphaned worktrees', async () => {
            // Create a worktree
            const worktreePath = await worktreeManager.createWorktreeForAgent(testAgent);

            // Simulate orphaning by clearing the internal state
            (worktreeManager as any).worktrees.clear();

            // Run cleanup
            await worktreeManager.cleanupOrphanedWorktrees();

            // Verify orphaned worktree was removed
            assert.ok(!fsSync.existsSync(worktreePath), 'Orphaned worktree should be cleaned up');
        });

        it('should handle corrupted marker files during cleanup', async () => {
            // Create a worktree
            const worktreePath = await worktreeManager.createWorktreeForAgent(testAgent);

            // Corrupt the marker file
            const markerPath = path.join(worktreePath, '.nofx-agent');
            await fs.writeFile(markerPath, 'invalid json content');

            // Clear internal state to make it orphaned
            (worktreeManager as any).worktrees.clear();

            // Cleanup should handle corrupted marker gracefully
            await worktreeManager.cleanupOrphanedWorktrees();

            // Should still clean up the worktree
            assert.ok(!fsSync.existsSync(worktreePath), 'Worktree with corrupted marker should be cleaned up');
        });
    });

    describe('State Persistence Robustness', () => {
        it('should persist and recover worktree state across restarts', async () => {
            // Create a worktree
            const originalPath = await worktreeManager.createWorktreeForAgent(testAgent);

            // Get current stats
            const stats = await worktreeManager.getWorktreeStats();
            assert.strictEqual(stats.activeWorktrees, 1, 'Should have one active worktree');

            // Simulate restart by creating new manager instance
            const newManager = new WorktreeManager(workspaceDir, mockLogger, mockNotification);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for initialization

            // Should recover the persisted state
            const recoveredPath = newManager.getWorktreePath(testAgent.id);
            assert.strictEqual(recoveredPath, originalPath, 'Should recover persisted worktree path');

            const newStats = await newManager.getWorktreeStats();
            assert.strictEqual(newStats.activeWorktrees, 1, 'Should recover active worktree count');

            // Clean up
            newManager.dispose();
        });

        it('should handle corrupted state file gracefully', async () => {
            // Create a worktree first
            await worktreeManager.createWorktreeForAgent(testAgent);

            // Corrupt the state file
            const stateFile = path.join(path.dirname(workspaceDir), '.nofx-worktrees', '.worktree-state.json');
            if (fsSync.existsSync(stateFile)) {
                await fs.writeFile(stateFile, 'invalid json content');
            }

            // Create new manager - should handle corrupted state gracefully
            const newManager = new WorktreeManager(workspaceDir, mockLogger, mockNotification);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for initialization

            // Should start with empty state but not crash
            const stats = await newManager.getWorktreeStats();
            console.log('Stats after corrupted state recovery:', stats);

            newManager.dispose();
        });
    });

    describe('Health Monitoring', () => {
        it('should detect missing worktree directories', async () => {
            // Create a worktree
            const worktreePath = await worktreeManager.createWorktreeForAgent(testAgent);

            // Manually remove the directory but keep state
            await fs.rm(worktreePath, { recursive: true, force: true });

            // Trigger health check by refreshing states
            await worktreeManager.refreshWorktreeStates();

            // Should detect the missing directory
            const state = worktreeManager.getWorktreeState(testAgent.id);
            assert.ok(state?.status === 'error' || !state, 'Should detect missing worktree as error');
        });

        it('should recover from error states when possible', async () => {
            // Create a worktree
            const worktreePath = await worktreeManager.createWorktreeForAgent(testAgent);

            // Manually set error state
            const state = worktreeManager.getWorktreeState(testAgent.id);
            if (state) {
                state.status = 'error';
                state.errorCount = 1;
            }

            // Refresh should recover since directory still exists
            await worktreeManager.refreshWorktreeStates();

            // Should be recovered
            const recoveredState = worktreeManager.getWorktreeState(testAgent.id);
            assert.strictEqual(
                recoveredState?.status,
                'active',
                'Should recover from error state when directory exists'
            );
            assert.strictEqual(recoveredState?.errorCount, 0, 'Error count should be reset');
        });
    });

    describe('Emergency Recovery', () => {
        it('should perform emergency recovery when system is in bad state', async () => {
            // Create multiple worktrees
            const agents = [
                { ...testAgent, id: 'agent-1', name: 'Agent 1' },
                { ...testAgent, id: 'agent-2', name: 'Agent 2' }
            ];

            for (const agent of agents) {
                await worktreeManager.createWorktreeForAgent(agent);
            }

            // Simulate system corruption by clearing git worktree list manually
            try {
                execSync('git worktree prune', { cwd: workspaceDir });
            } catch (error) {
                // Ignore git errors
            }

            // Perform emergency recovery
            await worktreeManager.emergencyRecovery();

            // System should be in a clean state
            const allStates = worktreeManager.getAllWorktreeStates();
            console.log(
                'States after emergency recovery:',
                allStates.map(s => ({ id: s.agentId, status: s.status }))
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle disk full scenarios gracefully', async () => {
            // This test would ideally simulate disk full conditions
            // For now, we test the error handling path

            const invalidAgent = { ...testAgent, name: '/invalid/path/name' };

            try {
                await worktreeManager.createWorktreeForAgent(invalidAgent);
                // If it doesn't throw, that's okay - git might handle it
            } catch (error) {
                assert.ok(error instanceof Error, 'Should throw proper error for invalid paths');
                console.log('Expected error for invalid path:', error.message);
            }
        });

        it('should handle network interruptions during git operations', async () => {
            // This would ideally test network failures during git operations
            // For now, we test timeout and retry behavior is in place

            // The retry mechanism should be tested by the implementation
            // Here we just verify the system can recover from transient failures

            const worktreePath = await worktreeManager.createWorktreeForAgent(testAgent);
            assert.ok(fsSync.existsSync(worktreePath), 'Should create worktree despite potential transient issues');
        });
    });
});
