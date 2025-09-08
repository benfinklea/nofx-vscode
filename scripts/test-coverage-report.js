#!/usr/bin/env node

/**
 * Test Coverage Report Script
 * Runs tests for key files and reports coverage
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const keyFiles = [
    {
        name: 'EventBus',
        test: 'src/test/unit/services/EventBus.test.ts',
        source: 'src/services/EventBus.ts'
    },
    {
        name: 'AgentManager',
        test: 'src/test/unit/agents/AgentManager.test.ts',
        source: 'src/agents/AgentManager.ts'
    },
    {
        name: 'ConfigurationService',
        test: 'src/test/unit/services/ConfigurationService.test.ts',
        source: 'src/services/ConfigurationService.ts'
    },
    {
        name: 'TerminalManager',
        test: 'src/test/unit/services/TerminalManager.test.ts',
        source: 'src/services/TerminalManager.ts'
    },
    {
        name: 'Container',
        test: 'src/test/unit/services/Container.test.ts',
        source: 'src/services/Container.ts'
    }
];

console.log('📊 Test Coverage Report for Key Components\n');
console.log('=' .repeat(60));

let totalPassed = 0;
let totalFailed = 0;
let coverageData = [];

for (const file of keyFiles) {
    if (!fs.existsSync(file.test)) {
        console.log(`\n❌ ${file.name}: Test file not found`);
        totalFailed++;
        continue;
    }

    try {
        // Run test with coverage
        const cmd = `npx jest ${file.test} --coverage --collectCoverageFrom='${file.source}' --coverageReporters=json-summary --passWithNoTests 2>&1`;
        const output = execSync(cmd, { encoding: 'utf8' });
        
        // Check if tests passed
        const passed = output.includes('PASS');
        const failed = output.includes('FAIL');
        
        if (passed && !failed) {
            totalPassed++;
            console.log(`\n✅ ${file.name}: Tests PASSED`);
            
            // Try to read coverage data
            try {
                const coveragePath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
                if (fs.existsSync(coveragePath)) {
                    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                    const sourceFile = Object.keys(coverage).find(key => key.includes(path.basename(file.source)));
                    if (sourceFile && coverage[sourceFile]) {
                        const stats = coverage[sourceFile];
                        console.log(`   Coverage: ${stats.lines.pct}% lines, ${stats.statements.pct}% statements, ${stats.functions.pct}% functions`);
                        coverageData.push({
                            name: file.name,
                            coverage: stats.lines.pct
                        });
                    }
                }
            } catch (e) {
                // Coverage reading failed, but test passed
            }
        } else {
            totalFailed++;
            console.log(`\n❌ ${file.name}: Tests FAILED`);
        }
    } catch (error) {
        totalFailed++;
        console.log(`\n❌ ${file.name}: Test execution error`);
    }
}

console.log('\n' + '=' .repeat(60));
console.log('\n📈 Summary:');
console.log(`   ✅ Passed: ${totalPassed}`);
console.log(`   ❌ Failed: ${totalFailed}`);
console.log(`   📊 Pass Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

if (coverageData.length > 0) {
    const avgCoverage = coverageData.reduce((sum, item) => sum + item.coverage, 0) / coverageData.length;
    console.log(`   📊 Average Coverage: ${avgCoverage.toFixed(1)}%`);
    
    console.log('\n📊 Coverage Details:');
    coverageData.forEach(item => {
        const emoji = item.coverage >= 90 ? '🟢' : item.coverage >= 70 ? '🟡' : '🔴';
        console.log(`   ${emoji} ${item.name}: ${item.coverage}%`);
    });
}

console.log('\n🎯 Goal: 90% coverage for each file');
console.log('✨ Run individual test files to see detailed failures');