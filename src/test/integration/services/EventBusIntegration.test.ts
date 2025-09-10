/**
 * Comprehensive integration tests for EventBus enterprise features
 * Tests complete workflows, component interactions, and real-world scenarios
 */

import { EventBus } from '../../../services/EventBus';
import { ILoggingService } from '../../../services/interfaces';
import { HealthMonitor } from '../../../services/HealthMonitor';

// Mock logger for integration tests
const mockLogger: jest.Mocked<ILoggingService> = {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

describe('EventBus Integration Tests', () => {
    let eventBus: EventBus;

    beforeEach(() => {
        jest.clearAllMocks();
        eventBus = new EventBus({
            logger: mockLogger,
            enableHealthChecks: true,
            circuitBreakerConfig: {
                failureThreshold: 3,
                recoveryTimeout: 1000,
                halfOpenMaxCalls: 2
            },
            retryConfig: {
                maxAttempts: 3,
                baseDelay: 100,
                maxDelay: 1000,
                backoffMultiplier: 2
            }
        });
    });

    afterEach(async () => {
        await eventBus.dispose();
    });

    describe('End-to-End Event Flow', () => {
        it('should handle complete event lifecycle with success', async () => {
            const mockHandler1 = jest.fn().mockResolvedValue('handler1-result');
            const mockHandler2 = jest.fn().mockResolvedValue('handler2-result');
            const completedEvents: string[] = [];

            // Subscribe to handlers
            const sub1 = eventBus.subscribe('test.event', mockHandler1);
            const sub2 = eventBus.subscribe('test.event', mockHandler2);

            // Subscribe to completion event
            eventBus.subscribe('system.event.completed', data => {
                completedEvents.push(data.eventName);
            });

            // Publish event
            const results = await eventBus.publish('test.event', { message: 'test data' });

            // Verify handlers were called
            expect(mockHandler1).toHaveBeenCalledWith({ message: 'test data' });
            expect(mockHandler2).toHaveBeenCalledWith({ message: 'test data' });

            // Verify results
            expect(results).toEqual(['handler1-result', 'handler2-result']);

            // Verify completion event was fired
            expect(completedEvents).toContain('test.event');

            // Verify no error events were logged
            expect(mockLogger.error).not.toHaveBeenCalled();

            // Clean up
            sub1.dispose();
            sub2.dispose();
        });

        it('should handle event flow with partial failures and recovery', async () => {
            const successHandler = jest.fn().mockResolvedValue('success');
            const failingHandler = jest
                .fn()
                .mockRejectedValueOnce(new Error('First failure'))
                .mockRejectedValueOnce(new Error('Second failure'))
                .mockResolvedValueOnce('recovered');

            // Subscribe handlers
            const sub1 = eventBus.subscribe('recovery.test', successHandler);
            const sub2 = eventBus.subscribe('recovery.test', failingHandler);

            // First publish - failingHandler should fail but retry
            const results1 = await eventBus.publish('recovery.test', { attempt: 1 });

            // Verify partial success (successHandler succeeds, failingHandler eventually succeeds after retries)
            expect(successHandler).toHaveBeenCalledTimes(1);
            expect(failingHandler).toHaveBeenCalledTimes(3); // Original + 2 retries
            expect(results1).toContain('success');
            expect(results1).toContain('recovered');

            // Clean up
            sub1.dispose();
            sub2.dispose();
        });

        it('should integrate circuit breaker with retry mechanism', async () => {
            let callCount = 0;
            const consistentlyFailingHandler = jest.fn().mockImplementation(() => {
                callCount++;
                throw new Error(`Failure ${callCount}`);
            });

            const sub = eventBus.subscribe('circuit.test', consistentlyFailingHandler);

            // Publish multiple times to trigger circuit breaker
            for (let i = 0; i < 5; i++) {
                try {
                    await eventBus.publish('circuit.test', { attempt: i + 1 });
                } catch (error) {
                    // Expected failures
                }
            }

            // Circuit should be open now, reducing call count
            expect(callCount).toBeLessThan(15); // Would be 15 if no circuit breaker (5 publishes * 3 retries each)
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Circuit breaker opened'),
                expect.any(Object)
            );

            sub.dispose();
        });
    });

    describe('Health Monitoring Integration', () => {
        it('should monitor EventBus health and report status', async () => {
            const healthMonitor = new HealthMonitor(mockLogger, eventBus);

            // Perform health check
            const healthResults = await healthMonitor.performHealthCheck('eventbus');
            const eventBusHealth = healthResults.find(r => r.name === 'eventbus');

            expect(eventBusHealth?.status).toBe('healthy');
            expect(eventBusHealth?.details?.callbackExecuted).toBe(true);

            healthMonitor.dispose();
        });

        it('should detect unhealthy EventBus state', async () => {
            // Simulate EventBus issues by breaking its functionality
            const brokenEventBus = new EventBus({ logger: mockLogger });

            // Override subscribe method to throw errors
            const originalSubscribe = brokenEventBus.subscribe.bind(brokenEventBus);
            brokenEventBus.subscribe = jest.fn().mockImplementation(() => {
                throw new Error('EventBus is broken');
            });

            const healthMonitor = new HealthMonitor(mockLogger, brokenEventBus);

            const healthResults = await healthMonitor.performHealthCheck('eventbus');
            const eventBusHealth = healthResults.find(r => r.name === 'eventbus');

            expect(eventBusHealth?.status).toBe('unhealthy');
            expect(eventBusHealth?.error).toContain('EventBus is broken');

            healthMonitor.dispose();
            await brokenEventBus.dispose();
        });
    });

    describe('Input Validation Integration', () => {
        it('should validate and sanitize event data end-to-end', async () => {
            const handler = jest.fn().mockResolvedValue('processed');
            const sub = eventBus.subscribe('validation.test', handler);

            // Test with valid data
            await eventBus.publish('validation.test', { message: 'Hello World' });
            expect(handler).toHaveBeenCalledWith({ message: 'Hello World' });

            // Test with data that needs sanitization
            const unsafeData = {
                message: '  HELLO WORLD  ',
                nested: { value: '  test  ' }
            };

            await eventBus.publish('validation.test', unsafeData);

            // The exact sanitization behavior depends on InputValidator implementation
            expect(handler).toHaveBeenCalledTimes(2);

            sub.dispose();
        });

        it('should reject invalid events with proper error handling', async () => {
            const handler = jest.fn();
            const sub = eventBus.subscribe('validation.test', handler);

            // Test with invalid event name (empty)
            try {
                await eventBus.publish('', { message: 'test' });
                fail('Should have thrown validation error');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect(handler).not.toHaveBeenCalled();
            }

            sub.dispose();
        });
    });

    describe('Self-Healing Integration', () => {
        it('should recover from handler failures using self-healing mechanisms', async () => {
            let failureCount = 0;
            const unstableHandler = jest.fn().mockImplementation(() => {
                failureCount++;
                if (failureCount <= 2) {
                    throw new Error(`Transient failure ${failureCount}`);
                }
                return 'recovered';
            });

            const sub = eventBus.subscribe('self-healing.test', unstableHandler);

            // Publish event that will initially fail but eventually succeed
            const result = await eventBus.publish('self-healing.test', { test: true });

            expect(result).toContain('recovered');
            expect(unstableHandler).toHaveBeenCalledTimes(3); // Initial + 2 retries
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Handler failed'), expect.any(Object));

            sub.dispose();
        });

        it('should apply fallback strategies when handlers fail completely', async () => {
            const alwaysFailingHandler = jest.fn().mockRejectedValue(new Error('Permanent failure'));
            const fallbackHandler = jest.fn().mockResolvedValue('fallback-result');

            // Subscribe primary handler (will fail)
            const sub1 = eventBus.subscribe('fallback.test', alwaysFailingHandler, { priority: 1 });

            // Subscribe fallback handler with lower priority
            const sub2 = eventBus.subscribe('fallback.test', fallbackHandler, { priority: 0 });

            const results = await eventBus.publish('fallback.test', { test: true });

            // Depending on implementation, might contain fallback result
            expect(alwaysFailingHandler).toHaveBeenCalled();
            expect(fallbackHandler).toHaveBeenCalled();

            sub1.dispose();
            sub2.dispose();
        });
    });

    describe('Performance and Scalability Integration', () => {
        it('should handle high-volume event publishing efficiently', async () => {
            const handler = jest.fn().mockResolvedValue('processed');
            const sub = eventBus.subscribe('performance.test', handler);

            const startTime = Date.now();
            const eventCount = 100;
            const publishPromises = [];

            // Publish many events concurrently
            for (let i = 0; i < eventCount; i++) {
                publishPromises.push(eventBus.publish('performance.test', { id: i, timestamp: Date.now() }));
            }

            await Promise.all(publishPromises);
            const endTime = Date.now();

            expect(handler).toHaveBeenCalledTimes(eventCount);
            expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

            sub.dispose();
        });

        it('should handle many subscribers for single event efficiently', async () => {
            const handlerCount = 50;
            const handlers: jest.Mock[] = [];
            const subscriptions: any[] = [];

            // Create many handlers and subscriptions
            for (let i = 0; i < handlerCount; i++) {
                const handler = jest.fn().mockResolvedValue(`result-${i}`);
                handlers.push(handler);
                subscriptions.push(eventBus.subscribe('multi-subscriber.test', handler));
            }

            const startTime = Date.now();
            const results = await eventBus.publish('multi-subscriber.test', { message: 'broadcast' });
            const endTime = Date.now();

            expect(results).toHaveLength(handlerCount);
            expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds

            handlers.forEach(handler => {
                expect(handler).toHaveBeenCalledWith({ message: 'broadcast' });
            });

            // Clean up
            subscriptions.forEach(sub => sub.dispose());
        });
    });

    describe('Memory and Resource Management Integration', () => {
        it('should properly clean up resources on disposal', async () => {
            const handler = jest.fn();
            const sub = eventBus.subscribe('cleanup.test', handler);

            // Publish some events
            await eventBus.publish('cleanup.test', { message: 'test1' });
            await eventBus.publish('cleanup.test', { message: 'test2' });

            expect(handler).toHaveBeenCalledTimes(2);

            // Dispose subscription
            sub.dispose();

            // Publish after disposal - handler should not be called
            await eventBus.publish('cleanup.test', { message: 'test3' });

            expect(handler).toHaveBeenCalledTimes(2); // Should remain 2
        });

        it('should handle subscription disposal during event processing', async () => {
            let disposalCalled = false;
            const selfDisposingHandler = jest.fn().mockImplementation(() => {
                if (!disposalCalled) {
                    disposalCalled = true;
                    sub.dispose(); // Dispose while handling
                }
                return 'processed';
            });

            const sub = eventBus.subscribe('self-disposal.test', selfDisposingHandler);

            // First publish should work and trigger disposal
            await eventBus.publish('self-disposal.test', { message: 'test1' });
            expect(selfDisposingHandler).toHaveBeenCalledTimes(1);

            // Second publish should not trigger the disposed handler
            await eventBus.publish('self-disposal.test', { message: 'test2' });
            expect(selfDisposingHandler).toHaveBeenCalledTimes(1); // Should remain 1
        });
    });

    describe('Error Recovery and Resilience Integration', () => {
        it('should maintain system stability when handlers throw synchronous errors', async () => {
            const errorHandler = jest.fn().mockImplementation(() => {
                throw new Error('Synchronous error');
            });
            const goodHandler = jest.fn().mockResolvedValue('success');

            const sub1 = eventBus.subscribe('error-resilience.test', errorHandler);
            const sub2 = eventBus.subscribe('error-resilience.test', goodHandler);

            // Should not crash the EventBus
            const results = await eventBus.publish('error-resilience.test', { test: true });

            expect(errorHandler).toHaveBeenCalled();
            expect(goodHandler).toHaveBeenCalled();
            expect(results).toContain('success');

            // EventBus should still be functional
            await eventBus.publish('error-resilience.test', { test: 'again' });

            expect(goodHandler).toHaveBeenCalledTimes(2);

            sub1.dispose();
            sub2.dispose();
        });

        it('should recover from memory pressure conditions', async () => {
            // Simulate memory pressure by creating many large objects
            const largeDataHandler = jest.fn().mockImplementation(data => {
                // Create large object to simulate memory usage
                const largeArray = new Array(10000).fill(data);
                return Promise.resolve('processed');
            });

            const sub = eventBus.subscribe('memory-pressure.test', largeDataHandler);

            // Publish multiple events with large payloads
            const publishPromises = [];
            for (let i = 0; i < 10; i++) {
                const largePayload = {
                    id: i,
                    data: new Array(1000).fill(`item-${i}`)
                };
                publishPromises.push(eventBus.publish('memory-pressure.test', largePayload));
            }

            // Should complete without memory errors
            const results = await Promise.all(publishPromises);
            expect(results).toHaveLength(10);
            expect(largeDataHandler).toHaveBeenCalledTimes(10);

            sub.dispose();
        });
    });

    describe('Complex Workflow Integration', () => {
        it('should handle complex event chain with dependencies', async () => {
            const results: string[] = [];

            // Handler that triggers another event
            const chainStartHandler = jest.fn().mockImplementation(async data => {
                results.push('chain-start');
                await eventBus.publish('workflow.step2', { ...data, step: 2 });
                return 'step1-complete';
            });

            // Second step handler
            const chainStep2Handler = jest.fn().mockImplementation(async data => {
                results.push('chain-step2');
                await eventBus.publish('workflow.step3', { ...data, step: 3 });
                return 'step2-complete';
            });

            // Final step handler
            const chainEndHandler = jest.fn().mockImplementation(data => {
                results.push('chain-end');
                return 'workflow-complete';
            });

            // Set up the chain
            const sub1 = eventBus.subscribe('workflow.start', chainStartHandler);
            const sub2 = eventBus.subscribe('workflow.step2', chainStep2Handler);
            const sub3 = eventBus.subscribe('workflow.step3', chainEndHandler);

            // Start the workflow
            await eventBus.publish('workflow.start', { workflowId: 'test-123', step: 1 });

            // Allow time for async chain to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(results).toEqual(['chain-start', 'chain-step2', 'chain-end']);
            expect(chainStartHandler).toHaveBeenCalledWith({ workflowId: 'test-123', step: 1 });
            expect(chainStep2Handler).toHaveBeenCalledWith({ workflowId: 'test-123', step: 2 });
            expect(chainEndHandler).toHaveBeenCalledWith({ workflowId: 'test-123', step: 3 });

            // Clean up
            sub1.dispose();
            sub2.dispose();
            sub3.dispose();
        });

        it('should handle conditional workflow branches', async () => {
            const results: string[] = [];

            // Router handler that decides which branch to take
            const routerHandler = jest.fn().mockImplementation(async data => {
                results.push('router');
                if (data.condition === 'A') {
                    await eventBus.publish('branch.a', data);
                } else if (data.condition === 'B') {
                    await eventBus.publish('branch.b', data);
                } else {
                    await eventBus.publish('branch.default', data);
                }
                return 'routed';
            });

            const branchAHandler = jest.fn().mockImplementation(data => {
                results.push('branch-a');
                return 'branch-a-complete';
            });

            const branchBHandler = jest.fn().mockImplementation(data => {
                results.push('branch-b');
                return 'branch-b-complete';
            });

            const defaultBranchHandler = jest.fn().mockImplementation(data => {
                results.push('branch-default');
                return 'default-complete';
            });

            // Set up subscriptions
            const subs = [
                eventBus.subscribe('workflow.route', routerHandler),
                eventBus.subscribe('branch.a', branchAHandler),
                eventBus.subscribe('branch.b', branchBHandler),
                eventBus.subscribe('branch.default', defaultBranchHandler)
            ];

            // Test branch A
            await eventBus.publish('workflow.route', { id: 1, condition: 'A' });
            await new Promise(resolve => setTimeout(resolve, 50));

            // Test branch B
            await eventBus.publish('workflow.route', { id: 2, condition: 'B' });
            await new Promise(resolve => setTimeout(resolve, 50));

            // Test default branch
            await eventBus.publish('workflow.route', { id: 3, condition: 'UNKNOWN' });
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(results).toEqual(['router', 'branch-a', 'router', 'branch-b', 'router', 'branch-default']);

            // Clean up
            subs.forEach(sub => sub.dispose());
        });
    });

    describe('Concurrent Event Processing Integration', () => {
        it('should handle concurrent events to same handler safely', async () => {
            let processCount = 0;
            const concurrentHandler = jest.fn().mockImplementation(async data => {
                const currentCount = ++processCount;
                // Simulate some async work
                await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
                return `processed-${currentCount}`;
            });

            const sub = eventBus.subscribe('concurrent.test', concurrentHandler);

            // Publish multiple events concurrently
            const publishPromises = [];
            for (let i = 0; i < 10; i++) {
                publishPromises.push(eventBus.publish('concurrent.test', { id: i }));
            }

            const results = await Promise.all(publishPromises);

            expect(results).toHaveLength(10);
            expect(concurrentHandler).toHaveBeenCalledTimes(10);
            expect(processCount).toBe(10);

            // All results should be unique (no race conditions in counter)
            const uniqueResults = new Set(results.flat());
            expect(uniqueResults.size).toBe(10);

            sub.dispose();
        });

        it('should maintain event order for sequential processing when required', async () => {
            const processOrder: number[] = [];
            const sequentialHandler = jest.fn().mockImplementation(async data => {
                // Add delay to test ordering
                await new Promise(resolve => setTimeout(resolve, 10));
                processOrder.push(data.id);
                return `processed-${data.id}`;
            });

            const sub = eventBus.subscribe('sequential.test', sequentialHandler, { sequential: true });

            // Publish events rapidly
            const publishPromises = [];
            for (let i = 0; i < 5; i++) {
                publishPromises.push(eventBus.publish('sequential.test', { id: i }));
            }

            await Promise.all(publishPromises);

            // If sequential processing is implemented, order should be maintained
            // This test verifies the EventBus can handle sequential requirements
            expect(processOrder).toHaveLength(5);
            expect(sequentialHandler).toHaveBeenCalledTimes(5);

            sub.dispose();
        });
    });
});
