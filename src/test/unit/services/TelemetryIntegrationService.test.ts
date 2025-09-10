import { TelemetryIntegrationService } from '../../../services/TelemetryIntegrationService';
import { EnterpriseTelemetryService } from '../../../services/EnterpriseTelemetryService';
import { ILoggingService, IEventBus } from '../../../services/interfaces';
import { Agent, Task, TaskStatus } from '../../../agents/types';

// Create comprehensive mocks
const mockEnterpriseTelemetryService = {
    sendEvent: jest.fn().mockResolvedValue(undefined),
    sendErrorEvent: jest.fn().mockResolvedValue(undefined),
    getHealthStatus: jest.fn().mockReturnValue({
        isHealthy: true,
        metrics: { totalEvents: 0 }
    })
};

const mockLoggingService: ILoggingService = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

const mockEventBus: IEventBus = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
    listenerCount: jest.fn().mockReturnValue(0),
    listeners: jest.fn().mockReturnValue([]),
    eventNames: jest.fn().mockReturnValue([])
};

// Helper functions to create test objects
function createTestAgent(overrides?: Partial<Agent>): Agent {
    return {
        id: 'test-agent-123',
        name: 'Test Agent',
        type: 'test-specialist',
        status: 'idle' as const,
        terminal: {} as any,
        currentTask: null,
        startTime: new Date(),
        tasksCompleted: 0,
        capabilities: ['testing', 'debugging'],
        template: { name: 'Test Template' },
        maxConcurrentTasks: 3,
        workingDirectory: '/test/dir',
        ...overrides
    };
}

function createTestTask(overrides?: Partial<Task>): Task {
    return {
        id: 'test-task-456',
        title: 'Test Task',
        description: 'A test task for unit testing',
        priority: 'medium',
        status: 'queued' as TaskStatus,
        createdAt: new Date(),
        estimatedDuration: 300,
        tags: ['testing', 'unit'],
        dependsOn: [],
        requiredCapabilities: ['testing'],
        ...overrides
    };
}

describe('TelemetryIntegrationService - Comprehensive Tests', () => {
    let service: TelemetryIntegrationService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new TelemetryIntegrationService(
            mockEnterpriseTelemetryService as any,
            mockLoggingService,
            mockEventBus
        );
    });

    describe('Constructor', () => {
        it('should create service with required telemetry service', () => {
            const minimalService = new TelemetryIntegrationService(mockEnterpriseTelemetryService as any);
            expect(minimalService).toBeDefined();
        });

        it('should create service with all dependencies', () => {
            expect(service).toBeDefined();
        });

        it('should initialize event listeners', () => {
            // Event listeners should be set up
            expect(mockEventBus.on).toHaveBeenCalled();
        });
    });

    describe('Agent Tracking', () => {
        describe('trackAgentSpawned', () => {
            it('should track agent spawn with basic data', async () => {
                const agent = createTestAgent();
                const spawnDuration = 150;

                await service.trackAgentSpawned(agent, spawnDuration);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'agent.spawned',
                    expect.objectContaining({
                        'agent.type': 'test-specialist',
                        'agent.id': expect.stringMatching(/^[a-f0-9-]+$/), // Sanitized ID
                        'spawn.method': 'user_action'
                    }),
                    expect.objectContaining({
                        'spawn.duration': spawnDuration
                    })
                );
            });

            it('should handle agent without type', async () => {
                const agent = createTestAgent({ type: undefined as any });
                const spawnDuration = 100;

                await service.trackAgentSpawned(agent, spawnDuration);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'agent.spawned',
                    expect.objectContaining({
                        'agent.type': 'unknown'
                    }),
                    expect.any(Object)
                );
            });

            it('should sanitize agent ID', async () => {
                const agent = createTestAgent({ id: 'test-agent-with-<script>alert("xss")</script>' });
                const spawnDuration = 200;

                await service.trackAgentSpawned(agent, spawnDuration);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'agent.spawned',
                    expect.objectContaining({
                        'agent.id': expect.not.stringContaining('<script>')
                    }),
                    expect.any(Object)
                );
            });

            it('should handle telemetry errors gracefully', async () => {
                mockEnterpriseTelemetryService.sendEvent.mockRejectedValueOnce(new Error('Telemetry failed'));

                const agent = createTestAgent();

                await expect(service.trackAgentSpawned(agent, 100)).resolves.not.toThrow();
            });

            it('should handle zero spawn duration', async () => {
                const agent = createTestAgent();

                await service.trackAgentSpawned(agent, 0);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'agent.spawned',
                    expect.any(Object),
                    expect.objectContaining({
                        'spawn.duration': 0
                    })
                );
            });

            it('should handle negative spawn duration', async () => {
                const agent = createTestAgent();

                await service.trackAgentSpawned(agent, -50);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'agent.spawned',
                    expect.any(Object),
                    expect.objectContaining({
                        'spawn.duration': -50
                    })
                );
            });

            it('should handle very large spawn duration', async () => {
                const agent = createTestAgent();
                const largeDuration = Number.MAX_SAFE_INTEGER;

                await service.trackAgentSpawned(agent, largeDuration);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'agent.spawned',
                    expect.any(Object),
                    expect.objectContaining({
                        'spawn.duration': largeDuration
                    })
                );
            });
        });

        describe('trackAgentTerminated', () => {
            it('should track agent termination', async () => {
                const agentId = 'test-agent-789';
                const reason = 'user_request';
                const sessionDuration = 30000;

                await service.trackAgentTerminated(agentId, reason, sessionDuration);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'agent.terminated',
                    expect.objectContaining({
                        'agent.id': expect.stringMatching(/^[a-f0-9-]+$/),
                        'termination.reason': reason
                    }),
                    expect.objectContaining({
                        'session.duration': sessionDuration
                    })
                );
            });

            it('should handle empty reason', async () => {
                await service.trackAgentTerminated('agent-123', '', 1000);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'agent.terminated',
                    expect.objectContaining({
                        'termination.reason': ''
                    }),
                    expect.any(Object)
                );
            });

            it('should sanitize termination reason', async () => {
                const maliciousReason = 'error<script>alert("xss")</script>';

                await service.trackAgentTerminated('agent-123', maliciousReason, 5000);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'agent.terminated',
                    expect.objectContaining({
                        'termination.reason': expect.not.stringContaining('<script>')
                    }),
                    expect.any(Object)
                );
            });

            it('should handle telemetry errors', async () => {
                mockEnterpriseTelemetryService.sendEvent.mockRejectedValueOnce(new Error('Network error'));

                await expect(service.trackAgentTerminated('agent-123', 'test', 1000)).resolves.not.toThrow();
            });
        });
    });

    describe('Task Tracking', () => {
        describe('trackTaskCreated', () => {
            it('should track task creation with all properties', async () => {
                const task = createTestTask({
                    priority: 'high',
                    estimatedDuration: 600,
                    dependsOn: ['task-1', 'task-2'],
                    tags: ['urgent', 'frontend']
                });

                await service.trackTaskCreated(task);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.created',
                    expect.objectContaining({
                        'task.priority': 'high',
                        'task.category': 'urgent',
                        'has.dependencies': 'true'
                    }),
                    expect.objectContaining({
                        'task.estimated_duration': 600,
                        'task.dependencies_count': 2
                    })
                );
            });

            it('should handle task without optional properties', async () => {
                const minimalTask = createTestTask({
                    priority: undefined as any,
                    estimatedDuration: undefined,
                    dependsOn: undefined,
                    tags: undefined
                });

                await service.trackTaskCreated(minimalTask);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.created',
                    expect.objectContaining({
                        'task.priority': 'medium', // Default value
                        'task.category': 'general', // Default value
                        'has.dependencies': 'false'
                    }),
                    expect.objectContaining({
                        'task.estimated_duration': 0,
                        'task.dependencies_count': 0
                    })
                );
            });

            it('should handle empty dependencies array', async () => {
                const task = createTestTask({ dependsOn: [] });

                await service.trackTaskCreated(task);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.created',
                    expect.objectContaining({
                        'has.dependencies': 'false'
                    }),
                    expect.objectContaining({
                        'task.dependencies_count': 0
                    })
                );
            });

            it('should handle empty tags array', async () => {
                const task = createTestTask({ tags: [] });

                await service.trackTaskCreated(task);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.created',
                    expect.objectContaining({
                        'task.category': 'general'
                    }),
                    expect.any(Object)
                );
            });

            it('should use first tag as category', async () => {
                const task = createTestTask({ tags: ['backend', 'database', 'api'] });

                await service.trackTaskCreated(task);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.created',
                    expect.objectContaining({
                        'task.category': 'backend'
                    }),
                    expect.any(Object)
                );
            });

            it('should handle telemetry errors', async () => {
                mockEnterpriseTelemetryService.sendEvent.mockRejectedValueOnce(
                    new Error('Telemetry service unavailable')
                );

                const task = createTestTask();

                await expect(service.trackTaskCreated(task)).resolves.not.toThrow();
            });
        });

        describe('trackTaskCompleted', () => {
            it('should track task completion with duration variance', async () => {
                const task = createTestTask({
                    estimatedDuration: 300 // 5 minutes
                });
                const actualDuration = 450; // 7.5 minutes

                await service.trackTaskCompleted(task, actualDuration);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.completed',
                    expect.objectContaining({
                        'task.category': 'testing'
                    }),
                    expect.objectContaining({
                        'task.actual_duration': actualDuration,
                        'task.estimated_duration': 300,
                        'task.duration_variance': 0.5 // 50% over estimate
                    })
                );
            });

            it('should handle task without estimated duration', async () => {
                const task = createTestTask({ estimatedDuration: undefined });
                const actualDuration = 200;

                await service.trackTaskCompleted(task, actualDuration);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.completed',
                    expect.any(Object),
                    expect.objectContaining({
                        'task.actual_duration': actualDuration,
                        'task.estimated_duration': 0,
                        'task.duration_variance': 0
                    })
                );
            });

            it('should handle zero estimated duration', async () => {
                const task = createTestTask({ estimatedDuration: 0 });
                const actualDuration = 100;

                await service.trackTaskCompleted(task, actualDuration);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.completed',
                    expect.any(Object),
                    expect.objectContaining({
                        'task.duration_variance': 0 // Avoid division by zero
                    })
                );
            });

            it('should handle negative actual duration', async () => {
                const task = createTestTask();
                const actualDuration = -50;

                await service.trackTaskCompleted(task, actualDuration);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.completed',
                    expect.any(Object),
                    expect.objectContaining({
                        'task.actual_duration': actualDuration
                    })
                );
            });
        });

        describe('trackTaskFailed', () => {
            it('should track task failure with error details', async () => {
                const task = createTestTask();
                const error = new Error('Task execution failed');

                await service.trackTaskFailed(task, error);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.failed',
                    expect.objectContaining({
                        'task.category': 'testing',
                        'error.type': 'Error',
                        'error.message': 'Task execution failed'
                    }),
                    expect.any(Object)
                );

                expect(mockEnterpriseTelemetryService.sendErrorEvent).toHaveBeenCalledWith(
                    error,
                    expect.objectContaining({
                        context: 'task_execution',
                        'task.id': expect.stringMatching(/^[a-f0-9-]+$/),
                        'task.category': 'testing'
                    })
                );
            });

            it('should handle non-Error objects', async () => {
                const task = createTestTask();
                const errorString = 'String error message';

                await service.trackTaskFailed(task, errorString as any);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.failed',
                    expect.objectContaining({
                        'error.type': 'string',
                        'error.message': errorString
                    }),
                    expect.any(Object)
                );
            });

            it('should handle null error', async () => {
                const task = createTestTask();

                await service.trackTaskFailed(task, null as any);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.failed',
                    expect.objectContaining({
                        'error.type': 'null',
                        'error.message': 'Unknown error'
                    }),
                    expect.any(Object)
                );
            });

            it('should handle undefined error', async () => {
                const task = createTestTask();

                await service.trackTaskFailed(task, undefined as any);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.failed',
                    expect.objectContaining({
                        'error.type': 'undefined',
                        'error.message': 'Unknown error'
                    }),
                    expect.any(Object)
                );
            });

            it('should handle object errors', async () => {
                const task = createTestTask();
                const errorObj = { code: 'TASK_FAILED', details: 'Network timeout' };

                await service.trackTaskFailed(task, errorObj as any);

                expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                    'task.failed',
                    expect.objectContaining({
                        'error.type': 'object'
                    }),
                    expect.any(Object)
                );
            });

            it('should handle telemetry service errors during error tracking', async () => {
                mockEnterpriseTelemetryService.sendEvent.mockRejectedValueOnce(new Error('Telemetry unavailable'));
                mockEnterpriseTelemetryService.sendErrorEvent.mockRejectedValueOnce(
                    new Error('Error telemetry unavailable')
                );

                const task = createTestTask();
                const error = new Error('Task failed');

                await expect(service.trackTaskFailed(task, error)).resolves.not.toThrow();
            });
        });
    });

    describe('User Interaction Tracking', () => {
        it('should track command executions', async () => {
            await service.trackCommandExecuted('nofx.spawnAgent', 'success', 250);

            expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                'command.executed',
                expect.objectContaining({
                    'command.name': 'nofx.spawnAgent',
                    'command.result': 'success'
                }),
                expect.objectContaining({
                    'command.duration': 250
                })
            );
        });

        it('should track UI interactions', async () => {
            await service.trackUIInteraction('button_click', 'spawn_agent_button', {
                agentType: 'frontend'
            });

            expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                'ui.interaction',
                expect.objectContaining({
                    'interaction.type': 'button_click',
                    'interaction.target': 'spawn_agent_button'
                }),
                expect.any(Object)
            );
        });

        it('should handle UI interactions without context', async () => {
            await service.trackUIInteraction('menu_open', 'main_menu');

            expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                'ui.interaction',
                expect.objectContaining({
                    'interaction.type': 'menu_open',
                    'interaction.target': 'main_menu'
                }),
                expect.any(Object)
            );
        });

        it('should sanitize UI interaction data', async () => {
            const maliciousTarget = 'button<script>alert("xss")</script>';

            await service.trackUIInteraction('click', maliciousTarget);

            expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                'ui.interaction',
                expect.objectContaining({
                    'interaction.target': expect.not.stringContaining('<script>')
                }),
                expect.any(Object)
            );
        });
    });

    describe('System Health Tracking', () => {
        it('should track system health metrics', async () => {
            const healthData = {
                cpuUsage: 45.6,
                memoryUsage: 78.2,
                activeAgents: 3,
                queuedTasks: 7
            };

            await service.trackSystemHealth(healthData);

            expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                'system.health',
                expect.objectContaining({
                    'health.status': 'healthy'
                }),
                expect.objectContaining({
                    'system.cpu_usage': 45.6,
                    'system.memory_usage': 78.2,
                    'agents.active_count': 3,
                    'tasks.queued_count': 7
                })
            );
        });

        it('should handle partial health data', async () => {
            const partialHealthData = {
                memoryUsage: 82.1
            };

            await service.trackSystemHealth(partialHealthData);

            expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                'system.health',
                expect.any(Object),
                expect.objectContaining({
                    'system.memory_usage': 82.1
                })
            );
        });

        it('should handle empty health data', async () => {
            await service.trackSystemHealth({});

            expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                'system.health',
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('should handle health data with invalid values', async () => {
            const invalidHealthData = {
                cpuUsage: 'invalid' as any,
                memoryUsage: null as any,
                activeAgents: -1,
                queuedTasks: Infinity
            };

            await service.trackSystemHealth(invalidHealthData);

            // Should filter out invalid values
            expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledWith(
                'system.health',
                expect.any(Object),
                expect.objectContaining({
                    'agents.active_count': -1 // Negative numbers might be valid in some contexts
                })
            );
        });
    });

    describe('Performance Monitoring', () => {
        it('should collect and report performance metrics', () => {
            // Record some performance metrics
            service.recordPerformanceMetric('agent.spawn.duration', 150);
            service.recordPerformanceMetric('agent.spawn.duration', 200);
            service.recordPerformanceMetric('agent.spawn.duration', 175);

            const metrics = service.getPerformanceMetrics();

            expect(metrics).toHaveProperty('agent.spawn.duration');
            expect(metrics['agent.spawn.duration']).toHaveProperty('count', 3);
            expect(metrics['agent.spawn.duration']).toHaveProperty('average');
            expect(metrics['agent.spawn.duration']).toHaveProperty('min', 150);
            expect(metrics['agent.spawn.duration']).toHaveProperty('max', 200);
        });

        it('should handle performance metrics for different operations', () => {
            service.recordPerformanceMetric('task.execution.duration', 500);
            service.recordPerformanceMetric('command.execution.duration', 100);

            const metrics = service.getPerformanceMetrics();

            expect(metrics).toHaveProperty('task.execution.duration');
            expect(metrics).toHaveProperty('command.execution.duration');
        });

        it('should handle zero and negative performance values', () => {
            service.recordPerformanceMetric('test.metric', 0);
            service.recordPerformanceMetric('test.metric', -50);
            service.recordPerformanceMetric('test.metric', 100);

            const metrics = service.getPerformanceMetrics();

            expect(metrics['test.metric'].min).toBe(-50);
            expect(metrics['test.metric'].max).toBe(100);
        });

        it('should handle very large performance values', () => {
            const largeValue = Number.MAX_SAFE_INTEGER;
            service.recordPerformanceMetric('large.metric', largeValue);

            const metrics = service.getPerformanceMetrics();

            expect(metrics['large.metric'].max).toBe(largeValue);
        });

        it('should handle many performance measurements', () => {
            for (let i = 0; i < 1000; i++) {
                service.recordPerformanceMetric('bulk.metric', i);
            }

            const metrics = service.getPerformanceMetrics();

            expect(metrics['bulk.metric'].count).toBe(1000);
            expect(metrics['bulk.metric'].min).toBe(0);
            expect(metrics['bulk.metric'].max).toBe(999);
        });
    });

    describe('Input Sanitization', () => {
        it('should sanitize string inputs with HTML tags', () => {
            const maliciousString = '<script>alert("xss")</script>test';
            const sanitized = (service as any).sanitizeString(maliciousString);

            expect(sanitized).not.toContain('<script>');
            expect(sanitized).not.toContain('</script>');
        });

        it('should sanitize string inputs with SQL injection attempts', () => {
            const sqlInjection = "'; DROP TABLE users; --";
            const sanitized = (service as any).sanitizeString(sqlInjection);

            expect(sanitized).not.toContain('DROP TABLE');
        });

        it('should sanitize ID fields', () => {
            const maliciousId = 'agent-123<script>alert("xss")</script>';
            const sanitized = (service as any).sanitizeId(maliciousId);

            expect(sanitized).toMatch(/^[a-f0-9-]+$/); // Should be hashed
        });

        it('should handle null and undefined strings', () => {
            const nullSanitized = (service as any).sanitizeString(null);
            const undefinedSanitized = (service as any).sanitizeString(undefined);

            expect(nullSanitized).toBe('');
            expect(undefinedSanitized).toBe('');
        });

        it('should handle non-string values', () => {
            const numberSanitized = (service as any).sanitizeString(123);
            const objectSanitized = (service as any).sanitizeString({ test: 'value' });

            expect(typeof numberSanitized).toBe('string');
            expect(typeof objectSanitized).toBe('string');
        });

        it('should truncate very long strings', () => {
            const longString = 'x'.repeat(10000);
            const sanitized = (service as any).sanitizeString(longString);

            expect(sanitized.length).toBeLessThanOrEqual(1000); // Reasonable limit
        });
    });

    describe('Session Management', () => {
        it('should generate consistent session IDs', () => {
            const sessionId1 = (service as any).getSessionId();
            const sessionId2 = (service as any).getSessionId();

            expect(sessionId1).toBe(sessionId2); // Should be consistent within session
            expect(sessionId1).toBeTruthy();
        });

        it('should track session duration', () => {
            const sessionDuration = Date.now() - (service as any).sessionStart;
            expect(sessionDuration).toBeGreaterThanOrEqual(0);
        });

        it('should increment user action count', async () => {
            const initialCount = (service as any).userActionCount;

            const agent = createTestAgent();
            await service.trackAgentSpawned(agent, 100);

            const newCount = (service as any).userActionCount;
            expect(newCount).toBeGreaterThan(initialCount);
        });

        it('should track error count', async () => {
            const initialErrorCount = (service as any).errorCount;

            const task = createTestTask();
            const error = new Error('Test error');
            await service.trackTaskFailed(task, error);

            const newErrorCount = (service as any).errorCount;
            expect(newErrorCount).toBeGreaterThan(initialErrorCount);
        });
    });

    describe('Error Handling', () => {
        it('should handle telemetry service initialization errors', async () => {
            mockEnterpriseTelemetryService.sendEvent.mockRejectedValue(new Error('Service not initialized'));

            const agent = createTestAgent();

            await expect(service.trackAgentSpawned(agent, 100)).resolves.not.toThrow();
        });

        it('should handle network timeout errors', async () => {
            mockEnterpriseTelemetryService.sendEvent.mockRejectedValue(new Error('Network timeout'));

            const task = createTestTask();

            await expect(service.trackTaskCreated(task)).resolves.not.toThrow();
        });

        it('should handle service unavailable errors', async () => {
            mockEnterpriseTelemetryService.sendEvent.mockRejectedValue(new Error('Service temporarily unavailable'));

            await expect(service.trackCommandExecuted('test.command', 'success', 100)).resolves.not.toThrow();
        });

        it('should continue operation after telemetry errors', async () => {
            // First call fails
            mockEnterpriseTelemetryService.sendEvent
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValueOnce(undefined);

            const agent = createTestAgent();

            // First call should not throw
            await expect(service.trackAgentSpawned(agent, 100)).resolves.not.toThrow();

            // Second call should succeed
            await expect(service.trackAgentSpawned(agent, 150)).resolves.not.toThrow();

            expect(mockEnterpriseTelemetryService.sendEvent).toHaveBeenCalledTimes(2);
        });
    });

    describe('Integration with EventBus', () => {
        it('should set up event listeners', () => {
            new TelemetryIntegrationService(mockEnterpriseTelemetryService as any, mockLoggingService, mockEventBus);

            expect(mockEventBus.on).toHaveBeenCalled();
        });

        it('should handle event bus errors gracefully', () => {
            mockEventBus.on.mockImplementation(() => {
                throw new Error('Event bus error');
            });

            expect(
                () =>
                    new TelemetryIntegrationService(
                        mockEnterpriseTelemetryService as any,
                        mockLoggingService,
                        mockEventBus
                    )
            ).not.toThrow();
        });
    });
});
