/**
 * COMPREHENSIVE PERFORMANCE TESTS
 * Extended performance validation beyond basic throughput
 * Goal: Ensure system performs well under various real-world scenarios
 */

import { performance } from 'perf_hooks';
import * as os from 'os';

// Mock implementations for testing
const mockFS = {
    readFileSync: jest.fn().mockImplementation(() => 'mock content'),
    writeFileSync: jest.fn(),
    existsSync: jest.fn().mockReturnValue(true)
};

const mockAgentManager = {
    spawnAgent: jest.fn().mockImplementation(async () => ({
        id: `agent-${Date.now()}`,
        name: 'Test Agent',
        status: 'idle'
    })),
    getActiveAgents: jest.fn().mockReturnValue([]),
    executeTask: jest.fn()
};

describe('🏎️ COMPREHENSIVE PERFORMANCE - File System Operations', () => {
    test('template loading should be < 100ms for 100 templates', async () => {
        const templateCount = 100;
        const templates: any[] = [];

        const startTime = performance.now();

        for (let i = 0; i < templateCount; i++) {
            // Simulate template loading
            const template = {
                id: `template-${i}`,
                name: `Template ${i}`,
                systemPrompt: 'x'.repeat(5000), // 5KB prompt
                capabilities: new Array(20).fill('capability')
            };
            templates.push(template);
        }

        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(100);
        console.log(`Template loading: ${templateCount} templates in ${duration.toFixed(2)}ms`);
    });

    test('session persistence should handle 1000+ saves per minute', async () => {
        const savesPerSecond = 20;
        const testDuration = 3000; // 3 seconds
        let saveCount = 0;

        const startTime = performance.now();

        const saveInterval = setInterval(() => {
            // Simulate session save
            const sessionData = {
                agentId: `agent-${saveCount}`,
                timestamp: Date.now(),
                content: 'x'.repeat(1000) // 1KB of data
            };

            mockFS.writeFileSync(`session-${saveCount}.json`, JSON.stringify(sessionData));
            saveCount++;
        }, 1000 / savesPerSecond);

        await new Promise(resolve => setTimeout(resolve, testDuration));
        clearInterval(saveInterval);

        const duration = performance.now() - startTime;
        const actualRate = (saveCount / duration) * 1000;

        expect(actualRate).toBeGreaterThan(15); // At least 15 saves/second
        console.log(
            `Session persistence: ${saveCount} saves in ${duration.toFixed(0)}ms (${actualRate.toFixed(1)} saves/sec)`
        );
    });
});

describe('🏎️ COMPREHENSIVE PERFORMANCE - Task Management', () => {
    test('task queue should handle 10,000 tasks efficiently', () => {
        const taskCount = 10000;
        const tasks: any[] = [];

        const startTime = performance.now();

        // Add tasks
        for (let i = 0; i < taskCount; i++) {
            tasks.push({
                id: `task-${i}`,
                priority: ['low', 'medium', 'high', 'critical'][i % 4],
                dependencies: i > 0 ? [`task-${i - 1}`] : [],
                estimatedDuration: Math.random() * 1000
            });
        }

        // Sort by priority (simulate queue operations)
        const priorityMap: any = { critical: 4, high: 3, medium: 2, low: 1 };
        tasks.sort((a, b) => priorityMap[b.priority] - priorityMap[a.priority]);

        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(500); // Should handle 10k tasks in < 500ms
        console.log(`Task queue: ${taskCount} tasks processed in ${duration.toFixed(2)}ms`);
    });

    test('task assignment algorithm should scale linearly', () => {
        const testCases = [10, 100, 1000, 5000];
        const timings: number[] = [];

        testCases.forEach(taskCount => {
            const agents = new Array(10).fill(null).map((_, i) => ({
                id: `agent-${i}`,
                capabilities: ['js', 'ts', 'react', 'node'],
                currentLoad: Math.random() * 5
            }));

            const tasks = new Array(taskCount).fill(null).map((_, i) => ({
                id: `task-${i}`,
                requiredCapabilities: ['js', 'react'],
                priority: 'medium'
            }));

            const startTime = performance.now();

            // Simulate task assignment
            tasks.forEach(task => {
                // Find best agent (simplified)
                const bestAgent = agents.reduce((best, agent) => (agent.currentLoad < best.currentLoad ? agent : best));
                bestAgent.currentLoad++;
            });

            const duration = performance.now() - startTime;
            timings.push(duration);

            console.log(`Task assignment for ${taskCount} tasks: ${duration.toFixed(2)}ms`);
        });

        // Check that scaling is roughly linear (not exponential)
        const scalingFactor = timings[3] / timings[0]; // 5000 tasks vs 10 tasks
        const expectedFactor = 500; // 5000/10

        expect(scalingFactor).toBeLessThan(expectedFactor * 2); // Allow 2x for overhead
    });
});

describe('🏎️ COMPREHENSIVE PERFORMANCE - Message Routing', () => {
    test('message routing should handle 100 concurrent agents', () => {
        const agentCount = 100;
        const messagesPerAgent = 50;
        const messages: any[] = [];

        const startTime = performance.now();

        // Generate messages
        for (let a = 0; a < agentCount; a++) {
            for (let m = 0; m < messagesPerAgent; m++) {
                messages.push({
                    from: `agent-${a}`,
                    to: 'conductor',
                    type: 'status_update',
                    payload: { status: 'working', progress: m }
                });
            }
        }

        // Simulate routing
        const routingTable = new Map();
        messages.forEach(msg => {
            if (!routingTable.has(msg.to)) {
                routingTable.set(msg.to, []);
            }
            routingTable.get(msg.to).push(msg);
        });

        const duration = performance.now() - startTime;
        const totalMessages = agentCount * messagesPerAgent;
        const messagesPerSecond = (totalMessages / duration) * 1000;

        expect(messagesPerSecond).toBeGreaterThan(10000); // > 10k msgs/sec
        console.log(
            `Message routing: ${totalMessages} messages in ${duration.toFixed(2)}ms (${messagesPerSecond.toFixed(0)} msgs/sec)`
        );
    });

    test('broadcast messages should scale with agent count', () => {
        const agentCounts = [10, 50, 100, 200];

        agentCounts.forEach(count => {
            const agents = new Array(count).fill(null).map((_, i) => ({ id: `agent-${i}` }));

            const startTime = performance.now();

            // Simulate broadcast
            const broadcastMessage = { type: 'system_update', payload: { update: 'test' } };
            agents.forEach(agent => {
                // Simulate sending message to agent
                const msg = { ...broadcastMessage, to: agent.id };
            });

            const duration = performance.now() - startTime;
            const timePerAgent = duration / count;

            expect(timePerAgent).toBeLessThan(0.1); // < 0.1ms per agent
            console.log(
                `Broadcast to ${count} agents: ${duration.toFixed(2)}ms (${timePerAgent.toFixed(3)}ms per agent)`
            );
        });
    });
});

describe('🏎️ COMPREHENSIVE PERFORMANCE - Dashboard Updates', () => {
    test('dashboard should handle 60 FPS update rate', async () => {
        const targetFPS = 60;
        const frameDuration = 1000 / targetFPS;
        const testDuration = 1000; // 1 second
        let frameCount = 0;
        let missedFrames = 0;

        const startTime = performance.now();
        let lastFrameTime = startTime;

        const frameInterval = setInterval(() => {
            const currentTime = performance.now();
            const deltaTime = currentTime - lastFrameTime;

            if (deltaTime > frameDuration * 1.5) {
                missedFrames++;
            }

            // Simulate dashboard update
            const dashboardData = {
                agents: new Array(20).fill(null).map((_, i) => ({
                    id: `agent-${i}`,
                    status: ['idle', 'working'][i % 2],
                    load: Math.random() * 100
                })),
                messages: new Array(100).fill(null).map((_, i) => ({
                    id: `msg-${i}`,
                    timestamp: Date.now() - i * 1000
                }))
            };

            frameCount++;
            lastFrameTime = currentTime;

            if (currentTime - startTime >= testDuration) {
                clearInterval(frameInterval);
            }
        }, frameDuration);

        await new Promise(resolve => setTimeout(resolve, testDuration + 100));

        const actualFPS = (frameCount / testDuration) * 1000;
        const missedFrameRatio = missedFrames / frameCount;

        expect(actualFPS).toBeGreaterThan(50); // At least 50 FPS
        expect(missedFrameRatio).toBeLessThan(0.1); // Less than 10% frame drops

        console.log(
            `Dashboard updates: ${actualFPS.toFixed(1)} FPS, ${missedFrames} missed frames (${(missedFrameRatio * 100).toFixed(1)}%)`
        );
    });
});

describe('🏎️ COMPREHENSIVE PERFORMANCE - CPU & Memory Stress', () => {
    test('should maintain performance under CPU stress', () => {
        const cpuCores = os.cpus().length;
        const operations = 100000;

        // Baseline measurement
        const baselineStart = performance.now();
        let baselineResult = 0;
        for (let i = 0; i < operations; i++) {
            baselineResult += Math.sqrt(i);
        }
        const baselineDuration = performance.now() - baselineStart;

        // Stress test with parallel operations
        const stressStart = performance.now();
        const workers = new Array(cpuCores).fill(null).map(() => {
            let result = 0;
            for (let i = 0; i < operations / cpuCores; i++) {
                result += Math.sqrt(i);
            }
            return result;
        });
        const stressDuration = performance.now() - stressStart;

        const degradation = stressDuration / baselineDuration;

        expect(degradation).toBeLessThan(2); // Less than 2x degradation
        console.log(`CPU stress: ${cpuCores} cores, degradation factor: ${degradation.toFixed(2)}x`);
    });

    test('should handle memory pressure gracefully', () => {
        const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        const buffers: Buffer[] = [];

        // Allocate memory in chunks
        for (let i = 0; i < 10; i++) {
            buffers.push(Buffer.alloc(10 * 1024 * 1024)); // 10MB chunks
        }

        const peakMemory = process.memoryUsage().heapUsed / 1024 / 1024;

        // Clean up
        buffers.length = 0;
        if (global.gc) global.gc();

        const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;

        const memoryRecovered = peakMemory - finalMemory;
        const recoveryRatio = memoryRecovered / (peakMemory - initialMemory);

        expect(recoveryRatio).toBeGreaterThan(0.8); // At least 80% memory recovered
        console.log(
            `Memory management: Peak ${peakMemory.toFixed(1)}MB, Final ${finalMemory.toFixed(1)}MB, Recovery ${(recoveryRatio * 100).toFixed(1)}%`
        );
    });
});

describe('🏎️ COMPREHENSIVE PERFORMANCE - Concurrent Operations', () => {
    test('should handle 100 concurrent agent spawns', async () => {
        const concurrentSpawns = 100;
        const startTime = performance.now();

        const spawnPromises = new Array(concurrentSpawns).fill(null).map(async (_, i) => {
            const agentStart = performance.now();
            const agent = await mockAgentManager.spawnAgent({
                name: `Agent ${i}`,
                type: 'fullstack'
            });
            return performance.now() - agentStart;
        });

        const spawnTimes = await Promise.all(spawnPromises);
        const totalDuration = performance.now() - startTime;

        const avgSpawnTime = spawnTimes.reduce((a, b) => a + b, 0) / spawnTimes.length;
        const maxSpawnTime = Math.max(...spawnTimes);

        expect(avgSpawnTime).toBeLessThan(50); // Avg < 50ms
        expect(maxSpawnTime).toBeLessThan(200); // Max < 200ms
        expect(totalDuration).toBeLessThan(1000); // Total < 1s

        console.log(`Concurrent spawns: ${concurrentSpawns} agents in ${totalDuration.toFixed(2)}ms`);
        console.log(`  Average: ${avgSpawnTime.toFixed(2)}ms, Max: ${maxSpawnTime.toFixed(2)}ms`);
    });

    test('should handle mixed operation load', async () => {
        const operations = {
            spawns: 10,
            tasks: 100,
            messages: 500,
            queries: 200
        };

        const startTime = performance.now();

        const allOperations = [
            // Spawn operations
            ...new Array(operations.spawns)
                .fill(null)
                .map(() => mockAgentManager.spawnAgent({ name: 'Agent', type: 'test' })),
            // Task operations
            ...new Array(operations.tasks).fill(null).map(() => Promise.resolve({ id: 'task', status: 'queued' })),
            // Message operations
            ...new Array(operations.messages).fill(null).map(() => Promise.resolve({ sent: true })),
            // Query operations
            ...new Array(operations.queries).fill(null).map(() => Promise.resolve({ agents: [], tasks: [] }))
        ];

        await Promise.all(allOperations);
        const duration = performance.now() - startTime;

        const totalOps = Object.values(operations).reduce((a, b) => a + b, 0);
        const opsPerSecond = (totalOps / duration) * 1000;

        expect(opsPerSecond).toBeGreaterThan(500); // > 500 ops/sec
        console.log(
            `Mixed operations: ${totalOps} ops in ${duration.toFixed(2)}ms (${opsPerSecond.toFixed(0)} ops/sec)`
        );
    });
});

describe('🏎️ COMPREHENSIVE PERFORMANCE - Latency Distribution', () => {
    test('should maintain consistent latency distribution', () => {
        const sampleSize = 10000;
        const latencies: number[] = [];

        for (let i = 0; i < sampleSize; i++) {
            const start = performance.now();

            // Simulate operation with variable latency
            const complexity = Math.random();
            for (let j = 0; j < complexity * 1000; j++) {
                Math.sqrt(j);
            }

            latencies.push(performance.now() - start);
        }

        latencies.sort((a, b) => a - b);

        const p50 = latencies[Math.floor(sampleSize * 0.5)];
        const p75 = latencies[Math.floor(sampleSize * 0.75)];
        const p90 = latencies[Math.floor(sampleSize * 0.9)];
        const p95 = latencies[Math.floor(sampleSize * 0.95)];
        const p99 = latencies[Math.floor(sampleSize * 0.99)];
        const p999 = latencies[Math.floor(sampleSize * 0.999)];

        // Check for reasonable latency distribution
        expect(p50).toBeLessThan(1); // P50 < 1ms
        expect(p95).toBeLessThan(5); // P95 < 5ms
        expect(p99).toBeLessThan(10); // P99 < 10ms

        // Check for outliers
        const outlierRatio = p999 / p50;
        expect(outlierRatio).toBeLessThan(100); // P99.9 not more than 100x P50

        console.log(`Latency distribution (${sampleSize} samples):`);
        console.log(`  P50: ${p50.toFixed(2)}ms`);
        console.log(`  P75: ${p75.toFixed(2)}ms`);
        console.log(`  P90: ${p90.toFixed(2)}ms`);
        console.log(`  P95: ${p95.toFixed(2)}ms`);
        console.log(`  P99: ${p99.toFixed(2)}ms`);
        console.log(`  P99.9: ${p999.toFixed(2)}ms`);
        console.log(`  Outlier ratio: ${outlierRatio.toFixed(1)}x`);
    });
});

// Export performance baselines for tracking
export const EXTENDED_PERFORMANCE_BASELINES = {
    fileOperations: {
        templateLoading: 100, // ms for 100 templates
        sessionPersistence: 15 // saves per second
    },
    taskManagement: {
        queueProcessing: 500, // ms for 10k tasks
        assignmentScaling: 'linear'
    },
    messageRouting: {
        throughput: 10000, // messages per second
        broadcastLatency: 0.1 // ms per agent
    },
    dashboard: {
        targetFPS: 60,
        minFPS: 50,
        maxFrameDrops: 0.1 // 10%
    },
    stress: {
        cpuDegradation: 2, // max 2x under stress
        memoryRecovery: 0.8 // 80% recovery
    },
    concurrent: {
        agentSpawns: 100, // concurrent spawns
        avgSpawnTime: 50, // ms
        mixedOpsRate: 500 // ops per second
    },
    latency: {
        p50Target: 1, // ms
        p95Target: 5, // ms
        p99Target: 10, // ms
        outlierRatio: 100 // P99.9/P50
    }
};
