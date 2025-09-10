/**
 * Migration helpers for transitioning to unified state
 * Provides compatibility layer during migration
 */

import { getAppStateStore } from './AppStateStore';
import * as selectors from './selectors';
import * as actions from './actions';

/**
 * UIStateManager compatibility wrapper
 * @deprecated Use AppStateStore directly
 */
export class UIStateManagerCompat {
    private store = getAppStateStore();

    getState(key: string): any {
        const ui = this.store.getState('ui');
        return ui[key as keyof typeof ui];
    }

    setState(key: string, value: any): void {
        this.store.setState('ui', { [key]: value });
    }

    subscribe(callback: () => void): { dispose: () => void } {
        const unsubscribe = this.store.subscribe('ui', callback);
        return { dispose: unsubscribe };
    }
}

/**
 * PersistenceService compatibility wrapper
 * @deprecated Use AppStateStore directly
 */
export class PersistenceServiceCompat {
    private store = getAppStateStore();

    async save(): Promise<void> {
        const data = this.store.serialize();
        // Save to workspace state
        actions.markSaved(this.store);
    }

    async load(): Promise<void> {
        // Load from workspace state
        // this.store.deserialize(data);
    }

    isDirty(): boolean {
        return selectors.isStateDirty(this.store);
    }
}

/**
 * Get compatibility wrapper for gradual migration
 */
export function getCompatWrapper(serviceName: string): any {
    switch (serviceName) {
        case 'UIStateManager':
            return new UIStateManagerCompat();
        case 'PersistenceService':
            return new PersistenceServiceCompat();
        default:
            return getAppStateStore();
    }
}
