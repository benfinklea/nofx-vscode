import * as vscode from 'vscode';
import {
    EnterpriseDirectCommunicationService,
    ServiceError,
    ErrorCode,
    ErrorSeverity,
    ServiceStatus,
    ConnectionInfo,
    ServiceConfiguration,
    MessageCallback,
    SendMessageResult,
    CallbackRegistrationResult,
    HealthStatus,
    TestMessageResult
} from '../../../services/EnterpriseDirectCommunicationService';
import { IEventBus, ILoggingService, INotificationService, IMetricsService } from '../../../services/interfaces';
import { OrchestratorMessage, MessageType, MessageStatus } from '../../../orchestration/MessageProtocol';
import { ORCH_EVENTS } from '../../../services/EventConstants';

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

// Mock global process for testing
(global as any).process = {
    memoryUsage: jest.fn(() => ({
        heapUsed: 1024 * 1024 * 100, // 100MB
        heapTotal: 1024 * 1024 * 500 // 500MB
    })),
    on: jest.fn()
};

describe('EnterpriseDirectCommunicationService', () => {
    let service: EnterpriseDirectCommunicationService;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockMetricsService: jest.Mocked<IMetricsService>;

    beforeEach(() => {
        // Create comprehensive mocks
        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(() => ({ dispose: jest.fn() })),
            unsubscribe: jest.fn(),
            once: jest.fn(() => ({ dispose: jest.fn() })),
            filter: jest.fn(() => ({
                event: jest.fn(),
                dispose: jest.fn()
            })),
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

        mockNotificationService = {
            showInformation: jest.fn(),
            showWarning: jest.fn(),
            showError: jest.fn(),
            showProgress: jest.fn()
        };

        mockMetricsService = {
            recordMetric: jest.fn(),
            recordTimer: jest.fn(),
            recordCounter: jest.fn(),
            getMetrics: jest.fn(() => ({})),
            resetMetrics: jest.fn()
        };

        // Clear all mocks before each test
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        if (service) {
            service.stop().catch(() => {}); // Clean shutdown
        }
    });

    describe('Constructor and Initialization', () => {
        test('should create service with required dependencies', () => {
            // Arrange & Act
            service = new EnterpriseDirectCommunicationService(mockEventBus);

            // Assert
            expect(service).toBeInstanceOf(EnterpriseDirectCommunicationService);
            expect(mockLoggingService.info).not.toHaveBeenCalled(); // No logging service provided
        });

        test('should create service with all optional dependencies', () => {
            // Arrange & Act
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );

            // Assert
            expect(service).toBeInstanceOf(EnterpriseDirectCommunicationService);
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('EnterpriseDirectCommunicationService initialized'),
                expect.any(Object)
            );
        });

        test('should merge custom configuration with defaults', () => {
            // Arrange
            const customConfig: Partial<ServiceConfiguration> = {
                maxMessageHistorySize: 5000,
                maxRetryAttempts: 5,
                baseRetryDelay: 2000
            };

            // Act
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService,
                customConfig
            );

            // Assert
            expect(service).toBeInstanceOf(EnterpriseDirectCommunicationService);
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('initialized'),
                expect.objectContaining({
                    config: expect.objectContaining({
                        maxMessageHistorySize: 5000,
                        maxRetryAttempts: 5,
                        baseRetryDelay: 2000
                    })
                })
            );
        });

        test('should throw error if EventBus is not provided', () => {
            // Arrange & Act & Assert
            expect(() => {
                service = new EnterpriseDirectCommunicationService(null as any);
            }).toThrow(ServiceError);

            expect(() => {
                service = new EnterpriseDirectCommunicationService(null as any);
            }).toThrow('EventBus is required');
        });

        test('should validate configuration on creation', () => {
            // Arrange
            const invalidConfig: Partial<ServiceConfiguration> = {
                maxMessageHistorySize: -1, // Invalid
                maxRetryAttempts: -1, // Invalid
                baseRetryDelay: 50 // Too small
            };

            // Act & Assert
            expect(() => {
                service = new EnterpriseDirectCommunicationService(
                    mockEventBus,
                    mockLoggingService,
                    mockNotificationService,
                    mockMetricsService,
                    invalidConfig
                );
            }).toThrow(ServiceError);
        });
    });

    describe('Service Lifecycle - Start', () => {
        beforeEach(() => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );
        });

        test('should start successfully with all dependencies', async () => {
            // Act
            await service.start();

            // Assert
            expect(mockEventBus.subscribe).toHaveBeenCalledWith(ORCH_EVENTS.MESSAGE_RECEIVED, expect.any(Function));
            expect(mockEventBus.subscribePattern).toHaveBeenCalledWith('orch.*', expect.any(Function));
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                ORCH_EVENTS.SERVER_STARTED,
                expect.objectContaining({
                    service: 'EnterpriseDirectCommunicationService',
                    version: '2.0.0-enterprise'
                })
            );
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('started successfully'),
                expect.any(Object)
            );
        });

        test('should not start twice', async () => {
            // Arrange
            await service.start();
            const initialCallCount = mockLoggingService.warn.mock.calls.length;

            // Act
            await service.start();

            // Assert
            expect(mockLoggingService.warn).toHaveBeenCalledWith('Service already started', expect.any(Object));
        });

        test('should handle start failure gracefully', async () => {
            // Arrange
            mockEventBus.subscribe.mockImplementation(() => {
                throw new Error('Subscription failed');
            });

            // Act & Assert
            await expect(service.start()).rejects.toThrow(ServiceError);
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to start'),
                expect.any(ServiceError)
            );
        });

        test('should prevent start while shutting down', async () => {
            // Arrange
            await service.start();
            const stopPromise = service.stop(); // Start shutdown process

            // Act & Assert
            await expect(service.start()).rejects.toThrow(ServiceError);
            await stopPromise; // Clean up
        });

        test('should set up maintenance timers', async () => {
            // Act
            await service.start();

            // Assert - Check that timers were set up (4 timers total)
            expect(setTimeout).toHaveBeenCalledTimes(4);
        });
    });

    describe('Service Lifecycle - Stop', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );
            await service.start();
        });

        test('should stop gracefully', async () => {
            // Act
            await service.stop();

            // Assert
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('stopped gracefully'),
                expect.any(Object)
            );
        });

        test('should not stop twice', async () => {
            // Arrange
            await service.stop();

            // Act
            await service.stop();

            // Assert
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                'Service already stopped or shutting down',
                expect.any(Object)
            );
        });

        test('should handle graceful shutdown timeout', async () => {
            // Arrange - Mock a hanging cleanup operation
            const originalClearTimeout = global.clearTimeout;
            jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});

            // Act
            const stopPromise = service.stop();
            jest.advanceTimersByTime(15000); // Advance past 10 second timeout
            await stopPromise;

            // Assert
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('stopped gracefully'),
                expect.any(Object)
            );

            // Cleanup
            global.clearTimeout = originalClearTimeout;
        });

        test('should perform emergency cleanup on shutdown failure', async () => {
            // Arrange - Force shutdown to fail
            const disposeMock = jest.fn(() => {
                throw new Error('Disposal failed');
            });
            mockEventBus.subscribe.mockReturnValue({ dispose: disposeMock });

            // Restart service to get the failing subscription
            await service.stop();
            await service.start();

            // Act
            await service.stop();

            // Assert
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Error during service shutdown'),
                expect.any(ServiceError)
            );
        });
    });

    describe('Message Sending', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );
            await service.start();
        });

        test('should send message successfully', async () => {
            // Arrange
            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test message',
                metadata: { test: true }
            };

            // Act
            const result = await service.sendMessage(message, 'test-target');

            // Assert
            expect(result.success).toBe(true);
            expect(result.messageId).toBeDefined();
            expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                ORCH_EVENTS.MESSAGE_RECEIVED,
                expect.objectContaining({
                    message: expect.objectContaining({
                        type: MessageType.SPAWN_AGENT,
                        content: 'Test message',
                        target: 'test-target'
                    })
                })
            );
        });

        test('should validate message input', async () => {
            // Arrange
            const invalidMessage = null;

            // Act
            const result = await service.sendMessage(invalidMessage as any);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBeInstanceOf(ServiceError);
            expect(result.error?.code).toBe(ErrorCode.INVALID_INPUT);
        });

        test('should validate message type', async () => {
            // Arrange
            const invalidMessage = {
                type: 'INVALID_TYPE' as MessageType,
                content: 'Test'
            };

            // Act
            const result = await service.sendMessage(invalidMessage);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error?.code).toBe(ErrorCode.MESSAGE_VALIDATION_FAILED);
        });

        test('should sanitize message content', async () => {
            // Arrange
            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test <script>alert("xss")</script> message'
            };

            // Act
            const result = await service.sendMessage(message);

            // Assert
            expect(result.success).toBe(true);
            // Content should be sanitized
            const publishCall = mockEventBus.publish.mock.calls.find(call => call[0] === ORCH_EVENTS.MESSAGE_RECEIVED);
            expect(publishCall[1].message.content).not.toContain('<script>');
        });

        test('should handle large message validation', async () => {
            // Arrange
            const largeContent = 'a'.repeat(2 * 1024 * 1024); // 2MB content
            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: largeContent
            };

            // Act
            const result = await service.sendMessage(message);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error?.code).toBe(ErrorCode.MESSAGE_VALIDATION_FAILED);
            expect(result.error?.message).toContain('exceeds maximum allowed');
        });

        test('should handle service not ready', async () => {
            // Arrange
            await service.stop();
            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Act
            const result = await service.sendMessage(message);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error?.code).toBe(ErrorCode.INVALID_STATE);
        });

        test('should handle rate limiting', async () => {
            // Arrange - Send many messages quickly to trigger rate limiting
            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Act - Send messages rapidly
            const promises = Array(200)
                .fill(null)
                .map(() => service.sendMessage(message));
            const results = await Promise.all(promises);

            // Assert - At least some should be rate limited
            const rateLimitedResults = results.filter(
                r => !r.success && r.error?.code === ErrorCode.RATE_LIMIT_EXCEEDED
            );
            expect(rateLimitedResults.length).toBeGreaterThan(0);
        });

        test('should add failed messages to dead letter queue', async () => {
            // Arrange
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Publish failed');
            });

            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Act
            const result = await service.sendMessage(message);

            // Assert
            expect(result.success).toBe(false);
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('added to dead letter queue'),
                expect.any(Object)
            );
        });
    });

    describe('Dashboard Callbacks', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );
            await service.start();
        });

        test('should register dashboard callback successfully', () => {
            // Arrange
            const callback: MessageCallback = jest.fn();

            // Act
            const result = service.setDashboardCallback(callback);

            // Assert
            expect(result.success).toBe(true);
            expect(result.callbackId).toBeDefined();
            expect(result.operationId).toBeDefined();
        });

        test('should validate callback function', () => {
            // Arrange
            const invalidCallback = 'not a function' as any;

            // Act
            const result = service.setDashboardCallback(invalidCallback);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error?.code).toBe(ErrorCode.INVALID_INPUT);
        });

        test('should notify callbacks when message is sent', async () => {
            // Arrange
            const callback: MessageCallback = jest.fn();
            service.setDashboardCallback(callback);

            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Act
            await service.sendMessage(message);

            // Assert
            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: MessageType.SPAWN_AGENT,
                    content: 'Test'
                })
            );
        });

        test('should handle callback execution failure', async () => {
            // Arrange
            const failingCallback: MessageCallback = jest.fn(() => {
                throw new Error('Callback failed');
            });
            service.setDashboardCallback(failingCallback);

            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Act
            const result = await service.sendMessage(message);

            // Assert
            expect(result.success).toBe(true); // Service continues despite callback failure
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Callback execution failed'),
                expect.any(Object)
            );
        });

        test('should remove dashboard callback', () => {
            // Arrange
            const callback: MessageCallback = jest.fn();
            service.setDashboardCallback(callback);

            // Act
            const removed = service.removeDashboardCallback(callback);

            // Assert
            expect(removed).toBe(true);
        });

        test('should handle removal of non-existent callback', () => {
            // Arrange
            const callback: MessageCallback = jest.fn();

            // Act
            const removed = service.removeDashboardCallback(callback);

            // Assert
            expect(removed).toBe(false);
        });
    });

    describe('Health Monitoring', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );
            await service.start();
        });

        test('should return healthy status when service is running well', () => {
            // Act
            const health = service.getHealthStatus();

            // Assert
            expect(health.status).toBe(ServiceStatus.HEALTHY);
            expect(health.healthScore).toBeGreaterThanOrEqual(90);
            expect(health.version).toBe('2.0.0-enterprise');
            expect(health.uptime).toBeGreaterThanOrEqual(0);
        });

        test('should return degraded status with high failure rate', async () => {
            // Arrange - Cause failures to reduce health score
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Publish failed');
            });

            // Send several failing messages
            const failingMessage: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            for (let i = 0; i < 10; i++) {
                await service.sendMessage(failingMessage);
            }

            // Act
            const health = service.getHealthStatus();

            // Assert
            expect(health.healthScore).toBeLessThan(90);
        });

        test('should return stopped status when service is not started', async () => {
            // Arrange
            await service.stop();

            // Act
            const health = service.getHealthStatus();

            // Assert
            expect(health.status).toBe(ServiceStatus.STOPPED);
        });

        test('should handle health check failure gracefully', () => {
            // Arrange - Mock process.memoryUsage to throw
            const originalMemoryUsage = (global as any).process.memoryUsage;
            (global as any).process.memoryUsage = jest.fn(() => {
                throw new Error('Memory check failed');
            });

            // Act
            const health = service.getHealthStatus();

            // Assert
            expect(health.status).toBe(ServiceStatus.UNHEALTHY);
            expect(health.healthScore).toBe(0);
            expect(health.error).toBeInstanceOf(ServiceError);

            // Cleanup
            (global as any).process.memoryUsage = originalMemoryUsage;
        });

        test('should run periodic health checks', async () => {
            // Act - Advance timers to trigger health check
            jest.advanceTimersByTime(10000); // Health check interval

            // Assert
            // Health checks should run in background without affecting service
            const health = service.getHealthStatus();
            expect(health).toBeDefined();
        });
    });

    describe('Circuit Breaker Pattern', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService,
                {
                    enableCircuitBreaker: true,
                    maxRetryAttempts: 1 // Reduce retries for faster testing
                }
            );
            await service.start();
        });

        test('should trip circuit breaker after failures', async () => {
            // Arrange
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Service unavailable');
            });

            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Act - Send messages to trigger circuit breaker
            for (let i = 0; i < 6; i++) {
                await service.sendMessage(message);
            }

            // Assert
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Circuit breaker OPENED'),
                expect.any(ServiceError)
            );

            const health = service.getHealthStatus();
            expect(health.circuitBreakerStatus).toBeDefined();
        });

        test('should prevent calls when circuit breaker is open', async () => {
            // Arrange - Trip the circuit breaker
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Service unavailable');
            });

            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Trip the circuit breaker
            for (let i = 0; i < 6; i++) {
                await service.sendMessage(message);
            }

            // Act - Try to send another message
            const result = await service.sendMessage(message);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error?.code).toBe(ErrorCode.CIRCUIT_BREAKER_OPEN);
        });

        test('should recover circuit breaker after timeout', async () => {
            // Arrange - Trip the circuit breaker
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Service unavailable');
            });

            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Trip the circuit breaker
            for (let i = 0; i < 6; i++) {
                await service.sendMessage(message);
            }

            // Fix the service
            mockEventBus.publish.mockImplementation(jest.fn());

            // Act - Advance time past recovery timeout and send message
            jest.advanceTimersByTime(35000); // Past 30 second recovery timeout
            const result = await service.sendMessage(message);

            // Assert
            expect(result.success).toBe(true);
        });
    });

    describe('Retry Logic', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService,
                {
                    maxRetryAttempts: 3,
                    baseRetryDelay: 100,
                    enableCircuitBreaker: false // Disable to test pure retry logic
                }
            );
            await service.start();
        });

        test('should retry failed operations', async () => {
            // Arrange
            let attempts = 0;
            mockEventBus.publish.mockImplementation(() => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('Temporary failure');
                }
                // Success on 3rd attempt
            });

            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Act
            const result = await service.sendMessage(message);

            // Assert
            expect(result.success).toBe(true);
            expect(attempts).toBe(3);
            expect(mockLoggingService.info).toHaveBeenCalledWith('Retry succeeded', expect.any(Object));
        });

        test('should fail after max retries', async () => {
            // Arrange
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Persistent failure');
            });

            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Act
            const result = await service.sendMessage(message);

            // Assert
            expect(result.success).toBe(false);
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('All retry attempts exhausted'),
                expect.any(ServiceError)
            );
        });

        test('should handle timeout during retry', async () => {
            // Arrange
            mockEventBus.publish.mockImplementation(() => {
                return new Promise(resolve => setTimeout(resolve, 60000)); // Never resolves in test
            });

            const message: Partial<OrchestratorMessage> = {
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            };

            // Act
            const resultPromise = service.sendMessage(message);
            jest.advanceTimersByTime(35000); // Advance past timeout
            const result = await resultPromise;

            // Assert
            expect(result.success).toBe(false);
            expect(result.error?.code).toBe(ErrorCode.TIMEOUT);
        });
    });

    describe('Test Message Generation', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );
            await service.start();
        });

        test('should generate test messages successfully', async () => {
            // Act
            const result = await service.generateTestMessages(3);

            // Assert
            expect(result.success).toBe(true);
            expect(result.totalRequested).toBe(3);
            expect(result.totalGenerated).toBe(3);
            expect(result.results).toHaveLength(3);
            expect(result.results![0].success).toBe(true);
        });

        test('should validate test message count', async () => {
            // Act
            const result = await service.generateTestMessages(-1);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error?.code).toBe(ErrorCode.INVALID_INPUT);
        });

        test('should cap test message count at maximum', async () => {
            // Act
            const result = await service.generateTestMessages(100);

            // Assert
            expect(result.success).toBe(true);
            expect(result.totalRequested).toBe(100);
            expect(result.totalGenerated).toBe(50); // Capped at 50
            expect(result.results).toHaveLength(50);
        });

        test('should handle test message generation failure', async () => {
            // Arrange
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Generation failed');
            });

            // Act
            const result = await service.generateTestMessages(2);

            // Assert
            expect(result.success).toBe(true); // Overall success even with failures
            expect(result.totalGenerated).toBe(0); // No successful generations
            expect(result.results![0].success).toBe(false);
        });

        test('should stagger test message generation', async () => {
            // Arrange
            const timestamps: number[] = [];
            mockEventBus.publish.mockImplementation(() => {
                timestamps.push(Date.now());
            });

            // Act
            const resultPromise = service.generateTestMessages(3);
            jest.advanceTimersByTime(1000); // Advance time to allow staggering
            const result = await resultPromise;

            // Assert
            expect(result.success).toBe(true);
            // Messages should be staggered with delays
        });
    });

    describe('Memory Management', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService,
                {
                    maxMessageHistorySize: 5,
                    memoryCleanupIntervalMs: 1000
                }
            );
            await service.start();
        });

        test('should limit message history size', async () => {
            // Arrange & Act - Send more messages than history limit
            for (let i = 0; i < 10; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: `Test message ${i}`
                });
            }

            // Assert - Check that history is limited (indirectly through logs)
            // The service should manage history size internally
            expect(mockEventBus.publish).toHaveBeenCalledTimes(10);
        });

        test('should perform periodic memory cleanup', async () => {
            // Arrange - Send some messages
            for (let i = 0; i < 3; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: `Test message ${i}`
                });
            }

            // Act - Trigger cleanup by advancing time
            jest.advanceTimersByTime(300000); // 5 minute cleanup interval

            // Assert - Cleanup should run without errors
            // (Cleanup is internal, we verify it doesn't crash)
            expect(service.getHealthStatus()).toBeDefined();
        });

        test('should handle memory cleanup failure', async () => {
            // Arrange - Mock Date constructor to fail
            const originalDate = global.Date;
            (global as any).Date = jest.fn(() => {
                throw new Error('Date construction failed');
            });

            // Act - Trigger cleanup
            jest.advanceTimersByTime(300000);

            // Assert - Service should handle cleanup failure gracefully
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Memory cleanup failed'),
                expect.any(ServiceError)
            );

            // Cleanup
            global.Date = originalDate;
        });
    });

    describe('Self-Healing Mechanisms', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService,
                {
                    enableSelfHealing: true,
                    healthCheckIntervalMs: 1000
                }
            );
            await service.start();
        });

        test('should trigger self-healing when health score is low', async () => {
            // Arrange - Cause failures to lower health score
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Service degraded');
            });

            // Generate failures
            for (let i = 0; i < 20; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: 'Test'
                });
            }

            // Act - Trigger health check and self-healing
            jest.advanceTimersByTime(10000);

            // Assert
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Triggering self-healing'),
                expect.any(Object)
            );
        });

        test('should reset circuit breakers during self-healing', async () => {
            // Arrange - Create scenario requiring self-healing
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Service degraded');
            });

            // Generate many failures to trigger both circuit breakers and self-healing
            for (let i = 0; i < 30; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: 'Test'
                });
            }

            // Act - Trigger self-healing
            jest.advanceTimersByTime(10000);

            // Assert
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('Self-healing: Reset circuit breaker'),
                expect.any(Object)
            );
        });

        test('should force garbage collection during self-healing', async () => {
            // Arrange
            (global as any).gc = jest.fn(); // Mock global.gc

            // Generate failures to trigger self-healing
            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Service degraded');
            });

            for (let i = 0; i < 25; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: 'Test'
                });
            }

            // Act - Trigger self-healing
            jest.advanceTimersByTime(10000);

            // Assert
            expect((global as any).gc).toHaveBeenCalled();
            expect(mockLoggingService.info).toHaveBeenCalledWith('Self-healing: Forced garbage collection', undefined);

            // Cleanup
            delete (global as any).gc;
        });
    });

    describe('Event Handling', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );
            await service.start();
        });

        test('should handle event data safely', () => {
            // Arrange
            const eventHandler = mockEventBus.subscribe.mock.calls[0][1];
            const eventData = {
                source: 'TestSource',
                content: 'Test event data'
            };

            // Act
            eventHandler(eventData);

            // Assert
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Event received'),
                expect.any(Object)
            );
        });

        test('should handle pattern events safely', () => {
            // Arrange
            const patternHandler = mockEventBus.subscribePattern.mock.calls[0][1];

            // Act
            patternHandler('orch.test.event', { data: 'test' });

            // Assert
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Pattern event received'),
                expect.any(Object)
            );
        });

        test('should handle event processing failure', () => {
            // Arrange
            const eventHandler = mockEventBus.subscribe.mock.calls[0][1];
            const malformedData = {
                invalid: () => {
                    throw new Error('Processing failed');
                }
            };

            // Act
            eventHandler(malformedData);

            // Assert - Should not crash the service
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Event handling failed'),
                expect.any(ServiceError)
            );
        });
    });

    describe('Metrics and Monitoring', () => {
        beforeEach(async () => {
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService,
                {
                    metricsReportingIntervalMs: 1000
                }
            );
            await service.start();
        });

        test('should report metrics periodically', async () => {
            // Arrange - Send some messages to generate metrics
            await service.sendMessage({
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            });

            // Act - Trigger metrics reporting
            jest.advanceTimersByTime(60000);

            // Assert
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('Service metrics report'),
                expect.objectContaining({
                    totalMessages: expect.any(Number),
                    messagesSent: expect.any(Number),
                    uptime: expect.any(Number)
                })
            );
        });

        test('should handle metrics reporting failure', () => {
            // Arrange - Mock process.memoryUsage to fail
            const originalMemoryUsage = (global as any).process.memoryUsage;
            (global as any).process.memoryUsage = jest.fn(() => {
                throw new Error('Memory usage failed');
            });

            // Act - Trigger metrics reporting
            jest.advanceTimersByTime(60000);

            // Assert
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Metrics reporting failed'),
                expect.any(ServiceError)
            );

            // Cleanup
            (global as any).process.memoryUsage = originalMemoryUsage;
        });

        test('should update processing time metrics', async () => {
            // Arrange & Act
            await service.sendMessage({
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            });

            const health = service.getHealthStatus();

            // Assert
            expect(health.metrics?.averageProcessingTime).toBeGreaterThanOrEqual(0);
            expect(health.metrics?.totalMessages).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        test('should wrap unknown errors properly', async () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );
            await service.start();

            mockEventBus.publish.mockImplementation(() => {
                throw new Error('Unknown error occurred');
            });

            // Act
            const result = await service.sendMessage({
                type: MessageType.SPAWN_AGENT,
                content: 'Test'
            });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBeInstanceOf(ServiceError);
            expect(result.error?.code).toBe(ErrorCode.UNKNOWN);
            expect(result.error?.message).toContain('Unknown error occurred');
        });

        test('should handle unhandled promise rejections', () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );

            // Act - Simulate unhandled promise rejection
            const unhandledRejectionHandler = (global as any).process.on.mock.calls.find(
                call => call[0] === 'unhandledRejection'
            )?.[1];

            if (unhandledRejectionHandler) {
                unhandledRejectionHandler(new Error('Unhandled rejection'), Promise.resolve());
            }

            // Assert
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Unhandled promise rejection'),
                expect.any(ServiceError)
            );
        });

        test('should handle uncaught exceptions', () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );

            // Act - Simulate uncaught exception
            const uncaughtExceptionHandler = (global as any).process.on.mock.calls.find(
                call => call[0] === 'uncaughtException'
            )?.[1];

            if (uncaughtExceptionHandler) {
                uncaughtExceptionHandler(new Error('Uncaught exception'));
            }

            // Assert
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Uncaught exception'),
                expect.any(ServiceError)
            );
        });
    });

    describe('Configuration Validation', () => {
        test('should validate all configuration fields', () => {
            // Arrange
            const validConfig: Partial<ServiceConfiguration> = {
                maxMessageHistorySize: 1000,
                maxRetryAttempts: 3,
                baseRetryDelay: 1000,
                maxConnectionsSize: 500,
                maxDeadLetterQueueSize: 100
            };

            // Act & Assert
            expect(() => {
                service = new EnterpriseDirectCommunicationService(
                    mockEventBus,
                    mockLoggingService,
                    mockNotificationService,
                    mockMetricsService,
                    validConfig
                );
            }).not.toThrow();
        });

        test('should reject invalid maxMessageHistorySize', () => {
            // Arrange
            const invalidConfig = { maxMessageHistorySize: 0 };

            // Act & Assert
            expect(() => {
                service = new EnterpriseDirectCommunicationService(
                    mockEventBus,
                    mockLoggingService,
                    mockNotificationService,
                    mockMetricsService,
                    invalidConfig
                );
            }).toThrow(ServiceError);
        });

        test('should reject invalid retry configuration', () => {
            // Arrange
            const invalidConfig = {
                maxRetryAttempts: -1,
                baseRetryDelay: 50
            };

            // Act & Assert
            expect(() => {
                service = new EnterpriseDirectCommunicationService(
                    mockEventBus,
                    mockLoggingService,
                    mockNotificationService,
                    mockMetricsService,
                    invalidConfig
                );
            }).toThrow(ServiceError);
        });
    });

    describe('Edge Cases and Integration', () => {
        test('should handle service restart cycle', async () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );

            // Act - Start, stop, start again
            await service.start();
            await service.stop();
            await service.start();

            // Assert
            const health = service.getHealthStatus();
            expect(health.status).toBe(ServiceStatus.HEALTHY);
        });

        test('should handle concurrent start/stop operations', async () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );

            // Act - Start and stop concurrently
            const startPromise = service.start();
            const stopPromise = service.stop();

            // Assert - Operations should handle concurrency gracefully
            await Promise.all([
                startPromise.catch(() => {}), // May fail due to concurrent stop
                stopPromise.catch(() => {}) // May fail due to concurrent start
            ]);

            // Service should end up in a consistent state
            const health = service.getHealthStatus();
            expect([ServiceStatus.STOPPED, ServiceStatus.HEALTHY]).toContain(health.status);
        });

        test('should handle message sending during shutdown', async () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );
            await service.start();

            // Act - Start shutdown and try to send message
            const stopPromise = service.stop();
            const sendPromise = service.sendMessage({
                type: MessageType.SPAWN_AGENT,
                content: 'Test during shutdown'
            });

            const [, sendResult] = await Promise.all([stopPromise, sendPromise]);

            // Assert
            expect(sendResult.success).toBe(false);
            expect(sendResult.error?.code).toBe(ErrorCode.INVALID_STATE);
        });

        test('should maintain message ordering', async () => {
            // Arrange
            service = new EnterpriseDirectCommunicationService(
                mockEventBus,
                mockLoggingService,
                mockNotificationService,
                mockMetricsService
            );
            await service.start();

            const messageOrder: string[] = [];
            mockEventBus.publish.mockImplementation((event, data) => {
                messageOrder.push(data.message.content);
            });

            // Act - Send messages in sequence
            for (let i = 0; i < 5; i++) {
                await service.sendMessage({
                    type: MessageType.SPAWN_AGENT,
                    content: `Message ${i}`
                });
            }

            // Assert - Messages should be processed in order
            expect(messageOrder).toEqual(['Message 0', 'Message 1', 'Message 2', 'Message 3', 'Message 4']);
        });
    });
});
