#!/usr/bin/env node

/**
 * Comprehensive test suite fixer
 * Addresses all common issues across the test suite
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all test files
const testFiles = glob.sync('src/test/**/*.test.ts', {
    cwd: path.join(__dirname, '..'),
    absolute: true
});

console.log(`Found ${testFiles.length} test files to fix\n`);

let totalFixed = 0;
let totalChanges = 0;

testFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    let changes = 0;

    // 1. Add import for mock factories if not present
    if (!content.includes('mockFactories') && !content.includes('SimpleTemplateValidation')) {
        const importLine = "import { createMockConfigurationService, createMockLoggingService, createMockEventBus, createMockNotificationService, createMockContainer, createMockExtensionContext, createMockOutputChannel, createMockTerminal, setupVSCodeMocks } from '../helpers/mockFactories';\n";
        
        // Find the right place to insert (after other imports)
        const lastImportMatch = content.match(/^import.*from.*;$/gm);
        if (lastImportMatch) {
            const lastImport = lastImportMatch[lastImportMatch.length - 1];
            const insertPos = content.indexOf(lastImport) + lastImport.length;
            content = content.slice(0, insertPos) + '\n' + importLine + content.slice(insertPos);
            changes++;
        }
    }

    // 2. Replace Chai expectations with Jest
    const chaiReplacements = [
        [/expect\(([^)]+)\)\.to\.equal\(([^)]+)\)/g, 'expect($1).toBe($2)'],
        [/expect\(([^)]+)\)\.to\.deep\.equal\(([^)]+)\)/g, 'expect($1).toEqual($2)'],
        [/expect\(([^)]+)\)\.to\.be\.true/g, 'expect($1).toBe(true)'],
        [/expect\(([^)]+)\)\.to\.be\.false/g, 'expect($1).toBe(false)'],
        [/expect\(([^)]+)\)\.to\.be\.null/g, 'expect($1).toBeNull()'],
        [/expect\(([^)]+)\)\.to\.be\.undefined/g, 'expect($1).toBeUndefined()'],
        [/expect\(([^)]+)\)\.to\.be\.empty/g, 'expect($1).toHaveLength(0)'],
        [/expect\(([^)]+)\)\.to\.have\.length\(([^)]+)\)/g, 'expect($1).toHaveLength($2)'],
        [/expect\(([^)]+)\)\.to\.contain\(([^)]+)\)/g, 'expect($1).toContain($2)'],
        [/expect\(([^)]+)\)\.to\.match\(([^)]+)\)/g, 'expect($1).toMatch($2)'],
        [/expect\(([^)]+)\)\.to\.throw/g, 'expect($1).toThrow'],
        [/\.to\.be\.calledWith/g, '.toHaveBeenCalledWith'],
        [/\.to\.be\.called/g, '.toHaveBeenCalled'],
        [/\.to\.have\.been\.calledWith/g, '.toHaveBeenCalledWith'],
        [/\.to\.have\.been\.called/g, '.toHaveBeenCalled']
    ];

    chaiReplacements.forEach(([pattern, replacement]) => {
        const before = content;
        content = content.replace(pattern, replacement);
        if (before !== content) changes++;
    });

    // 3. Replace Sinon with Jest mocks
    const sinonReplacements = [
        [/sinon\.stub\(\)/g, 'jest.fn()'],
        [/sinon\.spy\(\)/g, 'jest.fn()'],
        [/sinon\.mock\(\)/g, 'jest.fn()'],
        [/sandbox\.stub\(\)/g, 'jest.fn()'],
        [/sandbox\.spy\(\)/g, 'jest.fn()'],
        [/\.calledWith/g, '.toHaveBeenCalledWith'],
        [/\.called/g, '.toHaveBeenCalled'],
        [/\.callCount/g, '.mock.calls.length'],
        [/\.getCall\(0\)\.args/g, '.mock.calls[0]'],
        [/\.returns\(/g, '.mockReturnValue('],
        [/\.resolves\(/g, '.mockResolvedValue('],
        [/\.rejects\(/g, '.mockRejectedValue('],
        [/\.restore\(\)/g, '.mockRestore()']
    ];

    sinonReplacements.forEach(([pattern, replacement]) => {
        const before = content;
        content = content.replace(pattern, replacement);
        if (before !== content) changes++;
    });

    // 4. Fix async expect patterns
    content = content.replace(/await expect\(([^)]+)\)\.mockResolvedValue\.not\.toThrow\(\)/g, 'await expect($1).resolves.not.toThrow()');
    content = content.replace(/await expect\(([^)]+)\)\.mockRejectedValue\.toThrow\(/g, 'await expect($1).rejects.toThrow(');
    
    // 5. Fix missing mock declarations
    if (content.includes('mockConfigService') && !content.includes('const mockConfigService')) {
        const beforeEachMatch = content.match(/beforeEach\(\(\) => \{/);
        if (beforeEachMatch) {
            const insertPos = content.indexOf(beforeEachMatch[0]) + beforeEachMatch[0].length;
            content = content.slice(0, insertPos) + 
                '\n        mockConfigService = createMockConfigurationService();' +
                content.slice(insertPos);
            changes++;
        }
    }

    // 6. Fix IConfigurationService mock issues
    content = content.replace(/mockConfigService\.get\.mockReturnValue\(undefined\)/g, 
                            'mockConfigService.get = jest.fn().mockReturnValue(undefined)');
    
    // 7. Add setupVSCodeMocks() call if using vscode
    if (content.includes('vscode') && !content.includes('setupVSCodeMocks')) {
        const describeMatch = content.match(/describe\([^)]+\) => \{/);
        if (describeMatch) {
            const insertPos = content.indexOf(describeMatch[0]) + describeMatch[0].length;
            content = content.slice(0, insertPos) + 
                '\n    setupVSCodeMocks();' +
                content.slice(insertPos);
            changes++;
        }
    }

    // 8. Fix mock lifecycle manager
    content = content.replace(
        /mockAgentLifecycleManager = \{[^}]+\}/g,
        `mockAgentLifecycleManager = {
            spawnAgent: jest.fn(),
            removeAgent: jest.fn(),
            initialize: jest.fn(),
            startTaskMonitoring: jest.fn(),
            stopTaskMonitoring: jest.fn(),
            dispose: jest.fn()
        }`
    );

    // 9. Fix variable declarations
    if (content.includes('let mockTerminal') && !content.includes('mockTerminal = createMockTerminal()')) {
        content = content.replace(
            /let mockTerminal;/g,
            'let mockTerminal: any;'
        );
        
        const beforeEachContent = content.match(/beforeEach\(\(\) => \{[^}]*\}/);
        if (beforeEachContent && !beforeEachContent[0].includes('mockTerminal = ')) {
            content = content.replace(
                /beforeEach\(\(\) => \{/,
                'beforeEach(() => {\n        mockTerminal = createMockTerminal();'
            );
            changes++;
        }
    }

    // 10. Fix imports for domain events
    if (content.includes('DOMAIN_EVENTS') && !content.includes("import { DOMAIN_EVENTS }")) {
        content = content.replace(
            /^(import .* from '.*';)$/m,
            "$1\nimport { DOMAIN_EVENTS } from '../../services/EventBus';"
        );
        changes++;
    }

    // Write back if changed
    if (content !== originalContent) {
        fs.writeFileSync(file, content);
        totalFixed++;
        totalChanges += changes;
        console.log(`✓ Fixed ${path.basename(file)} (${changes} changes)`);
    }
});

console.log(`\n✅ Fixed ${totalFixed} files with ${totalChanges} total changes`);
console.log('\nNext steps:');
console.log('1. Run: npm run compile');
console.log('2. Run: npm test');
console.log('3. Fix any remaining TypeScript errors manually');