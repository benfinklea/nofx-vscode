import {
    IContainer,
    ServiceRegistration,
    ServiceLifetime,
    ServiceNotFoundError,
    CircularDependencyError,
    IDisposable,
    ILoggingService
} from './interfaces';

export class Container implements IContainer {
    private static instance: Container | null = null;
    private registrations = new Map<symbol, ServiceRegistration>();
    private resolutionStack = new Set<symbol>();
    private singletonInstances = new Map<symbol, any>();
    private loggingService?: ILoggingService;

    constructor(loggingService?: ILoggingService) {
        this.loggingService = loggingService;
    }

    static getInstance(): Container {
        if (!Container.instance) {
            Container.instance = new Container();
        }
        return Container.instance;
    }

    reset(): void {
        // Clear all registrations and instances
        this.dispose();
        Container.instance = null;
    }

    setLoggingService(loggingService: ILoggingService): void {
        this.loggingService = loggingService;
    }

    register<T>(token: symbol, factory: (container: IContainer) => T, lifetime: ServiceLifetime = 'singleton'): void {
        this.registrations.set(token, {
            token,
            factory,
            lifetime
        });

        if (this.loggingService?.isLevelEnabled('debug')) {
            this.loggingService.debug(`Service registered: ${token.toString()} (${lifetime})`);
        }
    }

    registerInstance<T>(token: symbol, instance: T): void {
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

    resolve<T>(token: symbol): T {
        // Check for circular dependencies
        if (this.resolutionStack.has(token)) {
            const chain = Array.from(this.resolutionStack);
            chain.push(token);
            throw new CircularDependencyError(chain);
        }

        const registration = this.registrations.get(token);
        if (!registration) {
            throw new ServiceNotFoundError(token);
        }

        // Handle singleton instances
        if (registration.lifetime === 'singleton') {
            if (this.singletonInstances.has(token)) {
                return this.singletonInstances.get(token);
            }
        }

        // Add to resolution stack
        this.resolutionStack.add(token);

        try {
            // Create instance
            const instance = registration.factory(this);

            // Store singleton instances
            if (registration.lifetime === 'singleton') {
                this.singletonInstances.set(token, instance);
            }

            if (this.loggingService?.isLevelEnabled('debug')) {
                this.loggingService.debug(`Service resolved: ${token.toString()} (${registration.lifetime})`);
            }

            return instance;
        } finally {
            // Remove from resolution stack
            this.resolutionStack.delete(token);
        }
    }

    resolveOptional<T>(token: symbol): T | undefined {
        try {
            return this.resolve<T>(token);
        } catch (error) {
            if (error instanceof ServiceNotFoundError) {
                return undefined;
            }
            throw error;
        }
    }

    has(token: symbol): boolean {
        return this.registrations.has(token);
    }

    createScope(): IContainer {
        throw new Error('Not implemented');
    }

    async dispose(): Promise<void> {
        this.loggingService?.debug(`Disposing container with ${this.singletonInstances.size} singleton instances`);

        // Dispose all singleton instances that implement IDisposable or IAsyncDisposable
        for (const [token, instance] of this.singletonInstances.entries()) {
            if (instance) {
                try {
                    // Check for async dispose first, then sync dispose
                    if (typeof instance.disposeAsync === 'function') {
                        await instance.disposeAsync();
                        if (this.loggingService?.isLevelEnabled('debug')) {
                            this.loggingService.debug(`Service disposed async: ${token.toString()}`);
                        }
                    } else if (typeof instance.dispose === 'function') {
                        // Handle both sync and async dispose methods
                        const result = instance.dispose();
                        if (result instanceof Promise) {
                            await result;
                        }
                        if (this.loggingService?.isLevelEnabled('debug')) {
                            this.loggingService.debug(`Service disposed: ${token.toString()}`);
                        }
                    }
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.loggingService?.error(`Error disposing service ${token.toString()}:`, err);
                }
            }
        }

        // Clear all registrations and instances
        this.registrations.clear();
        this.singletonInstances.clear();
        this.resolutionStack.clear();

        this.loggingService?.debug('Container disposal completed');
    }
}
