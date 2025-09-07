import * as vscode from 'vscode';
import { EventBus } from '../../../services/EventBus';
import { ILoggingService } from '../../../services/interfaces';

jest.mock('vscode');

describe('EventBus', () => {
    let eventBus: EventBus;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventEmitter: jest.Mocked<vscode.EventEmitter<any>>;
    let mockDisposable: jest.Mocked<vscode.Disposable>;

    beforeEach(() => {
        // Mock logging service
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn().mockReturnValue(false),
            getChannel: jest.fn(),
            time: jest.fn(),
            timeEnd: jest.fn(),
            onDidChangeConfiguration: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Mock disposable
        mockDisposable = {
            dispose: jest.fn()
        };

        // Mock event emitter
        mockEventEmitter = {
            event: jest.fn().mockReturnValue(mockDisposable),
            fire: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Mock VS Code EventEmitter constructor
        (vscode.EventEmitter as jest.Mock).mockImplementation(() => mockEventEmitter);

        eventBus = new EventBus();
    });

    afterEach(() => {
        jest.clearAllMocks();
        eventBus.dispose();
    });

    describe('constructor', () => {
        it('should initialize without logging service', () => {
            const bus = new EventBus();
            expect(bus).toBeDefined();
            expect(bus.getRegisteredEvents()).toEqual([]);
            bus.dispose();
        });

        it('should initialize with logging service', () => {
            const bus = new EventBus(mockLoggingService);
            expect(bus).toBeDefined();
            bus.dispose();
        });

        it('should enable debug logging when logging service has debug enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            const bus = new EventBus(mockLoggingService);

            bus.publish('test.event', { data: 'test' });

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining("EventBus: publish event 'test.event'"),
                { data: 'test' }
            );

            bus.dispose();
        });
    });

    describe('setLoggingService', () => {
        it('should set logging service after construction', () => {
            eventBus.setLoggingService(mockLoggingService);

            expect(mockLoggingService.onDidChangeConfiguration).toHaveBeenCalled();
        });

        it('should enable debug logging when service is set with debug enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);

            eventBus.setLoggingService(mockLoggingService);
            eventBus.publish('test.event');

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining("EventBus: publish event 'test.event'")
            );
        });

        it('should subscribe to configuration changes', () => {
            const mockConfigDisposable = { dispose: jest.fn() };
            mockLoggingService.onDidChangeConfiguration = jest.fn().mockReturnValue(mockConfigDisposable);

            eventBus.setLoggingService(mockLoggingService);

            expect(mockLoggingService.onDidChangeConfiguration).toHaveBeenCalled();
        });
    });

    describe('publish', () => {
        it('should publish event without data', () => {
            eventBus.publish('test.event');

            expect(vscode.EventEmitter).toHaveBeenCalled();
            expect(mockEventEmitter.fire).toHaveBeenCalledWith(undefined);
        });

        it('should publish event with data', () => {
            const eventData = { message: 'test', value: 42 };

            eventBus.publish('test.event', eventData);

            expect(mockEventEmitter.fire).toHaveBeenCalledWith(eventData);
        });

        it('should create emitter for new events', () => {
            eventBus.publish('new.event');

            expect(vscode.EventEmitter).toHaveBeenCalled();
            expect(eventBus.getRegisteredEvents()).toContain('new.event');
        });

        it('should reuse existing emitter for known events', () => {
            eventBus.publish('test.event');
            eventBus.publish('test.event');

            // Should only create one emitter
            expect(vscode.EventEmitter).toHaveBeenCalledTimes(1);
        });

        it('should log debug information when debug logging is enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            eventBus.setLoggingService(mockLoggingService);

            const testData = { test: true };
            eventBus.publish('debug.event', testData);

            expect(mockLoggingService.debug).toHaveBeenCalledWith("EventBus: publish event 'debug.event'", testData);
        });
    });

    describe('subscribe', () => {
        it('should subscribe to event and return disposable', () => {
            const handler = jest.fn();

            const disposable = eventBus.subscribe('test.event', handler);

            expect(mockEventEmitter.event).toHaveBeenCalledWith(handler);
            expect(disposable).toBe(mockDisposable);
            expect(eventBus.hasSubscribers('test.event')).toBe(true);
        });

        it('should track multiple subscribers for same event', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            eventBus.subscribe('test.event', handler1);
            eventBus.subscribe('test.event', handler2);

            expect(mockEventEmitter.event).toHaveBeenCalledTimes(2);
            expect(eventBus.hasSubscribers('test.event')).toBe(true);
        });

        it('should create emitter if it does not exist', () => {
            const handler = jest.fn();

            eventBus.subscribe('new.event', handler);

            expect(vscode.EventEmitter).toHaveBeenCalled();
            expect(eventBus.getRegisteredEvents()).toContain('new.event');
        });

        it('should log debug information when debug logging is enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            eventBus.setLoggingService(mockLoggingService);

            const handler = jest.fn();
            eventBus.subscribe('debug.event', handler);

            expect(mockLoggingService.debug).toHaveBeenCalledWith("EventBus: subscribe event 'debug.event'");
        });

        it('should handle pattern subscriptions for existing events', () => {
            // First subscribe to pattern
            const patternHandler = jest.fn();
            eventBus.subscribePattern('test.*', patternHandler);

            // Then create a matching event
            const normalHandler = jest.fn();
            eventBus.subscribe('test.specific', normalHandler);

            expect(mockEventEmitter.event).toHaveBeenCalled();
        });
    });

    describe('unsubscribe', () => {
        it('should unsubscribe handler and dispose', () => {
            const handler = jest.fn();

            eventBus.subscribe('test.event', handler);
            eventBus.unsubscribe('test.event', handler);

            expect(mockDisposable.dispose).toHaveBeenCalled();
            expect(eventBus.hasSubscribers('test.event')).toBe(false);
        });

        it('should handle unsubscribe of non-existent handler', () => {
            const handler = jest.fn();

            // Should not throw
            expect(() => eventBus.unsubscribe('non.existent', handler)).not.toThrow();
        });

        it('should handle unsubscribe of non-existent event', () => {
            const handler = jest.fn();

            // Should not throw
            expect(() => eventBus.unsubscribe('non.existent.event', handler)).not.toThrow();
        });

        it('should update listener count correctly', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            eventBus.subscribe('test.event', handler1);
            eventBus.subscribe('test.event', handler2);

            expect(eventBus.hasSubscribers('test.event')).toBe(true);

            eventBus.unsubscribe('test.event', handler1);
            expect(eventBus.hasSubscribers('test.event')).toBe(true);

            eventBus.unsubscribe('test.event', handler2);
            expect(eventBus.hasSubscribers('test.event')).toBe(false);
        });

        it('should clean up empty event handler maps', () => {
            const handler = jest.fn();

            eventBus.subscribe('test.event', handler);
            eventBus.unsubscribe('test.event', handler);

            // After unsubscribing the last handler, the event should have no subscribers
            expect(eventBus.hasSubscribers('test.event')).toBe(false);
        });
    });

    describe('once', () => {
        it('should subscribe for single event emission', () => {
            const handler = jest.fn();

            const disposable = eventBus.once('test.event', handler);

            expect(mockEventEmitter.event).toHaveBeenCalled();
            expect(disposable).toBeDefined();
        });

        it('should create emitter if it does not exist', () => {
            const handler = jest.fn();

            eventBus.once('new.event', handler);

            expect(vscode.EventEmitter).toHaveBeenCalled();
            expect(eventBus.getRegisteredEvents()).toContain('new.event');
        });

        it('should log debug information when debug logging is enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            eventBus.setLoggingService(mockLoggingService);

            const handler = jest.fn();
            eventBus.once('debug.event', handler);

            expect(mockLoggingService.debug).toHaveBeenCalledWith("EventBus: subscribe event 'debug.event'", {
                once: true
            });
        });

        it('should handle disposal correctly', () => {
            const handler = jest.fn();

            const disposable = eventBus.once('test.event', handler);
            disposable.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });

    describe('filter', () => {
        it('should create filtered event stream', () => {
            const predicate = jest.fn().mockReturnValue(true);

            const filtered = eventBus.filter('test.event', predicate);

            expect(filtered.event).toBeDefined();
            expect(filtered.dispose).toBeDefined();
            expect(mockEventEmitter.event).toHaveBeenCalled();
        });

        it('should create emitter if it does not exist', () => {
            const predicate = jest.fn().mockReturnValue(true);

            eventBus.filter('new.event', predicate);

            expect(vscode.EventEmitter).toHaveBeenCalledTimes(2); // Original + filtered emitter
            expect(eventBus.getRegisteredEvents()).toContain('new.event');
        });

        it('should dispose filtered stream correctly', () => {
            const predicate = jest.fn().mockReturnValue(true);

            const filtered = eventBus.filter('test.event', predicate);
            filtered.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });

        it('should log debug information when debug logging is enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            eventBus.setLoggingService(mockLoggingService);

            const predicate = jest.fn().mockReturnValue(true);
            eventBus.filter('debug.event', predicate);

            expect(mockLoggingService.debug).toHaveBeenCalledWith("EventBus: subscribe event 'debug.event'", {
                filter: true
            });
        });
    });

    describe('subscribePattern', () => {
        it('should subscribe to pattern and return disposable', () => {
            const handler = jest.fn();

            const disposable = eventBus.subscribePattern('test.*', handler);

            expect(disposable.dispose).toBeDefined();
        });

        it('should match existing events with pattern', () => {
            // Create some events first
            eventBus.publish('test.event1');
            eventBus.publish('test.event2');
            eventBus.publish('other.event');

            const handler = jest.fn();
            eventBus.subscribePattern('test.*', handler);

            // Should have subscribed to the two test events
            expect(mockEventEmitter.event).toHaveBeenCalledTimes(2);
        });

        it('should handle future events that match pattern', () => {
            const handler = jest.fn();
            eventBus.subscribePattern('test.*', handler);

            // Create new event that matches pattern
            eventBus.subscribe('test.new', jest.fn());

            // Pattern subscription should be applied to new events
            expect(mockEventEmitter.event).toHaveBeenCalled();
        });

        it('should log debug information when debug logging is enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            eventBus.setLoggingService(mockLoggingService);

            const handler = jest.fn();
            eventBus.subscribePattern('debug.*', handler);

            expect(mockLoggingService.debug).toHaveBeenCalledWith("EventBus: Subscribing to pattern 'debug.*'");
        });

        it('should dispose all pattern subscriptions', () => {
            // Create events that match pattern
            eventBus.publish('test.event1');
            eventBus.publish('test.event2');

            const handler = jest.fn();
            const disposable = eventBus.subscribePattern('test.*', handler);

            disposable.dispose();

            // All pattern-related disposables should be disposed
            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });

    describe('pattern matching', () => {
        it('should match exact patterns', () => {
            eventBus.publish('exact.match');

            const handler = jest.fn();
            eventBus.subscribePattern('exact.match', handler);

            expect(mockEventEmitter.event).toHaveBeenCalled();
        });

        it('should match wildcard patterns', () => {
            eventBus.publish('prefix.anything');
            eventBus.publish('prefix.somethingelse');
            eventBus.publish('other.prefix');

            const handler = jest.fn();
            eventBus.subscribePattern('prefix.*', handler);

            // Should match the first two events
            expect(mockEventEmitter.event).toHaveBeenCalledTimes(2);
        });

        it('should handle complex patterns with multiple wildcards', () => {
            eventBus.publish('a.b.c');
            eventBus.publish('a.x.c');
            eventBus.publish('x.b.c');

            const handler = jest.fn();
            eventBus.subscribePattern('a.*.c', handler);

            // Should match the first two events
            expect(mockEventEmitter.event).toHaveBeenCalledTimes(2);
        });

        it('should escape regex special characters correctly', () => {
            eventBus.publish('test.special+chars');
            eventBus.publish('test.special.chars');

            const handler = jest.fn();
            eventBus.subscribePattern('test.special+chars', handler);

            // Should only match exact pattern, not treat + as regex
            expect(mockEventEmitter.event).toHaveBeenCalledTimes(1);
        });
    });

    describe('utility methods', () => {
        it('should return registered event names', () => {
            eventBus.publish('event1');
            eventBus.publish('event2');
            eventBus.subscribe('event3', jest.fn());

            const events = eventBus.getRegisteredEvents();

            expect(events).toContain('event1');
            expect(events).toContain('event2');
            expect(events).toContain('event3');
            expect(events).toHaveLength(3);
        });

        it('should check if event has subscribers', () => {
            expect(eventBus.hasSubscribers('nonexistent')).toBe(false);

            const handler = jest.fn();
            eventBus.subscribe('test.event', handler);

            expect(eventBus.hasSubscribers('test.event')).toBe(true);

            eventBus.unsubscribe('test.event', handler);

            expect(eventBus.hasSubscribers('test.event')).toBe(false);
        });

        it('should handle hasSubscribers for events without subscribers', () => {
            eventBus.publish('event.without.subscribers');

            expect(eventBus.hasSubscribers('event.without.subscribers')).toBe(false);
        });
    });

    describe('dispose', () => {
        it('should dispose all event emitters', () => {
            eventBus.publish('event1');
            eventBus.publish('event2');
            eventBus.subscribe('event3', jest.fn());

            eventBus.dispose();

            expect(mockEventEmitter.dispose).toHaveBeenCalledTimes(3);
        });

        it('should clear all internal state', () => {
            const handler = jest.fn();
            eventBus.subscribe('test.event', handler);
            eventBus.subscribePattern('test.*', jest.fn());

            eventBus.dispose();

            expect(eventBus.getRegisteredEvents()).toHaveLength(0);
            expect(eventBus.hasSubscribers('test.event')).toBe(false);
        });

        it('should dispose all tracked disposables', () => {
            const handler = jest.fn();
            eventBus.subscribe('event1', handler);
            eventBus.subscribe('event2', handler);
            eventBus.once('event3', handler);

            eventBus.dispose();

            // All subscriptions should be disposed
            expect(mockDisposable.dispose).toHaveBeenCalled();
        });

        it('should log debug information when debug logging is enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            eventBus.setLoggingService(mockLoggingService);

            eventBus.publish('event1');
            eventBus.publish('event2');

            eventBus.dispose();

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('EventBus: Disposing 2 event emitters')
            );
        });

        it('should handle multiple dispose calls gracefully', () => {
            eventBus.publish('test.event');

            eventBus.dispose();

            expect(() => eventBus.dispose()).not.toThrow();
        });
    });

    describe('configuration updates', () => {
        it('should update debug logging when configuration changes', () => {
            const mockConfigDisposable = { dispose: jest.fn() };
            let configChangeCallback: (() => void) | undefined;

            mockLoggingService.onDidChangeConfiguration = jest.fn().mockImplementation(callback => {
                configChangeCallback = callback;
                return mockConfigDisposable;
            });

            mockLoggingService.isLevelEnabled.mockReturnValue(false);
            eventBus.setLoggingService(mockLoggingService);

            eventBus.publish('test.event');
            expect(mockLoggingService.debug).not.toHaveBeenCalled();

            // Simulate configuration change to enable debug
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            configChangeCallback!();

            eventBus.publish('test.event2');
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining("EventBus: publish event 'test.event2'")
            );
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle handler exceptions gracefully', () => {
            const throwingHandler = jest.fn().mockImplementation(() => {
                throw new Error('Handler error');
            });

            // Should not throw when subscribing
            expect(() => eventBus.subscribe('test.event', throwingHandler)).not.toThrow();
        });

        it('should handle empty event names', () => {
            expect(() => eventBus.publish('')).not.toThrow();
            expect(() => eventBus.subscribe('', jest.fn())).not.toThrow();
        });

        it('should handle null/undefined data', () => {
            expect(() => eventBus.publish('test.event', null)).not.toThrow();
            expect(() => eventBus.publish('test.event', undefined)).not.toThrow();
        });

        it('should handle very long event names', () => {
            const longEventName = 'a'.repeat(1000);

            expect(() => eventBus.publish(longEventName)).not.toThrow();
            expect(() => eventBus.subscribe(longEventName, jest.fn())).not.toThrow();
        });

        it('should handle special characters in event names', () => {
            const specialEventName = 'event.with-special_chars:and@symbols!';

            expect(() => eventBus.publish(specialEventName)).not.toThrow();
            expect(() => eventBus.subscribe(specialEventName, jest.fn())).not.toThrow();
        });

        it('should handle circular data objects safely', () => {
            const circularData: any = { prop: 'value' };
            circularData.circular = circularData;

            expect(() => eventBus.publish('test.event', circularData)).not.toThrow();
        });
    });
});
