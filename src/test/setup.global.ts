/**
 * Global test setup for all test suites
 */

import { setupVSCodeMocks } from './helpers/mockFactories';

// Setup VS Code mocks globally
setupVSCodeMocks();

// Suppress console errors during tests unless debugging
if (!process.env.DEBUG_TESTS) {
    global.console.error = jest.fn();
    global.console.warn = jest.fn();
}

// Set test environment
process.env.NODE_ENV = 'test';
process.env.NOFX_TEST_MODE = 'true';

// Mock timers for consistent test execution
beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
});

// Increase timeout for slower tests
jest.setTimeout(10000);
