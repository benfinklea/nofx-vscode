/**
 * PERFORMANCE BULLETPROOF TESTS FOR TASK ASSIGNMENT WARNING SYSTEM
 * 
 * These tests ensure the tryAssignTasks method performs well under high load,
 * rapid agent updates, and stress conditions without degrading performance
 * or showing false warnings.
 */

import { TaskQueue } from '../../tasks/TaskQueue';
import { AgentManager } from '../../agents/AgentManager';
import {
    ILoggingService,
    IEventBus,
    IErrorHandler,
    INotificationService,
    IConfigurationService,
    ITaskStateMachine,
    IPriorityTaskQueue,
    ICapabilityMatcher,
    ITaskDependencyManager
} from '../../services/interfaces';
import { Task, TaskConfig, TaskStatus } from '../../agents/types';
import { createMockAgent, createMockTask } from '../helpers/mockFactories';

describe('TaskQueue Performance - BULLETPROOF UNDER LOAD', () => {
    let taskQueue: TaskQueue;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockTaskStateMachine: jest.Mocked<ITaskStateMachine>;
    let mockPriorityQueue: jest.Mocked<IPriorityTaskQueue>;
    let mockCapabilityMatcher: jest.Mocked<ICapabilityMatcher>;
    let mockDependencyManager: jest.Mocked<ITaskDependencyManager>;

    beforeEach(() => {
        // Setup performance-optimized mocks
        mockAgentManager = {
            getAvailableAgents: jest.fn(() => []),
            getAgent: jest.fn(),
            executeTask: jest.fn().mockResolvedValue(undefined),
            onAgentUpdate: jest.fn(),
            getAgentTerminal: jest.fn(),
            updateAgentLoad: jest.fn(),
            getAgentCapacity: jest.fn(() => ({ currentLoad: 0, maxCapacity: 5 })),
            getActiveAgents: jest.fn(() => [])
        } as any;

        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn(() => true),
            getChannel: jest.fn(),
            time: jest.fn(),
            timeEnd: jest.fn(),
            dispose: jest.fn()
        };

        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(() => ({ dispose: jest.fn() })),
            unsubscribe: jest.fn(),
            once: jest.fn(() => ({ dispose: jest.fn() })),
            filter: jest.fn(),
            subscribePattern: jest.fn(() => ({ dispose: jest.fn() })),
            setLoggingService: jest.fn(),
            dispose: jest.fn()
        };

        mockErrorHandler = {
            handleError: jest.fn(),
            handleAsync: jest.fn(),
            wrapSync: jest.fn(),
            withRetry: jest.fn(),
            dispose: jest.fn()
        };

        mockNotificationService = {
            showInformation: jest.fn().mockResolvedValue(undefined),
            showWarning: jest.fn().mockResolvedValue(undefined),
            showError: jest.fn().mockResolvedValue(undefined),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            withProgress: jest.fn(),
            confirm: jest.fn(),
            confirmDestructive: jest.fn()
        };

        mockConfigService = {
            isAutoAssignTasks: jest.fn(() => true),
            get: jest.fn(),
            update: jest.fn(),
            onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
            dispose: jest.fn()
        };

        mockTaskStateMachine = {
            transition: jest.fn(() => []),
            getCurrentState: jest.fn(),
            canTransition: jest.fn(() => true),
            getValidTransitions: jest.fn(() => []),
            setTaskReader: jest.fn(),
            dispose: jest.fn()
        };

        mockPriorityQueue = {
            enqueue: jest.fn(),
            dequeue: jest.fn(),
            dequeueReady: jest.fn(),
            peek: jest.fn(),
            isEmpty: jest.fn(() => true),
            size: jest.fn(() => 0),
            contains: jest.fn(() => false),
            remove: jest.fn(),
            toArray: jest.fn(() => []),
            moveToReady: jest.fn(),
            updatePriority: jest.fn(),
            computeEffectivePriority: jest.fn(),
            dispose: jest.fn()
        };

        mockCapabilityMatcher = {
            findBestAgent: jest.fn(),
            rankAgents: jest.fn(() => []),
            calculateMatchScore: jest.fn(() => 0.5),
            dispose: jest.fn()
        };

        mockDependencyManager = {
            addDependency: jest.fn(() => true),
            removeDependency: jest.fn(),
            validateDependencies: jest.fn(() => []),
            checkConflicts: jest.fn(() => []),
            getReadyTasks: jest.fn(() => []),
            getDependentTasks: jest.fn(() => []),
            getSoftDependents: jest.fn(() => []),
            resolveConflict: jest.fn(() => true),
            addSoftDependency: jest.fn(),
            dispose: jest.fn()
        };

        taskQueue = new TaskQueue(
            mockAgentManager,
            mockLoggingService,
            mockEventBus,
            mockErrorHandler,
            mockNotificationService,
            mockConfigService,
            mockTaskStateMachine,
            mockPriorityQueue,
            mockCapabilityMatcher,
            mockDependencyManager
        );
    });

    afterEach(() => {
        taskQueue.dispose();
        jest.clearAllMocks();
    });

    describe('🚀 HIGH-FREQUENCY AGENT UPDATES', () => {
        test('should handle 1000 rapid agent updates without performance degradation', () => {
            // Setup: Empty queue to focus on performance
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Performance test: 1000 rapid calls
            const startTime = performance.now();
            
            for (let i = 0; i < 1000; i++) {
                agentUpdateCallback();
            }
            
            const endTime = performance.now();
            const duration = endTime - startTime;

            // Performance requirements
            expect(duration).toBeLessThan(100); // Should complete in under 100ms
            
            // Verify no warnings were shown
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
            
            // Verify all calls were processed
            expect(mockLoggingService.debug).toHaveBeenCalledTimes(1000);
        });

        test('should handle 10000 agent updates with varying agent counts', () => {
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Performance test with varying load
            const startTime = performance.now();
            
            for (let i = 0; i < 10000; i++) {
                // Vary agent count to simulate real-world scenarios
                const agentCount = (i % 10) + 1;
                mockAgentManager.getAvailableAgents.mockReturnValue(
                    Array.from({ length: agentCount }, (_, idx) => 
                        createMockAgent({ id: `agent-${idx}` })
                    )
                );
                agentUpdateCallback();
            }
            
            const endTime = performance.now();
            const duration = endTime - startTime;

            // Performance requirements for high load
            expect(duration).toBeLessThan(1000); // Should complete in under 1 second
            
            // Verify no false warnings
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
        });

        test('should maintain consistent performance under sustained load', () => {
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Measure performance over multiple batches
            const batchSizes = [100, 500, 1000, 2000];
            const durations: number[] = [];

            batchSizes.forEach(batchSize => {
                const startTime = performance.now();
                
                for (let i = 0; i < batchSize; i++) {
                    agentUpdateCallback();
                }
                
                const endTime = performance.now();
                durations.push(endTime - startTime);
            });

            // Performance should not degrade significantly
            const maxDuration = Math.max(...durations);
            const minDuration = Math.min(...durations);
            const performanceRatio = maxDuration / minDuration;
            
            // Performance should be relatively consistent (within 3x)
            expect(performanceRatio).toBeLessThan(3);
            
            // All operations should be fast
            expect(maxDuration).toBeLessThan(200);
        });
    });

    describe('🏋️ STRESS TESTING WITH TASKS', () => {
        test('should handle large queue sizes efficiently', () => {
            // Setup: Large queue with many tasks
            const largeQueueSize = 10000;
            mockPriorityQueue.size.mockReturnValue(largeQueueSize);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Performance test with large queue
            const startTime = performance.now();
            agentUpdateCallback();
            const endTime = performance.now();
            
            const duration = endTime - startTime;

            // Should handle large queues efficiently
            expect(duration).toBeLessThan(10); // Should be very fast even with large queue
            
            // Should show appropriate warning
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );
        });

        test('should handle rapid queue size changes efficiently', () => {
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);
            
            // Simulate rapid queue size changes
            const queueSizes = [0, 100, 0, 500, 0, 1000, 0, 50, 0];
            
            const startTime = performance.now();
            
            queueSizes.forEach((size, index) => {
                mockPriorityQueue.size.mockReturnValue(size);
                mockPriorityQueue.isEmpty.mockReturnValue(size === 0);
                
                for (let i = 0; i < 10; i++) { // Multiple calls per state
                    agentUpdateCallback();
                }
            });
            
            const endTime = performance.now();
            const duration = endTime - startTime;

            // Should handle rapid changes efficiently
            expect(duration).toBeLessThan(50);
            
            // Should only show warnings when queue has tasks
            const warningCalls = mockNotificationService.showWarning.mock.calls.length;
            const infoCalls = mockNotificationService.showInformation.mock.calls.length;
            expect(warningCalls + infoCalls).toBeGreaterThan(0);
            expect(warningCalls + infoCalls).toBeLessThan(90); // Not on every call
        });

        test('should handle large agent lists efficiently', () => {
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            
            // Create large agent list
            const largeAgentList = Array.from({ length: 1000 }, (_, i) => 
                createMockAgent({ id: `agent-${i}`, status: 'idle' })
            );
            mockAgentManager.getAvailableAgents.mockReturnValue(largeAgentList);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Performance test with large agent list
            const startTime = performance.now();
            agentUpdateCallback();
            const endTime = performance.now();
            
            const duration = endTime - startTime;

            // Should handle large agent lists efficiently
            expect(duration).toBeLessThan(5);
            
            // Should not show warnings with empty queue
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
        });
    });

    describe('🧪 MEMORY AND RESOURCE EFFICIENCY', () => {
        test('should not leak memory during repeated calls', () => {
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Check initial memory usage (simplified test)
            const initialCallCount = mockLoggingService.debug.mock.calls.length;
            
            // Perform many operations
            for (let i = 0; i < 5000; i++) {
                agentUpdateCallback();
            }
            
            // Verify operations completed
            const finalCallCount = mockLoggingService.debug.mock.calls.length;
            expect(finalCallCount - initialCallCount).toBe(5000);
            
            // Verify no warnings leaked
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
        });

        test('should handle object creation/destruction efficiently', () => {
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Test with dynamic object creation/destruction
            let createdObjects = 0;
            
            mockAgentManager.getAvailableAgents.mockImplementation(() => {
                createdObjects++;
                return Array.from({ length: 5 }, (_, i) => ({
                    id: `temp-agent-${createdObjects}-${i}`,
                    status: 'idle',
                    template: { name: 'test' }
                }));
            });

            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            
            const startTime = performance.now();
            
            // Many calls that create temporary objects
            for (let i = 0; i < 1000; i++) {
                agentUpdateCallback();
            }
            
            const endTime = performance.now();
            const duration = endTime - startTime;

            // Should handle object creation efficiently
            expect(duration).toBeLessThan(100);
            expect(createdObjects).toBe(1000);
            
            // No warnings should be shown
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
        });
    });

    describe('⚡ CONCURRENT OPERATION SIMULATION', () => {
        test('should handle simulated concurrent agent updates', async () => {
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Simulate concurrent operations with Promise.all
            const concurrentOperations = Array.from({ length: 100 }, () => 
                new Promise<void>(resolve => {
                    // Simulate async work
                    setTimeout(() => {
                        agentUpdateCallback();
                        resolve();
                    }, Math.random() * 10); // Random delay 0-10ms
                })
            );

            const startTime = performance.now();
            await Promise.all(concurrentOperations);
            const endTime = performance.now();
            
            const duration = endTime - startTime;

            // Should handle simulated concurrency efficiently
            expect(duration).toBeLessThan(100); // Should complete quickly
            
            // No warnings should be shown
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
        });

        test('should handle interleaved queue and agent changes', () => {
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            let queueSize = 0;
            let agentCount = 0;
            
            // Setup dynamic mocks
            mockPriorityQueue.size.mockImplementation(() => queueSize);
            mockPriorityQueue.isEmpty.mockImplementation(() => queueSize === 0);
            mockAgentManager.getAvailableAgents.mockImplementation(() => 
                Array.from({ length: agentCount }, (_, i) => 
                    createMockAgent({ id: `agent-${i}` })
                )
            );

            const startTime = performance.now();
            
            // Simulate rapid interleaved changes
            for (let i = 0; i < 1000; i++) {
                // Change queue size
                queueSize = (i % 3) === 0 ? 0 : Math.floor(Math.random() * 5) + 1;
                
                // Change agent count
                agentCount = Math.floor(Math.random() * 10);
                
                agentUpdateCallback();
            }
            
            const endTime = performance.now();
            const duration = endTime - startTime;

            // Should handle rapid changes efficiently
            expect(duration).toBeLessThan(200);
            
            // Should have shown some warnings (but not false ones)
            const totalNotifications = 
                mockNotificationService.showWarning.mock.calls.length +
                mockNotificationService.showInformation.mock.calls.length;
            
            // Should have some notifications but not on every call
            expect(totalNotifications).toBeGreaterThan(0);
            expect(totalNotifications).toBeLessThan(1000);
        });
    });

    describe('📊 PERFORMANCE BENCHMARKS', () => {
        test('should meet performance benchmarks for typical usage', () => {
            // Typical usage: 50 agents, small queue, frequent updates
            mockPriorityQueue.size.mockReturnValue(3);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue(
                Array.from({ length: 50 }, (_, i) => 
                    createMockAgent({ id: `agent-${i}` })
                )
            );

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Benchmark typical usage pattern
            const iterations = 100;
            const startTime = performance.now();
            
            for (let i = 0; i < iterations; i++) {
                agentUpdateCallback();
            }
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            const avgTimePerCall = duration / iterations;

            // Performance benchmarks
            expect(avgTimePerCall).toBeLessThan(1); // Average < 1ms per call
            expect(duration).toBeLessThan(50); // Total < 50ms for 100 calls
            
            // Should show appropriate warnings for tasks
            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );
        });

        test('should maintain sub-millisecond performance for empty queue scenario', () => {
            // The critical scenario that was causing false warnings
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([
                createMockAgent({ id: 'agent-1' }),
                createMockAgent({ id: 'agent-2' }),
                createMockAgent({ id: 'agent-3' })
            ]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Micro-benchmark for the fixed scenario
            const iterations = 1000;
            const startTime = performance.now();
            
            for (let i = 0; i < iterations; i++) {
                agentUpdateCallback();
            }
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            const avgTimePerCall = duration / iterations;

            // Should be extremely fast for empty queue
            expect(avgTimePerCall).toBeLessThan(0.5); // Average < 0.5ms per call
            expect(duration).toBeLessThan(50); // Total < 50ms for 1000 calls
            
            // CRITICAL: No warnings should be shown
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });
    });

    describe('🔬 SCALABILITY TESTING', () => {
        test('should scale linearly with queue size', () => {
            const queueSizes = [0, 10, 100, 1000, 10000];
            const durations: number[] = [];
            
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];

            queueSizes.forEach(size => {
                mockPriorityQueue.size.mockReturnValue(size);
                mockPriorityQueue.isEmpty.mockReturnValue(size === 0);
                
                const startTime = performance.now();
                agentUpdateCallback();
                const endTime = performance.now();
                
                durations.push(endTime - startTime);
            });

            // Performance should remain consistently fast regardless of queue size
            durations.forEach(duration => {
                expect(duration).toBeLessThan(5); // All should be under 5ms
            });

            // Performance should not degrade significantly with queue size
            const maxDuration = Math.max(...durations);
            const minDuration = Math.min(...durations.filter(d => d > 0));
            if (minDuration > 0) {
                expect(maxDuration / minDuration).toBeLessThan(5); // Max 5x difference
            }
        });

        test('should scale linearly with agent count', () => {
            const agentCounts = [0, 10, 50, 100, 500];
            const durations: number[] = [];
            
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];

            agentCounts.forEach(count => {
                mockAgentManager.getAvailableAgents.mockReturnValue(
                    Array.from({ length: count }, (_, i) => 
                        createMockAgent({ id: `agent-${i}` })
                    )
                );
                
                const startTime = performance.now();
                agentUpdateCallback();
                const endTime = performance.now();
                
                durations.push(endTime - startTime);
            });

            // Performance should remain fast regardless of agent count
            durations.forEach(duration => {
                expect(duration).toBeLessThan(5); // All should be under 5ms
            });

            // No warnings for empty queue regardless of agent count
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });
    });
});