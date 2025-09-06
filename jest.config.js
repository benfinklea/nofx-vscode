module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Remove top-level testMatch and roots when using projects
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/test/**/*',
    '!src/**/*.test.ts',
    '!src/**/*.integration.test.ts',
    '!src/test/unit/build/**/*.ts',
    '!src/test/unit/commands/**/*.ts',
    '!src/test/unit/services/**/*.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  reporters: [
    'default'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Critical services require 100% coverage
    './src/services/Container.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './src/services/EventBus.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './src/services/LoggingService.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts',
    '^typescript$': '<rootDir>/src/test/__mocks__/typescript.ts'
  },
  testEnvironmentOptions: {
    url: 'http://localhost'
  },
  maxWorkers: 1, // Run tests serially to avoid VS Code API conflicts
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  // Test organization and grouping
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: ['<rootDir>/src/test/unit/**/*.test.ts'],
      testEnvironment: 'node'
    },
    {
      displayName: 'Integration Tests',
      testMatch: ['<rootDir>/src/test/integration/**/*.test.ts'],
      testEnvironment: 'node'
    },
    {
      displayName: 'Build Validation',
      testMatch: ['<rootDir>/src/test/unit/build/**/*.test.ts'],
      testEnvironment: 'node',
      testTimeout: 60000 // Longer timeout for build tests
    },
    {
      displayName: 'Command Registration',
      testMatch: ['<rootDir>/src/test/unit/commands/**/*.test.ts'],
      testEnvironment: 'node'
    },
    {
      displayName: 'Service Validation',
      testMatch: ['<rootDir>/src/test/unit/services/**/*.test.ts'],
      testEnvironment: 'node'
    }
  ],
  // Custom matchers for build validation
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }
  }
};
