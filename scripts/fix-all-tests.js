#!/usr/bin/env node

/**
 * Script to automatically fix common issues in all test files
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all test files
const testFiles = glob.sync('src/test/**/*.test.ts', {
    cwd: path.join(__dirname, '..'),
    absolute: true
});

console.log(`Found ${testFiles.length} test files to fix`);

let filesFixed = 0;
let totalChanges = 0;

testFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    let changes = 0;

    // Replace Chai imports with Jest
    if (content.includes("import { expect } from 'chai'")) {
        content = content.replace(
            "import { expect } from 'chai';\n",
            "// Chai replaced with Jest expectations\n"
        );
        changes++;
    }

    // Replace Sinon imports and add mock factory imports
    if (content.includes("import * as sinon from 'sinon'")) {
        content = content.replace(
            "import * as sinon from 'sinon';",
            "import { jest } from '@jest/globals';\nimport { \n  createMockConfigurationService,\n  createMockLoggingService,\n  createMockEventBus,\n  createMockNotificationService,\n  createMockErrorHandler,\n  createMockMetricsService,\n  createMockContainer,\n  createMockExtensionContext,\n  setupVSCodeMocks,\n  resetAllMocks\n} from '../../helpers/mockFactories';"
        );
        changes++;
    }

    // Fix relative import paths for helpers
    content = content.replace(/from '\.\.\/helpers\/mockFactories'/g, "from '../helpers/mockFactories'");
    content = content.replace(/from '\.\.\/\.\.\/\.\.\/helpers\/mockFactories'/g, "from '../../helpers/mockFactories'");
    content = content.replace(/from '\.\.\/\.\.\/\.\.\/\.\.\/helpers\/mockFactories'/g, "from '../../../helpers/mockFactories'");

    // Replace sinon.createSandbox with Jest
    content = content.replace(/sandbox = sinon\.createSandbox\(\);?/g, '// Jest handles mock cleanup automatically');
    content = content.replace(/sandbox\.restore\(\);?/g, 'jest.clearAllMocks();');
    content = content.replace(/sandbox\.stub/g, 'jest.fn');
    content = content.replace(/sandbox\.spy/g, 'jest.fn');
    content = content.replace(/sinon\.stub/g, 'jest.fn');
    content = content.replace(/sinon\.spy/g, 'jest.fn');
    content = content.replace(/\.calledOnce/g, '.toHaveBeenCalledTimes(1)');
    content = content.replace(/\.calledTwice/g, '.toHaveBeenCalledTimes(2)');
    content = content.replace(/\.calledWith/g, '.toHaveBeenCalledWith');
    content = content.replace(/\.returns/g, '.mockReturnValue');
    content = content.replace(/\.resolves/g, '.mockResolvedValue');
    content = content.replace(/\.rejects/g, '.mockRejectedValue');
    content = content.replace(/\.callCount/g, '.mock.calls.length');

    // Fix Chai expectations to Jest
    content = content.replace(/expect\(([^)]+)\)\.to\.be\.true/g, 'expect($1).toBe(true)');
    content = content.replace(/expect\(([^)]+)\)\.to\.be\.false/g, 'expect($1).toBe(false)');
    content = content.replace(/expect\(([^)]+)\)\.to\.be\.undefined/g, 'expect($1).toBeUndefined()');
    content = content.replace(/expect\(([^)]+)\)\.to\.be\.null/g, 'expect($1).toBeNull()');
    content = content.replace(/expect\(([^)]+)\)\.to\.equal\(([^)]+)\)/g, 'expect($1).toBe($2)');
    content = content.replace(/expect\(([^)]+)\)\.to\.deep\.equal\(([^)]+)\)/g, 'expect($1).toEqual($2)');
    content = content.replace(/expect\(([^)]+)\)\.to\.have\.length\(([^)]+)\)/g, 'expect($1).toHaveLength($2)');
    content = content.replace(/expect\(([^)]+)\)\.to\.include\(([^)]+)\)/g, 'expect($1).toContain($2)');
    content = content.replace(/expect\(([^)]+)\)\.to\.contain\(([^)]+)\)/g, 'expect($1).toContain($2)');
    content = content.replace(/expect\(([^)]+)\)\.to\.match\(([^)]+)\)/g, 'expect($1).toMatch($2)');
    content = content.replace(/expect\(([^)]+)\)\.to\.throw/g, 'expect($1).toThrow');
    content = content.replace(/expect\(([^)]+)\)\.to\.be\.an?\(/g, 'expect($1).toBeInstanceOf(');
    content = content.replace(/expect\(([^)]+)\)\.to\.exist/g, 'expect($1).toBeDefined()');
    content = content.replace(/expect\(([^)]+)\)\.to\.not\.exist/g, 'expect($1).toBeUndefined()');

    // Fix mock service creation patterns
    content = content.replace(
        /mockConfigService = \{[\s\S]*?\} as any;/g,
        'mockConfigService = createMockConfigurationService();'
    );
    content = content.replace(
        /mockLoggingService = \{[\s\S]*?\} as any;/g,
        'mockLoggingService = createMockLoggingService();'
    );
    content = content.replace(
        /mockEventBus = \{[\s\S]*?\} as any;/g,
        'mockEventBus = createMockEventBus();'
    );
    content = content.replace(
        /mockNotificationService = \{[\s\S]*?\} as any;/g,
        'mockNotificationService = createMockNotificationService();'
    );

    // Fix describe.skip to describe (re-enable tests)
    content = content.replace(/describe\.skip\(/g, 'describe(');
    content = content.replace(/it\.skip\(/g, 'it(');

    // Count actual changes
    if (content !== originalContent) {
        changes = content.split('\n').filter((line, i) => 
            line !== originalContent.split('\n')[i]
        ).length;
    }

    if (changes > 0) {
        fs.writeFileSync(file, content);
        filesFixed++;
        totalChanges += changes;
        console.log(`✓ Fixed ${path.basename(file)} (${changes} changes)`);
    }
});

console.log(`\n✅ Fixed ${filesFixed} files with ${totalChanges} total changes`);

// Now fix specific constructor issues in commonly failing files
const specificFixes = [
    {
        file: 'src/test/unit/agents/AgentManager.test.ts',
        fix: (content) => {
            // Fix AgentManager constructor call
            return content.replace(
                /new AgentManager\([^)]*\)/g,
                'new AgentManager(createMockLoggingService())'
            );
        }
    },
    {
        file: 'src/test/unit/services/TerminalMonitor.test.ts',
        fix: (content) => {
            // Fix TerminalMonitor constructor - needs 3 params
            return content.replace(
                /new TerminalMonitor\(mockLoggingService, mockTaskToolBridge[^)]*\)/g,
                'new TerminalMonitor(mockLoggingService, mockConfigService, mockTaskToolBridge)'
            );
        }
    },
    {
        file: 'src/test/unit/tasks/TaskQueue.test.ts',
        fix: (content) => {
            // Fix TaskQueue constructor
            return content.replace(
                /new TaskQueue\(\)/g,
                'new TaskQueue(createMockAgentManager(), createMockLoggingService())'
            );
        }
    }
];

specificFixes.forEach(({ file, fix }) => {
    const fullPath = path.join(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        const fixed = fix(content);
        if (fixed !== content) {
            fs.writeFileSync(fullPath, fixed);
            console.log(`✓ Applied specific fix to ${path.basename(file)}`);
        }
    }
});

console.log('\n📝 Next steps:');
console.log('1. Run: npm run compile');
console.log('2. Run: npx jest --passWithNoTests');
console.log('3. Fix any remaining TypeScript errors manually');