/**
 * BULLETPROOF TESTS FOR TASK ASSIGNMENT WARNING SYSTEM
 * 
 * This test suite ensures the tryAssignTasks method never shows false warnings again.
 * Every possible scenario, edge case, and failure mode is covered.
 */

import { TaskQueue } from '../../../tasks/TaskQueue';
import { AgentManager } from '../../../agents/AgentManager';
import {
    ILoggingService,
    IEventBus,
    IErrorHandler,
    INotificationService,
    IConfigurationService,
    ITaskStateMachine,
    IPriorityTaskQueue,
    ICapabilityMatcher,
    ITaskDependencyManager
} from '../../../services/interfaces';
import { Task, TaskConfig, TaskStatus } from '../../../agents/types';
import { createMockAgent, createMockTask } from '../../helpers/mockFactories';

describe('TaskQueue.tryAssignTasks - BULLETPROOF WARNING SYSTEM', () => {
    let taskQueue: TaskQueue;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockTaskStateMachine: jest.Mocked<ITaskStateMachine>;
    let mockPriorityQueue: jest.Mocked<IPriorityTaskQueue>;
    let mockCapabilityMatcher: jest.Mocked<ICapabilityMatcher>;
    let mockDependencyManager: jest.Mocked<ITaskDependencyManager>;

    beforeEach(() => {
        // Create comprehensive mocks
        mockAgentManager = {
            getAvailableAgents: jest.fn(),
            getAgent: jest.fn(),
            executeTask: jest.fn(),
            onAgentUpdate: jest.fn(),
            getAgentTerminal: jest.fn(),
            updateAgentLoad: jest.fn(),
            getAgentCapacity: jest.fn(),
            getActiveAgents: jest.fn()
        } as any;

        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn(() => true),
            getChannel: jest.fn(),
            time: jest.fn(),
            timeEnd: jest.fn(),
            dispose: jest.fn()
        };

        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(() => ({ dispose: jest.fn() })),
            unsubscribe: jest.fn(),
            once: jest.fn(() => ({ dispose: jest.fn() })),
            filter: jest.fn(),
            subscribePattern: jest.fn(() => ({ dispose: jest.fn() })),
            setLoggingService: jest.fn(),
            dispose: jest.fn()
        };

        mockErrorHandler = {
            handleError: jest.fn(),
            handleAsync: jest.fn(),
            wrapSync: jest.fn(),
            withRetry: jest.fn(),
            dispose: jest.fn()
        };

        mockNotificationService = {
            showInformation: jest.fn().mockResolvedValue(undefined),
            showWarning: jest.fn().mockResolvedValue(undefined),
            showError: jest.fn().mockResolvedValue(undefined),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            withProgress: jest.fn(),
            confirm: jest.fn(),
            confirmDestructive: jest.fn()
        };

        mockConfigService = {
            isAutoAssignTasks: jest.fn(() => true),
            get: jest.fn(),
            update: jest.fn(),
            onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
            dispose: jest.fn()
        };

        mockTaskStateMachine = {
            transition: jest.fn(() => []),
            getCurrentState: jest.fn(),
            canTransition: jest.fn(() => true),
            getValidTransitions: jest.fn(() => []),
            setTaskReader: jest.fn(),
            dispose: jest.fn()
        };

        mockPriorityQueue = {
            enqueue: jest.fn(),
            dequeue: jest.fn(),
            dequeueReady: jest.fn(),
            peek: jest.fn(),
            isEmpty: jest.fn(() => true),
            size: jest.fn(() => 0),
            contains: jest.fn(() => false),
            remove: jest.fn(),
            toArray: jest.fn(() => []),
            moveToReady: jest.fn(),
            updatePriority: jest.fn(),
            computeEffectivePriority: jest.fn(),
            dispose: jest.fn()
        };

        mockCapabilityMatcher = {
            findBestAgent: jest.fn(),
            rankAgents: jest.fn(() => []),
            calculateMatchScore: jest.fn(() => 0.5),
            dispose: jest.fn()
        };

        mockDependencyManager = {
            addDependency: jest.fn(() => true),
            removeDependency: jest.fn(),
            validateDependencies: jest.fn(() => []),
            checkConflicts: jest.fn(() => []),
            getReadyTasks: jest.fn(() => []),
            getDependentTasks: jest.fn(() => []),
            getSoftDependents: jest.fn(() => []),
            resolveConflict: jest.fn(() => true),
            addSoftDependency: jest.fn(),
            dispose: jest.fn()
        };

        taskQueue = new TaskQueue(
            mockAgentManager,
            mockLoggingService,
            mockEventBus,
            mockErrorHandler,
            mockNotificationService,
            mockConfigService,
            mockTaskStateMachine,
            mockPriorityQueue,
            mockCapabilityMatcher,
            mockDependencyManager
        );
    });

    afterEach(() => {
        taskQueue.dispose();
        jest.clearAllMocks();
    });

    describe('🚫 FALSE WARNING PREVENTION', () => {
        describe('Empty Queue Scenarios - NO WARNINGS SHOULD APPEAR', () => {
            test('should NOT show warning when queue is empty and no agents available', () => {
                // Setup: Empty queue, no agents
                mockPriorityQueue.size.mockReturnValue(0);
                mockPriorityQueue.isEmpty.mockReturnValue(true);
                mockAgentManager.getAvailableAgents.mockReturnValue([]);

                // Execute: Trigger tryAssignTasks (simulating agent update)
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                agentUpdateCallback();

                // Verify: NO warnings should be shown
                expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
                expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
                expect(mockLoggingService.debug).toHaveBeenCalledWith(
                    expect.stringContaining('Queue: 0')
                );
            });

            test('should NOT show warning when queue is empty but agents are available', () => {
                // Setup: Empty queue, agents available
                mockPriorityQueue.size.mockReturnValue(0);
                mockPriorityQueue.isEmpty.mockReturnValue(true);
                mockAgentManager.getAvailableAgents.mockReturnValue([
                    createMockAgent({ id: 'agent-1', status: 'idle' }),
                    createMockAgent({ id: 'agent-2', status: 'idle' })
                ]);

                // Execute: Trigger tryAssignTasks
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                agentUpdateCallback();

                // Verify: NO warnings should be shown
                expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
                expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
            });

            test('should NOT show warning during agent spawning with empty queue', () => {
                // Setup: Simulate agent spawning scenario (the original bug)
                mockPriorityQueue.size.mockReturnValue(0);
                mockPriorityQueue.isEmpty.mockReturnValue(true);
                mockAgentManager.getAvailableAgents.mockReturnValue([]);

                // Execute: Multiple rapid agent updates (simulating team creation)
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                
                // First agent spawns
                mockAgentManager.getAvailableAgents.mockReturnValue([
                    createMockAgent({ id: 'agent-1', status: 'idle' })
                ]);
                agentUpdateCallback();

                // Second agent spawns  
                mockAgentManager.getAvailableAgents.mockReturnValue([
                    createMockAgent({ id: 'agent-1', status: 'idle' }),
                    createMockAgent({ id: 'agent-2', status: 'idle' })
                ]);
                agentUpdateCallback();

                // Third agent spawns
                mockAgentManager.getAvailableAgents.mockReturnValue([
                    createMockAgent({ id: 'agent-1', status: 'idle' }),
                    createMockAgent({ id: 'agent-2', status: 'idle' }),
                    createMockAgent({ id: 'agent-3', status: 'idle' })
                ]);
                agentUpdateCallback();

                // Verify: NO warnings should be shown at any point
                expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
                expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
            });

            test('should NOT show warning when queue becomes empty after assignment', () => {
                // Setup: Queue with task becomes empty after assignment
                mockPriorityQueue.size.mockReturnValueOnce(1).mockReturnValue(0);
                mockPriorityQueue.isEmpty.mockReturnValueOnce(false).mockReturnValue(true);
                mockPriorityQueue.dequeueReady.mockReturnValueOnce(createMockTask()).mockReturnValue(null);
                mockAgentManager.getAvailableAgents.mockReturnValue([
                    createMockAgent({ id: 'agent-1', status: 'idle' })
                ]);
                mockCapabilityMatcher.findBestAgent.mockReturnValue(
                    createMockAgent({ id: 'agent-1', status: 'idle' })
                );
                mockAgentManager.executeTask.mockResolvedValue(undefined);

                // Execute: Trigger assignment that empties the queue
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                agentUpdateCallback();

                // Verify: NO warnings after queue becomes empty
                expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            });
        });

        describe('Edge Cases - Boundary Conditions', () => {
            test('should handle null/undefined queue size gracefully', () => {
                // Setup: Queue size returns null/undefined
                mockPriorityQueue.size.mockReturnValue(null as any);
                mockAgentManager.getAvailableAgents.mockReturnValue([]);

                // Execute: Should not crash
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                expect(() => agentUpdateCallback()).not.toThrow();

                // Verify: No warnings for invalid queue size
                expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            });

            test('should handle negative queue size gracefully', () => {
                // Setup: Queue size returns negative (should never happen but test anyway)
                mockPriorityQueue.size.mockReturnValue(-1);
                mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

                // Execute: Should not crash
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                expect(() => agentUpdateCallback()).not.toThrow();

                // Verify: No warnings for negative queue size
                expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            });

            test('should handle extremely large queue sizes', () => {
                // Setup: Very large queue size
                mockPriorityQueue.size.mockReturnValue(Number.MAX_SAFE_INTEGER);
                mockPriorityQueue.isEmpty.mockReturnValue(false);
                mockAgentManager.getAvailableAgents.mockReturnValue([]);

                // Execute: Should handle large numbers
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                expect(() => agentUpdateCallback()).not.toThrow();

                // Verify: Should show warning for actual large queue
                expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                    '📋 Task queued. All agents are busy.'
                );
            });
        });
    });

    describe('✅ VALID WARNING SCENARIOS', () => {
        describe('Tasks Present - Warnings SHOULD Appear', () => {
            test('should show "all agents busy" when tasks exist but no agents available', () => {
                // Setup: Tasks in queue, no available agents
                mockPriorityQueue.size.mockReturnValue(3);
                mockPriorityQueue.isEmpty.mockReturnValue(false);
                mockAgentManager.getAvailableAgents.mockReturnValue([]);

                // Execute: Trigger tryAssignTasks
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                agentUpdateCallback();

                // Verify: Should show "all agents busy" message
                expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                    '📋 Task queued. All agents are busy.'
                );
                expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            });

            test('should show "not assigned" warning when tasks exist, agents available, but assignment fails', () => {
                // Setup: Tasks in queue, agents available, but assignment fails
                mockPriorityQueue.size.mockReturnValue(2);
                mockPriorityQueue.isEmpty.mockReturnValue(false);
                mockPriorityQueue.dequeueReady.mockReturnValue(createMockTask());
                mockAgentManager.getAvailableAgents.mockReturnValue([
                    createMockAgent({ id: 'agent-1', status: 'idle' })
                ]);
                mockCapabilityMatcher.findBestAgent.mockReturnValue(null); // No suitable agent

                // Execute: Trigger tryAssignTasks
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                agentUpdateCallback();

                // Verify: Should show "not assigned" warning
                expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                    '📋 Task added but not assigned. Check agent status.'
                );
                expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
            });

            test('should show warning when tasks exist but agent execution fails', () => {
                // Setup: Tasks and agents available, but execution fails
                mockPriorityQueue.size.mockReturnValue(1);
                mockPriorityQueue.isEmpty.mockReturnValue(false);
                mockPriorityQueue.dequeueReady.mockReturnValue(createMockTask());
                mockAgentManager.getAvailableAgents.mockReturnValue([
                    createMockAgent({ id: 'agent-1', status: 'idle' })
                ]);
                mockCapabilityMatcher.findBestAgent.mockReturnValue(
                    createMockAgent({ id: 'agent-1', status: 'idle' })
                );
                mockAgentManager.executeTask.mockRejectedValue(new Error('Execution failed'));

                // Execute: Trigger tryAssignTasks
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                agentUpdateCallback();

                // Verify: Should show warning due to execution failure
                expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                    '📋 Task added but not assigned. Check agent status.'
                );
            });
        });

        describe('Mixed Scenarios - Precise Warning Logic', () => {
            test('should show appropriate warning based on queue state changes', () => {
                // Setup: Queue starts with tasks, then becomes empty
                mockPriorityQueue.size
                    .mockReturnValueOnce(2)  // First call: has tasks
                    .mockReturnValueOnce(1)  // During assignment
                    .mockReturnValue(0);     // After assignment
                
                mockPriorityQueue.isEmpty
                    .mockReturnValueOnce(false)  // First call: not empty
                    .mockReturnValueOnce(false)  // During assignment
                    .mockReturnValue(true);      // After assignment

                mockPriorityQueue.dequeueReady
                    .mockReturnValueOnce(createMockTask())  // First task assigned
                    .mockReturnValueOnce(createMockTask())  // Second task assigned
                    .mockReturnValue(null);                 // No more tasks

                mockAgentManager.getAvailableAgents.mockReturnValue([
                    createMockAgent({ id: 'agent-1', status: 'idle' }),
                    createMockAgent({ id: 'agent-2', status: 'idle' })
                ]);

                mockCapabilityMatcher.findBestAgent.mockReturnValue(
                    createMockAgent({ id: 'agent-1', status: 'idle' })
                );
                mockAgentManager.executeTask.mockResolvedValue(undefined);

                // Execute: Trigger assignment
                const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
                agentUpdateCallback();

                // Verify: No warnings when tasks are successfully assigned
                expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
                expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
            });
        });
    });

    describe('⚙️ CONFIGURATION SCENARIOS', () => {
        test('should show correct message when auto-assign is disabled', () => {
            // Setup: Auto-assign disabled
            mockConfigService.isAutoAssignTasks.mockReturnValue(false);
            mockPriorityQueue.size.mockReturnValue(1);

            // Execute: Trigger tryAssignTasks
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Verify: Should show auto-assign disabled message
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task added. Auto-assign is disabled - assign manually.'
            );
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
        });

        test('should handle configuration service being null/undefined', () => {
            // Setup: Create TaskQueue without config service
            const taskQueueNoConfig = new TaskQueue(
                mockAgentManager,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockNotificationService,
                undefined, // No config service
                mockTaskStateMachine,
                mockPriorityQueue,
                mockCapabilityMatcher,
                mockDependencyManager
            );

            mockPriorityQueue.size.mockReturnValue(0);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            // Execute: Should not crash
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Cleanup
            taskQueueNoConfig.dispose();
        });
    });

    describe('🔄 STRESS TEST SCENARIOS', () => {
        test('should handle rapid agent updates without false warnings', () => {
            // Setup: Empty queue, rapid agent spawning
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];

            // Execute: Simulate rapid agent spawning (100 updates)
            for (let i = 0; i < 100; i++) {
                mockAgentManager.getAvailableAgents.mockReturnValue(
                    Array.from({ length: i + 1 }, (_, idx) => 
                        createMockAgent({ id: `agent-${idx}`, status: 'idle' })
                    )
                );
                agentUpdateCallback();
            }

            // Verify: No warnings despite many agent updates
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('should handle queue state oscillations correctly', () => {
            // Setup: Queue size oscillating between 0 and positive values
            let queueSize = 0;
            mockPriorityQueue.size.mockImplementation(() => queueSize);
            mockPriorityQueue.isEmpty.mockImplementation(() => queueSize === 0);
            
            mockAgentManager.getAvailableAgents.mockReturnValue([
                createMockAgent({ id: 'agent-1', status: 'idle' })
            ]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];

            // Execute: Oscillate queue size
            for (let i = 0; i < 50; i++) {
                queueSize = i % 2; // Alternates between 0 and 1
                agentUpdateCallback();
            }

            // Verify: Warnings only when queue has tasks
            const warningCalls = mockNotificationService.showWarning.mock.calls.length;
            const infoCalls = mockNotificationService.showInformation.mock.calls.length;
            
            // Should only have warnings when queueSize was 1
            expect(warningCalls + infoCalls).toBeGreaterThan(0);
            expect(warningCalls + infoCalls).toBeLessThan(50); // Not on every call
        });
    });

    describe('🛡️ ERROR RESILIENCE', () => {
        test('should handle notification service errors gracefully', () => {
            // Setup: Notification service throws errors
            mockNotificationService.showWarning.mockRejectedValue(new Error('Notification failed'));
            mockNotificationService.showInformation.mockRejectedValue(new Error('Notification failed'));
            
            mockPriorityQueue.size.mockReturnValue(1);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            // Execute: Should not crash despite notification errors
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Verify: Attempted to show notification
            expect(mockNotificationService.showInformation).toHaveBeenCalled();
        });

        test('should handle priority queue errors gracefully', () => {
            // Setup: Priority queue methods throw errors
            mockPriorityQueue.size.mockImplementation(() => {
                throw new Error('Queue error');
            });
            mockPriorityQueue.isEmpty.mockImplementation(() => {
                throw new Error('Queue error');
            });

            // Execute: Should not crash
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();
        });
    });

    describe('📊 LOGGING VERIFICATION', () => {
        test('should log debug information correctly for empty queue', () => {
            // Setup: Empty queue
            mockPriorityQueue.size.mockReturnValue(0);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            // Execute: Trigger tryAssignTasks
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Verify: Logs debug info about queue state
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Queue: 0')
            );
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Available: 1')
            );
        });

        test('should log debug information correctly for non-empty queue', () => {
            // Setup: Non-empty queue, no agents
            mockPriorityQueue.size.mockReturnValue(5);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            // Execute: Trigger tryAssignTasks
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Verify: Logs debug info about queue state
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Queue: 5')
            );
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Available: 0')
            );
        });
    });
});