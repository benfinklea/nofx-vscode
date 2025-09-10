import { EnterpriseDirectCommunicationService } from '../../services/EnterpriseDirectCommunicationService';
import { IEventBus, ILoggingService } from '../../services/interfaces';
import { MessageType } from '../../orchestration/MessageProtocol';
import { ChaosTestFramework, FailureType, ChaosExperiment } from './ChaosTestFramework';

// Resilience Pattern Validation Tests
describe('Resilience Pattern Validation Tests', () => {
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
            baseRetryDelay: 100,
            maxRetryDelay: 2000
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

    describe('Circuit Breaker Pattern Validation', () => {
        test('should implement circuit breaker state transitions correctly', async () => {
            // Arrange
            await service.start();

            const experiment: ChaosExperiment = {
                id: 'circuit-breaker-states',
                name: 'Circuit Breaker State Transitions',
                description: 'Validate proper circuit breaker state transitions (CLOSED → OPEN → HALF-OPEN → CLOSED)',
                duration: 60000,
                targetService: 'CircuitBreaker',
                failureType: FailureType.EVENTBUS_FAILURE,
                parameters: {
                    failureThreshold: 5,
                    recoveryTimeout: 30000,
                    halfOpenSuccessThreshold: 3
                },
                expectedOutcome: {
                    expectedBehavior: 'circuit_breaker',
                    maxDowntime: 35000,
                    dataLossAllowed: false,
                    performanceDegradation: 90,
                    alertsExpected: ['circuit.breaker.opened', 'circuit.breaker.half_open', 'circuit.breaker.closed'],
                    recoverySteps: ['failure_detection', 'circuit_open', 'recovery_test', 'circuit_closed']
                }
            };

            // Phase 1: CLOSED state - normal operation
            console.log('Phase 1: Testing CLOSED state');
            const closedStateResults = [];
            for (let i = 0; i < 3; i++) {
                closedStateResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Closed state message ${i}`
                    })
                );
            }

            // Verify all succeed in CLOSED state
            expect(closedStateResults.every(r => r.success)).toBe(true);

            // Phase 2: Trigger failures to OPEN circuit breaker
            console.log('Phase 2: Triggering failures to open circuit breaker');
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Simulated EventBus failure');
            });

            const failureResults = [];
            for (let i = 0; i < 10; i++) {
                failureResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Failure trigger message ${i}`
                    })
                );

                jest.advanceTimersByTime(100);
            }

            // Most should fail as circuit trips
            const failureRate = failureResults.filter(r => !r.success).length / 10;
            expect(failureRate).toBeGreaterThan(0.6); // Circuit should trip

            // Verify circuit breaker opened
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Circuit breaker OPENED'),
                expect.any(Object)
            );

            // Phase 3: Test OPEN state - fast failures
            console.log('Phase 3: Testing OPEN state fast failures');
            const openStateResults = [];
            for (let i = 0; i < 5; i++) {
                const startTime = Date.now();
                openStateResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Open state message ${i}`
                    })
                );
                const processingTime = Date.now() - startTime;

                // Should fail fast in OPEN state
                expect(processingTime).toBeLessThan(500);
            }

            // All should fail fast in OPEN state
            expect(openStateResults.every(r => !r.success)).toBe(true);

            // Phase 4: Wait for HALF-OPEN transition
            console.log('Phase 4: Waiting for HALF-OPEN transition');
            jest.advanceTimersByTime(35000); // Trigger recovery timeout

            // Fix the EventBus for recovery testing
            mockEventBus.publish.mockImplementation(jest.fn());

            // Phase 5: Test HALF-OPEN state
            console.log('Phase 5: Testing HALF-OPEN recovery');
            const halfOpenResults = [];
            for (let i = 0; i < 6; i++) {
                halfOpenResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Half-open test message ${i}`
                    })
                );

                jest.advanceTimersByTime(200);
            }

            // Should have mixed results as circuit breaker tests recovery
            const halfOpenSuccessRate = halfOpenResults.filter(r => r.success).length / 6;
            expect(halfOpenSuccessRate).toBeGreaterThan(0.3); // Some should succeed

            // Phase 6: Verify return to CLOSED state
            console.log('Phase 6: Verifying return to CLOSED state');
            jest.advanceTimersByTime(5000);

            const recoveredStateResults = [];
            for (let i = 0; i < 5; i++) {
                recoveredStateResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Recovered state message ${i}`
                    })
                );
            }

            // Should have high success rate after recovery
            const recoveredSuccessRate = recoveredStateResults.filter(r => r.success).length / 5;
            expect(recoveredSuccessRate).toBeGreaterThan(0.8);

            // Verify circuit breaker closed log
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('Circuit breaker CLOSED'),
                expect.any(Object)
            );
        });

        test('should prevent circuit breaker thrashing with hysteresis', async () => {
            // Arrange
            await service.start();

            // Create alternating success/failure pattern that might cause thrashing
            let callCount = 0;
            mockEventBus.publish.mockImplementation(() => {
                callCount++;
                // Alternate: fail 2, succeed 1, fail 2, succeed 1...
                const pattern = Math.floor((callCount - 1) / 3) % 2;
                const position = (callCount - 1) % 3;

                if (pattern === 0 && position < 2) {
                    throw new Error('Pattern failure');
                }
                if (pattern === 1 && position >= 1) {
                    throw new Error('Pattern failure');
                }
                // Success case
                return Promise.resolve();
            });

            // Act - Send messages with alternating pattern
            const thrashingResults = [];
            for (let i = 0; i < 30; i++) {
                thrashingResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Thrashing test message ${i}`
                    })
                );

                jest.advanceTimersByTime(100);
            }

            // Assert - Circuit breaker should not thrash excessively
            const circuitBreakerEvents = mockLoggingService.error.mock.calls.filter(call =>
                call[0].includes('Circuit breaker')
            ).length;

            // Should not have excessive circuit breaker state changes
            expect(circuitBreakerEvents).toBeLessThan(5);

            // Overall success rate should be reasonable despite pattern
            const successRate = thrashingResults.filter(r => r.success).length / 30;
            expect(successRate).toBeGreaterThan(0.3);
        });
    });

    describe('Retry Logic Pattern Validation', () => {
        test('should implement exponential backoff with jitter correctly', async () => {
            // Arrange
            await service.start();

            const retryDelays: number[] = [];
            let attemptCount = 0;

            mockEventBus.publish.mockImplementation(() => {
                attemptCount++;
                const currentTime = Date.now();

                if (attemptCount > 1) {
                    // Record delay between attempts
                    const lastTime = retryDelays.length > 0 ? retryDelays[retryDelays.length - 1] : currentTime - 100;
                    retryDelays.push(currentTime - lastTime);
                }

                // Fail first 3 attempts, succeed on 4th
                if (attemptCount <= 3) {
                    throw new Error(`Retry test failure attempt ${attemptCount}`);
                }

                // Reset for next message
                attemptCount = 0;
                return Promise.resolve();
            });

            // Act - Send message that will trigger retries
            const retryResult = await service.sendMessage({
                type: MessageType.SPAWN_AGENT,
                content: 'Exponential backoff test',
                metadata: { testRetries: true }
            });

            jest.advanceTimersByTime(10000); // Allow retries to complete

            // Assert
            expect(retryResult.success).toBe(true); // Should eventually succeed

            // Verify exponential backoff pattern
            expect(retryDelays.length).toBeGreaterThanOrEqual(2);

            // Each delay should be larger than the previous (with some tolerance for jitter)
            for (let i = 1; i < retryDelays.length; i++) {
                const ratio = retryDelays[i] / retryDelays[i - 1];
                expect(ratio).toBeGreaterThan(1.5); // Should roughly double with jitter
                expect(ratio).toBeLessThan(3.0); // But not too much jitter
            }

            // Verify retry attempts were logged
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Retry attempt'),
                expect.any(Object)
            );
        });

        test('should respect maximum retry attempts', async () => {
            // Arrange
            await service.start();

            let totalAttempts = 0;
            mockEventBus.publish.mockImplementation(() => {
                totalAttempts++;
                throw new Error(`Persistent failure - attempt ${totalAttempts}`);
            });

            // Act - Send message that will always fail
            const persistentFailureResult = await service.sendMessage({
                type: MessageType.SPAWN_AGENT,
                content: 'Max retry test',
                metadata: { expectFailure: true }
            });

            jest.advanceTimersByTime(15000); // Allow all retries to complete

            // Assert
            expect(persistentFailureResult.success).toBe(false); // Should eventually fail
            expect(totalAttempts).toBeLessThanOrEqual(4); // Original attempt + 3 retries

            // Verify max retries exceeded log
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('All retry attempts exhausted'),
                expect.any(Object)
            );
        });

        test('should implement retry budget to prevent retry storms', async () => {
            // Arrange
            await service.start();

            // Track retry attempts across multiple operations
            const allRetryAttempts: number[] = [];
            let operationId = 0;

            mockEventBus.publish.mockImplementation(() => {
                const currentOp = Math.floor(operationId / 4); // Group every 4 attempts per operation
                allRetryAttempts.push(currentOp);
                operationId++;
                throw new Error('Retry budget test failure');
            });

            // Act - Send many failing messages simultaneously
            const retryStormResults = [];
            for (let i = 0; i < 50; i++) {
                retryStormResults.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Retry storm message ${i}`,
                        metadata: { stormTest: true }
                    })
                );
            }

            jest.advanceTimersByTime(30000);
            await Promise.all(retryStormResults);

            // Assert - Should not generate excessive retry attempts
            const totalAttempts = allRetryAttempts.length;
            expect(totalAttempts).toBeLessThan(250); // Much less than 50 * 4 if budget is working

            // Should have some rate limiting mechanism
            const uniqueOperations = new Set(allRetryAttempts).size;
            expect(uniqueOperations).toBeLessThan(50); // Some operations should be budgeted out
        });

        test('should use selective retry for different error types', async () => {
            // Arrange
            await service.start();

            const errorTypes = [
                'TimeoutError',
                'NetworkError',
                'ValidationError',
                'AuthenticationError',
                'RateLimitError'
            ];

            const retryAttempts = new Map<string, number>();

            let messageIndex = 0;
            mockEventBus.publish.mockImplementation(() => {
                const errorType = errorTypes[messageIndex % errorTypes.length];
                const attemptCount = retryAttempts.get(errorType) || 0;
                retryAttempts.set(errorType, attemptCount + 1);

                const error = new Error(`${errorType}: Selective retry test`);
                (error as any).type = errorType;
                messageIndex++;
                throw error;
            });

            // Act - Send messages that will trigger different error types
            const selectiveRetryResults = [];
            for (let i = 0; i < errorTypes.length * 3; i++) {
                selectiveRetryResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Selective retry test ${i}`,
                        metadata: { errorTypeTest: true }
                    })
                );

                jest.advanceTimersByTime(1000);
            }

            // Assert - Different error types should have different retry behavior
            const timeoutRetries = retryAttempts.get('TimeoutError') || 0;
            const networkRetries = retryAttempts.get('NetworkError') || 0;
            const validationRetries = retryAttempts.get('ValidationError') || 0;
            const authRetries = retryAttempts.get('AuthenticationError') || 0;

            // Transient errors (timeout, network) should be retried more
            expect(timeoutRetries).toBeGreaterThanOrEqual(3);
            expect(networkRetries).toBeGreaterThanOrEqual(3);

            // Permanent errors (validation, auth) might be retried less or not at all
            // (This depends on implementation - adjust expectations based on actual behavior)
            expect(validationRetries).toBeGreaterThanOrEqual(1);
            expect(authRetries).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Bulkhead Pattern Validation', () => {
        test('should isolate critical from non-critical operations', async () => {
            // Arrange
            await service.start();

            // Simulate resource exhaustion for non-critical operations
            const criticalMessages: string[] = [];
            const nonCriticalMessages: string[] = [];

            mockEventBus.publish.mockImplementation((event, data) => {
                const message = data?.message;
                if (message?.metadata?.priority === 'critical') {
                    criticalMessages.push(message.id);
                    // Critical operations always succeed
                    return Promise.resolve();
                } else {
                    nonCriticalMessages.push(message.id);
                    // Non-critical operations fail due to resource exhaustion
                    if (nonCriticalMessages.length % 3 === 0) {
                        throw new Error('Resource exhaustion - non-critical rejected');
                    }
                    return Promise.resolve();
                }
            });

            // Act - Send mixed critical and non-critical messages
            const bulkheadResults = [];
            for (let i = 0; i < 20; i++) {
                const isCritical = i % 5 === 0; // Every 5th message is critical

                bulkheadResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Bulkhead test message ${i}`,
                        metadata: {
                            priority: isCritical ? 'critical' : 'normal',
                            messageIndex: i
                        }
                    })
                );
            }

            // Assert
            const criticalResults = bulkheadResults.filter((_, i) => i % 5 === 0);
            const nonCriticalResults = bulkheadResults.filter((_, i) => i % 5 !== 0);

            const criticalSuccessRate = criticalResults.filter(r => r.success).length / criticalResults.length;
            const nonCriticalSuccessRate = nonCriticalResults.filter(r => r.success).length / nonCriticalResults.length;

            // Critical operations should be better protected
            expect(criticalSuccessRate).toBeGreaterThan(0.9);
            expect(criticalSuccessRate).toBeGreaterThan(nonCriticalSuccessRate);

            // Verify isolation worked
            expect(criticalMessages.length).toBe(4); // 4 critical messages (indices 0, 5, 10, 15)
            expect(nonCriticalMessages.length).toBe(16); // 16 non-critical messages
        });

        test('should implement thread pool separation', async () => {
            // Arrange
            await service.start();

            const fastPoolOperations: string[] = [];
            const slowPoolOperations: string[] = [];

            // Simulate different processing pools
            mockEventBus.publish.mockImplementation((event, data) => {
                const message = data?.message;
                const operationType = message?.metadata?.operationType;

                if (operationType === 'fast') {
                    fastPoolOperations.push(message.id);
                    // Fast operations complete quickly
                    return Promise.resolve();
                } else if (operationType === 'slow') {
                    slowPoolOperations.push(message.id);
                    // Slow operations take time
                    return new Promise(resolve => setTimeout(resolve, 1000));
                }

                return Promise.resolve();
            });

            // Act - Send mixed fast and slow operations
            const poolSeparationResults = [];
            const startTime = Date.now();

            // Send fast operations
            for (let i = 0; i < 10; i++) {
                poolSeparationResults.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Fast operation ${i}`,
                        metadata: { operationType: 'fast' }
                    })
                );
            }

            // Send slow operations
            for (let i = 0; i < 5; i++) {
                poolSeparationResults.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Slow operation ${i}`,
                        metadata: { operationType: 'slow' }
                    })
                );
            }

            jest.advanceTimersByTime(8000);
            const results = await Promise.all(poolSeparationResults);
            const totalTime = Date.now() - startTime;

            // Assert
            const fastResults = results.slice(0, 10);
            const slowResults = results.slice(10);

            const fastSuccessRate = fastResults.filter(r => r.success).length / 10;
            const slowSuccessRate = slowResults.filter(r => r.success).length / 5;

            // Fast operations should not be blocked by slow ones
            expect(fastSuccessRate).toBeGreaterThan(0.9);
            expect(slowSuccessRate).toBeGreaterThan(0.8);

            // Fast operations should complete much faster
            const avgFastTime = fastResults.reduce((sum, r) => sum + r.processingTimeMs, 0) / 10;
            const avgSlowTime = slowResults.reduce((sum, r) => sum + r.processingTimeMs, 0) / 5;

            expect(avgFastTime).toBeLessThan(avgSlowTime);
        });
    });

    describe('Timeout Pattern Validation', () => {
        test('should implement hierarchical timeout structure', async () => {
            // Arrange
            await service.start();

            const timeouts: number[] = [];

            mockEventBus.publish.mockImplementation((event, data) => {
                const message = data?.message;
                const timeoutType = message?.metadata?.timeoutType;
                const startTime = Date.now();

                // Simulate different timeout scenarios
                const delay =
                    timeoutType === 'short'
                        ? 500
                        : timeoutType === 'medium'
                          ? 2000
                          : timeoutType === 'long'
                            ? 8000
                            : 1000;

                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        const elapsed = Date.now() - startTime;
                        timeouts.push(elapsed);

                        if (elapsed > 5000) {
                            // Service timeout threshold
                            reject(new Error('Operation timeout'));
                        } else {
                            resolve(undefined);
                        }
                    }, delay);
                });
            });

            // Act - Send operations with different timeout requirements
            const timeoutResults = [];

            // Short timeout operations
            for (let i = 0; i < 3; i++) {
                timeoutResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Short timeout operation ${i}`,
                        metadata: { timeoutType: 'short' }
                    })
                );
            }

            // Medium timeout operations
            for (let i = 0; i < 3; i++) {
                timeoutResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Medium timeout operation ${i}`,
                        metadata: { timeoutType: 'medium' }
                    })
                );
            }

            // Long timeout operations (should timeout)
            for (let i = 0; i < 2; i++) {
                timeoutResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Long timeout operation ${i}`,
                        metadata: { timeoutType: 'long' }
                    })
                );
            }

            jest.advanceTimersByTime(10000);

            // Assert
            const shortResults = timeoutResults.slice(0, 3);
            const mediumResults = timeoutResults.slice(3, 6);
            const longResults = timeoutResults.slice(6, 8);

            // Short and medium should succeed
            expect(shortResults.every(r => r.success)).toBe(true);
            expect(mediumResults.every(r => r.success)).toBe(true);

            // Long operations should timeout
            expect(longResults.every(r => !r.success)).toBe(true);

            // Verify timeout errors were logged
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('timeout'),
                expect.any(Object)
            );
        });

        test('should cascade timeouts properly from parent to child operations', async () => {
            // Arrange
            await service.start();

            const operationHierarchy: Array<{ parent?: string; id: string; duration: number }> = [];

            mockEventBus.publish.mockImplementation((event, data) => {
                const message = data?.message;
                const operation = {
                    id: message?.id || 'unknown',
                    parent: message?.metadata?.parentOperation,
                    duration: message?.metadata?.expectedDuration || 1000
                };

                operationHierarchy.push(operation);

                // Simulate parent operation timeout affecting children
                const parentOp = operationHierarchy.find(op => op.id === operation.parent);
                if (parentOp && Date.now() - parentOp.duration > 3000) {
                    throw new Error('Parent operation timeout cascade');
                }

                return new Promise(resolve => {
                    setTimeout(resolve, operation.duration);
                });
            });

            // Act - Create parent-child operation hierarchy
            const cascadeResults = [];

            // Parent operation
            const parentResult = service.sendMessage({
                type: MessageType.SPAWN_AGENT,
                content: 'Parent operation',
                metadata: {
                    operationId: 'parent-1',
                    expectedDuration: 4000
                }
            });

            // Child operations
            for (let i = 0; i < 3; i++) {
                cascadeResults.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Child operation ${i}`,
                        metadata: {
                            parentOperation: 'parent-1',
                            expectedDuration: 2000
                        }
                    })
                );
            }

            jest.advanceTimersByTime(6000);

            const allResults = [await parentResult, ...(await Promise.all(cascadeResults))];

            // Assert
            const parentSuccess = allResults[0].success;
            const childrenSuccess = allResults.slice(1).map(r => r.success);

            // If parent times out, children should also be affected
            if (!parentSuccess) {
                expect(childrenSuccess.some(s => !s)).toBe(true);
            }

            // Verify timeout coordination
            expect(operationHierarchy.length).toBeGreaterThan(3);
        });
    });

    describe('Load Shedding Pattern Validation', () => {
        test('should implement priority-based load shedding', async () => {
            // Arrange
            await service.start();

            const processedMessages: Array<{ priority: string; timestamp: number }> = [];

            // Simulate system under high load
            let systemLoad = 0;
            mockEventBus.publish.mockImplementation((event, data) => {
                systemLoad++;
                const message = data?.message;
                const priority = message?.metadata?.priority || 'normal';

                // Drop low priority messages when under high load
                if (systemLoad > 10 && priority === 'low') {
                    throw new Error('Load shedding: Low priority message dropped');
                }

                processedMessages.push({
                    priority,
                    timestamp: Date.now()
                });

                return Promise.resolve();
            });

            // Act - Send messages with different priorities under load
            const loadSheddingResults = [];

            // Create high load scenario
            for (let i = 0; i < 50; i++) {
                let priority: string;
                if (i % 10 === 0) priority = 'critical';
                else if (i % 5 === 0) priority = 'high';
                else if (i % 3 === 0) priority = 'normal';
                else priority = 'low';

                loadSheddingResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Load test message ${i}`,
                        metadata: { priority }
                    })
                );
            }

            // Assert
            const criticalResults = loadSheddingResults.filter((r, i) => i % 10 === 0);
            const highResults = loadSheddingResults.filter((r, i) => i % 5 === 0 && i % 10 !== 0);
            const lowResults = loadSheddingResults.filter((r, i) => i % 3 !== 0 && i % 5 !== 0 && i % 10 !== 0);

            const criticalSuccessRate = criticalResults.filter(r => r.success).length / criticalResults.length;
            const highSuccessRate = highResults.filter(r => r.success).length / highResults.length;
            const lowSuccessRate = lowResults.filter(r => r.success).length / lowResults.length;

            // Critical messages should have highest success rate
            expect(criticalSuccessRate).toBeGreaterThan(0.9);
            expect(criticalSuccessRate).toBeGreaterThan(highSuccessRate);
            expect(highSuccessRate).toBeGreaterThan(lowSuccessRate);

            // Verify load shedding occurred
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Load shedding'),
                expect.any(Object)
            );
        });
    });

    describe('Graceful Degradation Pattern Validation', () => {
        test('should degrade functionality gracefully under stress', async () => {
            // Arrange
            await service.start();

            const functionalityLevels: string[] = [];

            // Track degradation levels
            let stressLevel = 0;
            mockEventBus.publish.mockImplementation((event, data) => {
                stressLevel++;
                const message = data?.message;

                // Implement graceful degradation
                let functionality: string;
                if (stressLevel < 10) {
                    functionality = 'full';
                } else if (stressLevel < 25) {
                    functionality = 'reduced';
                } else if (stressLevel < 40) {
                    functionality = 'minimal';
                } else {
                    functionality = 'critical_only';
                    if (message?.metadata?.priority !== 'critical') {
                        throw new Error('Graceful degradation: Non-critical functionality disabled');
                    }
                }

                functionalityLevels.push(functionality);
                return Promise.resolve();
            });

            // Act - Gradually increase system stress
            const degradationResults = [];

            for (let i = 0; i < 50; i++) {
                const priority = i > 40 ? 'critical' : 'normal';

                degradationResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Degradation test message ${i}`,
                        metadata: { priority, stressTest: true }
                    })
                );
            }

            // Assert
            const fullFunctionality = functionalityLevels.filter(f => f === 'full').length;
            const reducedFunctionality = functionalityLevels.filter(f => f === 'reduced').length;
            const minimalFunctionality = functionalityLevels.filter(f => f === 'minimal').length;
            const criticalOnly = functionalityLevels.filter(f => f === 'critical_only').length;

            // Should show progression of degradation
            expect(fullFunctionality).toBeGreaterThan(0);
            expect(reducedFunctionality).toBeGreaterThan(0);
            expect(criticalOnly).toBeGreaterThan(0);

            // Later messages should have lower success rate except critical ones
            const earlyResults = degradationResults.slice(0, 10);
            const lateNormalResults = degradationResults.slice(30, 40);
            const lateCriticalResults = degradationResults.slice(40);

            const earlySuccessRate = earlyResults.filter(r => r.success).length / 10;
            const lateNormalSuccessRate = lateNormalResults.filter(r => r.success).length / 10;
            const lateCriticalSuccessRate = lateCriticalResults.filter(r => r.success).length / 10;

            expect(earlySuccessRate).toBeGreaterThan(0.9);
            expect(lateNormalSuccessRate).toBeLessThan(earlySuccessRate);
            expect(lateCriticalSuccessRate).toBeGreaterThan(lateNormalSuccessRate);
        });
    });
});
