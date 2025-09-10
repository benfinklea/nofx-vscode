import { WorktreeHealthMonitor, WorktreeHealth, HealthIssue } from '../../../worktrees/WorktreeHealthMonitor';
import * as fs from 'fs/promises';
import * as fsConstants from 'fs';
import { execSync } from 'child_process';
import { createMockLoggingService, createMockNotificationService } from '../../helpers/mockFactories';

// Mock modules
jest.mock('fs/promises');
jest.mock('fs', () => ({
    constants: {
        R_OK: 4,
        W_OK: 2
    }
}));
jest.mock('child_process');

describe('WorktreeHealthMonitor - 100% Coverage', () => {
    let monitor: WorktreeHealthMonitor;
    let mockLoggingService: ReturnType<typeof createMockLoggingService>;
    let mockNotificationService: ReturnType<typeof createMockNotificationService>;
    const workspacePath = '/test/workspace';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockLoggingService = createMockLoggingService();
        mockNotificationService = createMockNotificationService();

        // Setup default mocks
        (fs.access as jest.Mock).mockResolvedValue(undefined);
        (fs.stat as jest.Mock).mockResolvedValue({ mtime: new Date() });
        (fs.rm as jest.Mock).mockResolvedValue(undefined);
        (fs.unlink as jest.Mock).mockResolvedValue(undefined);
        (execSync as jest.Mock).mockReturnValue('');
    });

    afterEach(() => {
        jest.useRealTimers();
        monitor?.dispose();
    });

    describe('Initialization and Registration', () => {
        it('should start monitoring on initialization', () => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService, mockNotificationService);

            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 30000);
        });

        it('should perform initial health check', () => {
            const performCheckSpy = jest.spyOn(WorktreeHealthMonitor.prototype as any, 'performHealthCheck');

            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService);

            expect(performCheckSpy).toHaveBeenCalled();
        });

        it('should register worktree for monitoring', () => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService);

            const eventPromise = new Promise(resolve => {
                monitor.once('worktree:registered', resolve);
            });

            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            expect(mockLoggingService.debug).toHaveBeenCalledWith('Registered worktree for monitoring: agent-1');
        });

        it('should unregister worktree from monitoring', () => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService);

            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');
            monitor.unregisterWorktree('agent-1');

            expect(mockLoggingService.debug).toHaveBeenCalledWith('Unregistered worktree from monitoring: agent-1');
        });

        it('should emit events on registration/unregistration', async () => {
            monitor = new WorktreeHealthMonitor(workspacePath);

            const registerPromise = new Promise(resolve => {
                monitor.once('worktree:registered', resolve);
            });

            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            const registerEvent = await registerPromise;
            expect(registerEvent).toEqual({ agentId: 'agent-1', path: '/test/worktree/agent-1' });

            const unregisterPromise = new Promise(resolve => {
                monitor.once('worktree:unregistered', resolve);
            });

            monitor.unregisterWorktree('agent-1');

            const unregisterEvent = await unregisterPromise;
            expect(unregisterEvent).toEqual({ agentId: 'agent-1' });
        });
    });

    describe('Health Checks', () => {
        beforeEach(() => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService, mockNotificationService);
        });

        it('should check path existence', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.issues).toContainEqual(
                expect.objectContaining({
                    type: 'missing',
                    severity: 'critical'
                })
            );
        });

        it('should check disk usage', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (execSync as jest.Mock).mockReturnValueOnce('1500\t/test/worktree/agent-1');

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.issues).toContainEqual(
                expect.objectContaining({
                    type: 'disk-space',
                    severity: 'critical'
                })
            );
        });

        it('should check git status', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (execSync as jest.Mock).mockReturnValueOnce('UU conflict.txt\n M modified.txt');

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.issues).toContainEqual(
                expect.objectContaining({
                    type: 'corrupt',
                    severity: 'high',
                    description: expect.stringContaining('conflicts')
                })
            );
        });

        it('should check for lock files', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock)
                .mockResolvedValueOnce(undefined) // Path exists
                .mockResolvedValueOnce(undefined); // Lock file exists

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.issues).toContainEqual(
                expect.objectContaining({
                    type: 'locked',
                    severity: 'high'
                })
            );
        });

        it('should check staleness', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            const oldDate = new Date(Date.now() - 7200000); // 2 hours old
            (fs.stat as jest.Mock).mockResolvedValueOnce({ mtime: oldDate });

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.issues).toContainEqual(
                expect.objectContaining({
                    type: 'stale',
                    severity: 'low'
                })
            );
        });

        it('should check permissions', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock)
                .mockResolvedValueOnce(undefined) // Path exists
                .mockRejectedValueOnce(new Error()) // No lock
                .mockRejectedValueOnce(new Error()) // No lock
                .mockRejectedValueOnce(new Error('Permission denied')); // Permission check fails

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.issues).toContainEqual(
                expect.objectContaining({
                    type: 'permission',
                    severity: 'critical'
                })
            );
        });

        it('should handle health check errors', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock).mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.status).toBe('critical');
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Health check failed'),
                expect.any(Error)
            );
        });

        it('should emit health update events', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            const eventPromise = new Promise<WorktreeHealth>(resolve => {
                monitor.once('health:update', resolve);
            });

            await monitor.performHealthCheck();

            const event = await eventPromise;
            expect(event.agentId).toBe('agent-1');
            expect(event.status).toBeDefined();
        });

        it('should emit check complete event', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            const eventPromise = new Promise(resolve => {
                monitor.once('health:check:complete', resolve);
            });

            await monitor.performHealthCheck();

            const event = await eventPromise;
            expect(event).toHaveProperty('duration');
            expect(event).toHaveProperty('worktrees');
            expect(event).toHaveProperty('healthy');
        });
    });

    describe('Health Status Calculation', () => {
        beforeEach(() => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService);
        });

        it('should calculate healthy status with no issues', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.status).toBe('healthy');
        });

        it('should calculate critical status with critical issues', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.status).toBe('critical');
        });

        it('should calculate degraded status with high/medium issues', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (execSync as jest.Mock).mockReturnValueOnce('600\t/test/worktree/agent-1'); // Medium disk usage

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.status).toBe('degraded');
        });
    });

    describe('Recovery Operations', () => {
        beforeEach(() => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService, mockNotificationService);
        });

        it('should queue recovery for critical issues', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

            await monitor.performHealthCheck();

            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('Performing recreate recovery')
            );
        });

        it('should perform reset recovery', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (execSync as jest.Mock).mockReturnValueOnce('UU conflict.txt'); // Conflicts

            const eventPromise = new Promise(resolve => {
                monitor.once('recovery:start', resolve);
            });

            await monitor.performHealthCheck();

            const event = await eventPromise;
            expect(event).toHaveProperty('type', 'reset');

            expect(execSync).toHaveBeenCalledWith(
                'git reset --hard HEAD',
                expect.objectContaining({ cwd: '/test/worktree/agent-1' })
            );
        });

        it('should perform clean recovery for disk space', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (execSync as jest.Mock).mockReturnValueOnce('1500\t/test/worktree/agent-1'); // High disk usage

            await monitor.performHealthCheck();

            expect(execSync).toHaveBeenCalledWith(
                'git gc --aggressive --prune=now',
                expect.objectContaining({ cwd: '/test/worktree/agent-1' })
            );
            expect(fs.rm).toHaveBeenCalled(); // Clean build artifacts
        });

        it('should perform recreate recovery for missing worktree', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

            await monitor.performHealthCheck();

            expect(execSync).toHaveBeenCalledWith(
                expect.stringContaining('git worktree add'),
                expect.objectContaining({ cwd: workspacePath })
            );
        });

        it('should perform unlock recovery', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock)
                .mockResolvedValueOnce(undefined) // Path exists
                .mockResolvedValueOnce(undefined); // Lock exists

            await monitor.performHealthCheck();

            expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('.git/index.lock'));
        });

        it('should perform prune recovery', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            // Create orphaned worktree scenario
            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

            await monitor.performHealthCheck();

            expect(execSync).toHaveBeenCalledWith(
                'git worktree prune',
                expect.objectContaining({ cwd: workspacePath })
            );
        });

        it('should perform general repair', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            // Trigger repair scenario
            (execSync as jest.Mock)
                .mockReturnValueOnce(' M file.txt') // Dirty status
                .mockImplementationOnce(() => {
                    throw new Error('fsck failed');
                });

            await monitor.performHealthCheck();

            expect(execSync).toHaveBeenCalledWith('git config core.fileMode false', expect.any(Object));
        });

        it('should handle recovery failures', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
            (execSync as jest.Mock).mockImplementation(() => {
                throw new Error('Recovery failed');
            });

            const eventPromise = new Promise(resolve => {
                monitor.once('recovery:failed', resolve);
            });

            await monitor.performHealthCheck();

            const event = await eventPromise;
            expect(event).toHaveProperty('error');

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Recovery failed'),
                expect.any(Error)
            );
        });

        it('should limit recovery attempts', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock).mockRejectedValue(new Error('Not found'));
            (execSync as jest.Mock).mockImplementation(() => {
                throw new Error('Recovery failed');
            });

            // Attempt recovery multiple times
            for (let i = 0; i < 5; i++) {
                await monitor.performHealthCheck();
            }

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.status).toBe('dead');
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Max recovery attempts reached')
            );
        });

        it('should notify user on critical recovery failure', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
            (execSync as jest.Mock).mockImplementation(() => {
                throw new Error('Recovery failed');
            });

            await monitor.performHealthCheck();

            expect(mockNotificationService.showError).toHaveBeenCalledWith(
                expect.stringContaining('Failed to recover worktree')
            );
        });

        it('should emit recovery success event', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

            const eventPromise = new Promise(resolve => {
                monitor.once('recovery:success', resolve);
            });

            await monitor.performHealthCheck();

            const event = await eventPromise;
            expect(event).toHaveProperty('type');
            expect(event).toHaveProperty('agentId', 'agent-1');
        });
    });

    describe('Overall Health Monitoring', () => {
        beforeEach(() => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService, mockNotificationService);
        });

        it('should alert when many worktrees are unhealthy', async () => {
            // Register multiple worktrees
            for (let i = 0; i < 10; i++) {
                monitor.registerWorktree(`agent-${i}`, `/test/worktree/agent-${i}`);
            }

            // Make most unhealthy
            (fs.access as jest.Mock).mockRejectedValue(new Error('Not found'));

            await monitor.performHealthCheck();

            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                expect.stringContaining('worktrees are unhealthy')
            );
        });

        it('should handle too many uncommitted changes', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            // Create many modified files
            const gitStatus = Array.from({ length: 150 }, (_, i) => ` M file${i}.txt`).join('\n');
            (execSync as jest.Mock).mockReturnValueOnce(gitStatus);

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.issues).toContainEqual(
                expect.objectContaining({
                    type: 'stale',
                    severity: 'medium',
                    description: expect.stringContaining('Too many uncommitted changes')
                })
            );
        });
    });

    describe('Report Generation', () => {
        beforeEach(() => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService, mockNotificationService);
        });

        it('should generate comprehensive health report', async () => {
            // Register worktrees with different statuses
            monitor.registerWorktree('healthy-1', '/test/worktree/healthy-1');
            monitor.registerWorktree('degraded-1', '/test/worktree/degraded-1');
            monitor.registerWorktree('critical-1', '/test/worktree/critical-1');

            // Mock different health states
            (fs.access as jest.Mock)
                .mockResolvedValueOnce(undefined) // healthy-1 exists
                .mockResolvedValueOnce(undefined) // degraded-1 exists
                .mockRejectedValueOnce(new Error()); // critical-1 missing

            (execSync as jest.Mock)
                .mockReturnValueOnce('') // healthy-1 clean
                .mockReturnValueOnce('200\t/test') // healthy-1 disk ok
                .mockReturnValueOnce(' M file.txt') // degraded-1 dirty
                .mockReturnValueOnce('600\t/test'); // degraded-1 disk warning

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();

            expect(report.summary.total).toBe(3);
            expect(report.summary.healthy).toBe(1);
            expect(report.summary.degraded).toBe(1);
            expect(report.summary.critical).toBe(1);
            expect(report.summary.dead).toBe(0);

            expect(report.details).toHaveLength(3);
            expect(report.metrics.totalChecks).toBe(1);
        });

        it('should track recovery metrics', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            // Trigger successful recovery
            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

            await monitor.performHealthCheck();

            // Trigger failed recovery
            monitor.registerWorktree('agent-2', '/test/worktree/agent-2');
            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
            (execSync as jest.Mock).mockImplementation(() => {
                throw new Error('Recovery failed');
            });

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();

            expect(report.metrics.totalRecoveries).toBe(2);
            expect(report.metrics.successfulRecoveries).toBe(1);
            expect(report.metrics.failedRecoveries).toBe(1);
            expect(report.metrics.successRate).toBe(0.5);
        });
    });

    describe('Manual Controls', () => {
        beforeEach(() => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService, mockNotificationService);
        });

        it('should force immediate health check for specific agent', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');
            monitor.registerWorktree('agent-2', '/test/worktree/agent-2');

            await monitor.forceHealthCheck('agent-1');

            expect(fs.access).toHaveBeenCalledWith('/test/worktree/agent-1');
        });

        it('should force immediate health check for all agents', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');
            monitor.registerWorktree('agent-2', '/test/worktree/agent-2');

            await monitor.forceHealthCheck();

            expect(fs.access).toHaveBeenCalledWith('/test/worktree/agent-1');
            expect(fs.access).toHaveBeenCalledWith('/test/worktree/agent-2');
        });

        it('should handle force check for non-existent agent', async () => {
            await monitor.forceHealthCheck('non-existent');

            // Should not throw
            expect(mockLoggingService.error).not.toHaveBeenCalled();
        });

        it('should enable/disable auto-recovery globally', () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');
            monitor.registerWorktree('agent-2', '/test/worktree/agent-2');

            monitor.setAutoRecovery(false);

            const report = monitor.getHealthReport();
            report.details.forEach(health => {
                expect(health.autoRecoveryEnabled).toBe(false);
            });

            monitor.setAutoRecovery(true);

            const report2 = monitor.getHealthReport();
            report2.details.forEach(health => {
                expect(health.autoRecoveryEnabled).toBe(true);
            });
        });

        it('should enable/disable auto-recovery for specific agent', () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');
            monitor.registerWorktree('agent-2', '/test/worktree/agent-2');

            monitor.setAutoRecovery(false, 'agent-1');

            const report = monitor.getHealthReport();
            const agent1 = report.details.find(h => h.agentId === 'agent-1');
            const agent2 = report.details.find(h => h.agentId === 'agent-2');

            expect(agent1?.autoRecoveryEnabled).toBe(false);
            expect(agent2?.autoRecoveryEnabled).toBe(true);
        });
    });

    describe('Error Handling', () => {
        beforeEach(() => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService, mockNotificationService);
        });

        it('should handle disk usage check errors', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (execSync as jest.Mock).mockImplementation(cmd => {
                if (cmd.includes('du')) {
                    throw new Error('du failed');
                }
                return '';
            });

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.metrics.diskUsageMB).toBe(0);
        });

        it('should handle git status errors', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (execSync as jest.Mock).mockImplementation(cmd => {
                if (cmd.includes('git status')) {
                    throw new Error('Not a git repository');
                }
                return '';
            });

            await monitor.performHealthCheck();

            const report = monitor.getHealthReport();
            const health = report.details.find(h => h.agentId === 'agent-1');

            expect(health?.metrics.gitStatus).toBe('unknown');
        });

        it('should handle cleanup errors gracefully', async () => {
            monitor.registerWorktree('agent-1', '/test/worktree/agent-1');

            (execSync as jest.Mock).mockReturnValueOnce('1500\t/test'); // High disk usage
            (fs.rm as jest.Mock).mockRejectedValue(new Error('Permission denied'));

            await monitor.performHealthCheck();

            // Should continue despite cleanup errors
            expect(mockLoggingService.info).toHaveBeenCalledWith(expect.stringContaining('Performing clean recovery'));
        });
    });

    describe('Disposal', () => {
        it('should clear interval on disposal', () => {
            monitor = new WorktreeHealthMonitor(workspacePath, mockLoggingService);

            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            monitor.dispose();

            expect(clearIntervalSpy).toHaveBeenCalled();
        });

        it('should remove all event listeners on disposal', () => {
            monitor = new WorktreeHealthMonitor(workspacePath);

            monitor.on('test', () => {});
            expect(monitor.listenerCount('test')).toBe(1);

            monitor.dispose();

            expect(monitor.listenerCount('test')).toBe(0);
        });
    });
});
