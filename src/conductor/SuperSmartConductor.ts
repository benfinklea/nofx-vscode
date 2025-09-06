import * as vscode from 'vscode';
import * as path from 'path';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { Agent } from '../agents/types';
import {
    CodebaseAnalyzer,
    CodeComponent,
    AgentPerformance,
    ProjectArchitecture,
    QualityMetrics,
    CircularDependency
} from '../intelligence';

/**
 * Super Smart Conductor - VP-level intelligence for orchestrating development
 */
export class SuperSmartConductor {
    private agentManager: AgentManager;
    private taskQueue: TaskQueue;
    private terminal: vscode.Terminal | undefined;
    private outputChannel: vscode.OutputChannel;
    private claudePath: string;
    private codebaseAnalyzer: CodebaseAnalyzer;
    private context: vscode.ExtensionContext | undefined;

    // VP-level intelligence data structures
    private codebaseKnowledge: Map<string, CodeComponent> = new Map();
    private agentPerformanceHistory: Map<string, AgentPerformance> = new Map();
    private projectArchitecture: ProjectArchitecture | undefined;
    private qualityMetrics: QualityMetrics | undefined;

    constructor(agentManager: AgentManager, taskQueue: TaskQueue, context?: vscode.ExtensionContext) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.context = context;
        this.claudePath = vscode.workspace.getConfiguration('nofx').get<string>('claudePath') || 'claude';
        this.outputChannel = vscode.window.createOutputChannel('NofX VP Brain 🧠');
        this.codebaseAnalyzer = new CodebaseAnalyzer(this.outputChannel);
    }

    /**
     * Set the extension context
     */
    setContext(context: vscode.ExtensionContext): void {
        this.context = context;
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
        this.initializeVPConductor();
    }

    private initializeVPConductor() {
        if (!this.terminal) return;

        this.terminal.sendText('clear');
        this.terminal.sendText('echo "🧠 NofX Super Smart VP Conductor v3.0"');
        this.terminal.sendText('echo "==========================================="');
        this.terminal.sendText('echo "Senior Engineering VP with Deep Intelligence"');
        this.terminal.sendText('echo "==========================================="');

        // Start Claude with VP-level prompt using --append-system-prompt
        const systemPrompt = this.getVPSystemPrompt().replace(/'/g, "'\\''"); // Escape single quotes for shell
        this.terminal.sendText(`${this.claudePath} --append-system-prompt '${systemPrompt}'`);

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

# EXAMPLE INTERACTION

User: "Build a real-time chat application"

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

# REMEMBER
You are the VP - you don't just coordinate, you LEAD. You make architectural decisions, enforce quality standards, and ensure the team delivers exceptional software. You have opinions based on experience and aren't afraid to push back on bad ideas.

When you see problems, you say:
"That approach will cause problems at scale. Here's a better architecture..."
"We're accumulating technical debt. Let's refactor now before it gets worse."
"This needs better error handling. What happens when the service is down?"

You are proactive, strategic, and always thinking about the bigger picture.`;
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
        performance.averageExecutionTime = (performance.averageExecutionTime * (performance.totalTasks - 1) + timeSpent) / performance.totalTasks;
        performance.lastActive = new Date();

        // Update quality score based on success rate
        const successRate = (performance.completedTasks / performance.totalTasks) * 100;
        performance.qualityScore = Math.round(successRate);

        // Determine specialization based on task type
        if (task.type) {
            performance.specialization = task.type;
        }

        this.outputChannel.appendLine(`📊 Updated performance for Agent ${agentId}: ${successRate.toFixed(1)}% success rate`);
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
            'feature': 120, // 2 hours
            'bugfix': 60,   // 1 hour
            'refactor': 90, // 1.5 hours
            'test': 45,     // 45 minutes
            'documentation': 30 // 30 minutes
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
            const highSeverity = circularDeps.filter(c => c.severity === 'high');
            const mediumSeverity = circularDeps.filter(c => c.severity === 'medium');

            if (highSeverity.length > 0) {
                suggestions.push(`🔴 Critical: ${highSeverity.length} high-severity circular dependencies detected. Immediate refactoring needed.`);
            }
            if (mediumSeverity.length > 0) {
                suggestions.push(`🟡 Warning: ${mediumSeverity.length} medium-severity circular dependencies. Consider dependency injection.`);
            }
        }

        // Check for high complexity using the analyzer
        const highComplexity = this.codebaseAnalyzer.findComplexComponents(20);
        if (highComplexity.length > 0) {
            const topComplex = highComplexity.slice(0, 3);
            suggestions.push(`📊 High complexity in ${highComplexity.length} files. Top offenders: ${topComplex.map(p => path.basename(p)).join(', ')}`);
        }

        // Check for missing tests using the analyzer
        const untested = this.codebaseAnalyzer.findUntestedComponents();
        if (untested.length > 0) {
            const percentage = ((this.codebaseKnowledge.size - untested.length) / this.codebaseKnowledge.size * 100).toFixed(1);
            suggestions.push(`🧪 Test coverage: ${percentage}%. ${untested.length} components lack tests.`);
        }

        // Additional quality checks from metrics
        if (this.qualityMetrics) {
            if (this.qualityMetrics.averageComplexity > 15) {
                suggestions.push(`⚠️ Average complexity (${this.qualityMetrics.averageComplexity.toFixed(1)}) exceeds threshold. Consider breaking down complex functions.`);
            }
            if (this.qualityMetrics.technicalDebt > 50) {
                suggestions.push(`💸 Technical debt score: ${this.qualityMetrics.technicalDebt}. Schedule refactoring sprint.`);
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
}
