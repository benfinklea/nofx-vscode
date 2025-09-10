"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
exports.default = (0, test_1.defineConfig)({
    testDir: './src/test/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['junit', { outputFile: 'test-results/e2e-results.xml' }],
        ['list']
    ],
    timeout: 120000,
    use: {
        baseURL: 'http://localhost:7778',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 30000,
        navigationTimeout: 30000,
    },
    projects: [
        {
            name: 'vscode-extension',
            testMatch: '**/*.e2e.test.ts',
            use: {
                ...test_1.devices['Desktop Chrome'],
                viewport: { width: 1920, height: 1080 },
            },
        },
        {
            name: 'websocket-orchestration',
            testMatch: '**/websocket/*.e2e.test.ts',
            use: {
                ...test_1.devices['Desktop Chrome'],
            },
        },
        {
            name: 'conductor-workflow',
            testMatch: '**/conductor/*.e2e.test.ts',
            use: {
                ...test_1.devices['Desktop Chrome'],
            },
        },
        {
            name: 'agent-management',
            testMatch: '**/agents/*.e2e.test.ts',
            use: {
                ...test_1.devices['Desktop Chrome'],
            },
        },
    ],
    webServer: {
        command: 'TEST_PORT=7778 npx tsc src/test/e2e/test-server.ts --outDir out/test/e2e --esModuleInterop --skipLibCheck --module commonjs --target es2020 && TEST_PORT=7778 node ./out/test/e2e/test-server.js',
        port: 7778,
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
    },
});
//# sourceMappingURL=playwright.config.js.map