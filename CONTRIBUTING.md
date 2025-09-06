# Contributing to NofX

Thank you for your interest in contributing to NofX! We welcome contributions from the community and are grateful for any help you can provide.

## 🤝 Welcome Contributors

### Project Mission

NofX aims to revolutionize software development by orchestrating multiple AI agents to work collaboratively on complex coding tasks. We believe in the power of AI-assisted development and strive to make it accessible, efficient, and powerful for all developers.

### Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please:

- Be respectful and considerate in all interactions
- Welcome newcomers and help them get started
- Focus on constructive criticism and helpful feedback
- Respect differing viewpoints and experiences
- Accept responsibility and apologize for mistakes
- Focus on what is best for the community

### How to Get Help

- **Discord**: Join our community Discord server (link in README)
- **Issues**: Open a GitHub issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas
- **Email**: Contact maintainers at nofx-dev@example.com

### Recognition

All contributors will be:
- Listed in our CONTRIBUTORS.md file
- Mentioned in release notes for their contributions
- Eligible for special contributor badges and swag
- Invited to contributor-only events and discussions

## 🚀 Getting Started

### Prerequisites

Before contributing, ensure you have:

- Node.js 18+ installed
- Git configured with your GitHub account
- VS Code or Cursor for development
- Basic knowledge of TypeScript and VS Code extension development

### Setting Up Your Development Environment

1. **Fork the Repository**
   ```bash
   # On GitHub, click "Fork" button
   # Then clone your fork
   git clone https://github.com/nofx/nofx-vscode.git
   cd nofx-vscode
   ```

2. **Add Upstream Remote**
   ```bash
   git remote add upstream https://github.com/nofx/nofx-vscode.git
   git fetch upstream
   ```

3. **Install Dependencies and Setup**
   ```bash
   npm install
   npm run dev:setup  # Sets up Git hooks
   ```

4. **Build and Test**
   ```bash
   npm run build:validate  # Build and validate
   npm run test:smoke      # Run quick tests
   ```

5. **Install Extension Locally**
   ```bash
   ./build.sh  # Build and package
   ./build.sh --install-cursor  # Build and install to Cursor (macOS)
   # Or manually:
   npm run build
   code --install-extension nofx-0.1.0.vsix --force
   ```

### First Contribution

Good first issues are labeled with `good-first-issue` on GitHub. These are typically:
- Documentation improvements
- Simple bug fixes
- Test additions
- Code refactoring
- UI/UX improvements

## 🏗️ Development Workflow

### Branch Strategy

We use a Git Flow-inspired branching strategy:

```
main                    # Stable releases only
├── develop            # Integration branch
│   ├── feature/*     # New features
│   ├── bugfix/*      # Bug fixes
│   ├── hotfix/*      # Critical production fixes
│   └── release/*     # Release preparation
```

### Creating a Feature Branch

```bash
# Update your fork
git checkout develop
git pull upstream develop

# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add amazing new feature"

# Push to your fork
git push origin feature/your-feature-name
```

### Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions or corrections
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Maintenance tasks

#### Examples
```bash
feat(agents): add support for Ruby specialist agent
fix(conductor): resolve WebSocket connection timeout
docs(readme): update installation instructions
test(services): add unit tests for Container service
refactor(commands): simplify command registration logic
```

### Development Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/my-feature develop
   ```

2. **Make Changes**
   - Write code following our coding standards
   - Add/update tests for your changes
   - Update documentation if needed

3. **Run Quality Checks**
   ```bash
   npm run qa:full  # Full quality assurance
   ```

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: description of change"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feature/my-feature
   # Create pull request on GitHub
   ```

6. **Address Review Feedback**
   - Make requested changes
   - Push updates to the same branch
   - Respond to review comments

7. **Merge**
   - Maintainer merges after approval
   - Branch is automatically deleted

### Git Hooks

Our Git hooks ensure code quality:

#### Pre-commit Hook
```bash
# Runs automatically before each commit
- Linting (ESLint)
- Type checking (TypeScript)
- Format checking
- Quick unit tests
```

#### Pre-push Hook
```bash
# Runs before pushing to remote
- Full test suite
- Build validation
- Command registration check
- Service container validation
```

To skip hooks temporarily (not recommended):
```bash
git commit --no-verify
git push --no-verify
```

## 📝 Coding Standards

### TypeScript Guidelines

#### Type Safety
```typescript
// ✅ Good: Explicit types
interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
}

function createAgent(type: AgentType): Agent {
  // Implementation
}

// ❌ Bad: Using 'any'
function processData(data: any): any {
  // Avoid 'any' type
}
```

#### Interface-Based Design
```typescript
// ✅ Good: Program to interfaces
interface IAgentManager {
  createAgent(type: string): Promise<Agent>;
  removeAgent(id: string): Promise<void>;
}

class AgentManager implements IAgentManager {
  // Implementation
}

// ❌ Bad: Concrete dependencies
class TaskQueue {
  constructor(private agentManager: AgentManager) {} // Use interface instead
}
```

#### Error Handling
```typescript
// ✅ Good: Comprehensive error handling
async function executeTask(task: Task): Promise<TaskResult> {
  try {
    const result = await performTask(task);
    logger.info(`Task ${task.id} completed`);
    return result;
  } catch (error) {
    logger.error(`Task ${task.id} failed:`, error);
    
    if (error instanceof ValidationError) {
      throw new UserError(`Invalid task: ${error.message}`);
    }
    
    throw new SystemError('Task execution failed', { cause: error });
  }
}

// ❌ Bad: Swallowing errors
async function executeTask(task: Task) {
  try {
    return await performTask(task);
  } catch (error) {
    console.log(error);  // Don't just log and continue
  }
}
```

### Code Style

#### Naming Conventions
```typescript
// Classes: PascalCase
class AgentManager {}

// Interfaces: PascalCase with 'I' prefix
interface IAgentService {}

// Functions/Methods: camelCase
function createAgent() {}

// Constants: UPPER_SNAKE_CASE
const MAX_AGENTS = 5;

// Private members: underscore prefix
class Service {
  private _internalState: State;
}

// File names: kebab-case or PascalCase
agent-manager.ts  // or AgentManager.ts
```

#### Documentation
```typescript
/**
 * Creates a new agent with the specified configuration
 * @param config - Agent configuration options
 * @returns Promise resolving to the created agent
 * @throws {ValidationError} If configuration is invalid
 * @throws {QuotaError} If agent limit exceeded
 * @example
 * const agent = await createAgent({
 *   type: 'frontend',
 *   name: 'UI Specialist'
 * });
 */
async function createAgent(config: AgentConfig): Promise<Agent> {
  // Implementation
}
```

### Testing Standards

#### Test Structure
```typescript
describe('AgentManager', () => {
  let agentManager: AgentManager;
  
  beforeEach(() => {
    // Setup
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  describe('createAgent', () => {
    it('should create a new agent with valid config', async () => {
      // Arrange
      const config = { type: 'frontend' };
      
      // Act
      const agent = await agentManager.createAgent(config);
      
      // Assert
      expect(agent).toBeDefined();
      expect(agent.type).toBe('frontend');
    });
    
    it('should throw error for invalid config', async () => {
      // Test error cases
    });
  });
});
```

#### Test Coverage Requirements
- Minimum 80% overall coverage
- 100% coverage for critical services
- All new code must include tests
- Bug fixes must include regression tests

## 🧪 Testing Guidelines

### Test Categories

#### Unit Tests
- Test individual functions and classes
- Mock all dependencies
- Should run in < 10 seconds total
- Located in `src/test/unit/`

#### Integration Tests
- Test service interactions
- May use real services
- Should run in < 1 minute total
- Located in `src/test/integration/`

#### Functional Tests
- Test extension functionality
- Use VS Code test framework
- Should run in < 2 minutes total
- Located in `src/test/functional/`

#### E2E Tests
- Test complete user workflows
- Full extension environment
- Should run in < 5 minutes total
- Located in `src/test/e2e/`

### Writing Tests

```typescript
// Example test file structure
import { AgentManager } from '../../agents/AgentManager';
import { createMock } from '../utils/MockFactory';

describe('AgentManager', () => {
  let sut: AgentManager;  // System Under Test
  let mockLogger: MockLogger;
  
  beforeEach(() => {
    mockLogger = createMock<Logger>();
    sut = new AgentManager(mockLogger);
  });
  
  describe('when creating an agent', () => {
    it('should return agent with unique ID', async () => {
      const agent1 = await sut.createAgent('frontend');
      const agent2 = await sut.createAgent('backend');
      
      expect(agent1.id).not.toBe(agent2.id);
    });
  });
});
```

### Running Tests

```bash
# Before committing
npm run test:unit        # Fast unit tests
npm run lint            # Code linting

# Before pushing
npm run test:all        # All tests
npm run test:coverage   # Coverage check

# During development
npm run test:watch      # Watch mode
```

## 📋 Pull Request Process

### Before Creating a PR

1. **Update from upstream**
   ```bash
   git fetch upstream
   git rebase upstream/develop
   ```

2. **Run all checks**
   ```bash
   npm run qa:full
   npm run test:all
   npm run build:validate
   ```

3. **Update documentation**
   - Update README if adding features
   - Update API docs if changing interfaces
   - Add JSDoc comments for new functions

### PR Template

When creating a PR, use this template:

```markdown
## Description
Brief description of changes and motivation

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] New tests added for changes

## Documentation
- [ ] Code includes JSDoc comments
- [ ] README updated (if needed)
- [ ] CHANGELOG updated (if needed)

## Checklist
- [ ] My code follows the project style guidelines
- [ ] I have performed self-review
- [ ] I have commented complex code
- [ ] My changes generate no new warnings
- [ ] I have tested my changes thoroughly
- [ ] Dependent changes have been merged

## Screenshots (if applicable)
[Add screenshots for UI changes]

## Related Issues
Fixes #(issue number)
```

### PR Review Process

1. **Automated Checks**
   - CI/CD pipeline runs tests
   - Code coverage verification
   - Linting and formatting checks
   - Build validation

2. **Code Review**
   - At least one maintainer approval required
   - Address all feedback
   - Resolve all conversations

3. **Testing**
   - Reviewer tests changes locally
   - Verification of bug fixes
   - Validation of new features

4. **Merge**
   - Squash and merge for feature branches
   - Merge commit for release branches
   - PR branch deleted after merge

### Review Guidelines for Reviewers

When reviewing PRs, consider:

- **Correctness**: Does the code do what it's supposed to?
- **Performance**: Are there any performance concerns?
- **Security**: Are there any security implications?
- **Maintainability**: Is the code easy to understand and maintain?
- **Testing**: Are tests adequate and comprehensive?
- **Documentation**: Is the code well-documented?
- **Style**: Does it follow our coding standards?

## 🐛 Bug Reports

### Reporting Bugs

Use the bug report template when creating issues:

```markdown
## Bug Description
Clear and concise description of the bug

## Environment
- OS: [e.g., macOS 13.0]
- VS Code Version: [e.g., 1.85.0]
- Extension Version: [e.g., 0.1.0]
- Node Version: [e.g., 18.12.0]

## Steps to Reproduce
1. Go to '...'
2. Click on '....'
3. Execute command '....'
4. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Logs
```
Relevant log output from Output → NofX Extension
```

## Screenshots
[If applicable, add screenshots]

## Additional Context
Any other relevant information

## Possible Solution
[Optional: Suggest a fix if you have ideas]
```

### Bug Triage Process

1. **Validation** - Maintainer reproduces the issue
2. **Prioritization** - Assigned priority label (P1-P4)
3. **Assignment** - Assigned to maintainer or contributor
4. **Fix Development** - Bug fix with tests
5. **Verification** - Reporter confirms fix
6. **Closure** - Issue closed with fix version noted

## ✨ Feature Requests

### Requesting Features

Use the feature request template:

```markdown
## Feature Description
Clear description of the proposed feature

## Problem Statement
What problem does this solve?

## Proposed Solution
How should it work?

## Alternatives Considered
Other approaches you've thought about

## Use Cases
Specific scenarios where this would be useful

## Implementation Notes
Technical considerations or suggestions

## Mockups/Examples
[If applicable, add mockups or examples]

## Related Features
Links to related features or issues
```

### Feature Development Process

1. **Discussion** - Community discusses the proposal
2. **Approval** - Maintainers approve for development
3. **Design** - Technical design if needed
4. **Implementation** - Feature development
5. **Testing** - Comprehensive testing
6. **Documentation** - User and developer docs
7. **Release** - Included in next release

## 🏛️ Architecture Guidelines

### Design Principles

#### Dependency Injection
```typescript
// ✅ Good: Dependency injection
class AgentManager {
  constructor(
    private logger: ILogger,
    private eventBus: IEventBus,
    private config: IConfiguration
  ) {}
}

// ❌ Bad: Direct instantiation
class AgentManager {
  private logger = new Logger();  // Hard dependency
}
```

#### Event-Driven Architecture
```typescript
// ✅ Good: Event-driven communication
class AgentService {
  onAgentCreated(agent: Agent): void {
    this.eventBus.emit('agent.created', agent);
  }
}

// Listen to events
eventBus.on('agent.created', (agent) => {
  // React to agent creation
});
```

#### Service-Oriented Design
```typescript
// ✅ Good: Service-oriented
interface IAgentService {
  createAgent(config: AgentConfig): Promise<Agent>;
}

interface ITaskService {
  assignTask(task: Task, agentId: string): Promise<void>;
}

// Each service has single responsibility
```

### Code Organization

```
src/
├── agents/           # Agent management domain
│   ├── models/      # Data models
│   ├── services/    # Business logic
│   └── types/       # Type definitions
├── commands/        # VS Code commands
├── services/        # Core services
│   ├── Container.ts # DI container
│   └── EventBus.ts  # Event system
├── views/           # UI components
└── test/            # Test files
```

### Extension Points

When adding new functionality:

1. **Register Service**
   ```typescript
   container.register('MyService', () => new MyService());
   ```

2. **Register Command**
   ```typescript
   commands.registerCommand('nofx.myCommand', handler);
   ```

3. **Add UI Component**
   ```typescript
   vscode.window.createTreeView('myView', { treeDataProvider });
   ```

4. **Emit Events**
   ```typescript
   eventBus.emit('my.event', data);
   ```

## 📚 Documentation Standards

### Code Documentation

#### JSDoc Comments
```typescript
/**
 * Service for managing agent lifecycle
 * @class
 * @implements {IAgentManager}
 */
export class AgentManager implements IAgentManager {
  /**
   * Creates a new agent
   * @param {string} type - The type of agent to create
   * @returns {Promise<Agent>} The created agent
   * @throws {Error} If agent limit exceeded
   * @memberof AgentManager
   */
  async createAgent(type: string): Promise<Agent> {
    // Implementation
  }
}
```

#### Inline Comments
```typescript
function complexAlgorithm(data: Data): Result {
  // Step 1: Normalize the input data
  const normalized = normalize(data);
  
  // Step 2: Apply transformation
  // Note: This uses the Smith-Waterman algorithm for
  // optimal sequence alignment
  const transformed = transform(normalized);
  
  // Step 3: Validate and return result
  return validate(transformed);
}
```

### User Documentation

When adding features, update:

1. **README.md** - Feature overview and usage
2. **CHANGELOG.md** - Note changes
3. **Command descriptions** - In package.json
4. **Settings descriptions** - Configuration options
5. **Wiki** - Detailed guides (if applicable)

### API Documentation

For public APIs:

```typescript
/**
 * Agent Manager API
 * 
 * @module agents
 * @description Provides agent lifecycle management
 * 
 * @example
 * ```typescript
 * const manager = new AgentManager();
 * const agent = await manager.createAgent('frontend');
 * ```
 */
```

## 🚀 Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features (backward compatible)
- **PATCH** (0.0.1): Bug fixes (backward compatible)

### Release Workflow

1. **Feature Freeze**
   - No new features added
   - Focus on bug fixes and testing

2. **Release Candidate**
   ```bash
   git checkout -b release/0.2.0 develop
   npm version minor
   ```

3. **Testing Period**
   - Community testing
   - Bug fixes only

4. **Final Release**
   ```bash
   git checkout main
   git merge --no-ff release/0.2.0
   git tag -a v0.2.0 -m "Release version 0.2.0"
   git push origin main --tags
   ```

5. **Post-Release**
   - Update changelog
   - Announce release
   - Merge back to develop

### Release Notes Template

```markdown
## Version X.Y.Z (YYYY-MM-DD)

### ✨ New Features
- Feature 1 description (#PR)
- Feature 2 description (#PR)

### 🐛 Bug Fixes
- Fixed issue with... (#issue)
- Resolved problem where... (#issue)

### 💔 Breaking Changes
- Changed API for...
- Removed deprecated...

### 📚 Documentation
- Updated guide for...
- Added examples for...

### 🙏 Contributors
Thanks to @user1, @user2 for their contributions!
```

## 🙏 Recognition

### Contributor Levels

#### 🌱 First-Time Contributor
- Made first PR
- Added to CONTRIBUTORS.md

#### 🌿 Active Contributor
- 3+ merged PRs
- Consistent contributions

#### 🌳 Core Contributor
- 10+ merged PRs
- Major feature implementations
- Write access to repository

#### 🏆 Maintainer
- Long-term commitment
- Review and merge rights
- Project direction input

### Attribution

All contributors are:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation
- Eligible for project swag

### Wall of Fame

Top contributors are featured in:
- Project README
- Website (when available)
- Conference presentations

## 📞 Contact

### Communication Channels

- **GitHub Issues**: Bug reports and features
- **GitHub Discussions**: Questions and ideas
- **Discord**: Real-time chat and support
- **Twitter**: @NofXDev for updates
- **Email**: nofx-dev@example.com

### Response Times

- **Critical bugs**: < 24 hours
- **Regular bugs**: < 3 days
- **Feature requests**: < 1 week
- **Questions**: < 2 days

### Getting Help

Before asking for help:
1. Check documentation
2. Search existing issues
3. Try troubleshooting guide
4. Prepare minimal reproduction

When asking for help, provide:
- Clear problem description
- Steps to reproduce
- Environment details
- Error messages/logs
- What you've already tried

---

Thank you for contributing to NofX! Your efforts help make AI-assisted development better for everyone. 🎸