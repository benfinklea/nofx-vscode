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
    
    // Get the relative path depth
    const relativePath = path.relative(path.join(__dirname, '..', 'src', 'test'), file);
    const depth = relativePath.split(path.sep).length - 1;
    
    // Calculate correct relative path
    let correctPath = '';
    if (depth === 1) {
        // Files directly in src/test/
        correctPath = './helpers/mockFactories';
    } else if (depth === 2) {
        // Files in src/test/unit/, src/test/integration/, src/test/functional/
        correctPath = '../helpers/mockFactories';
    } else if (depth === 3) {
        // Files in src/test/unit/services/, etc.
        correctPath = '../../helpers/mockFactories';
    } else if (depth === 4) {
        correctPath = '../../../helpers/mockFactories';
    }
    
    // Fix the import path
    if (correctPath) {
        const importRegex = /from ['"]\.\.\/helpers\/mockFactories['"]/g;
        const correctImport = `from '${correctPath}'`;
        
        if (content.match(importRegex)) {
            content = content.replace(importRegex, correctImport);
            
            // Also fix any wrong TestHelpers imports
            const testHelpersRegex = /from ['"]\.\.\/utils\/TestHelpers['"]/g;
            const correctTestHelpers = `from '${correctPath.replace('helpers/mockFactories', 'utils/TestHelpers')}'`;
            content = content.replace(testHelpersRegex, correctTestHelpers);
            
            if (content !== originalContent) {
                fs.writeFileSync(file, content);
                totalFixed++;
                console.log(`✓ Fixed ${path.basename(path.dirname(file))}/${path.basename(file)}`);
            }
        }
    }
});

console.log(`\n✅ Fixed import paths in ${totalFixed} files`);