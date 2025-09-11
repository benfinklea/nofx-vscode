/**
 * REGRESSION TESTS FOR FALSE TASK WARNING BUG
 * 
 * These tests specifically target the bug where adding a team in Cursor showed
 * "📋 Task added but not assigned. Check agent status." even when no tasks existed.
 * 
 * This suite ensures this exact bug scenario never happens again.
 */

import { TaskQueue } from '../../tasks/TaskQueue';
import { AgentManager } from '../../agents/AgentManager';
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
} from '../../services/interfaces';
import { createMockAgent } from '../helpers/mockFactories';

describe('REGRESSION: False Task Warning Bug', () => {
    let taskQueue: TaskQueue;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockPriorityQueue: jest.Mocked<IPriorityTaskQueue>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockTaskStateMachine: jest.Mocked<ITaskStateMachine>;
    let mockCapabilityMatcher: jest.Mocked<ICapabilityMatcher>;
    let mockDependencyManager: jest.Mocked<ITaskDependencyManager>;

    beforeEach(() => {
        // Create minimal mocks focused on the regression scenario
        mockAgentManager = {
            getAvailableAgents: jest.fn(() => []),
            onAgentUpdate: jest.fn()
        } as any;

        mockNotificationService = {
            showWarning: jest.fn().mockResolvedValue(undefined),
            showInformation: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockPriorityQueue = {
            size: jest.fn(() => 0),
            isEmpty: jest.fn(() => true)
        } as any;

        mockLoggingService = {
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as any;

        mockEventBus = {
            subscribe: jest.fn(() => ({ dispose: jest.fn() }))
        } as any;

        mockErrorHandler = {
            handleError: jest.fn()
        } as any;

        mockConfigService = {
            isAutoAssignTasks: jest.fn(() => true),
            onDidChange: jest.fn(() => ({ dispose: jest.fn() }))
        } as any;

        mockTaskStateMachine = {
            setTaskReader: jest.fn()
        } as any;

        mockCapabilityMatcher = {} as any;
        mockDependencyManager = {} as any;

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
    });

    describe('🐛 ORIGINAL BUG REPRODUCTION', () => {
        test('REGRESSION: Should NOT show false warning when adding team with empty queue', () => {
            // EXACT REPRODUCTION OF ORIGINAL BUG:
            // 1. User adds team in Cursor
            // 2. Agents are spawned (triggers onAgentUpdate)
            // 3. Task queue is empty (no tasks created yet)
            // 4. tryAssignTasks runs and shows false warning

            // Given: Empty task queue (no tasks exist)
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            
            // When: Agent is spawned (simulating team creation)
            mockAgentManager.getAvailableAgents.mockReturnValue([
                createMockAgent({ id: 'frontend-dev', status: 'idle' }),
                createMockAgent({ id: 'backend-dev', status: 'idle' }),
                createMockAgent({ id: 'qa-engineer', status: 'idle' })
            ]);

            // Simulate the agent update event that triggered the bug
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Then: CRITICAL - Should NOT show the false warning
            expect(mockNotificationService.showWarning).not.toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );
            
            // Should also not show the "all agents busy" message  
            expect(mockNotificationService.showInformation).not.toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );

            // Verify the fix: debug logging should show empty queue
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Queue: 0')
            );
        });

        test('REGRESSION: Should NOT show false warning during rapid team member addition', () => {
            // Simulate the exact user flow that caused the bug
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];

            // Simulate adding team members one by one (real user flow)
            
            // Step 1: Add first agent (Frontend Developer)
            mockAgentManager.getAvailableAgents.mockReturnValue([
                createMockAgent({ id: 'frontend-1', status: 'idle' })
            ]);
            agentUpdateCallback();

            // Step 2: Add second agent (Backend Developer)  
            mockAgentManager.getAvailableAgents.mockReturnValue([
                createMockAgent({ id: 'frontend-1', status: 'idle' }),
                createMockAgent({ id: 'backend-1', status: 'idle' })
            ]);
            agentUpdateCallback();

            // Step 3: Add third agent (QA Engineer)
            mockAgentManager.getAvailableAgents.mockReturnValue([
                createMockAgent({ id: 'frontend-1', status: 'idle' }),
                createMockAgent({ id: 'backend-1', status: 'idle' }),
                createMockAgent({ id: 'qa-1', status: 'idle' })
            ]);
            agentUpdateCallback();

            // CRITICAL: No false warnings at any step
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('REGRESSION: Should NOT show false warning with auto-assign disabled', () => {
            // Test the scenario with auto-assign disabled (different code path)
            mockConfigService.isAutoAssignTasks.mockReturnValue(false);
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([
                createMockAgent({ id: 'agent-1', status: 'idle' })
            ]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Should show the auto-assign disabled message, not false warning
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task added. Auto-assign is disabled - assign manually.'
            );
            
            // Should NOT show the false task assignment warning
            expect(mockNotificationService.showWarning).not.toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );
        });
    });

    describe('🎯 SPECIFIC BUG CONDITIONS', () => {
        test('REGRESSION: Should identify the exact condition that caused false warning', () => {
            // THE ROOT CAUSE: tryAssignTasks was called with:
            // - assigned = false (no assignment happened)
            // - queueSize = 0 (no tasks to assign)
            // - availableCount > 0 (agents available)
            // This triggered the false "not assigned" warning

            mockPriorityQueue.size.mockReturnValue(0); // CRITICAL: Empty queue
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([
                createMockAgent({ id: 'agent-1', status: 'idle' }) // CRITICAL: Agent available
            ]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // THE FIX: Warning should only show when queueSize > 0
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            
            // Verify the exact logging that confirms the fix
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Queue: 0, Available: 1')
            );
        });

        test('REGRESSION: Should verify the fix logic works correctly', () => {
            // Test the fixed condition: queueSize > 0 is required for warnings
            
            // First test: queueSize = 0, should NOT warn
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            let agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();

            // Reset mocks
            jest.clearAllMocks();

            // Second test: queueSize > 0, SHOULD warn
            mockPriorityQueue.size.mockReturnValue(1);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Now it should show warning because there are actual tasks
            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );
        });
    });

    describe('🔍 EDGE CASES THAT COULD REGRESS', () => {
        test('REGRESSION: Should handle edge case where queue size changes during execution', () => {
            // Edge case that could potentially cause regression
            let callCount = 0;
            mockPriorityQueue.size.mockImplementation(() => {
                return callCount++ === 0 ? 0 : 1; // Changes from 0 to 1
            });
            mockPriorityQueue.isEmpty.mockImplementation(() => {
                return callCount <= 1; // Changes from true to false
            });
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Should use the first (initial) queue size check for warning logic
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('REGRESSION: Should handle null/undefined queue size edge case', () => {
            // Edge case that could bypass the fix
            mockPriorityQueue.size.mockReturnValue(null as any);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should not show warnings for null queue size
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('REGRESSION: Should handle NaN queue size edge case', () => {
            // Edge case that could bypass the fix
            mockPriorityQueue.size.mockReturnValue(NaN);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should not show warnings for NaN queue size
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });
    });

    describe('📝 DOCUMENTATION OF THE FIX', () => {
        test('REGRESSION: Documents the exact fix applied', () => {
            // This test documents the exact change made to fix the bug
            
            // BEFORE (buggy code): 
            // if (!assigned) {
            //     if (availableCount === 0) {
            //         showInformation('📋 Task queued. All agents are busy.');
            //     } else {
            //         showWarning('📋 Task added but not assigned. Check agent status.');  // ← FALSE WARNING
            //     }
            // }

            // AFTER (fixed code):
            // if (!assigned) {
            //     if (queueSize > 0) {  // ← THE FIX: Only show warnings when there are actual tasks
            //         if (availableCount === 0) {
            //             showInformation('📋 Task queued. All agents are busy.');
            //         } else {
            //             showWarning('📋 Task added but not assigned. Check agent status.');
            //         }
            //     }
            // }

            mockPriorityQueue.size.mockReturnValue(0); // No tasks
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Verify the fix prevents the false warning
            expect(mockNotificationService.showWarning).not.toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );

            // Document that this is the specific fix location
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('No assignment made. Queue: 0')
            );
        });

        test('REGRESSION: Verifies fix preserves valid warning behavior', () => {
            // Ensure the fix doesn't break legitimate warnings
            
            mockPriorityQueue.size.mockReturnValue(2); // Has tasks
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Should still show warning when there are actual tasks that can't be assigned
            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );
        });
    });

    describe('🚨 CRITICAL REGRESSION GUARDS', () => {
        test('CRITICAL: Must never show false warning for empty queue scenario', () => {
            // This is the most critical test - the exact scenario that was broken
            
            // Setup the EXACT conditions that caused the original bug
            mockPriorityQueue.size.mockReturnValue(0);      // Empty queue
            mockPriorityQueue.isEmpty.mockReturnValue(true); // Confirmed empty
            mockAgentManager.getAvailableAgents.mockReturnValue([
                createMockAgent({ id: 'agent-1', status: 'idle' }),
                createMockAgent({ id: 'agent-2', status: 'idle' }),
                createMockAgent({ id: 'agent-3', status: 'idle' })
            ]); // Multiple agents available

            // Execute the problematic code path
            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // CRITICAL ASSERTION: This exact warning must NEVER appear for empty queue
            expect(mockNotificationService.showWarning).never.toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );

            // Additional critical assertions
            expect(mockNotificationService.showInformation).never.toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );

            // Verify debug logging shows the fix is working
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringMatching(/Queue: 0.*Available: 3/)
            );
        });

        test('CRITICAL: Must fail test if false warning behavior returns', () => {
            // This test will fail if someone accidentally reverts the fix
            
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([createMockAgent()]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // If this test fails, the bug has been reintroduced
            const falseWarningShown = mockNotificationService.showWarning.mock.calls.some(
                call => call[0] === '📋 Task added but not assigned. Check agent status.'
            );
            
            if (falseWarningShown) {
                throw new Error(
                    'REGRESSION DETECTED: False task assignment warning has returned! ' +
                    'The bug fix in TaskQueue.tryAssignTasks() has been reverted or broken.'
                );
            }

            // Test passes - fix is still working
            expect(falseWarningShown).toBe(false);
        });
    });
});