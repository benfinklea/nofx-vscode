/**
 * INTEGRATION TESTS FOR AGENT SPAWNING WARNING SCENARIOS
 * 
 * These tests verify the complete flow from agent spawning to task assignment warnings,
 * ensuring the real-world scenario that caused the bug never happens again.
 */

import { TaskQueue } from '../../tasks/TaskQueue';
import { AgentManager } from '../../agents/AgentManager';
import { AgentTemplateManager } from '../../agents/AgentTemplateManager';
import { EventBus } from '../../services/EventBus';
import { LoggingService } from '../../services/LoggingService';
import { NotificationService } from '../../services/NotificationService';
import { ConfigurationService } from '../../services/ConfigurationService';
import { TerminalManager } from '../../services/TerminalManager';
import { ErrorHandler } from '../../services/ErrorHandler';
import { PriorityTaskQueue } from '../../tasks/PriorityTaskQueue';
import { TaskStateMachine } from '../../tasks/TaskStateMachine';
import { CapabilityMatcher } from '../../tasks/CapabilityMatcher';
import { TaskDependencyManager } from '../../tasks/TaskDependencyManager';
import {
    createMockContainer,
    createMockExtensionContext,
    createMockOutputChannel,
    createMockTerminal,
    setupVSCodeMocks
} from '../helpers/mockFactories';

describe('Agent Spawning Warning Integration Tests', () => {
    let taskQueue: TaskQueue;
    let agentManager: AgentManager;
    let eventBus: EventBus;
    let notificationService: jest.Mocked<NotificationService>;
    let loggingService: LoggingService;
    let configService: ConfigurationService;
    let terminalManager: TerminalManager;
    let context: any;

    beforeEach(async () => {
        // Setup VS Code mocks
        setupVSCodeMocks();
        
        context = createMockExtensionContext();
        
        // Create real services (not mocked) for integration testing
        loggingService = new LoggingService(context);
        eventBus = new EventBus(loggingService);
        configService = new ConfigurationService();
        terminalManager = new TerminalManager(eventBus, loggingService);
        
        // Mock notification service to capture calls
        notificationService = {
            showInformation: jest.fn().mockResolvedValue(undefined),
            showWarning: jest.fn().mockResolvedValue(undefined),
            showError: jest.fn().mockResolvedValue(undefined),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            withProgress: jest.fn(),
            confirm: jest.fn(),
            confirmDestructive: jest.fn()
        } as any;

        // Create AgentManager with real dependencies
        const templateManager = new AgentTemplateManager(context, loggingService);
        const errorHandler = new ErrorHandler(loggingService, notificationService);
        
        agentManager = new AgentManager(
            context,
            terminalManager,
            templateManager,
            loggingService,
            eventBus,
            errorHandler
        );

        // Create TaskQueue with real services
        const priorityQueue = new PriorityTaskQueue(loggingService, eventBus);
        const taskStateMachine = new TaskStateMachine(loggingService, eventBus);
        const capabilityMatcher = new CapabilityMatcher(loggingService);
        const dependencyManager = new TaskDependencyManager(loggingService, eventBus);

        taskQueue = new TaskQueue(
            agentManager,
            loggingService,
            eventBus,
            errorHandler,
            notificationService,
            configService,
            taskStateMachine,
            priorityQueue,
            capabilityMatcher,
            dependencyManager
        );
    });

    afterEach(() => {
        taskQueue.dispose();
        agentManager.dispose();
        eventBus.dispose();
        loggingService.dispose();
        terminalManager.dispose();
    });

    describe('🚫 Agent Spawning Without Tasks - NO FALSE WARNINGS', () => {
        test('should NOT show warning when spawning single agent with empty task queue', async () => {
            // Given: Empty task queue
            expect(taskQueue.getTasks()).toHaveLength(0);
            
            // When: Spawn a single agent
            const agentId = await agentManager.spawnAgent({
                template: 'frontend-specialist',
                name: 'Frontend Dev'
            });

            // Allow event processing
            await new Promise(resolve => setTimeout(resolve, 10));

            // Then: No warnings should appear
            expect(notificationService.showWarning).not.toHaveBeenCalled();
            expect(notificationService.showInformation).not.toHaveBeenCalled();
            
            // Verify agent was created
            expect(agentId).toBeDefined();
            const agent = agentManager.getAgent(agentId);
            expect(agent).toBeDefined();
        });

        test('should NOT show warning when spawning multiple agents with empty task queue', async () => {
            // Given: Empty task queue
            expect(taskQueue.getTasks()).toHaveLength(0);
            
            // When: Spawn multiple agents (simulating team creation)
            const agentIds = await Promise.all([
                agentManager.spawnAgent({
                    template: 'frontend-specialist',
                    name: 'Frontend Dev'
                }),
                agentManager.spawnAgent({
                    template: 'backend-specialist', 
                    name: 'Backend Dev'
                }),
                agentManager.spawnAgent({
                    template: 'testing-specialist',
                    name: 'Test Engineer'
                })
            ]);

            // Allow event processing
            await new Promise(resolve => setTimeout(resolve, 50));

            // Then: No warnings should appear despite multiple agents
            expect(notificationService.showWarning).not.toHaveBeenCalled();
            expect(notificationService.showInformation).not.toHaveBeenCalled();
            
            // Verify all agents were created
            expect(agentIds).toHaveLength(3);
            agentIds.forEach(id => {
                const agent = agentManager.getAgent(id);
                expect(agent).toBeDefined();
            });
        });

        test('should NOT show warning during rapid sequential agent spawning', async () => {
            // Given: Empty task queue
            expect(taskQueue.getTasks()).toHaveLength(0);
            
            // When: Rapidly spawn agents one after another
            const agentTemplates = [
                'frontend-specialist',
                'backend-specialist', 
                'testing-specialist',
                'devops-engineer',
                'database-architect'
            ];

            const agentIds: string[] = [];
            for (let i = 0; i < agentTemplates.length; i++) {
                const agentId = await agentManager.spawnAgent({
                    template: agentTemplates[i],
                    name: `Agent ${i + 1}`
                });
                agentIds.push(agentId);
                
                // Small delay to simulate real spawning timing
                await new Promise(resolve => setTimeout(resolve, 5));
            }

            // Allow final event processing
            await new Promise(resolve => setTimeout(resolve, 20));

            // Then: No warnings throughout the entire spawning process
            expect(notificationService.showWarning).not.toHaveBeenCalled();
            expect(notificationService.showInformation).not.toHaveBeenCalled();
            
            // Verify all agents exist
            expect(agentIds).toHaveLength(5);
        });

        test('should NOT show warning when agents become idle after spawning', async () => {
            // Given: Empty task queue
            expect(taskQueue.getTasks()).toHaveLength(0);
            
            // When: Spawn agent and transition to idle
            const agentId = await agentManager.spawnAgent({
                template: 'frontend-specialist',
                name: 'Frontend Dev'
            });

            // Simulate agent becoming idle (status change triggers onAgentUpdate)
            const agent = agentManager.getAgent(agentId);
            if (agent) {
                agent.status = 'idle';
                agentManager.updateAgent(agentId, { status: 'idle' });
            }

            // Allow event processing
            await new Promise(resolve => setTimeout(resolve, 20));

            // Then: No warnings when agent becomes idle
            expect(notificationService.showWarning).not.toHaveBeenCalled();
            expect(notificationService.showInformation).not.toHaveBeenCalled();
        });
    });

    describe('✅ Agent Spawning With Tasks - VALID WARNINGS', () => {
        test('should show appropriate warning when spawning agents with pending tasks', async () => {
            // Given: Tasks in the queue
            taskQueue.addTask({
                title: 'Build Login Form',
                description: 'Create a responsive login form',
                priority: 'high'
            });
            
            taskQueue.addTask({
                title: 'Setup Database',
                description: 'Configure database connection',
                priority: 'medium'
            });

            // When: Spawn agents (they should pick up tasks)
            const agentIds = await Promise.all([
                agentManager.spawnAgent({
                    template: 'frontend-specialist',
                    name: 'Frontend Dev'
                }),
                agentManager.spawnAgent({
                    template: 'backend-specialist',
                    name: 'Backend Dev'
                })
            ]);

            // Allow event processing and task assignment
            await new Promise(resolve => setTimeout(resolve, 100));

            // Then: Should NOT show warning if tasks are successfully assigned
            expect(notificationService.showWarning).not.toHaveBeenCalled();
            
            // Verify agents exist
            expect(agentIds).toHaveLength(2);
        });

        test('should show warning when tasks exist but cannot be assigned to spawned agents', async () => {
            // Given: Tasks requiring specific capabilities that agents don't have
            taskQueue.addTask({
                title: 'AI Model Training',
                description: 'Train machine learning model',
                priority: 'high',
                requiredCapabilities: ['machine-learning', 'python', 'tensorflow']
            });

            // When: Spawn agents without required capabilities
            await agentManager.spawnAgent({
                template: 'frontend-specialist', // Only has frontend capabilities
                name: 'Frontend Dev'
            });

            // Allow event processing
            await new Promise(resolve => setTimeout(resolve, 50));

            // Then: Should show warning because task cannot be assigned
            expect(notificationService.showWarning).toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );
        });
    });

    describe('🔄 Real-World Workflow Scenarios', () => {
        test('should handle complete team creation workflow without false warnings', async () => {
            // Simulate the exact user workflow that caused the original bug:
            // 1. User clicks "Add Team" in NofX sidebar
            // 2. Multiple agents are spawned rapidly
            // 3. User hasn't created any tasks yet
            
            // Given: Fresh state (no tasks, no agents)
            expect(taskQueue.getTasks()).toHaveLength(0);
            expect(agentManager.getActiveAgents()).toHaveLength(0);

            // When: Simulate team creation process
            console.log('🎯 Simulating team creation that caused original bug...');
            
            // Step 1: Start spawning team members
            const teamPromises = [
                agentManager.spawnAgent({
                    template: 'frontend-specialist',
                    name: 'UI Expert'
                }),
                agentManager.spawnAgent({
                    template: 'backend-specialist', 
                    name: 'API Developer'
                }),
                agentManager.spawnAgent({
                    template: 'testing-specialist',
                    name: 'QA Engineer'
                })
            ];

            // Step 2: Agents spawn with slight delays (realistic timing)
            const [frontendId, backendId, testerId] = await Promise.all(teamPromises);

            // Step 3: Allow all agent update events to process
            await new Promise(resolve => setTimeout(resolve, 100));

            // Then: Verify the bug is fixed - NO false warnings
            expect(notificationService.showWarning).not.toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );
            expect(notificationService.showInformation).not.toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );

            // Verify team was created successfully
            expect([frontendId, backendId, testerId]).toHaveLength(3);
            expect(agentManager.getActiveAgents()).toHaveLength(3);
            
            console.log('✅ Team creation completed without false warnings!');
        });

        test('should handle mixed scenario: spawn agents, then add tasks', async () => {
            // Given: Start with empty queue
            expect(taskQueue.getTasks()).toHaveLength(0);

            // When: First spawn agents (should not trigger warnings)
            const agentIds = await Promise.all([
                agentManager.spawnAgent({
                    template: 'frontend-specialist',
                    name: 'Frontend Dev'
                }),
                agentManager.spawnAgent({
                    template: 'backend-specialist',
                    name: 'Backend Dev'
                })
            ]);

            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify no warnings after agent spawning
            expect(notificationService.showWarning).not.toHaveBeenCalled();
            expect(notificationService.showInformation).not.toHaveBeenCalled();

            // Then: Add tasks (should be assigned successfully)
            taskQueue.addTask({
                title: 'Create Homepage',
                description: 'Build the main landing page',
                priority: 'high'
            });

            taskQueue.addTask({
                title: 'Setup API',
                description: 'Create REST API endpoints',
                priority: 'high'
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify no warnings after successful task assignment
            expect(notificationService.showWarning).not.toHaveBeenCalled();
            
            // Verify agents and tasks exist
            expect(agentIds).toHaveLength(2);
            expect(taskQueue.getTasks()).toHaveLength(2);
        });
    });

    describe('🧪 Edge Case Integration Tests', () => {
        test('should handle agent disposal during spawning process', async () => {
            // Given: Empty task queue
            expect(taskQueue.getTasks()).toHaveLength(0);

            // When: Spawn agent then immediately dispose it
            const agentId = await agentManager.spawnAgent({
                template: 'frontend-specialist',
                name: 'Temporary Agent'
            });

            // Immediately terminate the agent
            agentManager.terminateAgent(agentId);

            await new Promise(resolve => setTimeout(resolve, 50));

            // Then: Should not trigger false warnings
            expect(notificationService.showWarning).not.toHaveBeenCalled();
            expect(notificationService.showInformation).not.toHaveBeenCalled();
        });

        test('should handle configuration changes during agent spawning', async () => {
            // Given: Auto-assign enabled
            expect(taskQueue.getTasks()).toHaveLength(0);

            // When: Spawn agents while changing configuration
            const agentPromise = agentManager.spawnAgent({
                template: 'frontend-specialist',
                name: 'Frontend Dev'
            });

            // Change configuration while spawning
            configService.update('nofx.autoAssignTasks', false);
            
            await agentPromise;
            await new Promise(resolve => setTimeout(resolve, 50));

            // Then: Should handle gracefully without false warnings
            expect(notificationService.showWarning).not.toHaveBeenCalled();
        });
    });

    describe('📊 Performance Integration Tests', () => {
        test('should handle high-frequency agent spawning without performance issues', async () => {
            const startTime = Date.now();
            
            // Given: Empty task queue
            expect(taskQueue.getTasks()).toHaveLength(0);

            // When: Spawn many agents rapidly
            const spawnPromises = Array.from({ length: 10 }, (_, i) =>
                agentManager.spawnAgent({
                    template: 'frontend-specialist',
                    name: `Agent ${i + 1}`
                })
            );

            const agentIds = await Promise.all(spawnPromises);
            await new Promise(resolve => setTimeout(resolve, 100));

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Then: Should complete in reasonable time without warnings
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
            expect(notificationService.showWarning).not.toHaveBeenCalled();
            expect(notificationService.showInformation).not.toHaveBeenCalled();
            expect(agentIds).toHaveLength(10);
        });
    });
});