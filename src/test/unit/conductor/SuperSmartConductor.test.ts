import * as vscode from 'vscode';
import * as path from 'path';
import { SuperSmartConductor } from '../../../conductor/SuperSmartConductor';
import { AgentManager } from '../../../agents/AgentManager';
import { TaskQueue } from '../../../tasks/TaskQueue';
import { CodebaseAnalyzer } from '../../../intelligence/CodebaseAnalyzer';
import { Agent, AgentStatus } from '../../../agents/types';
import {
    CodeComponent,
    AgentPerformance,
    ProjectArchitecture,
    QualityMetrics,
    CircularDependency
} from '../../../intelligence/types';

// Mock all dependencies
jest.mock('../../../agents/AgentManager');
jest.mock('../../../tasks/TaskQueue');
jest.mock('../../../intelligence/CodebaseAnalyzer');

// Mock VS Code API
const mockTerminal = {
    show: jest.fn(),
    sendText: jest.fn(),
    dispose: jest.fn(),
    name: 'NofX VP Conductor'
};

const mockOutputChannel: vscode.OutputChannel = {
    name: 'NofX VP Brain',
    append: jest.fn(),
    appendLine: jest.fn(),
    replace: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn()
} as any;

const mockContext = {
    subscriptions: [],
    extensionPath: '/mock/path',
    globalState: {
        get: jest.fn(),
        update: jest.fn()
    },
    workspaceState: {
        get: jest.fn(),
        update: jest.fn()
    }
} as any;

Object.defineProperty(vscode.window, 'createTerminal', {
    value: jest.fn().mockReturnValue(mockTerminal),
    configurable: true
});

Object.defineProperty(vscode.window, 'createOutputChannel', {
    value: jest.fn().mockReturnValue(mockOutputChannel),
    configurable: true
});

Object.defineProperty(vscode.workspace, 'getConfiguration', {
    value: jest.fn().mockReturnValue({
        get: jest.fn().mockImplementation((key, defaultValue) => {
            const values = {
                'claudePath': 'claude',
                'enableFileWatching': true
            };
            return values[key as keyof typeof values] ?? defaultValue;
        })
    }),
    configurable: true
});

describe('SuperSmartConductor', () => {
    let superSmartConductor: SuperSmartConductor;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockTaskQueue: jest.Mocked<TaskQueue>;
    let mockCodebaseAnalyzer: jest.Mocked<CodebaseAnalyzer>;

    const mockAgents: Agent[] = [
        {
            id: 'agent-1',
            name: 'Senior Frontend Developer',
            type: 'frontend-specialist',
            status: 'idle' as AgentStatus,
            terminal: mockTerminal as any,
            currentTask: null,
            startTime: new Date(),
            tasksCompleted: 0,
            capabilities: ['react', 'typescript', 'performance'],
            template: undefined
        },
        {
            id: 'agent-2',
            name: 'Backend Architect',
            type: 'backend-specialist',
            status: 'working' as AgentStatus,
            terminal: mockTerminal as any,
            currentTask: null,
            startTime: new Date(),
            tasksCompleted: 0,
            capabilities: ['nodejs', 'architecture', 'databases'],
            template: undefined
        }
    ];

    const mockCodeComponents: Map<string, CodeComponent> = new Map([
        ['/src/components/UserProfile.ts', {
            name: 'UserProfile',
            type: 'component',
            path: '/src/components/UserProfile.ts',
            imports: ['react', '@types/user'],
            exports: ['UserProfile', 'UserProfileProps'],
            dependencies: ['/src/types/User.ts', '/src/services/UserService.ts'],
            complexity: 8,
            linesOfCode: 150,
            hasDocs: true,
            lastModified: new Date(),
            qualityScore: 85,
            testCoverage: 85
        }],
        ['/src/services/ApiService.ts', {
            name: 'ApiService',
            type: 'service',
            path: '/src/services/ApiService.ts',
            imports: ['axios', './config'],
            exports: ['ApiService', 'ApiConfig'],
            dependencies: ['/src/config/config.ts'],
            complexity: 25,
            linesOfCode: 300,
            hasDocs: false,
            lastModified: new Date(),
            qualityScore: 40,
            testCoverage: 0
        }]
    ]);

    const mockQualityMetrics: QualityMetrics = {
        totalComponents: 50,
        averageComplexity: 12.5,
        highComplexityCount: 5,
        testCoverage: 75.2,
        technicalDebt: 35,
        codeSmells: 8,
        duplicateCodeBlocks: 3,
        circularDependencies: 2,
        documentation: 60
    };

    const mockCircularDependencies: CircularDependency[] = [
        {
            cycle: ['/src/services/UserService.ts', '/src/models/User.ts', '/src/services/UserService.ts'],
            severity: 'high',
            impact: 'Service dependency cycle causing circular imports',
            suggestedFix: 'Extract common interface or use dependency injection'
        }
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useFakeTimers();

        mockAgentManager = new AgentManager({} as any) as jest.Mocked<AgentManager>;
        mockTaskQueue = new TaskQueue({} as any) as jest.Mocked<TaskQueue>;
        mockCodebaseAnalyzer = new CodebaseAnalyzer(mockOutputChannel as vscode.OutputChannel) as jest.Mocked<CodebaseAnalyzer>;

        // Setup CodebaseAnalyzer mocks
        mockCodebaseAnalyzer.analyzeWorkspace = jest.fn().mockResolvedValue({
            components: mockCodeComponents,
            metrics: mockQualityMetrics
        });
        mockCodebaseAnalyzer.getDependencyGraph = jest.fn().mockReturnValue(new Map([
            ['/src/components/UserProfile.ts', new Set(['/src/services/UserService.ts'])],
            ['/src/services/ApiService.ts', new Set(['/src/config/config.ts'])]
        ]));
        mockCodebaseAnalyzer.findCircularDependencies = jest.fn().mockReturnValue(mockCircularDependencies);
        mockCodebaseAnalyzer.findComplexComponents = jest.fn().mockReturnValue(['/src/services/ApiService.ts']);
        mockCodebaseAnalyzer.findUntestedComponents = jest.fn().mockReturnValue(['/src/services/ApiService.ts']);
        mockCodebaseAnalyzer.getComponent = jest.fn().mockImplementation(filePath =>
            mockCodeComponents.get(filePath)
        );
        mockCodebaseAnalyzer.setupWatchers = jest.fn();

        // Mock CodebaseAnalyzer constructor
        (CodebaseAnalyzer as jest.MockedClass<typeof CodebaseAnalyzer>).mockImplementation(() => mockCodebaseAnalyzer);

        superSmartConductor = new SuperSmartConductor(mockAgentManager, mockTaskQueue, mockContext);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('initialization and setup', () => {
        it('should initialize with agent manager, task queue, and context', () => {
            expect(superSmartConductor).toBeInstanceOf(SuperSmartConductor);
            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('NofX VP Brain');
            expect(CodebaseAnalyzer).toHaveBeenCalledWith(mockOutputChannel as vscode.OutputChannel);
        });

        it('should initialize without context and set it later', () => {
            const conductorWithoutContext = new SuperSmartConductor(mockAgentManager, mockTaskQueue);

            expect(conductorWithoutContext).toBeInstanceOf(SuperSmartConductor);

            conductorWithoutContext.setContext(mockContext);
            // Context should be set internally
        });

        it('should get configuration values correctly', () => {
            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('nofx');
        });

        it('should handle missing configuration gracefully', () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn().mockReturnValue(undefined)
            });

            const conductor = new SuperSmartConductor(mockAgentManager, mockTaskQueue);
            expect(conductor).toBeInstanceOf(SuperSmartConductor);
        });
    });

    describe('starting VP conductor', () => {
        it('should start VP conductor with terminal and file watchers', async () => {
            await superSmartConductor.start();

            expect(mockOutputChannel.show).toHaveBeenCalled();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('🧠 Super Smart VP Conductor Initializing...');
            expect(vscode.window.createTerminal).toHaveBeenCalledWith({
                name: '🧠 NofX VP Conductor',
                iconPath: expect.any(vscode.ThemeIcon)
            });
            expect(mockTerminal.show).toHaveBeenCalled();
        });

        it('should enable file watchers when configured', async () => {
            await superSmartConductor.start();

            expect(mockCodebaseAnalyzer.setupWatchers).toHaveBeenCalledWith(mockContext);
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('👀 File watchers enabled for automatic re-analysis');
        });

        it('should skip file watchers when disabled in config', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn().mockImplementation((key) => {
                    if (key === 'enableFileWatching') return false;
                    if (key === 'claudePath') return 'claude';
                    return undefined;
                })
            });

            await superSmartConductor.start();

            expect(mockCodebaseAnalyzer.setupWatchers).not.toHaveBeenCalled();
        });

        it('should skip file watchers when no context provided', async () => {
            const conductorWithoutContext = new SuperSmartConductor(mockAgentManager, mockTaskQueue);

            await conductorWithoutContext.start();

            expect(mockCodebaseAnalyzer.setupWatchers).not.toHaveBeenCalled();
        });

        it('should not create new terminal if one already exists', async () => {
            await superSmartConductor.start();
            jest.clearAllMocks();

            await superSmartConductor.start();

            expect(vscode.window.createTerminal).not.toHaveBeenCalled();
            expect(mockTerminal.show).toHaveBeenCalled();
        });

        it('should initialize VP conductor with comprehensive system prompt', async () => {
            await superSmartConductor.start();

            expect(mockTerminal.sendText).toHaveBeenCalledWith('clear');
            expect(mockTerminal.sendText).toHaveBeenCalledWith('echo "🧠 NofX Super Smart VP Conductor v3.0"');
            expect(mockTerminal.sendText).toHaveBeenCalledWith(
                expect.stringContaining('claude --append-system-prompt')
            );

            // Check that the system prompt includes VP-level content
            const claudeCall = mockTerminal.sendText.mock.calls
                .find(([cmd]) => cmd.includes('claude --append-system-prompt'))?.[0];
            expect(claudeCall).toContain('VP of Engineering');
            expect(claudeCall).toContain('architectural decisions');
            expect(claudeCall).toContain('quality standards');
        });

        it('should send VP-level greeting after delay', async () => {
            await superSmartConductor.start();

            // Fast-forward past the 3 second delay
            jest.advanceTimersByTime(4000);

            expect(mockTerminal.sendText).toHaveBeenCalledWith('Greetings! I am your VP of Engineering. I will:');
            expect(mockTerminal.sendText).toHaveBeenCalledWith('- Architect your entire system before we write code');
            expect(mockTerminal.sendText).toHaveBeenCalledWith('- Ensure quality and prevent technical debt');
            expect(mockTerminal.sendText).toHaveBeenCalledWith('What would you like to build? I will create a comprehensive plan.');
        });
    });

    describe('codebase analysis', () => {
        beforeEach(async () => {
            await superSmartConductor.start();
            jest.clearAllMocks();
        });

        it('should analyze codebase and build knowledge graph', async () => {
            await superSmartConductor.analyzeCodebase();

            expect(mockCodebaseAnalyzer.analyzeWorkspace).toHaveBeenCalledWith({
                includeTests: true,
                cacheResults: true
            });

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('🔍 Analyzing codebase structure with TypeScript AST...');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('✅ Analyzed 2 components');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('📊 Average complexity: 12.50');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('🔗 Found 2 circular dependencies');
        });

        it('should build project architecture from analysis', async () => {
            await superSmartConductor.analyzeCodebase();

            // Verify that dependency graph conversion works correctly
            expect(mockCodebaseAnalyzer.getDependencyGraph).toHaveBeenCalled();

            // Should have processed the components
            const projectArchitecture = (superSmartConductor as any).projectArchitecture as ProjectArchitecture;
            expect(projectArchitecture).toBeDefined();
            expect(projectArchitecture.dependencies).toBeDefined();
            expect(projectArchitecture.qualityMetrics).toEqual(mockQualityMetrics);
        });

        it('should identify entry points correctly', async () => {
            // Add components with entry point patterns
            mockCodeComponents.set('/src/index.ts', {
                name: 'index',
                type: 'entry',
                filePath: '/src/index.ts',
                exports: ['default'],
                imports: ['./app'],
                functions: ['bootstrap'],
                classes: [],
                complexity: 2,
                dependencies: ['/src/app.ts'],
                dependents: [],
                hasTests: false,
                testCoverage: 0
            });

            await superSmartConductor.analyzeCodebase();

            const architecture = (superSmartConductor as any).projectArchitecture as ProjectArchitecture;
            expect(architecture.entryPoints).toContain('/src/index.ts');
        });

        it('should identify architectural layers correctly', async () => {
            // Add components representing different layers
            mockCodeComponents.set('/src/views/UserView.ts', {
                name: 'UserView',
                type: 'view',
                filePath: '/src/views/UserView.ts',
                exports: ['UserView'],
                imports: ['react'],
                functions: ['render'],
                classes: ['UserView'],
                complexity: 5,
                dependencies: [],
                dependents: [],
                hasTests: true,
                testCoverage: 90
            });

            await superSmartConductor.analyzeCodebase();

            const architecture = (superSmartConductor as any).projectArchitecture as ProjectArchitecture;
            expect(architecture.layers.get('presentation')).toContain('/src/views/UserView.ts');
            expect(architecture.layers.get('business')).toContain('/src/services/ApiService.ts');
        });

        it('should detect design patterns from code structure', async () => {
            // Add components with design pattern names
            mockCodeComponents.set('/src/factories/UserFactory.ts', {
                name: 'UserFactory',
                type: 'factory',
                filePath: '/src/factories/UserFactory.ts',
                exports: ['UserFactory'],
                imports: [],
                functions: ['createUser'],
                classes: ['UserFactory'],
                complexity: 3,
                dependencies: [],
                dependents: [],
                hasTests: true,
                testCoverage: 100
            });

            await superSmartConductor.analyzeCodebase();

            const architecture = (superSmartConductor as any).projectArchitecture as ProjectArchitecture;
            expect(architecture.patterns).toContain('Factory Pattern');
        });

        it('should detect technologies from imports', async () => {
            await superSmartConductor.analyzeCodebase();

            const architecture = (superSmartConductor as any).projectArchitecture as ProjectArchitecture;
            expect(architecture.technologies).toContain('React');
        });

        it('should handle analysis errors gracefully', async () => {
            mockCodebaseAnalyzer.analyzeWorkspace.mockRejectedValue(new Error('Analysis failed'));

            await expect(superSmartConductor.analyzeCodebase()).rejects.toThrow('Analysis failed');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('🔍 Analyzing codebase structure with TypeScript AST...');
        });
    });

    describe('agent performance tracking', () => {
        beforeEach(async () => {
            await superSmartConductor.start();
        });

        it('should track agent performance on task completion', () => {
            const task = { id: 'task-1', type: 'feature', title: 'Add user auth' };

            superSmartConductor.trackAgentPerformance('agent-1', task, true, 90);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Updated performance for Agent agent-1: 100.0% success rate')
            );
        });

        it('should track agent performance on task failure', () => {
            const task = { id: 'task-1', type: 'bugfix', title: 'Fix login bug' };

            superSmartConductor.trackAgentPerformance('agent-1', task, false, 45);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Updated performance for Agent agent-1: 0.0% success rate')
            );
        });

        it('should calculate running averages for execution time', () => {
            const task1 = { id: 'task-1', type: 'feature' };
            const task2 = { id: 'task-2', type: 'feature' };

            superSmartConductor.trackAgentPerformance('agent-1', task1, true, 60);
            superSmartConductor.trackAgentPerformance('agent-1', task2, true, 120);

            const performance = (superSmartConductor as any).agentPerformanceHistory.get('agent-1') as AgentPerformance;
            expect(performance.averageExecutionTime).toBe(90); // (60 + 120) / 2
        });

        it('should update specialization based on task types', () => {
            const frontendTask = { id: 'task-1', type: 'frontend' };

            superSmartConductor.trackAgentPerformance('agent-1', frontendTask, true, 60);

            const performance = (superSmartConductor as any).agentPerformanceHistory.get('agent-1') as AgentPerformance;
            expect(performance.specialization).toBe('frontend');
        });

        it('should calculate quality score based on success rate', () => {
            const task = { id: 'task-1', type: 'feature' };

            // 2 successes, 1 failure = 66.7% success rate
            superSmartConductor.trackAgentPerformance('agent-1', task, true, 60);
            superSmartConductor.trackAgentPerformance('agent-1', task, true, 60);
            superSmartConductor.trackAgentPerformance('agent-1', task, false, 60);

            const performance = (superSmartConductor as any).agentPerformanceHistory.get('agent-1') as AgentPerformance;
            expect(performance.qualityScore).toBe(67); // Rounded 66.7%
        });

        it('should update last active timestamp', () => {
            const task = { id: 'task-1', type: 'feature' };
            const beforeTime = new Date();

            superSmartConductor.trackAgentPerformance('agent-1', task, true, 60);

            const performance = (superSmartConductor as any).agentPerformanceHistory.get('agent-1') as AgentPerformance;
            expect(performance.lastActive.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        });
    });

    describe('task time prediction', () => {
        beforeEach(async () => {
            await superSmartConductor.start();
        });

        it('should predict time based on historical data', () => {
            const task1 = { type: 'feature' };
            const task2 = { type: 'feature' };

            // Build history
            superSmartConductor.trackAgentPerformance('agent-1', task1, true, 90);
            superSmartConductor.trackAgentPerformance('agent-2', task2, true, 110);

            const prediction = superSmartConductor.predictTaskTime({ type: 'feature' });
            expect(prediction).toBe(100); // (90 + 110) / 2
        });

        it('should use default estimates for unknown task types', () => {
            const prediction = superSmartConductor.predictTaskTime({ type: 'unknown' });
            expect(prediction).toBe(60); // Default estimate
        });

        it('should use specific estimates for known task types', () => {
            const bugfixPrediction = superSmartConductor.predictTaskTime({ type: 'bugfix' });
            expect(bugfixPrediction).toBe(60);

            const featurePrediction = superSmartConductor.predictTaskTime({ type: 'feature' });
            expect(featurePrediction).toBe(120);

            const testPrediction = superSmartConductor.predictTaskTime({ type: 'test' });
            expect(testPrediction).toBe(45);
        });

        it('should prioritize historical data over defaults', () => {
            const task = { type: 'bugfix' };

            // Build specific history for bugfix tasks
            superSmartConductor.trackAgentPerformance('agent-1', task, true, 30);
            superSmartConductor.trackAgentPerformance('agent-2', task, true, 40);

            const prediction = superSmartConductor.predictTaskTime({ type: 'bugfix' });
            expect(prediction).toBe(35); // Historical average, not default 60
        });
    });

    describe('architectural improvement suggestions', () => {
        beforeEach(async () => {
            await superSmartConductor.start();
            await superSmartConductor.analyzeCodebase();
        });

        it('should suggest improvements for circular dependencies', () => {
            const suggestions = superSmartConductor.suggestArchitecturalImprovements();

            expect(suggestions).toContain(
                expect.stringContaining('Critical: 1 high-severity circular dependencies detected')
            );
        });

        it('should suggest improvements for high complexity components', () => {
            const suggestions = superSmartConductor.suggestArchitecturalImprovements();

            expect(suggestions).toContain(
                expect.stringContaining('High complexity in 1 files')
            );
            expect(suggestions).toContain(
                expect.stringContaining('ApiService.ts')
            );
        });

        it('should suggest improvements for missing tests', () => {
            const suggestions = superSmartConductor.suggestArchitecturalImprovements();

            expect(suggestions).toContain(
                expect.stringContaining('Test coverage: 50.0%. 1 components lack tests')
            );
        });

        it('should suggest improvements for high average complexity', () => {
            // Mock high average complexity
            (superSmartConductor as any).qualityMetrics = {
                ...mockQualityMetrics,
                averageComplexity: 20
            };

            const suggestions = superSmartConductor.suggestArchitecturalImprovements();

            expect(suggestions).toContain(
                expect.stringContaining('Average complexity (20.0) exceeds threshold')
            );
        });

        it('should suggest improvements for high technical debt', () => {
            // Mock high technical debt
            (superSmartConductor as any).qualityMetrics = {
                ...mockQualityMetrics,
                technicalDebt: 75
            };

            const suggestions = superSmartConductor.suggestArchitecturalImprovements();

            expect(suggestions).toContain(
                expect.stringContaining('Technical debt score: 75. Schedule refactoring sprint')
            );
        });

        it('should return empty suggestions for healthy codebase', () => {
            // Mock a healthy codebase
            mockCodebaseAnalyzer.findCircularDependencies.mockReturnValue([]);
            mockCodebaseAnalyzer.findComplexComponents.mockReturnValue([]);
            mockCodebaseAnalyzer.findUntestedComponents.mockReturnValue([]);
            (superSmartConductor as any).qualityMetrics = {
                ...mockQualityMetrics,
                averageComplexity: 8,
                technicalDebt: 20
            };

            const suggestions = superSmartConductor.suggestArchitecturalImprovements();

            expect(suggestions).toHaveLength(0);
        });

        it('should categorize circular dependencies by severity', () => {
            const mixedDependencies: CircularDependency[] = [
                { cycle: ['A', 'B', 'A'], severity: 'high', impact: 'Critical', suggestedFix: 'Refactor' },
                { cycle: ['C', 'D', 'C'], severity: 'medium', impact: 'Moderate', suggestedFix: 'Interface' },
                { cycle: ['E', 'F', 'E'], severity: 'medium', impact: 'Moderate', suggestedFix: 'DI' }
            ];

            mockCodebaseAnalyzer.findCircularDependencies.mockReturnValue(mixedDependencies);

            const suggestions = superSmartConductor.suggestArchitecturalImprovements();

            expect(suggestions).toContain(
                expect.stringContaining('Critical: 1 high-severity circular dependencies')
            );
            expect(suggestions).toContain(
                expect.stringContaining('Warning: 2 medium-severity circular dependencies')
            );
        });
    });

    describe('complexity calculation', () => {
        beforeEach(async () => {
            await superSmartConductor.start();
        });

        it('should calculate complexity for analyzed components', async () => {
            const complexity = await (superSmartConductor as any).calculateComplexity('/src/components/UserProfile.ts');

            expect(complexity).toBe(8);
        });

        it('should analyze file if not already analyzed', async () => {
            mockCodebaseAnalyzer.getComponent.mockReturnValueOnce(undefined);
            mockCodebaseAnalyzer.analyzeFile = jest.fn().mockResolvedValue({
                component: {
                    complexity: 12
                }
            });

            const complexity = await (superSmartConductor as any).calculateComplexity('/src/new-file.ts');

            expect(mockCodebaseAnalyzer.analyzeFile).toHaveBeenCalledWith('/src/new-file.ts');
            expect(complexity).toBe(12);
        });

        it('should handle analysis errors gracefully', async () => {
            mockCodebaseAnalyzer.getComponent.mockReturnValue(undefined);
            mockCodebaseAnalyzer.analyzeFile = jest.fn().mockRejectedValue(new Error('Analysis failed'));

            const complexity = await (superSmartConductor as any).calculateComplexity('/src/error-file.ts');

            expect(complexity).toBe(0);
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Failed to analyze /src/error-file.ts for complexity')
            );
        });

        it('should return 0 for components without complexity data', async () => {
            mockCodebaseAnalyzer.getComponent.mockReturnValue({
                name: 'TestComponent',
                type: 'component',
                filePath: '/test.ts',
                exports: [],
                imports: [],
                functions: [],
                classes: [],
                // complexity: undefined
                dependencies: [],
                dependents: [],
                hasTests: false,
                testCoverage: 0
            } as CodeComponent);

            const complexity = await (superSmartConductor as any).calculateComplexity('/test.ts');
            expect(complexity).toBe(0);
        });
    });

    describe('deprecated code intelligence method', () => {
        beforeEach(async () => {
            await superSmartConductor.start();
        });

        it('should delegate to CodebaseAnalyzer.analyzeText when content provided', async () => {
            const filePath = '/test/file.ts';
            const content = 'const test = 1;';
            const mockAnalysis = {
                component: mockCodeComponents.get('/src/components/UserProfile.ts')!
            };

            mockCodebaseAnalyzer.analyzeText = jest.fn().mockResolvedValue(mockAnalysis);

            await (superSmartConductor as any).extractCodeIntelligence(filePath, content);

            expect(mockCodebaseAnalyzer.analyzeText).toHaveBeenCalledWith(filePath, content);
        });

        it('should delegate to CodebaseAnalyzer.analyzeFile when no content provided', async () => {
            const filePath = '/test/file.ts';
            const mockAnalysis = {
                component: mockCodeComponents.get('/src/components/UserProfile.ts')!
            };

            mockCodebaseAnalyzer.analyzeFile = jest.fn().mockResolvedValue(mockAnalysis);

            await (superSmartConductor as any).extractCodeIntelligence(filePath, '');

            expect(mockCodebaseAnalyzer.analyzeFile).toHaveBeenCalledWith(filePath);
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle configuration errors during initialization', () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockImplementation(() => {
                throw new Error('Configuration error');
            });

            expect(() => new SuperSmartConductor(mockAgentManager, mockTaskQueue)).not.toThrow();
        });

        it('should handle terminal creation failures', async () => {
            (vscode.window.createTerminal as jest.Mock).mockImplementation(() => {
                throw new Error('Terminal creation failed');
            });

            await expect(superSmartConductor.start()).not.toThrow();
        });

        it('should handle codebase analyzer initialization failures', () => {
            (CodebaseAnalyzer as jest.MockedClass<typeof CodebaseAnalyzer>).mockImplementation(() => {
                throw new Error('Analyzer initialization failed');
            });

            expect(() => new SuperSmartConductor(mockAgentManager, mockTaskQueue)).not.toThrow();
        });

        it('should handle empty performance history gracefully', () => {
            const prediction = superSmartConductor.predictTaskTime({ type: 'feature' });
            expect(prediction).toBe(120); // Should use default estimate
        });

        it('should handle missing quality metrics in suggestions', () => {
            (superSmartConductor as any).qualityMetrics = undefined;

            const suggestions = superSmartConductor.suggestArchitecturalImprovements();
            expect(suggestions).toBeDefined();
        });

        it('should handle analyzer method failures gracefully', () => {
            mockCodebaseAnalyzer.findCircularDependencies.mockImplementation(() => {
                throw new Error('Analysis method failed');
            });

            expect(() => superSmartConductor.suggestArchitecturalImprovements()).not.toThrow();
        });
    });

    describe('integration and workflow scenarios', () => {
        beforeEach(async () => {
            await superSmartConductor.start();
            await superSmartConductor.analyzeCodebase();
        });

        it('should provide comprehensive architectural analysis workflow', async () => {
            // Track some performance
            superSmartConductor.trackAgentPerformance('agent-1', { type: 'feature' }, true, 120);

            // Get predictions
            const prediction = superSmartConductor.predictTaskTime({ type: 'feature' });
            expect(prediction).toBe(120);

            // Get suggestions
            const suggestions = superSmartConductor.suggestArchitecturalImprovements();
            expect(suggestions.length).toBeGreaterThan(0);

            // Verify all components work together
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Analyzed 2 components')
            );
        });

        it('should handle complete VP workflow from start to analysis', async () => {
            // Start fresh conductor
            const newConductor = new SuperSmartConductor(mockAgentManager, mockTaskQueue, mockContext);

            await newConductor.start();
            await newConductor.analyzeCodebase();

            // Track performance
            newConductor.trackAgentPerformance('agent-1', { type: 'bugfix' }, true, 45);

            // Get comprehensive suggestions
            const suggestions = newConductor.suggestArchitecturalImprovements();

            expect(suggestions).toBeDefined();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Super Smart VP Conductor Initializing')
            );
        });

        it('should maintain state consistency across operations', async () => {
            // Perform multiple operations
            superSmartConductor.trackAgentPerformance('agent-1', { type: 'feature' }, true, 90);
            superSmartConductor.trackAgentPerformance('agent-1', { type: 'feature' }, false, 180);

            const prediction1 = superSmartConductor.predictTaskTime({ type: 'feature' });

            superSmartConductor.trackAgentPerformance('agent-1', { type: 'feature' }, true, 60);

            const prediction2 = superSmartConductor.predictTaskTime({ type: 'feature' });

            // Predictions should change based on new data
            expect(prediction2).not.toBe(prediction1);
            expect(prediction2).toBe(110); // (90 + 180 + 60) / 3
        });
    });
});
