import * as vscode from 'vscode';
import { getAppStateStore } from '../state/AppStateStore';
import * as selectors from '../state/selectors';
import * as actions from '../state/actions';
export interface IUIStateManager {
    updateState(key: string, value: any): void;
    getState(key: string): any;
    subscribe(callback: () => void): { dispose: () => void };
    getTasksByStatus(status: string): any[];
}

export class UIStateManager implements IUIStateManager {
    private state = new Map<string, any>();
    private subscribers: (() => void)[] = [];

    updateState(key: string, value: any): void {
        this.state.set(key, value);
        this.notifySubscribers();
    }

    getState(key: string): any {
        return this.state.get(key);
    }

    subscribe(callback: () => void): { dispose: () => void } {
        this.subscribers.push(callback);
        return {
            dispose: () => {
                const index = this.subscribers.indexOf(callback);
                if (index > -1) {
                    this.subscribers.splice(index, 1);
                }
            }
        };
    }

    getTasksByStatus(status: string): any[] {
        return this.state.get(`tasks_${status}`) || [];
    }

    private notifySubscribers(): void {
        this.subscribers.forEach(callback => callback());
    }
}
