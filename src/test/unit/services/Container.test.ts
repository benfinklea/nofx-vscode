import { Container } from '../../../services/Container';
import {
    ServiceLifetime,
    ServiceNotFoundError,
    CircularDependencyError,
    ILoggingService,
    IContainer
} from '../../../services/interfaces';

describe('Container', () => {
    let container: Container;
    let mockLoggingService: jest.Mocked<ILoggingService>;

    beforeEach(() => {
        // Reset singleton instance
        Container['instance'] = null;

        // Create mock logging service
        mockLoggingService = {
            isLevelEnabled: jest.fn().mockReturnValue(true),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            verbose: jest.fn(),
            setLevel: jest.fn(),
            addChannel: jest.fn(),
            removeChannel: jest.fn(),
            getMetrics: jest.fn(),
            dispose: jest.fn()
        } as any;

        container = new Container(mockLoggingService);
    });

    afterEach(() => {
        container.dispose();
        Container['instance'] = null;
    });

    describe('Singleton Pattern', () => {
        it('should return the same instance', () => {
            const instance1 = Container.getInstance();
            const instance2 = Container.getInstance();
            expect(instance1).toBe(instance2);
        });

        it('should create new instance after reset', () => {
            const instance1 = Container.getInstance();
            instance1.reset();
            const instance2 = Container.getInstance();
            expect(instance1).not.toBe(instance2);
        });
    });

    describe('Service Registration', () => {
        it('should register a service with singleton lifetime', () => {
            const token = Symbol('TestService');
            const factory = jest.fn(() => ({ test: 'value' }));

            container.register(token, factory, 'singleton');

            expect(mockLoggingService.debug).toHaveBeenCalledWith(expect.stringContaining('Service registered'));
        });

        it('should register a service with transient lifetime', () => {
            const token = Symbol('TestService');
            const factory = jest.fn(() => ({ test: 'value' }));

            container.register(token, factory, 'transient');

            expect(mockLoggingService.debug).toHaveBeenCalledWith(expect.stringContaining('Service registered'));
        });

        it('should register a service with default singleton lifetime', () => {
            const token = Symbol('TestService');
            const factory = jest.fn(() => ({ test: 'value' }));

            container.register(token, factory);

            expect(mockLoggingService.debug).toHaveBeenCalledWith(expect.stringContaining('Service registered'));
        });

        it('should handle registration without logging service', () => {
            const containerNoLog = new Container();
            const token = Symbol('TestService');
            const factory = jest.fn(() => ({ test: 'value' }));

            expect(() => {
                containerNoLog.register(token, factory);
            }).not.toThrow();

            containerNoLog.dispose();
        });
    });

    describe('Service Resolution', () => {
        it('should resolve singleton service and cache instance', () => {
            const token = Symbol('SingletonService');
            const factory = jest.fn(() => ({ id: Math.random() }));

            container.register(token, factory, 'singleton');

            const instance1 = container.resolve(token);
            const instance2 = container.resolve(token);

            expect(factory).toHaveBeenCalledTimes(1);
            expect(instance1).toBe(instance2);
        });

        it('should resolve transient service with new instance each time', () => {
            const token = Symbol('TransientService');
            const factory = jest.fn(() => ({ id: Math.random() }));

            container.register(token, factory, 'transient');

            const instance1 = container.resolve(token);
            const instance2 = container.resolve(token);

            expect(factory).toHaveBeenCalledTimes(2);
            expect(instance1).not.toBe(instance2);
        });

        it('should resolve service with dependencies', () => {
            const token = Symbol('ServiceWithDeps');
            const depToken = Symbol('Dependency');

            container.register(depToken, () => ({ dep: 'value' }));
            container.register(token, c => ({
                service: 'main',
                dependency: c.resolve(depToken)
            }));

            const instance = container.resolve(token) as any;

            expect(instance).toBeDefined();
            expect(instance.service).toBe('main');
            expect(instance.dependency.dep).toBe('value');
        });

        it('should throw ServiceNotFoundError for unregistered service', () => {
            const token = Symbol('UnregisteredService');

            expect(() => container.resolve(token)).toThrow(ServiceNotFoundError);
        });

        it('should detect circular dependencies', () => {
            const tokenA = Symbol('ServiceA');
            const tokenB = Symbol('ServiceB');

            container.register(tokenA, c => {
                c.resolve(tokenB);
                return { name: 'A' };
            });

            container.register(tokenB, c => {
                c.resolve(tokenA);
                return { name: 'B' };
            });

            expect(() => container.resolve(tokenA)).toThrow(CircularDependencyError);
        });

        it('should handle nested dependencies', () => {
            const tokenA = Symbol('ServiceA');
            const tokenB = Symbol('ServiceB');
            const tokenC = Symbol('ServiceC');

            container.register(tokenC, () => ({ name: 'C' }));
            container.register(tokenB, c => ({
                name: 'B',
                dep: c.resolve(tokenC)
            }));
            container.register(tokenA, c => ({
                name: 'A',
                dep: c.resolve(tokenB)
            }));

            const instance = container.resolve(tokenA) as any;

            expect(instance.name).toBe('A');
            expect(instance.dep.name).toBe('B');
            expect(instance.dep.dep.name).toBe('C');
        });
    });

    describe('Service Checking', () => {
        it('should return true for registered service', () => {
            const token = Symbol('RegisteredService');
            container.register(token, () => ({}));

            expect(container.has(token)).toBe(true);
        });

        it('should return false for unregistered service', () => {
            const token = Symbol('UnregisteredService');

            expect(container.has(token)).toBe(false);
        });
    });

    describe('Disposal', () => {
        it('should dispose singleton instances', () => {
            const token = Symbol('DisposableService');
            const mockDispose = jest.fn();
            const factory = jest.fn(() => ({
                dispose: mockDispose
            }));

            container.register(token, factory, 'singleton');
            const instance = container.resolve(token);

            container.dispose();

            expect(mockDispose).toHaveBeenCalled();
        });

        it('should handle non-disposable services', () => {
            const token = Symbol('NonDisposableService');
            const factory = jest.fn(() => ({ value: 'test' }));

            container.register(token, factory, 'singleton');
            container.resolve(token);

            expect(() => container.dispose()).not.toThrow();
        });

        it('should clear all registrations on dispose', () => {
            const token = Symbol('TestService');
            container.register(token, () => ({}));

            container.dispose();

            expect(container.has(token)).toBe(false);
        });

        it('should log disposal with logging service', () => {
            const token = Symbol('DisposableService');
            container.register(token, () => ({ dispose: jest.fn() }), 'singleton');
            container.resolve(token);

            container.dispose();

            expect(mockLoggingService.debug).toHaveBeenCalledWith(expect.stringContaining('Service disposed'));
        });
    });

    describe('Logging', () => {
        it('should set logging service', () => {
            const newLoggingService = {
                isLevelEnabled: jest.fn().mockReturnValue(false),
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn()
            } as any;

            container.setLoggingService(newLoggingService);

            const token = Symbol('TestService');
            container.register(token, () => ({}));

            // Should use new logging service
            expect(newLoggingService.isLevelEnabled).toHaveBeenCalled();
        });

        it('should handle operations without logging when disabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(false);

            const token = Symbol('TestService');
            container.register(token, () => ({}));

            expect(mockLoggingService.debug).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle factory throwing error', () => {
            const token = Symbol('ErrorService');
            const factory = jest.fn(() => {
                throw new Error('Factory error');
            });

            container.register(token, factory);

            expect(() => container.resolve(token)).toThrow('Factory error');
        });

        it('should clear resolution stack after error', () => {
            const tokenA = Symbol('ServiceA');
            const tokenB = Symbol('ServiceB');

            container.register(tokenA, () => {
                throw new Error('Service error');
            });

            expect(() => container.resolve(tokenA)).toThrow();

            // Should be able to resolve other services after error
            container.register(tokenB, () => ({ name: 'B' }));
            expect(() => container.resolve(tokenB)).not.toThrow();
        });
    });

    describe('Edge Cases', () => {
        it('should handle re-registration of service', () => {
            const token = Symbol('Service');
            const factory1 = jest.fn(() => ({ version: 1 }));
            const factory2 = jest.fn(() => ({ version: 2 }));

            container.register(token, factory1);
            const instance1 = container.resolve(token) as any;
            expect(instance1.version).toBe(1);

            // Re-register with new factory
            container.register(token, factory2);
            const instance2 = container.resolve(token);

            // Singleton should still return cached instance
            expect((instance2 as any).version).toBe(1);
        });

        it('should handle default lifetime as singleton', () => {
            const token = Symbol('DefaultLifetime');
            const factory = jest.fn(() => ({ test: 'value' }));

            // Register without specifying lifetime
            container.register(token, factory);

            const instance1 = container.resolve(token);
            const instance2 = container.resolve(token);

            expect(factory).toHaveBeenCalledTimes(1);
            expect(instance1).toBe(instance2);
        });
    });

    describe('RegisterInstance', () => {
        it('should register pre-existing instance', () => {
            const token = Symbol('PreExisting');
            const instance = { predefined: 'value', id: 123 };

            container.registerInstance(token, instance);

            const resolved = container.resolve(token);
            expect(resolved).toBe(instance);
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Service instance registered')
            );
        });

        it('should always return same instance for registerInstance', () => {
            const token = Symbol('InstanceService');
            const instance = { shared: 'data' };

            container.registerInstance(token, instance);

            const resolved1 = container.resolve(token);
            const resolved2 = container.resolve(token);

            expect(resolved1).toBe(instance);
            expect(resolved2).toBe(instance);
            expect(resolved1).toBe(resolved2);
        });

        it('should handle registerInstance without logging service', () => {
            const containerNoLog = new Container();
            const token = Symbol('NoLogInstance');
            const instance = { test: 'value' };

            expect(() => {
                containerNoLog.registerInstance(token, instance);
            }).not.toThrow();

            const resolved = containerNoLog.resolve(token);
            expect(resolved).toBe(instance);

            containerNoLog.dispose();
        });
    });

    describe('ResolveOptional', () => {
        it('should return undefined for unregistered service', () => {
            const token = Symbol('OptionalUnregistered');

            const result = container.resolveOptional(token);

            expect(result).toBeUndefined();
        });

        it('should return instance for registered service', () => {
            const token = Symbol('OptionalRegistered');
            const factory = jest.fn(() => ({ optional: true }));

            container.register(token, factory);

            const result = container.resolveOptional(token);

            expect(result).toBeDefined();
            expect((result as any).optional).toBe(true);
        });

        it('should rethrow non-ServiceNotFoundError exceptions', () => {
            const token = Symbol('ErrorService');
            const factory = jest.fn(() => {
                throw new Error('Factory error');
            });

            container.register(token, factory);

            expect(() => container.resolveOptional(token)).toThrow('Factory error');
        });
    });

    describe('CreateScope', () => {
        it('should throw not implemented error', () => {
            expect(() => container.createScope()).toThrow('Not implemented');
        });
    });

    describe('Async Disposal', () => {
        it('should dispose async disposable services', async () => {
            const token = Symbol('AsyncDisposable');
            const mockDisposeAsync = jest.fn().mockResolvedValue(undefined);
            const factory = jest.fn(() => ({
                disposeAsync: mockDisposeAsync
            }));

            container.register(token, factory, 'singleton');
            container.resolve(token);

            await container.dispose();

            expect(mockDisposeAsync).toHaveBeenCalled();
            expect(mockLoggingService.debug).toHaveBeenCalledWith(expect.stringContaining('Service disposed async'));
        });

        it('should handle async dispose method returning promise', async () => {
            const token = Symbol('AsyncDisposePromise');
            const mockDispose = jest.fn().mockResolvedValue(undefined);
            const factory = jest.fn(() => ({
                dispose: mockDispose
            }));

            container.register(token, factory, 'singleton');
            container.resolve(token);

            await container.dispose();

            expect(mockDispose).toHaveBeenCalled();
        });

        it('should handle disposal errors gracefully', async () => {
            const token = Symbol('DisposalError');
            const error = new Error('Disposal failed');
            const mockDispose = jest.fn().mockRejectedValue(error);
            const factory = jest.fn(() => ({
                dispose: mockDispose
            }));

            container.register(token, factory, 'singleton');
            container.resolve(token);

            await container.dispose();

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Error disposing service'),
                error
            );
        });

        it('should handle non-Error disposal failures', async () => {
            const token = Symbol('NonErrorDisposal');
            const mockDispose = jest.fn().mockRejectedValue('string error');
            const factory = jest.fn(() => ({
                dispose: mockDispose
            }));

            container.register(token, factory, 'singleton');
            container.resolve(token);

            await container.dispose();

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('Error disposing service'),
                expect.any(Error)
            );
        });

        it('should log disposal start and completion', async () => {
            const token = Symbol('LoggedDisposal');
            container.register(token, () => ({ value: 'test' }), 'singleton');
            container.resolve(token);

            await container.dispose();

            expect(mockLoggingService.debug).toHaveBeenCalledWith(expect.stringContaining('Disposing container with'));
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Container disposal completed');
        });

        it('should handle multiple disposable services', async () => {
            const token1 = Symbol('Disposable1');
            const token2 = Symbol('Disposable2');
            const token3 = Symbol('NonDisposable');

            const mockDispose1 = jest.fn();
            const mockDispose2 = jest.fn().mockResolvedValue(undefined);

            container.register(token1, () => ({ dispose: mockDispose1 }), 'singleton');
            container.register(token2, () => ({ disposeAsync: mockDispose2 }), 'singleton');
            container.register(token3, () => ({ value: 'test' }), 'singleton');

            container.resolve(token1);
            container.resolve(token2);
            container.resolve(token3);

            await container.dispose();

            expect(mockDispose1).toHaveBeenCalled();
            expect(mockDispose2).toHaveBeenCalled();
        });

        it('should handle disposal without logging service', async () => {
            const containerNoLog = new Container();
            const token = Symbol('DisposableNoLog');
            const mockDispose = jest.fn();

            containerNoLog.register(token, () => ({ dispose: mockDispose }), 'singleton');
            containerNoLog.resolve(token);

            await expect(containerNoLog.dispose()).resolves.not.toThrow();
            expect(mockDispose).toHaveBeenCalled();
        });
    });

    describe('Logging Levels', () => {
        it('should not log when debug level is disabled', () => {
            mockLoggingService.isLevelEnabled.mockReturnValue(false);

            const token = Symbol('NoDebugLog');
            container.register(token, () => ({}));
            container.resolve(token);

            // isLevelEnabled should be called but debug should not
            expect(mockLoggingService.isLevelEnabled).toHaveBeenCalled();
            expect(mockLoggingService.debug).not.toHaveBeenCalled();
        });
    });

    describe('Complex Dependency Graphs', () => {
        it('should handle diamond dependency pattern', () => {
            const tokenA = Symbol('A');
            const tokenB = Symbol('B');
            const tokenC = Symbol('C');
            const tokenD = Symbol('D');

            container.register(tokenD, () => ({ name: 'D' }));
            container.register(tokenB, c => ({ name: 'B', dep: c.resolve(tokenD) }));
            container.register(tokenC, c => ({ name: 'C', dep: c.resolve(tokenD) }));
            container.register(tokenA, c => ({
                name: 'A',
                depB: c.resolve(tokenB),
                depC: c.resolve(tokenC)
            }));

            const instance = container.resolve(tokenA) as any;

            expect(instance.name).toBe('A');
            expect(instance.depB.name).toBe('B');
            expect(instance.depC.name).toBe('C');
            expect(instance.depB.dep).toBe(instance.depC.dep); // Same D instance
        });

        it('should handle transient services in dependency chain', () => {
            const tokenSingleton = Symbol('Singleton');
            const tokenTransient = Symbol('Transient');
            const tokenRoot = Symbol('Root');

            let counter = 0;
            container.register(tokenTransient, () => ({ id: ++counter }), 'transient');
            container.register(
                tokenSingleton,
                c => ({
                    transient1: c.resolve(tokenTransient),
                    transient2: c.resolve(tokenTransient)
                }),
                'singleton'
            );
            container.register(tokenRoot, c => ({
                singleton: c.resolve(tokenSingleton)
            }));

            const instance = container.resolve(tokenRoot) as any;

            expect(instance.singleton.transient1.id).toBe(1);
            expect(instance.singleton.transient2.id).toBe(2);
        });
    });

    describe('Reset Functionality', () => {
        it('should clear singleton cache on reset', () => {
            const instance = Container.getInstance();
            const token = Symbol('ResetTest');

            instance.register(token, () => ({ test: 'value' }));
            instance.resolve(token);

            instance.reset();

            // After reset, getInstance should return new instance
            const newInstance = Container.getInstance();
            expect(newInstance).not.toBe(instance);
            expect(newInstance.has(token)).toBe(false);
        });

        it('should dispose all services on reset', () => {
            const instance = Container.getInstance();
            const token = Symbol('ResetDispose');
            const mockDispose = jest.fn();

            instance.register(token, () => ({ dispose: mockDispose }), 'singleton');
            instance.resolve(token);

            instance.reset();

            // reset() calls dispose() synchronously
            expect(mockDispose).toHaveBeenCalled();
        });
    });
});
