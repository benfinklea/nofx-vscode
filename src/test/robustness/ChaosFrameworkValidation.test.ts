import { ChaosTestFramework, ChaosExperiment, FailureType, ExperimentOutcome } from './ChaosTestFramework';

describe('Chaos Engineering Framework Validation', () => {
    let chaosFramework: ChaosTestFramework;

    beforeEach(() => {
        chaosFramework = new ChaosTestFramework();
    });

    afterEach(() => {
        chaosFramework.stopExperiment('test-experiment');
    });

    describe('Framework Core Functionality', () => {
        test('should initialize chaos test framework correctly', () => {
            expect(chaosFramework).toBeDefined();
            expect(typeof chaosFramework.runExperiment).toBe('function');
            expect(typeof chaosFramework.stopExperiment).toBe('function');
        });

        test('should run basic chaos experiment', async () => {
            const experiment: ChaosExperiment = {
                id: 'basic-test',
                name: 'Basic Framework Test',
                description: 'Test basic chaos framework functionality',
                failureType: FailureType.HIGH_LATENCY,
                duration: 2000,
                targetService: 'TestService',
                parameters: { intensity: 0.5 },
                expectedOutcome: ExperimentOutcome.GRACEFUL_DEGRADATION
            };

            const startTime = Date.now();
            const metrics = await chaosFramework.runExperiment(experiment);
            const duration = Date.now() - startTime;

            expect(metrics).toBeDefined();
            expect(metrics.experimentId).toBe('basic-test');
            expect(duration).toBeGreaterThan(1900); // Should run for approximately 2 seconds
            expect(duration).toBeLessThan(3000);
        });

        test('should handle multiple failure types', async () => {
            const experiment: ChaosExperiment = {
                id: 'multi-failure-test',
                name: 'Multi-Failure Test',
                description: 'Test multiple failure types',
                failureTypes: [FailureType.NETWORK_LATENCY, FailureType.MEMORY_PRESSURE, FailureType.SERVICE_CRASH],
                duration: 3000,
                intensity: 0.7,
                targetService: 'TestService',
                successCriteria: {
                    maxFailureRate: 0.8,
                    maxResponseTime: 3000,
                    minAvailability: 0.6
                }
            };

            const metrics = await chaosFramework.runExperiment(experiment);

            expect(metrics.failureTypes.length).toBeGreaterThan(1);
            expect(metrics.failureTypes).toContain(FailureType.NETWORK_LATENCY);
            expect(metrics.failureTypes).toContain(FailureType.MEMORY_PRESSURE);
            expect(metrics.failureTypes).toContain(FailureType.SERVICE_CRASH);
        });
    });

    describe('Failure Injection Validation', () => {
        test('should inject network latency failures', async () => {
            const experiment: ChaosExperiment = {
                id: 'network-latency-test',
                name: 'Network Latency Injection',
                description: 'Test network latency failure injection',
                failureTypes: [FailureType.NETWORK_LATENCY],
                duration: 2000,
                intensity: 1.0,
                targetService: 'NetworkService',
                successCriteria: {
                    maxFailureRate: 1.0,
                    maxResponseTime: 5000,
                    minAvailability: 0.5
                }
            };

            const metrics = await chaosFramework.runExperiment(experiment);

            expect(metrics.totalFailures).toBeGreaterThan(0);
            expect(metrics.averageResponseTime).toBeGreaterThan(100); // Should have latency
            expect(metrics.failureRate).toBeGreaterThan(0);
        });

        test('should inject memory pressure failures', async () => {
            const experiment: ChaosExperiment = {
                id: 'memory-pressure-test',
                name: 'Memory Pressure Injection',
                description: 'Test memory pressure failure injection',
                failureTypes: [FailureType.MEMORY_PRESSURE],
                duration: 2000,
                intensity: 0.8,
                targetService: 'MemoryService',
                successCriteria: {
                    maxFailureRate: 0.9,
                    maxResponseTime: 3000,
                    minAvailability: 0.7
                }
            };

            const metrics = await chaosFramework.runExperiment(experiment);

            expect(metrics.totalFailures).toBeGreaterThan(0);
            expect(metrics.memoryPressureEvents).toBeGreaterThan(0);
        });

        test('should inject service crash failures', async () => {
            const experiment: ChaosExperiment = {
                id: 'service-crash-test',
                name: 'Service Crash Injection',
                description: 'Test service crash failure injection',
                failureTypes: [FailureType.SERVICE_CRASH],
                duration: 1500,
                intensity: 0.6,
                targetService: 'CrashService',
                successCriteria: {
                    maxFailureRate: 0.8,
                    maxResponseTime: 2000,
                    minAvailability: 0.6
                }
            };

            const metrics = await chaosFramework.runExperiment(experiment);

            expect(metrics.totalFailures).toBeGreaterThan(0);
            expect(metrics.serviceCrashEvents).toBeGreaterThan(0);
        });
    });

    describe('Metrics Collection Validation', () => {
        test('should collect comprehensive experiment metrics', async () => {
            const experiment: ChaosExperiment = {
                id: 'metrics-test',
                name: 'Metrics Collection Test',
                description: 'Test metrics collection',
                failureTypes: [FailureType.NETWORK_LATENCY, FailureType.DEPENDENCY_FAILURE],
                duration: 3000,
                intensity: 0.5,
                targetService: 'MetricsService',
                successCriteria: {
                    maxFailureRate: 0.6,
                    maxResponseTime: 2500,
                    minAvailability: 0.8
                }
            };

            const metrics = await chaosFramework.runExperiment(experiment);

            // Validate all required metrics are present
            expect(metrics.experimentId).toBeDefined();
            expect(metrics.startTime).toBeDefined();
            expect(metrics.endTime).toBeDefined();
            expect(metrics.duration).toBeGreaterThan(0);
            expect(metrics.totalRequests).toBeGreaterThan(0);
            expect(metrics.totalFailures).toBeGreaterThanOrEqual(0);
            expect(metrics.failureRate).toBeGreaterThanOrEqual(0);
            expect(metrics.failureRate).toBeLessThanOrEqual(1);
            expect(metrics.averageResponseTime).toBeGreaterThan(0);
            expect(metrics.availability).toBeGreaterThanOrEqual(0);
            expect(metrics.availability).toBeLessThanOrEqual(1);
            expect(Array.isArray(metrics.failureTypes)).toBe(true);
            expect(metrics.successCriteriaMet).toBeDefined();

            // Validate timing metrics
            expect(metrics.endTime.getTime() - metrics.startTime.getTime()).toBeGreaterThan(2900);
            expect(metrics.duration).toBeCloseTo(3000, -2); // Within 100ms
        });

        test('should validate success criteria correctly', async () => {
            const experiment: ChaosExperiment = {
                id: 'success-criteria-test',
                name: 'Success Criteria Test',
                description: 'Test success criteria validation',
                failureTypes: [FailureType.NETWORK_LATENCY],
                duration: 2000,
                intensity: 0.3, // Low intensity should meet criteria
                targetService: 'CriteriaService',
                successCriteria: {
                    maxFailureRate: 0.5,
                    maxResponseTime: 3000,
                    minAvailability: 0.8
                }
            };

            const metrics = await chaosFramework.runExperiment(experiment);

            expect(metrics.successCriteriaMet).toBeDefined();
            expect(typeof metrics.successCriteriaMet.failureRate).toBe('boolean');
            expect(typeof metrics.successCriteriaMet.responseTime).toBe('boolean');
            expect(typeof metrics.successCriteriaMet.availability).toBe('boolean');

            // With low intensity, criteria should generally be met
            expect(metrics.failureRate).toBeLessThanOrEqual(0.5);
            expect(metrics.averageResponseTime).toBeLessThan(3000);
            expect(metrics.availability).toBeGreaterThanOrEqual(0.8);
        });
    });

    describe('Experiment Control Validation', () => {
        test('should stop experiments correctly', async () => {
            const experiment: ChaosExperiment = {
                id: 'stop-test',
                name: 'Stop Test',
                description: 'Test experiment stopping',
                failureTypes: [FailureType.NETWORK_LATENCY],
                duration: 10000, // Long duration
                intensity: 0.5,
                targetService: 'StopService',
                successCriteria: {
                    maxFailureRate: 0.6,
                    maxResponseTime: 2000,
                    minAvailability: 0.8
                }
            };

            const startTime = Date.now();

            // Start experiment and stop after 2 seconds
            const experimentPromise = chaosFramework.runExperiment(experiment);

            setTimeout(() => {
                chaosFramework.stopAllExperiments();
            }, 2000);

            const metrics = await experimentPromise;
            const actualDuration = Date.now() - startTime;

            expect(actualDuration).toBeLessThan(5000); // Should stop early
            expect(metrics.duration).toBeLessThan(5000);
        });

        test('should handle concurrent experiments', async () => {
            const experiment1: ChaosExperiment = {
                id: 'concurrent-test-1',
                name: 'Concurrent Test 1',
                description: 'First concurrent experiment',
                failureTypes: [FailureType.NETWORK_LATENCY],
                duration: 3000,
                intensity: 0.4,
                targetService: 'ConcurrentService1',
                successCriteria: {
                    maxFailureRate: 0.5,
                    maxResponseTime: 2000,
                    minAvailability: 0.8
                }
            };

            const experiment2: ChaosExperiment = {
                id: 'concurrent-test-2',
                name: 'Concurrent Test 2',
                description: 'Second concurrent experiment',
                failureTypes: [FailureType.MEMORY_PRESSURE],
                duration: 2500,
                intensity: 0.3,
                targetService: 'ConcurrentService2',
                successCriteria: {
                    maxFailureRate: 0.4,
                    maxResponseTime: 1500,
                    minAvailability: 0.85
                }
            };

            const startTime = Date.now();

            // Run experiments concurrently
            const [metrics1, metrics2] = await Promise.all([
                chaosFramework.runExperiment(experiment1),
                chaosFramework.runExperiment(experiment2)
            ]);

            const totalTime = Date.now() - startTime;

            expect(metrics1.experimentId).toBe('concurrent-test-1');
            expect(metrics2.experimentId).toBe('concurrent-test-2');
            expect(totalTime).toBeLessThan(4000); // Should run concurrently, not sequentially
            expect(totalTime).toBeGreaterThan(2900); // Should take at least as long as longest experiment
        });
    });
});
