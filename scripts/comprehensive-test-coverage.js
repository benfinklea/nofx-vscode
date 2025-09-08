#!/usr/bin/env node

/**
 * Comprehensive Test Coverage Script
 * Runs tests for all key files and reports coverage
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const keyFiles = [
    // Services
    { name: 'EventBus', test: 'src/test/unit/services/EventBus.test.ts', source: 'src/services/EventBus.ts' },
    { name: 'ConfigurationService', test: 'src/test/unit/services/ConfigurationService.test.ts', source: 'src/services/ConfigurationService.ts' },
    { name: 'Container', test: 'src/test/unit/services/Container.test.ts', source: 'src/services/Container.ts' },
    { name: 'TerminalManager', test: 'src/test/unit/services/TerminalManager.test.ts', source: 'src/services/TerminalManager.ts' },
    { name: 'LoggingService', test: 'src/test/unit/services/LoggingService.test.ts', source: 'src/services/LoggingService.ts' },
    { name: 'NotificationService', test: 'src/test/unit/services/NotificationService.test.ts', source: 'src/services/NotificationService.ts' },
    { name: 'CommandService', test: 'src/test/unit/services/CommandService.test.ts', source: 'src/services/CommandService.ts' },
    { name: 'MetricsService', test: 'src/test/unit/services/MetricsService.test.ts', source: 'src/services/MetricsService.ts' },
    { name: 'AgentLifecycleManager', test: 'src/test/unit/services/AgentLifecycleManager.test.ts', source: 'src/services/AgentLifecycleManager.ts' },
    { name: 'TerminalMonitor', test: 'src/test/unit/services/TerminalMonitor.test.ts', source: 'src/services/TerminalMonitor.ts' },
    
    // Agents
    { name: 'AgentManager', test: 'src/test/unit/agents/AgentManager.test.ts', source: 'src/agents/AgentManager.ts' },
    { name: 'AgentTemplateManager', test: 'src/test/unit/agents/AgentTemplateManager.test.ts', source: 'src/agents/AgentTemplateManager.ts' },
    
    // Commands
    { name: 'AgentCommands', test: 'src/test/unit/commands/AgentCommands.test.ts', source: 'src/commands/AgentCommands.ts' },
    { name: 'ConductorCommands', test: 'src/test/unit/commands/ConductorCommands.test.ts', source: 'src/commands/ConductorCommands.ts' },
    
    // Dashboard
    { name: 'MessageFlowDashboard', test: 'src/test/unit/dashboard/MessageFlowDashboard.test.ts', source: 'src/dashboard/MessageFlowDashboard.ts' },
    
    // Worktrees
    { name: 'WorktreeManager', test: 'src/test/unit/worktrees/WorktreeManager.test.ts', source: 'src/worktrees/WorktreeManager.ts' }
];

console.log('📊 Comprehensive Test Coverage Report\n');
console.log('=' .repeat(80));

let results = [];
let totalFiles = keyFiles.length;
let passingFiles = 0;
let targetCoverageFiles = 0;

for (const file of keyFiles) {
    process.stdout.write(`\nTesting ${file.name}...`);
    
    if (!fs.existsSync(file.test)) {
        console.log(` ❌ Test file not found`);
        results.push({ name: file.name, status: 'missing', coverage: 0 });
        continue;
    }

    try {
        // Run test with coverage
        const cmd = `MOCK_FS=true npx jest ${file.test} --coverage --collectCoverageFrom='${file.source}' --coverageReporters=json-summary --passWithNoTests 2>&1`;
        const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
        
        // Check if tests passed
        const passed = output.includes('PASS');
        const failed = output.includes('FAIL');
        
        if (passed && !failed) {
            passingFiles++;
            process.stdout.write(' ✅');
            
            // Try to read coverage data
            try {
                const coveragePath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
                if (fs.existsSync(coveragePath)) {
                    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                    const sourceFile = Object.keys(coverage).find(key => key.includes(path.basename(file.source)));
                    if (sourceFile && coverage[sourceFile]) {
                        const stats = coverage[sourceFile];
                        const lineCoverage = stats.lines.pct;
                        
                        if (lineCoverage >= 98) {
                            targetCoverageFiles++;
                            console.log(` 🎯 ${lineCoverage}% coverage`);
                        } else {
                            console.log(` 📈 ${lineCoverage}% coverage`);
                        }
                        
                        results.push({
                            name: file.name,
                            status: 'passed',
                            coverage: lineCoverage,
                            details: stats
                        });
                    } else {
                        console.log(' (coverage data unavailable)');
                        results.push({ name: file.name, status: 'passed', coverage: null });
                    }
                }
            } catch (e) {
                console.log(' (coverage read error)');
                results.push({ name: file.name, status: 'passed', coverage: null });
            }
        } else {
            console.log(' ❌ Tests failed');
            results.push({ name: file.name, status: 'failed', coverage: 0 });
        }
    } catch (error) {
        console.log(' ❌ Test execution error');
        results.push({ name: file.name, status: 'error', coverage: 0 });
    }
}

// Summary
console.log('\n' + '=' .repeat(80));
console.log('\n📈 SUMMARY:\n');

// Status breakdown
console.log(`Total Files: ${totalFiles}`);
console.log(`✅ Passing: ${passingFiles} (${((passingFiles / totalFiles) * 100).toFixed(1)}%)`);
console.log(`❌ Failing: ${totalFiles - passingFiles} (${(((totalFiles - passingFiles) / totalFiles) * 100).toFixed(1)}%)`);
console.log(`🎯 98%+ Coverage: ${targetCoverageFiles} (${((targetCoverageFiles / totalFiles) * 100).toFixed(1)}%)`);

// Coverage details
console.log('\n📊 Coverage Details:');
results.sort((a, b) => (b.coverage || 0) - (a.coverage || 0));
results.forEach(r => {
    const emoji = r.coverage >= 98 ? '🎯' : r.coverage >= 80 ? '🟢' : r.coverage >= 60 ? '🟡' : '🔴';
    const status = r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : '⚠️';
    const coverage = r.coverage !== null ? `${r.coverage}%` : 'N/A';
    console.log(`  ${status} ${emoji} ${r.name}: ${coverage}`);
});

// Files needing work
const needWork = results.filter(r => r.status !== 'passed' || (r.coverage !== null && r.coverage < 98));
if (needWork.length > 0) {
    console.log('\n⚠️  Files Needing Work:');
    needWork.forEach(r => {
        console.log(`  - ${r.name}: ${r.status === 'passed' ? `${r.coverage}% coverage` : r.status}`);
    });
}

console.log('\n🎯 Goal: 98% coverage and 100% passing for all files');