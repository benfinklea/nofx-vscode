/**
 * Comprehensive unit tests for ServiceLocator
 * Achieving 100% meaningful code coverage
 */

import * as vscode from 'vscode';
import { ServiceLocator } from '../../../services/ServiceLocator';

describe('ServiceLocator', () => {
    // Mock VS Code context
    const mockContext = {
        subscriptions: [],
        extensionPath: '/test/path',
        globalState: {},
        workspaceState: {}
    } as unknown as vscode.ExtensionContext;

    beforeEach(() => {
        // Clear ServiceLocator before each test
        ServiceLocator.clear();

        // Reset console methods
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('initialize', () => {
        it('should initialize with VS Code context', () => {
            ServiceLocator.initialize(mockContext);

            expect(console.log).toHaveBeenCalledWith('🚀 ServiceLocator initialized');
        });

        it('should clear existing services on initialization', () => {
            // Register a service
            ServiceLocator.register('TestService', { test: true });
            expect(ServiceLocator.listServices()).toContain('TestService');

            // Initialize should clear it
            ServiceLocator.initialize(mockContext);
            expect(ServiceLocator.listServices()).toHaveLength(0);
        });
    });

    describe('register', () => {
        it('should register a service successfully', () => {
            const service = { name: 'TestService' };
            ServiceLocator.register('TestService', service);

            expect(ServiceLocator.listServices()).toContain('TestService');
            expect(console.log).toHaveBeenCalledWith('✅ Registered service: TestService');
        });

        it('should warn when overriding existing service', () => {
            const service1 = { version: 1 };
            const service2 = { version: 2 };

            ServiceLocator.register('TestService', service1);
            ServiceLocator.register('TestService', service2);

            expect(console.warn).toHaveBeenCalledWith("⚠️  ServiceLocator: Overriding existing service 'TestService'");
            expect(ServiceLocator.get('TestService')).toBe(service2);
        });

        it('should reject invalid service names', () => {
            expect(() => ServiceLocator.register('', {})).toThrow('🛡️ Invalid service name: ');
            expect(() => ServiceLocator.register(null as any, {})).toThrow();
            expect(() => ServiceLocator.register(undefined as any, {})).toThrow();
        });

        it('should accept various valid service names', () => {
            const validNames = [
                'Service',
                'MyService123',
                'service-with-dashes',
                'service_with_underscores',
                'service.with.dots',
                'UPPERCASE_SERVICE'
            ];

            validNames.forEach(name => {
                expect(() => ServiceLocator.register(name, {})).not.toThrow();
            });
        });
    });

    describe('get', () => {
        it('should retrieve registered service', () => {
            const service = { data: 'test' };
            ServiceLocator.register('TestService', service);

            const retrieved = ServiceLocator.get('TestService');
            expect(retrieved).toBe(service);
        });

        it('should throw error for non-existent service', () => {
            ServiceLocator.register('ExistingService', {});

            expect(() => ServiceLocator.get('NonExistent')).toThrow(
                "🚀 Service 'NonExistent' not found. Available: ExistingService"
            );
        });

        it('should handle factory functions', () => {
            let callCount = 0;
            const factory = () => {
                callCount++;
                return { instance: callCount };
            };

            ServiceLocator.register('FactoryService', factory);

            const instance1 = ServiceLocator.get('FactoryService');
            const instance2 = ServiceLocator.get('FactoryService');

            // Factory should only be called once (cached)
            expect(callCount).toBe(1);
            expect(instance1).toBe(instance2);
            expect(instance1).toEqual({ instance: 1 });
        });

        it('should track access counts for performance monitoring', () => {
            ServiceLocator.register('Service1', {});
            ServiceLocator.register('Service2', {});

            ServiceLocator.get('Service1');
            ServiceLocator.get('Service1');
            ServiceLocator.get('Service1');
            ServiceLocator.get('Service2');

            const report = ServiceLocator.getPerformanceReport();
            expect(report).toEqual([
                { service: 'Service1', accessCount: 3 },
                { service: 'Service2', accessCount: 1 }
            ]);
        });

        it('should enforce security for restricted services', () => {
            ServiceLocator.register('ConfigurationService', { config: true });

            // Authorized requestor should succeed
            expect(() => ServiceLocator.get('ConfigurationService', 'AgentManager')).not.toThrow();

            // Unauthorized requestor should fail
            expect(() => ServiceLocator.get('ConfigurationService', 'UnknownService')).toThrow(
                '🛡️ Unauthorized access to restricted service: ConfigurationService'
            );
        });

        it('should allow unrestricted access to non-restricted services', () => {
            ServiceLocator.register('PublicService', { public: true });

            expect(() => ServiceLocator.get('PublicService', 'AnyRequestor')).not.toThrow();
            expect(() => ServiceLocator.get('PublicService')).not.toThrow();
        });
    });

    describe('tryGet', () => {
        it('should return service if exists', () => {
            const service = { test: true };
            ServiceLocator.register('TestService', service);

            expect(ServiceLocator.tryGet('TestService')).toBe(service);
        });

        it('should return undefined if service does not exist', () => {
            expect(ServiceLocator.tryGet('NonExistent')).toBeUndefined();
        });

        it('should handle factory functions', () => {
            const factory = () => ({ created: true });
            ServiceLocator.register('FactoryService', factory);

            const instance = ServiceLocator.tryGet('FactoryService');
            expect(instance).toEqual({ created: true });

            // Should cache the result
            const instance2 = ServiceLocator.tryGet('FactoryService');
            expect(instance2).toBe(instance);
        });

        it('should not track access counts for non-existent services', () => {
            ServiceLocator.tryGet('NonExistent');

            const report = ServiceLocator.getPerformanceReport();
            expect(report).toHaveLength(0);
        });
    });

    describe('listServices', () => {
        it('should return empty array when no services registered', () => {
            expect(ServiceLocator.listServices()).toEqual([]);
        });

        it('should return sorted list of service names', () => {
            ServiceLocator.register('Zebra', {});
            ServiceLocator.register('Alpha', {});
            ServiceLocator.register('Beta', {});

            expect(ServiceLocator.listServices()).toEqual(['Alpha', 'Beta', 'Zebra']);
        });
    });

    describe('getPerformanceReport', () => {
        it('should return empty array when no services accessed', () => {
            ServiceLocator.register('Service1', {});
            expect(ServiceLocator.getPerformanceReport()).toEqual([]);
        });

        it('should sort by access count descending', () => {
            ServiceLocator.register('LowUse', {});
            ServiceLocator.register('HighUse', {});
            ServiceLocator.register('MediumUse', {});

            // Access services different number of times
            for (let i = 0; i < 10; i++) ServiceLocator.get('HighUse');
            for (let i = 0; i < 5; i++) ServiceLocator.get('MediumUse');
            ServiceLocator.get('LowUse');

            const report = ServiceLocator.getPerformanceReport();
            expect(report).toEqual([
                { service: 'HighUse', accessCount: 10 },
                { service: 'MediumUse', accessCount: 5 },
                { service: 'LowUse', accessCount: 1 }
            ]);
        });
    });

    describe('clear', () => {
        it('should remove all services', () => {
            ServiceLocator.register('Service1', {});
            ServiceLocator.register('Service2', {});

            ServiceLocator.clear();

            expect(ServiceLocator.listServices()).toHaveLength(0);
            expect(console.log).toHaveBeenCalledWith('🧹 ServiceLocator cleared');
        });

        it('should clear access counts', () => {
            ServiceLocator.register('Service1', {});
            ServiceLocator.get('Service1');

            expect(ServiceLocator.getPerformanceReport()).toHaveLength(1);

            ServiceLocator.clear();

            expect(ServiceLocator.getPerformanceReport()).toHaveLength(0);
        });
    });

    describe('Security validations', () => {
        it('should validate service names correctly', () => {
            // Valid names
            expect(() => ServiceLocator.register('ValidName', {})).not.toThrow();
            expect(() => ServiceLocator.register('123', {})).not.toThrow();
            expect(() => ServiceLocator.register('a', {})).not.toThrow();

            // Invalid names
            expect(() => ServiceLocator.register('', {})).toThrow('🛡️ Invalid service name');
            expect(() => ServiceLocator.register(123 as any, {})).toThrow();
            expect(() => ServiceLocator.register({} as any, {})).toThrow();
        });

        it('should identify restricted services correctly', () => {
            const restrictedServices = ['ConfigurationService', 'PersistenceService'];
            const publicServices = ['LoggingService', 'NotificationService', 'AnyOtherService'];

            restrictedServices.forEach(name => {
                ServiceLocator.register(name, {});
                expect(() => ServiceLocator.get(name, 'UnauthorizedService')).toThrow(
                    `🛡️ Unauthorized access to restricted service: ${name}`
                );
            });

            publicServices.forEach(name => {
                ServiceLocator.register(name, {});
                expect(() => ServiceLocator.get(name, 'UnauthorizedService')).not.toThrow();
            });
        });

        it('should allow authorized requestors for restricted services', () => {
            const authorizedRequestors = ['AgentManager', 'ConductorCommands', 'extension.ts'];

            ServiceLocator.register('ConfigurationService', { secure: true });

            authorizedRequestors.forEach(requestor => {
                expect(() => ServiceLocator.get('ConfigurationService', requestor)).not.toThrow();
            });
        });

        it('should allow access when no requestor specified', () => {
            ServiceLocator.register('ConfigurationService', { secure: true });

            // No requestor means it's a system call (allowed)
            expect(() => ServiceLocator.get('ConfigurationService')).not.toThrow();
        });
    });

    describe('Edge cases', () => {
        it('should handle registering undefined or null values', () => {
            // Note: null and undefined are falsy, so get() will throw
            // This is actually a limitation of the current implementation
            ServiceLocator.register('NullService', null);
            ServiceLocator.register('UndefinedService', undefined);

            // These should throw because null/undefined are falsy
            expect(() => ServiceLocator.get('NullService')).toThrow("🚀 Service 'NullService' not found");
            expect(() => ServiceLocator.get('UndefinedService')).toThrow("🚀 Service 'UndefinedService' not found");

            // But tryGet should handle them
            expect(ServiceLocator.tryGet('NullService')).toBeUndefined();
            expect(ServiceLocator.tryGet('UndefinedService')).toBeUndefined();
        });

        it('should handle complex service objects', () => {
            const complexService = {
                nested: {
                    deep: {
                        value: 'test'
                    }
                },
                array: [1, 2, 3],
                map: new Map([['key', 'value']]),
                set: new Set([1, 2, 3]),
                date: new Date('2024-01-01'),
                regex: /test/g,
                func: () => 'result'
            };

            ServiceLocator.register('ComplexService', complexService);
            const retrieved = ServiceLocator.get<typeof complexService>('ComplexService');

            expect(retrieved).toBe(complexService);
            expect(retrieved.nested.deep.value).toBe('test');
            expect(retrieved.func()).toBe('result');
        });

        it('should handle circular references in services', () => {
            const service: any = { name: 'Circular' };
            service.self = service; // Circular reference

            ServiceLocator.register('CircularService', service);
            const retrieved = ServiceLocator.get<any>('CircularService');

            expect(retrieved).toBe(service);
            expect(retrieved.self).toBe(retrieved);
        });

        it('should handle factory functions that throw errors', () => {
            const errorFactory = () => {
                throw new Error('Factory error');
            };

            ServiceLocator.register('ErrorFactory', errorFactory);

            expect(() => ServiceLocator.get('ErrorFactory')).toThrow('Factory error');

            // tryGet should also handle the error
            expect(() => ServiceLocator.tryGet('ErrorFactory')).toThrow('Factory error');
        });

        it('should handle registering the same service multiple times rapidly', () => {
            const services = Array.from({ length: 100 }, (_, i) => ({ version: i }));

            services.forEach(service => {
                ServiceLocator.register('RapidService', service);
            });

            const final = ServiceLocator.get('RapidService');
            expect(final).toBe(services[99]);
        });

        it('should handle concurrent access to services', () => {
            ServiceLocator.register('ConcurrentService', { concurrent: true });

            const promises = Array.from({ length: 100 }, () =>
                Promise.resolve(ServiceLocator.get('ConcurrentService'))
            );

            return Promise.all(promises).then(results => {
                expect(results.every((r: any) => r.concurrent === true)).toBe(true);

                const report = ServiceLocator.getPerformanceReport();
                expect(report[0].accessCount).toBe(100);
            });
        });
    });
});
