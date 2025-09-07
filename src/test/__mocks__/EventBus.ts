import { EventBus as BaseEventBus } from '../../services/EventBus';
import * as vscode from 'vscode';

/**
 * Test wrapper for EventBus that provides additional methods for testing
 */
export class EventBus extends BaseEventBus {
    // Add aliases for common event emitter patterns
    on(event: string, handler: (data?: any) => void): vscode.Disposable {
        return this.subscribe(event, handler);
    }

    off(event: string, handler: Function): void {
        this.unsubscribe(event, handler);
    }

    emit(event: string, data?: any): void {
        this.publish(event, data);
    }
}
