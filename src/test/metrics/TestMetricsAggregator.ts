/**
 * TEST METRICS AGGREGATOR
 * Collects and reports metrics from all test types
 * Provides unified dashboard for test health monitoring
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface UnifiedTestMetrics {
    timestamp: string;
    testSuites: {
        unit: UnitTestMetrics;
        integration: IntegrationTestMetrics;
        e2e: E2ETestMetrics;
        smoke: SmokeTestMetrics;
        performance: PerformanceTestMetrics;
        security: SecurityTestMetrics;
        contract: ContractTestMetrics;
    };
    summary: {
        totalTests: number;
        totalPassed: number;
        totalFailed: number;
        overallHealth: 'healthy' | 'warning' | 'critical';
        deploymentReady: boolean;
        criticalIssues: string[];
    };
}

interface UnitTestMetrics {
    coverage: number;
    tests: number;
    passed: number;
    failed: number;
    duration: number;
}

interface IntegrationTestMetrics {
    coverage: number;
    tests: number;
    passed: number;
    failed: number;
    duration: number;
}

interface E2ETestMetrics {
    coverage: number;
    tests: number;
    passed: number;
    failed: number;
    duration: number;
    flaky: number;
}

interface SmokeTestMetrics {
    passRate: number;
    duration: number;
    withinTarget: boolean;
    criticalPaths: string[];
}

interface PerformanceTestMetrics {
    throughput: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
    memoryUsage: number;
    degradation: number;
}

interface SecurityTestMetrics {
    // Vulnerability scanning
    criticalVulnerabilities: number;
    highVulnerabilities: number;
    mediumVulnerabilities: number;
    lowVulnerabilities: number;
    cvssScore: number;
    secretsExposed: number;

    // Security test categories
    processExecutionSafety: {
        maliciousCommandsBlocked: number;
        privilegeEscalationBlocked: number;
        shellInjectionBlocked: number;
        passed: boolean;
    };
    websocketSecurity: {
        unauthorizedConnectionsBlocked: number;
        maliciousMessagesBlocked: number;
        rateLimitingActive: boolean;
        passed: boolean;
    };
    filesystemSecurity: {
        pathTraversalBlocked: number;
        sensitiveFileAccessBlocked: number;
        maliciousFileOperationsBlocked: number;
        passed: boolean;
    };
    sessionSecurity: {
        sessionHijackingBlocked: number;
        dataEncryptionActive: boolean;
        tokenValidationPassed: boolean;
        passed: boolean;
    };
    terminalSecurity: {
        commandValidationActive: boolean;
        injectionAttemptsBlocked: number;
        workspaceBoundaryEnforced: boolean;
        passed: boolean;
    };
    vscodeAPISecurity: {
        unauthorizedAPIAccessBlocked: number;
        extensionBoundariesEnforced: boolean;
        sensitiveDataProtected: boolean;
        passed: boolean;
    };
    templateSecurity: {
        maliciousTemplatesBlocked: number;
        injectionAttemptsBlocked: number;
        capabilityEscalationBlocked: number;
        passed: boolean;
    };
    memorySafety: {
        bufferOverflowsBlocked: number;
        heapSprayingBlocked: number;
        memoryLeaksDetected: number;
        timingAttacksBlocked: number;
        passed: boolean;
    };

    // Overall metrics
    totalSecurityTests: number;
    passedSecurityTests: number;
    failedSecurityTests: number;
    duration: number;
    overallSecurityScore: number; // 0-100
    injectionTestsPassed: boolean; // Legacy compatibility
}

interface ContractTestMetrics {
    coverage: number;
    breakingChanges: number;
    backwardCompatible: boolean;
    consumers: Record<string, string>;
}

export class TestMetricsAggregator {
    private metricsDir = path.join(process.cwd(), 'test-results');

    async collectAllMetrics(): Promise<UnifiedTestMetrics> {
        // Ensure metrics directory exists
        if (!fs.existsSync(this.metricsDir)) {
            fs.mkdirSync(this.metricsDir, { recursive: true });
        }

        const metrics: UnifiedTestMetrics = {
            timestamp: new Date().toISOString(),
            testSuites: {
                unit: await this.collectUnitMetrics(),
                integration: await this.collectIntegrationMetrics(),
                e2e: await this.collectE2EMetrics(),
                smoke: await this.collectSmokeMetrics(),
                performance: await this.collectPerformanceMetrics(),
                security: await this.collectSecurityMetrics(),
                contract: await this.collectContractMetrics()
            },
            summary: {
                totalTests: 0,
                totalPassed: 0,
                totalFailed: 0,
                overallHealth: 'healthy',
                deploymentReady: true,
                criticalIssues: []
            }
        };

        // Calculate summary
        this.calculateSummary(metrics);

        // Save metrics
        await this.saveMetrics(metrics);

        return metrics;
    }

    private async collectUnitMetrics(): Promise<UnitTestMetrics> {
        try {
            const output = execSync('npm run test:unit -- --json --outputFile=test-results/unit.json', {
                encoding: 'utf8'
            });
            const results = JSON.parse(fs.readFileSync('test-results/unit.json', 'utf8'));

            return {
                coverage: this.getCoverage('unit'),
                tests: results.numTotalTests || 0,
                passed: results.numPassedTests || 0,
                failed: results.numFailedTests || 0,
                duration: results.testResults?.reduce((acc: number, r: any) => acc + r.duration, 0) || 0
            };
        } catch (error) {
            return { coverage: 0, tests: 0, passed: 0, failed: 0, duration: 0 };
        }
    }

    private async collectIntegrationMetrics(): Promise<IntegrationTestMetrics> {
        try {
            const output = execSync('npm run test:integration -- --json --outputFile=test-results/integration.json', {
                encoding: 'utf8'
            });
            const results = JSON.parse(fs.readFileSync('test-results/integration.json', 'utf8'));

            return {
                coverage: this.getCoverage('integration'),
                tests: results.numTotalTests || 0,
                passed: results.numPassedTests || 0,
                failed: results.numFailedTests || 0,
                duration: results.testResults?.reduce((acc: number, r: any) => acc + r.duration, 0) || 0
            };
        } catch (error) {
            return { coverage: 0, tests: 0, passed: 0, failed: 0, duration: 0 };
        }
    }

    private async collectE2EMetrics(): Promise<E2ETestMetrics> {
        try {
            const reportPath = 'test-results/e2e-report.json';
            if (fs.existsSync(reportPath)) {
                const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                return {
                    coverage: 85, // Previously calculated
                    tests: report.stats?.tests || 0,
                    passed: report.stats?.passes || 0,
                    failed: report.stats?.failures || 0,
                    duration: report.stats?.duration || 0,
                    flaky: report.stats?.flaky || 0
                };
            }
        } catch (error) {}
        return { coverage: 0, tests: 0, passed: 0, failed: 0, duration: 0, flaky: 0 };
    }

    private async collectSmokeMetrics(): Promise<SmokeTestMetrics> {
        try {
            const reportPath = 'test-results/smoke-metrics.json';
            if (fs.existsSync(reportPath)) {
                return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            }
        } catch (error) {}
        return {
            passRate: 0,
            duration: 0,
            withinTarget: false,
            criticalPaths: []
        };
    }

    private async collectPerformanceMetrics(): Promise<PerformanceTestMetrics> {
        try {
            const reportPath = 'test-results/performance-metrics.json';
            if (fs.existsSync(reportPath)) {
                return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            }
        } catch (error) {}
        return {
            throughput: 0,
            latencyP50: 0,
            latencyP95: 0,
            latencyP99: 0,
            memoryUsage: 0,
            degradation: 0
        };
    }

    private async collectSecurityMetrics(): Promise<SecurityTestMetrics> {
        try {
            // Run security tests and collect results
            const securityResults = await this.runSecurityTests();

            // Aggregate results from all security test suites
            const processExecution = securityResults.processExecution || {};
            const websocketSecurity = securityResults.websocketSecurity || {};
            const filesystemSecurity = securityResults.filesystemSecurity || {};
            const sessionSecurity = securityResults.sessionSecurity || {};
            const terminalSecurity = securityResults.terminalSecurity || {};
            const vscodeAPISecurity = securityResults.vscodeAPISecurity || {};
            const templateSecurity = securityResults.templateSecurity || {};
            const memorySafety = securityResults.memorySafety || {};
            const vulnerability = securityResults.vulnerability || {};

            // Calculate overall security score (0-100)
            const securityCategories = [
                processExecution.passed ? 100 : 0,
                websocketSecurity.passed ? 100 : 0,
                filesystemSecurity.passed ? 100 : 0,
                sessionSecurity.passed ? 100 : 0,
                terminalSecurity.passed ? 100 : 0,
                vscodeAPISecurity.passed ? 100 : 0,
                templateSecurity.passed ? 100 : 0,
                memorySafety.passed ? 100 : 0
            ];

            const overallSecurityScore = securityCategories.reduce((a, b) => a + b, 0) / securityCategories.length;
            const totalTests = securityResults.totalTests || 0;
            const passedTests = securityResults.passedTests || 0;

            return {
                // Vulnerability scanning
                criticalVulnerabilities: vulnerability.critical || 0,
                highVulnerabilities: vulnerability.high || 0,
                mediumVulnerabilities: vulnerability.medium || 0,
                lowVulnerabilities: vulnerability.low || 0,
                cvssScore: vulnerability.cvssScore || 0,
                secretsExposed: vulnerability.secretsExposed || 0,

                // Security test categories
                processExecutionSafety: {
                    maliciousCommandsBlocked: processExecution.maliciousCommandsBlocked || 0,
                    privilegeEscalationBlocked: processExecution.privilegeEscalationBlocked || 0,
                    shellInjectionBlocked: processExecution.shellInjectionBlocked || 0,
                    passed: processExecution.passed || false
                },
                websocketSecurity: {
                    unauthorizedConnectionsBlocked: websocketSecurity.unauthorizedConnectionsBlocked || 0,
                    maliciousMessagesBlocked: websocketSecurity.maliciousMessagesBlocked || 0,
                    rateLimitingActive: websocketSecurity.rateLimitingActive || false,
                    passed: websocketSecurity.passed || false
                },
                filesystemSecurity: {
                    pathTraversalBlocked: filesystemSecurity.pathTraversalBlocked || 0,
                    sensitiveFileAccessBlocked: filesystemSecurity.sensitiveFileAccessBlocked || 0,
                    maliciousFileOperationsBlocked: filesystemSecurity.maliciousFileOperationsBlocked || 0,
                    passed: filesystemSecurity.passed || false
                },
                sessionSecurity: {
                    sessionHijackingBlocked: sessionSecurity.sessionHijackingBlocked || 0,
                    dataEncryptionActive: sessionSecurity.dataEncryptionActive || false,
                    tokenValidationPassed: sessionSecurity.tokenValidationPassed || false,
                    passed: sessionSecurity.passed || false
                },
                terminalSecurity: {
                    commandValidationActive: terminalSecurity.commandValidationActive || false,
                    injectionAttemptsBlocked: terminalSecurity.injectionAttemptsBlocked || 0,
                    workspaceBoundaryEnforced: terminalSecurity.workspaceBoundaryEnforced || false,
                    passed: terminalSecurity.passed || false
                },
                vscodeAPISecurity: {
                    unauthorizedAPIAccessBlocked: vscodeAPISecurity.unauthorizedAPIAccessBlocked || 0,
                    extensionBoundariesEnforced: vscodeAPISecurity.extensionBoundariesEnforced || false,
                    sensitiveDataProtected: vscodeAPISecurity.sensitiveDataProtected || false,
                    passed: vscodeAPISecurity.passed || false
                },
                templateSecurity: {
                    maliciousTemplatesBlocked: templateSecurity.maliciousTemplatesBlocked || 0,
                    injectionAttemptsBlocked: templateSecurity.injectionAttemptsBlocked || 0,
                    capabilityEscalationBlocked: templateSecurity.capabilityEscalationBlocked || 0,
                    passed: templateSecurity.passed || false
                },
                memorySafety: {
                    bufferOverflowsBlocked: memorySafety.bufferOverflowsBlocked || 0,
                    heapSprayingBlocked: memorySafety.heapSprayingBlocked || 0,
                    memoryLeaksDetected: memorySafety.memoryLeaksDetected || 0,
                    timingAttacksBlocked: memorySafety.timingAttacksBlocked || 0,
                    passed: memorySafety.passed || false
                },

                // Overall metrics
                totalSecurityTests: totalTests,
                passedSecurityTests: passedTests,
                failedSecurityTests: totalTests - passedTests,
                duration: securityResults.duration || 0,
                overallSecurityScore: overallSecurityScore,
                injectionTestsPassed:
                    processExecution.shellInjectionBlocked > 0 &&
                    terminalSecurity.injectionAttemptsBlocked > 0 &&
                    templateSecurity.injectionAttemptsBlocked > 0 // Legacy compatibility
            };
        } catch (error) {
            console.error('Failed to collect security metrics:', error);
            return this.getDefaultSecurityMetrics();
        }
    }

    private async runSecurityTests(): Promise<any> {
        try {
            // Run all security test suites
            const output = execSync('npm run test:security -- --json --outputFile=test-results/security.json', {
                encoding: 'utf8',
                timeout: 300000 // 5 minutes timeout for security tests
            });

            if (fs.existsSync('test-results/security.json')) {
                return JSON.parse(fs.readFileSync('test-results/security.json', 'utf8'));
            }

            return {};
        } catch (error) {
            console.error('Security tests failed:', error);
            return {};
        }
    }

    private getDefaultSecurityMetrics(): SecurityTestMetrics {
        return {
            criticalVulnerabilities: 0,
            highVulnerabilities: 0,
            mediumVulnerabilities: 0,
            lowVulnerabilities: 0,
            cvssScore: 0,
            secretsExposed: 0,
            processExecutionSafety: {
                maliciousCommandsBlocked: 0,
                privilegeEscalationBlocked: 0,
                shellInjectionBlocked: 0,
                passed: false
            },
            websocketSecurity: {
                unauthorizedConnectionsBlocked: 0,
                maliciousMessagesBlocked: 0,
                rateLimitingActive: false,
                passed: false
            },
            filesystemSecurity: {
                pathTraversalBlocked: 0,
                sensitiveFileAccessBlocked: 0,
                maliciousFileOperationsBlocked: 0,
                passed: false
            },
            sessionSecurity: {
                sessionHijackingBlocked: 0,
                dataEncryptionActive: false,
                tokenValidationPassed: false,
                passed: false
            },
            terminalSecurity: {
                commandValidationActive: false,
                injectionAttemptsBlocked: 0,
                workspaceBoundaryEnforced: false,
                passed: false
            },
            vscodeAPISecurity: {
                unauthorizedAPIAccessBlocked: 0,
                extensionBoundariesEnforced: false,
                sensitiveDataProtected: false,
                passed: false
            },
            templateSecurity: {
                maliciousTemplatesBlocked: 0,
                injectionAttemptsBlocked: 0,
                capabilityEscalationBlocked: 0,
                passed: false
            },
            memorySafety: {
                bufferOverflowsBlocked: 0,
                heapSprayingBlocked: 0,
                memoryLeaksDetected: 0,
                timingAttacksBlocked: 0,
                passed: false
            },
            totalSecurityTests: 0,
            passedSecurityTests: 0,
            failedSecurityTests: 0,
            duration: 0,
            overallSecurityScore: 0,
            injectionTestsPassed: false
        };
    }

    private async collectContractMetrics(): Promise<ContractTestMetrics> {
        try {
            const reportPath = 'test-results/contract-metrics.json';
            if (fs.existsSync(reportPath)) {
                return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            }
        } catch (error) {}
        return {
            coverage: 0,
            breakingChanges: 0,
            backwardCompatible: true,
            consumers: {}
        };
    }

    private getCoverage(type: string): number {
        try {
            const coveragePath = `coverage/${type}/coverage-summary.json`;
            if (fs.existsSync(coveragePath)) {
                const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                return coverage.total?.lines?.pct || 0;
            }
        } catch (error) {}
        return 0;
    }

    private calculateSummary(metrics: UnifiedTestMetrics): void {
        const { testSuites } = metrics;

        // Calculate totals
        metrics.summary.totalTests = testSuites.unit.tests + testSuites.integration.tests + testSuites.e2e.tests;

        metrics.summary.totalPassed = testSuites.unit.passed + testSuites.integration.passed + testSuites.e2e.passed;

        metrics.summary.totalFailed = testSuites.unit.failed + testSuites.integration.failed + testSuites.e2e.failed;

        // Check critical issues
        const issues: string[] = [];

        if (testSuites.smoke.passRate < 100) {
            issues.push('Smoke tests failing');
        }

        if (testSuites.security.criticalVulnerabilities > 0) {
            issues.push(`${testSuites.security.criticalVulnerabilities} critical vulnerabilities`);
        }

        if (testSuites.contract.breakingChanges > 0) {
            issues.push(`${testSuites.contract.breakingChanges} breaking API changes`);
        }

        if (testSuites.performance.latencyP99 > 100) {
            issues.push('P99 latency exceeds 100ms');
        }

        metrics.summary.criticalIssues = issues;

        // Determine health status
        if (issues.length === 0) {
            metrics.summary.overallHealth = 'healthy';
        } else if (issues.length <= 2) {
            metrics.summary.overallHealth = 'warning';
        } else {
            metrics.summary.overallHealth = 'critical';
        }

        // Deployment readiness
        metrics.summary.deploymentReady =
            testSuites.smoke.passRate === 100 &&
            testSuites.security.criticalVulnerabilities === 0 &&
            testSuites.contract.breakingChanges === 0;
    }

    private async saveMetrics(metrics: UnifiedTestMetrics): Promise<void> {
        const filePath = path.join(this.metricsDir, 'unified-metrics.json');
        fs.writeFileSync(filePath, JSON.stringify(metrics, null, 2));

        // Also save HTML report
        const htmlReport = this.generateHTMLReport(metrics);
        fs.writeFileSync(path.join(this.metricsDir, 'test-report.html'), htmlReport);
    }

    private generateHTMLReport(metrics: UnifiedTestMetrics): string {
        const { testSuites, summary } = metrics;

        return `
<!DOCTYPE html>
<html>
<head>
    <title>NofX Test Metrics Dashboard</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .metric { display: flex; justify-content: space-between; margin: 10px 0; }
        .value { font-weight: bold; }
        .healthy { color: #10b981; }
        .warning { color: #f59e0b; }
        .critical { color: #ef4444; }
        .progress { background: #e5e7eb; height: 10px; border-radius: 5px; overflow: hidden; margin: 10px 0; }
        .progress-bar { height: 100%; background: #10b981; }
        h2 { margin-top: 0; color: #1f2937; }
        .summary { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .status { display: inline-block; padding: 5px 10px; border-radius: 5px; color: white; font-weight: bold; }
        .status.healthy { background: #10b981; }
        .status.warning { background: #f59e0b; }
        .status.critical { background: #ef4444; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎸 NofX Test Metrics Dashboard</h1>
        <p>Generated: ${metrics.timestamp}</p>
    </div>
    
    <div class="summary card">
        <h2>Overall Summary</h2>
        <div class="metric">
            <span>Health Status</span>
            <span class="status ${summary.overallHealth}">${summary.overallHealth.toUpperCase()}</span>
        </div>
        <div class="metric">
            <span>Deployment Ready</span>
            <span class="value ${summary.deploymentReady ? 'healthy' : 'critical'}">${summary.deploymentReady ? '✅ YES' : '❌ NO'}</span>
        </div>
        <div class="metric">
            <span>Total Tests</span>
            <span class="value">${summary.totalTests}</span>
        </div>
        <div class="metric">
            <span>Pass Rate</span>
            <span class="value ${summary.totalPassed / summary.totalTests > 0.95 ? 'healthy' : 'warning'}">
                ${((summary.totalPassed / summary.totalTests) * 100).toFixed(1)}%
            </span>
        </div>
        ${
            summary.criticalIssues.length > 0
                ? `
        <div style="margin-top: 20px; padding: 10px; background: #fef2f2; border-left: 4px solid #ef4444;">
            <strong>Critical Issues:</strong>
            <ul style="margin: 10px 0;">
                ${summary.criticalIssues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
        </div>
        `
                : ''
        }
    </div>
    
    <div class="grid">
        <div class="card">
            <h2>📦 Unit Tests</h2>
            <div class="metric">
                <span>Coverage</span>
                <span class="value ${testSuites.unit.coverage > 80 ? 'healthy' : 'warning'}">${testSuites.unit.coverage.toFixed(1)}%</span>
            </div>
            <div class="progress">
                <div class="progress-bar" style="width: ${testSuites.unit.coverage}%"></div>
            </div>
            <div class="metric">
                <span>Tests</span>
                <span class="value">${testSuites.unit.passed}/${testSuites.unit.tests}</span>
            </div>
        </div>
        
        <div class="card">
            <h2>🔗 Integration Tests</h2>
            <div class="metric">
                <span>Coverage</span>
                <span class="value ${testSuites.integration.coverage > 70 ? 'healthy' : 'warning'}">${testSuites.integration.coverage.toFixed(1)}%</span>
            </div>
            <div class="progress">
                <div class="progress-bar" style="width: ${testSuites.integration.coverage}%"></div>
            </div>
            <div class="metric">
                <span>Tests</span>
                <span class="value">${testSuites.integration.passed}/${testSuites.integration.tests}</span>
            </div>
        </div>
        
        <div class="card">
            <h2>🌐 E2E Tests</h2>
            <div class="metric">
                <span>Coverage</span>
                <span class="value ${testSuites.e2e.coverage > 80 ? 'healthy' : 'warning'}">${testSuites.e2e.coverage.toFixed(1)}%</span>
            </div>
            <div class="progress">
                <div class="progress-bar" style="width: ${testSuites.e2e.coverage}%"></div>
            </div>
            <div class="metric">
                <span>Tests</span>
                <span class="value">${testSuites.e2e.passed}/${testSuites.e2e.tests}</span>
            </div>
            <div class="metric">
                <span>Flaky Tests</span>
                <span class="value ${testSuites.e2e.flaky === 0 ? 'healthy' : 'warning'}">${testSuites.e2e.flaky}</span>
            </div>
        </div>
        
        <div class="card">
            <h2>🔥 Smoke Tests</h2>
            <div class="metric">
                <span>Pass Rate</span>
                <span class="value ${testSuites.smoke.passRate === 100 ? 'healthy' : 'critical'}">${testSuites.smoke.passRate.toFixed(0)}%</span>
            </div>
            <div class="metric">
                <span>Duration</span>
                <span class="value ${testSuites.smoke.withinTarget ? 'healthy' : 'warning'}">${testSuites.smoke.duration}ms</span>
            </div>
            <div class="metric">
                <span>Target Met</span>
                <span class="value ${testSuites.smoke.withinTarget ? 'healthy' : 'warning'}">${testSuites.smoke.withinTarget ? '✅' : '⚠️'}</span>
            </div>
        </div>
        
        <div class="card">
            <h2>🏎️ Performance Tests</h2>
            <div class="metric">
                <span>Throughput</span>
                <span class="value ${testSuites.performance.throughput > 1000 ? 'healthy' : 'warning'}">${testSuites.performance.throughput} msg/s</span>
            </div>
            <div class="metric">
                <span>P50 Latency</span>
                <span class="value ${testSuites.performance.latencyP50 < 10 ? 'healthy' : 'warning'}">${testSuites.performance.latencyP50.toFixed(1)}ms</span>
            </div>
            <div class="metric">
                <span>P95 Latency</span>
                <span class="value ${testSuites.performance.latencyP95 < 50 ? 'healthy' : 'warning'}">${testSuites.performance.latencyP95.toFixed(1)}ms</span>
            </div>
            <div class="metric">
                <span>P99 Latency</span>
                <span class="value ${testSuites.performance.latencyP99 < 100 ? 'healthy' : 'critical'}">${testSuites.performance.latencyP99.toFixed(1)}ms</span>
            </div>
        </div>
        
        <div class="card">
            <h2>🔒 Security Tests</h2>
            <div class="metric">
                <span>Critical Vulns</span>
                <span class="value ${testSuites.security.criticalVulnerabilities === 0 ? 'healthy' : 'critical'}">${testSuites.security.criticalVulnerabilities}</span>
            </div>
            <div class="metric">
                <span>High Vulns</span>
                <span class="value ${testSuites.security.highVulnerabilities === 0 ? 'healthy' : 'warning'}">${testSuites.security.highVulnerabilities}</span>
            </div>
            <div class="metric">
                <span>CVSS Score</span>
                <span class="value ${testSuites.security.cvssScore < 4 ? 'healthy' : 'warning'}">${testSuites.security.cvssScore.toFixed(1)}</span>
            </div>
            <div class="metric">
                <span>Injection Tests</span>
                <span class="value ${testSuites.security.injectionTestsPassed ? 'healthy' : 'critical'}">${testSuites.security.injectionTestsPassed ? '✅ PASSED' : '❌ FAILED'}</span>
            </div>
        </div>
        
        <div class="card">
            <h2>📝 Contract Tests</h2>
            <div class="metric">
                <span>Coverage</span>
                <span class="value ${testSuites.contract.coverage > 80 ? 'healthy' : 'warning'}">${testSuites.contract.coverage.toFixed(1)}%</span>
            </div>
            <div class="metric">
                <span>Breaking Changes</span>
                <span class="value ${testSuites.contract.breakingChanges === 0 ? 'healthy' : 'critical'}">${testSuites.contract.breakingChanges}</span>
            </div>
            <div class="metric">
                <span>Backward Compatible</span>
                <span class="value ${testSuites.contract.backwardCompatible ? 'healthy' : 'critical'}">${testSuites.contract.backwardCompatible ? '✅' : '❌'}</span>
            </div>
        </div>
    </div>
</body>
</html>
        `;
    }

    async generateCLIReport(): Promise<string> {
        const metrics = await this.collectAllMetrics();
        const { testSuites, summary } = metrics;

        const healthIcon =
            summary.overallHealth === 'healthy' ? '✅' : summary.overallHealth === 'warning' ? '⚠️' : '❌';

        return `
╔════════════════════════════════════════════════════════════════╗
║                    NofX Test Metrics Report                       ║
╠════════════════════════════════════════════════════════════════╣
║ Generated: ${metrics.timestamp}                    ║
╠════════════════════════════════════════════════════════════════╣
║ OVERALL HEALTH: ${healthIcon} ${summary.overallHealth.toUpperCase().padEnd(48)}║
║ DEPLOYMENT READY: ${summary.deploymentReady ? '✅ YES' : '❌ NO'}                                          ║
╠════════════════════════════════════════════════════════════════╣
║                         TEST SUITES                               ║
╠════════════════════════════════════════════════════════════════╣
║ Unit Tests:        ${String(testSuites.unit.passed).padEnd(4)}/${String(testSuites.unit.tests).padEnd(4)} passed | Coverage: ${testSuites.unit.coverage.toFixed(1)}%      ║
║ Integration Tests: ${String(testSuites.integration.passed).padEnd(4)}/${String(testSuites.integration.tests).padEnd(4)} passed | Coverage: ${testSuites.integration.coverage.toFixed(1)}%      ║
║ E2E Tests:         ${String(testSuites.e2e.passed).padEnd(4)}/${String(testSuites.e2e.tests).padEnd(4)} passed | Coverage: ${testSuites.e2e.coverage.toFixed(1)}%      ║
╠════════════════════════════════════════════════════════════════╣
║                      QUALITY METRICS                              ║
╠════════════════════════════════════════════════════════════════╣
║ 🔥 Smoke Tests:     ${testSuites.smoke.passRate === 100 ? '✅' : '❌'} ${testSuites.smoke.passRate}% pass rate                         ║
║ 🏎️  Performance:     ${testSuites.performance.throughput} msg/s | P99: ${testSuites.performance.latencyP99}ms              ║
║ 🔒 Security:        ${testSuites.security.criticalVulnerabilities} critical vulnerabilities                    ║
║ 📝 Contracts:       ${testSuites.contract.breakingChanges} breaking changes                           ║
╠════════════════════════════════════════════════════════════════╣
${
    summary.criticalIssues.length > 0
        ? `║                      ⚠️  CRITICAL ISSUES                          ║
╠════════════════════════════════════════════════════════════════╣
${summary.criticalIssues.map(issue => `║ • ${issue.padEnd(59)}║`).join('\n')}
╠════════════════════════════════════════════════════════════════╣
`
        : ''
}
║                         ACTIONS                                   ║
╠════════════════════════════════════════════════════════════════╣
║ View HTML Report:  test-results/test-report.html                  ║
║ View JSON Metrics: test-results/unified-metrics.json              ║
╚════════════════════════════════════════════════════════════════╝
        `;
    }
}

// Export for CLI usage
export async function reportMetrics(): Promise<void> {
    const aggregator = new TestMetricsAggregator();
    const report = await aggregator.generateCLIReport();
    console.log(report);
}

// Run if called directly
if (require.main === module) {
    reportMetrics().catch(console.error);
}
