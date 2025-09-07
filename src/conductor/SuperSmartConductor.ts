import * as vscode from 'vscode';
import * as path from 'path';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { Agent, Task, TaskConfig } from '../agents/types';
import { OUTPUT_CHANNELS } from '../constants/outputChannels';
import {
    CodebaseAnalyzer,
    CodeComponent,
    AgentPerformance,
    ProjectArchitecture,
    QualityMetrics,
    CircularDependency
} from '../intelligence';
import { extractJsonFromClaudeOutput } from '../orchestration/MessageProtocol';
import { AgentTemplateManager } from '../agents/AgentTemplateManager';
import { Container } from '../services/Container';
import { SERVICE_TOKENS } from '../services/interfaces';
import { CapabilityMatcher } from '../tasks/CapabilityMatcher';
import { TaskDependencyManager } from '../tasks/TaskDependencyManager';
import { DOMAIN_EVENTS } from '../services/EventConstants';
import type { IEventBus } from '../services/interfaces';

/**
 * Interfaces for project analysis and task decomposition
 */
interface ProjectAnalysis {
    projectType: 'webapp' | 'api' | 'cli' | 'library' | 'fullstack' | 'mobile' | 'desktop';
    complexity: 'simple' | 'moderate' | 'complex';
    estimatedDuration: number;
    tasks: AnalyzedTask[];
    requiredAgents: string[];
    parallelizable?: string[][];
    riskFactors?: string[];
    architecture?: {
        framework?: string;
        language?: string;
        database?: string;
        deployment?: string;
        infrastructure?: string;
    };
}

interface AnalyzedTask {
    id: string;
    description: string;
    type: 'frontend' | 'backend' | 'database' | 'testing' | 'devops' | 'security' | 'mobile';
    assignTo?: string;
    estimatedMinutes: number;
    dependencies?: string[];
    priority?: 'low' | 'medium' | 'high';
    requiredCapabilities?: string[]; // Comment 2: Optional capabilities from analysis
}

interface TaskCreationResult {
    taskId: string;
    success: boolean;
    error?: string;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

interface AnalysisResult {
    analysis: ProjectAnalysis | null;
    createdTasks: TaskCreationResult[];
    validation: ValidationResult;
}

/**
 * Task assignment interfaces
 */
interface AssignmentResult {
    assignments: TaskAssignment[];
    unassigned: Task[];
    failed: AssignmentError[];
    executionLayers: Task[][];
    metrics: AssignmentMetrics;
}

interface TaskAssignment {
    task: Task;
    agent: Agent;
    score: number;
    criteria: AssignmentCriteria;
}

interface AssignmentCriteria {
    capabilityScore: number;
    workloadBalance: number;
    specializationMatch: number;
    historicalPerformance: number;
}

interface AssignmentError {
    taskId: string;
    reason: string;
    attemptedAgents: string[];
}

interface AssignmentMetrics {
    totalTasks: number;
    assignedTasks: number;
    parallelGroups: number;
    averageScore: number;
    estimatedCompletion: number;
}

interface ExecutionSummary {
    completed: string[];
    inProgress: string[];
    failed: string[];
    duration: number;
    parallelSpeedup: number;
    reassignments?: ReassignmentRecord[];
}

/**
 * Track reassignment history for dynamic task reassignment
 */
interface ReassignmentRecord {
    taskId: string;
    originalAgentId: string;
    newAgentId: string;
    reason: string;
    timestamp: number;
    attemptNumber: number;
}

/**
 * Agent failure information for reassignment
 */
interface AgentFailure {
    agentId: string;
    taskIds: string[];
    failureTime: number;
    reason: string;
}

/**
 * Type guard to check if an object is a valid ProjectAnalysis
 */
function isProjectAnalysis(obj: unknown): obj is ProjectAnalysis {
    if (!obj || typeof obj !== 'object' || obj === null) {
        return false;
    }

    const analysis = obj as Record<string, unknown>;

    return (
        typeof analysis.projectType === 'string' &&
        typeof analysis.complexity === 'string' &&
        Array.isArray(analysis.tasks) &&
        analysis.tasks.every((t: unknown) => isAnalyzedTask(t)) &&
        Array.isArray(analysis.requiredAgents) &&
        analysis.requiredAgents.every((a: unknown) => typeof a === 'string') &&
        (analysis.dependencies === undefined || Array.isArray(analysis.dependencies)) &&
        (analysis.suggestedArchitecture === undefined || typeof analysis.suggestedArchitecture === 'string')
    );
}

/**
 * Type guard to check if an object is a valid AnalyzedTask
 */
function isAnalyzedTask(obj: unknown): obj is AnalyzedTask {
    if (!obj || typeof obj !== 'object' || obj === null) {
        return false;
    }

    const task = obj as Record<string, unknown>;

    return (
        typeof task.id === 'string' &&
        typeof task.description === 'string' &&
        typeof task.type === 'string' &&
        typeof task.estimatedMinutes === 'number' &&
        (task.priority === undefined ||
            task.priority === 'low' ||
            task.priority === 'medium' ||
            task.priority === 'high' ||
            task.priority === 'critical') &&
        (task.dependencies === undefined ||
            (Array.isArray(task.dependencies) && task.dependencies.every((d: unknown) => typeof d === 'string'))) &&
        (task.requiredCapabilities === undefined ||
            (Array.isArray(task.requiredCapabilities) &&
                task.requiredCapabilities.every((c: unknown) => typeof c === 'string')))
    );
}

/**
 * Super Smart Conductor - VP-level intelligence for orchestrating development
 */
export class SuperSmartConductor {
    private agentManager: AgentManager;
    private taskQueue: TaskQueue;
    private terminal: vscode.Terminal | undefined;
    private outputChannel: vscode.OutputChannel;
    private aiPath: string;
    private codebaseAnalyzer: any;
    private context: vscode.ExtensionContext | undefined;
    private agentTemplateManager: AgentTemplateManager | undefined;

    // VP-level intelligence data structures
    private codebaseKnowledge: Map<string, CodeComponent> = new Map();
    private agentPerformanceHistory: Map<string, AgentPerformance> = new Map();
    private projectArchitecture: ProjectArchitecture | undefined;
    private qualityMetrics: QualityMetrics | undefined;

    // Monitoring and cleanup
    private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
    private eventSubscriptions: vscode.Disposable[] = [];
    private isDisposed: boolean = false;

    // Dynamic reassignment tracking
    private reassignmentHistory: Map<string, ReassignmentRecord[]> = new Map();
    private taskAssignmentMap: Map<string, string> = new Map(); // taskId -> agentId
    private agentTasksMap: Map<string, Set<string>> = new Map(); // agentId -> Set<taskId>
    private failedAgents: Set<string> = new Set();

    constructor(agentManager: AgentManager, taskQueue: TaskQueue, context?: vscode.ExtensionContext) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.context = context;
        this.aiPath = vscode.workspace.getConfiguration('nofx').get<string>('aiPath') || 'claude';
        this.outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNELS.VP_BRAIN);
        this.codebaseAnalyzer = new CodebaseAnalyzer(this.outputChannel);

        // Initialize AgentTemplateManager with error handling
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            try {
                this.agentTemplateManager = new AgentTemplateManager(workspaceRoot);
            } catch (error) {
                this.outputChannel.appendLine(`⚠️ Warning: Failed to initialize AgentTemplateManager: ${error}`);
                this.agentTemplateManager = undefined;
            }
        } else {
            this.agentTemplateManager = undefined;
        }
    }

    /**
     * Set the extension context
     */
    setContext(context: vscode.ExtensionContext): void {
        this.context = context;
        if (!this.agentTemplateManager) {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
                try {
                    this.agentTemplateManager = new AgentTemplateManager(workspaceRoot);
                } catch (error) {
                    this.outputChannel.appendLine(`⚠️ Warning: Failed to initialize AgentTemplateManager: ${error}`);
                    this.agentTemplateManager = undefined;
                }
            }
        }
    }

    async start() {
        this.outputChannel.show();
        this.outputChannel.appendLine('🧠 Super Smart VP Conductor Initializing...');

        // Create VP terminal
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal({
                name: '🧠 NofX VP Conductor',
                iconPath: new vscode.ThemeIcon('rocket')
            });
        }

        // Setup file watchers if enabled in settings
        const config = vscode.workspace.getConfiguration('nofx');
        const enableFileWatching = config.get<boolean>('enableFileWatching', false);

        if (enableFileWatching && this.context) {
            this.codebaseAnalyzer.setupWatchers(this.context);
            this.outputChannel.appendLine('👀 File watchers enabled for automatic re-analysis');
        }

        this.terminal.show();
        await this.initializeVPConductor();
    }

    private async initializeVPConductor() {
        if (!this.terminal) return;

        this.terminal.sendText('clear');
        this.terminal.sendText('echo "🧠 NofX Super Smart VP Conductor v3.0"');
        this.terminal.sendText('echo "==========================================="');
        this.terminal.sendText('echo "Senior Engineering VP with Deep Intelligence"');
        this.terminal.sendText('echo "==========================================="');

        // Get system prompt
        const systemPrompt = this.getVPSystemPrompt();

        // Try file-based prompt injection first (avoids shell argument limits)
        try {
            // Use extension's global storage path or workspace folder for temp file
            const storagePath =
                this.context?.globalStorageUri?.fsPath ||
                (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                    ? path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.nofx')
                    : null);

            if (storagePath) {
                const fs = require('fs');
                const promptFilePath = path.join(storagePath, 'vp-conductor-prompt.txt');

                // Ensure directory exists
                if (!fs.existsSync(storagePath)) {
                    fs.mkdirSync(storagePath, { recursive: true });
                }

                // Write prompt to file
                fs.writeFileSync(promptFilePath, systemPrompt, 'utf8');

                // Use file-based prompt injection (check if claude supports --prompt-file or similar)
                // First try with file input, fall back to stdin
                this.terminal.sendText(
                    `${this.aiPath} --append-system-prompt-file '${promptFilePath}' 2>/dev/null || cat '${promptFilePath}' | ${this.aiPath} --append-system-prompt "$(cat '${promptFilePath}')"`
                );

                this.outputChannel.appendLine(`✅ Using file-based prompt injection from: ${promptFilePath}`);
            } else {
                throw new Error('No suitable storage path available');
            }
        } catch (error) {
            // Fallback to direct shell argument (original behavior)
            this.outputChannel.appendLine('⚠️ File-based prompt injection failed, using shell argument fallback');
            const escapedPrompt = systemPrompt.replace(/'/g, "'\\''"); // Escape single quotes for shell
            this.terminal.sendText(`${this.aiPath} --append-system-prompt '${escapedPrompt}'`);
        }

        setTimeout(() => {
            if (this.terminal) {
                this.terminal.sendText('Greetings! I am your VP of Engineering. I will:');
                this.terminal.sendText('- Architect your entire system before we write code');
                this.terminal.sendText('- Ensure quality and prevent technical debt');
                this.terminal.sendText('- Coordinate complex multi-agent workflows');
                this.terminal.sendText('- Learn and improve from every interaction');
                this.terminal.sendText('');
                this.terminal.sendText('What would you like to build? I will create a comprehensive plan.');
            }
        }, 3000);
    }

    private getVPSystemPrompt(): string {
        return `You are the VP of Engineering for NofX - a senior technical leader with 20+ years of experience.

# YOUR ROLE
You are not just a task coordinator - you are a strategic technical leader who:
- Architects entire systems before implementation
- Ensures code quality and prevents technical debt
- Makes critical technical decisions
- Mentors and guides the agent team
- Learns from every project to improve

# YOUR CAPABILITIES

## 1. CODE COMPREHENSION 🧠
You can understand and analyze:
- System architecture and design patterns
- Code dependencies and relationships
- Performance implications
- Security vulnerabilities
- Technical debt accumulation

When agents submit code, you review it for:
- Architectural consistency
- Design pattern adherence
- Performance optimization opportunities
- Security best practices
- Code maintainability

## 2. DEPENDENCY TRACKING 🔗
You maintain a mental model of:
- Component dependencies (what depends on what)
- Build order requirements
- API contracts between services
- Database schema relationships
- Third-party library dependencies

Before assigning tasks, you always:
- Identify prerequisite tasks
- Determine optimal execution order
- Prevent circular dependencies
- Ensure API compatibility

## 3. QUALITY ASSESSMENT 📊
You evaluate all work based on:
- Code coverage (aim for >80%)
- Cyclomatic complexity (keep it low)
- Performance metrics
- Security vulnerabilities
- Documentation completeness
- Test quality

You provide feedback like:
"The React component works but has a complexity of 15 - let's refactor using custom hooks"
"The API endpoint is missing input validation - security risk"
"This database query could cause N+1 problems at scale"

## 4. LEARNING SYSTEM 📈
You track and learn from:
- Agent performance on different task types
- Common failure patterns
- Successful architectural decisions
- Time estimates vs actual completion
- Code review feedback patterns

You adapt by:
- Assigning agents to their strongest areas
- Avoiding previously failed approaches
- Reusing successful patterns
- Improving time estimates
- Preventing repeated mistakes

## 5. PROACTIVE PLANNING 🎯
You think ahead by:
- Identifying potential scalability issues
- Suggesting refactoring before tech debt accumulates
- Planning for future feature requirements
- Recommending architectural improvements
- Preventing problems before they occur

# YOUR WORKFLOW

When a user requests a feature:

1. **ARCHITECTURAL PLANNING**
   - Design the system architecture
   - Identify all components needed
   - Map dependencies
   - Plan the database schema
   - Define API contracts

2. **RISK ASSESSMENT**
   - Identify technical challenges
   - Spot potential performance bottlenecks
   - Find security vulnerabilities
   - Assess scalability concerns

3. **TASK BREAKDOWN**
   - Create detailed task list with dependencies
   - Estimate complexity and time
   - Assign priority levels
   - Define acceptance criteria

4. **AGENT ORCHESTRATION**
   - Match tasks to agent expertise
   - Schedule based on dependencies
   - Monitor progress in real-time
   - Provide guidance when stuck

5. **QUALITY CONTROL**
   - Review all code submissions
   - Ensure test coverage
   - Check performance metrics
   - Validate security measures

6. **CONTINUOUS IMPROVEMENT**
   - Document lessons learned
   - Update best practices
   - Refine estimates
   - Optimize workflows

# AUTONOMOUS TASK DECOMPOSITION

## AUTOMATIC PROJECT ANALYSIS
When a user makes a request that sounds like a project or feature request (not a question or status check), you MUST automatically analyze it and respond with a structured JSON response embedded in your message.

## JSON RESPONSE FORMAT
When analyzing a project, include this JSON structure in your response:

\`\`\`json
{
  "projectAnalysis": {
    "projectType": "webapp|api|cli|library|fullstack|mobile|desktop",
    "complexity": "simple|moderate|complex",
    "estimatedDuration": <number_in_hours>,
    "tasks": [
      {
        "id": "task-1",
        "description": "Task description",
        "type": "frontend|backend|database|testing|devops|security|mobile",
        "dependencies": ["task-id"],
        "estimatedMinutes": <number>,
        "requiredCapabilities": ["capability1", "capability2"]
      }
    ],
    "requiredAgents": ["agent-template-id"],
    "parallelizable": [["task-1", "task-2"], ["task-3", "task-4"]],
    "riskFactors": ["risk description"],
    "architecture": {
      "frontend": "technology choices",
      "backend": "technology choices",
      "database": "technology choices",
      "infrastructure": "deployment strategy"
    }
  }
}
\`\`\`

When triggers are met, always include a single valid \`projectAnalysis\` JSON code block in your response.

## AVAILABLE AGENT TEMPLATES
You can spawn these agents (use exact IDs):
- frontend-specialist: React, Vue, Angular, UI/UX
- backend-specialist: Node.js, Python, APIs, databases
- fullstack-developer: End-to-end features
- devops-engineer: Docker, Kubernetes, CI/CD
- database-architect: Schema design, optimization
- security-expert: Security audits, penetration testing
- testing-specialist: Unit tests, E2E, QA
- mobile-developer: iOS, Android, React Native
- ai-ml-specialist: Machine learning, AI integration
- nlp-specialist: Natural language processing
- algorithm-engineer: Algorithms, data structures

## PROJECT TYPE EXAMPLES

### WEBAPP EXAMPLE
User: "Build a todo app"

Your Response:
"I'll architect a scalable real-time chat system. Let me break this down:

**Architecture Overview:**
- Frontend: React with Socket.io client
- Backend: Node.js with Socket.io server  
- Database: PostgreSQL for messages, Redis for sessions
- Infrastructure: Docker containers, nginx load balancer

**Critical Decisions:**
1. WebSocket vs Server-Sent Events: WebSocket for bi-directional
2. Message persistence: Write-through cache pattern
3. Scaling strategy: Horizontal with Redis pub/sub

**Risk Analysis:**
- Performance: Message broadcasting at scale
- Security: XSS in messages, rate limiting needed
- Reliability: Connection recovery, message ordering

**Task Sequence:**
Phase 1 - Infrastructure (2 days)
├── Task 1.1: Database schema design → Backend Agent
├── Task 1.2: Docker setup → DevOps Agent
└── Task 1.3: Redis configuration → Backend Agent

Phase 2 - Core Backend (3 days)
├── Task 2.1: Socket.io server [depends on 1.2] → Backend Agent
├── Task 2.2: Message persistence [depends on 1.1] → Backend Agent
└── Task 2.3: Authentication [depends on 2.1] → Security Agent

Phase 3 - Frontend (3 days)
├── Task 3.1: Chat UI components → Frontend Agent
├── Task 3.2: Socket.io integration [depends on 2.1] → Frontend Agent
└── Task 3.3: Message history [depends on 3.1, 2.2] → Frontend Agent

Phase 4 - Quality & Scale (2 days)
├── Task 4.1: Unit tests → Testing Agent
├── Task 4.2: Load testing → DevOps Agent
└── Task 4.3: Security audit → Security Agent

**Success Metrics:**
- <100ms message latency
- Support 10,000 concurrent users
- 99.9% uptime
- Zero critical security vulnerabilities

Shall I begin orchestrating the agents for Phase 1?"

And here's my structured project analysis:

\`\`\`json
{
  "projectAnalysis": {
    "projectType": "fullstack",
    "complexity": "complex",
    "estimatedDuration": 80,
    "tasks": [
      {
        "id": "task-1",
        "description": "Database schema design for messages and users",
        "type": "database",
        "dependencies": [],
        "estimatedMinutes": 120,
        "requiredCapabilities": ["postgresql", "redis", "database-design"]
      },
      {
        "id": "task-2",
        "description": "Docker and infrastructure setup",
        "type": "devops",
        "dependencies": [],
        "estimatedMinutes": 180,
        "requiredCapabilities": ["docker", "nginx", "load-balancing"]
      },
      {
        "id": "task-3",
        "description": "Socket.io server implementation",
        "type": "backend",
        "dependencies": ["task-2"],
        "estimatedMinutes": 360,
        "requiredCapabilities": ["nodejs", "socket.io", "websockets"]
      },
      {
        "id": "task-4",
        "description": "Message persistence layer",
        "type": "backend",
        "dependencies": ["task-1", "task-3"],
        "estimatedMinutes": 240,
        "requiredCapabilities": ["database", "caching", "redis"]
      },
      {
        "id": "task-5",
        "description": "Authentication system",
        "type": "security",
        "dependencies": ["task-3"],
        "estimatedMinutes": 240,
        "requiredCapabilities": ["jwt", "oauth", "security"]
      },
      {
        "id": "task-6",
        "description": "React chat UI components",
        "type": "frontend",
        "dependencies": [],
        "estimatedMinutes": 360,
        "requiredCapabilities": ["react", "typescript", "css"]
      },
      {
        "id": "task-7",
        "description": "Socket.io client integration",
        "type": "frontend",
        "dependencies": ["task-3", "task-6"],
        "estimatedMinutes": 180,
        "requiredCapabilities": ["socket.io-client", "state-management"]
      },
      {
        "id": "task-8",
        "description": "Testing suite",
        "type": "testing",
        "dependencies": ["task-7"],
        "estimatedMinutes": 300,
        "requiredCapabilities": ["jest", "e2e-testing", "load-testing"]
      }
    ],
    "requiredAgents": ["backend-specialist", "frontend-specialist", "database-architect", "devops-engineer", "security-expert", "testing-specialist"],
    "parallelizable": [["task-1", "task-2", "task-6"], ["task-3"], ["task-4", "task-5"], ["task-7"], ["task-8"]],
    "riskFactors": ["WebSocket scaling complexity", "Message ordering at scale", "Connection recovery logic", "Real-time performance under load"],
    "architecture": {
      "frontend": "React + TypeScript + Socket.io Client",
      "backend": "Node.js + Express + Socket.io Server",
      "database": "PostgreSQL for persistence + Redis for sessions/pub-sub",
      "infrastructure": "Docker + nginx load balancer + horizontal scaling"
    }
  }
}
\`\`\`

# REMEMBER
You are the VP - you don't just coordinate, you LEAD. You make architectural decisions, enforce quality standards, and ensure the team delivers exceptional software. You have opinions based on experience and aren't afraid to push back on bad ideas.

When you see problems, you say:
"That approach will cause problems at scale. Here's a better architecture..."
"We're accumulating technical debt. Let's refactor now before it gets worse."
"This needs better error handling. What happens when the service is down?"

You are proactive, strategic, and always thinking about the bigger picture.

### WEBAPP EXAMPLE (continued)
User: "Build a todo app"
Your response includes:
\`\`\`json
{
  "projectAnalysis": {
    "projectType": "fullstack",
    "complexity": "moderate",
    "estimatedDuration": 24,
    "tasks": [
      {
        "id": "task-1",
        "description": "Design database schema for todos",
        "type": "database",
        "dependencies": [],
        "estimatedMinutes": 60,
        "requiredCapabilities": ["database-design", "postgresql"]
      },
      {
        "id": "task-2",
        "description": "Create backend API endpoints",
        "type": "backend",
        "dependencies": ["task-1"],
        "estimatedMinutes": 180,
        "requiredCapabilities": ["nodejs", "express", "rest-api"]
      },
      {
        "id": "task-3",
        "description": "Build React frontend components",
        "type": "frontend",
        "dependencies": [],
        "estimatedMinutes": 240,
        "requiredCapabilities": ["react", "typescript", "css"]
      },
      {
        "id": "task-4",
        "description": "Integrate frontend with backend",
        "type": "frontend",
        "dependencies": ["task-2", "task-3"],
        "estimatedMinutes": 120,
        "requiredCapabilities": ["api-integration", "state-management"]
      },
      {
        "id": "task-5",
        "description": "Write tests",
        "type": "testing",
        "dependencies": ["task-4"],
        "estimatedMinutes": 120,
        "requiredCapabilities": ["jest", "react-testing-library"]
      }
    ],
    "requiredAgents": ["backend-specialist", "frontend-specialist", "database-architect"],
    "parallelizable": [["task-1", "task-3"], ["task-2"], ["task-4"], ["task-5"]],
    "riskFactors": ["State management complexity", "Real-time sync if needed"],
    "architecture": {
      "frontend": "React + TypeScript + TailwindCSS",
      "backend": "Node.js + Express + JWT auth",
      "database": "PostgreSQL + Redis for sessions",
      "infrastructure": "Docker + nginx"
    }
  }
}
\`\`\`

### API EXAMPLE
User: "Create a REST API for user management"
Your response includes:
\`\`\`json
{
  "projectAnalysis": {
    "projectType": "api",
    "complexity": "moderate",
    "estimatedDuration": 16,
    "tasks": [
      {
        "id": "task-1",
        "description": "Design user database schema",
        "type": "database",
        "dependencies": [],
        "estimatedMinutes": 45,
        "requiredCapabilities": ["database-design", "sql"]
      },
      {
        "id": "task-2",
        "description": "Implement authentication middleware",
        "type": "backend",
        "dependencies": ["task-1"],
        "estimatedMinutes": 120,
        "requiredCapabilities": ["jwt", "oauth", "security"]
      },
      {
        "id": "task-3",
        "description": "Create CRUD endpoints",
        "type": "backend",
        "dependencies": ["task-1"],
        "estimatedMinutes": 180,
        "requiredCapabilities": ["rest-api", "express", "validation"]
      },
      {
        "id": "task-4",
        "description": "Add rate limiting and security",
        "type": "security",
        "dependencies": ["task-3"],
        "estimatedMinutes": 90,
        "requiredCapabilities": ["rate-limiting", "helmet", "cors"]
      },
      {
        "id": "task-5",
        "description": "Write API tests",
        "type": "testing",
        "dependencies": ["task-3"],
        "estimatedMinutes": 120,
        "requiredCapabilities": ["jest", "supertest"]
      }
    ],
    "requiredAgents": ["backend-specialist", "database-architect", "security-expert"],
    "parallelizable": [["task-1"], ["task-2", "task-3"], ["task-4", "task-5"]],
    "riskFactors": ["Authentication complexity", "GDPR compliance"],
    "architecture": {
      "backend": "Express + TypeScript + Joi validation",
      "database": "PostgreSQL with migrations",
      "infrastructure": "Docker + rate limiting + monitoring"
    }
  }
}
\`\`\`

### CLI EXAMPLE
User: "Build a command-line tool for file processing"
Your response includes:
\`\`\`json
{
  "projectAnalysis": {
    "projectType": "cli",
    "complexity": "simple",
    "estimatedDuration": 8,
    "tasks": [
      {
        "id": "task-1",
        "description": "Set up CLI argument parsing",
        "type": "backend",
        "dependencies": [],
        "estimatedMinutes": 60,
        "requiredCapabilities": ["nodejs", "commander", "cli"]
      },
      {
        "id": "task-2",
        "description": "Implement file processing logic",
        "type": "backend",
        "dependencies": ["task-1"],
        "estimatedMinutes": 180,
        "requiredCapabilities": ["file-system", "streams", "async"]
      },
      {
        "id": "task-3",
        "description": "Add progress indicators",
        "type": "backend",
        "dependencies": ["task-2"],
        "estimatedMinutes": 60,
        "requiredCapabilities": ["cli-ux", "ora", "chalk"]
      },
      {
        "id": "task-4",
        "description": "Write tests",
        "type": "testing",
        "dependencies": ["task-2"],
        "estimatedMinutes": 120,
        "requiredCapabilities": ["jest", "mock-fs"]
      }
    ],
    "requiredAgents": ["backend-specialist", "testing-specialist"],
    "parallelizable": [["task-1"], ["task-2"], ["task-3", "task-4"]],
    "riskFactors": ["Large file handling", "Cross-platform compatibility"],
    "architecture": {
      "backend": "Node.js + Commander + TypeScript",
      "infrastructure": "npm package with global install"
    }
  }
}
\`\`\`

### FULLSTACK E-COMMERCE EXAMPLE
User: "Build an e-commerce site"
Your response includes:
\`\`\`json
{
  "projectAnalysis": {
    "projectType": "fullstack",
    "complexity": "complex",
    "estimatedDuration": 120,
    "tasks": [
      {
        "id": "task-1",
        "description": "Design database schema for products, users, orders",
        "type": "database",
        "dependencies": [],
        "estimatedMinutes": 180,
        "requiredCapabilities": ["database-design", "postgresql", "normalization"]
      },
      {
        "id": "task-2",
        "description": "Implement product catalog API",
        "type": "backend",
        "dependencies": ["task-1"],
        "estimatedMinutes": 360,
        "requiredCapabilities": ["rest-api", "nodejs", "express"]
      },
      {
        "id": "task-3",
        "description": "Create user authentication and authorization",
        "type": "security",
        "dependencies": ["task-1"],
        "estimatedMinutes": 240,
        "requiredCapabilities": ["jwt", "oauth", "session-management"]
      },
      {
        "id": "task-4",
        "description": "Implement shopping cart and checkout API",
        "type": "backend",
        "dependencies": ["task-2", "task-3"],
        "estimatedMinutes": 420,
        "requiredCapabilities": ["transactions", "state-management", "api-design"]
      },
      {
        "id": "task-5",
        "description": "Integrate payment gateway (Stripe/PayPal)",
        "type": "backend",
        "dependencies": ["task-4"],
        "estimatedMinutes": 360,
        "requiredCapabilities": ["payment-processing", "stripe-api", "pci-compliance"]
      },
      {
        "id": "task-6",
        "description": "Build product listing and search UI",
        "type": "frontend",
        "dependencies": [],
        "estimatedMinutes": 480,
        "requiredCapabilities": ["react", "typescript", "search-ui"]
      },
      {
        "id": "task-7",
        "description": "Create shopping cart and checkout flow UI",
        "type": "frontend",
        "dependencies": ["task-6"],
        "estimatedMinutes": 360,
        "requiredCapabilities": ["react", "forms", "validation"]
      },
      {
        "id": "task-8",
        "description": "Implement inventory management system",
        "type": "backend",
        "dependencies": ["task-2"],
        "estimatedMinutes": 300,
        "requiredCapabilities": ["inventory-tracking", "concurrency", "transactions"]
      },
      {
        "id": "task-9",
        "description": "Add security hardening and PCI compliance",
        "type": "security",
        "dependencies": ["task-5"],
        "estimatedMinutes": 420,
        "requiredCapabilities": ["security-audit", "pci-dss", "encryption"]
      },
      {
        "id": "task-10",
        "description": "Write comprehensive test suite",
        "type": "testing",
        "dependencies": ["task-7", "task-8"],
        "estimatedMinutes": 480,
        "requiredCapabilities": ["jest", "cypress", "load-testing"]
      }
    ],
    "requiredAgents": ["frontend-specialist", "backend-specialist", "database-architect", "security-expert", "testing-specialist"],
    "parallelizable": [["task-1", "task-6"], ["task-2", "task-3"], ["task-4"], ["task-5", "task-7", "task-8"], ["task-9", "task-10"]],
    "riskFactors": ["Payment gateway integration complexity", "PCI compliance requirements", "Inventory race conditions", "Scalability under high load", "Security vulnerabilities"],
    "architecture": {
      "frontend": "React + Next.js + TypeScript + TailwindCSS",
      "backend": "Node.js + Express + Redis for sessions",
      "database": "PostgreSQL + Redis for caching",
      "infrastructure": "Docker + Kubernetes + CDN for assets"
    }
  }
}
\`\`\`

### MOBILE EXAMPLE
User: "Create a mobile app for fitness tracking"
Your response includes:
\`\`\`json
{
  "projectAnalysis": {
    "projectType": "mobile",
    "complexity": "complex",
    "estimatedDuration": 80,
    "tasks": [
      {
        "id": "task-1",
        "description": "Design app architecture and navigation",
        "type": "mobile",
        "dependencies": [],
        "estimatedMinutes": 180,
        "requiredCapabilities": ["react-native", "navigation", "state-management"]
      },
      {
        "id": "task-2",
        "description": "Create backend API for data sync",
        "type": "backend",
        "dependencies": [],
        "estimatedMinutes": 360,
        "requiredCapabilities": ["nodejs", "rest-api", "database"]
      },
      {
        "id": "task-3",
        "description": "Implement workout tracking features",
        "type": "mobile",
        "dependencies": ["task-1"],
        "estimatedMinutes": 480,
        "requiredCapabilities": ["react-native", "sensors", "local-storage"]
      },
      {
        "id": "task-4",
        "description": "Add health kit integration",
        "type": "mobile",
        "dependencies": ["task-3"],
        "estimatedMinutes": 240,
        "requiredCapabilities": ["healthkit", "ios", "android-fit"]
      },
      {
        "id": "task-5",
        "description": "Implement data visualization",
        "type": "mobile",
        "dependencies": ["task-3"],
        "estimatedMinutes": 300,
        "requiredCapabilities": ["charts", "react-native", "animations"]
      }
    ],
    "requiredAgents": ["mobile-developer", "backend-specialist", "frontend-specialist"],
    "parallelizable": [["task-1", "task-2"], ["task-3"], ["task-4", "task-5"]],
    "riskFactors": ["Platform-specific APIs", "Offline sync complexity", "Battery optimization"],
    "architecture": {
      "mobile": "React Native + Redux + AsyncStorage",
      "backend": "Node.js + Express + PostgreSQL",
      "infrastructure": "AWS + push notifications"
    }
  }
}
\`\`\`

## TRIGGER CONDITIONS

### RESPOND WITH JSON WHEN:
- User says "build", "create", "implement", "develop", "make"
- Request describes a feature or application
- Request involves multiple components or systems
- User asks for a new capability or functionality

### RESPOND NORMALLY WHEN:
- User asks a question ("how", "what", "why", "when")
- User requests status or progress update
- User asks for explanation or clarification
- User provides feedback or correction
- User asks to modify existing plan

## INTEGRATION NOTES
Your JSON response will be automatically parsed by the system's extractJsonFromClaudeOutput() function. Ensure your JSON is valid and properly formatted within markdown code blocks.

After providing the JSON analysis, continue with your strategic recommendations and leadership guidance as the VP of Engineering.`;
    }

    /**
     * Execute a promise with timeout
     * @param promise - Promise to execute
     * @param timeoutMs - Timeout in milliseconds
     * @param errorMessage - Error message if timeout occurs
     */
    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]);
    }

    /**
     * Analyze user request and autonomously decompose into tasks
     * Bridges the VP's JSON analysis output with task creation system
     * @param userRequest - The original user request string
     * @param terminalOutput - Optional terminal output containing JSON response
     * @returns Analysis result with tasks and validation, or null if no analysis needed
     * @throws Error if taskQueue is not initialized or analysis times out
     */
    async analyzeAndDecompose(userRequest: string, terminalOutput?: string): Promise<AnalysisResult | null> {
        const ANALYSIS_TIMEOUT = 30000; // 30 seconds timeout

        try {
            return await this.withTimeout(
                this.performAnalysis(userRequest, terminalOutput),
                ANALYSIS_TIMEOUT,
                'Analysis timeout: Operation took longer than 30 seconds'
            );
        } catch (error) {
            if (error instanceof Error && error.message.includes('timeout')) {
                this.outputChannel.appendLine(`⏱️ ${error.message}`);
                return {
                    analysis: null,
                    createdTasks: [],
                    validation: {
                        isValid: false,
                        errors: [error.message],
                        warnings: []
                    }
                };
            }
            throw error;
        }
    }

    /**
     * Perform the actual analysis (separated for timeout handling)
     */
    private async performAnalysis(userRequest: string, terminalOutput?: string): Promise<AnalysisResult | null> {
        this.outputChannel.appendLine('🎯 Analyzing project request for autonomous decomposition...');

        const validation: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        try {
            // Step 1: Extract JSON from Claude's terminal output
            // Comment 5: Try to extract from userRequest if no terminalOutput
            let jsonData = null;

            if (!terminalOutput) {
                // Try to extract from userRequest as fallback
                jsonData = extractJsonFromClaudeOutput(userRequest);
                if (!jsonData) {
                    validation.warnings.push('No terminal output provided and no JSON found in user request');
                    return { analysis: null, createdTasks: [], validation };
                }
                validation.warnings.push('Using JSON from user request (no terminal output provided)');
            } else {
                jsonData = extractJsonFromClaudeOutput(terminalOutput);
            }

            if (!jsonData) {
                validation.warnings.push('No JSON found in output - may be a normal conversation');
                return null; // Not an error, just no analysis to process
            }

            // Step 2: Extract project analysis from JSON
            const analysis = jsonData.projectAnalysis;
            if (!analysis) {
                validation.errors.push('JSON does not contain projectAnalysis field');
                validation.isValid = false;
                return { analysis: null, createdTasks: [], validation };
            }

            // Use type guard for initial validation
            if (!isProjectAnalysis(analysis)) {
                validation.errors.push('Invalid project analysis structure - missing required fields or wrong types');
                validation.isValid = false;
                return { analysis: null, createdTasks: [], validation };
            }

            // Step 3: Validate project analysis structure (detailed validation)
            this.validateProjectAnalysis(analysis, validation);
            if (!validation.isValid) {
                return { analysis, createdTasks: [], validation };
            }

            // Step 4: Validate agent template references
            // Comment 3: Gracefully handle missing templates
            interface AgentTemplate {
                id: string;
                name: string;
                description?: string;
            }

            if (!this.agentTemplateManager) {
                validation.warnings.push('Agent templates unavailable; skipping strict requiredAgents validation');
            } else {
                const availableTemplates = (this.agentTemplateManager.getTemplates() || []) as AgentTemplate[];

                if (availableTemplates.length === 0) {
                    validation.warnings.push('Agent templates unavailable; skipping strict requiredAgents validation');
                } else {
                    const templateIds = availableTemplates.map(t => t.id);

                    for (const agentId of analysis.requiredAgents) {
                        if (!templateIds.includes(agentId)) {
                            validation.warnings.push(`Unknown agent template: ${agentId} (will use default agent)`);
                            // Don't set isValid to false - just warn
                        }
                    }
                }
            }

            if (!validation.isValid) {
                return { analysis, createdTasks: [], validation };
            }

            // Step 5: Validate task dependencies
            const taskIds = new Set(analysis.tasks.map(t => t.id));
            for (const task of analysis.tasks) {
                if (task.dependencies) {
                    for (const depId of task.dependencies) {
                        if (!taskIds.has(depId)) {
                            validation.errors.push(`Task ${task.id} depends on non-existent task: ${depId}`);
                            validation.isValid = false;
                        }
                    }
                }
            }

            // Step 6: Check for circular dependencies
            if (this.hasCircularDependencies(analysis.tasks)) {
                validation.errors.push('Circular dependencies detected in task graph');
                validation.isValid = false;
            }

            if (!validation.isValid) {
                return { analysis, createdTasks: [], validation };
            }

            // Step 7: Validate parallelizable groups
            // Comment 6: Check independence of parallel tasks
            if (analysis.parallelizable) {
                for (const group of analysis.parallelizable) {
                    for (const taskId of group) {
                        if (!taskIds.has(taskId)) {
                            validation.warnings.push(`Parallelizable group contains non-existent task: ${taskId}`);
                        }
                    }

                    // Check that tasks in parallel group are independent
                    for (let i = 0; i < group.length; i++) {
                        for (let j = i + 1; j < group.length; j++) {
                            if (this.hasPathBetweenTasks(analysis.tasks, group[i], group[j])) {
                                validation.warnings.push(
                                    `Parallel group contains dependent tasks: ${group[i]} -> ${group[j]}`
                                );
                            }
                        }
                    }
                }
            }

            // Step 8: Create tasks using TaskQueue
            // Comment 1: Topologically sort tasks before creation
            const sortedTasks = this.topoSortTasks(analysis.tasks);

            const createdTasks: TaskCreationResult[] = [];
            const taskIdMap = new Map<string, string>(); // Map original IDs to created task IDs

            for (const analyzedTask of sortedTasks) {
                try {
                    // Comment 2: Merge provided capabilities with mapped ones
                    const mappedCapabilities = this.mapTaskTypeToCapabilities(analyzedTask.type);
                    const capabilities = Array.from(
                        new Set([...(analyzedTask.requiredCapabilities || []), ...mappedCapabilities])
                    );

                    // Convert dependencies using the ID map (Comment 1: No fallback since tasks are sorted)
                    const dependencies = analyzedTask.dependencies?.map(depId => {
                        const mappedId = taskIdMap.get(depId);
                        if (!mappedId) {
                            throw new Error(
                                `Dependency '${depId}' not found for task '${analyzedTask.id}' (topological sort failed)`
                            );
                        }
                        return mappedId;
                    });

                    // Create TaskConfig
                    const taskConfig: TaskConfig = {
                        title: analyzedTask.description.substring(0, 50), // Short title
                        description: analyzedTask.description,
                        priority: analyzedTask.priority || 'medium',
                        estimatedDuration: analyzedTask.estimatedMinutes,
                        requiredCapabilities: capabilities,
                        dependsOn: dependencies,
                        tags: [analyzedTask.type, analysis.projectType]
                    };

                    // Add task to queue with proper null checking
                    if (!this.taskQueue) {
                        throw new Error('TaskQueue not initialized');
                    }
                    const createdTask = await this.taskQueue.addTask(taskConfig);

                    if (createdTask) {
                        taskIdMap.set(analyzedTask.id, createdTask.id);
                        createdTasks.push({
                            taskId: createdTask.id,
                            success: true
                        });
                        this.outputChannel.appendLine(
                            `✅ Created task: ${createdTask.id} - ${analyzedTask.description}`
                        );
                    } else {
                        throw new Error('Task creation returned null');
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    createdTasks.push({
                        taskId: analyzedTask.id,
                        success: false,
                        error: errorMsg
                    });
                    validation.warnings.push(`Failed to create task ${analyzedTask.id}: ${errorMsg}`);
                }
            }

            // Step 9: Report results
            const successCount = createdTasks.filter(r => r.success).length;
            this.outputChannel.appendLine(`📊 Project Analysis Complete:`);
            this.outputChannel.appendLine(`   Type: ${analysis.projectType}`);
            this.outputChannel.appendLine(`   Complexity: ${analysis.complexity}`);
            this.outputChannel.appendLine(`   Duration: ${analysis.estimatedDuration} hours`);
            this.outputChannel.appendLine(`   Tasks created: ${successCount}/${analysis.tasks.length}`);
            this.outputChannel.appendLine(`   Required agents: ${analysis.requiredAgents.join(', ')}`);

            // Step 10: Auto-spawn required agents
            if (analysis.requiredAgents && analysis.requiredAgents.length > 0) {
                this.outputChannel.appendLine('[VP] Auto-spawning required agents...');

                // Check if auto-spawn is enabled (with workspace check)
                const config = vscode.workspace.workspaceFolders
                    ? vscode.workspace.getConfiguration('nofx')
                    : { get: (key: string, defaultValue: any) => defaultValue };
                const autoSpawn =
                    typeof config.get === 'function' ? config.get<boolean>('autoSpawnAgents', true) : true;

                if (autoSpawn) {
                    const spawnResults = await this.spawnRequiredAgents(
                        analysis.requiredAgents,
                        this.agentManager,
                        this.outputChannel
                    );

                    // Wait for agents to initialize if any were spawned
                    if (spawnResults.spawned.length > 0) {
                        const spawnDelay =
                            typeof config.get === 'function' ? config.get<number>('agentSpawnDelay', 3000) : 3000;
                        this.outputChannel.appendLine(`[VP] Waiting ${spawnDelay}ms for agents to initialize...`);
                        await new Promise(resolve => setTimeout(resolve, spawnDelay));

                        // Notify agents about the project context
                        this.outputChannel.appendLine('[VP] Agents ready for task assignment');
                    }
                } else {
                    this.outputChannel.appendLine(
                        '[VP] Auto-spawn disabled. Agents required: ' + analysis.requiredAgents.join(', ')
                    );

                    vscode.window.showWarningMessage(
                        `This project needs: ${analysis.requiredAgents.join(', ')}. ` +
                            'Enable auto-spawn in settings or spawn manually.'
                    );
                }
            }

            // Step 11: Intelligent Task Assignment
            if (createdTasks.length > 0) {
                this.outputChannel.appendLine('\n[VP] Starting intelligent task assignment...');

                // Get created tasks from TaskQueue
                const tasksToAssign: Task[] = [];
                for (const result of createdTasks) {
                    if (result.success && result.taskId) {
                        // Note: We'd need TaskQueue to expose a getTask method
                        // For now, we'll skip actual assignment until TaskQueue is updated
                        this.outputChannel.appendLine(`[VP] Task ${result.taskId} ready for assignment`);
                    }
                }

                // Check if we have tasks and agents (with workspace check)
                const assignmentConfig = vscode.workspace.workspaceFolders
                    ? vscode.workspace.getConfiguration('nofx.assignment')
                    : { get: (key: string, defaultValue: any) => defaultValue };
                const assignmentStrategy =
                    typeof assignmentConfig.get === 'function'
                        ? assignmentConfig.get<string>('strategy', 'optimal')
                        : 'optimal';

                if (assignmentStrategy !== 'disabled' && tasksToAssign.length > 0) {
                    const assignmentResult = await this.assignTasksToAgents(
                        tasksToAssign,
                        this.agentManager,
                        this.outputChannel
                    );

                    // Start monitoring if assignments were made
                    if (assignmentResult.assignments.length > 0) {
                        this.outputChannel.appendLine('[VP] Starting parallel execution monitoring...');

                        // Monitor execution in background
                        this.monitorParallelExecution(assignmentResult, this.outputChannel)
                            .then(summary => {
                                this.outputChannel.appendLine(
                                    `[VP] Execution completed: ${summary.completed.length} tasks`
                                );
                                vscode.window.showInformationMessage(
                                    `✓ Completed ${summary.completed.length} tasks with ${summary.parallelSpeedup.toFixed(1)}x speedup`
                                );
                            })
                            .catch(error => {
                                this.outputChannel.appendLine(`[VP] Execution monitoring error: ${error}`);
                            });
                    }
                }
            }

            return { analysis, createdTasks, validation };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            validation.errors.push(`Analysis failed: ${errorMsg}`);
            validation.isValid = false;
            this.outputChannel.appendLine(`❌ Analysis error: ${errorMsg}`);
            return { analysis: null, createdTasks: [], validation };
        }
    }

    /**
     * Validate project analysis structure
     */
    private validateProjectAnalysis(analysis: any, validation: ValidationResult): void {
        // Check required fields
        if (!analysis.projectType) {
            validation.errors.push('Missing required field: projectType');
            validation.isValid = false;
        } else {
            // Comment 8: Validate projectType enum
            const validProjectTypes = ['webapp', 'api', 'cli', 'library', 'fullstack', 'mobile', 'desktop'];
            if (!validProjectTypes.includes(analysis.projectType)) {
                validation.errors.push(
                    `Invalid projectType '${analysis.projectType}', must be one of: ${validProjectTypes.join(', ')}`
                );
                validation.isValid = false;
            }
        }

        // Comment 7: Make complexity optional (warning instead of error)
        if (!analysis.complexity) {
            validation.warnings.push('Missing optional field: complexity (defaulting to "moderate")');
        } else {
            // Comment 8: Validate complexity enum
            const validComplexities = ['simple', 'moderate', 'complex'];
            if (!validComplexities.includes(analysis.complexity)) {
                validation.errors.push(
                    `Invalid complexity '${analysis.complexity}', must be one of: ${validComplexities.join(', ')}`
                );
                validation.isValid = false;
            }
        }

        if (!analysis.tasks || !Array.isArray(analysis.tasks)) {
            validation.errors.push('Missing or invalid tasks array');
            validation.isValid = false;
            return;
        }

        if (!analysis.requiredAgents || !Array.isArray(analysis.requiredAgents)) {
            validation.errors.push('Missing or invalid requiredAgents array');
            validation.isValid = false;
        } else if (analysis.requiredAgents.length === 0) {
            // Comment 9: Validate requiredAgents is non-empty
            validation.errors.push('requiredAgents cannot be empty');
            validation.isValid = false;
        }

        // Comment 4: Check for duplicate task IDs
        const taskIds = new Set<string>();
        for (const task of analysis.tasks) {
            if (task.id) {
                if (taskIds.has(task.id)) {
                    validation.errors.push(`Duplicate task id: ${task.id}`);
                    validation.isValid = false;
                } else {
                    taskIds.add(task.id);
                }
            }
        }

        // Validate each task
        for (let i = 0; i < analysis.tasks.length; i++) {
            const task = analysis.tasks[i];
            const taskIdentifier = task.id || `#${i + 1}`;

            if (!task.id) {
                validation.errors.push(`Task #${i + 1}: missing required field 'id'`);
                validation.isValid = false;
            }
            if (!task.description) {
                validation.errors.push(`Task '${taskIdentifier}': missing required field 'description'`);
                validation.isValid = false;
            }
            if (!task.type) {
                validation.errors.push(`Task '${taskIdentifier}': missing required field 'type'`);
                validation.isValid = false;
            }
            if (typeof task.estimatedMinutes !== 'number') {
                validation.errors.push(
                    `Task '${taskIdentifier}': missing or invalid 'estimatedMinutes' (must be a number)`
                );
                validation.isValid = false;
            }

            // Validate task type is one of the expected values
            const validTypes = ['frontend', 'backend', 'database', 'testing', 'devops', 'security', 'mobile'];
            if (task.type && !validTypes.includes(task.type)) {
                validation.warnings.push(
                    `Task '${taskIdentifier}': unknown type '${task.type}', expected one of: ${validTypes.join(', ')}`
                );
            }
        }
    }

    /**
     * Topologically sort tasks based on dependencies
     * Comment 1: Ensures dependencies are created before dependent tasks
     */
    private topoSortTasks(tasks: AnalyzedTask[]): AnalyzedTask[] {
        const sorted: AnalyzedTask[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const taskMap = new Map(tasks.map(t => [t.id, t]));

        const visit = (taskId: string): void => {
            if (visited.has(taskId)) return;
            if (visiting.has(taskId)) {
                throw new Error(`Circular dependency detected involving task: ${taskId}`);
            }

            visiting.add(taskId);
            const task = taskMap.get(taskId);

            if (task?.dependencies) {
                for (const depId of task.dependencies) {
                    if (taskMap.has(depId)) {
                        visit(depId);
                    }
                }
            }

            visiting.delete(taskId);
            visited.add(taskId);
            if (task) {
                sorted.push(task);
            }
        };

        for (const task of tasks) {
            visit(task.id);
        }

        return sorted;
    }

    /**
     * Check if there's a dependency path between two tasks
     * Comment 6: Used to validate parallel task independence
     */
    private hasPathBetweenTasks(tasks: AnalyzedTask[], fromId: string, toId: string): boolean {
        const taskMap = new Map(tasks.map(t => [t.id, t]));
        const visited = new Set<string>();

        const hasPath = (currentId: string): boolean => {
            if (currentId === toId) return true;
            if (visited.has(currentId)) return false;

            visited.add(currentId);
            const task = taskMap.get(currentId);

            if (task?.dependencies) {
                for (const depId of task.dependencies) {
                    if (hasPath(depId)) return true;
                }
            }

            // Also check reverse dependencies (if fromId depends on toId)
            for (const task of tasks) {
                if (task.dependencies?.includes(currentId)) {
                    if (task.id === toId) return true;
                    if (!visited.has(task.id) && hasPath(task.id)) return true;
                }
            }

            return false;
        };

        return hasPath(fromId);
    }

    /**
     * Check for circular dependencies in task graph
     */
    private hasCircularDependencies(tasks: AnalyzedTask[]): boolean {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const taskMap = new Map(tasks.map(t => [t.id, t]));

        const hasCycle = (taskId: string): boolean => {
            visited.add(taskId);
            recursionStack.add(taskId);

            const task = taskMap.get(taskId);
            if (task?.dependencies) {
                for (const depId of task.dependencies) {
                    if (!visited.has(depId)) {
                        if (hasCycle(depId)) return true;
                    } else if (recursionStack.has(depId)) {
                        return true; // Found a cycle
                    }
                }
            }

            recursionStack.delete(taskId);
            return false;
        };

        for (const task of tasks) {
            if (!visited.has(task.id)) {
                if (hasCycle(task.id)) return true;
            }
        }

        return false;
    }

    /**
     * Map task type to required capabilities
     */
    private mapTaskTypeToCapabilities(taskType: string): string[] {
        const capabilityMap: Record<string, string[]> = {
            frontend: ['React', 'Vue', 'CSS', 'TypeScript', 'UI/UX'],
            backend: ['Node.js', 'API', 'Database', 'TypeScript', 'REST'],
            database: ['SQL', 'Schema Design', 'Optimization', 'Migrations'],
            testing: ['Jest', 'Testing', 'E2E', 'Unit Tests', 'QA'],
            devops: ['Docker', 'CI/CD', 'Kubernetes', 'Infrastructure'],
            security: ['Security', 'Authentication', 'Encryption', 'Auditing'],
            mobile: ['React Native', 'iOS', 'Android', 'Mobile UI']
        };

        return capabilityMap[taskType] || ['General'];
    }

    /**
     * Automatically spawn required agents based on analysis
     * Returns detailed results of spawn operation
     */
    private async spawnRequiredAgents(
        requiredAgents: string[],
        agentManager: AgentManager,
        outputChannel: vscode.OutputChannel
    ): Promise<{ spawned: string[]; existing: string[]; failed: string[] }> {
        const results = {
            spawned: [] as string[],
            existing: [] as string[],
            failed: [] as string[]
        };

        // Validate requiredAgents array
        if (!requiredAgents || !Array.isArray(requiredAgents) || requiredAgents.length === 0) {
            outputChannel.appendLine('[Agent Spawn] No agents required');
            return results;
        }

        // Filter out invalid entries
        const validAgents = requiredAgents.filter(a => typeof a === 'string' && a.trim());
        if (validAgents.length === 0) {
            outputChannel.appendLine('[Agent Spawn] No valid agent types provided');
            return results;
        }

        try {
            // Get template manager with proper error handling
            let templateManager: AgentTemplateManager | null = null;
            try {
                templateManager = this.agentTemplateManager || null;
                // Note: AgentTemplateManager is not registered in Container,
                // so we rely on the instance passed to the constructor
            } catch (error) {
                outputChannel.appendLine('[Agent Spawn] ERROR: Failed to get AgentTemplateManager: ' + error);
            }

            if (!templateManager) {
                outputChannel.appendLine('[Agent Spawn] ✗ Template manager not available');
                return results;
            }

            // Get currently active agent types from both sources
            const activeTypes = new Set<string>();

            // Get from template manager (which checks AgentManager)
            const managerActiveTypes = templateManager.getActiveAgentTypes();
            managerActiveTypes.forEach(type => activeTypes.add(type));

            // Also directly check AgentManager if available
            if (agentManager && typeof agentManager.getAllAgents === 'function') {
                const agents = agentManager.getAllAgents();
                for (const agent of agents) {
                    if (agent.type) activeTypes.add(agent.type.toLowerCase());
                    if (agent.template?.id) activeTypes.add(agent.template.id.toLowerCase());
                }
            }

            // Track agents spawned in this batch
            const spawnedInBatch = new Set<string>();

            // Get EventBus for emitting events
            let eventBus: IEventBus | undefined;
            try {
                const container = Container.getInstance();
                if (container && container.has(SERVICE_TOKENS.EventBus)) {
                    eventBus = container.resolve<IEventBus>(SERVICE_TOKENS.EventBus);
                }
            } catch (error) {
                // EventBus not available - continue without events
            }

            outputChannel.appendLine(`[Agent Spawn] Processing ${validAgents.length} required agents...`);
            outputChannel.appendLine(`[Agent Spawn] Currently active types: ${Array.from(activeTypes).join(', ')}`);

            for (const requiredType of validAgents) {
                const normalizedType = requiredType.toLowerCase().trim();

                // Check if already active
                if (activeTypes.has(normalizedType)) {
                    outputChannel.appendLine(`[Agent Spawn] ✓ ${requiredType} already active`);
                    results.existing.push(requiredType);
                    continue;
                }

                // Check if already spawned in this batch
                if (spawnedInBatch.has(normalizedType)) {
                    outputChannel.appendLine(`[Agent Spawn] ✓ ${requiredType} already in batch`);
                    results.existing.push(requiredType);
                    continue;
                }

                // Find matching template
                let template: any = templateManager.findTemplateByType(requiredType);
                let isUsingFallback = false;

                if (!template) {
                    outputChannel.appendLine(`[Agent Spawn] ⚠️ No exact match for "${requiredType}", using fallback`);

                    // Try fullstack-developer as fallback
                    template = templateManager.getTemplate('fullstack-developer');
                    isUsingFallback = true;

                    if (!template) {
                        // Last resort: try to find ANY available template
                        const allTemplates = templateManager.getAllTemplates();
                        if (allTemplates && allTemplates.length > 0) {
                            template = allTemplates[0];
                            outputChannel.appendLine(`[Agent Spawn] Using first available template: ${template.id}`);
                        } else {
                            outputChannel.appendLine(`[Agent Spawn] ✗ No templates available for ${requiredType}`);
                            results.failed.push(requiredType);
                            continue;
                        }
                    }
                }

                // Spawn the agent
                try {
                    // Emit spawn requested event
                    if (eventBus) {
                        eventBus.publish(DOMAIN_EVENTS.AGENT_SPAWN_REQUESTED, {
                            agentType: requiredType,
                            templateId: template.id,
                            isUsingFallback
                        });
                    }

                    // Create AgentConfig from template (properly structured)
                    const agentConfig = {
                        name: isUsingFallback
                            ? this.formatAgentName(requiredType)
                            : template.name || this.formatAgentName(requiredType),
                        type: template.id || requiredType,
                        autoStart: true,
                        template: template // Pass the entire template object
                    };

                    // Spawn through AgentManager
                    const agent = await agentManager.spawnAgent(agentConfig);

                    outputChannel.appendLine(
                        `[Agent Spawn] ✓ Spawned ${agent.name} (${template.id}) for "${requiredType}"`
                    );

                    results.spawned.push(requiredType);
                    spawnedInBatch.add(normalizedType);

                    // Emit spawn success event
                    if (eventBus) {
                        eventBus.publish(DOMAIN_EVENTS.AGENT_SPAWN_SUCCESS, {
                            agentId: agent.id,
                            agentName: agent.name,
                            agentType: requiredType,
                            templateId: template.id
                        });
                    }

                    // Update active types
                    activeTypes.add(normalizedType);
                    if (template.types) {
                        template.types.forEach((t: string) => {
                            activeTypes.add(t.toLowerCase());
                            spawnedInBatch.add(t.toLowerCase());
                        });
                    }
                    if (template.tags) {
                        template.tags.forEach((t: string) => {
                            activeTypes.add(t.toLowerCase());
                            spawnedInBatch.add(t.toLowerCase());
                        });
                    }
                } catch (error) {
                    outputChannel.appendLine(`[Agent Spawn] ✗ Failed to spawn ${requiredType}: ${error}`);
                    results.failed.push(requiredType);

                    // Emit spawn failed event
                    if (eventBus) {
                        eventBus.publish(DOMAIN_EVENTS.AGENT_SPAWN_FAILED, {
                            agentType: requiredType,
                            templateId: template?.id,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }

                // Small delay between spawns
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Summary
            outputChannel.appendLine(`[Agent Spawn] === Summary ===`);
            outputChannel.appendLine(
                `[Agent Spawn] Spawned: ${results.spawned.length} (${results.spawned.join(', ')})`
            );
            outputChannel.appendLine(
                `[Agent Spawn] Existing: ${results.existing.length} (${results.existing.join(', ')})`
            );
            outputChannel.appendLine(`[Agent Spawn] Failed: ${results.failed.length} (${results.failed.join(', ')})`);

            // Emit batch complete event
            if (eventBus) {
                eventBus.publish(DOMAIN_EVENTS.AGENT_SPAWN_BATCH_COMPLETE, {
                    requested: validAgents,
                    spawned: results.spawned,
                    existing: results.existing,
                    failed: results.failed,
                    totalRequested: validAgents.length,
                    totalSpawned: results.spawned.length,
                    totalExisting: results.existing.length,
                    totalFailed: results.failed.length
                });
            }

            // User notification
            if (results.spawned.length > 0) {
                vscode.window.showInformationMessage(
                    `✓ Spawned ${results.spawned.length} agent(s): ${results.spawned.join(', ')}`
                );
            }

            return results;
        } catch (error) {
            outputChannel.appendLine(`[Agent Spawn] Critical error: ${error}`);
            throw error;
        }
    }

    /**
     * Format agent type into proper display name
     */
    private formatAgentName(agentType: string): string {
        // Handle different formats: snake_case, kebab-case, camelCase
        return agentType
            .replace(/[-_]/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Extract capabilities from template structure
     */
    private extractCapabilities(template: any): string[] {
        const capabilities: string[] = [];

        // Extract from capabilities object structure
        if (template.capabilities) {
            if (typeof template.capabilities === 'object' && !Array.isArray(template.capabilities)) {
                // Handle nested structure like { languages: [], frameworks: [], tools: [] }
                for (const category of Object.values(template.capabilities)) {
                    if (Array.isArray(category)) {
                        capabilities.push(...category);
                    }
                }
            } else if (Array.isArray(template.capabilities)) {
                // Direct array of capabilities
                capabilities.push(...template.capabilities);
            }
        }

        // Also include tags if available
        if (Array.isArray(template.tags)) {
            capabilities.push(...template.tags);
        }

        // Remove duplicates and return
        return [...new Set(capabilities)];
    }

    /**
     * Assign tasks to agents using intelligent matching
     */
    private async assignTasksToAgents(
        tasks: Task[],
        agentManager: AgentManager,
        outputChannel: vscode.OutputChannel
    ): Promise<AssignmentResult> {
        const startTime = Date.now();
        outputChannel.appendLine('\n[Task Assignment] === Starting Intelligent Task Assignment ===');

        // Initialize result structure
        const result: AssignmentResult = {
            assignments: [],
            unassigned: [],
            failed: [],
            executionLayers: [],
            metrics: {
                totalTasks: tasks.length,
                assignedTasks: 0,
                parallelGroups: 0,
                averageScore: 0,
                estimatedCompletion: 0
            }
        };

        try {
            // Get services from container with proper error handling
            let capabilityMatcher: CapabilityMatcher | undefined;
            let dependencyManager: TaskDependencyManager | undefined;

            try {
                const container = Container.getInstance();
                if (container.has(SERVICE_TOKENS.CapabilityMatcher)) {
                    capabilityMatcher = container.resolve<CapabilityMatcher>(SERVICE_TOKENS.CapabilityMatcher);
                }
                if (container.has(SERVICE_TOKENS.TaskDependencyManager)) {
                    dependencyManager = container.resolve<TaskDependencyManager>(SERVICE_TOKENS.TaskDependencyManager);
                }
            } catch (error) {
                outputChannel.appendLine(`[Task Assignment] WARNING: Some services not available: ${error}`);
            }

            if (!capabilityMatcher) {
                outputChannel.appendLine(
                    '[Task Assignment] WARNING: CapabilityMatcher not available, using basic assignment'
                );
            }
            if (!dependencyManager) {
                outputChannel.appendLine(
                    '[Task Assignment] WARNING: TaskDependencyManager not available, treating all tasks as single layer'
                );
            }

            // Get all available agents
            const availableAgents = this.getAvailableAgents(agentManager);
            if (availableAgents.length === 0) {
                outputChannel.appendLine('[Task Assignment] ✗ No agents available for assignment');
                result.unassigned = tasks;
                return result;
            }

            // Get configuration for assignment strategy
            const config = vscode.workspace.workspaceFolders
                ? vscode.workspace.getConfiguration('nofx.assignment')
                : { get: (key: string, defaultValue: any) => defaultValue };
            const strategy = typeof config.get === 'function' ? config.get<string>('strategy', 'optimal') : 'optimal';
            const maxParallelTasks = typeof config.get === 'function' ? config.get<number>('maxParallelTasks', 5) : 5;

            outputChannel.appendLine(`[Task Assignment] Found ${availableAgents.length} available agents`);
            outputChannel.appendLine(`[Task Assignment] Processing ${tasks.length} tasks`);

            // Create execution layers based on dependencies
            const executionLayers = dependencyManager
                ? await this.createExecutionLayers(tasks, dependencyManager, outputChannel)
                : [tasks]; // Fallback: treat all tasks as single layer
            result.executionLayers = executionLayers;
            result.metrics.parallelGroups = executionLayers.length;

            outputChannel.appendLine(`[Task Assignment] Created ${executionLayers.length} execution layers`);

            // Process each layer
            for (let layerIndex = 0; layerIndex < executionLayers.length; layerIndex++) {
                const layer = executionLayers[layerIndex];
                outputChannel.appendLine(
                    `\n[Task Assignment] Processing Layer ${layerIndex + 1} with ${layer.length} tasks`
                );

                // Identify parallel tasks within the layer
                const parallelGroups = this.identifyParallelTasks(layer);

                // Track current parallel task count
                let currentParallelCount = 0;

                for (const [groupId, groupTasks] of parallelGroups) {
                    outputChannel.appendLine(
                        `[Task Assignment] Parallel Group "${groupId}" has ${groupTasks.length} tasks`
                    );

                    // Validate parallel group consistency
                    const validatedTasks = this.validateParallelGroup(groupTasks, outputChannel);

                    // Assign tasks in this parallel group
                    for (const task of validatedTasks) {
                        // Check concurrent task limit
                        if (currentParallelCount >= maxParallelTasks) {
                            outputChannel.appendLine(
                                `[Task Assignment] Max parallel tasks (${maxParallelTasks}) reached, queuing remaining tasks`
                            );
                            result.unassigned.push(task);
                            continue;
                        }

                        const assignment = await this.findBestAssignmentWithStrategy(
                            task,
                            availableAgents,
                            capabilityMatcher,
                            result.assignments,
                            strategy,
                            outputChannel
                        );

                        if (assignment) {
                            result.assignments.push(assignment);
                            result.metrics.assignedTasks++;
                            currentParallelCount++;

                            // Mark task as assigned
                            task.assignedTo = assignment.agent.id;
                            task.status = 'assigned';

                            // Track assignment for dynamic reassignment
                            this.taskAssignmentMap.set(task.id, assignment.agent.id);
                            if (!this.agentTasksMap.has(assignment.agent.id)) {
                                this.agentTasksMap.set(assignment.agent.id, new Set());
                            }
                            this.agentTasksMap.get(assignment.agent.id)!.add(task.id);

                            // Publish task assigned event
                            try {
                                const container = Container.getInstance();
                                if (container.has(SERVICE_TOKENS.EventBus)) {
                                    const eventBus = container.resolve<IEventBus>(SERVICE_TOKENS.EventBus);
                                    eventBus.publish(DOMAIN_EVENTS.TASK_ASSIGNED, {
                                        taskId: task.id,
                                        agentId: assignment.agent.id,
                                        score: assignment.score,
                                        layer: layerIndex
                                    });
                                }
                            } catch (error) {
                                // Event bus not available, continue without events
                            }

                            outputChannel.appendLine(
                                `[Task Assignment] ✓ Assigned "${task.title}" to ${assignment.agent.name} (score: ${assignment.score.toFixed(2)})`
                            );
                        } else {
                            result.unassigned.push(task);
                            result.failed.push({
                                taskId: task.id,
                                reason: 'No suitable agent found',
                                attemptedAgents: availableAgents.map(a => a.id)
                            });

                            outputChannel.appendLine(`[Task Assignment] ✗ Could not assign "${task.title}"`);
                        }
                    }
                }
            }

            // Calculate metrics
            if (result.assignments.length > 0) {
                const totalScore = result.assignments.reduce((sum, a) => sum + a.score, 0);
                result.metrics.averageScore = totalScore / result.assignments.length;

                // Estimate completion time (simplified)
                const maxTasksPerAgent = this.calculateMaxTasksPerAgent(result.assignments);
                result.metrics.estimatedCompletion = maxTasksPerAgent * 30; // 30 minutes per task average
            }

            // Summary
            const duration = Date.now() - startTime;
            outputChannel.appendLine('\n[Task Assignment] === Assignment Summary ===');
            outputChannel.appendLine(`[Task Assignment] Total Tasks: ${result.metrics.totalTasks}`);
            outputChannel.appendLine(`[Task Assignment] Assigned: ${result.metrics.assignedTasks}`);
            outputChannel.appendLine(`[Task Assignment] Unassigned: ${result.unassigned.length}`);
            outputChannel.appendLine(`[Task Assignment] Failed: ${result.failed.length}`);
            outputChannel.appendLine(`[Task Assignment] Parallel Groups: ${result.metrics.parallelGroups}`);
            outputChannel.appendLine(`[Task Assignment] Average Score: ${result.metrics.averageScore.toFixed(2)}`);
            outputChannel.appendLine(
                `[Task Assignment] Estimated Completion: ${result.metrics.estimatedCompletion} minutes`
            );
            outputChannel.appendLine(`[Task Assignment] Duration: ${duration}ms`);

            return result;
        } catch (error) {
            outputChannel.appendLine(`[Task Assignment] Critical error: ${error}`);
            result.unassigned = tasks;
            return result;
        }
    }

    /**
     * Create execution layers based on task dependencies
     */
    private async createExecutionLayers(
        tasks: Task[],
        dependencyManager: TaskDependencyManager,
        outputChannel: vscode.OutputChannel
    ): Promise<Task[][]> {
        try {
            // Get topological sort
            const sortedTasks = dependencyManager.getTopologicalSort(tasks);

            // Create layers based on dependency depth
            const layers: Task[][] = [];
            const taskDepths = new Map<string, number>();

            // Calculate depth for each task
            for (const task of sortedTasks) {
                const dependencies = task.dependsOn || [];
                let maxDepth = 0;

                for (const depId of dependencies) {
                    const depDepth = taskDepths.get(depId) || 0;
                    maxDepth = Math.max(maxDepth, depDepth + 1);
                }

                taskDepths.set(task.id, maxDepth);

                // Add to appropriate layer
                if (!layers[maxDepth]) {
                    layers[maxDepth] = [];
                }
                layers[maxDepth].push(task);
            }

            return layers.filter(layer => layer && layer.length > 0);
        } catch (error) {
            outputChannel.appendLine(`[Task Assignment] Error creating execution layers: ${error}`);
            // Fallback: treat all tasks as single layer
            return [tasks];
        }
    }

    /**
     * Identify tasks that can run in parallel
     */
    private identifyParallelTasks(tasks: Task[]): Map<string, Task[]> {
        const parallelGroups = new Map<string, Task[]>();

        for (const task of tasks) {
            // Use parallelGroup if specified
            const groupId = task.parallelGroup || 'default';

            if (!parallelGroups.has(groupId)) {
                parallelGroups.set(groupId, []);
            }

            // Only add if task can run in parallel or no specification
            if (task.canRunInParallel !== false) {
                parallelGroups.get(groupId)!.push(task);
            } else {
                // Tasks that can't run in parallel get their own group
                parallelGroups.set(`solo-${task.id}`, [task]);
            }
        }

        return parallelGroups;
    }

    /**
     * Validate that tasks in parallel group don't have dependencies on each other
     */
    private validateParallelGroup(tasks: Task[], outputChannel: vscode.OutputChannel): Task[] {
        const validTasks: Task[] = [];
        const taskIds = new Set(tasks.map(t => t.id));

        for (const task of tasks) {
            // Check if task has dependencies on other tasks in the same group
            const hasInternalDependency = task.dependsOn?.some(dep => taskIds.has(dep));

            if (hasInternalDependency) {
                outputChannel.appendLine(
                    `[Task Assignment] WARNING: Task "${task.title}" has dependency within parallel group, moving to sequential`
                );
                // Task will be handled in a different group
            } else {
                validTasks.push(task);
            }
        }

        return validTasks;
    }

    /**
     * Find best assignment based on strategy
     */
    private async findBestAssignmentWithStrategy(
        task: Task,
        availableAgents: Agent[],
        capabilityMatcher: CapabilityMatcher | undefined,
        existingAssignments: TaskAssignment[],
        strategy: string,
        outputChannel: vscode.OutputChannel
    ): Promise<TaskAssignment | null> {
        switch (strategy) {
            case 'fast':
                return this.findFastAssignment(task, availableAgents, existingAssignments);
            case 'balanced':
                return this.findBalancedAssignment(task, availableAgents, existingAssignments);
            case 'optimal':
            default:
                return this.findBestAssignment(
                    task,
                    availableAgents,
                    capabilityMatcher,
                    existingAssignments,
                    outputChannel
                );
        }
    }

    /**
     * Fast assignment - assign to first available agent
     */
    private findFastAssignment(
        task: Task,
        availableAgents: Agent[],
        existingAssignments: TaskAssignment[]
    ): TaskAssignment | null {
        const agentWorkloads = this.calculateAgentWorkloads(existingAssignments);

        for (const agent of availableAgents) {
            const workload = agentWorkloads.get(agent.id) || 0;
            if (workload < 10) {
                // Simple workload limit
                return {
                    task,
                    agent,
                    score: 0.5, // Default score for fast assignment
                    criteria: {
                        capabilityScore: 0.5,
                        workloadBalance: 0.5,
                        specializationMatch: 0.5,
                        historicalPerformance: 0.5
                    }
                };
            }
        }

        return null;
    }

    /**
     * Balanced assignment - distribute evenly across agents
     */
    private findBalancedAssignment(
        task: Task,
        availableAgents: Agent[],
        existingAssignments: TaskAssignment[]
    ): TaskAssignment | null {
        const agentWorkloads = this.calculateAgentWorkloads(existingAssignments);

        // Find agent with minimum workload
        let minWorkload = Infinity;
        let selectedAgent: Agent | null = null;

        for (const agent of availableAgents) {
            const workload = agentWorkloads.get(agent.id) || 0;
            if (workload < minWorkload) {
                minWorkload = workload;
                selectedAgent = agent;
            }
        }

        if (selectedAgent) {
            return {
                task,
                agent: selectedAgent,
                score: 0.7, // Default score for balanced assignment
                criteria: {
                    capabilityScore: 0.5,
                    workloadBalance: 1.0, // Perfect balance score
                    specializationMatch: 0.5,
                    historicalPerformance: 0.5
                }
            };
        }

        return null;
    }

    /**
     * Find the best agent assignment for a task
     */
    private async findBestAssignment(
        task: Task,
        availableAgents: Agent[],
        capabilityMatcher: CapabilityMatcher | undefined,
        existingAssignments: TaskAssignment[],
        outputChannel: vscode.OutputChannel
    ): Promise<TaskAssignment | null> {
        let bestAssignment: TaskAssignment | null = null;
        let bestScore = 0;

        // Get current workload for each agent
        const agentWorkloads = this.calculateAgentWorkloads(existingAssignments);

        for (const agent of availableAgents) {
            // Skip if agent is at max capacity
            const currentWorkload = agentWorkloads.get(agent.id) || 0;
            const maxConcurrent = vscode.workspace.getConfiguration('nofx').get<number>('maxConcurrentAgents', 10);

            if (currentWorkload >= maxConcurrent) {
                continue;
            }

            // Calculate capability score using CapabilityMatcher (if available)
            let capabilityScore = 0.5; // Default score if no matcher
            if (capabilityMatcher) {
                const rankings = capabilityMatcher.rankAgents([agent], task);
                capabilityScore = rankings[0]?.score || 0;
            }

            // Calculate workload balance score (prefer less loaded agents)
            const workloadBalance = 1 - currentWorkload / maxConcurrent;

            // Calculate specialization match
            const specializationMatch = this.calculateSpecializationMatch(agent, task);

            // Calculate historical performance (simplified for now)
            const historicalPerformance = 0.7; // Default to 70% performance

            // Calculate composite score
            const criteria: AssignmentCriteria = {
                capabilityScore,
                workloadBalance,
                specializationMatch,
                historicalPerformance
            };

            // Weighted score calculation
            const priorityWeight = vscode.workspace
                .getConfiguration('nofx.assignment')
                .get<number>('priorityWeight', 0.3);
            const score =
                capabilityScore * 0.4 +
                workloadBalance * 0.2 +
                specializationMatch * 0.3 +
                historicalPerformance * 0.1 +
                (task.priority === 'high' ? priorityWeight : 0);

            if (score > bestScore) {
                bestScore = score;
                bestAssignment = {
                    task,
                    agent,
                    score,
                    criteria
                };
            }
        }

        return bestAssignment;
    }

    /**
     * Get available agents from the agent manager
     */
    private getAvailableAgents(agentManager: AgentManager): Agent[] {
        // Get all agents using the getAllAgents method we added
        const allAgents = agentManager.getAllAgents();

        // Filter for available agents (idle or ready status)
        const availableAgents = allAgents.filter(
            agent => agent.status === 'idle' || (agent.status === 'working' && agent.currentTask === null)
        );

        return availableAgents;
    }

    /**
     * Calculate current workload for each agent
     */
    private calculateAgentWorkloads(assignments: TaskAssignment[]): Map<string, number> {
        const workloads = new Map<string, number>();

        for (const assignment of assignments) {
            const current = workloads.get(assignment.agent.id) || 0;
            workloads.set(assignment.agent.id, current + 1);
        }

        return workloads;
    }

    /**
     * Calculate specialization match between agent and task
     */
    private calculateSpecializationMatch(agent: Agent, task: Task): number {
        if (!agent.template || !task.requiredCapabilities) {
            return 0.5; // Default neutral score
        }

        const agentCapabilities = new Set(agent.template.capabilities || []);
        const requiredCapabilities = task.requiredCapabilities;

        if (requiredCapabilities.length === 0) {
            return 0.5;
        }

        const matches = requiredCapabilities.filter(cap => agentCapabilities.has(cap)).length;
        return matches / requiredCapabilities.length;
    }

    /**
     * Calculate maximum tasks assigned to any single agent
     */
    private calculateMaxTasksPerAgent(assignments: TaskAssignment[]): number {
        const taskCounts = new Map<string, number>();

        for (const assignment of assignments) {
            const current = taskCounts.get(assignment.agent.id) || 0;
            taskCounts.set(assignment.agent.id, current + 1);
        }

        return Math.max(...taskCounts.values(), 0);
    }

    /**
     * Monitor parallel task execution
     */
    private async monitorParallelExecution(
        assignments: AssignmentResult,
        outputChannel: vscode.OutputChannel
    ): Promise<ExecutionSummary> {
        const startTime = Date.now();
        const summary: ExecutionSummary = {
            completed: [],
            inProgress: [],
            failed: [],
            duration: 0,
            parallelSpeedup: 1,
            reassignments: []
        };

        // Check if taskQueue is available
        if (!this.taskQueue) {
            outputChannel.appendLine('[Execution Monitor] TaskQueue not available');
            return summary;
        }

        outputChannel.appendLine('\n[Execution Monitor] Starting parallel execution monitoring...');

        // Generate unique execution ID for this monitoring session
        const executionId = `exec-${Date.now()}`;

        // Track task states
        const taskStates = new Map<string, 'pending' | 'running' | 'completed' | 'failed'>();

        for (const assignment of assignments.assignments) {
            taskStates.set(assignment.task.id, 'pending');
        }

        // Event-based monitoring instead of polling
        return new Promise<ExecutionSummary>(resolve => {
            let completedCount = 0;
            const totalTasks = assignments.assignments.length;

            // Set up monitoring interval with cleanup
            const intervalId = setInterval(() => {
                // Check if disposed
                if (this.isDisposed) {
                    clearInterval(intervalId);
                    this.monitoringIntervals.delete(executionId);
                    resolve(summary);
                    return;
                }
                // Check agent health and task statuses
                for (const assignment of assignments.assignments) {
                    // Monitor agent health for dynamic reassignment
                    const agent = this.agentManager.getAgent(assignment.agent.id);
                    if (agent && agent.status === 'offline') {
                        // Handle agent failure with reassignment asynchronously
                        this.handleAgentFailure(
                            assignment.agent.id,
                            `Agent status changed to ${agent.status}`,
                            outputChannel
                        ).then(() => {
                            // Track reassignments in summary after handling
                            const reassignmentRecords = this.reassignmentHistory.get(assignment.task.id);
                            if (reassignmentRecords && reassignmentRecords.length > 0) {
                                summary.reassignments = summary.reassignments || [];
                                summary.reassignments.push(...reassignmentRecords);
                            }
                        });

                        continue;
                    }

                    const currentState = taskStates.get(assignment.task.id);

                    if (currentState === 'pending') {
                        // Check if dependencies are met
                        const canStart = this.checkDependencies(assignment.task, taskStates);
                        if (canStart) {
                            taskStates.set(assignment.task.id, 'running');
                            summary.inProgress.push(assignment.task.id);
                            outputChannel.appendLine(`[Execution Monitor] Task "${assignment.task.title}" started`);
                        }
                    } else if (currentState === 'running') {
                        // Check for task failure (simulated with random chance)
                        if (Math.random() > 0.95) {
                            // Task failed - trigger reassignment
                            taskStates.set(assignment.task.id, 'failed');
                            summary.failed.push(assignment.task.id);

                            // Attempt reassignment
                            const availableAgents = this.getAvailableAgents(this.agentManager).filter(
                                a => a.id !== assignment.agent.id && !this.failedAgents.has(a.id)
                            );

                            if (availableAgents.length > 0) {
                                // Handle reassignment asynchronously
                                this.reassignTask(
                                    assignment.task.id,
                                    assignment.agent.id,
                                    availableAgents,
                                    'Task execution failed',
                                    outputChannel
                                ).then(reassigned => {
                                    if (reassigned) {
                                        // Reset task state for retry
                                        taskStates.set(assignment.task.id, 'pending');
                                        summary.failed = summary.failed.filter(id => id !== assignment.task.id);
                                    }
                                });
                            }
                        } else if (Math.random() > 0.7) {
                            // Task completed successfully
                            taskStates.set(assignment.task.id, 'completed');
                            summary.completed.push(assignment.task.id);
                            summary.inProgress = summary.inProgress.filter(id => id !== assignment.task.id);
                            completedCount++;
                            outputChannel.appendLine(`[Execution Monitor] Task "${assignment.task.title}" completed`);
                        }
                    }
                }

                // Check for completion
                if (completedCount >= totalTasks) {
                    clearInterval(intervalId);
                    this.monitoringIntervals.delete(executionId);

                    summary.duration = Date.now() - startTime;

                    // Calculate parallel speedup (with division by zero check)
                    const sequentialTime = totalTasks * 30000; // 30 seconds per task
                    summary.parallelSpeedup = summary.duration > 0 ? sequentialTime / summary.duration : 1.0;

                    outputChannel.appendLine('\n[Execution Monitor] === Execution Summary ===');
                    outputChannel.appendLine(`[Execution Monitor] Completed: ${summary.completed.length}`);
                    outputChannel.appendLine(`[Execution Monitor] Failed: ${summary.failed.length}`);
                    outputChannel.appendLine(`[Execution Monitor] Duration: ${summary.duration}ms`);
                    outputChannel.appendLine(
                        `[Execution Monitor] Parallel Speedup: ${summary.parallelSpeedup.toFixed(2)}x`
                    );
                    if (summary.reassignments && summary.reassignments.length > 0) {
                        outputChannel.appendLine(`[Execution Monitor] Reassignments: ${summary.reassignments.length}`);
                        for (const record of summary.reassignments) {
                            outputChannel.appendLine(
                                `  - Task ${record.taskId}: ${record.originalAgentId} → ${record.newAgentId} (${record.reason})`
                            );
                        }
                    }

                    resolve(summary);
                    return;
                }

                // Timeout after 10 minutes
                if (Date.now() - startTime > 600000) {
                    clearInterval(intervalId);
                    this.monitoringIntervals.delete(executionId);
                    outputChannel.appendLine('[Execution Monitor] Execution timeout reached');
                    summary.duration = Date.now() - startTime;
                    resolve(summary);
                    return;
                }
            }, 1000);

            // Store interval for cleanup
            this.monitoringIntervals.set(executionId, intervalId);
        });
    }

    /**
     * Check if task dependencies are met
     */
    private checkDependencies(
        task: Task,
        taskStates: Map<string, 'pending' | 'running' | 'completed' | 'failed'>
    ): boolean {
        if (!task.dependsOn || task.dependsOn.length === 0) {
            return true;
        }

        for (const depId of task.dependsOn) {
            const depState = taskStates.get(depId);
            if (depState !== 'completed') {
                return false;
            }
        }

        return true;
    }

    /**
     * Handle agent failure and trigger reassignment if enabled
     */
    private async handleAgentFailure(
        agentId: string,
        reason: string,
        outputChannel: vscode.OutputChannel
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('nofx.assignment');
        const enableReassignment = config.get<boolean>('enableDynamicReassignment', true);

        if (!enableReassignment) {
            outputChannel.appendLine(`[Reassignment] Agent ${agentId} failed: ${reason} (reassignment disabled)`);
            return;
        }

        outputChannel.appendLine(`[Reassignment] Handling agent failure: ${agentId} - ${reason}`);

        // Mark agent as failed
        this.failedAgents.add(agentId);

        // Get tasks assigned to this agent
        const agentTasks = this.agentTasksMap.get(agentId);
        if (!agentTasks || agentTasks.size === 0) {
            outputChannel.appendLine(`[Reassignment] No tasks to reassign from agent ${agentId}`);
            return;
        }

        // Find alternative agents
        const availableAgents = this.getAvailableAgents(this.agentManager).filter(
            agent => agent.id !== agentId && !this.failedAgents.has(agent.id)
        );

        if (availableAgents.length === 0) {
            outputChannel.appendLine(`[Reassignment] ✗ No available agents for reassignment`);
            return;
        }

        // Reassign each task
        for (const taskId of agentTasks) {
            await this.reassignTask(taskId, agentId, availableAgents, reason, outputChannel);
        }

        // Clear agent's task list
        this.agentTasksMap.delete(agentId);
    }

    /**
     * Reassign a specific task to a new agent
     */
    private async reassignTask(
        taskId: string,
        failedAgentId: string,
        availableAgents: Agent[],
        failureReason: string,
        outputChannel: vscode.OutputChannel
    ): Promise<boolean> {
        outputChannel.appendLine(`[Reassignment] Attempting to reassign task ${taskId}`);

        // Get task from task queue
        const task = this.taskQueue?.getTask(taskId);
        if (!task) {
            outputChannel.appendLine(`[Reassignment] Task ${taskId} not found in queue`);
            return false;
        }

        // Get reassignment history for this task
        const history = this.reassignmentHistory.get(taskId) || [];
        const attemptNumber = history.length + 1;

        // Check max reassignment attempts
        const maxAttempts = 3;
        if (attemptNumber > maxAttempts) {
            outputChannel.appendLine(
                `[Reassignment] Task ${taskId} exceeded max reassignment attempts (${maxAttempts})`
            );
            return false;
        }

        // Find best alternative agent
        const assignment = await this.findBestAssignment(
            task,
            availableAgents,
            undefined, // capabilityMatcher
            [], // existingAssignments
            outputChannel
        );

        if (!assignment) {
            outputChannel.appendLine(`[Reassignment] ✗ No suitable agent found for task ${taskId}`);
            return false;
        }

        const newAgentId = assignment.agent.id;

        // Record reassignment
        const record: ReassignmentRecord = {
            taskId,
            originalAgentId: failedAgentId,
            newAgentId,
            reason: failureReason,
            timestamp: Date.now(),
            attemptNumber
        };

        history.push(record);
        this.reassignmentHistory.set(taskId, history);

        // Update assignment maps
        this.taskAssignmentMap.set(taskId, newAgentId);

        // Update agent's task set
        if (!this.agentTasksMap.has(newAgentId)) {
            this.agentTasksMap.set(newAgentId, new Set());
        }
        this.agentTasksMap.get(newAgentId)!.add(taskId);

        // Update task assignment
        task.assignedTo = newAgentId;

        // Publish reassignment event
        try {
            const container = Container.getInstance();
            if (container.has(SERVICE_TOKENS.EventBus)) {
                const eventBus = container.resolve<IEventBus>(SERVICE_TOKENS.EventBus);
                eventBus.publish(DOMAIN_EVENTS.TASK_ASSIGNED, {
                    taskId,
                    agentId: newAgentId,
                    reassigned: true,
                    previousAgentId: failedAgentId,
                    attemptNumber
                });
            }
        } catch (error) {
            // Event bus not available
        }

        outputChannel.appendLine(
            `[Reassignment] ✓ Task ${taskId} reassigned from ${failedAgentId} to ${newAgentId} (attempt ${attemptNumber})`
        );

        return true;
    }

    /**
     * Monitor agent health and detect failures
     */
    private monitorAgentHealth(agentId: string): void {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) return;

        // Check agent status (offline indicates failure)
        if (agent.status === 'offline') {
            this.handleAgentFailure(agentId, `Agent status: ${agent.status}`, this.outputChannel);
        }
    }

    /**
     * Analyze codebase to build knowledge graph
     */
    async analyzeCodebase() {
        this.outputChannel.appendLine('🔍 Analyzing codebase structure with TypeScript AST...');

        // Use the new CodebaseAnalyzer for proper AST-based analysis
        const analysis = await this.codebaseAnalyzer.analyzeWorkspace({
            includeTests: true,
            cacheResults: true
        });

        // Sync results to local knowledge base
        this.codebaseKnowledge = analysis.components;
        this.qualityMetrics = analysis.metrics;

        // Build project architecture from analysis
        // Convert dependency graph from Map<string, Set<string>> to Map<string, string[]>
        // getDependencyGraph() now returns a defensive copy, safe from mutation
        const depGraph = this.codebaseAnalyzer.getDependencyGraph();
        const dependencies = new Map<string, string[]>();
        for (const [key, value] of depGraph) {
            // Convert Set to Array safely
            dependencies.set(key, Array.from(value));
        }

        this.projectArchitecture = {
            entryPoints: this.findEntryPoints(),
            layers: this.identifyArchitecturalLayers(),
            patterns: this.detectDesignPatterns(),
            technologies: this.detectTechnologies(),
            dependencies: dependencies,
            qualityMetrics: analysis.metrics
        };

        this.outputChannel.appendLine(`✅ Analyzed ${this.codebaseKnowledge.size} components`);
        this.outputChannel.appendLine(`📊 Average complexity: ${analysis.metrics.averageComplexity.toFixed(2)}`);
        this.outputChannel.appendLine(`🔗 Found ${analysis.metrics.circularDependencies} circular dependencies`);
    }

    /**
     * @deprecated Use CodebaseAnalyzer.analyzeFile() or analyzeText() instead
     * Extract intelligence from code - delegated to CodebaseAnalyzer
     */
    private async extractCodeIntelligence(filePath: string, content: string) {
        // Delegate to the new analyzer for backward compatibility
        // Use analyzeText when content is provided to preserve unsaved buffer analysis
        const analysis = content
            ? await this.codebaseAnalyzer.analyzeText(filePath, content)
            : await this.codebaseAnalyzer.analyzeFile(filePath);
        this.codebaseKnowledge.set(filePath, analysis.component);
    }

    /**
     * Calculate code complexity - now using AST-based analysis
     * Analyzes the file if not already analyzed
     */
    private async calculateComplexity(filePath: string): Promise<number> {
        let component = this.codebaseAnalyzer.getComponent(filePath);

        if (!component) {
            // File hasn't been analyzed yet, analyze it now
            try {
                await this.codebaseAnalyzer.analyzeFile(filePath);
                component = this.codebaseAnalyzer.getComponent(filePath);
            } catch (error) {
                this.outputChannel.appendLine(`Failed to analyze ${filePath} for complexity: ${error}`);
                return 0;
            }
        }

        return component?.complexity || 0;
    }

    /**
     * Track agent performance
     */
    trackAgentPerformance(agentId: string, task: any, success: boolean, timeSpent: number) {
        if (!this.agentPerformanceHistory.has(agentId)) {
            this.agentPerformanceHistory.set(agentId, {
                agentId: agentId,
                totalTasks: 0,
                completedTasks: 0,
                failedTasks: 0,
                averageExecutionTime: 0,
                specialization: 'general',
                qualityScore: 100,
                lastActive: new Date()
            });
        }

        const performance = this.agentPerformanceHistory.get(agentId)!;
        performance.totalTasks++;
        if (success) {
            performance.completedTasks++;
        } else {
            performance.failedTasks++;
        }
        performance.averageExecutionTime =
            (performance.averageExecutionTime * (performance.totalTasks - 1) + timeSpent) / performance.totalTasks;
        performance.lastActive = new Date();

        // Update quality score based on success rate
        const successRate = (performance.completedTasks / performance.totalTasks) * 100;
        performance.qualityScore = Math.round(successRate);

        // Determine specialization based on task type
        if (task.type) {
            performance.specialization = task.type;
        }

        this.outputChannel.appendLine(
            `📊 Updated performance for Agent ${agentId}: ${successRate.toFixed(1)}% success rate`
        );
    }

    /**
     * Predict task completion time based on history
     */
    predictTaskTime(task: any): number {
        // Look for similar tasks in history
        const similarTasks = Array.from(this.agentPerformanceHistory.values())
            .filter(p => p.specialization === task.type)
            .map(p => p.averageExecutionTime);

        if (similarTasks.length > 0) {
            return similarTasks.reduce((a, b) => a + b) / similarTasks.length;
        }

        // Default estimates based on task type
        const estimates: { [key: string]: number } = {
            feature: 120, // 2 hours
            bugfix: 60, // 1 hour
            refactor: 90, // 1.5 hours
            test: 45, // 45 minutes
            documentation: 30 // 30 minutes
        };

        return estimates[task.type] || 60;
    }

    /**
     * Identify architectural improvements
     */
    suggestArchitecturalImprovements(): string[] {
        const suggestions: string[] = [];

        // Check for circular dependencies using the analyzer
        const circularDeps = this.codebaseAnalyzer.findCircularDependencies();
        if (circularDeps.length > 0) {
            const highSeverity = circularDeps.filter((c: any) => c.severity === 'high');
            const mediumSeverity = circularDeps.filter((c: any) => c.severity === 'medium');

            if (highSeverity.length > 0) {
                suggestions.push(
                    `🔴 Critical: ${highSeverity.length} high-severity circular dependencies detected. Immediate refactoring needed.`
                );
            }
            if (mediumSeverity.length > 0) {
                suggestions.push(
                    `🟡 Warning: ${mediumSeverity.length} medium-severity circular dependencies. Consider dependency injection.`
                );
            }
        }

        // Check for high complexity using the analyzer
        const highComplexity = this.codebaseAnalyzer.findComplexComponents(20);
        if (highComplexity.length > 0) {
            const topComplex = highComplexity.slice(0, 3);
            suggestions.push(
                `📊 High complexity in ${highComplexity.length} files. Top offenders: ${topComplex.map((p: any) => path.basename(p)).join(', ')}`
            );
        }

        // Check for missing tests using the analyzer
        const untested = this.codebaseAnalyzer.findUntestedComponents();
        if (untested.length > 0) {
            const percentage = (
                ((this.codebaseKnowledge.size - untested.length) / this.codebaseKnowledge.size) *
                100
            ).toFixed(1);
            suggestions.push(`🧪 Test coverage: ${percentage}%. ${untested.length} components lack tests.`);
        }

        // Additional quality checks from metrics
        if (this.qualityMetrics) {
            if (this.qualityMetrics.averageComplexity > 15) {
                suggestions.push(
                    `⚠️ Average complexity (${this.qualityMetrics.averageComplexity.toFixed(1)}) exceeds threshold. Consider breaking down complex functions.`
                );
            }
            if (this.qualityMetrics.technicalDebt > 50) {
                suggestions.push(
                    `💸 Technical debt score: ${this.qualityMetrics.technicalDebt}. Schedule refactoring sprint.`
                );
            }
        }

        return suggestions;
    }

    /**
     * Find circular dependencies - delegated to analyzer
     */
    private findCircularDependencies(): CircularDependency[] {
        return this.codebaseAnalyzer.findCircularDependencies();
    }

    /**
     * Find components without tests - delegated to analyzer
     */
    private findUntestedComponents(): string[] {
        return this.codebaseAnalyzer.findUntestedComponents();
    }

    /**
     * Helper methods for architectural analysis
     */
    private findEntryPoints(): string[] {
        // Find common entry points
        const entryPoints: string[] = [];
        for (const [path, component] of this.codebaseKnowledge) {
            if (path.includes('index') || path.includes('main') || path.includes('app')) {
                entryPoints.push(path);
            }
        }
        return entryPoints;
    }

    private identifyArchitecturalLayers(): Map<string, string[]> {
        const layers = new Map<string, string[]>();

        // Categorize components into layers
        const presentation: string[] = [];
        const business: string[] = [];
        const data: string[] = [];
        const infrastructure: string[] = [];

        for (const [path, component] of this.codebaseKnowledge) {
            if (path.includes('view') || path.includes('component') || path.includes('ui')) {
                presentation.push(path);
            } else if (path.includes('service') || path.includes('business') || path.includes('logic')) {
                business.push(path);
            } else if (path.includes('model') || path.includes('entity') || path.includes('schema')) {
                data.push(path);
            } else if (path.includes('util') || path.includes('helper') || path.includes('config')) {
                infrastructure.push(path);
            }
        }

        if (presentation.length > 0) layers.set('presentation', presentation);
        if (business.length > 0) layers.set('business', business);
        if (data.length > 0) layers.set('data', data);
        if (infrastructure.length > 0) layers.set('infrastructure', infrastructure);

        return layers;
    }

    private detectDesignPatterns(): string[] {
        const patterns: string[] = [];

        // Detect common patterns from file/class names
        for (const [path, component] of this.codebaseKnowledge) {
            const name = path.toLowerCase();

            if (name.includes('factory')) patterns.push('Factory Pattern');
            if (name.includes('singleton')) patterns.push('Singleton Pattern');
            if (name.includes('observer')) patterns.push('Observer Pattern');
            if (name.includes('strategy')) patterns.push('Strategy Pattern');
            if (name.includes('adapter')) patterns.push('Adapter Pattern');
            if (name.includes('decorator')) patterns.push('Decorator Pattern');
        }

        return [...new Set(patterns)]; // Remove duplicates
    }

    private detectTechnologies(): string[] {
        const technologies = new Set<string>();

        // Detect technologies from imports
        for (const component of this.codebaseKnowledge.values()) {
            for (const imp of component.imports) {
                if (imp.includes('react')) technologies.add('React');
                if (imp.includes('vue')) technologies.add('Vue');
                if (imp.includes('angular')) technologies.add('Angular');
                if (imp.includes('express')) technologies.add('Express');
                if (imp.includes('vscode')) technologies.add('VS Code API');
                if (imp.includes('typescript')) technologies.add('TypeScript');
            }
        }

        return Array.from(technologies);
    }

    /**
     * Dispose of all resources and cleanup
     */
    public dispose(): void {
        this.isDisposed = true;

        // Clear all monitoring intervals
        this.monitoringIntervals.forEach(intervalId => clearInterval(intervalId));
        this.monitoringIntervals.clear();

        // Dispose all event subscriptions
        this.eventSubscriptions.forEach(subscription => subscription.dispose());
        this.eventSubscriptions = [];

        // Clear reassignment tracking
        this.reassignmentHistory.clear();
        this.taskAssignmentMap.clear();
        this.agentTasksMap.clear();
        this.failedAgents.clear();

        // Dispose terminal if exists
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = undefined;
        }

        // Dispose output channel
        if (this.outputChannel) {
            this.outputChannel.dispose();
        }

        // Clear data structures
        this.codebaseKnowledge.clear();
        this.agentPerformanceHistory.clear();

        // Dispose template manager
        if (this.agentTemplateManager) {
            this.agentTemplateManager.dispose();
        }
    }
}
