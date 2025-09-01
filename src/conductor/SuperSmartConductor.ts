import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { Agent } from '../agents/types';

/**
 * Super Smart Conductor - VP-level intelligence for orchestrating development
 */
export class SuperSmartConductor {
    private agentManager: AgentManager;
    private taskQueue: TaskQueue;
    private terminal: vscode.Terminal | undefined;
    private outputChannel: vscode.OutputChannel;
    private claudePath: string;
    
    // VP-level intelligence data structures
    private codebaseKnowledge: Map<string, CodeComponent> = new Map();
    private agentPerformanceHistory: Map<string, AgentPerformance> = new Map();
    private projectArchitecture: ProjectArchitecture = { components: [], dependencies: [] };
    private qualityMetrics: QualityMetrics = { coverage: 0, complexity: 0, techDebt: 0 };
    
    constructor(agentManager: AgentManager, taskQueue: TaskQueue) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.claudePath = vscode.workspace.getConfiguration('nofx').get<string>('claudePath') || 'claude';
        this.outputChannel = vscode.window.createOutputChannel('NofX VP Brain 🧠');
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
        this.outputChannel.appendLine('🔍 Analyzing codebase structure...');
        
        const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx}', '**/node_modules/**');
        
        for (const file of files) {
            const document = await vscode.workspace.openTextDocument(file);
            const content = document.getText();
            
            // Extract components, dependencies, patterns
            this.extractCodeIntelligence(file.fsPath, content);
        }
        
        this.outputChannel.appendLine(`✅ Analyzed ${files.length} files`);
        this.outputChannel.appendLine(`📊 Found ${this.codebaseKnowledge.size} components`);
    }
    
    /**
     * Extract intelligence from code
     */
    private extractCodeIntelligence(filePath: string, content: string) {
        // Extract imports/dependencies
        const imports = content.match(/import .* from ['"](.*)['"];/g) || [];
        
        // Extract component/class definitions
        const components = content.match(/(?:class|function|const) (\w+)/g) || [];
        
        // Store in knowledge graph
        this.codebaseKnowledge.set(filePath, {
            path: filePath,
            imports: imports.map(i => this.parseImport(i)),
            exports: components.map(c => this.parseComponent(c)),
            complexity: this.calculateComplexity(content),
            lastModified: new Date()
        });
    }
    
    /**
     * Calculate code complexity
     */
    private calculateComplexity(content: string): number {
        // Simple complexity calculation
        const conditions = (content.match(/if|else|switch|case|while|for/g) || []).length;
        const functions = (content.match(/function|=>/g) || []).length;
        return conditions + functions;
    }
    
    /**
     * Track agent performance
     */
    trackAgentPerformance(agentId: string, task: any, success: boolean, timeSpent: number) {
        if (!this.agentPerformanceHistory.has(agentId)) {
            this.agentPerformanceHistory.set(agentId, {
                tasksCompleted: 0,
                successRate: 0,
                averageTime: 0,
                strengths: [],
                weaknesses: []
            });
        }
        
        const performance = this.agentPerformanceHistory.get(agentId)!;
        performance.tasksCompleted++;
        performance.successRate = (performance.successRate * (performance.tasksCompleted - 1) + (success ? 100 : 0)) / performance.tasksCompleted;
        performance.averageTime = (performance.averageTime * (performance.tasksCompleted - 1) + timeSpent) / performance.tasksCompleted;
        
        // Track strengths and weaknesses
        if (success && timeSpent < performance.averageTime) {
            performance.strengths.push(task.type);
        } else if (!success || timeSpent > performance.averageTime * 1.5) {
            performance.weaknesses.push(task.type);
        }
        
        this.outputChannel.appendLine(`📊 Updated performance for Agent ${agentId}: ${performance.successRate}% success rate`);
    }
    
    /**
     * Predict task completion time based on history
     */
    predictTaskTime(task: any): number {
        // Look for similar tasks in history
        const similarTasks = Array.from(this.agentPerformanceHistory.values())
            .filter(p => p.strengths.includes(task.type))
            .map(p => p.averageTime);
        
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
        
        // Check for circular dependencies
        const circularDeps = this.findCircularDependencies();
        if (circularDeps.length > 0) {
            suggestions.push(`Circular dependencies detected: ${circularDeps.join(', ')}. Consider dependency injection.`);
        }
        
        // Check for high complexity
        const highComplexity = Array.from(this.codebaseKnowledge.values())
            .filter(c => c.complexity > 20);
        if (highComplexity.length > 0) {
            suggestions.push(`High complexity in ${highComplexity.length} files. Consider refactoring.`);
        }
        
        // Check for missing tests
        const untested = this.findUntestedComponents();
        if (untested.length > 0) {
            suggestions.push(`${untested.length} components lack tests. Add test coverage.`);
        }
        
        return suggestions;
    }
    
    /**
     * Find circular dependencies
     */
    private findCircularDependencies(): string[] {
        // Simplified circular dependency detection
        const circular: string[] = [];
        
        for (const [path, component] of this.codebaseKnowledge) {
            for (const imp of component.imports) {
                const importedComponent = this.codebaseKnowledge.get(imp);
                if (importedComponent?.imports.includes(path)) {
                    circular.push(`${path} <-> ${imp}`);
                }
            }
        }
        
        return circular;
    }
    
    /**
     * Find components without tests
     */
    private findUntestedComponents(): string[] {
        const components = Array.from(this.codebaseKnowledge.keys())
            .filter(path => !path.includes('.test.') && !path.includes('.spec.'));
        
        const tested = new Set(
            Array.from(this.codebaseKnowledge.keys())
                .filter(path => path.includes('.test.') || path.includes('.spec.'))
                .map(path => path.replace(/\.(test|spec)\./, '.'))
        );
        
        return components.filter(c => !tested.has(c));
    }
    
    private parseImport(importStatement: string): string {
        const match = importStatement.match(/from ['"](.*)['"];/);
        return match ? match[1] : '';
    }
    
    private parseComponent(componentDef: string): string {
        const match = componentDef.match(/(?:class|function|const) (\w+)/);
        return match ? match[1] : '';
    }
}

// Type definitions for VP intelligence
interface CodeComponent {
    path: string;
    imports: string[];
    exports: string[];
    complexity: number;
    lastModified: Date;
}

interface AgentPerformance {
    tasksCompleted: number;
    successRate: number;
    averageTime: number;
    strengths: string[];
    weaknesses: string[];
}

interface ProjectArchitecture {
    components: string[];
    dependencies: string[][];
}

interface QualityMetrics {
    coverage: number;
    complexity: number;
    techDebt: number;
}