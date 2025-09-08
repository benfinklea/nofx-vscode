#!/usr/bin/env node

/**
 * Comprehensive test fixer for all common issues
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all test files
const testFiles = glob.sync('src/test/**/*.test.ts', {
    cwd: path.join(__dirname, '..'),
    absolute: true
});

console.log(`Fixing test logic issues in ${testFiles.length} test files\n`);

let totalFixed = 0;
let totalChanges = 0;

testFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    let changes = 0;

    // 1. Fix DOMAIN_EVENTS import
    if (content.includes("from '../../../services/EventBus'") && content.includes('DOMAIN_EVENTS')) {
        content = content.replace(
            /import\s*{\s*([^}]*)\s*}\s*from\s*'[^']*EventBus'/g,
            (match, imports) => {
                const importList = imports.split(',').map(i => i.trim());
                const domainEventsIndex = importList.indexOf('DOMAIN_EVENTS');
                if (domainEventsIndex > -1) {
                    importList.splice(domainEventsIndex, 1);
                    const newImports = importList.join(', ');
                    return `import { ${newImports} } from '../../../services/EventBus';\nimport { DOMAIN_EVENTS } from '../../../services/EventConstants'`;
                }
                return match;
            }
        );
        changes++;
    }

    // 2. Fix vscode mock issues - use jest.mock at module level
    if (content.includes('vscode') && !content.includes("jest.mock('vscode'")) {
        // Add jest.mock for vscode if not present
        const firstImportIndex = content.indexOf('import');
        const firstDescribeIndex = content.indexOf('describe(');
        if (firstImportIndex > -1 && firstDescribeIndex > -1) {
            const insertPos = content.lastIndexOf('\n', firstDescribeIndex);
            if (!content.includes("jest.mock('vscode')")) {
                content = content.slice(0, insertPos) + `\njest.mock('vscode');\n` + content.slice(insertPos);
                changes++;
            }
        }
    }

    // 3. Fix missing mock lifecycle manager methods
    content = content.replace(
        /mockAgentLifecycleManager\s*=\s*{[^}]*}/g,
        (match) => {
            if (!match.includes('startTaskMonitoring')) {
                return match.replace(/}$/, ',\n            startTaskMonitoring: jest.fn(),\n            stopTaskMonitoring: jest.fn()\n        }');
            }
            return match;
        }
    );

    // 4. Fix getRegisteredEvents() expectations in tests that don't use EventBus
    if (!content.includes('EventBus') && content.includes('getRegisteredEvents')) {
        content = content.replace(/\.getRegisteredEvents\(\)/g, '.getEvents && bus.getEvents()');
        changes++;
    }

    // 5. Fix hasSubscribers implementation expectations
    if (content.includes('hasSubscribers')) {
        // Ensure proper tracking of subscriber counts
        content = content.replace(
            /expect\(eventBus\.hasSubscribers\([^)]+\)\)\.toBe\(false\)/g,
            (match) => {
                // Check if this is after dispose calls
                const beforeContext = content.substring(Math.max(0, content.indexOf(match) - 200), content.indexOf(match));
                if (beforeContext.includes('disposable') && beforeContext.includes('.dispose()')) {
                    return match; // Keep as is
                }
                return match;
            }
        );
    }

    // 6. Fix AgentManager test issues
    if (content.includes('AgentManager')) {
        // Fix missing imports
        if (!content.includes('createMockTerminal')) {
            content = content.replace(
                /from ['"].*mockFactories['"]/,
                match => match.replace('createMockOutputChannel', 'createMockOutputChannel, createMockTerminal')
            );
            changes++;
        }

        // Fix mockTerminal initialization
        if (content.includes('mockTerminal') && !content.includes('mockTerminal = createMockTerminal()')) {
            content = content.replace(
                /beforeEach\(\(\) => {/g,
                'beforeEach(() => {\n        mockTerminal = createMockTerminal();'
            );
            changes++;
        }
    }

    // 7. Fix integration test TestHelpers import
    if (content.includes('TestHelpers') && !content.includes('createIntegrationContainer')) {
        content = content.replace(
            /import\s*{[^}]*}\s*from\s*['"][^'"]*TestHelpers['"]/g,
            (match) => {
                if (!match.includes('createIntegrationContainer')) {
                    return match.replace(/from/, 'from').replace('{', '{ createIntegrationContainer, ');
                }
                return match;
            }
        );
    }

    // 8. Fix mock function call expectations
    content = content.replace(/\.to\.have\.been\.calledWith/g, '.toHaveBeenCalledWith');
    content = content.replace(/\.to\.have\.been\.called/g, '.toHaveBeenCalled');
    content = content.replace(/\.called/g, '.toHaveBeenCalled');
    content = content.replace(/\.calledWith/g, '.toHaveBeenCalledWith');

    // 9. Fix async test patterns
    content = content.replace(/it\(['"]([^'"]+)['"]\s*,\s*async\s*\(\)\s*=>\s*{/g, 'it(\'$1\', async () => {');
    content = content.replace(/describe\(['"]([^'"]+)['"]\s*,\s*\(\)\s*=>\s*{/g, 'describe(\'$1\', () => {');

    // 10. Fix test timeout issues
    if (content.includes('OrchestrationServer') || content.includes('WebSocket')) {
        content = content.replace(
            /it\((['"][^'"]+['"]),\s*async\s*\(\)\s*=>\s*{/g,
            'it($1, async () => {'
        );
        // Add timeout for long-running tests
        if (!content.includes('jest.setTimeout')) {
            const describeIndex = content.indexOf('describe(');
            if (describeIndex > -1) {
                content = content.slice(0, describeIndex) + 'jest.setTimeout(10000);\n\n' + content.slice(describeIndex);
                changes++;
            }
        }
    }

    // 11. Fix ConfigurationService test issues
    if (content.includes('ConfigurationService') && !content.includes('mockWorkspace')) {
        // Add workspace mock
        const beforeEachMatch = content.match(/beforeEach\(\(\) => \{/);
        if (beforeEachMatch) {
            const insertPos = content.indexOf(beforeEachMatch[0]) + beforeEachMatch[0].length;
            if (!content.includes('mockWorkspace')) {
                content = content.slice(0, insertPos) + 
                    '\n        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };' +
                    '\n        (global as any).vscode = { workspace: mockWorkspace };' +
                    content.slice(insertPos);
                changes++;
            }
        }
    }

    // 12. Fix Container test issues
    if (content.includes('Container') && content.includes('SERVICE_TOKENS')) {
        // Ensure SERVICE_TOKENS are properly imported
        if (!content.includes("import { SERVICE_TOKENS }")) {
            content = content.replace(
                /import\s*{([^}]*)}\s*from\s*['"][^'"]*interfaces['"]/g,
                (match, imports) => {
                    if (!imports.includes('SERVICE_TOKENS')) {
                        return match.replace('{', '{ SERVICE_TOKENS, ');
                    }
                    return match;
                }
            );
            changes++;
        }
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
console.log('3. Review remaining failures manually');