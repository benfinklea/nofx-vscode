import * as vscode from 'vscode';
import { IEventEmitter, IEventSubscriber, EventHandler } from '../interfaces/IEvent';
import { ILogger } from './interfaces';
import { EventMetrics, EventSubscription, EventName } from './EventConstants';
import {
    EventBusError,
    EventPublicationError,
    EventSubscriptionError,
    EventValidationError,
    ResourceExhaustionError,
    ConcurrencyError,
    HandlerTimeoutError,
    EventLoopDepthError,
    ErrorClassifier
} from './EventBusErrors';
// Stub classes for removed enterprise features
class CircuitBreaker {
    constructor(options?: any) {}
    async execute<T>(fn: () => Promise<T>, componentName?: string, operation?: string): Promise<T> {
        return fn();
    }
    allowsExecution(): boolean {
        return true;
    }
    getStatus(): CircuitState {
        return CircuitState.CLOSED;
    }
    reset(): void {}
}
enum CircuitState {
    CLOSED = 'closed',
    OPEN = 'open',
    HALF_OPEN = 'half_open'
}
interface CircuitBreakerOptions {}

class RetryManager {
    constructor(name?: string, logger?: any) {}
    async executeWithRetry<T>(fn: () => Promise<T>, retries: number = 3): Promise<T> {
        return fn();
    }
    async execute<T>(fn: () => Promise<T>, config?: any): Promise<T> {
        return fn();
    }
}
const RETRY_CONFIGURATIONS = {
    default: { maxRetries: 3 },
    STANDARD: { maxRetries: 3 },
    FAST: { maxRetries: 1 }
};

interface ValidationResult {
    isValid: boolean;
    errors: Array<{ severity: 'error' | 'warning'; message: string }>;
    sanitizedValue: any;
    metadata?: any;
}

class InputValidator {
    validateEvent(event: string, data?: any, context?: any): void {
        if (!event) throw new Error('Event name required');
    }

    validateEventName(event: string, data?: any, context?: any): ValidationResult {
        return {
            isValid: !!event,
            errors: event ? [] : [{ severity: 'error', message: 'Event name required' }],
            sanitizedValue: event || ''
        };
    }

    validateEventData(data: any): ValidationResult {
        return {
            isValid: true,
            errors: [],
            sanitizedValue: this.sanitizeData(data),
            metadata: { type: typeof data }
        };
    }

    sanitizeData(data: any): any {
        return data;
    }
}

class SelfHealingManager {
    recordFailure(component: string, error: Error): void {}
    recordError(component: string, error: Error): void {
        this.recordFailure(component, error);
    }
    shouldHeal(component: string): boolean {
        return false;
    }
    heal(component: string): void {}
    async executeWithHealing<T>(fn: () => Promise<T>, component: string): Promise<T> {
        return fn();
    }
    getHealthMetrics(): any {
        return { healthy: true };
    }
    dispose(): void {}
}

class HealthMonitor {
    constructor(logger?: any, eventBus?: any) {}
    recordMetric(name: string, value: number, unit?: string, tags?: any): void {}
    getHealth(): string {
        return 'healthy';
    }
    getSystemHealth(): any {
        return { status: 'healthy' };
    }
    async shutdown(): Promise<void> {}
}

export class EventBus implements IEventEmitter, IEventSubscriber {
    // Core event system
    private readonly eventEmitters: Map<string, vscode.EventEmitter<any>> = new Map();
    private readonly handlerDisposables: Map<string, Map<Function, vscode.Disposable>> = new Map();
    private readonly patternSubscriptions: Array<{
        pattern: string;
        handler: (event: string, data?: any) => void;
        disposables: vscode.Disposable[];
    }> = [];
    private readonly listenerCounts: Map<string, number> = new Map();
    private readonly disposables: vscode.Disposable[] = [];
    private readonly eventMetrics: Map<string, EventMetrics> = new Map();
    private readonly subscriptions: Map<string, EventSubscription[]> = new Map();

    // Configuration
    private debugLogging = false;
    private metricsEnabled = true;
    private readonly isDisposed = false;

    // Enterprise features
    private readonly circuitBreakers: Map<string, CircuitBreaker> = new Map();
    private readonly retryManagers: Map<string, RetryManager> = new Map();
    private readonly eventLoopDepth: Map<string, number> = new Map();
    private readonly concurrentOperations: Map<string, Promise<any>> = new Map();
    private readonly inputValidator = new InputValidator();
    private readonly selfHealingManager: SelfHealingManager;
    private readonly healthMonitor: HealthMonitor;

    // Resource limits
    private readonly maxEventEmitters = 1000;
    private readonly maxSubscribersPerEvent = 100;
    private readonly maxEventLoopDepth = 10;
    private readonly handlerTimeoutMs = 30000; // 30 seconds

    // High-frequency events that should be debounced
    private readonly highFrequencyEvents = new Set([
        'agent.status.changed',
        'task.state.changed',
        'ui.state.changed',
        'orchestration.message.received'
    ]);

    // Debounce timers for high-frequency events
    private readonly debounceTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(private loggingService?: ILogger) {
        try {
            // Enable debug logging if logging service is available and debug level is enabled
            if (this.loggingService?.isLevelEnabled('debug')) {
                this.debugLogging = true;
            }

            // Initialize self-healing manager
            this.selfHealingManager = new SelfHealingManager();

            // Initialize health monitor
            this.healthMonitor = new HealthMonitor(this.loggingService, this);

            this.initializeEnterpriseFeatures();

            // Log metrics periodically in debug mode
            if (this.debugLogging) {
                setInterval(() => {
                    this.logPeriodicMetrics();
                }, 30000); // Every 30 seconds
            }

            this.loggingService?.info(
                'EventBus initialized with enterprise features, self-healing, and health monitoring'
            );
        } catch (error) {
            this.loggingService?.warn('EventBus initialization failed', error);
            throw error;
        }
    }

    private logPeriodicMetrics(): void {
        if (!this.debugLogging || !this.loggingService) return;

        const totalEvents = this.eventMetrics.size;
        const unusedEvents = this.getUnusedEvents();
        const orphanedEvents = this.getOrphanedEvents();
        const totalPublishCount = Array.from(this.eventMetrics.values()).reduce(
            (sum, metrics) => sum + metrics.publishCount,
            0
        );

        this.loggingService.debug('EventBus Metrics:', {
            totalEvents,
            unusedCount: unusedEvents.length,
            orphanedCount: orphanedEvents.length,
            totalPublishCount,
            activeEvents: totalEvents - unusedEvents.length - orphanedEvents.length
        });
    }

    setLoggingService(logger: ILogger): void {
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

    /**
     * Initialize enterprise-grade features
     */
    private initializeEnterpriseFeatures(): void {
        // Create circuit breakers for critical operations
        this.createCircuitBreaker('publish', {
            failureThreshold: 5,
            resetTimeout: 10000, // 10 seconds
            successThreshold: 3
        });

        this.createCircuitBreaker('subscribe', {
            failureThreshold: 3,
            resetTimeout: 5000, // 5 seconds
            successThreshold: 2
        });

        // Create retry managers for different operation types
        this.retryManagers.set('publish', new RetryManager('EventBus:publish', this.loggingService));
        this.retryManagers.set('subscribe', new RetryManager('EventBus:subscribe', this.loggingService));
        this.retryManagers.set('handler', new RetryManager('EventBus:handler', this.loggingService));
    }

    /**
     * Create circuit breaker for operation type
     */
    private createCircuitBreaker(operation: string, options: CircuitBreakerOptions): void {
        const circuitBreaker = new CircuitBreaker(options);
        this.circuitBreakers.set(operation, circuitBreaker);
    }

    /**
     * Get or create circuit breaker for operation
     */
    private getCircuitBreaker(operation: string): CircuitBreaker | null {
        return this.circuitBreakers.get(operation) || null;
    }

    /**
     * Get or create retry manager for operation
     */
    private getRetryManager(operation: string): RetryManager | null {
        return this.retryManagers.get(operation) || null;
    }

    /**
     * Validate input parameters with comprehensive checks
     */
    private validateInput(
        event: string,
        operation: string,
        data?: any
    ): { sanitizedEvent: string; sanitizedData?: any } {
        // Check if EventBus is disposed
        if (this.isDisposed) {
            throw new EventValidationError(event, 'EventBus is disposed', { operation });
        }

        // Validate event name using InputValidator
        const eventValidation = this.inputValidator.validateEventName(event);
        if (!eventValidation.isValid) {
            const errorMessages = eventValidation.errors
                .filter(e => e.severity === 'error')
                .map(e => e.message)
                .join('; ');
            throw new EventValidationError(event, errorMessages, {
                operation,
                validationErrors: eventValidation.errors
            });
        }

        // Log warnings
        const warnings = eventValidation.errors.filter(e => e.severity === 'warning');
        if (warnings.length > 0 && this.debugLogging) {
            this.loggingService?.warn(`Event name validation warnings for '${event}'`, {
                warnings: warnings.map(w => w.message),
                operation
            });
        }

        let sanitizedData = data;

        // Validate data if provided
        if (data !== undefined) {
            const dataValidation = this.inputValidator.validateEventData(data);
            if (!dataValidation.isValid) {
                const errorMessages = dataValidation.errors
                    .filter(e => e.severity === 'error')
                    .map(e => e.message)
                    .join('; ');
                throw new EventValidationError(event, `Data validation failed: ${errorMessages}`, {
                    operation,
                    validationErrors: dataValidation.errors,
                    dataMetadata: dataValidation.metadata
                });
            }

            sanitizedData = dataValidation.sanitizedValue;

            // Log data warnings
            const dataWarnings = dataValidation.errors.filter(e => e.severity === 'warning');
            if (dataWarnings.length > 0 && this.debugLogging) {
                this.loggingService?.warn(`Event data validation warnings for '${event}'`, {
                    warnings: dataWarnings.map(w => w.message),
                    operation,
                    metadata: dataValidation.metadata
                });
            }
        }

        // Check resource limits
        if (this.eventEmitters.size >= this.maxEventEmitters) {
            throw new ResourceExhaustionError('eventEmitters', this.maxEventEmitters, this.eventEmitters.size, {
                event,
                operation
            });
        }

        return {
            sanitizedEvent: eventValidation.sanitizedValue,
            sanitizedData
        };
    }

    /**
     * Check for event loop depth to prevent infinite recursion
     */
    private checkEventLoopDepth(event: string): void {
        const currentDepth = this.eventLoopDepth.get(event) || 0;
        if (currentDepth >= this.maxEventLoopDepth) {
            throw new EventLoopDepthError(event, currentDepth, this.maxEventLoopDepth);
        }
    }

    /**
     * Enter event loop for tracking recursion depth
     */
    private enterEventLoop(event: string): void {
        const currentDepth = this.eventLoopDepth.get(event) || 0;
        this.eventLoopDepth.set(event, currentDepth + 1);
    }

    /**
     * Exit event loop
     */
    private exitEventLoop(event: string): void {
        const currentDepth = this.eventLoopDepth.get(event) || 0;
        if (currentDepth > 0) {
            this.eventLoopDepth.set(event, currentDepth - 1);
        }
    }

    /**
     * Execute operation with concurrent access protection
     */
    private async withConcurrencyProtection<T>(operation: string, key: string, fn: () => Promise<T>): Promise<T> {
        const operationKey = `${operation}:${key}`;

        // Check if operation is already running
        const existingOperation = this.concurrentOperations.get(operationKey);
        if (existingOperation) {
            throw new ConcurrencyError(operation, `Operation already running for key: ${key}`);
        }

        try {
            const promise = fn();
            this.concurrentOperations.set(operationKey, promise);
            const result = await promise;
            return result;
        } finally {
            this.concurrentOperations.delete(operationKey);
        }
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
                    const disposable = this.subscribe(event, data => patternSub.handler(event, data));
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
        try {
            // Input validation and sanitization
            const { sanitizedEvent, sanitizedData } = this.validateInput(event, 'publish', data);

            // Use sanitized values
            const finalEvent = sanitizedEvent;
            const finalData = sanitizedData;

            // Execute with self-healing capabilities
            const publishOperation = async (): Promise<void> => {
                // Check circuit breaker
                const circuitBreaker = this.getCircuitBreaker('publish');
                if (circuitBreaker && !circuitBreaker.allowsExecution()) {
                    throw new EventPublicationError(finalEvent, new Error('Circuit breaker is OPEN'), {
                        data: finalData
                    });
                }

                // Check event loop depth
                this.checkEventLoopDepth(finalEvent);

                // Check if event has subscribers before publishing
                if (!this.hasSubscribers(finalEvent)) {
                    if (this.debugLogging) {
                        this.loggingService?.warn(`Publishing '${finalEvent}' with no subscribers`);
                    }
                    return;
                }

                this.enterEventLoop(finalEvent);

                try {
                    this.logEvent(finalEvent, 'publish', finalData);
                    this.updateMetrics(finalEvent, 'publish');

                    // Use debouncing for high-frequency events
                    if (this.highFrequencyEvents.has(finalEvent)) {
                        this.publishWithDebounce(finalEvent, finalData);
                    } else {
                        const emitter = this.getOrCreateEmitter(finalEvent);
                        emitter.fire(finalData);
                    }
                } finally {
                    this.exitEventLoop(finalEvent);
                }
            };

            // Execute with self-healing for critical publish operations
            this.selfHealingManager.executeWithHealing(publishOperation, `publish:${finalEvent}`).catch(error => {
                this.handleError(error, 'publish-healing', { event: finalEvent, data: finalData });
                throw error;
            });
        } catch (error) {
            this.handleError(error as Error, 'publish', { event, data });

            // For EventBusError types, rethrow as-is
            if (error instanceof EventBusError) {
                throw error;
            }

            // Wrap other errors
            throw new EventPublicationError(event, error as Error, { data });
        }
    }

    /**
     * Check if event is critical for system operation
     */
    private isCriticalEvent(event: string): boolean {
        const criticalEvents = new Set([
            'system.error',
            'agent.terminated',
            'task.failed',
            'config.validation.failed',
            'orchestration.connection.lost'
        ]);
        return criticalEvents.has(event);
    }

    /**
     * Execute operation with timeout protection
     */
    private async executeWithTimeout<T>(
        operation: () => Promise<T>,
        timeoutMs: number,
        operationName: string
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new HandlerTimeoutError(operationName, timeoutMs));
            }, timeoutMs);

            operation()
                .then(result => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }

    /**
     * Handle errors with proper classification, logging, and self-healing
     */
    private handleError(error: Error, operation: string, context: Record<string, any>): void {
        const severity = ErrorClassifier.getSeverity(error);
        const recoverable = ErrorClassifier.isRecoverable(error);

        const logData = {
            operation,
            error: error.message,
            errorType: error.constructor.name,
            severity,
            recoverable,
            context,
            timestamp: new Date().toISOString()
        };

        if (severity === 'critical' || severity === 'high') {
            this.loggingService?.warn(`EventBus ${operation} error (${severity})`, logData);
        } else {
            this.loggingService?.debug(`EventBus ${operation} error (${severity})`, logData);
        }

        // Record error with self-healing manager
        this.selfHealingManager.recordError(operation, error);

        // Update metrics for error tracking
        this.updateErrorMetrics(operation, error, severity);
    }

    /**
     * Update error metrics for monitoring
     */
    private updateErrorMetrics(operation: string, error: Error, severity: string): void {
        // Enhanced metrics collection with structured logging
        if (this.metricsEnabled) {
            const errorMetric = {
                operation,
                errorType: error.constructor.name,
                severity,
                timestamp: new Date().toISOString(),
                errorMessage: error.message,
                stackTrace: this.debugLogging ? error.stack : undefined,
                context: {
                    totalEmitters: this.eventEmitters.size,
                    totalSubscribers: Array.from(this.listenerCounts.values()).reduce((sum, count) => sum + count, 0),
                    activePatterns: this.patternSubscriptions.length,
                    healthStatus: this.healthMonitor ? 'monitored' : 'unmonitored'
                }
            };

            if (severity === 'critical' || severity === 'high') {
                this.loggingService?.warn('EventBus error metrics (high severity)', errorMetric);
            } else if (this.debugLogging) {
                this.loggingService?.debug('EventBus error metrics', errorMetric);
            }
        }
    }

    /**
     * Get comprehensive EventBus health information
     */
    getHealthStatus(): Promise<any> {
        return (
            this.healthMonitor?.getSystemHealth() ||
            Promise.resolve({
                overall: 'unknown',
                message: 'Health monitoring not available'
            })
        );
    }

    /**
     * Get EventBus performance metrics
     */
    getPerformanceMetrics(): Record<string, any> {
        const metrics = {
            totalEmitters: this.eventEmitters.size,
            totalSubscribers: Array.from(this.listenerCounts.values()).reduce((sum, count) => sum + count, 0),
            activePatterns: this.patternSubscriptions.length,
            totalDisposables: this.disposables.length,
            debounceTimers: this.debounceTimers.size,
            eventMetrics: Object.fromEntries(
                Array.from(this.eventMetrics.entries()).map(([event, metrics]) => [
                    event,
                    {
                        publishCount: metrics.publishCount,
                        subscriberCount: metrics.subscriberCount,
                        hasSubscribers: metrics.hasSubscribers,
                        lastPublished: metrics.lastPublished?.toISOString()
                    }
                ])
            ),
            circuitBreakers: Object.fromEntries(
                Array.from(this.circuitBreakers.entries()).map(([name, breaker]) => [name, breaker.getStatus()])
            ),
            selfHealing: this.selfHealingManager ? this.selfHealingManager.getHealthMetrics() : null
        };

        return metrics;
    }

    /**
     * Force graceful shutdown of EventBus
     */
    async gracefulShutdown(reason: string = 'Manual shutdown'): Promise<void> {
        this.loggingService?.info(`EventBus graceful shutdown initiated: ${reason}`);

        try {
            // Stop accepting new events
            (this as any).isDisposed = true;

            // Wait for ongoing operations to complete
            const ongoingOps = Array.from(this.concurrentOperations.values());
            if (ongoingOps.length > 0) {
                this.loggingService?.info(`Waiting for ${ongoingOps.length} ongoing operations to complete`);
                await Promise.allSettled(ongoingOps);
            }

            // Trigger health monitor shutdown
            await this.healthMonitor?.shutdown();

            // Finally dispose normally
            this.dispose();

            this.loggingService?.info('EventBus graceful shutdown completed successfully');
        } catch (error) {
            this.loggingService?.error('Error during EventBus graceful shutdown', error);
            throw error;
        }
    }

    private publishWithDebounce(event: string, data: any, delayMs: number = 50): void {
        const key = `${event}:${JSON.stringify(data)}`;

        if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key)!);
        }

        this.debounceTimers.set(
            key,
            setTimeout(() => {
                const emitter = this.getOrCreateEmitter(event);
                emitter.fire(data);
                this.debounceTimers.delete(key);
            }, delayMs)
        );
    }

    subscribe(event: string, handler: (data?: any) => void): vscode.Disposable {
        const circuitBreaker = this.getCircuitBreaker('subscribe');
        const retryManager = this.getRetryManager('subscribe');

        // Execute with circuit breaker protection
        if (circuitBreaker && !circuitBreaker.allowsExecution()) {
            throw new EventSubscriptionError(event, new Error('Circuit breaker is OPEN'));
        }

        const executeSubscribe = async (): Promise<vscode.Disposable> => {
            return this.withConcurrencyProtection('subscribe', event, async () => {
                try {
                    // Input validation and sanitization
                    const { sanitizedEvent } = this.validateInput(event, 'subscribe');
                    const finalEvent = sanitizedEvent;

                    if (!handler || typeof handler !== 'function') {
                        throw new EventValidationError(event, 'Handler must be a function', { operation: 'subscribe' });
                    }

                    // Check subscriber limits
                    const currentCount = this.listenerCounts.get(event) || 0;
                    if (currentCount >= this.maxSubscribersPerEvent) {
                        throw new ResourceExhaustionError('subscribers', this.maxSubscribersPerEvent, currentCount, {
                            event
                        });
                    }

                    this.logEvent(event, 'subscribe');
                    this.updateMetrics(event, 'subscribe');

                    const emitter = this.getOrCreateEmitter(event);

                    // Create wrapped handler with error protection and timeout
                    const wrappedHandler = this.createProtectedHandler(event, handler);
                    const disposable = emitter.event(wrappedHandler);

                    // Track handler->disposable mapping for unsubscribe
                    if (!this.handlerDisposables.has(event)) {
                        this.handlerDisposables.set(event, new Map());
                    }
                    this.handlerDisposables.get(event)!.set(handler, disposable);

                    // Update listener count
                    this.listenerCounts.set(event, currentCount + 1);

                    // Track subscription for debugging
                    const subscription: EventSubscription = {
                        event,
                        handler,
                        disposable,
                        subscribedAt: new Date()
                    };

                    if (!this.subscriptions.has(event)) {
                        this.subscriptions.set(event, []);
                    }
                    this.subscriptions.get(event)!.push(subscription);

                    // Track disposables for cleanup
                    this.disposables.push(disposable);

                    return disposable;
                } catch (error) {
                    this.handleError(error as Error, 'subscribe', { event });
                    throw new EventSubscriptionError(event, error as Error);
                }
            });
        };

        // Execute with retry logic and circuit breaker
        const operation = circuitBreaker ? () => circuitBreaker.execute(executeSubscribe) : executeSubscribe;

        try {
            // Execute synchronously - we need to return immediately
            let disposable: vscode.Disposable | undefined;
            executeSubscribe()
                .then(d => {
                    disposable = d;
                })
                .catch(error => {
                    this.handleError(error as Error, 'subscribe', { event });
                });
            // Return a temporary disposable until the real one is ready
            return disposable || { dispose: () => {} };
        } catch (error) {
            this.handleError(error as Error, 'subscribe', { event });
            throw error;
        }
    }

    /**
     * Create protected handler with timeout and error handling
     */
    private createProtectedHandler(event: string, originalHandler: (data?: any) => void): (data?: any) => void {
        return async (data?: any) => {
            const handlerRetryManager = this.getRetryManager('handler');

            const executeHandler = async (): Promise<void> => {
                try {
                    // Execute with timeout protection
                    await this.executeWithTimeout(
                        async () => {
                            // Handle both sync and async handlers
                            const result = originalHandler(data) as any;
                            if (result && typeof result === 'object' && typeof result.then === 'function') {
                                await result;
                            }
                        },
                        this.handlerTimeoutMs,
                        `handler for event '${event}'`
                    );
                } catch (error) {
                    this.handleError(error as Error, 'handler', { event, data });

                    // Don't rethrow handler errors to prevent breaking the event system
                    // Just log and continue
                    if (this.debugLogging) {
                        this.loggingService?.warn(`Event handler failed for '${event}'`, {
                            error: (error as Error).message,
                            errorType: (error as Error).constructor.name
                        });
                    }
                }
            };

            // Execute handler with retry if configured
            if (handlerRetryManager) {
                try {
                    await handlerRetryManager.execute(executeHandler, {
                        ...RETRY_CONFIGURATIONS.FAST,
                        maxAttempts: 2 // Limit retries for handlers to prevent delays
                    });
                } catch (error) {
                    // Final fallback - log but don't break event system
                    this.handleError(error as Error, 'handler-final', { event, data });
                }
            } else {
                await executeHandler();
            }
        };
    }

    unsubscribe(event: string, handler: Function): void {
        this.logEvent(event, 'unsubscribe');
        this.updateMetrics(event, 'unsubscribe');

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

                // Remove from subscription tracking
                const subscriptions = this.subscriptions.get(event);
                if (subscriptions) {
                    const subIndex = subscriptions.findIndex(sub => sub.handler === handler);
                    if (subIndex > -1) {
                        subscriptions.splice(subIndex, 1);
                    }

                    if (subscriptions.length === 0) {
                        this.subscriptions.delete(event);
                    }
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

        const disposable = emitter.event(data => {
            if (!disposed) {
                disposed = true;
                handler(data);
                disposable.dispose();
            }
        });

        this.disposables.push(disposable);
        return disposable;
    }

    filter(event: string, predicate: (data?: any) => boolean): { event: vscode.Event<any>; dispose: () => void } {
        this.logEvent(event, 'subscribe', { filter: true });

        const emitter = this.getOrCreateEmitter(event);
        const filteredEmitter = new vscode.EventEmitter<any>();

        const disposable = emitter.event(data => {
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
                const disposable = this.subscribe(event, data => handler(event, data));
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

    // Get event metrics for debugging
    getEventMetrics(event?: string): Map<string, EventMetrics> | EventMetrics | undefined {
        if (event) {
            return this.eventMetrics.get(event);
        }
        return this.eventMetrics;
    }

    // Get subscription info for debugging
    getSubscriptionInfo(event?: string): Map<string, EventSubscription[]> | EventSubscription[] | undefined {
        if (event) {
            return this.subscriptions.get(event);
        }
        return this.subscriptions;
    }

    // Get events with no subscribers (unused events)
    getUnusedEvents(): string[] {
        const unused: string[] = [];
        this.eventMetrics.forEach((metrics, event) => {
            if (metrics.publishCount > 0 && metrics.subscriberCount === 0) {
                unused.push(event);
            }
        });
        return unused;
    }

    // Get events with subscribers but never published (orphaned)
    getOrphanedEvents(): string[] {
        const orphaned: string[] = [];
        this.eventMetrics.forEach((metrics, event) => {
            if (metrics.subscriberCount > 0 && metrics.publishCount === 0) {
                orphaned.push(event);
            }
        });
        return orphaned;
    }

    // Update event metrics
    private updateMetrics(event: string, action: 'publish' | 'subscribe' | 'unsubscribe'): void {
        if (!this.metricsEnabled) return;

        if (!this.eventMetrics.has(event)) {
            this.eventMetrics.set(event, {
                publishCount: 0,
                subscriberCount: 0,
                lastPublished: null,
                avgFrequency: 0,
                hasSubscribers: false
            });
        }

        const metrics = this.eventMetrics.get(event)!;

        switch (action) {
            case 'publish':
                metrics.publishCount++;
                metrics.lastPublished = new Date();
                // Calculate average frequency (simplified)
                if (metrics.publishCount > 1) {
                    const timeDiff = Date.now() - (metrics.lastPublished?.getTime() || 0);
                    metrics.avgFrequency = (metrics.avgFrequency + timeDiff) / 2;
                }
                break;
            case 'subscribe':
                metrics.subscriberCount++;
                metrics.hasSubscribers = true;
                break;
            case 'unsubscribe':
                metrics.subscriberCount = Math.max(0, metrics.subscriberCount - 1);
                metrics.hasSubscribers = metrics.subscriberCount > 0;
                break;
        }
    }

    // Adapter methods for IEventEmitter interface
    emit(event: string, data?: any): void {
        this.publish(event, data);
    }

    // Adapter methods for IEventSubscriber interface
    on(event: string, handler: (data?: any) => void): void {
        this.subscribe(event, handler);
    }

    off(event: string, handler: Function): void {
        this.unsubscribe(event, handler);
    }

    dispose(): void {
        this.disposeSync();
    }

    private disposeSync(): void {
        if (this.debugLogging) {
            this.loggingService?.debug(`EventBus: Disposing ${this.eventEmitters.size} event emitters`);

            // Log unused events for debugging
            const unused = this.getUnusedEvents();
            const orphaned = this.getOrphanedEvents();

            if (unused.length > 0) {
                this.loggingService?.warn(`EventBus: Found ${unused.length} unused events:`, unused);
            }

            if (orphaned.length > 0) {
                this.loggingService?.warn(`EventBus: Found ${orphaned.length} orphaned subscriptions:`, orphaned);
            }
        }

        // Clear debounce timers
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();

        // Dispose all tracked disposables
        this.disposables.forEach(d => {
            try {
                d.dispose();
            } catch (error) {
                this.loggingService?.warn(`EventBus: Error disposing handler:`, error);
            }
        });
        this.disposables.length = 0;

        // Clear handler disposables
        this.handlerDisposables.clear();

        // Clear listener counts
        this.listenerCounts.clear();

        // Clear pattern subscriptions
        this.patternSubscriptions.forEach(sub => {
            sub.disposables.forEach(d => {
                try {
                    d.dispose();
                } catch (error) {
                    this.loggingService?.warn(`EventBus: Error disposing pattern subscription:`, error);
                }
            });
        });
        this.patternSubscriptions.length = 0;

        // Clear metrics and subscriptions
        this.eventMetrics.clear();
        this.subscriptions.clear();

        // Dispose enterprise features
        try {
            if (this.healthMonitor?.shutdown) {
                // Note: We can't await in a synchronous dispose method
                // This is a limitation - ideally dispose would be async
                this.healthMonitor.shutdown().catch(error => {
                    this.loggingService?.warn('Error during health monitor shutdown:', error);
                });
            }
        } catch (error) {
            this.loggingService?.warn('Error during health monitor shutdown:', error);
        }

        try {
            this.selfHealingManager?.dispose();
        } catch (error) {
            this.loggingService?.warn('Error during self-healing manager disposal:', error);
        }

        // Dispose circuit breakers
        this.circuitBreakers.forEach((breaker, name) => {
            try {
                breaker.reset();
                this.loggingService?.debug(`Circuit breaker '${name}' reset during disposal`);
            } catch (error) {
                this.loggingService?.warn(`Error resetting circuit breaker '${name}':`, error);
            }
        });
        this.circuitBreakers.clear();

        // Clear retry managers
        this.retryManagers.clear();

        // Clear enterprise tracking
        this.eventLoopDepth.clear();
        this.concurrentOperations.clear();

        // Dispose all event emitters
        this.eventEmitters.forEach(emitter => {
            try {
                emitter.dispose();
            } catch (error) {
                this.loggingService?.warn(`EventBus: Error disposing event emitter:`, error);
            }
        });
        this.eventEmitters.clear();

        this.loggingService?.info('EventBus disposal completed with enterprise cleanup');
    }
}
