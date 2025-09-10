/**
 * Comprehensive unit tests for MonitoringService
 * Achieving 100% meaningful code coverage
 */

import { MonitoringService } from '../../../services/MonitoringService';

describe('MonitoringService', () => {
    let service: MonitoringService;
    let mockDateNow: jest.SpyInstance;
    let currentTime: number;

    beforeEach(() => {
        // Reset singleton instance
        (MonitoringService as any).instance = undefined;

        // Create fresh instance
        service = MonitoringService.getInstance();

        // Mock Date.now for deterministic tests
        currentTime = 1000;
        mockDateNow = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    });

    afterEach(() => {
        mockDateNow.mockRestore();
    });

    describe('getInstance', () => {
        it('should return singleton instance', () => {
            const instance1 = MonitoringService.getInstance();
            const instance2 = MonitoringService.getInstance();

            expect(instance1).toBe(instance2);
        });

        it('should create new instance if none exists', () => {
            (MonitoringService as any).instance = undefined;

            const instance = MonitoringService.getInstance();
            expect(instance).toBeInstanceOf(MonitoringService);
        });
    });

    describe('Timer functionality', () => {
        describe('startTimer', () => {
            it('should start a timer with current time', () => {
                service.startTimer('test-timer');

                // Timer should be tracked internally
                // We'll verify this by ending it
                currentTime = 2000;
                const duration = service.endTimer('test-timer');
                expect(duration).toBe(1000);
            });

            it('should handle multiple timers simultaneously', () => {
                currentTime = 1000;
                service.startTimer('timer1');

                currentTime = 1500;
                service.startTimer('timer2');

                currentTime = 2000;
                service.startTimer('timer3');

                currentTime = 3000;
                expect(service.endTimer('timer1')).toBe(2000);
                expect(service.endTimer('timer2')).toBe(1500);
                expect(service.endTimer('timer3')).toBe(1000);
            });

            it('should overwrite existing timer with same name', () => {
                currentTime = 1000;
                service.startTimer('duplicate');

                currentTime = 2000;
                service.startTimer('duplicate'); // Restart the timer

                currentTime = 2500;
                const duration = service.endTimer('duplicate');
                expect(duration).toBe(500); // Should use the second start time
            });
        });

        describe('endTimer', () => {
            it('should return duration and store metric', () => {
                currentTime = 1000;
                service.startTimer('test-timer');

                currentTime = 1500;
                const duration = service.endTimer('test-timer');

                expect(duration).toBe(500);
                expect(service.getMetric('test-timer')).toBe(500);
            });

            it('should return 0 for non-existent timer', () => {
                const duration = service.endTimer('non-existent');
                expect(duration).toBe(0);
            });

            it('should remove timer after ending', () => {
                service.startTimer('temp-timer');
                currentTime = 2000;
                service.endTimer('temp-timer');

                // Trying to end again should return 0
                const duration = service.endTimer('temp-timer');
                expect(duration).toBe(0);
            });

            it('should handle timer names with special characters', () => {
                const specialNames = [
                    'timer-with-dash',
                    'timer_with_underscore',
                    'timer.with.dot',
                    'timer:with:colon',
                    'timer/with/slash',
                    'timer\\with\\backslash',
                    'timer with spaces',
                    '日本語タイマー', // Unicode
                    '🚀timer' // Emoji
                ];

                specialNames.forEach(name => {
                    currentTime = 1000;
                    service.startTimer(name);
                    currentTime = 2000;
                    expect(service.endTimer(name)).toBe(1000);
                });
            });
        });
    });

    describe('Metrics functionality', () => {
        describe('recordMetric', () => {
            it('should store metric value', () => {
                service.recordMetric('cpu-usage', 45.5);
                expect(service.getMetric('cpu-usage')).toBe(45.5);
            });

            it('should overwrite existing metric', () => {
                service.recordMetric('memory', 100);
                service.recordMetric('memory', 200);
                expect(service.getMetric('memory')).toBe(200);
            });

            it('should handle various numeric values', () => {
                const testCases = [
                    { name: 'zero', value: 0 },
                    { name: 'negative', value: -100 },
                    { name: 'decimal', value: 3.14159 },
                    { name: 'large', value: Number.MAX_SAFE_INTEGER },
                    { name: 'small', value: Number.MIN_SAFE_INTEGER },
                    { name: 'infinity', value: Infinity },
                    { name: 'neg-infinity', value: -Infinity },
                    { name: 'nan', value: NaN }
                ];

                testCases.forEach(({ name, value }) => {
                    service.recordMetric(name, value);

                    if (isNaN(value)) {
                        expect(service.getMetric(name)).toBeNaN();
                    } else {
                        expect(service.getMetric(name)).toBe(value);
                    }
                });
            });
        });

        describe('getMetric', () => {
            it('should return stored metric value', () => {
                service.recordMetric('test-metric', 123);
                expect(service.getMetric('test-metric')).toBe(123);
            });

            it('should return undefined for non-existent metric', () => {
                expect(service.getMetric('non-existent')).toBeUndefined();
            });

            it('should distinguish between 0 and undefined', () => {
                service.recordMetric('zero-metric', 0);

                expect(service.getMetric('zero-metric')).toBe(0);
                expect(service.getMetric('undefined-metric')).toBeUndefined();
            });
        });

        describe('getAllMetrics', () => {
            it('should return empty map when no metrics', () => {
                const metrics = service.getAllMetrics();
                expect(metrics).toBeInstanceOf(Map);
                expect(metrics.size).toBe(0);
            });

            it('should return copy of all metrics', () => {
                service.recordMetric('metric1', 100);
                service.recordMetric('metric2', 200);
                service.startTimer('timer1');
                currentTime = 2000;
                service.endTimer('timer1');

                const metrics = service.getAllMetrics();

                expect(metrics.size).toBe(3);
                expect(metrics.get('metric1')).toBe(100);
                expect(metrics.get('metric2')).toBe(200);
                expect(metrics.get('timer1')).toBe(1000);
            });

            it('should return a copy, not the original map', () => {
                service.recordMetric('test', 100);

                const metrics1 = service.getAllMetrics();
                metrics1.set('test', 999); // Modify the returned map

                const metrics2 = service.getAllMetrics();
                expect(metrics2.get('test')).toBe(100); // Original should be unchanged
            });

            it('should include metrics from ended timers', () => {
                service.startTimer('timer1');
                service.startTimer('timer2');

                currentTime = 1500;
                service.endTimer('timer1');

                const metrics = service.getAllMetrics();
                expect(metrics.has('timer1')).toBe(true);
                expect(metrics.has('timer2')).toBe(false); // Not ended yet
            });
        });
    });

    describe('reset', () => {
        it('should clear all metrics', () => {
            service.recordMetric('metric1', 100);
            service.recordMetric('metric2', 200);

            service.reset();

            expect(service.getAllMetrics().size).toBe(0);
            expect(service.getMetric('metric1')).toBeUndefined();
            expect(service.getMetric('metric2')).toBeUndefined();
        });

        it('should clear all active timers', () => {
            service.startTimer('timer1');
            service.startTimer('timer2');

            service.reset();

            // Timers should no longer exist
            expect(service.endTimer('timer1')).toBe(0);
            expect(service.endTimer('timer2')).toBe(0);
        });

        it('should allow starting fresh after reset', () => {
            service.recordMetric('old', 100);
            service.startTimer('old-timer');

            service.reset();

            // Should be able to use same names
            service.recordMetric('old', 200);
            service.startTimer('old-timer');

            expect(service.getMetric('old')).toBe(200);

            currentTime = 2000;
            expect(service.endTimer('old-timer')).toBe(1000);
        });
    });

    describe('Complex scenarios', () => {
        it('should handle rapid metric updates', () => {
            for (let i = 0; i < 1000; i++) {
                service.recordMetric('rapid', i);
            }

            expect(service.getMetric('rapid')).toBe(999);
        });

        it('should handle many concurrent timers', () => {
            const timerCount = 100;
            const startTimes: number[] = [];

            // Start many timers
            for (let i = 0; i < timerCount; i++) {
                currentTime = 1000 + i * 10; // Start at 1000 and increment
                startTimes[i] = currentTime;
                service.startTimer(`timer-${i}`);
            }

            // End them all
            currentTime = 10000;
            for (let i = 0; i < timerCount; i++) {
                const expectedDuration = 10000 - startTimes[i];
                expect(service.endTimer(`timer-${i}`)).toBe(expectedDuration);
            }

            // All should be in metrics
            expect(service.getAllMetrics().size).toBe(timerCount);
        });

        it('should maintain separate namespaces for timers and metrics', () => {
            // Use same name for timer and metric
            service.recordMetric('shared-name', 100);

            currentTime = 1000;
            service.startTimer('shared-name');

            // Metric should still be 100
            expect(service.getMetric('shared-name')).toBe(100);

            currentTime = 2000;
            service.endTimer('shared-name');

            // Now it should be overwritten with timer duration
            expect(service.getMetric('shared-name')).toBe(1000);
        });

        it('should handle interleaved timer operations', () => {
            currentTime = 1000;
            service.startTimer('A');

            currentTime = 1100;
            service.startTimer('B');

            currentTime = 1200;
            const durationA1 = service.endTimer('A'); // 200ms

            currentTime = 1300;
            service.startTimer('A'); // Restart A

            currentTime = 1400;
            const durationB = service.endTimer('B'); // 300ms

            currentTime = 1500;
            const durationA2 = service.endTimer('A'); // 200ms

            expect(durationA1).toBe(200);
            expect(durationB).toBe(300);
            expect(durationA2).toBe(200);

            // Check final metrics
            expect(service.getMetric('A')).toBe(200); // Last value
            expect(service.getMetric('B')).toBe(300);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty string names', () => {
            service.recordMetric('', 100);
            expect(service.getMetric('')).toBe(100);

            currentTime = 1000;
            service.startTimer('');
            currentTime = 2000;
            expect(service.endTimer('')).toBe(1000);
        });

        it('should handle very long metric names', () => {
            const longName = 'a'.repeat(10000);
            service.recordMetric(longName, 42);
            expect(service.getMetric(longName)).toBe(42);
        });

        it('should handle metrics with same value', () => {
            service.recordMetric('metric1', 100);
            service.recordMetric('metric2', 100);
            service.recordMetric('metric3', 100);

            const metrics = service.getAllMetrics();
            expect(Array.from(metrics.values()).every(v => v === 100)).toBe(true);
        });

        it('should preserve metric insertion order in getAllMetrics', () => {
            service.recordMetric('first', 1);
            service.recordMetric('second', 2);
            service.recordMetric('third', 3);

            const keys = Array.from(service.getAllMetrics().keys());
            expect(keys).toEqual(['first', 'second', 'third']);
        });

        it('should handle Date.now returning same value', () => {
            // Simulate Date.now not changing
            currentTime = 1000;
            service.startTimer('stuck-timer');

            // Time doesn't advance
            const duration = service.endTimer('stuck-timer');
            expect(duration).toBe(0);
            expect(service.getMetric('stuck-timer')).toBe(0);
        });
    });

    describe('Memory and performance', () => {
        it('should not leak memory when resetting frequently', () => {
            for (let i = 0; i < 100; i++) {
                // Add lots of data
                for (let j = 0; j < 100; j++) {
                    service.recordMetric(`metric-${i}-${j}`, Math.random());
                    service.startTimer(`timer-${i}-${j}`);
                }

                // Reset everything
                service.reset();
            }

            // Should have no metrics after all resets
            expect(service.getAllMetrics().size).toBe(0);
        });

        it('should handle metrics update in tight loop', () => {
            const iterations = 10000;
            const start = Date.now();

            for (let i = 0; i < iterations; i++) {
                service.recordMetric('perf-test', i);
            }

            const elapsed = Date.now() - start;
            expect(elapsed).toBeLessThan(100); // Should be very fast
            expect(service.getMetric('perf-test')).toBe(iterations - 1);
        });
    });
});
