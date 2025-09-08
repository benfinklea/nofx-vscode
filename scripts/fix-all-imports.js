#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all test files
const testFiles = glob.sync('src/test/**/*.test.ts', {
    cwd: path.join(__dirname, '..'),
    absolute: true
});

console.log(`Fixing import paths in ${testFiles.length} test files\n`);

let totalFixed = 0;

testFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    
    // Calculate directory depth from src/test
    const fileDir = path.dirname(file);
    const testDir = path.join(__dirname, '..', 'src', 'test');
    const relativePath = path.relative(fileDir, path.join(testDir, 'helpers', 'mockFactories.ts'));
    const correctPath = './' + relativePath.replace(/\\/g, '/').replace('.ts', '');
    
    // Fix mockFactories import
    const mockFactoriesRegex = /from\s+['"][^'"]*mockFactories['"]/g;
    if (content.match(mockFactoriesRegex)) {
        content = content.replace(mockFactoriesRegex, `from '${correctPath}'`);
    }
    
    // Fix TestHelpers import  
    const testHelpersPath = correctPath.replace('helpers/mockFactories', 'utils/TestHelpers');
    const testHelpersRegex = /from\s+['"][^'"]*TestHelpers['"]/g;
    if (content.match(testHelpersRegex)) {
        content = content.replace(testHelpersRegex, `from '${testHelpersPath}'`);
    }
    
    if (content !== originalContent) {
        fs.writeFileSync(file, content);
        totalFixed++;
        const relFile = path.relative(path.join(__dirname, '..'), file);
        console.log(`✓ Fixed ${relFile}`);
    }
});

console.log(`\n✅ Fixed import paths in ${totalFixed} files`);