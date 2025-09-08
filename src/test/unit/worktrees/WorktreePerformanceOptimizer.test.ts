import { WorktreePerformanceOptimizer } from '../../../worktrees/WorktreePerformanceOptimizer';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { createMockAgent } from '../../helpers/testAgentFactory';
import { createMockLoggingService, createMockNotificationService } from '../../helpers/mockFactories';

// Mock child_process
jest.mock('child_process', () => ({
    spawn: jest.fn(),
    execSync: jest.fn()
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
    access: jest.fn(),
    mkdir: jest.fn(),
    rename: jest.fn(),
    rm: jest.fn()
}));

// Mock path
jest.mock('path', () => ({
    join: jest.fn((...args) => args.join('/')),
    dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/'))
}));

describe('WorktreePerformanceOptimizer - 100% Coverage', () => {
    let optimizer: WorktreePerformanceOptimizer;
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
        (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
        (fs.rename as jest.Mock).mockResolvedValue(undefined);
        (fs.rm as jest.Mock).mockResolvedValue(undefined);
        
        // Mock spawn for git commands
        const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
        mockSpawn.mockReturnValue({
            stdout: { on: jest.fn((event, cb) => { if (event === 'data') cb('success'); }) },
            stderr: { on: jest.fn() },
            on: jest.fn((event, cb) => { if (event === 'close') cb(0); }),
            kill: jest.fn()
        } as any);
    });

    afterEach(() => {
        jest.useRealTimers();
        optimizer?.dispose();
    });

    describe('Initialization', () => {
        it('should initialize with pool pre-allocation', async () => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService, mockNotificationService);
            
            // Allow async initialization
            await jest.runOnlyPendingTimersAsync();
            
            expect(spawn).toHaveBeenCalled();
            expect(mockLoggingService.debug).toHaveBeenCalledWith(expect.stringContaining('Pre-allocated worktree'));
        });

        it('should start health monitoring on initialization', () => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
            
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 30000);
        });

        it('should start metrics cleanup on initialization', () => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath);
            
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
        });
    });

    describe('Cache Operations', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
        });

        it('should return cached worktree path when valid', async () => {
            const agent = createMockAgent({ id: 'cached-agent' });
            
            // First create to populate cache
            await optimizer.createWorktreeOptimized(agent);
            
            // Second call should use cache
            const startTime = Date.now();
            const result = await optimizer.getWorktreeOptimized('cached-agent');
            const duration = Date.now() - startTime;
            
            expect(result).toBeDefined();
            expect(duration).toBeLessThan(10); // Cache hit should be fast
        });

        it('should invalidate cache after expiry', async () => {
            const agent = createMockAgent({ id: 'expiry-agent' });
            
            await optimizer.createWorktreeOptimized(agent);
            
            // Fast-forward past cache expiry
            jest.advanceTimersByTime(6000);
            
            const result = await optimizer.getWorktreeOptimized('expiry-agent');
            
            expect(fs.access).toHaveBeenCalled(); // Should check filesystem
        });

        it('should update cache on successful creation', async () => {
            const agent = createMockAgent({ id: 'update-cache' });
            
            await optimizer.createWorktreeOptimized(agent);
            
            const cached = await optimizer.getWorktreeOptimized('update-cache');
            expect(cached).toBeDefined();
        });
    });

    describe('Pool Management', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
        });

        it('should use pooled worktree when available', async () => {
            // Pre-populate pool
            await jest.runOnlyPendingTimersAsync();
            
            const agent = createMockAgent({ id: 'pooled-agent' });
            const result = await optimizer.createWorktreeOptimized(agent);
            
            expect(result).toBeDefined();
            expect(fs.rename).toHaveBeenCalled(); // Should rename pooled worktree
        });

        it('should refill pool after usage', async () => {
            const agent = createMockAgent({ id: 'refill-test' });
            
            await optimizer.createWorktreeOptimized(agent);
            
            // Should trigger pool refill
            await jest.runOnlyPendingTimersAsync();
            
            expect(spawn).toHaveBeenCalledWith('git', expect.arrayContaining(['worktree', 'add']));
        });

        it('should handle pool creation failures gracefully', async () => {
            (spawn as jest.Mock).mockImplementationOnce(() => ({
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn((event, cb) => { if (event === 'data') cb('error'); }) },
                on: jest.fn((event, cb) => { if (event === 'close') cb(1); })
            }));
            
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
            
            await jest.runOnlyPendingTimersAsync();
            
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'Failed to create pooled worktree',
                expect.any(Error)
            );
        });

        it('should handle pool configuration failures', async () => {
            (fs.rename as jest.Mock).mockRejectedValueOnce(new Error('Rename failed'));
            
            const agent = createMockAgent({ id: 'config-fail' });
            
            // Should fall back to regular creation
            await optimizer.createWorktreeOptimized(agent);
            
            expect(spawn).toHaveBeenCalled();
        });
    });

    describe('Parallel Operations', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
        });

        it('should queue operations when at max parallel', async () => {
            const agents = Array.from({ length: 5 }, (_, i) => 
                createMockAgent({ id: `parallel-${i}` })
            );
            
            // Create all concurrently
            const promises = agents.map(a => optimizer.createWorktreeOptimized(a));
            
            // Should queue some operations
            await Promise.all(promises);
            
            expect(spawn).toHaveBeenCalled();
        });

        it('should process queue after operation completes', async () => {
            const agents = Array.from({ length: 4 }, (_, i) => 
                createMockAgent({ id: `queue-${i}` })
            );
            
            const promises = agents.map(a => optimizer.createWorktreeOptimized(a));
            
            await Promise.all(promises);
            
            // All should complete
            agents.forEach(agent => {
                expect(optimizer.getWorktreePath(agent.id)).toBeDefined();
            });
        });

        it('should handle queue operation failures', async () => {
            (spawn as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Git failed');
            });
            
            const agent = createMockAgent({ id: 'queue-fail' });
            
            await expect(optimizer.createWorktreeOptimized(agent))
                .rejects.toThrow('Git failed');
        });
    });

    describe('Circuit Breaker', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService, mockNotificationService);
        });

        it('should open circuit breaker after threshold failures', async () => {
            // Simulate multiple failures
            for (let i = 0; i < 5; i++) {
                (spawn as jest.Mock).mockImplementationOnce(() => {
                    throw new Error('Git failure');
                });
                
                const agent = createMockAgent({ id: `fail-${i}` });
                try {
                    await optimizer.createWorktreeOptimized(agent);
                } catch {
                    // Expected to fail
                }
            }
            
            // Circuit should be open now
            const agent = createMockAgent({ id: 'blocked' });
            await expect(optimizer.createWorktreeOptimized(agent))
                .rejects.toThrow('temporarily disabled');
            
            expect(mockNotificationService.showError).toHaveBeenCalledWith(
                expect.stringContaining('temporarily disabled')
            );
        });

        it('should reset circuit breaker after timeout', async () => {
            // Open circuit breaker
            for (let i = 0; i < 5; i++) {
                (spawn as jest.Mock).mockImplementationOnce(() => {
                    throw new Error('Git failure');
                });
                
                try {
                    await optimizer.createWorktreeOptimized(createMockAgent({ id: `fail-${i}` }));
                } catch {
                    // Expected
                }
            }
            
            // Fast-forward past reset timeout
            jest.advanceTimersByTime(31000);
            
            // Should work again
            (spawn as jest.Mock).mockImplementation(() => ({
                stdout: { on: jest.fn((event, cb) => { if (event === 'data') cb(''); }) },
                stderr: { on: jest.fn() },
                on: jest.fn((event, cb) => { if (event === 'close') cb(0); })
            } as any));
            
            const agent = createMockAgent({ id: 'recovered' });
            await expect(optimizer.createWorktreeOptimized(agent)).resolves.toBeDefined();
        });

        it('should handle half-open state correctly', async () => {
            // Open circuit
            for (let i = 0; i < 5; i++) {
                (spawn as jest.Mock).mockImplementationOnce(() => {
                    throw new Error('Git failure');
                });
                try {
                    await optimizer.createWorktreeOptimized(createMockAgent({ id: `fail-${i}` }));
                } catch { }
            }
            
            // Move to half-open
            jest.advanceTimersByTime(31000);
            
            // Success should close circuit
            (spawn as jest.Mock).mockImplementation(() => ({
                stdout: { on: jest.fn((event, cb) => { if (event === 'data') cb(''); }) },
                stderr: { on: jest.fn() },
                on: jest.fn((event, cb) => { if (event === 'close') cb(0); })
            } as any));
            
            const agent = createMockAgent({ id: 'half-open-test' });
            await optimizer.createWorktreeOptimized(agent);
            
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                'Circuit breaker closed - Git operations restored'
            );
        });
    });

    describe('Remove Operations', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
        });

        it('should remove worktree and clear cache', async () => {
            const agent = createMockAgent({ id: 'remove-test' });
            
            await optimizer.createWorktreeOptimized(agent);
            await optimizer.removeWorktreeOptimized('remove-test');
            
            expect(spawn).toHaveBeenCalledWith('git', expect.arrayContaining(['worktree', 'remove']));
            
            // Cache should be cleared
            const cached = await optimizer.getWorktreeOptimized('remove-test');
            expect(cached).toBeUndefined();
        });

        it('should queue removal when at max parallel ops', async () => {
            const agents = Array.from({ length: 5 }, (_, i) => 
                createMockAgent({ id: `remove-parallel-${i}` })
            );
            
            // Create all first
            await Promise.all(agents.map(a => optimizer.createWorktreeOptimized(a)));
            
            // Remove all concurrently
            await Promise.all(agents.map(a => optimizer.removeWorktreeOptimized(a.id)));
            
            expect(spawn).toHaveBeenCalled();
        });

        it('should handle removal failures gracefully', async () => {
            const agent = createMockAgent({ id: 'remove-fail' });
            
            await optimizer.createWorktreeOptimized(agent);
            
            (spawn as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Remove failed');
            });
            
            await expect(optimizer.removeWorktreeOptimized('remove-fail'))
                .rejects.toThrow('Remove failed');
        });

        it('should emit removal event', async () => {
            const agent = createMockAgent({ id: 'remove-event' });
            
            await optimizer.createWorktreeOptimized(agent);
            
            const eventPromise = new Promise(resolve => {
                optimizer.once('worktree:removed', resolve);
            });
            
            await optimizer.removeWorktreeOptimized('remove-event');
            
            const event = await eventPromise;
            expect(event).toEqual({ agentId: 'remove-event' });
        });
    });

    describe('Health Monitoring', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
        });

        it('should perform health checks periodically', async () => {
            const agent = createMockAgent({ id: 'health-test' });
            
            await optimizer.createWorktreeOptimized(agent);
            
            // Trigger health check
            jest.advanceTimersByTime(30000);
            await jest.runOnlyPendingTimersAsync();
            
            expect(fs.access).toHaveBeenCalled();
        });

        it('should mark unhealthy worktrees', async () => {
            const agent = createMockAgent({ id: 'unhealthy' });
            
            await optimizer.createWorktreeOptimized(agent);
            
            // Make worktree unhealthy
            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
            
            // Trigger health check
            jest.advanceTimersByTime(30000);
            await jest.runOnlyPendingTimersAsync();
            
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Unhealthy worktree detected'),
                expect.any(Error)
            );
        });

        it('should attempt recovery for unhealthy worktrees', async () => {
            const agent = createMockAgent({ id: 'recovery-test' });
            
            await optimizer.createWorktreeOptimized(agent);
            
            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
            (spawn as jest.Mock).mockImplementation(() => ({
                stdout: { on: jest.fn((event, cb) => { if (event === 'data') cb(''); }) },
                stderr: { on: jest.fn() },
                on: jest.fn((event, cb) => { if (event === 'close') cb(0); })
            } as any));
            
            jest.advanceTimersByTime(30000);
            await jest.runOnlyPendingTimersAsync();
            
            expect(spawn).toHaveBeenCalledWith('git', expect.arrayContaining(['worktree', 'prune']));
        });
    });

    describe('Metrics and Performance', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
        });

        it('should record metrics for operations', async () => {
            const agent = createMockAgent({ id: 'metrics-test' });
            
            await optimizer.createWorktreeOptimized(agent);
            
            const stats = optimizer.getPerformanceStats();
            
            expect(stats.averageCreateTime).toBeGreaterThan(0);
            expect(stats.successRate).toBe(1);
        });

        it('should emit metric events', async () => {
            const metrics: any[] = [];
            optimizer.on('metric', (metric) => metrics.push(metric));
            
            const agent = createMockAgent({ id: 'metric-event' });
            await optimizer.createWorktreeOptimized(agent);
            
            expect(metrics.length).toBeGreaterThan(0);
            expect(metrics[0]).toHaveProperty('operationType');
            expect(metrics[0]).toHaveProperty('duration');
            expect(metrics[0]).toHaveProperty('success');
        });

        it('should clean up old metrics periodically', async () => {
            // Create some metrics
            for (let i = 0; i < 10; i++) {
                const agent = createMockAgent({ id: `metric-${i}` });
                await optimizer.createWorktreeOptimized(agent);
            }
            
            // Fast-forward to trigger cleanup
            jest.advanceTimersByTime(61000);
            
            const stats = optimizer.getPerformanceStats();
            expect(stats).toBeDefined();
        });

        it('should calculate performance statistics correctly', async () => {
            // Create successful operations
            for (let i = 0; i < 3; i++) {
                const agent = createMockAgent({ id: `success-${i}` });
                await optimizer.createWorktreeOptimized(agent);
            }
            
            // Create failed operation
            (spawn as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Failed');
            });
            
            try {
                await optimizer.createWorktreeOptimized(createMockAgent({ id: 'fail' }));
            } catch {
                // Expected
            }
            
            const stats = optimizer.getPerformanceStats();
            
            expect(stats.successRate).toBeLessThan(1);
            expect(stats.successRate).toBeGreaterThan(0);
            expect(stats.poolUtilization).toBeDefined();
            expect(stats.circuitBreakerState).toBe('closed');
        });
    });

    describe('Optimization Operations', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
        });

        it('should optimize all worktrees', async () => {
            // Create some worktrees
            for (let i = 0; i < 3; i++) {
                const agent = createMockAgent({ id: `optimize-${i}` });
                await optimizer.createWorktreeOptimized(agent);
            }
            
            await optimizer.optimizeAll();
            
            expect(spawn).toHaveBeenCalledWith('git', expect.arrayContaining(['gc', '--aggressive']));
            expect(spawn).toHaveBeenCalledWith('git', expect.arrayContaining(['worktree', 'prune']));
            expect(mockLoggingService.info).toHaveBeenCalledWith('Worktree optimization complete');
        });

        it('should handle optimization failures gracefully', async () => {
            const agent = createMockAgent({ id: 'optimize-fail' });
            await optimizer.createWorktreeOptimized(agent);
            
            (spawn as jest.Mock).mockImplementation(() => {
                throw new Error('GC failed');
            });
            
            await optimizer.optimizeAll();
            
            // Should complete despite failures
            expect(mockLoggingService.info).toHaveBeenCalledWith('Worktree optimization complete');
        });
    });

    describe('Event Emissions', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
        });

        it('should emit worktree:created event', async () => {
            const eventPromise = new Promise(resolve => {
                optimizer.once('worktree:created', resolve);
            });
            
            const agent = createMockAgent({ id: 'event-create' });
            await optimizer.createWorktreeOptimized(agent);
            
            const event = await eventPromise;
            expect(event).toHaveProperty('agentId', 'event-create');
            expect(event).toHaveProperty('path');
        });

        it('should emit metric events for all operations', async () => {
            const metrics: any[] = [];
            optimizer.on('metric', m => metrics.push(m));
            
            const agent = createMockAgent({ id: 'metric-test' });
            await optimizer.createWorktreeOptimized(agent);
            await optimizer.removeWorktreeOptimized(agent.id);
            
            expect(metrics.length).toBeGreaterThanOrEqual(2);
            expect(metrics.some(m => m.operationType === 'create')).toBe(true);
            expect(metrics.some(m => m.operationType === 'remove')).toBe(true);
        });
    });

    describe('Error Handling', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
        });

        it('should handle git command timeouts', async () => {
            (spawn as jest.Mock).mockImplementation(() => ({
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() },
                on: jest.fn((event, cb) => {
                    if (event === 'error') cb(new Error('Timeout'));
                }),
                kill: jest.fn()
            } as any));
            
            const agent = createMockAgent({ id: 'timeout' });
            
            await expect(optimizer.createWorktreeOptimized(agent))
                .rejects.toThrow('Timeout');
        });

        it('should handle filesystem errors', async () => {
            (fs.access as jest.Mock).mockRejectedValue(new Error('Permission denied'));
            
            const result = await optimizer.getWorktreeOptimized('nonexistent');
            
            expect(result).toBeUndefined();
        });

        it('should record failed operations in metrics', async () => {
            (spawn as jest.Mock).mockImplementation(() => {
                throw new Error('Git error');
            });
            
            const agent = createMockAgent({ id: 'fail-metric' });
            
            try {
                await optimizer.createWorktreeOptimized(agent);
            } catch {
                // Expected
            }
            
            const stats = optimizer.getPerformanceStats();
            expect(stats.successRate).toBeLessThan(1);
        });
    });

    describe('Disposal', () => {
        it('should clean up resources on disposal', async () => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
            
            // Create some pooled worktrees
            await jest.runOnlyPendingTimersAsync();
            
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
            
            optimizer.dispose();
            
            expect(clearIntervalSpy).toHaveBeenCalled();
            expect(spawn).toHaveBeenCalledWith('git', expect.arrayContaining(['worktree', 'remove']));
        });

        it('should remove all event listeners on disposal', () => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath);
            
            optimizer.on('test', () => {});
            expect(optimizer.listenerCount('test')).toBe(1);
            
            optimizer.dispose();
            
            expect(optimizer.listenerCount('test')).toBe(0);
        });

        it('should handle disposal errors gracefully', () => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath);
            
            (spawn as jest.Mock).mockImplementation(() => {
                throw new Error('Cleanup failed');
            });
            
            // Should not throw
            expect(() => optimizer.dispose()).not.toThrow();
        });
    });

    describe('Edge Cases', () => {
        beforeEach(() => {
            optimizer = new WorktreePerformanceOptimizer(workspacePath, mockLoggingService);
        });

        it('should handle empty agent ID', async () => {
            const agent = createMockAgent({ id: '' });
            
            await expect(optimizer.createWorktreeOptimized(agent))
                .resolves.toBeDefined();
        });

        it('should handle special characters in agent names', async () => {
            const agent = createMockAgent({ 
                id: 'special',
                name: 'Agent!@#$%^&*()'
            });
            
            await optimizer.createWorktreeOptimized(agent);
            
            expect(spawn).toHaveBeenCalledWith(
                'git',
                expect.arrayContaining([expect.stringMatching(/agent-[a-z0-9-]+/)])
            );
        });

        it('should handle concurrent operations on same agent', async () => {
            const agent = createMockAgent({ id: 'concurrent' });
            
            const promise1 = optimizer.createWorktreeOptimized(agent);
            const promise2 = optimizer.createWorktreeOptimized(agent);
            
            const [result1, result2] = await Promise.all([promise1, promise2]);
            
            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
        });

        it('should handle rapid cache invalidation', async () => {
            const agent = createMockAgent({ id: 'rapid-cache' });
            
            await optimizer.createWorktreeOptimized(agent);
            
            // Rapidly access cache
            const promises = Array.from({ length: 10 }, () => 
                optimizer.getWorktreeOptimized('rapid-cache')
            );
            
            const results = await Promise.all(promises);
            
            results.forEach(result => {
                expect(result).toBeDefined();
            });
        });
    });
});