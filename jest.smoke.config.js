module.exports = {
    displayName: '🔥 SMOKE',
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/smoke/**/*.smoke.test.ts', '**/smoke/**/*.smoke.test.js'],
    testTimeout: 10000,
    maxWorkers: 1, // Run serially for consistent timing
    verbose: true,
    collectCoverage: false, // Smoke tests don't need coverage
    reporters: [
        'default',
        ['jest-junit', {
            outputDirectory: './test-results',
            outputName: 'smoke-results.xml',
            suiteName: 'Smoke Tests',
            classNameTemplate: '{classname}',
            titleTemplate: '{title}',
            ancestorSeparator: ' › ',
            addFileAttribute: 'true'
        }],
        ['<rootDir>/src/test/smoke/smoke-reporter.js', {
            outputPath: './test-results/smoke-metrics.json'
        }]
    ],
    globals: {
        'ts-jest': {
            tsconfig: {
                esModuleInterop: true,
                allowSyntheticDefaultImports: true
            }
        }
    }
};