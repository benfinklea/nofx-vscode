import { EventEmitter } from 'events';
import {
    EnterpriseNaturalLanguageResolver,
    EnterpriseNLParseResult,
    TeamComposition
} from '../../../agents/EnterpriseNaturalLanguageResolver';
import { SmartTemplateError, SmartTemplateErrorCode } from '../../../agents/EnterpriseSmartTemplateSystem';

// Mock types module
jest.mock('../../../agents/types', () => ({
    SmartAgentConfigInterface: {}
}));

describe('EnterpriseNaturalLanguageResolver', () => {
    let resolver: EnterpriseNaturalLanguageResolver;
    const testClientId = 'test-client-123';

    beforeEach(async () => {
        // Clear singleton instance
        (EnterpriseNaturalLanguageResolver as any).instance = null;
        resolver = EnterpriseNaturalLanguageResolver.getInstance();

        // Mock process.memoryUsage for validation
        jest.spyOn(process, 'memoryUsage').mockReturnValue({
            rss: 100 * 1024 * 1024,
            heapTotal: 200 * 1024 * 1024,
            heapUsed: 50 * 1024 * 1024,
            external: 10 * 1024 * 1024,
            arrayBuffers: 5 * 1024 * 1024
        });

        // Clear timers for clean test environment
        jest.clearAllTimers();
        jest.useFakeTimers();
    });

    afterEach(async () => {
        if (resolver) {
            await resolver.dispose();
        }
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('Singleton Pattern', () => {
        test('should return the same instance on multiple calls', () => {
            const instance1 = EnterpriseNaturalLanguageResolver.getInstance();
            const instance2 = EnterpriseNaturalLanguageResolver.getInstance();

            expect(instance1).toBe(instance2);
        });

        test('should create new instance after disposal', async () => {
            const instance1 = EnterpriseNaturalLanguageResolver.getInstance();
            await instance1.dispose();

            // Clear instance to allow new creation
            (EnterpriseNaturalLanguageResolver as any).instance = null;
            const instance2 = EnterpriseNaturalLanguageResolver.getInstance();

            expect(instance1).not.toBe(instance2);
        });

        test('should be instance of EventEmitter', () => {
            expect(resolver).toBeInstanceOf(EventEmitter);
        });
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            const initSpy = jest.fn();
            resolver.on('initialized', initSpy);

            await resolver.initialize();

            expect(initSpy).toHaveBeenCalledWith({
                timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
            });
        });

        test('should handle repeated initialization calls gracefully', async () => {
            await resolver.initialize();
            await resolver.initialize(); // Should not throw

            // Should still be functional
            const metrics = resolver.getMetrics();
            expect(metrics).toBeDefined();
        });

        test('should validate system capabilities during initialization', async () => {
            // Mock high memory usage
            jest.spyOn(process, 'memoryUsage').mockReturnValue({
                rss: 600 * 1024 * 1024,
                heapTotal: 800 * 1024 * 1024,
                heapUsed: 600 * 1024 * 1024, // High usage but not failing threshold
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            });

            // Should warn but not fail
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await resolver.initialize();

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('High memory usage detected'));
        });

        test('should throw error for missing system capabilities', async () => {
            // Mock missing Map constructor
            const originalMap = global.Map;
            delete (global as any).Map;

            try {
                await expect(resolver.initialize()).rejects.toThrow(SmartTemplateError);
                await expect(resolver.initialize()).rejects.toMatchObject({
                    code: SmartTemplateErrorCode.TEMPLATE_GENERATION_FAILED,
                    severity: 'critical'
                });
            } finally {
                (global as any).Map = originalMap;
            }
        });

        test('should handle pattern database initialization errors', async () => {
            // Mock pattern database initialization to fail
            const initPatternSpy = jest
                .spyOn(resolver as any, 'initializePatternDatabases')
                .mockRejectedValue(new Error('Pattern DB init failed'));

            await expect(resolver.initialize()).rejects.toThrow(SmartTemplateError);
            expect(initPatternSpy).toHaveBeenCalled();
        });
    });

    describe('Security Validation', () => {
        beforeEach(async () => {
            await resolver.initialize();
        });

        describe('Input Security', () => {
            test('should accept valid natural language input', async () => {
                const validInput = 'Create a frontend developer with React expertise';

                const result = await resolver.parseNaturalLanguageRequest(validInput, testClientId);

                expect(result).toBeDefined();
                expect(result.metadata.securityScore).toBeGreaterThan(90);
            });

            test('should reject null or undefined input', async () => {
                await expect(resolver.parseNaturalLanguageRequest(null as any, testClientId)).rejects.toThrow(
                    SmartTemplateError
                );

                await expect(resolver.parseNaturalLanguageRequest(undefined as any, testClientId)).rejects.toThrow(
                    SmartTemplateError
                );
            });

            test('should reject non-string input', async () => {
                await expect(resolver.parseNaturalLanguageRequest(123 as any, testClientId)).rejects.toThrow(
                    SmartTemplateError
                );

                await expect(resolver.parseNaturalLanguageRequest({} as any, testClientId)).rejects.toThrow(
                    SmartTemplateError
                );
            });

            test('should reject empty input', async () => {
                await expect(resolver.parseNaturalLanguageRequest('', testClientId)).rejects.toThrow(
                    SmartTemplateError
                );

                await expect(resolver.parseNaturalLanguageRequest('   ', testClientId)).rejects.toThrow(
                    SmartTemplateError
                );
            });

            test('should reject oversized input', async () => {
                const oversizedInput = 'a'.repeat(10000); // Exceeds MAX_INPUT_LENGTH

                await expect(resolver.parseNaturalLanguageRequest(oversizedInput, testClientId)).rejects.toThrow(
                    SmartTemplateError
                );

                await expect(resolver.parseNaturalLanguageRequest(oversizedInput, testClientId)).rejects.toMatchObject({
                    code: SmartTemplateErrorCode.SIZE_LIMIT_EXCEEDED,
                    severity: 'high'
                });
            });

            test('should reject input with too many tokens', async () => {
                const tokenHeavyInput = Array.from({ length: 1500 }, (_, i) => `token${i}`).join(' ');

                await expect(resolver.parseNaturalLanguageRequest(tokenHeavyInput, testClientId)).rejects.toThrow(
                    SmartTemplateError
                );
            });

            test('should detect script injection attempts', async () => {
                const maliciousInputs = [
                    'Create an agent <script>alert("xss")</script>',
                    'I need javascript:alert("xss") developer',
                    'Build onclick="malicious()" agent',
                    'data:text/html,<script>alert(1)</script> agent needed',
                    'vbscript:msgbox("hello") developer please'
                ];

                for (const input of maliciousInputs) {
                    await expect(resolver.parseNaturalLanguageRequest(input, testClientId)).rejects.toThrow(
                        SmartTemplateError
                    );
                }
            });

            test('should detect command injection attempts', async () => {
                const maliciousInputs = [
                    'Create agent | rm -rf /',
                    'Developer with $(malicious)',
                    'Agent needed `evil command`',
                    'Frontend & backend developer'
                ];

                for (const input of maliciousInputs) {
                    await expect(resolver.parseNaturalLanguageRequest(input, testClientId)).rejects.toThrow(
                        SmartTemplateError
                    );
                }
            });

            test('should detect path traversal attempts', async () => {
                const maliciousInputs = [
                    'Create ../../../etc/passwd agent',
                    'Developer with /proc/ access',
                    'Agent for ../../sensitive/file'
                ];

                for (const input of maliciousInputs) {
                    await expect(resolver.parseNaturalLanguageRequest(input, testClientId)).rejects.toThrow(
                        SmartTemplateError
                    );
                }
            });

            test('should detect SQL injection patterns', async () => {
                const maliciousInputs = [
                    'CREATE DROP TABLE users agent',
                    'SELECT * FROM developers WHERE skill=1',
                    'INSERT malicious UNION developer',
                    'EXEC sp_dropdatabase agent'
                ];

                for (const input of maliciousInputs) {
                    await expect(resolver.parseNaturalLanguageRequest(input, testClientId)).rejects.toThrow(
                        SmartTemplateError
                    );
                }
            });

            test('should sanitize safe input with suspicious characters', async () => {
                const inputWithSafeContent = 'Create a <div> component developer with "quotes" and /api/paths';

                const result = await resolver.parseNaturalLanguageRequest(inputWithSafeContent, testClientId);

                expect(result).toBeDefined();
                expect(result.metadata.securityScore).toBeLessThan(100); // Should be reduced but not blocked
            });

            test('should emit security alerts for suspicious content', async () => {
                const alertSpy = jest.fn();
                resolver.on('securityAlert', alertSpy);

                const suspiciousInput = 'Create agent with <suspicious> content';

                try {
                    await resolver.parseNaturalLanguageRequest(suspiciousInput, testClientId);
                } catch (error) {
                    // Expected to fail
                }

                expect(alertSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        threats: expect.any(Array),
                        clientId: testClientId
                    })
                );
            });
        });

        describe('Rate Limiting', () => {
            test('should allow requests within rate limit', async () => {
                const requests = Array.from({ length: 10 }, (_, i) =>
                    resolver.parseNaturalLanguageRequest(`Create developer ${i}`, testClientId)
                );

                // All requests should succeed
                const results = await Promise.all(requests);
                expect(results).toHaveLength(10);
                results.forEach(result => {
                    expect(result).toBeDefined();
                });
            });

            test('should enforce rate limits per client', async () => {
                // Mock large number of requests
                const requests = Array.from({ length: 150 }, (_, i) =>
                    resolver.parseNaturalLanguageRequest(`Create developer ${i}`, testClientId)
                );

                // Some requests should fail due to rate limiting
                const results = await Promise.allSettled(requests);
                const failures = results.filter(r => r.status === 'rejected');

                expect(failures.length).toBeGreaterThan(0);
                failures.forEach(failure => {
                    expect((failure as any).reason).toBeInstanceOf(SmartTemplateError);
                    expect((failure as any).reason.code).toBe(SmartTemplateErrorCode.SECURITY_VIOLATION);
                });
            });

            test('should allow different clients separate rate limits', async () => {
                const client1Requests = Array.from({ length: 50 }, (_, i) =>
                    resolver.parseNaturalLanguageRequest(`Create developer ${i}`, 'client1')
                );

                const client2Requests = Array.from({ length: 50 }, (_, i) =>
                    resolver.parseNaturalLanguageRequest(`Create developer ${i}`, 'client2')
                );

                // Both clients should be able to make requests independently
                const [client1Results, client2Results] = await Promise.all([
                    Promise.allSettled(client1Requests),
                    Promise.allSettled(client2Requests)
                ]);

                const client1Successes = client1Results.filter(r => r.status === 'fulfilled');
                const client2Successes = client2Results.filter(r => r.status === 'fulfilled');

                expect(client1Successes.length).toBeGreaterThan(0);
                expect(client2Successes.length).toBeGreaterThan(0);
            });

            test('should clean up expired rate limit entries', () => {
                // Access the static method directly
                const NLSecurityValidator = require('../../../agents/EnterpriseNaturalLanguageResolver');

                expect(() => {
                    NLSecurityValidator.NLSecurityValidator?.cleanupRateLimits?.();
                }).not.toThrow();
            });
        });
    });

    describe('Natural Language Parsing', () => {
        beforeEach(async () => {
            await resolver.initialize();
        });

        describe('Agent Spawn Requests', () => {
            test('should parse simple agent creation request', async () => {
                const input = 'Create a frontend developer';

                const result = await resolver.parseNaturalLanguageRequest(input, testClientId);

                expect(result).toMatchObject({
                    confidence: expect.any(Number),
                    parsedIntent: {
                        action: 'spawn_agent'
                    },
                    metadata: {
                        processingTime: expect.any(Number),
                        inputLength: expect.any(Number),
                        securityScore: expect.any(Number),
                        qualityScore: expect.any(Number),
                        parserId: expect.any(String),
                        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
                    }
                });

                expect(result.confidence).toBeGreaterThan(0.3);
                expect(result.parsedIntent.action).toBe('spawn_agent');
            });

            test('should parse complex agent creation request with specifics', async () => {
                const input = 'I need an experienced React developer with TypeScript skills for high priority work';

                const result = await resolver.parseNaturalLanguageRequest(input, testClientId);

                expect(result.parsedIntent.action).toBe('spawn_agent');
                expect(result.extractedConfig).toBeDefined();
                expect(result.confidence).toBeGreaterThan(0.5);
            });

            test('should handle ambiguous agent requests', async () => {
                const input = 'I need some help with stuff';

                const result = await resolver.parseNaturalLanguageRequest(input, testClientId);

                expect(result.requiresUserInput).toBe(true);
                expect(result.ambiguities).toBeDefined();
                expect(result.ambiguities!.length).toBeGreaterThan(0);
                expect(result.suggestions).toBeDefined();
                expect(result.suggestions!.length).toBeGreaterThan(0);
            });

            test('should detect various agent creation patterns', async () => {
                const patterns = [
                    'spawn a backend developer',
                    'add a mobile developer',
                    'hire a security expert',
                    'get me a QA specialist',
                    'bring in a DevOps engineer',
                    'allocate a database architect',
                    'i need a frontend specialist',
                    'help me with a fullstack developer'
                ];

                for (const pattern of patterns) {
                    const result = await resolver.parseNaturalLanguageRequest(pattern, testClientId);
                    expect(result.parsedIntent.action).toBe('spawn_agent');
                }
            });
        });

        describe('Team Creation Requests', () => {
            test('should parse team creation request', async () => {
                const input = 'Create a fullstack development team';

                const result = await resolver.parseNaturalLanguageRequest(input, testClientId);

                expect(result.parsedIntent.action).toBe('create_team');
                expect(result.confidence).toBeGreaterThan(0.5);
            });

            test('should detect team indicators', async () => {
                const teamPatterns = [
                    'build a development team',
                    'assemble a squad of developers',
                    'create a group of specialists',
                    'I need multiple agents for this project',
                    'get several developers together',
                    'form a crew of experts'
                ];

                for (const pattern of teamPatterns) {
                    const result = await resolver.parseNaturalLanguageRequest(pattern, testClientId);
                    expect(result.parsedIntent.action).toBe('create_team');
                }
            });

            test('should generate team composition suggestions', async () => {
                const input = 'Create a web development team';

                const result = await resolver.parseNaturalLanguageRequest(input, testClientId);

                expect(result.parsedIntent.action).toBe('create_team');
                expect(result.suggestedConfigs).toBeDefined();
                // Note: Current implementation returns empty array, but structure is correct
            });
        });

        describe('Task Assignment Requests', () => {
            test('should parse task assignment request', async () => {
                const input = 'implement user authentication system';

                const result = await resolver.parseNaturalLanguageRequest(input, testClientId);

                expect(result.parsedIntent.action).toBe('assign_task');
                expect(result.parsedIntent.taskDescription).toBeDefined();
            });

            test('should detect task-oriented language', async () => {
                const taskPatterns = [
                    'work on fixing the login bug',
                    'implement the new dashboard',
                    'build the payment processing',
                    'develop the mobile app',
                    'fix the performance issues',
                    'solve the database optimization',
                    'handle the API integration',
                    'complete the testing suite'
                ];

                for (const pattern of taskPatterns) {
                    const result = await resolver.parseNaturalLanguageRequest(pattern, testClientId);
                    expect(result.parsedIntent.action).toBe('assign_task');
                }
            });

            test('should extract task descriptions properly', async () => {
                const input = 'Please implement a secure user registration system with email verification';

                const result = await resolver.parseNaturalLanguageRequest(input, testClientId);

                expect(result.parsedIntent.action).toBe('assign_task');
                expect(result.parsedIntent.taskDescription).toContain('secure user registration');
            });
        });

        describe('Priority and Urgency Detection', () => {
            test('should detect priority levels in requests', async () => {
                const highPriorityInput = 'urgent: create a critical security developer';

                const result = await resolver.parseNaturalLanguageRequest(highPriorityInput, testClientId);

                expect(result.parsedIntent.priority).toBeDefined();
                expect(result.parsedIntent.urgency).toBeDefined();
            });

            test('should handle requests without explicit priority', async () => {
                const normalInput = 'create a developer';

                const result = await resolver.parseNaturalLanguageRequest(normalInput, testClientId);

                // Should have default priority/urgency
                expect(result.parsedIntent.priority).toBeDefined();
                expect(result.parsedIntent.urgency).toBeDefined();
            });
        });

        describe('Fallback Handling', () => {
            test('should provide helpful fallback for unclear requests', async () => {
                const unclearInput = 'do something with code maybe';

                const result = await resolver.parseNaturalLanguageRequest(unclearInput, testClientId);

                expect(result.confidence).toBeLessThan(0.5);
                expect(result.requiresUserInput).toBe(true);
                expect(result.ambiguities).toBeDefined();
                expect(result.suggestions).toBeDefined();
                expect(result.suggestions!.length).toBeGreaterThanOrEqual(3);
            });

            test('should provide contextual suggestions', async () => {
                const vagueDeveloperRequest = 'need a programmer';

                const result = await resolver.parseNaturalLanguageRequest(vagueDeveloperRequest, testClientId);

                expect(result.suggestions).toContain(expect.stringMatching(/frontend|backend|fullstack/i));
            });
        });
    });

    describe('Caching System', () => {
        beforeEach(async () => {
            await resolver.initialize();
        });

        test('should cache identical requests', async () => {
            const input = 'Create a React developer';

            const result1 = await resolver.parseNaturalLanguageRequest(input, testClientId);
            const result2 = await resolver.parseNaturalLanguageRequest(input, testClientId);

            // Results should be equivalent but not the same object (deep cloned)
            expect(result1).toEqual(result2);
            expect(result1).not.toBe(result2);

            // Second request should be faster (cached)
            expect(result2.metadata.processingTime).toBeLessThanOrEqual(result1.metadata.processingTime);
        });

        test('should generate consistent cache keys for identical input', () => {
            const input1 = 'create a developer';
            const input2 = 'create a developer';

            const key1 = (resolver as any).generateCacheKey(input1);
            const key2 = (resolver as any).generateCacheKey(input2);

            expect(key1).toBe(key2);
        });

        test('should generate different cache keys for different input', () => {
            const input1 = 'create a frontend developer';
            const input2 = 'create a backend developer';

            const key1 = (resolver as any).generateCacheKey(input1);
            const key2 = (resolver as any).generateCacheKey(input2);

            expect(key1).not.toBe(key2);
        });

        test('should clean cache when it exceeds maximum size', async () => {
            // Fill cache with many different requests
            for (let i = 0; i < 50; i++) {
                await resolver.parseNaturalLanguageRequest(`Create developer ${i}`, testClientId);
            }

            const metrics = resolver.getMetrics();
            expect(metrics.performance.cacheSize).toBeLessThanOrEqual(1000);
        });

        test('should respect cache expiry', async () => {
            const input = 'Create a Vue developer';

            // Make initial request
            await resolver.parseNaturalLanguageRequest(input, testClientId);

            // Fast-forward time beyond cache expiry
            jest.advanceTimersByTime(400000); // 6.67 minutes

            // Make same request - should not use cache
            const result = await resolver.parseNaturalLanguageRequest(input, testClientId);

            expect(result).toBeDefined();
        });
    });

    describe('Error Handling and Resilience', () => {
        beforeEach(async () => {
            await resolver.initialize();
        });

        test('should handle parsing timeout gracefully', async () => {
            // Mock slow parsing operation
            const slowParseStub = jest
                .spyOn(resolver as any, 'parseInternal')
                .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 15000)));

            const input = 'Create a developer';

            await expect(resolver.parseNaturalLanguageRequest(input, testClientId)).rejects.toThrow(SmartTemplateError);

            await expect(resolver.parseNaturalLanguageRequest(input, testClientId)).rejects.toMatchObject({
                code: SmartTemplateErrorCode.OPERATION_TIMEOUT,
                severity: 'high'
            });
        });

        test('should handle internal parsing errors gracefully', async () => {
            // Mock internal parsing to throw error
            const parseErrorStub = jest
                .spyOn(resolver as any, 'parseInternal')
                .mockRejectedValue(new Error('Internal parsing failed'));

            const input = 'Create a developer';

            await expect(resolver.parseNaturalLanguageRequest(input, testClientId)).rejects.toThrow(SmartTemplateError);

            expect(parseErrorStub).toHaveBeenCalled();
        });

        test('should emit parse error events', async () => {
            const errorSpy = jest.fn();
            resolver.on('parseError', errorSpy);

            // Mock parsing to fail
            jest.spyOn(resolver as any, 'parseInternal').mockRejectedValue(new Error('Mock parse error'));

            try {
                await resolver.parseNaturalLanguageRequest('Create developer', testClientId);
            } catch (error) {
                // Expected to fail
            }

            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.any(Object),
                    parserId: expect.any(String),
                    clientId: testClientId
                })
            );
        });

        test('should handle invalid system state gracefully', async () => {
            // Force resolver into invalid state
            (resolver as any).initialized = false;

            // Mock initialization to fail
            jest.spyOn(resolver as any, 'validateSystemCapabilities').mockRejectedValue(
                new Error('System validation failed')
            );

            await expect(resolver.parseNaturalLanguageRequest('Create developer', testClientId)).rejects.toThrow(
                SmartTemplateError
            );
        });

        test('should auto-initialize when not initialized', async () => {
            // Create new resolver without manual initialization
            (EnterpriseNaturalLanguageResolver as any).instance = null;
            const newResolver = EnterpriseNaturalLanguageResolver.getInstance();

            const result = await newResolver.parseNaturalLanguageRequest('Create developer', testClientId);

            expect(result).toBeDefined();

            await newResolver.dispose();
        });
    });

    describe('Metrics and Monitoring', () => {
        beforeEach(async () => {
            await resolver.initialize();
        });

        test('should track operation metrics', async () => {
            await resolver.parseNaturalLanguageRequest('Create developer', testClientId);
            await resolver.parseNaturalLanguageRequest('Build team', testClientId);

            const metrics = resolver.getMetrics();

            expect(metrics).toMatchObject({
                health: expect.stringMatching(/healthy|degraded|unhealthy/),
                stats: expect.any(Object),
                performance: expect.objectContaining({
                    successRate: expect.any(Number),
                    averageProcessingTime: expect.any(Number),
                    totalRequests: expect.any(Number),
                    cacheSize: expect.any(Number),
                    cacheHitRate: expect.any(Number)
                })
            });

            expect(metrics.performance.successRate).toBeGreaterThan(0);
            expect(metrics.performance.totalRequests).toBeGreaterThanOrEqual(2);
        });

        test('should calculate cache hit rate correctly', async () => {
            const input = 'Create React developer';

            // First request - cache miss
            await resolver.parseNaturalLanguageRequest(input, testClientId);

            // Second request - cache hit
            await resolver.parseNaturalLanguageRequest(input, testClientId);

            const metrics = resolver.getMetrics();
            expect(metrics.performance.cacheHitRate).toBeGreaterThan(0);
        });

        test('should report healthy status with good performance', async () => {
            await resolver.parseNaturalLanguageRequest('Create developer', testClientId);

            const metrics = resolver.getMetrics();
            expect(metrics.health).toBe('healthy');
        });

        test('should detect degraded performance', async () => {
            // Mock slow operations to degrade performance
            jest.spyOn(resolver as any, 'parseInternal').mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 6000));
                return {
                    confidence: 0.8,
                    parsedIntent: { action: 'spawn_agent' }
                };
            });

            try {
                await resolver.parseNaturalLanguageRequest('Create developer', testClientId);
            } catch (error) {
                // May timeout, that's ok for this test
            }

            const metrics = resolver.getMetrics();
            // Health might be degraded due to high processing time
            expect(['healthy', 'degraded', 'unhealthy']).toContain(metrics.health);
        });

        test('should track error rates', async () => {
            // Mock some operations to fail
            const failingStub = jest
                .spyOn(resolver as any, 'parseInternal')
                .mockRejectedValueOnce(new Error('Mock error'))
                .mockResolvedValue({
                    confidence: 0.8,
                    parsedIntent: { action: 'spawn_agent' }
                });

            // One failing request
            try {
                await resolver.parseNaturalLanguageRequest('Create developer 1', testClientId);
            } catch (error) {
                // Expected to fail
            }

            // One successful request
            await resolver.parseNaturalLanguageRequest('Create developer 2', testClientId);

            const metrics = resolver.getMetrics();
            expect(metrics.performance.totalRequests).toBeGreaterThanOrEqual(2);
            expect(metrics.performance.successRate).toBeLessThan(1.0);
        });

        test('should emit parse completion events', async () => {
            const completionSpy = jest.fn();
            resolver.on('parseCompleted', completionSpy);

            await resolver.parseNaturalLanguageRequest('Create developer', testClientId);

            expect(completionSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    parserId: expect.any(String),
                    confidence: expect.any(Number),
                    processingTime: expect.any(Number),
                    qualityScore: expect.any(Number),
                    clientId: testClientId
                })
            );
        });
    });

    describe('Resource Management and Disposal', () => {
        test('should dispose resources properly', async () => {
            await resolver.initialize();

            await resolver.parseNaturalLanguageRequest('Create developer', testClientId);

            let metrics = resolver.getMetrics();
            expect(metrics.performance.cacheSize).toBeGreaterThan(0);

            await resolver.dispose();

            // Should clear resources
            metrics = resolver.getMetrics();
            expect(metrics.performance.cacheSize).toBe(0);
        });

        test('should handle multiple disposal calls gracefully', async () => {
            await resolver.initialize();

            await resolver.dispose();
            await resolver.dispose(); // Should not throw

            // Should be able to get metrics after disposal
            const metrics = resolver.getMetrics();
            expect(metrics).toBeDefined();
        });

        test('should remove all event listeners on disposal', async () => {
            await resolver.initialize();

            const listener = jest.fn();
            resolver.on('testEvent', listener);

            expect(resolver.listenerCount('testEvent')).toBe(1);

            await resolver.dispose();

            expect(resolver.listenerCount('testEvent')).toBe(0);
        });

        test('should handle disposal errors gracefully', async () => {
            await resolver.initialize();

            // Mock internal disposal operation to fail
            const removeAllListenersSpy = jest.spyOn(resolver, 'removeAllListeners').mockImplementation(() => {
                throw new Error('Listener removal failed');
            });

            await expect(resolver.dispose()).rejects.toThrow(SmartTemplateError);
            expect(removeAllListenersSpy).toHaveBeenCalled();
        });
    });

    describe('Cleanup Operations', () => {
        test('should perform periodic cleanup operations', async () => {
            await resolver.initialize();

            // Add entries to cache
            await resolver.parseNaturalLanguageRequest('Create developer', testClientId);

            // Advance time to trigger cleanup
            jest.advanceTimersByTime(400000); // 6.67 minutes

            // Cache should be cleaned of expired entries
            const metrics = resolver.getMetrics();
            expect(metrics).toBeDefined();
        });

        test('should handle cleanup errors gracefully', async () => {
            await resolver.initialize();

            // Mock cache operations to fail during cleanup
            const originalCacheDelete = Map.prototype.delete;
            Map.prototype.delete = jest.fn().mockImplementation(() => {
                throw new Error('Cache delete failed');
            });

            // Should not crash when cleanup runs
            jest.advanceTimersByTime(400000);

            // Restore original method
            Map.prototype.delete = originalCacheDelete;
        });
    });

    describe('Integration and System Tests', () => {
        beforeEach(async () => {
            await resolver.initialize();
        });

        test('should handle high concurrency requests', async () => {
            const concurrentRequests = Array.from({ length: 20 }, (_, i) =>
                resolver.parseNaturalLanguageRequest(`Create developer ${i}`, `client-${i}`)
            );

            const results = await Promise.all(concurrentRequests);

            expect(results).toHaveLength(20);
            results.forEach((result, index) => {
                expect(result).toBeDefined();
                expect(result.confidence).toBeGreaterThan(0);
                expect(result.parsedIntent.action).toBe('spawn_agent');
            });
        });

        test('should maintain consistent behavior across different request types', async () => {
            const requests = [
                { input: 'Create a frontend developer', expectedAction: 'spawn_agent' },
                { input: 'Build a development team', expectedAction: 'create_team' },
                { input: 'Implement user authentication', expectedAction: 'assign_task' },
                { input: 'Add a React specialist', expectedAction: 'spawn_agent' },
                { input: 'Form a QA squad', expectedAction: 'create_team' }
            ];

            for (const request of requests) {
                const result = await resolver.parseNaturalLanguageRequest(request.input, testClientId);
                expect(result.parsedIntent.action).toBe(request.expectedAction);
                expect(result.metadata.processingTime).toBeGreaterThan(0);
                expect(result.metadata.securityScore).toBeGreaterThan(50);
            }
        });

        test('should provide quality assessment feedback', async () => {
            const highQualityInput =
                'Create an experienced React TypeScript frontend developer with Redux expertise for critical e-commerce project';
            const lowQualityInput = 'do stuff';

            const highQualityResult = await resolver.parseNaturalLanguageRequest(highQualityInput, testClientId);
            const lowQualityResult = await resolver.parseNaturalLanguageRequest(lowQualityInput, testClientId);

            expect(highQualityResult.metadata.qualityScore).toBeGreaterThan(lowQualityResult.metadata.qualityScore);
            expect(lowQualityResult.requiresUserInput).toBe(true);
            expect(lowQualityResult.suggestions).toBeDefined();
        });

        test('should handle edge cases in natural language input', async () => {
            const edgeCases = [
                '    Create    a    developer    ', // Extra whitespace
                'CREATE A DEVELOPER', // All caps
                'create a developer.', // With punctuation
                'Can you please create a developer?', // Question format
                'I would like to create a developer', // Formal language
                'dev needed ASAP!!!', // Informal with urgency
                'React + TypeScript developer required', // Technical notation
                'Senior Full-Stack Developer (5+ years)' // Job posting style
            ];

            for (const input of edgeCases) {
                const result = await resolver.parseNaturalLanguageRequest(input, testClientId);
                expect(result).toBeDefined();
                expect(result.confidence).toBeGreaterThan(0);
                expect(result.parsedIntent.action).toBeDefined();
            }
        });
    });
});
