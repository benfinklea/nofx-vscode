// EventBus Error Types

export class EventBusError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EventBusError';
    }
}

export class CircuitOpenError extends EventBusError {
    constructor(message: string = 'Circuit breaker is open') {
        super(message);
        this.name = 'CircuitOpenError';
    }
}

export class ValidationError extends EventBusError {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class EventPublicationError extends EventBusError {
    constructor(
        public event: string,
        public error: Error,
        public context?: any
    ) {
        super(`Failed to publish event '${event}': ${error.message}`);
        this.name = 'EventPublicationError';
    }
}

export class EventSubscriptionError extends EventBusError {
    constructor(
        public event: string,
        public error: Error,
        public context?: any
    ) {
        super(`Failed to subscribe to event '${event}': ${error.message}`);
        this.name = 'EventSubscriptionError';
    }
}

export class EventValidationError extends ValidationError {
    constructor(
        public event: string,
        message: string,
        public context?: any
    ) {
        super(`Event validation failed for '${event}': ${message}`);
        this.name = 'EventValidationError';
    }
}

export class ResourceExhaustionError extends EventBusError {
    constructor(
        public resource: string,
        public limit: number,
        public current: number,
        public context?: any
    ) {
        super(`Resource exhaustion: ${resource} limit ${limit} exceeded (current: ${current})`);
        this.name = 'ResourceExhaustionError';
    }
}

export class ConcurrencyError extends EventBusError {
    constructor(
        public operation: string,
        message: string
    ) {
        super(`Concurrency error in ${operation}: ${message}`);
        this.name = 'ConcurrencyError';
    }
}

export class HandlerTimeoutError extends EventBusError {
    constructor(
        public event: string,
        public timeoutMs: number,
        public handler?: Function
    ) {
        super(`Handler timeout for event '${event}' after ${timeoutMs}ms`);
        this.name = 'HandlerTimeoutError';
    }
}

export class EventLoopDepthError extends EventBusError {
    constructor(
        public event: string,
        public depth: number,
        public maxDepth: number
    ) {
        super(`Event loop depth exceeded for '${event}': ${depth} > ${maxDepth}`);
        this.name = 'EventLoopDepthError';
    }
}

export class ErrorClassifier {
    static isRetryable(error: Error): boolean {
        return !(error instanceof ValidationError || error instanceof EventValidationError);
    }

    static isCircuitOpen(error: Error): boolean {
        return error instanceof CircuitOpenError;
    }

    static getSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
        if (error instanceof ResourceExhaustionError || error instanceof EventLoopDepthError) {
            return 'critical';
        }
        if (error instanceof ConcurrencyError || error instanceof HandlerTimeoutError) {
            return 'high';
        }
        if (error instanceof EventPublicationError || error instanceof EventSubscriptionError) {
            return 'medium';
        }
        return 'low';
    }

    static isRecoverable(error: Error): boolean {
        return !(
            error instanceof EventValidationError ||
            error instanceof ValidationError ||
            error instanceof ResourceExhaustionError
        );
    }
}
