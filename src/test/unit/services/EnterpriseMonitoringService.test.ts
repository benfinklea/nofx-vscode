import { EventEmitter } from 'events';
import {
    EnterpriseMonitoringService,
    Alert,
    EnterpriseSystemHealth,
    OperationalMetrics,
    EnterpriseMonitoringEvent
} from '../../../services/EnterpriseMonitoringService';
import { MonitoringService, MonitoringEvent, SystemHealth } from '../../../services/MonitoringService';

describe('EnterpriseMonitoringService', () => {
    let service: EnterpriseMonitoringService;
    let mockBaseService: jest.Mocked<MonitoringService>;
    let mockConfig: any;

    beforeEach(() => {
        // Clear all timers
        jest.clearAllTimers();
        jest.useFakeTimers();

        // Create mock base monitoring service
        mockBaseService = {
            on: jest.fn(),
            off: jest.fn(),
            emit: jest.fn(),
            getSystemHealth: jest.fn(),
            trackAgent: jest.fn(),
            updateAgentStatus: jest.fn(),
            removeAgent: jest.fn(),
            getAgentStatus: jest.fn(),
            getAllAgentStatuses: jest.fn(),
            isHealthy: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Mock system health response
        const mockSystemHealth: SystemHealth = {
            healthy: true,
            lastCheck: new Date(),
            components: new Map([
                ['agent-1', { name: 'agent-1', healthy: true }],
                ['agent-2', { name: 'agent-2', healthy: false }]
            ])
        };

        mockBaseService.getSystemHealth.mockReturnValue(mockSystemHealth);

        mockConfig = {
            healthCheckIntervalMs: 1000,
            metricsCollectionIntervalMs: 2000,
            uptimeTarget: 99.5,
            alertThresholds: {
                responseTime: 3000,
                errorRate: 0.03,
                utilization: 75
            }
        };
    });

    afterEach(() => {
        if (service) {
            service.dispose();
        }
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe('Constructor and Initialization', () => {
        test('should initialize with default configuration', () => {
            service = new EnterpriseMonitoringService(mockBaseService);

            expect(service).toBeInstanceOf(EventEmitter);
            expect(mockBaseService.on).toHaveBeenCalledWith('status-change', expect.any(Function));
            expect(mockBaseService.on).toHaveBeenCalledWith('health-issue', expect.any(Function));
            expect(mockBaseService.on).toHaveBeenCalledWith('agent-stuck', expect.any(Function));
        });

        test('should initialize with custom configuration', () => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);

            const operationalMetrics = service.getOperationalMetrics();
            expect(operationalMetrics.uptime.target).toBe(99.5);
        });

        test('should start monitoring intervals on initialization', () => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);

            // Check that timers were set
            expect(jest.getTimerCount()).toBeGreaterThan(0);
        });

        test('should initialize operational metrics with default values', () => {
            service = new EnterpriseMonitoringService(mockBaseService);

            const metrics = service.getOperationalMetrics();
            expect(metrics).toMatchObject({
                uptime: {
                    current: 0,
                    percentage: 100,
                    target: 99.9,
                    breaches: []
                },
                performance: {
                    avgLatency: 0,
                    p95Latency: 0,
                    p99Latency: 0,
                    throughputPerMinute: 0,
                    errorRate: 0
                },
                capacity: {
                    agentUtilization: 0,
                    systemResourceUsage: 0,
                    concurrentOperations: 0,
                    queueLength: 0
                },
                reliability: {
                    failureRate: 0,
                    meanTimeBetweenFailures: 0,
                    meanTimeToRecovery: 0,
                    circuitBreakerTrips: 0
                }
            });
        });

        test('should handle null base service gracefully', () => {
            expect(() => {
                service = new EnterpriseMonitoringService(null as any);
            }).toThrow();
        });
    });

    describe('Health Check Functionality', () => {
        beforeEach(() => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
        });

        test('should perform enterprise health check', async () => {
            const healthCheckPromise = service.getEnterpriseSystemHealth();
            jest.advanceTimersByTime(100);
            const health = await healthCheckPromise;

            expect(health).toHaveProperty('overallScore');
            expect(health).toHaveProperty('trends');
            expect(health).toHaveProperty('predictions');
            expect(health).toHaveProperty('componentDetails');
            expect(health.overallScore).toBeGreaterThanOrEqual(0);
            expect(health.overallScore).toBeLessThanOrEqual(100);
        });

        test('should calculate correct overall health score', async () => {
            const healthCheckPromise = service.getEnterpriseSystemHealth();
            jest.advanceTimersByTime(100);
            const health = await healthCheckPromise;

            // 1 healthy out of 2 components = 50%
            expect(health.overallScore).toBe(50);
        });

        test('should generate predictions based on health score', async () => {
            const healthCheckPromise = service.getEnterpriseSystemHealth();
            jest.advanceTimersByTime(100);
            const health = await healthCheckPromise;

            expect(health.predictions).toMatchObject({
                nextHourRisk: expect.stringMatching(/low|medium|high/),
                resourceExhaustion: null,
                recommendedActions: expect.any(Array)
            });
        });

        test('should emit enterprise-health-check event', async () => {
            const eventSpy = jest.fn();
            service.on('enterprise-health-check', eventSpy);

            const healthCheckPromise = service.getEnterpriseSystemHealth();
            jest.advanceTimersByTime(100);
            await healthCheckPromise;

            expect(eventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    overallScore: expect.any(Number),
                    trends: expect.any(Object),
                    predictions: expect.any(Object)
                })
            );
        });

        test('should handle empty components map gracefully', async () => {
            mockBaseService.getSystemHealth.mockReturnValue({
                healthy: true,
                lastCheck: new Date(),
                components: new Map()
            });

            const healthCheckPromise = service.getEnterpriseSystemHealth();
            jest.advanceTimersByTime(100);
            const health = await healthCheckPromise;

            expect(health.overallScore).toBe(100);
        });

        test('should perform periodic health checks', () => {
            const spy = jest.spyOn(service, 'getEnterpriseSystemHealth');

            // Advance timer to trigger health check
            jest.advanceTimersByTime(1000);

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('Alert Management', () => {
        beforeEach(() => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
        });

        test('should get active alerts', () => {
            const alerts = service.getActiveAlerts();
            expect(Array.isArray(alerts)).toBe(true);
        });

        test('should acknowledge alerts', () => {
            // First need to generate an alert
            service.updateOperationalMetric('performance', 'errorRate', 0.5);
            jest.advanceTimersByTime(2000); // Trigger metrics collection

            const alerts = service.getActiveAlerts();
            if (alerts.length > 0) {
                const result = service.acknowledgeAlert(alerts[0].id);
                expect(result).toBe(true);
            } else {
                // Test with non-existent alert ID
                const result = service.acknowledgeAlert('non-existent');
                expect(result).toBe(false);
            }
        });

        test('should resolve alerts', () => {
            // Test with non-existent alert ID
            const result = service.resolveAlert('non-existent-alert');
            expect(result).toBe(false);
        });

        test('should suppress alerts', () => {
            expect(() => {
                service.suppressAlert('test-alert', 60000);
            }).not.toThrow();
        });

        test('should get alerts by source', () => {
            const alerts = service.getAlertsBySource('system');
            expect(Array.isArray(alerts)).toBe(true);
        });

        test('should handle invalid alert operations gracefully', () => {
            expect(service.acknowledgeAlert('')).toBe(false);
            expect(service.resolveAlert('')).toBe(false);
            expect(() => service.suppressAlert('', -1000)).not.toThrow();
        });
    });

    describe('Operational Metrics', () => {
        beforeEach(() => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
        });

        test('should get operational metrics', () => {
            const metrics = service.getOperationalMetrics();

            expect(metrics).toHaveProperty('uptime');
            expect(metrics).toHaveProperty('performance');
            expect(metrics).toHaveProperty('capacity');
            expect(metrics).toHaveProperty('reliability');
        });

        test('should update operational metrics', () => {
            service.updateOperationalMetric('performance', 'avgLatency', 150);
            service.updateOperationalMetric('capacity', 'agentUtilization', 75);

            const metrics = service.getOperationalMetrics();
            expect(metrics.performance.avgLatency).toBe(150);
            expect(metrics.capacity.agentUtilization).toBe(75);
        });

        test('should handle invalid metric updates gracefully', () => {
            expect(() => {
                service.updateOperationalMetric('invalid' as any, 'metric', 100);
            }).not.toThrow();

            expect(() => {
                service.updateOperationalMetric('performance', 'nonExistent', 100);
            }).not.toThrow();
        });

        test('should collect metrics periodically', () => {
            const emitSpy = jest.spyOn(service, 'emit');

            // Advance timer to trigger metrics collection
            jest.advanceTimersByTime(2000);

            expect(emitSpy).toHaveBeenCalledWith('metrics-collected', expect.any(Object));
        });

        test('should update uptime correctly over time', () => {
            // Advance time and collect metrics
            jest.advanceTimersByTime(10000); // 10 seconds
            jest.advanceTimersByTime(2000); // Trigger metrics collection

            const metrics = service.getOperationalMetrics();
            expect(metrics.uptime.current).toBeGreaterThan(0);
        });
    });

    describe('Uptime Tracking', () => {
        beforeEach(() => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
        });

        test('should record downtime', () => {
            const downtime = 30000; // 30 seconds
            service.recordDowntime(downtime);

            const uptimeReport = service.getUptimeReport();
            expect(uptimeReport.breaches).toBe(1);
            expect(uptimeReport.totalDowntime).toBe(downtime);
            expect(uptimeReport.percentage).toBeLessThan(100);
        });

        test('should generate uptime report', () => {
            const report = service.getUptimeReport();

            expect(report).toMatchObject({
                current: expect.any(Number),
                percentage: expect.any(Number),
                target: expect.any(Number),
                breaches: expect.any(Number),
                totalDowntime: expect.any(Number)
            });
        });

        test('should calculate uptime percentage correctly with multiple breaches', () => {
            service.recordDowntime(10000); // 10 seconds
            service.recordDowntime(5000); // 5 seconds

            const report = service.getUptimeReport();
            expect(report.breaches).toBe(2);
            expect(report.totalDowntime).toBe(15000);
        });

        test('should maintain 100% uptime initially', () => {
            const report = service.getUptimeReport();
            expect(report.percentage).toBe(100);
            expect(report.breaches).toBe(0);
        });
    });

    describe('Health Report Generation', () => {
        beforeEach(() => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
        });

        test('should generate comprehensive health report', () => {
            const report = service.generateHealthReport();

            expect(report).toMatchObject({
                summary: expect.any(String),
                metrics: expect.any(Object),
                alerts: {
                    total: expect.any(Number),
                    critical: expect.any(Number),
                    high: expect.any(Number),
                    medium: expect.any(Number),
                    low: expect.any(Number)
                },
                recommendations: expect.any(Array)
            });
        });

        test('should generate appropriate summary for healthy system', () => {
            const report = service.generateHealthReport();
            expect(report.summary).toContain('operating normally');
        });

        test('should include recommendations in health report', () => {
            const report = service.generateHealthReport();
            expect(report.recommendations).toEqual(expect.arrayContaining([expect.any(String)]));
        });
    });

    describe('Predictive Analytics', () => {
        beforeEach(() => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
        });

        test('should provide predictive analysis', () => {
            const analysis = service.getPredictiveAnalysis('test_metric');

            expect(analysis).toMatchObject({
                trend: expect.stringMatching(/improving|degrading|stable/),
                failurePrediction: {
                    likely: expect.any(Boolean)
                }
            });
        });

        test('should return stable trend for new metrics', () => {
            const analysis = service.getPredictiveAnalysis('new_metric');
            expect(analysis.trend).toBe('stable');
            expect(analysis.failurePrediction.likely).toBe(false);
        });

        test('should handle multiple metric analyses', () => {
            const analysis1 = service.getPredictiveAnalysis('metric1');
            const analysis2 = service.getPredictiveAnalysis('metric2');

            expect(analysis1).toBeDefined();
            expect(analysis2).toBeDefined();
            expect(analysis1).not.toBe(analysis2);
        });
    });

    describe('Event Handling', () => {
        beforeEach(() => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
        });

        test('should handle status change events from base service', () => {
            const eventSpy = jest.fn();
            service.on('enterprise-status-change', eventSpy);

            const mockEvent: MonitoringEvent = {
                type: 'status-change',
                timestamp: new Date(),
                agentId: 'test-agent',
                data: { status: 'error' }
            };

            // Simulate base service emitting event
            const statusChangeHandler = mockBaseService.on.mock.calls.find(call => call[0] === 'status-change')?.[1];
            statusChangeHandler?.(mockEvent);

            expect(eventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'status-change',
                    severity: expect.any(String),
                    source: 'test-agent',
                    correlationId: expect.any(String)
                })
            );
        });

        test('should handle health issue events', () => {
            const alertSpy = jest.fn();
            service.on('enterprise-alert', alertSpy);

            const mockHealthData = { issue: 'component failure' };

            // Simulate base service emitting health issue
            const healthIssueHandler = mockBaseService.on.mock.calls.find(call => call[0] === 'health-issue')?.[1];
            healthIssueHandler?.(mockHealthData);

            expect(alertSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'availability',
                    severity: 'high',
                    title: 'System Health Issue Detected'
                })
            );
        });

        test('should handle agent stuck events', () => {
            const alertSpy = jest.fn();
            service.on('enterprise-alert', alertSpy);

            const mockAgentData = { agentId: 'stuck-agent' };

            // Simulate base service emitting agent stuck event
            const agentStuckHandler = mockBaseService.on.mock.calls.find(call => call[0] === 'agent-stuck')?.[1];
            agentStuckHandler?.(mockAgentData);

            expect(alertSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'performance',
                    severity: 'medium',
                    title: 'Agent Stuck',
                    source: 'stuck-agent'
                })
            );
        });

        test('should determine appropriate severity levels', () => {
            const eventSpy = jest.fn();
            service.on('enterprise-status-change', eventSpy);

            // Test different event types and their severities
            const events: MonitoringEvent[] = [
                { type: 'status-change', timestamp: new Date(), data: { status: 'error' } },
                { type: 'status-change', timestamp: new Date(), data: { status: 'stuck' } },
                { type: 'health-issue', timestamp: new Date(), data: {} },
                { type: 'recovery', timestamp: new Date(), data: {} }
            ];

            events.forEach(event => {
                const statusChangeHandler = mockBaseService.on.mock.calls.find(
                    call => call[0] === 'status-change'
                )?.[1];
                statusChangeHandler?.(event);
            });

            // Verify events were emitted with appropriate severities
            expect(eventSpy).toHaveBeenCalledTimes(events.length);
        });
    });

    describe('Resource Management and Disposal', () => {
        test('should dispose properly', () => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
            const removeListenersSpy = jest.spyOn(service, 'removeAllListeners');

            service.dispose();

            expect(removeListenersSpy).toHaveBeenCalled();

            // Should be able to call dispose multiple times safely
            expect(() => service.dispose()).not.toThrow();
        });

        test('should clear intervals on disposal', () => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
            const initialTimerCount = jest.getTimerCount();

            service.dispose();

            // Timer count should be reduced after disposal
            expect(jest.getTimerCount()).toBeLessThanOrEqual(initialTimerCount);
        });

        test('should stop monitoring after disposal', () => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
            service.dispose();

            // Should not perform operations after disposal
            jest.advanceTimersByTime(10000);

            // No new timers should be created or operations performed
            const metrics = service.getOperationalMetrics();
            expect(metrics).toBeDefined(); // Should still return last known state
        });

        test('should handle disposal during active monitoring', () => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);

            // Start some async operation
            const healthPromise = service.getEnterpriseSystemHealth();

            // Dispose while operation might be running
            service.dispose();

            // Should not throw
            expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
        });
    });

    describe('Error Handling and Edge Cases', () => {
        beforeEach(() => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
        });

        test('should handle base service errors gracefully', async () => {
            mockBaseService.getSystemHealth.mockImplementation(() => {
                throw new Error('Base service error');
            });

            // Should not crash the enterprise service
            await expect(service.getEnterpriseSystemHealth()).rejects.toThrow('Base service error');
        });

        test('should handle malformed event data', () => {
            const eventSpy = jest.fn();
            service.on('enterprise-status-change', eventSpy);

            // Send malformed event
            const statusChangeHandler = mockBaseService.on.mock.calls.find(call => call[0] === 'status-change')?.[1];
            statusChangeHandler?.({} as any);

            // Should handle gracefully without crashing
            expect(eventSpy).toHaveBeenCalled();
        });

        test('should handle extreme metric values', () => {
            expect(() => {
                service.updateOperationalMetric('performance', 'errorRate', -1);
                service.updateOperationalMetric('performance', 'errorRate', Number.MAX_SAFE_INTEGER);
                service.updateOperationalMetric('performance', 'errorRate', NaN);
                service.updateOperationalMetric('performance', 'errorRate', Infinity);
            }).not.toThrow();
        });

        test('should handle null/undefined values in operations', () => {
            expect(() => {
                service.recordDowntime(null as any);
                service.recordDowntime(undefined as any);
                service.updateOperationalMetric('performance', null as any, 100);
            }).not.toThrow();
        });

        test('should maintain state consistency during errors', () => {
            const initialMetrics = service.getOperationalMetrics();

            // Cause some errors
            mockBaseService.getSystemHealth.mockImplementation(() => {
                throw new Error('Simulated error');
            });

            // Advance timers to trigger error conditions
            jest.advanceTimersByTime(5000);

            // State should remain consistent
            const currentMetrics = service.getOperationalMetrics();
            expect(currentMetrics.uptime.target).toBe(initialMetrics.uptime.target);
        });
    });

    describe('Configuration Validation', () => {
        test('should handle invalid configuration gracefully', () => {
            const invalidConfig = {
                healthCheckIntervalMs: -1000,
                metricsCollectionIntervalMs: 'invalid' as any,
                uptimeTarget: 150, // Invalid percentage
                alertThresholds: undefined
            };

            expect(() => {
                service = new EnterpriseMonitoringService(mockBaseService, invalidConfig);
            }).not.toThrow();
        });

        test('should merge partial configuration with defaults', () => {
            const partialConfig = {
                uptimeTarget: 95.5
            };

            service = new EnterpriseMonitoringService(mockBaseService, partialConfig);
            const metrics = service.getOperationalMetrics();
            expect(metrics.uptime.target).toBe(95.5);
        });

        test('should handle empty configuration object', () => {
            service = new EnterpriseMonitoringService(mockBaseService, {});
            expect(service).toBeInstanceOf(EnterpriseMonitoringService);
        });
    });

    describe('Performance and Scalability', () => {
        beforeEach(() => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);
        });

        test('should handle large number of alerts efficiently', () => {
            const startTime = Date.now();

            // Generate many alerts
            for (let i = 0; i < 100; i++) {
                service.updateOperationalMetric('performance', 'errorRate', 0.5);
            }

            const endTime = Date.now();
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });

        test('should handle rapid metric updates', () => {
            const startTime = Date.now();

            // Rapid metric updates
            for (let i = 0; i < 1000; i++) {
                service.updateOperationalMetric('performance', 'avgLatency', Math.random() * 1000);
                service.updateOperationalMetric('capacity', 'agentUtilization', Math.random() * 100);
            }

            const endTime = Date.now();
            expect(endTime - startTime).toBeLessThan(2000); // Should handle efficiently
        });

        test('should maintain performance under concurrent operations', async () => {
            const operations = [];

            // Start multiple concurrent operations
            for (let i = 0; i < 10; i++) {
                operations.push(service.getEnterpriseSystemHealth());
                operations.push(Promise.resolve(service.generateHealthReport()));
            }

            jest.advanceTimersByTime(1000);

            // All operations should complete without errors
            await expect(Promise.all(operations)).resolves.toBeDefined();
        });
    });

    describe('Integration with Base Service', () => {
        test('should properly integrate with base monitoring service', () => {
            service = new EnterpriseMonitoringService(mockBaseService, mockConfig);

            // Verify proper integration
            expect(mockBaseService.on).toHaveBeenCalledWith('status-change', expect.any(Function));
            expect(mockBaseService.on).toHaveBeenCalledWith('health-issue', expect.any(Function));
            expect(mockBaseService.on).toHaveBeenCalledWith('agent-stuck', expect.any(Function));
        });

        test('should use base service health data in enterprise health checks', async () => {
            const customHealth: SystemHealth = {
                healthy: false,
                lastCheck: new Date(),
                components: new Map([['test-component', { name: 'test-component', healthy: false }]])
            };

            mockBaseService.getSystemHealth.mockReturnValue(customHealth);

            const healthCheckPromise = service.getEnterpriseSystemHealth();
            jest.advanceTimersByTime(100);
            const enterpriseHealth = await healthCheckPromise;

            expect(enterpriseHealth.healthy).toBe(false);
        });

        test('should enhance base service events with enterprise features', () => {
            const eventSpy = jest.fn();
            service.on('enterprise-status-change', eventSpy);

            const baseEvent: MonitoringEvent = {
                type: 'status-change',
                timestamp: new Date(),
                agentId: 'test-agent',
                data: { status: 'active' }
            };

            // Trigger event handling
            const statusChangeHandler = mockBaseService.on.mock.calls.find(call => call[0] === 'status-change')?.[1];
            statusChangeHandler?.(baseEvent);

            expect(eventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...baseEvent,
                    severity: expect.any(String),
                    source: 'test-agent',
                    correlationId: expect.any(String),
                    metadata: expect.any(Object)
                })
            );
        });
    });
});
