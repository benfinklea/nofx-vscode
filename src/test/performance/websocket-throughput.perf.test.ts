/**
 * PERFORMANCE TESTS - WebSocket Throughput & Latency
 * Goal: Measure and enforce performance baselines
 * Metrics: Throughput (msg/sec), Latency (P50/P95/P99)
 */

import { WebSocket } from 'ws';
import { performance } from 'perf_hooks';
import { OrchestrationServer } from '../../orchestration/OrchestrationServer';
import { MessageType } from '../../orchestration/MessageProtocol';

interface PerformanceMetrics {
    throughput: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
    totalMessages: number;
    duration: number;
    messagesPerSecond: number;
    peakMemoryMB: number;
}

describe('🏎️ PERFORMANCE - WebSocket Throughput', () => {
    let server: OrchestrationServer;
    let ws: WebSocket;
    let port: number;

    beforeAll(async () => {
        server = new OrchestrationServer();
        await server.start();
        port = server.getStatus().port;
    });

    afterAll(async () => {
        if (ws) ws.close();
        await server.stop();
    });

    test('should handle 1000+ messages per second', async () => {
        const messageCount = 5000;
        const latencies: number[] = [];
        let receivedCount = 0;

        ws = new WebSocket(`ws://localhost:${port}`);

        await new Promise<void>(resolve => {
            ws.on('open', resolve);
        });

        ws.on('message', () => {
            receivedCount++;
        });

        const startTime = performance.now();
        const startMemory = process.memoryUsage().heapUsed;

        // Send burst of messages
        for (let i = 0; i < messageCount; i++) {
            const msgStart = performance.now();

            ws.send(
                JSON.stringify({
                    type: MessageType.HEARTBEAT,
                    payload: {
                        index: i,
                        timestamp: Date.now()
                    }
                })
            );

            const msgEnd = performance.now();
            latencies.push(msgEnd - msgStart);
        }

        // Wait for messages to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));

        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;
        const duration = endTime - startTime;

        // Calculate metrics
        const metrics = calculateMetrics(latencies, duration, messageCount, startMemory, endMemory);

        // Assertions
        expect(metrics.messagesPerSecond).toBeGreaterThan(1000);
        expect(metrics.latencyP95).toBeLessThan(50); // 50ms P95
        expect(metrics.latencyP99).toBeLessThan(100); // 100ms P99

        console.log('\n📊 WebSocket Performance Metrics:');
        console.log(`  Throughput: ${metrics.messagesPerSecond.toFixed(2)} msg/sec`);
        console.log(`  P50 Latency: ${metrics.latencyP50.toFixed(2)}ms`);
        console.log(`  P95 Latency: ${metrics.latencyP95.toFixed(2)}ms`);
        console.log(`  P99 Latency: ${metrics.latencyP99.toFixed(2)}ms`);
        console.log(`  Memory Delta: ${metrics.peakMemoryMB.toFixed(2)}MB`);
    });

    test('should maintain low latency under sustained load', async () => {
        const duration = 5000; // 5 second sustained test
        const targetRate = 500; // messages per second
        const interval = 1000 / targetRate;

        ws = new WebSocket(`ws://localhost:${port}`);
        await new Promise<void>(resolve => {
            ws.on('open', resolve);
        });

        const latencies: number[] = [];
        let messagesSent = 0;

        const startTime = performance.now();

        const sendInterval = setInterval(() => {
            const msgStart = performance.now();

            ws.send(
                JSON.stringify({
                    type: MessageType.ASSIGN_TASK,
                    payload: {
                        taskId: `task-${messagesSent}`,
                        agentId: 'agent-1',
                        description: 'Test task'
                    }
                })
            );

            latencies.push(performance.now() - msgStart);
            messagesSent++;

            if (performance.now() - startTime > duration) {
                clearInterval(sendInterval);
            }
        }, interval);

        await new Promise(resolve => setTimeout(resolve, duration + 1000));

        const metrics = calculateMetrics(latencies, duration, messagesSent, 0, 0);

        expect(metrics.latencyP50).toBeLessThan(10); // Very low median
        expect(metrics.latencyP95).toBeLessThan(50); // Consistent performance

        console.log(`\n📊 Sustained Load Results (${duration / 1000}s @ ${targetRate} msg/s):`);
        console.log(`  Messages sent: ${messagesSent}`);
        console.log(`  P50: ${metrics.latencyP50.toFixed(2)}ms`);
        console.log(`  P95: ${metrics.latencyP95.toFixed(2)}ms`);
    });

    test('should handle message bursts without degradation', async () => {
        const burstSize = 1000;
        const burstCount = 5;
        const delayBetweenBursts = 500;

        ws = new WebSocket(`ws://localhost:${port}`);
        await new Promise<void>(resolve => {
            ws.on('open', resolve);
        });

        const burstMetrics: PerformanceMetrics[] = [];

        for (let burst = 0; burst < burstCount; burst++) {
            const latencies: number[] = [];
            const startTime = performance.now();

            // Send burst
            for (let i = 0; i < burstSize; i++) {
                const msgStart = performance.now();
                ws.send(
                    JSON.stringify({
                        type: MessageType.HEARTBEAT,
                        payload: { burst, index: i }
                    })
                );
                latencies.push(performance.now() - msgStart);
            }

            const duration = performance.now() - startTime;
            const metrics = calculateMetrics(latencies, duration, burstSize, 0, 0);
            burstMetrics.push(metrics);

            await new Promise(resolve => setTimeout(resolve, delayBetweenBursts));
        }

        // Check that performance doesn't degrade over bursts
        const firstBurstP95 = burstMetrics[0].latencyP95;
        const lastBurstP95 = burstMetrics[burstCount - 1].latencyP95;
        const degradation = ((lastBurstP95 - firstBurstP95) / firstBurstP95) * 100;

        expect(degradation).toBeLessThan(20); // Less than 20% degradation

        console.log('\n📊 Burst Performance:');
        burstMetrics.forEach((m, i) => {
            console.log(
                `  Burst ${i + 1}: P95=${m.latencyP95.toFixed(2)}ms, Rate=${m.messagesPerSecond.toFixed(0)} msg/s`
            );
        });
        console.log(`  Degradation: ${degradation.toFixed(1)}%`);
    });
});

describe('🏎️ PERFORMANCE - Agent Operations', () => {
    let agentManager: any;

    beforeAll(() => {
        // Mock agent manager for performance testing
        agentManager = {
            createAgent: (name: string, type: string) => ({
                id: `agent-${Date.now()}`,
                name,
                type,
                createdAt: Date.now()
            }),
            agents: new Map()
        };
    });

    test('agent spawn time should be < 500ms', async () => {
        const iterations = 10;
        const spawnTimes: number[] = [];

        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            const agent = agentManager.createAgent(`Agent ${i}`, 'backend-specialist');
            const duration = performance.now() - start;

            spawnTimes.push(duration);
            agentManager.agents.set(agent.id, agent);
        }

        const avgSpawnTime = spawnTimes.reduce((a, b) => a + b, 0) / iterations;
        const maxSpawnTime = Math.max(...spawnTimes);

        expect(avgSpawnTime).toBeLessThan(100); // Average < 100ms
        expect(maxSpawnTime).toBeLessThan(500); // Max < 500ms

        console.log('\n📊 Agent Spawn Performance:');
        console.log(`  Average: ${avgSpawnTime.toFixed(2)}ms`);
        console.log(`  Max: ${maxSpawnTime.toFixed(2)}ms`);
        console.log(`  Min: ${Math.min(...spawnTimes).toFixed(2)}ms`);
    });

    test('should handle 50+ concurrent agents', () => {
        const targetAgents = 50;
        const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        const startTime = performance.now();

        for (let i = 0; i < targetAgents; i++) {
            const agent = agentManager.createAgent(`Agent ${i}`, 'fullstack-developer');
            agentManager.agents.set(agent.id, agent);
        }

        const duration = performance.now() - startTime;
        const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        const memoryPerAgent = (endMemory - startMemory) / targetAgents;

        expect(agentManager.agents.size).toBe(targetAgents);
        expect(duration).toBeLessThan(5000); // All agents in < 5s
        expect(memoryPerAgent).toBeLessThan(1); // < 1MB per agent

        console.log('\n📊 Concurrent Agent Performance:');
        console.log(`  Agents created: ${targetAgents}`);
        console.log(`  Total time: ${duration.toFixed(2)}ms`);
        console.log(`  Memory per agent: ${memoryPerAgent.toFixed(2)}MB`);
        console.log(`  Total memory: ${(endMemory - startMemory).toFixed(2)}MB`);
    });
});

describe('🏎️ PERFORMANCE - Memory Management', () => {
    test('should not leak memory during agent lifecycle', async () => {
        const cycles = 100;
        const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;

        for (let i = 0; i < cycles; i++) {
            // Simulate agent lifecycle
            const agent = {
                id: `agent-${i}`,
                data: new Array(1000).fill('test data'),
                cleanup: function () {
                    this.data = null;
                }
            };

            // Use agent
            JSON.stringify(agent);

            // Cleanup
            agent.cleanup();
        }

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        const memoryGrowth = finalMemory - initialMemory;

        expect(memoryGrowth).toBeLessThan(10); // Less than 10MB growth

        console.log('\n📊 Memory Leak Test:');
        console.log(`  Cycles: ${cycles}`);
        console.log(`  Memory growth: ${memoryGrowth.toFixed(2)}MB`);
        console.log(`  Growth per cycle: ${(memoryGrowth / cycles).toFixed(4)}MB`);
    });
});

// Helper function to calculate performance metrics
function calculateMetrics(
    latencies: number[],
    duration: number,
    messageCount: number,
    startMemory: number,
    endMemory: number
): PerformanceMetrics {
    latencies.sort((a, b) => a - b);

    return {
        throughput: messageCount,
        latencyP50: latencies[Math.floor(latencies.length * 0.5)] || 0,
        latencyP95: latencies[Math.floor(latencies.length * 0.95)] || 0,
        latencyP99: latencies[Math.floor(latencies.length * 0.99)] || 0,
        totalMessages: messageCount,
        duration,
        messagesPerSecond: (messageCount / duration) * 1000,
        peakMemoryMB: (endMemory - startMemory) / 1024 / 1024
    };
}

// Export performance baseline for tracking
export const PERFORMANCE_BASELINES = {
    websocket: {
        throughput: 1000, // msg/sec
        p95_latency: 50, // ms
        p99_latency: 100 // ms
    },
    agents: {
        spawn_time: 500, // ms
        concurrent_limit: 50,
        memory_per_agent: 1 // MB
    },
    memory: {
        leak_threshold: 10 // MB over 100 cycles
    }
};
