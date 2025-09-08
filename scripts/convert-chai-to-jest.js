#!/usr/bin/env node

/**
 * Script to convert Chai expectations to Jest expectations
 */

const fs = require('fs');
const path = require('path');

function convertChaiToJest(content) {
    let converted = content;
    
    // Convert basic expectations
    converted = converted.replace(/expect\(([^)]+)\)\.to\.equal\(([^)]+)\)/g, 'expect($1).toBe($2)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.be\.equal\(([^)]+)\)/g, 'expect($1).toBe($2)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.deep\.equal\(([^)]+)\)/g, 'expect($1).toEqual($2)');
    
    // Convert boolean expectations
    converted = converted.replace(/expect\(([^)]+)\)\.to\.be\.true/g, 'expect($1).toBe(true)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.be\.false/g, 'expect($1).toBe(false)');
    
    // Convert include/contain expectations
    converted = converted.replace(/expect\(([^)]+)\)\.to\.include\(([^)]+)\)/g, 'expect($1).toContain($2)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.contain\(([^)]+)\)/g, 'expect($1).toContain($2)');
    
    // Convert length expectations
    converted = converted.replace(/expect\(([^)]+)\)\.to\.have\.length\(([^)]+)\)/g, 'expect($1).toHaveLength($2)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.have\.lengthOf\(([^)]+)\)/g, 'expect($1).toHaveLength($2)');
    
    // Convert call expectations (Sinon) - order matters!
    converted = converted.replace(/expect\(([^)]+)\)\.to\.have\.been\.calledWith\(/g, 'expect($1).toHaveBeenCalledWith(');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.have\.been\.calledOnce/g, 'expect($1).toHaveBeenCalledTimes(1)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.have\.been\.calledTwice/g, 'expect($1).toHaveBeenCalledTimes(2)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.have\.been\.callCount\(([^)]+)\)/g, 'expect($1).toHaveBeenCalledTimes($2)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.have\.been\.called([^W]|$)/g, 'expect($1).toHaveBeenCalled()$2');
    
    // Convert negated expectations
    converted = converted.replace(/expect\(([^)]+)\)\.to\.not\.have\.been\.called/g, 'expect($1).not.toHaveBeenCalled()');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.not\.have\.been\.calledWith\(/g, 'expect($1).not.toHaveBeenCalledWith(');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.not\.equal\(([^)]+)\)/g, 'expect($1).not.toBe($2)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.not\.include\(([^)]+)\)/g, 'expect($1).not.toContain($2)');
    
    // Convert numeric comparisons
    converted = converted.replace(/expect\(([^)]+)\)\.to\.be\.greaterThan\(([^)]+)\)/g, 'expect($1).toBeGreaterThan($2)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.be\.lessThan\(([^)]+)\)/g, 'expect($1).toBeLessThan($2)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.be\.at\.least\(([^)]+)\)/g, 'expect($1).toBeGreaterThanOrEqual($2)');
    
    // Convert instance checks
    converted = converted.replace(/expect\(([^)]+)\)\.to\.be\.instanceof\(([^)]+)\)/g, 'expect($1).toBeInstanceOf($2)');
    converted = converted.replace(/expect\(([^)]+)\)\.to\.be\.an\.instanceof\(([^)]+)\)/g, 'expect($1).toBeInstanceOf($2)');
    
    return converted;
}

function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const converted = convertChaiToJest(content);
    
    if (content !== converted) {
        fs.writeFileSync(filePath, converted);
        console.log(`Converted: ${filePath}`);
        return true;
    }
    return false;
}

// Process specific file or all test files
const targetFile = process.argv[2];
if (targetFile) {
    if (fs.existsSync(targetFile)) {
        const changed = processFile(targetFile);
        console.log(changed ? `Converted ${targetFile}` : `No changes needed in ${targetFile}`);
    } else {
        console.error(`File not found: ${targetFile}`);
        process.exit(1);
    }
} else {
    console.log('Usage: node convert-chai-to-jest.js <file-path>');
    console.log('Example: node convert-chai-to-jest.js src/test/unit/services/TerminalMonitor.test.ts');
}