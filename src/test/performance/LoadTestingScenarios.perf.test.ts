/**
 * Load Testing Scenarios for NofX VS Code Extension
 *
 * Comprehensive load testing scenarios covering:
 * - Baseline performance measurement
 * - Expected daily active user load
 * - Peak traffic simulation (10x normal)
 * - Gradual ramp-up testing
 * - Sustained load handling
 * - Sudden traffic spike scenarios
 */

import {
    PerformanceTestFramework,
    PerformanceTestConfig,
    ScenarioType,
    OperationType,
    PerformanceTargets
} from './PerformanceTestFramework';

describe('Load Testing Scenarios', () => {
    let performanceFramework: PerformanceTestFramework;

    beforeAll(() => {
        performanceFramework = new PerformanceTestFramework();
    });

    afterAll(async () => {
        // Allow cleanup time
        await new Promise(resolve => setTimeout(resolve, 5000));
    });

    describe('Baseline Performance Testing', () => {
        test('should establish baseline performance with minimal load', async () => {
            const config: PerformanceTestConfig = {
                id: 'baseline-minimal-load',
                name: 'Baseline Performance - Minimal Load',
                description: 'Establish baseline performance metrics with single user',
                scenario: {
                    type: ScenarioType.BASELINE,
                    users: 1,
                    rampUpTime: 5000, // 5 seconds
                    sustainTime: 30000, // 30 seconds
                    rampDownTime: 5000, // 5 seconds
                    operations: [
                        {
                            name: 'Agent Spawn',
                            type: OperationType.AGENT_SPAWN,
                            weight: 20,
                            parameters: { agentType: 'frontend-specialist' },
                            expectedResponseTime: 2000
                        },
                        {
                            name: 'Message Send',
                            type: OperationType.MESSAGE_SEND,
                            weight: 40,
                            parameters: { messageSize: 'small' },
                            expectedResponseTime: 100
                        },
                        {
                            name: 'Conductor Command',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 30,
                            parameters: { commandType: 'status' },
                            expectedResponseTime: 200
                        },
                        {
                            name: 'Configuration Update',
                            type: OperationType.CONFIGURATION_UPDATE,
                            weight: 10,
                            parameters: { setting: 'maxAgents' },
                            expectedResponseTime: 150
                        }
                    ]
                },
                duration: 40000, // 40 seconds total
                warmupTime: 10000,
                cooldownTime: 5000,
                targetMetrics: {
                    maxResponseTime: 3000,
                    avgResponseTime: 500,
                    p95ResponseTime: 1500,
                    p99ResponseTime: 2500,
                    minThroughput: 10, // operations per second
                    maxErrorRate: 0.01, // 1%
                    maxCpuUsage: 0.3, // 30%
                    maxMemoryUsage: 100 * 1024 * 1024, // 100 MB
                    maxMemoryGrowth: 1024 * 1024 // 1 MB per minute
                },
                environment: 'test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            expect(results.targetsAchieved).toBe(true);
            expect(results.errorRate).toBeLessThan(0.01);
            expect(results.avgResponseTime).toBeLessThan(500);
            expect(results.p95ResponseTime).toBeLessThan(1500);
            expect(results.operationsPerSecond).toBeGreaterThan(10);

            console.log('Baseline Performance Results:', {
                avgResponseTime: results.avgResponseTime,
                p95ResponseTime: results.p95ResponseTime,
                operationsPerSecond: results.operationsPerSecond,
                errorRate: results.errorRate,
                peakMemoryUsage: results.peakMemoryUsage
            });
        }, 60000);

        test('should handle expected daily active user load', async () => {
            const config: PerformanceTestConfig = {
                id: 'daily-active-users',
                name: 'Daily Active User Load Test',
                description: 'Test with expected number of daily active users (50 concurrent)',
                scenario: {
                    type: ScenarioType.LOAD,
                    users: 50,
                    rampUpTime: 60000, // 1 minute ramp-up
                    sustainTime: 300000, // 5 minutes sustained
                    rampDownTime: 30000, // 30 seconds ramp-down
                    operations: [
                        {
                            name: 'Agent Spawn',
                            type: OperationType.AGENT_SPAWN,
                            weight: 15,
                            parameters: { agentType: 'mixed' },
                            expectedResponseTime: 2500
                        },
                        {
                            name: 'Agent Terminate',
                            type: OperationType.AGENT_TERMINATE,
                            weight: 10,
                            parameters: {},
                            expectedResponseTime: 1000
                        },
                        {
                            name: 'Message Send',
                            type: OperationType.MESSAGE_SEND,
                            weight: 35,
                            parameters: { messageSize: 'medium' },
                            expectedResponseTime: 150
                        },
                        {
                            name: 'Task Assign',
                            type: OperationType.TASK_ASSIGN,
                            weight: 25,
                            parameters: { taskComplexity: 'medium' },
                            expectedResponseTime: 300
                        },
                        {
                            name: 'Conductor Command',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 10,
                            parameters: { commandType: 'mixed' },
                            expectedResponseTime: 250
                        },
                        {
                            name: 'WebSocket Connection',
                            type: OperationType.WEBSOCKET_CONNECTION,
                            weight: 5,
                            parameters: {},
                            expectedResponseTime: 500
                        }
                    ]
                },
                duration: 390000, // 6.5 minutes total
                warmupTime: 30000,
                cooldownTime: 15000,
                targetMetrics: {
                    maxResponseTime: 5000,
                    avgResponseTime: 800,
                    p95ResponseTime: 2500,
                    p99ResponseTime: 4000,
                    minThroughput: 100, // operations per second
                    maxErrorRate: 0.02, // 2%
                    maxCpuUsage: 0.6, // 60%
                    maxMemoryUsage: 300 * 1024 * 1024, // 300 MB
                    maxMemoryGrowth: 5 * 1024 * 1024 // 5 MB per minute
                },
                environment: 'test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            expect(results.errorRate).toBeLessThan(0.02);
            expect(results.avgResponseTime).toBeLessThan(800);
            expect(results.operationsPerSecond).toBeGreaterThan(100);
            expect(results.peakMemoryUsage).toBeLessThan(300 * 1024 * 1024);

            // Log key metrics for analysis
            console.log('Daily Active User Load Results:', {
                totalOperations: results.totalOperations,
                avgResponseTime: results.avgResponseTime,
                p95ResponseTime: results.p95ResponseTime,
                operationsPerSecond: results.operationsPerSecond,
                errorRate: results.errorRate,
                peakCpuUsage: results.peakCpuUsage,
                peakMemoryUsage: results.peakMemoryUsage,
                memoryGrowthRate: results.memoryGrowthRate
            });
        }, 450000); // 7.5 minutes timeout
    });

    describe('Peak Traffic Simulation', () => {
        test('should handle 10x normal traffic load', async () => {
            const config: PerformanceTestConfig = {
                id: 'peak-traffic-10x',
                name: 'Peak Traffic - 10x Normal Load',
                description: 'Test system behavior under 10x normal traffic (500 concurrent users)',
                scenario: {
                    type: ScenarioType.STRESS,
                    users: 500,
                    rampUpTime: 120000, // 2 minutes ramp-up
                    sustainTime: 180000, // 3 minutes sustained
                    rampDownTime: 60000, // 1 minute ramp-down
                    operations: [
                        {
                            name: 'Agent Spawn',
                            type: OperationType.AGENT_SPAWN,
                            weight: 12,
                            parameters: { agentType: 'high-load' },
                            expectedResponseTime: 3000
                        },
                        {
                            name: 'Agent Terminate',
                            type: OperationType.AGENT_TERMINATE,
                            weight: 8,
                            parameters: {},
                            expectedResponseTime: 1500
                        },
                        {
                            name: 'Message Send',
                            type: OperationType.MESSAGE_SEND,
                            weight: 40,
                            parameters: { messageSize: 'large' },
                            expectedResponseTime: 300
                        },
                        {
                            name: 'Task Assign',
                            type: OperationType.TASK_ASSIGN,
                            weight: 25,
                            parameters: { taskComplexity: 'high' },
                            expectedResponseTime: 500
                        },
                        {
                            name: 'Conductor Command',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 10,
                            parameters: { commandType: 'complex' },
                            expectedResponseTime: 400
                        },
                        {
                            name: 'WebSocket Connection',
                            type: OperationType.WEBSOCKET_CONNECTION,
                            weight: 5,
                            parameters: { concurrent: true },
                            expectedResponseTime: 800
                        }
                    ]
                },
                duration: 360000, // 6 minutes total
                warmupTime: 60000,
                cooldownTime: 30000,
                targetMetrics: {
                    maxResponseTime: 10000,
                    avgResponseTime: 2000,
                    p95ResponseTime: 6000,
                    p99ResponseTime: 8000,
                    minThroughput: 500, // operations per second
                    maxErrorRate: 0.05, // 5%
                    maxCpuUsage: 0.85, // 85%
                    maxMemoryUsage: 1024 * 1024 * 1024, // 1 GB
                    maxMemoryGrowth: 20 * 1024 * 1024 // 20 MB per minute
                },
                environment: 'stress-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Under extreme load, some relaxed expectations
            expect(results.errorRate).toBeLessThan(0.05);
            expect(results.operationsPerSecond).toBeGreaterThan(500);
            expect(results.peakMemoryUsage).toBeLessThan(1024 * 1024 * 1024);

            // System should maintain basic functionality
            expect(results.successfulOperations).toBeGreaterThan(0);
            expect(results.avgResponseTime).toBeLessThan(5000); // Relaxed under extreme load

            console.log('Peak Traffic 10x Load Results:', {
                totalOperations: results.totalOperations,
                successfulOperations: results.successfulOperations,
                avgResponseTime: results.avgResponseTime,
                p95ResponseTime: results.p95ResponseTime,
                p99ResponseTime: results.p99ResponseTime,
                operationsPerSecond: results.operationsPerSecond,
                errorRate: results.errorRate,
                peakCpuUsage: results.peakCpuUsage,
                peakMemoryUsage: results.peakMemoryUsage,
                targetsAchieved: results.targetsAchieved,
                targetViolations: results.targetViolations
            });
        }, 450000); // 7.5 minutes timeout

        test('should handle sudden traffic spike', async () => {
            const config: PerformanceTestConfig = {
                id: 'sudden-traffic-spike',
                name: 'Sudden Traffic Spike Test',
                description: 'Test system response to sudden traffic spike (0 to 200 users in 10 seconds)',
                scenario: {
                    type: ScenarioType.SPIKE,
                    users: 200,
                    rampUpTime: 10000, // 10 seconds - very fast ramp-up
                    sustainTime: 120000, // 2 minutes sustained
                    rampDownTime: 30000, // 30 seconds ramp-down
                    operations: [
                        {
                            name: 'Agent Spawn',
                            type: OperationType.AGENT_SPAWN,
                            weight: 20,
                            parameters: { agentType: 'spike-test', priority: 'high' },
                            expectedResponseTime: 4000
                        },
                        {
                            name: 'Message Send',
                            type: OperationType.MESSAGE_SEND,
                            weight: 50,
                            parameters: { messageSize: 'burst' },
                            expectedResponseTime: 500
                        },
                        {
                            name: 'Conductor Command',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 20,
                            parameters: { commandType: 'urgent' },
                            expectedResponseTime: 600
                        },
                        {
                            name: 'WebSocket Connection',
                            type: OperationType.WEBSOCKET_CONNECTION,
                            weight: 10,
                            parameters: { burst: true },
                            expectedResponseTime: 1000
                        }
                    ]
                },
                duration: 160000, // 2.67 minutes total
                warmupTime: 15000,
                cooldownTime: 15000,
                targetMetrics: {
                    maxResponseTime: 8000,
                    avgResponseTime: 1500,
                    p95ResponseTime: 4000,
                    p99ResponseTime: 6000,
                    minThroughput: 200, // operations per second
                    maxErrorRate: 0.08, // 8% - higher tolerance for spikes
                    maxCpuUsage: 0.9, // 90%
                    maxMemoryUsage: 512 * 1024 * 1024, // 512 MB
                    maxMemoryGrowth: 50 * 1024 * 1024 // 50 MB per minute
                },
                environment: 'spike-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // During spike scenarios, system should remain stable
            expect(results.errorRate).toBeLessThan(0.1); // 10% tolerance for spikes
            expect(results.operationsPerSecond).toBeGreaterThan(150); // Reduced expectation
            expect(results.successfulOperations).toBeGreaterThan(results.totalOperations * 0.9);

            // Performance degradation is expected but should recover
            expect(results.peakMemoryUsage).toBeLessThan(512 * 1024 * 1024);

            console.log('Sudden Traffic Spike Results:', {
                totalOperations: results.totalOperations,
                avgResponseTime: results.avgResponseTime,
                p95ResponseTime: results.p95ResponseTime,
                operationsPerSecond: results.operationsPerSecond,
                errorRate: results.errorRate,
                peakCpuUsage: results.peakCpuUsage,
                peakMemoryUsage: results.peakMemoryUsage,
                memoryGrowthRate: results.memoryGrowthRate,
                targetsAchieved: results.targetsAchieved
            });
        }, 220000); // 3.67 minutes timeout
    });

    describe('Gradual Ramp-up Testing', () => {
        test('should handle gradual user ramp-up over extended period', async () => {
            const config: PerformanceTestConfig = {
                id: 'gradual-ramp-up',
                name: 'Gradual User Ramp-up Test',
                description: 'Test system behavior with gradual ramp-up to 150 users over 5 minutes',
                scenario: {
                    type: ScenarioType.LOAD,
                    users: 150,
                    rampUpTime: 300000, // 5 minutes gradual ramp-up
                    sustainTime: 240000, // 4 minutes sustained
                    rampDownTime: 120000, // 2 minutes ramp-down
                    operations: [
                        {
                            name: 'Agent Spawn',
                            type: OperationType.AGENT_SPAWN,
                            weight: 18,
                            parameters: { agentType: 'gradual-test' },
                            expectedResponseTime: 2200
                        },
                        {
                            name: 'Agent Terminate',
                            type: OperationType.AGENT_TERMINATE,
                            weight: 12,
                            parameters: {},
                            expectedResponseTime: 800
                        },
                        {
                            name: 'Message Send',
                            type: OperationType.MESSAGE_SEND,
                            weight: 35,
                            parameters: { messageSize: 'variable' },
                            expectedResponseTime: 200
                        },
                        {
                            name: 'Task Assign',
                            type: OperationType.TASK_ASSIGN,
                            weight: 20,
                            parameters: { taskComplexity: 'adaptive' },
                            expectedResponseTime: 350
                        },
                        {
                            name: 'Conductor Command',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 10,
                            parameters: { commandType: 'monitoring' },
                            expectedResponseTime: 300
                        },
                        {
                            name: 'Session Management',
                            type: OperationType.SESSION_MANAGEMENT,
                            weight: 5,
                            parameters: { operation: 'maintain' },
                            expectedResponseTime: 100
                        }
                    ]
                },
                duration: 660000, // 11 minutes total
                warmupTime: 30000,
                cooldownTime: 30000,
                targetMetrics: {
                    maxResponseTime: 6000,
                    avgResponseTime: 1000,
                    p95ResponseTime: 3000,
                    p99ResponseTime: 5000,
                    minThroughput: 150, // operations per second
                    maxErrorRate: 0.03, // 3%
                    maxCpuUsage: 0.7, // 70%
                    maxMemoryUsage: 400 * 1024 * 1024, // 400 MB
                    maxMemoryGrowth: 10 * 1024 * 1024 // 10 MB per minute
                },
                environment: 'gradual-load-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Gradual ramp-up should maintain good performance
            expect(results.errorRate).toBeLessThan(0.03);
            expect(results.avgResponseTime).toBeLessThan(1000);
            expect(results.p95ResponseTime).toBeLessThan(3000);
            expect(results.operationsPerSecond).toBeGreaterThan(150);

            // Memory growth should be controlled
            expect(results.memoryGrowthRate).toBeLessThan(10 * 1024 * 1024);

            console.log('Gradual Ramp-up Results:', {
                totalOperations: results.totalOperations,
                duration: results.duration,
                avgResponseTime: results.avgResponseTime,
                p95ResponseTime: results.p95ResponseTime,
                operationsPerSecond: results.operationsPerSecond,
                errorRate: results.errorRate,
                peakCpuUsage: results.peakCpuUsage,
                avgCpuUsage: results.avgCpuUsage,
                peakMemoryUsage: results.peakMemoryUsage,
                memoryGrowthRate: results.memoryGrowthRate,
                targetsAchieved: results.targetsAchieved
            });
        }, 750000); // 12.5 minutes timeout
    });

    describe('Sustained Load Testing', () => {
        test('should maintain performance under sustained load', async () => {
            const config: PerformanceTestConfig = {
                id: 'sustained-load',
                name: 'Sustained Load Test',
                description: 'Test system stability under sustained load for extended period',
                scenario: {
                    type: ScenarioType.ENDURANCE,
                    users: 100,
                    rampUpTime: 120000, // 2 minutes ramp-up
                    sustainTime: 1800000, // 30 minutes sustained load
                    rampDownTime: 60000, // 1 minute ramp-down
                    operations: [
                        {
                            name: 'Agent Spawn',
                            type: OperationType.AGENT_SPAWN,
                            weight: 15,
                            parameters: { agentType: 'endurance-test' },
                            expectedResponseTime: 2000
                        },
                        {
                            name: 'Agent Terminate',
                            type: OperationType.AGENT_TERMINATE,
                            weight: 10,
                            parameters: {},
                            expectedResponseTime: 1000
                        },
                        {
                            name: 'Message Send',
                            type: OperationType.MESSAGE_SEND,
                            weight: 40,
                            parameters: { messageSize: 'consistent' },
                            expectedResponseTime: 150
                        },
                        {
                            name: 'Task Assign',
                            type: OperationType.TASK_ASSIGN,
                            weight: 20,
                            parameters: { taskComplexity: 'standard' },
                            expectedResponseTime: 300
                        },
                        {
                            name: 'Conductor Command',
                            type: OperationType.CONDUCTOR_COMMAND,
                            weight: 10,
                            parameters: { commandType: 'routine' },
                            expectedResponseTime: 250
                        },
                        {
                            name: 'Configuration Update',
                            type: OperationType.CONFIGURATION_UPDATE,
                            weight: 3,
                            parameters: { frequency: 'low' },
                            expectedResponseTime: 200
                        },
                        {
                            name: 'Session Management',
                            type: OperationType.SESSION_MANAGEMENT,
                            weight: 2,
                            parameters: { operation: 'periodic' },
                            expectedResponseTime: 100
                        }
                    ]
                },
                duration: 1980000, // 33 minutes total
                warmupTime: 60000,
                cooldownTime: 60000,
                targetMetrics: {
                    maxResponseTime: 4000,
                    avgResponseTime: 600,
                    p95ResponseTime: 1800,
                    p99ResponseTime: 3000,
                    minThroughput: 120, // operations per second
                    maxErrorRate: 0.02, // 2%
                    maxCpuUsage: 0.65, // 65%
                    maxMemoryUsage: 350 * 1024 * 1024, // 350 MB
                    maxMemoryGrowth: 3 * 1024 * 1024 // 3 MB per minute - very low growth
                },
                environment: 'endurance-test'
            };

            const results = await performanceFramework.runPerformanceTest(config);

            // Sustained load should maintain stable performance
            expect(results.errorRate).toBeLessThan(0.02);
            expect(results.avgResponseTime).toBeLessThan(600);
            expect(results.operationsPerSecond).toBeGreaterThan(120);

            // Critical: Memory growth should be minimal indicating no leaks
            expect(results.memoryGrowthRate).toBeLessThan(5 * 1024 * 1024); // Allow some tolerance

            // Performance should not degrade significantly over time
            expect(results.p95ResponseTime).toBeLessThan(1800);

            console.log('Sustained Load Results:', {
                duration: `${results.duration / 60000} minutes`,
                totalOperations: results.totalOperations,
                avgResponseTime: results.avgResponseTime,
                p95ResponseTime: results.p95ResponseTime,
                p99ResponseTime: results.p99ResponseTime,
                operationsPerSecond: results.operationsPerSecond,
                errorRate: results.errorRate,
                peakCpuUsage: results.peakCpuUsage,
                avgCpuUsage: results.avgCpuUsage,
                peakMemoryUsage: `${results.peakMemoryUsage / (1024 * 1024)} MB`,
                avgMemoryUsage: `${results.avgMemoryUsage / (1024 * 1024)} MB`,
                memoryGrowthRate: `${results.memoryGrowthRate / (1024 * 1024)} MB/min`,
                targetsAchieved: results.targetsAchieved,
                gcCount: results.gcCount,
                gcTotalTime: results.gcTotalTime
            });

            // Additional validation for endurance test
            expect(results.totalOperations).toBeGreaterThan(200000); // Should process many operations
            expect(results.targetsAchieved).toBe(true);
        }, 2100000); // 35 minutes timeout
    });
});
