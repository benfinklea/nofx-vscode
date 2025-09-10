/**
 * Performance Test Execution Example for NofX VS Code Extension
 *
 * Demonstrates comprehensive performance test execution including:
 * - Test suite configuration and execution
 * - Results analysis and reporting
 * - Bottleneck identification
 * - Optimization recommendations
 */

import { PerformanceTestRunner, PerformanceTestSuite } from './PerformanceTestRunner';
import { PerformanceTestConfig, ScenarioType, OperationType } from './PerformanceTestFramework';

describe('Performance Test Execution and Analysis', () => {
    let testRunner: PerformanceTestRunner;

    beforeAll(() => {
        testRunner = new PerformanceTestRunner();
    });

    test('should execute comprehensive performance test suite and generate analysis', async () => {
        // Define comprehensive test suite
        const comprehensiveTestSuite: PerformanceTestSuite = {
            id: 'nofx-comprehensive-performance',
            name: 'NofX Comprehensive Performance Test Suite',
            description: 'Complete performance validation covering all critical scenarios',
            environment: 'performance-validation',
            tests: [
                // Baseline Performance Test
                {
                    id: 'baseline-performance',
                    name: 'Baseline Performance Test',
                    description: 'Establish baseline performance metrics',
                    scenario: {
                        type: ScenarioType.BASELINE,
                        users: 10,
                        rampUpTime: 30000,
                        sustainTime: 120000,
                        rampDownTime: 30000,
                        operations: [
                            {
                                name: 'Agent Spawn',
                                type: OperationType.AGENT_SPAWN,
                                weight: 30,
                                parameters: { agentType: 'baseline' },
                                expectedResponseTime: 1500
                            },
                            {
                                name: 'Message Send',
                                type: OperationType.MESSAGE_SEND,
                                weight: 50,
                                parameters: { messageSize: 'medium' },
                                expectedResponseTime: 100
                            },
                            {
                                name: 'Task Assign',
                                type: OperationType.TASK_ASSIGN,
                                weight: 20,
                                parameters: { taskComplexity: 'medium' },
                                expectedResponseTime: 300
                            }
                        ]
                    },
                    duration: 180000,
                    warmupTime: 15000,
                    cooldownTime: 15000,
                    targetMetrics: {
                        maxResponseTime: 2000,
                        avgResponseTime: 400,
                        p95ResponseTime: 1000,
                        p99ResponseTime: 1500,
                        minThroughput: 50,
                        maxErrorRate: 0.01,
                        maxCpuUsage: 0.4,
                        maxMemoryUsage: 200 * 1024 * 1024,
                        maxMemoryGrowth: 2 * 1024 * 1024
                    },
                    environment: 'baseline'
                },

                // Load Testing
                {
                    id: 'load-test-normal',
                    name: 'Normal Load Test',
                    description: 'Test under normal expected load',
                    scenario: {
                        type: ScenarioType.LOAD,
                        users: 50,
                        rampUpTime: 60000,
                        sustainTime: 240000,
                        rampDownTime: 30000,
                        operations: [
                            {
                                name: 'Agent Operations',
                                type: OperationType.AGENT_SPAWN,
                                weight: 25,
                                parameters: { agentType: 'load-test' },
                                expectedResponseTime: 2000
                            },
                            {
                                name: 'Messaging',
                                type: OperationType.MESSAGE_SEND,
                                weight: 40,
                                parameters: { messageSize: 'variable' },
                                expectedResponseTime: 150
                            },
                            {
                                name: 'Task Processing',
                                type: OperationType.TASK_ASSIGN,
                                weight: 25,
                                parameters: { taskComplexity: 'high' },
                                expectedResponseTime: 400
                            },
                            {
                                name: 'WebSocket Connections',
                                type: OperationType.WEBSOCKET_CONNECTION,
                                weight: 10,
                                parameters: { concurrent: true },
                                expectedResponseTime: 500
                            }
                        ]
                    },
                    duration: 330000,
                    warmupTime: 30000,
                    cooldownTime: 30000,
                    targetMetrics: {
                        maxResponseTime: 3000,
                        avgResponseTime: 600,
                        p95ResponseTime: 1500,
                        p99ResponseTime: 2200,
                        minThroughput: 120,
                        maxErrorRate: 0.02,
                        maxCpuUsage: 0.6,
                        maxMemoryUsage: 400 * 1024 * 1024,
                        maxMemoryGrowth: 5 * 1024 * 1024
                    },
                    environment: 'load-test'
                },

                // Stress Testing
                {
                    id: 'stress-test-peak',
                    name: 'Peak Load Stress Test',
                    description: 'Test system under peak stress conditions',
                    scenario: {
                        type: ScenarioType.STRESS,
                        users: 200,
                        rampUpTime: 120000,
                        sustainTime: 180000,
                        rampDownTime: 60000,
                        operations: [
                            {
                                name: 'Stress Agent Spawn',
                                type: OperationType.AGENT_SPAWN,
                                weight: 20,
                                parameters: { stressTest: true, agentType: 'stress' },
                                expectedResponseTime: 4000
                            },
                            {
                                name: 'High Volume Messaging',
                                type: OperationType.MESSAGE_SEND,
                                weight: 50,
                                parameters: { messageSize: 'large', highVolume: true },
                                expectedResponseTime: 400
                            },
                            {
                                name: 'Complex Tasks',
                                type: OperationType.TASK_ASSIGN,
                                weight: 25,
                                parameters: { taskComplexity: 'maximum' },
                                expectedResponseTime: 1000
                            },
                            {
                                name: 'Concurrent WebSockets',
                                type: OperationType.WEBSOCKET_CONNECTION,
                                weight: 5,
                                parameters: { maxConcurrent: true },
                                expectedResponseTime: 1500
                            }
                        ]
                    },
                    duration: 360000,
                    warmupTime: 30000,
                    cooldownTime: 30000,
                    targetMetrics: {
                        maxResponseTime: 8000,
                        avgResponseTime: 1500,
                        p95ResponseTime: 4000,
                        p99ResponseTime: 6000,
                        minThroughput: 150,
                        maxErrorRate: 0.05,
                        maxCpuUsage: 0.85,
                        maxMemoryUsage: 800 * 1024 * 1024,
                        maxMemoryGrowth: 20 * 1024 * 1024
                    },
                    environment: 'stress-test'
                },

                // Endurance Testing
                {
                    id: 'endurance-test-long',
                    name: 'Extended Endurance Test',
                    description: 'Test system stability over extended period',
                    scenario: {
                        type: ScenarioType.ENDURANCE,
                        users: 30,
                        rampUpTime: 60000,
                        sustainTime: 900000, // 15 minutes for demo (would be hours in production)
                        rampDownTime: 60000,
                        operations: [
                            {
                                name: 'Continuous Agent Operations',
                                type: OperationType.AGENT_SPAWN,
                                weight: 20,
                                parameters: { enduranceTest: true, agentType: 'endurance' },
                                expectedResponseTime: 2000
                            },
                            {
                                name: 'Sustained Messaging',
                                type: OperationType.MESSAGE_SEND,
                                weight: 60,
                                parameters: { messageSize: 'medium', sustained: true },
                                expectedResponseTime: 200
                            },
                            {
                                name: 'Periodic Tasks',
                                type: OperationType.TASK_ASSIGN,
                                weight: 15,
                                parameters: { taskComplexity: 'medium', periodic: true },
                                expectedResponseTime: 500
                            },
                            {
                                name: 'Session Management',
                                type: OperationType.SESSION_MANAGEMENT,
                                weight: 5,
                                parameters: { operation: 'maintain', longRunning: true },
                                expectedResponseTime: 300
                            }
                        ]
                    },
                    duration: 1020000,
                    warmupTime: 30000,
                    cooldownTime: 30000,
                    targetMetrics: {
                        maxResponseTime: 3000,
                        avgResponseTime: 500,
                        p95ResponseTime: 1200,
                        p99ResponseTime: 2000,
                        minThroughput: 80,
                        maxErrorRate: 0.01,
                        maxCpuUsage: 0.5,
                        maxMemoryUsage: 300 * 1024 * 1024,
                        maxMemoryGrowth: 2 * 1024 * 1024 // Critical: minimal growth over time
                    },
                    environment: 'endurance-test'
                }
            ]
        };

        console.log('Starting comprehensive performance test suite execution...');

        // Execute the test suite
        const results = await testRunner.runTestSuite(comprehensiveTestSuite);

        // Validate results
        expect(results).toBeDefined();
        expect(results.suiteId).toBe('nofx-comprehensive-performance');
        expect(results.testResults.length).toBe(4);
        expect(results.aggregatedMetrics).toBeDefined();
        expect(results.bottlenecks).toBeDefined();
        expect(results.recommendations).toBeDefined();

        // Log comprehensive analysis
        console.log('\n=== PERFORMANCE TEST EXECUTION COMPLETE ===\n');

        console.log('📊 EXECUTIVE SUMMARY:');
        console.log(`Suite: ${results.suiteName}`);
        console.log(`Status: ${results.passFailStatus}`);
        console.log(`Duration: ${(results.totalDuration / 1000 / 60).toFixed(2)} minutes`);
        console.log(`Total Operations: ${results.aggregatedMetrics.totalOperations.toLocaleString()}`);

        console.log('\n📈 KEY PERFORMANCE METRICS:');
        console.log(`Overall Throughput: ${results.aggregatedMetrics.overallThroughput.toFixed(2)} ops/sec`);
        console.log(`Average Response Time: ${results.aggregatedMetrics.averageResponseTime.toFixed(2)}ms`);
        console.log(`P95 Response Time: ${results.aggregatedMetrics.p95ResponseTime.toFixed(2)}ms`);
        console.log(`P99 Response Time: ${results.aggregatedMetrics.p99ResponseTime.toFixed(2)}ms`);
        console.log(`Overall Error Rate: ${(results.aggregatedMetrics.overallErrorRate * 100).toFixed(2)}%`);
        console.log(`Peak CPU Usage: ${(results.aggregatedMetrics.peakResourceUsage.cpu * 100).toFixed(2)}%`);
        console.log(
            `Peak Memory Usage: ${(results.aggregatedMetrics.peakResourceUsage.memory / (1024 * 1024)).toFixed(2)}MB`
        );

        console.log('\n🧪 TEST COVERAGE:');
        console.log(`Load Testing: ${results.aggregatedMetrics.testCoverage.loadTesting ? '✅' : '❌'}`);
        console.log(`Stress Testing: ${results.aggregatedMetrics.testCoverage.stressTesting ? '✅' : '❌'}`);
        console.log(`Endurance Testing: ${results.aggregatedMetrics.testCoverage.enduranceTesting ? '✅' : '❌'}`);
        console.log(`Overall Coverage: ${results.aggregatedMetrics.testCoverage.coveragePercentage.toFixed(1)}%`);

        console.log('\n🔍 INDIVIDUAL TEST RESULTS:');
        results.testResults.forEach((test, index) => {
            console.log(`${index + 1}. ${test.testId}: ${test.targetsAchieved ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`   Throughput: ${test.operationsPerSecond.toFixed(2)} ops/sec`);
            console.log(`   Avg Response: ${test.avgResponseTime.toFixed(2)}ms`);
            console.log(`   Error Rate: ${(test.errorRate * 100).toFixed(2)}%`);
            if (test.targetViolations.length > 0) {
                console.log(`   ⚠️  Violations: ${test.targetViolations.length}`);
            }
        });

        console.log('\n🚨 BOTTLENECK ANALYSIS:');
        if (results.bottlenecks.length > 0) {
            results.bottlenecks.forEach((bottleneck, index) => {
                console.log(`${index + 1}. ${bottleneck.type} Bottleneck (${bottleneck.severity} severity)`);
                console.log(`   Impact: ${bottleneck.performanceImpact.toFixed(1)}%`);
                console.log(`   Description: ${bottleneck.description}`);
                console.log(`   Affected Tests: ${bottleneck.affectedOperations.length}`);
            });
        } else {
            console.log('✅ No significant bottlenecks detected');
        }

        console.log('\n💡 OPTIMIZATION RECOMMENDATIONS:');
        results.recommendations.slice(0, 5).forEach((rec, index) => {
            console.log(`${index + 1}. ${rec.title} (${rec.priority} priority)`);
            console.log(`   Category: ${rec.category}`);
            console.log(`   Expected Improvement: ${rec.expectedImprovement}`);
            console.log(`   Implementation Effort: ${rec.implementationEffort}`);
        });

        console.log('\n📝 PERFORMANCE ASSESSMENT:');
        if (results.passFailStatus === 'PASS') {
            console.log('✅ EXCELLENT: All performance tests passed successfully!');
            console.log('   The system meets all defined performance criteria.');
            console.log('   Consider implementing the recommendations for further optimization.');
        } else if (results.passFailStatus === 'PARTIAL') {
            console.log('⚠️  ATTENTION NEEDED: Some performance tests failed.');
            console.log('   Review the bottlenecks and implement high-priority recommendations.');
            console.log('   Focus on addressing critical and high-severity issues first.');
        } else {
            console.log('❌ CRITICAL: Performance tests failed significantly.');
            console.log('   Immediate action required to address performance issues.');
            console.log('   System may not be ready for production deployment.');
        }

        // Generate and save comprehensive report
        const markdownReport = testRunner.generateReport(results, 'markdown');
        console.log('\n📋 COMPREHENSIVE REPORT GENERATED');
        console.log('Report preview (first 500 characters):');
        console.log(markdownReport.substring(0, 500) + '...');

        // Performance test validation
        expect(results.aggregatedMetrics.overallThroughput).toBeGreaterThan(50);
        expect(results.aggregatedMetrics.overallErrorRate).toBeLessThan(0.1);
        expect(results.aggregatedMetrics.testCoverage.coveragePercentage).toBeGreaterThan(60);

        // Success criteria based on test results
        const criticalBottlenecks = results.bottlenecks.filter(b => b.severity === 'CRITICAL');
        expect(criticalBottlenecks.length).toBeLessThan(3); // Should have fewer than 3 critical bottlenecks

        console.log('\n🎯 PERFORMANCE TEST EXECUTION SUMMARY:');
        console.log(`✅ Test suite executed successfully`);
        console.log(`📊 ${results.testResults.length} performance tests completed`);
        console.log(`🔍 ${results.bottlenecks.length} bottlenecks identified`);
        console.log(`💡 ${results.recommendations.length} optimization opportunities found`);
        console.log(`📈 Overall system performance: ${results.passFailStatus}`);
    }, 1800000); // 30 minutes timeout for comprehensive test
});
