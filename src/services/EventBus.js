"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
const vscode = __importStar(require("vscode"));
class EventBus {
    constructor(loggingService) {
        this.loggingService = loggingService;
        this.eventEmitters = new Map();
        this.handlerDisposables = new Map();
        this.patternSubscriptions = [];
        this.listenerCounts = new Map();
        this.disposables = [];
        this.debugLogging = false;
        if (this.loggingService?.isLevelEnabled('debug')) {
            this.debugLogging = true;
        }
    }
    setLoggingService(logger) {
        this.loggingService = logger;
        this.updateDebugLogging();
        if (this.loggingService) {
            const disposable = this.loggingService.onDidChangeConfiguration?.(() => {
                this.updateDebugLogging();
            });
            if (disposable) {
                this.disposables.push(disposable);
            }
        }
    }
    updateDebugLogging() {
        this.debugLogging = this.loggingService?.isLevelEnabled('debug') || false;
    }
    getOrCreateEmitter(event) {
        if (!this.eventEmitters.has(event)) {
            const emitter = new vscode.EventEmitter();
            this.eventEmitters.set(event, emitter);
            if (this.debugLogging) {
                this.loggingService?.debug(`EventBus: Created emitter for event '${event}'`);
            }
            for (const patternSub of this.patternSubscriptions) {
                if (this.matchesPattern(event, patternSub.pattern)) {
                    const disposable = this.subscribe(event, (data) => patternSub.handler(event, data));
                    patternSub.disposables.push(disposable);
                }
            }
        }
        return this.eventEmitters.get(event);
    }
    logEvent(event, action, data) {
        if (this.debugLogging) {
            const message = `EventBus: ${action} event '${event}'`;
            if (data !== undefined) {
                this.loggingService?.debug(message, data);
            }
            else {
                this.loggingService?.debug(message);
            }
        }
    }
    publish(event, data) {
        this.logEvent(event, 'publish', data);
        const emitter = this.getOrCreateEmitter(event);
        emitter.fire(data);
    }
    subscribe(event, handler) {
        this.logEvent(event, 'subscribe');
        const emitter = this.getOrCreateEmitter(event);
        const disposable = emitter.event(handler);
        if (!this.handlerDisposables.has(event)) {
            this.handlerDisposables.set(event, new Map());
        }
        this.handlerDisposables.get(event).set(handler, disposable);
        const currentCount = this.listenerCounts.get(event) || 0;
        this.listenerCounts.set(event, currentCount + 1);
        this.disposables.push(disposable);
        return disposable;
    }
    unsubscribe(event, handler) {
        this.logEvent(event, 'unsubscribe');
        const eventHandlers = this.handlerDisposables.get(event);
        if (eventHandlers) {
            const disposable = eventHandlers.get(handler);
            if (disposable) {
                disposable.dispose();
                eventHandlers.delete(handler);
                const index = this.disposables.indexOf(disposable);
                if (index > -1) {
                    this.disposables.splice(index, 1);
                }
                const currentCount = this.listenerCounts.get(event) || 0;
                if (currentCount > 0) {
                    this.listenerCounts.set(event, currentCount - 1);
                }
                if (eventHandlers.size === 0) {
                    this.handlerDisposables.delete(event);
                    this.listenerCounts.delete(event);
                }
            }
        }
    }
    once(event, handler) {
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
    filter(event, predicate) {
        this.logEvent(event, 'subscribe', { filter: true });
        const emitter = this.getOrCreateEmitter(event);
        const filteredEmitter = new vscode.EventEmitter();
        const disposable = emitter.event((data) => {
            if (predicate(data)) {
                filteredEmitter.fire(data);
            }
        });
        this.disposables.push(disposable);
        return {
            event: filteredEmitter.event,
            dispose: () => {
                disposable.dispose();
                filteredEmitter.dispose();
                const index = this.disposables.indexOf(disposable);
                if (index > -1) {
                    this.disposables.splice(index, 1);
                }
            }
        };
    }
    subscribePattern(pattern, handler) {
        if (this.debugLogging) {
            this.loggingService?.debug(`EventBus: Subscribing to pattern '${pattern}'`);
        }
        const disposables = [];
        for (const event of this.eventEmitters.keys()) {
            if (this.matchesPattern(event, pattern)) {
                const disposable = this.subscribe(event, (data) => handler(event, data));
                disposables.push(disposable);
            }
        }
        const patternSub = { pattern, handler, disposables };
        this.patternSubscriptions.push(patternSub);
        return {
            dispose: () => {
                disposables.forEach(d => d.dispose());
                const index = this.patternSubscriptions.indexOf(patternSub);
                if (index > -1) {
                    this.patternSubscriptions.splice(index, 1);
                }
            }
        };
    }
    matchesPattern(event, pattern) {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('^' + escaped.replace(/\\\*/g, '.*') + '$');
        return regex.test(event);
    }
    getRegisteredEvents() {
        return Array.from(this.eventEmitters.keys());
    }
    hasSubscribers(event) {
        const count = this.listenerCounts.get(event) || 0;
        return count > 0;
    }
    dispose() {
        if (this.debugLogging) {
            this.loggingService?.debug(`EventBus: Disposing ${this.eventEmitters.size} event emitters`);
        }
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
        this.handlerDisposables.clear();
        this.listenerCounts.clear();
        this.patternSubscriptions.length = 0;
        this.eventEmitters.forEach(emitter => emitter.dispose());
        this.eventEmitters.clear();
    }
}
exports.EventBus = EventBus;
//# sourceMappingURL=EventBus.js.map