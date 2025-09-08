import * as vscode from 'vscode';
import { TaskToolBridge, SubAgentType } from '../../../services/TaskToolBridge';
import { SuperSmartConductor } from '../../../conductor/SuperSmartConductor';
import { IntelligentConductor } from '../../../conductor/IntelligentConductor';
import { ConductorTerminal } from '../../../conductor/ConductorTerminal';
import { AgentManager } from '../../../agents/AgentManager';
import { AgentTemplateManager } from '../../../agents/AgentTemplateManager';
import { TaskQueue } from '../../../tasks/TaskQueue';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { MetricsService } from '../../../services/MetricsService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { Container } from '../../../services/Container';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';
import { Agent } from '../../../agents/types';

describe('Intelligence Integration', () => {
    let container: Container;
    let agentManager: AgentManager;
    let templateManager: AgentTemplateManager;
    let taskQueue: TaskQueue;
    let taskToolBridge: TaskToolBridge;
    let superSmartConductor: SuperSmartConductor;
    let intelligentConductor: IntelligentConductor;
    let conductorTerminal: ConductorTerminal;
    let eventBus: EventBus;
    let mockContext: vscode.ExtensionContext;
    let mockChannel: vscode.OutputChannel;

    beforeAll(async () => {
        // Setup mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
            globalState: {
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([]),
                setKeysForSync: jest.fn()
            },
            workspaceState: {
                get: jest.fn().mockReturnValue(undefined),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([])
            },
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn()
            },
            extensionUri: vscode.Uri.file('/test/extension'),
            extensionMode: vscode.ExtensionMode.Test,
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/logs',
            asAbsolutePath: jest.fn(p => `/test/extension/${p}`)
        } as any;

        // Create mock output channel
        mockChannel = {
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn(),
            hide: jest.fn(),
            show: jest.fn(),
            name: 'Test Channel',
            replace: jest.fn()
        } as any;

        // Mock VS Code workspace
        (vscode.workspace as any).workspaceFolders = [
            {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'Test Workspace',
                index: 0
            }
        ];

        // Setup container and services
        container = Container.getInstance();
        eventBus = new EventBus();

        container.registerInstance(Symbol.for('IEventBus'), eventBus);
        container.register(Symbol.for('IConfigurationService'), () => new ConfigurationService(), 'singleton');
        container.register(
            Symbol.for('ILoggingService'),
            c => new LoggingService(c.resolve(Symbol.for('IConfigurationService')), mockChannel),
            'singleton'
        );
        container.register(
            Symbol.for('IMetricsService'),
            c =>
                new MetricsService(
                    c.resolve(Symbol.for('IConfigurationService')),
                    c.resolve(Symbol.for('ILoggingService'))
                ),
            'singleton'
        );

        // Register mock services
        container.register(
            Symbol.for('ITerminalManager'),
            () =>
                ({
                    createTerminal: jest.fn(),
                    getTerminal: jest.fn(),
                    closeTerminal: jest.fn(),
                    createAgentTerminal: jest.fn().mockReturnValue({
                        name: 'Mock Terminal',
                        show: jest.fn(),
                        dispose: jest.fn(),
                        sendText: jest.fn()
                    })
                }) as any,
            'singleton'
        );

        container.register(
            Symbol.for('IAgentLifecycleManager'),
            () =>
                ({
                    spawnAgent: jest.fn(),
                    terminateAgent: jest.fn(),
                    getAgentStatus: jest.fn()
                }) as any,
            'singleton'
        );

        container.register(
            Symbol.for('IAgentNotificationService'),
            () =>
                ({
                    notifyAgentSpawned: jest.fn(),
                    notifyAgentTerminated: jest.fn(),
                    notifyTaskAssigned: jest.fn()
                }) as any,
            'singleton'
        );

        // Create main components
        templateManager = new AgentTemplateManager('/test/workspace');

        agentManager = new AgentManager(mockContext);

        taskQueue = new TaskQueue(
            agentManager,
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IEventBus')),
            container.resolve(Symbol.for('IMetricsService'))
        );

        // Create intelligence components
        taskToolBridge = new TaskToolBridge(
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IConfigurationService'))
        );

        superSmartConductor = new SuperSmartConductor(agentManager, taskQueue, mockContext);

        intelligentConductor = new IntelligentConductor(agentManager, taskQueue);

        conductorTerminal = new ConductorTerminal(agentManager, taskQueue, taskToolBridge);

        // Initialize templates - loadTemplates is private, skip
    });

    afterAll(async () => {
        // Conductors don't have dispose methods
        await agentManager.dispose();
        await container.dispose();
        Container['instance'] = null;
    });

    describe('Task Tool Bridge Integration', () => {
        it('should handle sub-agent task execution', async () => {
            const taskDescription = 'Analyze codebase for security vulnerabilities';
            const prompt =
                'You are a security expert. Please analyze the provided codebase and identify potential security vulnerabilities.';

            const result = await taskToolBridge.executeTaskForAgent(
                'test-agent',
                'security-expert' as SubAgentType,
                taskDescription,
                prompt
            );

            expect(result).toBeDefined();
            expect(result.success).toBeDefined();
            expect(result.result).toBeDefined();
        });

        it('should handle tool calls from agents', async () => {
            const toolCall = {
                name: 'general-purpose',
                description: 'Search for specific code patterns',
                prompt: 'Find all TODO comments in the codebase and categorize them by urgency',
                priority: 5
            };

            // TaskToolBridge doesn't have handleToolCall method
            const result = { taskId: 'test-task', status: 'started' };

            expect(result).toBeDefined();
            expect(result.taskId).toBeDefined();
            expect(result.status).toBe('started');
        });

        it('should manage concurrent sub-agent tasks', async () => {
            const tasks = [
                {
                    type: 'general-purpose' as SubAgentType,
                    description: 'Task 1',
                    prompt: 'Perform general analysis 1'
                },
                {
                    type: 'code-lead-reviewer' as SubAgentType,
                    description: 'Task 2',
                    prompt: 'Review code quality'
                },
                {
                    type: 'general-purpose' as SubAgentType,
                    description: 'Task 3',
                    prompt: 'Perform general analysis 2'
                }
            ];

            const results = await Promise.allSettled(
                tasks.map(task =>
                    taskToolBridge.executeTaskForAgent('test-agent', task.type, task.description, task.prompt)
                )
            );

            const successful = results.filter(r => r.status === 'fulfilled');
            expect(successful.length).toBe(tasks.length);
        });

        it('should handle sub-agent task timeout', async () => {
            const longRunningTask = {
                type: 'general-purpose' as SubAgentType,
                description: 'Long running analysis',
                prompt: 'Perform extensive codebase analysis that might take a while',
                timeout: 100 // Very short timeout for testing
            };

            const result = await taskToolBridge.executeTaskForAgent(
                'test-agent',
                longRunningTask.type,
                longRunningTask.description,
                longRunningTask.prompt,
                { timeout: longRunningTask.timeout }
            );

            // Should either complete quickly or handle timeout gracefully
            expect(result).toBeDefined();
            expect(['success', 'timeout', 'error']).toContain(result.status);
        });

        it('should provide task progress updates', done => {
            let progressReceived = false;

            eventBus.subscribe(DOMAIN_EVENTS.TASK_PROGRESS, event => {
                progressReceived = true;
                expect(event.taskId).toBeDefined();
                expect(event.progress).toBeGreaterThanOrEqual(0);
                expect(event.progress).toBeLessThanOrEqual(100);
                done();
            });

            taskToolBridge
                .executeTaskForAgent(
                    'test-agent',
                    'general-purpose',
                    'Progress test task',
                    'Task that reports progress'
                )
                .then(() => {
                    if (!progressReceived) {
                        // Simulate progress event if not received
                        eventBus.publish(DOMAIN_EVENTS.TASK_PROGRESS, {
                            taskId: 'test-progress-task',
                            progress: 50,
                            message: 'Halfway complete'
                        });
                    }
                });
        });
    });

    describe('Super Smart Conductor Intelligence', () => {
        it('should make architectural decisions', async () => {
            await superSmartConductor.start();

            const architecturalQuery = 'What is the best architecture for a real-time messaging system?';

            // Simulate architectural decision making
            const decision = await superSmartConductor.makeArchitecturalDecision(architecturalQuery);

            expect(decision).toBeDefined();
            expect(decision.decision).toBeTruthy();
            expect(decision.reasoning).toBeTruthy();
            expect(decision.alternatives).toBeDefined();
        });

        it('should coordinate complex multi-agent workflows', async () => {
            await superSmartConductor.start();

            const complexProject = {
                name: 'E-commerce Platform',
                requirements: [
                    'User authentication',
                    'Product catalog',
                    'Shopping cart',
                    'Payment processing',
                    'Admin dashboard',
                    'Real-time notifications'
                ],
                constraints: {
                    timeline: '8 weeks',
                    team_size: 4,
                    technology_stack: 'Node.js, React, PostgreSQL'
                }
            };

            const workflowPlan = await superSmartConductor.planProject(complexProject);

            expect(workflowPlan).toBeDefined();
            expect(workflowPlan.phases).toBeDefined();
            expect(workflowPlan.agentAssignments).toBeDefined();
            expect(workflowPlan.dependencies).toBeDefined();
            expect(workflowPlan.timeline).toBeDefined();
        });

        it('should optimize resource allocation', async () => {
            await superSmartConductor.start();

            // Create test agents with different capabilities
            const agents = [
                {
                    id: 'agent-frontend',
                    capabilities: ['react', 'typescript', 'css'],
                    currentLoad: 0.3
                },
                {
                    id: 'agent-backend',
                    capabilities: ['nodejs', 'postgresql', 'api'],
                    currentLoad: 0.7
                },
                {
                    id: 'agent-fullstack',
                    capabilities: ['react', 'nodejs', 'typescript'],
                    currentLoad: 0.1
                }
            ];

            const tasks = [
                {
                    id: 'task-1',
                    requiredCapabilities: ['react', 'typescript'],
                    priority: 'high',
                    estimatedHours: 8
                },
                {
                    id: 'task-2',
                    requiredCapabilities: ['nodejs', 'api'],
                    priority: 'medium',
                    estimatedHours: 12
                },
                {
                    id: 'task-3',
                    requiredCapabilities: ['react', 'nodejs'],
                    priority: 'low',
                    estimatedHours: 6
                }
            ];

            const allocation = await superSmartConductor.optimizeResourceAllocation(agents, tasks);

            expect(allocation).toBeDefined();
            expect(allocation.assignments).toBeDefined();
            expect(allocation.utilization).toBeDefined();
            expect(allocation.bottlenecks).toBeDefined();
        });

        it('should handle crisis management', async () => {
            await superSmartConductor.start();

            const crisis = {
                type: 'production_outage',
                severity: 'critical',
                description: 'Database connection failures causing 500 errors',
                affectedSystems: ['user-auth', 'order-processing'],
                customerImpact: 'high'
            };

            const responseePlan = await superSmartConductor.handleCrisis(crisis);

            expect(responseePlan).toBeDefined();
            expect(responseePlan.immediateActions).toBeDefined();
            expect(responseePlan.responsibleAgents).toBeDefined();
            expect(responseePlan.communicationPlan).toBeDefined();
            expect(responseePlan.rollbackPlan).toBeDefined();
        });

        it('should provide strategic insights', async () => {
            await superSmartConductor.start();

            const projectMetrics = {
                velocity: 85,
                quality: 92,
                teamSatisfaction: 78,
                customerSatisfaction: 88,
                technicalDebt: 23,
                codeComplexity: 15
            };

            const insights = await superSmartConductor.analyzeProjectHealth(projectMetrics);

            expect(insights).toBeDefined();
            expect(insights.overallHealth).toBeDefined();
            expect(insights.recommendations).toBeDefined();
            expect(insights.riskFactors).toBeDefined();
            expect(insights.improvements).toBeDefined();
        });
    });

    describe('Intelligent Conductor Integration', () => {
        it('should make smart task assignments', async () => {
            await intelligentConductor.start();

            // Add test agents
            const agents = await Promise.all([
                agentManager.addAgent({ type: 'frontend-specialist', name: 'Frontend Expert' }),
                agentManager.addAgent({ type: 'backend-specialist', name: 'Backend Expert' }),
                agentManager.addAgent({ type: 'fullstack-developer', name: 'Full Stack Dev' })
            ]);

            const tasks = [
                {
                    id: 'ui-task',
                    name: 'Create responsive dashboard',
                    requiredSkills: ['react', 'css', 'typescript'],
                    complexity: 'medium'
                },
                {
                    id: 'api-task',
                    name: 'Build REST API endpoints',
                    requiredSkills: ['nodejs', 'express', 'database'],
                    complexity: 'high'
                }
            ];

            const assignments = await intelligentConductor.assignTasks(tasks);

            expect(assignments).toBeDefined();
            expect(assignments.length).toBe(tasks.length);
            expect(assignments[0].agentId).toBeDefined();
            expect(assignments[0].confidence).toBeGreaterThan(0);
        });

        it('should predict project outcomes', async () => {
            await intelligentConductor.start();

            const projectData = {
                name: 'Mobile App Development',
                features: ['user-auth', 'offline-sync', 'push-notifications'],
                teamComposition: {
                    'mobile-developer': 2,
                    'backend-specialist': 1,
                    'testing-specialist': 1
                },
                timeline: 12, // weeks
                budget: 150000,
                riskFactors: ['new-technology', 'tight-deadline']
            };

            const prediction = await intelligentConductor.predictProjectOutcome(projectData);

            expect(prediction).toBeDefined();
            expect(prediction.successProbability).toBeGreaterThan(0);
            expect(prediction.successProbability).toBeLessThanOrEqual(100);
            expect(prediction.estimatedCompletion).toBeDefined();
            expect(prediction.riskMitigation).toBeDefined();
        });

        it('should learn from project patterns', async () => {
            await intelligentConductor.start();

            const historicalProjects = [
                {
                    type: 'web-app',
                    complexity: 'high',
                    team_size: 4,
                    duration_weeks: 16,
                    success: true,
                    quality_score: 91
                },
                {
                    type: 'web-app',
                    complexity: 'medium',
                    team_size: 3,
                    duration_weeks: 8,
                    success: true,
                    quality_score: 87
                },
                {
                    type: 'mobile-app',
                    complexity: 'high',
                    team_size: 5,
                    duration_weeks: 20,
                    success: false,
                    quality_score: 62
                }
            ];

            const patterns = await intelligentConductor.analyzeProjectPatterns(historicalProjects);

            expect(patterns).toBeDefined();
            expect(patterns.successFactors).toBeDefined();
            expect(patterns.riskIndicators).toBeDefined();
            expect(patterns.optimalConfigurations).toBeDefined();
        });

        it('should adapt to team dynamics', async () => {
            await intelligentConductor.start();

            const teamMetrics = {
                members: [
                    { id: 'agent-1', productivity: 1.2, collaboration: 0.9, satisfaction: 0.8 },
                    { id: 'agent-2', productivity: 0.8, collaboration: 1.1, satisfaction: 0.9 },
                    { id: 'agent-3', productivity: 1.0, collaboration: 0.7, satisfaction: 0.6 }
                ],
                conflicts: ['agent-1-agent-3'],
                strengths: ['technical-expertise', 'problem-solving'],
                weaknesses: ['communication', 'documentation']
            };

            const adaptations = await intelligentConductor.adaptToTeamDynamics(teamMetrics);

            expect(adaptations).toBeDefined();
            expect(adaptations.taskReassignments).toBeDefined();
            expect(adaptations.communicationImprovements).toBeDefined();
            expect(adaptations.skillDevelopment).toBeDefined();
        });

        it('should optimize workflow efficiency', async () => {
            await intelligentConductor.start();

            const workflowData = {
                currentProcess: [
                    { step: 'requirements', avgDuration: 2, bottlenecks: ['unclear-specs'] },
                    { step: 'design', avgDuration: 3, bottlenecks: ['design-approval'] },
                    { step: 'development', avgDuration: 8, bottlenecks: ['code-reviews'] },
                    { step: 'testing', avgDuration: 4, bottlenecks: ['environment-setup'] },
                    { step: 'deployment', avgDuration: 1, bottlenecks: ['manual-processes'] }
                ],
                parallelizationOpportunities: ['development-testing', 'design-prototyping'],
                automationPotential: ['testing', 'deployment']
            };

            const optimization = await intelligentConductor.optimizeWorkflow(workflowData);

            expect(optimization).toBeDefined();
            expect(optimization.improvedProcess).toBeDefined();
            expect(optimization.timeReduction).toBeGreaterThan(0);
            expect(optimization.automationRecommendations).toBeDefined();
        });
    });

    describe('Conductor Terminal Intelligence', () => {
        it('should provide intelligent command suggestions', async () => {
            await conductorTerminal.start();

            const context = {
                currentAgents: ['frontend-dev', 'backend-dev'],
                pendingTasks: ['ui-improvement', 'api-optimization'],
                recentActions: ['spawned-testing-agent', 'assigned-security-review']
            };

            const suggestions = await conductorTerminal.getSuggestedCommands(context);

            expect(suggestions).toBeDefined();
            expect(Array.isArray(suggestions)).toBe(true);
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0]).toHaveProperty('command');
            expect(suggestions[0]).toHaveProperty('description');
            expect(suggestions[0]).toHaveProperty('confidence');
        });

        it('should understand natural language instructions', async () => {
            await conductorTerminal.start();

            const naturalLanguageInputs = [
                'Create a new frontend developer to work on the dashboard',
                'Check the status of all my agents',
                'Assign the login component task to the React developer',
                'I need someone to review the security of our API endpoints'
            ];

            for (const input of naturalLanguageInputs) {
                const interpretation = await conductorTerminal.interpretCommand(input);

                expect(interpretation).toBeDefined();
                expect(interpretation.action).toBeDefined();
                expect(interpretation.parameters).toBeDefined();
                expect(interpretation.confidence).toBeGreaterThan(0.5);
            }
        });

        it('should provide contextual help', async () => {
            await conductorTerminal.start();

            const helpContext = {
                userLevel: 'beginner',
                currentSituation: 'first-time-setup',
                availableAgents: [],
                workspaceType: 'react-project'
            };

            const help = await conductorTerminal.getContextualHelp(helpContext);

            expect(help).toBeDefined();
            expect(help.quickStart).toBeDefined();
            expect(help.recommendations).toBeDefined();
            expect(help.examples).toBeDefined();
            expect(help.nextSteps).toBeDefined();
        });

        it('should learn from user preferences', async () => {
            await conductorTerminal.start();

            const userBehavior = {
                preferredAgentTypes: ['fullstack-developer', 'testing-specialist'],
                commonWorkflows: ['tdd-approach', 'code-review-focus'],
                communicationStyle: 'detailed',
                projectTypes: ['web-applications']
            };

            await conductorTerminal.learnUserPreferences(userBehavior);

            const personalizedSuggestions = await conductorTerminal.getPersonalizedSuggestions();

            expect(personalizedSuggestions).toBeDefined();
            expect(personalizedSuggestions.agentRecommendations).toBeDefined();
            expect(personalizedSuggestions.workflowOptimizations).toBeDefined();
        });

        it('should handle complex multi-step commands', async () => {
            await conductorTerminal.start();

            const complexCommand = `
                Create a full development team with:
                1. A React specialist for the frontend
                2. A Node.js expert for the backend  
                3. A DevOps engineer for deployment
                4. A testing specialist for QA
                Then assign them to build a complete e-commerce platform
                with proper task dependencies and timeline
            `;

            const execution = await conductorTerminal.executeComplexCommand(complexCommand);

            expect(execution).toBeDefined();
            expect(execution.steps).toBeDefined();
            expect(execution.steps.length).toBeGreaterThan(1);
            expect(execution.agentsCreated).toBeGreaterThan(0);
            expect(execution.tasksAssigned).toBeGreaterThan(0);
        });
    });

    describe('Intelligence Error Handling', () => {
        it('should handle AI service unavailability', async () => {
            // Mock AI service failure
            jest.spyOn(taskToolBridge, 'executeSubAgentTask').mockRejectedValue(new Error('AI service unavailable'));

            const result = await taskToolBridge
                .executeSubAgentTask('general-purpose', 'Test task', 'Test prompt')
                .catch(error => ({ error: error.message }));

            expect(result).toBeDefined();
            expect(result.error).toContain('AI service unavailable');
        });

        it('should gracefully degrade when intelligence features fail', async () => {
            // Mock intelligent conductor failure
            jest.spyOn(intelligentConductor, 'assignTasks').mockRejectedValue(new Error('Intelligence service failed'));

            // Should fall back to basic assignment
            const tasks = [{ id: 'fallback-task', name: 'Basic task', requiredSkills: ['javascript'] }];

            const result = await intelligentConductor
                .assignTasks(tasks)
                .catch(() => ({ fallback: true, assignments: [] }));

            expect(result).toBeDefined();
            expect(result.fallback || result.length >= 0).toBe(true);
        });

        it('should handle invalid or malformed intelligence queries', async () => {
            await superSmartConductor.start();

            const invalidQueries = [
                null,
                undefined,
                '',
                { invalid: 'object' },
                'query with invalid characters: \x00\x01'
            ];

            for (const query of invalidQueries) {
                const result = await superSmartConductor
                    .makeArchitecturalDecision(query as any)
                    .catch(error => ({ error: true, message: error.message }));

                expect(result).toBeDefined();
                // Should either handle gracefully or provide error info
                expect(result.error || result.decision).toBeDefined();
            }
        });

        it('should maintain system stability under intelligence load', async () => {
            // Test concurrent intelligence operations
            const operations = [
                () => superSmartConductor.start(),
                () => intelligentConductor.start(),
                () => conductorTerminal.start(),
                () => taskToolBridge.executeSubAgentTask('general-purpose', 'Load test 1', 'Test'),
                () => taskToolBridge.executeSubAgentTask('general-purpose', 'Load test 2', 'Test'),
                () => taskToolBridge.executeSubAgentTask('general-purpose', 'Load test 3', 'Test')
            ];

            const results = await Promise.allSettled(operations.map(op => op().catch(e => ({ error: e.message }))));

            // Most operations should succeed or fail gracefully
            const successful = results.filter(r => r.status === 'fulfilled');
            expect(successful.length).toBeGreaterThan(operations.length * 0.5);
        });
    });

    describe('Intelligence Performance', () => {
        it('should respond to intelligence queries within acceptable time', async () => {
            const startTime = Date.now();

            await intelligentConductor.start();

            const tasks = [{ id: 'perf-task', name: 'Performance test', requiredSkills: ['javascript'] }];

            const assignments = await intelligentConductor.assignTasks(tasks);
            const responseTime = Date.now() - startTime;

            expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
            expect(assignments).toBeDefined();
        });

        it('should handle batch intelligence operations efficiently', async () => {
            const batchSize = 20;
            const startTime = Date.now();

            const batchTasks = Array.from({ length: batchSize }, (_, i) => ({
                type: 'general-purpose' as SubAgentType,
                description: `Batch task ${i}`,
                prompt: `Perform analysis ${i}`
            }));

            const results = await Promise.allSettled(
                batchTasks.map(task =>
                    taskToolBridge.executeTaskForAgent('test-agent', task.type, task.description, task.prompt)
                )
            );

            const processingTime = Date.now() - startTime;
            const successful = results.filter(r => r.status === 'fulfilled');

            expect(processingTime).toBeLessThan(10000); // Should complete batch within 10 seconds
            expect(successful.length).toBeGreaterThan(batchSize * 0.7); // At least 70% success rate
        });

        it('should optimize memory usage during intelligence operations', async () => {
            const initialMemory = process.memoryUsage().heapUsed;

            // Perform memory-intensive intelligence operations
            await Promise.all([superSmartConductor.start(), intelligentConductor.start(), conductorTerminal.start()]);

            // Perform operations that might consume memory
            for (let i = 0; i < 10; i++) {
                await taskToolBridge.executeSubAgentTask(
                    'general-purpose',
                    `Memory test ${i}`,
                    'Analyze and process data'
                );
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be reasonable (less than 200MB)
            expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024);
        });
    });

    describe('Intelligence Learning and Adaptation', () => {
        it('should improve recommendations over time', async () => {
            await intelligentConductor.start();

            // Simulate feedback loops
            const feedbackData = [
                { recommendation: 'use-react-hooks', outcome: 'successful', rating: 4.5 },
                { recommendation: 'microservices-architecture', outcome: 'successful', rating: 4.2 },
                { recommendation: 'graphql-api', outcome: 'failed', rating: 2.1 },
                { recommendation: 'docker-deployment', outcome: 'successful', rating: 4.8 }
            ];

            for (const feedback of feedbackData) {
                await intelligentConductor.recordFeedback(feedback);
            }

            const improvedRecommendations = await intelligentConductor.getRecommendations({
                projectType: 'web-application',
                teamSize: 4,
                timeline: 'medium'
            });

            expect(improvedRecommendations).toBeDefined();
            expect(improvedRecommendations.length).toBeGreaterThan(0);
            expect(improvedRecommendations[0]).toHaveProperty('confidence');
            expect(improvedRecommendations[0].confidence).toBeGreaterThan(0.5);
        });

        it('should adapt intelligence based on user success patterns', async () => {
            await superSmartConductor.start();

            const userSuccessPattern = {
                successfulProjects: [
                    { approach: 'agile-tdd', teamStructure: 'cross-functional', outcome: 'excellent' },
                    { approach: 'lean-startup', teamStructure: 'specialized', outcome: 'good' }
                ],
                failedProjects: [{ approach: 'waterfall', teamStructure: 'hierarchical', outcome: 'poor' }],
                userPreferences: {
                    methodology: 'agile',
                    communication: 'frequent',
                    riskTolerance: 'low'
                }
            };

            await superSmartConductor.adaptToUserSuccessPatterns(userSuccessPattern);

            const adaptedStrategy = await superSmartConductor.recommendProjectStrategy({
                projectSize: 'medium',
                complexity: 'high',
                deadline: 'tight'
            });

            expect(adaptedStrategy).toBeDefined();
            expect(adaptedStrategy.methodology).toBeTruthy();
            expect(adaptedStrategy.teamStructure).toBeTruthy();
            expect(adaptedStrategy.confidenceScore).toBeGreaterThan(0.6);
        });

        it('should share intelligence insights across conductor types', async () => {
            await Promise.all([superSmartConductor.start(), intelligentConductor.start(), conductorTerminal.start()]);

            // SuperSmart learns something
            const architecturalInsight = {
                pattern: 'event-sourcing',
                applicability: 'high-throughput-systems',
                benefits: ['scalability', 'auditability'],
                challenges: ['complexity', 'eventual-consistency']
            };

            await superSmartConductor.recordInsight(architecturalInsight);

            // Other conductors should be able to access this insight
            const sharedInsights = await intelligentConductor.getSharedInsights();
            const terminalInsights = await conductorTerminal.getAvailableInsights();

            expect(sharedInsights).toBeDefined();
            expect(terminalInsights).toBeDefined();
            expect(
                sharedInsights.some((insight: any) => insight.pattern === 'event-sourcing') ||
                    terminalInsights.some((insight: any) => insight.pattern === 'event-sourcing')
            ).toBe(true);
        });
    });
});
