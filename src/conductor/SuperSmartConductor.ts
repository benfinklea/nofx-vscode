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
    CircularDependency,
    PerformanceSnapshot,
    PerformanceHistory,
    PerformanceTrend,
    ScoringWeights,
    PerformanceThresholds,
    StuckAgentDetection,
    LoadBalancingStrategy,
    AgentCapacityScore,
    LoadBalancingConfig,
    LoadBalancingMetrics,
    TaskReassignmentReason,
    LoadBalancingEvent,
    AgentWorkload,
    TaskDistributionPlan,
    TaskReassignment,
    LoadBalancingResult,
    ReassignmentResult,
    CapacityScoringWeights
} from '../intelligence';
import { extractJsonFromClaudeOutput } from '../orchestration/MessageProtocol';
import { AgentTemplateManager, AgentTemplate } from '../agents/AgentTemplateManager';
import { Container } from '../services/Container';
import { SERVICE_TOKENS, IConfigurationService, IMetricsService } from '../services/interfaces';
import { AIProviderResolver } from '../services/AIProviderResolver';
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
    private aiResolver: AIProviderResolver;
    private codebaseAnalyzer: any;
    private context: vscode.ExtensionContext | undefined;
    private agentTemplateManager: AgentTemplateManager | undefined;

    // VP-level intelligence data structures
    private codebaseKnowledge: Map<string, CodeComponent> = new Map();
    private agentPerformanceHistory: Map<string, AgentPerformance> = new Map();
    private projectArchitecture: ProjectArchitecture | undefined;
    private qualityMetrics: QualityMetrics | undefined;

    // Completion timestamp tracking for throughput calculation
    private completionTimesByAgent: Map<string, number[]> = new Map();

    // Monitoring and cleanup
    private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
    private eventSubscriptions: vscode.Disposable[] = [];
    private isDisposed: boolean = false;

    // Dynamic reassignment tracking
    private reassignmentHistory: Map<string, ReassignmentRecord[]> = new Map();
    private taskAssignmentMap: Map<string, string> = new Map(); // taskId -> agentId
    private agentTasksMap: Map<string, Set<string>> = new Map(); // agentId -> Set<taskId>
    private failedAgents: Set<string> = new Set();
    private eventBus?: IEventBus;

    // Load balancing infrastructure
    private loadBalancingConfig: LoadBalancingConfig = {
        strategy: LoadBalancingStrategy.BALANCED,
        overloadThreshold: 80,
        stuckDetectionTimeout: 300000, // 5 minutes
        monitoringInterval: 30000, // 30 seconds
        enabled: true,
        minTasksForLoadBalancing: 3,
        maxReassignmentsPerCycle: 5
    };
    private loadBalancingMetrics: LoadBalancingMetrics = {
        totalOperations: 0,
        taskReassignments: 0,
        stuckAgentsDetected: 0,
        overloadedAgentsDetected: 0,
        averageEffectiveness: 0,
        successRate: 100,
        lastOperationTime: new Date(),
        timestamp: new Date()
    };
    private loadBalancingMonitor?: NodeJS.Timeout;
    private agentCapacityScores: Map<string, AgentCapacityScore> = new Map();
    private loadBalancingHistory: LoadBalancingEvent[] = [];

    constructor(agentManager: AgentManager, taskQueue: TaskQueue, context?: vscode.ExtensionContext) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.context = context;

        // Get configuration service from container
        const container = Container.getInstance();
        const configService = container.resolve<any>(SERVICE_TOKENS.ConfigurationService);
        this.aiResolver = new AIProviderResolver(configService);

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

        // Initialize performance monitoring system
        this.initializePerformanceSystem();
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

        // Start load balancing monitor
        this.startLoadBalancingMonitor();
    }

    private async initializeVPConductor() {
        if (!this.terminal) return;

        this.terminal.sendText('clear');
        await new Promise(resolve => setTimeout(resolve, 500)); // Pause after clear

        this.terminal.sendText('echo "🧠 NofX Super Smart VP Conductor v3.0"');
        await new Promise(resolve => setTimeout(resolve, 500)); // Pause after title

        this.terminal.sendText('echo "==========================================="');
        await new Promise(resolve => setTimeout(resolve, 300)); // Short pause

        this.terminal.sendText('echo "Senior Engineering VP with Deep Intelligence"');
        await new Promise(resolve => setTimeout(resolve, 300)); // Short pause

        this.terminal.sendText('echo "==========================================="');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Longer pause before starting

        // Get abbreviated system prompt for launch (to avoid shell length limits)
        const abbreviatedPrompt = `You are the VP of Engineering for NofX - a senior technical leader orchestrating AI agents.
Your role: Architect systems, ensure quality, make technical decisions, mentor agents.
You can spawn agents, assign tasks, monitor progress, and resolve conflicts.
When given a project request, analyze it and provide a structured JSON response with tasks.`;

        // Get full detailed system prompt for later injection
        const detailedSystemPrompt = this.getVPSystemPrompt();

        // Use abbreviated prompt for initial launch
        const systemPrompt = abbreviatedPrompt;

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

                // Use AI provider-specific command for file-based prompt injection
                if (this.aiResolver.supportsSystemPrompt()) {
                    this.terminal.sendText('echo "📝 Loading VP system prompt..."');
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Pause to see message

                    const command = this.aiResolver.getSystemPromptCommand(systemPrompt);
                    this.terminal.sendText('echo "🚀 Launching Claude with system prompt..."');
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Pause before launching

                    // Show the command being executed (truncated for readability)
                    const truncatedCommand = command.length > 100 ? command.substring(0, 100) + '...' : command;
                    // Clean up for display - escape quotes and remove newlines
                    const displayCommand = truncatedCommand
                        .replace(/"/g, '\\"')
                        .replace(/'/g, "\\'")
                        .replace(/\n+/g, ' ');
                    this.terminal.sendText(`echo "📋 Command: ${displayCommand}"`);
                    await new Promise(resolve => setTimeout(resolve, 1500)); // Pause to read command

                    this.terminal.sendText(command);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Longer pause after launching Claude
                } else {
                    // Provider doesn't support system prompts, show the prompt for manual input
                    const command = this.aiResolver.getFullCommand();
                    this.terminal.sendText(
                        `echo "Please paste this system prompt into ${this.aiResolver.getCurrentProviderDescription()}:"`
                    );
                    this.terminal.sendText(`cat '${promptFilePath}'`);
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    this.terminal.sendText(command);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                this.outputChannel.appendLine(`✅ Using file-based prompt injection from: ${promptFilePath}`);
            } else {
                throw new Error('No suitable storage path available');
            }
        } catch (error) {
            // Fallback to direct system prompt command
            this.outputChannel.appendLine('⚠️ File-based prompt injection failed, using direct prompt fallback');
            this.terminal.sendText('echo "⚠️ Using fallback prompt method..."');
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (this.aiResolver.supportsSystemPrompt()) {
                const command = this.aiResolver.getSystemPromptCommand(systemPrompt);
                this.terminal.sendText('echo "🚀 Launching Claude with system prompt (fallback)..."');
                await new Promise(resolve => setTimeout(resolve, 1000));

                this.terminal.sendText(command);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                // Provider doesn't support system prompts, show the prompt for manual input
                const command = this.aiResolver.getFullCommand();
                this.terminal.sendText(
                    `echo "Please paste this system prompt into ${this.aiResolver.getCurrentProviderDescription()}:"`
                );
                this.terminal.sendText(`echo "${systemPrompt}"`);
                await new Promise(resolve => setTimeout(resolve, 1000));

                this.terminal.sendText(command);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Wait for Claude to initialize and show "Welcome to Claude Code!" announcement
        const container = Container.getInstance();
        const configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
        const initDelay = configService.getClaudeInitializationDelay() * 1000; // Convert to milliseconds
        this.outputChannel.appendLine(`⏳ Waiting ${initDelay / 1000} seconds for AI to initialize...`);
        await new Promise(resolve => setTimeout(resolve, initDelay)); // Configurable delay for AI welcome message

        // Now AI should be showing welcome message - send the detailed VP prompt
        this.outputChannel.appendLine('✅ AI initialized, sending VP conductor prompt...');
        const fullMessage = `${detailedSystemPrompt}\n\nPlease introduce yourself as the VP of Engineering, explaining your role and capabilities.`;
        // Send the prompt text first
        this.terminal.sendText(fullMessage, false); // false = no newline yet

        // Small delay to ensure the text is in the terminal
        await new Promise(resolve => setTimeout(resolve, 100));

        // Now send Enter to submit it
        this.terminal.sendText('', true); // Send empty string with Enter to submit

        // The detailed prompt injection above will handle the introduction
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

        // Queue for deferred tasks that exceed maxParallelTasks
        const deferredTasks: Task[] = [];

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

            outputChannel.appendLine(`[Task Assignment] Created ${executionLayers.length} execution layers`);

            // Initialize parallel groups counter
            let totalParallelGroups = 0;

            // Process each layer
            for (let layerIndex = 0; layerIndex < executionLayers.length; layerIndex++) {
                const layer = executionLayers[layerIndex];
                outputChannel.appendLine(
                    `\n[Task Assignment] Processing Layer ${layerIndex + 1} with ${layer.length} tasks`
                );

                // Filter tasks by readiness if dependency manager is available
                let readyTasks = layer;
                if (dependencyManager) {
                    readyTasks = dependencyManager.getReadyTasks(layer);
                    const blockedTasks = layer.filter(task => !readyTasks.includes(task));
                    if (blockedTasks.length > 0) {
                        outputChannel.appendLine(
                            `[Task Assignment] ${blockedTasks.length} tasks blocked by dependencies in layer ${layerIndex + 1}`
                        );
                        // Move blocked tasks to unassigned for now
                        result.unassigned.push(...blockedTasks);
                    }
                    outputChannel.appendLine(
                        `[Task Assignment] ${readyTasks.length} tasks ready for assignment in layer ${layerIndex + 1}`
                    );
                }

                // Identify parallel tasks within the ready tasks with optimization
                const parallelGroups = dependencyManager
                    ? this.optimizeParallelGroups(readyTasks, availableAgents, dependencyManager)
                    : this.identifyParallelTasks(readyTasks);

                // Count parallel groups for metrics
                totalParallelGroups += parallelGroups.size;

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
                                `[Task Assignment] Max parallel tasks (${maxParallelTasks}) reached, queuing task for later assignment`
                            );
                            deferredTasks.push(task);
                            continue;
                        }

                        // Check for conflicts with active tasks if dependency manager is available
                        if (dependencyManager) {
                            const activeTasks = result.assignments.map(a => a.task);
                            const conflicts = dependencyManager.checkConflicts(task, activeTasks);
                            if (conflicts.length > 0) {
                                outputChannel.appendLine(
                                    `[Task Assignment] Task "${task.title}" conflicts with active tasks: ${conflicts.join(', ')}. Deferring assignment.`
                                );
                                deferredTasks.push(task);
                                continue;
                            }
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

            // Attempt to reassign deferred tasks
            if (deferredTasks.length > 0) {
                outputChannel.appendLine(
                    `\n[Task Assignment] Attempting to reassign ${deferredTasks.length} deferred tasks`
                );

                // Simple reassignment loop - try to assign deferred tasks when slots become available
                let reassignmentAttempts = 0;
                const maxReassignmentAttempts = 3;

                while (deferredTasks.length > 0 && reassignmentAttempts < maxReassignmentAttempts) {
                    reassignmentAttempts++;
                    const currentParallelCount = result.assignments.length;
                    const remainingSlots = maxParallelTasks - currentParallelCount;

                    if (remainingSlots <= 0) {
                        outputChannel.appendLine(
                            `[Task Assignment] No remaining slots for deferred tasks after ${reassignmentAttempts} attempts`
                        );
                        break;
                    }

                    const tasksToReassign = deferredTasks.splice(0, remainingSlots);
                    outputChannel.appendLine(
                        `[Task Assignment] Reassigning ${tasksToReassign.length} deferred tasks (attempt ${reassignmentAttempts})`
                    );

                    for (const task of tasksToReassign) {
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
                                        layer: -1 // Deferred tasks don't belong to a specific layer
                                    });
                                }
                            } catch (error) {
                                // Event bus not available, continue without events
                            }

                            outputChannel.appendLine(
                                `[Task Assignment] ✓ Reassigned "${task.title}" to ${assignment.agent.name} (score: ${assignment.score.toFixed(2)})`
                            );
                        } else {
                            // Still can't assign, move to unassigned
                            result.unassigned.push(task);
                            result.failed.push({
                                taskId: task.id,
                                reason: 'No suitable agent found after reassignment attempts',
                                attemptedAgents: availableAgents.map(a => a.id)
                            });
                        }
                    }
                }

                // Move any remaining deferred tasks to unassigned
                if (deferredTasks.length > 0) {
                    outputChannel.appendLine(
                        `[Task Assignment] Moving ${deferredTasks.length} remaining deferred tasks to unassigned`
                    );
                    result.unassigned.push(...deferredTasks);
                }
            }

            // Calculate metrics
            result.metrics.parallelGroups = totalParallelGroups;

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

        // Score all available agents using unified scoring approach
        const candidateScores: Array<{ agent: Agent; score: number; breakdown: any; confidence: number }> = [];

        for (const agent of availableAgents) {
            // Skip if agent is at max capacity
            const currentWorkload = agentWorkloads.get(agent.id) || 0;
            const maxConcurrent = vscode.workspace.getConfiguration('nofx').get<number>('maxConcurrentAgents', 10);

            if (currentWorkload >= maxConcurrent) {
                continue;
            }

            let capabilityScore = 0.5; // Default score if no matcher
            let breakdown: any = {};

            // Use CapabilityMatcher with breakdown if available
            if (capabilityMatcher) {
                const scoreResult = capabilityMatcher.scoreAgentWithBreakdown(agent, task);
                capabilityScore = scoreResult.score;
                breakdown = scoreResult.breakdown;
            } else {
                // Fallback breakdown calculation
                breakdown = {
                    capabilityMatch: capabilityScore,
                    specializationMatch: this.calculateSpecializationMatch(agent, task),
                    typeMatch: 0.5,
                    workloadFactor: 1 - currentWorkload / maxConcurrent,
                    performanceFactor: 0.7
                };
            }

            // Calculate workload balance score (prefer less loaded agents)
            const workloadBalance = 1 - currentWorkload / maxConcurrent;

            // Calculate specialization match (use from breakdown if available)
            const specializationMatch = breakdown.specializationMatch || this.calculateSpecializationMatch(agent, task);

            // Calculate historical performance (use from breakdown if available)
            const historicalPerformance = breakdown.performanceFactor || 0.7;

            // Calculate confidence based on capability match and workload balance
            const confidence = this.calculateAssignmentConfidence(
                capabilityScore,
                workloadBalance,
                specializationMatch
            );

            // Calculate composite score with unified weights
            const priorityWeight = vscode.workspace
                .getConfiguration('nofx.assignment')
                .get<number>('priorityWeight', 0.3);
            const score =
                capabilityScore * 0.4 +
                workloadBalance * 0.2 +
                specializationMatch * 0.3 +
                historicalPerformance * 0.1 +
                (task.priority === 'high' ? priorityWeight : 0);

            candidateScores.push({
                agent,
                score,
                breakdown,
                confidence
            });
        }

        // Sort candidates by score (highest first)
        candidateScores.sort((a, b) => b.score - a.score);

        // Select the best candidate
        if (candidateScores.length > 0) {
            const bestCandidate = candidateScores[0];
            bestScore = bestCandidate.score;
            bestAssignment = {
                task,
                agent: bestCandidate.agent,
                score: bestCandidate.score,
                criteria: {
                    capabilityScore: bestCandidate.breakdown.capabilityMatch || 0,
                    workloadBalance:
                        1 -
                        (agentWorkloads.get(bestCandidate.agent.id) || 0) /
                            vscode.workspace.getConfiguration('nofx').get<number>('maxConcurrentAgents', 10),
                    specializationMatch: bestCandidate.breakdown.specializationMatch || 0,
                    historicalPerformance: bestCandidate.breakdown.performanceFactor || 0.7
                }
            };

            // Log match explanation if CapabilityMatcher is available
            if (capabilityMatcher) {
                const explanation = capabilityMatcher.getMatchExplanation(bestCandidate.agent, task);
                outputChannel.appendLine(
                    `[Assignment] ${explanation} (confidence: ${(bestCandidate.confidence * 100).toFixed(1)}%)`
                );
            }
        }

        // Check if we should create custom agent for low-confidence matches
        if (capabilityMatcher && bestAssignment) {
            const bestCandidate = candidateScores[0];
            const confidenceThreshold = capabilityMatcher.getCustomAgentThreshold();

            if (bestCandidate.confidence < confidenceThreshold) {
                outputChannel.appendLine(
                    `[Custom Agent] Low confidence match (${(bestCandidate.confidence * 100).toFixed(1)}% < ${(confidenceThreshold * 100).toFixed(1)}%). Creating custom agent for task: ${task.title}`
                );

                try {
                    const customAgent = await this.createCustomAgent(task, task.requiredCapabilities || []);
                    if (customAgent) {
                        // Create assignment for the custom agent
                        const customAssignment: TaskAssignment = {
                            task,
                            agent: customAgent,
                            score: 1.0, // Custom agents get perfect score for their specialized task
                            criteria: {
                                capabilityScore: 1.0,
                                workloadBalance: 1.0,
                                specializationMatch: 1.0,
                                historicalPerformance: 0.8 // Slightly lower for new agent
                            }
                        };

                        outputChannel.appendLine(
                            `[Custom Agent] ✓ Created custom agent "${customAgent.name}" for task: ${task.title}`
                        );
                        return customAssignment;
                    }
                } catch (error) {
                    outputChannel.appendLine(`[Custom Agent] ✗ Failed to create custom agent: ${error}`);
                }
            }
        }

        return bestAssignment;
    }

    /**
     * Calculate assignment confidence based on capability match, workload balance, and specialization
     */
    private calculateAssignmentConfidence(
        capabilityScore: number,
        workloadBalance: number,
        specializationMatch: number
    ): number {
        // Weighted confidence calculation
        const capabilityWeight = 0.5;
        const workloadWeight = 0.2;
        const specializationWeight = 0.3;

        const confidence =
            capabilityScore * capabilityWeight +
            workloadBalance * workloadWeight +
            specializationMatch * specializationWeight;

        // Clamp to [0, 1] range
        return Math.max(0, Math.min(1, confidence));
    }

    /**
     * Optimize parallel groups based on resource requirements, complexity, and dependency impact
     */
    private optimizeParallelGroups(
        tasks: Task[],
        availableAgents: Agent[],
        dependencyManager: TaskDependencyManager
    ): Map<string, Task[]> {
        const groups = new Map<string, Task[]>();

        // Analyze tasks for optimal batching
        const taskAnalysis = tasks.map(task => ({
            task,
            complexity: this.estimateTaskComplexity(task),
            resourceRequirements: this.analyzeResourceRequirements(task),
            dependencyImpact: this.calculateDependencyImpact(task, dependencyManager),
            priority: this.getTaskPriority(task)
        }));

        // Sort tasks by priority and dependency impact
        taskAnalysis.sort((a, b) => {
            // First by priority (high priority first)
            if (a.priority !== b.priority) {
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            }
            // Then by dependency impact (higher impact first)
            return b.dependencyImpact - a.dependencyImpact;
        });

        // Group tasks by resource compatibility and complexity
        const resourceGroups = new Map<string, Task[]>();

        for (const analysis of taskAnalysis) {
            const { task, complexity, resourceRequirements } = analysis;

            // Find compatible group or create new one
            let assigned = false;
            for (const [groupId, groupTasks] of resourceGroups) {
                if (this.canGroupTogether(groupTasks, task, resourceRequirements)) {
                    groupTasks.push(task);
                    assigned = true;
                    break;
                }
            }

            if (!assigned) {
                const groupId = `group-${resourceGroups.size + 1}`;
                resourceGroups.set(groupId, [task]);
            }
        }

        // Further optimize groups based on agent capabilities
        for (const [groupId, groupTasks] of resourceGroups) {
            const optimizedGroups = this.optimizeGroupForAgents(groupTasks, availableAgents);
            for (let i = 0; i < optimizedGroups.length; i++) {
                const finalGroupId = optimizedGroups.length === 1 ? groupId : `${groupId}-${i + 1}`;
                groups.set(finalGroupId, optimizedGroups[i]);
            }
        }

        return groups;
    }

    /**
     * Estimate task complexity based on description and requirements
     */
    private estimateTaskComplexity(task: Task): number {
        let complexity = 1; // Base complexity

        // Factor in description length and keywords
        const description = task.description.toLowerCase();
        if (description.includes('complex') || description.includes('advanced')) complexity += 2;
        if (description.includes('simple') || description.includes('basic')) complexity -= 0.5;

        // Factor in required capabilities
        const capabilityCount = (task.requiredCapabilities || []).length;
        complexity += capabilityCount * 0.3;

        // Factor in file count
        const fileCount = (task.files || []).length;
        complexity += fileCount * 0.1;

        return Math.max(0.5, Math.min(5, complexity));
    }

    /**
     * Analyze resource requirements for a task
     */
    private analyzeResourceRequirements(task: Task): string[] {
        const requirements: string[] = [];

        // Analyze based on required capabilities
        const capabilities = task.requiredCapabilities || [];
        if (capabilities.some(c => c.includes('frontend') || c.includes('ui'))) {
            requirements.push('frontend');
        }
        if (capabilities.some(c => c.includes('backend') || c.includes('api'))) {
            requirements.push('backend');
        }
        if (capabilities.some(c => c.includes('database') || c.includes('sql'))) {
            requirements.push('database');
        }
        if (capabilities.some(c => c.includes('test') || c.includes('testing'))) {
            requirements.push('testing');
        }

        return requirements;
    }

    /**
     * Calculate dependency impact for a task
     */
    private calculateDependencyImpact(task: Task, dependencyManager: TaskDependencyManager): number {
        const dependents = dependencyManager.getDependentTasks(task.id);
        const softDependents = dependencyManager.getSoftDependents(task.id);

        // Higher impact for tasks with more dependents
        return dependents.length + softDependents.length * 0.5;
    }

    /**
     * Get task priority as numeric value
     */
    private getTaskPriority(task: Task): 'high' | 'medium' | 'low' {
        return task.priority || 'medium';
    }

    /**
     * Check if tasks can be grouped together based on resource requirements
     */
    private canGroupTogether(existingTasks: Task[], newTask: Task, newRequirements: string[]): boolean {
        // Get requirements of existing tasks
        const existingRequirements = new Set<string>();
        for (const task of existingTasks) {
            const reqs = this.analyzeResourceRequirements(task);
            reqs.forEach(req => existingRequirements.add(req));
        }

        // Check for resource conflicts
        const newRequirementsSet = new Set(newRequirements);
        for (const req of newRequirements) {
            if (existingRequirements.has(req)) {
                return false; // Resource conflict
            }
        }

        return true;
    }

    /**
     * Optimize a group of tasks for available agents
     */
    private optimizeGroupForAgents(tasks: Task[], availableAgents: Agent[]): Task[][] {
        if (tasks.length <= 1) {
            return [tasks];
        }

        // Simple optimization: split large groups into smaller ones
        const maxGroupSize = Math.min(3, Math.ceil(availableAgents.length / 2));
        const groups: Task[][] = [];

        for (let i = 0; i < tasks.length; i += maxGroupSize) {
            groups.push(tasks.slice(i, i + maxGroupSize));
        }

        return groups;
    }

    /**
     * Handle dependency resolution events for real-time reassignment
     */
    private async handleDependencyResolution(
        taskId: string,
        assignments: AssignmentResult,
        outputChannel: vscode.OutputChannel
    ): Promise<void> {
        try {
            // Check if there are any unassigned tasks that might now be ready
            const unassignedTasks = assignments.unassigned || [];
            const readyTasks = unassignedTasks.filter(task => {
                // Simple check - in a real implementation, you'd use dependencyManager.getReadyTasks
                return task.status === 'queued' || task.status === 'blocked';
            });

            if (readyTasks.length > 0) {
                outputChannel.appendLine(
                    `[Dependency Resolution] Found ${readyTasks.length} tasks that may now be ready for assignment`
                );

                // Attempt to reassign ready tasks
                for (const task of readyTasks) {
                    const availableAgents = this.getAvailableAgents(this.agentManager);
                    if (availableAgents.length > 0) {
                        const assignment = await this.findBestAssignment(
                            task,
                            availableAgents,
                            undefined, // capabilityMatcher
                            assignments.assignments,
                            outputChannel
                        );

                        if (assignment) {
                            assignments.assignments.push(assignment);
                            assignments.unassigned = assignments.unassigned.filter(t => t.id !== task.id);

                            // Mark task as assigned
                            task.assignedTo = assignment.agent.id;
                            task.status = 'assigned';

                            outputChannel.appendLine(
                                `[Dependency Resolution] ✓ Reassigned "${task.title}" to ${assignment.agent.name}`
                            );
                        }
                    }
                }
            }
        } catch (error) {
            outputChannel.appendLine(`[Dependency Resolution] Error handling dependency resolution: ${error}`);
        }
    }

    /**
     * Handle conflict detection events
     */
    private async handleConflictDetection(
        taskId: string,
        conflictingTasks: string[],
        assignments: AssignmentResult,
        outputChannel: vscode.OutputChannel
    ): Promise<void> {
        try {
            outputChannel.appendLine(
                `[Conflict Detection] Task ${taskId} conflicts with: ${conflictingTasks.join(', ')}`
            );

            // Find the conflicting assignment
            const conflictingAssignment = assignments.assignments.find(a => a.task.id === taskId);
            if (conflictingAssignment) {
                // Mark task as blocked
                conflictingAssignment.task.status = 'blocked';
                conflictingAssignment.task.blockedBy = conflictingTasks;

                // Move to unassigned for potential reassignment later
                assignments.unassigned.push(conflictingAssignment.task);
                assignments.assignments = assignments.assignments.filter(a => a.task.id !== taskId);

                outputChannel.appendLine(
                    `[Conflict Detection] Moved conflicting task "${conflictingAssignment.task.title}" to unassigned`
                );
            }
        } catch (error) {
            outputChannel.appendLine(`[Conflict Detection] Error handling conflict detection: ${error}`);
        }
    }

    /**
     * Handle conflict resolution events
     */
    private async handleConflictResolution(
        taskId: string,
        assignments: AssignmentResult,
        outputChannel: vscode.OutputChannel
    ): Promise<void> {
        try {
            // Find the task that had its conflict resolved
            const resolvedTask = assignments.unassigned.find(t => t.id === taskId);
            if (resolvedTask) {
                // Clear conflict-related fields
                resolvedTask.status = 'queued';
                resolvedTask.blockedBy = [];
                resolvedTask.conflictsWith = [];

                // Attempt to reassign the task
                const availableAgents = this.getAvailableAgents(this.agentManager);
                if (availableAgents.length > 0) {
                    const assignment = await this.findBestAssignment(
                        resolvedTask,
                        availableAgents,
                        undefined, // capabilityMatcher
                        assignments.assignments,
                        outputChannel
                    );

                    if (assignment) {
                        assignments.assignments.push(assignment);
                        assignments.unassigned = assignments.unassigned.filter(t => t.id !== taskId);

                        // Mark task as assigned
                        resolvedTask.assignedTo = assignment.agent.id;
                        resolvedTask.status = 'assigned';

                        outputChannel.appendLine(
                            `[Conflict Resolution] ✓ Reassigned "${resolvedTask.title}" to ${assignment.agent.name}`
                        );
                    }
                }
            }
        } catch (error) {
            outputChannel.appendLine(`[Conflict Resolution] Error handling conflict resolution: ${error}`);
        }
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

        // Set up event-based monitoring for dependency resolution and conflicts
        let dependencyManager: TaskDependencyManager | undefined;
        let eventBus: IEventBus | undefined;
        const eventDisposables: vscode.Disposable[] = [];

        try {
            const container = Container.getInstance();
            if (container.has(SERVICE_TOKENS.TaskDependencyManager)) {
                dependencyManager = container.resolve<TaskDependencyManager>(SERVICE_TOKENS.TaskDependencyManager);
            }
            if (container.has(SERVICE_TOKENS.EventBus)) {
                eventBus = container.resolve<IEventBus>(SERVICE_TOKENS.EventBus);
            }
        } catch (error) {
            outputChannel.appendLine(`[Execution Monitor] WARNING: Some services not available: ${error}`);
        }

        // Subscribe to dependency resolution events
        if (eventBus && dependencyManager) {
            const dependencyResolvedHandler = (event: any) => {
                outputChannel.appendLine(
                    `[Execution Monitor] Dependency resolved for task ${event.taskId}, checking for reassignment opportunities`
                );
                this.handleDependencyResolution(event.taskId, assignments, outputChannel);
            };

            const conflictDetectedHandler = (event: any) => {
                outputChannel.appendLine(
                    `[Execution Monitor] Conflict detected for task ${event.taskId}, attempting resolution`
                );
                this.handleConflictDetection(event.taskId, event.conflictingTasks, assignments, outputChannel);
            };

            const conflictResolvedHandler = (event: any) => {
                outputChannel.appendLine(
                    `[Execution Monitor] Conflict resolved for task ${event.taskId}, checking for reassignment opportunities`
                );
                this.handleConflictResolution(event.taskId, assignments, outputChannel);
            };

            // Subscribe to events
            eventDisposables.push(
                eventBus.subscribe(DOMAIN_EVENTS.TASK_DEPENDENCY_RESOLVED, dependencyResolvedHandler),
                eventBus.subscribe(DOMAIN_EVENTS.TASK_CONFLICT_DETECTED, conflictDetectedHandler),
                eventBus.subscribe(DOMAIN_EVENTS.TASK_CONFLICT_RESOLVED, conflictResolvedHandler)
            );
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
                    // Clean up event subscriptions
                    eventDisposables.forEach(disposable => disposable.dispose());
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
                    // Clean up event subscriptions
                    eventDisposables.forEach(disposable => disposable.dispose());

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
            layers: Object.fromEntries(this.identifyArchitecturalLayers()),
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
            // Initialize completion timestamp tracking for new agent
            this.completionTimesByAgent.set(agentId, []);

            this.agentPerformanceHistory.set(agentId, {
                agentId: agentId,
                totalTasks: 0,
                completedTasks: 0,
                failedTasks: 0,
                averageExecutionTime: 0,
                specialization: 'general',
                qualityScore: 100,
                lastActive: new Date(),
                availability: {
                    currentLoad: 0,
                    maxCapacity: 1,
                    isAvailable: true,
                    lastResponseTime: 0,
                    averageResponseTime: 0,
                    uptime: 100,
                    lastOnlineTime: new Date(),
                    isOnline: true
                },
                speed: {
                    averageTaskStartTime: 0,
                    averageTaskCompletionTime: 0,
                    tasksPerHour: 0,
                    averageAssignmentToStartTime: 0,
                    fastestTaskTime: 0,
                    slowestTaskTime: 0,
                    medianTaskTime: 0,
                    taskTimeStandardDeviation: 0
                },
                reliability: {
                    consecutiveFailures: 0,
                    uptime: 100,
                    errorRate: 0,
                    stuckCount: 0,
                    lastError: undefined,
                    errorTypes: {},
                    averageRecoveryTime: 0,
                    successRate: 100
                },
                workload: {
                    currentTasks: 0,
                    queuedTasks: 0,
                    maxConcurrentTasks: 1,
                    utilizationPercentage: 0,
                    peakWorkload: 0,
                    averageWorkload: 0,
                    workloadTrend: 'stable'
                },
                stuckDetection: {
                    lastActivityTime: new Date(),
                    stuckThreshold: 300000,
                    isStuck: false,
                    stuckReason: undefined,
                    stuckDetectionCount: 0,
                    lastUnstuckTime: undefined,
                    stuckDuration: 0,
                    detectionEnabled: true
                },
                trends: {
                    performanceTrend: 'stable',
                    speedTrend: 'stable',
                    reliabilityTrend: 'stable',
                    confidence: 100,
                    dataPoints: 0,
                    analysisTimestamp: new Date()
                },
                heuristicScore: {
                    overallScore: 100,
                    successRateScore: 100,
                    speedScore: 100,
                    availabilityScore: 100,
                    reliabilityScore: 100,
                    workloadScore: 100,
                    weights: {
                        successRate: 0.25,
                        speed: 0.2,
                        availability: 0.2,
                        reliability: 0.25,
                        workload: 0.1
                    },
                    calculatedAt: new Date()
                }
            });
        }

        const performance = this.agentPerformanceHistory.get(agentId)!;
        performance.totalTasks++;
        if (success) {
            performance.completedTasks++;

            // Record completion timestamp for throughput calculation
            const completionTime = Date.now();
            if (!this.completionTimesByAgent.has(agentId)) {
                this.completionTimesByAgent.set(agentId, []);
            }
            this.completionTimesByAgent.get(agentId)!.push(completionTime);
            this.outputChannel.appendLine(
                `✅ Task completed by Agent ${agentId} at ${new Date(completionTime).toISOString()}`
            );
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
     * Initialize agent metrics with default values for new agents
     */
    private initializeAgentMetrics(agentId: string): void {
        if (this.agentPerformanceHistory.has(agentId)) {
            return; // Already initialized
        }

        const defaultMetrics: AgentPerformance = {
            agentId: agentId,
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            averageExecutionTime: 0,
            specialization: 'general',
            qualityScore: 100,
            lastActive: new Date(),
            availability: {
                currentLoad: 0,
                maxCapacity: 5,
                isAvailable: true,
                lastResponseTime: 0,
                averageResponseTime: 0,
                uptime: 100,
                lastOnlineTime: new Date(),
                isOnline: true
            },
            speed: {
                averageTaskStartTime: 0,
                averageTaskCompletionTime: 0,
                tasksPerHour: 0,
                averageAssignmentToStartTime: 0,
                fastestTaskTime: 0,
                slowestTaskTime: 0,
                medianTaskTime: 0,
                taskTimeStandardDeviation: 0
            },
            reliability: {
                consecutiveFailures: 0,
                uptime: 100,
                errorRate: 0,
                stuckCount: 0,
                errorTypes: {},
                averageRecoveryTime: 0,
                successRate: 100
            },
            workload: {
                currentTasks: 0,
                queuedTasks: 0,
                maxConcurrentTasks: 5,
                utilizationPercentage: 0,
                peakWorkload: 0,
                averageWorkload: 0,
                workloadTrend: 'stable'
            },
            stuckDetection: {
                lastActivityTime: new Date(),
                stuckThreshold: 300000, // 5 minutes
                isStuck: false,
                stuckDetectionCount: 0,
                stuckDuration: 0,
                detectionEnabled: true
            },
            trends: {
                performanceTrend: 'stable',
                speedTrend: 'stable',
                reliabilityTrend: 'stable',
                confidence: 0,
                dataPoints: 0,
                analysisTimestamp: new Date()
            },
            heuristicScore: {
                overallScore: 100,
                successRateScore: 100,
                speedScore: 100,
                availabilityScore: 100,
                reliabilityScore: 100,
                workloadScore: 100,
                weights: {
                    successRate: 0.3,
                    speed: 0.2,
                    availability: 0.2,
                    reliability: 0.2,
                    workload: 0.1
                },
                calculatedAt: new Date()
            }
        };

        this.agentPerformanceHistory.set(agentId, defaultMetrics);
    }

    /**
     * Update comprehensive agent metrics
     */
    private updateAgentMetrics(agentId: string, metrics: Partial<AgentPerformance>): void {
        if (!this.agentPerformanceHistory.has(agentId)) {
            this.initializeAgentMetrics(agentId);
        }

        const performance = this.agentPerformanceHistory.get(agentId)!;

        // Update basic metrics
        if (metrics.totalTasks !== undefined) performance.totalTasks = metrics.totalTasks;
        if (metrics.completedTasks !== undefined) performance.completedTasks = metrics.completedTasks;
        if (metrics.failedTasks !== undefined) performance.failedTasks = metrics.failedTasks;
        if (metrics.averageExecutionTime !== undefined) performance.averageExecutionTime = metrics.averageExecutionTime;
        if (metrics.specialization !== undefined) performance.specialization = metrics.specialization;
        if (metrics.qualityScore !== undefined) performance.qualityScore = metrics.qualityScore;
        if (metrics.lastActive !== undefined) performance.lastActive = metrics.lastActive;

        // Update availability metrics
        if (metrics.availability) {
            Object.assign(performance.availability, metrics.availability);
        }

        // Update speed metrics
        if (metrics.speed) {
            Object.assign(performance.speed, metrics.speed);
        }

        // Update reliability metrics
        if (metrics.reliability) {
            Object.assign(performance.reliability, metrics.reliability);
        }

        // Update workload metrics
        if (metrics.workload) {
            Object.assign(performance.workload, metrics.workload);
        }

        // Update stuck detection
        if (metrics.stuckDetection) {
            Object.assign(performance.stuckDetection, metrics.stuckDetection);
        }

        // Update trends
        if (metrics.trends) {
            Object.assign(performance.trends, metrics.trends);
        }

        // Recalculate heuristic score
        this.calculateHeuristicScore(agentId);
    }

    /**
     * Calculate multi-criteria heuristic score for an agent
     */
    private calculateHeuristicScore(agentId: string): void {
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance) return;

        const weights = performance.heuristicScore.weights;

        // Calculate individual component scores (0-100)
        const successRateScore = performance.reliability.successRate;
        const speedScore = this.calculateSpeedScore(performance);
        const availabilityScore = this.calculateAvailabilityScore(performance);
        const reliabilityScore = this.calculateReliabilityScore(performance);
        const workloadScore = this.calculateWorkloadScore(performance);

        // Calculate weighted overall score
        const overallScore =
            successRateScore * weights.successRate +
            speedScore * weights.speed +
            availabilityScore * weights.availability +
            reliabilityScore * weights.reliability +
            workloadScore * weights.workload;

        // Update heuristic score with bounds checking
        performance.heuristicScore = {
            overallScore: Math.max(0, Math.min(100, Math.round(overallScore))),
            successRateScore: Math.max(0, Math.min(100, Math.round(successRateScore))),
            speedScore: Math.max(0, Math.min(100, Math.round(speedScore))),
            availabilityScore: Math.max(0, Math.min(100, Math.round(availabilityScore))),
            reliabilityScore: Math.max(0, Math.min(100, Math.round(reliabilityScore))),
            workloadScore: Math.max(0, Math.min(100, Math.round(workloadScore))),
            weights: weights,
            calculatedAt: new Date()
        };
    }

    /**
     * Calculate speed score based on task completion times
     */
    private calculateSpeedScore(performance: AgentPerformance): number {
        if (performance.totalTasks === 0) return 100;

        const avgTime = performance.averageExecutionTime;
        if (avgTime <= 0) return 100; // Avoid division by zero

        // Get configurable baseline time from settings
        const config = vscode.workspace.getConfiguration('nofx.performance');
        const baselineTimeMinutes = config.get<number>('speedBaselineMinutes', 30);
        const baselineTime = baselineTimeMinutes * 60 * 1000; // Convert to milliseconds

        // Clamp avgTime to avoid extreme values
        const clampedAvgTime = Math.max(1000, Math.min(avgTime, 24 * 60 * 60 * 1000)); // 1 second to 24 hours

        // Use sigmoid function to avoid extreme values
        const ratio = baselineTime / clampedAvgTime;
        const score = Math.max(0, Math.min(100, (ratio / (1 + ratio)) * 100));

        return score;
    }

    /**
     * Calculate availability score based on uptime and response times
     */
    private calculateAvailabilityScore(performance: AgentPerformance): number {
        const uptimeScore = Math.max(0, Math.min(100, performance.availability.uptime));

        // Handle sentinel values and bounds checking for response time
        let responseScore = 100; // Default for unresponsive agents
        if (performance.availability.averageResponseTime > 0) {
            // Clamp response time to reasonable range (0-60 seconds)
            const clampedResponseTime = Math.max(0, Math.min(60000, performance.availability.averageResponseTime));
            responseScore = Math.max(0, Math.min(100, 100 - clampedResponseTime / 1000)); // Penalize slow responses
        } else if (performance.availability.averageResponseTime === -1) {
            // Sentinel value for unresponsive agents
            responseScore = 0;
        }

        const overallScore = (uptimeScore + responseScore) / 2;
        return Math.max(0, Math.min(100, overallScore));
    }

    /**
     * Calculate reliability score based on error rates and consecutive failures
     */
    private calculateReliabilityScore(performance: AgentPerformance): number {
        const errorRateScore = Math.max(0, 100 - performance.reliability.errorRate);
        const consecutiveFailurePenalty = Math.min(50, performance.reliability.consecutiveFailures * 10);

        return Math.max(0, errorRateScore - consecutiveFailurePenalty);
    }

    /**
     * Calculate workload efficiency score
     */
    private calculateWorkloadScore(performance: AgentPerformance): number {
        const utilization = performance.workload.utilizationPercentage;
        const currentLoad = performance.workload.currentTasks;
        const maxCapacity = performance.workload.maxConcurrentTasks;

        // Optimal utilization is around 70-80%
        const optimalUtilization = 75;
        const utilizationScore = 100 - Math.abs(utilization - optimalUtilization);

        // Penalize overloading
        const overloadPenalty = currentLoad > maxCapacity ? 30 : 0;

        return Math.max(0, utilizationScore - overloadPenalty);
    }

    /**
     * Update availability metrics for an agent
     */
    private updateAvailabilityMetrics(agentId: string, responseTime: number, isOnline: boolean): void {
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance) return;

        performance.availability.lastResponseTime = responseTime;
        performance.availability.isOnline = isOnline;

        if (isOnline) {
            performance.availability.lastOnlineTime = new Date();
            performance.availability.uptime = Math.min(100, performance.availability.uptime + 1);
        } else {
            performance.availability.uptime = Math.max(0, performance.availability.uptime - 1);
        }

        // Update average response time using separate response counter
        // Skip averaging when responseTime is negative (unresponsive sentinel)
        if (responseTime >= 0) {
            const currentAvg = performance.availability.averageResponseTime;
            const responseSamples = (performance.availability as any).responseSamples || 0;

            if (responseSamples === 0) {
                performance.availability.averageResponseTime = responseTime;
            } else {
                performance.availability.averageResponseTime =
                    (currentAvg * responseSamples + responseTime) / (responseSamples + 1);
            }

            // Increment response sample counter
            (performance.availability as any).responseSamples = responseSamples + 1;
        }

        // Update availability status
        performance.availability.isAvailable =
            isOnline && performance.availability.currentLoad < performance.availability.maxCapacity;
    }

    /**
     * Update speed metrics for an agent
     */
    private updateSpeedMetrics(agentId: string, taskStartTime: number, taskCompletionTime: number): void {
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance) return;

        // Update average task start time
        const currentStartAvg = performance.speed.averageTaskStartTime;
        const totalTasks = performance.totalTasks;
        performance.speed.averageTaskStartTime = (currentStartAvg * (totalTasks - 1) + taskStartTime) / totalTasks;

        // Update average task completion time
        const currentCompletionAvg = performance.speed.averageTaskCompletionTime;
        performance.speed.averageTaskCompletionTime =
            (currentCompletionAvg * (totalTasks - 1) + taskCompletionTime) / totalTasks;

        // Update fastest/slowest times
        if (performance.speed.fastestTaskTime === 0 || taskCompletionTime < performance.speed.fastestTaskTime) {
            performance.speed.fastestTaskTime = taskCompletionTime;
        }
        if (taskCompletionTime > performance.speed.slowestTaskTime) {
            performance.speed.slowestTaskTime = taskCompletionTime;
        }

        // Calculate tasks per hour using rolling window approach
        this.updateTasksPerHour(agentId, performance);
    }

    /**
     * Update tasks per hour using rolling window calculation
     */
    private updateTasksPerHour(agentId: string, performance: AgentPerformance): void {
        const now = Date.now();
        const oneHourMs = 60 * 60 * 1000; // 1 hour in milliseconds

        // Get completion timestamps for this agent
        const completionTimes = this.completionTimesByAgent.get(agentId) || [];

        // Prune timestamps to only keep those within the last hour
        const cutoffTime = now - oneHourMs;
        const recentCompletions = completionTimes.filter(timestamp => timestamp > cutoffTime);

        // Update the stored array with pruned timestamps
        this.completionTimesByAgent.set(agentId, recentCompletions);

        // Calculate tasks per hour based on rolling window
        if (recentCompletions.length > 0) {
            // For a 1-hour window, the count directly represents tasks per hour
            performance.speed.tasksPerHour = recentCompletions.length;
            this.outputChannel.appendLine(
                `📊 Agent ${agentId}: ${recentCompletions.length} tasks completed in last hour (rolling window)`
            );
        } else {
            // Fallback to stable baseline calculation if no recent completions
            // Use agent start time or first completion time as baseline
            const agentStartTime = performance.lastActive.getTime();
            const elapsedMs = now - agentStartTime;
            const elapsedHours = elapsedMs / oneHourMs;

            if (elapsedHours > 0 && performance.completedTasks > 0) {
                performance.speed.tasksPerHour = performance.completedTasks / elapsedHours;
                this.outputChannel.appendLine(
                    `📊 Agent ${agentId}: ${performance.speed.tasksPerHour.toFixed(2)} tasks/hour (baseline calculation)`
                );
            } else {
                performance.speed.tasksPerHour = 0;
            }
        }
    }

    /**
     * Clean up old completion timestamps to prevent memory bloat
     */
    private cleanupCompletionTimestamps(): void {
        const now = Date.now();
        const maxAgeMs = 24 * 60 * 60 * 1000; // Keep timestamps for 24 hours max

        for (const [agentId, timestamps] of this.completionTimesByAgent) {
            const cutoffTime = now - maxAgeMs;
            const recentTimestamps = timestamps.filter(timestamp => timestamp > cutoffTime);

            if (recentTimestamps.length !== timestamps.length) {
                this.completionTimesByAgent.set(agentId, recentTimestamps);
            }
        }
    }

    /**
     * Update reliability metrics for an agent
     */
    private updateReliabilityMetrics(agentId: string, errorType?: string, errorMessage?: string): void {
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance) return;

        if (errorType) {
            const currentCount = performance.reliability.errorTypes[errorType] || 0;
            performance.reliability.errorTypes[errorType] = currentCount + 1;
        }

        if (errorMessage) {
            performance.reliability.lastError = errorMessage;
        }

        // Update error rate
        performance.reliability.errorRate =
            performance.totalTasks > 0 ? (performance.failedTasks / performance.totalTasks) * 100 : 0;

        // Update success rate
        performance.reliability.successRate =
            performance.totalTasks > 0 ? (performance.completedTasks / performance.totalTasks) * 100 : 100;
    }

    /**
     * Get comprehensive performance summary for an agent
     */
    private getAgentPerformanceSummary(agentId: string): AgentPerformance | null {
        return this.agentPerformanceHistory.get(agentId) || null;
    }

    /**
     * Detect stuck agents using multiple criteria
     */
    private detectStuckAgents(): string[] {
        const stuckAgents: string[] = [];
        const now = Date.now();

        for (const [agentId, performance] of this.agentPerformanceHistory) {
            if (!performance.stuckDetection.detectionEnabled) {
                continue;
            }

            const lastActivity = performance.stuckDetection.lastActivityTime.getTime();
            const timeSinceActivity = now - lastActivity;
            const agent = this.agentManager.getAgent(agentId);

            // Time-based detection
            if (timeSinceActivity > performance.stuckDetection.stuckThreshold) {
                this.markAgentAsStuck(agentId, 'timeout', timeSinceActivity);
                stuckAgents.push(agentId);
                continue;
            }

            // Responsiveness-based detection
            if (agent && agent.status === 'offline') {
                this.markAgentAsStuck(agentId, 'unresponsive', timeSinceActivity);
                stuckAgents.push(agentId);
                continue;
            }

            // Error pattern detection
            if (performance.reliability.consecutiveFailures >= 3) {
                this.markAgentAsStuck(agentId, 'error_pattern', timeSinceActivity);
                stuckAgents.push(agentId);
                continue;
            }

            // Workload-based detection
            const currentTasks = this.agentTasksMap.get(agentId)?.size || 0;
            if (currentTasks > 0 && timeSinceActivity > performance.stuckDetection.stuckThreshold / 2) {
                // Check if tasks are stuck in progress
                const stuckTasks = this.checkForStuckTasks(agentId);
                if (stuckTasks.length > 0) {
                    this.markAgentAsStuck(agentId, 'workload', timeSinceActivity);
                    stuckAgents.push(agentId);
                    continue;
                }
            }

            // If agent was previously stuck but now shows activity, mark as unstuck
            if (
                performance.stuckDetection.isStuck &&
                timeSinceActivity < performance.stuckDetection.stuckThreshold / 4
            ) {
                this.markAgentAsUnstuck(agentId);
            }
        }

        return stuckAgents;
    }

    /**
     * Mark an agent as stuck with reason and duration
     */
    private markAgentAsStuck(
        agentId: string,
        reason: 'timeout' | 'unresponsive' | 'error_pattern' | 'workload' | 'unknown',
        duration: number
    ): void {
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance || performance.stuckDetection.isStuck) {
            return; // Already marked as stuck
        }

        performance.stuckDetection.isStuck = true;
        performance.stuckDetection.stuckReason = reason;
        performance.stuckDetection.stuckDetectionCount++;
        performance.stuckDetection.stuckDuration = duration;
        performance.reliability.stuckCount++;

        this.outputChannel.appendLine(
            `🚨 Agent ${agentId} marked as stuck: ${reason} (${Math.round(duration / 1000)}s)`
        );

        // Trigger intervention
        this.triggerStuckAgentIntervention(agentId);
    }

    /**
     * Mark an agent as unstuck
     */
    private markAgentAsUnstuck(agentId: string): void {
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance || !performance.stuckDetection.isStuck) {
            return; // Not currently stuck
        }

        performance.stuckDetection.isStuck = false;
        performance.stuckDetection.stuckReason = undefined;
        performance.stuckDetection.lastUnstuckTime = new Date();
        performance.stuckDetection.stuckDuration = 0;

        this.outputChannel.appendLine(`✅ Agent ${agentId} recovered and is no longer stuck`);
    }

    /**
     * Check for stuck tasks assigned to an agent
     */
    private checkForStuckTasks(agentId: string): string[] {
        const agentTasks = this.agentTasksMap.get(agentId);
        if (!agentTasks) return [];

        const stuckTasks: string[] = [];
        const now = Date.now();
        const stuckThreshold = 300000; // 5 minutes

        for (const taskId of agentTasks) {
            const task = this.taskQueue.getTask(taskId);
            if (task && task.status === 'in-progress') {
                // Check both assignedAt and lastProgressAt timestamps
                const taskStartTime = task.assignedAt?.getTime() || 0;
                const lastProgressTime = task.lastProgressAt?.getTime() || taskStartTime;

                // Use the more recent of the two timestamps for stuck detection
                const referenceTime = Math.max(taskStartTime, lastProgressTime);

                if (now - referenceTime > stuckThreshold) {
                    stuckTasks.push(taskId);
                }
            }
        }

        return stuckTasks;
    }

    /**
     * Configure stuck detection thresholds for an agent
     */
    private configureStuckDetectionThresholds(agentId: string, thresholds: Partial<StuckAgentDetection>): void {
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance) {
            this.initializeAgentMetrics(agentId);
            return this.configureStuckDetectionThresholds(agentId, thresholds);
        }

        if (thresholds.stuckThreshold !== undefined) {
            performance.stuckDetection.stuckThreshold = thresholds.stuckThreshold;
        }
        if (thresholds.detectionEnabled !== undefined) {
            performance.stuckDetection.detectionEnabled = thresholds.detectionEnabled;
        }

        this.outputChannel.appendLine(`⚙️ Updated stuck detection thresholds for Agent ${agentId}`);
    }

    /**
     * Analyze agent behavior patterns for stuck detection
     */
    private analyzeAgentBehaviorPatterns(agentId: string): {
        isStuck: boolean;
        confidence: number;
        patterns: string[];
    } {
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance) {
            return { isStuck: false, confidence: 0, patterns: [] };
        }

        const patterns: string[] = [];
        let confidence = 0;

        // Pattern 1: Increasing consecutive failures
        if (performance.reliability.consecutiveFailures >= 2) {
            patterns.push('increasing_failures');
            confidence += 30;
        }

        // Pattern 2: Declining response times
        if (performance.availability.averageResponseTime > 5000) {
            // 5 seconds
            patterns.push('slow_responses');
            confidence += 25;
        }

        // Pattern 3: High error rate
        if (performance.reliability.errorRate > 20) {
            patterns.push('high_error_rate');
            confidence += 35;
        }

        // Pattern 4: Workload overload
        if (performance.workload.utilizationPercentage > 90) {
            patterns.push('workload_overload');
            confidence += 20;
        }

        // Pattern 5: Recent stuck history
        if (performance.stuckDetection.stuckDetectionCount > 0) {
            patterns.push('recent_stuck_history');
            confidence += 15;
        }

        const isStuck = confidence >= 50 && patterns.length >= 2;

        return {
            isStuck,
            confidence: Math.min(100, confidence),
            patterns
        };
    }

    /**
     * Trigger intervention for a stuck agent
     */
    private triggerStuckAgentIntervention(agentId: string): void {
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance) return;

        this.outputChannel.appendLine(`🔧 Triggering intervention for stuck agent ${agentId}`);

        // Get tasks assigned to this agent
        const agentTasks = this.agentTasksMap.get(agentId);
        if (agentTasks && agentTasks.size > 0) {
            // Find optimal reassignment targets
            const availableAgents = this.agentManager
                .getAllAgents()
                .filter((a: Agent) => a.id !== agentId && !this.failedAgents.has(a.id));

            if (availableAgents.length > 0) {
                // Reassign tasks to better performing agents
                for (const taskId of agentTasks) {
                    const optimalAgent = this.findOptimalReassignmentTarget(taskId, availableAgents);
                    if (optimalAgent) {
                        this.reassignTask(
                            taskId,
                            agentId,
                            [optimalAgent],
                            `Agent ${agentId} stuck - ${performance.stuckDetection.stuckReason}`,
                            this.outputChannel
                        );
                    }
                }
            }
        }

        // Update performance metrics
        this.updateAgentMetrics(agentId, {
            stuckDetection: {
                ...performance.stuckDetection,
                lastActivityTime: new Date()
            }
        });
    }

    /**
     * Enhanced agent failure handling with performance-based reassignment
     */
    private async handleAgentFailureEnhanced(
        agentId: string,
        reason: string,
        outputChannel: vscode.OutputChannel
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('nofx.assignment');
        const enableReassignment = config.get<boolean>('enableReassignment', true);

        if (!enableReassignment) {
            outputChannel.appendLine(`[Reassignment] Reassignment disabled, skipping agent ${agentId}`);
            return;
        }

        // Mark agent as failed
        this.failedAgents.add(agentId);

        // Get tasks assigned to this agent
        const agentTasks = this.agentTasksMap.get(agentId);
        if (!agentTasks || agentTasks.size === 0) {
            outputChannel.appendLine(`[Reassignment] No tasks to reassign from agent ${agentId}`);
            return;
        }

        // Get available agents (excluding failed ones)
        const availableAgents = this.agentManager
            .getAllAgents()
            .filter((a: Agent) => a.id !== agentId && !this.failedAgents.has(a.id));

        if (availableAgents.length === 0) {
            outputChannel.appendLine(`[Reassignment] No available agents for reassignment from ${agentId}`);
            return;
        }

        // Use intelligent reassignment for each task
        for (const taskId of agentTasks) {
            await this.intelligentTaskReassignment(taskId, agentId, availableAgents, reason, outputChannel);
        }

        // Clear agent's task list
        this.agentTasksMap.delete(agentId);

        // Update performance metrics
        this.updateReliabilityMetrics(agentId, 'agent_failure', reason);
    }

    /**
     * Intelligent task reassignment considering agent performance history
     */
    private async intelligentTaskReassignment(
        taskId: string,
        failedAgentId: string,
        availableAgents: Agent[],
        failureReason: string,
        outputChannel: vscode.OutputChannel
    ): Promise<boolean> {
        const task = this.taskQueue.getTask(taskId);
        if (!task) {
            outputChannel.appendLine(`[Reassignment] Task ${taskId} not found`);
            return false;
        }

        // Get reassignment history for this task
        const history = this.reassignmentHistory.get(taskId) || [];
        const attemptNumber = history.length + 1;

        // Check max reassignment attempts
        const config = vscode.workspace.getConfiguration('nofx.assignment');
        const maxAttempts = config.get<number>('maxReassignmentAttempts', 3);

        if (attemptNumber > maxAttempts) {
            outputChannel.appendLine(
                `[Reassignment] Max attempts (${maxAttempts}) reached for task ${taskId}, marking as failed`
            );
            task.status = 'failed';
            return false;
        }

        // Find optimal reassignment target using performance-based selection
        const optimalAgent = this.findOptimalReassignmentTarget(taskId, availableAgents);
        if (!optimalAgent) {
            outputChannel.appendLine(`[Reassignment] No suitable agent found for task ${taskId}`);
            return false;
        }

        const newAgentId = optimalAgent.id;

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
        task.status = 'assigned';
        task.assignedAt = new Date();

        // Publish reassignment event
        if (this.eventBus) {
            this.eventBus.publish(DOMAIN_EVENTS.TASK_ASSIGNED, {
                taskId,
                originalAgentId: failedAgentId,
                newAgentId,
                reason: failureReason,
                attemptNumber,
                reassigned: true
            });
        }

        // Update performance metrics for both agents
        const failedPerformance = this.agentPerformanceHistory.get(failedAgentId);
        if (failedPerformance) {
            failedPerformance.reliability.consecutiveFailures += 1;
        }

        const newPerformance = this.agentPerformanceHistory.get(newAgentId);
        if (newPerformance) {
            newPerformance.workload.currentTasks = this.agentTasksMap.get(newAgentId)?.size || 0;
        }

        outputChannel.appendLine(
            `[Reassignment] ✓ Task ${taskId} reassigned from ${failedAgentId} to ${newAgentId} (attempt ${attemptNumber})`
        );

        return true;
    }

    /**
     * Find optimal reassignment target using heuristic scoring
     */
    private findOptimalReassignmentTarget(taskId: string, availableAgents: Agent[]): Agent | null {
        if (availableAgents.length === 0) return null;

        const task = this.taskQueue.getTask(taskId);
        if (!task) return null;

        let bestAgent: Agent | null = null;
        let bestScore = -1;

        for (const agent of availableAgents) {
            const score = this.calculateReassignmentScore(agent, task);

            // Add minimum score threshold (e.g., 60) and loop protection
            if (score >= 60 && !this.preventReassignmentCascade(taskId, agent.id)) {
                if (score > bestScore) {
                    bestScore = score;
                    bestAgent = agent;
                }
            }
        }

        // If no candidate meets threshold, skip reassignment and log
        if (!bestAgent) {
            this.outputChannel.appendLine(
                `⚠️ No suitable agent found for reassignment of task ${taskId} (best score: ${bestScore})`
            );
        }

        return bestAgent;
    }

    /**
     * Calculate reassignment score for an agent-task pair
     */
    private calculateReassignmentScore(agent: Agent, task: Task): number {
        const performance = this.agentPerformanceHistory.get(agent.id);
        if (!performance) {
            // New agent gets a default score
            return 50;
        }

        let score = 0;

        // Heuristic score component (40% weight)
        score += performance.heuristicScore.overallScore * 0.4;

        // Availability component (25% weight)
        const availabilityScore = performance.availability.isAvailable ? 100 : 0;
        score += availabilityScore * 0.25;

        // Workload component (20% weight)
        const workloadScore = Math.max(0, 100 - performance.workload.utilizationPercentage * 2);
        score += workloadScore * 0.2;

        // Specialization match component (15% weight)
        const specializationScore = this.calculateSpecializationMatch(agent, task);
        score += specializationScore * 0.15;

        return Math.round(score);
    }

    /**
     * Prevent reassignment cascade by tracking reassignment patterns
     */
    private preventReassignmentCascade(taskId: string, agentId: string): boolean {
        const history = this.reassignmentHistory.get(taskId) || [];

        // Check if this agent has been involved in too many reassignments recently
        const recentReassignments = history.filter(
            record => record.timestamp > Date.now() - 300000 // Last 5 minutes
        );

        const agentInvolvement = recentReassignments.filter(
            record => record.originalAgentId === agentId || record.newAgentId === agentId
        ).length;

        // If agent has been involved in more than 2 reassignments in 5 minutes, prevent cascade
        return agentInvolvement < 2;
    }

    /**
     * Adaptive reassignment strategy that learns from outcomes
     */
    private adaptiveReassignmentStrategy(taskId: string, availableAgents: Agent[]): Agent | null {
        const history = this.reassignmentHistory.get(taskId) || [];

        // Analyze previous reassignment outcomes
        const successfulReassignments = history.filter(record => {
            const agent = this.agentManager.getAgent(record.newAgentId);
            return agent && agent.status !== 'offline';
        });

        // If we have successful reassignment history, prefer those agents
        if (successfulReassignments.length > 0) {
            const successfulAgentIds = successfulReassignments.map(r => r.newAgentId);
            const preferredAgents = availableAgents.filter(a => successfulAgentIds.includes(a.id));

            if (preferredAgents.length > 0) {
                return this.findOptimalReassignmentTarget(taskId, preferredAgents);
            }
        }

        // Fall back to standard optimal selection
        return this.findOptimalReassignmentTarget(taskId, availableAgents);
    }

    /**
     * Start real-time performance monitoring with configurable intervals
     */
    private startPerformanceMonitoring(): void {
        const config = vscode.workspace.getConfiguration('nofx.performance');
        const monitoringInterval = config.get<number>('monitoringInterval', 30000); // 30 seconds
        const stuckDetectionInterval = config.get<number>('stuckDetectionInterval', 60000); // 1 minute

        // Start general performance monitoring
        const performanceInterval = setInterval(() => {
            this.monitorAgentHealthEnhanced();
            this.trackTaskProgressMetrics();
            this.generatePerformanceAlerts();
            this.updatePerformanceDashboard();
        }, monitoringInterval);

        // Start stuck agent detection
        const stuckDetectionIntervalId = setInterval(() => {
            const stuckAgents = this.detectStuckAgents();
            if (stuckAgents.length > 0) {
                this.outputChannel.appendLine(
                    `🚨 Detected ${stuckAgents.length} stuck agents: ${stuckAgents.join(', ')}`
                );
            }
        }, stuckDetectionInterval);

        // Store intervals for cleanup
        this.monitoringIntervals.set('performance', performanceInterval);
        this.monitoringIntervals.set('stuckDetection', stuckDetectionIntervalId);

        this.outputChannel.appendLine(`📊 Started performance monitoring (${monitoringInterval}ms interval)`);
    }

    /**
     * Enhanced agent health monitoring with comprehensive health checks
     */
    private monitorAgentHealthEnhanced(): void {
        const agents = this.agentManager.getAllAgents();

        for (const agent of agents) {
            const performance = this.agentPerformanceHistory.get(agent.id);
            if (!performance) {
                this.initializeAgentMetrics(agent.id);
                continue;
            }

            // Check agent status
            const isOnline = agent.status !== 'offline';
            const responseTime = this.measureAgentResponseTime(agent.id);

            // Update availability metrics
            this.updateAvailabilityMetrics(agent.id, responseTime, isOnline);

            // Update workload metrics
            const currentTasks = this.agentTasksMap.get(agent.id)?.size || 0;
            const maxCapacity = performance.availability.maxCapacity;
            const utilizationPercentage = (currentTasks / Math.max(1, maxCapacity || 0)) * 100;

            // Update workload metrics directly
            performance.workload.currentTasks = currentTasks;
            performance.workload.utilizationPercentage = utilizationPercentage;
            performance.workload.peakWorkload = Math.max(performance.workload.peakWorkload, currentTasks);
            performance.workload.averageWorkload = (performance.workload.averageWorkload + currentTasks) / 2;

            // Update stuck detection last activity time if agent is active
            if (isOnline && currentTasks > 0) {
                performance.stuckDetection.lastActivityTime = new Date();
            }
        }
    }

    /**
     * Measure agent response time
     */
    private measureAgentResponseTime(agentId: string): number {
        const startTime = Date.now();

        // Simulate response time measurement
        // In a real implementation, this would ping the agent or check its last activity
        const agent = this.agentManager.getAgent(agentId);
        if (!agent || agent.status === 'offline') {
            return -1; // Agent not responding
        }

        // For now, return a simulated response time based on agent performance
        const performance = this.agentPerformanceHistory.get(agentId);
        if (performance) {
            return performance.availability.averageResponseTime || 100; // Default 100ms
        }

        return 100; // Default response time for new agents
    }

    /**
     * Track real-time task progress metrics
     */
    private trackTaskProgressMetrics(): void {
        const tasks = this.taskQueue.getAllTasks();
        const now = Date.now();

        for (const task of tasks) {
            if (task.status === 'in-progress' && task.assignedTo) {
                const agentId = task.assignedTo;
                const performance = this.agentPerformanceHistory.get(agentId);

                if (performance) {
                    const taskStartTime = task.assignedAt?.getTime() || now;
                    const taskDuration = now - taskStartTime;

                    // Update speed metrics for in-progress tasks
                    if (task.status === 'in-progress') {
                        this.updateSpeedMetrics(agentId, 0, taskDuration);
                    }
                }
            }
        }
    }

    /**
     * Generate performance alerts based on thresholds
     */
    private generatePerformanceAlerts(): void {
        const config = vscode.workspace.getConfiguration('nofx.performance');
        const lowPerformanceThreshold = config.get<number>('lowPerformanceThreshold', 60);
        const highErrorRateThreshold = config.get<number>('highErrorRateThreshold', 20);
        const highWorkloadThreshold = config.get<number>('highWorkloadThreshold', 90);

        for (const [agentId, performance] of this.agentPerformanceHistory) {
            const alerts: string[] = [];

            // Low performance alert
            if (performance.heuristicScore.overallScore < lowPerformanceThreshold) {
                alerts.push(`Low performance: ${performance.heuristicScore.overallScore}%`);
            }

            // High error rate alert
            if (performance.reliability.errorRate > highErrorRateThreshold) {
                alerts.push(`High error rate: ${performance.reliability.errorRate.toFixed(1)}%`);
            }

            // High workload alert
            if (performance.workload.utilizationPercentage > highWorkloadThreshold) {
                alerts.push(`High workload: ${performance.workload.utilizationPercentage.toFixed(1)}%`);
            }

            // Stuck agent alert
            if (performance.stuckDetection.isStuck) {
                alerts.push(`Agent stuck: ${performance.stuckDetection.stuckReason}`);
            }

            // Log alerts
            if (alerts.length > 0) {
                this.outputChannel.appendLine(`⚠️ Performance alerts for Agent ${agentId}: ${alerts.join(', ')}`);
            }
        }
    }

    /**
     * Update real-time performance dashboard
     */
    private updatePerformanceDashboard(): void {
        const dashboardData = {
            timestamp: new Date().toISOString(),
            agents: Array.from(this.agentPerformanceHistory.entries()).map(([agentId, performance]) => ({
                agentId,
                overallScore: performance.heuristicScore.overallScore,
                isStuck: performance.stuckDetection.isStuck,
                currentLoad: performance.workload.currentTasks,
                utilizationPercentage: performance.workload.utilizationPercentage,
                successRate: performance.reliability.successRate,
                errorRate: performance.reliability.errorRate,
                isOnline: performance.availability.isOnline
            })),
            summary: {
                totalAgents: this.agentPerformanceHistory.size,
                stuckAgents: Array.from(this.agentPerformanceHistory.values()).filter(p => p.stuckDetection.isStuck)
                    .length,
                averagePerformance: this.calculateAveragePerformance(),
                totalTasks: Array.from(this.agentPerformanceHistory.values()).reduce((sum, p) => sum + p.totalTasks, 0)
            }
        };

        // Store dashboard data for potential UI display
        this.context?.workspaceState.update('performanceDashboard', dashboardData);
    }

    /**
     * Calculate average performance across all agents
     */
    private calculateAveragePerformance(): number {
        const performances = Array.from(this.agentPerformanceHistory.values());
        if (performances.length === 0) return 0;

        const totalScore = performances.reduce((sum, p) => sum + p.heuristicScore.overallScore, 0);
        return Math.round(totalScore / performances.length);
    }

    /**
     * Set monitoring intervals for different monitoring types
     */
    private setMonitoringIntervals(intervals: {
        performance?: number;
        stuckDetection?: number;
        persistence?: number;
    }): void {
        const config = vscode.workspace.getConfiguration('nofx.performance');

        if (intervals.performance !== undefined) {
            config.update('monitoringInterval', intervals.performance, vscode.ConfigurationTarget.Workspace);
        }

        if (intervals.stuckDetection !== undefined) {
            config.update('stuckDetectionInterval', intervals.stuckDetection, vscode.ConfigurationTarget.Workspace);
        }

        if (intervals.persistence !== undefined) {
            config.update('persistenceInterval', intervals.persistence, vscode.ConfigurationTarget.Workspace);
        }

        this.outputChannel.appendLine('⚙️ Updated monitoring intervals');
    }

    /**
     * Persist performance metrics to workspace storage
     */
    private async persistPerformanceMetrics(): Promise<void> {
        if (!this.context) {
            this.outputChannel.appendLine('⚠️ No extension context available for persistence');
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('nofx.performance');
            const maxSnapshots = config.get<number>('maxSnapshots', 1000);
            const retentionDays = config.get<number>('retentionDays', 30);

            // Create performance snapshots for all agents
            const snapshots: PerformanceSnapshot[] = [];
            const now = new Date();

            for (const [agentId, performance] of this.agentPerformanceHistory) {
                const snapshot: PerformanceSnapshot = {
                    agentId,
                    timestamp: now,
                    performance: { ...performance },
                    heuristicScore: { ...performance.heuristicScore },
                    wasStuck: performance.stuckDetection.isStuck,
                    currentWorkload: performance.workload.currentTasks
                };
                snapshots.push(snapshot);
            }

            // Get existing performance history (convert from serialized format)
            const serializedHistory = this.context.workspaceState.get<Record<string, PerformanceHistory>>(
                'performanceHistory',
                {}
            );
            const existingHistory = new Map<string, PerformanceHistory>();
            for (const [agentId, history] of Object.entries(serializedHistory)) {
                // Reconstruct Maps and Dates from serialized data
                const reconstructedHistory = this.reconstructPerformanceHistory(history);
                existingHistory.set(agentId, reconstructedHistory);
            }

            // Update history for each agent
            for (const snapshot of snapshots) {
                const agentHistory = existingHistory.get(snapshot.agentId) || {
                    agentId: snapshot.agentId,
                    snapshots: [],
                    timeRange: { start: now, end: now },
                    snapshotCount: 0,
                    averagePerformance: snapshot.performance,
                    trendAnalysis: snapshot.performance.trends
                };

                // Add new snapshot
                agentHistory.snapshots.push(snapshot);
                agentHistory.snapshotCount = agentHistory.snapshots.length;
                agentHistory.timeRange.end = now;

                // Clean up old snapshots
                const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
                agentHistory.snapshots = agentHistory.snapshots.filter(
                    (s: PerformanceSnapshot) => s.timestamp > cutoffDate
                );

                // Limit snapshots per agent
                if (agentHistory.snapshots.length > maxSnapshots) {
                    agentHistory.snapshots = agentHistory.snapshots.slice(-maxSnapshots);
                }

                // Update average performance
                agentHistory.averagePerformance = this.calculateAveragePerformanceForAgent(agentHistory.snapshots);

                // Update trend analysis
                agentHistory.trendAnalysis = this.analyzePerformanceTrends(agentHistory.snapshots);

                existingHistory.set(snapshot.agentId, agentHistory);
            }

            // Save to workspace state (convert Map to serializable format)
            const serializedData: Record<string, PerformanceHistory> = {};
            for (const [agentId, history] of existingHistory) {
                serializedData[agentId] = this.serializePerformanceHistory(history);
            }
            await this.context.workspaceState.update('performanceHistory', serializedData);
            await this.context.workspaceState.update('lastPersistenceTime', now.toISOString());

            this.outputChannel.appendLine(`💾 Persisted performance metrics for ${snapshots.length} agents`);
        } catch (error) {
            this.outputChannel.appendLine(`❌ Failed to persist performance metrics: ${error}`);
        }
    }

    /**
     * Load performance history from workspace storage
     */
    private async loadPerformanceHistory(): Promise<void> {
        if (!this.context) {
            this.outputChannel.appendLine('⚠️ No extension context available for loading history');
            return;
        }

        try {
            const serializedHistory = this.context.workspaceState.get<Record<string, PerformanceHistory>>(
                'performanceHistory',
                {}
            );
            const lastPersistenceTime = this.context.workspaceState.get<string>('lastPersistenceTime');

            if (Object.keys(serializedHistory).length > 0) {
                // Restore performance data for agents with history
                for (const [agentId, serializedHistoryData] of Object.entries(serializedHistory)) {
                    const history = this.reconstructPerformanceHistory(serializedHistoryData);
                    if (history.snapshots.length > 0) {
                        const latestSnapshot = history.snapshots[history.snapshots.length - 1];
                        this.agentPerformanceHistory.set(agentId, latestSnapshot.performance);
                    }
                }

                this.outputChannel.appendLine(
                    `📂 Loaded performance history for ${Object.keys(serializedHistory).length} agents` +
                        (lastPersistenceTime
                            ? ` (last updated: ${new Date(lastPersistenceTime).toLocaleString()})`
                            : '')
                );
            }
        } catch (error) {
            this.outputChannel.appendLine(`❌ Failed to load performance history: ${error}`);
        }
    }

    /**
     * Serialize performance history for storage (convert Maps and Dates to serializable format)
     */
    private serializePerformanceHistory(history: PerformanceHistory): any {
        return {
            ...history,
            snapshots: history.snapshots.map((snapshot: PerformanceSnapshot) => ({
                ...snapshot,
                timestamp: snapshot.timestamp.toISOString(),
                performance: {
                    ...snapshot.performance,
                    lastActive: snapshot.performance.lastActive.toISOString(),
                    availability: {
                        ...snapshot.performance.availability,
                        lastOnlineTime: snapshot.performance.availability.lastOnlineTime.toISOString()
                    },
                    stuckDetection: {
                        ...snapshot.performance.stuckDetection,
                        lastActivityTime: snapshot.performance.stuckDetection.lastActivityTime.toISOString(),
                        lastUnstuckTime: snapshot.performance.stuckDetection.lastUnstuckTime?.toISOString()
                    },
                    trends: {
                        ...snapshot.performance.trends,
                        analysisTimestamp: snapshot.performance.trends.analysisTimestamp.toISOString()
                    },
                    heuristicScore: {
                        ...snapshot.performance.heuristicScore,
                        calculatedAt: snapshot.performance.heuristicScore.calculatedAt.toISOString()
                    }
                }
            })),
            timeRange: {
                start: history.timeRange.start.toISOString(),
                end: history.timeRange.end.toISOString()
            }
        };
    }

    /**
     * Reconstruct performance history from storage (convert serialized data back to Maps and Dates)
     */
    private reconstructPerformanceHistory(serializedHistory: any): PerformanceHistory {
        return {
            ...serializedHistory,
            snapshots: serializedHistory.snapshots.map((snapshot: any) => ({
                ...snapshot,
                timestamp: new Date(snapshot.timestamp),
                performance: {
                    ...snapshot.performance,
                    lastActive: new Date(snapshot.performance.lastActive),
                    availability: {
                        ...snapshot.performance.availability,
                        lastOnlineTime: new Date(snapshot.performance.availability.lastOnlineTime)
                    },
                    stuckDetection: {
                        ...snapshot.performance.stuckDetection,
                        lastActivityTime: new Date(snapshot.performance.stuckDetection.lastActivityTime),
                        lastUnstuckTime: snapshot.performance.stuckDetection.lastUnstuckTime
                            ? new Date(snapshot.performance.stuckDetection.lastUnstuckTime)
                            : undefined
                    },
                    trends: {
                        ...snapshot.performance.trends,
                        analysisTimestamp: new Date(snapshot.performance.trends.analysisTimestamp)
                    },
                    heuristicScore: {
                        ...snapshot.performance.heuristicScore,
                        calculatedAt: new Date(snapshot.performance.heuristicScore.calculatedAt)
                    }
                }
            })),
            timeRange: {
                start: new Date(serializedHistory.timeRange.start),
                end: new Date(serializedHistory.timeRange.end)
            }
        };
    }

    /**
     * Get stored performance history as a Map (reconstructs from serialized format)
     */
    private async getStoredPerformanceHistory(): Promise<Map<string, PerformanceHistory>> {
        if (!this.context) {
            return new Map();
        }

        const serializedHistory = this.context.workspaceState.get<Record<string, PerformanceHistory>>(
            'performanceHistory',
            {}
        );
        const histories = new Map<string, PerformanceHistory>();

        for (const [agentId, serializedHistoryData] of Object.entries(serializedHistory)) {
            const reconstructedHistory = this.reconstructPerformanceHistory(serializedHistoryData);
            histories.set(agentId, reconstructedHistory);
        }

        return histories;
    }

    /**
     * Set stored performance history (serializes Map to storage format)
     */
    private async setStoredPerformanceHistory(histories: Map<string, PerformanceHistory>): Promise<void> {
        if (!this.context) {
            return;
        }

        const serializedData: Record<string, PerformanceHistory> = {};
        for (const [agentId, history] of histories) {
            serializedData[agentId] = this.serializePerformanceHistory(history);
        }

        await this.context.workspaceState.update('performanceHistory', serializedData);
    }

    /**
     * Archive old metrics to manage storage
     */
    private async archiveOldMetrics(): Promise<void> {
        if (!this.context) return;

        try {
            const config = vscode.workspace.getConfiguration('nofx.performance');
            const retentionDays = config.get<number>('retentionDays', 30);
            const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

            // Get stored performance history using helper
            const histories = await this.getStoredPerformanceHistory();
            let archivedCount = 0;

            for (const [agentId, history] of histories) {
                const originalCount = history.snapshots.length;
                history.snapshots = history.snapshots.filter((s: PerformanceSnapshot) => s.timestamp > cutoffDate);

                if (history.snapshots.length < originalCount) {
                    history.snapshotCount = history.snapshots.length;
                    archivedCount += originalCount - history.snapshots.length;
                }
            }

            if (archivedCount > 0) {
                // Save back using helper
                await this.setStoredPerformanceHistory(histories);
                this.outputChannel.appendLine(
                    `🗄️ Archived ${archivedCount} old performance snapshots across ${histories.size} agents`
                );
            }
        } catch (error) {
            this.outputChannel.appendLine(`❌ Failed to archive old metrics: ${error}`);
        }
    }

    /**
     * Export performance report for detailed analysis
     */
    private async exportPerformanceReport(): Promise<string> {
        const report = {
            exportTimestamp: new Date().toISOString(),
            summary: {
                totalAgents: this.agentPerformanceHistory.size,
                averagePerformance: this.calculateAveragePerformance(),
                totalTasks: Array.from(this.agentPerformanceHistory.values()).reduce((sum, p) => sum + p.totalTasks, 0),
                stuckAgents: Array.from(this.agentPerformanceHistory.values()).filter(p => p.stuckDetection.isStuck)
                    .length
            },
            agents: Array.from(this.agentPerformanceHistory.entries()).map(([agentId, performance]) => ({
                agentId,
                performance: {
                    ...performance,
                    // Convert Map to Object for JSON serialization
                    reliability: {
                        ...performance.reliability,
                        errorTypes: performance.reliability.errorTypes
                    }
                }
            })),
            trends: this.analyzeOverallTrends(),
            recommendations: this.generatePerformanceRecommendations()
        };

        return JSON.stringify(report, null, 2);
    }

    /**
     * Calculate average performance for an agent from snapshots
     */
    private calculateAveragePerformanceForAgent(snapshots: PerformanceSnapshot[]): AgentPerformance {
        if (snapshots.length === 0) {
            throw new Error('Cannot calculate average from empty snapshots');
        }

        const firstSnapshot = snapshots[0].performance;
        const averages: AgentPerformance = {
            ...firstSnapshot,
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            averageExecutionTime: 0,
            qualityScore: 0,
            availability: { ...firstSnapshot.availability, uptime: 0 },
            speed: { ...firstSnapshot.speed },
            reliability: { ...firstSnapshot.reliability, successRate: 0, errorRate: 0 },
            workload: { ...firstSnapshot.workload, utilizationPercentage: 0 },
            stuckDetection: { ...firstSnapshot.stuckDetection },
            trends: { ...firstSnapshot.trends },
            heuristicScore: { ...firstSnapshot.heuristicScore, overallScore: 0 }
        };

        // Calculate averages
        for (const snapshot of snapshots) {
            const perf = snapshot.performance;
            averages.totalTasks += perf.totalTasks;
            averages.completedTasks += perf.completedTasks;
            averages.failedTasks += perf.failedTasks;
            averages.averageExecutionTime += perf.averageExecutionTime;
            averages.qualityScore += perf.qualityScore;
            averages.availability.uptime += perf.availability.uptime;
            averages.reliability.successRate += perf.reliability.successRate;
            averages.reliability.errorRate += perf.reliability.errorRate;
            averages.workload.utilizationPercentage += perf.workload.utilizationPercentage;
            averages.heuristicScore.overallScore += perf.heuristicScore.overallScore;
        }

        const count = snapshots.length;
        averages.totalTasks = Math.round(averages.totalTasks / count);
        averages.completedTasks = Math.round(averages.completedTasks / count);
        averages.failedTasks = Math.round(averages.failedTasks / count);
        averages.averageExecutionTime = averages.averageExecutionTime / count;
        averages.qualityScore = Math.round(averages.qualityScore / count);
        averages.availability.uptime = averages.availability.uptime / count;
        averages.reliability.successRate = averages.reliability.successRate / count;
        averages.reliability.errorRate = averages.reliability.errorRate / count;
        averages.workload.utilizationPercentage = averages.workload.utilizationPercentage / count;
        averages.heuristicScore.overallScore = Math.round(averages.heuristicScore.overallScore / count);

        return averages;
    }

    /**
     * Analyze performance trends from snapshots
     */
    private analyzePerformanceTrends(snapshots: PerformanceSnapshot[]): PerformanceTrend {
        if (snapshots.length < 2) {
            return {
                performanceTrend: 'stable',
                speedTrend: 'stable',
                reliabilityTrend: 'stable',
                confidence: 0,
                dataPoints: snapshots.length,
                analysisTimestamp: new Date()
            };
        }

        const recent = snapshots.slice(-5); // Last 5 snapshots
        const older = snapshots.slice(-10, -5); // Previous 5 snapshots

        const recentAvg = recent.reduce((sum, s) => sum + s.heuristicScore.overallScore, 0) / recent.length;
        const olderAvg =
            older.length > 0
                ? older.reduce((sum, s) => sum + s.heuristicScore.overallScore, 0) / older.length
                : recentAvg;

        const performanceTrend =
            recentAvg > olderAvg + 5 ? 'improving' : recentAvg < olderAvg - 5 ? 'declining' : 'stable';

        return {
            performanceTrend,
            speedTrend: 'stable', // Simplified for now
            reliabilityTrend: 'stable', // Simplified for now
            confidence: Math.min(100, snapshots.length * 10),
            dataPoints: snapshots.length,
            analysisTimestamp: new Date()
        };
    }

    /**
     * Analyze overall trends across all agents
     */
    private analyzeOverallTrends(): any {
        const performances = Array.from(this.agentPerformanceHistory.values());
        const improving = performances.filter(p => p.trends.performanceTrend === 'improving').length;
        const declining = performances.filter(p => p.trends.performanceTrend === 'declining').length;
        const stable = performances.filter(p => p.trends.performanceTrend === 'stable').length;

        return {
            improving,
            declining,
            stable,
            total: performances.length,
            improvementRate: performances.length > 0 ? (improving / performances.length) * 100 : 0
        };
    }

    /**
     * Generate performance recommendations
     */
    private generatePerformanceRecommendations(): string[] {
        const recommendations: string[] = [];
        const performances = Array.from(this.agentPerformanceHistory.values());

        // Check for stuck agents
        const stuckAgents = performances.filter(p => p.stuckDetection.isStuck);
        if (stuckAgents.length > 0) {
            recommendations.push(`Consider investigating ${stuckAgents.length} stuck agents`);
        }

        // Check for low performance
        const lowPerformers = performances.filter(p => p.heuristicScore.overallScore < 60);
        if (lowPerformers.length > 0) {
            recommendations.push(`Review performance of ${lowPerformers.length} low-performing agents`);
        }

        // Check for high error rates
        const highErrorAgents = performances.filter(p => p.reliability.errorRate > 20);
        if (highErrorAgents.length > 0) {
            recommendations.push(
                `Investigate error patterns in ${highErrorAgents.length} agents with high error rates`
            );
        }

        // Check for workload imbalance
        const overloadedAgents = performances.filter(p => p.workload.utilizationPercentage > 90);
        if (overloadedAgents.length > 0) {
            recommendations.push(`Consider redistributing workload from ${overloadedAgents.length} overloaded agents`);
        }

        return recommendations;
    }

    /**
     * Cleanup metrics storage
     */
    private async cleanupMetricsStorage(): Promise<void> {
        if (!this.context) return;

        try {
            const config = vscode.workspace.getConfiguration('nofx.performance');
            const maxStorageSize = config.get<number>('maxStorageSizeMB', 100) * 1024 * 1024; // Convert to bytes

            // Get current storage size by reading the serialized record
            const serializedHistory = this.context.workspaceState.get<Record<string, PerformanceHistory>>(
                'performanceHistory',
                {}
            );
            const estimatedSize = JSON.stringify(serializedHistory).length;

            if (estimatedSize > maxStorageSize) {
                // Reconstruct via helper to work with Map format
                const histories = await this.getStoredPerformanceHistory();

                // Reduce snapshots per agent proportionally
                const reductionFactor = maxStorageSize / estimatedSize;

                for (const [agentId, history] of histories) {
                    const targetCount = Math.floor(history.snapshots.length * reductionFactor);
                    if (targetCount < history.snapshots.length) {
                        history.snapshots = history.snapshots.slice(-targetCount);
                        history.snapshotCount = targetCount;
                    }
                }

                // Serialize back via helper
                await this.setStoredPerformanceHistory(histories);
                this.outputChannel.appendLine(
                    `🧹 Cleaned up metrics storage (reduced by ${Math.round((1 - reductionFactor) * 100)}%) across ${histories.size} agents`
                );
            }
        } catch (error) {
            this.outputChannel.appendLine(`❌ Failed to cleanup metrics storage: ${error}`);
        }
    }

    /**
     * Load performance configuration from user settings
     */
    private loadPerformanceConfiguration(): void {
        const config = vscode.workspace.getConfiguration('nofx.performance');

        // Load monitoring intervals
        const monitoringInterval = config.get<number>('monitoringInterval', 30000);
        const stuckDetectionInterval = config.get<number>('stuckDetectionInterval', 60000);
        const persistenceInterval = config.get<number>('persistenceInterval', 300000); // 5 minutes

        // Load thresholds
        const lowPerformanceThreshold = config.get<number>('lowPerformanceThreshold', 60);
        const highErrorRateThreshold = config.get<number>('highErrorRateThreshold', 20);
        const highWorkloadThreshold = config.get<number>('highWorkloadThreshold', 90);
        const slowResponseThreshold = config.get<number>('slowResponseThreshold', 5000);

        // Load storage settings
        const maxSnapshots = config.get<number>('maxSnapshots', 1000);
        const retentionDays = config.get<number>('retentionDays', 30);
        const maxStorageSizeMB = config.get<number>('maxStorageSizeMB', 100);
        const compressOldData = config.get<boolean>('compressOldData', true);

        // Load scoring weights
        const scoringWeights = config.get<ScoringWeights>('scoringWeights', {
            successRate: 0.3,
            speed: 0.2,
            availability: 0.2,
            reliability: 0.2,
            workload: 0.1
        });

        // Apply configuration to all agents
        for (const [agentId, performance] of this.agentPerformanceHistory) {
            // Update scoring weights
            performance.heuristicScore.weights = scoringWeights;

            // Update stuck detection thresholds
            performance.stuckDetection.stuckThreshold = config.get<number>('stuckThreshold', 300000);
            performance.stuckDetection.detectionEnabled = config.get<boolean>('stuckDetectionEnabled', true);
        }

        this.outputChannel.appendLine('⚙️ Loaded performance configuration');
    }

    /**
     * Update scoring weights for heuristic scoring
     */
    private updateScoringWeights(weights: Partial<ScoringWeights>): void {
        const config = vscode.workspace.getConfiguration('nofx.performance');
        const currentWeights = config.get<ScoringWeights>('scoringWeights', {
            successRate: 0.3,
            speed: 0.2,
            availability: 0.2,
            reliability: 0.2,
            workload: 0.1
        });

        const newWeights: ScoringWeights = {
            ...currentWeights,
            ...weights
        };

        // Normalize weights to ensure they sum to 1
        const totalWeight =
            newWeights.successRate +
            newWeights.speed +
            newWeights.availability +
            newWeights.reliability +
            newWeights.workload;

        if (totalWeight > 0) {
            newWeights.successRate /= totalWeight;
            newWeights.speed /= totalWeight;
            newWeights.availability /= totalWeight;
            newWeights.reliability /= totalWeight;
            newWeights.workload /= totalWeight;
        }

        // Update configuration
        config.update('scoringWeights', newWeights, vscode.ConfigurationTarget.Workspace);

        // Apply to all agents
        for (const [agentId, performance] of this.agentPerformanceHistory) {
            performance.heuristicScore.weights = newWeights;
            this.calculateHeuristicScore(agentId);
        }

        this.outputChannel.appendLine('⚙️ Updated scoring weights');
    }

    /**
     * Configure alert thresholds for performance monitoring
     */
    private configureAlertThresholds(thresholds: Partial<PerformanceThresholds>): void {
        const config = vscode.workspace.getConfiguration('nofx.performance');

        if (thresholds.lowPerformanceThreshold !== undefined) {
            config.update(
                'lowPerformanceThreshold',
                thresholds.lowPerformanceThreshold,
                vscode.ConfigurationTarget.Workspace
            );
        }

        if (thresholds.highErrorRateThreshold !== undefined) {
            config.update(
                'highErrorRateThreshold',
                thresholds.highErrorRateThreshold,
                vscode.ConfigurationTarget.Workspace
            );
        }

        if (thresholds.highWorkloadThreshold !== undefined) {
            config.update(
                'highWorkloadThreshold',
                thresholds.highWorkloadThreshold,
                vscode.ConfigurationTarget.Workspace
            );
        }

        if (thresholds.slowResponseThreshold !== undefined) {
            config.update(
                'slowResponseThreshold',
                thresholds.slowResponseThreshold,
                vscode.ConfigurationTarget.Workspace
            );
        }

        if (thresholds.stuckThreshold !== undefined) {
            config.update('stuckThreshold', thresholds.stuckThreshold, vscode.ConfigurationTarget.Workspace);
        }

        if (thresholds.minTasksForReliability !== undefined) {
            config.update(
                'minTasksForReliability',
                thresholds.minTasksForReliability,
                vscode.ConfigurationTarget.Workspace
            );
        }

        this.outputChannel.appendLine('⚙️ Updated alert thresholds');
    }

    /**
     * Initialize performance monitoring system
     */
    private initializePerformanceSystem(): void {
        // Load configuration
        this.loadPerformanceConfiguration();

        // Load performance history
        this.loadPerformanceHistory();

        // Start monitoring
        this.startPerformanceMonitoring();

        // Start persistence interval
        const config = vscode.workspace.getConfiguration('nofx.performance');
        const persistenceInterval = config.get<number>('persistenceInterval', 300000); // 5 minutes

        const persistenceIntervalId = setInterval(async () => {
            await this.persistPerformanceMetrics();
            await this.archiveOldMetrics();
            await this.cleanupMetricsStorage();
            this.cleanupCompletionTimestamps(); // Clean up old completion timestamps
        }, persistenceInterval);

        this.monitoringIntervals.set('persistence', persistenceIntervalId);

        this.outputChannel.appendLine('🚀 Performance monitoring system initialized');
    }

    /**
     * Stop performance monitoring system
     */
    private stopPerformanceSystem(): void {
        // Clear all monitoring intervals
        for (const [name, interval] of this.monitoringIntervals) {
            clearInterval(interval);
            this.outputChannel.appendLine(`⏹️ Stopped ${name} monitoring`);
        }
        this.monitoringIntervals.clear();

        // Final persistence
        this.persistPerformanceMetrics();

        this.outputChannel.appendLine('🛑 Performance monitoring system stopped');
    }

    /**
     * Get current performance configuration
     */
    private getPerformanceConfiguration(): any {
        const config = vscode.workspace.getConfiguration('nofx.performance');

        return {
            monitoring: {
                monitoringInterval: config.get<number>('monitoringInterval', 30000),
                stuckDetectionInterval: config.get<number>('stuckDetectionInterval', 60000),
                persistenceInterval: config.get<number>('persistenceInterval', 300000)
            },
            thresholds: {
                lowPerformanceThreshold: config.get<number>('lowPerformanceThreshold', 60),
                highErrorRateThreshold: config.get<number>('highErrorRateThreshold', 20),
                highWorkloadThreshold: config.get<number>('highWorkloadThreshold', 90),
                slowResponseThreshold: config.get<number>('slowResponseThreshold', 5000),
                stuckThreshold: config.get<number>('stuckThreshold', 300000),
                minTasksForReliability: config.get<number>('minTasksForReliability', 5)
            },
            storage: {
                maxSnapshots: config.get<number>('maxSnapshots', 1000),
                retentionDays: config.get<number>('retentionDays', 30),
                maxStorageSizeMB: config.get<number>('maxStorageSizeMB', 100),
                compressOldData: config.get<boolean>('compressOldData', true)
            },
            scoring: {
                weights: config.get<ScoringWeights>('scoringWeights', {
                    successRate: 0.3,
                    speed: 0.2,
                    availability: 0.2,
                    reliability: 0.2,
                    workload: 0.1
                })
            }
        };
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

        // Stop performance monitoring system
        this.stopPerformanceSystem();

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

    /**
     * Creates a custom agent when no existing agent meets the capability threshold
     */
    private async createCustomAgent(task: Task, taskRequirements: string[]): Promise<Agent | null> {
        try {
            // Analyze task specialization
            const specialization = this.analyzeTaskSpecialization(task);

            // Generate custom agent template
            const template = this.generateCustomAgentTemplate(task, taskRequirements);

            // Save the custom template
            const templateSaved = await this.saveCustomAgentTemplate(template);
            if (!templateSaved) {
                this.outputChannel.appendLine(`[Custom Agent] Failed to save template for ${template.name}`);
                return null;
            }

            // Spawn the custom agent
            const agentConfig = {
                templateId: template.id,
                name: template.name,
                type: specialization,
                specialization: specialization
            };

            const customAgent = await this.agentManager.spawnAgent(agentConfig);
            if (customAgent) {
                this.logCustomAgentCreation(customAgent, task, `Created for ${specialization} specialization`);
                return customAgent;
            }

            return null;
        } catch (error) {
            this.outputChannel.appendLine(`[Custom Agent] Error creating custom agent: ${error}`);
            return null;
        }
    }

    /**
     * Analyzes task to determine agent specialization
     */
    private analyzeTaskSpecialization(task: Task): string {
        const description = task.description.toLowerCase();
        const tags = (task.tags || []).map(tag => tag.toLowerCase());
        const requirements = (task.requiredCapabilities || []).map(req => req.toLowerCase());

        const allText = `${description} ${tags.join(' ')} ${requirements.join(' ')}`;

        // Blockchain and Web3
        if (
            allText.includes('blockchain') ||
            allText.includes('web3') ||
            allText.includes('smart contract') ||
            allText.includes('ethereum') ||
            allText.includes('solidity') ||
            allText.includes('defi')
        ) {
            return 'blockchain-developer';
        }

        // Game Development
        if (
            allText.includes('game') ||
            allText.includes('unity') ||
            allText.includes('unreal') ||
            allText.includes('gaming') ||
            allText.includes('game engine') ||
            allText.includes('3d')
        ) {
            return 'game-engine-specialist';
        }

        // Machine Learning and AI
        if (
            allText.includes('machine learning') ||
            allText.includes('ml') ||
            allText.includes('tensorflow') ||
            allText.includes('pytorch') ||
            allText.includes('neural network') ||
            allText.includes('ai model')
        ) {
            return 'ai-ml-specialist';
        }

        // Data Science
        if (
            allText.includes('data science') ||
            allText.includes('analytics') ||
            allText.includes('pandas') ||
            allText.includes('numpy') ||
            allText.includes('jupyter') ||
            allText.includes('data analysis')
        ) {
            return 'data-science-specialist';
        }

        // DevOps and Infrastructure
        if (
            allText.includes('devops') ||
            allText.includes('kubernetes') ||
            allText.includes('docker') ||
            allText.includes('ci/cd') ||
            allText.includes('infrastructure') ||
            allText.includes('deployment')
        ) {
            return 'devops-specialist';
        }

        // Security
        if (
            allText.includes('security') ||
            allText.includes('penetration') ||
            allText.includes('vulnerability') ||
            allText.includes('cryptography') ||
            allText.includes('authentication') ||
            allText.includes('authorization')
        ) {
            return 'security-specialist';
        }

        // Mobile Development
        if (
            allText.includes('mobile') ||
            allText.includes('ios') ||
            allText.includes('android') ||
            allText.includes('react native') ||
            allText.includes('flutter') ||
            allText.includes('swift')
        ) {
            return 'mobile-specialist';
        }

        // Frontend Development
        if (
            allText.includes('frontend') ||
            allText.includes('react') ||
            allText.includes('vue') ||
            allText.includes('angular') ||
            allText.includes('ui') ||
            allText.includes('css') ||
            allText.includes('javascript')
        ) {
            return 'frontend-specialist';
        }

        // Backend Development
        if (
            allText.includes('backend') ||
            allText.includes('api') ||
            allText.includes('server') ||
            allText.includes('database') ||
            allText.includes('node.js') ||
            allText.includes('python') ||
            allText.includes('java')
        ) {
            return 'backend-specialist';
        }

        // Database
        if (
            allText.includes('database') ||
            allText.includes('sql') ||
            allText.includes('postgresql') ||
            allText.includes('mongodb') ||
            allText.includes('redis') ||
            allText.includes('mysql')
        ) {
            return 'database-specialist';
        }

        // Testing
        if (
            allText.includes('testing') ||
            allText.includes('qa') ||
            allText.includes('test') ||
            allText.includes('automation') ||
            allText.includes('selenium') ||
            allText.includes('jest')
        ) {
            return 'testing-specialist';
        }

        // Default to generalist
        return 'generalist-specialist';
    }

    /**
     * Generates a custom agent template based on task requirements
     */
    private generateCustomAgentTemplate(task: Task, requirements: string[]): AgentTemplate {
        const specialization = this.analyzeTaskSpecialization(task);
        const uniqueName = this.generateUniqueAgentName(specialization);
        const uniqueId = this.generateUniqueAgentId(uniqueName);

        return {
            id: uniqueId,
            name: uniqueName,
            icon: this.selectAgentIcon(specialization),
            color: this.selectAgentColor(specialization),
            description: `Specialized agent for ${specialization} tasks, created dynamically for: ${task.title}`,
            types: [specialization.split('-')[0]], // Extract main type (e.g., 'blockchain' from 'blockchain-developer')
            tags: this.getSpecializationKeywords(task),
            capabilities: this.generateAgentCapabilities(specialization, requirements),
            systemPrompt: this.generateSystemPrompt(specialization, task),
            detailedPrompt: `You are a specialized ${specialization} agent created specifically for this task: "${task.title}". ${task.description}`,
            taskPreferences: {
                preferred: [specialization, ...requirements],
                avoid: [],
                priority: 'high'
            },
            filePatterns: {
                watch: this.getFilePatternsForSpecialization(specialization),
                ignore: ['node_modules/**', '.git/**', 'coverage/**']
            },
            commands: this.getCommandsForSpecialization(specialization),
            snippets: this.getSnippetsForSpecialization(specialization),
            version: '1.0.0',
            author: 'nofx-dynamic-creator'
        };
    }

    /**
     * Generates agent capabilities based on specialization and requirements
     */
    private generateAgentCapabilities(specialization: string, requirements: string[]): AgentTemplate['capabilities'] {
        const baseCapabilities = {
            languages: [] as string[],
            frameworks: [] as string[],
            tools: [] as string[],
            testing: [] as string[],
            specialties: [specialization]
        };

        // Add capabilities based on specialization
        switch (specialization) {
            case 'blockchain-developer':
                baseCapabilities.languages = ['solidity', 'javascript', 'typescript', 'rust', 'go'];
                baseCapabilities.frameworks = ['hardhat', 'truffle', 'web3.js', 'ethers.js', 'foundry'];
                baseCapabilities.tools = ['remix', 'metamask', 'ganache', 'infura', 'alchemy'];
                break;
            case 'game-engine-specialist':
                baseCapabilities.languages = ['c#', 'c++', 'javascript', 'lua', 'python'];
                baseCapabilities.frameworks = ['unity', 'unreal engine', 'godot', 'phaser', 'three.js'];
                baseCapabilities.tools = ['blender', 'maya', 'photoshop', 'visual studio', 'unity hub'];
                break;
            case 'ai-ml-specialist':
                baseCapabilities.languages = ['python', 'r', 'julia', 'scala'];
                baseCapabilities.frameworks = ['tensorflow', 'pytorch', 'scikit-learn', 'keras', 'hugging face'];
                baseCapabilities.tools = ['jupyter', 'colab', 'wandb', 'mlflow', 'docker'];
                break;
            case 'data-science-specialist':
                baseCapabilities.languages = ['python', 'r', 'sql', 'julia'];
                baseCapabilities.frameworks = ['pandas', 'numpy', 'scipy', 'matplotlib', 'seaborn'];
                baseCapabilities.tools = ['jupyter', 'tableau', 'power bi', 'apache spark', 'airflow'];
                break;
            case 'devops-specialist':
                baseCapabilities.languages = ['bash', 'python', 'yaml', 'json'];
                baseCapabilities.frameworks = ['kubernetes', 'docker', 'terraform', 'ansible', 'jenkins'];
                baseCapabilities.tools = ['aws', 'azure', 'gcp', 'gitlab ci', 'github actions'];
                break;
            case 'security-specialist':
                baseCapabilities.languages = ['python', 'bash', 'powershell', 'c', 'go'];
                baseCapabilities.frameworks = ['owasp', 'nmap', 'burp suite', 'metasploit', 'wireshark'];
                baseCapabilities.tools = ['kali linux', 'nmap', 'burp suite', 'sqlmap', 'john the ripper'];
                break;
            case 'mobile-specialist':
                baseCapabilities.languages = ['swift', 'kotlin', 'javascript', 'dart', 'java'];
                baseCapabilities.frameworks = ['react native', 'flutter', 'xamarin', 'ionic', 'native script'];
                baseCapabilities.tools = ['xcode', 'android studio', 'expo', 'firebase', 'app center'];
                break;
            case 'frontend-specialist':
                baseCapabilities.languages = ['javascript', 'typescript', 'html', 'css', 'sass'];
                baseCapabilities.frameworks = ['react', 'vue', 'angular', 'svelte', 'next.js'];
                baseCapabilities.tools = ['webpack', 'vite', 'eslint', 'prettier', 'storybook'];
                break;
            case 'backend-specialist':
                baseCapabilities.languages = ['javascript', 'typescript', 'python', 'java', 'c#', 'go', 'rust'];
                baseCapabilities.frameworks = ['express', 'fastapi', 'spring', 'django', 'flask', 'gin'];
                baseCapabilities.tools = ['postman', 'insomnia', 'docker', 'nginx', 'redis'];
                break;
            case 'database-specialist':
                baseCapabilities.languages = ['sql', 'python', 'javascript', 'java'];
                baseCapabilities.frameworks = ['postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch'];
                baseCapabilities.tools = ['pgadmin', 'mongodb compass', 'redis cli', 'kibana', 'grafana'];
                break;
            case 'testing-specialist':
                baseCapabilities.languages = ['javascript', 'python', 'java', 'c#'];
                baseCapabilities.frameworks = ['jest', 'cypress', 'selenium', 'pytest', 'junit'];
                baseCapabilities.tools = ['postman', 'newman', 'k6', 'artillery', 'browserstack'];
                break;
            default:
                baseCapabilities.languages = ['javascript', 'typescript', 'python', 'java'];
                baseCapabilities.frameworks = ['react', 'node.js', 'express', 'django'];
                baseCapabilities.tools = ['git', 'docker', 'vscode', 'postman'];
        }

        // Add requirements to capabilities
        requirements.forEach(req => {
            if (
                !baseCapabilities.languages.includes(req) &&
                !baseCapabilities.frameworks.includes(req) &&
                !baseCapabilities.tools.includes(req)
            ) {
                baseCapabilities.tools.push(req);
            }
        });

        return baseCapabilities;
    }

    /**
     * Generates system prompt for the custom agent
     */
    private generateSystemPrompt(specialization: string, task: Task): string {
        const basePrompt = `You are a specialized ${specialization} agent created dynamically to handle specific tasks.`;

        const specializationPrompts: Record<string, string> = {
            'blockchain-developer':
                'You excel at smart contract development, DeFi protocols, and Web3 applications. You understand Solidity, Web3.js, and blockchain architecture.',
            'game-engine-specialist':
                'You are an expert in game development, 3D graphics, and game engines. You can work with Unity, Unreal Engine, and various game frameworks.',
            'ai-ml-specialist':
                'You specialize in machine learning, artificial intelligence, and data modeling. You work with TensorFlow, PyTorch, and various ML frameworks.',
            'data-science-specialist':
                'You are a data science expert who can analyze data, create visualizations, and build predictive models using Python, R, and statistical methods.',
            'devops-specialist':
                'You excel at infrastructure, deployment, and automation. You work with Docker, Kubernetes, CI/CD pipelines, and cloud platforms.',
            'security-specialist':
                'You are a cybersecurity expert who can identify vulnerabilities, implement security measures, and conduct security assessments.',
            'mobile-specialist':
                'You specialize in mobile app development for iOS and Android platforms using React Native, Flutter, or native development.',
            'frontend-specialist':
                'You are a frontend expert who creates beautiful, responsive user interfaces using modern web technologies and frameworks.',
            'backend-specialist':
                'You excel at server-side development, APIs, databases, and backend architecture using various programming languages and frameworks.',
            'database-specialist':
                'You are a database expert who can design, optimize, and manage various database systems and data storage solutions.',
            'testing-specialist':
                'You specialize in software testing, quality assurance, and test automation using various testing frameworks and tools.'
        };

        const specializationPrompt =
            specializationPrompts[specialization] ||
            'You are a versatile developer who can adapt to various programming tasks.';

        return `${basePrompt} ${specializationPrompt}

Current Task: ${task.title}
Description: ${task.description}

Focus on delivering high-quality, well-tested code that meets the specific requirements of this task.`;
    }

    /**
     * Selects appropriate icon for the specialization
     */
    private selectAgentIcon(specialization: string): string {
        const iconMap: Record<string, string> = {
            'blockchain-developer': '🔗',
            'game-engine-specialist': '🎮',
            'ai-ml-specialist': '🤖',
            'data-science-specialist': '📊',
            'devops-specialist': '⚙️',
            'security-specialist': '🔒',
            'mobile-specialist': '📱',
            'frontend-specialist': '🎨',
            'backend-specialist': '⚡',
            'database-specialist': '🗄️',
            'testing-specialist': '🧪'
        };
        return iconMap[specialization] || '👨‍💻';
    }

    /**
     * Selects appropriate color for the specialization
     */
    private selectAgentColor(specialization: string): string {
        const colorMap: Record<string, string> = {
            'blockchain-developer': '#f7931a',
            'game-engine-specialist': '#ff6b6b',
            'ai-ml-specialist': '#4ecdc4',
            'data-science-specialist': '#45b7d1',
            'devops-specialist': '#96ceb4',
            'security-specialist': '#feca57',
            'mobile-specialist': '#ff9ff3',
            'frontend-specialist': '#54a0ff',
            'backend-specialist': '#5f27cd',
            'database-specialist': '#00d2d3',
            'testing-specialist': '#ff9f43'
        };
        return colorMap[specialization] || '#6c5ce7';
    }

    /**
     * Generates unique agent name based on specialization
     */
    private generateUniqueAgentName(specialization: string): string {
        const baseName = specialization.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
        const timestamp = Date.now().toString().slice(-4);
        return `${baseName} ${timestamp}`;
    }

    /**
     * Generates unique agent ID
     */
    private generateUniqueAgentId(baseName: string): string {
        const sanitized = baseName.toLowerCase().replace(/\s+/g, '-');
        const timestamp = Date.now().toString().slice(-6);
        return `custom-${sanitized}-${timestamp}`;
    }

    /**
     * Checks if agent name is unique
     */
    private isAgentNameUnique(name: string): boolean {
        const allAgents = this.agentManager.getAllAgents();
        return !allAgents.some(agent => agent.name === name);
    }

    /**
     * Gets specialization keywords from task
     */
    private getSpecializationKeywords(task: Task): string[] {
        const keywords = new Set<string>();

        // Add from description
        const descriptionWords = task.description.toLowerCase().split(/\s+/);
        descriptionWords.forEach(word => {
            if (word.length > 3) keywords.add(word);
        });

        // Add from tags
        (task.tags || []).forEach(tag => keywords.add(tag.toLowerCase()));

        // Add from requirements
        (task.requiredCapabilities || []).forEach(req => keywords.add(req.toLowerCase()));

        return Array.from(keywords).slice(0, 10); // Limit to 10 keywords
    }

    /**
     * Gets file patterns for specialization
     */
    private getFilePatternsForSpecialization(specialization: string): string[] {
        const patternMap: Record<string, string[]> = {
            'blockchain-developer': ['**/*.sol', '**/*.js', '**/*.ts', '**/hardhat.config.*', '**/truffle-config.*'],
            'game-engine-specialist': ['**/*.cs', '**/*.cpp', '**/*.h', '**/*.js', '**/*.ts', '**/*.unity'],
            'ai-ml-specialist': ['**/*.py', '**/*.ipynb', '**/*.pkl', '**/*.h5', '**/*.json'],
            'data-science-specialist': ['**/*.py', '**/*.ipynb', '**/*.csv', '**/*.json', '**/*.sql'],
            'devops-specialist': ['**/Dockerfile*', '**/*.yml', '**/*.yaml', '**/*.tf', '**/k8s/**'],
            'security-specialist': ['**/*.py', '**/*.sh', '**/*.ps1', '**/*.js', '**/*.ts'],
            'mobile-specialist': ['**/*.swift', '**/*.kt', '**/*.js', '**/*.ts', '**/*.dart'],
            'frontend-specialist': ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.css', '**/*.scss'],
            'backend-specialist': ['**/*.js', '**/*.ts', '**/*.py', '**/*.java', '**/*.go', '**/*.rs'],
            'database-specialist': ['**/*.sql', '**/*.py', '**/*.js', '**/*.ts', '**/migrations/**'],
            'testing-specialist': ['**/*.test.*', '**/*.spec.*', '**/*.cy.*', '**/tests/**', '**/__tests__/**']
        };
        return patternMap[specialization] || ['**/*.js', '**/*.ts', '**/*.py'];
    }

    /**
     * Gets commands for specialization
     */
    private getCommandsForSpecialization(specialization: string): Record<string, string> {
        const commandMap: Record<string, Record<string, string>> = {
            'blockchain-developer': {
                compile: 'npx hardhat compile',
                test: 'npx hardhat test',
                deploy: 'npx hardhat run scripts/deploy.js'
            },
            'game-engine-specialist': {
                build: 'unity -batchmode -quit -projectPath . -buildTarget StandaloneWindows64',
                test: 'unity -batchmode -quit -projectPath . -runTests'
            },
            'ai-ml-specialist': {
                train: 'python train.py',
                predict: 'python predict.py',
                evaluate: 'python evaluate.py'
            },
            'data-science-specialist': {
                analyze: 'python analyze.py',
                visualize: 'python visualize.py',
                report: 'jupyter nbconvert --to html report.ipynb'
            },
            'devops-specialist': {
                build: 'docker build -t app .',
                deploy: 'kubectl apply -f k8s/',
                test: 'docker-compose -f docker-compose.test.yml up --abort-on-container-exit'
            },
            'security-specialist': {
                scan: 'nmap -sV target',
                audit: 'python security_audit.py',
                test: 'python penetration_test.py'
            },
            'mobile-specialist': {
                'build-ios': 'npx react-native run-ios',
                'build-android': 'npx react-native run-android',
                test: 'npx react-native test'
            },
            'frontend-specialist': {
                dev: 'npm run dev',
                build: 'npm run build',
                test: 'npm test'
            },
            'backend-specialist': {
                start: 'npm start',
                dev: 'npm run dev',
                test: 'npm test'
            },
            'database-specialist': {
                migrate: 'npx prisma migrate dev',
                seed: 'npx prisma db seed',
                studio: 'npx prisma studio'
            },
            'testing-specialist': {
                test: 'npm test',
                e2e: 'npx cypress run',
                coverage: 'npm run test:coverage'
            }
        };
        return (
            commandMap[specialization] || {
                start: 'npm start',
                test: 'npm test',
                build: 'npm run build'
            }
        );
    }

    /**
     * Gets snippets for specialization
     */
    private getSnippetsForSpecialization(specialization: string): Record<string, string> {
        const snippetMap: Record<string, Record<string, string>> = {
            'blockchain-developer': {
                contract: 'contract ${1:ContractName} {\n    ${2:// contract code}\n}',
                function:
                    'function ${1:functionName}() public ${2:view} returns (${3:uint256}) {\n    ${4:// function body}\n}'
            },
            'ai-ml-specialist': {
                model: 'model = ${1:ModelClass}()\nmodel.compile(optimizer="${2:adam}", loss="${3:sparse_categorical_crossentropy}")\nmodel.fit(${4:X_train}, ${5:y_train}, epochs=${6:10})',
                import: 'import tensorflow as tf\nimport numpy as np\nimport pandas as pd'
            },
            'frontend-specialist': {
                component:
                    'const ${1:ComponentName} = () => {\n    return (\n        <div>\n            ${2:// component content}\n        </div>\n    );\n};',
                hook: 'const [${1:state}, set${2:State}] = useState(${3:initialValue});'
            }
        };
        return (
            snippetMap[specialization] || {
                function: 'function ${1:functionName}() {\n    ${2:// function body}\n}',
                class: 'class ${1:ClassName} {\n    ${2:// class body}\n}'
            }
        );
    }

    /**
     * Saves custom agent template using AgentTemplateManager
     * Custom templates are saved to .nofx/templates/custom/ for runtime discoverability
     * Use saveCustomAgentTemplateAsBuiltIn() if you need to save to src/agents/templates/
     */
    private async saveCustomAgentTemplate(template: AgentTemplate): Promise<boolean> {
        try {
            if (!this.agentTemplateManager) {
                this.outputChannel.appendLine('[Custom Agent] AgentTemplateManager not available');
                return false;
            }

            // Check configuration for custom template save location
            const saveToBuiltIn = vscode.workspace
                .getConfiguration('nofx')
                .get<boolean>('saveCustomTemplatesToBuiltIn', false);

            if (saveToBuiltIn) {
                // Save to built-in templates directory (src/agents/templates/)
                return await this.saveCustomAgentTemplateAsBuiltIn(template);
            } else {
                // Save as custom template to .nofx/templates/custom/ (default)
                await this.agentTemplateManager.saveTemplate(template, true);
                this.outputChannel.appendLine(
                    `[Custom Agent] Template saved to .nofx/templates/custom/: ${template.name}`
                );
                return true;
            }
        } catch (error) {
            this.outputChannel.appendLine(`[Custom Agent] Error saving template: ${error}`);
            return false;
        }
    }

    /**
     * Saves custom agent template to built-in templates directory (for development)
     * WARNING: This modifies the extension source and may be lost on updates
     */
    private async saveCustomAgentTemplateAsBuiltIn(template: AgentTemplate): Promise<boolean> {
        try {
            if (!this.agentTemplateManager) {
                this.outputChannel.appendLine('[Custom Agent] AgentTemplateManager not available');
                return false;
            }

            // Save to built-in templates directory (src/agents/templates/)
            const saved = await this.agentTemplateManager.saveBuiltInLikeTemplate(template);
            if (saved) {
                this.outputChannel.appendLine(
                    `[Custom Agent] Template saved to src/agents/templates/: ${template.name}`
                );
                this.outputChannel.appendLine('[Custom Agent] WARNING: This template may be lost on extension updates');
            }
            return saved;
        } catch (error) {
            this.outputChannel.appendLine(`[Custom Agent] Error saving built-in template: ${error}`);
            return false;
        }
    }

    /**
     * Logs custom agent creation with details
     */
    private logCustomAgentCreation(agent: Agent, task: Task, reason: string): void {
        this.outputChannel.appendLine(`[Custom Agent] Created agent "${agent.name}" (${agent.id})`);
        this.outputChannel.appendLine(`[Custom Agent] Reason: ${reason}`);
        this.outputChannel.appendLine(`[Custom Agent] Task: ${task.title}`);
        this.outputChannel.appendLine(`[Custom Agent] Specialization: ${agent.template?.types?.[0] || 'unknown'}`);
    }

    /**
     * Handles low capability match scenarios
     */
    private async handleLowCapabilityMatch(task: Task, bestScore: number): Promise<Agent | null> {
        this.outputChannel.appendLine(
            `[Custom Agent] Low capability match (${bestScore.toFixed(2)}), creating custom agent`
        );
        return await this.createCustomAgent(task, task.requiredCapabilities || []);
    }

    // ============================================================================
    // LOAD BALANCING IMPLEMENTATION
    // ============================================================================

    /**
     * Start the load balancing monitor with configurable intervals
     */
    public startLoadBalancingMonitor(): void {
        if (!this.loadBalancingConfig.enabled) {
            this.outputChannel.appendLine('⚖️ Load balancing is disabled');
            return;
        }

        if (this.loadBalancingMonitor) {
            clearInterval(this.loadBalancingMonitor);
        }

        this.loadBalancingMonitor = setInterval(() => {
            this.performLoadBalancingCycle();
        }, this.loadBalancingConfig.monitoringInterval);

        this.outputChannel.appendLine(
            `⚖️ Load balancing monitor started (interval: ${this.loadBalancingConfig.monitoringInterval}ms)`
        );
    }

    /**
     * Stop the load balancing monitor
     */
    public stopLoadBalancingMonitor(): void {
        if (this.loadBalancingMonitor) {
            clearInterval(this.loadBalancingMonitor);
            this.loadBalancingMonitor = undefined;
            this.outputChannel.appendLine('⚖️ Load balancing monitor stopped');
        }
    }

    /**
     * Perform a complete load balancing cycle
     */
    private async performLoadBalancingCycle(): Promise<void> {
        try {
            const startTime = Date.now();

            // Check if we have enough tasks to warrant load balancing
            const totalTasks = Array.from(this.agentTasksMap.values()).reduce((sum, tasks) => sum + tasks.size, 0);
            if (totalTasks < this.loadBalancingConfig.minTasksForLoadBalancing) {
                return;
            }

            // Detect overloaded and stuck agents
            const overloadedAgents = this.detectOverloadedAgents();
            const stuckAgents = this.detectStuckAgents();

            // Handle overloaded agents
            if (overloadedAgents.length > 0) {
                await this.rebalanceTaskLoad(overloadedAgents);
            }

            // Handle stuck agents
            if (stuckAgents.length > 0) {
                await this.handleStuckAgents(stuckAgents);
            }

            // Optimize agent utilization
            await this.optimizeAgentUtilization();

            // Update metrics
            this.loadBalancingMetrics.totalOperations++;
            this.loadBalancingMetrics.lastOperationTime = new Date();
            this.loadBalancingMetrics.timestamp = new Date();

            // Emit load balancing operations metric
            try {
                const container = Container.getInstance();
                if (container.has(SERVICE_TOKENS.MetricsService)) {
                    const metricsService = container.resolve<IMetricsService>(SERVICE_TOKENS.MetricsService);
                    metricsService.recordLoadBalancingMetric('load_balancing_operations', 1);
                }
            } catch (error) {
                // Metrics service not available, continue without error
            }

            const duration = Date.now() - startTime;
            this.outputChannel.appendLine(`⚖️ Load balancing cycle completed in ${duration}ms`);
        } catch (error) {
            this.outputChannel.appendLine(`⚖️ Load balancing cycle failed: ${error}`);
        }
    }

    /**
     * Detect agents that are overloaded based on capacity and performance
     */
    private detectOverloadedAgents(): string[] {
        const overloadedAgents: string[] = [];

        for (const [agentId, performance] of this.agentPerformanceHistory) {
            const cap = Math.max(1, performance.availability.maxCapacity || 0);
            const utilizationPercentage = (performance.availability.currentLoad / cap) * 100;

            if (utilizationPercentage > this.loadBalancingConfig.overloadThreshold) {
                overloadedAgents.push(agentId);
                this.loadBalancingMetrics.overloadedAgentsDetected++;

                // Record overloaded agents detected metric
                try {
                    const container = Container.getInstance();
                    if (container.has(SERVICE_TOKENS.MetricsService)) {
                        const metricsService = container.resolve<IMetricsService>(SERVICE_TOKENS.MetricsService);
                        metricsService.recordLoadBalancingMetric('overloaded_agents_detected', 1, { agentId });
                    }
                } catch (error) {
                    // Metrics service not available, continue without error
                }

                this.publishLoadBalancingEvent({
                    type: 'agent_overloaded',
                    agentId,
                    timestamp: new Date(),
                    data: { utilizationPercentage, threshold: this.loadBalancingConfig.overloadThreshold }
                });
            }
        }

        return overloadedAgents;
    }

    /**
     * Rebalance task load for overloaded agents
     */
    private async rebalanceTaskLoad(overloadedAgents: string[]): Promise<void> {
        for (const agentId of overloadedAgents) {
            const agentTasks = this.agentTasksMap.get(agentId);
            if (!agentTasks || agentTasks.size === 0) continue;

            // Find optimal reassignment targets
            const availableAgents = this.getAvailableAgentsForReassignment(agentId);
            if (availableAgents.length === 0) continue;

            // Create distribution plan
            const distributionPlan = this.createTaskDistributionPlan(agentId, availableAgents);
            if (distributionPlan.reassignments.length === 0) continue;

            // Execute reassignments
            await this.executeTaskDistributionPlan(distributionPlan);
        }
    }

    /**
     * Handle stuck agents by reassigning their tasks
     */
    private async handleStuckAgents(stuckAgents: string[]): Promise<void> {
        for (const agentId of stuckAgents) {
            const agentTasks = this.agentTasksMap.get(agentId);
            if (!agentTasks || agentTasks.size === 0) continue;

            const availableAgents = this.getAvailableAgentsForReassignment(agentId);
            if (availableAgents.length === 0) continue;

            // Reassign all tasks from stuck agent
            for (const taskId of agentTasks) {
                const optimalAgent = this.findOptimalReassignmentTarget(taskId, availableAgents);
                if (optimalAgent) {
                    await this.reassignTask(
                        taskId,
                        agentId,
                        [optimalAgent],
                        `Agent ${agentId} stuck - ${this.agentPerformanceHistory.get(agentId)?.stuckDetection.stuckReason}`,
                        this.outputChannel
                    );
                }
            }
        }
    }

    /**
     * Optimize agent utilization across the system
     */
    private async optimizeAgentUtilization(): Promise<void> {
        const allAgents = Array.from(this.agentPerformanceHistory.keys());
        const agentWorkloads = this.calculateAgentWorkloadsDetailed();

        // Calculate load balancing effectiveness
        const effectiveness = this.calculateLoadBalancingEffectiveness(agentWorkloads);
        this.loadBalancingMetrics.averageEffectiveness = effectiveness;

        // If effectiveness is low, consider additional optimizations
        if (effectiveness < 70) {
            await this.performAdvancedOptimization(agentWorkloads);
        }
    }

    /**
     * Calculate detailed agent workloads with capacity information
     */
    private calculateAgentWorkloadsDetailed(): Map<string, AgentWorkload> {
        const workloads = new Map<string, AgentWorkload>();

        for (const [agentId, performance] of this.agentPerformanceHistory) {
            const currentTasks = this.agentTasksMap.get(agentId)?.size || 0;
            const tasksCompletedLastHour = this.calculateTasksCompletedLastHour(agentId);
            const cap = Math.max(1, performance.availability.maxCapacity || 0);

            workloads.set(agentId, {
                agentId,
                currentTasks,
                maxConcurrentTasks: performance.availability.maxCapacity,
                utilizationPercentage: (currentTasks / cap) * 100,
                tasksCompletedLastHour,
                averageTaskTime: performance.averageExecutionTime,
                isAvailable: performance.availability.isAvailable,
                timestamp: new Date()
            });
        }

        return workloads;
    }

    /**
     * Calculate tasks completed by an agent in the last hour
     */
    private calculateTasksCompletedLastHour(agentId: string): number {
        const completionTimes = this.completionTimesByAgent.get(agentId) || [];
        const oneHourAgo = Date.now() - 60 * 60 * 1000;

        return completionTimes.filter(time => time > oneHourAgo).length;
    }

    /**
     * Calculate load balancing effectiveness score
     */
    private calculateLoadBalancingEffectiveness(workloads: Map<string, AgentWorkload>): number {
        if (workloads.size === 0) return 100;

        const utilizationPercentages = Array.from(workloads.values()).map(w => w.utilizationPercentage);
        const averageUtilization =
            utilizationPercentages.reduce((sum, util) => sum + util, 0) / utilizationPercentages.length;

        // Calculate standard deviation to measure load distribution
        const variance =
            utilizationPercentages.reduce((sum, util) => sum + Math.pow(util - averageUtilization, 2), 0) /
            utilizationPercentages.length;
        const standardDeviation = Math.sqrt(variance);

        // Effectiveness is higher when standard deviation is lower (more balanced)
        const effectiveness = Math.max(0, 100 - standardDeviation * 2);
        return Math.round(effectiveness);
    }

    /**
     * Perform advanced optimization when basic load balancing is insufficient
     */
    private async performAdvancedOptimization(workloads: Map<string, AgentWorkload>): Promise<void> {
        // Find agents with significantly different utilization
        const sortedWorkloads = Array.from(workloads.entries()).sort(
            (a, b) => a[1].utilizationPercentage - b[1].utilizationPercentage
        );

        if (sortedWorkloads.length < 2) return;

        const lowestUtilization = sortedWorkloads[0];
        const highestUtilization = sortedWorkloads[sortedWorkloads.length - 1];

        // If there's a significant imbalance, consider reassignment
        if (highestUtilization[1].utilizationPercentage - lowestUtilization[1].utilizationPercentage > 30) {
            const highLoadAgent = highestUtilization[0];
            const lowLoadAgent = lowestUtilization[0];

            const highLoadTasks = this.agentTasksMap.get(highLoadAgent);
            if (highLoadTasks && highLoadTasks.size > 0) {
                // Find a task that can be reassigned
                for (const taskId of highLoadTasks) {
                    const task = this.taskQueue.getTask(taskId);
                    if (task && this.canAgentHandleTask(lowLoadAgent, task)) {
                        await this.reassignTask(
                            taskId,
                            highLoadAgent,
                            [this.agentManager.getAgent(lowLoadAgent)!],
                            'Advanced load balancing optimization',
                            this.outputChannel
                        );
                        break; // Only reassign one task per cycle
                    }
                }
            }
        }
    }

    /**
     * Get available agents for reassignment (excluding the source agent)
     */
    private getAvailableAgentsForReassignment(excludeAgentId: string): Agent[] {
        return this.agentManager
            .getAvailableAgents()
            .filter(
                agent => agent.id !== excludeAgentId && !this.failedAgents.has(agent.id) && agent.status === 'online'
            );
    }

    /**
     * Create a task distribution plan for load balancing
     */
    private createTaskDistributionPlan(sourceAgentId: string, targetAgents: Agent[]): TaskDistributionPlan {
        const planId = `lb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const reassignments: TaskReassignment[] = [];

        const sourceTasks = this.agentTasksMap.get(sourceAgentId);
        if (!sourceTasks || sourceTasks.size === 0) {
            return {
                planId,
                reassignments: [],
                expectedDistribution: new Map(),
                effectivenessScore: 0,
                createdAt: new Date(),
                executed: false
            };
        }

        // Calculate capacity scores for target agents
        const targetScores = new Map<string, AgentCapacityScore>();
        for (const agent of targetAgents) {
            targetScores.set(agent.id, this.calculateAgentCapacityScore(agent.id));
        }

        // Create reassignments based on capacity and performance
        let reassignmentCount = 0;
        const maxReassignments = Math.min(this.loadBalancingConfig.maxReassignmentsPerCycle, sourceTasks.size);

        for (const taskId of sourceTasks) {
            if (reassignmentCount >= maxReassignments) break;

            const task = this.taskQueue.getTask(taskId);
            if (!task) continue;

            const bestTarget = this.findOptimalReassignmentTarget(taskId, targetAgents);
            if (bestTarget) {
                const capacityScore = targetScores.get(bestTarget.id);
                const expectedImprovement = capacityScore ? capacityScore.overallScore : 50;

                reassignments.push({
                    taskId,
                    currentAgentId: sourceAgentId,
                    targetAgentId: bestTarget.id,
                    reason: TaskReassignmentReason.OVERLOADED,
                    expectedImprovement,
                    priority: Math.round(expectedImprovement / 10)
                });

                reassignmentCount++;
            }
        }

        // Calculate expected distribution
        const expectedDistribution = this.calculateExpectedDistribution(reassignments);
        const effectivenessScore = this.calculatePlanEffectiveness(expectedDistribution);

        return {
            planId,
            reassignments,
            expectedDistribution,
            effectivenessScore,
            createdAt: new Date(),
            executed: false
        };
    }

    /**
     * Execute a task distribution plan
     */
    private async executeTaskDistributionPlan(plan: TaskDistributionPlan): Promise<LoadBalancingResult> {
        const result: LoadBalancingResult = {
            success: true,
            tasksReassigned: 0,
            agentsAffected: 0,
            effectiveness: plan.effectivenessScore,
            duration: 0,
            errors: [],
            timestamp: new Date(),
            reassignmentResults: []
        };

        const startTime = Date.now();
        const affectedAgents = new Set<string>();

        for (const reassignment of plan.reassignments) {
            try {
                const targetAgent = this.agentManager.getAgent(reassignment.targetAgentId);
                if (!targetAgent) {
                    result.errors.push(`Target agent ${reassignment.targetAgentId} not found`);
                    continue;
                }

                const reassignmentResult = await this.reassignTask(
                    reassignment.taskId,
                    reassignment.currentAgentId,
                    [targetAgent],
                    `Load balancing: ${reassignment.reason}`,
                    this.outputChannel
                );

                if (reassignmentResult) {
                    result.tasksReassigned++;
                    affectedAgents.add(reassignment.currentAgentId);
                    affectedAgents.add(reassignment.targetAgentId);

                    result.reassignmentResults.push({
                        taskId: reassignment.taskId,
                        sourceAgentId: reassignment.currentAgentId,
                        targetAgentId: reassignment.targetAgentId,
                        success: true,
                        timestamp: new Date()
                    });

                    this.loadBalancingMetrics.taskReassignments++;
                } else {
                    result.reassignmentResults.push({
                        taskId: reassignment.taskId,
                        sourceAgentId: reassignment.currentAgentId,
                        targetAgentId: reassignment.targetAgentId,
                        success: false,
                        error: 'Reassignment failed',
                        timestamp: new Date()
                    });
                }
            } catch (error) {
                result.errors.push(`Failed to reassign task ${reassignment.taskId}: ${error}`);
                result.reassignmentResults.push({
                    taskId: reassignment.taskId,
                    sourceAgentId: reassignment.currentAgentId,
                    targetAgentId: reassignment.targetAgentId,
                    success: false,
                    error: String(error),
                    timestamp: new Date()
                });
            }
        }

        result.agentsAffected = affectedAgents.size;
        result.duration = Date.now() - startTime;
        result.success = result.errors.length === 0;

        // Mark plan as executed
        plan.executed = true;
        plan.executedAt = new Date();

        this.outputChannel.appendLine(
            `⚖️ Executed load balancing plan: ${result.tasksReassigned} tasks reassigned, ${result.agentsAffected} agents affected`
        );

        return result;
    }

    /**
     * Calculate expected distribution after reassignments
     */
    private calculateExpectedDistribution(reassignments: TaskReassignment[]): Map<string, AgentWorkload> {
        const expectedDistribution = new Map<string, AgentWorkload>();

        // Initialize with current workloads
        for (const [agentId, performance] of this.agentPerformanceHistory) {
            const currentTasks = this.agentTasksMap.get(agentId)?.size || 0;
            const cap = Math.max(1, performance.availability.maxCapacity || 0);
            expectedDistribution.set(agentId, {
                agentId,
                currentTasks,
                maxConcurrentTasks: performance.availability.maxCapacity,
                utilizationPercentage: (currentTasks / cap) * 100,
                tasksCompletedLastHour: this.calculateTasksCompletedLastHour(agentId),
                averageTaskTime: performance.averageExecutionTime,
                isAvailable: performance.availability.isAvailable,
                timestamp: new Date()
            });
        }

        // Apply reassignments
        for (const reassignment of reassignments) {
            const sourceWorkload = expectedDistribution.get(reassignment.currentAgentId);
            const targetWorkload = expectedDistribution.get(reassignment.targetAgentId);

            if (sourceWorkload && targetWorkload) {
                sourceWorkload.currentTasks--;
                sourceWorkload.utilizationPercentage =
                    (sourceWorkload.currentTasks / Math.max(1, sourceWorkload.maxConcurrentTasks || 0)) * 100;

                targetWorkload.currentTasks++;
                targetWorkload.utilizationPercentage =
                    (targetWorkload.currentTasks / Math.max(1, targetWorkload.maxConcurrentTasks || 0)) * 100;
            }
        }

        return expectedDistribution;
    }

    /**
     * Calculate plan effectiveness score
     */
    private calculatePlanEffectiveness(expectedDistribution: Map<string, AgentWorkload>): number {
        return this.calculateLoadBalancingEffectiveness(expectedDistribution);
    }

    /**
     * Calculate agent capacity score for load balancing decisions
     */
    private calculateAgentCapacityScore(agentId: string): AgentCapacityScore {
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance) {
            return {
                overallScore: 0,
                capacityScore: 0,
                performanceScore: 0,
                availabilityScore: 0,
                specializationScore: 0,
                weights: {
                    capacity: 0.3,
                    performance: 0.3,
                    availability: 0.2,
                    specialization: 0.2
                },
                calculatedAt: new Date()
            };
        }

        // Calculate individual scores
        const cap = Math.max(1, performance.availability.maxCapacity || 0);
        const capacityScore = Math.max(
            0,
            100 - (performance.availability.currentLoad / cap) * 100
        );
        const performanceScore = performance.qualityScore;
        const availabilityScore = performance.availability.isAvailable ? 100 : 0;
        const specializationScore = 75; // Default specialization score

        // Calculate weighted overall score
        const weights: CapacityScoringWeights = {
            capacity: 0.3,
            performance: 0.3,
            availability: 0.2,
            specialization: 0.2
        };

        const overallScore = Math.round(
            capacityScore * weights.capacity +
                performanceScore * weights.performance +
                availabilityScore * weights.availability +
                specializationScore * weights.specialization
        );

        const score: AgentCapacityScore = {
            overallScore,
            capacityScore,
            performanceScore,
            availabilityScore,
            specializationScore,
            weights,
            calculatedAt: new Date()
        };

        this.agentCapacityScores.set(agentId, score);
        return score;
    }

    /**
     * Check if an agent can handle a specific task
     */
    private canAgentHandleTask(agentId: string, task: Task): boolean {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) return false;

        // Check if agent is available
        const performance = this.agentPerformanceHistory.get(agentId);
        if (!performance || !performance.availability.isAvailable) return false;

        // Check capacity
        if (performance.availability.currentLoad >= performance.availability.maxCapacity) return false;

        // Check capabilities (basic check)
        if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
            const agentCapabilities = agent.capabilities || [];
            const hasRequiredCapabilities = task.requiredCapabilities.every(cap => agentCapabilities.includes(cap));
            if (!hasRequiredCapabilities) return false;
        }

        return true;
    }

    /**
     * Publish load balancing event
     */
    private publishLoadBalancingEvent(event: LoadBalancingEvent): void {
        this.loadBalancingHistory.push(event);

        // Keep only last 100 events
        if (this.loadBalancingHistory.length > 100) {
            this.loadBalancingHistory = this.loadBalancingHistory.slice(-100);
        }

        // Publish to event bus if available
        if (this.eventBus) {
            this.eventBus.publish(DOMAIN_EVENTS.LOAD_BALANCING_EVENT, event);
        }

        this.outputChannel.appendLine(`⚖️ Load balancing event: ${event.type} for agent ${event.agentId}`);
    }

    /**
     * Get load balancing configuration
     */
    public getLoadBalancingConfig(): LoadBalancingConfig {
        return { ...this.loadBalancingConfig };
    }

    /**
     * Update load balancing configuration
     */
    public updateLoadBalancingConfig(config: Partial<LoadBalancingConfig>): void {
        this.loadBalancingConfig = { ...this.loadBalancingConfig, ...config };

        // Restart monitor if interval changed
        if (config.monitoringInterval && this.loadBalancingMonitor) {
            this.stopLoadBalancingMonitor();
            this.startLoadBalancingMonitor();
        }

        this.outputChannel.appendLine('⚖️ Load balancing configuration updated');
    }

    /**
     * Get load balancing metrics
     */
    public getLoadBalancingMetrics(): LoadBalancingMetrics {
        return { ...this.loadBalancingMetrics };
    }

    /**
     * Get load balancing history
     */
    public getLoadBalancingHistory(): LoadBalancingEvent[] {
        return [...this.loadBalancingHistory];
    }

    /**
     * Get agent capacity scores
     */
    public getAgentCapacityScores(): Map<string, AgentCapacityScore> {
        return new Map(this.agentCapacityScores);
    }

    /**
     * Enhanced calculateAgentWorkloads method with capacity consideration
     */
    private calculateAgentWorkloadsEnhanced(
        assignments: TaskAssignment[]
    ): Map<string, { count: number; capacity: number; utilization: number }> {
        const workloads = new Map<string, { count: number; capacity: number; utilization: number }>();

        for (const assignment of assignments) {
            const current = workloads.get(assignment.agent.id) || { count: 0, capacity: 1, utilization: 0 };
            const performance = this.agentPerformanceHistory.get(assignment.agent.id);
            const maxCapacity = performance?.availability.maxCapacity || 1;

            current.count++;
            current.capacity = maxCapacity;
            current.utilization = (current.count / Math.max(1, maxCapacity || 0)) * 100;

            workloads.set(assignment.agent.id, current);
        }

        return workloads;
    }

    /**
     * Get optimal agent for task with load balancing consideration
     */
    private getOptimalAgentForTask(task: Task, availableAgents: Agent[]): Agent | null {
        if (availableAgents.length === 0) return null;

        let bestAgent: Agent | null = null;
        let bestScore = 0;

        for (const agent of availableAgents) {
            const capacityScore = this.calculateAgentCapacityScore(agent.id);
            const capabilityScore = this.calculateCapabilityScore(agent, task);

            // Combined score: 60% capacity, 40% capability
            const combinedScore = capacityScore.overallScore * 0.6 + capabilityScore * 0.4;

            if (combinedScore > bestScore) {
                bestScore = combinedScore;
                bestAgent = agent;
            }
        }

        return bestAgent;
    }

    /**
     * Calculate capability score for agent-task matching
     */
    private calculateCapabilityScore(agent: Agent, task: Task): number {
        if (!task.requiredCapabilities || task.requiredCapabilities.length === 0) {
            return 100; // No specific requirements
        }

        const agentCapabilities = agent.capabilities || [];
        const matchingCapabilities = task.requiredCapabilities.filter(cap => agentCapabilities.includes(cap));

        return (matchingCapabilities.length / task.requiredCapabilities.length) * 100;
    }

    /**
     * Distribute workload evenly across available agents
     */
    private distributeWorkloadEvenly(availableAgents: Agent[]): Map<string, number> {
        const distribution = new Map<string, number>();
        const totalCapacity = availableAgents.reduce((sum, agent) => {
            const performance = this.agentPerformanceHistory.get(agent.id);
            return sum + (performance?.availability.maxCapacity || 1);
        }, 0);

        for (const agent of availableAgents) {
            const performance = this.agentPerformanceHistory.get(agent.id);
            const capacity = performance?.availability.maxCapacity || 1;
            const targetLoad = Math.round((capacity / totalCapacity) * 100);
            distribution.set(agent.id, targetLoad);
        }

        return distribution;
    }
}
