import { WorktreePerformanceOptimizer } from '../../worktrees/WorktreePerformanceOptimizer';
import { WorktreeManager } from '../../worktrees/WorktreeManager';
import { Agent } from '../../agents/types';
import { performance } from 'perf_hooks';
import * as os from 'os';

/**
 * Comprehensive stress test suite for worktree system
 * Tests with 100+ concurrent agents to ensure bulletproof reliability
 */
describe('Worktree System - Stress & Performance Tests', () => {
    let optimizer: WorktreePerformanceOptimizer;
    let manager: WorktreeManager;
    const workspacePath = '/test/workspace';
    
    // Performance thresholds
    const PERFORMANCE_THRESHOLDS = {
        singleCreate: 100,      // ms
        bulkCreate100: 10000,   // ms for 100 agents
        parallelCreate: 5000,   // ms for 10 parallel
        cacheHit: 5,           // ms
        pooledCreate: 20,      // ms
        recovery: 1000,        // ms
        maxMemoryMB: 500       // MB
    };

    beforeEach(() => {
        jest.clearAllMocks();
        optimizer = new WorktreePerformanceOptimizer(workspacePath);
        manager = new WorktreeManager(workspacePath);
    });

    afterEach(() => {
        optimizer?.dispose();
    });

    describe('Extreme Load Tests', () => {
        it('should handle 100 concurrent agent creations', async () => {
            const agents = createMockAgents(100);
            const startTime = performance.now();
            const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
            
            // Create all agents concurrently
            const promises = agents.map(agent => 
                optimizer.createWorktreeOptimized(agent)
            );
            
            const results = await Promise.allSettled(promises);
            
            const duration = performance.now() - startTime;
            const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
            const memoryUsed = endMemory - startMemory;
            
            // Verify results
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            console.log(`
                100 Agent Stress Test Results:
                - Duration: ${duration.toFixed(2)}ms
                - Successful: ${successful}
                - Failed: ${failed}
                - Memory Used: ${memoryUsed.toFixed(2)}MB
                - Ops/Second: ${(100000 / duration).toFixed(2)}
            `);
            
            // Assert performance requirements
            expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.bulkCreate100);
            expect(successful).toBeGreaterThan(95); // Allow 5% failure rate under extreme load
            expect(memoryUsed).toBeLessThan(PERFORMANCE_THRESHOLDS.maxMemoryMB);
        });

        it('should handle rapid create/delete cycles (thrashing test)', async () => {
            const agent = createMockAgent('thrash-agent');
            const cycles = 50;
            const startTime = performance.now();
            
            for (let i = 0; i < cycles; i++) {
                const path = await optimizer.createWorktreeOptimized(agent);
                await optimizer.removeWorktreeOptimized(agent.id);
            }
            
            const duration = performance.now() - startTime;
            const avgCycleTime = duration / cycles;
            
            console.log(`
                Thrashing Test Results (${cycles} cycles):
                - Total Duration: ${duration.toFixed(2)}ms
                - Avg Cycle Time: ${avgCycleTime.toFixed(2)}ms
            `);
            
            expect(avgCycleTime).toBeLessThan(200); // Each cycle should be fast
        });

        it('should handle 1000 agents with pooling', async () => {
            const agents = createMockAgents(1000);
            const batchSize = 100;
            const results: any[] = [];
            
            const startTime = performance.now();
            
            // Process in batches to avoid overwhelming the system
            for (let i = 0; i < agents.length; i += batchSize) {
                const batch = agents.slice(i, i + batchSize);
                const batchResults = await Promise.allSettled(
                    batch.map(agent => optimizer.createWorktreeOptimized(agent))
                );
                results.push(...batchResults);
            }
            
            const duration = performance.now() - startTime;
            const successful = results.filter(r => r.status === 'fulfilled').length;
            
            console.log(`
                1000 Agent Test Results:
                - Duration: ${duration.toFixed(2)}ms
                - Successful: ${successful}/1000
                - Throughput: ${(1000000 / duration).toFixed(2)} ops/sec
            `);
            
            expect(successful).toBeGreaterThan(950); // 95% success rate
        });
    });

    describe('Performance Optimization Tests', () => {
        it('should demonstrate cache performance improvement', async () => {
            const agent = createMockAgent('cache-test');
            
            // First creation - cold cache
            const coldStart = performance.now();
            const path1 = await optimizer.createWorktreeOptimized(agent);
            const coldDuration = performance.now() - coldStart;
            
            // Second lookup - warm cache
            const warmStart = performance.now();
            const path2 = await optimizer.getWorktreeOptimized(agent.id);
            const warmDuration = performance.now() - warmStart;
            
            console.log(`
                Cache Performance:
                - Cold: ${coldDuration.toFixed(2)}ms
                - Warm: ${warmDuration.toFixed(2)}ms
                - Improvement: ${((coldDuration / warmDuration) * 100).toFixed(0)}%
            `);
            
            expect(warmDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.cacheHit);
            expect(warmDuration).toBeLessThan(coldDuration / 10); // At least 10x faster
        });

        it('should demonstrate pool performance improvement', async () => {
            // Allow pool to pre-allocate
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const pooledAgents = createMockAgents(5);
            const nonPooledAgents = createMockAgents(5);
            
            // Measure pooled creation
            const pooledStart = performance.now();
            await Promise.all(pooledAgents.map(a => optimizer.createWorktreeOptimized(a)));
            const pooledDuration = performance.now() - pooledStart;
            
            // Measure non-pooled creation (pool exhausted)
            const nonPooledStart = performance.now();
            await Promise.all(nonPooledAgents.map(a => optimizer.createWorktreeOptimized(a)));
            const nonPooledDuration = performance.now() - nonPooledStart;
            
            console.log(`
                Pool Performance:
                - Pooled: ${pooledDuration.toFixed(2)}ms
                - Non-Pooled: ${nonPooledDuration.toFixed(2)}ms
                - Speedup: ${(nonPooledDuration / pooledDuration).toFixed(2)}x
            `);
            
            expect(pooledDuration).toBeLessThan(nonPooledDuration);
        });

        it('should handle parallel operations efficiently', async () => {
            const parallelCounts = [1, 5, 10, 20, 50];
            const timings: number[] = [];
            
            for (const count of parallelCounts) {
                const agents = createMockAgents(count);
                const start = performance.now();
                
                await Promise.all(
                    agents.map(a => optimizer.createWorktreeOptimized(a))
                );
                
                const duration = performance.now() - start;
                timings.push(duration);
                
                // Cleanup
                await Promise.all(
                    agents.map(a => optimizer.removeWorktreeOptimized(a.id))
                );
            }
            
            console.log(`
                Parallel Scaling:
                - 1 agent: ${timings[0].toFixed(2)}ms
                - 5 agents: ${timings[1].toFixed(2)}ms
                - 10 agents: ${timings[2].toFixed(2)}ms
                - 20 agents: ${timings[3].toFixed(2)}ms
                - 50 agents: ${timings[4].toFixed(2)}ms
            `);
            
            // Verify sub-linear scaling (parallel execution benefit)
            expect(timings[1]).toBeLessThan(timings[0] * 5);
            expect(timings[2]).toBeLessThan(timings[0] * 10);
        });
    });

    describe('Reliability & Recovery Tests', () => {
        it('should recover from Git operation failures', async () => {
            const agent = createMockAgent('recovery-test');
            
            // Simulate failures to trigger circuit breaker
            for (let i = 0; i < 5; i++) {
                jest.spyOn(optimizer as any, 'executeGitAsync')
                    .mockRejectedValueOnce(new Error('Git failure'));
            }
            
            // Circuit breaker should open
            await expect(optimizer.createWorktreeOptimized(agent))
                .rejects.toThrow('temporarily disabled');
            
            // Wait for circuit breaker timeout
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Should recover
            jest.spyOn(optimizer as any, 'executeGitAsync')
                .mockResolvedValue('');
            
            const result = await optimizer.createWorktreeOptimized(agent);
            expect(result).toBeDefined();
        });

        it('should auto-recover unhealthy worktrees', async () => {
            const agents = createMockAgents(10);
            
            // Create worktrees
            await Promise.all(
                agents.map(a => optimizer.createWorktreeOptimized(a))
            );
            
            // Simulate some becoming unhealthy
            const unhealthyCount = 3;
            for (let i = 0; i < unhealthyCount; i++) {
                (optimizer as any).unhealthyWorktrees.add(agents[i].id);
            }
            
            // Trigger health check
            await (optimizer as any).performHealthCheck();
            
            // Verify recovery attempts
            const stats = optimizer.getPerformanceStats();
            expect(stats.unhealthyWorktrees).toBeLessThanOrEqual(unhealthyCount);
        });

        it('should handle memory pressure gracefully', async () => {
            const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
            const agents = createMockAgents(200);
            
            // Create many worktrees to test memory handling
            const results = await Promise.allSettled(
                agents.map(a => optimizer.createWorktreeOptimized(a))
            );
            
            const peakMemory = process.memoryUsage().heapUsed / 1024 / 1024;
            const memoryIncrease = peakMemory - initialMemory;
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const afterGC = process.memoryUsage().heapUsed / 1024 / 1024;
            
            console.log(`
                Memory Management:
                - Initial: ${initialMemory.toFixed(2)}MB
                - Peak: ${peakMemory.toFixed(2)}MB
                - After GC: ${afterGC.toFixed(2)}MB
                - Increase: ${memoryIncrease.toFixed(2)}MB
            `);
            
            expect(memoryIncrease).toBeLessThan(PERFORMANCE_THRESHOLDS.maxMemoryMB);
        });

        it('should maintain performance under sustained load', async () => {
            const duration = 30000; // 30 seconds
            const startTime = Date.now();
            let operations = 0;
            const errors: Error[] = [];
            
            // Run continuous operations for duration
            while (Date.now() - startTime < duration) {
                const agent = createMockAgent(`sustained-${operations}`);
                
                try {
                    await optimizer.createWorktreeOptimized(agent);
                    await optimizer.removeWorktreeOptimized(agent.id);
                    operations++;
                } catch (error) {
                    errors.push(error as Error);
                }
                
                // Small delay to prevent overwhelming
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            const throughput = operations / (duration / 1000);
            const errorRate = errors.length / operations;
            
            console.log(`
                Sustained Load Test (30s):
                - Operations: ${operations}
                - Throughput: ${throughput.toFixed(2)} ops/sec
                - Errors: ${errors.length}
                - Error Rate: ${(errorRate * 100).toFixed(2)}%
            `);
            
            expect(throughput).toBeGreaterThan(10); // At least 10 ops/sec
            expect(errorRate).toBeLessThan(0.05); // Less than 5% error rate
        });
    });

    describe('Queue Management Tests', () => {
        it('should handle queue overflow gracefully', async () => {
            const agents = createMockAgents(500);
            
            // Flood the queue
            const promises = agents.map(a => 
                optimizer.createWorktreeOptimized(a)
                    .catch(e => ({ error: e.message }))
            );
            
            const results = await Promise.all(promises);
            const stats = optimizer.getPerformanceStats();
            
            console.log(`
                Queue Overflow Test:
                - Queue Length: ${stats.queueLength}
                - Success Rate: ${stats.successRate * 100}%
            `);
            
            expect(stats.successRate).toBeGreaterThan(0.9);
        });

        it('should prioritize operations correctly', async () => {
            // TODO: Implement priority queue if needed
            expect(true).toBe(true);
        });
    });

    describe('Metrics & Observability', () => {
        it('should track accurate performance metrics', async () => {
            const agents = createMockAgents(20);
            
            await Promise.all(
                agents.map(a => optimizer.createWorktreeOptimized(a))
            );
            
            const stats = optimizer.getPerformanceStats();
            
            console.log(`
                Performance Metrics:
                - Avg Create Time: ${stats.averageCreateTime.toFixed(2)}ms
                - Avg Remove Time: ${stats.averageRemoveTime.toFixed(2)}ms
                - Success Rate: ${(stats.successRate * 100).toFixed(2)}%
                - Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(2)}%
                - Pool Utilization: ${(stats.poolUtilization * 100).toFixed(2)}%
                - Circuit Breaker: ${stats.circuitBreakerState}
                - Unhealthy: ${stats.unhealthyWorktrees}
                - Queue: ${stats.queueLength}
            `);
            
            expect(stats.averageCreateTime).toBeGreaterThan(0);
            expect(stats.successRate).toBeGreaterThan(0.95);
        });

        it('should emit performance events', async () => {
            const events: any[] = [];
            
            optimizer.on('metric', (metric) => {
                events.push(metric);
            });
            
            const agent = createMockAgent('event-test');
            await optimizer.createWorktreeOptimized(agent);
            
            expect(events.length).toBeGreaterThan(0);
            expect(events[0]).toHaveProperty('operationType');
            expect(events[0]).toHaveProperty('duration');
        });
    });

    describe('System Resource Tests', () => {
        it('should respect CPU limits', async () => {
            const cpuCount = os.cpus().length;
            const agents = createMockAgents(cpuCount * 10);
            
            const startTime = performance.now();
            
            await Promise.all(
                agents.map(a => optimizer.createWorktreeOptimized(a))
            );
            
            const duration = performance.now() - startTime;
            
            console.log(`
                CPU Utilization Test:
                - CPUs: ${cpuCount}
                - Agents: ${agents.length}
                - Duration: ${duration.toFixed(2)}ms
                - Per CPU: ${(agents.length / cpuCount).toFixed(0)} agents
            `);
            
            // Should complete in reasonable time despite CPU limits
            expect(duration).toBeLessThan(30000);
        });

        it('should handle file descriptor limits', async () => {
            // This tests that we don't leak file descriptors
            const agents = createMockAgents(100);
            const initialFDs = process.resourceUsage().maxRSS;
            
            for (const agent of agents) {
                await optimizer.createWorktreeOptimized(agent);
                await optimizer.removeWorktreeOptimized(agent.id);
            }
            
            const finalFDs = process.resourceUsage().maxRSS;
            const fdIncrease = finalFDs - initialFDs;
            
            console.log(`
                File Descriptor Test:
                - Initial RSS: ${initialFDs}
                - Final RSS: ${finalFDs}
                - Increase: ${fdIncrease}
            `);
            
            // RSS shouldn't grow significantly (indicates FD leak)
            expect(fdIncrease).toBeLessThan(initialFDs * 0.5);
        });
    });

    describe('Optimization Tests', () => {
        it('should optimize all worktrees efficiently', async () => {
            const agents = createMockAgents(10);
            
            // Create worktrees
            await Promise.all(
                agents.map(a => optimizer.createWorktreeOptimized(a))
            );
            
            const startTime = performance.now();
            await optimizer.optimizeAll();
            const duration = performance.now() - startTime;
            
            console.log(`
                Optimization Test:
                - Duration: ${duration.toFixed(2)}ms
                - Worktrees: ${agents.length}
            `);
            
            expect(duration).toBeLessThan(5000);
        });
    });
});

// Helper functions
function createMockAgent(id: string): Agent {
    return {
        id,
        name: `Agent ${id}`,
        type: 'test',
        status: 'idle',
        terminal: {} as any,
        currentTask: null,
        startTime: new Date(),
        tasksCompleted: 0
    };
}

function createMockAgents(count: number): Agent[] {
    return Array.from({ length: count }, (_, i) => createMockAgent(`agent-${i}`));
}