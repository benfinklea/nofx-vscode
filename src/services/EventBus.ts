import * as vscode from 'vscode';
import { IEventBus, ILoggingService } from './interfaces';

export class EventBus implements IEventBus {
    private readonly eventEmitters: Map<string, vscode.EventEmitter<any>> = new Map();
    private readonly handlerDisposables: Map<string, Map<Function, vscode.Disposable>> = new Map();
    private readonly patternSubscriptions: Array<{ pattern: string, handler: (event: string, data?: any) => void, disposables: vscode.Disposable[] }> = [];
    private readonly listenerCounts: Map<string, number> = new Map();
    private readonly disposables: vscode.Disposable[] = [];
    private debugLogging = false;

    constructor(private loggingService?: ILoggingService) {
        // Enable debug logging if logging service is available and debug level is enabled
        if (this.loggingService?.isLevelEnabled('debug')) {
            this.debugLogging = true;
        }
    }

    setLoggingService(logger: ILoggingService): void {
        this.loggingService = logger;
        // Enable debug logging if debug level is enabled
        this.updateDebugLogging();

        // Subscribe to configuration changes to update debug logging
        if (this.loggingService) {
            const disposable = this.loggingService.onDidChangeConfiguration?.(() => {
                this.updateDebugLogging();
            });
            if (disposable) {
                this.disposables.push(disposable);
            }
        }
    }

    private updateDebugLogging(): void {
        this.debugLogging = this.loggingService?.isLevelEnabled('debug') || false;
    }

    private getOrCreateEmitter(event: string): vscode.EventEmitter<any> {
        if (!this.eventEmitters.has(event)) {
            const emitter = new vscode.EventEmitter<any>();
            this.eventEmitters.set(event, emitter);

            if (this.debugLogging) {
                this.loggingService?.debug(`EventBus: Created emitter for event '${event}'`);
            }

            // Subscribe any registered patterns that match this new event
            for (const patternSub of this.patternSubscriptions) {
                if (this.matchesPattern(event, patternSub.pattern)) {
                    const disposable = this.subscribe(event, (data) => patternSub.handler(event, data));
                    patternSub.disposables.push(disposable);
                }
            }
        }
        return this.eventEmitters.get(event)!;
    }

    private logEvent(event: string, action: 'publish' | 'subscribe' | 'unsubscribe', data?: any): void {
        if (this.debugLogging) {
            const message = `EventBus: ${action} event '${event}'`;
            if (data !== undefined) {
                this.loggingService?.debug(message, data);
            } else {
                this.loggingService?.debug(message);
            }
        }
    }

    publish(event: string, data?: any): void {
        this.logEvent(event, 'publish', data);

        const emitter = this.getOrCreateEmitter(event);
        emitter.fire(data);
    }

    subscribe(event: string, handler: (data?: any) => void): vscode.Disposable {
        this.logEvent(event, 'subscribe');

        const emitter = this.getOrCreateEmitter(event);
        const disposable = emitter.event(handler);

        // Track handler->disposable mapping for unsubscribe
        if (!this.handlerDisposables.has(event)) {
            this.handlerDisposables.set(event, new Map());
        }
        this.handlerDisposables.get(event)!.set(handler, disposable);

        // Update listener count
        const currentCount = this.listenerCounts.get(event) || 0;
        this.listenerCounts.set(event, currentCount + 1);

        // Track disposables for cleanup
        this.disposables.push(disposable);

        return disposable;
    }

    unsubscribe(event: string, handler: Function): void {
        this.logEvent(event, 'unsubscribe');

        const eventHandlers = this.handlerDisposables.get(event);
        if (eventHandlers) {
            const disposable = eventHandlers.get(handler);
            if (disposable) {
                disposable.dispose();
                eventHandlers.delete(handler);

                // Remove from main disposables array
                const index = this.disposables.indexOf(disposable);
                if (index > -1) {
                    this.disposables.splice(index, 1);
                }

                // Update listener count
                const currentCount = this.listenerCounts.get(event) || 0;
                if (currentCount > 0) {
                    this.listenerCounts.set(event, currentCount - 1);
                }

                // Clean up empty event handler map
                if (eventHandlers.size === 0) {
                    this.handlerDisposables.delete(event);
                    this.listenerCounts.delete(event);
                }
            }
        }
    }

    once(event: string, handler: (data?: any) => void): vscode.Disposable {
        this.logEvent(event, 'subscribe', { once: true });

        const emitter = this.getOrCreateEmitter(event);
        let disposed = false;

        const disposable = emitter.event((data) => {
            if (!disposed) {
                disposed = true;
                handler(data);
                disposable.dispose();
            }
        });

        this.disposables.push(disposable);
        return disposable;
    }

    filter(event: string, predicate: (data?: any) => boolean): { event: vscode.Event<any>, dispose: () => void } {
        this.logEvent(event, 'subscribe', { filter: true });

        const emitter = this.getOrCreateEmitter(event);
        const filteredEmitter = new vscode.EventEmitter<any>();

        const disposable = emitter.event((data) => {
            if (predicate(data)) {
                filteredEmitter.fire(data);
            }
        });

        this.disposables.push(disposable);

        // Return the filtered event stream with disposal
        return {
            event: filteredEmitter.event,
            dispose: () => {
                disposable.dispose();
                filteredEmitter.dispose();
                // Remove from main disposables array
                const index = this.disposables.indexOf(disposable);
                if (index > -1) {
                    this.disposables.splice(index, 1);
                }
            }
        };
    }

    // Helper method for wildcard event patterns
    subscribePattern(pattern: string, handler: (event: string, data?: any) => void): vscode.Disposable {
        if (this.debugLogging) {
            this.loggingService?.debug(`EventBus: Subscribing to pattern '${pattern}'`);
        }

        const disposables: vscode.Disposable[] = [];

        // Subscribe to all existing events that match the pattern
        for (const event of this.eventEmitters.keys()) {
            if (this.matchesPattern(event, pattern)) {
                const disposable = this.subscribe(event, (data) => handler(event, data));
                disposables.push(disposable);
            }
        }

        // Store pattern subscription for future events
        const patternSub = { pattern, handler, disposables };
        this.patternSubscriptions.push(patternSub);

        // Return a disposable that cleans up all pattern subscriptions
        return {
            dispose: () => {
                disposables.forEach(d => d.dispose());
                // Remove from pattern subscriptions
                const index = this.patternSubscriptions.indexOf(patternSub);
                if (index > -1) {
                    this.patternSubscriptions.splice(index, 1);
                }
            }
        };
    }

    private matchesPattern(event: string, pattern: string): boolean {
        // Escape regex meta-characters before expanding *
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('^' + escaped.replace(/\\\*/g, '.*') + '$');
        return regex.test(event);
    }

    // Get all registered event names (useful for debugging)
    getRegisteredEvents(): string[] {
        return Array.from(this.eventEmitters.keys());
    }

    // Check if an event has any subscribers
    hasSubscribers(event: string): boolean {
        const count = this.listenerCounts.get(event) || 0;
        return count > 0;
    }

    dispose(): void {
        if (this.debugLogging) {
            this.loggingService?.debug(`EventBus: Disposing ${this.eventEmitters.size} event emitters`);
        }

        // Dispose all tracked disposables
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;

        // Clear handler disposables
        this.handlerDisposables.clear();

        // Clear listener counts
        this.listenerCounts.clear();

        // Clear pattern subscriptions
        this.patternSubscriptions.length = 0;

        // Dispose all event emitters
        this.eventEmitters.forEach(emitter => emitter.dispose());
        this.eventEmitters.clear();
    }
}
