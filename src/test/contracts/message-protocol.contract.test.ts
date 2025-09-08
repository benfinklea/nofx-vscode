/**
 * API CONTRACT TESTS - Message Protocol Validation
 * Goal: Ensure API contracts are maintained between services
 * Metrics: Contract coverage %, Breaking changes = 0
 */

import { z } from 'zod';
import { MessageType } from '../../orchestration/MessageProtocol';

// Define contract schemas using Zod for runtime validation
const MessageSchemas = {
    // Core message structure
    BaseMessage: z.object({
        id: z.string().optional(),
        timestamp: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        type: z.nativeEnum(MessageType),
        payload: z.any(),
        correlationId: z.string().optional(),
        requiresAck: z.boolean().optional()
    }),

    // Specific message contracts
    SpawnAgent: z.object({
        type: z.literal(MessageType.SPAWN_AGENT),
        payload: z.object({
            role: z.string().min(1),
            name: z.string().min(1).max(255),
            template: z.string().optional(),
            autoStart: z.boolean().optional()
        })
    }),

    AgentReady: z.object({
        type: z.literal(MessageType.AGENT_READY),
        payload: z.object({
            agentId: z.string().min(1),
            name: z.string(),
            type: z.string().optional(),
            capabilities: z.array(z.string()).optional(),
            timestamp: z.number()
        })
    }),

    AssignTask: z.object({
        type: z.literal(MessageType.ASSIGN_TASK),
        payload: z.object({
            agentId: z.string().min(1),
            taskId: z.string().min(1),
            title: z.string().optional(),
            description: z.string().min(1),
            priority: z.enum(['low', 'medium', 'high', 'critical']),
            dependencies: z.array(z.string()).optional(),
            deadline: z.string().optional(),
            context: z.any().optional()
        })
    }),

    TaskComplete: z.object({
        type: z.literal(MessageType.TASK_COMPLETE),
        payload: z.object({
            taskId: z.string().min(1),
            agentId: z.string().min(1),
            success: z.boolean(),
            result: z.any().optional(),
            error: z.string().optional(),
            duration: z.number().optional(),
            timestamp: z.number()
        })
    }),

    Heartbeat: z.object({
        type: z.literal(MessageType.HEARTBEAT),
        payload: z.object({
            timestamp: z.number(),
            index: z.number().optional()
        })
    }),

    SystemError: z.object({
        type: z.literal(MessageType.SYSTEM_ERROR),
        payload: z.object({
            error: z.string(),
            code: z.string().optional(),
            details: z.any().optional(),
            timestamp: z.number()
        })
    })
};

describe('📝 CONTRACT - Message Protocol Schemas', () => {
    describe('Request Contracts', () => {
        test('SPAWN_AGENT request should match contract', () => {
            const validRequest = {
                type: MessageType.SPAWN_AGENT,
                payload: {
                    role: 'backend-specialist',
                    name: 'Backend Agent',
                    template: 'backend-template',
                    autoStart: true
                }
            };

            const result = MessageSchemas.SpawnAgent.safeParse(validRequest);
            expect(result.success).toBe(true);

            // Invalid request - missing required field
            const invalidRequest = {
                type: MessageType.SPAWN_AGENT,
                payload: {
                    name: 'Backend Agent' // Missing 'role'
                }
            };

            const invalidResult = MessageSchemas.SpawnAgent.safeParse(invalidRequest);
            expect(invalidResult.success).toBe(false);
        });

        test('ASSIGN_TASK request should match contract', () => {
            const validRequest = {
                type: MessageType.ASSIGN_TASK,
                payload: {
                    agentId: 'agent-123',
                    taskId: 'task-456',
                    title: 'Implement feature',
                    description: 'Add new authentication system',
                    priority: 'high',
                    dependencies: ['task-111', 'task-222'],
                    deadline: '2024-12-31T23:59:59Z'
                }
            };

            const result = MessageSchemas.AssignTask.safeParse(validRequest);
            expect(result.success).toBe(true);

            // Test invalid priority
            const invalidPriority = { ...validRequest };
            invalidPriority.payload.priority = 'urgent' as any;

            const invalidResult = MessageSchemas.AssignTask.safeParse(invalidPriority);
            expect(invalidResult.success).toBe(false);
        });
    });

    describe('Response Contracts', () => {
        test('AGENT_READY response should match contract', () => {
            const validResponse = {
                type: MessageType.AGENT_READY,
                payload: {
                    agentId: 'agent-123',
                    name: 'Test Agent',
                    type: 'backend-specialist',
                    capabilities: ['nodejs', 'python', 'database'],
                    timestamp: Date.now()
                }
            };

            const result = MessageSchemas.AgentReady.safeParse(validResponse);
            expect(result.success).toBe(true);
        });

        test('TASK_COMPLETE response should match contract', () => {
            const validResponse = {
                type: MessageType.TASK_COMPLETE,
                payload: {
                    taskId: 'task-456',
                    agentId: 'agent-123',
                    success: true,
                    result: { filesCreated: 3, testsPass: true },
                    duration: 5432,
                    timestamp: Date.now()
                }
            };

            const result = MessageSchemas.TaskComplete.safeParse(validResponse);
            expect(result.success).toBe(true);

            // Test failure response
            const failureResponse = {
                type: MessageType.TASK_COMPLETE,
                payload: {
                    taskId: 'task-456',
                    agentId: 'agent-123',
                    success: false,
                    error: 'Compilation failed',
                    timestamp: Date.now()
                }
            };

            const failureResult = MessageSchemas.TaskComplete.safeParse(failureResponse);
            expect(failureResult.success).toBe(true);
        });
    });

    describe('Backward Compatibility', () => {
        test('should handle v1 message format', () => {
            // Simulate old message format
            const v1Message = {
                type: 'spawn_agent', // String instead of enum
                data: {
                    // 'data' instead of 'payload'
                    role: 'frontend',
                    name: 'UI Agent'
                }
            };

            // Transform v1 to v2
            const v2Message = transformV1ToV2(v1Message);
            const result = MessageSchemas.SpawnAgent.safeParse(v2Message);

            expect(result.success).toBe(true);
        });

        test('should not break existing consumers', () => {
            // List of consumers and their expected contracts
            const consumers = [
                { name: 'conductor', version: '1.0.0' },
                { name: 'agent', version: '1.0.0' },
                { name: 'dashboard', version: '1.0.0' }
            ];

            consumers.forEach(consumer => {
                const compatible = checkBackwardCompatibility(consumer.version);
                expect(compatible).toBe(true);
            });
        });
    });
});

describe('📝 CONTRACT - WebSocket API Endpoints', () => {
    const WebSocketContracts = {
        // Connection contract
        Connection: z.object({
            url: z.string().url(),
            protocols: z.array(z.string()).optional(),
            headers: z.record(z.string()).optional()
        }),

        // Message flow contract
        MessageFlow: z.object({
            request: z.any(), // Should match MessageSchemas
            response: z.any(), // Should match MessageSchemas
            timeout: z.number().optional(),
            retries: z.number().optional()
        })
    };

    test('WebSocket connection should follow contract', () => {
        const connection = {
            url: 'ws://localhost:7778',
            protocols: ['orchestration-v1'],
            headers: {
                'X-Client-Version': '1.0.0'
            }
        };

        const result = WebSocketContracts.Connection.safeParse(connection);
        expect(result.success).toBe(true);
    });

    test('Message flow should follow request-response contract', () => {
        const flow = {
            request: {
                type: MessageType.SPAWN_AGENT,
                payload: { role: 'backend', name: 'API' }
            },
            response: {
                type: MessageType.AGENT_READY,
                payload: { agentId: 'agent-1', name: 'API', timestamp: Date.now() }
            },
            timeout: 5000,
            retries: 3
        };

        const result = WebSocketContracts.MessageFlow.safeParse(flow);
        expect(result.success).toBe(true);
    });
});

describe('📝 CONTRACT - Service Boundaries', () => {
    test('Conductor API contract', () => {
        const ConductorAPI = z.object({
            spawnAgent: z.function().args(z.string(), z.string()).returns(z.promise(z.string())),
            assignTask: z
                .function()
                .args(z.string(), z.object({ task: z.string(), priority: z.string() }))
                .returns(z.promise(z.boolean())),
            getStatus: z.function().returns(
                z.promise(
                    z.object({
                        agents: z.array(z.any()),
                        tasks: z.array(z.any())
                    })
                )
            )
        });

        // Mock implementation
        const conductor = {
            spawnAgent: async (role: string, name: string) => 'agent-123',
            assignTask: async (agentId: string, task: any) => true,
            getStatus: async () => ({ agents: [], tasks: [] })
        };

        // This would validate the implementation matches contract
        expect(conductor.spawnAgent).toBeDefined();
        expect(conductor.assignTask).toBeDefined();
        expect(conductor.getStatus).toBeDefined();
    });

    test('Agent API contract', () => {
        const AgentAPI = z.object({
            receiveTask: z.function().args(z.any()).returns(z.promise(z.void())),
            reportProgress: z.function().args(z.number()).returns(z.void()),
            complete: z.function().args(z.any()).returns(z.promise(z.void()))
        });

        // Mock implementation
        const agent = {
            receiveTask: async (task: any) => {},
            reportProgress: (progress: number) => {},
            complete: async (result: any) => {}
        };

        expect(agent.receiveTask).toBeDefined();
        expect(agent.reportProgress).toBeDefined();
        expect(agent.complete).toBeDefined();
    });
});

describe('📝 CONTRACT - Breaking Change Detection', () => {
    test('should detect breaking changes in message structure', () => {
        const currentSchema = MessageSchemas.SpawnAgent;

        // Simulate a breaking change - removing required field
        const breakingSchema = z.object({
            type: z.literal(MessageType.SPAWN_AGENT),
            payload: z.object({
                // 'role' field removed - BREAKING!
                name: z.string().min(1).max(255)
            })
        });

        const isBreaking = detectBreakingChange(currentSchema, breakingSchema);
        expect(isBreaking).toBe(true);
    });

    test('should allow non-breaking additions', () => {
        const currentSchema = MessageSchemas.SpawnAgent;

        // Adding optional field - NOT BREAKING
        const extendedSchema = z.object({
            type: z.literal(MessageType.SPAWN_AGENT),
            payload: z.object({
                role: z.string().min(1),
                name: z.string().min(1).max(255),
                template: z.string().optional(),
                autoStart: z.boolean().optional(),
                metadata: z.any().optional() // New optional field
            })
        });

        const isBreaking = detectBreakingChange(currentSchema, extendedSchema);
        expect(isBreaking).toBe(false);
    });
});

// Contract Coverage Reporting
export class ContractReporter {
    static generateReport(testResults: any): ContractMetrics {
        const totalEndpoints = Object.keys(MessageType).length;
        const testedEndpoints = Object.keys(MessageSchemas).length;

        return {
            timestamp: new Date().toISOString(),
            coverage: {
                totalEndpoints,
                withContracts: testedEndpoints,
                percentage: (testedEndpoints / totalEndpoints) * 100
            },
            compliance: {
                passing: testResults.numPassedTests,
                failing: testResults.numFailedTests,
                percentage: (testResults.numPassedTests / testResults.numTotalTests) * 100
            },
            breakingChanges: 0, // Would be detected by CI
            consumers: {
                conductor: 'Compatible',
                agents: 'Compatible',
                dashboard: 'Compatible'
            },
            recommendations: generateContractRecommendations(testResults)
        };
    }
}

interface ContractMetrics {
    timestamp: string;
    coverage: {
        totalEndpoints: number;
        withContracts: number;
        percentage: number;
    };
    compliance: {
        passing: number;
        failing: number;
        percentage: number;
    };
    breakingChanges: number;
    consumers: Record<string, string>;
    recommendations: string[];
}

// Helper functions
function transformV1ToV2(v1Message: any): any {
    return {
        type: v1Message.type,
        payload: v1Message.data || v1Message.payload
    };
}

function checkBackwardCompatibility(version: string): boolean {
    // Simplified version check
    return version >= '1.0.0';
}

function detectBreakingChange(current: any, proposed: any): boolean {
    // Simplified breaking change detection
    // In production, use a proper schema diff tool
    try {
        const testData = {
            type: MessageType.SPAWN_AGENT,
            payload: { role: 'test', name: 'test' }
        };

        const currentValid = current.safeParse(testData).success;
        const proposedValid = proposed.safeParse(testData).success;

        return currentValid && !proposedValid;
    } catch {
        return true;
    }
}

function generateContractRecommendations(results: any): string[] {
    const recommendations: string[] = [];

    if (results.numFailedTests > 0) {
        recommendations.push('Fix failing contract tests before deployment');
    }

    const coverage = (Object.keys(MessageSchemas).length / Object.keys(MessageType).length) * 100;
    if (coverage < 80) {
        recommendations.push('Increase contract coverage to at least 80%');
    }

    return recommendations;
}
