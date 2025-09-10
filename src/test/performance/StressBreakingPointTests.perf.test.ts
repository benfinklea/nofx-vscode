/**
 * Stress Testing and Breaking Point Analysis for NofX VS Code Extension
 * 
 * Comprehensive stress testing covering:
 * - Breaking point identification (max concurrent users, resource limits)
 * - Database connection pool stress testing
 * - Memory exhaustion and leak detection
 * - CPU saturation threshold testing
 * - Network bandwidth limit testing
 * - Recovery time measurement after stress
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

describe('Stress Testing and Breaking Point Analysis', () => {
    let performanceFramework: PerformanceTestFramework;

    beforeAll(() => {
        performanceFramework = new PerformanceTestFramework();
    });

    afterEach(async () => {
        // Extended cooldown after stress tests
        await new Promise(resolve => setTimeout(resolve, 10000));
    });

    describe('Breaking Point Identification', () => {
        test('should find maximum concurrent users before failure', async () => {
            const config: PerformanceTestConfig = {
                id: 'max-concurrent-users-test',
                name: 'Maximum Concurrent Users Breaking Point',
                description: 'Incrementally increase load until system breaks to find maximum capacity',
                scenario: {
                    type: ScenarioType.STRESS,
                    users: 1000, // Aggressive stress test
                    rampUpTime: 300000, // 5 minutes gradual ramp-up
                    sustainTime: 180000, // 3 minutes at peak
                    rampDownTime: 120000, // 2 minutes ramp-down
                    operations: [
                        {
                            name: 'Stress Agent Spawn',
                            type: OperationType.AGENT_SPAWN,
                            weight: 20,
                            parameters: { 
                                stressTest: true,
                                agentType: 'stress-test',
                                timeout: 10000
                            },
                            expectedResponseTime: 5000
                        },
                        {
                            name: 'Stress Message Flood',
                            type: OperationType.MESSAGE_SEND,
                            weight: 40,
                            parameters: { 
                                stressTest: true,
                                messageSize: 'large',
                                floodMode: true
                            },
                            expectedResponseTime: 1000
                        },
                        {
                            name: 'Stress Task Assignment',
                            type: OperationType.TASK_ASSIGN,
                            weight: 25,
                            parameters: { 
                                stressTest: true,
                                taskComplexity: 'maximum',
                                parallel: true
                            },
                            expectedResponseTime: 3000
                        },
                        {
                            name: 'Stress WebSocket Connections',
                            type: OperationType.WEBSOCKET_CONNECTION,
                            weight: 10,
                            parameters: { 
                                stressTest: true,
                                maintainAll: true,
                                maxConnections: true
                            },
                            expectedResponseTime: 2000
                        },
                        {
                            name: 'Stress Conductor Commands',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 5,
                            parameters: { 
                                stressTest: true,
                                commandType: 'heavy',
                                concurrent: true
                            },
                            expectedResponseTime: 1500
                        }
                    ]
                },
                duration: 600000, // 10 minutes total
                warmupTime: 60000,
                cooldownTime: 60000,
                targetMetrics: {
                    maxResponseTime: 20000, // Very relaxed during stress
                    avgResponseTime: 5000,
                    p95ResponseTime: 15000,
                    p99ResponseTime: 18000,
                    minThroughput: 100, // Minimum acceptable throughput
                    maxErrorRate: 0.2, // 20% error tolerance under extreme stress
                    maxCpuUsage: 0.95, // 95%
                    maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2 GB
                    maxMemoryGrowth: 100 * 1024 * 1024 // 100 MB per minute
                },
                environment: 'breaking-point-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Breaking point analysis
            const breakingPointReached = results.errorRate > 0.5 || results.operationsPerSecond < 50;
            
            if (breakingPointReached) {
                console.log('Breaking point identified:', {
                    maxUsers: 'Breaking point reached before 1000 users',
                    finalErrorRate: `${(results.errorRate * 100).toFixed(2)}%`,
                    finalThroughput: results.operationsPerSecond.toFixed(2),
                    systemStability: 'System degraded significantly'
                });
            } else {
                console.log('System handled maximum load:', {
                    maxUsers: 1000,
                    finalErrorRate: `${(results.errorRate * 100).toFixed(2)}%`,
                    finalThroughput: results.operationsPerSecond.toFixed(2),
                    systemStability: 'System remained stable'
                });
            }

            // Validate system didn't completely crash
            expect(results.successfulOperations).toBeGreaterThan(0);
            expect(results.operationsPerSecond).toBeGreaterThan(0);

            console.log('Breaking Point Analysis Results:', {
                totalOperations: results.totalOperations,
                successfulOperations: results.successfulOperations,
                failedOperations: results.failedOperations,
                avgResponseTime: `${results.avgResponseTime}ms`,
                p99ResponseTime: `${results.p99ResponseTime}ms`,
                maxResponseTime: `${results.maxResponseTime}ms`,
                operationsPerSecond: results.operationsPerSecond.toFixed(2),
                errorRate: `${(results.errorRate * 100).toFixed(2)}%`,
                peakCpuUsage: `${(results.peakCpuUsage * 100).toFixed(2)}%`,
                peakMemoryUsage: `${(results.peakMemoryUsage / (1024 * 1024 * 1024)).toFixed(2)}GB`,
                memoryGrowthRate: `${(results.memoryGrowthRate / (1024 * 1024)).toFixed(2)}MB/min`
            });
        }, 720000); // 12 minutes timeout

        test('should identify database connection pool limits', async () => {
            const config: PerformanceTestConfig = {
                id: 'db-connection-pool-stress',
                name: 'Database Connection Pool Stress Test',
                description: 'Stress test database connections to find pool limits',
                scenario: {
                    type: ScenarioType.STRESS,
                    users: 200,
                    rampUpTime: 120000, // 2 minutes
                    sustainTime: 300000, // 5 minutes
                    rampDownTime: 60000, // 1 minute
                    operations: [
                        {
                            name: 'Concurrent Agent Creation (DB writes)',
                            type: OperationType.AGENT_SPAWN,
                            weight: 30,
                            parameters: { 
                                requiresDatabase: true,
                                concurrentDbOperations: true,
                                persistAgent: true
                            },
                            expectedResponseTime: 2000
                        },
                        {
                            name: 'Session Persistence (DB operations)',
                            type: OperationType.SESSION_MANAGEMENT,
                            weight: 40,
                            parameters: { 
                                operation: 'full-persistence',
                                requiresDatabase: true,
                                heavyWrite: true
                            },
                            expectedResponseTime: 1000
                        },
                        {
                            name: 'Configuration Updates (DB transactions)',
                            type: OperationType.CONFIGURATION_UPDATE,
                            weight: 20,
                            parameters: { 
                                requiresDatabase: true,
                                transactionMode: true,
                                batchUpdates: true
                            },
                            expectedResponseTime: 800
                        },
                        {
                            name: 'Template Processing (DB reads)',
                            type: OperationType.TEMPLATE_PROCESSING,
                            weight: 10,
                            parameters: { 
                                requiresDatabase: true,
                                heavyRead: true,
                                concurrentReads: true
                            },
                            expectedResponseTime: 600
                        }
                    ]
                },
                duration: 480000, // 8 minutes
                warmupTime: 30000,
                cooldownTime: 30000,
                targetMetrics: {
                    maxResponseTime: 10000,
                    avgResponseTime: 2000,
                    p95ResponseTime: 6000,
                    p99ResponseTime: 8000,
                    minThroughput: 80, // operations per second
                    maxErrorRate: 0.1, // 10%
                    maxCpuUsage: 0.8, // 80%
                    maxMemoryUsage: 800 * 1024 * 1024, // 800 MB
                    maxMemoryGrowth: 20 * 1024 * 1024 // 20 MB per minute
                },
                environment: 'db-stress-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Database connection stress analysis
            const dbStressDetected = results.errorRate > 0.05 || results.avgResponseTime > 3000;
            
            expect(results.operationsPerSecond).toBeGreaterThan(50); // Minimum under stress
            expect(results.errorRate).toBeLessThan(0.15); // Allow higher error rate for DB stress

            console.log('Database Connection Pool Stress Results:', {
                operationsPerSecond: results.operationsPerSecond.toFixed(2),
                avgResponseTime: `${results.avgResponseTime}ms`,
                p95ResponseTime: `${results.p95ResponseTime}ms`,
                errorRate: `${(results.errorRate * 100).toFixed(2)}%`,
                dbStressDetected: dbStressDetected,
                recommendedPoolSize: dbStressDetected ? 'Increase connection pool' : 'Current pool adequate',
                totalDbOperations: results.totalOperations
            });
        }, 540000); // 9 minutes timeout

        test('should identify memory exhaustion points', async () => {
            const config: PerformanceTestConfig = {
                id: 'memory-exhaustion-test',
                name: 'Memory Exhaustion Breaking Point Test',
                description: 'Stress test memory usage to find exhaustion points and detect leaks',
                scenario: {
                    type: ScenarioType.STRESS,
                    users: 150,
                    rampUpTime: 90000, // 1.5 minutes
                    sustainTime: 600000, // 10 minutes - extended for memory analysis
                    rampDownTime: 60000, // 1 minute
                    operations: [
                        {
                            name: 'Memory Intensive Agent Spawn',
                            type: OperationType.AGENT_SPAWN,
                            weight: 25,
                            parameters: { 
                                memoryIntensive: true,
                                largePayload: true,
                                retainInMemory: true,
                                agentType: 'memory-stress'
                            },
                            expectedResponseTime: 3000
                        },
                        {
                            name: 'Large Message Processing',
                            type: OperationType.MESSAGE_SEND,
                            weight: 35,
                            parameters: { 
                                messageSize: 'xlarge',
                                retainInMemory: true,
                                payload: 'A'.repeat(100000), // 100KB messages
                                memoryIntensive: true
                            },
                            expectedResponseTime: 500
                        },
                        {
                            name: 'Memory Heavy Tasks',
                            type: OperationType.TASK_ASSIGN,
                            weight: 25,
                            parameters: { 
                                taskComplexity: 'maximum',
                                memoryIntensive: true,
                                largeDataStructures: true
                            },
                            expectedResponseTime: 2000
                        },
                        {
                            name: 'Session Data Accumulation',
                            type: OperationType.SESSION_MANAGEMENT,
                            weight: 15,
                            parameters: { 
                                operation: 'accumulate',
                                memoryIntensive: true,
                                persistLargeData: true
                            },
                            expectedResponseTime: 1000
                        }
                    ]
                },
                duration: 750000, // 12.5 minutes
                warmupTime: 30000,
                cooldownTime: 30000,
                targetMetrics: {
                    maxResponseTime: 8000,
                    avgResponseTime: 1500,
                    p95ResponseTime: 4000,
                    p99ResponseTime: 6000,
                    minThroughput: 100, // operations per second
                    maxErrorRate: 0.08, // 8%
                    maxCpuUsage: 0.7, // 70%
                    maxMemoryUsage: 1.5 * 1024 * 1024 * 1024, // 1.5 GB
                    maxMemoryGrowth: 50 * 1024 * 1024 // 50 MB per minute
                },
                environment: 'memory-stress-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Memory exhaustion analysis
            const memoryGrowthMBPerMin = results.memoryGrowthRate / (1024 * 1024);
            const peakMemoryGB = results.peakMemoryUsage / (1024 * 1024 * 1024);
            const avgMemoryGB = results.avgMemoryUsage / (1024 * 1024 * 1024);
            
            // Detect potential memory leaks
            const memoryLeakSuspected = memoryGrowthMBPerMin > 20; // > 20 MB/min growth
            const memoryExhaustionRisk = peakMemoryGB > 1.0; // > 1 GB peak usage

            expect(results.operationsPerSecond).toBeGreaterThan(80);
            expect(results.errorRate).toBeLessThan(0.1);

            console.log('Memory Exhaustion Analysis Results:', {
                peakMemoryUsage: `${peakMemoryGB.toFixed(2)}GB`,
                avgMemoryUsage: `${avgMemoryGB.toFixed(2)}GB`,
                memoryGrowthRate: `${memoryGrowthMBPerMin.toFixed(2)}MB/min`,
                memoryLeakSuspected: memoryLeakSuspected,
                memoryExhaustionRisk: memoryExhaustionRisk,
                totalOperations: results.totalOperations,
                operationsPerSecond: results.operationsPerSecond.toFixed(2),
                errorRate: `${(results.errorRate * 100).toFixed(2)}%`,
                gcCount: results.gcCount,
                gcTotalTime: `${results.gcTotalTime}ms`,
                recommendations: [
                    memoryLeakSuspected ? 'Investigate potential memory leaks' : 'Memory usage stable',
                    memoryExhaustionRisk ? 'Consider memory optimization' : 'Memory usage within limits',
                    `Peak memory: ${peakMemoryGB > 0.5 ? 'High' : 'Normal'} usage detected`
                ]
            });

            // Memory leak detection
            if (memoryLeakSuspected) {
                console.warn('WARNING: Potential memory leak detected');
                console.warn(`Memory growth rate: ${memoryGrowthMBPerMin.toFixed(2)} MB/min`);
            }
        }, 810000); // 13.5 minutes timeout
    });

    describe('CPU Saturation Threshold Testing', () => {
        test('should identify CPU saturation thresholds', async () => {
            const config: PerformanceTestConfig = {
                id: 'cpu-saturation-test',
                name: 'CPU Saturation Threshold Test',
                description: 'Stress test CPU usage to find saturation points',
                scenario: {
                    type: ScenarioType.STRESS,
                    users: 100,
                    rampUpTime: 60000, // 1 minute
                    sustainTime: 240000, // 4 minutes
                    rampDownTime: 60000, // 1 minute
                    operations: [
                        {
                            name: 'CPU Intensive Agent Processing',
                            type: OperationType.AGENT_SPAWN,
                            weight: 30,
                            parameters: { 
                                cpuIntensive: true,
                                complexProcessing: true,
                                agentType: 'cpu-stress',
                                parallelProcessing: true
                            },
                            expectedResponseTime: 4000
                        },
                        {
                            name: 'Complex Message Processing',
                            type: OperationType.MESSAGE_SEND,
                            weight: 25,
                            parameters: { 
                                cpuIntensive: true,
                                complexTransformation: true,
                                encryption: true,
                                compression: true
                            },
                            expectedResponseTime: 800
                        },
                        {
                            name: 'Heavy Computational Tasks',
                            type: OperationType.TASK_ASSIGN,
                            weight: 25,
                            parameters: { 
                                taskComplexity: 'computational',
                                cpuIntensive: true,
                                algorithmicProcessing: true
                            },
                            expectedResponseTime: 3000
                        },
                        {
                            name: 'Template Compilation Stress',
                            type: OperationType.TEMPLATE_PROCESSING,
                            weight: 20,
                            parameters: { 
                                cpuIntensive: true,
                                complexTemplates: true,
                                multipleCompilations: true
                            },
                            expectedResponseTime: 2000
                        }
                    ]
                },
                duration: 360000, // 6 minutes
                warmupTime: 30000,
                cooldownTime: 30000,
                targetMetrics: {
                    maxResponseTime: 10000,
                    avgResponseTime: 2500,
                    p95ResponseTime: 6000,
                    p99ResponseTime: 8000,
                    minThroughput: 60, // operations per second
                    maxErrorRate: 0.05, // 5%
                    maxCpuUsage: 0.95, // 95%
                    maxMemoryUsage: 600 * 1024 * 1024, // 600 MB
                    maxMemoryGrowth: 10 * 1024 * 1024 // 10 MB per minute
                },
                environment: 'cpu-stress-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // CPU saturation analysis
            const peakCpuPercent = results.peakCpuUsage * 100;
            const avgCpuPercent = results.avgCpuUsage * 100;
            const cpuSaturated = peakCpuPercent > 90;
            const performanceDegraded = results.avgResponseTime > 3000 || results.errorRate > 0.03;

            expect(results.operationsPerSecond).toBeGreaterThan(40); // Minimum under CPU stress
            expect(results.errorRate).toBeLessThan(0.08);

            console.log('CPU Saturation Analysis Results:', {
                peakCpuUsage: `${peakCpuPercent.toFixed(2)}%`,
                avgCpuUsage: `${avgCpuPercent.toFixed(2)}%`,
                cpuSaturated: cpuSaturated,
                performanceDegraded: performanceDegraded,
                operationsPerSecond: results.operationsPerSecond.toFixed(2),
                avgResponseTime: `${results.avgResponseTime}ms`,
                p95ResponseTime: `${results.p95ResponseTime}ms`,
                errorRate: `${(results.errorRate * 100).toFixed(2)}%`,
                totalOperations: results.totalOperations,
                cpuThresholdRecommendation: cpuSaturated ? 
                    'Consider CPU optimization or scaling' : 
                    'CPU utilization within acceptable range'
            });

            // Performance correlation with CPU usage
            if (cpuSaturated && performanceDegraded) {
                console.warn('WARNING: High CPU usage correlates with performance degradation');
            }
        }, 420000); // 7 minutes timeout

        test('should test multi-core utilization efficiency', async () => {
            const config: PerformanceTestConfig = {
                id: 'multi-core-utilization-test',
                name: 'Multi-Core Utilization Efficiency Test',
                description: 'Test system ability to utilize multiple CPU cores efficiently',
                scenario: {
                    type: ScenarioType.LOAD,
                    users: 80,
                    rampUpTime: 45000, // 45 seconds
                    sustainTime: 180000, // 3 minutes
                    rampDownTime: 45000, // 45 seconds
                    operations: [
                        {
                            name: 'Parallel Agent Processing',
                            type: OperationType.AGENT_SPAWN,
                            weight: 40,
                            parameters: { 
                                parallelExecution: true,
                                multiCore: true,
                                agentType: 'parallel',
                                threadPoolSize: 'auto'
                            },
                            expectedResponseTime: 2000
                        },
                        {
                            name: 'Concurrent Message Processing',
                            type: OperationType.MESSAGE_SEND,
                            weight: 35,
                            parameters: { 
                                parallelExecution: true,
                                multiThreaded: true,
                                concurrentProcessing: true
                            },
                            expectedResponseTime: 300
                        },
                        {
                            name: 'Parallel Task Execution',
                            type: OperationType.TASK_ASSIGN,
                            weight: 25,
                            parameters: { 
                                parallelExecution: true,
                                taskComplexity: 'parallel',
                                multiCore: true
                            },
                            expectedResponseTime: 1500
                        }
                    ]
                },
                duration: 270000, // 4.5 minutes
                warmupTime: 20000,
                cooldownTime: 10000,
                targetMetrics: {
                    maxResponseTime: 5000,
                    avgResponseTime: 1000,
                    p95ResponseTime: 3000,
                    p99ResponseTime: 4000,
                    minThroughput: 120, // operations per second
                    maxErrorRate: 0.02, // 2%
                    maxCpuUsage: 0.8, // 80%
                    maxMemoryUsage: 400 * 1024 * 1024, // 400 MB
                    maxMemoryGrowth: 5 * 1024 * 1024 // 5 MB per minute
                },
                environment: 'multi-core-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Multi-core efficiency analysis
            const coreCount = require('os').cpus().length;
            const cpuEfficiency = results.operationsPerSecond / (results.avgCpuUsage * coreCount);
            const scalingEfficiency = results.operationsPerSecond / coreCount;

            expect(results.operationsPerSecond).toBeGreaterThan(120);
            expect(results.avgResponseTime).toBeLessThan(1000);
            expect(results.errorRate).toBeLessThan(0.02);

            console.log('Multi-Core Utilization Results:', {
                coreCount: coreCount,
                operationsPerSecond: results.operationsPerSecond.toFixed(2),
                avgCpuUsage: `${(results.avgCpuUsage * 100).toFixed(2)}%`,
                cpuEfficiency: cpuEfficiency.toFixed(2),
                scalingEfficiency: scalingEfficiency.toFixed(2),
                avgResponseTime: `${results.avgResponseTime}ms`,
                p95ResponseTime: `${results.p95ResponseTime}ms`,
                multiCoreRecommendation: scalingEfficiency > 15 ? 
                    'Good multi-core utilization' : 
                    'Consider optimizing for parallel processing'
            });
        }, 320000); // 5.3 minutes timeout
    });

    describe('Network Bandwidth Stress Testing', () => {
        test('should identify network bandwidth limits', async () => {
            const config: PerformanceTestConfig = {
                id: 'network-bandwidth-stress',
                name: 'Network Bandwidth Stress Test',
                description: 'Stress test network bandwidth with large data transfers',
                scenario: {
                    type: ScenarioType.STRESS,
                    users: 50,
                    rampUpTime: 30000, // 30 seconds
                    sustainTime: 180000, // 3 minutes
                    rampDownTime: 30000, // 30 seconds
                    operations: [
                        {
                            name: 'Large Message Transfers',
                            type: OperationType.MESSAGE_SEND,
                            weight: 50,
                            parameters: { 
                                messageSize: 'massive',
                                payload: 'A'.repeat(500000), // 500KB messages
                                networkIntensive: true
                            },
                            expectedResponseTime: 2000
                        },
                        {
                            name: 'File Operation Simulation',
                            type: OperationType.FILE_OPERATION,
                            weight: 30,
                            parameters: { 
                                operationType: 'large-transfer',
                                fileSize: 'large',
                                networkIntensive: true
                            },
                            expectedResponseTime: 3000
                        },
                        {
                            name: 'WebSocket Data Streaming',
                            type: OperationType.WEBSOCKET_CONNECTION,
                            weight: 20,
                            parameters: { 
                                dataStreaming: true,
                                largePayloads: true,
                                continuousTransfer: true
                            },
                            expectedResponseTime: 1500
                        }
                    ]
                },
                duration: 240000, // 4 minutes
                warmupTime: 15000,
                cooldownTime: 15000,
                targetMetrics: {
                    maxResponseTime: 8000,
                    avgResponseTime: 2500,
                    p95ResponseTime: 5000,
                    p99ResponseTime: 7000,
                    minThroughput: 30, // operations per second (lower due to large payloads)
                    maxErrorRate: 0.05, // 5%
                    maxCpuUsage: 0.6, // 60%
                    maxMemoryUsage: 800 * 1024 * 1024, // 800 MB
                    maxMemoryGrowth: 30 * 1024 * 1024 // 30 MB per minute
                },
                environment: 'network-stress-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Network bandwidth analysis
            const estimatedDataTransferMB = (results.totalOperations * 500) / 1024; // Rough estimate
            const transferRateMBps = estimatedDataTransferMB / (results.duration / 1000);
            const networkSaturated = results.avgResponseTime > 3000 || results.errorRate > 0.03;

            expect(results.operationsPerSecond).toBeGreaterThan(20); // Lower expectation for large transfers
            expect(results.errorRate).toBeLessThan(0.08);

            console.log('Network Bandwidth Stress Results:', {
                operationsPerSecond: results.operationsPerSecond.toFixed(2),
                estimatedDataTransfer: `${estimatedDataTransferMB.toFixed(2)}MB`,
                estimatedTransferRate: `${transferRateMBps.toFixed(2)}MB/s`,
                avgResponseTime: `${results.avgResponseTime}ms`,
                p95ResponseTime: `${results.p95ResponseTime}ms`,
                errorRate: `${(results.errorRate * 100).toFixed(2)}%`,
                networkSaturated: networkSaturated,
                bandwidthRecommendation: networkSaturated ? 
                    'Network bandwidth may be limiting factor' : 
                    'Network performance adequate'
            });
        }, 300000); // 5 minutes timeout
    });

    describe('Recovery Time Analysis', () => {
        test('should measure recovery time after extreme stress', async () => {
            // First, apply extreme stress
            const stressConfig: PerformanceTestConfig = {
                id: 'pre-recovery-stress',
                name: 'Pre-Recovery Stress Application',
                description: 'Apply extreme stress before measuring recovery',
                scenario: {
                    type: ScenarioType.STRESS,
                    users: 500,
                    rampUpTime: 60000, // 1 minute
                    sustainTime: 120000, // 2 minutes
                    rampDownTime: 30000, // 30 seconds
                    operations: [
                        {
                            name: 'Extreme Load Operations',
                            type: OperationType.MESSAGE_SEND,
                            weight: 100,
                            parameters: { 
                                extremeLoad: true,
                                messageSize: 'large'
                            },
                            expectedResponseTime: 5000
                        }
                    ]
                },
                duration: 210000,
                targetMetrics: {
                    maxResponseTime: 15000,
                    avgResponseTime: 5000,
                    p95ResponseTime: 10000,
                    p99ResponseTime: 12000,
                    minThroughput: 50,
                    maxErrorRate: 0.3, // 30% - expect high errors under extreme stress
                    maxCpuUsage: 0.95,
                    maxMemoryUsage: 1024 * 1024 * 1024, // 1 GB
                    maxMemoryGrowth: 100 * 1024 * 1024
                },
                environment: 'stress-application'
            };

            console.log('Applying extreme stress...');
            const stressResults = await performanceFramework.runPerformanceTest(stressConfig);
            
            console.log('Stress application complete. Starting recovery measurement...');
            
            // Wait for system to start recovering
            await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds

            // Now measure recovery
            const recoveryConfig: PerformanceTestConfig = {
                id: 'recovery-measurement',
                name: 'Recovery Time Measurement',
                description: 'Measure system recovery after extreme stress',
                scenario: {
                    type: ScenarioType.BASELINE,
                    users: 10, // Light load to measure recovery
                    rampUpTime: 15000, // 15 seconds
                    sustainTime: 300000, // 5 minutes to observe recovery
                    rampDownTime: 15000, // 15 seconds
                    operations: [
                        {
                            name: 'Recovery Monitoring Operations',
                            type: OperationType.MESSAGE_SEND,
                            weight: 60,
                            parameters: { 
                                recoveryTest: true,
                                messageSize: 'small'
                            },
                            expectedResponseTime: 200
                        },
                        {
                            name: 'System Health Checks',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 40,
                            parameters: { 
                                commandType: 'health',
                                recoveryTest: true
                            },
                            expectedResponseTime: 150
                        }
                    ]
                },
                duration: 330000, // 5.5 minutes
                targetMetrics: {
                    maxResponseTime: 1000,
                    avgResponseTime: 300,
                    p95ResponseTime: 600,
                    p99ResponseTime: 800,
                    minThroughput: 80,
                    maxErrorRate: 0.02, // 2%
                    maxCpuUsage: 0.4, // 40%
                    maxMemoryUsage: 200 * 1024 * 1024, // 200 MB
                    maxMemoryGrowth: 2 * 1024 * 1024 // 2 MB per minute
                },
                environment: 'recovery-measurement'
            };

            const recoveryResults = await performanceFramework.runPerformanceTest(recoveryConfig);

            // Recovery analysis
            const recoverySuccessful = recoveryResults.avgResponseTime < 500 && recoveryResults.errorRate < 0.05;
            const fullRecoveryTime = recoverySuccessful ? 'Under 5 minutes' : 'Over 5 minutes';
            
            console.log('Recovery Analysis Results:', {
                stressPhase: {
                    peakErrorRate: `${(stressResults.errorRate * 100).toFixed(2)}%`,
                    peakResponseTime: `${stressResults.maxResponseTime}ms`,
                    operationsPerSecond: stressResults.operationsPerSecond.toFixed(2)
                },
                recoveryPhase: {
                    avgResponseTime: `${recoveryResults.avgResponseTime}ms`,
                    errorRate: `${(recoveryResults.errorRate * 100).toFixed(2)}%`,
                    operationsPerSecond: recoveryResults.operationsPerSecond.toFixed(2),
                    recoverySuccessful: recoverySuccessful,
                    fullRecoveryTime: fullRecoveryTime
                },
                recommendations: [
                    recoverySuccessful ? 'System recovery is adequate' : 'Improve recovery mechanisms',
                    `Recovery time: ${fullRecoveryTime}`,
                    'Monitor memory cleanup and garbage collection'
                ]
            });

            expect(recoveryResults.operationsPerSecond).toBeGreaterThan(60);
            expect(recoveryResults.avgResponseTime).toBeLessThan(600);
        }, 900000); // 15 minutes timeout
    });
});