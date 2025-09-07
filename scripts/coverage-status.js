#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Coverage Status Analysis for NofX VS Code Extension
 * 
 * Provides coverage status without running problematic tests
 */

console.log('🎯 NofX Coverage Status Analysis');
console.log('=================================\n');

const srcDir = path.join(__dirname, '..', 'src');

// Get source files excluding tests
function getSourceFiles() {
    const files = [];
    
    function walkDir(dir) {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory() && !item.includes('test')) {
                walkDir(fullPath);
            } else if (item.endsWith('.ts') && !item.includes('.test.') && !item.includes('.d.ts')) {
                files.push({
                    path: fullPath,
                    relativePath: path.relative(srcDir, fullPath),
                    category: path.relative(srcDir, fullPath).split('/')[0],
                    name: item
                });
            }
        }
    }
    
    walkDir(srcDir);
    return files;
}

// Get test files
function getTestFiles() {
    const testDir = path.join(srcDir, 'test');
    const files = [];
    
    function walkDir(dir) {
        try {
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    walkDir(fullPath);
                } else if (item.endsWith('.test.ts')) {
                    files.push({
                        path: fullPath,
                        relativePath: path.relative(testDir, fullPath),
                        testType: path.relative(testDir, fullPath).split('/')[0],
                        name: item
                    });
                }
            }
        } catch (e) {
            // Directory might not exist
        }
    }
    
    walkDir(testDir);
    return files;
}

const sourceFiles = getSourceFiles();
const testFiles = getTestFiles();

console.log('📊 Current Status Summary');
console.log('=========================');
console.log(`Source files: ${sourceFiles.length}`);
console.log(`Test files: ${testFiles.length}`);
console.log(`Test-to-source ratio: ${(testFiles.length / sourceFiles.length * 100).toFixed(1)}%`);

// Analyze by category
console.log('\n📁 Coverage Analysis by Category');
console.log('=================================');

const categories = {};
sourceFiles.forEach(file => {
    if (!categories[file.category]) {
        categories[file.category] = {
            sourceFiles: [],
            testFiles: [],
            hasUnitTests: false,
            hasIntegrationTests: false
        };
    }
    categories[file.category].sourceFiles.push(file);
});

// Map test files to categories
testFiles.forEach(test => {
    const pathParts = test.relativePath.split('/');
    if (pathParts.length >= 2) {
        const category = pathParts[1]; // e.g., unit/services -> services
        if (categories[category]) {
            categories[category].testFiles.push(test);
            if (test.testType === 'unit') {
                categories[category].hasUnitTests = true;
            }
            if (test.testType === 'integration') {
                categories[category].hasIntegrationTests = true;
            }
        }
    }
});

// Calculate coverage estimates
let totalCoverageEstimate = 0;
let categoriesWithTests = 0;

Object.keys(categories).sort().forEach(category => {
    const cat = categories[category];
    const testCoverage = cat.testFiles.length > 0;
    const estimatedCoverage = testCoverage ? Math.min(80, (cat.testFiles.length / cat.sourceFiles.length) * 100) : 0;
    
    if (testCoverage) {
        categoriesWithTests++;
        totalCoverageEstimate += estimatedCoverage;
    }
    
    const status = testCoverage ? 
        (cat.hasUnitTests ? '🟢' : '🟡') : 
        '🔴';
    
    console.log(`${status} ${category}: ${cat.sourceFiles.length} files, ${cat.testFiles.length} tests (${estimatedCoverage.toFixed(0)}% est.)`);
    
    if (cat.testFiles.length > 0) {
        cat.testFiles.forEach(test => {
            console.log(`    • ${test.name} (${test.testType})`);
        });
    }
});

const overallEstimate = categoriesWithTests > 0 ? totalCoverageEstimate / Object.keys(categories).length : 0;

console.log('\n📈 Coverage Estimates');
console.log('====================');
console.log(`Categories with tests: ${categoriesWithTests}/${Object.keys(categories).length}`);
console.log(`Overall estimated coverage: ${overallEstimate.toFixed(1)}%`);
console.log(`Categories missing tests: ${Object.keys(categories).length - categoriesWithTests}`);

// Test status analysis
console.log('\n🧪 Test Infrastructure Status');
console.log('=============================');

const testsByType = {};
testFiles.forEach(test => {
    if (!testsByType[test.testType]) {
        testsByType[test.testType] = [];
    }
    testsByType[test.testType].push(test);
});

Object.keys(testsByType).sort().forEach(type => {
    console.log(`${type}: ${testsByType[type].length} files`);
});

// Problem analysis
console.log('\n⚠️  Known Issues Blocking Coverage');
console.log('===================================');
console.log('1. OrchestrationServer.test.ts - WebSocket mocking (partially fixed)');
console.log('2. TaskQueue.test.ts - Status expectation mismatches');
console.log('3. MessageProtocol.test.ts - Import/export issues');
console.log('4. Integration tests - Mock implementation failures');
console.log('5. Jest configuration - Validation warnings');

console.log('\n🎯 Recommendations for 10% Increase');
console.log('====================================');

// Find categories with no tests
const untested = Object.keys(categories).filter(cat => categories[cat].testFiles.length === 0);
const highValue = untested.filter(cat => categories[cat].sourceFiles.length >= 2);

console.log('High-value untested categories:');
highValue.forEach(cat => {
    console.log(`  • ${cat}: ${categories[cat].sourceFiles.length} files`);
});

console.log('\nPriority actions:');
console.log('1. Fix 5 failing test files to establish baseline');
console.log('2. Add unit tests for services/ (21 files, highest impact)');
console.log('3. Add unit tests for commands/ (9 files, good coverage ratio)');
console.log('4. Add unit tests for conductor/ (6 files, core functionality)');

const estimatedFilesToTest = Math.ceil(sourceFiles.length * 0.1 / 3); // 10% coverage, ~3 files per test
console.log(`\nEstimated new test files needed: ${estimatedFilesToTest}`);
console.log('Focus areas: Error handling, configuration validation, core business logic');

console.log('\n✅ Next Steps');
console.log('=============');
console.log('1. Run: npm run test:unit (fix failing tests first)');
console.log('2. Run: ./scripts/coverage-baseline.sh (after fixes)');
console.log('3. Add strategic unit tests based on this analysis');
console.log('4. Track progress with coverage reports');

console.log('\n📝 See COVERAGE_ANALYSIS_REPORT.md for detailed recommendations');