#!/usr/bin/env node

/**
 * Quick Coverage Check Script
 * Tests key files and reports current status
 */

const { execSync } = require('child_process');
const fs = require('fs');

const testFiles = [
    'src/test/unit/services/EventBus.test.ts',
    'src/test/unit/services/ConfigurationService.test.ts',
    'src/test/unit/agents/AgentManager.test.ts',
    'src/test/unit/services/Container.test.ts',
    'src/test/unit/services/TerminalManager.test.ts',
    'src/test/unit/services/LoggingService.test.ts',
    'src/test/unit/services/NotificationService.test.ts',
    'src/test/unit/services/MetricsService.test.ts'
];

console.log('📊 Quick Coverage Check\n');
console.log('=' .repeat(50));

let summary = {
    total: 0,
    passing: 0,
    highCoverage: 0
};

for (const testFile of testFiles) {
    const name = testFile.split('/').pop().replace('.test.ts', '');
    process.stdout.write(`\n${name}: `);
    
    summary.total++;
    
    if (!fs.existsSync(testFile)) {
        console.log('❌ Missing');
        continue;
    }
    
    try {
        // Quick test run without coverage
        const cmd = `MOCK_FS=true npx jest ${testFile} --no-coverage --passWithNoTests 2>&1`;
        const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
        
        if (output.includes('PASS')) {
            summary.passing++;
            console.log('✅ Passing');
        } else {
            console.log('❌ Failing');
        }
    } catch (error) {
        console.log('❌ Error');
    }
}

console.log('\n' + '=' .repeat(50));
console.log(`\nSummary: ${summary.passing}/${summary.total} passing (${Math.round(summary.passing/summary.total*100)}%)`);
console.log(`\nNext step: Fix failing tests to reach 100% pass rate`);