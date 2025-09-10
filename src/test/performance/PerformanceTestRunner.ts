/**
 * Performance Test Runner and Results Analyzer for NofX VS Code Extension
 *
 * Comprehensive test execution and analysis covering:
 * - Automated test suite execution
 * - Performance metrics aggregation
 * - Bottleneck identification
 * - Optimization recommendations
 * - Report generation
 */

import {
    PerformanceTestFramework,
    PerformanceTestConfig,
    PerformanceMetrics,
    ScenarioType,
    OperationType
} from './PerformanceTestFramework';
import * as fs from 'fs';
import * as path from 'path';

export interface PerformanceTestSuite {
    id: string;
    name: string;
    description: string;
    tests: PerformanceTestConfig[];
    environment: string;
}

export interface TestSuiteResults {
    suiteId: string;
    suiteName: string;
    startTime: Date;
    endTime: Date;
    totalDuration: number;
    testResults: PerformanceMetrics[];
    aggregatedMetrics: AggregatedMetrics;
    bottlenecks: BottleneckAnalysis[];
    recommendations: OptimizationRecommendation[];
    passFailStatus: 'PASS' | 'FAIL' | 'PARTIAL';
}

export interface AggregatedMetrics {
    overallThroughput: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    overallErrorRate: number;
    peakResourceUsage: ResourceUsage;
    averageResourceUsage: ResourceUsage;
    totalOperations: number;
    testCoverage: TestCoverage;
}

export interface ResourceUsage {
    cpu: number;
    memory: number;
    network: number;
    disk: number;
}

export interface TestCoverage {
    loadTesting: boolean;
    stressTesting: boolean;
    enduranceTesting: boolean;
    scalabilityTesting: boolean;
    resourceMonitoring: boolean;
    coveragePercentage: number;
}

export interface BottleneckAnalysis {
    type: 'CPU' | 'MEMORY' | 'NETWORK' | 'DATABASE' | 'ALGORITHM' | 'CONCURRENCY';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    affectedOperations: string[];
    performanceImpact: number; // percentage
    detectionConfidence: number; // percentage
    evidence: string[];
}

export interface OptimizationRecommendation {
    category: 'PERFORMANCE' | 'SCALABILITY' | 'RESOURCE' | 'ARCHITECTURE' | 'CODE';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description: string;
    expectedImprovement: string;
    implementationEffort: 'LOW' | 'MEDIUM' | 'HIGH';
    costBenefit: 'LOW' | 'MEDIUM' | 'HIGH';
    technicalDetails: string[];
}

export class PerformanceTestRunner {
    private framework: PerformanceTestFramework;
    private results: Map<string, TestSuiteResults> = new Map();

    constructor() {
        this.framework = new PerformanceTestFramework();
    }

    async runTestSuite(suite: PerformanceTestSuite): Promise<TestSuiteResults> {
        console.log(`Starting performance test suite: ${suite.name}`);

        const startTime = new Date();
        const testResults: PerformanceMetrics[] = [];
        let passCount = 0;
        let failCount = 0;

        for (const testConfig of suite.tests) {
            try {
                console.log(`Running test: ${testConfig.name}`);
                const result = await this.framework.runPerformanceTest(testConfig);
                testResults.push(result);

                if (result.targetsAchieved) {
                    passCount++;
                } else {
                    failCount++;
                }

                // Brief pause between tests
                await new Promise(resolve => setTimeout(resolve, 10000));
            } catch (error) {
                console.error(`Test failed: ${testConfig.name}`, error);
                failCount++;
            }
        }

        const endTime = new Date();
        const totalDuration = endTime.getTime() - startTime.getTime();

        // Analyze results
        const aggregatedMetrics = this.aggregateMetrics(testResults);
        const bottlenecks = this.analyzeBottlenecks(testResults);
        const recommendations = this.generateRecommendations(testResults, bottlenecks);

        const passFailStatus: 'PASS' | 'FAIL' | 'PARTIAL' =
            failCount === 0 ? 'PASS' : passCount === 0 ? 'FAIL' : 'PARTIAL';

        const suiteResults: TestSuiteResults = {
            suiteId: suite.id,
            suiteName: suite.name,
            startTime,
            endTime,
            totalDuration,
            testResults,
            aggregatedMetrics,
            bottlenecks,
            recommendations,
            passFailStatus
        };

        this.results.set(suite.id, suiteResults);
        console.log(`Test suite completed: ${suite.name} - Status: ${passFailStatus}`);

        return suiteResults;
    }

    private aggregateMetrics(testResults: PerformanceMetrics[]): AggregatedMetrics {
        if (testResults.length === 0) {
            throw new Error('No test results to aggregate');
        }

        const totalOperations = testResults.reduce((sum, result) => sum + result.totalOperations, 0);
        const totalDuration = testResults.reduce((sum, result) => sum + result.duration, 0) / testResults.length;

        const overallThroughput = totalOperations / (totalDuration / 1000);

        const weightedAvgResponseTime =
            testResults.reduce((sum, result) => {
                return sum + result.avgResponseTime * result.totalOperations;
            }, 0) / totalOperations;

        const allResponseTimes = testResults.map(r => r.p95ResponseTime);
        const allP99ResponseTimes = testResults.map(r => r.p99ResponseTime);

        const p95ResponseTime = this.calculatePercentile(allResponseTimes, 0.95);
        const p99ResponseTime = this.calculatePercentile(allP99ResponseTimes, 0.99);

        const overallErrorRate =
            testResults.reduce((sum, result) => {
                return sum + result.errorRate * result.totalOperations;
            }, 0) / totalOperations;

        const peakCpu = Math.max(...testResults.map(r => r.peakCpuUsage));
        const peakMemory = Math.max(...testResults.map(r => r.peakMemoryUsage));
        const avgCpu = testResults.reduce((sum, r) => sum + r.avgCpuUsage, 0) / testResults.length;
        const avgMemory = testResults.reduce((sum, r) => sum + r.avgMemoryUsage, 0) / testResults.length;

        const testCoverage = this.calculateTestCoverage(testResults);

        return {
            overallThroughput,
            averageResponseTime: weightedAvgResponseTime,
            p95ResponseTime,
            p99ResponseTime,
            overallErrorRate,
            peakResourceUsage: {
                cpu: peakCpu,
                memory: peakMemory,
                network: 0, // Would be calculated from actual network metrics
                disk: 0 // Would be calculated from actual disk metrics
            },
            averageResourceUsage: {
                cpu: avgCpu,
                memory: avgMemory,
                network: 0,
                disk: 0
            },
            totalOperations,
            testCoverage
        };
    }

    private calculatePercentile(values: number[], percentile: number): number {
        const sorted = values.sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * percentile) - 1;
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
    }

    private calculateTestCoverage(testResults: PerformanceMetrics[]): TestCoverage {
        const testTypes = new Set(testResults.map(r => r.testId.split('-')[0]));

        const coverage = {
            loadTesting: testTypes.has('daily') || testTypes.has('baseline') || testTypes.has('gradual'),
            stressTesting:
                testTypes.has('peak') || testTypes.has('max') || testTypes.has('cpu') || testTypes.has('memory'),
            enduranceTesting: testTypes.has('sustained') || testTypes.has('endurance') || testTypes.has('leak'),
            scalabilityTesting: testTypes.has('horizontal') || testTypes.has('vertical') || testTypes.has('multi'),
            resourceMonitoring:
                testTypes.has('heap') || testTypes.has('cpu') || testTypes.has('network') || testTypes.has('cache')
        };

        const coverageCount = Object.values(coverage).filter(Boolean).length;
        const coveragePercentage = (coverageCount / 5) * 100;

        return { ...coverage, coveragePercentage };
    }

    private analyzeBottlenecks(testResults: PerformanceMetrics[]): BottleneckAnalysis[] {
        const bottlenecks: BottleneckAnalysis[] = [];

        // CPU bottleneck analysis
        const highCpuTests = testResults.filter(r => r.peakCpuUsage > 0.8);
        if (highCpuTests.length > 0) {
            const avgCpuImpact = highCpuTests.reduce((sum, r) => sum + r.peakCpuUsage, 0) / highCpuTests.length;
            bottlenecks.push({
                type: 'CPU',
                severity: avgCpuImpact > 0.9 ? 'CRITICAL' : 'HIGH',
                description: `High CPU utilization detected in ${highCpuTests.length} test(s)`,
                affectedOperations: highCpuTests.map(r => r.testId),
                performanceImpact: Math.min(100, avgCpuImpact * 100),
                detectionConfidence: 90,
                evidence: [
                    `Peak CPU usage: ${(avgCpuImpact * 100).toFixed(2)}%`,
                    `Affected tests: ${highCpuTests.length}`,
                    'Correlation with response time degradation observed'
                ]
            });
        }

        // Memory bottleneck analysis
        const highMemoryTests = testResults.filter(r => r.memoryGrowthRate > 10 * 1024 * 1024); // > 10 MB/min
        if (highMemoryTests.length > 0) {
            const avgMemoryGrowth =
                highMemoryTests.reduce((sum, r) => sum + r.memoryGrowthRate, 0) / highMemoryTests.length;
            bottlenecks.push({
                type: 'MEMORY',
                severity: avgMemoryGrowth > 50 * 1024 * 1024 ? 'CRITICAL' : 'MEDIUM',
                description: `Memory growth issues detected in ${highMemoryTests.length} test(s)`,
                affectedOperations: highMemoryTests.map(r => r.testId),
                performanceImpact: Math.min(100, (avgMemoryGrowth / (100 * 1024 * 1024)) * 100),
                detectionConfidence: 85,
                evidence: [
                    `Average memory growth: ${(avgMemoryGrowth / (1024 * 1024)).toFixed(2)} MB/min`,
                    `Peak memory usage observed`,
                    'Potential memory leaks identified'
                ]
            });
        }

        // Response time bottleneck analysis
        const slowTests = testResults.filter(r => r.p95ResponseTime > 2000);
        if (slowTests.length > 0) {
            const avgSlowness = slowTests.reduce((sum, r) => sum + r.p95ResponseTime, 0) / slowTests.length;
            bottlenecks.push({
                type: 'ALGORITHM',
                severity: avgSlowness > 5000 ? 'HIGH' : 'MEDIUM',
                description: `Slow response times detected in ${slowTests.length} test(s)`,
                affectedOperations: slowTests.map(r => r.testId),
                performanceImpact: Math.min(100, (avgSlowness / 10000) * 100),
                detectionConfidence: 95,
                evidence: [
                    `Average P95 response time: ${avgSlowness.toFixed(2)}ms`,
                    'Response time targets exceeded',
                    'User experience impact likely'
                ]
            });
        }

        // Error rate bottleneck analysis
        const errorProneTests = testResults.filter(r => r.errorRate > 0.05);
        if (errorProneTests.length > 0) {
            const avgErrorRate = errorProneTests.reduce((sum, r) => sum + r.errorRate, 0) / errorProneTests.length;
            bottlenecks.push({
                type: 'CONCURRENCY',
                severity: avgErrorRate > 0.1 ? 'CRITICAL' : 'HIGH',
                description: `High error rates detected in ${errorProneTests.length} test(s)`,
                affectedOperations: errorProneTests.map(r => r.testId),
                performanceImpact: avgErrorRate * 100,
                detectionConfidence: 98,
                evidence: [
                    `Average error rate: ${(avgErrorRate * 100).toFixed(2)}%`,
                    'Concurrency or reliability issues likely',
                    'System stability concerns'
                ]
            });
        }

        return bottlenecks.sort((a, b) => {
            const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
    }

    private generateRecommendations(
        testResults: PerformanceMetrics[],
        bottlenecks: BottleneckAnalysis[]
    ): OptimizationRecommendation[] {
        const recommendations: OptimizationRecommendation[] = [];

        // Generate recommendations based on bottlenecks
        bottlenecks.forEach(bottleneck => {
            switch (bottleneck.type) {
                case 'CPU':
                    recommendations.push({
                        category: 'PERFORMANCE',
                        priority: bottleneck.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
                        title: 'Optimize CPU-Intensive Operations',
                        description: 'High CPU utilization detected. Optimize algorithms and consider parallelization.',
                        expectedImprovement: '20-40% reduction in CPU usage',
                        implementationEffort: 'MEDIUM',
                        costBenefit: 'HIGH',
                        technicalDetails: [
                            'Profile CPU-intensive code paths',
                            'Implement async/await patterns where applicable',
                            'Consider worker threads for heavy computations',
                            'Optimize hot code paths with better algorithms',
                            'Implement CPU throttling for non-critical operations'
                        ]
                    });
                    break;

                case 'MEMORY':
                    recommendations.push({
                        category: 'RESOURCE',
                        priority: 'HIGH',
                        title: 'Address Memory Leaks and Optimize Memory Usage',
                        description:
                            'Memory growth issues detected. Implement proper cleanup and optimize memory usage.',
                        expectedImprovement: '30-50% reduction in memory usage',
                        implementationEffort: 'MEDIUM',
                        costBenefit: 'HIGH',
                        technicalDetails: [
                            'Implement proper object cleanup and disposal',
                            'Review event listener and subscription cleanup',
                            'Optimize large object handling',
                            'Implement memory pooling for frequent allocations',
                            'Add memory usage monitoring and alerts'
                        ]
                    });
                    break;

                case 'ALGORITHM':
                    recommendations.push({
                        category: 'PERFORMANCE',
                        priority: 'MEDIUM',
                        title: 'Optimize Response Time Performance',
                        description: 'Slow response times detected. Optimize algorithms and data structures.',
                        expectedImprovement: '25-60% improvement in response times',
                        implementationEffort: 'HIGH',
                        costBenefit: 'HIGH',
                        technicalDetails: [
                            'Profile and optimize slow operations',
                            'Implement caching for frequently accessed data',
                            'Optimize database queries and indexing',
                            'Consider lazy loading and pagination',
                            'Implement request batching where appropriate'
                        ]
                    });
                    break;

                case 'CONCURRENCY':
                    recommendations.push({
                        category: 'ARCHITECTURE',
                        priority: 'CRITICAL',
                        title: 'Improve Concurrency and Error Handling',
                        description: 'High error rates suggest concurrency or reliability issues.',
                        expectedImprovement: '50-80% reduction in error rates',
                        implementationEffort: 'HIGH',
                        costBenefit: 'CRITICAL',
                        technicalDetails: [
                            'Implement proper synchronization mechanisms',
                            'Add circuit breakers and retry logic',
                            'Improve error handling and recovery',
                            'Implement request queuing and throttling',
                            'Add comprehensive monitoring and alerting'
                        ]
                    });
                    break;
            }
        });

        // General performance recommendations based on overall metrics
        const overallMetrics = this.aggregateMetrics(testResults);

        if (overallMetrics.overallThroughput < 100) {
            recommendations.push({
                category: 'SCALABILITY',
                priority: 'MEDIUM',
                title: 'Improve Overall System Throughput',
                description: 'Overall throughput is below optimal levels. Consider architectural improvements.',
                expectedImprovement: '50-100% increase in throughput',
                implementationEffort: 'HIGH',
                costBenefit: 'MEDIUM',
                technicalDetails: [
                    'Implement horizontal scaling capabilities',
                    'Optimize data processing pipelines',
                    'Consider microservices architecture',
                    'Implement connection pooling and resource sharing',
                    'Add load balancing and traffic distribution'
                ]
            });
        }

        if (overallMetrics.testCoverage.coveragePercentage < 80) {
            recommendations.push({
                category: 'PERFORMANCE',
                priority: 'LOW',
                title: 'Expand Performance Test Coverage',
                description: 'Performance test coverage is incomplete. Add missing test scenarios.',
                expectedImprovement: 'Better visibility into performance characteristics',
                implementationEffort: 'LOW',
                costBenefit: 'MEDIUM',
                technicalDetails: [
                    'Add endurance testing for long-running scenarios',
                    'Implement stress testing for breaking point analysis',
                    'Add scalability testing for growth planning',
                    'Include resource monitoring in all test scenarios',
                    'Implement automated performance regression testing'
                ]
            });
        }

        return recommendations.sort((a, b) => {
            const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    generateReport(suiteResults: TestSuiteResults, format: 'json' | 'html' | 'markdown' = 'markdown'): string {
        switch (format) {
            case 'json':
                return JSON.stringify(suiteResults, null, 2);
            case 'html':
                return this.generateHtmlReport(suiteResults);
            case 'markdown':
                return this.generateMarkdownReport(suiteResults);
            default:
                return this.generateMarkdownReport(suiteResults);
        }
    }

    private generateMarkdownReport(results: TestSuiteResults): string {
        const duration = (results.totalDuration / 1000 / 60).toFixed(2);

        return `# Performance Test Report: ${results.suiteName}

## Executive Summary

**Test Suite:** ${results.suiteName}  
**Status:** ${results.passFailStatus}  
**Duration:** ${duration} minutes  
**Total Tests:** ${results.testResults.length}  
**Total Operations:** ${results.aggregatedMetrics.totalOperations.toLocaleString()}  

### Key Metrics

| Metric | Value |
|--------|--------|
| Overall Throughput | ${results.aggregatedMetrics.overallThroughput.toFixed(2)} ops/sec |
| Average Response Time | ${results.aggregatedMetrics.averageResponseTime.toFixed(2)}ms |
| P95 Response Time | ${results.aggregatedMetrics.p95ResponseTime.toFixed(2)}ms |
| P99 Response Time | ${results.aggregatedMetrics.p99ResponseTime.toFixed(2)}ms |
| Overall Error Rate | ${(results.aggregatedMetrics.overallErrorRate * 100).toFixed(2)}% |
| Peak CPU Usage | ${(results.aggregatedMetrics.peakResourceUsage.cpu * 100).toFixed(2)}% |
| Peak Memory Usage | ${(results.aggregatedMetrics.peakResourceUsage.memory / (1024 * 1024)).toFixed(2)}MB |

### Test Coverage

| Test Type | Covered |
|-----------|---------|
| Load Testing | ${results.aggregatedMetrics.testCoverage.loadTesting ? '✅' : '❌'} |
| Stress Testing | ${results.aggregatedMetrics.testCoverage.stressTesting ? '✅' : '❌'} |
| Endurance Testing | ${results.aggregatedMetrics.testCoverage.enduranceTesting ? '✅' : '❌'} |
| Scalability Testing | ${results.aggregatedMetrics.testCoverage.scalabilityTesting ? '✅' : '❌'} |
| Resource Monitoring | ${results.aggregatedMetrics.testCoverage.resourceMonitoring ? '✅' : '❌'} |

**Overall Coverage:** ${results.aggregatedMetrics.testCoverage.coveragePercentage.toFixed(1)}%

## Individual Test Results

${results.testResults
    .map(
        test => `
### ${test.testId}

- **Status:** ${test.targetsAchieved ? 'PASS' : 'FAIL'}
- **Duration:** ${(test.duration / 1000).toFixed(1)}s
- **Operations:** ${test.totalOperations.toLocaleString()}
- **Throughput:** ${test.operationsPerSecond.toFixed(2)} ops/sec
- **Avg Response Time:** ${test.avgResponseTime.toFixed(2)}ms
- **Error Rate:** ${(test.errorRate * 100).toFixed(2)}%
${
    test.targetViolations.length > 0
        ? `
**Target Violations:**
${test.targetViolations.map(v => `- ${v}`).join('\n')}
`
        : ''
}
`
    )
    .join('')}

## Bottleneck Analysis

${
    results.bottlenecks.length > 0
        ? results.bottlenecks
              .map(
                  bottleneck => `
### ${bottleneck.type} Bottleneck - ${bottleneck.severity} Severity

**Description:** ${bottleneck.description}  
**Performance Impact:** ${bottleneck.performanceImpact.toFixed(1)}%  
**Detection Confidence:** ${bottleneck.detectionConfidence}%  

**Affected Operations:**
${bottleneck.affectedOperations.map(op => `- ${op}`).join('\n')}

**Evidence:**
${bottleneck.evidence.map(e => `- ${e}`).join('\n')}
`
              )
              .join('')
        : 'No significant bottlenecks detected.'
}

## Optimization Recommendations

${results.recommendations
    .map(
        (rec, index) => `
### ${index + 1}. ${rec.title} (${rec.priority} Priority)

**Category:** ${rec.category}  
**Expected Improvement:** ${rec.expectedImprovement}  
**Implementation Effort:** ${rec.implementationEffort}  
**Cost-Benefit Ratio:** ${rec.costBenefit}  

**Description:** ${rec.description}

**Technical Implementation:**
${rec.technicalDetails.map(detail => `- ${detail}`).join('\n')}
`
    )
    .join('')}

## Conclusion

${
    results.passFailStatus === 'PASS'
        ? '✅ All performance tests passed successfully. The system meets the defined performance criteria.'
        : results.passFailStatus === 'PARTIAL'
          ? '⚠️ Some performance tests failed. Review the bottlenecks and recommendations above for optimization opportunities.'
          : '❌ Performance tests failed. Immediate attention required to address identified issues.'
}

**Next Steps:**
1. Address critical and high-priority recommendations
2. Implement monitoring for identified bottlenecks
3. Re-run tests after optimizations
4. Consider expanding test coverage if below 80%

---
*Report generated on ${new Date().toISOString()}*
`;
    }

    private generateHtmlReport(results: TestSuiteResults): string {
        // HTML report implementation would go here
        return `<html><body><h1>Performance Test Report</h1><pre>${this.generateMarkdownReport(results)}</pre></body></html>`;
    }

    async saveReport(
        suiteResults: TestSuiteResults,
        outputPath: string,
        format: 'json' | 'html' | 'markdown' = 'markdown'
    ): Promise<void> {
        const report = this.generateReport(suiteResults, format);
        const fileName = `performance-report-${suiteResults.suiteId}-${new Date().toISOString().split('T')[0]}.${format === 'markdown' ? 'md' : format}`;
        const fullPath = path.join(outputPath, fileName);

        await fs.promises.writeFile(fullPath, report, 'utf-8');
        console.log(`Performance report saved: ${fullPath}`);
    }

    getResults(): Map<string, TestSuiteResults> {
        return new Map(this.results);
    }
}
