/**
 * EDGE CASE BULLETPROOF TESTS FOR TASK QUEUE WARNING SYSTEM
 * 
 * These tests cover boundary conditions, unusual states, and edge cases
 * that could potentially trigger false warnings or system failures.
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

describe('TaskQueue Edge Cases - BULLETPROOF BOUNDARY CONDITIONS', () => {
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
        // Setup comprehensive mocks with edge case behaviors
        mockAgentManager = {
            getAvailableAgents: jest.fn(() => []),
            getAgent: jest.fn(),
            executeTask: jest.fn(),
            onAgentUpdate: jest.fn(),
            getAgentTerminal: jest.fn(),
            updateAgentLoad: jest.fn(),
            getAgentCapacity: jest.fn(() => ({ currentLoad: 0, maxCapacity: 5 })),
            getActiveAgents: jest.fn(() => [])
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

    describe('🔢 NUMERICAL BOUNDARY CONDITIONS', () => {
        test('should handle queue size of 0 correctly', () => {
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('should handle queue size of 1 correctly', () => {
            mockPriorityQueue.size.mockReturnValue(1);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );
        });

        test('should handle extremely large queue sizes', () => {
            mockPriorityQueue.size.mockReturnValue(Number.MAX_SAFE_INTEGER);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );
        });

        test('should handle negative queue sizes gracefully (defensive programming)', () => {
            mockPriorityQueue.size.mockReturnValue(-5);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Negative queue size should be treated as empty (no warnings)
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('should handle NaN queue size gracefully', () => {
            mockPriorityQueue.size.mockReturnValue(NaN);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // NaN queue size should be treated as empty (no warnings)
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('should handle Infinity queue size gracefully', () => {
            mockPriorityQueue.size.mockReturnValue(Infinity);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Infinite queue size should show warning
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );
        });
    });

    describe('🎯 NULL/UNDEFINED EDGE CASES', () => {
        test('should handle null priority queue gracefully', () => {
            const taskQueueNullQueue = new TaskQueue(
                mockAgentManager,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                mockNotificationService,
                mockConfigService,
                mockTaskStateMachine,
                null as any, // Null priority queue
                mockCapabilityMatcher,
                mockDependencyManager
            );

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[1][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            taskQueueNullQueue.dispose();
        });

        test('should handle undefined notification service gracefully', () => {
            const taskQueueNoNotifications = new TaskQueue(
                mockAgentManager,
                mockLoggingService,
                mockEventBus,
                mockErrorHandler,
                undefined, // No notification service
                mockConfigService,
                mockTaskStateMachine,
                mockPriorityQueue,
                mockCapabilityMatcher,
                mockDependencyManager
            );

            mockPriorityQueue.size.mockReturnValue(1);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[1][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            taskQueueNoNotifications.dispose();
        });

        test('should handle null agent list gracefully', () => {
            mockPriorityQueue.size.mockReturnValue(2);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue(null as any);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should not crash and should not show warnings for null agent list
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('should handle undefined agent list gracefully', () => {
            mockPriorityQueue.size.mockReturnValue(2);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue(undefined as any);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should not crash and should not show warnings for undefined agent list
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });
    });

    describe('⚠️ EXCEPTION HANDLING EDGE CASES', () => {
        test('should handle priority queue size() throwing exception', () => {
            mockPriorityQueue.size.mockImplementation(() => {
                throw new Error('Queue size calculation failed');
            });
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should handle error gracefully
            expect(mockErrorHandler.handleError).toHaveBeenCalled();
        });

        test('should handle agent manager throwing exception', () => {
            mockPriorityQueue.size.mockReturnValue(0);
            mockAgentManager.getAvailableAgents.mockImplementation(() => {
                throw new Error('Agent retrieval failed');
            });

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should handle error gracefully
            expect(mockErrorHandler.handleError).toHaveBeenCalled();
        });

        test('should handle notification service throwing exception', () => {
            mockPriorityQueue.size.mockReturnValue(1);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);
            mockNotificationService.showInformation.mockImplementation(() => {
                throw new Error('Notification failed');
            });

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should attempt notification and handle error
            expect(mockNotificationService.showInformation).toHaveBeenCalled();
        });

        test('should handle logging service being null', () => {
            const taskQueueNoLogging = new TaskQueue(
                mockAgentManager,
                null as any, // No logging service
                mockEventBus,
                mockErrorHandler,
                mockNotificationService,
                mockConfigService,
                mockTaskStateMachine,
                mockPriorityQueue,
                mockCapabilityMatcher,
                mockDependencyManager
            );

            mockPriorityQueue.size.mockReturnValue(0);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[1][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            taskQueueNoLogging.dispose();
        });
    });

    describe('🔄 STATE TRANSITION EDGE CASES', () => {
        test('should handle queue size changing during execution', () => {
            let callCount = 0;
            mockPriorityQueue.size.mockImplementation(() => {
                return callCount++ === 0 ? 3 : 0; // Changes from 3 to 0
            });
            
            mockPriorityQueue.isEmpty.mockImplementation(() => {
                return callCount > 1;
            });

            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Should handle dynamic queue size changes
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
        });

        test('should handle agents list changing during execution', () => {
            mockPriorityQueue.size.mockReturnValue(1);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            
            let callCount = 0;
            mockAgentManager.getAvailableAgents.mockImplementation(() => {
                return callCount++ === 0 ? [] : [createMockAgent()];
            });

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Should handle dynamic agent list changes
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );
        });

        test('should handle queue becoming inconsistent (size vs isEmpty)', () => {
            // Inconsistent state: size > 0 but isEmpty = true
            mockPriorityQueue.size.mockReturnValue(5);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should handle inconsistency gracefully (trust isEmpty over size for warnings)
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('should handle reverse inconsistency (size = 0 but isEmpty = false)', () => {
            // Inconsistent state: size = 0 but isEmpty = false
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should not show warnings when size is 0 regardless of isEmpty
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });
    });

    describe('🕰️ TIMING AND CONCURRENCY EDGE CASES', () => {
        test('should handle rapid successive calls to tryAssignTasks', () => {
            mockPriorityQueue.size.mockReturnValue(0);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Rapid successive calls
            for (let i = 0; i < 100; i++) {
                agentUpdateCallback();
            }

            // Should not accumulate warnings
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('should handle concurrent modification of queue state', () => {
            // Simulate concurrent modification
            let queueSize = 0;
            mockPriorityQueue.size.mockImplementation(() => queueSize);
            mockPriorityQueue.isEmpty.mockImplementation(() => queueSize === 0);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];

            // Simulate concurrent modifications
            const modifications = [
                () => { queueSize = 5; },
                () => { queueSize = 0; },
                () => { queueSize = 2; },
                () => { queueSize = 0; }
            ];

            modifications.forEach((modify, index) => {
                modify();
                agentUpdateCallback();
            });

            // Should handle all modifications without crashing
            expect(mockNotificationService.showWarning).not.toHaveBeenCalledWith(
                expect.stringContaining('Task added but not assigned')
            );
        });
    });

    describe('🔧 CONFIGURATION EDGE CASES', () => {
        test('should handle auto-assign configuration being null', () => {
            mockConfigService.isAutoAssignTasks.mockReturnValue(null as any);
            mockPriorityQueue.size.mockReturnValue(0);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should default to true when null
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
        });

        test('should handle auto-assign configuration being undefined', () => {
            mockConfigService.isAutoAssignTasks.mockReturnValue(undefined as any);
            mockPriorityQueue.size.mockReturnValue(0);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should default to true when undefined
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
        });

        test('should handle config service throwing exceptions', () => {
            mockConfigService.isAutoAssignTasks.mockImplementation(() => {
                throw new Error('Config access failed');
            });
            mockPriorityQueue.size.mockReturnValue(0);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should handle config errors gracefully
            expect(mockErrorHandler.handleError).toHaveBeenCalled();
        });
    });

    describe('🧮 MATHEMATICAL EDGE CASES', () => {
        test('should handle floating point queue sizes', () => {
            mockPriorityQueue.size.mockReturnValue(2.7); // Floating point
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Should treat any positive number as having tasks
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );
        });

        test('should handle very small positive queue sizes', () => {
            mockPriorityQueue.size.mockReturnValue(0.00001); // Very small positive
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Should treat any positive number as having tasks
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );
        });

        test('should handle queue size exactly at zero boundary', () => {
            mockPriorityQueue.size.mockReturnValue(0.0); // Explicit zero
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Should not show warnings for exact zero
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('should handle negative zero (-0)', () => {
            mockPriorityQueue.size.mockReturnValue(-0); // Negative zero
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Should treat -0 same as 0 (no warnings)
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });
    });

    describe('🔍 REGRESSION PREVENTION', () => {
        test('REGRESSION TEST: empty queue with agents should never show warning', () => {
            // This is the exact scenario that caused the original bug
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([
                createMockAgent({ id: 'agent-1', status: 'idle' }),
                createMockAgent({ id: 'agent-2', status: 'idle' }),
                createMockAgent({ id: 'agent-3', status: 'idle' })
            ]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // CRITICAL: This should NEVER show a warning
            expect(mockNotificationService.showWarning).not.toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );
            expect(mockNotificationService.showInformation).not.toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );
        });

        test('REGRESSION TEST: team creation scenario should never trigger warnings', () => {
            // Simulate exact team creation scenario
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];

            // Simulate rapid agent spawning during team creation
            const teamSizes = [1, 2, 3, 4, 5]; // Agents being added one by one
            
            teamSizes.forEach(size => {
                mockAgentManager.getAvailableAgents.mockReturnValue(
                    Array.from({ length: size }, (_, i) => 
                        createMockAgent({ id: `agent-${i}`, status: 'idle' })
                    )
                );
                agentUpdateCallback();
            });

            // CRITICAL: No warnings throughout entire team creation
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });
    });
});