/**
 * BULLETPROOF TEST FOR TASK ASSIGNMENT WARNING FIX
 * 
 * This simplified test verifies the core fix works correctly without complex typing.
 * The main test ensures empty queue scenarios never show false warnings.
 */

import { TaskQueue } from '../../tasks/TaskQueue';

describe('Task Warning Fix - BULLETPROOF', () => {
    let taskQueue: TaskQueue;
    let mockAgentManager: any;
    let mockNotificationService: any;
    let mockPriorityQueue: any;
    let mockLoggingService: any;

    beforeEach(() => {
        // Simple mocks without complex typing
        mockAgentManager = {
            getAvailableAgents: jest.fn(() => []),
            onAgentUpdate: jest.fn()
        };

        mockNotificationService = {
            showWarning: jest.fn(),
            showInformation: jest.fn()
        };

        mockPriorityQueue = {
            size: jest.fn(() => 0),
            isEmpty: jest.fn(() => true)
        };

        mockLoggingService = {
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        const mockEventBus = {
            subscribe: jest.fn(() => ({ dispose: jest.fn() }))
        };

        const mockConfigService = {
            isAutoAssignTasks: jest.fn(() => true),
            onDidChange: jest.fn(() => ({ dispose: jest.fn() }))
        };

        taskQueue = new TaskQueue(
            mockAgentManager,
            mockLoggingService,
            mockEventBus,
            {} as any, // mockErrorHandler
            mockNotificationService,
            mockConfigService,
            {} as any, // mockTaskStateMachine
            mockPriorityQueue,
            {} as any, // mockCapabilityMatcher
            {} as any  // mockDependencyManager
        );
    });

    afterEach(() => {
        taskQueue.dispose();
    });

    describe('🚫 FALSE WARNING PREVENTION - CORE FIX', () => {
        test('CRITICAL: Should NOT show warning when adding team with empty queue', () => {
            // EXACT REPRODUCTION OF ORIGINAL BUG:
            // 1. User adds team in Cursor
            // 2. Agents are spawned (triggers onAgentUpdate)
            // 3. Task queue is empty (no tasks created yet)
            // 4. tryAssignTasks runs and should NOT show false warning

            // Given: Empty task queue (no tasks exist)
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            
            // When: Agents are available (simulating team creation)
            mockAgentManager.getAvailableAgents.mockReturnValue([
                { id: 'frontend-dev', status: 'idle' },
                { id: 'backend-dev', status: 'idle' },
                { id: 'qa-engineer', status: 'idle' }
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

        test('REGRESSION: Should show warning when tasks exist but cannot be assigned', () => {
            // Verify the fix doesn't break legitimate warnings
            
            // Given: Tasks in queue
            mockPriorityQueue.size.mockReturnValue(2);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            
            // When: Agents available but assignment fails (simulated by not setting up assignment mocks)
            mockAgentManager.getAvailableAgents.mockReturnValue([
                { id: 'agent-1', status: 'idle' }
            ]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // Then: Should show legitimate warning when tasks can't be assigned
            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                '📋 Task added but not assigned. Check agent status.'
            );
        });

        test('EDGE CASE: Should handle null/undefined queue size gracefully', () => {
            // Edge cases that could bypass the fix
            mockPriorityQueue.size.mockReturnValue(null);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([{ id: 'agent-1' }]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            expect(() => agentUpdateCallback()).not.toThrow();

            // Should not show warnings for null queue size
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('PERFORMANCE: Should handle rapid agent updates without false warnings', () => {
            // Stress test the fix
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            
            // Rapid calls (simulating team creation)
            for (let i = 0; i < 100; i++) {
                agentUpdateCallback();
            }

            // Should not show any warnings despite many calls
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        test('DOCUMENTATION: Documents the exact fix logic', () => {
            // This test documents what the fix changed:
            // BEFORE: if (!assigned) { show warning }
            // AFTER:  if (!assigned && queueSize > 0) { show warning }

            mockPriorityQueue.size.mockReturnValue(0); // THE KEY: Empty queue
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([{ id: 'agent-1' }]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // The fix prevents false warnings by checking queueSize > 0
            expect(mockNotificationService.showWarning).not.toHaveBeenCalled();
            
            // Verify the debug log shows the condition that prevents the warning
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Queue: 0')
            );
        });
    });

    describe('✅ VALID WARNING SCENARIOS', () => {
        test('Should show "all agents busy" when tasks exist but no agents available', () => {
            mockPriorityQueue.size.mockReturnValue(3);
            mockPriorityQueue.isEmpty.mockReturnValue(false);
            mockAgentManager.getAvailableAgents.mockReturnValue([]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task queued. All agents are busy.'
            );
        });

        test('Should show correct message when auto-assign is disabled', () => {
            const mockConfigService = {
                isAutoAssignTasks: jest.fn(() => false),
                onDidChange: jest.fn(() => ({ dispose: jest.fn() }))
            };

            const taskQueueDisabled = new TaskQueue(
                mockAgentManager,
                mockLoggingService,
                { subscribe: jest.fn(() => ({ dispose: jest.fn() })) } as any,
                {} as any,
                mockNotificationService,
                mockConfigService,
                {} as any,
                mockPriorityQueue,
                {} as any,
                {} as any
            );

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[1][0];
            agentUpdateCallback();

            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                '📋 Task added. Auto-assign is disabled - assign manually.'
            );

            taskQueueDisabled.dispose();
        });
    });

    describe('🔍 REGRESSION GUARDS', () => {
        test('CRITICAL: Must fail if false warning behavior returns', () => {
            // This test will fail if someone accidentally reverts the fix
            
            mockPriorityQueue.size.mockReturnValue(0);
            mockPriorityQueue.isEmpty.mockReturnValue(true);
            mockAgentManager.getAvailableAgents.mockReturnValue([{ id: 'agent-1' }]);

            const agentUpdateCallback = mockAgentManager.onAgentUpdate.mock.calls[0][0];
            agentUpdateCallback();

            // If this assertion fails, the bug has been reintroduced
            const falseWarningShown = mockNotificationService.showWarning.mock.calls.some(
                (call: any[]) => call[0] === '📋 Task added but not assigned. Check agent status.'
            );
            
            if (falseWarningShown) {
                throw new Error(
                    'REGRESSION DETECTED: False task assignment warning has returned! ' +
                    'The bug fix in TaskQueue.tryAssignTasks() has been reverted or broken.'
                );
            }

            expect(falseWarningShown).toBe(false);
        });
    });
});