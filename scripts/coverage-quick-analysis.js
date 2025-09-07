#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Quick Coverage Analysis for NofX VS Code Extension
 * 
 * This script analyzes the current test coverage implementation 
 * without running the full test suite, which has some failing tests.
 */

console.log('🎯 NofX Coverage Quick Analysis');
console.log('================================');

// Count source files that should be covered
const srcDir = path.join(__dirname, '..', 'src');
const testDir = path.join(__dirname, '..', 'src', 'test');

function countFilesRecursively(dir, extensions = ['.ts']) {
    const files = [];
    
    function walk(currentDir) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                walk(fullPath);
            } else if (extensions.some(ext => item.endsWith(ext))) {
                files.push(fullPath);
            }
        }
    }
    
    walk(dir);
    return files;
}

// Count source files (excluding test files)
const allSourceFiles = countFilesRecursively(srcDir, ['.ts']);
const testFiles = countFilesRecursively(testDir, ['.ts']);
const sourceFilesToCover = allSourceFiles.filter(file => !file.includes('/test/'));

console.log('\n📊 File Analysis');
console.log('================');
console.log(`Total source files: ${sourceFilesToCover.length}`);
console.log(`Total test files: ${testFiles.length}`);

// Categorize source files by directory
const categories = {};
sourceFilesToCover.forEach(file => {
    const relativePath = path.relative(srcDir, file);
    const category = relativePath.split('/')[0];
    
    if (!categories[category]) {
        categories[category] = [];
    }
    categories[category].push(relativePath);
});

console.log('\n📁 Source Files by Category');
console.log('===========================');
Object.keys(categories).sort().forEach(category => {
    console.log(`${category}: ${categories[category].length} files`);
    if (categories[category].length <= 5) {
        categories[category].forEach(file => {
            console.log(`  • ${file}`);
        });
    } else {
        console.log(`  • ${categories[category].slice(0, 3).join('\n  • ')}`);
        console.log(`  • ... and ${categories[category].length - 3} more`);
    }
});

// Analyze test files
console.log('\n🧪 Test Coverage Analysis');
console.log('=========================');

const testCategories = {};
testFiles.forEach(file => {
    const relativePath = path.relative(testDir, file);
    const parts = relativePath.split('/');
    const testType = parts[0]; // unit, integration, functional
    
    if (!testCategories[testType]) {
        testCategories[testType] = [];
    }
    testCategories[testType].push(relativePath);
});

Object.keys(testCategories).sort().forEach(testType => {
    console.log(`\n${testType.toUpperCase()} Tests: ${testCategories[testType].length} files`);
    testCategories[testType].forEach(file => {
        console.log(`  • ${file}`);
    });
});

// Coverage estimation based on test file structure
console.log('\n📈 Coverage Estimation');
console.log('======================');

const unitTests = testCategories.unit || [];
const integrationTests = testCategories.integration || [];
const functionalTests = testCategories.functional || [];

// Rough estimation - each test file might cover 3-5 source files on average
const estimatedCoveredFiles = (unitTests.length * 2) + (integrationTests.length * 4) + (functionalTests.length * 3);
const estimatedCoveragePercent = Math.min(100, Math.round((estimatedCoveredFiles / sourceFilesToCover.length) * 100));

console.log(`Estimated files with some coverage: ${Math.min(estimatedCoveredFiles, sourceFilesToCover.length)}/${sourceFilesToCover.length}`);
console.log(`Estimated overall coverage: ~${estimatedCoveragePercent}%`);

// Identify potentially uncovered areas
console.log('\n🔍 Potentially Uncovered Areas');
console.log('==============================');

const coveredCategories = new Set();
unitTests.forEach(test => {
    const category = test.split('/')[1]; // e.g., unit/services/ConfigurationService.test.ts -> services
    if (category) coveredCategories.add(category);
});

const uncoveredCategories = Object.keys(categories).filter(cat => !coveredCategories.has(cat));
if (uncoveredCategories.length > 0) {
    console.log('Categories with limited or no unit test coverage:');
    uncoveredCategories.forEach(category => {
        console.log(`🔴 ${category}: ${categories[category].length} files`);
    });
} else {
    console.log('✅ All major categories have some unit test coverage');
}

// Recommendations
console.log('\n💡 Recommendations for 10% Coverage Increase');
console.log('=============================================');

console.log('1. Fix failing tests first:');
console.log('   • OrchestrationServer.test.ts - WebSocket mocking issue');
console.log('   • TaskQueue.test.ts - Status expectation mismatches'); 
console.log('   • Integration tests - Mock implementation issues');

console.log('\n2. High-impact areas to add tests:');
const highImpactAreas = [
    { area: 'services/', files: categories['services']?.length || 0, priority: 'HIGH' },
    { area: 'commands/', files: categories['commands']?.length || 0, priority: 'HIGH' },
    { area: 'orchestration/', files: categories['orchestration']?.length || 0, priority: 'MEDIUM' },
    { area: 'conductor/', files: categories['conductor']?.length || 0, priority: 'MEDIUM' },
    { area: 'agents/', files: categories['agents']?.length || 0, priority: 'MEDIUM' }
];

highImpactAreas
    .filter(area => area.files > 0)
    .sort((a, b) => b.files - a.files)
    .forEach(area => {
        console.log(`   • ${area.area} (${area.files} files) - Priority: ${area.priority}`);
    });

console.log('\n3. Test types needed:');
console.log('   • Unit tests for core business logic');
console.log('   • Integration tests for service interactions');
console.log('   • Error handling and edge cases');
console.log('   • Configuration validation');

console.log('\n4. Estimated effort to reach +10% coverage:');
const additionalTestsNeeded = Math.ceil(sourceFilesToCover.length * 0.1 / 3); // Assuming each test covers ~3 files
console.log(`   • Add ~${additionalTestsNeeded} new test files`);
console.log('   • Focus on high-value, low-complexity functions first');
console.log('   • Prioritize error paths and edge cases');

console.log('\n🎯 Next Steps');
console.log('=============');
console.log('1. Fix the 4-5 failing tests to establish baseline');
console.log('2. Run coverage analysis with fixed tests');
console.log('3. Add strategic unit tests for core services');
console.log('4. Add integration tests for critical workflows');
console.log('5. Track progress with the coverage-baseline.sh script');

console.log('\n✅ Analysis Complete!');