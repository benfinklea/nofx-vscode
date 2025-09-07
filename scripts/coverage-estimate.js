#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('📊 Coverage Estimation for NofX VS Code Extension');
console.log('=================================================\n');

// Get all source files
function getSourceFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !file.includes('test')) {
            getSourceFiles(filePath, fileList);
        } else if (file.endsWith('.ts') && !file.includes('.test.') && !file.includes('.d.ts')) {
            fileList.push({
                path: filePath,
                name: file,
                category: path.relative('src', filePath).split(path.sep)[0]
            });
        }
    });
    
    return fileList;
}

// Get all test files
function getTestFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            getTestFiles(filePath, fileList);
        } else if (file.endsWith('.test.ts')) {
            fileList.push({
                path: filePath,
                name: file.replace('.test.ts', '.ts'),
                testName: file
            });
        }
    });
    
    return fileList;
}

const sourceFiles = getSourceFiles(path.join(__dirname, '..', 'src'));
const testFiles = getTestFiles(path.join(__dirname, '..', 'src', 'test', 'unit'));

console.log(`Total source files: ${sourceFiles.length}`);
console.log(`Total test files: ${testFiles.length}`);

// Map test files to source files
const testedFiles = new Set();
const testMapping = {};

testFiles.forEach(test => {
    const baseName = test.name;
    const sourceFile = sourceFiles.find(src => src.name === baseName);
    
    if (sourceFile) {
        testedFiles.add(sourceFile.name);
        testMapping[sourceFile.name] = test.testName;
    }
});

// Calculate coverage by category
const categories = {};
sourceFiles.forEach(file => {
    if (!categories[file.category]) {
        categories[file.category] = {
            total: 0,
            tested: 0,
            files: []
        };
    }
    
    categories[file.category].total++;
    if (testedFiles.has(file.name)) {
        categories[file.category].tested++;
        categories[file.category].files.push(file.name);
    }
});

console.log('\n📁 Coverage by Category:');
console.log('========================');

let totalTested = 0;
let totalFiles = 0;

Object.keys(categories).sort().forEach(cat => {
    const data = categories[cat];
    const percentage = data.total > 0 ? (data.tested / data.total * 100).toFixed(1) : 0;
    const status = percentage >= 40 ? '✅' : percentage >= 20 ? '🟡' : '🔴';
    
    console.log(`${status} ${cat}: ${data.tested}/${data.total} files (${percentage}%)`);
    
    if (data.tested > 0) {
        console.log(`   Tested: ${data.files.join(', ')}`);
    }
    
    totalTested += data.tested;
    totalFiles += data.total;
});

const overallPercentage = (totalTested / totalFiles * 100).toFixed(1);

console.log('\n📈 Overall Coverage Estimate:');
console.log('=============================');
console.log(`Files with tests: ${totalTested}/${totalFiles} (${overallPercentage}%)`);

// Estimate line coverage (assuming 40% coverage per tested file)
const estimatedLineCoverage = (totalTested / totalFiles * 40).toFixed(1);
console.log(`Estimated line coverage: ~${estimatedLineCoverage}%`);

// New tests created in this session
const newTestFiles = [
    'AgentTemplateManager.test.ts',
    'LoggingService.test.ts',
    'TerminalManager.test.ts',
    'NotificationService.test.ts',
    'EventBus.test.ts',
    'CommandService.test.ts',
    'AgentPersistence.test.ts',
    'MessageFlowDashboard.test.ts',
    'WorktreeManager.test.ts'
];

console.log('\n🆕 New Test Files Created:');
console.log('==========================');
newTestFiles.forEach(file => {
    const exists = testFiles.some(t => t.testName === file);
    console.log(`${exists ? '✅' : '❌'} ${file}`);
});

// Coverage goal assessment
console.log('\n🎯 40% Coverage Goal Assessment:');
console.log('=================================');

const criticalCategories = ['services', 'agents', 'orchestration', 'conductor', 'commands'];
let criticalCovered = 0;
let criticalTotal = 0;

criticalCategories.forEach(cat => {
    if (categories[cat]) {
        criticalCovered += categories[cat].tested;
        criticalTotal += categories[cat].total;
    }
});

const criticalPercentage = (criticalCovered / criticalTotal * 100).toFixed(1);
console.log(`Critical components: ${criticalCovered}/${criticalTotal} files (${criticalPercentage}%)`);

if (overallPercentage >= 40) {
    console.log('\n✅ GOAL ACHIEVED: Overall file coverage exceeds 40%!');
} else if (criticalPercentage >= 40) {
    console.log('\n✅ PARTIAL SUCCESS: Critical components exceed 40% coverage!');
    console.log(`   Overall coverage needs ${(40 - overallPercentage).toFixed(1)}% more to reach goal.`);
} else {
    const needed = Math.ceil((totalFiles * 0.4) - totalTested);
    console.log(`\n🔴 Need ${needed} more test files to reach 40% coverage.`);
}

// Recommendations
console.log('\n💡 Recommendations:');
console.log('===================');

const untestedCritical = [];
sourceFiles.forEach(file => {
    if (!testedFiles.has(file.name) && criticalCategories.includes(file.category)) {
        untestedCritical.push(`${file.category}/${file.name}`);
    }
});

if (untestedCritical.length > 0) {
    console.log('High-priority files still needing tests:');
    untestedCritical.slice(0, 10).forEach(file => {
        console.log(`  • ${file}`);
    });
    if (untestedCritical.length > 10) {
        console.log(`  ... and ${untestedCritical.length - 10} more`);
    }
} else {
    console.log('All critical files have test coverage! 🎉');
}