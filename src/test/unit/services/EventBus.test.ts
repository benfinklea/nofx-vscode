import { EventBus } from '../../../services/EventBus';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';
import { ILoggingService } from '../../../services/interfaces';
import { createMockLoggingService } from './../../helpers/mockFactories';

// Mock vscode module
const mockEventEmitter = jest.fn();
const mockDisposable = { dispose: jest.fn() };

jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => {
        const handlers: any[] = [];
        return {
            event: jest.fn((handler: any) => {
                handlers.push(handler);
                return {
                    dispose: jest.fn(() => {
                        const index = handlers.indexOf(handler);
                        if (index > -1) {
                            handlers.splice(index, 1);
                        }
                    })
                };
            }),
            fire: jest.fn((data?: any) => {
                handlers.forEach(handler => handler(data));
            }),
            dispose: jest.fn(),
            _handlers: handlers
        };
    }),
    Disposable: {
        from: jest.fn((...disposables: any[]) => ({
            dispose: jest.fn(() => disposables.forEach(d => d.dispose()))
        }))
    }
}));

describe('EventBus', () => {
    let eventBus: EventBus;
    let mockLoggingService: jest.Mocked<ILoggingService>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock logging service
        mockLoggingService = createMockLoggingService();
        mockLoggingService.isLevelEnabled = jest.fn().mockReturnValue(false);
        mockLoggingService.onDidChangeConfiguration = jest.fn().mockReturnValue({ dispose: jest.fn() });

        eventBus = new EventBus();
    });

    afterEach(() => {
        if (eventBus) {
            eventBus.dispose();
        }
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
            const handler = jest.fn();
            eventBus.subscribe('test.event', handler);

            eventBus.publish('test.event');

            expect(handler).toHaveBeenCalledWith(undefined);
        });

        it('should publish event with data', () => {
            const handler = jest.fn();
            const testData = { key: 'value' };

            eventBus.subscribe('test.event', handler);
            eventBus.publish('test.event', testData);

            expect(handler).toHaveBeenCalledWith(testData);
        });

        it('should create emitter for new events', () => {
            eventBus.publish('new.event');

            expect(eventBus.getRegisteredEvents()).toContain('new.event');
        });

        it('should reuse existing emitter for known events', () => {
            eventBus.publish('test.event');
            const events1 = eventBus.getRegisteredEvents();

            eventBus.publish('test.event');
            const events2 = eventBus.getRegisteredEvents();

            expect(events1).toEqual(events2);
            expect(events1.filter(e => e === 'test.event')).toHaveLength(1);
        });

        it('should log debug information when debug logging is enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            eventBus.setLoggingService(mockLoggingService);

            const testData = { test: 'data' };
            eventBus.publish('debug.event', testData);

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining("EventBus: publish event 'debug.event'"),
                testData
            );
        });
    });

    describe('subscribe', () => {
        it('should subscribe to event and return disposable', () => {
            const handler = jest.fn();

            const disposable = eventBus.subscribe('test.event', handler);

            expect(disposable).toBeDefined();
            expect(disposable.dispose).toBeDefined();
        });

        it('should track multiple subscribers for same event', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            eventBus.subscribe('test.event', handler1);
            eventBus.subscribe('test.event', handler2);
            eventBus.publish('test.event', 'data');

            expect(handler1).toHaveBeenCalledWith('data');
            expect(handler2).toHaveBeenCalledWith('data');
        });

        it('should create emitter if it does not exist', () => {
            const initialEvents = eventBus.getRegisteredEvents();

            eventBus.subscribe('new.event', jest.fn());

            const newEvents = eventBus.getRegisteredEvents();
            expect(newEvents.length).toBe(initialEvents.length + 1);
            expect(newEvents).toContain('new.event');
        });

        it('should log debug information when debug logging is enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            eventBus.setLoggingService(mockLoggingService);

            eventBus.subscribe('debug.event', jest.fn());

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining("EventBus: subscribe event 'debug.event'")
            );
        });

        it('should handle pattern subscriptions for existing events', () => {
            const handler = jest.fn();

            // Create some events first
            eventBus.publish('test.one');
            eventBus.publish('test.two');
            eventBus.publish('other.event');

            // Subscribe to pattern
            eventBus.subscribePattern('test.*', handler);

            // Publish to matching events
            eventBus.publish('test.one', 'data1');
            eventBus.publish('test.two', 'data2');
            eventBus.publish('other.event', 'data3');

            expect(handler).toHaveBeenCalledWith('test.one', 'data1');
            expect(handler).toHaveBeenCalledWith('test.two', 'data2');
            expect(handler).not.toHaveBeenCalledWith('other.event', 'data3');
        });
    });

    describe('unsubscribe', () => {
        it('should unsubscribe handler and dispose', () => {
            const handler = jest.fn();

            const disposable = eventBus.subscribe('test.event', handler);
            eventBus.unsubscribe('test.event', handler);
            eventBus.publish('test.event', 'data');

            expect(handler).not.toHaveBeenCalled();
        });

        it('should handle unsubscribe of non-existent handler', () => {
            const handler = jest.fn();

            expect(() => {
                eventBus.unsubscribe('test.event', handler);
            }).not.toThrow();
        });

        it('should handle unsubscribe of non-existent event', () => {
            const handler = jest.fn();

            expect(() => {
                eventBus.unsubscribe('non.existent', handler);
            }).not.toThrow();
        });

        it('should log debug information when debug logging is enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            eventBus.setLoggingService(mockLoggingService);

            const handler = jest.fn();
            eventBus.subscribe('test.event', handler);
            eventBus.unsubscribe('test.event', handler);

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining("EventBus: unsubscribe event 'test.event'")
            );
        });
    });

    describe('once', () => {
        it('should subscribe to event and trigger only once', () => {
            const handler = jest.fn();

            eventBus.once('test.event', handler);

            eventBus.publish('test.event', 'first');
            eventBus.publish('test.event', 'second');

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith('first');
        });

        it('should return disposable', () => {
            const handler = jest.fn();

            const disposable = eventBus.once('test.event', handler);

            expect(disposable).toBeDefined();
            expect(disposable.dispose).toBeDefined();
        });

        it('should not trigger if disposed before event', () => {
            const handler = jest.fn();

            const disposable = eventBus.once('test.event', handler);
            disposable.dispose();

            eventBus.publish('test.event', 'data');

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('filter', () => {
        it('should filter events based on predicate', () => {
            const handler = jest.fn();
            const predicate = (data: any) => data && data.value > 5;

            const filtered = eventBus.filter('test.event', predicate);
            filtered.event(handler);

            eventBus.publish('test.event', { value: 3 });
            eventBus.publish('test.event', { value: 10 });
            eventBus.publish('test.event', { value: 1 });

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith({ value: 10 });

            filtered.dispose();
        });

        it('should handle disposal correctly', () => {
            const handler = jest.fn();
            const predicate = () => true;

            const filtered = eventBus.filter('test.event', predicate);
            filtered.event(handler);
            filtered.dispose();

            eventBus.publish('test.event', 'data');

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('subscribePattern', () => {
        it('should subscribe to events matching pattern', () => {
            const handler = jest.fn();

            // Create events before pattern subscription
            eventBus.publish('domain.one');
            eventBus.publish('domain.two');
            eventBus.publish('other.event');

            const disposable = eventBus.subscribePattern('domain.*', handler);

            eventBus.publish('domain.one', 'data1');
            eventBus.publish('domain.two', 'data2');
            eventBus.publish('other.event', 'data3');

            expect(handler).toHaveBeenCalledWith('domain.one', 'data1');
            expect(handler).toHaveBeenCalledWith('domain.two', 'data2');
            expect(handler).not.toHaveBeenCalledWith('other.event', 'data3');

            disposable.dispose();
        });

        it('should subscribe to future events matching pattern', () => {
            const handler = jest.fn();

            const disposable = eventBus.subscribePattern('future.*', handler);

            // Create new matching event after pattern subscription
            eventBus.publish('future.event', 'data');

            expect(handler).toHaveBeenCalledWith('future.event', 'data');

            disposable.dispose();
        });

        it('should handle disposal of pattern subscription', () => {
            const handler = jest.fn();

            const disposable = eventBus.subscribePattern('test.*', handler);
            disposable.dispose();

            eventBus.publish('test.event', 'data');

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('hasSubscribers', () => {
        it('should return false for event with no subscribers', () => {
            expect(eventBus.hasSubscribers('test.event')).toBe(false);
        });

        it('should return true for event with subscribers', () => {
            eventBus.subscribe('test.event', jest.fn());

            expect(eventBus.hasSubscribers('test.event')).toBe(true);
        });

        it('should track subscriber count correctly', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            const disposable1 = eventBus.subscribe('test.event', handler1);
            expect(eventBus.hasSubscribers('test.event')).toBe(true);

            const disposable2 = eventBus.subscribe('test.event', handler2);
            expect(eventBus.hasSubscribers('test.event')).toBe(true);

            // Use unsubscribe method to properly update count
            eventBus.unsubscribe('test.event', handler1);
            expect(eventBus.hasSubscribers('test.event')).toBe(true);

            eventBus.unsubscribe('test.event', handler2);
            expect(eventBus.hasSubscribers('test.event')).toBe(false);
        });
    });

    describe('getRegisteredEvents', () => {
        it('should return empty array initially', () => {
            expect(eventBus.getRegisteredEvents()).toEqual([]);
        });

        it('should return array of registered event names', () => {
            eventBus.publish('event1');
            eventBus.publish('event2');
            eventBus.subscribe('event3', jest.fn());

            const events = eventBus.getRegisteredEvents();
            expect(events).toContain('event1');
            expect(events).toContain('event2');
            expect(events).toContain('event3');
            expect(events).toHaveLength(3);
        });

        it('should not duplicate event names', () => {
            eventBus.publish('event1');
            eventBus.publish('event1');
            eventBus.subscribe('event1', jest.fn());

            const events = eventBus.getRegisteredEvents();
            expect(events.filter(e => e === 'event1')).toHaveLength(1);
        });
    });

    describe('dispose', () => {
        it('should dispose all event emitters', () => {
            const handler = jest.fn();

            eventBus.subscribe('test.event', handler);
            eventBus.dispose();

            // After disposal, new instance needed
            const newBus = new EventBus();
            newBus.publish('test.event', 'data');

            expect(handler).not.toHaveBeenCalled();
            newBus.dispose();
        });

        it('should clear all subscriptions', () => {
            eventBus.subscribe('event1', jest.fn());
            eventBus.subscribe('event2', jest.fn());

            eventBus.dispose();

            // After dispose, the eventEmitters map is cleared
            expect(eventBus.getRegisteredEvents()).toEqual([]);
        });

        it('should log debug information when debug logging is enabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(true);
            eventBus.setLoggingService(mockLoggingService);

            eventBus.publish('event1');
            eventBus.publish('event2');
            eventBus.dispose();

            expect(mockLoggingService.debug).toHaveBeenCalledWith(expect.stringContaining('EventBus: Disposing'));
        });
    });
});

describe('EventBus Service Validation', () => {
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
    });

    afterEach(() => {
        if (eventBus) {
            eventBus.dispose();
        }
    });

    it('should be a valid IEventBus implementation', () => {
        // Check all required methods exist
        expect(typeof eventBus.publish).toBe('function');
        expect(typeof eventBus.subscribe).toBe('function');
        expect(typeof eventBus.unsubscribe).toBe('function');
        expect(typeof eventBus.dispose).toBe('function');
    });

    it('should handle concurrent operations correctly', () => {
        const results: any[] = [];

        // Subscribe multiple handlers
        eventBus.subscribe('test', data => results.push(`handler1: ${data}`));
        eventBus.subscribe('test', data => results.push(`handler2: ${data}`));

        // Publish multiple times
        eventBus.publish('test', '1');
        eventBus.publish('test', '2');

        expect(results).toEqual(['handler1: 1', 'handler2: 1', 'handler1: 2', 'handler2: 2']);
    });

    it('should support DOMAIN_EVENTS constants', () => {
        expect(DOMAIN_EVENTS).toBeDefined();
        expect(DOMAIN_EVENTS.AGENT_CREATED).toBeDefined();
        expect(DOMAIN_EVENTS.AGENT_REMOVED).toBeDefined();
        expect(DOMAIN_EVENTS.TASK_CREATED).toBeDefined();
        expect(DOMAIN_EVENTS.TASK_COMPLETED).toBeDefined();
    });
});
