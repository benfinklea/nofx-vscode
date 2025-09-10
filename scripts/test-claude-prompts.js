#!/usr/bin/env node

/**
 * Test runner for Claude prompt injection tests
 * Runs all tests related to prompt generation and injection
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

const testSuites = [
    {
        name: 'Regression Tests',
        pattern: 'src/test/regression/claude-prompt-injection-simple.test.ts',
        description: 'Tests to ensure Claude prompt injection never breaks again'
    },
    {
        name: 'Unit Tests - TerminalManager',
        pattern: 'src/test/unit/services/TerminalManager.prompt.test.ts',
        description: 'Unit tests for terminal prompt handling'
    },
    {
        name: 'Integration Tests',
        pattern: 'src/test/integration/agent-prompt-injection.test.ts',
        description: 'Integration tests for agent creation with prompts'
    },
    {
        name: 'Contract Tests',
        pattern: 'src/test/contracts/smart-template-system.contract.test.ts',
        description: 'Contract tests for SmartTemplateSystem'
    },
    {
        name: 'E2E Tests',
        pattern: 'src/test/e2e/claude-agent-lifecycle.e2e.test.ts',
        description: 'End-to-end tests for full agent lifecycle'
    }
];

class TestRunner {
    constructor() {
        this.results = [];
        this.startTime = Date.now();
    }

    log(message, color = 'reset') {
        console.log(`${colors[color]}${message}${colors.reset}`);
    }

    async runTest(suite) {
        return new Promise((resolve) => {
            this.log(`\n📋 Running ${suite.name}...`, 'cyan');
            this.log(`   ${suite.description}`, 'blue');

            const testPath = path.join(process.cwd(), suite.pattern);
            
            // Check if test file exists
            if (!fs.existsSync(testPath)) {
                this.log(`   ⚠️  Test file not found: ${suite.pattern}`, 'yellow');
                resolve({
                    suite: suite.name,
                    status: 'skipped',
                    reason: 'File not found'
                });
                return;
            }

            const startTime = Date.now();
            // Use Jest instead of Mocha since the project uses Jest
            const jest = spawn('npx', [
                'jest',
                '--testPathPattern', suite.pattern.replace('src/test/', ''),
                '--no-coverage',
                '--verbose'
            ], {
                cwd: process.cwd(),
                shell: true,
                env: { ...process.env, MOCK_FS: 'true' }
            });

            let output = '';
            let errorOutput = '';

            jest.stdout.on('data', (data) => {
                output += data.toString();
                process.stdout.write(data);
            });

            jest.stderr.on('data', (data) => {
                errorOutput += data.toString();
                process.stderr.write(data);
            });

            jest.on('close', (code) => {
                const duration = Date.now() - startTime;
                const result = {
                    suite: suite.name,
                    status: code === 0 ? 'passed' : 'failed',
                    duration,
                    output,
                    errorOutput,
                    exitCode: code
                };

                if (code === 0) {
                    this.log(`   ✅ ${suite.name} passed (${duration}ms)`, 'green');
                } else {
                    this.log(`   ❌ ${suite.name} failed (exit code: ${code})`, 'red');
                }

                this.results.push(result);
                resolve(result);
            });

            jest.on('error', (err) => {
                this.log(`   ❌ Failed to run test: ${err.message}`, 'red');
                resolve({
                    suite: suite.name,
                    status: 'error',
                    error: err.message
                });
            });
        });
    }

    async runAll() {
        this.log('🧪 Claude Prompt Injection Test Suite', 'magenta');
        this.log('=' .repeat(50), 'magenta');

        for (const suite of testSuites) {
            await this.runTest(suite);
        }

        this.printSummary();
    }

    printSummary() {
        const totalDuration = Date.now() - this.startTime;
        const passed = this.results.filter(r => r.status === 'passed').length;
        const failed = this.results.filter(r => r.status === 'failed').length;
        const skipped = this.results.filter(r => r.status === 'skipped').length;
        const errors = this.results.filter(r => r.status === 'error').length;

        this.log('\n' + '=' .repeat(50), 'magenta');
        this.log('📊 Test Summary', 'magenta');
        this.log('=' .repeat(50), 'magenta');

        this.results.forEach(result => {
            const icon = 
                result.status === 'passed' ? '✅' :
                result.status === 'failed' ? '❌' :
                result.status === 'skipped' ? '⚠️' : '⛔';
            
            const color = 
                result.status === 'passed' ? 'green' :
                result.status === 'failed' ? 'red' :
                result.status === 'skipped' ? 'yellow' : 'red';

            const duration = result.duration ? ` (${result.duration}ms)` : '';
            this.log(`${icon} ${result.suite}: ${result.status}${duration}`, color);
        });

        this.log('\n' + '=' .repeat(50), 'magenta');
        this.log(`Total: ${this.results.length} suites`, 'cyan');
        this.log(`Passed: ${passed}`, 'green');
        this.log(`Failed: ${failed}`, 'red');
        if (skipped > 0) this.log(`Skipped: ${skipped}`, 'yellow');
        if (errors > 0) this.log(`Errors: ${errors}`, 'red');
        this.log(`Duration: ${totalDuration}ms`, 'blue');
        this.log('=' .repeat(50), 'magenta');

        // Exit with appropriate code
        if (failed > 0 || errors > 0) {
            this.log('\n❌ Some tests failed. Please review the output above.', 'red');
            process.exit(1);
        } else if (passed === 0) {
            this.log('\n⚠️  No tests passed. Please check your test configuration.', 'yellow');
            process.exit(1);
        } else {
            this.log('\n✅ All tests passed!', 'green');
            process.exit(0);
        }
    }
}

// Check for flags
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const specific = args.find(arg => arg.startsWith('--suite='));

async function main() {
    const runner = new TestRunner();

    if (specific) {
        const suiteName = specific.split('=')[1];
        const suite = testSuites.find(s => 
            s.name.toLowerCase().includes(suiteName.toLowerCase())
        );
        
        if (suite) {
            runner.log(`Running specific suite: ${suite.name}`, 'cyan');
            await runner.runTest(suite);
            runner.printSummary();
        } else {
            runner.log(`Suite not found: ${suiteName}`, 'red');
            runner.log('Available suites:', 'yellow');
            testSuites.forEach(s => runner.log(`  - ${s.name}`, 'yellow'));
            process.exit(1);
        }
    } else {
        await runner.runAll();
    }

    if (watch) {
        runner.log('\n👁️  Watching for changes...', 'cyan');
        
        const chokidar = require('chokidar');
        const watcher = chokidar.watch([
            'src/agents/**/*.ts',
            'src/services/**/*.ts',
            'src/test/**/*.ts'
        ], {
            ignored: /node_modules/,
            persistent: true
        });

        watcher.on('change', async (path) => {
            runner.log(`\n🔄 File changed: ${path}`, 'yellow');
            runner.log('Re-running tests...', 'yellow');
            runner.results = [];
            runner.startTime = Date.now();
            await runner.runAll();
        });
    }
}

// Run tests
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});