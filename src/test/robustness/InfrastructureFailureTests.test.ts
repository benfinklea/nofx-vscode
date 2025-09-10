import { EnterpriseDirectCommunicationService } from '../../services/EnterpriseDirectCommunicationService';
import { IEventBus, ILoggingService } from '../../services/interfaces';
import { MessageType } from '../../orchestration/MessageProtocol';
import { ChaosTestFramework, FailureType, ChaosExperiment } from './ChaosTestFramework';
import { getAppStateStore } from '../../state/AppStateStore';
import * as selectors from '../../state/selectors';
import * as actions from '../../state/actions';
// Infrastructure Failure Chaos Tests
describe('Infrastructure Failure Robustness Tests', () => {
    let service: EnterpriseDirectCommunicationService;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let chaosFramework: ChaosTestFramework;

    beforeEach(() => {
        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(() => ({ dispose: jest.fn() })),
            unsubscribe: jest.fn(),
            once: jest.fn(() => ({ dispose: jest.fn() })),
            filter: jest.fn(() => ({ event: jest.fn(), dispose: jest.fn() })),
            subscribePattern: jest.fn(() => ({ dispose: jest.fn() })),
            getRegisteredEvents: jest.fn(() => []),
            hasSubscribers: jest.fn(() => true),
            getEventMetrics: jest.fn(() => new Map()),
            getSubscriptionInfo: jest.fn(() => new Map()),
            getUnusedEvents: jest.fn(() => []),
            getOrphanedEvents: jest.fn(() => []),
            dispose: jest.fn()
        };

        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn(() => true),
            onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() }))
        };

        service = new EnterpriseDirectCommunicationService(mockEventBus, mockLoggingService, undefined, undefined, {
            enableCircuitBreaker: true,
            enableSelfHealing: true,
            maxRetryAttempts: 3,
            baseRetryDelay: 100
        });

        chaosFramework = new ChaosTestFramework();

        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        if (service) {
            service.stop().catch(() => {});
        }
    });

    describe('Memory Exhaustion Scenarios', () => {
        test('should handle gradual memory pressure gracefully', async () => {
            // Arrange
            await service.start();

            const experiment: ChaosExperiment = {
                id: 'memory-gradual-pressure',
                name: 'Gradual Memory Pressure',
                description: 'Slowly increase memory usage to test graceful degradation',
                duration: 10000,
                targetService: 'EnterpriseDirectCommunicationService',
                failureType: FailureType.MEMORY_EXHAUSTION,
                parameters: {
                    maxMemoryMB: 512,
                    increaseRateMBPerSecond: 50,
                    triggerGC: true
                },
                expectedOutcome: {
                    expectedBehavior: 'graceful_degradation',
                    maxDowntime: 1000,
                    dataLossAllowed: false,
                    performanceDegradation: 30,
                    alertsExpected: ['memory.high', 'performance.degraded'],
                    recoverySteps: ['garbage_collection', 'message_queue_throttling']
                }
            };

            // Simulate memory pressure by creating large objects
            let memoryConsumers: any[] = [];
            const originalMemoryUsage = process.memoryUsage;

            process.memoryUsage = jest.fn(() => ({
                rss: 1024 * 1024 * 400, // 400MB RSS
                heapTotal: 1024 * 1024 * 450, // 450MB heap total
                heapUsed: 1024 * 1024 * 400, // 400MB heap used (high pressure)
                external: 1024 * 1024 * 10,
                arrayBuffers: 1024 * 1024 * 5
            }));

            // Act - Run chaos experiment
            const result = await chaosFramework.runExperiment(experiment);

            // During memory pressure, service should still process messages but may be slower
            const messagePromises = [];
            for (let i = 0; i < 50; i++) {
                messagePromises.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Memory pressure test message ${i}`,
                        metadata: { testType: 'memory-pressure' }
                    })
                );

                // Create some memory pressure
                memoryConsumers.push(new Array(10000).fill('memory-pressure-data'));
            }

            jest.advanceTimersByTime(5000);

            const results = await Promise.all(messagePromises);
            const successfulMessages = results.filter(r => r.success).length;

            // Assert
            expect(successfulMessages).toBeGreaterThan(40); // At least 80% success rate under pressure
            expect(result.success).toBe(true);
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('High memory usage detected'),
                expect.any(Object)
            );

            // Cleanup
            memoryConsumers = [];
            process.memoryUsage = originalMemoryUsage;
        });

        test('should recover from out-of-memory conditions', async () => {
            // Arrange
            await service.start();

            // Simulate OOM condition
            const originalMemoryUsage = process.memoryUsage;
            let oomTriggered = false;

            process.memoryUsage = jest.fn(() => {
                if (!oomTriggered) {
                    oomTriggered = true;
                    return {
                        rss: 1024 * 1024 * 1200, // 1.2GB - trigger OOM
                        heapTotal: 1024 * 1024 * 1100,
                        heapUsed: 1024 * 1024 * 1050,
                        external: 1024 * 1024 * 50,
                        arrayBuffers: 1024 * 1024 * 50
                    };
                } else {
                    // After "recovery"
                    return {
                        rss: 1024 * 1024 * 200, // Back to normal
                        heapTotal: 1024 * 1024 * 300,
                        heapUsed: 1024 * 1024 * 150,
                        external: 1024 * 1024 * 10,
                        arrayBuffers: 1024 * 1024 * 5
                    };
                }
            });

            // Mock global.gc for self-healing
            (global as any).gc = jest.fn();

            // Act - Trigger self-healing due to high memory usage
            jest.advanceTimersByTime(10000); // Trigger health check

            // Send messages after recovery
            const postRecoveryResults = [];
            for (let i = 0; i < 10; i++) {
                postRecoveryResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Post-recovery message ${i}`
                    })
                );
            }

            const recoverySuccessRate = postRecoveryResults.filter(r => r.success).length / 10;

            // Assert
            expect((global as any).gc).toHaveBeenCalled(); // Self-healing triggered GC
            expect(recoverySuccessRate).toBeGreaterThan(0.9); // 90% success after recovery
            expect(mockLoggingService.info).toHaveBeenCalledWith('Self-healing: Forced garbage collection', undefined);

            // Cleanup
            delete (global as any).gc;
            process.memoryUsage = originalMemoryUsage;
        });
    });

    describe('CPU Exhaustion Scenarios', () => {
        test('should handle high CPU load gracefully', async () => {
            // Arrange
            await service.start();

            // Simulate high CPU load
            const cpuIntensiveTask = () => {
                const start = Date.now();
                while (Date.now() - start < 100) {
                    Math.random() * Math.random(); // CPU intensive operation
                }
            };

            const experiment: ChaosExperiment = {
                id: 'cpu-high-load',
                name: 'High CPU Load',
                description: 'Test behavior under high CPU utilization',
                duration: 5000,
                targetService: 'EnterpriseDirectCommunicationService',
                failureType: FailureType.CPU_SPIKE,
                parameters: {
                    cpuUtilization: 95,
                    duration: 5000
                },
                expectedOutcome: {
                    expectedBehavior: 'graceful_degradation',
                    maxDowntime: 0,
                    dataLossAllowed: false,
                    performanceDegradation: 50,
                    alertsExpected: ['cpu.high'],
                    recoverySteps: ['request_throttling', 'priority_queuing']
                }
            };

            // Act - Create CPU load and send messages simultaneously
            const messagePromises = [];
            const cpuLoadPromises = [];

            // Start CPU load
            for (let i = 0; i < 4; i++) {
                // Simulate multi-core load
                cpuLoadPromises.push(
                    new Promise(resolve => {
                        const loadInterval = setInterval(cpuIntensiveTask, 10);
                        setTimeout(() => {
                            clearInterval(loadInterval);
                            resolve(undefined);
                        }, 5000);
                    })
                );
            }

            // Send messages during CPU load
            for (let i = 0; i < 100; i++) {
                messagePromises.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `CPU load test message ${i}`,
                        metadata: { priority: i < 10 ? 'high' : 'normal' }
                    })
                );

                // Small delay to prevent overwhelming
                if (i % 10 === 0) {
                    jest.advanceTimersByTime(100);
                }
            }

            jest.advanceTimersByTime(6000);

            await Promise.all(cpuLoadPromises);
            const results = await Promise.all(messagePromises);

            const successfulMessages = results.filter(r => r.success).length;
            const averageProcessingTime =
                results.filter(r => r.success).reduce((sum, r) => sum + r.processingTimeMs, 0) / successfulMessages;

            // Assert
            expect(successfulMessages).toBeGreaterThan(70); // 70% success under high CPU load
            expect(averageProcessingTime).toBeLessThan(5000); // Processing time shouldn't be too high

            // High-priority messages should have higher success rate
            const highPriorityResults = results.slice(0, 10);
            const highPrioritySuccessRate = highPriorityResults.filter(r => r.success).length / 10;
            expect(highPrioritySuccessRate).toBeGreaterThan(0.8);
        });
    });

    describe('Disk Space Exhaustion', () => {
        test('should handle disk full conditions', async () => {
            // Arrange
            await service.start();

            // Mock filesystem operations to simulate disk full
            const originalWriteFile = require('fs').writeFile;
            let diskFull = false;

            require('fs').writeFile = jest.fn((path, data, callback) => {
                if (diskFull) {
                    const error = new Error('ENOSPC: no space left on device');
                    (error as any).code = 'ENOSPC';
                    callback(error);
                } else {
                    originalWriteFile(path, data, callback);
                }
            });

            // Act - Trigger disk full condition
            diskFull = true;

            const results = [];
            for (let i = 0; i < 20; i++) {
                results.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Disk full test message ${i}`,
                        metadata: { requiresPersistence: true }
                    })
                );
            }

            // Simulate disk space recovery
            diskFull = false;

            const recoveryResults = [];
            for (let i = 0; i < 10; i++) {
                recoveryResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Recovery test message ${i}`
                    })
                );
            }

            const duringFailureSuccessRate = results.filter(r => r.success).length / 20;
            const afterRecoverySuccessRate = recoveryResults.filter(r => r.success).length / 10;

            // Assert
            expect(duringFailureSuccessRate).toBeGreaterThan(0.5); // Service should still work in memory
            expect(afterRecoverySuccessRate).toBeGreaterThan(0.9); // Should recover quickly

            // Cleanup
            require('fs').writeFile = originalWriteFile;
        });
    });

    describe('Process/Thread Exhaustion', () => {
        test('should handle thread pool exhaustion gracefully', async () => {
            // Arrange
            await service.start();

            const experiment: ChaosExperiment = {
                id: 'thread-exhaustion',
                name: 'Thread Pool Exhaustion',
                description: 'Exhaust available threads to test resource management',
                duration: 3000,
                targetService: 'EnterpriseDirectCommunicationService',
                failureType: FailureType.THREAD_STARVATION,
                parameters: {
                    maxConcurrentOperations: 1000,
                    operationDuration: 5000
                },
                expectedOutcome: {
                    expectedBehavior: 'graceful_degradation',
                    maxDowntime: 0,
                    dataLossAllowed: false,
                    performanceDegradation: 70,
                    alertsExpected: ['threads.exhausted', 'queue.backpressure'],
                    recoverySteps: ['request_queuing', 'thread_pool_expansion']
                }
            };

            // Act - Create many concurrent long-running operations
            const longRunningOperations = [];
            for (let i = 0; i < 200; i++) {
                longRunningOperations.push(
                    new Promise(resolve => {
                        setTimeout(() => {
                            service
                                .sendMessage({
                                    type: MessageType.SPAWN_AGENT,
                                    content: `Long running operation ${i}`,
                                    metadata: { duration: 'long' }
                                })
                                .then(resolve);
                        }, Math.random() * 1000);
                    })
                );
            }

            // Send regular messages during thread exhaustion
            const regularMessages = [];
            for (let i = 0; i < 50; i++) {
                regularMessages.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Regular message ${i}`
                    })
                );
            }

            jest.advanceTimersByTime(8000);

            const regularResults = await Promise.all(regularMessages);
            const regularSuccessRate = regularResults.filter(r => r.success).length / 50;

            // Assert
            expect(regularSuccessRate).toBeGreaterThan(0.6); // Should handle some regular requests

            // Check that service implements some form of queuing or backpressure
            const someResultsAreDelayed = regularResults.some(r => r.processingTimeMs > 1000);
            expect(someResultsAreDelayed).toBe(true);
        });
    });

    describe('Service Restart Scenarios', () => {
        test('should handle unexpected service restart', async () => {
            // Arrange
            await service.start();

            // Send some messages before restart
            const preRestartResults = [];
            for (let i = 0; i < 10; i++) {
                preRestartResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Pre-restart message ${i}`
                    })
                );
            }

            // Act - Simulate service restart
            await service.stop();

            // Try to send messages during downtime (should fail gracefully)
            const duringDowntimeResults = [];
            for (let i = 0; i < 5; i++) {
                duringDowntimeResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Downtime message ${i}`
                    })
                );
            }

            // Restart service
            await service.start();

            // Send messages after restart
            const postRestartResults = [];
            for (let i = 0; i < 10; i++) {
                postRestartResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Post-restart message ${i}`
                    })
                );
            }

            // Assert
            const preRestartSuccessRate = preRestartResults.filter(r => r.success).length / 10;
            const duringDowntimeSuccessRate = duringDowntimeResults.filter(r => r.success).length / 5;
            const postRestartSuccessRate = postRestartResults.filter(r => r.success).length / 10;

            expect(preRestartSuccessRate).toBe(1.0); // Perfect before restart
            expect(duringDowntimeSuccessRate).toBe(0.0); // Nothing works during downtime
            expect(postRestartSuccessRate).toBeGreaterThan(0.9); // Quick recovery after restart

            // Check that service state was properly reset
            const healthAfterRestart = service.getHealthStatus();
            expect(healthAfterRestart.status).toBe('healthy');
        });

        test('should handle rolling restart with graceful shutdown', async () => {
            // Arrange
            await service.start();

            // Start continuous message sending
            const continuousMessages = [];
            const messageInterval = setInterval(() => {
                continuousMessages.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Continuous message ${continuousMessages.length}`,
                        metadata: { timestamp: Date.now() }
                    })
                );
            }, 100);

            // Act - Initiate graceful shutdown after some messages
            setTimeout(async () => {
                clearInterval(messageInterval);
                await service.stop();

                // Brief downtime
                setTimeout(async () => {
                    await service.start();

                    // Resume message sending
                    for (let i = 0; i < 10; i++) {
                        continuousMessages.push(
                            service.sendMessage({
                                type: MessageType.SPAWN_AGENT,
                                content: `Post-restart message ${i}`
                            })
                        );
                    }
                }, 500);
            }, 2000);

            jest.advanceTimersByTime(5000);

            const results = await Promise.all(continuousMessages);
            const successRate = results.filter(r => r.success).length / results.length;

            // Assert
            expect(successRate).toBeGreaterThan(0.8); // Graceful shutdown should minimize impact
            expect(results.length).toBeGreaterThan(20); // Continuous operation
        });
    });

    describe('Cascading Failure Prevention', () => {
        test('should prevent cascading failures across components', async () => {
            // Arrange
            await service.start();

            // Mock dependencies to fail in sequence
            let eventBusFailures = 0;
            mockEventBus.publish.mockImplementation(() => {
                eventBusFailures++;
                if (eventBusFailures < 10) {
                    throw new Error(`EventBus failure ${eventBusFailures}`);
                }
                // Recovery after 10 failures
            });

            // Act - Send messages while EventBus is failing
            const results = [];
            for (let i = 0; i < 50; i++) {
                results.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Cascading failure test ${i}`,
                        metadata: { testType: 'cascading-failure' }
                    })
                );

                // Small delay to observe failure propagation
                jest.advanceTimersByTime(50);
            }

            // Assert - Service should use circuit breaker to prevent cascading failures
            const initialFailures = results.slice(0, 15).filter(r => !r.success).length;
            const laterResults = results.slice(30, 50).filter(r => r.success).length;

            expect(initialFailures).toBeGreaterThan(5); // Some failures expected initially
            expect(laterResults).toBeGreaterThan(15); // Should recover and prevent cascade

            // Verify circuit breaker was triggered
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Circuit breaker OPENED'),
                expect.any(Object)
            );
        });

        test('should isolate failures using bulkhead pattern', async () => {
            // Arrange
            await service.start();

            // Simulate high-priority and low-priority message processing
            const highPriorityMessages = [];
            const lowPriorityMessages = [];

            // Act - Overwhelm low priority processing
            for (let i = 0; i < 100; i++) {
                lowPriorityMessages.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Low priority bulk message ${i}`,
                        metadata: { priority: 'low', bulk: true }
                    })
                );
            }

            // Send high priority messages during bulk processing
            for (let i = 0; i < 20; i++) {
                highPriorityMessages.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `High priority message ${i}`,
                        metadata: { priority: 'high', critical: true }
                    })
                );
            }

            jest.advanceTimersByTime(3000);

            const lowPriorityResults = await Promise.all(lowPriorityMessages);
            const highPriorityResults = await Promise.all(highPriorityMessages);

            const lowPrioritySuccessRate = lowPriorityResults.filter(r => r.success).length / 100;
            const highPrioritySuccessRate = highPriorityResults.filter(r => r.success).length / 20;

            // Assert - High priority should have better success rate (bulkhead isolation)
            expect(highPrioritySuccessRate).toBeGreaterThan(lowPrioritySuccessRate + 0.2);
            expect(highPrioritySuccessRate).toBeGreaterThan(0.8); // High priority protected
        });
    });
});
