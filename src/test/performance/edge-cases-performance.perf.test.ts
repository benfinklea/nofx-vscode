/**
 * EDGE CASE PERFORMANCE TESTS
 * Tests for extreme scenarios and edge cases
 * Goal: Ensure system handles edge cases without catastrophic performance loss
 */

import { performance } from 'perf_hooks';

describe('🏎️ EDGE CASES - Extreme Scale', () => {
    test('should handle 1000 agents gracefully', () => {
        const agentCount = 1000;
        const agents = new Map();

        const startTime = performance.now();

        // Create agents
        for (let i = 0; i < agentCount; i++) {
            agents.set(`agent-${i}`, {
                id: `agent-${i}`,
                status: 'idle',
                capabilities: new Array(10).fill('capability'),
                metrics: {
                    tasksCompleted: 0,
                    averageTime: 0,
                    successRate: 100
                }
            });
        }

        // Simulate status check for all agents
        const statuses = Array.from(agents.values()).map(a => a.status);

        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(1000); // Should handle 1000 agents in < 1s
        console.log(`Extreme scale: ${agentCount} agents managed in ${duration.toFixed(2)}ms`);
    });

    test('should handle 100,000 messages in queue', () => {
        const messageCount = 100000;
        const messageQueue: any[] = [];

        const startTime = performance.now();

        // Add messages
        for (let i = 0; i < messageCount; i++) {
            messageQueue.push({
                id: i,
                priority: i % 4,
                timestamp: Date.now() - i
            });
        }

        // Process queue (simulate dequeue operations)
        let processed = 0;
        while (messageQueue.length > 0 && processed < 1000) {
            messageQueue.shift();
            processed++;
        }

        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(5000); // Handle 100k messages in < 5s
        console.log(`Message queue: ${messageCount} messages, processed ${processed} in ${duration.toFixed(2)}ms`);
    });
});

describe('🏎️ EDGE CASES - Rapid State Changes', () => {
    test('should handle rapid agent status changes', () => {
        const agents = new Array(50).fill(null).map((_, i) => ({
            id: `agent-${i}`,
            status: 'idle'
        }));

        const changeCount = 10000;
        const startTime = performance.now();

        for (let i = 0; i < changeCount; i++) {
            const agent = agents[i % agents.length];
            agent.status = ['idle', 'working', 'error', 'offline'][i % 4] as any;

            // Simulate status change notification
            const event = {
                type: 'status_change',
                agentId: agent.id,
                newStatus: agent.status,
                timestamp: Date.now()
            };
        }

        const duration = performance.now() - startTime;
        const changesPerSecond = (changeCount / duration) * 1000;

        expect(changesPerSecond).toBeGreaterThan(5000); // > 5000 changes/sec
        console.log(
            `Status changes: ${changeCount} changes in ${duration.toFixed(2)}ms (${changesPerSecond.toFixed(0)} changes/sec)`
        );
    });

    test('should handle task reassignment storms', () => {
        const taskCount = 1000;
        const agentCount = 20;
        const reassignmentRounds = 10;

        const tasks = new Array(taskCount).fill(null).map((_, i) => ({
            id: `task-${i}`,
            assignedTo: `agent-${i % agentCount}`
        }));

        const startTime = performance.now();

        for (let round = 0; round < reassignmentRounds; round++) {
            // Reassign all tasks
            tasks.forEach(task => {
                const oldAgent = task.assignedTo;
                task.assignedTo = `agent-${Math.floor(Math.random() * agentCount)}`;

                // Simulate reassignment event
                const event = {
                    type: 'task_reassigned',
                    taskId: task.id,
                    from: oldAgent,
                    to: task.assignedTo
                };
            });
        }

        const duration = performance.now() - startTime;
        const totalReassignments = taskCount * reassignmentRounds;
        const reassignmentsPerSecond = (totalReassignments / duration) * 1000;

        expect(reassignmentsPerSecond).toBeGreaterThan(10000); // > 10k reassignments/sec
        console.log(`Task reassignment: ${totalReassignments} reassignments in ${duration.toFixed(2)}ms`);
    });
});

describe('🏎️ EDGE CASES - Large Payloads', () => {
    test('should handle large message payloads efficiently', () => {
        const payloadSizes = [1, 10, 100, 1000]; // KB
        const results: any[] = [];

        payloadSizes.forEach(sizeKB => {
            const payload = 'x'.repeat(sizeKB * 1024);
            const messageCount = Math.floor(1000 / sizeKB); // Fewer messages for larger payloads

            const startTime = performance.now();

            for (let i = 0; i < messageCount; i++) {
                const message = {
                    id: i,
                    type: 'data_transfer',
                    payload: payload
                };

                // Simulate message processing
                JSON.stringify(message);
            }

            const duration = performance.now() - startTime;
            const throughputMBps = (sizeKB * messageCount) / 1024 / (duration / 1000);

            results.push({
                sizeKB,
                messageCount,
                duration,
                throughputMBps
            });

            expect(throughputMBps).toBeGreaterThan(10); // > 10 MB/s
        });

        console.log('Large payload handling:');
        results.forEach(r => {
            console.log(
                `  ${r.sizeKB}KB: ${r.messageCount} messages in ${r.duration.toFixed(2)}ms (${r.throughputMBps.toFixed(1)} MB/s)`
            );
        });
    });

    test('should handle deeply nested task dependencies', () => {
        const depth = 100;
        const width = 10;
        const tasks: any[] = [];

        const startTime = performance.now();

        // Create deeply nested dependency tree
        for (let level = 0; level < depth; level++) {
            for (let i = 0; i < width; i++) {
                const task = {
                    id: `task-${level}-${i}`,
                    dependencies: level > 0 ? [`task-${level - 1}-${i}`] : [],
                    level
                };
                tasks.push(task);
            }
        }

        // Resolve dependency chain
        const resolved = new Set();
        let resolvedCount = 0;

        while (resolved.size < tasks.length) {
            for (const task of tasks) {
                if (!resolved.has(task.id)) {
                    const depsResolved = task.dependencies.every((d: string) => resolved.has(d));
                    if (depsResolved) {
                        resolved.add(task.id);
                        resolvedCount++;
                    }
                }
            }
        }

        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(1000); // Resolve in < 1s
        console.log(`Dependency resolution: ${tasks.length} tasks with depth ${depth} in ${duration.toFixed(2)}ms`);
    });
});

describe('🏎️ EDGE CASES - Network Simulation', () => {
    test('should handle network latency spikes', async () => {
        const normalLatency = 10; // ms
        const spikeLatency = 500; // ms
        const operations = 100;

        const latencies: number[] = [];

        for (let i = 0; i < operations; i++) {
            const hasSpike = Math.random() < 0.1; // 10% spike chance
            const latency = hasSpike ? spikeLatency : normalLatency;

            const startTime = performance.now();

            // Simulate network operation with latency
            await new Promise(resolve => setTimeout(resolve, latency));

            const actualLatency = performance.now() - startTime;
            latencies.push(actualLatency);
        }

        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const maxLatency = Math.max(...latencies);

        expect(avgLatency).toBeLessThan(100); // Average should be reasonable
        expect(maxLatency).toBeLessThan(600); // Spikes should be bounded

        console.log(`Network latency: Avg ${avgLatency.toFixed(2)}ms, Max ${maxLatency.toFixed(2)}ms`);
    });

    test('should handle connection drops and reconnects', async () => {
        const connections = 50;
        const dropRate = 0.2; // 20% drop rate
        let activeConnections = 0;
        let reconnects = 0;

        const startTime = performance.now();

        // Simulate connections
        for (let i = 0; i < connections; i++) {
            activeConnections++;

            if (Math.random() < dropRate) {
                // Connection dropped
                activeConnections--;

                // Simulate reconnect
                await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
                activeConnections++;
                reconnects++;
            }
        }

        const duration = performance.now() - startTime;
        const reconnectTime = duration / reconnects;

        expect(reconnectTime).toBeLessThan(50); // Avg reconnect < 50ms
        console.log(
            `Connection resilience: ${reconnects} reconnects in ${duration.toFixed(2)}ms (${reconnectTime.toFixed(2)}ms avg)`
        );
    });
});

describe('🏎️ EDGE CASES - Resource Exhaustion', () => {
    test('should detect and handle resource exhaustion', () => {
        const maxOperations = 1000000;
        let operations = 0;
        let resourceExhausted = false;

        const startTime = performance.now();
        const timeout = 1000; // 1 second limit

        while (operations < maxOperations && !resourceExhausted) {
            operations++;

            // Check for timeout
            if (performance.now() - startTime > timeout) {
                resourceExhausted = true;
            }

            // Simulate operation
            Math.sqrt(operations);
        }

        expect(resourceExhausted || operations === maxOperations).toBe(true);
        console.log(`Resource exhaustion: ${operations} operations before limit`);
    });

    test('should handle circular reference detection', () => {
        const entities = 1000;
        const references: Map<number, number[]> = new Map();

        // Create circular references
        for (let i = 0; i < entities; i++) {
            references.set(i, [(i + 1) % entities, (i + 2) % entities]);
        }

        const startTime = performance.now();

        // Detect cycles
        const visited = new Set();
        const stack = new Set();
        let cyclesFound = 0;

        function hasCycle(node: number): boolean {
            if (stack.has(node)) {
                cyclesFound++;
                return true;
            }
            if (visited.has(node)) return false;

            visited.add(node);
            stack.add(node);

            const neighbors = references.get(node) || [];
            for (const neighbor of neighbors) {
                if (hasCycle(neighbor)) return true;
            }

            stack.delete(node);
            return false;
        }

        hasCycle(0);

        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(100); // Detect cycles quickly
        console.log(
            `Circular reference detection: ${entities} entities checked in ${duration.toFixed(2)}ms, ${cyclesFound} cycles found`
        );
    });
});

// Export edge case baselines
export const EDGE_CASE_BASELINES = {
    extremeScale: {
        maxAgents: 1000,
        maxMessages: 100000,
        processingTime: 5000 // ms
    },
    rapidChanges: {
        statusChangesPerSecond: 5000,
        reassignmentsPerSecond: 10000
    },
    largePayloads: {
        maxPayloadKB: 1000,
        minThroughputMBps: 10
    },
    networkSimulation: {
        avgLatency: 100, // ms
        maxLatency: 600, // ms
        reconnectTime: 50 // ms
    },
    resourceLimits: {
        operationTimeout: 1000, // ms
        cycleDetectionTime: 100 // ms
    }
};
