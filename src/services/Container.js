"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Container = void 0;
const interfaces_1 = require("./interfaces");
class Container {
    constructor(loggingService) {
        this.registrations = new Map();
        this.resolutionStack = new Set();
        this.singletonInstances = new Map();
        this.loggingService = loggingService;
    }
    static getInstance() {
        if (!Container.instance) {
            Container.instance = new Container();
        }
        return Container.instance;
    }
    reset() {
        this.dispose();
        Container.instance = null;
    }
    setLoggingService(loggingService) {
        this.loggingService = loggingService;
    }
    register(token, factory, lifetime = 'singleton') {
        this.registrations.set(token, {
            token,
            factory,
            lifetime
        });
        if (this.loggingService?.isLevelEnabled('debug')) {
            this.loggingService.debug(`Service registered: ${token.toString()} (${lifetime})`);
        }
    }
    registerInstance(token, instance) {
        this.registrations.set(token, {
            token,
            factory: () => instance,
            lifetime: 'singleton',
            instance
        });
        this.singletonInstances.set(token, instance);
        if (this.loggingService?.isLevelEnabled('debug')) {
            this.loggingService.debug(`Service instance registered: ${token.toString()}`);
        }
    }
    resolve(token) {
        if (this.resolutionStack.has(token)) {
            const chain = Array.from(this.resolutionStack);
            chain.push(token);
            throw new interfaces_1.CircularDependencyError(chain);
        }
        const registration = this.registrations.get(token);
        if (!registration) {
            throw new interfaces_1.ServiceNotFoundError(token);
        }
        if (registration.lifetime === 'singleton') {
            if (this.singletonInstances.has(token)) {
                return this.singletonInstances.get(token);
            }
        }
        this.resolutionStack.add(token);
        try {
            const instance = registration.factory(this);
            if (registration.lifetime === 'singleton') {
                this.singletonInstances.set(token, instance);
            }
            if (this.loggingService?.isLevelEnabled('debug')) {
                this.loggingService.debug(`Service resolved: ${token.toString()} (${registration.lifetime})`);
            }
            return instance;
        }
        finally {
            this.resolutionStack.delete(token);
        }
    }
    resolveOptional(token) {
        try {
            return this.resolve(token);
        }
        catch (error) {
            if (error instanceof interfaces_1.ServiceNotFoundError) {
                return undefined;
            }
            throw error;
        }
    }
    has(token) {
        return this.registrations.has(token);
    }
    createScope() {
        throw new Error('Not implemented');
    }
    async dispose() {
        this.loggingService?.debug(`Disposing container with ${this.singletonInstances.size} singleton instances`);
        for (const [token, instance] of this.singletonInstances.entries()) {
            if (instance) {
                try {
                    if (typeof instance.disposeAsync === 'function') {
                        await instance.disposeAsync();
                        if (this.loggingService?.isLevelEnabled('debug')) {
                            this.loggingService.debug(`Service disposed async: ${token.toString()}`);
                        }
                    }
                    else if (typeof instance.dispose === 'function') {
                        const result = instance.dispose();
                        if (result instanceof Promise) {
                            await result;
                        }
                        if (this.loggingService?.isLevelEnabled('debug')) {
                            this.loggingService.debug(`Service disposed: ${token.toString()}`);
                        }
                    }
                }
                catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.loggingService?.error(`Error disposing service ${token.toString()}:`, err);
                }
            }
        }
        this.registrations.clear();
        this.singletonInstances.clear();
        this.resolutionStack.clear();
        this.loggingService?.debug('Container disposal completed');
    }
}
exports.Container = Container;
Container.instance = null;
//# sourceMappingURL=Container.js.map