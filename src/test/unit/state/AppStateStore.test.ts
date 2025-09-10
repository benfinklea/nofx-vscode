/**
 * Comprehensive unit tests for AppStateStore
 * Tests the unified state management implementation from Phase 17
 */

import { AppStateStore, getAppStateStore } from '../../../state/AppStateStore';
import { EventEmitter } from 'events';

describe('AppStateStore', () => {
    let store: AppStateStore;

    beforeEach(() => {
        // Reset singleton for each test
        (global as any).instance = null;
        store = new AppStateStore();
    });

    afterEach(() => {
        // Clean up event listeners
        store.removeAllListeners();
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with default state', () => {
            const state = store.getState();

            expect(state.ui).toBeDefined();
            expect(state.ui.activeView).toBe('agents');
            expect(state.ui.expandedNodes).toBeInstanceOf(Set);
            expect(state.ui.selectedItems).toEqual([]);
            expect(state.ui.panelVisibility).toEqual({});
            expect(state.ui.statusBarText).toBe('NofX Ready');

            expect(state.agents).toBeDefined();
            expect(state.agents.active).toBeInstanceOf(Map);
            expect(state.agents.history).toEqual([]);
            expect(state.agents.selectedAgentId).toBeNull();

            expect(state.tasks).toBeDefined();
            expect(state.tasks.queue).toEqual([]);
            expect(state.tasks.active).toBeInstanceOf(Map);
            expect(state.tasks.completed).toEqual([]);
            expect(state.tasks.selectedTaskId).toBeNull();

            expect(state.config).toBeDefined();
            expect(state.config.settings).toEqual({});
            expect(state.config.userPreferences).toEqual({});
            expect(state.config.workspaceConfig).toEqual({});

            expect(state.persistence).toBeDefined();
            expect(state.persistence.lastSaved).toBeNull();
            expect(state.persistence.isDirty).toBe(false);
            expect(state.persistence.autoSaveEnabled).toBe(true);
        });

        it('should extend EventEmitter', () => {
            expect(store).toBeInstanceOf(EventEmitter);
        });

        it('should initialize subscribers map', () => {
            expect(store['subscribers']).toBeInstanceOf(Map);
            expect(store['subscribers'].size).toBe(0);
        });
    });

    describe('getState', () => {
        it('should return current state', () => {
            const state = store.getState();
            expect(state).toBeDefined();
            expect(state).toHaveProperty('ui');
            expect(state).toHaveProperty('agents');
            expect(state).toHaveProperty('tasks');
            expect(state).toHaveProperty('config');
            expect(state).toHaveProperty('persistence');
        });

        it('should return a reference to the actual state', () => {
            const state1 = store.getState();
            const state2 = store.getState();
            expect(state1).toBe(state2);
        });
    });

    describe('getState with slice parameter', () => {
        it('should return specific state slice', () => {
            const uiSlice = store.getState('ui');
            expect(uiSlice).toBeDefined();
            expect(uiSlice.activeView).toBe('agents');
            expect(uiSlice.expandedNodes).toBeInstanceOf(Set);
        });

        it('should return undefined for non-existent slice', () => {
            const slice = store.getState('nonexistent' as any);
            expect(slice).toBeUndefined();
        });

        it('should return different slices correctly', () => {
            const agents = store.getState('agents');
            const tasks = store.getState('tasks');
            const config = store.getState('config');
            const persistence = store.getState('persistence');

            expect(agents).toBeDefined();
            expect(tasks).toBeDefined();
            expect(config).toBeDefined();
            expect(persistence).toBeDefined();

            expect(agents).not.toBe(tasks);
            expect(config).not.toBe(persistence);
        });
    });

    describe('setState', () => {
        it('should update state slice and emit event', done => {
            store.on('stateChanged', ({ slice, newValue }) => {
                if (slice === 'ui') {
                    expect(newValue.activeView).toBe('tasks');
                    done();
                }
            });

            store.setState('ui', { activeView: 'tasks' });
        });

        it('should notify slice subscribers', done => {
            const callback = jest.fn(uiState => {
                expect(uiState.activeView).toBe('dashboard');
                done();
            });

            store.subscribe('ui', callback);

            store.setState('ui', { activeView: 'dashboard' });
        });
    });

    describe('updateStateSlice', () => {
        it('should update specific slice', done => {
            store.on('stateChanged', ({ slice, newValue }) => {
                if (slice === 'ui') {
                    expect(newValue.activeView).toBe('terminal');
                    expect(newValue.statusBarText).toBe('Updated');
                    done();
                }
            });

            store.updateStateSlice('ui', {
                activeView: 'terminal',
                statusBarText: 'Updated'
            });
        });

        it('should preserve other slices', () => {
            const initialAgents = store.getState('agents');

            store.updateStateSlice('ui', {
                activeView: 'newView'
            });

            const afterAgents = store.getState('agents');
            expect(afterAgents).toEqual(initialAgents);
        });

        it('should notify correct slice subscribers only', () => {
            const uiCallback = jest.fn();
            const agentsCallback = jest.fn();

            store.subscribe('ui', uiCallback);
            store.subscribe('agents', agentsCallback);

            store.updateStateSlice('ui', { activeView: 'test' });

            expect(uiCallback).toHaveBeenCalledTimes(1);
            expect(agentsCallback).not.toHaveBeenCalled();
        });

        it('should handle partial updates', () => {
            store.updateStateSlice('ui', { activeView: 'modified' });

            const ui = store.getState('ui');
            expect(ui.activeView).toBe('modified');
            expect(ui.statusBarText).toBe('NofX Ready'); // Unchanged
            expect(ui.expandedNodes).toBeInstanceOf(Set); // Unchanged
        });
    });

    describe('subscribe', () => {
        it('should add subscriber for state slice', () => {
            const callback = jest.fn();
            const unsubscribe = store.subscribe('ui', callback);

            expect(store['subscribers'].has('ui')).toBe(true);
            expect(store['subscribers'].get('ui')?.has(callback)).toBe(true);

            unsubscribe();
        });

        it('should return unsubscribe function', () => {
            const callback = jest.fn();
            const unsubscribe = store.subscribe('tasks', callback);

            expect(store['subscribers'].get('tasks')?.has(callback)).toBe(true);

            unsubscribe();

            expect(store['subscribers'].get('tasks')?.has(callback)).toBe(false);
        });

        it('should handle multiple subscribers for same slice', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            store.subscribe('agents', callback1);
            store.subscribe('agents', callback2);

            store.updateStateSlice('agents', { selectedAgentId: 'test-id' });

            expect(callback1).toHaveBeenCalled();
            expect(callback2).toHaveBeenCalled();
        });

        it('should handle subscribers for different slices', () => {
            const uiCallback = jest.fn();
            const taskCallback = jest.fn();

            store.subscribe('ui', uiCallback);
            store.subscribe('tasks', taskCallback);

            expect(store['subscribers'].size).toBe(2);
            expect(store['subscribers'].get('ui')?.size).toBe(1);
            expect(store['subscribers'].get('tasks')?.size).toBe(1);
        });
    });

    describe('batchUpdate', () => {
        it('should batch multiple updates', () => {
            const stateChangedSpy = jest.fn();
            store.on('stateChanged', stateChangedSpy);

            store.batchUpdate(() => {
                store.updateStateSlice('ui', { activeView: 'test1' });
                store.updateStateSlice('ui', { statusBarText: 'test2' });
                store.updateStateSlice('agents', { selectedAgentId: 'agent1' });
            });

            // Should emit events after batch completes
            expect(stateChangedSpy).toHaveBeenCalled();

            const state = store.getState();
            expect(state.ui.activeView).toBe('test1');
            expect(state.ui.statusBarText).toBe('test2');
            expect(state.agents.selectedAgentId).toBe('agent1');
        });

        it('should collect and replay events after batch', () => {
            const events: any[] = [];
            store.on('stateChanged', state => events.push(state));

            store.batchUpdate(() => {
                store.updateStateSlice('ui', { activeView: 'view1' });
                store.updateStateSlice('ui', { activeView: 'view2' });
            });

            // Events should be replayed after batch
            expect(events.length).toBeGreaterThan(0);
            expect(store.getState().ui.activeView).toBe('view2');
        });
    });

    describe('reset', () => {
        it('should reset to initial state', () => {
            // Modify state
            store.updateStateSlice('ui', { activeView: 'modified' });
            store.updateStateSlice('agents', { selectedAgentId: 'test' });

            // Reset
            store.reset();

            const state = store.getState();
            expect(state.ui.activeView).toBe('agents');
            expect(state.agents.selectedAgentId).toBeNull();
        });

        it('should emit stateReset event', done => {
            store.on('stateReset', () => {
                done();
            });

            store.reset();
        });

        it('should notify all subscribers', () => {
            const uiCallback = jest.fn();
            const agentsCallback = jest.fn();

            store.subscribe('ui', uiCallback);
            store.subscribe('agents', agentsCallback);

            store.reset();

            expect(uiCallback).toHaveBeenCalled();
            expect(agentsCallback).toHaveBeenCalled();
        });
    });

    describe('serialize', () => {
        it('should serialize state to JSON string', () => {
            const serialized = store.serialize();
            expect(typeof serialized).toBe('string');

            const parsed = JSON.parse(serialized);
            expect(parsed).toBeDefined();
            expect(parsed.ui).toBeDefined();
            expect(parsed.agents).toBeDefined();
        });

        it('should convert Sets to Arrays', () => {
            store.updateStateSlice('ui', {
                expandedNodes: new Set(['node1', 'node2'])
            });

            const serialized = store.serialize();
            const parsed = JSON.parse(serialized);

            expect(Array.isArray(parsed.ui.expandedNodes)).toBe(true);
            expect(parsed.ui.expandedNodes).toEqual(['node1', 'node2']);
        });

        it('should convert Maps to Arrays', () => {
            const agentsMap = new Map([
                ['agent1', { id: 'agent1', name: 'Test Agent', status: 'idle', capabilities: [] }]
            ]);

            store.updateStateSlice('agents', {
                active: agentsMap as Map<string, any>
            });

            const serialized = store.serialize();
            const parsed = JSON.parse(serialized);

            expect(Array.isArray(parsed.agents.active)).toBe(true);
            expect(parsed.agents.active).toEqual([
                ['agent1', { id: 'agent1', name: 'Test Agent', status: 'idle', capabilities: [] }]
            ]);
        });

        it('should format JSON with indentation', () => {
            const serialized = store.serialize();
            expect(serialized).toContain('\n');
            expect(serialized).toContain('  '); // Indentation
        });
    });

    describe('deserialize', () => {
        it('should deserialize JSON string to state', () => {
            const originalState = store.getState();
            originalState.ui.activeView = 'custom';
            originalState.agents.selectedAgentId = 'agent123';

            const serialized = store.serialize();

            // Reset and deserialize
            store.reset();
            store.deserialize(serialized);

            const state = store.getState();
            expect(state.ui.activeView).toBe('custom');
            expect(state.agents.selectedAgentId).toBe('agent123');
        });

        it('should reconstruct Sets from Arrays', () => {
            const data = JSON.stringify({
                ui: {
                    expandedNodes: ['node1', 'node2', 'node3']
                }
            });

            store.deserialize(data);

            const ui = store.getState('ui');
            expect(ui.expandedNodes).toBeInstanceOf(Set);
            expect(ui.expandedNodes.has('node1')).toBe(true);
            expect(ui.expandedNodes.has('node2')).toBe(true);
            expect(ui.expandedNodes.has('node3')).toBe(true);
        });

        it('should reconstruct Maps from Arrays', () => {
            const data = JSON.stringify({
                agents: {
                    active: [
                        ['agent1', { id: 'agent1', name: 'Agent 1' }],
                        ['agent2', { id: 'agent2', name: 'Agent 2' }]
                    ]
                }
            });

            store.deserialize(data);

            const agents = store.getState('agents');
            expect(agents.active).toBeInstanceOf(Map);
            expect(agents.active.get('agent1')).toEqual({ id: 'agent1', name: 'Agent 1' });
            expect(agents.active.get('agent2')).toEqual({ id: 'agent2', name: 'Agent 2' });
        });

        it('should emit stateRestored event', done => {
            store.on('stateRestored', () => {
                done();
            });

            store.deserialize('{}');
        });

        it('should handle invalid JSON gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            store.deserialize('invalid json');

            expect(consoleSpy).toHaveBeenCalledWith('Failed to deserialize state:', expect.any(Error));

            // Should reset on error
            const state = store.getState();
            expect(state.ui.activeView).toBe('agents'); // Default value

            consoleSpy.mockRestore();
        });

        it('should handle malformed data gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            // Missing expected properties
            store.deserialize('{"invalid": "data"}');

            // Should not crash
            const state = store.getState();
            expect(state).toBeDefined();

            consoleSpy.mockRestore();
        });
    });

    describe('reset', () => {
        it('should reset to initial state', () => {
            // Modify state first
            store.updateStateSlice('ui', { activeView: 'modified' });
            store.updateStateSlice('agents', { selectedAgentId: 'test-agent' });

            // Reset
            store.reset();

            // Check it's back to initial
            const state = store.getState();
            expect(state.ui.activeView).toBe('agents');
            expect(state.agents.selectedAgentId).toBeNull();
        });

        it('should emit stateReset event', done => {
            store.on('stateReset', () => {
                done();
            });

            store.reset();
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty state updates', () => {
            const initialState = store.getState();
            store.updateStateSlice('ui', {});
            const afterState = store.getState();

            expect(afterState).toEqual(initialState);
        });

        it('should handle null values in state', () => {
            store.updateStateSlice('agents', {
                selectedAgentId: null
            });

            const agents = store.getState('agents');
            expect(agents.selectedAgentId).toBeNull();
        });

        it('should handle undefined values in updates', () => {
            store.updateStateSlice('config', {
                settings: undefined
            });

            const config = store.getState('config');
            expect(config.settings).toBeUndefined();
        });

        it('should handle circular references in serialization', () => {
            const circular: any = { ref: null };
            circular.ref = circular;

            // This would normally throw, but should be handled
            store.updateStateSlice('config', {
                settings: circular
            });

            // JSON.stringify with circular reference throws
            expect(() => store.serialize()).toThrow();
        });
    });

    describe('Computed Properties', () => {
        it('should calculate activeAgentCount', () => {
            const agentsMap = new Map([
                ['agent1', { id: 'agent1', name: 'Agent 1', status: 'idle' as const, capabilities: [] }],
                ['agent2', { id: 'agent2', name: 'Agent 2', status: 'busy' as const, capabilities: [] }]
            ]);

            store.updateStateSlice('agents', {
                active: agentsMap
            });

            expect(store.activeAgentCount).toBe(2);
        });

        it('should calculate pendingTaskCount', () => {
            store.updateStateSlice('tasks', {
                queue: [
                    { id: 'task1', title: 'Task 1', status: 'pending' as const, priority: 'high' as const },
                    { id: 'task2', title: 'Task 2', status: 'pending' as const, priority: 'low' as const }
                ]
            });

            expect(store.pendingTaskCount).toBe(2);
        });

        it('should track isStateDirty', () => {
            // Initially not dirty
            const store2 = new AppStateStore();
            expect(store2.isStateDirty).toBe(false);

            // Becomes dirty after update
            store2.updateStateSlice('ui', { activeView: 'modified' });
            expect(store2.isStateDirty).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle subscriber errors gracefully', () => {
            const errorCallback = jest.fn(() => {
                throw new Error('Subscriber error');
            });
            const goodCallback = jest.fn();

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            store.subscribe('ui', errorCallback);
            store.subscribe('ui', goodCallback);

            store.updateStateSlice('ui', { activeView: 'test' });

            expect(errorCallback).toHaveBeenCalled();
            expect(goodCallback).toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error in state subscriber for ui:'),
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Concurrency', () => {
        it('should handle rapid state updates', () => {
            const updates = 100;
            for (let i = 0; i < updates; i++) {
                store.updateStateSlice('ui', {
                    statusBarText: `Update ${i}`
                });
            }

            const ui = store.getState('ui');
            expect(ui.statusBarText).toBe(`Update ${updates - 1}`);
        });

        it('should handle concurrent subscriptions', () => {
            const callbacks: jest.Mock[] = [];

            for (let i = 0; i < 10; i++) {
                const callback = jest.fn();
                callbacks.push(callback);
                store.subscribe('ui', callback);
            }

            store.updateStateSlice('ui', { activeView: 'test' });

            callbacks.forEach(callback => {
                expect(callback).toHaveBeenCalledTimes(1);
            });
        });

        it('should handle subscribe/unsubscribe during update', () => {
            let unsubscribe2: (() => void) | null = null;

            const callback1 = jest.fn(() => {
                if (unsubscribe2) {
                    unsubscribe2();
                }
            });

            const callback2 = jest.fn();

            store.subscribe('ui', callback1);
            unsubscribe2 = store.subscribe('ui', callback2);

            store.updateStateSlice('ui', { activeView: 'test' });

            expect(callback1).toHaveBeenCalled();
            // callback2 might or might not be called depending on iteration order
        });
    });
});

describe('getAppStateStore (Singleton)', () => {
    beforeEach(() => {
        // Reset singleton
        (global as any).instance = null;
    });

    it('should return same instance on multiple calls', () => {
        const store1 = getAppStateStore();
        const store2 = getAppStateStore();

        expect(store1).toBe(store2);
    });

    it('should create instance on first call', () => {
        const store = getAppStateStore();
        expect(store).toBeInstanceOf(AppStateStore);
    });

    it('should maintain state across calls', () => {
        const store1 = getAppStateStore();
        store1.updateStateSlice('ui', { activeView: 'modified' });

        const store2 = getAppStateStore();
        const ui = store2.getState('ui');

        expect(ui.activeView).toBe('modified');
    });
});
