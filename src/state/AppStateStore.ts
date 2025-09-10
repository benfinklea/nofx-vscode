/**
 * Unified State Store for NofX
 * Single source of truth for all application state
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';

export interface AppState {
    // UI State
    ui: {
        activeView: string;
        expandedNodes: Set<string>;
        selectedItems: string[];
        panelVisibility: Record<string, boolean>;
        statusBarText: string;
    };

    // Agent State
    agents: {
        active: Map<string, Agent>;
        history: Agent[];
        selectedAgentId: string | null;
    };

    // Task State
    tasks: {
        queue: Task[];
        active: Map<string, Task>;
        completed: Task[];
        selectedTaskId: string | null;
    };

    // Configuration State
    config: {
        settings: Record<string, any>;
        userPreferences: Record<string, any>;
        workspaceConfig: Record<string, any>;
    };

    // Persistence State
    persistence: {
        lastSaved: Date | null;
        isDirty: boolean;
        autoSaveEnabled: boolean;
    };
}

interface Agent {
    id: string;
    name: string;
    status: 'idle' | 'busy' | 'error';
    capabilities: string[];
}

interface Task {
    id: string;
    title: string;
    status: 'pending' | 'active' | 'completed' | 'failed';
    assignedTo?: string;
    priority: 'low' | 'medium' | 'high';
}

export class AppStateStore extends EventEmitter {
    private state: AppState;
    private subscribers: Map<string, Set<(state: any) => void>>;

    constructor() {
        super();
        this.subscribers = new Map();
        this.state = this.getInitialState();
    }

    private getInitialState(): AppState {
        return {
            ui: {
                activeView: 'agents',
                expandedNodes: new Set(),
                selectedItems: [],
                panelVisibility: {},
                statusBarText: 'NofX Ready'
            },
            agents: {
                active: new Map(),
                history: [],
                selectedAgentId: null
            },
            tasks: {
                queue: [],
                active: new Map(),
                completed: [],
                selectedTaskId: null
            },
            config: {
                settings: {},
                userPreferences: {},
                workspaceConfig: {}
            },
            persistence: {
                lastSaved: null,
                isDirty: false,
                autoSaveEnabled: true
            }
        };
    }

    // Get state slice
    getState<K extends keyof AppState>(slice: K): AppState[K] {
        return this.state[slice];
    }

    // Update state slice
    setState<K extends keyof AppState>(slice: K, updates: Partial<AppState[K]>): void {
        const oldValue = this.state[slice];
        this.state[slice] = { ...oldValue, ...updates };

        // Mark as dirty
        this.state.persistence.isDirty = true;

        // Notify subscribers
        this.notifySubscribers(slice, this.state[slice]);

        // Emit event
        this.emit('stateChanged', { slice, newValue: this.state[slice], oldValue });
    }

    // Subscribe to state changes
    subscribe<K extends keyof AppState>(slice: K, callback: (state: AppState[K]) => void): () => void {
        const key = slice as string;
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }
        this.subscribers.get(key)!.add(callback);

        // Return unsubscribe function
        return () => {
            const subs = this.subscribers.get(key);
            if (subs) {
                subs.delete(callback);
            }
        };
    }

    // Notify subscribers of state changes
    private notifySubscribers(slice: string, newState: any): void {
        const subs = this.subscribers.get(slice);
        if (subs) {
            subs.forEach(callback => {
                try {
                    callback(newState);
                } catch (error) {
                    console.error(`Error in state subscriber for ${slice}:`, error);
                }
            });
        }
    }

    // Computed properties
    get activeAgentCount(): number {
        return this.state.agents.active.size;
    }

    get pendingTaskCount(): number {
        return this.state.tasks.queue.length;
    }

    get isStateDirty(): boolean {
        return this.state.persistence.isDirty;
    }

    // Batch updates for performance
    batchUpdate(updates: () => void): void {
        const originalEmit = this.emit;
        const events: any[] = [];

        // Collect events during batch
        this.emit = (...args: any[]) => {
            events.push(args);
            return true;
        };

        // Execute updates
        updates();

        // Restore emit and fire collected events
        this.emit = originalEmit;
        events.forEach(args => this.emit.apply(this, args));
    }

    // Reset state
    reset(): void {
        this.state = this.getInitialState();
        this.emit('stateReset');
        this.subscribers.forEach((subs, slice) => {
            const stateSlice = this.state[slice as keyof AppState];
            subs.forEach(callback => callback(stateSlice));
        });
    }

    // Serialize state for persistence
    serialize(): string {
        const serializable = {
            ...this.state,
            ui: {
                ...this.state.ui,
                expandedNodes: Array.from(this.state.ui.expandedNodes)
            },
            agents: {
                ...this.state.agents,
                active: Array.from(this.state.agents.active.entries())
            },
            tasks: {
                ...this.state.tasks,
                active: Array.from(this.state.tasks.active.entries())
            }
        };
        return JSON.stringify(serializable, null, 2);
    }

    // Deserialize state from persistence
    deserialize(data: string): void {
        try {
            const parsed = JSON.parse(data);

            // Reconstruct Sets and Maps
            if (parsed.ui?.expandedNodes) {
                parsed.ui.expandedNodes = new Set(parsed.ui.expandedNodes);
            }
            if (parsed.agents?.active) {
                parsed.agents.active = new Map(parsed.agents.active);
            }
            if (parsed.tasks?.active) {
                parsed.tasks.active = new Map(parsed.tasks.active);
            }

            this.state = { ...this.getInitialState(), ...parsed };
            this.emit('stateRestored');
        } catch (error) {
            console.error('Failed to deserialize state:', error);
            this.reset();
        }
    }
}

// Singleton instance
let instance: AppStateStore | null = null;

export function getAppStateStore(): AppStateStore {
    if (!instance) {
        instance = new AppStateStore();
    }
    return instance;
}
