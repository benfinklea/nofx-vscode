/**
 * Comprehensive unit tests for AtomicOperations
 * Tests atomic counters, references, concurrent collections, and concurrency utilities
 */

import {
    SimpleAtomicCounter,
    SimpleAtomicReference,
    AsyncLock,
    ConcurrentMap,
    ConcurrentSet,
    ConcurrencyUtils
} from '../../../services/AtomicOperations';

describe('SimpleAtomicCounter', () => {
    let counter: SimpleAtomicCounter;

    beforeEach(() => {
        counter = new SimpleAtomicCounter();
    });

    describe('Basic Operations', () => {
        it('should initialize with default value 0', () => {
            expect(counter.get()).toBe(0);
        });

        it('should initialize with custom value', () => {
            const customCounter = new SimpleAtomicCounter(10);
            expect(customCounter.get()).toBe(10);
        });

        it('should increment and return new value', () => {
            expect(counter.increment()).toBe(1);
            expect(counter.get()).toBe(1);

            expect(counter.increment()).toBe(2);
            expect(counter.get()).toBe(2);
        });

        it('should decrement and return new value', () => {
            counter.set(5);

            expect(counter.decrement()).toBe(4);
            expect(counter.get()).toBe(4);

            expect(counter.decrement()).toBe(3);
            expect(counter.get()).toBe(3);
        });

        it('should set value', () => {
            counter.set(42);
            expect(counter.get()).toBe(42);
        });
    });

    describe('Compare and Set Operations', () => {
        it('should successfully compare and set when value matches', () => {
            counter.set(10);

            const result = counter.compareAndSet(10, 20);

            expect(result).toBe(true);
            expect(counter.get()).toBe(20);
        });

        it('should fail compare and set when value does not match', () => {
            counter.set(10);

            const result = counter.compareAndSet(5, 20);

            expect(result).toBe(false);
            expect(counter.get()).toBe(10); // Value should remain unchanged
        });

        it('should handle multiple compare and set operations', () => {
            counter.set(0);

            expect(counter.compareAndSet(0, 1)).toBe(true);
            expect(counter.compareAndSet(0, 2)).toBe(false); // Should fail, value is now 1
            expect(counter.compareAndSet(1, 2)).toBe(true);

            expect(counter.get()).toBe(2);
        });
    });

    describe('Concurrent Operations', () => {
        it('should handle rapid increment operations', () => {
            const operations = [];

            // Queue multiple increment operations
            for (let i = 0; i < 100; i++) {
                operations.push(() => counter.increment());
            }

            // Execute all operations
            operations.forEach(op => op());

            expect(counter.get()).toBe(100);
        });

        it('should handle mixed operations', () => {
            counter.set(50);

            // Mix of increments, decrements, and sets
            counter.increment(); // 51
            counter.decrement(); // 50
            counter.set(25); // 25
            counter.increment(); // 26
            counter.increment(); // 27

            expect(counter.get()).toBe(27);
        });
    });
});

describe('SimpleAtomicReference', () => {
    let reference: SimpleAtomicReference<string>;

    beforeEach(() => {
        reference = new SimpleAtomicReference('initial');
    });

    describe('Basic Operations', () => {
        it('should initialize with provided value', () => {
            expect(reference.get()).toBe('initial');
        });

        it('should set and get values', () => {
            reference.set('new value');
            expect(reference.get()).toBe('new value');
        });

        it('should work with different types', () => {
            const numberRef = new SimpleAtomicReference(42);
            expect(numberRef.get()).toBe(42);

            const objectRef = new SimpleAtomicReference({ key: 'value' });
            expect(objectRef.get()).toEqual({ key: 'value' });

            const arrayRef = new SimpleAtomicReference([1, 2, 3]);
            expect(arrayRef.get()).toEqual([1, 2, 3]);
        });
    });

    describe('Compare and Set Operations', () => {
        it('should successfully compare and set when value matches', () => {
            const result = reference.compareAndSet('initial', 'updated');

            expect(result).toBe(true);
            expect(reference.get()).toBe('updated');
        });

        it('should fail compare and set when value does not match', () => {
            const result = reference.compareAndSet('wrong', 'updated');

            expect(result).toBe(false);
            expect(reference.get()).toBe('initial');
        });

        it('should handle object references correctly', () => {
            const obj1 = { id: 1 };
            const obj2 = { id: 2 };
            const obj3 = { id: 3 };

            const objRef = new SimpleAtomicReference(obj1);

            expect(objRef.compareAndSet(obj1, obj2)).toBe(true);
            expect(objRef.get()).toBe(obj2);

            expect(objRef.compareAndSet(obj1, obj3)).toBe(false); // obj1 is no longer the value
            expect(objRef.get()).toBe(obj2);
        });
    });

    describe('Get and Set Operations', () => {
        it('should return old value and set new value', () => {
            const oldValue = reference.getAndSet('new value');

            expect(oldValue).toBe('initial');
            expect(reference.get()).toBe('new value');
        });

        it('should handle multiple getAndSet operations', () => {
            const result1 = reference.getAndSet('first');
            expect(result1).toBe('initial');

            const result2 = reference.getAndSet('second');
            expect(result2).toBe('first');

            const result3 = reference.getAndSet('third');
            expect(result2).toBe('first');
            expect(result3).toBe('second');
            expect(reference.get()).toBe('third');
        });
    });
});

describe('AsyncLock', () => {
    let lock: AsyncLock;

    beforeEach(() => {
        lock = new AsyncLock();
    });

    describe('Synchronous Operations', () => {
        it('should execute synchronous function with lock', () => {
            let counter = 0;

            const result = lock.synchronize(() => {
                counter++;
                return counter;
            });

            expect(result).toBe(1);
            expect(counter).toBe(1);
        });

        it('should handle exceptions in synchronous operations', () => {
            expect(() => {
                lock.synchronize(() => {
                    throw new Error('Test error');
                });
            }).toThrow('Test error');
        });

        it('should serialize multiple synchronous operations', () => {
            const results: number[] = [];
            let counter = 0;

            // These should execute in order
            lock.synchronize(() => {
                counter++;
                results.push(counter);
            });

            lock.synchronize(() => {
                counter++;
                results.push(counter);
            });

            expect(results).toEqual([1, 2]);
        });
    });

    describe('Asynchronous Operations', () => {
        it('should execute async function with lock', async () => {
            let counter = 0;

            const result = await lock.execute(async () => {
                counter++;
                return counter;
            });

            expect(result).toBe(1);
            expect(counter).toBe(1);
        });

        it('should handle async exceptions', async () => {
            await expect(
                lock.execute(async () => {
                    throw new Error('Async test error');
                })
            ).rejects.toThrow('Async test error');
        });

        it('should serialize multiple async operations', async () => {
            const results: number[] = [];
            let counter = 0;

            const operations = [
                lock.execute(async () => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    counter++;
                    results.push(counter);
                }),
                lock.execute(async () => {
                    counter++;
                    results.push(counter);
                }),
                lock.execute(async () => {
                    await new Promise(resolve => setTimeout(resolve, 5));
                    counter++;
                    results.push(counter);
                })
            ];

            await Promise.all(operations);

            expect(results).toEqual([1, 2, 3]);
        });
    });

    describe('Mixed Sync and Async Operations', () => {
        it('should handle mixed sync and async operations', async () => {
            const results: string[] = [];

            // Start async operation
            const asyncPromise = lock.execute(async () => {
                await new Promise(resolve => setTimeout(resolve, 20));
                results.push('async');
            });

            // Try sync operation (should wait)
            setTimeout(() => {
                lock.synchronize(() => {
                    results.push('sync');
                });
            }, 10);

            await asyncPromise;
            await new Promise(resolve => setTimeout(resolve, 30));

            expect(results).toEqual(['async', 'sync']);
        });
    });

    describe('Error Handling', () => {
        it('should handle sync lock timeout', () => {
            const lock1 = new AsyncLock();

            // Acquire lock with sync operation
            lock1.synchronize(() => {
                // Try to acquire again synchronously (should fail after attempts)
                expect(() => {
                    lock1.synchronize(() => {
                        return 'should not reach here';
                    });
                }).toThrow('Failed to acquire synchronous lock');

                return 'first operation';
            });
        });
    });
});

describe('ConcurrentMap', () => {
    let map: ConcurrentMap<string, number>;

    beforeEach(() => {
        map = new ConcurrentMap();
    });

    describe('Basic Operations', () => {
        it('should set and get values', () => {
            map.set('key1', 100);
            expect(map.get('key1')).toBe(100);
        });

        it('should return undefined for non-existent keys', () => {
            expect(map.get('nonexistent')).toBeUndefined();
        });

        it('should check if key exists', () => {
            map.set('key1', 100);
            expect(map.has('key1')).toBe(true);
            expect(map.has('key2')).toBe(false);
        });

        it('should delete keys', () => {
            map.set('key1', 100);
            expect(map.delete('key1')).toBe(true);
            expect(map.has('key1')).toBe(false);
            expect(map.delete('key1')).toBe(false); // Should return false for non-existent key
        });

        it('should clear all entries', () => {
            map.set('key1', 100);
            map.set('key2', 200);
            expect(map.size()).toBe(2);

            map.clear();
            expect(map.size()).toBe(0);
            expect(map.has('key1')).toBe(false);
        });

        it('should return correct size', () => {
            expect(map.size()).toBe(0);

            map.set('key1', 100);
            expect(map.size()).toBe(1);

            map.set('key2', 200);
            expect(map.size()).toBe(2);

            map.delete('key1');
            expect(map.size()).toBe(1);
        });
    });

    describe('Collection Operations', () => {
        beforeEach(() => {
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
        });

        it('should return keys array', () => {
            const keys = map.keys();
            expect(keys.sort()).toEqual(['a', 'b', 'c']);
        });

        it('should return values array', () => {
            const values = map.values();
            expect(values.sort()).toEqual([1, 2, 3]);
        });

        it('should return entries array', () => {
            const entries = map.entries().sort();
            expect(entries).toEqual([
                ['a', 1],
                ['b', 2],
                ['c', 3]
            ]);
        });

        it('should convert to regular map', () => {
            const regularMap = map.toMap();

            expect(regularMap).toBeInstanceOf(Map);
            expect(regularMap.get('a')).toBe(1);
            expect(regularMap.get('b')).toBe(2);
            expect(regularMap.get('c')).toBe(3);
            expect(regularMap.size).toBe(3);
        });
    });

    describe('Atomic Operations', () => {
        it('should perform getOrCreate operation', () => {
            const factory = jest.fn(() => 42);

            // First call should create
            const result1 = map.getOrCreate('key1', factory);
            expect(result1).toBe(42);
            expect(factory).toHaveBeenCalledTimes(1);

            // Second call should return existing
            const result2 = map.getOrCreate('key1', factory);
            expect(result2).toBe(42);
            expect(factory).toHaveBeenCalledTimes(1); // Should not be called again
        });

        it('should perform update operation', () => {
            map.set('counter', 5);

            const result = map.update('counter', current => (current || 0) + 1);

            expect(result).toBe(6);
            expect(map.get('counter')).toBe(6);
        });

        it('should perform update on non-existent key', () => {
            const result = map.update('newKey', current => (current || 0) + 10);

            expect(result).toBe(10);
            expect(map.get('newKey')).toBe(10);
        });

        it('should perform conditional update', () => {
            map.set('value', 100);

            // Should update because condition is true
            const result1 = map.updateIf(
                'value',
                current => (current || 0) > 50,
                current => (current || 0) * 2
            );
            expect(result1).toBe(true);
            expect(map.get('value')).toBe(200);

            // Should not update because condition is false
            const result2 = map.updateIf(
                'value',
                current => (current || 0) < 100,
                current => (current || 0) * 2
            );
            expect(result2).toBe(false);
            expect(map.get('value')).toBe(200); // Should remain unchanged
        });

        it('should perform compute operation', () => {
            map.set('existing', 10);

            // Compute on existing key
            const result1 = map.compute('existing', (key, current) => (current || 0) + 5);
            expect(result1).toBe(15);
            expect(map.get('existing')).toBe(15);

            // Compute on non-existent key
            const result2 = map.compute('new', (key, current) => 20);
            expect(result2).toBe(20);
            expect(map.get('new')).toBe(20);

            // Compute with undefined result (should delete)
            const result3 = map.compute('existing', (key, current) => undefined);
            expect(result3).toBeUndefined();
            expect(map.has('existing')).toBe(false);
        });
    });
});

describe('ConcurrentSet', () => {
    let set: ConcurrentSet<string>;

    beforeEach(() => {
        set = new ConcurrentSet();
    });

    describe('Basic Operations', () => {
        it('should add and check values', () => {
            set.add('value1');
            expect(set.has('value1')).toBe(true);
            expect(set.has('value2')).toBe(false);
        });

        it('should delete values', () => {
            set.add('value1');
            expect(set.delete('value1')).toBe(true);
            expect(set.has('value1')).toBe(false);
            expect(set.delete('value1')).toBe(false); // Should return false for non-existent value
        });

        it('should clear all values', () => {
            set.add('value1');
            set.add('value2');
            expect(set.size()).toBe(2);

            set.clear();
            expect(set.size()).toBe(0);
            expect(set.has('value1')).toBe(false);
        });

        it('should return correct size', () => {
            expect(set.size()).toBe(0);

            set.add('value1');
            expect(set.size()).toBe(1);

            set.add('value2');
            expect(set.size()).toBe(2);

            set.add('value1'); // Duplicate should not increase size
            expect(set.size()).toBe(2);
        });

        it('should return values array', () => {
            set.add('c');
            set.add('a');
            set.add('b');

            const values = set.values();
            expect(values.length).toBe(3);
            expect(values).toContain('a');
            expect(values).toContain('b');
            expect(values).toContain('c');
        });

        it('should convert to regular set', () => {
            set.add('value1');
            set.add('value2');

            const regularSet = set.toSet();

            expect(regularSet).toBeInstanceOf(Set);
            expect(regularSet.has('value1')).toBe(true);
            expect(regularSet.has('value2')).toBe(true);
            expect(regularSet.size).toBe(2);
        });
    });

    describe('Atomic Operations', () => {
        it('should add if absent', () => {
            // Should add new value
            expect(set.addIfAbsent('value1')).toBe(true);
            expect(set.has('value1')).toBe(true);

            // Should not add existing value
            expect(set.addIfAbsent('value1')).toBe(false);
            expect(set.size()).toBe(1);
        });
    });

    describe('Different Types', () => {
        it('should work with numbers', () => {
            const numberSet = new ConcurrentSet<number>();

            numberSet.add(1);
            numberSet.add(2);
            numberSet.add(1); // Duplicate

            expect(numberSet.size()).toBe(2);
            expect(numberSet.has(1)).toBe(true);
            expect(numberSet.has(3)).toBe(false);
        });

        it('should work with objects', () => {
            const objectSet = new ConcurrentSet<{ id: number }>();
            const obj1 = { id: 1 };
            const obj2 = { id: 2 };

            objectSet.add(obj1);
            objectSet.add(obj2);

            expect(objectSet.size()).toBe(2);
            expect(objectSet.has(obj1)).toBe(true);
            expect(objectSet.has({ id: 1 })).toBe(false); // Different object reference
        });
    });
});

describe('ConcurrencyUtils', () => {
    describe('Atomic Operations', () => {
        it('should execute multiple operations atomically', () => {
            let counter = 0;

            const results = ConcurrencyUtils.atomic([() => ++counter, () => ++counter, () => counter * 2]);

            expect(results).toEqual([1, 2, 4]);
            expect(counter).toBe(2);
        });

        it('should handle exceptions in atomic operations', () => {
            expect(() => {
                ConcurrencyUtils.atomic([
                    () => 1,
                    () => {
                        throw new Error('Test error');
                    },
                    () => 3
                ]);
            }).toThrow('Test error');
        });
    });

    describe('Retry on Concurrency', () => {
        it('should succeed on first attempt', () => {
            const operation = jest.fn().mockReturnValue('success');

            const result = ConcurrencyUtils.withRetryOnConcurrency(operation);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should retry on concurrent modification error', () => {
            const operation = jest
                .fn()
                .mockImplementationOnce(() => {
                    throw new Error('concurrent modification detected');
                })
                .mockImplementationOnce(() => {
                    throw new Error('concurrent modification detected');
                })
                .mockReturnValueOnce('success');

            const result = ConcurrencyUtils.withRetryOnConcurrency(operation, 3, 1);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('should fail after max retries', () => {
            const operation = jest.fn().mockImplementation(() => {
                throw new Error('concurrent modification detected');
            });

            expect(() => {
                ConcurrencyUtils.withRetryOnConcurrency(operation, 2, 1);
            }).toThrow('Max retries exceeded for concurrent operation');

            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('should not retry on non-concurrent errors', () => {
            const operation = jest.fn().mockImplementation(() => {
                throw new Error('different error');
            });

            expect(() => {
                ConcurrencyUtils.withRetryOnConcurrency(operation, 3, 1);
            }).toThrow('different error');

            expect(operation).toHaveBeenCalledTimes(1);
        });
    });

    describe('Debounce', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should debounce function calls', () => {
            const mockFn = jest.fn();
            const debounced = ConcurrencyUtils.debounce(mockFn, 100);

            debounced('arg1');
            debounced('arg2');
            debounced('arg3');

            expect(mockFn).not.toHaveBeenCalled();

            jest.advanceTimersByTime(100);

            expect(mockFn).toHaveBeenCalledTimes(1);
            expect(mockFn).toHaveBeenLastCalledWith('arg3');
        });

        it('should handle different argument sets separately', () => {
            const mockFn = jest.fn();
            const debounced = ConcurrencyUtils.debounce(mockFn, 100);

            debounced('set1', 'arg1');
            debounced('set2', 'arg2');

            jest.advanceTimersByTime(100);

            expect(mockFn).toHaveBeenCalledTimes(2);
            expect(mockFn).toHaveBeenCalledWith('set1', 'arg1');
            expect(mockFn).toHaveBeenCalledWith('set2', 'arg2');
        });

        it('should cancel pending debounced calls', () => {
            const mockFn = jest.fn();
            const debounced = ConcurrencyUtils.debounce(mockFn, 100);

            debounced('arg1');
            debounced.cancel();

            jest.advanceTimersByTime(100);

            expect(mockFn).not.toHaveBeenCalled();
        });

        it('should reset timer on subsequent calls with same arguments', () => {
            const mockFn = jest.fn();
            const debounced = ConcurrencyUtils.debounce(mockFn, 100);

            debounced('arg1');
            jest.advanceTimersByTime(50);

            debounced('arg1'); // Should reset the timer
            jest.advanceTimersByTime(50);

            expect(mockFn).not.toHaveBeenCalled(); // Should not have been called yet

            jest.advanceTimersByTime(50);

            expect(mockFn).toHaveBeenCalledTimes(1);
            expect(mockFn).toHaveBeenCalledWith('arg1');
        });
    });

    describe('Execute with Timeout', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should resolve when operation completes within timeout', async () => {
            const operation = jest.fn().mockResolvedValue('success');

            const promise = ConcurrencyUtils.executeWithTimeout(operation, 1000);

            jest.advanceTimersByTime(500);

            const result = await promise;
            expect(result).toBe('success');
        });

        it('should reject when operation times out', async () => {
            const operation = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 2000)));

            const promise = ConcurrencyUtils.executeWithTimeout(operation, 1000);

            jest.advanceTimersByTime(1000);

            await expect(promise).rejects.toThrow('Operation timed out after 1000ms');
        });

        it('should reject when operation throws error', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));

            const promise = ConcurrencyUtils.executeWithTimeout(operation, 1000);

            await expect(promise).rejects.toThrow('Operation failed');
        });

        it('should prevent concurrent operations with same key', async () => {
            const operation1 = jest
                .fn()
                .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('first'), 500)));
            const operation2 = jest
                .fn()
                .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('second'), 200)));

            const promise1 = ConcurrencyUtils.executeWithTimeout(operation1, 1000, 'key1');
            const promise2 = ConcurrencyUtils.executeWithTimeout(operation2, 1000, 'key1');

            await expect(promise2).rejects.toThrow('Concurrent operation already in progress: key1');

            jest.advanceTimersByTime(500);
            const result1 = await promise1;
            expect(result1).toBe('first');
        });

        it('should allow concurrent operations with different keys', async () => {
            const operation1 = jest.fn().mockResolvedValue('first');
            const operation2 = jest.fn().mockResolvedValue('second');

            const [result1, result2] = await Promise.all([
                ConcurrencyUtils.executeWithTimeout(operation1, 1000, 'key1'),
                ConcurrencyUtils.executeWithTimeout(operation2, 1000, 'key2')
            ]);

            expect(result1).toBe('first');
            expect(result2).toBe('second');
        });
    });
});
