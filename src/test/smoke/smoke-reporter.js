/**
 * Custom Jest reporter for smoke tests
 * Generates metrics JSON for the aggregator
 */

class SmokeTestReporter {
    constructor(globalConfig, options) {
        this._globalConfig = globalConfig;
        this._options = options;
    }

    onRunComplete(contexts, results) {
        const { numTotalTests, numPassedTests, numFailedTests, startTime } = results;
        const duration = Date.now() - startTime;
        
        const metrics = {
            timestamp: new Date().toISOString(),
            passRate: (numPassedTests / numTotalTests) * 100,
            duration,
            withinTarget: duration <= 60000,
            criticalPaths: [
                'extension-activation',
                'websocket-server',
                'agent-management',
                'message-protocol',
                'dashboard',
                'configuration',
                'error-recovery'
            ],
            tests: numTotalTests,
            passed: numPassedTests,
            failed: numFailedTests
        };
        
        // Write metrics to file
        const fs = require('fs');
        const path = require('path');
        const outputPath = this._options.outputPath || './test-results/smoke-metrics.json';
        const dir = path.dirname(outputPath);
        
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, JSON.stringify(metrics, null, 2));
        
        // Console output
        console.log('\n🔥 Smoke Test Summary:');
        console.log(`  Pass Rate: ${metrics.passRate.toFixed(1)}%`);
        console.log(`  Duration: ${metrics.duration}ms`);
        console.log(`  Target Met: ${metrics.withinTarget ? '✅' : '⚠️'}`);
    }
}

module.exports = SmokeTestReporter;