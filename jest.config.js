/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    
    // Test file patterns - prioritize consolidated suites
    testMatch: [
        '**/test/suites/**/*.test.ts',  // New consolidated suites (primary)
        '**/test/**/*.test.ts'          // Legacy tests (fallback)
    ],
    
    // Coverage configuration
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/test/**',
        '!src/**/*.d.ts'
    ],
    
    // Performance optimizations
    maxWorkers: '50%',
    testTimeout: 10000,
    
    // Business-focused reporting
    reporters: [
        'default',
        ['jest-junit', {
            outputDirectory: './test-results',
            outputName: 'business-confidence-report.xml',
            suiteName: 'NofX Business Confidence Tests'
        }]
    ],
    
    // Test setup
    setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
    
    // Module resolution
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts'
    }
};
