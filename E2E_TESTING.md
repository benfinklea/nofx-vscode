# End-to-End Testing with Playwright

## Overview

This project uses Playwright for comprehensive end-to-end testing of the NofX VS Code extension's multi-agent orchestration system. The E2E tests validate the complete workflow from conductor initialization through agent spawning, task assignment, WebSocket communication, and worktree management.

## Test Structure

```
src/test/e2e/
├── conductor/
│   └── conductor-workflow.e2e.test.ts    # Conductor-agent interaction tests
├── agents/
│   ├── agent-lifecycle.e2e.test.ts       # Agent spawning and lifecycle
│   ├── task-assignment.e2e.test.ts       # Task assignment and completion
│   └── worktree-management.e2e.test.ts   # Git worktree operations
├── websocket/
│   └── message-routing.e2e.test.ts       # WebSocket message routing
├── helpers/
│   └── test-helpers.ts                   # Shared test utilities
└── test-server.ts                         # Test server for E2E environment
```

## Running Tests

### Prerequisites

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Build the extension
npm run compile
```

### Test Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in UI mode (interactive)
npm run test:e2e:ui

# Run tests in debug mode
npm run test:e2e:debug

# Run tests with browser visible
npm run test:e2e:headed

# View test report
npm run test:e2e:report
```

### Running Specific Test Suites

```bash
# Run conductor tests only
npx playwright test conductor

# Run WebSocket tests only
npx playwright test websocket

# Run agent tests only
npx playwright test agents

# Run a specific test file
npx playwright test src/test/e2e/conductor/conductor-workflow.e2e.test.ts
```

## Test Helpers

### VSCodeTestHelper
Simulates VS Code interactions:
- Opening command palette
- Executing commands
- Interacting with terminals
- Managing tree views

### WebSocketTestHelper
Manages WebSocket connections:
- Sending/receiving messages
- Waiting for specific message types
- Message validation
- Connection management

### AgentTestHelper
Orchestrates agent operations:
- Spawning agents with templates
- Assigning tasks
- Monitoring status
- Terminating agents

## Test Coverage Areas

### 1. Conductor-Agent Workflow
- Conductor terminal initialization
- Agent spawning through terminal commands
- Task assignment and completion
- Multi-agent coordination
- Agent termination and cleanup
- Error recovery

### 2. WebSocket Message Routing
- Connection establishment
- Message routing between conductor and agents
- Broadcast messaging
- Connection drops and reconnection
- Message validation
- Rate limiting
- Large payload handling

### 3. Agent Lifecycle
- Agent spawning with correct templates
- Multiple agent type management
- State persistence across reconnections
- Metrics tracking
- Workload balancing
- Capability validation
- Template updates

### 4. Task Management
- Simple and complex task execution
- Task dependencies and ordering
- Priority-based execution
- Task cancellation and rollback
- Parallel task execution
- Retry with exponential backoff
- Result persistence

### 5. Git Worktree Management
- Worktree creation for agents
- Isolated development branches
- Merging agent work
- Conflict resolution
- Cleanup on termination
- Performance with large repositories

### 6. Dashboard Interactions
- Real-time message display
- Agent status visualization
- Metrics panel updates
- Interactive controls

## Configuration

### playwright.config.ts

Key configuration options:

```typescript
{
    testDir: './src/test/e2e',
    fullyParallel: false,        // Run tests sequentially
    retries: 2,                  // Retry failed tests in CI
    workers: 1,                  // Single worker for consistency
    timeout: 120000,             // 2 minute test timeout
    use: {
        trace: 'on-first-retry', // Capture trace on retry
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 30000,
        navigationTimeout: 30000,
    }
}
```

## CI/CD Integration

### GitHub Actions Workflow

The E2E tests run automatically on:
- Push to main/develop branches
- Pull requests
- Nightly schedule (2 AM UTC)

Test artifacts are preserved:
- Test reports (7 days)
- Failure videos (3 days)
- Published to GitHub Pages

## Writing New Tests

### Test Template

```typescript
import { test, expect } from '@playwright/test';
import { setupTestEnvironment } from '../helpers/test-helpers';

test.describe('Feature E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:7777/dashboard');
        await page.waitForLoadState('networkidle');
    });

    test('should perform expected behavior', async ({ page }) => {
        const env = await setupTestEnvironment(page);
        
        try {
            // Test implementation
            const agentId = await env.agent.spawnAgent('type', 'name');
            // ... assertions
        } finally {
            await env.cleanup();
        }
    });
});
```

### Best Practices

1. **Always use cleanup**: Ensure `env.cleanup()` in finally blocks
2. **Wait for messages**: Use appropriate timeouts for async operations
3. **Validate state**: Check both UI and backend state
4. **Test isolation**: Each test should be independent
5. **Meaningful assertions**: Test business logic, not implementation
6. **Error scenarios**: Include negative test cases

## Debugging Failed Tests

### Local Debugging

```bash
# Run with debug mode
npm run test:e2e:debug

# Run with UI mode for step-by-step execution
npm run test:e2e:ui

# Run with browser visible
npm run test:e2e:headed
```

### Analyzing Failures

1. **Check test report**: `npm run test:e2e:report`
2. **Review trace files**: Available in `test-results/`
3. **Watch videos**: Captured for failed tests
4. **Check screenshots**: Taken on failure
5. **Review logs**: Test server and WebSocket logs

### Common Issues

**WebSocket connection timeouts**
- Increase timeout in test helpers
- Check if test server is running
- Verify port availability

**Agent spawning failures**
- Ensure Claude CLI is mocked or available
- Check terminal initialization
- Verify system prompts

**Worktree conflicts**
- Clean up test workspace
- Check git configuration
- Verify branch names

## Performance Optimization

### Test Execution Speed

- Use parallel execution where possible
- Mock external dependencies
- Minimize wait times
- Cache Playwright browsers

### Resource Management

- Limit concurrent agents
- Clean up after each test
- Monitor memory usage
- Use test data fixtures

## Metrics and Reporting

### Test Metrics

- Execution time per test
- Pass/fail rates
- Flakiness detection
- Coverage analysis

### Reports

- HTML report with screenshots
- JUnit XML for CI integration
- GitHub Pages deployment
- Trend analysis over time

## Future Enhancements

- [ ] Visual regression testing
- [ ] Performance benchmarking
- [ ] Cross-platform testing
- [ ] Load testing for WebSocket server
- [ ] Integration with real Claude API
- [ ] Accessibility testing
- [ ] Security testing

## Contributing

When adding new E2E tests:

1. Follow existing patterns
2. Add to appropriate test suite
3. Update this documentation
4. Ensure CI passes
5. Review test execution time

## Resources

- [Playwright Documentation](https://playwright.dev)
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [WebSocket Testing Best Practices](https://socket.io/docs/v4/testing/)
- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)