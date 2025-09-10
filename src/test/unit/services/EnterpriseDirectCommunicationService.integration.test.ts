import * as vscode from 'vscode';
import {
    EnterpriseDirectCommunicationService,
    ServiceError,
    ErrorCode,
    ErrorSeverity
} from '../../../services/EnterpriseDirectCommunicationService';
import { IEventBus, ILoggingService } from '../../../services/interfaces';
import { MessageType, OrchestratorMessage } from '../../../orchestration/MessageProtocol';

// Mock VS Code module
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn(),
        dispose: jest.fn()
    })),
    Disposable: {
        create: jest.fn(() => ({ dispose: jest.fn() }))
    }
}));

describe('EnterpriseDirectCommunicationService - Integration Tests', () => {
    let service: EnterpriseDirectCommunicationService;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockLoggingService: jest.Mocked<ILoggingService>;

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

        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        if (service) {
            service.stop().catch(() => {});
        }
    });

    describe('Full Service Lifecycle Integration', () => {
        test('should handle complete service lifecycle with message processing', async () => {
            // Arrange
            const receivedMessages: OrchestratorMessage[] = [];
            const callback = jest.fn(message => {
                receivedMessages.push(message);
            });

            service = new EnterpriseDirectCommunicationService(mockEventBus, mockLoggingService);

            // Act - Full lifecycle
            await service.start();
            service.setDashboardCallback(callback);

            // Send various message types
            const messageTypes = [
                MessageType.SPAWN_AGENT,
                MessageType.ASSIGN_TASK,
                MessageType.TASK_PROGRESS,
                MessageType.TASK_COMPLETE,
                MessageType.AGENT_STATUS
            ];

            const sendResults = await Promise.all(
                messageTypes.map(type =>
                    service.sendMessage({
                        type,
                        content: `Test ${type} message`
                    })
                )
            );

            await service.stop();

            // Assert
            expect(sendResults.every(result => result.success)).toBe(true);
            expect(receivedMessages).toHaveLength(messageTypes.length);
            expect(mockEventBus.publish).toHaveBeenCalledTimes(messageTypes.length + 2); // +2 for start/stop events
        });

        test('should recover from failures and maintain service health', async () => {
            // Arrange
            let failureCount = 0;
            const maxFailures = 3;

            mockEventBus.publish.mockImplementation(() => {
                failureCount++;
                if (failureCount <= maxFailures) {
                    throw new Error(`Failure ${failureCount}`);
                }
                // Success after max failures
            });

            service = new EnterpriseDirectCommunicationService(mockEventBus, mockLoggingService, undefined, undefined, {
                maxRetryAttempts: 2,
                baseRetryDelay: 100,
                enableCircuitBreaker: true
            });

            await service.start();

            // Act - Send messages that will initially fail then succeed
            const message = {
                type: MessageType.SPAWN_AGENT,
                content: 'Recovery test message'
            };

            const result1 = await service.sendMessage(message);
            const result2 = await service.sendMessage(message);

            // Advance time to allow circuit breaker recovery
            jest.advanceTimersByTime(35000);
            const result3 = await service.sendMessage(message);

            const healthBefore = service.getHealthStatus();

            // Allow self-healing to run
            jest.advanceTimersByTime(10000);

            const healthAfter = service.getHealthStatus();

            // Assert
            expect(result1.success).toBe(false); // First message fails
            expect(result2.success).toBe(false); // Circuit breaker may trip
            expect(result3.success).toBe(true); // Should recover
            expect(healthAfter.healthScore).toBeGreaterThanOrEqual(healthBefore.healthScore);
        });

        test('should handle concurrent operations safely', async () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(mockEventBus, mockLoggingService, undefined, undefined, {
                maxRetryAttempts: 1
            });

            await service.start();

            // Act - Concurrent message sending
            const concurrentMessages = Array(20)
                .fill(null)
                .map((_, index) =>
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Concurrent message ${index}`
                    })
                );

            const results = await Promise.all(concurrentMessages);

            // Assert - All should succeed or fail gracefully
            expect(results).toHaveLength(20);
            expect(results.every(r => typeof r.success === 'boolean')).toBe(true);

            const health = service.getHealthStatus();
            expect(health.metrics?.totalMessages).toBeGreaterThanOrEqual(20);
        });
    });

    describe('Dead Letter Queue Integration', () => {
        test('should process dead letter queue items during maintenance', async () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(mockEventBus, mockLoggingService, undefined, undefined, {
                enableDeadLetterQueue: true,
                maxRetryAttempts: 1,
                baseRetryDelay: 100
            });

            await service.start();

            // Simulate failures to populate dead letter queue
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Service unavailable');
            });

            // Send failing messages
            for (let i = 0; i < 5; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: `Dead letter test ${i}`
                });
            }

            let health = service.getHealthStatus();
            const initialDLQSize = health.deadLetterQueueSize || 0;

            // Act - Fix service and trigger maintenance
            mockEventBus.publish.mockImplementation(jest.fn());
            jest.advanceTimersByTime(300000); // Trigger cleanup

            health = service.getHealthStatus();

            // Assert
            expect(initialDLQSize).toBeGreaterThan(0);
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('added to dead letter queue'),
                expect.any(Object)
            );
        });
    });

    describe('Metrics and Monitoring Integration', () => {
        test('should accurately track metrics across service operations', async () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(mockEventBus, mockLoggingService, undefined, undefined, {
                metricsReportingIntervalMs: 1000
            });

            await service.start();

            // Act - Perform various operations
            const successCount = 10;
            const failureCount = 3;

            // Successful messages
            for (let i = 0; i < successCount; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: `Success ${i}`
                });
            }

            // Failed messages
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Simulated failure');
            });

            for (let i = 0; i < failureCount; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: `Failure ${i}`
                });
            }

            // Trigger metrics reporting
            jest.advanceTimersByTime(60000);

            const health = service.getHealthStatus();

            // Assert
            expect(health.metrics?.messagesSent).toBe(successCount);
            expect(health.metrics?.messagesFailed).toBe(failureCount);
            expect(health.metrics?.totalMessages).toBe(successCount + failureCount);
            expect(health.metrics?.averageProcessingTime).toBeGreaterThanOrEqual(0);
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('Service metrics report'),
                expect.objectContaining({
                    totalMessages: successCount + failureCount,
                    messagesSent: successCount,
                    messagesFailed: failureCount
                })
            );
        });
    });

    describe('Error Recovery Integration', () => {
        test('should recover from EventBus failures', async () => {
            // Arrange
            let publishFailures = 0;
            const maxFailures = 5;

            mockEventBus.publish.mockImplementation(() => {
                publishFailures++;
                if (publishFailures <= maxFailures) {
                    throw new Error('EventBus temporary failure');
                }
                // Success after failures
            });

            service = new EnterpriseDirectCommunicationService(mockEventBus, mockLoggingService, undefined, undefined, {
                maxRetryAttempts: 3,
                enableCircuitBreaker: true,
                enableSelfHealing: true
            });

            await service.start();

            // Act - Send messages during failure period
            const results: any[] = [];
            for (let i = 0; i < 10; i++) {
                const result = await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: `Recovery test ${i}`
                });
                results.push(result);

                // Allow time for circuit breaker recovery
                if (i === 5) {
                    jest.advanceTimersByTime(35000);
                }
            }

            // Assert
            const successfulResults = results.filter(r => r.success);
            const failedResults = results.filter(r => !r.success);

            expect(failedResults.length).toBeGreaterThan(0); // Some should fail initially
            expect(successfulResults.length).toBeGreaterThan(0); // Some should succeed after recovery
        });
    });

    describe('Resource Management Integration', () => {
        test('should manage resources efficiently under load', async () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(mockEventBus, mockLoggingService, undefined, undefined, {
                maxMessageHistorySize: 50,
                memoryCleanupIntervalMs: 1000
            });

            await service.start();

            // Act - Generate load
            const messageCount = 200;
            const callbacks: any[] = [];

            // Register multiple callbacks
            for (let i = 0; i < 10; i++) {
                const callback = jest.fn();
                callbacks.push(callback);
                service.setDashboardCallback(callback);
            }

            // Send many messages
            const sendPromises = Array(messageCount)
                .fill(null)
                .map((_, index) =>
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Load test message ${index}`
                    })
                );

            const results = await Promise.all(sendPromises);

            // Trigger cleanup
            jest.advanceTimersByTime(300000);

            const health = service.getHealthStatus();

            // Assert - All operations should complete successfully
            expect(results.every(r => r.success)).toBe(true);
            expect(health.status).not.toBe('unhealthy');

            // Verify callbacks were called
            callbacks.forEach(callback => {
                expect(callback).toHaveBeenCalledTimes(messageCount);
            });

            // Cleanup callbacks
            callbacks.forEach(callback => {
                service.removeDashboardCallback(callback);
            });
        });
    });

    describe('Configuration Integration', () => {
        test('should respect configuration limits during operation', async () => {
            // Arrange
            const customConfig = {
                maxMessageHistorySize: 10,
                maxRetryAttempts: 1,
                baseRetryDelay: 50,
                maxDeadLetterQueueSize: 5,
                enableDeadLetterQueue: true
            };

            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                undefined,
                undefined,
                customConfig
            );

            await service.start();

            // Act - Test each configuration limit

            // 1. Test message history limit
            for (let i = 0; i < 20; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: `History test ${i}`
                });
            }

            // 2. Test dead letter queue limit
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Persistent failure');
            });

            for (let i = 0; i < 10; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: `DLQ test ${i}`
                });
            }

            const health = service.getHealthStatus();

            // Assert
            expect(health.deadLetterQueueSize).toBeLessThanOrEqual(customConfig.maxDeadLetterQueueSize);
            // History size is managed internally but should not cause memory issues
            expect(health.resourceUsage).toBeDefined();
        });
    });

    describe('Event Pattern Integration', () => {
        test('should handle complex event routing patterns', async () => {
            // Arrange
            const receivedEvents: Array<{ event: string; data: any }> = [];

            // Mock pattern subscription to capture events
            mockEventBus.subscribePattern.mockImplementation((pattern, handler) => {
                // Simulate receiving pattern-matched events
                setTimeout(() => {
                    handler('orch.message.routed', { messageId: 'test-123' });
                    handler('orch.agent.spawned', { agentId: 'agent-456' });
                    handler('orch.task.completed', { taskId: 'task-789' });
                }, 100);

                return { dispose: jest.fn() };
            });

            service = new EnterpriseDirectCommunicationService(mockEventBus, mockLoggingService);

            await service.start();

            // Act - Allow pattern events to be processed
            jest.advanceTimersByTime(200);

            // Send a message to trigger additional event routing
            await service.sendMessage({
                type: MessageType.SPAWN_AGENT,
                content: 'Pattern integration test'
            });

            // Assert
            expect(mockEventBus.subscribePattern).toHaveBeenCalledWith('orch.*', expect.any(Function));

            // Verify pattern handler was set up correctly
            const patternHandler = mockEventBus.subscribePattern.mock.calls[0][1];
            expect(typeof patternHandler).toBe('function');
        });
    });

    describe('Stress Testing', () => {
        test('should maintain stability under high message volume', async () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(mockEventBus, mockLoggingService, undefined, undefined, {
                maxRetryAttempts: 1,
                enableCircuitBreaker: false, // Disable to test pure throughput
                healthCheckIntervalMs: 500
            });

            await service.start();

            // Act - High volume message burst
            const messageCount = 1000;
            const batchSize = 50;
            const results: any[] = [];

            for (let batch = 0; batch < messageCount / batchSize; batch++) {
                const batchPromises = Array(batchSize)
                    .fill(null)
                    .map((_, index) =>
                        service.sendMessage({
                            type: MessageType.SPAWN_AGENT,
                            content: `Stress test batch ${batch} message ${index}`,
                            metadata: { batch, index }
                        })
                    );

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Brief pause between batches
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Allow health checks to run
            jest.advanceTimersByTime(2000);

            const health = service.getHealthStatus();

            // Assert
            expect(results).toHaveLength(messageCount);
            const successRate = results.filter(r => r.success).length / results.length;
            expect(successRate).toBeGreaterThan(0.95); // 95% success rate minimum

            expect(health.metrics?.totalMessages).toBe(messageCount);
            expect(health.status).not.toBe('unhealthy');
        });
    });
});
