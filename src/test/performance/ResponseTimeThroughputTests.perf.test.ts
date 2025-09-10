/**
 * Response Time and Throughput Measurement Tests for NofX VS Code Extension
 * 
 * Comprehensive testing for:
 * - API response time analysis (TTFB, average, percentiles)
 * - Throughput metrics (RPS, TPS, concurrent limits)
 * - Page load performance simulation
 * - Message processing rates
 * - Data transfer rate validation
 */

import { 
import { getAppStateStore } from '../../state/AppStateStore';
import * as selectors from '../../state/selectors';
import * as actions from '../../state/actions';    PerformanceTestFramework, 
    PerformanceTestConfig, 
    ScenarioType, 
    OperationType,
    PerformanceTargets,
    PerformanceMetrics
} from './PerformanceTestFramework';

describe('Response Time and Throughput Measurement Tests', () => {
    let performanceFramework: PerformanceTestFramework;

    beforeAll(() => {
        performanceFramework = new PerformanceTestFramework();
    });

    afterEach(async () => {
        // Brief pause between tests
        await new Promise(resolve => setTimeout(resolve, 3000));
    });

    describe('API Response Time Analysis', () => {
        test('should measure API response times across all percentiles', async () => {
            const config: PerformanceTestConfig = {
                id: 'api-response-time-analysis',
                name: 'API Response Time Analysis',
                description: 'Comprehensive API response time measurement across all operations',
                scenario: {
                    type: ScenarioType.LOAD,
                    users: 25,
                    rampUpTime: 30000, // 30 seconds
                    sustainTime: 180000, // 3 minutes
                    rampDownTime: 30000, // 30 seconds
                    operations: [
                        {
                            name: 'Agent Spawn API',
                            type: OperationType.AGENT_SPAWN,
                            weight: 20,
                            parameters: { 
                                apiCall: true,
                                measureTTFB: true,
                                agentType: 'performance-test'
                            },
                            expectedResponseTime: 1500
                        },
                        {
                            name: 'Message Send API',
                            type: OperationType.MESSAGE_SEND,
                            weight: 30,
                            parameters: { 
                                apiCall: true,
                                messageSize: 'medium',
                                measureTTFB: true
                            },
                            expectedResponseTime: 100
                        },
                        {
                            name: 'Task Assignment API',
                            type: OperationType.TASK_ASSIGN,
                            weight: 25,
                            parameters: { 
                                apiCall: true,
                                taskComplexity: 'medium',
                                measureTTFB: true
                            },
                            expectedResponseTime: 200
                        },
                        {
                            name: 'Conductor Command API',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 15,
                            parameters: { 
                                apiCall: true,
                                commandType: 'status',
                                measureTTFB: true
                            },
                            expectedResponseTime: 150
                        },
                        {
                            name: 'Configuration API',
                            type: OperationType.CONFIGURATION_UPDATE,
                            weight: 10,
                            parameters: { 
                                apiCall: true,
                                updateType: 'setting',
                                measureTTFB: true
                            },
                            expectedResponseTime: 120
                        }
                    ]
                },
                duration: 240000, // 4 minutes
                warmupTime: 20000,
                cooldownTime: 10000,
                targetMetrics: {
                    maxResponseTime: 3000,
                    avgResponseTime: 300,
                    p95ResponseTime: 800,
                    p99ResponseTime: 1500,
                    minThroughput: 50, // operations per second
                    maxErrorRate: 0.01, // 1%
                    maxCpuUsage: 0.5, // 50%
                    maxMemoryUsage: 200 * 1024 * 1024, // 200 MB
                    maxMemoryGrowth: 2 * 1024 * 1024 // 2 MB per minute
                },
                environment: 'response-time-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Validate all response time percentiles
            expect(results.avgResponseTime).toBeLessThan(300);
            expect(results.p50ResponseTime).toBeLessThan(200);
            expect(results.p75ResponseTime).toBeLessThan(400);
            expect(results.p90ResponseTime).toBeLessThan(600);
            expect(results.p95ResponseTime).toBeLessThan(800);
            expect(results.p99ResponseTime).toBeLessThan(1500);
            expect(results.maxResponseTime).toBeLessThan(3000);

            // Validate TTFB equivalent (minimum response time should be reasonable)
            expect(results.minResponseTime).toBeLessThan(200); // TTFB < 200ms equivalent

            console.log('API Response Time Analysis Results:', {
                minResponseTime: `${results.minResponseTime}ms (TTFB equivalent)`,
                avgResponseTime: `${results.avgResponseTime}ms`,
                p50ResponseTime: `${results.p50ResponseTime}ms`,
                p75ResponseTime: `${results.p75ResponseTime}ms`,
                p90ResponseTime: `${results.p90ResponseTime}ms`,
                p95ResponseTime: `${results.p95ResponseTime}ms`,
                p99ResponseTime: `${results.p99ResponseTime}ms`,
                maxResponseTime: `${results.maxResponseTime}ms`,
                totalOperations: results.totalOperations,
                errorRate: `${(results.errorRate * 100).toFixed(2)}%`
            });

            // Verify operation-specific response times
            results.operationMetrics.forEach((metrics, operationType) => {
                console.log(`${operationType} Metrics:`, {
                    avgResponseTime: `${metrics.avgResponseTime}ms`,
                    p95ResponseTime: `${metrics.p95ResponseTime}ms`,
                    successRate: `${((metrics.successCount / metrics.totalCount) * 100).toFixed(2)}%`,
                    throughput: `${metrics.throughput} ops/sec`
                });
            });
        }, 300000); // 5 minutes timeout

        test('should validate Time to First Byte (TTFB) performance', async () => {
            const config: PerformanceTestConfig = {
                id: 'ttfb-performance-test',
                name: 'Time to First Byte (TTFB) Performance Test',
                description: 'Focused test on initial response times (TTFB equivalent)',
                scenario: {
                    type: ScenarioType.BASELINE,
                    users: 10,
                    rampUpTime: 15000, // 15 seconds
                    sustainTime: 120000, // 2 minutes
                    rampDownTime: 15000, // 15 seconds
                    operations: [
                        {
                            name: 'Quick Status Check',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 40,
                            parameters: { 
                                commandType: 'ping',
                                expectFastResponse: true
                            },
                            expectedResponseTime: 50
                        },
                        {
                            name: 'Agent Status Query',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 30,
                            parameters: { 
                                commandType: 'agent-status',
                                expectFastResponse: true
                            },
                            expectedResponseTime: 100
                        },
                        {
                            name: 'Configuration Get',
                            type: OperationType.CONFIGURATION_UPDATE,
                            weight: 20,
                            parameters: { 
                                operation: 'get',
                                expectFastResponse: true
                            },
                            expectedResponseTime: 75
                        },
                        {
                            name: 'Session Info',
                            type: OperationType.SESSION_MANAGEMENT,
                            weight: 10,
                            parameters: { 
                                operation: 'info',
                                expectFastResponse: true
                            },
                            expectedResponseTime: 60
                        }
                    ]
                },
                duration: 150000, // 2.5 minutes
                warmupTime: 10000,
                cooldownTime: 5000,
                targetMetrics: {
                    maxResponseTime: 200, // TTFB target
                    avgResponseTime: 80,
                    p95ResponseTime: 150,
                    p99ResponseTime: 180,
                    minThroughput: 80, // operations per second
                    maxErrorRate: 0.005, // 0.5%
                    maxCpuUsage: 0.3, // 30%
                    maxMemoryUsage: 100 * 1024 * 1024, // 100 MB
                    maxMemoryGrowth: 1024 * 1024 // 1 MB per minute
                },
                environment: 'ttfb-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // TTFB requirements (simulated through fast operations)
            expect(results.minResponseTime).toBeLessThan(100); // First byte equivalent
            expect(results.avgResponseTime).toBeLessThan(80);
            expect(results.p95ResponseTime).toBeLessThan(150);
            expect(results.maxResponseTime).toBeLessThan(200);

            console.log('TTFB Performance Results:', {
                minResponseTime: `${results.minResponseTime}ms (fastest TTFB)`,
                avgResponseTime: `${results.avgResponseTime}ms`,
                p95ResponseTime: `${results.p95ResponseTime}ms`,
                maxResponseTime: `${results.maxResponseTime}ms`,
                ttfbTarget: '< 200ms ✓'
            });
        }, 200000);
    });

    describe('Throughput Metrics Validation', () => {
        test('should measure requests per second (RPS) under load', async () => {
            const config: PerformanceTestConfig = {
                id: 'rps-measurement-test',
                name: 'Requests Per Second (RPS) Measurement',
                description: 'Measure maximum sustainable RPS for different operation types',
                scenario: {
                    type: ScenarioType.LOAD,
                    users: 75,
                    rampUpTime: 45000, // 45 seconds
                    sustainTime: 300000, // 5 minutes
                    rampDownTime: 15000, // 15 seconds
                    operations: [
                        {
                            name: 'High Frequency Messages',
                            type: OperationType.MESSAGE_SEND,
                            weight: 50,
                            parameters: { 
                                messageSize: 'small',
                                highFrequency: true
                            },
                            expectedResponseTime: 80
                        },
                        {
                            name: 'Status Requests',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 25,
                            parameters: { 
                                commandType: 'status',
                                highFrequency: true
                            },
                            expectedResponseTime: 100
                        },
                        {
                            name: 'Task Assignments',
                            type: OperationType.TASK_ASSIGN,
                            weight: 15,
                            parameters: { 
                                taskComplexity: 'simple',
                                highFrequency: true
                            },
                            expectedResponseTime: 150
                        },
                        {
                            name: 'WebSocket Messages',
                            type: OperationType.WEBSOCKET_CONNECTION,
                            weight: 10,
                            parameters: { 
                                messageType: 'data',
                                highFrequency: true
                            },
                            expectedResponseTime: 120
                        }
                    ]
                },
                duration: 360000, // 6 minutes
                warmupTime: 30000,
                cooldownTime: 15000,
                targetMetrics: {
                    maxResponseTime: 1000,
                    avgResponseTime: 200,
                    p95ResponseTime: 400,
                    p99ResponseTime: 600,
                    minThroughput: 200, // RPS target
                    maxErrorRate: 0.02, // 2%
                    maxCpuUsage: 0.7, // 70%
                    maxMemoryUsage: 300 * 1024 * 1024, // 300 MB
                    maxMemoryGrowth: 5 * 1024 * 1024 // 5 MB per minute
                },
                environment: 'rps-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // RPS validation
            expect(results.operationsPerSecond).toBeGreaterThan(200);
            expect(results.requestsPerSecond).toBeGreaterThan(200);
            expect(results.errorRate).toBeLessThan(0.02);

            // Calculate peak RPS (operations in best 1-minute window)
            const peakRPS = results.operationsPerSecond; // Simplified for this test
            expect(peakRPS).toBeGreaterThan(180);

            console.log('RPS Measurement Results:', {
                averageRPS: results.operationsPerSecond.toFixed(2),
                requestsPerSecond: results.requestsPerSecond.toFixed(2),
                peakRPS: peakRPS.toFixed(2),
                totalRequests: results.totalOperations,
                successfulRequests: results.successfulOperations,
                duration: `${results.duration / 1000}s`,
                errorRate: `${(results.errorRate * 100).toFixed(2)}%`
            });
        }, 420000); // 7 minutes timeout

        test('should measure transactions per second (TPS) for complex operations', async () => {
            const config: PerformanceTestConfig = {
                id: 'tps-measurement-test',
                name: 'Transactions Per Second (TPS) Measurement',
                description: 'Measure TPS for complex multi-step transactions',
                scenario: {
                    type: ScenarioType.LOAD,
                    users: 40,
                    rampUpTime: 60000, // 1 minute
                    sustainTime: 240000, // 4 minutes
                    rampDownTime: 30000, // 30 seconds
                    operations: [
                        {
                            name: 'Complete Agent Workflow',
                            type: OperationType.AGENT_SPAWN,
                            weight: 30,
                            parameters: { 
                                workflowType: 'complete',
                                includeTermination: true,
                                transactionType: 'complex'
                            },
                            expectedResponseTime: 3000
                        },
                        {
                            name: 'Multi-Step Task Assignment',
                            type: OperationType.TASK_ASSIGN,
                            weight: 35,
                            parameters: { 
                                taskComplexity: 'high',
                                includeValidation: true,
                                transactionType: 'complex'
                            },
                            expectedResponseTime: 1500
                        },
                        {
                            name: 'Session Management Transaction',
                            type: OperationType.SESSION_MANAGEMENT,
                            weight: 25,
                            parameters: { 
                                operation: 'full-cycle',
                                includePersistence: true,
                                transactionType: 'complex'
                            },
                            expectedResponseTime: 800
                        },
                        {
                            name: 'Configuration Transaction',
                            type: OperationType.CONFIGURATION_UPDATE,
                            weight: 10,
                            parameters: { 
                                operation: 'full-update',
                                includeValidation: true,
                                transactionType: 'complex'
                            },
                            expectedResponseTime: 500
                        }
                    ]
                },
                duration: 330000, // 5.5 minutes
                warmupTime: 30000,
                cooldownTime: 20000,
                targetMetrics: {
                    maxResponseTime: 5000,
                    avgResponseTime: 1200,
                    p95ResponseTime: 3000,
                    p99ResponseTime: 4000,
                    minThroughput: 50, // TPS target
                    maxErrorRate: 0.03, // 3%
                    maxCpuUsage: 0.8, // 80%
                    maxMemoryUsage: 400 * 1024 * 1024, // 400 MB
                    maxMemoryGrowth: 8 * 1024 * 1024 // 8 MB per minute
                },
                environment: 'tps-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // TPS validation for complex transactions
            expect(results.operationsPerSecond).toBeGreaterThan(50);
            expect(results.avgResponseTime).toBeLessThan(1200);
            expect(results.errorRate).toBeLessThan(0.03);

            // Calculate transaction success rate
            const transactionSuccessRate = results.successfulOperations / results.totalOperations;
            expect(transactionSuccessRate).toBeGreaterThan(0.97);

            console.log('TPS Measurement Results:', {
                transactionsPerSecond: results.operationsPerSecond.toFixed(2),
                avgTransactionTime: `${results.avgResponseTime}ms`,
                totalTransactions: results.totalOperations,
                successfulTransactions: results.successfulOperations,
                transactionSuccessRate: `${(transactionSuccessRate * 100).toFixed(2)}%`,
                p95TransactionTime: `${results.p95ResponseTime}ms`,
                errorRate: `${(results.errorRate * 100).toFixed(2)}%`
            });
        }, 380000); // 6.3 minutes timeout

        test('should validate concurrent user limits', async () => {
            const config: PerformanceTestConfig = {
                id: 'concurrent-user-limits-test',
                name: 'Concurrent User Limits Test',
                description: 'Find maximum concurrent users before performance degrades',
                scenario: {
                    type: ScenarioType.STRESS,
                    users: 300, // High concurrent load
                    rampUpTime: 180000, // 3 minutes gradual ramp-up
                    sustainTime: 120000, // 2 minutes sustained
                    rampDownTime: 60000, // 1 minute ramp-down
                    operations: [
                        {
                            name: 'Concurrent Agent Operations',
                            type: OperationType.AGENT_SPAWN,
                            weight: 25,
                            parameters: { 
                                concurrentTest: true,
                                agentType: 'concurrent'
                            },
                            expectedResponseTime: 2500
                        },
                        {
                            name: 'Concurrent Messages',
                            type: OperationType.MESSAGE_SEND,
                            weight: 40,
                            parameters: { 
                                concurrentTest: true,
                                messageSize: 'medium'
                            },
                            expectedResponseTime: 300
                        },
                        {
                            name: 'Concurrent Commands',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 20,
                            parameters: { 
                                concurrentTest: true,
                                commandType: 'mixed'
                            },
                            expectedResponseTime: 400
                        },
                        {
                            name: 'Concurrent WebSocket',
                            type: OperationType.WEBSOCKET_CONNECTION,
                            weight: 15,
                            parameters: { 
                                concurrentTest: true,
                                maintainConnection: true
                            },
                            expectedResponseTime: 600
                        }
                    ]
                },
                duration: 360000, // 6 minutes
                warmupTime: 30000,
                cooldownTime: 30000,
                targetMetrics: {
                    maxResponseTime: 8000,
                    avgResponseTime: 1500,
                    p95ResponseTime: 4000,
                    p99ResponseTime: 6000,
                    minThroughput: 150, // operations per second
                    maxErrorRate: 0.05, // 5%
                    maxCpuUsage: 0.9, // 90%
                    maxMemoryUsage: 600 * 1024 * 1024, // 600 MB
                    maxMemoryGrowth: 15 * 1024 * 1024 // 15 MB per minute
                },
                environment: 'concurrent-limits-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Concurrent user validation
            expect(results.operationsPerSecond).toBeGreaterThan(150);
            expect(results.errorRate).toBeLessThan(0.05);

            // Performance should degrade gracefully, not crash
            expect(results.successfulOperations).toBeGreaterThan(0);
            expect(results.avgResponseTime).toBeLessThan(3000); // Allow some degradation

            console.log('Concurrent User Limits Results:', {
                maxConcurrentUsers: 300,
                operationsPerSecond: results.operationsPerSecond.toFixed(2),
                avgResponseTime: `${results.avgResponseTime}ms`,
                p95ResponseTime: `${results.p95ResponseTime}ms`,
                errorRate: `${(results.errorRate * 100).toFixed(2)}%`,
                peakCpuUsage: `${(results.peakCpuUsage * 100).toFixed(2)}%`,
                peakMemoryUsage: `${(results.peakMemoryUsage / (1024 * 1024)).toFixed(2)}MB`,
                totalOperations: results.totalOperations,
                successfulOperations: results.successfulOperations
            });
        }, 420000); // 7 minutes timeout
    });

    describe('Message Processing Rate Tests', () => {
        test('should measure message processing rates under various loads', async () => {
            const config: PerformanceTestConfig = {
                id: 'message-processing-rate-test',
                name: 'Message Processing Rate Test',
                description: 'Measure message processing throughput across different message sizes',
                scenario: {
                    type: ScenarioType.LOAD,
                    users: 60,
                    rampUpTime: 30000, // 30 seconds
                    sustainTime: 180000, // 3 minutes
                    rampDownTime: 30000, // 30 seconds
                    operations: [
                        {
                            name: 'Small Messages',
                            type: OperationType.MESSAGE_SEND,
                            weight: 40,
                            parameters: { 
                                messageSize: 'small',
                                payload: 'A'.repeat(100) // 100 bytes
                            },
                            expectedResponseTime: 50
                        },
                        {
                            name: 'Medium Messages',
                            type: OperationType.MESSAGE_SEND,
                            weight: 35,
                            parameters: { 
                                messageSize: 'medium',
                                payload: 'A'.repeat(1000) // 1KB
                            },
                            expectedResponseTime: 100
                        },
                        {
                            name: 'Large Messages',
                            type: OperationType.MESSAGE_SEND,
                            weight: 20,
                            parameters: { 
                                messageSize: 'large',
                                payload: 'A'.repeat(10000) // 10KB
                            },
                            expectedResponseTime: 250
                        },
                        {
                            name: 'Extra Large Messages',
                            type: OperationType.MESSAGE_SEND,
                            weight: 5,
                            parameters: { 
                                messageSize: 'xlarge',
                                payload: 'A'.repeat(50000) // 50KB
                            },
                            expectedResponseTime: 500
                        }
                    ]
                },
                duration: 240000, // 4 minutes
                warmupTime: 20000,
                cooldownTime: 10000,
                targetMetrics: {
                    maxResponseTime: 1000,
                    avgResponseTime: 150,
                    p95ResponseTime: 400,
                    p99ResponseTime: 700,
                    minThroughput: 300, // messages per second
                    maxErrorRate: 0.01, // 1%
                    maxCpuUsage: 0.6, // 60%
                    maxMemoryUsage: 250 * 1024 * 1024, // 250 MB
                    maxMemoryGrowth: 3 * 1024 * 1024 // 3 MB per minute
                },
                environment: 'message-processing-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Message processing validation
            expect(results.messagesPerSecond).toBeGreaterThan(300);
            expect(results.operationsPerSecond).toBeGreaterThan(300);
            expect(results.avgResponseTime).toBeLessThan(150);
            expect(results.errorRate).toBeLessThan(0.01);

            // Calculate data throughput
            const estimatedDataThroughput = this.calculateDataThroughput(results, config);
            expect(estimatedDataThroughput).toBeGreaterThan(1024 * 1024); // > 1 MB/s

            console.log('Message Processing Rate Results:', {
                messagesPerSecond: results.messagesPerSecond || results.operationsPerSecond,
                avgProcessingTime: `${results.avgResponseTime}ms`,
                totalMessages: results.totalOperations,
                estimatedDataThroughput: `${(estimatedDataThroughput / (1024 * 1024)).toFixed(2)} MB/s`,
                errorRate: `${(results.errorRate * 100).toFixed(2)}%`,
                p95ProcessingTime: `${results.p95ResponseTime}ms`
            });
        }, 300000); // 5 minutes timeout

        test('should handle burst message scenarios', async () => {
            const config: PerformanceTestConfig = {
                id: 'burst-message-test',
                name: 'Burst Message Handling Test',
                description: 'Test system response to sudden message bursts',
                scenario: {
                    type: ScenarioType.SPIKE,
                    users: 100,
                    rampUpTime: 5000, // 5 seconds - very fast burst
                    sustainTime: 60000, // 1 minute
                    rampDownTime: 15000, // 15 seconds
                    operations: [
                        {
                            name: 'Burst Messages',
                            type: OperationType.MESSAGE_SEND,
                            weight: 80,
                            parameters: { 
                                burstMode: true,
                                messageSize: 'mixed',
                                highPriority: true
                            },
                            expectedResponseTime: 200
                        },
                        {
                            name: 'Burst Commands',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 20,
                            parameters: { 
                                burstMode: true,
                                commandType: 'urgent'
                            },
                            expectedResponseTime: 300
                        }
                    ]
                },
                duration: 80000, // 1.33 minutes
                warmupTime: 10000,
                cooldownTime: 10000,
                targetMetrics: {
                    maxResponseTime: 2000,
                    avgResponseTime: 400,
                    p95ResponseTime: 800,
                    p99ResponseTime: 1200,
                    minThroughput: 200, // messages per second during burst
                    maxErrorRate: 0.05, // 5% tolerance for bursts
                    maxCpuUsage: 0.9, // 90%
                    maxMemoryUsage: 400 * 1024 * 1024, // 400 MB
                    maxMemoryGrowth: 20 * 1024 * 1024 // 20 MB per minute
                },
                environment: 'burst-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Burst handling validation
            expect(results.operationsPerSecond).toBeGreaterThan(200);
            expect(results.errorRate).toBeLessThan(0.05);
            expect(results.successfulOperations).toBeGreaterThan(results.totalOperations * 0.95);

            console.log('Burst Message Handling Results:', {
                burstThroughput: results.operationsPerSecond.toFixed(2),
                avgBurstResponseTime: `${results.avgResponseTime}ms`,
                p95BurstResponseTime: `${results.p95ResponseTime}ms`,
                totalBurstMessages: results.totalOperations,
                burstErrorRate: `${(results.errorRate * 100).toFixed(2)}%`,
                peakMemoryDuringBurst: `${(results.peakMemoryUsage / (1024 * 1024)).toFixed(2)}MB`
            });
        }, 120000); // 2 minutes timeout
    });

    // Helper method to calculate data throughput
    private calculateDataThroughput(results: PerformanceMetrics, config: PerformanceTestConfig): number {
        // Estimate average message size based on operation weights
        let avgMessageSize = 0;
        config.scenario.operations.forEach(op => {
            if (op.type === OperationType.MESSAGE_SEND) {
                const size = this.estimateMessageSize(op.parameters.messageSize || op.parameters.payload);
                avgMessageSize += (size * op.weight / 100);
            }
        });
        
        return results.operationsPerSecond * avgMessageSize;
    }

    private estimateMessageSize(sizeIndicator: string): number {
        if (typeof sizeIndicator === 'string' && sizeIndicator.startsWith('A')) {
            return sizeIndicator.length; // Direct byte count from payload
        }
        
        switch (sizeIndicator) {
            case 'small': return 100;
            case 'medium': return 1000;
            case 'large': return 10000;
            case 'xlarge': return 50000;
            case 'mixed': return 2500; // Average
            default: return 500;
        }
    }
});