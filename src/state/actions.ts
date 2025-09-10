/**
 * State Actions
 * Common state mutations wrapped in functions
 */

import { AppStateStore } from './AppStateStore';

// Agent Actions
export function addAgent(store: AppStateStore, agent: any): void {
    const agents = store.getState('agents');
    agents.active.set(agent.id, agent);
    store.setState('agents', { active: new Map(agents.active) });
}

export function removeAgent(store: AppStateStore, agentId: string): void {
    const agents = store.getState('agents');
    agents.active.delete(agentId);
    store.setState('agents', { active: new Map(agents.active) });
}

export function selectAgent(store: AppStateStore, agentId: string | null): void {
    store.setState('agents', { selectedAgentId: agentId });
}

// Task Actions
export function addTask(store: AppStateStore, task: any): void {
    const tasks = store.getState('tasks');
    store.setState('tasks', {
        queue: [...tasks.queue, task]
    });
}

export function activateTask(store: AppStateStore, taskId: string): void {
    const tasks = store.getState('tasks');
    const task = tasks.queue.find(t => t.id === taskId);

    if (task) {
        task.status = 'active';
        tasks.active.set(taskId, task);
        store.setState('tasks', {
            queue: tasks.queue.filter(t => t.id !== taskId),
            active: new Map(tasks.active)
        });
    }
}

export function completeTask(store: AppStateStore, taskId: string): void {
    const tasks = store.getState('tasks');
    const task = tasks.active.get(taskId);

    if (task) {
        task.status = 'completed';
        tasks.active.delete(taskId);
        store.setState('tasks', {
            active: new Map(tasks.active),
            completed: [...tasks.completed, task]
        });
    }
}

// UI Actions
export function setActiveView(store: AppStateStore, view: string): void {
    store.setState('ui', { activeView: view });
}

export function toggleNode(store: AppStateStore, nodeId: string): void {
    const ui = store.getState('ui');
    const expanded = new Set(ui.expandedNodes);

    if (expanded.has(nodeId)) {
        expanded.delete(nodeId);
    } else {
        expanded.add(nodeId);
    }

    store.setState('ui', { expandedNodes: expanded });
}

export function updateStatusBar(store: AppStateStore, text: string): void {
    store.setState('ui', { statusBarText: text });
}

// Config Actions
export function updateSetting(store: AppStateStore, key: string, value: any): void {
    const config = store.getState('config');
    store.setState('config', {
        settings: { ...config.settings, [key]: value }
    });
}

// Persistence Actions
export function markSaved(store: AppStateStore): void {
    store.setState('persistence', {
        lastSaved: new Date(),
        isDirty: false
    });
}
