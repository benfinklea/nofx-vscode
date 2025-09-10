/**
 * Comprehensive unit tests for EventBus error handling system
 * Tests all error types, error classification, and error context tracking
 */

import {
    EventBusError,
    EventPublicationError,
    EventSubscriptionError,
    EventValidationError,
    EventBusInitializationError,
    CircuitBreakerOpenError,
    MaxRetriesExceededError,
    ResourceExhaustionError,
    ConcurrencyError,
    HandlerTimeoutError,
    EventLoopDepthError,
    ErrorClassifier
} from '../../../services/EventBusErrors';

describe('EventBusError', () => {
    it('should create error with all required properties', () => {
        const error = new EventPublicationError('test.event', new Error('test cause'));

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(EventBusError);
        expect(error.name).toBe('EventPublicationError');
        expect(error.message).toContain('test.event');
        expect(error.errorCode).toBe('EVENT_PUBLICATION_FAILED');
        expect(error.severity).toBe('high');
        expect(error.recoverable).toBe(true);
        expect(error.timestamp).toBeInstanceOf(Date);
        expect(error.context).toEqual(
            expect.objectContaining({
                eventName: 'test.event',
                cause: 'test cause'
            })
        );
    });

    it('should capture stack trace', () => {
        const error = new EventValidationError('test.event', 'validation failed');

        expect(error.stack).toBeDefined();
        expect(error.stack).toContain('EventValidationError');
    });

    it('should serialize to JSON with all properties', () => {
        const error = new EventPublicationError('test.event', new Error('cause'), { extra: 'data' });
        const json = error.toJSON();

        expect(json).toEqual(
            expect.objectContaining({
                name: 'EventPublicationError',
                message: expect.stringContaining('test.event'),
                errorCode: 'EVENT_PUBLICATION_FAILED',
                severity: 'high',
                recoverable: true,
                timestamp: expect.any(String),
                context: expect.objectContaining({
                    eventName: 'test.event',
                    cause: 'cause',
                    extra: 'data'
                }),
                stack: expect.any(String)
            })
        );
    });
});

describe('EventPublicationError', () => {
    it('should create with event name only', () => {
        const error = new EventPublicationError('test.event');

        expect(error.message).toContain('test.event');
        expect(error.errorCode).toBe('EVENT_PUBLICATION_FAILED');
        expect(error.severity).toBe('high');
        expect(error.recoverable).toBe(true);
        expect(error.context.eventName).toBe('test.event');
    });

    it('should create with cause error', () => {
        const cause = new Error('Network timeout');
        const error = new EventPublicationError('test.event', cause);

        expect(error.message).toContain('Network timeout');
        expect(error.context.cause).toBe('Network timeout');
    });

    it('should create with additional context', () => {
        const context = { data: { key: 'value' }, retryAttempt: 3 };
        const error = new EventPublicationError('test.event', undefined, context);

        expect(error.context).toEqual(
            expect.objectContaining({
                eventName: 'test.event',
                data: { key: 'value' },
                retryAttempt: 3
            })
        );
    });

    it('should handle undefined cause gracefully', () => {
        const error = new EventPublicationError('test.event', undefined);

        expect(error.message).toContain('Unknown error');
        expect(error.context.cause).toBeUndefined();
    });
});

describe('EventSubscriptionError', () => {
    it('should create with correct properties', () => {
        const cause = new Error('Handler invalid');
        const error = new EventSubscriptionError('test.event', cause);

        expect(error.name).toBe('EventSubscriptionError');
        expect(error.errorCode).toBe('EVENT_SUBSCRIPTION_FAILED');
        expect(error.severity).toBe('high');
        expect(error.recoverable).toBe(true);
        expect(error.message).toContain('test.event');
        expect(error.message).toContain('Handler invalid');
    });

    it('should work without cause', () => {
        const error = new EventSubscriptionError('test.event');

        expect(error.message).toContain('Unknown error');
    });
});

describe('EventValidationError', () => {
    it('should create with validation failure details', () => {
        const error = new EventValidationError('test.event', 'Event name too long');

        expect(error.name).toBe('EventValidationError');
        expect(error.errorCode).toBe('EVENT_VALIDATION_FAILED');
        expect(error.severity).toBe('medium');
        expect(error.recoverable).toBe(false);
        expect(error.message).toContain('test.event');
        expect(error.message).toContain('Event name too long');
        expect(error.context.validationFailure).toBe('Event name too long');
    });

    it('should include additional context', () => {
        const context = { rule: 'length', maxLength: 255 };
        const error = new EventValidationError('test.event', 'Too long', context);

        expect(error.context).toEqual(
            expect.objectContaining({
                eventName: 'test.event',
                validationFailure: 'Too long',
                rule: 'length',
                maxLength: 255
            })
        );
    });
});

describe('EventBusInitializationError', () => {
    it('should create with cause', () => {
        const cause = new Error('Missing dependency');
        const error = new EventBusInitializationError(cause);

        expect(error.name).toBe('EventBusInitializationError');
        expect(error.errorCode).toBe('EVENTBUS_INIT_FAILED');
        expect(error.severity).toBe('critical');
        expect(error.recoverable).toBe(false);
        expect(error.message).toContain('Missing dependency');
    });

    it('should work without cause', () => {
        const error = new EventBusInitializationError();

        expect(error.message).toContain('Unknown error');
    });
});

describe('CircuitBreakerOpenError', () => {
    it('should create with operation name', () => {
        const error = new CircuitBreakerOpenError('publish');

        expect(error.name).toBe('CircuitBreakerOpenError');
        expect(error.errorCode).toBe('CIRCUIT_BREAKER_OPEN');
        expect(error.severity).toBe('high');
        expect(error.recoverable).toBe(true);
        expect(error.message).toContain('publish');
        expect(error.message).toContain('temporarily unavailable');
        expect(error.context.operation).toBe('publish');
    });

    it('should include additional context', () => {
        const context = { failureCount: 5, lastFailureTime: new Date() };
        const error = new CircuitBreakerOpenError('subscribe', context);

        expect(error.context).toEqual(
            expect.objectContaining({
                operation: 'subscribe',
                failureCount: 5,
                lastFailureTime: expect.any(Date)
            })
        );
    });
});

describe('MaxRetriesExceededError', () => {
    it('should create with operation and attempts', () => {
        const error = new MaxRetriesExceededError('publish', 3);

        expect(error.name).toBe('MaxRetriesExceededError');
        expect(error.errorCode).toBe('MAX_RETRIES_EXCEEDED');
        expect(error.severity).toBe('high');
        expect(error.recoverable).toBe(false);
        expect(error.message).toContain('publish');
        expect(error.message).toContain('3');
        expect(error.context.operation).toBe('publish');
        expect(error.context.attempts).toBe(3);
    });

    it('should include additional context', () => {
        const context = { totalDelay: 5000, errors: ['error1', 'error2'] };
        const error = new MaxRetriesExceededError('subscribe', 2, context);

        expect(error.context).toEqual(
            expect.objectContaining({
                operation: 'subscribe',
                attempts: 2,
                totalDelay: 5000,
                errors: ['error1', 'error2']
            })
        );
    });
});

describe('ResourceExhaustionError', () => {
    it('should create with resource details', () => {
        const error = new ResourceExhaustionError('memory', 1000, 1200);

        expect(error.name).toBe('ResourceExhaustionError');
        expect(error.errorCode).toBe('RESOURCE_EXHAUSTED');
        expect(error.severity).toBe('critical');
        expect(error.recoverable).toBe(true);
        expect(error.message).toContain('memory');
        expect(error.message).toContain('1200/1000');
        expect(error.context.resource).toBe('memory');
        expect(error.context.limit).toBe(1000);
        expect(error.context.current).toBe(1200);
    });

    it('should include additional context', () => {
        const context = { component: 'EventBus', requestedAmount: 500 };
        const error = new ResourceExhaustionError('connections', 100, 150, context);

        expect(error.context).toEqual(
            expect.objectContaining({
                resource: 'connections',
                limit: 100,
                current: 150,
                component: 'EventBus',
                requestedAmount: 500
            })
        );
    });
});

describe('ConcurrencyError', () => {
    it('should create with operation name', () => {
        const error = new ConcurrencyError('publish');

        expect(error.name).toBe('ConcurrencyError');
        expect(error.errorCode).toBe('CONCURRENCY_VIOLATION');
        expect(error.severity).toBe('high');
        expect(error.recoverable).toBe(true);
        expect(error.message).toContain('publish');
        expect(error.context.operation).toBe('publish');
    });

    it('should include additional context', () => {
        const context = { threadId: 'thread-1', lockOwner: 'thread-2' };
        const error = new ConcurrencyError('subscribe', context);

        expect(error.context).toEqual(
            expect.objectContaining({
                operation: 'subscribe',
                threadId: 'thread-1',
                lockOwner: 'thread-2'
            })
        );
    });
});

describe('HandlerTimeoutError', () => {
    it('should create with event and timeout', () => {
        const error = new HandlerTimeoutError('test.event', 5000);

        expect(error.name).toBe('HandlerTimeoutError');
        expect(error.errorCode).toBe('HANDLER_TIMEOUT');
        expect(error.severity).toBe('high');
        expect(error.recoverable).toBe(true);
        expect(error.message).toContain('test.event');
        expect(error.message).toContain('5000ms');
        expect(error.context.eventName).toBe('test.event');
        expect(error.context.timeout).toBe(5000);
    });

    it('should include additional context', () => {
        const context = { handlerName: 'myHandler', executionTime: 6000 };
        const error = new HandlerTimeoutError('slow.event', 5000, context);

        expect(error.context).toEqual(
            expect.objectContaining({
                eventName: 'slow.event',
                timeout: 5000,
                handlerName: 'myHandler',
                executionTime: 6000
            })
        );
    });
});

describe('EventLoopDepthError', () => {
    it('should create with depth information', () => {
        const error = new EventLoopDepthError('recursive.event', 15, 10);

        expect(error.name).toBe('EventLoopDepthError');
        expect(error.errorCode).toBe('EVENT_LOOP_DEPTH_EXCEEDED');
        expect(error.severity).toBe('critical');
        expect(error.recoverable).toBe(false);
        expect(error.message).toContain('recursive.event');
        expect(error.message).toContain('15');
        expect(error.message).toContain('10');
        expect(error.context.eventName).toBe('recursive.event');
        expect(error.context.depth).toBe(15);
        expect(error.context.maxDepth).toBe(10);
    });

    it('should include additional context', () => {
        const context = { callStack: ['event1', 'event2', 'event3'] };
        const error = new EventLoopDepthError('loop.event', 5, 3, context);

        expect(error.context).toEqual(
            expect.objectContaining({
                eventName: 'loop.event',
                depth: 5,
                maxDepth: 3,
                callStack: ['event1', 'event2', 'event3']
            })
        );
    });
});

describe('ErrorClassifier', () => {
    describe('isRecoverable', () => {
        it('should return recoverable status for EventBusError instances', () => {
            const recoverableError = new EventPublicationError('test.event');
            const nonRecoverableError = new EventValidationError('test.event', 'invalid');

            expect(ErrorClassifier.isRecoverable(recoverableError)).toBe(true);
            expect(ErrorClassifier.isRecoverable(nonRecoverableError)).toBe(false);
        });

        it('should return false for programming errors', () => {
            const typeError = new TypeError('Cannot read property');
            const referenceError = new ReferenceError('Variable not defined');

            expect(ErrorClassifier.isRecoverable(typeError)).toBe(false);
            expect(ErrorClassifier.isRecoverable(referenceError)).toBe(false);
        });

        it('should return true for other errors by default', () => {
            const genericError = new Error('Generic error');
            const rangeError = new RangeError('Invalid range');

            expect(ErrorClassifier.isRecoverable(genericError)).toBe(true);
            expect(ErrorClassifier.isRecoverable(rangeError)).toBe(true);
        });
    });

    describe('getSeverity', () => {
        it('should return severity from EventBusError instances', () => {
            const highSeverityError = new EventPublicationError('test.event');
            const mediumSeverityError = new EventValidationError('test.event', 'invalid');
            const criticalSeverityError = new EventBusInitializationError();

            expect(ErrorClassifier.getSeverity(highSeverityError)).toBe('high');
            expect(ErrorClassifier.getSeverity(mediumSeverityError)).toBe('medium');
            expect(ErrorClassifier.getSeverity(criticalSeverityError)).toBe('critical');
        });

        it('should return critical for programming errors', () => {
            const typeError = new TypeError('Cannot read property');
            const referenceError = new ReferenceError('Variable not defined');

            expect(ErrorClassifier.getSeverity(typeError)).toBe('critical');
            expect(ErrorClassifier.getSeverity(referenceError)).toBe('critical');
        });

        it('should return medium for other errors by default', () => {
            const genericError = new Error('Generic error');
            const rangeError = new RangeError('Invalid range');

            expect(ErrorClassifier.getSeverity(genericError)).toBe('medium');
            expect(ErrorClassifier.getSeverity(rangeError)).toBe('medium');
        });
    });

    describe('shouldRetry', () => {
        it('should respect EventBusError recoverable and severity properties', () => {
            const recoverableHighError = new EventPublicationError('test.event');
            const nonRecoverableError = new EventValidationError('test.event', 'invalid');
            const criticalError = new EventBusInitializationError();

            expect(ErrorClassifier.shouldRetry(recoverableHighError)).toBe(true);
            expect(ErrorClassifier.shouldRetry(nonRecoverableError)).toBe(false);
            expect(ErrorClassifier.shouldRetry(criticalError)).toBe(false);
        });

        it('should not retry programming errors', () => {
            const typeError = new TypeError('Cannot read property');
            const referenceError = new ReferenceError('Variable not defined');

            expect(ErrorClassifier.shouldRetry(typeError)).toBe(false);
            expect(ErrorClassifier.shouldRetry(referenceError)).toBe(false);
        });

        it('should retry other errors by default', () => {
            const genericError = new Error('Generic error');
            const rangeError = new RangeError('Invalid range');

            expect(ErrorClassifier.shouldRetry(genericError)).toBe(true);
            expect(ErrorClassifier.shouldRetry(rangeError)).toBe(true);
        });
    });
});

describe('Error Context and Stack Traces', () => {
    it('should preserve original error stack traces', () => {
        const originalError = new Error('Original error');
        const wrappedError = new EventPublicationError('test.event', originalError);

        expect(wrappedError.stack).toBeDefined();
        expect(wrappedError.stack).toContain('EventPublicationError');
        expect(wrappedError.context.cause).toBe('Original error');
    });

    it('should capture stack trace at creation time', () => {
        function createError() {
            return new EventValidationError('test.event', 'validation failed');
        }

        const error = createError();

        expect(error.stack).toBeDefined();
        expect(error.stack).toContain('createError');
    });

    it('should include timestamp in context', () => {
        const before = new Date();
        const error = new EventPublicationError('test.event');
        const after = new Date();

        expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
});

describe('Error Inheritance and Type Guards', () => {
    it('should maintain proper inheritance chain', () => {
        const error = new EventPublicationError('test.event');

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(EventBusError);
        expect(error).toBeInstanceOf(EventPublicationError);
    });

    it('should support instanceof checks for all error types', () => {
        const errors = [
            new EventPublicationError('test'),
            new EventSubscriptionError('test'),
            new EventValidationError('test', 'failed'),
            new EventBusInitializationError(),
            new CircuitBreakerOpenError('test'),
            new MaxRetriesExceededError('test', 3),
            new ResourceExhaustionError('test', 100, 200),
            new ConcurrencyError('test'),
            new HandlerTimeoutError('test', 1000),
            new EventLoopDepthError('test', 5, 3)
        ];

        errors.forEach(error => {
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(EventBusError);
        });
    });

    it('should have unique error codes for each error type', () => {
        const errors = [
            new EventPublicationError('test'),
            new EventSubscriptionError('test'),
            new EventValidationError('test', 'failed'),
            new EventBusInitializationError(),
            new CircuitBreakerOpenError('test'),
            new MaxRetriesExceededError('test', 3),
            new ResourceExhaustionError('test', 100, 200),
            new ConcurrencyError('test'),
            new HandlerTimeoutError('test', 1000),
            new EventLoopDepthError('test', 5, 3)
        ];

        const errorCodes = errors.map(error => error.errorCode);
        const uniqueCodes = new Set(errorCodes);

        expect(uniqueCodes.size).toBe(errorCodes.length);
    });
});

describe('Edge Cases and Error Boundaries', () => {
    it('should handle null and undefined context gracefully', () => {
        const error1 = new EventPublicationError('test', undefined, null as any);
        const error2 = new EventPublicationError('test', undefined, undefined as any);

        expect(error1.context).toEqual(expect.objectContaining({ eventName: 'test' }));
        expect(error2.context).toEqual(expect.objectContaining({ eventName: 'test' }));
    });

    it('should handle very long error messages', () => {
        const longMessage = 'a'.repeat(10000);
        const error = new EventValidationError('test', longMessage);

        expect(error.message).toContain(longMessage);
        expect(error.context.validationFailure).toBe(longMessage);
    });

    it('should handle special characters in error messages', () => {
        const specialMessage = 'Error with 特殊字符 and émojis 🚨';
        const error = new EventPublicationError('test.événement', new Error(specialMessage));

        expect(error.message).toContain(specialMessage);
        expect(error.context.cause).toBe(specialMessage);
    });

    it('should handle circular references in context', () => {
        const context: any = { name: 'test' };
        context.self = context;

        expect(() => {
            new EventPublicationError('test', undefined, context);
        }).not.toThrow();
    });

    it('should serialize correctly even with complex context', () => {
        const complexContext = {
            nested: { deep: { object: 'value' } },
            array: [1, 2, 3],
            date: new Date(),
            regex: /test/gi,
            func: () => 'should be ignored'
        };

        const error = new EventPublicationError('test', undefined, complexContext);
        const json = error.toJSON();

        expect(json.context).toEqual(
            expect.objectContaining({
                eventName: 'test',
                nested: { deep: { object: 'value' } },
                array: [1, 2, 3]
            })
        );
    });
});
