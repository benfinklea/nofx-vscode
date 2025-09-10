/**
 * State Selectors
 * Convenient functions to access specific parts of state
 */

import { AppStateStore, AppState } from './AppStateStore';

// UI Selectors
export const getActiveView = (store: AppStateStore) => store.getState('ui').activeView;

export const getExpandedNodes = (store: AppStateStore) => store.getState('ui').expandedNodes;

export const getSelectedItems = (store: AppStateStore) => store.getState('ui').selectedItems;

// Agent Selectors
export const getActiveAgents = (store: AppStateStore) => Array.from(store.getState('agents').active.values());

export const getAgentById = (store: AppStateStore, id: string) => store.getState('agents').active.get(id);

export const getSelectedAgent = (store: AppStateStore) => {
    const selectedId = store.getState('agents').selectedAgentId;
    return selectedId ? getAgentById(store, selectedId) : null;
};

// Task Selectors
export const getPendingTasks = (store: AppStateStore) => store.getState('tasks').queue;

export const getActiveTasks = (store: AppStateStore) => Array.from(store.getState('tasks').active.values());

export const getTaskById = (store: AppStateStore, id: string) => {
    const active = store.getState('tasks').active.get(id);
    if (active) return active;

    const queued = store.getState('tasks').queue.find(t => t.id === id);
    if (queued) return queued;

    return store.getState('tasks').completed.find(t => t.id === id);
};

// Config Selectors
export const getSetting = (store: AppStateStore, key: string) => store.getState('config').settings[key];

export const getUserPreference = (store: AppStateStore, key: string) => store.getState('config').userPreferences[key];

// Persistence Selectors
export const isStateDirty = (store: AppStateStore) => store.getState('persistence').isDirty;

export const getLastSaved = (store: AppStateStore) => store.getState('persistence').lastSaved;
